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
      disponiveis: vendas.map((v) => v.value + " - " + v.text).join(" | "),
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

const patchedClickNextPage = `async function clickNextPageIfExists(page: Page, pageIndex = 0) {
  const before = await tableSignature(page);
  const nextPageNumber = String(Number(pageIndex || 0) + 2);

  const clicked = await page.evaluate(
    ({ tableSelector, nextPageNumber }) => {
      const table = document.querySelector(tableSelector);
      if (!table) return false;

      function norm(value: unknown) {
        return String(value || "")
          .normalize("NFD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .replace(/\\s+/g, " ")
          .trim()
          .toUpperCase();
      }

      function visible(element: Element) {
        const el = element as HTMLElement;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }

      const elements = Array.from(table.querySelectorAll("a, input, button, img"));
      const candidates = elements.filter((element) => {
        const el = element as HTMLInputElement;
        if (!visible(element) || el.disabled) return false;

        const label = norm(
          element.textContent ||
            element.getAttribute("value") ||
            element.getAttribute("alt") ||
            element.getAttribute("title") ||
            ""
        );
        const href = norm(element.getAttribute("href") || "");
        const onclick = norm(element.getAttribute("onclick") || "");
        const src = norm(element.getAttribute("src") || "");

        return (
          label === nextPageNumber ||
          label === "PROXIMO" ||
          label === "NEXT" ||
          label === ">" ||
          label === ">>" ||
          href.includes("PAGE$NEXT") ||
          onclick.includes("PAGE$NEXT") ||
          src.includes("NEXT")
        );
      });

      const target = candidates[0] as HTMLElement | undefined;
      if (!target) return false;
      target.click();
      return true;
    },
    { tableSelector: SELECTORS.gruposTable, nextPageNumber }
  );

  if (!clicked) {
    log("nenhum controle de próxima página encontrado", { nextPage: nextPageNumber });
    return false;
  }

  await waitDom(page, 10000);

  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(400);
    const after = await tableSignature(page);
    if (after && after !== before) {
      log("próxima página aberta", { page: nextPageNumber });
      return true;
    }
  }

  log("controle de próxima página clicado, mas tabela não mudou", { nextPage: nextPageNumber });
  return false;
}`;

const oldClickNextFunction = /async function clickNextPageIfExists\(page: Page\) \{[\s\S]*?\n\}\n\nasync function readAllPages\(page: Page, segmento: SegmentKey, venda: string \| null\)/;
source = source.replace(
  oldClickNextFunction,
  `${patchedClickNextPage}\n\nasync function readAllPages(page: Page, segmento: SegmentKey, venda: string | null)`
);
source = source.replace(
  "const hasNext = await clickNextPageIfExists(page);",
  "const hasNext = await clickNextPageIfExists(page, pageIndex);"
);

writeFileSync(file, source);
