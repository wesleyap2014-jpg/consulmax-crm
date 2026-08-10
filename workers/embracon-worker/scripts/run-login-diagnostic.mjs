import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const PORT = Number(process.env.LOCAL_WORKER_PORT || 3040);
const SECRET = `embracon-diagnostic-${randomUUID()}`;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUTPUT = process.env.EMBRACON_DIAGNOSTIC_JSON_PATH || "artifacts/embracon-login.json";
const SCREENSHOT =
  process.env.EMBRACON_DIAGNOSTIC_SCREENSHOT_PATH || "artifacts/embracon-login.png";

if (!process.env.EMBRACON_ROBOT_PORTAL_URL) {
  console.log(
    "[embracon-diagnostic] EMBRACON_ROBOT_PORTAL_URL não configurada; diagnóstico não executado.",
  );
  process.exit(0);
}

const child = spawn(process.execPath, ["dist/index.js"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    ROBOT_API_SECRET: SECRET,
    PLAYWRIGHT_HEADLESS: "true",
    EMBRACON_DIAGNOSTIC_SCREENSHOT_PATH: SCREENSHOT,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => process.stdout.write(chunk));
child.stderr.on("data", (chunk) => process.stderr.write(chunk));

async function waitForWorker() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Worker encerrou antes do diagnóstico (código ${child.exitCode}).`);
    }
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch {
      // worker ainda inicializando
    }
    await delay(400);
  }
  throw new Error("Worker Embracon não ficou disponível para diagnóstico.");
}

async function stopWorker() {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(4000),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

try {
  await waitForWorker();
  const response = await fetch(`${BASE_URL}/diagnostics/embracon/login-page`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Diagnóstico retornou HTTP ${response.status}.`);
  }

  await fs.mkdir("artifacts", { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`[embracon-diagnostic] relatório salvo em ${OUTPUT}`);
} finally {
  await stopWorker();
}
