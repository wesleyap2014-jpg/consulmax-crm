import fs from "node:fs/promises";
import { chromium } from "playwright";

const PORTAL_URL =
  process.env.EMBRACON_ROBOT_PORTAL_URL ||
  "https://www.convertmais.com.br/AdminConvertMais/ConvertMaisWeb/login/";
const USERNAME = String(process.env.CONVERT_ROBOT_USERNAME || "").trim();
const PASSWORD = String(process.env.CONVERT_ROBOT_PASSWORD || "").trim();
const OUTPUT =
  process.env.EMBRACON_DIAGNOSTIC_JSON_PATH || "artifacts/embracon-login.json";
const SCREENSHOT =
  process.env.EMBRACON_DIAGNOSTIC_SCREENSHOT_PATH || "artifacts/embracon-login.png";

if (!USERNAME || !PASSWORD) {
  throw new Error(
    "Secrets CONVERT_ROBOT_USERNAME e CONVERT_ROBOT_PASSWORD não estão disponíveis.",
  );
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      if (await item.isVisible().catch(() => false)) return item;
    }
  }
  return null;
}

async function inspectFrame(frame) {
  return frame.evaluate(() => {
    const cleanText = (value) =>
      String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);

    const links = Array.from(document.querySelectorAll("a"))
      .filter((element) => {
        const el = element;
        return Boolean(el.offsetWidth || el.offsetHeight);
      })
      .slice(0, 250)
      .map((element) => ({
        text: cleanText(element.innerText || element.textContent),
        href: cleanText(element.getAttribute("href") || ""),
        id: cleanText(element.id),
        className: cleanText(element.className),
      }))
      .filter((item) => item.text || item.href);

    const buttons = Array.from(
      document.querySelectorAll(
        "button, input[type='button'], input[type='submit'], [role='button'], [role='menuitem']",
      ),
    )
      .filter((element) => {
        const el = element;
        return Boolean(el.offsetWidth || el.offsetHeight);
      })
      .slice(0, 200)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: cleanText(
          element.value || element.innerText || element.textContent,
        ),
        id: cleanText(element.id),
        className: cleanText(element.className),
        role: cleanText(element.getAttribute("role") || ""),
      }))
      .filter((item) => item.text || item.id);

    const navCandidates = Array.from(
      document.querySelectorAll("nav, aside, [role='navigation'], .menu, .sidebar, .navbar"),
    )
      .filter((element) => {
        const el = element;
        return Boolean(el.offsetWidth || el.offsetHeight);
      })
      .slice(0, 40)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        id: cleanText(element.id),
        className: cleanText(element.className),
        text: cleanText(element.innerText || element.textContent),
      }));

    return {
      url: window.location.href,
      title: document.title,
      links,
      buttons,
      navigation: navCandidates,
    };
  });
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: "pt-BR",
  });
  const page = await context.newPage();

  await page.goto(PORTAL_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null);

  await fs.mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: SCREENSHOT, fullPage: true });

  const passwordInput = await firstVisible(page, [
    "input[type='password']",
    "input[name*='senha' i]",
    "input[id*='senha' i]",
    "input[name*='password' i]",
    "input[id*='password' i]",
  ]);

  const usernameInput = await firstVisible(page, [
    "input[name*='usuario' i]",
    "input[id*='usuario' i]",
    "input[name*='login' i]",
    "input[id*='login' i]",
    "input[name*='user' i]",
    "input[id*='user' i]",
    "input[type='email']",
    "input[type='text']",
  ]);

  if (!usernameInput) throw new Error("Campo de usuário não localizado no login Convert+.");
  if (!passwordInput) throw new Error("Campo de senha não localizado no login Convert+.");

  await usernameInput.fill(USERNAME);
  await passwordInput.fill(PASSWORD);

  const submit = await firstVisible(page, [
    "button:has-text('Entrar')",
    "input[type='submit']",
    "button[type='submit']",
    "button",
  ]);

  if (!submit) throw new Error("Botão Entrar não localizado no login Convert+.");

  const beforeUrl = page.url();
  await Promise.all([
    page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => null),
    submit.click(),
  ]);
  await page.waitForTimeout(2500);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null);

  const passwordStillVisible = await page
    .locator("input[type='password']")
    .first()
    .isVisible()
    .catch(() => false);

  const alerts = await page
    .locator("[role='alert'], .alert, .validation-summary-errors, .error, .erro")
    .allInnerTexts()
    .catch(() => []);

  const frames = [];
  for (const frame of page.frames()) {
    try {
      frames.push({
        name: clean(frame.name()),
        ...((await inspectFrame(frame)) || {}),
      });
    } catch {
      frames.push({ name: clean(frame.name()), url: clean(frame.url()), inaccessible: true });
    }
  }

  const result = {
    ok: !passwordStillVisible && page.url() !== beforeUrl,
    administradora: "embracon",
    portal: "Convert+",
    login: {
      beforeUrl,
      afterUrl: page.url(),
      passwordStillVisible,
      alerts: alerts.map(clean).filter(Boolean).slice(0, 10),
    },
    frames,
  };

  await fs.writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(
    `[embracon-diagnostic] login=${result.ok ? "ok" : "nao_confirmado"}; frames=${frames.length}; relatório=${OUTPUT}`,
  );

  if (!result.ok) {
    throw new Error(
      `Login Convert+ não confirmado. URL atual: ${page.url()}. Verifique o artifact do diagnóstico.`,
    );
  }

  await context.close();
} finally {
  await browser.close();
}
