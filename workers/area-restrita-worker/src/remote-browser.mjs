import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORTAL_URL = requiredEnv("AREA_RESTRITA_PORTAL_URL");
const USERNAME = requiredEnv("AREA_RESTRITA_USERNAME");
const PASSWORD = requiredEnv("AREA_RESTRITA_PASSWORD");
const DATA_DIR = path.resolve(process.env.AREA_RESTRITA_DATA_DIR || "/data");
const PROFILE_DIR = path.join(DATA_DIR, "chrome-profile");
const DOWNLOAD_DIR = path.join(DATA_DIR, "downloads");
const STATUS_FILE = path.join(DATA_DIR, "area-restrita-status.json");
const CHROME_BIN = process.env.AREA_RESTRITA_CHROME_BIN || "/usr/bin/google-chrome-stable";
const DEBUG_PORT = Number(process.env.AREA_RESTRITA_CHROME_DEBUG_PORT || 9222);
const LOGIN_PATH_PATTERN = /\/NewLogin\/NewLoginCMC\.asp(?:$|[?#])/i;
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;
const HOME_URL = new URL("/NewHome/HomePrincipal.asp", PORTAL_URL).href;

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

async function setStatus(state, details = {}) {
  const payload = {
    ok: true,
    service: "consulmax-area-restrita-worker",
    state,
    updatedAt: new Date().toISOString(),
    browser: "google-chrome-stable",
    ...details,
  };

  await fs.writeFile(STATUS_FILE, JSON.stringify(payload, null, 2));
  console.log(`[area-restrita] estado: ${state}`);
}

function isLoginUrl(url) {
  return LOGIN_PATH_PATTERN.test(String(url || ""));
}

async function getChromePages() {
  const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`Chrome DevTools respondeu HTTP ${response.status}`);
  const targets = await response.json();
  return Array.isArray(targets) ? targets.filter((target) => target?.type === "page") : [];
}

async function waitForChrome() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const pages = await getChromePages();
      if (pages.length > 0) return;
    } catch {
      // O Chrome ainda está inicializando.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("O Google Chrome não disponibilizou a interface local de diagnóstico.");
}

function choosePortalPage(pages) {
  return pages.find((page) => String(page.url() || "").startsWith(PORTAL_ORIGIN)) || pages[0] || null;
}

async function readLoginState(page) {
  return page.evaluate(() => {
    const bodyText = String(document.body?.innerText || "").replace(/\s+/g, " ").trim();
    const tokenElements = Array.from(document.querySelectorAll(
      'input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"], input[name*="turnstile" i], textarea[name*="turnstile" i]'
    ));
    const tokenLength = tokenElements.reduce((max, element) => {
      const value = String(element.value || element.getAttribute("value") || "");
      return Math.max(max, value.length);
    }, 0);

    return {
      tokenLength,
      usernameVisible: Boolean(document.querySelector('#login, input[name="login"]')),
      passwordVisible: Boolean(document.querySelector('#senha, input[name="senha"], input[type="password"]')),
      verificationFailed: /falha na verifica[cç][aã]o|verification failed|failure/i.test(bodyText),
      loginRejected: /(usu[aá]rio|senha).{0,40}(inv[aá]lid|incorret)|acesso negado|falha no login/i.test(bodyText),
    };
  }).catch(() => ({
    tokenLength: 0,
    usernameVisible: false,
    passwordVisible: false,
    verificationFailed: false,
    loginRejected: false,
  }));
}

async function submitStoredCredentials(page) {
  const usernameInput = page.locator('#login, input[name="login"]').first();
  const passwordInput = page.locator('#senha, input[name="senha"], input[type="password"]').first();
  const submitButton = page.locator('#btnSubmit, button:has-text("Entrar"), input[type="submit"]').first();

  await usernameInput.waitFor({ state: "visible", timeout: 15000 });
  await passwordInput.waitFor({ state: "visible", timeout: 15000 });

  // O preenchimento ocorre somente depois de a pessoa concluir o Turnstile.
  // fill() preserva exatamente maiúsculas, minúsculas e caracteres especiais.
  await usernameInput.fill(USERNAME);
  await passwordInput.fill(PASSWORD);

  await setStatus("submitting_login", {
    message: "Cloudflare validado. Enviando as credenciais armazenadas com a capitalização original.",
    currentUrl: page.url(),
    profileDirectory: PROFILE_DIR,
  });

  if (await submitButton.isVisible().catch(() => false)) {
    await submitButton.click();
  } else {
    await passwordInput.press("Enter");
  }
}

async function clickTotalMagnifier(page, context) {
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(1200);

  const discovery = await page.evaluate(() => {
    const normalize = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const rows = Array.from(document.querySelectorAll("tr"));
    const totalRow = rows.find((row) => {
      const cells = Array.from(row.querySelectorAll("td, th"));
      return cells.some((cell) => normalize(cell.textContent) === "total");
    });

    if (!totalRow) {
      return { found: false, reason: "total_row_not_found" };
    }

    const candidates = Array.from(totalRow.querySelectorAll(
      'a, button, input[type="image"], img'
    ));

    let target = candidates.find((element) => {
      const attributes = [
        element.getAttribute("alt"),
        element.getAttribute("title"),
        element.getAttribute("aria-label"),
        element.getAttribute("src"),
        element.getAttribute("href"),
        element.getAttribute("onclick"),
      ].filter(Boolean).join(" ");
      return /(lupa|zoom|search|consulta|detalhe|relatorio|inadimpl)/i.test(attributes);
    });

    if (!target && candidates.length > 0) {
      target = candidates[candidates.length - 1];
    }

    if (!target) {
      return { found: false, reason: "magnifier_not_found" };
    }

    if (target.tagName === "IMG") {
      target = target.closest("a, button") || target;
    }

    target.setAttribute("data-consulmax-total-magnifier", "true");
    return {
      found: true,
      tagName: target.tagName,
      rowText: String(totalRow.innerText || totalRow.textContent || "").replace(/\s+/g, " ").trim(),
    };
  }).catch((error) => ({
    found: false,
    reason: "page_evaluation_failed",
    error: String(error?.message || error),
  }));

  if (!discovery.found) return { clicked: false, ...discovery };

  const target = page.locator('[data-consulmax-total-magnifier="true"]').first();
  const pagesBefore = new Set(context.pages());
  const popupPromise = page.waitForEvent("popup", { timeout: 10000 }).catch(() => null);

  await target.scrollIntoViewIfNeeded().catch(() => null);
  await target.click({ force: true, timeout: 15000 });

  let popup = await popupPromise;
  if (!popup) {
    await page.waitForTimeout(1500);
    popup = context.pages().find((candidate) => !pagesBefore.has(candidate)) || null;
  }

  let popupUrl = null;
  if (popup) {
    await popup.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => null);
    popupUrl = popup.url() || null;
    await popup.close().catch(() => null);
  }

  return {
    clicked: true,
    popupOpened: Boolean(popup),
    popupUrl,
    rowText: discovery.rowText,
  };
}

async function isHomeOrDocumentsPage(page) {
  const url = String(page.url() || "");
  if (/\/NewHome\/HomePrincipal\.asp/i.test(url)) return true;

  return page.evaluate(() => {
    const normalize = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const text = normalize(document.body?.innerText || "");
    return text.includes("documentos (pdf)") || text.includes("documentos para download");
  }).catch(() => false);
}

async function markExactTextTarget(page, label, marker) {
  return page.evaluate(({ label, marker }) => {
    const normalize = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const expected = normalize(label);
    const selectors = "a, button, input, td, th, div, span, font";
    const candidates = Array.from(document.querySelectorAll(selectors))
      .filter((element) => {
        const value = element instanceof HTMLInputElement
          ? (element.value || element.getAttribute("aria-label") || element.getAttribute("title") || "")
          : (element.innerText || element.textContent || "");
        if (normalize(value) !== expected) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .sort((a, b) => {
        const clickable = (element) => element.matches('a, button, input, [onclick], [role="button"]') ? 0 : 1;
        return clickable(a) - clickable(b) || a.querySelectorAll("*").length - b.querySelectorAll("*").length;
      });

    if (candidates.length === 0) return { found: false, reason: "text_not_found" };

    const original = candidates[0];
    const target = original.closest('a, button, [onclick], [role="button"]') || original;
    target.setAttribute(marker, "true");

    return {
      found: true,
      tagName: target.tagName,
      text: String(original.innerText || original.textContent || "").replace(/\s+/g, " ").trim(),
      href: target.getAttribute("href"),
      onclick: target.getAttribute("onclick"),
    };
  }, { label, marker }).catch((error) => ({
    found: false,
    reason: "page_evaluation_failed",
    error: String(error?.message || error),
  }));
}

async function clickExactText(page, label, marker) {
  const discovery = await markExactTextTarget(page, label, marker);
  if (!discovery.found) return { clicked: false, ...discovery };

  const target = page.locator(`[${marker}="true"]`).first();
  await target.scrollIntoViewIfNeeded().catch(() => null);
  await target.click({ force: true, timeout: 15000 });
  return { clicked: true, ...discovery };
}

function safeDownloadName(name) {
  const cleaned = String(name || "tabela-de-precos.pdf")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "tabela-de-precos.pdf";
}

async function navigateToPriceTable(page, context) {
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(800);

  let workingPage = page;
  let documentsMenuVisible = await workingPage.getByText("Documentos (PDF)", { exact: true }).first()
    .isVisible().catch(() => false);
  let priceTableVisible = await workingPage.getByText("Tabela de Preços", { exact: true }).first()
    .isVisible().catch(() => false);

  if (!documentsMenuVisible && !priceTableVisible) {
    await workingPage.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await workingPage.waitForTimeout(1200);
    documentsMenuVisible = await workingPage.getByText("Documentos (PDF)", { exact: true }).first()
      .isVisible().catch(() => false);
    priceTableVisible = await workingPage.getByText("Tabela de Preços", { exact: true }).first()
      .isVisible().catch(() => false);
  }

  let documentsClick = null;
  if (!priceTableVisible) {
    documentsClick = await clickExactText(workingPage, "Documentos (PDF)", "data-consulmax-documents-pdf");
    if (!documentsClick.clicked) {
      return {
        opened: false,
        reason: "documents_pdf_not_found",
        documentsClick,
        currentUrl: workingPage.url(),
      };
    }

    await workingPage.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => null);
    await workingPage.waitForTimeout(1200);
  }

  const priceDiscovery = await markExactTextTarget(
    workingPage,
    "Tabela de Preços",
    "data-consulmax-price-table"
  );

  if (!priceDiscovery.found) {
    return {
      opened: false,
      reason: "price_table_not_found",
      documentsClick,
      priceDiscovery,
      currentUrl: workingPage.url(),
    };
  }

  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

  const pagesBefore = new Set(context.pages());
  const beforeUrl = workingPage.url();
  const popupPromise = workingPage.waitForEvent("popup", { timeout: 8000 }).catch(() => null);
  const downloadPromise = workingPage.waitForEvent("download", { timeout: 8000 }).catch(() => null);
  const target = workingPage.locator('[data-consulmax-price-table="true"]').first();

  await target.scrollIntoViewIfNeeded().catch(() => null);
  await target.click({ force: true, timeout: 15000 });

  const [popupEvent, download] = await Promise.all([popupPromise, downloadPromise]);
  let popup = popupEvent;

  if (!popup) {
    popup = context.pages().find((candidate) => !pagesBefore.has(candidate)) || null;
  }

  let downloadedPath = null;
  let suggestedFilename = null;
  if (download) {
    suggestedFilename = safeDownloadName(download.suggestedFilename());
    downloadedPath = path.join(DOWNLOAD_DIR, suggestedFilename);
    await download.saveAs(downloadedPath);
  }

  if (popup) {
    await popup.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => null);
    workingPage = popup;
  } else {
    await workingPage.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => null);
  }

  await workingPage.waitForTimeout(1200);

  const pageSummary = await workingPage.evaluate(() => ({
    title: document.title || null,
    bodyText: String(document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1800),
  })).catch(() => ({ title: null, bodyText: null }));

  return {
    opened: true,
    documentsClick,
    priceDiscovery,
    popupOpened: Boolean(popup),
    beforeUrl,
    resultUrl: workingPage.url() || null,
    urlChanged: beforeUrl !== workingPage.url(),
    downloadStarted: Boolean(download),
    suggestedFilename,
    downloadedPath,
    pageTitle: pageSummary.title,
    pageTextPreview: pageSummary.bodyText,
  };
}

async function monitorSession(chrome, browser) {
  let previousState = null;
  let previousUrl = null;
  let loginSubmitted = false;
  let loginSubmittedAt = 0;
  let totalMagnifierHandled = false;
  let priceTableHandled = false;

  while (chrome.exitCode === null) {
    try {
      const context = browser.contexts()[0];
      const page = context ? choosePortalPage(context.pages()) : null;
      const currentUrl = String(page?.url() || "");
      let state = "browser_ready";
      let message = "Google Chrome aberto e aguardando navegação.";
      let statusDetails = {};

      if (page && currentUrl.startsWith(PORTAL_ORIGIN) && isLoginUrl(currentUrl)) {
        totalMagnifierHandled = false;
        priceTableHandled = false;
        const loginState = await readLoginState(page);

        if (loginState.verificationFailed) {
          state = "cloudflare_rejected";
          message = "O Cloudflare recusou a tentativa. Atualize a página e valide novamente.";
        } else if (loginState.tokenLength >= 20 && loginState.usernameVisible && loginState.passwordVisible) {
          if (!loginSubmitted) {
            loginSubmitted = true;
            loginSubmittedAt = Date.now();
            await submitStoredCredentials(page);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }

          state = "submitting_login";
          message = "Cloudflare validado. Aguardando a confirmação do login.";

          if (loginState.loginRejected || Date.now() - loginSubmittedAt > 60000) {
            state = "login_not_confirmed";
            message = "O login não foi confirmado. Confira as credenciais cadastradas no Railway.";
          }
        } else {
          state = "waiting_cloudflare";
          message = "Marque 'Verify you are human'. Depois disso, o robô preencherá o login automaticamente.";
        }
      } else if (page && currentUrl.startsWith(PORTAL_ORIGIN)) {
        loginSubmitted = false;
        let canContinueToDocuments = totalMagnifierHandled;

        if (!totalMagnifierHandled) {
          if (await isHomeOrDocumentsPage(page)) {
            totalMagnifierHandled = true;
            canContinueToDocuments = true;
            statusDetails.totalStep = "skipped_session_already_past_attention";
          } else {
            const clickResult = await clickTotalMagnifier(page, context);
            if (clickResult.clicked) {
              totalMagnifierHandled = true;
              canContinueToDocuments = true;
              statusDetails = {
                popupOpened: clickResult.popupOpened,
                popupUrl: clickResult.popupUrl,
                totalRow: clickResult.rowText,
              };
            } else {
              state = "authenticated_waiting_total";
              message = "Sessão autenticada. Aguardando a tabela de inadimplência e a linha Total ficarem disponíveis.";
              statusDetails = {
                lookupReason: clickResult.reason,
              };
            }
          }
        }

        if (canContinueToDocuments && !priceTableHandled) {
          const navigationResult = await navigateToPriceTable(page, context);
          if (navigationResult.opened) {
            priceTableHandled = true;
            state = "price_table_opened";
            message = navigationResult.downloadStarted
              ? "Documentos (PDF) > Tabela de Preços acessado e arquivo salvo no volume."
              : "Documentos (PDF) > Tabela de Preços acessado. A tela resultante ficou aberta para o próximo mapeamento.";
            statusDetails = {
              ...statusDetails,
              priceTable: navigationResult,
            };
          } else {
            state = "authenticated_waiting_price_table";
            message = "Sessão autenticada. Tentando abrir Documentos (PDF) e Tabela de Preços.";
            statusDetails = {
              ...statusDetails,
              priceTableLookup: navigationResult,
            };
          }
        } else if (priceTableHandled) {
          state = "price_table_opened";
          message = "Tabela de Preços já foi acessada nesta execução.";
        }
      }

      if (state !== previousState || currentUrl !== previousUrl) {
        previousState = state;
        previousUrl = currentUrl;
        await setStatus(state, {
          message,
          currentUrl: currentUrl || null,
          profileDirectory: PROFILE_DIR,
          ...statusDetails,
        });
      }
    } catch (error) {
      if (previousState !== "browser_monitor_warning") {
        previousState = "browser_monitor_warning";
        await setStatus("browser_monitor_warning", {
          message: "O navegador está aberto, mas o monitor local não conseguiu consultar ou operar a guia atual.",
          error: String(error?.message || error),
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

async function main() {
  await fs.mkdir(PROFILE_DIR, { recursive: true });
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
  await setStatus("starting_browser", {
    message: "Iniciando Google Chrome estável em modo visível.",
    profileDirectory: PROFILE_DIR,
  });

  const chromeArgs = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-session-crashed-bubble",
    "--hide-crash-restore-bubble",
    "--start-maximized",
    "--window-size=1440,1000",
    `--user-data-dir=${PROFILE_DIR}`,
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${DEBUG_PORT}`,
    PORTAL_URL,
  ];

  const chrome = spawn(CHROME_BIN, chromeArgs, {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  });

  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`[area-restrita] encerrando Chrome por ${signal}`);
    chrome.kill("SIGTERM");
    setTimeout(() => chrome.kill("SIGKILL"), 10000).unref();
  };

  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  chrome.once("error", async (error) => {
    await setStatus("error", {
      error: `Não foi possível iniciar o Google Chrome: ${String(error?.message || error)}`,
    });
  });

  await waitForChrome();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
  await monitorSession(chrome, browser);

  const exitCode = await new Promise((resolve) => {
    if (chrome.exitCode !== null) return resolve(chrome.exitCode);
    chrome.once("exit", (code) => resolve(code));
  });

  if (!stopping && exitCode !== 0) {
    await setStatus("error", {
      error: `Google Chrome encerrou inesperadamente com código ${exitCode}.`,
    });
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  await setStatus("error", { error: String(error?.message || error) }).catch(() => null);
  console.error(`[area-restrita] falha no navegador: ${String(error?.message || error)}`);
  process.exit(1);
});
