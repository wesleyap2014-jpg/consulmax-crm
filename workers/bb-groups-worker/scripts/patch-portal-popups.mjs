import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../src/index.ts', import.meta.url);
let source = readFileSync(file, 'utf8');

const patchedDismiss = `async function dismissPostLoginMessages(page: Page) {
  const candidates = [
    'button:has-text("Fechar")',
    'a:has-text("Fechar")',
    'input[value="Fechar"]',
    '.ui-dialog-titlebar-close',
    '[aria-label="Close"]',
    '[title="Fechar"]',
    '[title="Close"]',
    '#ctl00_Conteudo_div_img_banner a',
    '#ctl00_Conteudo_div_img_banner button',
    '.divWrapPopUp a:has-text("X")',
    '.divWrapPopUp button:has-text("X")',
  ];

  for (let round = 0; round < 4; round++) {
    let clicked = false;

    for (const selector of candidates) {
      const locator = page.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        await locator.click({ timeout: 1500 }).catch(() => null);
        await page.waitForTimeout(400);
        clicked = true;
        break;
      }
    }

    if (!clicked) break;
  }

  await page.evaluate(() => {
    const blockers = [
      '#ctl00_Conteudo_div_img_banner',
      '.divWrapPopUp',
      '.ui-widget-overlay',
      '.modal-backdrop',
    ];

    for (const selector of blockers) {
      document.querySelectorAll(selector).forEach((element) => {
        const el = element as HTMLElement;
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
      });
    }
  }).catch(() => null);
}`;

const oldDismiss = /async function dismissPostLoginMessages\(page: Page\) \{[\s\S]*?\n\}\n\nasync function login\(page: Page\)/;
source = source.replace(oldDismiss, `${patchedDismiss}\n\nasync function login(page: Page)`);

const oldClick = `      await link.click();
      await waitDom(page, 8000);`;
const newClick = `      await dismissPostLoginMessages(page);
      await link.click({ timeout: 5000 }).catch(async () => {
        await link.evaluate((element) => (element as HTMLElement).click());
      });
      await waitDom(page, 8000);`;
source = source.replace(oldClick, newClick);

const patchedAvailableVendaValues = `async function availableVendaValues(page: Page) {
  const venda = page.locator(SELECTORS.venda);

  if (!(await venda.isVisible().catch(() => false))) {
    return [];
  }

  if (!(await venda.isEnabled().catch(() => false))) {
    log("tipo de venda desabilitado; seguindo sem seleção específica");
    return [];
  }

  const options = await getSelectOptions(page, SELECTORS.venda);

  return options
    .filter((option) => !option.disabled && option.value)
    .map((option) => ({
      value: String(option.value),
      text: String(option.text || ""),
    }));
}`;

const patchedSelectVenda = `async function selectVenda(page: Page, vendaValue: string) {
  const venda = page.locator(SELECTORS.venda);

  if (!(await venda.isVisible().catch(() => false))) {
    log("tipo de venda não encontrado; seguindo sem seleção específica", { venda: vendaValue });
    return false;
  }

  if (!(await venda.isEnabled().catch(() => false))) {
    log("tipo de venda desabilitado; seguindo sem seleção específica", { venda: vendaValue });
    return false;
  }

  const vendas = await availableVendaValues(page);
  const found = vendas.find((v) => v.value === vendaValue);

  if (!found) {
    log("venda não disponível; seguindo sem seleção específica", {
      venda: vendaValue,
      disponiveis: vendas.map((v) => `${v.value} - ${v.text}`).join(" | "),
    });
    return false;
  }

  log("venda selecionada", {
    venda: found.value,
    text: found.text,
  });

  await venda.selectOption(vendaValue, { timeout: 5000 });
  await waitDom(page, 5000);
  await page.waitForTimeout(700);
  return true;
}`;

const oldVendaFunctions = /async function availableVendaValues\(page: Page\) \{[\s\S]*?\n\}\n\nasync function selectVenda\(page: Page, vendaValue: string\) \{[\s\S]*?\n\}\n\nasync function clickMainNext\(page: Page\)/;
source = source.replace(
  oldVendaFunctions,
  `${patchedAvailableVendaValues}\n\n${patchedSelectVenda}\n\nasync function clickMainNext(page: Page)`
);

writeFileSync(file, source);
