import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const PORTAL_URL = requiredEnv("AREA_RESTRITA_PORTAL_URL");
const DATA_DIR = path.resolve(process.env.AREA_RESTRITA_DATA_DIR || "/data");
const PROFILE_DIR = path.join(DATA_DIR, "chrome-profile");
const STATUS_FILE = path.join(DATA_DIR, "area-restrita-status.json");
const CHROME_BIN = process.env.AREA_RESTRITA_CHROME_BIN || "/usr/bin/google-chrome-stable";
const DEBUG_PORT = Number(process.env.AREA_RESTRITA_CHROME_DEBUG_PORT || 9222);
const LOGIN_PATH_PATTERN = /\/NewLogin\/NewLoginCMC\.asp(?:$|[?#])/i;
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

async function setStatus(state, details = {}) {
  const payload = {
    ok: true,
    service: "consulmax-area-restrita-worker",
    state,
    updatedAt: new Date().toISOString(),
    browser: "google-chrome-stable",
    ...details,
  };

  await fs.writeFile(STATUS_FILE, JSON.stringify(payload, null, 2));
  console.log(`[area-restrita] estado: ${state}`);
}

function isLoginUrl(url) {
  return LOGIN_PATH_PATTERN.test(String(url || ""));
}

async function getChromePages() {
  const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`Chrome DevTools respondeu HTTP ${response.status}`);
  const targets = await response.json();
  return Array.isArray(targets) ? targets.filter((target) => target?.type === "page") : [];
}

function choosePortalPage(pages) {
  return pages.find((page) => String(page.url || "").startsWith(PORTAL_ORIGIN)) || pages[0] || null;
}

async function waitForChrome() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const pages = await getChromePages();
      if (pages.length > 0) return pages;
    } catch {
      // O Chrome ainda está inicializando.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("O Google Chrome não disponibilizou a interface local de diagnóstico.");
}

async function monitorSession(chrome) {
  let previousState = null;
  let previousUrl = null;

  while (chrome.exitCode === null) {
    try {
      const page = choosePortalPage(await getChromePages());
      const currentUrl = String(page?.url || "");
      let state = "browser_ready";
      let message = "Google Chrome aberto e aguardando navegação.";

      if (currentUrl.startsWith(PORTAL_ORIGIN) && isLoginUrl(currentUrl)) {
        state = "waiting_manual_login";
        message = "Conclua manualmente o Cloudflare e o primeiro login. A sessão será preservada no volume.";
      } else if (currentUrl.startsWith(PORTAL_ORIGIN)) {
        state = "authenticated";
        message = "Sessão autenticada e preservada no perfil persistente.";
      }

      if (state !== previousState || currentUrl !== previousUrl) {
        previousState = state;
        previousUrl = currentUrl;
        await setStatus(state, {
          message,
          currentUrl: currentUrl || null,
          profileDirectory: PROFILE_DIR,
        });
      }
    } catch (error) {
      if (previousState !== "browser_monitor_warning") {
        previousState = "browser_monitor_warning";
        await setStatus("browser_monitor_warning", {
          message: "O navegador está aberto, mas o monitor local não conseguiu consultar a guia atual.",
          error: String(error?.message || error),
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function main() {
  await fs.mkdir(PROFILE_DIR, { recursive: true });
  await setStatus("starting_browser", {
    message: "Iniciando Google Chrome estável em modo visível.",
    profileDirectory: PROFILE_DIR,
  });

  const chromeArgs = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--start-maximized",
    "--window-size=1440,1000",
    `--user-data-dir=${PROFILE_DIR}`,
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${DEBUG_PORT}`,
    PORTAL_URL,
  ];

  const chrome = spawn(CHROME_BIN, chromeArgs, {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  });

  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`[area-restrita] encerrando Chrome por ${signal}`);
    chrome.kill("SIGTERM");
    setTimeout(() => chrome.kill("SIGKILL"), 10000).unref();
  };

  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  chrome.once("error", async (error) => {
    await setStatus("error", {
      error: `Não foi possível iniciar o Google Chrome: ${String(error?.message || error)}`,
    });
  });

  await waitForChrome();
  await monitorSession(chrome);

  const exitCode = await new Promise((resolve) => {
    if (chrome.exitCode !== null) return resolve(chrome.exitCode);
    chrome.once("exit", (code) => resolve(code));
  });

  if (!stopping && exitCode !== 0) {
    await setStatus("error", {
      error: `Google Chrome encerrou inesperadamente com código ${exitCode}.`,
    });
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  await setStatus("error", { error: String(error?.message || error) }).catch(() => null);
  console.error(`[area-restrita] falha no navegador: ${String(error?.message || error)}`);
  process.exit(1);
});