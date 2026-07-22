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
    const toggle = page
      .locator('flt-semantics-placeholder[aria-label="Enable accessibility"]')
      .first();
    const toggleCount = await toggle.count().catch(() => 0);

    if (toggleCount > 0) {
      await toggle.press("Enter").catch(async () => {
        await toggle.click({ force: true }).catch(() => null);
      });
    }

    const semanticsCount = await page.locator("flt-semantics").count().catch(() => 0);
    if (semanticsCount > 0) return true;
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
    page.getByRole("button", { name: pattern }).first(),
    page.getByText(pattern).first(),
    page.getByLabel(pattern).first(),
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
`  await page.goto(
    maggiRouteUrl(deps.requiredEnv, page, "/vendedor/simulacao"),
    {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    }
  );`,
"maggiRouteUrl(deps.requiredEnv, page, \"/vendedor/simulacao\")"
);

replaceOnce(
`  await page.goto(appUrl(deps.requiredEnv, "/vendedor/estatisticas"), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });`,
`  await page.goto(
    maggiRouteUrl(deps.requiredEnv, page, "/vendedor/estatisticas"),
    {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    }
  );`,
"maggiRouteUrl(deps.requiredEnv, page, \"/vendedor/estatisticas\")"
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

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch maggi login resilience: applied");
} else {
  console.log("patch maggi login resilience: no changes");
}
