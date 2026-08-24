import fs from "node:fs";

const file = "src/pages/Seguros.tsx";
let src = fs.readFileSync(file, "utf8");
let changed = false;

const hasIssuedOption = /value\s*:\s*["']emitida["']/.test(src);

if (!hasIssuedOption) {
  const objectPattern = /(\{\s*value\s*:\s*["']pre_emissao["']\s*,\s*label\s*:\s*["'][^"']+["']\s*\}\s*,?)/;
  if (objectPattern.test(src)) {
    src = src.replace(
      objectPattern,
      `$1\n  { value: "emitida", label: "Emitida" },`,
    );
    changed = true;
    console.log("[seguros-policy-issued-v2] opção Emitida adicionada ao seletor");
  }
}

if (!/\bemitida\s*:\s*["']Emitida["']/.test(src)) {
  const mapPattern = /(\bpre_emissao\s*:\s*["'][^"']+["']\s*,?)/;
  if (mapPattern.test(src)) {
    src = src.replace(mapPattern, `$1\n  emitida: "Emitida",`);
    changed = true;
    console.log("[seguros-policy-issued-v2] rótulo Emitida adicionado ao mapa de status");
  }
}

if (!hasIssuedOption && !changed) {
  const pairPattern = /(["']pre_emissao["']\s*,\s*)(["']ativa["'])/;
  if (pairPattern.test(src)) {
    src = src.replace(pairPattern, `$1"emitida", $2`);
    changed = true;
    console.log("[seguros-policy-issued-v2] status Emitida adicionado à lista");
  }
}

if (!/value\s*:\s*["']emitida["']/.test(src) && !/["']pre_emissao["']\s*,\s*["']emitida["']/.test(src)) {
  const idx = src.indexOf("pre_emissao");
  const context = idx >= 0 ? src.slice(Math.max(0, idx - 180), idx + 420) : "pre_emissao não encontrado";
  throw new Error(`[seguros-policy-issued-v2] não foi possível localizar a lista de Status da Apólice. Contexto: ${context}`);
}

if (changed) fs.writeFileSync(file, src);
console.log(`[seguros-policy-issued-v2] ${changed ? "concluído com alterações" : "já aplicado"}`);
