import fs from "node:fs";

const file = "src/maggiAvailableGroups.ts";

if (!fs.existsSync(file)) {
  console.log("patch maggi entry stability v2: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceFunction(signature, replacement, marker) {
  if (src.includes(marker)) return true;

  const start = src.indexOf(signature);
  if (start < 0) return false;

  const open = src.indexOf("{", start + signature.length - 1);
  if (open < 0) return false;

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let end = -1;

  for (let i = open; i < src.length; i += 1) {
    const char = src[i];
    const next = src[i + 1] || "";

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end < 0) return false;

  src = src.slice(0, start) + replacement + src.slice(end);
  changed = true;
  return true;
}

const gotoReplacement = String.raw`// MAGGI_ENTRY_STABILITY_V2
async function maggiGotoEntry(deps: RegisterDeps, page: Page) {
  const entryUrls = maggiEntryUrls(deps);
  let lastUrl = "";
  let lastText = "";
  let lastNavigationError = "";
  const failedRequests: string[] = [];
  const badResponses: string[] = [];
  const pageErrors: string[] = [];

  const safePath = (rawUrl: string) => {
    try {
      return new URL(rawUrl).pathname;
    } catch {
      return String(rawUrl || "").split("?")[0].slice(0, 240);
    }
  };

  const requestFailedListener = (request: any) => {
    const errorText = String(request.failure()?.errorText || "request_failed")
      .replace(/\\s+/g, " ")
      .trim()
      .slice(0, 180);
    failedRequests.push(safePath(request.url()) + " -> " + errorText);
    if (failedRequests.length > 12) failedRequests.shift();
  };

  const responseListener = (response: any) => {
    const status = Number(response.status() || 0);
    if (status < 400) return;
    badResponses.push(status + " " + safePath(response.url()));
    if (badResponses.length > 12) badResponses.shift();
  };

  const pageErrorListener = (error: any) => {
    pageErrors.push(
      String(error?.message || error || "page_error")
        .replace(/\\s+/g, " ")
        .trim()
        .slice(0, 220)
    );
    if (pageErrors.length > 8) pageErrors.shift();
  };

  page.on("requestfailed", requestFailedListener);
  page.on("response", responseListener);
  page.on("pageerror", pageErrorListener);

  try {
    for (let index = 0; index < entryUrls.length; index++) {
      const url = entryUrls[index];
      lastUrl = url;
      lastNavigationError = "";

      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
      } catch (error) {
        lastNavigationError = String((error as any)?.message || error || "")
          .replace(/\\s+/g, " ")
          .trim()
          .slice(0, 300);
        deps.log("navegação de entrada Maggi não confirmou carregamento", {
          url: safePath(url),
          error: lastNavigationError,
        });
      }

      const waitMs = index === 0 ? 135000 : 45000;
      const startedAt = Date.now();
      let lastAccessibilityAttemptAt = 0;

      while (Date.now() - startedAt < waitMs) {
        if (await maggiHasLoginInputs(page)) return true;

        const hasSellerEntry = await page
          .getByRole("button", { name: "SOU VENDEDOR", exact: true })
          .first()
          .isVisible()
          .catch(() => false);
        if (hasSellerEntry) return true;

        lastText = await page
          .locator("body")
          .innerText({ timeout: 2500 })
          .catch(() => "");
        const normalizedText = lastText.replace(/\\s+/g, " ").trim();
        const looksLike404 =
          /Server Error 404|File or directory not found|resource you are looking for/i.test(
            normalizedText
          );
        if (
          /SOU\\s+VENDEDOR|CONS[ÓO]RCIO\\s+MAGGI|MAGGI/i.test(normalizedText) &&
          !looksLike404
        ) {
          return true;
        }

        if (Date.now() - lastAccessibilityAttemptAt >= 5000) {
          lastAccessibilityAttemptAt = Date.now();
          await maggiEnableFlutterAccessibility(page).catch(() => false);
        }

        await page.waitForTimeout(1000);
      }

      deps.log("entrada Maggi ainda não ficou pronta; tentando fallback", {
        url: safePath(url),
        waitedMs: waitMs,
        requestFailures: failedRequests.slice(-4),
        badResponses: badResponses.slice(-4),
        pageErrors: pageErrors.slice(-3),
      });
    }

    const diagnostics = [
      lastNavigationError ? "navegação=" + lastNavigationError : "",
      failedRequests.length
        ? "requests=" + failedRequests.slice(-6).join(" | ")
        : "",
      badResponses.length
        ? "http=" + badResponses.slice(-6).join(" | ")
        : "",
      pageErrors.length
        ? "page=" + pageErrors.slice(-4).join(" | ")
        : "",
    ]
      .filter(Boolean)
      .join("; ");

    throw new Error(
      "Não foi possível carregar a entrada do app Maggi após aguardar o bootstrap do Flutter. Última URL testada: " +
        lastUrl +
        ". Texto visível: " +
        lastText.replace(/\\s+/g, " ").slice(0, 300) +
        (diagnostics ? ". Diagnóstico: " + diagnostics : "")
    );
  } finally {
    page.off("requestfailed", requestFailedListener);
    page.off("response", responseListener);
    page.off("pageerror", pageErrorListener);
  }
}`;

const loginFormReplacement = String.raw`// MAGGI_LOGIN_FORM_STABILITY_V2
async function ensureMaggiLoginForm(deps: RegisterDeps, page: Page) {
  const startedAt = Date.now();
  const timeoutMs = 90000;
  let lastSellerClickAt = 0;
  let sellerClicks = 0;
  let lastAccessibilityAttemptAt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    if (await maggiHasLoginInputs(page)) return;

    if (Date.now() - lastAccessibilityAttemptAt >= 5000) {
      lastAccessibilityAttemptAt = Date.now();
      await maggiEnableFlutterAccessibility(page).catch(() => false);
      if (await maggiHasLoginInputs(page)) return;
    }

    if (Date.now() - lastSellerClickAt >= 12000) {
      const sellerButton = page
        .getByRole("button", { name: "SOU VENDEDOR", exact: true })
        .first();
      const sellerText = page.getByText(/SOU\\s+VENDEDOR/i).first();

      if (await sellerButton.isVisible().catch(() => false)) {
        await sellerButton.click({ force: true }).catch(() => null);
        sellerClicks += 1;
        lastSellerClickAt = Date.now();
      } else if (await sellerText.isVisible().catch(() => false)) {
        await sellerText.click({ force: true }).catch(() => null);
        sellerClicks += 1;
        lastSellerClickAt = Date.now();
      }
    }

    await page.waitForTimeout(1000);
  }

  const snapshot = await maggiPageSnapshot(page);
  throw new Error(
    "Tela de login Maggi não carregou os campos de usuário/senha após 90 segundos sem recarregar o Flutter. URL atual: " +
      snapshot.url +
      ". Texto visível: " +
      snapshot.text +
      ". Elementos acessíveis: " +
      snapshot.ariaLabels.join(" | ").slice(0, 800) +
      ". Acionamentos de SOU VENDEDOR: " +
      sellerClicks
  );
}`;

const gotoOk = replaceFunction(
  "async function maggiGotoEntry(deps: RegisterDeps, page: Page) {",
  gotoReplacement,
  "MAGGI_ENTRY_STABILITY_V2"
);

const loginFormOk = replaceFunction(
  "async function ensureMaggiLoginForm(deps: RegisterDeps, page: Page) {",
  loginFormReplacement,
  "MAGGI_LOGIN_FORM_STABILITY_V2"
);

if (!gotoOk || !loginFormOk) {
  console.error("patch maggi entry stability v2: target function not found");
  process.exit(1);
}

if (!changed) {
  console.log("patch maggi entry stability v2: no changes");
  process.exit(0);
}

fs.writeFileSync(file, src);
console.log("patch maggi entry stability v2: applied");
