import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/pages/CentralGrupos.tsx");
let source = fs.readFileSync(file, "utf8");

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

if (source.includes('const medianaFromRobot = assemblyValue(row, "medianaPct");')) {
  console.log("Leitura dos resultados de assembleia Maggi já aplicada na Central de Grupos.");
  process.exit(0);
}

if (!source.includes(oldBlock)) {
  throw new Error("Não foi possível localizar o leitor legado de assembleias Maggi na Central de Grupos.");
}

source = source.replace(oldBlock, newBlock);

if (
  !source.includes('const maior = assemblyValue(row, "maiorPct");') ||
  !source.includes('const menor = assemblyValue(row, "menorPct");') ||
  !source.includes('const medianaFromRobot = assemblyValue(row, "medianaPct");')
) {
  throw new Error("A leitura de config.assemblyResult não foi aplicada integralmente à Maggi.");
}

fs.writeFileSync(file, source);
console.log("Central de Grupos agora lê maior, menor e mediana gravados pelo robô Maggi.");
