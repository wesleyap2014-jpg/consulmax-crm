import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import { chromium, type Browser, type Page } from "playwright";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 3040);

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function assertAuthorized(req: express.Request) {
  const expected = requiredEnv("ROBOT_API_SECRET");
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token || token !== expected) {
    const error: any = new Error("Não autorizado.");
    error.statusCode = 401;
    throw error;
  }
}

function log(message: string, details?: Record<string, unknown>) {
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.log(`[embracon-worker] ${new Date().toISOString()} ${message}${suffix}`);
}

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: String(process.env.PLAYWRIGHT_HEADLESS || "true") !== "false",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

async function waitDom(page: Page, timeout = 5000) {
  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => null);
  await page.waitForLoadState("networkidle", { timeout }).catch(() => null);
}

async function inspectLoginPage() {
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      locale: "pt-BR",
    });
    const page = await context.newPage();

    const portalUrl = requiredEnv("EMBRACON_ROBOT_PORTAL_URL");
    log("abrindo página inicial da Embracon", { host: new URL(portalUrl).host });

    await page.goto(portalUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitDom(page, 8000);

    const result = await page.evaluate(() => {
      function clean(value: unknown) {
        return String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);
      }

      const inputs = Array.from(document.querySelectorAll("input, select, textarea"))
        .slice(0, 80)
        .map((element) => {
          const el = element as HTMLInputElement;
          return {
            tag: el.tagName.toLowerCase(),
            type: clean(el.getAttribute("type") || ""),
            id: clean(el.id),
            name: clean(el.getAttribute("name") || ""),
            placeholder: clean(el.getAttribute("placeholder") || ""),
            autocomplete: clean(el.getAttribute("autocomplete") || ""),
            ariaLabel: clean(el.getAttribute("aria-label") || ""),
            visible: Boolean((el as HTMLElement).offsetWidth || (el as HTMLElement).offsetHeight),
          };
        });

      const buttons = Array.from(
        document.querySelectorAll("button, input[type='submit'], input[type='button'], a[role='button']"),
      )
        .slice(0, 60)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          id: clean((element as HTMLElement).id),
          name: clean(element.getAttribute("name") || ""),
          text: clean(
            (element as HTMLInputElement).value ||
              (element as HTMLElement).innerText ||
              element.textContent,
          ),
          ariaLabel: clean(element.getAttribute("aria-label") || ""),
          visible: Boolean(
            (element as HTMLElement).offsetWidth || (element as HTMLElement).offsetHeight,
          ),
        }));

      const forms = Array.from(document.querySelectorAll("form"))
        .slice(0, 20)
        .map((form) => ({
          id: clean((form as HTMLElement).id),
          name: clean(form.getAttribute("name") || ""),
          action: clean(form.getAttribute("action") || ""),
          method: clean(form.getAttribute("method") || ""),
        }));

      return {
        title: document.title,
        url: window.location.href,
        inputs,
        buttons,
        forms,
        iframeCount: document.querySelectorAll("iframe").length,
      };
    });

    const screenshotPath = String(
      process.env.EMBRACON_DIAGNOSTIC_SCREENSHOT_PATH || "",
    ).trim();

    if (screenshotPath) {
      const absolute = path.resolve(screenshotPath);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await page.screenshot({ path: absolute, fullPage: true });
      log("screenshot diagnóstico salvo", { path: absolute });
    }

    await context.close().catch(() => null);
    return result;
  } finally {
    if (browser) await browser.close().catch(() => null);
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "embracon-worker",
    administradora: "embracon",
    status: "online",
    capabilities: ["health", "safe_login_page_diagnostics"],
  });
});

app.post("/diagnostics/embracon/login-page", async (req, res) => {
  try {
    assertAuthorized(req);
    const result = await inspectLoginPage();
    return res.status(200).json({
      ok: true,
      status: "inspected",
      administradora: "embracon",
      result,
    });
  } catch (error: any) {
    const status = Number(error?.statusCode || 500);
    log("falha no diagnóstico da página de login", {
      error: error?.message || String(error),
    });
    return res.status(status).json({
      ok: false,
      administradora: "embracon",
      error: error?.message || "Erro interno no diagnóstico Embracon.",
    });
  }
});

app.post("/sync/embracon/groups", (req, res) => {
  try {
    assertAuthorized(req);
    return res.status(501).json({
      ok: false,
      status: "not_implemented",
      administradora: "embracon",
      error:
        "Infraestrutura pronta. O robô de grupos Embracon ainda precisa ser mapeado no portal antes de ser ativado.",
    });
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({
      ok: false,
      administradora: "embracon",
      error: error?.message || "Erro interno no worker Embracon.",
    });
  }
});

app.listen(PORT, () => {
  log(`worker Embracon rodando na porta ${PORT}`);
});
