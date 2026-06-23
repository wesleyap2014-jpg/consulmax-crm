import fs from "node:fs";

const file = "src/index.ts";

if (!fs.existsSync(file)) {
  console.log("patch bb assembly result worker: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(needle, replacement, marker = replacement) {
  if (!src.includes(marker) && src.includes(needle)) {
    src = src.replace(needle, replacement);
    changed = true;
  }
}

replaceOnce(
  `function pctDecimal(value: unknown) {
  const parsed = parseNumberBR(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}`,
  `function pctDecimal(value: unknown) {
  const parsed = parseNumberBR(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function onlyDigits(value: unknown) {
  return String(value || "").replace(/\\D/g, "");
}

function isTransientRobotError(error: unknown) {
  const text = normalizeText((error as any)?.message || error || "");

  return (
    text.includes("EXECUTION CONTEXT WAS DESTROYED") ||
    text.includes("NAVIGATION") ||
    text.includes("TIMEOUT") ||
    text.includes("NENHUM RESULTADO DE ASSEMBLEIA") ||
    text.includes("BOTAO PESQUISAR") ||
    text.includes("CAMPO DE GRUPO")
  );
}`,
  "function isTransientRobotError"
);

const assemblyWorkerCode = `async function openAssemblyResult(page: Page) {
  log("abrindo resultado de assembleias");

  await dismissPostLoginMessages(page);

  const candidates = [
    page.getByText("Resultado de Assembleias").first(),
    page.getByText("Resultado de Assembleias", { exact: false }).first(),
    page.locator("a").filter({ hasText: /Resultado de Assembleias/i }).first(),
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: 10000 }).catch(async () => {
        await candidate.evaluate((element) => (element as HTMLElement).click());
      });
      await waitDom(page, 10000);
      await page.waitForTimeout(1500);
      return;
    }
  }

  const clicked = await page.evaluate(() => {
    const normalize = (value: unknown) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .toUpperCase()
        .replace(/\\s+/g, " ")
        .trim();

    const elements = Array.from(
      document.querySelectorAll('a, button, input[type="button"], input[type="submit"], img')
    );

    const target = elements.find((el) => {
      const element = el as HTMLInputElement | HTMLElement;
      const text = normalize(
        element.innerText ||
          element.textContent ||
          (element as HTMLInputElement).value ||
          element.getAttribute("title") ||
          element.getAttribute("alt") ||
          ""
      );

      return text.includes("RESULTADO DE ASSEMBLEIAS") || text.includes("RESULTADO ASSEMBLEIAS");
    });

    if (target) {
      (target as HTMLElement).click();
      return true;
    }

    return false;
  });

  if (clicked) {
    await waitDom(page, 10000);
    await page.waitForTimeout(1500);
    return;
  }

  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  throw new Error(
    \`Menu Resultado de Assembleias não encontrado. URL atual: \${page.url()}. Tela: \${normalizeText(bodyText).slice(0, 500)}\`
  );
}

async function searchAssemblyGroup(page: Page, grupo: string) {
  const groupNumber = onlyDigits(grupo).padStart(6, "0");

  if (!groupNumber || groupNumber === "000000") {
    throw new Error(\`Grupo inválido para resultado de assembleia: \${grupo}\`);
  }

  await page.getByText("Resultado de Assembleias").waitFor({ timeout: 20000 }).catch(() => null);

  const inputs = page.locator(
    'input:visible:not([type="image"]):not([type="button"]):not([type="submit"]):not([type="hidden"]):not([type="password"])'
  );

  const count = await inputs.count();

  if (count < 1) {
    throw new Error("Campo de grupo não encontrado na tela de Resultado de Assembleias.");
  }

  const groupInput = inputs.nth(0);

  await groupInput.fill("");
  await groupInput.fill(groupNumber);
  await page.waitForTimeout(500);

  const clicked = await page.evaluate(() => {
    const normalize = (value: unknown) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .toUpperCase()
        .replace(/\\s+/g, " ")
        .trim();

    const elements = Array.from(
      document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')
    );

    const target = elements.find((el) => {
      const element = el as HTMLInputElement | HTMLElement;
      return normalize(element.innerText || element.textContent || (element as HTMLInputElement).value || element.getAttribute("title") || "").includes("PESQUISAR");
    });

    if (target) {
      (target as HTMLElement).click();
      return true;
    }

    return false;
  });

  if (!clicked) {
    throw new Error("Botão Pesquisar não encontrado na tela de Resultado de Assembleias.");
  }

  await waitDom(page, 10000);
  await page.waitForTimeout(2500);
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

      return {
        grupo: String(last[0] || grupo).trim(),
        assembleia: String(last[1] || "").trim(),
        dataAssembleia: String(last[2] || "").trim(),
        qtdeContemplados: parseNumberBR(last[3]),
        maiorPct,
        menorPct,
        medianaPct,
        raw: last,
      };
    }

    if (attempt < 3) {
      await page.waitForTimeout(1500);
    }
  }

  throw new Error(\`Nenhum resultado de assembleia encontrado para o grupo \${grupo}.\`);
}

async function updateGroupAssembly(result: Awaited<ReturnType<typeof readLatestAssembly>>) {
  const grupo = String(result.grupo || "").replace(/^0+/, "") || String(result.grupo || "");
  const padded = String(result.grupo || "").padStart(6, "0");

  const assemblyResult = {
    maiorPct: result.maiorPct,
    menorPct: result.menorPct,
    medianaPct: result.medianaPct,
    assembleia: result.assembleia,
    dataAssembleia: result.dataAssembleia,
    qtdeContemplados: result.qtdeContemplados,
    raw: result.raw,
    updatedAt: new Date().toISOString(),
  };

  let { data: rows, error: findError } = await supabase
    .from("sim_bb_groups")
    .select("id,grupo,config")
    .eq("grupo", padded);

  if (findError) throw findError;

  if (!rows?.length) {
    const fallback = await supabase
      .from("sim_bb_groups")
      .select("id,grupo,config")
      .eq("grupo", grupo);

    if (fallback.error) throw fallback.error;
    rows = fallback.data || [];
  }

  let updated = 0;

  for (const row of rows || []) {
    const config =
      row.config && typeof row.config === "object" && !Array.isArray(row.config)
        ? row.config
        : {};

    const { error } = await supabase
      .from("sim_bb_groups")
      .update({
        config: {
          ...config,
          assemblyResult,
        },
      })
      .eq("id", row.id);

    if (error) throw error;
    updated += 1;
  }

  return { updated };
}

async function runAssemblyOnce(page: Page, grupo: string) {
  await openAssemblyResult(page);
  await searchAssemblyGroup(page, grupo);
  return await readLatestAssembly(page, grupo);
}

async function syncBBAssemblyResult(grupo: string) {
  let stage = "iniciando";
  let browser: Browser | null = null;

  if (!grupo) {
    throw new Error("Informe o número do grupo para buscar resultado de assembleia.");
  }

  try {
    stage = "abrindo navegador";
    browser = await launchBrowser();

    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      locale: "pt-BR",
    });

    const page = await context.newPage();

    stage = "login";
    await login(page);

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        stage = "buscando resultado de assembleia";
        const result = await runAssemblyOnce(page, grupo);

        stage = "gravando resultado de assembleia";
        const saved = await updateGroupAssembly(result);
        const retryText = attempt > 1 ? \` após \${attempt} tentativas\` : "";

        await context.close().catch(() => null);

        return {
          ok: true,
          status: "synced",
          administradora: "bb",
          message: \`Resultado de assembleia BB atualizado\${retryText} para o grupo \${result.grupo}: maior \${(result.maiorPct * 100).toFixed(4)}%, menor \${(result.menorPct * 100).toFixed(4)}%, mediana \${(result.medianaPct * 100).toFixed(4)}%.\`,
          found: 1,
          updated: saved.updated,
          details: {
            ...result,
            attempts: attempt,
          },
        };
      } catch (error) {
        lastError = error;

        if (attempt >= 2 || !isTransientRobotError(error)) {
          throw error;
        }

        await page.waitForTimeout(2000);
      }
    }

    throw lastError || new Error("Erro desconhecido ao buscar resultado de assembleia.");
  } catch (error: any) {
    error.stage = error.stage || stage;
    error.grupo = grupo;
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
    }
  }
}

app.post("/sync/bb/assembly-result", async (req, res) => {
  let grupo: string | null = null;

  try {
    assertAuthorized(req);

    grupo = String(req.body?.grupo || req.body?.group || "").trim();

    const result = await syncBBAssemblyResult(grupo);

    return res.status(200).json(result);
  } catch (error: any) {
    const status = Number(error?.statusCode || 500);

    log("erro na sincronização de assembleia", {
      grupo,
      stage: error?.stage || "endpoint",
      error: error?.message || String(error),
    });

    return res.status(status).json({
      ok: false,
      status: "error",
      administradora: "bb",
      error: error?.message || "Erro interno no worker BB.",
      stage: error?.stage || "endpoint",
      grupo,
    });
  }
});`;

if (!src.includes('app.post("/sync/bb/assembly-result"')) {
  src = src.replace('\napp.get("/health", (_req, res) => {', `\n${assemblyWorkerCode}\n\napp.get("/health", (_req, res) => {`);
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch bb assembly result worker: applied");
} else {
  console.log("patch bb assembly result worker: no changes");
}
