import fs from "node:fs";
import path from "node:path";

const serverFile = path.resolve("src/server.mjs");
let source = fs.readFileSync(serverFile, "utf8");

const anchor = "await Promise.all([loadScheduleState(), loadChainState()]);";
const reconcileBlock = `async function reconcileStaleExecutionStatus() {
  const status = await readJson(STATUS_FILE, null);
  if (!status || typeof status !== "object") return;

  const inProgressStates = new Set([
    "queued_after_groups",
    "waiting_price_tables",
    "opening_documents",
    "opening_price_tables",
    "price_tables_found",
    "price_tables_syncing",
  ]);
  if (!inProgressStates.has(String(status.state || ""))) return;

  const previousMessage = String(status.message || "").trim();
  const interruptionMessage = "A execução anterior foi interrompida antes da conclusão. Inicie uma nova sincronização.";
  await writeJson(STATUS_FILE, {
    ...status,
    ok: false,
    state: "price_tables_error",
    message: interruptionMessage,
    priceTableSyncError: previousMessage
      ? \`\${interruptionMessage} Último estado: \${previousMessage}\`
      : interruptionMessage,
    syncProgress: {
      ...(status.syncProgress && typeof status.syncProgress === "object" ? status.syncProgress : {}),
      running: false,
    },
    interruptedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

${anchor}
await reconcileStaleExecutionStatus();`;

if (!source.includes("async function reconcileStaleExecutionStatus()")) {
  if (!source.includes(anchor)) {
    throw new Error("Não foi possível localizar o carregamento inicial do estado do worker.");
  }
  source = source.replace(anchor, reconcileBlock);
}

fs.writeFileSync(serverFile, source);
console.log("Status órfão de sincronização será convertido para erro após restart do worker.");
