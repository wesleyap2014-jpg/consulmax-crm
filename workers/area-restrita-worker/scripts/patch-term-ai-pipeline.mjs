import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/price-table-sync-direct.mjs");
let source = fs.readFileSync(filePath, "utf8");

const aiImport = 'import { buildAiGroupPatch, canonicalGroupNumber } from "./group-document-ai.mjs";';
if (!source.includes(aiImport)) {
  const anchor = 'import { extractPriceTableIntelligence } from "./price-table-intelligence.mjs";';
  if (source.includes(anchor)) source = source.replace(anchor, `${anchor}\n${aiImport}`);
  else source = source.replace('import { promisify } from "node:util";', `import { promisify } from "node:util";\n${aiImport}`);
}

const oldEnsure = `  await page.evaluate(() => {
    if (typeof window.slideonlyone === "function") window.slideonlyone("4");
  }).catch(() => null);
  await page.waitForTimeout(500);`;
const newEnsure = `  for (const section of ["4", "5"]) {
    await page.evaluate((sectionId) => {
      if (typeof window.slideonlyone === "function") window.slideonlyone(sectionId);
    }, section).catch(() => null);
    await page.waitForTimeout(350);
  }`;
if (source.includes(oldEnsure)) source = source.replace(oldEnsure, newEnsure);

const oldFilter = `      if (!normalizedLabel.includes("tabela") || !normalizedLabel.includes("grupo")) continue;
      const groupMatch = normalizedLabel.match(/\\bgrupo\\s*0*(\\d{3,5})\\b/i);
      if (!groupMatch) continue;
      const group = String(Number(groupMatch[1]));`;
const newFilter = `      const isPriceTable = normalizedLabel.includes("tabela") && normalizedLabel.includes("grupo");
      const isAddendum = normalizedLabel.includes("termo de aditamento") && normalizedLabel.includes("grupo");
      if (!isPriceTable && !isAddendum) continue;
      const groupMatch = normalizedLabel.match(/\\bgrupo\\s*0*(\\d{3,5})\\b/i);
      if (!groupMatch) continue;
      const numericGroup = String(Number(groupMatch[1]));
      const group = numericGroup.length === 3 ? numericGroup.padStart(4, "0") : numericGroup;`;
if (source.includes(oldFilter)) source = source.replace(oldFilter, newFilter);

const oldEntry = `        onclick: element.getAttribute("onclick"),
      });`;
const newEntry = `        onclick: element.getAttribute("onclick"),
        kind: isAddendum ? "aditamento" : "tabela_precos",
      });`;
if (!source.includes('kind: isAddendum ? "aditamento"') && source.includes(oldEntry)) {
  source = source.replace(oldEntry, newEntry);
}

source = source.replace(
  `  const activeMap = new Map(active.rows.map((row) => [String(Number(row.grupo)), row]));`,
  `  const activeMap = new Map(active.rows.map((row) => [canonicalGroupNumber(row.grupo), row]));`,
);

source = source.replace(
  `      const document = {
        entry,
        ...download,`,
  `      const document = {
        entry,
        kind: entry.kind || "tabela_precos",
        ...download,`,
);

source = source.replace(
  `      label: document.entry.label,
      pdfPath: document.pdfPath,`,
  `      label: document.entry.label,
      kind: document.kind,
      pdfPath: document.pdfPath,`,
);

const mergeStart = source.indexOf("function mergeDocuments(group, documents) {");
const mergeEnd = source.indexOf("async function updateGroup", mergeStart);
if (mergeStart >= 0 && mergeEnd > mergeStart) {
  const replacement = `async function mergeDocuments(group, documents) {
  return buildAiGroupPatch(group, documents);
}

`;
  source = source.slice(0, mergeStart) + replacement + source.slice(mergeEnd);
}

source = source.replace(
  `      const merged = mergeDocuments(group, documents);`,
  `      const merged = await mergeDocuments(group, documents);`,
);

source = source.replaceAll("tabela(s) de grupos ativos", "documento(s) de grupos ativos");
source = source.replaceAll("Tabela(s) de Preços", "Tabela(s) de Preços e Termo(s) de Aditamento");

fs.writeFileSync(filePath, source);
console.log("Termos de Aditamento e interpretação conjunta por IA integrados ao leitor direto.");
