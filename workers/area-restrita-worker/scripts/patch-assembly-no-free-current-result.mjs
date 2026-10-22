import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/assembly-result-sync.mjs");
let source = fs.readFileSync(file, "utf8");

const throwBlock = `      if (!stats.quantidadeLancesLivres) {
        throw new Error(\`Nenhum lance livre permaneceu após descartar os fixos \${fixedPercentages.join("%, ") || "configurados"}.\`);
      }

      const assemblyDate = stats.lancesLivres.map((row) => row.data).find((value) => /\\b\\d{2}\\/\\d{2}\\/\\d{4}\\b/.test(String(value || "")))
        || null;
      if (!assemblyDate || !isoDateFromBrazilian(assemblyDate)) {
        throw new Error("A data da assembleia não foi reconhecida na tabela de resultados.");
      }
      if ([stats.menorPct, stats.medianaPct, stats.maiorPct].some((value) => !Number.isFinite(value) || value <= 0 || value > 100)) {
        throw new Error("Os percentuais calculados para a assembleia são estruturalmente inválidos.");
      }`;

const replacement = `      const assemblyDate = stats.lancesLivres.map((row) => row.data).find((value) => /\\b\\d{2}\\/\\d{2}\\/\\d{4}\\b/.test(String(value || "")))
        || rows.map((row) => String(row?.data || "").trim()).find((value) => /\\b\\d{2}\\/\\d{2}\\/\\d{4}\\b/.test(String(value || "")))
        || null;
      if (!assemblyDate || !isoDateFromBrazilian(assemblyDate)) {
        throw new Error("A data da assembleia não foi reconhecida na tabela de resultados.");
      }
      if (
        stats.quantidadeLancesLivres > 0
        && [stats.menorPct, stats.medianaPct, stats.maiorPct].some((value) => !Number.isFinite(value) || value <= 0 || value > 100)
      ) {
        throw new Error("Os percentuais calculados para a assembleia são estruturalmente inválidos.");
      }`;

if (source.includes(throwBlock)) {
  source = source.replace(throwBlock, replacement);
} else if (!source.includes("stats.quantidadeLancesLivres > 0")) {
  throw new Error("Não foi possível transformar assembleia sem lance livre em resultado válido.");
}

const resultAnchor = `        lancesLivres: stats.lancesLivres,`;
if (!source.includes('status: stats.quantidadeLancesLivres > 0 ? "ok" : "sem_lance_livre"')) {
  if (!source.includes(resultAnchor)) throw new Error("Bloco de resultado da assembleia não localizado.");
  source = source.replace(
    resultAnchor,
    `${resultAnchor}
        status: stats.quantidadeLancesLivres > 0 ? "ok" : "sem_lance_livre",
        semLanceLivre: stats.quantidadeLancesLivres === 0,`,
  );
}

if (
  source.includes("Nenhum lance livre permaneceu após descartar os fixos")
  || !source.includes('status: stats.quantidadeLancesLivres > 0 ? "ok" : "sem_lance_livre"')
  || !source.includes('rows.map((row) => String(row?.data || "").trim())')
) {
  throw new Error("Correção de assembleia sem lance livre não foi aplicada integralmente.");
}

fs.writeFileSync(file, source);
console.log("Assembleias sem lance livre agora são salvas como resultado atual válido, sem reaproveitar dados antigos.");
