import { chromium } from "playwright";

const LOGIN_URL = "https://login.microsoftonline.com/d3b1fece-6695-49c0-8903-60fd690d0941/oauth2/v2.0/authorize?client_id=cfafb6bf-75bd-483b-8df2-dfdc568bbd1f&scope=openid%20profile%20offline_access&redirect_uri=https%3A%2F%2Fwww.convertmais.com.br%2FAdminConvertMais%2FConvertMaisWeb%2Flogin&client-request-id=029595db-37a9-4330-9de1-67344fff32c9&response_mode=fragment&response_type=code&x-client-SKU=msal.js.browser&x-client-VER=2.31.0&client_info=1&code_challenge=ihu1qzL8bmXN0vsSxFblF_2SMjzlv7YzzTjCUVqkB_4&code_challenge_method=S256&prompt=select_account&nonce=0b9189db-c66e-4c49-b486-1e4d63e9456b&state=eyJpZCI6IjFkMmEyMGExLTVhMTUtNGU2MC05MDQ4LWUzMDVlNWNiYTY1NiIsIm1ldGEiOnsiaW50ZXJhY3Rpb25UeXBlIjoicmVkaXJlY3QifX0%3D";
const CHROME_BIN = process.env.AREA_RESTRITA_CHROME_BIN || "/usr/bin/google-chrome-stable";
const USERNAME = String(process.env.CONVERT_ROBOT_USERNAME || "").trim();
const PASSWORD = String(process.env.CONVERT_ROBOT_PASSWORD || "");

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

async function visibleText(page) {
  return clean(await page.locator("body").innerText({ timeout: 5000 }).catch(() => ""));
}

async function clickUseAnotherAccount(page) {
  const candidate = page.getByText(/use another account|usar outra conta/i).first();
  if (await candidate.isVisible().catch(() => false)) {
    await candidate.click();
    await page.waitForTimeout(800);
    return true;
  }
  return false;
}

async function clickSubmit(page) {
  const selectors = [
    "#idSIButton9",
    'input[type="submit"]',
    'button[type="submit"]',
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return true;
    }
  }
  return false;
}

function classifyMicrosoftText(text) {
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

export async function checkMicrosoftLogin() {
  if (!USERNAME || !PASSWORD) {
    return {
      ok: false,
      state: "credentials_not_configured",
      checkedAt: new Date().toISOString(),
    };
  }

  let browser = null;
  let convertDocumentStatus = null;
  let authorizationCodeSeen = false;

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

    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      const url = frame.url();
      if (/convertmais\.com\.br/i.test(url) && /[#&?]code=/i.test(url)) {
        authorizationCodeSeen = true;
      }
    });

    page.on("response", (response) => {
      const request = response.request();
      if (request.resourceType() !== "document") return;
      const url = response.url();
      if (/convertmais\.com\.br\/AdminConvertMais\/ConvertMaisWeb\/login/i.test(url)) {
        convertDocumentStatus = response.status();
      }
    });

    const firstResponse = await page.goto(LOGIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(1200);

    if ((firstResponse?.status() || 0) >= 400) {
      return {
        ok: false,
        state: "microsoft_login_unavailable",
        checkedAt: new Date().toISOString(),
        httpStatus: firstResponse?.status() || null,
        finalUrl: safeUrl(page.url()),
      };
    }

    await clickUseAnotherAccount(page);

    const emailInput = page.locator('input[type="email"], input[name="loginfmt"], #i0116').first();
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill(USERNAME);
      await clickSubmit(page);
      await page.waitForTimeout(1500);
    }

    let text = await visibleText(page);
    let classified = classifyMicrosoftText(text);
    if (classified === "mfa_required" || classified === "credentials_rejected") {
      return {
        ok: classified !== "credentials_rejected",
        state: classified,
        checkedAt: new Date().toISOString(),
        finalUrl: safeUrl(page.url()),
      };
    }

    const passwordInput = page.locator('input[type="password"], input[name="passwd"], #i0118').first();
    if (!(await passwordInput.isVisible().catch(() => false))) {
      return {
        ok: false,
        state: "password_field_not_found",
        checkedAt: new Date().toISOString(),
        finalUrl: safeUrl(page.url()),
      };
    }

    await passwordInput.fill(PASSWORD);
    await clickSubmit(page);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await page.waitForTimeout(1000);
      const currentUrl = page.url();
      text = await visibleText(page);
      classified = classifyMicrosoftText(text);

      if (classified === "stay_signed_in_prompt") {
        const noButton = page.locator("#idBtn_Back").first();
        if (await noButton.isVisible().catch(() => false)) {
          await noButton.click();
          continue;
        }
      }

      if (classified === "mfa_required" || classified === "credentials_rejected") {
        return {
          ok: classified !== "credentials_rejected",
          state: classified,
          checkedAt: new Date().toISOString(),
          finalUrl: safeUrl(currentUrl),
        };
      }

      if (/convertmais\.com\.br/i.test(currentUrl)) {
        const denied = /access denied|acesso negado|forbidden|request rejected|not authorized/i.test(text);
        return {
          ok: !denied,
          state: denied ? "returned_to_convert_access_denied" : "returned_to_convert",
          checkedAt: new Date().toISOString(),
          finalUrl: safeUrl(currentUrl),
          convertHttpStatus: convertDocumentStatus,
          authorizationCodeSeen,
        };
      }
    }

    return {
      ok: false,
      state: "login_flow_timeout",
      checkedAt: new Date().toISOString(),
      finalUrl: safeUrl(page.url()),
    };
  } catch (error) {
    return {
      ok: false,
      state: "login_check_error",
      checkedAt: new Date().toISOString(),
      error: clean(error?.message || error).slice(0, 500),
    };
  } finally {
    await browser?.close().catch(() => null);
  }
}
