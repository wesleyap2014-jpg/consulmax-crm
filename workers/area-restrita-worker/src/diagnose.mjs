import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const PORTAL_URL = requiredEnv("AREA_RESTRITA_PORTAL_URL");
const USERNAME = requiredEnv("AREA_RESTRITA_USERNAME");
const PASSWORD = requiredEnv("AREA_RESTRITA_PASSWORD");
const OUTPUT_DIR = path.resolve("artifacts/area-restrita-diagnostico");

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

async function collectDiagnostics(page) {
  const data = await page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const text = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();

    return {
      url: location.href,
      title: document.title,
      headings: Array.from(document.querySelectorAll("h1,h2,h3,h4"))
        .filter(visible)
        .map((el) => text(el))
        .filter(Boolean)
        .slice(0, 80),
      forms: Array.from(document.querySelectorAll("form")).map((form) => ({
        id: form.id || null,
        name: form.getAttribute("name"),
        method: form.getAttribute("method"),
        action: form.getAttribute("action"),
      })),
      inputs: Array.from(document.querySelectorAll("input,select,textarea"))
        .filter(visible)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type"),
          id: el.id || null,
          name: el.getAttribute("name"),
          placeholder: el.getAttribute("placeholder"),
          autocomplete: el.getAttribute("autocomplete"),
          ariaLabel: el.getAttribute("aria-label"),
          required: el.hasAttribute("required"),
          disabled: el.disabled === true,
        }))
        .slice(0, 120),
      buttons: Array.from(document.querySelectorAll("button,input[type=submit],input[type=button],[role=button]"))
        .filter(visible)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type"),
          id: el.id || null,
          name: el.getAttribute("name"),
          text: text(el) || el.getAttribute("value") || "",
          ariaLabel: el.getAttribute("aria-label"),
          disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
        }))
        .slice(0, 150),
      links: Array.from(document.querySelectorAll("a[href]"))
        .filter(visible)
        .map((el) => ({ text: text(el), href: el.href }))
        .slice(0, 250),
      visibleText: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 20000),
    };
  });

  return JSON.parse(redact(JSON.stringify(data)));
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

async function dismissCommonBanners(page) {
  const labels = [/aceitar/i, /aceito/i, /entendi/i, /continuar/i, /fechar/i];
  for (const label of labels) {
    const button = page.getByRole("button", { name: label }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ force: true }).catch(() => null);
      await page.waitForTimeout(400);
    }
  }
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "pt-BR", acceptDownloads: true });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.dismiss().catch(() => null));

  const result = {
    startedAt: new Date().toISOString(),
    portalOrigin: new URL(PORTAL_URL).origin,
    loginAttempted: false,
    loginLikelySucceeded: false,
    beforeLogin: null,
    afterLogin: null,
    error: null,
  };

  try {
    await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitSettled(page, 20000);
    await dismissCommonBanners(page);
    result.beforeLogin = await collectDiagnostics(page);
    await saveScreenshot(page, "01-entrada.png");

    const usernameInput = await firstVisible(page, [
      'input[autocomplete="username"]',
      'input[type="email"]',
      'input[name*="usuario" i]',
      'input[name*="user" i]',
      'input[name*="login" i]',
      'input[name*="email" i]',
      'input[name*="cpf" i]',
      'input[name*="cnpj" i]',
      'input[id*="usuario" i]',
      'input[id*="user" i]',
      'input[id*="login" i]',
      'input[id*="email" i]',
      'input[placeholder*="usuário" i]',
      'input[placeholder*="usuario" i]',
      'input[placeholder*="login" i]',
      'input[placeholder*="email" i]',
      'input[placeholder*="cpf" i]',
      'input[type="text"]',
      'input:not([type])',
    ]);
    const passwordInput = await firstVisible(page, [
      'input[autocomplete="current-password"]',
      'input[type="password"]',
      'input[name*="senha" i]',
      'input[name*="password" i]',
      'input[id*="senha" i]',
      'input[id*="password" i]',
    ]);

    if (!usernameInput || !passwordInput) {
      throw new Error(`Campos de login não encontrados. Usuário: ${Boolean(usernameInput)} | Senha: ${Boolean(passwordInput)}`);
    }

    await usernameInput.fill(USERNAME);
    await passwordInput.fill(PASSWORD);
    result.loginAttempted = true;

    const initialUrl = page.url();
    const submit = await firstVisible(page, [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Entrar")',
      'button:has-text("Acessar")',
      'button:has-text("Login")',
      '[role="button"]:has-text("Entrar")',
      '[role="button"]:has-text("Acessar")',
    ]);

    if (submit) {
      await submit.click({ force: true });
    } else {
      await passwordInput.press("Enter");
    }

    await waitSettled(page, 30000);
    await page.waitForTimeout(3000);
    await dismissCommonBanners(page);

    const passwordStillVisible = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const hasAuthenticatedSignal = /(sair|logout|painel|dashboard|documentos|relatórios|relatorios|downloads|área do cliente|area do cliente)/i.test(bodyText);
    result.loginLikelySucceeded = page.url() !== initialUrl || !passwordStillVisible || hasAuthenticatedSignal;
    result.afterLogin = await collectDiagnostics(page);
    await saveScreenshot(page, "02-pos-login.png");
  } catch (error) {
    result.error = redact(error?.message || String(error));
    result.afterLogin = await collectDiagnostics(page).catch(() => null);
    await saveScreenshot(page, "99-erro.png");
  } finally {
    result.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(OUTPUT_DIR, "diagnostico.json"), JSON.stringify(result, null, 2));
    const summary = [
      "# Diagnóstico da Área Restrita",
      "",
      `- Login tentado: ${result.loginAttempted ? "sim" : "não"}`,
      `- Login provavelmente concluído: ${result.loginLikelySucceeded ? "sim" : "não"}`,
      `- URL final: ${redact(result.afterLogin?.url || result.beforeLogin?.url || "indisponível")}`,
      `- Erro: ${result.error || "nenhum"}`,
    ].join("\n");
    await fs.writeFile(path.join(OUTPUT_DIR, "resumo.md"), summary);
    if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
    await context.close().catch(() => null);
    await browser.close().catch(() => null);
  }
}

await main();
