import type { Express, Request } from "express";
import type { Browser, Page } from "playwright";
import type { SupabaseClient } from "@supabase/supabase-js";

type MaggiAvailableSegmentKey = "automoveis" | "imoveis";

type MaggiAvailableSegmentConfig = {
  key: MaggiAvailableSegmentKey;
  label: string;
  revendaText: string;
};

type RegisterDeps = {
  supabase: SupabaseClient;
  requiredEnv: (name: string) => string;
  log: (message: string, data?: Record<string, unknown>) => void;
  waitDom: (page: Page, timeout?: number) => Promise<void>;
  launchBrowser: () => Promise<Browser>;
  fillFirstVisible: (page: Page, selectors: string[], value: string) => Promise<void>;
  clickFirstVisible: (page: Page, selectors: string[]) => Promise<void>;
  assertAuthorized: (req: Request) => void;
};

type SyncResult = {
  ok: boolean;
  status: "synced";
  administradora: "maggi";
  found: number;
  created: number;
  updated: number;
  deactivated: number;
  message: string;
  details: {
    segments: MaggiAvailableSegmentKey[];
    groupsBySegment: Partial<Record<MaggiAvailableSegmentKey, string[]>>;
    readDetails: Array<{ segmento: MaggiAvailableSegmentKey; linhas: number; grupos: number }>;
  };
};

const SEGMENTS: Record<MaggiAvailableSegmentKey, MaggiAvailableSegmentConfig> = {
  automoveis: {
    key: "automoveis",
    label: "Automóvel",
    revendaText: process.env.MAGGI_AVAILABLE_GROUPS_AUTOMOVEIS_REVENDA || "CAR - CONSULMAX PLANE JIPARANA",
  },
  imoveis: {
    key: "imoveis",
    label: "Imóvel",
    revendaText: process.env.MAGGI_AVAILABLE_GROUPS_IMOVEIS_REVENDA || "IMV - CONSULMAX PLANE JIPARANA",
  },
};

function optionalEnv(name: string) {
  return String(process.env[name] || "").trim();
}

function appBaseUrl(requiredEnv: RegisterDeps["requiredEnv"]) {
  const portalUrl = requiredEnv("MAGGI_AVAILABLE_GROUPS_PORTAL_URL").replace(/\/+$/, "");
  return portalUrl.replace(/\/(home|vendedor\/login|vendedor\/simulacao|vendedor\/estatisticas).*$/i, "");
}

function appUrl(requiredEnv: RegisterDeps["requiredEnv"], path: string) {
  return appBaseUrl(requiredEnv) + path;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSegments(value: unknown): MaggiAvailableSegmentKey[] {
  const allowed = new Set(Object.keys(SEGMENTS) as MaggiAvailableSegmentKey[]);
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const parsed = raw
    .map((item) => String(item || "").trim().toLowerCase() as MaggiAvailableSegmentKey)
    .filter((item) => allowed.has(item));

  return parsed.length ? Array.from(new Set(parsed)) : (["automoveis", "imoveis"] as MaggiAvailableSegmentKey[]);
}

function normalizeGroupCode(value: unknown) {
  const match = String(value || "").match(/\b\d{3,6}\b/);
  return match ? match[0].trim() : "";
}

async function waitSettled(deps: RegisterDeps, page: Page, timeoutMs = 12000) {
  await deps.waitDom(page, Math.min(timeoutMs, 10000)).catch(() => null);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const hasBusy = await page
      .locator('ion-loading, [role="progressbar"], .mat-progress-spinner, .mat-spinner, .loading-wrapper, .spinner')
      .first()
      .isVisible()
      .catch(() => false);

    if (!hasBusy) return;
    await page.waitForTimeout(500);
  }
}

async function clickText(page: Page, text: string, exact = false) {
  const locator = page.getByText(text, { exact }).first();
  if (await locator.isVisible().catch(() => false)) {
    await locator.click({ force: true });
    return true;
  }
  return false;
}

async function clickFirstVisibleSafe(deps: RegisterDeps, page: Page, selectors: string[]) {
  const filtered = selectors.map((selector) => String(selector || "").trim()).filter(Boolean);
  if (!filtered.length) return false;

  try {
    await deps.clickFirstVisible(page, filtered);
    return true;
  } catch {
    return false;
  }
}

async function fillFirstVisibleSafe(deps: RegisterDeps, page: Page, selectors: string[], value: string) {
  const filtered = selectors.map((selector) => String(selector || "").trim()).filter(Boolean);
  await deps.fillFirstVisible(page, filtered, value);
}

async function loginMaggi(deps: RegisterDeps, page: Page) {
  deps.log("login Maggi iniciado");

  await page.goto(deps.requiredEnv("MAGGI_AVAILABLE_GROUPS_PORTAL_URL"), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitSettled(deps, page, 15000);

  await clickText(page, "SOU VENDEDOR", true).catch(() => false);
  await waitSettled(deps, page, 12000);

  await fillFirstVisibleSafe(
    deps,
    page,
    [
      optionalEnv("MAGGI_AVAILABLE_GROUPS_USERNAME_SELECTOR"),
      'input[placeholder*="Código" i]',
      'input[aria-label*="Código" i]',
      'input[name*="codigo" i]',
      'input[name*="vendedor" i]',
      'input[type="text"]',
      'input:not([type])',
    ],
    deps.requiredEnv("MAGGI_AVAILABLE_GROUPS_USERNAME")
  );

  await fillFirstVisibleSafe(
    deps,
    page,
    [
      optionalEnv("MAGGI_AVAILABLE_GROUPS_PASSWORD_SELECTOR"),
      'input[type="password"]',
      'input[placeholder*="Senha" i]',
      'input[aria-label*="Senha" i]',
      'input[name*="senha" i]',
    ],
    deps.requiredEnv("MAGGI_AVAILABLE_GROUPS_PASSWORD")
  );

  const clicked = await clickFirstVisibleSafe(deps, page, [
    optionalEnv("MAGGI_AVAILABLE_GROUPS_LOGIN_BUTTON_SELECTOR"),
    'button:has-text("ACESSAR MINHA CONTA")',
    'ion-button:has-text("ACESSAR MINHA CONTA")',
    'button:has-text("Acessar")',
    'ion-button:has-text("Acessar")',
  ]);

  if (!clicked) await clickText(page, "ACESSAR MINHA CONTA", true);

  await waitSettled(deps, page, 60000);
  await page.getByText("Simulação").first().waitFor({ timeout: 60000 }).catch(() => null);
  deps.log("login Maggi concluído");
}

async function goToSimulationHome(deps: RegisterDeps, page: Page) {
  await page.goto(appUrl(deps.requiredEnv, "/vendedor/simulacao"), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitSettled(deps, page, 20000);
  await page.getByText("Simulação").first().waitFor({ timeout: 30000 }).catch(() => null);
}

async function runInternalSync(deps: RegisterDeps, page: Page) {
  deps.log("sincronização interna Maggi iniciada");

  await page.goto(appUrl(deps.requiredEnv, "/vendedor/estatisticas"), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitSettled(deps, page, 20000);

  const clicked = await clickFirstVisibleSafe(deps, page, [
    'button:has-text("Sincronizar")',
    'ion-button:has-text("Sincronizar")',
    'div:has-text("Sincronizar")',
  ]);

  if (!clicked) await clickText(page, "Sincronizar").catch(() => false);

  const waitMs = Number(process.env.MAGGI_AVAILABLE_GROUPS_INTERNAL_SYNC_WAIT_MS || 25000);
  await waitSettled(deps, page, waitMs);
  await page.waitForTimeout(Math.min(5000, Math.max(1000, waitMs / 5)));

  deps.log("sincronização interna Maggi concluída");
  await goToSimulationHome(deps, page);
}

async function openFormField(page: Page, label: string) {
  const labelRegex = new RegExp(escapeRegExp(label), "i");
  const candidates = [
    page.locator("mat-form-field").filter({ hasText: labelRegex }).first(),
    page.locator("ion-item").filter({ hasText: labelRegex }).first(),
    page.locator("label").filter({ hasText: labelRegex }).first(),
    page.getByText(labelRegex).first(),
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ force: true }).catch(async () => {
        const box = await candidate.boundingBox().catch(() => null);
        if (!box) throw new Error("Campo sem posição: " + label);
        await page.mouse.click(box.x + box.width - 24, box.y + box.height / 2);
      });
      await page.waitForTimeout(600);
      return;
    }
  }

  throw new Error("Campo Maggi não encontrado: " + label);
}

async function openSelect(page: Page, label: string) {
  await openFormField(page, label);
  await page
    .locator('[role="option"], mat-option, .mat-option, .mat-mdc-option, ion-select-popover ion-item, .popover-content ion-item')
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => null);
}

async function chooseOpenOption(deps: RegisterDeps, page: Page, optionText: string) {
  const optionRegex = new RegExp(escapeRegExp(optionText), "i");
  const option = page
    .locator('[role="option"], mat-option, .mat-option, .mat-mdc-option, ion-select-popover ion-item, .popover-content ion-item')
    .filter({ hasText: optionRegex })
    .first();

  if (await option.isVisible().catch(() => false)) {
    await option.click({ force: true });
    await waitSettled(deps, page, 10000);
    return true;
  }

  return false;
}

async function chooseFirstOpenOption(deps: RegisterDeps, page: Page) {
  const options = page.locator('[role="option"], mat-option, .mat-option, .mat-mdc-option, ion-select-popover ion-item, .popover-content ion-item');
  const count = await options.count().catch(() => 0);

  for (let index = 0; index < count; index++) {
    const option = options.nth(index);
    const text = (await option.innerText().catch(() => "")).trim();
    if (text) {
      await option.click({ force: true });
      await waitSettled(deps, page, 10000);
      return true;
    }
  }

  return false;
}

async function selectByText(deps: RegisterDeps, page: Page, label: string, optionText: string) {
  await openSelect(page, label);
  const selected = await chooseOpenOption(deps, page, optionText);
  if (!selected) {
    const visibleOptions = await page
      .locator('[role="option"], mat-option, .mat-option, .mat-mdc-option, ion-select-popover ion-item, .popover-content ion-item')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).innerText || node.textContent || ""))
      .catch(() => [] as string[]);
    throw new Error("Opção não encontrada em " + label + ": " + optionText + ". Opções: " + visibleOptions.join(" | "));
  }
}

async function selectVendedorIfNeeded(deps: RegisterDeps, page: Page) {
  const vendedorField = page.locator("mat-form-field").filter({ hasText: /Vendedor/i }).first();
  if (!(await vendedorField.isVisible().catch(() => false))) return;

  const className = await vendedorField.getAttribute("class").catch(() => "");
  const ariaDisabled = await vendedorField.locator('[aria-disabled="true"]').first().isVisible().catch(() => false);
  if (String(className || "").includes("disabled") || ariaDisabled) return;

  await openSelect(page, "Vendedor").catch(() => null);

  const preferred = optionalEnv("MAGGI_AVAILABLE_GROUPS_VENDEDOR_TEXT");
  if (preferred && (await chooseOpenOption(deps, page, preferred))) return;

  await chooseFirstOpenOption(deps, page).catch(() => null);
}

async function clickContinue(deps: RegisterDeps, page: Page) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const button = page.locator('button:has-text("CONTINUAR"), ion-button:has-text("CONTINUAR")').first();
    if (await button.isVisible().catch(() => false)) {
      const disabled = await button.getAttribute("disabled").catch(() => null);
      const ariaDisabled = await button.getAttribute("aria-disabled").catch(() => null);
      const className = await button.getAttribute("class").catch(() => "");
      if (disabled === null && ariaDisabled !== "true" && !String(className || "").includes("disabled")) {
        await button.click({ force: true });
        await waitSettled(deps, page, 20000);
        return;
      }
    }
    await page.waitForTimeout(500);
  }

  throw new Error("Botão CONTINUAR não habilitou na Maggi.");
}

async function selectSegment(deps: RegisterDeps, page: Page, segment: MaggiAvailableSegmentConfig) {
  await goToSimulationHome(deps, page);
  deps.log("selecionando segmento Maggi", { segmento: segment.key });

  const segmentText = page.getByText(segment.label, { exact: true }).first();
  await segmentText.waitFor({ timeout: 30000 });
  await segmentText.click({ force: true });

  const clicked = await clickFirstVisibleSafe(deps, page, [
    'button:has-text("SIMULAR CONSÓRCIO")',
    'ion-button:has-text("SIMULAR CONSÓRCIO")',
  ]);

  if (!clicked) await clickText(page, "SIMULAR CONSÓRCIO", true);
  await waitSettled(deps, page, 20000);
}

async function selectRevendaAndContinue(deps: RegisterDeps, page: Page, segment: MaggiAvailableSegmentConfig) {
  await selectByText(deps, page, "Revenda", segment.revendaText);
  await selectVendedorIfNeeded(deps, page);
  await clickContinue(deps, page);
  await page.getByText("Grupo").first().waitFor({ timeout: 30000 }).catch(() => null);
}

async function collectOpenGroupOptions(page: Page) {
  const groups = new Set<string>();
  let stagnantRounds = 0;

  for (let round = 0; round < 60; round++) {
    const beforeSize = groups.size;

    const texts = await page
      .evaluate(() => {
        const selectors = [
          '[role="option"]',
          'mat-option',
          '.mat-option',
          '.mat-mdc-option',
          '.cdk-overlay-pane .mdc-list-item',
          'ion-select-popover ion-item',
          '.popover-content ion-item',
        ];
        const nodes = Array.from(document.querySelectorAll(selectors.join(",")));
        return nodes.map((node) => ((node as HTMLElement).innerText || node.textContent || "").replace(/\s+/g, " ").trim());
      })
      .catch(() => [] as string[]);

    for (const text of texts) {
      const group = normalizeGroupCode(text);
      if (group) groups.add(group);
    }

    const scrollInfo = await page
      .evaluate(() => {
        const selectors = [
          '.cdk-overlay-pane [role="listbox"]',
          '.mat-select-panel',
          '.mat-mdc-select-panel',
          '.cdk-overlay-pane',
          '[role="listbox"]',
          'ion-select-popover',
          '.popover-content',
        ];
        const candidates = Array.from(document.querySelectorAll(selectors.join(","))) as HTMLElement[];
        const scrollable = candidates.find((el) => el.scrollHeight > el.clientHeight + 8) || (document.scrollingElement as HTMLElement | null) || document.body;
        const before = scrollable.scrollTop;
        const max = Math.max(0, scrollable.scrollHeight - scrollable.clientHeight);
        scrollable.scrollTop = Math.min(max, before + Math.max(160, scrollable.clientHeight * 0.85));
        return { before, after: scrollable.scrollTop, max };
      })
      .catch(() => ({ before: 0, after: 0, max: 0 }));

    await page.waitForTimeout(450);
    await page.keyboard.press("PageDown").catch(() => null);
    await page.waitForTimeout(250);

    const moved = Math.abs(Number(scrollInfo.after || 0) - Number(scrollInfo.before || 0)) > 2;
    const grew = groups.size > beforeSize;
    const atEnd = Number(scrollInfo.after || 0) >= Number(scrollInfo.max || 0) - 2;

    if (!grew && (!moved || atEnd)) stagnantRounds += 1;
    else stagnantRounds = 0;

    if (stagnantRounds >= 3) break;
  }

  await page.keyboard.press("Escape").catch(() => null);
  return Array.from(groups).sort((a, b) => Number(a) - Number(b));
}

async function readGroupsForSegment(deps: RegisterDeps, page: Page, segment: MaggiAvailableSegmentConfig) {
  await selectSegment(deps, page, segment);
  await selectRevendaAndContinue(deps, page, segment);
  await openSelect(page, "Grupo");

  const groups = await collectOpenGroupOptions(page);
  if (!groups.length) throw new Error("Nenhum grupo listado para o segmento Maggi " + segment.key + ".");

  deps.log("grupos Maggi lidos", { segmento: segment.key, grupos: groups });
  return groups;
}

function mergeConfig(existingConfig: any, patch: Record<string, any>) {
  const base = existingConfig && typeof existingConfig === "object" && !Array.isArray(existingConfig) ? existingConfig : {};
  return { ...base, ...patch };
}

async function upsertAvailableGroups(deps: RegisterDeps, groupsBySegment: Partial<Record<MaggiAvailableSegmentKey, string[]>>) {
  let created = 0;
  let updated = 0;
  let deactivated = 0;
  const now = new Date().toISOString();
  const segments = Object.keys(groupsBySegment) as MaggiAvailableSegmentKey[];

  const { data: existingRows, error: existingErr } = await deps.supabase
    .from("sim_maggi_groups")
    .select("id, grupo, segmento, config, is_active")
    .in("segmento", segments);

  if (existingErr) throw existingErr;

  const existingMap = new Map<string, any>();
  for (const row of existingRows || []) existingMap.set(String(row.segmento || "") + ":" + String(row.grupo || ""), row);

  const activeKeys = new Set<string>();

  for (const segmento of segments) {
    for (const grupo of groupsBySegment[segmento] || []) {
      const key = segmento + ":" + grupo;
      activeKeys.add(key);
      const existing = existingMap.get(key);
      const existingConfig = existing?.config && typeof existing.config === "object" ? existing.config : {};
      const hasDetails = Array.isArray(existingConfig?.creditRanges) && existingConfig.creditRanges.length > 0;
      const configPatch = {
        source: existingConfig?.source || "maggi-available-groups-worker",
        availableGroupsSource: "maggi-available-groups-worker",
        availableGroupsSyncedAt: now,
        needsDetailsSync: !hasDetails,
      };

      if (existing?.id) {
        const { error } = await deps.supabase
          .from("sim_maggi_groups")
          .update({ is_active: true, config: mergeConfig(existingConfig, configPatch) })
          .eq("id", existing.id);
        if (error) throw error;
        updated += 1;
      } else {
        const { error } = await deps.supabase.from("sim_maggi_groups").insert({
          grupo,
          segmento,
          nome_grupo: "Grupo " + grupo,
          perfil_grupo: null,
          observacoes: "Importado pelo robô Maggi de grupos disponíveis",
          credito_min: 0,
          credito_max: 0,
          prazo_original: 0,
          prazo_restante: 0,
          taxa_adm_pct: 0,
          fundo_reserva_pct: 0,
          seguro_pct: 0,
          permite_lance_livre: true,
          permite_lance_embutido: true,
          permite_lance_fixo: false,
          lance_embutido_max_pct: 0,
          lance_fixo_pct: 0,
          regra_pos_contemplacao: "saldo_devedor_prazo_restante",
          is_active: true,
          config: {
            source: "maggi-available-groups-worker",
            availableGroupsSource: "maggi-available-groups-worker",
            availableGroupsSyncedAt: now,
            needsDetailsSync: true,
          },
        });
        if (error) throw error;
        created += 1;
      }
    }
  }

  for (const row of existingRows || []) {
    const segmento = String(row.segmento || "") as MaggiAvailableSegmentKey;
    if (!segments.includes(segmento)) continue;

    const key = segmento + ":" + String(row.grupo || "");
    if (row.is_active !== false && !activeKeys.has(key)) {
      const existingConfig = row?.config && typeof row.config === "object" ? row.config : {};
      const { error } = await deps.supabase
        .from("sim_maggi_groups")
        .update({
          is_active: false,
          config: mergeConfig(existingConfig, {
            availableGroupsSource: "maggi-available-groups-worker",
            availableGroupsSyncedAt: now,
            deactivatedBy: "maggi-available-groups-worker",
            deactivatedAt: now,
          }),
        })
        .eq("id", row.id);
      if (error) throw error;
      deactivated += 1;
    }
  }

  return { created, updated, deactivated };
}

async function syncMaggiAvailableGroups(deps: RegisterDeps, segments: MaggiAvailableSegmentKey[]): Promise<SyncResult> {
  let stage = "iniciando";
  let browser: Browser | null = null;
  const groupsBySegment: Partial<Record<MaggiAvailableSegmentKey, string[]>> = {};
  const readDetails: SyncResult["details"]["readDetails"] = [];

  try {
    stage = "abrindo navegador";
    browser = await deps.launchBrowser();
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
    const page = await context.newPage();

    stage = "login";
    await loginMaggi(deps, page);

    stage = "sincronização interna";
    await runInternalSync(deps, page);

    for (const segmento of segments) {
      stage = "lendo segmento " + segmento;
      const segment = SEGMENTS[segmento];
      const groups = await readGroupsForSegment(deps, page, segment);
      groupsBySegment[segmento] = groups;
      readDetails.push({ segmento, linhas: groups.length, grupos: groups.length });
    }

    stage = "gravando no Supabase";
    const { created, updated, deactivated } = await upsertAvailableGroups(deps, groupsBySegment);
    const found = Object.values(groupsBySegment).reduce((sum, groups) => sum + (groups?.length || 0), 0);

    await context.close().catch(() => null);

    return {
      ok: true,
      status: "synced",
      administradora: "maggi",
      found,
      created,
      updated,
      deactivated,
      message: "Grupos disponíveis Maggi sincronizados com sucesso.",
      details: { segments, groupsBySegment, readDetails },
    };
  } catch (error: any) {
    error.stage = error.stage || stage;
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => null);
  }
}

export function registerMaggiAvailableGroups(app: Express, deps: RegisterDeps) {
  async function handler(req: Request, res: any) {
    try {
      deps.assertAuthorized(req);
      const segments = parseSegments((req.body || {})?.segments || (req.body || {})?.segmentos || (req.body || {})?.segmento);
      const result = await syncMaggiAvailableGroups(deps, segments);
      return res.status(200).json(result);
    } catch (error: any) {
      const status = Number(error?.statusCode || 500);
      deps.log("erro na sincronização Maggi", {
        stage: error?.stage || "endpoint",
        error: error?.message || String(error),
      });
      return res.status(status).json({
        ok: false,
        status: "error",
        administradora: "maggi",
        error: error?.message || "Erro interno no worker Maggi.",
        stage: error?.stage || "endpoint",
      });
    }
  }

  app.post("/sync/maggi/available-groups", handler);
  app.post("/sync/maggi/groups", handler);
}
