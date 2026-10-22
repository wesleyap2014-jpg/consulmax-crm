import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { checkMicrosoftLogin } from "../src/convert-microsoft-login-check.mjs";

const ENTRY_URL = String(
  process.env.CONVERT_PORTAL_URL
  || "https://www.convertmais.com.br/AdminConvertMais/ConvertMaisWeb/login"
).trim();
const USERNAME = String(process.env.CONVERT_ROBOT_USERNAME || "").trim();
const PASSWORD = String(process.env.CONVERT_ROBOT_PASSWORD || "");
const CHROME_BIN = process.env.AREA_RESTRITA_CHROME_BIN || "/usr/bin/google-chrome-stable";
const OUTPUT_PATH = String(
  process.env.CONVERT_POC_OUTPUT_PATH
  || "/artifacts/embracon-convert-poc.json"
).trim();

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

async function bodyText(page) {
  return clean(await page.locator("body").innerText({ timeout: 5000 }).catch(() => ""));
}

function classify(text) {
  if (/approve sign in request|aprovar solicita[cç][aã]o|authenticator|enter a code|insira um c[oó]digo|verifique sua identidade|verify your identity|help us protect your account|more information required/i.test(text)) {
    return "mfa_required";
  }
  if (/your account or password is incorrect|senha.*incorret|password.*incorrect|we couldn't sign you in|n[aã]o foi poss[ií]vel entrar/i.test(text)) {
    return "credentials_rejected";
  }
  if (/stay signed in|continuar conectado/i.test(text)) {
    return "stay_signed_in_prompt";
  }
  return null;
}

async function clickVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return true;
    }
  }
  return false;
}

async function maybeOpenMicrosoftLogin(page) {
  if (/login\.microsoftonline\.com/i.test(page.url())) return true;

  const direct = page.locator('a[href*="login.microsoftonline.com"], a[href*="microsoftonline.com"]').first();
  if (await direct.isVisible().catch(() => false)) {
    await direct.click();
    await page.waitForTimeout(1200);
    return /login\.microsoftonline\.com/i.test(page.url());
  }

  const buttons = [
    'button:has-text("Microsoft")',
    'a:has-text("Microsoft")',
    'button:has-text("Entrar")',
    'a:has-text("Entrar")',
    'button:has-text("Login")',
    'a:has-text("Login")',
  ];
  for (const selector of buttons) {
    const locator = page.locator(selector).first();
    if (!(await locator.isVisible().catch(() => false))) continue;
    await locator.click();
    for (let i = 0; i < 12; i += 1) {
      await page.waitForTimeout(500);
      if (/login\.microsoftonline\.com/i.test(page.url())) return true;
    }
  }

  return /login\.microsoftonline\.com/i.test(page.url());
}

async function writeResult(result) {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2));
}

async function main() {
  if (!USERNAME || !PASSWORD) {
    const result = {
      ok: false,
      state: "credentials_not_configured",
      checkedAt: new Date().toISOString(),
    };
    await writeResult(result);
    console.log("[embracon-poc] credentials_not_configured");
    process.exitCode = 2;
    return;
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: CHROME_BIN,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      locale: "pt-BR",
    });
    const page = await context.newPage();

    const first = await page.goto(ENTRY_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(1500);

    if ((first?.status() || 0) >= 500) {
      throw new Error(`Convert+ respondeu HTTP ${first?.status() || "desconhecido"}.`);
    }

    const microsoftReached = await maybeOpenMicrosoftLogin(page);
    if (!microsoftReached) {
      const text = await bodyText(page);
      const denied = /access denied|acesso negado|forbidden|request rejected|not authorized/i.test(text);
      if (denied) {
        await browser?.close().catch(() => null);
        browser = null;

        const fallback = await checkMicrosoftLogin();
        const result = {
          ...fallback,
          checkedAt: fallback.checkedAt || new Date().toISOString(),
          strategy: "direct_microsoft_oauth_fallback",
          initialConvertState: "convert_access_denied",
          finalUrl: safeUrl(fallback.finalUrl),
        };
        await writeResult(result);
        console.log(`[embracon-poc] ${result.state} strategy=${result.strategy}`);
        process.exitCode = result.state === "credentials_rejected" ? 4 : result.ok ? 0 : 3;
        return;
      }

      const result = {
        ok: false,
        state: "microsoft_login_not_reached",
        checkedAt: new Date().toISOString(),
        httpStatus: first?.status() || null,
        finalUrl: safeUrl(page.url()),
        strategy: "convert_entrypoint",
      };
      await writeResult(result);
      console.log(`[embracon-poc] ${result.state}`);
      process.exitCode = 3;
      return;
    }

    const another = page.getByText(/use another account|usar outra conta/i).first();
    if (await another.isVisible().catch(() => false)) {
      await another.click();
      await page.waitForTimeout(800);
    }

    const email = page.locator('input[type="email"], input[name="loginfmt"], #i0116').first();
    if (await email.isVisible().catch(() => false)) {
      await email.fill(USERNAME);
      await clickVisible(page, ["#idSIButton9", 'input[type="submit"]', 'button[type="submit"]']);
      await page.waitForTimeout(1500);
    }

    let text = await bodyText(page);
    let state = classify(text);
    if (state === "mfa_required" || state === "credentials_rejected") {
      const result = {
        ok: state === "mfa_required",
        state,
        checkedAt: new Date().toISOString(),
        finalUrl: safeUrl(page.url()),
      };
      await writeResult(result);
      console.log(`[embracon-poc] ${state}`);
      process.exitCode = state === "credentials_rejected" ? 4 : 0;
      return;
    }

    const password = page.locator('input[type="password"], input[name="passwd"], #i0118').first();
    if (!(await password.isVisible().catch(() => false))) {
      const result = {
        ok: false,
        state: "password_field_not_found",
        checkedAt: new Date().toISOString(),
        finalUrl: safeUrl(page.url()),
      };
      await writeResult(result);
      console.log("[embracon-poc] password_field_not_found");
      process.exitCode = 5;
      return;
    }

    await password.fill(PASSWORD);
    await clickVisible(page, ["#idSIButton9", 'input[type="submit"]', 'button[type="submit"]']);

    for (let attempt = 0; attempt < 35; attempt += 1) {
      await page.waitForTimeout(1000);
      const current = page.url();
      text = await bodyText(page);
      state = classify(text);

      if (state === "stay_signed_in_prompt") {
        const no = page.locator("#idBtn_Back").first();
        if (await no.isVisible().catch(() => false)) {
          await no.click();
          continue;
        }
      }

      if (state === "mfa_required" || state === "credentials_rejected") {
        const result = {
          ok: state === "mfa_required",
          state,
          checkedAt: new Date().toISOString(),
          finalUrl: safeUrl(current),
        };
        await writeResult(result);
        console.log(`[embracon-poc] ${state}`);
        process.exitCode = state === "credentials_rejected" ? 6 : 0;
        return;
      }

      if (/convertmais\.com\.br/i.test(current)) {
        const denied = /access denied|acesso negado|forbidden|request rejected|not authorized/i.test(text);
        const result = {
          ok: !denied,
          state: denied ? "returned_to_convert_access_denied" : "returned_to_convert",
          checkedAt: new Date().toISOString(),
          finalUrl: safeUrl(current),
          pageTitle: clean(await page.title().catch(() => "")) || null,
        };
        await writeResult(result);
        console.log(`[embracon-poc] ${result.state}`);
        process.exitCode = denied ? 7 : 0;
        return;
      }
    }

    const result = {
      ok: false,
      state: "login_flow_timeout",
      checkedAt: new Date().toISOString(),
      finalUrl: safeUrl(page.url()),
    };
    await writeResult(result);
    console.log("[embracon-poc] login_flow_timeout");
    process.exitCode = 8;
  } catch (error) {
    const result = {
      ok: false,
      state: "poc_error",
      checkedAt: new Date().toISOString(),
      error: clean(error?.message || error).slice(0, 500),
    };
    await writeResult(result).catch(() => null);
    console.error(`[embracon-poc] poc_error: ${result.error}`);
    process.exitCode = 9;
  } finally {
    await browser?.close().catch(() => null);
  }
}

await main();
