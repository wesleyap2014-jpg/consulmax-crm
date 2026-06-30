import fs from "node:fs";

const file = "src/index.ts";

if (!fs.existsSync(file)) {
  console.log("patch bb assembly free lance threshold: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceRegex(regex, replacement, marker) {
  if (!src.includes(marker) && regex.test(src)) {
    src = src.replace(regex, replacement);
    changed = true;
  }
}

replaceRegex(
  /function shouldRefineAssemblyWithDetails\(result: any, fixedPcts: number\[\]\) \{[\s\S]*?\n\}/,
  [
    "function shouldRefineAssemblyWithDetails(_result: any, fixedPcts: number[]) {",
    "  // Sempre que o grupo tiver lance fixo, abre os detalhes da assembleia.",
    "  // O menor lance livre correto será o menor percentual imediatamente acima do fixo usado como referência.",
    "  return fixedPcts.length > 0;",
    "}",
  ].join("\n"),
  "Sempre que o grupo tiver lance fixo"
);

const refinedFunction = [
  "async function refineAssemblyResultWithFreeLanceDetails(page: Page, result: any) {",
  "  const fixedPcts = await loadGroupFixedLancePcts(result.grupo);",
  "",
  "  if (!shouldRefineAssemblyWithDetails(result, fixedPcts)) {",
  "    return {",
  "      ...result,",
  "      freeLanceRefined: false,",
  "      fixedLancePcts: fixedPcts,",
  "    };",
  "  }",
  "",
  "  await openLatestAssemblyDetails(page, result);",
  "  const detailRows = await readAllAssemblyDetailRows(page);",
  "  const allPcts = detailRows",
  "    .map((row) => normalizePctDecimal(row.percentual))",
  "    .filter((pct) => pct > 0 && pct <= 1);",
  "",
  "  const sortedFixedPcts = uniqueDecimalPcts(fixedPcts);",
  "  const resultMenorPct = Number(result?.menorPct || 0);",
  "  const matchingFixedPct = sortedFixedPcts.find((pct) => pctAlmostEqual(resultMenorPct, pct));",
  "  const fixedBelowResumo = resultMenorPct",
  "    ? sortedFixedPcts.filter((pct) => pct <= resultMenorPct || pctAlmostEqual(pct, resultMenorPct))",
  "    : [];",
  "  const fixedWithCandidate = [...sortedFixedPcts]",
  "    .reverse()",
  "    .find((fixedPct) => allPcts.some((pct) => pct > fixedPct && !pctAlmostEqual(pct, fixedPct)));",
  "",
  "  const fixedReferencePct =",
  "    matchingFixedPct ||",
  "    (fixedBelowResumo.length ? fixedBelowResumo[fixedBelowResumo.length - 1] : 0) ||",
  "    fixedWithCandidate ||",
  "    sortedFixedPcts[sortedFixedPcts.length - 1] ||",
  "    0;",
  "",
  "  const freePcts = allPcts",
  "    .filter((pct) => pct > fixedReferencePct && !pctAlmostEqual(pct, fixedReferencePct))",
  "    .filter((pct) => !sortedFixedPcts.some((fixedPct) => pctAlmostEqual(pct, fixedPct)))",
  "    .sort((a, b) => a - b);",
  "",
  "  if (!freePcts.length) {",
  "    return {",
  "      ...result,",
  "      freeLanceRefined: false,",
  "      fixedLancePcts: sortedFixedPcts,",
  "      fixedReferencePct,",
  "      detailRows,",
  "      detailReason: \"Nenhum lance livre imediatamente maior que o lance fixo \" + (fixedReferencePct * 100).toFixed(4) + \"% encontrado.\",",
  "    };",
  "  }",
  "",
  "  const maiorPct = Math.max(...freePcts);",
  "  const menorPct = freePcts[0];",
  "  const medianaPct = maiorPct && menorPct ? (maiorPct + menorPct) / 2 : 0;",
  "",
  "  log(\"resultado de assembleia refinado por lances livres acima do fixo\", {",
  "    grupo: result.grupo,",
  "    assembleia: result.assembleia,",
  "    resumoMaiorPct: result.maiorPct,",
  "    resumoMenorPct: result.menorPct,",
  "    fixedReferencePct,",
  "    maiorPct,",
  "    menorPct,",
  "    fixedLancePcts: sortedFixedPcts,",
  "    detailRows: detailRows.length,",
  "  });",
  "",
  "  return {",
  "    ...result,",
  "    maiorPct,",
  "    menorPct,",
  "    medianaPct,",
  "    freeLanceRefined: true,",
  "    fixedLancePcts: sortedFixedPcts,",
  "    fixedReferencePct,",
  "    resumoOriginal: {",
  "      maiorPct: result.maiorPct,",
  "      menorPct: result.menorPct,",
  "      medianaPct: result.medianaPct,",
  "    },",
  "    detailRows,",
  "  };",
  "}",
  "",
  "async function readLatestAssembly",
].join("\n");

replaceRegex(
  /async function refineAssemblyResultWithFreeLanceDetails\(page: Page, result: any\) \{[\s\S]*?\n\}\n\nasync function readLatestAssembly/,
  refinedFunction,
  "fixedReferencePct"
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch bb assembly free lance threshold: applied");
} else {
  console.log("patch bb assembly free lance threshold: no changes");
}
