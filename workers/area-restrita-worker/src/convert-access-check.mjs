import { chromium } from "playwright";

const DEFAULT_PORTAL_URL = "https://www.convertmais.com.br/AdminConvertMais/ConvertMaisWeb/login/";
const CHROME_BIN = process.env.AREA_RESTRITA_CHROME_BIN || "/usr/bin/google-chrome-stable";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export async function checkConvertAccess(options = {}) {
  const portalUrl = String(options.portalUrl || process.env.CONVERT_ROBOT_PORTAL_URL || DEFAULT_PORTAL_URL).trim();
  const timeoutMs = Math.max(10_000, Number(options.timeoutMs || 45_000));
  let browser = null;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: CHROME_BIN,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-background-networking",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      locale: "pt-BR",
    });
    const page = await context.newPage();

    const response = await page.goto(portalUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page.waitForTimeout(1500);

    const snapshot = await page.evaluate(() => {
      const bodyText = String(document.body?.innerText || "").replace(/\s+/g, " ").trim();
      const inputs = Array.from(document.querySelectorAll("input")).map((input) => ({
        type: input.getAttribute("type") || "text",
        name: input.getAttribute("name") || null,
        id: input.id || null,
        placeholder: input.getAttribute("placeholder") || null,
        visible: Boolean(input.offsetWidth || input.offsetHeight || input.getClientRects().length),
      }));
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]')).map((button) => ({
        text: String(button.innerText || button.value || button.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 120),
        visible: Boolean(button.offsetWidth || button.offsetHeight || button.getClientRects().length),
      }));
      return {
        bodyText: bodyText.slice(0, 1000),
        inputs,
        buttons,
      };
    }).catch(() => ({ bodyText: "", inputs: [], buttons: [] }));

    const title = cleanText(await page.title().catch(() => ""));
    const finalUrl = page.url();
    const bodyText = cleanText(snapshot.bodyText);
    const accessDenied = /access denied|acesso negado|request rejected|forbidden|not authorized/i.test(`${title} ${bodyText}`);
    const loginDetected = snapshot.inputs.some((input) => input.visible && (
      input.type === "password" ||
      /user|usuario|usuário|login|email|cpf|senha|password/i.test(`${input.name || ""} ${input.id || ""} ${input.placeholder || ""}`)
    )) || snapshot.buttons.some((button) => button.visible && /entrar|login|acessar/i.test(button.text));

    const state = accessDenied
      ? "access_denied"
      : loginDetected
        ? "login_page_available"
        : "page_loaded_but_login_not_detected";

    return {
      ok: !accessDenied,
      state,
      checkedAt: new Date().toISOString(),
      httpStatus: response?.status() || null,
      title: title || null,
      finalUrl,
      loginDetected,
      inputCount: snapshot.inputs.length,
      buttonCount: snapshot.buttons.length,
      // Somente um trecho curto e sem valores de campos para diagnóstico estrutural.
      pageTextPreview: bodyText.slice(0, 300) || null,
    };
  } catch (error) {
    return {
      ok: false,
      state: "request_error",
      checkedAt: new Date().toISOString(),
      error: cleanText(error?.message || error).slice(0, 500),
    };
  } finally {
    await browser?.close().catch(() => null);
  }
}
