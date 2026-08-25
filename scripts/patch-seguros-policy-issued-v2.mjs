import fs from "node:fs";

const file = "src/pages/Seguros.tsx";
let src = fs.readFileSync(file, "utf8");
let changed = false;

if (!/type\s+PolicyStatus\s*=\s*[\s\S]{0,220}\|\s*["']emitida["']/.test(src)) {
  const typePattern = /(type\s+PolicyStatus\s*=\s*\n\s*\|\s*["']pre_emissao["']\s*\n)/;
  if (typePattern.test(src)) {
    src = src.replace(typePattern, `$1  | "emitida"\n`);
    changed = true;
  }
}
if (!/value\s*:\s*["']emitida["']/.test(src)) {
  const optionPattern = /(\{\s*value\s*:\s*["']pre_emissao["']\s*,\s*label\s*:\s*["'][^"']+["']\s*\}\s*,?)/;
  if (optionPattern.test(src)) {
    src = src.replace(optionPattern, `$1\n  { value: "emitida", label: "Emitida" },`);
    changed = true;
  }
}
if (!/\bemitida\s*:\s*["']Emitida["']/.test(src)) {
  const labelPattern = /(\bpre_emissao\s*:\s*["'][^"']+["']\s*,?)/;
  if (labelPattern.test(src)) {
    src = src.replace(labelPattern, `$1\n  emitida: "Emitida",`);
    changed = true;
  }
}
const exhaustiveMapPattern = /(\bpre_emissao\s*:\s*([^,\n]+),\s*\n\s*)(ativa\s*:\s*([^,\n]+),)/g;
src = src.replace(exhaustiveMapPattern, (match, before, _preValue, activeEntry, activeValue) => {
  if (/\bemitida\s*:/.test(match)) return match;
  changed = true;
  return `${before}emitida: ${activeValue},\n  ${activeEntry}`;
});
if (!/["']pre_emissao["']\s*,\s*["']emitida["']/.test(src)) {
  const pairPattern = /(["']pre_emissao["']\s*,\s*)(["']ativa["'])/;
  if (pairPattern.test(src)) {
    src = src.replace(pairPattern, `$1"emitida", $2`);
    changed = true;
  }
}
const typeOk = /type\s+PolicyStatus\s*=\s*[\s\S]{0,260}\|\s*["']emitida["']/.test(src);
const uiOk = /\bemitida\s*:\s*["']Emitida["']/.test(src) || /value\s*:\s*["']emitida["']/.test(src);
if (!typeOk || !uiOk) throw new Error("[seguros-policy-issued-v2] status Emitida incompleto");
if (changed) fs.writeFileSync(file, src);
console.log(`[seguros-policy-issued-v2] ${changed ? "concluído com alterações" : "já aplicado"}`);
await import("./patch-seguros-layout-sections-v7.mjs");
