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
  return inputCount > 0 && hasLoginText;
}

async function ensureMaggiLoginForm(deps: RegisterDeps, page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await maggiHasLoginInputs(page)) return;

    await clickText(page, "SOU VENDEDOR", true).catch(() => false);
    await waitSettled(deps, page, 10000);
    if (await maggiHasLoginInputs(page)) return;

    await page.goto(appUrl(deps.requiredEnv, "/vendedor/login"), {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitSettled(deps, page, 15000);
    await page.waitForTimeout(1200);
    if (await maggiHasLoginInputs(page)) return;
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
`  await clickText(page, "SOU VENDEDOR", true).catch(() => false);
  await waitSettled(deps, page, 12000);

  await fillFirstVisibleSafe(`,
`  await clickText(page, "SOU VENDEDOR", true).catch(() => false);
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
