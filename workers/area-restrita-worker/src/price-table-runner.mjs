import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { syncActivePriceTables } from "./price-table-sync.mjs";

const DATA_DIR = path.resolve(process.env.AREA_RESTRITA_DATA_DIR || "/data");
const STATUS_FILE = path.join(DATA_DIR, "area-restrita-status.json");
const DEBUG_PORT = Number(process.env.AREA_RESTRITA_CHROME_DEBUG_PORT || 9222);
const PORTAL_URL = String(process.env.AREA_RESTRITA_PORTAL_URL || "").trim();
const PORTAL_ORIGIN = PORTAL_URL ? new URL(PORTAL_URL).origin : "";

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

async function priceEntryCount(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    return Array.from(document.querySelectorAll('a, button, [onclick], [role="button"]'))
      .filter((element) => {
        const label = normalize(element.innerText || element.textContent || element.getAttribute("title") || "");
        return label.includes("tabela") && /\bgrupo\s*0*\d{3,5}\b/.test(label);
      }).length;
  }).catch(() => 0);
}

async function waitForPriceList(browser) {
  const timeoutMs = Number(process.env.AREA_RESTRITA_PRICE_LIST_TIMEOUT_MS || 30 * 60 * 1000);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const url = String(page.url() || "");
        if (PORTAL_ORIGIN && !url.startsWith(PORTAL_ORIGIN)) continue;
        const count = await priceEntryCount(page);
        if (count > 0) return { context, page, count };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error("A lista de Tabelas de Preços não apareceu dentro do tempo limite.");
}

async function main() {
  const browser = await connectBrowser();
  try {
    await writeStatus(
      "waiting_price_tables",
      "Aguardando o portal listar as Tabelas de Preços dos grupos."
    );

    const { context, page, count } = await waitForPriceList(browser);
    await writeStatus(
      "price_tables_found",
      `${count} tabela(s) foram encontrada(s) no portal. Cruzando com os grupos ativos do Supabase.`,
      { portalPriceTables: count, currentUrl: page.url() }
    );

    const result = await syncActivePriceTables({
      page,
      context,
      onProgress: async ({ state, message, details }) => {
        await writeStatus(state, message, { syncProgress: details || {} });
      },
    });

    await writeStatus(
      "price_tables_synced",
      `${result.summary.updatedGroups} grupo(s) foram atualizados a partir das Tabelas de Preços.`,
      { priceTableSync: result }
    );
  } finally {
    await browser.close().catch(() => null);
  }
}

main().catch(async (error) => {
  const message = String(error?.message || error);
  await writeStatus("price_tables_error", message, { priceTableSyncError: message }).catch(() => null);
  console.error(`[area-restrita] falha na sincronização das tabelas: ${message}`);
  process.exitCode = 1;
});
