import fs from "node:fs";

const file = "src/index.ts";

if (!fs.existsSync(file)) {
  console.log("patch bb assembly menu fallback: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceRegex(regex, replacement, marker) {
  if (!src.includes(marker) && regex.test(src)) {
    src = src.replace(regex, replacement);
    changed = true;
  }
}

replaceRegex(
  /function isTransientRobotError\(error: unknown\) \{[\s\S]*?\n\}/,
  `function isTransientRobotError(error: unknown) {
  const text = normalizeText((error as any)?.message || error || "");

  return (
    text.includes("EXECUTION CONTEXT WAS DESTROYED") ||
    text.includes("NAVIGATION") ||
    text.includes("TIMEOUT") ||
    text.includes("NENHUM RESULTADO DE ASSEMBLEIA") ||
    text.includes("BOTAO PESQUISAR") ||
    text.includes("CAMPO DE GRUPO") ||
    text.includes("MENU RESULTADO DE ASSEMBLEIAS NAO ENCONTRADO")
  );
}`,
  "MENU RESULTADO DE ASSEMBLEIAS NAO ENCONTRADO"
);

const patchedOpenAssemblyResult = `async function assemblyPageLooksReady(page: Page) {
  const bodyText = normalizeText(await page.locator("body").innerText({ timeout: 5000 }).catch(() => ""));
  const hasSearch = bodyText.includes("PESQUISAR") || bodyText.includes("RESULTADO DE ASSEMBLEIAS") || bodyText.includes("RESULTADO ASSEMBLEIAS");
  const hasInput = await page
    .locator('input:visible:not([type="image"]):not([type="button"]):not([type="submit"]):not([type="hidden"]):not([type="password"])')
    .first()
    .isVisible()
    .catch(() => false);

  return hasSearch && hasInput;
}

function restrictedBaseFromUrl(url: string) {
  const marker = "/acesso_restrito/";
  if (url.includes(marker)) {
    return url.split(marker)[0] + marker;
  }

  return url.replace(/\\/[^/]*$/, "/acesso_restrito/");
}

async function tryOpenAssemblyDirectUrl(page: Page) {
  const base = restrictedBaseFromUrl(page.url());
  const candidates = [
    "frmResultadoAssembleias.aspx",
    "frmResultadoAssembleia.aspx",
    "frmConsultaResultadoAssembleia.aspx",
    "frmConsultaResultadoAssembleias.aspx",
    "frmResultadoAssembl.aspx",
  ];

  for (const path of candidates) {
    await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    await waitDom(page, 10000);
    await page.waitForTimeout(1200);
    await dismissPostLoginMessages(page);

    if (await assemblyPageLooksReady(page)) {
      log("resultado de assembleias aberto por URL direta", { path });
      return true;
    }
  }

  return false;
}

async function openAssemblyResult(page: Page) {
  log("abrindo resultado de assembleias");

  await waitDom(page, 10000);
  await page.waitForTimeout(1500);
  await dismissPostLoginMessages(page);

  if (await assemblyPageLooksReady(page)) {
    return;
  }

  const waitAfterCandidate = async () => {
    await waitDom(page, 10000);
    await page.waitForTimeout(1800);
    await dismissPostLoginMessages(page);
    return await assemblyPageLooksReady(page);
  };

  const candidates = [
    page.getByText("Resultado de Assembleias").first(),
    page.getByText("Resultado de Assembleias", { exact: false }).first(),
    page.locator("a").filter({ hasText: /Resultado de Assembleias/i }).first(),
    page.locator("a, button, input[type=button], input[type=submit]").filter({ hasText: /Resultado/i }).first(),
  ];

  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: 10000 }).catch(async () => {
        await candidate.evaluate((element) => (element as HTMLElement).click());
      });

      if (await waitAfterCandidate()) {
        return;
      }
    }
  }

  const clicked = await page.evaluate(() => {
    const normalize = (value: unknown) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .toUpperCase()
        .replace(/\\s+/g, " ")
        .trim();

    const elements = Array.from(
      document.querySelectorAll('a, button, input[type="button"], input[type="submit"], img')
    );

    const target = elements.find((el) => {
      const element = el as HTMLInputElement | HTMLElement;
      const text = normalize(
        element.innerText ||
          element.textContent ||
          (element as HTMLInputElement).value ||
          element.getAttribute("title") ||
          element.getAttribute("alt") ||
          element.getAttribute("href") ||
          ""
      );

      return text.includes("RESULTADO DE ASSEMBLEIAS") || text.includes("RESULTADO ASSEMBLEIAS") || text.includes("RESULTADO");
    });

    if (target) {
      (target as HTMLElement).click();
      return true;
    }

    return false;
  });

  if (clicked && (await waitAfterCandidate())) {
    return;
  }

  if (await tryOpenAssemblyDirectUrl(page)) {
    return;
  }

  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  throw new Error(
    \`Menu Resultado de Assembleias não encontrado. URL atual: \${page.url()}. Tela: \${normalizeText(bodyText).slice(0, 500)}\`
  );
}`;

replaceRegex(
  /async function openAssemblyResult\(page: Page\) \{[\s\S]*?\n\}\n\nasync function searchAssemblyGroup/,
  `${patchedOpenAssemblyResult}\n\nasync function searchAssemblyGroup`,
  "async function assemblyPageLooksReady"
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch bb assembly menu fallback: applied");
} else {
  console.log("patch bb assembly menu fallback: no changes");
}
