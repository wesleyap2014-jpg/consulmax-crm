import type { VercelRequest, VercelResponse } from "@vercel/node";
import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium } from "playwright-core";

export const config = { maxDuration: 60 };

const CONVERT_LOGIN_URL = "https://www.convertmais.com.br/AdminConvertMais/ConvertMaisWeb/login/";
const USERNAME = String(process.env.CONVERT_ROBOT_USERNAME || "").trim();
const PASSWORD = String(process.env.CONVERT_ROBOT_PASSWORD || "");

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

function isExactDeploymentHost(req: VercelRequest) {
  const forwarded = String(req.headers["x-forwarded-host"] || "");
  const host = (forwarded || String(req.headers.host || "")).split(":")[0].toLowerCase();
  const deploymentHost = String(process.env.VERCEL_URL || "").split(":")[0].toLowerCase();
  return Boolean(deploymentHost) && host === deploymentHost;
}

async function bodyText(page: any) {
  return clean(await page.locator("body").innerText({ timeout: 5000 }).catch(() => ""));
}

function classifyMicrosoft(text: string) {
  if (/approve sign in request|aprovar solicita[cç][aã]o|authenticator|enter a code|insira um c[oó]digo|verifique sua identidade|verify your identity|help us protect your account|more information required/i.test(text)) {
    return "mfa_required";
  }
  if (/your account or password is incorrect|senha.*incorret|password.*incorrect|we couldn't sign you in|n[aã]o foi poss[ií]vel entrar/i.test(text)) {
    return "credentials_rejected";
  }
  return null;
}

async function clickVisible(page: any, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return true;
    }
  }
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  // Diagnóstico temporário: somente a URL única do deployment atual pode executar.
  // Aliases públicos e o domínio crm.consulmaxconsorcios.com.br recebem 404.
  if (!isExactDeploymentHost(req)) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }

  if (!USERNAME || !PASSWORD) {
    return res.status(200).json({
      ok: false,
      state: "credentials_not_configured",
      usernameConfigured: Boolean(USERNAME),
      passwordConfigured: Boolean(PASSWORD),
    });
  }

  let browser: any = null;
  let convertLoginStatus: number | null = null;
  let convertCallbackStatus: number | null = null;

  try {
    chromium.setGraphicsMode = false;
    const executablePath = await chromium.executablePath();

    browser = await playwrightChromium.launch({
      args: [
        ...chromium.args,
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--single-process",
      ],
      executablePath,
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      locale: "pt-BR",
    });
    const page = await context.newPage();

    page.on("response", (response: any) => {
      if (response.request().resourceType() !== "document") return;
      const url = response.url();
      if (!/convertmais\.com\.br\/AdminConvertMais\/ConvertMaisWeb\/login/i.test(url)) return;
      if (convertLoginStatus === null) convertLoginStatus = response.status();
      else convertCallbackStatus = response.status();
    });

    const initial = await page.goto(CONVERT_LOGIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    const initialText = await bodyText(page);
    if ((initial?.status() || 0) >= 400 || /access denied|acesso negado|forbidden|request rejected/i.test(initialText)) {
      return res.status(200).json({
        ok: false,
        state: "convert_access_denied_before_login",
        convertHttpStatus: initial?.status() || convertLoginStatus,
        finalUrl: safeUrl(page.url()),
      });
    }

    const convertEnter = page.getByText("Entrar", { exact: true }).first();
    if (!(await convertEnter.isVisible().catch(() => false))) {
      return res.status(200).json({
        ok: false,
        state: "convert_enter_not_found",
        convertHttpStatus: initial?.status() || convertLoginStatus,
        finalUrl: safeUrl(page.url()),
      });
    }

    await convertEnter.click();
    await page.waitForURL(/login\.microsoftonline\.com/i, { timeout: 20_000 }).catch(() => null);
    await page.waitForTimeout(800);

    const useAnother = page.getByText(/use another account|usar outra conta/i).first();
    if (await useAnother.isVisible().catch(() => false)) {
      await useAnother.click();
      await page.waitForTimeout(500);
    }

    const email = page.locator('input[type="email"], input[name="loginfmt"], #i0116').first();
    if (!(await email.isVisible().catch(() => false))) {
      return res.status(200).json({
        ok: false,
        state: "microsoft_email_field_not_found",
        finalUrl: safeUrl(page.url()),
      });
    }

    await email.fill(USERNAME);
    await clickVisible(page, ["#idSIButton9", 'input[type="submit"]', 'button[type="submit"]']);
    await page.waitForTimeout(900);

    let text = await bodyText(page);
    let classified = classifyMicrosoft(text);
    if (classified) {
      return res.status(200).json({ ok: false, state: classified, finalUrl: safeUrl(page.url()) });
    }

    const password = page.locator('input[type="password"], input[name="passwd"], #i0118').first();
    if (!(await password.isVisible().catch(() => false))) {
      return res.status(200).json({
        ok: false,
        state: "microsoft_password_field_not_found",
        finalUrl: safeUrl(page.url()),
      });
    }

    await password.fill(PASSWORD);
    await clickVisible(page, ["#idSIButton9", 'input[type="submit"]', 'button[type="submit"]']);

    for (let attempt = 0; attempt < 35; attempt += 1) {
      await page.waitForTimeout(700);
      text = await bodyText(page);
      classified = classifyMicrosoft(text);

      if (classified) {
        return res.status(200).json({ ok: false, state: classified, finalUrl: safeUrl(page.url()) });
      }

      if (/continuar conectado|stay signed in/i.test(text)) {
        const noButton = page.locator("#idBtn_Back").first();
        if (await noButton.isVisible().catch(() => false)) {
          await noButton.click();
          continue;
        }
      }

      const currentUrl = page.url();
      if (/convertmais\.com\.br/i.test(currentUrl)) {
        const denied = /access denied|acesso negado|forbidden|request rejected|not authorized/i.test(text);
        if (denied) {
          return res.status(200).json({
            ok: false,
            state: "returned_to_convert_access_denied",
            convertInitialHttpStatus: convertLoginStatus,
            convertCallbackHttpStatus: convertCallbackStatus,
            finalUrl: safeUrl(currentUrl),
          });
        }

        if (/\/AdminConvertMais\/ConvertMaisWeb\/home\/?/i.test(currentUrl)) {
          return res.status(200).json({
            ok: true,
            state: "convert_home_reached",
            convertInitialHttpStatus: convertLoginStatus,
            convertCallbackHttpStatus: convertCallbackStatus,
            finalUrl: safeUrl(currentUrl),
            title: clean(await page.title().catch(() => "")).slice(0, 120) || null,
          });
        }
      }
    }

    return res.status(200).json({
      ok: false,
      state: "login_flow_timeout",
      convertInitialHttpStatus: convertLoginStatus,
      convertCallbackHttpStatus: convertCallbackStatus,
      finalUrl: safeUrl(page.url()),
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      state: "vercel_browser_error",
      error: clean((error as Error)?.message || error).slice(0, 500),
    });
  } finally {
    await browser?.close().catch(() => null);
  }
}
