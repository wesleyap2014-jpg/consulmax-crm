import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../src/index.ts', import.meta.url);
let source = readFileSync(file, 'utf8');

const stableHelpers = `async function groupTableSnapshot(page: Page) {
  return page.evaluate((tableSelector) => {
    function clean(value: unknown) {
      return String(value || "").replace(/\\s+/g, " ").trim();
    }

    const table = document.querySelector(tableSelector);
    const source = table || document;
    const rows = Array.from(source.querySelectorAll("tr"))
      .map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => clean((td as HTMLElement).innerText || td.textContent)))
      .filter((cells) => cells.length >= 12 && /^\\d{4,6}$/.test(String(cells[0] || "").trim()));

    const signature = rows.map((cells) => cells.slice(0, 12).join("|")).join("||");

    return {
      count: rows.length,
      signature,
      first: rows[0]?.slice(0, 4).join("|") || "",
      last: rows[rows.length - 1]?.slice(0, 4).join("|") || "",
    };
  }, SELECTORS.gruposTable);
}

async function waitForGroupRowsStable(page: Page, context: Record<string, unknown> = {}) {
  await page.locator(SELECTORS.gruposTable).waitFor({ state: "visible", timeout: 30000 });
  await waitDom(page, 12000);

  let previousSignature = "";
  let stableCycles = 0;
  let best = { count: 0, signature: "", first: "", last: "" };

  for (let i = 0; i < 24; i++) {
    const snapshot = await groupTableSnapshot(page);

    if (snapshot.count >= best.count) {
      best = snapshot;
    }

    if (snapshot.count > 0 && snapshot.signature && snapshot.signature === previousSignature) {
      stableCycles += 1;
    } else {
      stableCycles = 0;
      previousSignature = snapshot.signature;
    }

    if (snapshot.count > 0 && stableCycles >= 3) {
      log("tabela estabilizada", { ...context, linhas: snapshot.count, first: snapshot.first, last: snapshot.last });
      return snapshot;
    }

    await page.waitForTimeout(750);
  }

  log("tabela não estabilizou totalmente; usando melhor leitura", { ...context, linhas: best.count, first: best.first, last: best.last });
  return best;
}`;

if (!source.includes('async function groupTableSnapshot(page: Page)')) {
  source = source.replace(
    '\nasync function readCurrentTable(page: Page, segmento: SegmentKey, pageIndex: number, venda: string | null) {',
    `\n${stableHelpers}\n\nasync function readCurrentTable(page: Page, segmento: SegmentKey, pageIndex: number, venda: string | null) {\n  await waitForGroupRowsStable(page, { segmento, venda, pageIndex });`
  );
}

const patchedClickNextPage = `async function clickNextPageIfExists(page: Page, pageIndex = 0) {
  const nextSelector = 'input[type="image"][onclick*="ctl00$Conteudo$grdGruposDisponiveis"][onclick*="Page$Next"], input[alt="Próximo"][onclick*="Page$Next"], input[alt="Proximo"][onclick*="Page$Next"], input[src*="next.png"][onclick*="Page$Next"]';
  const nextPageNumber = String(Number(pageIndex || 0) + 2);
  const before = await groupTableSnapshot(page);
  const next = page.locator(nextSelector).first();

  if (!(await next.isVisible().catch(() => false))) {
    log("nenhum controle de próxima página encontrado", { nextPage: nextPageNumber, linhasAtuais: before.count, first: before.first, last: before.last });
    return false;
  }

  const waitAfterPagination = async (method: string) => {
    await waitDom(page, 15000);
    await page.waitForTimeout(2500);
    const after = await waitForGroupRowsStable(page, { nextPage: nextPageNumber, method });

    if (after.signature && after.signature !== before.signature) {
      log("próxima página aberta", { page: nextPageNumber, method, beforeFirst: before.first, afterFirst: after.first, linhas: after.count });
      return true;
    }

    log("tabela permaneceu igual após tentar próxima página", { nextPage: nextPageNumber, method, linhas: after.count, first: after.first, last: after.last });
    return false;
  };

  const navClick = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null);
  await next.click({ timeout: 8000, force: true }).catch(async () => {
    await next.evaluate((element) => (element as HTMLElement).click());
  });
  await navClick;

  if (await waitAfterPagination("next-button-click")) {
    return true;
  }

  const navPostback = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null);
  const didPostback = await page.evaluate(() => {
    const win = window as any;
    if (typeof win.__doPostBack !== "function") return false;
    win.__doPostBack("ctl00$Conteudo$grdGruposDisponiveis", "Page$Next");
    return true;
  }).catch(() => false);
  await navPostback;

  if (didPostback && (await waitAfterPagination("direct-postback"))) {
    return true;
  }

  return false;
}`;

source = source.replace(
  /async function clickNextPageIfExists\(page: Page(?:, pageIndex = 0)?\) \{[\s\S]*?\n\}\n\nasync function readAllPages\(page: Page, segmento: SegmentKey, venda: string \| null\)/,
  `${patchedClickNextPage}\n\nasync function readAllPages(page: Page, segmento: SegmentKey, venda: string | null)`
);
source = source.replace(
  "const hasNext = await clickNextPageIfExists(page);",
  "const hasNext = await clickNextPageIfExists(page, pageIndex);"
);

writeFileSync(file, source);
