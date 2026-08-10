import { chromium } from "playwright";

// Diagnóstico temporário solicitado: abre exatamente a URL de autorização
// Microsoft capturada no fluxo real do Convert+, sem usar credenciais.
const DEFAULT_PORTAL_URL = "https://login.microsoftonline.com/d3b1fece-6695-49c0-8903-60fd690d0941/oauth2/v2.0/authorize?client_id=cfafb6bf-75bd-483b-8df2-dfdc568bbd1f&scope=openid%20profile%20offline_access&redirect_uri=https%3A%2F%2Fwww.convertmais.com.br%2FAdminConvertMais%2FConvertMaisWeb%2Flogin&client-request-id=029595db-37a9-4330-9de1-67344fff32c9&response_mode=fragment&response_type=code&x-client-SKU=msal.js.browser&x-client-VER=2.31.0&client_info=1&code_challenge=ihu1qzL8bmXN0vsSxFblF_2SMjzlv7YzzTjCUVqkB_4&code_challenge_method=S256&prompt=select_account&nonce=0b9189db-c66e-4c49-b486-1e4d63e9456b&state=eyJpZCI6IjFkMmEyMGExLTVhMTUtNGU2MC05MDQ4LWUzMDVlNWNiYTY1NiIsIm1ldGEiOnsiaW50ZXJhY3Rpb25UeXBlIjoicmVkaXJlY3QifX0%3D";
const CHROME_BIN = process.env.AREA_RESTRITA_CHROME_BIN || "/usr/bin/google-chrome-stable";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export async function checkConvertAccess(options = {}) {
  const portalUrl = String(options.portalUrl || DEFAULT_PORTAL_URL).trim();
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
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]')).map((button) => ({
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
    const microsoftDetected = /login\.microsoftonline\.com/i.test(finalUrl) && (
      /entrar em sua conta|escolha uma conta|use outra conta|sign in|pick an account|use another account/i.test(`${title} ${bodyText}`) ||
      snapshot.inputs.some((input) => input.visible && /loginfmt|passwd|email|password/i.test(`${input.name || ""} ${input.id || ""} ${input.type || ""}`))
    );
    const loginDetected = snapshot.inputs.some((input) => input.visible && (
      input.type === "password" ||
      /user|usuario|usuário|login|email|cpf|senha|password/i.test(`${input.name || ""} ${input.id || ""} ${input.placeholder || ""}`)
    )) || snapshot.buttons.some((button) => button.visible && /entrar|login|acessar|avançar|next/i.test(button.text));

    const state = accessDenied
      ? "access_denied"
      : microsoftDetected
        ? "microsoft_login_available"
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
      microsoftDetected,
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
