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
    let lastResult = null;

    for (let attempt = 1; attempt <= 24; attempt += 1) {
      const shouldTrigger = attempt === 1 || attempt === 8 || attempt === 16;
      const result = await page.evaluate(({ shouldTrigger }) => {
        const normalize = (value) => String(value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

        const isVisible = (element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0
            && rect.height > 0
            && style.display !== "none"
            && style.visibility !== "hidden";
        };

        const tableEntries = Array.from(document.querySelectorAll('a[onclick*="funDocumento"], [onclick*="funDocumento"]'))
          .filter((element) => {
            const label = normalize(element.innerText || element.textContent || element.getAttribute("title") || "");
            return label.includes("tabela") && /\bgrupo\s*0*\d{3,5}\b/.test(label);
          });
        const visibleEntries = tableEntries.filter(isVisible);

        if (visibleEntries.length > 0) {
          return {
            expanded: true,
            alreadyExpanded: true,
            entries: tableEntries.length,
            visibleEntries: visibleEntries.length,
            strategy: "entries_already_visible",
          };
        }

        const bodyText = normalize(document.body?.innerText || "");
        const title = String(document.title || "").trim();
        const loginDetected = Boolean(document.querySelector('#login, input[name="login"], #senha, input[name="senha"]'));
        const challengeDetected = bodyText.includes("verificando se voce e humano")
          || bodyText.includes("checking if the site connection is secure")
          || bodyText.includes("verify you are human")
          || bodyText.includes("cloudflare")
          || Boolean(document.querySelector('iframe[src*="challenges.cloudflare.com"], input[name="cf-turnstile-response"]'));

        if (loginDetected) {
          return {
            expanded: false,
            reason: "login_required",
            entries: tableEntries.length,
            title,
            bodyPreview: bodyText.slice(0, 300),
          };
        }

        if (challengeDetected) {
          return {
            expanded: false,
            reason: "cloudflare_challenge_detected",
            entries: tableEntries.length,
            title,
            bodyPreview: bodyText.slice(0, 300),
          };
        }

        const candidates = Array.from(document.querySelectorAll('a[onclick], button[onclick], [role="button"][onclick], a, button'));
        const heading = candidates.find((element) => {
          const label = normalize(
            element.innerText
              || element.textContent
              || element.getAttribute("title")
              || element.getAttribute("aria-label")
              || ""
          );
          return /\btabelas?\s+(?:de\s+)?precos?\b/.test(label);
        });
        const sectionFour = candidates.find((element) => {
          const onclick = String(element.getAttribute("onclick") || "");
          return /slideonlyone\s*\(\s*['\"]?4['\"]?\s*\)/i.test(onclick);
        });

        if (!shouldTrigger) {
          return {
            expanded: false,
            reason: heading || sectionFour || typeof window.slideonlyone === "function"
              ? "price_section_waiting"
              : "price_heading_not_found",
            entries: tableEntries.length,
            title,
            bodyPreview: bodyText.slice(0, 300),
          };
        }

        const target = heading || sectionFour;
        if (target) {
          const onclick = String(target.getAttribute("onclick") || "");
          if (/slideonlyone\s*\(\s*['\"]?4['\"]?\s*\)/i.test(onclick) && typeof window.slideonlyone === "function") {
            window.slideonlyone("4");
            return {
              expanded: false,
              reason: "price_section_opening",
              strategy: "section_four_function",
              onclick,
              entries: tableEntries.length,
              title,
            };
          }

          target.click();
          return {
            expanded: false,
            reason: "price_section_opening",
            strategy: heading ? "heading_click" : "section_four_click",
            onclick,
            entries: tableEntries.length,
            title,
          };
        }

        if (typeof window.slideonlyone === "function") {
          window.slideonlyone("4");
          return {
            expanded: false,
            reason: "price_section_opening",
            strategy: "direct_section_four_function",
            entries: tableEntries.length,
            title,
          };
        }

        return {
          expanded: false,
          reason: "price_heading_not_found",
          entries: tableEntries.length,
          title,
          bodyPreview: bodyText.slice(0, 300),
        };
      }, { shouldTrigger }).catch((error) => ({
        expanded: false,
        reason: "page_evaluation_failed",
        error: String(error?.message || error),
        entries: 0,
      }));

      lastResult = {
        ...result,
        attempt,
        currentUrl: page.url(),
      };

      if (result.expanded) return lastResult;
      if (result.reason === "login_required" || result.reason === "cloudflare_challenge_detected") {
        return lastResult;
      }

      await page.waitForTimeout(500);
    }

    return {
      expanded: false,
      reason: lastResult?.reason || "price_heading_not_found",
      entries: Number(lastResult?.entries || 0),
      attempts: 24,
      currentUrl: page.url(),
      title: lastResult?.title || "",
      bodyPreview: lastResult?.bodyPreview || "",
      strategy: lastResult?.strategy || null,
    };
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
