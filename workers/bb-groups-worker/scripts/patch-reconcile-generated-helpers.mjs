import fs from "node:fs";

const file = "src/index.ts";

if (!fs.existsSync(file)) {
  console.log("patch reconcile generated helpers: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function insertBefore(anchor, code) {
  if (!src.includes(anchor)) {
    throw new Error(`Âncora não encontrada para reconciliar helpers: ${anchor}`);
  }

  src = src.replace(anchor, `${code}\n\n${anchor}`);
  changed = true;
}

if (!src.includes("lanceFixoPcts: number[];")) {
  const rawGroupAnchor = "  venda?: string | null;\n};";
  if (!src.includes(rawGroupAnchor)) {
    throw new Error("Tipo RawGroupRow não encontrado para adicionar regras de lance.");
  }

  src = src.replace(
    rawGroupAnchor,
    "  venda?: string | null;\n  lanceFixoPcts: number[];\n  permiteLanceEmbutido: boolean;\n  lanceHint: string;\n};"
  );
  changed = true;
}

const helperBlocks = [];

if (!src.includes("function parseBidRulesFromBemHint")) {
  helperBlocks.push(`function parseBidRulesFromBemHint(value: unknown) {
  const normalized = normalizeText(value);
  const fixedPcts = Array.from(normalized.matchAll(/FIXO[^0-9]{0,20}(\\d+(?:[,.]\\d+)?)/g))
    .map((match) => parseNumberBR(match[1]))
    .filter((pct) => pct > 0 && pct <= 100);

  const uniqueFixedPcts = Array.from(
    new Set(fixedPcts.map((pct) => Number(pct.toFixed(4))))
  ).sort((a, b) => a - b);

  return {
    lanceFixoPcts: uniqueFixedPcts,
    permiteLanceEmbutido: normalized.includes("EMBUTIDO"),
  };
}`);
}

if (!src.includes("function onlyDigits")) {
  helperBlocks.push(`function onlyDigits(value: unknown) {
  return String(value || "").replace(/\\D/g, "");
}`);
}

if (!src.includes("function isNoAssemblyResultError")) {
  helperBlocks.push(`function isNoAssemblyResultError(error: unknown) {
  return normalizeText((error as any)?.message || error || "").includes(
    "NENHUM RESULTADO DE ASSEMBLEIA"
  );
}`);
}

if (!src.includes("function isTransientRobotError")) {
  helperBlocks.push(`function isTransientRobotError(error: unknown) {
  const text = normalizeText((error as any)?.message || error || "");

  return (
    text.includes("EXECUTION CONTEXT WAS DESTROYED") ||
    text.includes("NAVIGATION") ||
    text.includes("TIMEOUT") ||
    text.includes("BOTAO PESQUISAR") ||
    text.includes("CAMPO DE GRUPO")
  );
}`);
}

if (helperBlocks.length) {
  insertBefore("function formatMoneyBR(value: number) {", helperBlocks.join("\n\n"));
}

fs.writeFileSync(file, src);
console.log(
  changed
    ? "patch reconcile generated helpers: applied"
    : "patch reconcile generated helpers: no changes"
);
