import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { syncActivePriceTables } from "./price-table-sync.mjs";

const DATA_DIR = path.resolve(process.env.AREA_RESTRITA_DATA_DIR || "/data");
const STATUS_FILE = path.join(DATA_DIR, "area-restrita-status.json");
const DEBUG_PORT = Number(process.env.AREA_RESTRITA_CHROME_DEBUG_PORT || 9222);
const PORTAL_URL = String(process.env.AREA_RESTRITA_PORTAL_URL || "").trim();
const PORTAL_ORIGIN = PORTAL_URL ? new URL(PORTAL_URL).origin : "";
const LOGIN_PATH_PATTERN = /\/NewLogin\/NewLoginCMC\.asp(?:$|[?#])/i;

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

    const signatures = new Set();
    for (const element of document.querySelectorAll('a, button, [onclick], [role="button"]')) {
      const label = normalize(element.innerText || element.textContent || element.getAttribute("title") || "");
      if (!label.includes("tabela") || !/\bgrupo\s*0*\d{3,5}\b/.test(label)) continue;
      signatures.add(label);
    }
    return signatures.size;
  }).catch(() => 0);
}

async function pageNavigationSnapshot(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const visibleTexts = Array.from(document.querySelectorAll(
      'a, button, [onclick], [role="button"], td, th, span, div, font'
    )).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }).map((element) => normalize(
      element.innerText || element.textContent || element.getAttribute("title") || ""
    ));

    const bodyText = normalize(document.body?.innerText || "");
    return {
      bodyText,
      hasDocumentsMenu: visibleTexts.includes("documentos (pdf)"),
      hasPriceTable: visibleTexts.includes("tabela de precos"),
      hasLoginFields: Boolean(document.querySelector('#login, input[name="login"], #senha, input[name="senha"]')),
    };
  }).catch(() => ({
    bodyText: "",
    hasDocumentsMenu: false,
    hasPriceTable: false,
    hasLoginFields: false,
  }));
}

async function clickExactPortalText(page, label) {
  return page.evaluate((expectedLabel) => {
    const normalize = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const expected = normalize(expectedLabel);
    const elements = Array.from(document.querySelectorAll(
      'a, button, [onclick], [role="button"], td, th, span, div, font'
    ));

    const candidates = elements.filter((element) => {
      const label = normalize(element.innerText || element.textContent || element.getAttribute("title") || "");
      if (label !== expected) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }).sort((a, b) => {
      const clickable = (element) => element.matches('a, button, [onclick], [role="button"]') ? 0 : 1;
      return clickable(a) - clickable(b) || a.querySelectorAll("*").length - b.querySelectorAll("*").length;
    });

    const original = candidates[0] || null;
    if (!original) return { clicked: false, reason: "text_not_found" };

    const target = original.closest('a, button, [onclick], [role="button"]') || original;
    const result = {
      clicked: true,
      tagName: target.tagName,
      href: target.getAttribute("href"),
      onclick: target.getAttribute("onclick"),
    };
    target.click();
    return result;
  }, label).catch((error) => ({
    clicked: false,
    reason: "page_evaluation_failed",
    error: String(error?.message || error),
  }));
}

async function advanceAuthenticatedNavigation(page, actionHistory) {
  const url = String(page.url() || "");
  const snapshot = await pageNavigationSnapshot(page);

  if (LOGIN_PATH_PATTERN.test(url) || snapshot.hasLoginFields) {
    return { acted: false, reason: "login_page" };
  }

  const action = snapshot.hasPriceTable
    ? { label: "Tabela de Preços", state: "opening_price_tables" }
    : snapshot.hasDocumentsMenu
      ? { label: "Documentos (PDF)", state: "opening_documents" }
      : null;

  if (!action) return { acted: false, reason: "navigation_target_not_visible" };

  const key = `${url}|${action.label}`;
  const lastAttempt = actionHistory.get(key) || 0;
  if (Date.now() - lastAttempt < 5000) {
    return { acted: false, reason: "navigation_throttled", target: action.label };
  }
  actionHistory.set(key, Date.now());

  await writeStatus(
    action.state,
    action.label === "Documentos (PDF)"
      ? "A tela diária de inadimplência não apareceu. Abrindo Documentos (PDF) diretamente."
      : "Abrindo Tabela de Preços para listar os PDFs dos grupos.",
    { currentUrl: url, navigationTarget: action.label }
  );

  const result = await clickExactPortalText(page, action.label);
  if (result.clicked) {
    await page.waitForTimeout(1200);
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => null);
  }
  return { acted: result.clicked, target: action.label, result };
}

async function waitForPriceList(browser) {
  const timeoutMs = Number(process.env.AREA_RESTRITA_PRICE_LIST_TIMEOUT_MS || 30 * 60 * 1000);
  const startedAt = Date.now();
  const actionHistory = new Map();

  while (Date.now() - startedAt < timeoutMs) {
    for (const context of browser.contexts()) {
      const portalPages = context.pages()
        .filter((page) => !PORTAL_ORIGIN || String(page.url() || "").startsWith(PORTAL_ORIGIN))
        .sort((a, b) => {
          const score = (page) => {
            const url = String(page.url() || "");
            if (/HomePrincipal\.asp/i.test(url)) return 3;
            if (/Documento|Download/i.test(url)) return 4;
            if (LOGIN_PATH_PATTERN.test(url)) return 0;
            return 2;
          };
          return score(b) - score(a);
        });

      for (const page of portalPages) {
        const count = await priceEntryCount(page);
        if (count > 0) return { context, page, count };

        await advanceAuthenticatedNavigation(page, actionHistory);

        const countAfterNavigation = await priceEntryCount(page);
        if (countAfterNavigation > 0) return { context, page, count: countAfterNavigation };
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
