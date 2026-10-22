import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const LOGIN_URL = String(
  process.env.CONVERT_MICROSOFT_LOGIN_URL
  || "https://login.microsoftonline.com/d3b1fece-6695-49c0-8903-60fd690d0941/oauth2/v2.0/authorize?client_id=cfafb6bf-75bd-483b-8df2-dfdc568bbd1f&scope=openid%20profile%20offline_access&redirect_uri=https%3A%2F%2Fwww.convertmais.com.br%2FAdminConvertMais%2FConvertMaisWeb%2Flogin&client-request-id=029595db-37a9-4330-9de1-67344fff32c9&response_mode=fragment&response_type=code&x-client-SKU=msal.js.browser&x-client-VER=2.31.0&client_info=1&code_challenge=ihu1qzL8bmXN0vsSxFblF_2SMjzlv7YzzTjCUVqkB_4&code_challenge_method=S256&prompt=select_account&nonce=0b9189db-c66e-4c49-b486-1e4d63e9456b&state=eyJpZCI6IjFkMmEyMGExLTVhMTUtNGU2MC05MDQ4LWUzMDVlNWNiYTY1NiIsIm1ldGEiOnsiaW50ZXJhY3Rpb25UeXBlIjoicmVkaXJlY3QifX0%3D"
).trim();
const USERNAME = String(process.env.CONVERT_ROBOT_USERNAME || "").trim();
const PASSWORD = String(process.env.CONVERT_ROBOT_PASSWORD || "");
const DATA_DIR = path.resolve(process.env.AREA_RESTRITA_DATA_DIR || "/data");
const PROFILE_DIR = path.join(DATA_DIR, "embracon-chrome-profile");
const STATUS_FILE = path.join(DATA_DIR, "embracon-poc-status.json");
const CHROME_BIN = process.env.AREA_RESTRITA_CHROME_BIN || "/usr/bin/google-chrome-stable";
const DEBUG_PORT = Number(process.env.EMBRACON_CHROME_DEBUG_PORT || 9333);

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

async function setStatus(state, details = {}) {
  const payload = {
    ok: !["error", "credentials_rejected", "password_expired", "convert_access_denied"].includes(state),
    service: "consulmax-embracon-poc",
    state,
    updatedAt: new Date().toISOString(),
    ...details,
  };
  await fs.writeFile(STATUS_FILE, JSON.stringify(payload, null, 2));
  console.log(`[embracon-poc] estado: ${state}`);
}

async function waitForChrome() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return;
    } catch {
      // Chrome ainda inicializando.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Chrome do POC Embracon não disponibilizou o DevTools.");
}

function classifyMicrosoftText(text) {
  if (/password.*expired|senha.*expirad|update your password|alterar sua senha|change your password/i.test(text)) {
    return "password_expired";
  }
  if (/approve sign in request|aprovar solicita[cç][aã]o|authenticator|enter a code|insira um c[oó]digo|verifique sua identidade|verify your identity|help us protect your account|more information required/i.test(text)) {
    return "waiting_mfa";
  }
  if (/your account or password is incorrect|senha.*incorret|password.*incorrect|we couldn't sign you in|n[aã]o foi poss[ií]vel entrar|incorrect username or password/i.test(text)) {
    return "credentials_rejected";
  }
  if (/stay signed in|continuar conectado/i.test(text)) {
    return "stay_signed_in";
  }
  return "microsoft_login";
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click({ timeout: 5000 });
      return true;
    }
  }
  return false;
}

async function driveAutomaticLogin(page, state) {
  if (!USERNAME || !PASSWORD) {
    return {
      acted: false,
      state: "error",
      message: "Os secrets CONVERT_ROBOT_USERNAME/CONVERT_ROBOT_PASSWORD não chegaram ao navegador.",
    };
  }

  const text = clean(await page.locator("body").innerText({ timeout: 3000 }).catch(() => ""));
  const classification = classifyMicrosoftText(text);

  if (classification === "waiting_mfa") {
    return {
      acted: false,
      state: "waiting_mfa",
      message: "Credenciais aceitas. Conclua a validação MFA da Microsoft no navegador remoto.",
    };
  }

  if (classification === "password_expired") {
    return {
      acted: false,
      state: "password_expired",
      message: "A Microsoft informou que a senha da conta Embracon expirou e precisa ser alterada.",
    };
  }

  if (classification === "credentials_rejected") {
    return {
      acted: false,
      state: "credentials_rejected",
      message: "A Microsoft rejeitou as credenciais armazenadas no GitHub.",
    };
  }

  if (classification === "stay_signed_in") {
    const clicked = await clickFirstVisible(page, ["#idBtn_Back", 'button:has-text("Não")', 'button:has-text("No")']);
    if (clicked) {
      state.stage = "stay_signed_in_handled";
      state.lastActionAt = Date.now();
      return {
        acted: true,
        state: "submitting_login",
        message: "Login aceito. Concluindo o retorno ao Convert+.",
      };
    }
  }

  const useAnother = page.getByText(/use another account|usar outra conta/i).first();
  if (!state.accountChoiceHandled && await useAnother.isVisible().catch(() => false)) {
    await useAnother.click({ timeout: 5000 });
    state.accountChoiceHandled = true;
    state.stage = "account_choice";
    state.lastActionAt = Date.now();
    return {
      acted: true,
      state: "submitting_login",
      message: "Selecionando a conta configurada para o robô Embracon.",
    };
  }

  const email = page.locator('input[type="email"], input[name="loginfmt"], #i0116').first();
  if (!state.emailSubmitted && await email.isVisible().catch(() => false)) {
    await email.fill(USERNAME);
    await clickFirstVisible(page, ["#idSIButton9", 'input[type="submit"]', 'button[type="submit"]']);
    state.emailSubmitted = true;
    state.stage = "email_submitted";
    state.lastActionAt = Date.now();
    return {
      acted: true,
      state: "submitting_login",
      message: "Usuário Embracon enviado à Microsoft automaticamente.",
    };
  }

  const password = page.locator('input[type="password"], input[name="passwd"], #i0118').first();
  if (!state.passwordSubmitted && await password.isVisible().catch(() => false)) {
    await password.fill(PASSWORD);
    await clickFirstVisible(page, ["#idSIButton9", 'input[type="submit"]', 'button[type="submit"]']);
    state.passwordSubmitted = true;
    state.stage = "password_submitted";
    state.lastActionAt = Date.now();
    return {
      acted: true,
      state: "submitting_login",
      message: "Senha Embracon enviada à Microsoft automaticamente.",
    };
  }

  if (state.emailSubmitted || state.passwordSubmitted || (Date.now() - state.lastActionAt) < 7000) {
    return {
      acted: false,
      state: "submitting_login",
      message: "Aguardando a Microsoft concluir a autenticação automática.",
    };
  }

  return {
    acted: false,
    state: "waiting_microsoft_login",
    message: "Aguardando a tela de login Microsoft ficar disponível.",
  };
}

async function monitor(chrome, browser) {
  let previousState = "";
  let previousUrl = "";
  const auto = {
    accountChoiceHandled: false,
    emailSubmitted: false,
    passwordSubmitted: false,
    stage: "starting",
    lastActionAt: 0,
  };

  while (chrome.exitCode === null && chrome.signalCode === null) {
    try {
      const context = browser.contexts()[0];
      const pages = context?.pages() || [];
      const page = pages.find((candidate) => /microsoftonline\.com|convertmais\.com\.br/i.test(candidate.url())) || pages[0] || null;
      const currentUrl = page?.url() || "";
      const text = page ? clean(await page.locator("body").innerText({ timeout: 3000 }).catch(() => "")) : "";

      let state = "browser_ready";
      let message = "Navegador do POC Embracon iniciado.";

      if (/login\.microsoftonline\.com/i.test(currentUrl) && page) {
        const automatic = await driveAutomaticLogin(page, auto);
        state = automatic.state;
        message = automatic.message;
      } else if (/convertmais\.com\.br/i.test(currentUrl)) {
        const denied = /access denied|acesso negado|forbidden|request rejected|not authorized/i.test(text);
        state = denied ? "convert_access_denied" : "returned_to_convert";
        message = denied
          ? "A autenticação retornou ao Convert+, mas o portal recusou o acesso."
          : "A autenticação Microsoft retornou ao Convert+. POC de acesso concluído.";
      }

      if (state !== previousState || currentUrl !== previousUrl) {
        previousState = state;
        previousUrl = currentUrl;
        await setStatus(state, {
          message,
          currentUrl: safeUrl(currentUrl),
          profileDirectory: PROFILE_DIR,
          autoLogin: true,
          autoStage: auto.stage,
        });
      }
    } catch (error) {
      if (previousState !== "monitor_warning") {
        previousState = "monitor_warning";
        await setStatus("monitor_warning", {
          message: "O navegador está aberto, mas o monitor não conseguiu ler a guia atual.",
          error: clean(error?.message || error).slice(0, 500),
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function main() {
  if (!USERNAME || !PASSWORD) {
    throw new Error("Credenciais Embracon não foram injetadas no navegador.");
  }

  await fs.mkdir(PROFILE_DIR, { recursive: true });
  await fs.rm(path.join(PROFILE_DIR, "SingletonLock"), { force: true }).catch(() => null);
  await fs.rm(path.join(PROFILE_DIR, "SingletonSocket"), { force: true }).catch(() => null);
  await fs.rm(path.join(PROFILE_DIR, "SingletonCookie"), { force: true }).catch(() => null);

  await setStatus("starting_browser", {
    message: "Iniciando navegador remoto e login automático do POC Embracon.",
    autoLogin: true,
  });

  const chrome = spawn(CHROME_BIN, [
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
    LOGIN_URL,
  ], {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  });

  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`[embracon-poc] encerrando Chrome por ${signal}`);
    chrome.kill("SIGTERM");
    setTimeout(() => chrome.kill("SIGKILL"), 8000).unref();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  await waitForChrome();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
  await monitor(chrome, browser);
}

main().catch(async (error) => {
  await setStatus("error", {
    message: "Falha ao iniciar o POC Embracon.",
    error: clean(error?.message || error).slice(0, 500),
  }).catch(() => null);
  console.error(`[embracon-poc] ${clean(error?.message || error)}`);
  process.exit(1);
});
