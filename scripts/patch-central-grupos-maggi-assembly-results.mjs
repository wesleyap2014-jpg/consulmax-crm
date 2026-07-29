import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/pages/CentralGrupos.tsx");
let source = fs.readFileSync(file, "utf8");

const functionStart = source.indexOf("function toMaggiGroup(row: AnyRow): GrupoCentral {");
const functionEnd = source.indexOf("\nfunction newSteps()", functionStart);

if (functionStart < 0 || functionEnd < 0) {
  throw new Error("Não foi possível localizar a função toMaggiGroup na Central de Grupos.");
}

let maggiBlock = source.slice(functionStart, functionEnd);

const oldBlock = `  const maior = normalizePct(
    row.maior_pct_contemplado ||
      row.maior_pct_lance_livre ||
      row.maior_lance_livre,
  );
  const menor = normalizePct(
    row.menor_pct_contemplado ||
      row.menor_pct_lance_livre ||
      row.menor_lance_livre,
  );
  const mediana =
    maior && menor
      ? (maior + menor) / 2
      : maior || menor || lanceLivreFromConfig(row) || null;`;

const newBlock = `  const maior = assemblyValue(row, "maiorPct");
  const menor = assemblyValue(row, "menorPct");
  const medianaFromRobot = assemblyValue(row, "medianaPct");
  const mediana =
    medianaFromRobot ||
    (maior && menor
      ? (maior + menor) / 2
      : maior || menor || lanceLivreFromConfig(row) || null);`;

const alreadyPatched =
  maggiBlock.includes('const maior = assemblyValue(row, "maiorPct");') &&
  maggiBlock.includes('const menor = assemblyValue(row, "menorPct");') &&
  maggiBlock.includes('const medianaFromRobot = assemblyValue(row, "medianaPct");');

if (alreadyPatched) {
  console.log("Leitura Maggi de config.assemblyResult já aplicada especificamente em toMaggiGroup.");
  process.exit(0);
}

if (!maggiBlock.includes(oldBlock)) {
  throw new Error("Não foi possível localizar o leitor legado dentro de toMaggiGroup.");
}

maggiBlock = maggiBlock.replace(oldBlock, newBlock);
source = source.slice(0, functionStart) + maggiBlock + source.slice(functionEnd);

const updatedFunctionStart = source.indexOf("function toMaggiGroup(row: AnyRow): GrupoCentral {");
const updatedFunctionEnd = source.indexOf("\nfunction newSteps()", updatedFunctionStart);
const updatedMaggiBlock = source.slice(updatedFunctionStart, updatedFunctionEnd);

if (
  !updatedMaggiBlock.includes('const maior = assemblyValue(row, "maiorPct");') ||
  !updatedMaggiBlock.includes('const menor = assemblyValue(row, "menorPct");') ||
  !updatedMaggiBlock.includes('const medianaFromRobot = assemblyValue(row, "medianaPct");')
) {
  throw new Error("A leitura de config.assemblyResult não foi aplicada integralmente dentro de toMaggiGroup.");
}

fs.writeFileSync(file, source);
console.log("Central de Grupos agora lê maior, menor e mediana da Maggi dentro da função correta.");
