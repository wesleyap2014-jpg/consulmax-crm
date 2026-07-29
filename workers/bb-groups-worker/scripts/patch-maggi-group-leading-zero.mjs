import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/maggiAvailableGroups.ts");
let source = fs.readFileSync(filePath, "utf8");

const oldNormalizer = `function normalizeGroupCode(value: unknown) {
  const match = String(value || "").match(/\\b\\d{3,6}\\b/);
  return match ? match[0].trim() : "";
}`;
const newNormalizer = `function normalizeGroupCode(value: unknown) {
  const match = String(value || "").match(/\\b\\d{3,6}\\b/);
  if (!match) return "";
  const digits = match[0].trim();
  const normalized = String(Number(digits));
  return normalized.length === 3 ? normalized.padStart(4, "0") : normalized;
}`;
if (source.includes(oldNormalizer)) source = source.replace(oldNormalizer, newNormalizer);

source = source.replace(
  `  for (const row of existingRows || []) existingMap.set(String(row.segmento || "") + ":" + String(row.grupo || ""), row);`,
  `  for (const row of existingRows || []) existingMap.set(String(row.segmento || "") + ":" + normalizeGroupCode(row.grupo), row);`,
);

source = source.replace(
  `    const key = segmento + ":" + String(row.grupo || "");`,
  `    const key = segmento + ":" + normalizeGroupCode(row.grupo);`,
);

fs.writeFileSync(filePath, source);
console.log("Grupos Maggi de três dígitos serão persistidos com zero à esquerda.");
