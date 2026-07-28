const LOGIN_PATH_PATTERN = /\/NewLogin\/NewLoginCMC\.asp(?:$|[?#])/i;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function createPortalNavigation(portalUrl) {
  const portalOrigin = new URL(portalUrl).origin;
  const documentsUrl = new URL("/NewDocumentos/DocumentoLista.asp", portalUrl).href;

  async function isAuthenticatedPage(page) {
    const url = String(page.url() || "");
    if (!url.startsWith(portalOrigin) || LOGIN_PATH_PATTERN.test(url)) return false;

    return page.evaluate(() => {
      const hasLogin = Boolean(document.querySelector('#login, input[name="login"], #senha, input[name="senha"]'));
      return !hasLogin;
    }).catch(() => false);
  }

  async function openDocumentsDirectly(page) {
    const currentUrl = String(page.url() || "");
    if (!await isAuthenticatedPage(page)) {
      return { opened: false, reason: "not_authenticated", currentUrl };
    }

    if (/\/NewDocumentos\/DocumentoLista\.asp/i.test(currentUrl)) {
      return { opened: true, direct: false, alreadyOpen: true, currentUrl };
    }

    await page.goto(documentsUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(700);

    return {
      opened: /\/NewDocumentos\/DocumentoLista\.asp/i.test(String(page.url() || "")),
      direct: true,
      alreadyOpen: false,
      currentUrl: page.url(),
      documentsUrl,
    };
  }

  async function expandPriceTables(page) {
    const result = await page.evaluate(() => {
      const normalize = (value) => String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

      const tableEntries = Array.from(document.querySelectorAll('a[onclick*="funDocumento"]'))
        .filter((element) => {
          const label = normalize(element.innerText || element.textContent || "");
          return label.includes("tabela") && /\bgrupo\s*0*\d{3,5}\b/.test(label);
        });

      if (tableEntries.some((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      })) {
        return { expanded: true, alreadyExpanded: true, entries: tableEntries.length };
      }

      const heading = Array.from(document.querySelectorAll('a[onclick], a'))
        .find((element) => normalize(element.innerText || element.textContent || "") === "tabela de precos");

      if (!heading) {
        return { expanded: false, reason: "price_heading_not_found", entries: tableEntries.length };
      }

      const onclick = String(heading.getAttribute("onclick") || "");
      if (/slideonlyone\(['\"]4['\"]\)/i.test(onclick) && typeof window.slideonlyone === "function") {
        window.slideonlyone("4");
      } else {
        heading.click();
      }

      return { expanded: true, alreadyExpanded: false, onclick, entries: tableEntries.length };
    }).catch((error) => ({
      expanded: false,
      reason: "page_evaluation_failed",
      error: String(error?.message || error),
      entries: 0,
    }));

    if (result.expanded) await page.waitForTimeout(500);
    return result;
  }

  async function countVisiblePriceTables(page) {
    return page.evaluate(() => {
      const normalize = (value) => String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

      const signatures = new Set();
      for (const element of document.querySelectorAll('a[onclick*="funDocumento"], a, button, [onclick]')) {
        const label = normalize(element.innerText || element.textContent || element.getAttribute("title") || "");
        if (!label.includes("tabela") || !/\bgrupo\s*0*\d{3,5}\b/.test(label)) continue;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden") continue;
        signatures.add(label);
      }
      return signatures.size;
    }).catch(() => 0);
  }

  return {
    documentsUrl,
    isAuthenticatedPage,
    openDocumentsDirectly,
    expandPriceTables,
    countVisiblePriceTables,
    normalizeText,
  };
}
