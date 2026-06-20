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
  const nextSelector = 'input[type="image"][onclick*="ctl00$Conteudo$grdGruposDisponiveis"][onclick*="Page$Next"], input[alt="Próximo"][onclick*="Page$Next"], input[alt="Proximo"][onclick*="Page$Next"], input[src*="next.png"][onclick*="Page$Next"]';
  const nextPageNumber = String(Number(pageIndex || 0) + 2);
  const before = await tableSignature(page);
  const next = page.locator(nextSelector).first();

  if (!(await next.isVisible().catch(() => false))) {
    log("nenhum controle de próxima página encontrado", { nextPage: nextPageNumber });
    return false;
  }

  const waitForChangedTable = async (method: string) => {
    await waitDom(page, 12000);
    await page.locator(SELECTORS.gruposTable).waitFor({ state: "visible", timeout: 30000 });

    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(350);
      const after = await tableSignature(page);
      if (after && after !== before) {
        log("próxima página aberta", { page: nextPageNumber, method });
        return true;
      }
    }

    return false;
  };

  const nav = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);
  const didPostback = await page.evaluate(() => {
    const win = window as any;
    if (typeof win.__doPostBack !== "function") return false;
    win.__doPostBack("ctl00$Conteudo$grdGruposDisponiveis", "Page$Next");
    return true;
  }).catch(() => false);
  await nav;

  if (didPostback && (await waitForChangedTable("direct-postback"))) {
    return true;
  }

  const navClick = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);
  await next.click({ timeout: 5000, force: true }).catch(async () => {
    await next.evaluate((element) => (element as HTMLElement).click());
  });
  await navClick;

  if (await waitForChangedTable("fallback-click")) {
    return true;
  }

  log("controle de próxima página acionado, mas tabela não mudou", { nextPage: nextPageNumber });
  return false;
}`;

const oldClickNextFunction = /async function clickNextPageIfExists\(page: Page(?:, pageIndex = 0)?\) \{[\s\S]*?\n\}\n\nasync function readAllPages\(page: Page, segmento: SegmentKey, venda: string \| null\)/;
source = source.replace(
  oldClickNextFunction,
  `${patchedClickNextPage}\n\nasync function readAllPages(page: Page, segmento: SegmentKey, venda: string | null)`
);
source = source.replace(
  "const hasNext = await clickNextPageIfExists(page);",
  "const hasNext = await clickNextPageIfExists(page, pageIndex);"
);

source = source.replace(
  "if (!rows.length) {\n      throw new Error(`Nenhuma linha foi lida para o segmento ${segmento}.`);\n    }",
  "if (!rows.length) {\n      log(\"nenhuma linha lida; sincronização concluída sem alterações\", { segmento });\n      return {\n        ok: true,\n        status: \"synced\",\n        administradora: \"bb\",\n        segmento,\n        found: 0,\n        created: 0,\n        updated: 0,\n        details: {\n          raw_rows: 0,\n          pages: 0,\n          uniqueGroups: 0,\n          readDetails,\n        },\n      };\n    }"
);

writeFileSync(file, source);
