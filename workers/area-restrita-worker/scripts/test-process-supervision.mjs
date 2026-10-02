import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const helper = fileURLToPath(new URL("./process-supervisor.sh", import.meta.url));

function runSupervisor(script, signalWhenReady = false) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", `
      set -Eeuo pipefail
      source "$1"
      install_process_supervision
      ${script}
    `, "supervisor-test", helper], {
      env: { ...process.env, AREA_RESTRITA_SHUTDOWN_GRACE_SECONDS: "1", TEST_NODE: process.execPath },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let signalled = false;
    const started = Date.now();
    const timer = setTimeout(() => {
      process.kill(-child.pid, "SIGKILL");
      reject(new Error(`Supervisor não encerrou no prazo: ${output}`));
    }, 5000);
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        output += chunk;
        if (signalWhenReady && !signalled && output.includes("STUBBORN_READY")) {
          signalled = true;
          child.kill("SIGTERM");
        }
      });
    }
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output, elapsed: Date.now() - started });
    });
  });
}

for (const exitCode of [0, 7]) {
  test(`saída inesperada ${exitCode} solicita reinício e encerra os demais processos`, async () => {
    const result = await runSupervisor(`
      sleep 60 &
      register_process "$!" sibling
      bash -c 'sleep 0.1; exit ${exitCode}' &
      register_process "$!" browser
      supervise_processes
    `);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, new RegExp(`browser .*código=${exitCode}`));
    assert.ok(result.elapsed < 4000, result.output);
  });
}

test("SIGTERM encerra em prazo limitado mesmo com processo que ignora o sinal", async () => {
  const result = await runSupervisor(`
    "$TEST_NODE" -e 'process.on("SIGTERM", () => {}); console.log("STUBBORN_READY"); setInterval(() => {}, 1000);' &
    register_process "$!" stubborn
    supervise_processes
  `, true);
  assert.equal(result.code, 143, result.output);
  assert.match(result.output, /supervisor recebeu SIGTERM/);
  assert.match(result.output, /forçando encerramento de stubborn/);
  assert.ok(result.elapsed < 4000, result.output);
});

test("o monitor sai quando o Chrome termina por sinal, mesmo com exitCode null", async () => {
  const source = fs.readFileSync(new URL("../src/remote-browser.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function monitorSession(");
  const end = source.indexOf("\nasync function main()", start);
  assert.ok(start >= 0 && end > start);
  let statusWrites = 0;
  const monitor = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
    setStatus: async () => { statusWrites++; },
    setTimeout: (callback, delay) => setTimeout(callback, delay).unref(),
  });
  const chrome = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
  const exited = once(chrome, "exit");
  chrome.kill("SIGTERM");
  await exited;
  assert.equal(chrome.exitCode, null);
  assert.equal(chrome.signalCode, "SIGTERM");
  let timer;
  try {
    await Promise.race([
      monitor(chrome, { contexts: () => [] }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Monitor continuou após saída por sinal")), 250); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  assert.equal(statusWrites, 0);
});
