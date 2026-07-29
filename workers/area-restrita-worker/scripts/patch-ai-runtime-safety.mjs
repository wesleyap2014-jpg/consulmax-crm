import fs from "node:fs";
import path from "node:path";

const aiFile = path.resolve("src/group-document-ai.mjs");
let aiSource = fs.readFileSync(aiFile, "utf8");

const invalidPatch = "const patch = { grupo, config: nextConfig, updated_at: new Date().toISOString() };";
const validPatch = "const patch = { grupo: group, config: nextConfig, updated_at: new Date().toISOString() };";
if (aiSource.includes(invalidPatch)) {
  aiSource = aiSource.replace(invalidPatch, validPatch);
}
if (!aiSource.includes(validPatch)) {
  throw new Error("Não foi possível confirmar a correção do identificador do grupo no módulo de IA.");
}
fs.writeFileSync(aiFile, aiSource);

const syncFile = path.resolve("src/price-table-sync-direct.mjs");
let syncSource = fs.readFileSync(syncFile, "utf8");

const oldCatch = `    } catch (error) {
      current.updated = false;
      current.errors.push({ error: String(error?.message || error) });
      summaries.push({ group: groupNumber, updated: false, error: String(error?.message || error) });
    }`;

const safeCatch = `    } catch (error) {
      const message = String(error?.message || error);
      current.updated = false;
      current.errors.push({ error: message });
      summaries.push({ group: groupNumber, updated: false, error: message });
      manifest.groups[groupNumber] = current;

      const fatalProgrammingError = error instanceof ReferenceError || /\\bis not defined\\b/i.test(message);
      if (fatalProgrammingError) {
        manifest.finishedAt = new Date().toISOString();
        manifest.summary = {
          activeGroups: activeMap.size,
          portalEntries: entries.length,
          selectedEntries: selected.length,
          ignoredEntries: ignored.length,
          groupsWithPdf: byGroup.size,
          updatedGroups: summaries.filter((item) => item.updated).length,
          failedGroups: summaries.filter((item) => !item.updated).length,
          fatalError: message,
        };
        await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
        throw new Error(\`Falha fatal ao interpretar o grupo \${groupNumber}: \${message}\`);
      }
    }`;

if (syncSource.includes(oldCatch)) {
  syncSource = syncSource.replace(oldCatch, safeCatch);
}
if (!syncSource.includes("fatalProgrammingError")) {
  throw new Error("Não foi possível adicionar a interrupção de falhas fatais ao sincronizador.");
}

const finalNavigation = "  await ensurePriceList(page, listUrl).catch(() => null);";
const allFailedGuard = `  const updatedCount = summaries.filter((item) => item.updated).length;
  const failedCount = summaries.filter((item) => !item.updated).length;
  if (updatedCount === 0 && failedCount > 0) {
    manifest.finishedAt = new Date().toISOString();
    manifest.summary = {
      activeGroups: activeMap.size,
      portalEntries: entries.length,
      selectedEntries: selected.length,
      ignoredEntries: ignored.length,
      groupsWithPdf: byGroup.size,
      updatedGroups: 0,
      failedGroups: failedCount,
    };
    await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    throw new Error(\`Nenhum grupo foi atualizado. \${failedCount} grupo(s) terminaram com erro.\`);
  }

${finalNavigation}`;

if (!syncSource.includes("Nenhum grupo foi atualizado") && syncSource.includes(finalNavigation)) {
  syncSource = syncSource.replace(finalNavigation, allFailedGuard);
}
fs.writeFileSync(syncFile, syncSource);

const runnerFile = path.resolve("src/price-table-runner.mjs");
let runnerSource = fs.readFileSync(runnerFile, "utf8");
const oldWaiting = `  await writeStatus(
    "waiting_price_tables",
    "Aguardando o login para iniciar a leitura direta dos PDFs em uma guia separada."
  );`;
const newWaiting = `  await writeStatus(
    "waiting_price_tables",
    "Aguardando o login para iniciar a leitura direta dos PDFs em uma guia separada.",
    {
      syncProgress: { position: 0, total: 0 },
      priceTableSync: null,
      priceTableSyncError: null,
    }
  );`;
if (runnerSource.includes(oldWaiting)) runnerSource = runnerSource.replace(oldWaiting, newWaiting);
fs.writeFileSync(runnerFile, runnerSource);

console.log("Segurança do pipeline de IA aplicada: grupo corrigido, estado limpo e falhas fatais interrompidas.");
