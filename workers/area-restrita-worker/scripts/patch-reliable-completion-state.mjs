import fs from "node:fs";
import path from "node:path";

function replaceRequired(source, needle, replacement, description) {
  if (!source.includes(needle)) {
    throw new Error(`Não foi possível aplicar ${description}. Trecho esperado não encontrado.`);
  }
  return source.replace(needle, replacement);
}

const aiFile = path.resolve("src/group-document-ai.mjs");
let aiSource = fs.readFileSync(aiFile, "utf8");

const strictCompletion = `  const coreComplete = credits.length >= 2
    && prazoRules.length > 0
    && maxEmbedded !== null
    && result?.regraPosContemplacao !== "nao_informado"
    && result?.lancesPermitidos?.length > 0
    && clampConfidence(result?.confiancaGeral) >= MIN_CONFIDENCE;
  nextConfig.needsDetailsSync = !coreComplete;`;

const reliableCompletion = `  const persistedCredits = Array.isArray(nextConfig.creditRanges)
    ? nextConfig.creditRanges.map((item) => finite(item?.valor)).filter(Number.isFinite)
    : [];
  const persistedRules = Array.isArray(nextConfig.prazoRules) ? nextConfig.prazoRules : [];
  const finalRule = persistedRules
    .map((rule) => ({
      prazo: finite(rule?.prazo),
      taxaAdmPct: finite(rule?.taxaAdmPct),
      fundoReservaPct: finite(rule?.fundoReservaPct),
    }))
    .filter((rule) => rule.prazo !== null && rule.prazo > 0)
    .sort((a, b) => Number(a.prazo) - Number(b.prazo))
    .at(-1) || null;
  const finalLanceOptions = Array.isArray(nextConfig.lanceOptions) ? nextConfig.lanceOptions : [];

  const hasCredits = persistedCredits.length >= 2
    || (finite(groupRow.credito_min) > 0 && finite(groupRow.credito_max) > 0);
  const hasTerm = Boolean(finalRule?.prazo)
    || finite(groupRow.prazo_original) > 0
    || finite(groupRow.prazo_restante) > 0;
  const finalAdminRate = finalRule?.taxaAdmPct ?? finite(groupRow.taxa_adm_pct);
  const finalReserveRate = finalRule?.fundoReservaPct ?? finite(groupRow.fundo_reserva_pct);
  const hasFees = finalAdminRate !== null
    && finalAdminRate > 0
    && finalReserveRate !== null
    && finalReserveRate >= 0;
  const hasLanceRules = finalLanceOptions.some((option) => option?.enabled !== false)
    || groupRow.permite_lance_livre === true
    || groupRow.permite_lance_fixo === true
    || groupRow.permite_lance_embutido === true;

  const coreComplete = hasCredits && hasTerm && hasFees && hasLanceRules;
  const reviewWarnings = [];
  if (aiError) reviewWarnings.push(aiError);
  if (result && clampConfidence(result?.confiancaGeral) < MIN_CONFIDENCE) {
    reviewWarnings.push(\`Confiança da interpretação: \${Math.round(clampConfidence(result?.confiancaGeral) * 100)}%.\`);
  }
  if (result?.regraPosContemplacao === "nao_informado") {
    reviewWarnings.push("Regra pós-contemplação não localizada nos documentos.");
  }
  if (result && result.maxLanceEmbutidoPct === null) {
    reviewWarnings.push("Lance embutido não informado nos documentos; o dado anterior foi preservado quando existente.");
  }

  nextConfig.needsDetailsSync = !coreComplete;
  nextConfig.detailsReview = {
    required: !coreComplete,
    warnings: reviewWarnings,
    evaluatedAt: new Date().toISOString(),
    criteria: {
      credits: hasCredits,
      term: hasTerm,
      fees: hasFees,
      lanceRules: hasLanceRules,
    },
  };`;

if (aiSource.includes(strictCompletion)) {
  aiSource = aiSource.replace(strictCompletion, reliableCompletion);
}
if (!aiSource.includes("const persistedCredits = Array.isArray(nextConfig.creditRanges)")) {
  throw new Error("Não foi possível substituir o critério rígido de leitura completa.");
}
fs.writeFileSync(aiFile, aiSource);

const runnerFile = path.resolve("src/price-table-runner.mjs");
let runnerSource = fs.readFileSync(runnerFile, "utf8");
const oldRunnerEnd = `main().catch(async (error) => {
  const message = String(error?.message || error);
  await writeStatus("price_tables_error", message, { priceTableSyncError: message }).catch(() => null);
  console.error(\`[area-restrita] falha na sincronização das tabelas: \${message}\`);
  process.exitCode = 1;
});`;
const newRunnerEnd = `main()
  .then(() => {
    console.log("[area-restrita] sincronização concluída; encerrando somente o runner e preservando o Chrome.");
    process.exit(0);
  })
  .catch(async (error) => {
    const message = String(error?.message || error);
    await writeStatus("price_tables_error", message, { priceTableSyncError: message }).catch(() => null);
    console.error(\`[area-restrita] falha na sincronização das tabelas: \${message}\`);
    process.exit(1);
  });`;
if (runnerSource.includes(oldRunnerEnd)) {
  runnerSource = runnerSource.replace(oldRunnerEnd, newRunnerEnd);
}
if (!runnerSource.includes("process.exit(0)")) {
  throw new Error("Não foi possível garantir o encerramento explícito do runner.");
}
fs.writeFileSync(runnerFile, runnerSource);

const serverFile = path.resolve("src/server.mjs");
let serverSource = fs.readFileSync(serverFile, "utf8");

const startAnchor = `  const logHandle = await fs.open(SYNC_LOG_FILE, "a");`;
if (!serverSource.includes("await fs.rm(MANIFEST_FILE, { force: true })")) {
  serverSource = replaceRequired(
    serverSource,
    startAnchor,
    `  await fs.rm(MANIFEST_FILE, { force: true }).catch(() => null);\n  const logHandle = await fs.open(SYNC_LOG_FILE, "a");`,
    "a limpeza do relatório anterior",
  );
}

const oldExitHandler = `  child.once("exit", async (code, signal) => {
    await logHandle.close().catch(() => null);
    const finished = activeSync === child;
    if (finished) activeSync = null;
    if (code !== 0) {
      const previous = await readJson(STATUS_FILE, {});
      await writeJson(STATUS_FILE, {
        ...previous,
        ok: false,
        state: "price_tables_error",
        message: \`Sincronização encerrada com código \${code ?? "—"}\${signal ? \` (\${signal})\` : ""}.\`,
        updatedAt: new Date().toISOString(),
      }).catch(() => null);
    }
  });`;
const newExitHandler = `  child.once("exit", async (code, signal) => {
    await logHandle.close().catch(() => null);
    const finished = activeSync === child;
    if (finished) activeSync = null;

    const [previous, manifest] = await Promise.all([
      readJson(STATUS_FILE, {}),
      readJson(MANIFEST_FILE, null),
    ]);
    const manifestCompleted = Boolean(
      manifest?.finishedAt
      && manifest?.summary
      && Number(manifest.summary.updatedGroups || 0) > 0
      && !manifest.summary.fatalError,
    );

    if (manifestCompleted) {
      await writeJson(STATUS_FILE, {
        ...previous,
        ok: true,
        state: "price_tables_synced",
        message: \`\${Number(manifest.summary.updatedGroups || 0)} grupo(s) foram atualizados a partir das Tabelas de Preços e Aditamentos.\`,
        priceTableSyncError: null,
        syncProgress: {
          ...(previous?.syncProgress && typeof previous.syncProgress === "object" ? previous.syncProgress : {}),
          position: Number(manifest.summary.selectedEntries || previous?.syncProgress?.position || 0),
          total: Number(manifest.summary.selectedEntries || previous?.syncProgress?.total || 0),
          running: false,
        },
        recoveredFromExit: code !== 0 || Boolean(signal),
        updatedAt: new Date().toISOString(),
      }).catch(() => null);
      return;
    }

    if (code !== 0) {
      await writeJson(STATUS_FILE, {
        ...previous,
        ok: false,
        state: "price_tables_error",
        message: \`Sincronização encerrada com código \${code ?? "—"}\${signal ? \` (\${signal})\` : ""}.\`,
        updatedAt: new Date().toISOString(),
      }).catch(() => null);
    }
  });`;
if (serverSource.includes(oldExitHandler)) {
  serverSource = serverSource.replace(oldExitHandler, newExitHandler);
}
if (!serverSource.includes("const manifestCompleted = Boolean(")) {
  throw new Error("Não foi possível adicionar a confirmação final pelo manifesto.");
}

const reconcileStart = serverSource.indexOf("async function reconcileStaleExecutionStatus() {");
const reconcileAnchor = "\n\nawait Promise.all([loadScheduleState(), loadChainState()]);";
const reconcileEnd = serverSource.indexOf(reconcileAnchor, reconcileStart);
if (reconcileStart < 0 || reconcileEnd < 0) {
  throw new Error("Não foi possível localizar a reconciliação de execução órfã.");
}
const reliableReconcile = `async function reconcileStaleExecutionStatus() {
  const [status, manifest] = await Promise.all([
    readJson(STATUS_FILE, null),
    readJson(MANIFEST_FILE, null),
  ]);
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

  const manifestCompleted = Boolean(
    manifest?.finishedAt
    && manifest?.summary
    && Number(manifest.summary.updatedGroups || 0) > 0
    && !manifest.summary.fatalError,
  );
  if (manifestCompleted) {
    await writeJson(STATUS_FILE, {
      ...status,
      ok: true,
      state: "price_tables_synced",
      message: \`\${Number(manifest.summary.updatedGroups || 0)} grupo(s) foram atualizados a partir das Tabelas de Preços e Aditamentos.\`,
      priceTableSyncError: null,
      syncProgress: {
        ...(status.syncProgress && typeof status.syncProgress === "object" ? status.syncProgress : {}),
        position: Number(manifest.summary.selectedEntries || status?.syncProgress?.position || 0),
        total: Number(manifest.summary.selectedEntries || status?.syncProgress?.total || 0),
        running: false,
      },
      recoveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return;
  }

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
}`;
serverSource = serverSource.slice(0, reconcileStart) + reliableReconcile + serverSource.slice(reconcileEnd);
fs.writeFileSync(serverFile, serverSource);

console.log("Conclusão confiável aplicada: dados essenciais definem completude, runner encerra e manifesto recupera o estado final.");
