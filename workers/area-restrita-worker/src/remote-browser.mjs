import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORTAL_URL = requiredEnv("AREA_RESTRITA_PORTAL_URL");
const USERNAME = requiredEnv("AREA_RESTRITA_USERNAME");
const PASSWORD = requiredEnv("AREA_RESTRITA_PASSWORD");
const DATA_DIR = path.resolve(process.env.AREA_RESTRITA_DATA_DIR || "/data");
const PROFILE_DIR = path.join(DATA_DIR, "chrome-profile");
const STATUS_FILE = path.join(DATA_DIR, "area-restrita-status.json");
const CHROME_BIN = process.env.AREA_RESTRITA_CHROME_BIN || "/usr/bin/google-chrome-stable";
const DEBUG_PORT = Number(process.env.AREA_RESTRITA_CHROME_DEBUG_PORT || 9222);
const LOGIN_PATH_PATTERN = /\/NewLogin\/NewLoginCMC\.asp(?:$|[?#])/i;
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

async function setStatus(state, details = {}) {
  const payload = {
    ok: true,
    service: "consulmax-area-restrita-worker",
    state,
    updatedAt: new Date().toISOString(),
    browser: "google-chrome-stable",
    ...details,
  };

  await fs.writeFile(STATUS_FILE, JSON.stringify(payload, null, 2));
  console.log(`[area-restrita] estado: ${state}`);
}

function isLoginUrl(url) {
  return LOGIN_PATH_PATTERN.test(String(url || ""));
}

async function getChromePages() {
  const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`Chrome DevTools respondeu HTTP ${response.status}`);
  const targets = await response.json();
  return Array.isArray(targets) ? targets.filter((target) => target?.type === "page") : [];
}

async function waitForChrome() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const pages = await getChromePages();
      if (pages.length > 0) return;
    } catch {
      // O Chrome ainda está inicializando.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("O Google Chrome não disponibilizou a interface local de diagnóstico.");
}

function choosePortalPage(pages) {
  return pages.find((page) => String(page.url() || "").startsWith(PORTAL_ORIGIN)) || pages[0] || null;
}

async function readLoginState(page) {
  return page.evaluate(() => {
    const bodyText = String(document.body?.innerText || "").replace(/\s+/g, " ").trim();
    const tokenElements = Array.from(document.querySelectorAll(
      'input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"], input[name*="turnstile" i], textarea[name*="turnstile" i]'
    ));
    const tokenLength = tokenElements.reduce((max, element) => {
      const value = String(element.value || element.getAttribute("value") || "");
      return Math.max(max, value.length);
    }, 0);

    return {
      tokenLength,
      usernameVisible: Boolean(document.querySelector('#login, input[name="login"]')),
      passwordVisible: Boolean(document.querySelector('#senha, input[name="senha"], input[type="password"]')),
      verificationFailed: /falha na verifica[cç][aã]o|verification failed|failure/i.test(bodyText),
      loginRejected: /(usu[aá]rio|senha).{0,40}(inv[aá]lid|incorret)|acesso negado|falha no login/i.test(bodyText),
    };
  }).catch(() => ({
    tokenLength: 0,
    usernameVisible: false,
    passwordVisible: false,
    verificationFailed: false,
    loginRejected: false,
  }));
}

async function submitStoredCredentials(page) {
  const usernameInput = page.locator('#login, input[name="login"]').first();
  const passwordInput = page.locator('#senha, input[name="senha"], input[type="password"]').first();
  const submitButton = page.locator('#btnSubmit, button:has-text("Entrar"), input[type="submit"]').first();

  await usernameInput.waitFor({ state: "visible", timeout: 15000 });
  await passwordInput.waitFor({ state: "visible", timeout: 15000 });

  // O preenchimento ocorre somente depois de a pessoa concluir o Turnstile.
  // fill() preserva exatamente maiúsculas, minúsculas e caracteres especiais.
  await usernameInput.fill(USERNAME);
  await passwordInput.fill(PASSWORD);

  await setStatus("submitting_login", {
    message: "Cloudflare validado. Enviando as credenciais armazenadas com a capitalização original.",
    currentUrl: page.url(),
    profileDirectory: PROFILE_DIR,
  });

  if (await submitButton.isVisible().catch(() => false)) {
    await submitButton.click();
  } else {
    await passwordInput.press("Enter");
  }
}

async function monitorSession(chrome, browser) {
  let previousState = null;
  let previousUrl = null;
  let loginSubmitted = false;
  let loginSubmittedAt = 0;

  while (chrome.exitCode === null) {
    try {
      const context = browser.contexts()[0];
      const page = context ? choosePortalPage(context.pages()) : null;
      const currentUrl = String(page?.url() || "");
      let state = "browser_ready";
      let message = "Google Chrome aberto e aguardando navegação.";

      if (page && currentUrl.startsWith(PORTAL_ORIGIN) && isLoginUrl(currentUrl)) {
        const loginState = await readLoginState(page);

        if (loginState.verificationFailed) {
          state = "cloudflare_rejected";
          message = "O Cloudflare recusou a tentativa. Atualize a página e valide novamente.";
        } else if (loginState.tokenLength >= 20 && loginState.usernameVisible && loginState.passwordVisible) {
          if (!loginSubmitted) {
            loginSubmitted = true;
            loginSubmittedAt = Date.now();
            await submitStoredCredentials(page);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }

          state = "submitting_login";
          message = "Cloudflare validado. Aguardando a confirmação do login.";

          if (loginState.loginRejected || Date.now() - loginSubmittedAt > 60000) {
            state = "login_not_confirmed";
            message = "O login não foi confirmado. Confira as credenciais cadastradas no Railway.";
          }
        } else {
          state = "waiting_cloudflare";
          message = "Marque 'Verify you are human'. Depois disso, o robô preencherá o login automaticamente.";
        }
      } else if (page && currentUrl.startsWith(PORTAL_ORIGIN)) {
        loginSubmitted = false;
        state = "authenticated";
        message = "Sessão autenticada e preservada no perfil persistente.";
      }

      if (state !== previousState || currentUrl !== previousUrl) {
        previousState = state;
        previousUrl = currentUrl;
        await setStatus(state, {
          message,
          currentUrl: currentUrl || null,
          profileDirectory: PROFILE_DIR,
        });
      }
    } catch (error) {
      if (previousState !== "browser_monitor_warning") {
        previousState = "browser_monitor_warning";
        await setStatus("browser_monitor_warning", {
          message: "O navegador está aberto, mas o monitor local não conseguiu consultar a guia atual.",
          error: String(error?.message || error),
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

async function main() {
  await fs.mkdir(PROFILE_DIR, { recursive: true });
  await setStatus("starting_browser", {
    message: "Iniciando Google Chrome estável em modo visível.",
    profileDirectory: PROFILE_DIR,
  });

  const chromeArgs = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-session-crashed-bubble",
    "--hide-crash-restore-bubble",
    "--start-maximized",
    "--window-size=1440,1000",
    `--user-data-dir=${PROFILE_DIR}`,
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${DEBUG_PORT}`,
    PORTAL_URL,
  ];

  const chrome = spawn(CHROME_BIN, chromeArgs, {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  });

  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`[area-restrita] encerrando Chrome por ${signal}`);
    chrome.kill("SIGTERM");
    setTimeout(() => chrome.kill("SIGKILL"), 10000).unref();
  };

  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  chrome.once("error", async (error) => {
    await setStatus("error", {
      error: `Não foi possível iniciar o Google Chrome: ${String(error?.message || error)}`,
    });
  });

  await waitForChrome();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
  await monitorSession(chrome, browser);

  const exitCode = await new Promise((resolve) => {
    if (chrome.exitCode !== null) return resolve(chrome.exitCode);
    chrome.once("exit", (code) => resolve(code));
  });

  if (!stopping && exitCode !== 0) {
    await setStatus("error", {
      error: `Google Chrome encerrou inesperadamente com código ${exitCode}.`,
    });
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  await setStatus("error", { error: String(error?.message || error) }).catch(() => null);
  console.error(`[area-restrita] falha no navegador: ${String(error?.message || error)}`);
  process.exit(1);
});
