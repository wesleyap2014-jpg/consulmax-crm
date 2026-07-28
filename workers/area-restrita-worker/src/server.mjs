import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = Number(process.env.AREA_RESTRITA_CONTROL_PORT || 3100);
const HOST = "127.0.0.1";
const DATA_DIR = path.resolve(process.env.AREA_RESTRITA_DATA_DIR || "/data");
const PROFILE_DIR = path.join(DATA_DIR, "chrome-profile");
const STATUS_FILE = path.join(DATA_DIR, "area-restrita-status.json");
const MANIFEST_FILE = path.join(DATA_DIR, "area-restrita-price-tables.json");
const SCHEDULE_FILE = path.join(DATA_DIR, "area-restrita-schedule.json");
const SYNC_LOG_FILE = path.join(DATA_DIR, "price-table-runner.log");
const RUNNER_FILE = "/app/src/price-table-runner.mjs";
const startedAt = new Date().toISOString();
const robotSecret = String(
  process.env.AREA_RESTRITA_ROBOT_SECRET || process.env.ROBOT_API_SECRET || "",
).trim();
const weeklyEnabled = String(process.env.AREA_RESTRITA_WEEKLY_SYNC_ENABLED || "true") !== "false";
const weeklyHour = Math.min(23, Math.max(0, Number(process.env.AREA_RESTRITA_WEEKLY_SYNC_HOUR || 8)));
const timeZone = process.env.AREA_RESTRITA_TIME_ZONE || "America/Porto_Velho";

let activeSync = null;
let lastWeeklyKey = null;

await fs.mkdir(PROFILE_DIR, { recursive: true });

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function bearerToken(request) {
  const value = String(request.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function authorized(request) {
  return Boolean(robotSecret) && bearerToken(request) === robotSecret;
}

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    weekday: map.weekday,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function nextFridayAtHour() {
  const now = new Date();
  for (let offset = 0; offset <= 8; offset += 1) {
    const candidate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const parts = localParts(candidate);
    const isFriday = parts.weekday === "Fri";
    const stillAvailable = offset > 0 || parts.hour < weeklyHour || (parts.hour === weeklyHour && parts.minute < 59);
    if (!isFriday || !stillAvailable) continue;
    return {
      date: parts.dateKey,
      hour: weeklyHour,
      timeZone,
      label: `Sexta-feira às ${String(weeklyHour).padStart(2, "0")}:00`,
    };
  }
  return null;
}

async function startSync(source = "manual") {
  if (activeSync && activeSync.exitCode === null) {
    return { started: false, reason: "already_running", pid: activeSync.pid };
  }

  const logHandle = await fs.open(SYNC_LOG_FILE, "a");
  const child = spawn(process.execPath, [RUNNER_FILE], {
    env: { ...process.env, AREA_RESTRITA_SYNC_SOURCE: source },
    stdio: ["ignore", logHandle.fd, logHandle.fd],
  });
  activeSync = child;

  child.once("exit", async (code, signal) => {
    await logHandle.close().catch(() => null);
    const finished = activeSync === child;
    if (finished) activeSync = null;
    if (code !== 0) {
      const previous = await readJson(STATUS_FILE, {});
      await writeJson(STATUS_FILE, {
        ...previous,
        ok: false,
        state: "price_tables_error",
        message: `Sincronização encerrada com código ${code ?? "—"}${signal ? ` (${signal})` : ""}.`,
        updatedAt: new Date().toISOString(),
      }).catch(() => null);
    }
  });

  child.once("error", async (error) => {
    await logHandle.close().catch(() => null);
    if (activeSync === child) activeSync = null;
    const previous = await readJson(STATUS_FILE, {});
    await writeJson(STATUS_FILE, {
      ...previous,
      ok: false,
      state: "price_tables_error",
      message: `Não foi possível iniciar a sincronização: ${String(error?.message || error)}`,
      updatedAt: new Date().toISOString(),
    }).catch(() => null);
  });

  return { started: true, pid: child.pid, source };
}

async function loadScheduleState() {
  const state = await readJson(SCHEDULE_FILE, {});
  lastWeeklyKey = state?.lastWeeklyKey || null;
}

async function checkWeeklySchedule() {
  if (!weeklyEnabled) return;
  const parts = localParts();
  if (parts.weekday !== "Fri" || parts.hour !== weeklyHour || parts.dateKey === lastWeeklyKey) return;
  if (activeSync && activeSync.exitCode === null) return;

  const result = await startSync("weekly");
  if (!result.started) return;
  lastWeeklyKey = parts.dateKey;
  await writeJson(SCHEDULE_FILE, {
    lastWeeklyKey,
    lastStartedAt: new Date().toISOString(),
    timeZone,
    hour: weeklyHour,
  }).catch(() => null);
}

await loadScheduleState();
setInterval(() => checkWeeklySchedule().catch((error) => {
  console.error(`[area-restrita] falha no agendamento: ${String(error?.message || error)}`);
}), 60_000).unref();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, {
      ok: true,
      service: "consulmax-area-restrita-worker",
      startedAt,
      syncRunning: Boolean(activeSync && activeSync.exitCode === null),
    });
  }

  if (!authorized(request)) {
    return sendJson(response, robotSecret ? 401 : 503, {
      ok: false,
      error: robotSecret ? "unauthorized" : "robot_secret_not_configured",
    });
  }

  if (request.method === "GET" && url.pathname === "/status") {
    const [status, manifest] = await Promise.all([
      readJson(STATUS_FILE, null),
      readJson(MANIFEST_FILE, null),
    ]);
    return sendJson(response, 200, {
      ok: true,
      service: "consulmax-area-restrita-worker",
      startedAt,
      workerOnline: true,
      syncRunning: Boolean(activeSync && activeSync.exitCode === null),
      syncPid: activeSync?.pid || null,
      profileDirectory: PROFILE_DIR,
      portalUrlConfigured: Boolean(process.env.AREA_RESTRITA_PORTAL_URL),
      usernameConfigured: Boolean(process.env.AREA_RESTRITA_USERNAME),
      passwordConfigured: Boolean(process.env.AREA_RESTRITA_PASSWORD),
      remoteAccessConfigured: Boolean(process.env.AREA_RESTRITA_VNC_PASSWORD),
      weeklySchedule: {
        enabled: weeklyEnabled,
        hour: weeklyHour,
        timeZone,
        lastWeeklyKey,
        next: nextFridayAtHour(),
      },
      status,
      manifest,
    });
  }

  if (request.method === "POST" && url.pathname === "/sync") {
    const result = await startSync("manual");
    return sendJson(response, result.started ? 202 : 409, {
      ok: result.started,
      ...result,
      message: result.started
        ? "Sincronização da Área Restrita Maggi iniciada."
        : "Já existe uma sincronização da Área Restrita Maggi em andamento.",
    });
  }

  return sendJson(response, 404, { ok: false, error: "not_found" });
});

server.listen(PORT, HOST, () => {
  console.log(`[area-restrita] controle ativo em ${HOST}:${PORT}`);
  console.log(`[area-restrita] perfil persistente em ${PROFILE_DIR}`);

  if (String(process.env.AREA_RESTRITA_RUN_ON_START || "true") !== "false") {
    setTimeout(() => startSync("startup").catch((error) => {
      console.error(`[area-restrita] falha ao iniciar sincronização automática: ${String(error?.message || error)}`);
    }), 5000).unref();
  }
});

function shutdown(signal) {
  console.log(`[area-restrita] encerrando por ${signal}`);
  if (activeSync && activeSync.exitCode === null) activeSync.kill("SIGTERM");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
