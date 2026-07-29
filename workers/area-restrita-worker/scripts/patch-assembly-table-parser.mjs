import fs from "node:fs";
import path from "node:path";

function replaceRequired(source, needle, replacement, description) {
  if (!source.includes(needle)) {
    throw new Error(`Não foi possível aplicar ${description}. Trecho esperado não encontrado.`);
  }
  return source.replace(needle, replacement);
}

const file = path.resolve("src/assembly-result-sync.mjs");
let source = fs.readFileSync(file, "utf8");

source = replaceRequired(
  source,
  `const labels = Array.from(rows[index].querySelectorAll("th,td")).map((cell) => normalizeText(cell.textContent || ""));`,
  `const labels = Array.from(rows[index].children)
              .filter((cell) => cell.tagName === "TH" || cell.tagName === "TD")
              .map((cell) => normalizeText(cell.textContent || ""));`,
  "a leitura direta das células do cabeçalho",
);

source = replaceRequired(
  source,
  `            if (typeIndex >= 0 && bidIndex >= 0) {
              headerIndex = index;
              indexes = { typeIndex, bidIndex, quotaIndex, dateIndex };
              break;
            }`,
  `            const headerIndexes = [quotaIndex, typeIndex, bidIndex, dateIndex];
            const hasDistinctColumns = labels.length >= 4
              && headerIndexes.every((columnIndex) => columnIndex >= 0)
              && new Set(headerIndexes).size === 4;
            if (hasDistinctColumns) {
              headerIndex = index;
              indexes = { typeIndex, bidIndex, quotaIndex, dateIndex };
              break;
            }`,
  "a exigência de quatro colunas distintas no cabeçalho",
);

source = replaceRequired(
  source,
  `const cells = Array.from(row.querySelectorAll("td")).map((cell) => String(cell.textContent || "").replace(/\\s+/g, " ").trim());`,
  `const cells = Array.from(row.children)
              .filter((cell) => cell.tagName === "TD")
              .map((cell) => String(cell.textContent || "").replace(/\\s+/g, " ").trim());`,
  "a leitura direta das células de dados",
);

source = replaceRequired(
  source,
  `            if (cells.length <= Math.max(indexes.typeIndex, indexes.bidIndex)) continue;`,
  `            if (cells.length <= Math.max(indexes.quotaIndex, indexes.typeIndex, indexes.bidIndex, indexes.dateIndex)) continue;`,
  "a validação da quantidade de colunas da linha",
);

source = replaceRequired(
  source,
  `.filter((row) => row.lancePct !== null && row.lancePct > 0 && !normalize(row.tipo).includes("sorteio"));`,
  `.filter((row) => {
      const tipo = normalize(row.tipo);
      const validDate = /\\b\\d{2}\\/\\d{2}\\/\\d{4}\\b/.test(row.data);
      return row.lancePct !== null
        && row.lancePct > 0
        && row.lancePct <= 100
        && tipo.includes("lance")
        && !tipo.includes("sorteio")
        && validDate;
    });`,
  "as validações estruturais das linhas de lance",
);

source = replaceRequired(
  source,
  `      const assemblyDate = stats.lancesLivres.map((row) => row.data).find(Boolean)
        || rows.map((row) => String(row?.data || "").trim()).find(Boolean)
        || null;`,
  `      const assemblyDate = stats.lancesLivres.map((row) => row.data).find((value) => /\\b\\d{2}\\/\\d{2}\\/\\d{4}\\b/.test(String(value || "")))
        || null;
      if (!assemblyDate || !isoDateFromBrazilian(assemblyDate)) {
        throw new Error("A data da assembleia não foi reconhecida na tabela de resultados.");
      }
      if ([stats.menorPct, stats.medianaPct, stats.maiorPct].some((value) => !Number.isFinite(value) || value <= 0 || value > 100)) {
        throw new Error("Os percentuais calculados para a assembleia são estruturalmente inválidos.");
      }`,
  "a validação final antes da gravação",
);

if (
  !source.includes("Array.from(rows[index].children)")
  || !source.includes("new Set(headerIndexes).size === 4")
  || !source.includes("row.lancePct <= 100")
) {
  throw new Error("As proteções do parser de assembleias não foram aplicadas.");
}

fs.writeFileSync(file, source);
console.log("Parser de assembleias corrigido: cabeçalho interno, tabelas aninhadas e percentuais inválidos são tratados com segurança.");
