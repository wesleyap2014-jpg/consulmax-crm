import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const PORTAL_URL = requiredEnv("AREA_RESTRITA_PORTAL_URL");
const USERNAME = requiredEnv("AREA_RESTRITA_USERNAME");
const PASSWORD = requiredEnv("AREA_RESTRITA_PASSWORD");
const OUTPUT_DIR = path.resolve("artifacts/area-restrita-diagnostico");
const CLOUDFLARE_TIMEOUT_MS = Number(process.env.AREA_RESTRITA_CLOUDFLARE_TIMEOUT_MS || 120000);

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function redact(value) {
  let text = String(value ?? "");
  for (const secret of [USERNAME, PASSWORD]) {
    if (secret) text = text.split(secret).join("[REDACTED]");
  }
  return text;
}

async function waitSettled(page, timeout = 15000) {
  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => null);
  await page.waitForLoadState("networkidle", { timeout: Math.min(timeout, 8000) }).catch(() => null);
  await page.waitForTimeout(1000);
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  return null;
}

async function maskSensitiveInputs(page) {
  await page.evaluate(({ username, password }) => {
    for (const input of document.querySelectorAll("input")) {
      const value = String(input.value || "");
      if (input.type === "password" || value === username || value === password) input.value = "";
    }
  }, { username: USERNAME, password: PASSWORD }).catch(() => null);
}

async function saveScreenshot(page, filename) {
  await maskSensitiveInputs(page);
  await page.screenshot({ path: path.join(OUTPUT_DIR, filename), fullPage: true }).catch(() => null);
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
      bodyText: bodyText.slice(0, 3000),
      tokenLength,
      iframeCount,
      widgetCount,
      successText,
      detected: tokenElements.length > 0 || iframeCount > 0 || widgetCount > 0 || /cloudflare/i.test(bodyText),
    };
  });
}

async function waitForCloudflare(page) {
  const startedAt = Date.now();
  let lastState = await cloudflareState(page);

  while (Date.now() - startedAt < CLOUDFLARE_TIMEOUT_MS) {
    lastState = await cloudflareState(page);

    if (lastState.successText) {
      return { ready: true, signal: "texto_sucesso", ...lastState };
    }
    if (lastState.tokenLength >= 20) {
      return { ready: true, signal: "token_turnstile", ...lastState };
    }
    if (!lastState.detected && Date.now() - startedAt >= 5000) {
      return { ready: true, signal: "cloudflare_nao_detectado", ...lastState };
    }

    await page.waitForTimeout(1000);
  }

  return { ready: false, signal: "timeout_cloudflare", ...lastState };
}

async function collectLoginPage(page) {
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    visibleText: String(document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 5000),
    visibleInputs: Array.from(document.querySelectorAll("input"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => ({
        type: element.type || null,
        id: element.id || null,
        name: element.name || null,
        placeholder: element.placeholder || null,
        autocomplete: element.autocomplete || null,
      })),
    visibleButtons: Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]'))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        name: element.getAttribute("name"),
        text: String(element.innerText || element.value || element.textContent || "").replace(/\s+/g, " ").trim(),
      })),
  }));
}

function isLoginUrl(url) {
  return /\/NewLogin\/NewLoginCMC\.asp(?:$|[?#])/i.test(String(url));
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "pt-BR",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.dismiss().catch(() => null));

  const result = {
    startedAt: new Date().toISOString(),
    portalOrigin: new URL(PORTAL_URL).origin,
    cloudflareDetected: false,
    cloudflareReady: false,
    cloudflareSignal: null,
    loginAttempted: false,
    loginSucceeded: false,
    initialUrl: null,
    finalUrl: null,
    pageAfterLogin: null,
    error: null,
  };

  try {
    await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitSettled(page, 20000);
    result.initialUrl = page.url();
    await saveScreenshot(page, "01-tela-login.png");

    const cloudflare = await waitForCloudflare(page);
    result.cloudflareDetected = Boolean(cloudflare.detected);
    result.cloudflareReady = Boolean(cloudflare.ready);
    result.cloudflareSignal = cloudflare.signal;

    if (!cloudflare.ready) {
      throw new Error(`Cloudflare não concluiu dentro de ${Math.round(CLOUDFLARE_TIMEOUT_MS / 1000)} segundos.`);
    }

    await saveScreenshot(page, "02-cloudflare-pronto.png");

    const usernameInput = await firstVisible(page, [
      'input[autocomplete="username"]',
      'input[name*="usuario" i]',
      'input[id*="usuario" i]',
      'input[name*="user" i]',
      'input[id*="user" i]',
      'input[name*="login" i]',
      'input[id*="login" i]',
      'input[type="text"]',
      'input:not([type])',
    ]);
    const passwordInput = await firstVisible(page, [
      'input[autocomplete="current-password"]',
      'input[type="password"]',
      'input[name*="senha" i]',
      'input[id*="senha" i]',
      'input[name*="password" i]',
      'input[id*="password" i]',
    ]);

    if (!usernameInput || !passwordInput) {
      throw new Error(`Campos de login não encontrados. Usuário: ${Boolean(usernameInput)} | Senha: ${Boolean(passwordInput)}`);
    }

    await usernameInput.fill(USERNAME);
    await passwordInput.fill(PASSWORD);
    result.loginAttempted = true;

    const enterButton = page.getByRole("button", { name: /^entrar$/i }).first();
    const fallbackButton = await firstVisible(page, [
      'button:has-text("Entrar")',
      'input[type="submit"][value*="Entrar" i]',
      'button[type="submit"]',
      'input[type="submit"]',
    ]);

    if (await enterButton.isVisible().catch(() => false)) {
      await enterButton.click({ force: true });
    } else if (fallbackButton) {
      await fallbackButton.click({ force: true });
    } else {
      await passwordInput.press("Enter");
    }

    await Promise.race([
      page.waitForURL((url) => !isLoginUrl(url.href), { timeout: 45000 }),
      page.waitForLoadState("domcontentloaded", { timeout: 45000 }),
      page.waitForTimeout(45000),
    ]).catch(() => null);
    await waitSettled(page, 20000);
    await page.waitForTimeout(2000);

    result.finalUrl = page.url();
    result.pageAfterLogin = await collectLoginPage(page);

    const passwordStillVisible = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
    const bodyText = String(result.pageAfterLogin?.visibleText || "");
    const explicitError = /(usuário|usuario|senha).{0,30}(inválid|invalíd|incorret)|acesso negado|falha no login/i.test(bodyText);
    result.loginSucceeded = !isLoginUrl(result.finalUrl) && !passwordStillVisible && !explicitError;

    await saveScreenshot(page, result.loginSucceeded ? "03-login-sucesso.png" : "03-login-nao-confirmado.png");

    if (!result.loginSucceeded) {
      throw new Error(`Login não confirmado. URL final: ${result.finalUrl}`);
    }
  } catch (error) {
    result.error = redact(error?.message || String(error));
    result.finalUrl ||= page.url();
    result.pageAfterLogin ||= await collectLoginPage(page).catch(() => null);
    await saveScreenshot(page, "99-erro.png");
  } finally {
    result.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(OUTPUT_DIR, "diagnostico-login.json"), JSON.stringify(result, null, 2));

    const summary = [
      "# Teste de login — Área Restrita",
      "",
      `- Cloudflare detectado: ${result.cloudflareDetected ? "sim" : "não"}`,
      `- Cloudflare concluído: ${result.cloudflareReady ? "sim" : "não"}`,
      `- Sinal do Cloudflare: ${result.cloudflareSignal || "indisponível"}`,
      `- Login tentado: ${result.loginAttempted ? "sim" : "não"}`,
      `- Login confirmado: ${result.loginSucceeded ? "sim" : "não"}`,
      `- URL final: ${redact(result.finalUrl || "indisponível")}`,
      `- Erro: ${result.error || "nenhum"}`,
    ].join("\n");

    await fs.writeFile(path.join(OUTPUT_DIR, "resumo.md"), summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
    }

    await context.close().catch(() => null);
    await browser.close().catch(() => null);

    if (!result.loginSucceeded) process.exitCode = 1;
  }
}

await main();
