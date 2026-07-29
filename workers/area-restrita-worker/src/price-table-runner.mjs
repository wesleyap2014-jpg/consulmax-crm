import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createPortalNavigation } from "./frame-navigation.mjs";
import { syncActivePriceTablesDirect } from "./price-table-sync-direct.mjs";
import { syncLatestAssemblyResults } from "./assembly-result-sync.mjs";

const DATA_DIR = path.resolve(process.env.AREA_RESTRITA_DATA_DIR || "/data");
const STATUS_FILE = path.join(DATA_DIR, "area-restrita-status.json");
const DEBUG_PORT = Number(process.env.AREA_RESTRITA_CHROME_DEBUG_PORT || 9222);
const PORTAL_URL = String(process.env.AREA_RESTRITA_PORTAL_URL || "").trim();
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;
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

async function waitForAuthenticatedContext(browser) {
  const timeoutMs = Number(process.env.AREA_RESTRITA_PRICE_LIST_TIMEOUT_MS || 30 * 60 * 1000);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const url = String(page.url() || "");
        if (!url.startsWith(PORTAL_ORIGIN) || LOGIN_PATH_PATTERN.test(url)) continue;

        const hasLoginFields = await page.evaluate(() => Boolean(
          document.querySelector('#login, input[name="login"], #senha, input[name="senha"]')
        )).catch(() => true);
        if (hasLoginFields) continue;

        const readyRoute = /\/NewHome\/HomePrincipal\.asp|\/NewHome\/Home\.asp|\/NewDocumentos\//i.test(url);
        if (readyRoute) return { context, mainPage: page };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error("A sessão autenticada da Área Restrita não ficou disponível dentro do tempo limite.");
}

async function openDedicatedPricePage(context) {
  const existing = context.pages().find((page) => /\/NewDocumentos\/DocumentoLista\.asp/i.test(String(page.url() || "")));
  const page = existing || await context.newPage();

  if (!/\/NewDocumentos\/DocumentoLista\.asp/i.test(String(page.url() || ""))) {
    await page.goto(navigation.documentsUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  }

  const expandResult = await navigation.expandPriceTables(page);
  const count = await navigation.countVisiblePriceTables(page);
  if (!expandResult.expanded || count <= 0) {
    throw new Error(`A lista de Tabelas de Preços não foi expandida. Motivo: ${expandResult.reason || "sem entradas visíveis"}.`);
  }

  return { page, count, expandResult };
}

async function main() {
  const browser = await connectBrowser();

  await writeStatus(
    "waiting_price_tables",
    "Aguardando o login para iniciar a leitura direta dos PDFs em uma guia separada."
  );

  const { context, mainPage } = await waitForAuthenticatedContext(browser);
  const { page: workerPage, count, expandResult } = await openDedicatedPricePage(context);

  await writeStatus(
    "price_tables_found",
    `${count} tabela(s) foram encontrada(s). A leitura ocorrerá em uma guia dedicada, sem interferir na página principal.`,
    {
      portalPriceTables: count,
      mainPageUrl: mainPage.url(),
      workerPageUrl: workerPage.url(),
      navigationMode: "dedicated_direct_document_page",
      expandResult,
    }
  );

  const result = await syncActivePriceTablesDirect({
    page: workerPage,
    context,
    onProgress: async ({ state, message, details }) => {
      await writeStatus(state, message, {
        syncProgress: details || {},
        workerPageUrl: workerPage.url(),
      });
    },
  });

  const assemblyResult = await syncLatestAssemblyResults({
    page: workerPage,
    onProgress: async ({ state, message, details }) => {
      await writeStatus(state, message, {
        syncProgress: details || {},
        workerPageUrl: workerPage.url(),
      });
    },
  });

  await workerPage.goto(navigation.documentsUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
  await navigation.expandPriceTables(workerPage).catch(() => null);

  await writeStatus(
    "price_tables_synced",
    `${result.summary.updatedGroups} grupo(s) foram atualizados pelos PDFs e ${assemblyResult.summary.updatedGroups} tiveram a assembleia mais recente analisada.`,
    {
      priceTableSync: result,
      assemblyResultSync: assemblyResult,
      browserKeptOpen: true,
      mainPageUrl: mainPage.url(),
      workerPageUrl: workerPage.url(),
      syncProgress: {
        position: Number(result?.summary?.selectedEntries || 0),
        total: Number(result?.summary?.selectedEntries || 0),
        assemblyPosition: Number(assemblyResult?.summary?.totalGroups || 0),
        assemblyTotal: Number(assemblyResult?.summary?.totalGroups || 0),
        running: false,
      },
    }
  );

  // A conexão CDP e as guias permanecem abertas. O runner encerra apenas a sua
  // própria execução; o Chrome visível continua sob responsabilidade do worker.
}

main().catch(async (error) => {
  const message = String(error?.message || error);
  await writeStatus("price_tables_error", message, { priceTableSyncError: message }).catch(() => null);
  console.error(`[area-restrita] falha na sincronização das tabelas: ${message}`);
  process.exitCode = 1;
});