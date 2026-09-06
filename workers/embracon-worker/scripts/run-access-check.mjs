import { chromium } from "playwright";

const portalUrl =
  process.env.EMBRACON_ROBOT_PORTAL_URL ||
  "https://www.convertmais.com.br/AdminConvertMais/ConvertMaisWeb/login/";

const browser = await chromium.launch({
  headless: String(process.env.PLAYWRIGHT_HEADLESS || "true") !== "false",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: "pt-BR",
  });
  const page = await context.newPage();

  const response = await page.goto(portalUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null);

  const result = await page.evaluate(() => {
    const bodyText = String(document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .trim();

    const passwordInputs = document.querySelectorAll('input[type="password"]').length;
    const allInputs = document.querySelectorAll("input").length;

    return {
      title: document.title,
      url: window.location.href,
      bodySample: bodyText.slice(0, 500),
      passwordInputs,
      allInputs,
    };
  });

  const status = response?.status() ?? null;
  const normalized = `${result.title} ${result.bodySample}`.toLowerCase();
  const accessDenied =
    normalized.includes("access denied") ||
    normalized.includes("acesso negado") ||
    status === 403;

  const loginPageAvailable = !accessDenied && result.passwordInputs > 0;

  console.log(
    JSON.stringify(
      {
        ok: loginPageAvailable,
        status: accessDenied
          ? "access_denied"
          : loginPageAvailable
            ? "login_page_available"
            : "page_loaded_but_login_not_detected",
        httpStatus: status,
        title: result.title,
        finalUrl: result.url,
        inputCount: result.allInputs,
        passwordInputCount: result.passwordInputs,
        bodySample: result.bodySample,
      },
      null,
      2,
    ),
  );

  await context.close();

  if (accessDenied) process.exitCode = 2;
  else if (!loginPageAvailable) process.exitCode = 3;
} finally {
  await browser.close().catch(() => null);
}
