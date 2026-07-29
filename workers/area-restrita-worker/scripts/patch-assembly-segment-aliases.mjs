import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/assembly-result-sync.mjs");
let source = fs.readFileSync(file, "utf8");

const oldLine = `  if (/imovel|residencial|construcao|reforma/.test(value)) return "imovel";`;
const newLine = `  if (/imovei|imovel|residencial|construcao|reforma/.test(value)) return "imovel";`;

if (source.includes(newLine)) {
  console.log("Alias de imóveis já reconhecido na sincronização de assembleias.");
  process.exit(0);
}

if (!source.includes(oldLine)) {
  throw new Error("Não foi possível localizar a regra de segmento de imóveis nas assembleias.");
}

source = source.replace(oldLine, newLine);

if (!source.includes(newLine)) {
  throw new Error("A regra de segmento de imóveis não foi aplicada.");
}

fs.writeFileSync(file, source);
console.log("Segmentos imovel e imoveis serão consultados no Resultado de Assembleias.");
