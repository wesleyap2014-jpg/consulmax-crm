import "dotenv/config";
import express from "express";
import { chromium, Page, Browser } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { bbGroupIdentityKey } from "./groupIdentity.js";

type SegmentKey =
  | "auto_ipca"
  | "auto_fipe"
  | "outros_bens"
  | "pesados"
  | "motocicleta"
  | "imoveis";

type SegmentConfig = {
  key: SegmentKey;
  portalValue: string;
  portalText: string;
  vendaValues?: string[];
};

type RawGroupRow = {
  grupo: string;
  segmento: SegmentKey;
  prazo: number;
  vagas: number;
  bem: string;
  taxaAdmPct: number;
  fundoReservaPct: number;
  seguroPct: number;
  credito: number;
  parcela: number;
  assembleia: string;
  vencimento: string;
  minContemplacaoPct: number;
  pageIndex: number;
  venda?: string | null;
};

type SyncResult = {
  ok: boolean;
  status: "synced";
  administradora: "bb";
  segmento: SegmentKey;
  found: number;
  created: number;
  updated: number;
  details: {
    raw_rows: number;
    pages: number;
    uniqueGroups: number;
    readDetails: Array<{
      segmento: SegmentKey;
      venda: string | null;
      linhas: number;
      grupos: number;
      paginas: number;
    }>;
  };
};

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 3000);

const SEGMENTS: Record<SegmentKey, SegmentConfig> = {
  auto_ipca: {
    key: "auto_ipca",
    portalValue: "AI",
    portalText: "AI - AUTO IPCA",
  },
  auto_fipe: {
    key: "auto_fipe",
    portalValue: "AU",
    portalText: "AU - AUTO DEMAIS",
  },
  outros_bens: {
    key: "outros_bens",
    portalValue: "EE",
    portalText: "EE - OUTROS BENS MOVEIS",
  },
  pesados: {
    key: "pesados",
    portalValue: "TC",
    portalText: "TC - TRATOR E CAMINHAO GERAL",
  },
  motocicleta: {
    key: "motocicleta",
    portalValue: "MO",
    portalText: "MO - MOTO DEMAIS",
  },
  imoveis: {
    key: "imoveis",
    portalValue: "IM",
    portalText: "IM - IMOVEIS GERAL",
    vendaValues: ["93", "95"],
  },
};

const SELECTORS = {
  pessoa: "#ctl00_Conteudo_cbxPessoa",
  filial: "#ctl00_Conteudo_cbxFilial",
  grupo: "#ctl00_Conteudo_cbxTipoGrupo",
  periodicidade: "#ctl00_Conteudo_cbxPeriodicidade",
  venda: "#ctl00_Conteudo_cbxTipoVenda",
  proximo: "#ctl00_Conteudo_lnkProximo",
  gruposTable: "#ctl00_Conteudo_grdGruposDisponiveis",
  nextPageArrow:
    'input[alt="Próximo"][onclick*="Page$Next"], input[alt="Proximo"][onclick*="Page$Next"], input[src*="next.png"][onclick*="Page$Next"]',
};

const supabase = createClient(
  requiredEnv("SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function log(message: string, data?: Record<string, unknown>) {
  const extra = data ? ` ${JSON.stringify(data)}` : "";
  console.log(`[bb-groups-worker] ${new Date().toISOString()} ${message}${extra}`);
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseNumberBR(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const cleaned = raw
    .replace(/R\$/gi, "")
    .replace(/%/g, "")
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "");

  if (!cleaned) return 0;

  const parsed = Number(cleaned.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pctDecimal(value: unknown) {
  const parsed = parseNumberBR(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function formatMoneyBR(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function validateSegment(value: unknown): SegmentKey {
  const key = String(value || "").trim() as SegmentKey;
  if (!SEGMENTS[key]) {
    throw new Error(
      `Segmento inválido. Use: ${Object.keys(SEGMENTS).join(", ")}`
    );
  }
  return key;
}

function assertAuthorized(req: express.Request) {
  const secret = requiredEnv("ROBOT_API_SECRET");
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token || token !== secret) {
    const err: any = new Error("Não autorizado.");
    err.statusCode = 401;
    throw err;
  }
}

async function waitDom(page: Page, timeout = 2000) {
  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => null);
  await page.waitForLoadState("networkidle", { timeout }).catch(() => null);
}

async function launchBrowser(): Promise<Browser> {
  log("iniciando Chrome/Chromium real");

  return chromium.launch({
    headless: String(process.env.PLAYWRIGHT_HEADLESS || "true") !== "false",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

async function fillFirstVisible(page: Page, selectors: string[], value: string) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.fill(value);
      return;
    }
  }

  throw new Error(`Campo não encontrado para preencher: ${selectors.join(" | ")}`);
}

async function clickFirstVisible(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return;
    }
  }

  throw new Error(`Botão não encontrado: ${selectors.join(" | ")}`);
}

async function dismissPostLoginMessages(page: Page) {
  const candidates = [
    'button:has-text("Fechar")',
    'a:has-text("Fechar")',
    'input[value="Fechar"]',
    '.ui-dialog-titlebar-close',
    '[aria-label="Close"]',
    '[title="Fechar"]',
    '[title="Close"]',
  ];

  for (let round = 0; round < 4; round++) {
    let clicked = false;

    for (const selector of candidates) {
      const locator = page.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        await locator.click().catch(() => null);
        await page.waitForTimeout(400);
        clicked = true;
        break;
      }
    }

    if (!clicked) break;
  }
}

async function login(page: Page) {
  log("login iniciado");

  await page.goto(requiredEnv("BB_ROBOT_PORTAL_URL"), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  const usernameSelector = process.env.BB_LOGIN_USERNAME_SELECTOR;
  const passwordSelector = process.env.BB_LOGIN_PASSWORD_SELECTOR;
  const submitSelector = process.env.BB_LOGIN_SUBMIT_SELECTOR;

  await fillFirstVisible(
    page,
    usernameSelector
      ? [usernameSelector]
      : [
          'input[type="text"]',
          'input[type="email"]',
          'input[name*="user" i]',
          'input[name*="usuario" i]',
          'input[id*="user" i]',
          'input[id*="usuario" i]',
          "input:not([type])",
        ],
    requiredEnv("BB_ROBOT_USERNAME")
  );

  await fillFirstVisible(
    page,
    passwordSelector
      ? [passwordSelector]
      : [
          'input[type="password"]',
          'input[name*="senha" i]',
          'input[name*="password" i]',
          'input[id*="senha" i]',
          'input[id*="password" i]',
        ],
    requiredEnv("BB_ROBOT_PASSWORD")
  );

  if (submitSelector) {
    await clickFirstVisible(page, [submitSelector]);
  } else {
    const enterButton = page.getByText("Entrar", { exact: true }).first();
    if (await enterButton.isVisible().catch(() => false)) {
      await enterButton.click();
    } else {
      await clickFirstVisible(page, [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Acessar")',
        'a:has-text("Entrar")',
      ]);
    }
  }

  await waitDom(page, 8000);
  await page.waitForTimeout(1200);
  await dismissPostLoginMessages(page);

  log("login concluído");
}

async function openSimulator(page: Page) {
  log("abrindo simulador/contratação");

  await dismissPostLoginMessages(page);

  if (await page.locator(SELECTORS.grupo).isVisible().catch(() => false)) {
    return;
  }

  const links = [
    page.getByText("Simulador/Contratação").first(),
    page.getByText("Simulador/Contratacao").first(),
    page.locator("a").filter({ hasText: /Simulador\/Contrata/i }).first(),
    page.locator("a").filter({ hasText: /Simulador/i }).first(),
  ];

  for (const link of links) {
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await waitDom(page, 8000);
      await page.waitForTimeout(1000);
      if (await page.locator(SELECTORS.grupo).isVisible().catch(() => false)) {
        return;
      }
    }
  }

  const currentUrl = page.url();
  const marker = "/acesso_restrito/";
  const base = currentUrl.includes(marker)
    ? currentUrl.split(marker)[0] + marker
    : currentUrl.replace(/\/[^/]*$/, "/acesso_restrito/");

  await page.goto(`${base}frmAnaliseCadastro.aspx?Simulador=S`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await waitDom(page, 8000);
  await dismissPostLoginMessages(page);

  await page.locator(SELECTORS.grupo).waitFor({
    state: "visible",
    timeout: 30000,
  });

  log("simulador aberto");
}

async function getSelectOptions(page: Page, selector: string) {
  return page.locator(selector).locator("option").evaluateAll((options) =>
    options.map((option) => ({
      value: (option as HTMLOptionElement).value,
      text: option.textContent || "",
      disabled: (option as HTMLOptionElement).disabled,
    }))
  );
}

async function selectOptionIfAvailable(
  page: Page,
  selector: string,
  value: string,
  required = false
) {
  const select = page.locator(selector);
  if (!(await select.isVisible().catch(() => false))) {
    if (required) throw new Error(`Select não encontrado: ${selector}`);
    return false;
  }

  const options = await getSelectOptions(page, selector);
  const found = options.find((option) => String(option.value) === value);

  if (!found) {
    if (required) {
      throw new Error(
        `Opção ${value} não encontrada em ${selector}. Opções: ${options
          .map((o) => `${o.value} - ${o.text}`)
          .join(" | ")}`
      );
    }
    return false;
  }

  await select.selectOption(value);
  await waitDom(page, 5000);
  await page.waitForTimeout(700);
  return true;
}

async function selectSegment(page: Page, segment: SegmentConfig) {
  log("segmento selecionado", {
    segmento: segment.key,
    portalValue: segment.portalValue,
  });

  await page.locator(SELECTORS.grupo).waitFor({
    state: "visible",
    timeout: 30000,
  });

  await selectOptionIfAvailable(page, SELECTORS.pessoa, "F", false);
  await selectOptionIfAvailable(page, SELECTORS.filial, "001", false);
  await selectOptionIfAvailable(page, SELECTORS.grupo, segment.portalValue, true);

  await page.locator(SELECTORS.proximo).waitFor({
    state: "visible",
    timeout: 30000,
  });
}

async function availableVendaValues(page: Page) {
  const venda = page.locator(SELECTORS.venda);

  if (!(await venda.isVisible().catch(() => false))) {
    return [];
  }

  const options = await getSelectOptions(page, SELECTORS.venda);

  return options
    .filter((option) => !option.disabled && option.value)
    .map((option) => ({
      value: String(option.value),
      text: String(option.text || ""),
    }));
}

async function selectVenda(page: Page, vendaValue: string) {
  const vendas = await availableVendaValues(page);
  const found = vendas.find((v) => v.value === vendaValue);

  if (!found) {
    throw new Error(
      `Venda ${vendaValue} não disponível. Vendas disponíveis: ${vendas
        .map((v) => `${v.value} - ${v.text}`)
        .join(" | ")}`
    );
  }

  log("venda selecionada", {
    venda: found.value,
    text: found.text,
  });

  await page.locator(SELECTORS.venda).selectOption(vendaValue);
  await waitDom(page, 5000);
  await page.waitForTimeout(700);
}

async function clickMainNext(page: Page) {
  log("clicando em Próximo");

  await page.locator(SELECTORS.proximo).waitFor({
    state: "visible",
    timeout: 30000,
  });

  await page.locator(SELECTORS.proximo).click();
  await waitDom(page, 10000);

  await page.getByText("Grupos Disponíveis").waitFor({
    timeout: 30000,
  });

  await page.locator(SELECTORS.gruposTable).waitFor({
    state: "visible",
    timeout: 30000,
  });

  log("tela de grupos aberta");
}

async function tableSignature(page: Page) {
  return page.evaluate((selector) => {
    const table = document.querySelector(selector);
    const text = table?.textContent || document.body.textContent || "";
    return text.replace(/\s+/g, " ").trim().slice(0, 2000);
  }, SELECTORS.gruposTable);
}

async function readCurrentTable(page: Page, segmento: SegmentKey, pageIndex: number, venda: string | null) {
  const rows = await page.evaluate(
    ({ tableSelector }) => {
      function clean(value: unknown) {
        return String(value || "").replace(/\s+/g, " ").trim();
      }

      const table = document.querySelector(tableSelector);
      const source = table || document;

      const trs = Array.from(source.querySelectorAll("tr"));

      return trs
        .map((tr) =>
          Array.from(tr.querySelectorAll("td")).map((td) =>
            clean((td as HTMLElement).innerText || td.textContent)
          )
        )
        .filter((cells) => cells.length >= 12)
        .map((cells) => cells.slice(0, 12));
    },
    { tableSelector: SELECTORS.gruposTable }
  );

  const mapped: RawGroupRow[] = rows
    .map((cells) => ({
      grupo: String(cells[0] || "").trim(),
      segmento,
      prazo: parseNumberBR(cells[1]),
      vagas: parseNumberBR(cells[2]),
      bem: String(cells[3] || "").trim(),
      taxaAdmPct: pctDecimal(cells[4]),
      fundoReservaPct: pctDecimal(cells[5]),
      seguroPct: pctDecimal(cells[6]),
      credito: parseNumberBR(cells[7]),
      parcela: parseNumberBR(cells[8]),
      assembleia: String(cells[9] || "").trim(),
      vencimento: String(cells[10] || "").trim(),
      minContemplacaoPct: pctDecimal(cells[11]),
      pageIndex,
      venda,
    }))
    .filter((row) => {
      return (
        /^\d{4,6}$/.test(row.grupo) &&
        row.prazo > 0 &&
        row.credito > 0 &&
        row.parcela > 0
      );
    });

  log(`página ${pageIndex + 1} lida`, {
    linhas: mapped.length,
    segmento,
    venda,
  });

  return mapped;
}

async function clickNextPageIfExists(page: Page) {
  const next = page.locator(SELECTORS.nextPageArrow).first();

  if (!(await next.isVisible().catch(() => false))) {
    return false;
  }

  const before = await tableSignature(page);

  await next.click();
  await waitDom(page, 10000);

  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(400);
    const after = await tableSignature(page);
    if (after && after !== before) {
      return true;
    }
  }

  return false;
}

async function readAllPages(page: Page, segmento: SegmentKey, venda: string | null) {
  const allRows: RawGroupRow[] = [];
  const seenSignatures = new Set<string>();

  for (let pageIndex = 0; pageIndex < 200; pageIndex++) {
    await page.locator(SELECTORS.gruposTable).waitFor({
      state: "visible",
      timeout: 30000,
    });

    const signature = await tableSignature(page);
    if (seenSignatures.has(signature)) break;
    seenSignatures.add(signature);

    const rows = await readCurrentTable(page, segmento, pageIndex, venda);
    allRows.push(...rows);

    const hasNext = await clickNextPageIfExists(page);
    if (!hasNext) break;
  }

  log("paginação finalizada", {
    segmento,
    venda,
    paginas: seenSignatures.size,
    linhas: allRows.length,
  });

  return {
    rows: allRows,
    pages: seenSignatures.size,
  };
}

async function clickPrevious(page: Page) {
  const candidates = [
    page.getByText("Anterior", { exact: true }).first(),
    page.locator('a:has-text("Anterior")').first(),
    page.locator('input[value="Anterior"]').first(),
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click();
      await waitDom(page, 8000);
      await page.waitForTimeout(700);
      return true;
    }
  }

  return false;
}

function buildGroupPayloads(rows: RawGroupRow[]) {
  const map = new Map<string, RawGroupRow[]>();

  for (const row of rows) {
    const key = bbGroupIdentityKey(row);
    map.set(key, [...(map.get(key) || []), row]);
  }

  return Array.from(map.entries()).map(([identityKey, list]) => {
    const first = list[0];
    const segmento = first.segmento;
    const grupo = String(first.grupo || "").trim();
    const provisional = grupo === "000000";

    const credits = list.map((row) => row.credito).filter(Boolean);
    const prazos = list.map((row) => row.prazo).filter(Boolean);
    const minCont = list.map((row) => row.minContemplacaoPct).filter(Boolean);

    const rangeMap = new Map<string, RawGroupRow>();

    for (const row of list) {
      const rangeKey = [
        Number(row.credito || 0).toFixed(2),
        Number(row.parcela || 0).toFixed(2),
        Number(row.prazo || 0),
        String(row.bem || ""),
      ].join(":");

      if (!rangeMap.has(rangeKey)) {
        rangeMap.set(rangeKey, row);
      }
    }

    const creditRanges = Array.from(rangeMap.values())
      .sort((a, b) => Number(a.credito || 0) - Number(b.credito || 0))
      .map((row, index) => ({
        id: `bb_${grupo}_${index}`,
        label: `Faixa ${index + 1} - ${formatMoneyBR(row.credito)}`,
        valor: Number(Number(row.credito || 0).toFixed(2)),
        parcela: Number(Number(row.parcela || 0).toFixed(2)),
        prazo: Number(row.prazo || 0),
        vagas: Number(row.vagas || 0),
        bem: String(row.bem || ""),
        taxaAdmPct: Number(row.taxaAdmPct || 0),
        fundoReservaPct: Number(row.fundoReservaPct || 0),
        seguroPct: Number(row.seguroPct || 0),
        minContemplacaoPct: Number(row.minContemplacaoPct || 0),
        assembleia: String(row.assembleia || ""),
        vencimento: String(row.vencimento || ""),
      }));

    const prazoRuleMap = new Map<string, any>();

    for (const row of list) {
      const ruleKey = `${row.prazo}:${row.taxaAdmPct}:${row.fundoReservaPct}`;

      if (!prazoRuleMap.has(ruleKey)) {
        prazoRuleMap.set(ruleKey, {
          id: `prazo_${grupo}_${prazoRuleMap.size}`,
          prazo: Number(row.prazo || 0),
          taxaAdmPct: Number(row.taxaAdmPct || 0),
          fundoReservaPct: Number(row.fundoReservaPct || 0),
        });
      }
    }

    const prazoRules = Array.from(prazoRuleMap.values()).sort(
      (a, b) => Number(a.prazo || 0) - Number(b.prazo || 0)
    );

    const minContemplacao = minCont.length ? Math.min(...minCont) : 0;

    return {
      identity_key: identityKey,
      grupo,
      segmento,
      nome_grupo: provisional
        ? `Em formação • ${Number(first?.prazo || 0)} meses`
        : `Grupo ${grupo}`,
      observacoes: `${provisional ? "Plano provisório" : "Grupo"} importado pelo robô BB externo${
        first?.assembleia ? ` • Assembleia: ${first.assembleia}` : ""
      }${first?.vencimento ? ` • Vencimento: ${first.vencimento}` : ""}`,
      credito_min: credits.length ? Math.min(...credits) : 0,
      credito_max: credits.length ? Math.max(...credits) : 0,
      prazo_min: prazos.length ? Math.min(...prazos) : 0,
      prazo_max: prazos.length ? Math.max(...prazos) : 0,
      taxa_adm_pct: Number(first?.taxaAdmPct || 0),
      fundo_reserva_pct: Number(first?.fundoReservaPct || 0),
      seguro_pct: Number(first?.seguroPct || 0),
      permite_lance_livre: true,
      permite_lance_embutido: false,
      lance_embutido_max_pct: 0,
      permite_fixo_25: false,
      permite_fixo_50: false,
      is_active: true,
      config: {
        creditRanges,
        prazoRules,
        lanceOptions: [
          {
            key: "livre",
            enabled: true,
            nomeComercial: "Lance Livre",
            pct: minContemplacao,
          },
          {
            key: "primeiro_fixo",
            enabled: false,
            nomeComercial: "1º Lance Fixo",
            pct: 0,
          },
          {
            key: "segundo_fixo",
            enabled: false,
            nomeComercial: "2º Lance Fixo",
            pct: 0,
          },
        ],
        maxLanceEmbutidoPct: 0,
        regraPosContemplacao: "saldo_devedor_prazo_restante",
        observacoesRegra: minContemplacao
          ? `% mín. contemplação: ${(minContemplacao * 100)
              .toFixed(4)
              .replace(".", ",")}%`
          : "",
        source: "bb-groups-worker",
        groupIdentityKey: identityKey,
        provisionalGroup: provisional,
        provisionalPlan: provisional
          ? {
              venda: first?.venda || null,
              prazo: Number(first?.prazo || 0),
              taxaAdmPct: Number(first?.taxaAdmPct || 0),
              fundoReservaPct: Number(first?.fundoReservaPct || 0),
              seguroPct: Number(first?.seguroPct || 0),
            }
          : null,
        updatedAt: new Date().toISOString(),
      },
    };
  });
}

async function upsertGroups(payloads: any[]) {
  let created = 0;
  let updated = 0;

  for (const payload of payloads) {
    const { data: existing, error: findErr } = await supabase
      .from("sim_bb_groups")
      .select("id, config")
      .eq("grupo", payload.grupo)
      .eq("segmento", payload.segmento)
      .maybeSingle();

    if (findErr) throw findErr;

    const existingConfig =
      existing?.config && typeof existing.config === "object"
        ? existing.config
        : {};

    if (existingConfig?.assemblyResult) {
      payload.config = {
        ...payload.config,
        assemblyResult: existingConfig.assemblyResult,
      };
    }

    if (existing?.id) {
      const { error } = await supabase
        .from("sim_bb_groups")
        .update(payload)
        .eq("id", existing.id);

      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await supabase.from("sim_bb_groups").insert(payload);

      if (error) throw error;
      created += 1;
    }
  }

  log("gravação no Supabase concluída", {
    created,
    updated,
    total: payloads.length,
  });

  return { created, updated };
}

async function processSegment(page: Page, segment: SegmentConfig) {
  const allRows: RawGroupRow[] = [];
  const readDetails: SyncResult["details"]["readDetails"] = [];

  await openSimulator(page);
  await selectSegment(page, segment);

  let vendasToRead: Array<string | null> = [null];

  if (segment.key === "imoveis") {
    const available = await availableVendaValues(page);
    const availableValues = available.map((item) => item.value);

    vendasToRead = ["93", "95"].filter((value) =>
      availableValues.includes(value)
    );

    if (!vendasToRead.length) {
      vendasToRead = [null];
    }
  }

  if (segment.key !== "imoveis") {
    const available = await availableVendaValues(page);
    if (available.some((item) => item.value === "95")) {
      await selectVenda(page, "95");
    }
  }

  for (const venda of vendasToRead) {
    if (venda) {
      await selectVenda(page, venda);
    }

    await clickMainNext(page);

    const result = await readAllPages(page, segment.key, venda);
    allRows.push(...result.rows);

    readDetails.push({
      segmento: segment.key,
      venda,
      linhas: result.rows.length,
      grupos: new Set(result.rows.map(bbGroupIdentityKey)).size,
      paginas: result.pages,
    });

    await clickPrevious(page).catch(() => null);
  }

  return {
    rows: allRows,
    readDetails,
  };
}

async function syncBBGroups(segmento: SegmentKey): Promise<SyncResult> {
  let stage = "iniciando";
  let browser: Browser | null = null;

  try {
    const segment = SEGMENTS[segmento];

    stage = "abrindo navegador";
    browser = await launchBrowser();

    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      locale: "pt-BR",
    });

    const page = await context.newPage();

    stage = "login";
    await login(page);

    stage = "processando segmento";
    const { rows, readDetails } = await processSegment(page, segment);

    if (!rows.length) {
      throw new Error(`Nenhuma linha foi lida para o segmento ${segmento}.`);
    }

    const payloads = buildGroupPayloads(rows);

    stage = "gravando no Supabase";
    const { created, updated } = await upsertGroups(payloads);

    const pages = readDetails.reduce((sum, item) => sum + Number(item.paginas || 0), 0);
    const uniqueGroups = payloads.length;

    log("sincronização concluída", {
      segmento,
      rawRows: rows.length,
      pages,
      uniqueGroups,
      created,
      updated,
    });

    await context.close().catch(() => null);

    return {
      ok: true,
      status: "synced",
      administradora: "bb",
      segmento,
      found: payloads.length,
      created,
      updated,
      details: {
        raw_rows: rows.length,
        pages,
        uniqueGroups,
        readDetails,
      },
    };
  } catch (error: any) {
    error.stage = error.stage || stage;
    error.segmento = segmento;
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
    }
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "bb-groups-worker",
    status: "online",
  });
});

app.post("/sync/bb/groups", async (req, res) => {
  let segmento: SegmentKey | null = null;

  try {
    assertAuthorized(req);

    segmento = validateSegment(req.body?.segmento);

    const result = await syncBBGroups(segmento);

    return res.status(200).json(result);
  } catch (error: any) {
    const status = Number(error?.statusCode || 500);

    log("erro na sincronização", {
      segmento,
      stage: error?.stage || "endpoint",
      error: error?.message || String(error),
    });

    return res.status(status).json({
      ok: false,
      error: error?.message || "Erro interno no worker BB.",
      stage: error?.stage || "endpoint",
      segmento,
    });
  }
});

app.listen(PORT, () => {
  log(`worker BB rodando na porta ${PORT}`);
});
