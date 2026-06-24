import fs from "node:fs";

const file = "src/index.ts";

if (!fs.existsSync(file)) {
  console.log("patch bb assembly free lance details: file not found");
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

const freeLanceAssemblyCode = `function normalizePctDecimal(value: unknown) {
  const parsed = parseNumberBR(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function pctAlmostEqual(a: number, b: number) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= 0.0005;
}

function uniqueDecimalPcts(values: number[]) {
  return Array.from(new Set(values.filter((value) => value > 0 && value <= 1).map((value) => Number(value.toFixed(6))))).sort(
    (a, b) => a - b
  );
}

function fixedPctsFromConfig(config: any) {
  const values: number[] = [];

  const directValues = Array.isArray(config?.fixedLancePcts)
    ? config.fixedLancePcts
    : Array.isArray(config?.lancesFixosPcts)
      ? config.lancesFixosPcts
      : [];

  for (const value of directValues) {
    const pct = normalizePctDecimal(value);
    if (pct) values.push(pct);
  }

  const options = Array.isArray(config?.lanceOptions) ? config.lanceOptions : [];
  for (const option of options) {
    const text = normalizeText(\`\${option?.key || ""} \${option?.nomeComercial || ""} \${option?.nome || ""}\`);
    if (option?.enabled !== false && text.includes("FIXO")) {
      const pct = normalizePctDecimal(option?.pct);
      if (pct) values.push(pct);
    }
  }

  return uniqueDecimalPcts(values);
}

async function loadGroupFixedLancePcts(grupo: string) {
  const padded = onlyDigits(grupo).padStart(6, "0");
  const unpadded = padded.replace(/^0+/, "") || padded;

  let { data: rows, error } = await supabase
    .from("sim_bb_groups")
    .select("grupo, config, permite_fixo_25, permite_fixo_50")
    .eq("grupo", padded);

  if (error) throw error;

  if (!rows?.length && unpadded !== padded) {
    const fallback = await supabase
      .from("sim_bb_groups")
      .select("grupo, config, permite_fixo_25, permite_fixo_50")
      .eq("grupo", unpadded);

    if (fallback.error) throw fallback.error;
    rows = fallback.data || [];
  }

  const values: number[] = [];

  for (const row of rows || []) {
    if (row?.permite_fixo_25) values.push(0.25);
    if (row?.permite_fixo_50) values.push(0.5);
    values.push(...fixedPctsFromConfig(row?.config || {}));
  }

  return uniqueDecimalPcts(values);
}

function shouldRefineAssemblyWithDetails(result: any, fixedPcts: number[]) {
  if (!fixedPcts.length || !result?.menorPct) return false;
  return fixedPcts.some((pct) => pctAlmostEqual(result.menorPct, pct));
}

async function openLatestAssemblyDetails(page: Page, result: any) {
  const opened = await page.evaluate(({ grupo, assembleia }) => {
    const clean = (value: unknown) => String(value || "").replace(/\\s+/g, " ").trim();
    const groupDigits = String(grupo || "").replace(/\\D/g, "").replace(/^0+/, "");
    const assemblyDigits = String(assembleia || "").replace(/\\D/g, "").replace(/^0+/, "");

    const rows = Array.from(document.querySelectorAll("table tr"));
    const candidates = rows
      .map((tr) => {
        const cells = Array.from(tr.querySelectorAll("td"));
        const texts = cells.map((td) => clean((td as HTMLElement).innerText || td.textContent));
        return { tr, cells, texts };
      })
      .filter((row) => {
        const rowGroup = String(row.texts[0] || "").replace(/\\D/g, "").replace(/^0+/, "");
        const rowAssembly = String(row.texts[1] || "").replace(/\\D/g, "").replace(/^0+/, "");
        return row.texts.length >= 6 && rowGroup === groupDigits && rowAssembly === assemblyDigits;
      });

    const target = candidates[candidates.length - 1];
    if (!target) return false;

    const clickable =
      target.tr.querySelector('input[type="image"], input[type="button"], input[type="submit"], a, button, img') ||
      target.cells[target.cells.length - 1]?.querySelector('input, a, button, img');

    if (!clickable) return false;
    (clickable as HTMLElement).click();
    return true;
  }, result);

  if (!opened) {
    throw new Error(\`Botão Detalhes não encontrado para grupo \${result.grupo}, assembleia \${result.assembleia}.\`);
  }

  await waitDom(page, 10000);
  await page.waitForTimeout(1500);

  const visible = await page.getByText("Detalhes", { exact: false }).first().isVisible().catch(() => false);
  if (!visible) {
    await page.waitForTimeout(1500);
  }
}

async function detailsSignature(page: Page) {
  return page.evaluate(() => {
    const clean = (value: unknown) => String(value || "").replace(/\\s+/g, " ").trim();
    const rows = Array.from(document.querySelectorAll("table tr"))
      .map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => clean((td as HTMLElement).innerText || td.textContent)))
      .filter((cells) => cells.length >= 4 && /^\\d+/.test(cells[0] || "") && /LANCE|SORTEIO/i.test(cells[1] || ""));

    return rows.map((cells) => cells.slice(0, 4).join("|")).join("||");
  });
}

async function readCurrentAssemblyDetailRows(page: Page) {
  return page.evaluate(() => {
    const clean = (value: unknown) => String(value || "").replace(/\\s+/g, " ").trim();
    return Array.from(document.querySelectorAll("table tr"))
      .map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => clean((td as HTMLElement).innerText || td.textContent)))
      .filter((cells) => cells.length >= 4 && /^\\d+/.test(cells[0] || "") && /LANCE/i.test(cells[1] || ""))
      .map((cells) => ({
        cota: cells[0],
        tipo: cells[1],
        percentual: cells[2],
        valorBem: cells[3],
        raw: cells,
      }));
  });
}

async function clickNextAssemblyDetailsPage(page: Page) {
  const before = await detailsSignature(page);

  const clicked = await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll('input[type="image"], input[type="button"], button, a, img')
    );

    const target = candidates.find((element) => {
      const html = (element as HTMLElement).outerHTML || "";
      const text = [
        (element as HTMLElement).innerText,
        element.textContent,
        element.getAttribute("alt"),
        element.getAttribute("title"),
        element.getAttribute("src"),
        element.getAttribute("onclick"),
        html,
      ]
        .filter(Boolean)
        .join(" ")
        .toUpperCase();

      return (
        text.includes("PAGE$NEXT") ||
        text.includes("NEXT") ||
        text.includes("PROXIMO") ||
        text.includes("PRÓXIMO") ||
        text.includes("FORWARD") ||
        text.includes("RIGHT")
      );
    });

    if (!target) return false;
    (target as HTMLElement).click();
    return true;
  });

  if (!clicked) return false;

  await waitDom(page, 10000);

  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(400);
    const after = await detailsSignature(page);
    if (after && after !== before) return true;
  }

  return false;
}

async function readAllAssemblyDetailRows(page: Page) {
  const allRows: Array<{ cota: string; tipo: string; percentual: string; valorBem: string; raw: string[] }> = [];
  const seen = new Set<string>();

  for (let pageIndex = 0; pageIndex < 100; pageIndex++) {
    const rows = await readCurrentAssemblyDetailRows(page);
    const signature = await detailsSignature(page);

    if (signature && seen.has(signature)) break;
    if (signature) seen.add(signature);

    allRows.push(...rows);

    const hasNext = await clickNextAssemblyDetailsPage(page);
    if (!hasNext) break;
  }

  return allRows;
}

async function refineAssemblyResultWithFreeLanceDetails(page: Page, result: any) {
  const fixedPcts = await loadGroupFixedLancePcts(result.grupo);

  if (!shouldRefineAssemblyWithDetails(result, fixedPcts)) {
    return {
      ...result,
      freeLanceRefined: false,
      fixedLancePcts: fixedPcts,
    };
  }

  await openLatestAssemblyDetails(page, result);
  const detailRows = await readAllAssemblyDetailRows(page);
  const allPcts = detailRows
    .map((row) => normalizePctDecimal(row.percentual))
    .filter((pct) => pct > 0 && pct <= 1);

  const freePcts = allPcts.filter((pct) => !fixedPcts.some((fixedPct) => pctAlmostEqual(pct, fixedPct)));

  if (!freePcts.length) {
    return {
      ...result,
      freeLanceRefined: false,
      fixedLancePcts: fixedPcts,
      detailRows,
      detailReason: "Nenhum lance livre encontrado após excluir fixos.",
    };
  }

  const maiorPct = Math.max(...freePcts);
  const menorPct = Math.min(...freePcts);
  const medianaPct = maiorPct && menorPct ? (maiorPct + menorPct) / 2 : 0;

  log("resultado de assembleia refinado por lances livres", {
    grupo: result.grupo,
    assembleia: result.assembleia,
    resumoMaiorPct: result.maiorPct,
    resumoMenorPct: result.menorPct,
    maiorPct,
    menorPct,
    fixedLancePcts: fixedPcts,
    detailRows: detailRows.length,
  });

  return {
    ...result,
    maiorPct,
    menorPct,
    medianaPct,
    freeLanceRefined: true,
    fixedLancePcts: fixedPcts,
    resumoOriginal: {
      maiorPct: result.maiorPct,
      menorPct: result.menorPct,
      medianaPct: result.medianaPct,
    },
    detailRows,
  };
}

async function readLatestAssembly(page: Page, grupo: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const rows = await page.locator("table tr").evaluateAll((trs) => {
      return trs
        .map((tr) =>
          Array.from(tr.querySelectorAll("td")).map((td) =>
            String((td as HTMLElement).innerText || td.textContent || "").trim()
          )
        )
        .filter((cells) => cells.length >= 6 && /^\\d+/.test(cells[0] || "") && /^\\d+/.test(cells[1] || ""));
    });

    if (rows.length) {
      const last = rows[rows.length - 1];
      const maiorPct = pctDecimal(last[4]);
      const menorPct = pctDecimal(last[5]);
      const medianaPct = maiorPct && menorPct ? (maiorPct + menorPct) / 2 : 0;

      const result = {
        grupo: String(last[0] || grupo).trim(),
        assembleia: String(last[1] || "").trim(),
        dataAssembleia: String(last[2] || "").trim(),
        qtdeContemplados: parseNumberBR(last[3]),
        maiorPct,
        menorPct,
        medianaPct,
        raw: last,
      };

      return await refineAssemblyResultWithFreeLanceDetails(page, result);
    }

    if (attempt < 3) {
      await page.waitForTimeout(1500);
    }
  }

  throw new Error(\`Nenhum resultado de assembleia encontrado para o grupo \${grupo}.\`);
}`;

replaceRegex(
  /async function readLatestAssembly\(page: Page, grupo: string\) \{[\s\S]*?\n\}\n\nasync function updateGroupAssembly/,
  `${freeLanceAssemblyCode}\n\nasync function updateGroupAssembly`,
  "async function refineAssemblyResultWithFreeLanceDetails"
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch bb assembly free lance details: applied");
} else {
  console.log("patch bb assembly free lance details: no changes");
}
