import fs from "node:fs";

const file = "src/maggiAvailableGroups.ts";

if (!fs.existsSync(file)) {
  console.log("patch maggi login resilience: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(needle, replacement, marker = replacement) {
  if (!src.includes(marker) && src.includes(needle)) {
    src = src.replace(needle, replacement);
    changed = true;
  }
}

function replaceBlock(startMarker, endMarker, replacement, marker = replacement) {
  if (src.includes(marker)) return;

  const start = src.indexOf(startMarker);
  const end = start >= 0 ? src.indexOf(endMarker, start) : -1;
  if (start < 0 || end < 0) return;

  src = src.slice(0, start) + replacement + src.slice(end);
  changed = true;
}

const helperNeedle = `async function fillFirstVisibleSafe(deps: RegisterDeps, page: Page, selectors: string[], value: string) {
  const filtered = selectors.map((selector) => String(selector || "").trim()).filter(Boolean);
  await deps.fillFirstVisible(page, filtered, value);
}
`;

const helperReplacement = `${helperNeedle}
function maggiEntryUrls(deps: RegisterDeps) {
  const configured = deps.requiredEnv("MAGGI_AVAILABLE_GROUPS_PORTAL_URL").replace(/\\/+$/, "");
  const base = appBaseUrl(deps.requiredEnv).replace(/\\/+$/, "");
  const candidates = [
    configured,
    base,
    base + "/",
    base + "/home",
    base + "/index.html",
  ];
  return Array.from(new Set(candidates.filter(Boolean)));
}

async function maggiEnableFlutterAccessibility(page: Page) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const semanticsCount = await page.locator("flt-semantics").count().catch(() => 0);
    if (semanticsCount > 0) return true;

    const toggle = page
      .locator('flt-semantics-placeholder[aria-label="Enable accessibility"]')
      .first();
    const toggleCount = await toggle.count().catch(() => 0);

    if (toggleCount > 0) {
      await toggle
        .evaluate((element) => (element as HTMLElement).click())
        .catch(() => null);
      await page.waitForTimeout(150);

      const enabledByDomClick = await page
        .locator("flt-semantics")
        .count()
        .catch(() => 0);
      if (enabledByDomClick > 0) return true;

      await toggle.click({ force: true }).catch(() => null);
      await toggle.press("Enter").catch(() => null);
    }

    await page.waitForTimeout(500);
  }

  return false;
}

const MAGGI_SIMULATION_TEXT =
  /Simula(?:ç|c)[aã]o|Autom[oó]ve(?:l|is)|Im[oó]ve(?:l|is)/i;

function maggiSegmentPattern(segment: MaggiAvailableSegmentConfig) {
  return segment.key === "automoveis"
    ? /Autom[oó]ve(?:l|is)/i
    : /Im[oó]ve(?:l|is)/i;
}

async function maggiPageSnapshot(page: Page) {
  const bodyText = await page
    .locator("body")
    .innerText({ timeout: 3000 })
    .catch(() => "");
  const ariaLabels = await page
    .locator("[aria-label]")
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("aria-label") || "")
        .filter(Boolean)
        .slice(0, 40)
    )
    .catch(() => [] as string[]);

  return {
    url: page.url(),
    text: bodyText.replace(/\\s+/g, " ").trim().slice(0, 500),
    ariaLabels,
  };
}

async function maggiFindVisibleAppText(page: Page, pattern: RegExp) {
  const candidates = [
    page.getByRole("combobox", { name: pattern }).first(),
    page.getByRole("option", { name: pattern }).first(),
    page.getByRole("button", { name: pattern }).first(),
    page.getByRole("textbox", { name: pattern }).first(),
    page.getByLabel(pattern).first(),
    page.getByText(pattern).first(),
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }

  return null;
}

async function maggiWaitForAppText(
  page: Page,
  pattern: RegExp,
  timeoutMs: number,
  description: string
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await maggiEnableFlutterAccessibility(page);
    const candidate = await maggiFindVisibleAppText(page, pattern);
    if (candidate) return candidate;
    await page.waitForTimeout(750);
  }

  const snapshot = await maggiPageSnapshot(page);
  throw new Error(
    description +
      " não carregou. URL atual: " +
      snapshot.url +
      ". Texto visível: " +
      snapshot.text +
      ". Elementos acessíveis: " +
      snapshot.ariaLabels.join(" | ").slice(0, 800)
  );
}

function maggiRouteUrl(
  requiredEnv: RegisterDeps["requiredEnv"],
  page: Page,
  path: string
) {
  const normalizedPath = "/" + String(path || "").replace(/^\\/+/, "");
  const currentUrl = page.url();

  try {
    const current = new URL(currentUrl);
    const configured = new URL(requiredEnv("MAGGI_AVAILABLE_GROUPS_PORTAL_URL"));
    const currentWithoutHash = current.toString().split("#")[0];

    if (current.hash) return currentWithoutHash + "#" + normalizedPath;

    const currentPathRoute = current.pathname.match(
      /^(.*?)(?:\\/(?:home|vendedor\\/(?:login|simulacao|estatisticas)).*)$/i
    );
    if (currentPathRoute?.[1]) {
      current.pathname = currentPathRoute[1].replace(/\\/+$/, "") + normalizedPath;
      current.search = "";
      current.hash = "";
      return current.toString();
    }

    if (/\\/index\\.html$/i.test(current.pathname) || /\\/index\\.html$/i.test(configured.pathname)) {
      configured.search = "";
      configured.hash = "#" + normalizedPath;
      return configured.toString();
    }
  } catch {
    // Usa a montagem por caminho como último recurso.
  }

  return appUrl(requiredEnv, normalizedPath);
}

async function maggiNavigateInApp(
  deps: RegisterDeps,
  page: Page,
  path: string,
  destinationPattern: RegExp,
  description: string
) {
  const normalizedPath = "/" + String(path || "").replace(/^\\/+/, "");
  const navigationPattern = /estatisticas/i.test(normalizedPath)
    ? /Estat[íi]sticas/i
    : /Simula(?:ç|c)[aã]o/i;

  await maggiEnableFlutterAccessibility(page);
  const navigationControl = await maggiFindVisibleAppText(page, navigationPattern);
  if (navigationControl) {
    await navigationControl.click({ force: true }).catch(() => null);
    await waitSettled(deps, page, 12000);
    await page.waitForTimeout(750);
  }

  let destination = await maggiFindVisibleAppText(page, destinationPattern);
  if (destination) return destination;

  await page.evaluate((targetPath) => {
    const current = new URL(window.location.href);

    if (current.hash) {
      current.hash = "#" + targetPath;
      window.history.pushState({}, "", current.toString());
    } else {
      const appBasePath = current.pathname.replace(
        /\\/vendedor\\/(?:login|simulacao|estatisticas)(?:\\/.*)?$/i,
        ""
      );
      current.pathname = appBasePath.replace(/\\/+$/, "") + targetPath;
      current.search = "";
      current.hash = "";
      window.history.pushState({}, "", current.toString());
    }

    window.dispatchEvent(
      new PopStateEvent("popstate", { state: window.history.state })
    );
  }, normalizedPath);

  await waitSettled(deps, page, 15000);
  destination = await maggiWaitForAppText(
    page,
    destinationPattern,
    45000,
    description
  );
  return destination;
}

async function maggiLooksLike404(page: Page) {
  const bodyText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  return /Server Error 404|File or directory not found|resource you are looking for/i.test(bodyText);
}

async function maggiGotoEntry(deps: RegisterDeps, page: Page) {
  let lastUrl = "";
  let lastText = "";

  for (const url of maggiEntryUrls(deps)) {
    lastUrl = url;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    await waitSettled(deps, page, 15000);
    await page.waitForTimeout(1500);
    await maggiEnableFlutterAccessibility(page);

    lastText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
    if (await maggiHasLoginInputs(page)) return true;
    const hasSellerEntry = await page
      .getByRole("button", { name: "SOU VENDEDOR", exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    if (hasSellerEntry && !(await maggiLooksLike404(page))) return true;
    if (/SOU\\s+VENDEDOR|CONS[ÓO]RCIO\\s+MAGGI|MAGGI/i.test(lastText) && !(await maggiLooksLike404(page))) return true;
  }

  throw new Error(
    "Não foi possível carregar a entrada do app Maggi. Última URL testada: " +
      lastUrl +
      ". Texto visível: " +
      lastText.replace(/\\s+/g, " ").slice(0, 300)
  );
}

async function maggiHasLoginInputs(page: Page) {
  const hasUsername = await page
    .locator(
      'input[placeholder*="Código" i], input[placeholder*="Codigo" i], input[aria-label*="Código" i], input[aria-label*="Codigo" i], input[aria-label*="vendedor" i]'
    )
    .first()
    .isVisible()
    .catch(() => false);
  const hasPassword = await page
    .locator('input[type="password"], input[placeholder*="Senha" i], input[aria-label*="Senha" i]')
    .first()
    .isVisible()
    .catch(() => false);
  return hasUsername && hasPassword;
}

async function maggiClickSouVendedor(deps: RegisterDeps, page: Page) {
  await maggiEnableFlutterAccessibility(page);

  const flutterButton = page
    .getByRole("button", { name: "SOU VENDEDOR", exact: true })
    .first();
  if (await flutterButton.isVisible().catch(() => false)) {
    await flutterButton.click({ force: true });
    return true;
  }

  const clickedByText = await clickText(page, "SOU VENDEDOR", true).catch(() => false);
  if (clickedByText) return true;

  const clickedBySelector = await clickFirstVisibleSafe(deps, page, [
    'button:has-text("SOU VENDEDOR")',
    'ion-button:has-text("SOU VENDEDOR")',
    '[role="button"]:has-text("SOU VENDEDOR")',
    'a:has-text("SOU VENDEDOR")',
    'div:has-text("SOU VENDEDOR")',
  ]);
  if (clickedBySelector) return true;

  const buttonBox = await page.getByText(/SOU\\s+VENDEDOR/i).first().boundingBox().catch(() => null);
  if (buttonBox) {
    await page.mouse.click(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
    return true;
  }

  const viewport = page.viewportSize() || { width: 1366, height: 900 };
  await page.mouse.click(viewport.width / 2, Math.max(50, viewport.height - 55));
  return true;
}

async function ensureMaggiLoginForm(deps: RegisterDeps, page: Page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await maggiHasLoginInputs(page)) return;

    await maggiClickSouVendedor(deps, page).catch(() => false);
    await waitSettled(deps, page, 12000);
    await page.waitForTimeout(1000);
    if (await maggiHasLoginInputs(page)) return;

    await maggiGotoEntry(deps, page);
  }

  const url = page.url();
  const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  throw new Error(
    "Tela de login Maggi não carregou os campos de usuário/senha. URL atual: " +
      url +
      ". Texto visível: " +
      text.replace(/\\s+/g, " ").slice(0, 300)
  );
}
`;

replaceOnce(helperNeedle, helperReplacement, "async function maggiGotoEntry");

replaceOnce(
`function appBaseUrl(requiredEnv: RegisterDeps["requiredEnv"]) {
  const portalUrl = requiredEnv("MAGGI_AVAILABLE_GROUPS_PORTAL_URL").replace(/\\/+$/, "");
  return portalUrl.replace(/\\/(home|vendedor\\/login|vendedor\\/simulacao|vendedor\\/estatisticas).*$/i, "");
}`,
`function appBaseUrl(requiredEnv: RegisterDeps["requiredEnv"]) {
  const portalUrl = requiredEnv("MAGGI_AVAILABLE_GROUPS_PORTAL_URL")
    .replace(/[?#].*$/, "")
    .replace(/\\/+$/, "");
  return portalUrl
    .replace(/\\/index\\.html$/i, "")
    .replace(/\\/(home|vendedor\\/login|vendedor\\/simulacao|vendedor\\/estatisticas).*$/i, "");
}`,
".replace(/\\/index\\.html$/i, \"\")"
);

replaceOnce(
`  await page.goto(deps.requiredEnv("MAGGI_AVAILABLE_GROUPS_PORTAL_URL"), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });`,
`  await maggiGotoEntry(deps, page);`,
"await maggiGotoEntry(deps, page);"
);

replaceOnce(
`  await page.goto(appUrl(deps.requiredEnv, "/home"), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });`,
`  await maggiGotoEntry(deps, page);`,
"await maggiGotoEntry(deps, page);"
);

replaceOnce(
`  await waitSettled(deps, page, 20000);
  await page.getByText("Simulação").first().waitFor({ timeout: 30000 }).catch(() => null);`,
`  await waitSettled(deps, page, 20000);
  await maggiWaitForAppText(
    page,
    MAGGI_SIMULATION_TEXT,
    45000,
    "Tela de simulação Maggi"
  );`,
"Tela de simulação Maggi"
);

replaceOnce(
`  await waitSettled(deps, page, 20000);

  const clicked = await clickFirstVisibleSafe(deps, page, [`,
`  await waitSettled(deps, page, 20000);
  await maggiWaitForAppText(
    page,
    /Sincronizar/i,
    45000,
    "Tela de estatísticas Maggi"
  );

  const clicked = await clickFirstVisibleSafe(deps, page, [`,
"Tela de estatísticas Maggi"
);

replaceOnce(
`  if (!clicked) await clickText(page, "Sincronizar").catch(() => false);`,
`  if (!clicked) {
    const syncControl = await maggiWaitForAppText(
      page,
      /Sincronizar/i,
      15000,
      "Ação Sincronizar da Maggi"
    );
    await syncControl.click({ force: true });
  }`,
"Ação Sincronizar da Maggi"
);

replaceOnce(
`  await waitSettled(deps, page, 60000);
  await page.getByText("Simulação").first().waitFor({ timeout: 60000 }).catch(() => null);
  deps.log("login Maggi concluído");`,
`  await waitSettled(deps, page, 60000);
  await maggiWaitForAppText(
    page,
    MAGGI_SIMULATION_TEXT,
    60000,
    "Confirmação do login Maggi"
  );
  deps.log("login Maggi concluído", { url: page.url() });`,
"Confirmação do login Maggi"
);

replaceOnce(
`  await page.goto(appUrl(deps.requiredEnv, "/vendedor/simulacao"), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });`,
`  await maggiNavigateInApp(
    deps,
    page,
    "/vendedor/simulacao",
    MAGGI_SIMULATION_TEXT,
    "Tela de simulação Maggi"
  );`,
"await maggiNavigateInApp(\n    deps,\n    page,\n    \"/vendedor/simulacao\""
);

replaceOnce(
`  await page.goto(appUrl(deps.requiredEnv, "/vendedor/estatisticas"), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });`,
`  await maggiNavigateInApp(
    deps,
    page,
    "/vendedor/estatisticas",
    /Sincronizar/i,
    "Tela de estatísticas Maggi"
  );`,
"await maggiNavigateInApp(\n    deps,\n    page,\n    \"/vendedor/estatisticas\""
);

replaceOnce(
`  const segmentText = page.getByText(segment.label, { exact: true }).first();
  await segmentText.waitFor({ timeout: 30000 });
  await segmentText.click({ force: true });

  const clicked = await clickFirstVisibleSafe(deps, page, [
    'button:has-text("SIMULAR CONSÓRCIO")',
    'ion-button:has-text("SIMULAR CONSÓRCIO")',
  ]);

  if (!clicked) await clickText(page, "SIMULAR CONSÓRCIO", true);`,
`  const segmentText = await maggiWaitForAppText(
    page,
    maggiSegmentPattern(segment),
    45000,
    "Segmento " + segment.label + " da Maggi"
  );
  await segmentText.click({ force: true });

  const simulateControl = await maggiWaitForAppText(
    page,
    /SIMULAR\\s+CONS[ÓO]RCIO/i,
    30000,
    "Ação Simular Consórcio da Maggi"
  );
  const clicked = await clickFirstVisibleSafe(deps, page, [
    'button:has-text("SIMULAR CONSÓRCIO")',
    'ion-button:has-text("SIMULAR CONSÓRCIO")',
  ]);

  if (!clicked) await simulateControl.click({ force: true });`,
"Ação Simular Consórcio da Maggi"
);

replaceOnce(
`  await clickText(page, "SOU VENDEDOR", true).catch(() => false);
  await waitSettled(deps, page, 12000);

  await fillFirstVisibleSafe(`,
`  await maggiClickSouVendedor(deps, page).catch(() => false);
  await waitSettled(deps, page, 12000);
  await ensureMaggiLoginForm(deps, page);

  await fillFirstVisibleSafe(`,
"await ensureMaggiLoginForm(deps, page);"
);

replaceOnce(
`      optionalEnv("MAGGI_AVAILABLE_GROUPS_USERNAME_SELECTOR"),
      'input[placeholder*="Código" i]',
      'input[aria-label*="Código" i]',
      'input[name*="codigo" i]',
      'input[name*="vendedor" i]',
      'input[type="text"]',
      'input:not([type])',`,
`      optionalEnv("MAGGI_AVAILABLE_GROUPS_USERNAME_SELECTOR"),
      'input[placeholder*="Código do vendedor" i]',
      'input[placeholder*="Codigo do vendedor" i]',
      'input[placeholder*="Código" i]',
      'input[placeholder*="Codigo" i]',
      'input[placeholder*="vendedor" i]',
      'input[aria-label*="Código" i]',
      'input[aria-label*="Codigo" i]',
      'input[aria-label*="vendedor" i]',
      'input[name*="codigo" i]',
      'input[name*="vendedor" i]',
      'input[formcontrolname*="codigo" i]',
      'input[formcontrolname*="vendedor" i]',
      '.mat-input-element[type="text"]',
      '.mat-mdc-input-element[type="text"]',
      'ion-input input',
      'input[type="text"]',
      'input:not([type])',
      'input',`,
"input[placeholder*=\"Codigo do vendedor\" i]"
);

replaceOnce(
`      optionalEnv("MAGGI_AVAILABLE_GROUPS_PASSWORD_SELECTOR"),
      'input[type="password"]',
      'input[placeholder*="Senha" i]',
      'input[aria-label*="Senha" i]',
      'input[name*="senha" i]',`,
`      optionalEnv("MAGGI_AVAILABLE_GROUPS_PASSWORD_SELECTOR"),
      'input[type="password"]',
      'input[placeholder*="Senha" i]',
      'input[aria-label*="Senha" i]',
      'input[name*="senha" i]',
      'input[formcontrolname*="senha" i]',
      'input[formcontrolname*="password" i]',
      '.mat-input-element[type="password"]',
      '.mat-mdc-input-element[type="password"]',
      'ion-input input[type="password"]',`,
"input[formcontrolname*=\"password\" i]"
);

const loginAndSyncHelpers = String.raw`
const MAGGI_LOGIN_MAX_ATTEMPTS = 2;

function maggiUsernameSelectors() {
  return [
    optionalEnv("MAGGI_AVAILABLE_GROUPS_USERNAME_SELECTOR"),
    'input[placeholder*="Código do vendedor" i]',
    'input[placeholder*="Codigo do vendedor" i]',
    'input[placeholder*="Código" i]',
    'input[placeholder*="Codigo" i]',
    'input[placeholder*="vendedor" i]',
    'input[aria-label*="Código" i]',
    'input[aria-label*="Codigo" i]',
    'input[aria-label*="vendedor" i]',
    'input[name*="codigo" i]',
    'input[name*="vendedor" i]',
    'input[formcontrolname*="codigo" i]',
    'input[formcontrolname*="vendedor" i]',
    '.mat-input-element[type="text"]',
    '.mat-mdc-input-element[type="text"]',
    'ion-input input',
    'input[type="text"]',
    'input:not([type])',
  ];
}

function maggiPasswordSelectors() {
  return [
    optionalEnv("MAGGI_AVAILABLE_GROUPS_PASSWORD_SELECTOR"),
    'input[type="password"]',
    'input[placeholder*="Senha" i]',
    'input[aria-label*="Senha" i]',
    'input[name*="senha" i]',
    'input[formcontrolname*="senha" i]',
    'input[formcontrolname*="password" i]',
    '.mat-input-element[type="password"]',
    '.mat-mdc-input-element[type="password"]',
    'ion-input input[type="password"]',
  ];
}

async function maggiFindVisibleInput(page: Page, selectors: string[]) {
  for (const selector of selectors.map((item) => item.trim()).filter(Boolean)) {
    const fields = page.locator(selector);
    const count = Math.min(await fields.count().catch(() => 0), 4);

    for (let index = 0; index < count; index++) {
      const field = fields.nth(index);
      if (
        (await field.isVisible().catch(() => false)) &&
        (await field.isEnabled().catch(() => false))
      ) {
        return field;
      }
    }
  }

  return null;
}

async function maggiTypeLoginField(
  deps: RegisterDeps,
  page: Page,
  selectors: string[],
  value: string,
  fieldName: "usuario" | "senha"
) {
  const field = await maggiFindVisibleInput(page, selectors);
  if (!field) throw new Error("Campo de " + fieldName + " da Maggi não encontrado.");

  await field.click({ force: true });
  await field.press("Control+A").catch(() => null);
  await field.press("Backspace").catch(() => null);
  await field.type(value, { delay: 35 });
  await field.press("Tab").catch(() => null);

  const receivedValue = await field.inputValue({ timeout: 3000 }).catch(() => "");
  const confirmed = receivedValue === value;
  deps.log("campo de login Maggi preenchido", {
    campo: fieldName,
    confirmado: confirmed,
  });

  if (!confirmed) {
    throw new Error(
      "O campo de " + fieldName + " da Maggi não confirmou o valor digitado."
    );
  }

  return field;
}

function maggiStartLoginResponseCollector(page: Page) {
  const responses: Array<{ status: number; path: string }> = [];
  const listener = (response: any) => {
    try {
      const resourceType = response.request().resourceType();
      if (!["document", "fetch", "xhr"].includes(resourceType)) return;

      const url = new URL(response.url());
      const path = url.pathname;
      if (!/login|auth|token|session|vendedor/i.test(path)) return;

      responses.push({ status: response.status(), path });
      if (responses.length > 12) responses.shift();
    } catch {
      // A resposta serve apenas para diagnóstico e nunca bloqueia o login.
    }
  };

  page.on("response", listener);
  return () => {
    page.off("response", listener);
    return responses;
  };
}

async function maggiWaitForLoginOutcome(page: Page, timeoutMs: number) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    await maggiEnableFlutterAccessibility(page);
    if (await maggiFindVisibleAppText(page, MAGGI_SIMULATION_TEXT)) {
      return { status: "success" as const, message: "" };
    }

    const visibleText = await page
      .locator("body")
      .innerText({ timeout: 3000 })
      .catch(() => "");
    const rejection = visibleText.match(
      /(?:usu[aá]rio|c[oó]digo|senha|credenciais?|dados)[^\n.]{0,90}(?:inv[aá]lid|incorret|n[aã]o\s+confere|n[aã]o\s+encontrad)|acesso\s+negado|n[aã]o\s+autorizado/i
    );
    if (rejection) {
      return {
        status: "rejected" as const,
        message: rejection[0].replace(/\s+/g, " ").trim().slice(0, 180),
      };
    }

    await page.waitForTimeout(750);
  }

  return { status: "timeout" as const, message: "" };
}
`;

replaceOnce(
  "async function loginMaggi(deps: RegisterDeps, page: Page) {",
  loginAndSyncHelpers + "\nasync function loginMaggi(deps: RegisterDeps, page: Page) {",
  "async function maggiTypeLoginField("
);

const robustLoginFunction = String.raw`async function loginMaggi(deps: RegisterDeps, page: Page) {
  deps.log("login Maggi iniciado");

  await maggiGotoEntry(deps, page);
  await ensureMaggiLoginForm(deps, page);

  const username = deps.requiredEnv("MAGGI_AVAILABLE_GROUPS_USERNAME");
  const password = deps.requiredEnv("MAGGI_AVAILABLE_GROUPS_PASSWORD");
  let lastResponses: Array<{ status: number; path: string }> = [];

  for (let attempt = 1; attempt <= MAGGI_LOGIN_MAX_ATTEMPTS; attempt++) {
    await maggiEnableFlutterAccessibility(page);
    await ensureMaggiLoginForm(deps, page);

    const stopCollecting = maggiStartLoginResponseCollector(page);
    let submitMethod = "click";
    let outcome: Awaited<ReturnType<typeof maggiWaitForLoginOutcome>>;

    try {
      await maggiTypeLoginField(
        deps,
        page,
        maggiUsernameSelectors(),
        username,
        "usuario"
      );
      const passwordField = await maggiTypeLoginField(
        deps,
        page,
        maggiPasswordSelectors(),
        password,
        "senha"
      );

      const loginButton = await maggiWaitForAppText(
        page,
        /ACESSAR\s+MINHA\s+CONTA/i,
        15000,
        "Botão de acesso da Maggi"
      );

      const clicked = await loginButton
        .click({ force: true })
        .then(() => true)
        .catch(() => false);

      if (!clicked) {
        submitMethod = "enter";
        await passwordField.click({ force: true }).catch(() => null);
        await passwordField.press("Enter");
      }

      outcome = await maggiWaitForLoginOutcome(page, 30000);

      if (outcome.status === "timeout" && clicked) {
        submitMethod = "click+enter";
        await passwordField.click({ force: true }).catch(() => null);
        await passwordField.press("Enter").catch(() => page.keyboard.press("Enter"));
        outcome = await maggiWaitForLoginOutcome(page, 30000);
      }
    } finally {
      lastResponses = stopCollecting();
    }

    deps.log("tentativa de login Maggi concluída", {
      tentativa: attempt,
      metodo: submitMethod,
      resultado: outcome.status,
      respostas: lastResponses,
    });

    if (outcome.status === "success") {
      deps.log("login Maggi autenticado após envio compatível", {
        tentativa: attempt,
        url: page.url(),
      });
      return;
    }

    if (outcome.status === "rejected") {
      throw new Error("O portal Maggi recusou o login: " + outcome.message);
    }

    if (attempt < MAGGI_LOGIN_MAX_ATTEMPTS) {
      await page.waitForTimeout(2000);
      await maggiEnableFlutterAccessibility(page);
    }
  }

  const snapshot = await maggiPageSnapshot(page);
  throw new Error(
    "O portal Maggi permaneceu no login após duas tentativas. URL atual: " +
      snapshot.url +
      ". Respostas observadas: " +
      JSON.stringify(lastResponses) +
      ". Texto visível: " +
      snapshot.text
  );
}

`;

replaceBlock(
  "async function loginMaggi(deps: RegisterDeps, page: Page) {",
  "async function goToSimulationHome(deps: RegisterDeps, page: Page) {",
  robustLoginFunction,
  "login Maggi autenticado após envio compatível"
);

const robustInternalSyncFunction = String.raw`async function runInternalSync(deps: RegisterDeps, page: Page) {
  deps.log("sincronização interna Maggi iniciada");

  await maggiNavigateInApp(
    deps,
    page,
    "/vendedor/estatisticas",
    /(?:\+\s*)?Opções/i,
    "Tela de estatísticas Maggi"
  );
  await waitSettled(deps, page, 20000);

  const optionsControl = await maggiWaitForAppText(
    page,
    /(?:\+\s*)?Opções/i,
    45000,
    "Menu + Opções da Maggi"
  );
  await optionsControl.click({ force: true });
  deps.log("menu + Opções da Maggi aberto");

  let syncControl = await maggiFindVisibleAppText(page, /Sincronizar/i);
  if (!syncControl) {
    syncControl = await maggiWaitForAppText(
      page,
      /Sincronizar/i,
      8000,
      "Ação Sincronizar da Maggi"
    ).catch(() => null);
  }

  if (!syncControl) {
    await optionsControl.press("Enter").catch(() => null);
    syncControl = await maggiWaitForAppText(
      page,
      /Sincronizar/i,
      15000,
      "Ação Sincronizar da Maggi"
    );
  }

  await syncControl.click({ force: true }).catch(() => syncControl!.press("Enter"));

  const waitMs = Number(process.env.MAGGI_AVAILABLE_GROUPS_INTERNAL_SYNC_WAIT_MS || 25000);
  await waitSettled(deps, page, waitMs);
  await page.waitForTimeout(Math.min(5000, Math.max(1000, waitMs / 5)));

  deps.log("sincronização interna Maggi concluída");
  await goToSimulationHome(deps, page);
}

`;

replaceBlock(
  "async function runInternalSync(deps: RegisterDeps, page: Page) {",
  "async function openFormField(page: Page, label: string) {",
  robustInternalSyncFunction,
  "menu + Opções da Maggi aberto"
);

const robustFlutterFormFunctions = String.raw`async function openFormField(page: Page, label: string) {
  const labelRegex = new RegExp(escapeRegExp(label), "i");
  const started = Date.now();

  while (Date.now() - started < 45000) {
    await maggiEnableFlutterAccessibility(page);
    const candidates = [
      page.getByRole("combobox", { name: labelRegex }).first(),
      page.getByRole("button", { name: labelRegex }).first(),
      page.getByLabel(labelRegex).first(),
      page.locator("mat-form-field").filter({ hasText: labelRegex }).first(),
      page.locator("ion-item").filter({ hasText: labelRegex }).first(),
      page.locator("label").filter({ hasText: labelRegex }).first(),
      page.getByText(labelRegex).first(),
    ];

    for (const candidate of candidates) {
      if (!(await candidate.isVisible().catch(() => false))) continue;

      let activated = await candidate
        .click({ force: true })
        .then(() => true)
        .catch(() => false);

      if (!activated) {
        activated = await candidate
          .press("Enter")
          .then(() => true)
          .catch(() => false);
      }

      if (!activated) {
        const box = await candidate.boundingBox().catch(() => null);
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          activated = true;
        }
      }

      if (activated) {
        await page.waitForTimeout(700);
        return;
      }
    }

    await page.waitForTimeout(500);
  }

  const snapshot = await maggiPageSnapshot(page);
  throw new Error(
    "Campo Maggi não encontrado: " +
      label +
      ". Texto visível: " +
      snapshot.text +
      ". Elementos acessíveis: " +
      snapshot.ariaLabels.join(" | ").slice(0, 800)
  );
}

async function openSelect(page: Page, label: string) {
  await openFormField(page, label);
  await maggiEnableFlutterAccessibility(page);
  await page.waitForTimeout(700);
}

async function chooseOpenOption(deps: RegisterDeps, page: Page, optionText: string) {
  const optionRegex = new RegExp(escapeRegExp(optionText), "i");
  const started = Date.now();

  while (Date.now() - started < 30000) {
    await maggiEnableFlutterAccessibility(page);
    const candidates = [
      page.getByRole("option", { name: optionRegex }).first(),
      page.getByRole("button", { name: optionRegex }).first(),
      page.getByLabel(optionRegex).first(),
      page
        .locator(
          '[role="option"], mat-option, .mat-option, .mat-mdc-option, ion-select-popover ion-item, .popover-content ion-item'
        )
        .filter({ hasText: optionRegex })
        .first(),
      page.getByText(optionRegex).first(),
    ];

    for (const option of candidates) {
      if (!(await option.isVisible().catch(() => false))) continue;
      const selected = await option
        .click({ force: true })
        .then(() => true)
        .catch(() => option.press("Enter").then(() => true).catch(() => false));
      if (!selected) continue;

      await waitSettled(deps, page, 10000);
      return true;
    }

    await page.waitForTimeout(500);
  }

  return false;
}

async function chooseFirstOpenOption(deps: RegisterDeps, page: Page) {
  await maggiEnableFlutterAccessibility(page);
  const options = page.locator(
    '[role="option"], mat-option, .mat-option, .mat-mdc-option, ion-select-popover ion-item, .popover-content ion-item'
  );
  const count = await options.count().catch(() => 0);

  for (let index = 0; index < count; index++) {
    const option = options.nth(index);
    if (!(await option.isVisible().catch(() => false))) continue;
    const text = (
      (await option.getAttribute("aria-label").catch(() => "")) ||
      (await option.innerText().catch(() => ""))
    ).trim();
    if (!text) continue;

    await option.click({ force: true });
    await waitSettled(deps, page, 10000);
    return true;
  }

  await page.keyboard.press("ArrowDown").catch(() => null);
  const selectedByKeyboard = await page.keyboard
    .press("Enter")
    .then(() => true)
    .catch(() => false);
  if (selectedByKeyboard) await waitSettled(deps, page, 10000);
  return selectedByKeyboard;
}

async function selectByText(deps: RegisterDeps, page: Page, label: string, optionText: string) {
  await openSelect(page, label);
  const selected = await chooseOpenOption(deps, page, optionText);
  if (!selected) {
    const snapshot = await maggiPageSnapshot(page);
    throw new Error(
      "Opção não encontrada em " +
        label +
        ": " +
        optionText +
        ". Elementos acessíveis: " +
        snapshot.ariaLabels.join(" | ").slice(0, 800)
    );
  }
}

async function selectVendedorIfNeeded(deps: RegisterDeps, page: Page) {
  await maggiEnableFlutterAccessibility(page);
  const vendedorField = await maggiFindVisibleAppText(page, /^Vendedor(?:\s|$)/i);
  if (!vendedorField) return;

  const disabled = await vendedorField.getAttribute("disabled").catch(() => null);
  const ariaDisabled = await vendedorField.getAttribute("aria-disabled").catch(() => null);
  const className = await vendedorField.getAttribute("class").catch(() => "");
  if (
    disabled !== null ||
    ariaDisabled === "true" ||
    String(className || "").includes("disabled")
  ) {
    return;
  }

  await openSelect(page, "Vendedor").catch(() => null);
  const preferred = optionalEnv("MAGGI_AVAILABLE_GROUPS_VENDEDOR_TEXT");
  if (preferred && (await chooseOpenOption(deps, page, preferred))) return;
  await chooseFirstOpenOption(deps, page).catch(() => null);
}

async function clickContinue(deps: RegisterDeps, page: Page) {
  for (let attempt = 0; attempt < 90; attempt++) {
    await maggiEnableFlutterAccessibility(page);
    const button = await maggiFindVisibleAppText(page, /^CONTINUAR$/i);

    if (button) {
      const disabled = await button.getAttribute("disabled").catch(() => null);
      const ariaDisabled = await button.getAttribute("aria-disabled").catch(() => null);
      const className = await button.getAttribute("class").catch(() => "");
      if (
        disabled === null &&
        ariaDisabled !== "true" &&
        !String(className || "").includes("disabled")
      ) {
        const clicked = await button
          .click({ force: true })
          .then(() => true)
          .catch(() => button.press("Enter").then(() => true).catch(() => false));
        if (clicked) {
          await waitSettled(deps, page, 20000);
          return;
        }
      }
    }

    await page.waitForTimeout(500);
  }

  const snapshot = await maggiPageSnapshot(page);
  throw new Error(
    "Botão CONTINUAR não habilitou na Maggi. Elementos acessíveis: " +
      snapshot.ariaLabels.join(" | ").slice(0, 800)
  );
}

async function selectSegment(deps: RegisterDeps, page: Page, segment: MaggiAvailableSegmentConfig) {
  await goToSimulationHome(deps, page);
  deps.log("selecionando segmento Maggi", { segmento: segment.key });

  const segmentText = await maggiWaitForAppText(
    page,
    maggiSegmentPattern(segment),
    45000,
    "Segmento " + segment.label + " da Maggi"
  );
  await segmentText.click({ force: true });

  const simulateControl = await maggiWaitForAppText(
    page,
    /SIMULAR\s+CONS[ÓO]RCIO/i,
    30000,
    "Ação Simular Consórcio da Maggi"
  );
  await simulateControl
    .click({ force: true })
    .catch(() => simulateControl.press("Enter"));
  await waitSettled(deps, page, 20000);

  await maggiWaitForAppText(
    page,
    /Revenda|Vendedor|CONTINUAR/i,
    45000,
    "Formulário do segmento Maggi"
  );
  deps.log("formulário Flutter Maggi acessível", { segmento: segment.key });
}

async function selectRevendaAndContinue(deps: RegisterDeps, page: Page, segment: MaggiAvailableSegmentConfig) {
  await maggiWaitForAppText(page, /Revenda/i, 30000, "Campo Revenda da Maggi");
  await selectByText(deps, page, "Revenda", segment.revendaText);
  await selectVendedorIfNeeded(deps, page);
  await clickContinue(deps, page);
  await maggiWaitForAppText(page, /Grupo/i, 45000, "Campo Grupo da Maggi");
}

async function collectOpenGroupOptions(page: Page) {
  const groups = new Set<string>();
  let stagnantRounds = 0;

  for (let round = 0; round < 60; round++) {
    const beforeSize = groups.size;
    await maggiEnableFlutterAccessibility(page);

    const texts = await page
      .locator(
        '[role="option"], mat-option, .mat-option, .mat-mdc-option, .cdk-overlay-pane .mdc-list-item, ion-select-popover ion-item, .popover-content ion-item, flt-semantics[aria-label]'
      )
      .evaluateAll((nodes) =>
        nodes.map((node) =>
          (
            node.getAttribute("aria-label") ||
            (node as HTMLElement).innerText ||
            node.textContent ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim()
        )
      )
      .catch(() => [] as string[]);

    for (const text of texts) {
      const group = normalizeGroupCode(text);
      if (group) groups.add(group);
    }

    const listbox = page.getByRole("listbox").first();
    const box = await listbox.boundingBox().catch(() => null);
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }
    await page.mouse.wheel(0, 700).catch(() => null);
    await page.keyboard.press("PageDown").catch(() => null);
    await page.waitForTimeout(500);

    if (groups.size > beforeSize) stagnantRounds = 0;
    else stagnantRounds += 1;
    if (stagnantRounds >= 4) break;
  }

  await page.keyboard.press("Escape").catch(() => null);
  return Array.from(groups).sort((a, b) => Number(a) - Number(b));
}

`;

replaceBlock(
  "async function openFormField(page: Page, label: string) {",
  "async function readGroupsForSegment(deps: RegisterDeps, page: Page, segment: MaggiAvailableSegmentConfig) {",
  robustFlutterFormFunctions,
  "formulário Flutter Maggi acessível"
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch maggi login resilience: applied");
} else {
  console.log("patch maggi login resilience: no changes");
}
