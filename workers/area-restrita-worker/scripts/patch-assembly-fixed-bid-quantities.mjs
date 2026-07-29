import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/assembly-result-sync.mjs");
let source = fs.readFileSync(file, "utf8");

const rulesStart = source.indexOf("export function fixedBidPercentages(groupRow) {");
const rulesEnd = source.indexOf("function parseBrazilianPercent", rulesStart);
if (rulesStart < 0 || rulesEnd < 0) {
  throw new Error("Não foi possível localizar o leitor de lances fixos.");
}

const rulesBlock = `function fixedBidQuantity(value, fallback = 1) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function fixedBidRules(groupRow) {
  const config = parseConfig(groupRow?.config);
  const rules = new Map();
  const add = (value, quantity = 1) => {
    const pct = percentPoints(value);
    const normalizedQuantity = fixedBidQuantity(quantity, 1);
    if (pct === null || normalizedQuantity <= 0) return;
    const current = rules.get(pct);
    rules.set(pct, {
      pct,
      quantity: Math.max(current?.quantity || 0, normalizedQuantity),
    });
  };

  add(groupRow?.lance_fixo_pct, 1);

  for (const option of Array.isArray(config.lanceOptions) ? config.lanceOptions : []) {
    const descriptor = normalize(\`${option?.key || ""} ${option?.tipo || ""} ${option?.nome || ""} ${option?.nomeComercial || ""}\`);
    if (option?.enabled === false || !descriptor.includes("fixo")) continue;
    add(
      option?.pct ?? option?.percentual,
      option?.quantidadeContemplacoes ?? option?.quantidade_contemplacoes ?? 1,
    );
  }

  const aiLances = config?.aiDocumentAnalysis?.result?.lancesPermitidos;
  for (const lance of Array.isArray(aiLances) ? aiLances : []) {
    if (normalize(lance?.tipo) !== "fixo" && !normalize(lance?.nome).includes("fixo")) continue;
    add(
      lance?.percentual ?? lance?.pct,
      lance?.quantidadeContemplacoes ?? lance?.quantidade_contemplacoes ?? 1,
    );
  }

  return [...rules.values()].sort((a, b) => a.pct - b.pct);
}

export function fixedBidPercentages(groupRow) {
  return fixedBidRules(groupRow).map((rule) => rule.pct);
}

`;
source = source.slice(0, rulesStart) + rulesBlock + source.slice(rulesEnd);

const statsStart = source.indexOf("export function calculateAssemblyStats(");
const statsEnd = source.indexOf("function supabaseConfig", statsStart);
if (statsStart < 0 || statsEnd < 0) {
  throw new Error("Não foi possível localizar o cálculo das assembleias.");
}

const statsBlock = `export function calculateAssemblyStats(rows, fixedRulesOrPercentages, tolerance = 0.05) {
  const mergedRules = new Map();
  for (const item of Array.isArray(fixedRulesOrPercentages) ? fixedRulesOrPercentages : []) {
    const pct = Number(typeof item === "number" ? item : item?.pct ?? item?.percentual);
    if (!Number.isFinite(pct)) continue;
    const rawQuantity = typeof item === "number"
      ? Number.POSITIVE_INFINITY
      : Number(item?.quantity ?? item?.quantidade ?? item?.quantidadeContemplacoes ?? 1);
    const quantity = Number.isFinite(rawQuantity)
      ? Math.max(0, Math.floor(rawQuantity))
      : Number.POSITIVE_INFINITY;
    if (quantity <= 0) continue;
    const current = mergedRules.get(pct);
    mergedRules.set(pct, {
      pct,
      quantity: current
        ? (Number.isFinite(current.quantity) && Number.isFinite(quantity)
          ? Math.max(current.quantity, quantity)
          : Number.POSITIVE_INFINITY)
        : quantity,
    });
  }
  const fixedRules = [...mergedRules.values()].sort((a, b) => a.pct - b.pct);
  const contemplated = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      cota: String(row?.cota || "").trim(),
      tipo: String(row?.tipo || "").trim(),
      lancePct: parseBrazilianPercent(row?.lancePct),
      data: String(row?.data || "").trim(),
    }))
    .filter((row) => row.lancePct !== null && row.lancePct > 0 && !normalize(row.tipo).includes("sorteio"));

  const counters = fixedRules.map((rule) => ({ ...rule, remaining: rule.quantity }));
  const fixedRows = [];
  const freeRows = [];
  for (const row of contemplated) {
    const matchedRule = counters.find((rule) =>
      rule.remaining > 0 && Math.abs(row.lancePct - rule.pct) <= tolerance,
    );
    if (!matchedRule) {
      freeRows.push(row);
      continue;
    }
    fixedRows.push(row);
    if (Number.isFinite(matchedRule.remaining)) matchedRule.remaining -= 1;
  }

  const sorted = freeRows.map((row) => row.lancePct).sort((a, b) => a - b);
  const configuredPercentages = fixedRules.map((rule) => rule.pct);
  const configuredRules = fixedRules.map((rule) => ({
    pct: rule.pct,
    quantity: Number.isFinite(rule.quantity) ? rule.quantity : null,
  }));

  if (!sorted.length) {
    return {
      menorPct: null,
      medianaPct: null,
      maiorPct: null,
      quantidadeLancesLivres: 0,
      quantidadeContemplados: contemplated.length,
      quantidadeFixosDescartados: fixedRows.length,
      lancesFixosConfigurados: configuredPercentages,
      regrasFixasConfiguradas: configuredRules,
      lancesFixosDescartados: fixedRows,
      lancesLivres: [],
    };
  }

  const midpoint = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;

  return {
    menorPct: round(sorted[0]),
    medianaPct: round(median),
    maiorPct: round(sorted.at(-1)),
    quantidadeLancesLivres: freeRows.length,
    quantidadeContemplados: contemplated.length,
    quantidadeFixosDescartados: fixedRows.length,
    lancesFixosConfigurados: configuredPercentages,
    regrasFixasConfiguradas: configuredRules,
    lancesFixosDescartados: fixedRows,
    lancesLivres: freeRows.map((row) => ({ ...row, lancePct: round(row.lancePct) })),
  };
}

`;
source = source.slice(0, statsStart) + statsBlock + source.slice(statsEnd);

source = source.replace(
  `      const fixedPercentages = fixedBidPercentages(group);\n      const stats = calculateAssemblyStats(rows, fixedPercentages);`,
  `      const fixedRules = fixedBidRules(group);\n      const fixedPercentages = fixedRules.map((rule) => rule.pct);\n      const stats = calculateAssemblyStats(rows, fixedRules);`,
);

if (!source.includes("const fixedRules = fixedBidRules(group);")) {
  throw new Error("A sincronização não foi alterada para usar quantidades de lances fixos.");
}

fs.writeFileSync(file, source);
console.log("Assembleias Maggi agora descartam somente a quantidade contratual de lances fixos.");
