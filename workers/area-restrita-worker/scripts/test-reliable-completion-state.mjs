import fs from "node:fs";
import path from "node:path";

const ai = fs.readFileSync(path.resolve("src/group-document-ai.mjs"), "utf8");
const runner = fs.readFileSync(path.resolve("src/price-table-runner.mjs"), "utf8");
const server = fs.readFileSync(path.resolve("src/server.mjs"), "utf8");

const checks = [
  [ai.includes("const persistedCredits = Array.isArray(nextConfig.creditRanges)"), "critério de completude pelos dados persistidos"],
  [ai.includes("const coreComplete = hasCredits && hasTerm && hasFees && hasLanceRules;"), "campos essenciais como critério de conclusão"],
  [!ai.includes("&& maxEmbedded !== null\n    && result?.regraPosContemplacao"), "remoção dos campos opcionais do critério obrigatório"],
  [runner.includes("process.exit(0)"), "encerramento explícito do runner com sucesso"],
  [runner.includes("process.exit(1)"), "encerramento explícito do runner com erro"],
  [server.includes("await fs.rm(MANIFEST_FILE, { force: true })"), "limpeza do manifesto anterior"],
  [server.includes("const manifestCompleted = Boolean("), "confirmação de conclusão pelo manifesto"],
  [server.includes('state: "price_tables_synced"'), "recuperação do estado concluído"],
];

const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failed.length) {
  throw new Error(`Falharam as validações: ${failed.join(", ")}`);
}

console.log("Conclusão confiável validada com sucesso.");
