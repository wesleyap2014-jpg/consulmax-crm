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
  /function shouldRefineAssemblyWithDetails\([^)]*\) \{[\s\S]*?\n\}/,
  [
    "function shouldRefineAssemblyWithDetails(result: any, fixedPcts: number[]) {",
    "  if (!fixedPcts.length || !result?.menorPct) return false;",
    "",
    "  // Só entra nos detalhes quando o menor lance do resumo bate exatamente com um lance fixo do grupo.",
    "  // Se o menor lance do resumo for menor que o fixo, ele já representa lance livre e deve ser mantido.",
    "  return fixedPcts.some((pct) => pctAlmostEqual(result.menorPct, pct));",
    "}",
  ].join("\n"),
  "Só entra nos detalhes quando o menor lance do resumo bate exatamente com um lance fixo do grupo"
);

const refinedFunction = [
  "async function refineAssemblyResultWithFreeLanceDetails(page: Page, result: any) {",
  "  const fixedPcts = await loadGroupFixedLancePcts(result.grupo);",
  "  const sortedFixedPcts = uniqueDecimalPcts(fixedPcts);",
  "  const resultMenorPct = Number(result?.menorPct || 0);",
  "  const fixedReferencePct = sortedFixedPcts.find((pct) => pctAlmostEqual(resultMenorPct, pct)) || 0;",
  "",
  "  if (!shouldRefineAssemblyWithDetails(result, sortedFixedPcts)) {",
  "    return {",
  "      ...result,",
  "      freeLanceRefined: false,",
  "      fixedLancePcts: sortedFixedPcts,",
  "      fixedReferencePct,",
  "      detailReason: fixedReferencePct ? undefined : \"Menor lance do resumo não é igual a lance fixo do grupo.\",",
  "    };",
  "  }",
  "",
  "  await openLatestAssemblyDetails(page, result);",
  "  const detailRows = await readAllAssemblyDetailRows(page);",
  "  const parsedRows = detailRows",
  "    .map((row, index) => ({",
  "      ...row,",
  "      index,",
  "      pct: normalizePctDecimal(row.percentual),",
  "    }))",
  "    .filter((row) => row.pct > 0 && row.pct <= 1);",
  "",
  "  const fixedStartIndex = parsedRows.findIndex((row) => pctAlmostEqual(row.pct, fixedReferencePct));",
  "  const rowsBeforeFixed = fixedStartIndex >= 0 ? parsedRows.slice(0, fixedStartIndex) : [];",
  "  const previousFreeRow = [...rowsBeforeFixed]",
  "    .reverse()",
  "    .find((row) => row.pct > fixedReferencePct && !sortedFixedPcts.some((fixedPct) => pctAlmostEqual(row.pct, fixedPct)));",
  "",
  "  const fallbackFreePcts = parsedRows",
  "    .map((row) => row.pct)",
  "    .filter((pct) => pct > fixedReferencePct && !sortedFixedPcts.some((fixedPct) => pctAlmostEqual(pct, fixedPct)))",
  "    .sort((a, b) => a - b);",
  "",
  "  const menorPct = previousFreeRow?.pct || fallbackFreePcts[0] || 0;",
  "",
  "  if (!menorPct) {",
  "    return {",
  "      ...result,",
  "      freeLanceRefined: false,",
  "      fixedLancePcts: sortedFixedPcts,",
  "      fixedReferencePct,",
  "      detailRows,",
  "      fixedStartIndex,",
  "      detailReason: \"Menor lance do resumo é fixo, mas nenhum lance livre anterior ao início dos fixos foi encontrado.\",",
  "    };",
  "  }",
  "",
  "  const maiorPct = Math.max(result.maiorPct || 0, ...fallbackFreePcts, menorPct);",
  "  const medianaPct = maiorPct && menorPct ? (maiorPct + menorPct) / 2 : 0;",
  "",
  "  log(\"resultado de assembleia refinado por último lance livre antes dos fixos\", {",
  "    grupo: result.grupo,",
  "    assembleia: result.assembleia,",
  "    resumoMaiorPct: result.maiorPct,",
  "    resumoMenorPct: result.menorPct,",
  "    fixedReferencePct,",
  "    fixedStartIndex,",
  "    maiorPct,",
  "    menorPct,",
  "    previousFreeRow: previousFreeRow?.raw || null,",
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
  "    fixedStartIndex,",
  "    previousFreeRow: previousFreeRow || null,",
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
  "resultado de assembleia refinado por último lance livre antes dos fixos"
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch bb assembly free lance threshold: applied");
} else {
  console.log("patch bb assembly free lance threshold: no changes");
}
