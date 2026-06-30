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
async function maggiHasLoginInputs(page: Page) {
  const inputCount = await page.locator('input, ion-input input, textarea').count().catch(() => 0);
  const hasLoginText = await page.getByText(/Bem-vindo|Código do vendedor|Codigo do vendedor|Senha/i).first().isVisible().catch(() => false);
  return inputCount >= 2 && hasLoginText;
}

async function maggiClickSouVendedor(deps: RegisterDeps, page: Page) {
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

  const buttonBox = await page.getByText(/SOU\s+VENDEDOR/i).first().boundingBox().catch(() => null);
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

    await page.goto(appUrl(deps.requiredEnv, "/home"), {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitSettled(deps, page, 15000);
    await page.waitForTimeout(1500);
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

replaceOnce(helperNeedle, helperReplacement, "async function ensureMaggiLoginForm");

replaceOnce(
`  await page.goto(deps.requiredEnv("MAGGI_AVAILABLE_GROUPS_PORTAL_URL"), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });`,
`  await page.goto(appUrl(deps.requiredEnv, "/home"), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });`,
"page.goto(appUrl(deps.requiredEnv, \"/home\")"
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
