import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const PORTAL_URL = requiredEnv("AREA_RESTRITA_PORTAL_URL");
const USERNAME = requiredEnv("AREA_RESTRITA_USERNAME");
const PASSWORD = requiredEnv("AREA_RESTRITA_PASSWORD");
const DATA_DIR = path.resolve(process.env.AREA_RESTRITA_DATA_DIR || "/data");
const PROFILE_DIR = path.join(DATA_DIR, "chrome-profile");
const STATUS_FILE = path.join(DATA_DIR, "area-restrita-status.json");
const LOGIN_PATH_PATTERN = /\/NewLogin\/NewLoginCMC\.asp(?:$|[?#])/i;

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
    ...details,
  };
  await fs.writeFile(STATUS_FILE, JSON.stringify(payload, null, 2));
  console.log(`[area-restrita] estado: ${state}`);
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  return null;
}

function isLoginUrl(url) {
  return LOGIN_PATH_PATTERN.test(String(url || ""));
}

async function cloudflareState(page) {
  return page.evaluate(() => {
    const bodyText = String(document.body?.innerText || "").replace(/\s+/g, " ").trim();
    const tokenElements = Array.from(document.querySelectorAll(
      'input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"], input[name*="turnstile" i], textarea[name*="turnstile" i]'
    ));
    const tokenLength = tokenElements.reduce((max, element) => {
      const value = String(element.value || element.getAttribute("value") || "");
      return Math.max(max, value.length);
    }, 0);
    const iframeCount = document.querySelectorAll(
      'iframe[src*="challenges.cloudflare.com"], iframe[title*="cloudflare" i], iframe[title*="challenge" i]'
    ).length;
    const widgetCount = document.querySelectorAll('.cf-turnstile, [data-sitekey], [class*="turnstile" i]').length;
    const successText = /(^|\s)(sucesso!?|success!?)(\s|$)/i.test(bodyText);
    return {
      tokenLength,
      iframeCount,
      widgetCount,
      successText,
      detected: tokenElements.length > 0 || iframeCount > 0 || widgetCount > 0 || /cloudflare/i.test(bodyText),
    };
  }).catch(() => ({ tokenLength: 0, iframeCount: 0, widgetCount: 0, successText: false, detected: false }));
}

async function waitForHumanValidation(page) {
  const startedAt = Date.now();
  let announced = false;

  while (!page.isClosed()) {
    if (!isLoginUrl(page.url())) return "session_active";

    const state = await cloudflareState(page);
    if (state.successText || state.tokenLength >= 20) return "validated";

    if (!state.detected && Date.now() - startedAt >= 5000) return "not_required";

    if (!announced) {
      announced = true;
      await setStatus("waiting_cloudflare", {
        message: "Abra o navegador remoto e conclua a confirmação do Cloudflare.",
        currentUrl: page.url(),
      });
    }

    await page.waitForTimeout(1000);
  }

  throw new Error("A página foi fechada durante a validação do Cloudflare.");
}

async function submitLogin(page) {
  const usernameInput = await firstVisible(page, [
    '#login',
    'input[name="login"]',
    'input[autocomplete="username"]',
    'input[name*="usuario" i]',
    'input[id*="usuario" i]',
    'input[type="text"]',
  ]);
  const passwordInput = await firstVisible(page, [
    '#senha',
    'input[name="senha"]',
    'input[type="password"]',
    'input[autocomplete="current-password"]',
  ]);

  if (!usernameInput || !passwordInput) {
    throw new Error("Campos de usuário e senha não foram encontrados.");
  }

  await usernameInput.fill(USERNAME);
  await passwordInput.fill(PASSWORD);

  const enterButton = await firstVisible(page, [
    '#btnSubmit',
    'button:has-text("Entrar")',
    'input[type="submit"][value*="Entrar" i]',
    'button[type="submit"]',
    'input[type="submit"]',
  ]);

  await setStatus("submitting_login", { currentUrl: page.url() });

  if (enterButton) await enterButton.click();
  else await passwordInput.press("Enter");

  await Promise.race([
    page.waitForURL((url) => !isLoginUrl(url.href), { timeout: 60000 }),
    page.waitForTimeout(60000),
  ]).catch(() => null);

  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(2000);

  const passwordStillVisible = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
  if (isLoginUrl(page.url()) || passwordStillVisible) {
    throw new Error(`Login não confirmado. URL atual: ${page.url()}`);
  }
}

async function main() {
  await fs.mkdir(PROFILE_DIR, { recursive: true });
  await setStatus("starting_browser", { profileDirectory: PROFILE_DIR });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
    locale: "pt-BR",
    acceptDownloads: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--start-maximized",
      "--disable-gpu",
    ],
  });

  const page = context.pages()[0] || await context.newPage();
  page.on("dialog", (dialog) => dialog.dismiss().catch(() => null));

  try {
    await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);

    if (!isLoginUrl(page.url())) {
      await setStatus("authenticated", {
        message: "Sessão persistente reutilizada.",
        currentUrl: page.url(),
      });
    } else {
      const validation = await waitForHumanValidation(page);
      if (validation !== "session_active") await submitLogin(page);
      await setStatus("authenticated", {
        message: "Login confirmado. O perfil será preservado no volume.",
        currentUrl: page.url(),
      });
    }

    await new Promise((resolve) => context.on("close", resolve));
  } catch (error) {
    await setStatus("error", {
      error: String(error?.message || error),
      currentUrl: page.isClosed() ? null : page.url(),
    });
    throw error;
  } finally {
    await context.close().catch(() => null);
  }
}

main().catch((error) => {
  console.error(`[area-restrita] falha no navegador: ${String(error?.message || error)}`);
  process.exit(1);
});
