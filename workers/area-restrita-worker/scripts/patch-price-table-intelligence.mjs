import fs from "node:fs";
import path from "node:path";

const intelligencePath = path.resolve("src/price-table-intelligence.mjs");
let intelligence = fs.readFileSync(intelligencePath, "utf8");

// O motor Maggi chama a soma crédito + Taxa Adm. + FR de valor_categoria.
intelligence = intelligence.replaceAll('"credito_mais_taxas"', '"valor_categoria"');
if (!intelligence.includes("export const parsePriceTableTextIntelligent")) {
  intelligence += "\nexport const parsePriceTableTextIntelligent = parseSemantic;\n";
}
fs.writeFileSync(intelligencePath, intelligence);

const importLine = 'import { extractPriceTableIntelligence } from "./price-table-intelligence.mjs";';

function addIntelligenceImport(source) {
  if (source.includes(importLine)) return source;
  return source.replace(
    'import { promisify } from "node:util";',
    `import { promisify } from "node:util";\n${importLine}`,
  );
}

function patchStandardSync(source) {
  source = addIntelligenceImport(source);
  source = source.replace(
    `      const text = await pdfToText(download.pdfPath);\n      const extraction = parsePriceTableText(text);`,
    `      const extraction = await extractPriceTableIntelligence(download.pdfPath);`,
  );

  const oldMerge = `  const lanceEmbutidoMaxPct = embedded.length ? Math.max(...embedded) : null;\n  const complete = credits.length > 0 && rules.length > 0 && rules.some((rule) => rule.taxaAdmPct !== null) && rules.some((rule) => rule.fundoReservaPct !== null);`;
  const newMerge = `  const lanceEmbutidoMaxPct = embedded.length ? Math.max(...embedded) : null;\n  const embeddedBases = documents\n    .map((document) => document.extraction.embeddedBidBase)\n    .filter(Boolean);\n  const embeddedBidBase = embeddedBases.includes("valor_categoria")\n    ? "valor_categoria"\n    : embeddedBases.at(-1) || null;\n  const prazoGrupoValues = uniqueSortedNumbers(\n    documents.map((document) => document.extraction.prazoGrupo),\n  );\n  const prazoGrupo = prazoGrupoValues.length ? Math.max(...prazoGrupoValues) : null;\n  const complete = credits.length > 0\n    && rules.length > 0\n    && rules.some((rule) => rule.taxaAdmPct !== null)\n    && rules.some((rule) => rule.fundoReservaPct !== null)\n    && lanceEmbutidoMaxPct !== null;`;
  if (source.includes(oldMerge)) source = source.replace(oldMerge, newMerge);

  const oldConfig = `  if (lanceEmbutidoMaxPct !== null) nextConfig.maxLanceEmbutidoPct = lanceEmbutidoMaxPct;`;
  const newConfig = `  if (lanceEmbutidoMaxPct !== null) nextConfig.maxLanceEmbutidoPct = lanceEmbutidoMaxPct;\n  if (embeddedBidBase) {\n    nextConfig.lanceEmbutidoBase = embeddedBidBase;\n    nextConfig.baseCalculoEmbutido = embeddedBidBase;\n  }\n  if (prazoGrupo !== null) nextConfig.prazoGrupo = prazoGrupo;`;
  if (!source.includes("nextConfig.lanceEmbutidoBase") && source.includes(oldConfig)) {
    source = source.replace(oldConfig, newConfig);
  }

  const oldSummary = `      lanceEmbutidoMaxPct,\n      complete,`;
  const newSummary = `      lanceEmbutidoMaxPct,\n      embeddedBidBase,\n      prazoGrupo,\n      confidence: documents.length\n        ? Math.max(...documents.map((document) => Number(document.extraction.confidence || 0)))\n        : 0,\n      complete,`;
  if (!source.includes("confidence: documents.length") && source.includes(oldSummary)) {
    source = source.replace(oldSummary, newSummary);
  }
  return source;
}

function patchDirectSync(source) {
  source = addIntelligenceImport(source);
  source = source.replace(
    `      const text = await pdfToText(download.pdfPath);\n      const extraction = parseTableText(text);`,
    `      const extraction = await extractPriceTableIntelligence(download.pdfPath);`,
  );

  const oldMerge = `  const lanceEmbutidoMaxPct = embedded.length ? Math.max(...embedded) : null;\n  const complete = credits.length >= 2 && prazoMax !== null && taxaAdmPct !== null && fundoReservaPct !== null;`;
  const newMerge = `  const lanceEmbutidoMaxPct = embedded.length ? Math.max(...embedded) : null;\n  const embeddedBases = documents\n    .map((document) => document.extraction.embeddedBidBase)\n    .filter(Boolean);\n  const embeddedBidBase = embeddedBases.includes("valor_categoria")\n    ? "valor_categoria"\n    : embeddedBases.at(-1) || null;\n  const prazoGrupoValues = uniqueNumbers(\n    documents.map((document) => document.extraction.prazoGrupo),\n  );\n  const prazoGrupo = prazoGrupoValues.length ? Math.max(...prazoGrupoValues) : null;\n  const complete = credits.length >= 2\n    && prazoMax !== null\n    && taxaAdmPct !== null\n    && fundoReservaPct !== null\n    && lanceEmbutidoMaxPct !== null;`;
  if (source.includes(oldMerge)) source = source.replace(oldMerge, newMerge);

  const oldConfig = `  if (lanceEmbutidoMaxPct !== null) nextConfig.maxLanceEmbutidoPct = lanceEmbutidoMaxPct;`;
  const newConfig = `  if (lanceEmbutidoMaxPct !== null) nextConfig.maxLanceEmbutidoPct = lanceEmbutidoMaxPct;\n  if (embeddedBidBase) {\n    nextConfig.lanceEmbutidoBase = embeddedBidBase;\n    nextConfig.baseCalculoEmbutido = embeddedBidBase;\n  }\n  if (prazoGrupo !== null) nextConfig.prazoGrupo = prazoGrupo;`;
  if (!source.includes("nextConfig.lanceEmbutidoBase") && source.includes(oldConfig)) {
    source = source.replace(oldConfig, newConfig);
  }

  const oldSummary = `      lanceEmbutidoMaxPct,\n      complete,`;
  const newSummary = `      lanceEmbutidoMaxPct,\n      embeddedBidBase,\n      prazoGrupo,\n      confidence: documents.length\n        ? Math.max(...documents.map((document) => Number(document.extraction.confidence || 0)))\n        : 0,\n      complete,`;
  if (!source.includes("confidence: documents.length") && source.includes(oldSummary)) {
    source = source.replace(oldSummary, newSummary);
  }
  return source;
}

const syncPath = path.resolve("src/price-table-sync.mjs");
fs.writeFileSync(syncPath, patchStandardSync(fs.readFileSync(syncPath, "utf8")));

const directSyncPath = path.resolve("src/price-table-sync-direct.mjs");
fs.writeFileSync(directSyncPath, patchDirectSync(fs.readFileSync(directSyncPath, "utf8")));

console.log("Parser inteligente integrado aos leitores padrão e direto de Tabelas de Preços.");
