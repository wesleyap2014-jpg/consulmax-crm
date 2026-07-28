import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createPortalNavigation } from "./frame-navigation.mjs";
import { syncActivePriceTables } from "./price-table-sync.mjs";

const DATA_DIR = path.resolve(process.env.AREA_RESTRITA_DATA_DIR || "/data");
const STATUS_FILE = path.join(DATA_DIR, "area-restrita-status.json");
const DEBUG_PORT = Number(process.env.AREA_RESTRITA_CHROME_DEBUG_PORT || 9222);
const PORTAL_URL = String(process.env.AREA_RESTRITA_PORTAL_URL || "").trim();
const PORTAL_ORIGIN = PORTAL_URL ? new URL(PORTAL_URL).origin : "";
const LOGIN_PATH_PATTERN = /\/NewLogin\/NewLoginCMC\.asp(?:$|[?#])/i;
const navigation = createPortalNavigation(PORTAL_URL);

async function writeStatus(state, message, details = {}) {
  let previous = {};
  try {
    previous = JSON.parse(await fs.readFile(STATUS_FILE, "utf8"));
  } catch {
    previous = {};
  }

  const payload = {
    ...previous,
    ok: true,
    service: "consulmax-area-restrita-worker",
    state,
    message,
    updatedAt: new Date().toISOString(),
    ...details,
  };
  await fs.writeFile(STATUS_FILE, JSON.stringify(payload, null, 2));
  console.log(`[area-restrita] ${state}: ${message}`);
}

async function connectBrowser() {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("O runner não conseguiu conectar ao Google Chrome.");
}

function rankPortalPage(page) {
  const url = String(page.url() || "");
  if (/\/NewDocumentos\/DocumentoLista\.asp/i.test(url)) return 5;
  if (/\/NewHome\/HomePrincipal\.asp/i.test(url)) return 4;
  if (/\/NewHome\/Home\.asp/i.test(url)) return 3;
  if (LOGIN_PATH_PATTERN.test(url)) return 0;
  return 2;
}

async function preparePriceTablePage(page, attemptHistory) {
  const currentUrl = String(page.url() || "");
  if (!currentUrl.startsWith(PORTAL_ORIGIN) || LOGIN_PATH_PATTERN.test(currentUrl)) {
    return { ready: false, reason: "login_or_external_page" };
  }

  const throttleKey = `${currentUrl}|prepare-price-tables`;
  const lastAttempt = attemptHistory.get(throttleKey) || 0;
  if (Date.now() - lastAttempt < 5000) {
    return { ready: false, reason: "navigation_throttled" };
  }
  attemptHistory.set(throttleKey, Date.now());

  const countBefore = await navigation.countVisiblePriceTables(page);
  if (countBefore > 0) {
    return { ready: true, count: countBefore, currentUrl };
  }

  const documentsResult = await navigation.openDocumentsDirectly(page);
  if (!documentsResult.opened) {
    return {
      ready: false,
      reason: documentsResult.reason || "documents_not_opened",
      documentsResult,
    };
  }

  await writeStatus(
    "opening_documents",
    "Sessão autenticada. Abrindo a página de Documentos (PDF) diretamente, sem depender do frameset.",
    {
      navigationMode: "direct_document_url",
      documentsUrl: navigation.documentsUrl,
      documentsResult,
    }
  );

  const expandResult = await navigation.expandPriceTables(page);
  if (!expandResult.expanded) {
    return {
      ready: false,
      reason: expandResult.reason || "price_tables_not_expanded",
      documentsResult,
      expandResult,
    };
  }

  await writeStatus(
    "opening_price_tables",
    "Documentos (PDF) aberto. Expandindo Tabela de Preços pelo comando do próprio portal.",
    {
      navigationMode: "slideonlyone_4",
      currentUrl: page.url(),
      expandResult,
    }
  );

  const countAfter = await navigation.countVisiblePriceTables(page);
  return {
    ready: countAfter > 0,
    count: countAfter,
    currentUrl: page.url(),
    documentsResult,
    expandResult,
    reason: countAfter > 0 ? null : "price_entries_not_visible_after_expand",
  };
}

async function waitForPriceList(browser) {
  const timeoutMs = Number(process.env.AREA_RESTRITA_PRICE_LIST_TIMEOUT_MS || 30 * 60 * 1000);
  const startedAt = Date.now();
  const attemptHistory = new Map();

  while (Date.now() - startedAt < timeoutMs) {
    for (const context of browser.contexts()) {
      const portalPages = context.pages()
        .filter((page) => !PORTAL_ORIGIN || String(page.url() || "").startsWith(PORTAL_ORIGIN))
        .sort((a, b) => rankPortalPage(b) - rankPortalPage(a));

      for (const page of portalPages) {
        const count = await navigation.countVisiblePriceTables(page);
        if (count > 0) return { context, page, count };

        const preparation = await preparePriceTablePage(page, attemptHistory);
        if (preparation.ready && preparation.count > 0) {
          return { context, page, count: preparation.count };
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error("A lista de Tabelas de Preços não apareceu dentro do tempo limite.");
}

async function main() {
  const browser = await connectBrowser();

  await writeStatus(
    "waiting_price_tables",
    "Aguardando a autenticação para abrir diretamente Documentos (PDF) e Tabela de Preços."
  );

  const { context, page, count } = await waitForPriceList(browser);
  await writeStatus(
    "price_tables_found",
    `${count} tabela(s) foram encontrada(s) no portal. Cruzando com os grupos ativos do Supabase.`,
    {
      portalPriceTables: count,
      currentUrl: page.url(),
      navigationMode: "direct_document_url",
    }
  );

  const result = await syncActivePriceTables({
    page,
    context,
    onProgress: async ({ state, message, details }) => {
      await writeStatus(state, message, { syncProgress: details || {} });
    },
  });

  await navigation.openDocumentsDirectly(page).catch(() => null);
  await navigation.expandPriceTables(page).catch(() => null);

  await writeStatus(
    "price_tables_synced",
    `${result.summary.updatedGroups} grupo(s) foram atualizados a partir das Tabelas de Preços.`,
    {
      priceTableSync: result,
      browserKeptOpen: true,
      currentUrl: page.url(),
    }
  );

  // Não usar browser.close(): a conexão é via CDP e fechar o Browser também
  // encerraria o Google Chrome visível, fazendo o supervisor reiniciá-lo na Home.
}

main().catch(async (error) => {
  const message = String(error?.message || error);
  await writeStatus("price_tables_error", message, { priceTableSyncError: message }).catch(() => null);
  console.error(`[area-restrita] falha na sincronização das tabelas: ${message}`);
  process.exitCode = 1;
});
