import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/assembly-result-sync.mjs");
let source = fs.readFileSync(file, "utf8");

const oldBlock = `async function openAssemblyForm(page) {
  if (!String(page.url() || "").startsWith(PORTAL_ORIGIN)) {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  } else {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
  }
  await page.waitForTimeout(700);

  let formFrame = await findAssemblyFrame(page);
  if (formFrame) return formFrame;
  const clicked = await clickAssemblyMenu(page);
  if (!clicked) throw new Error("O menu Resultado de Assembleias não foi localizado.");

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.waitForTimeout(500);
    formFrame = await findAssemblyFrame(page);
    if (formFrame) return formFrame;
  }
  throw new Error("O formulário Resultado de Assembleias não foi carregado.");
}`;

const newBlock = `async function openAssemblyForm(page) {
  const navigateHome = async () => {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(900);
  };

  await navigateHome();

  for (let attempt = 0; attempt < 40; attempt += 1) {
    let formFrame = await findAssemblyFrame(page);
    if (formFrame) return formFrame;

    const clicked = await clickAssemblyMenu(page);
    if (clicked) {
      for (let waitAttempt = 0; waitAttempt < 20; waitAttempt += 1) {
        await page.waitForTimeout(500);
        formFrame = await findAssemblyFrame(page);
        if (formFrame) return formFrame;
      }
    }

    if (attempt === 14 || attempt === 29) {
      await navigateHome();
    } else {
      await page.waitForTimeout(500);
    }
  }

  throw new Error("O menu Resultado de Assembleias não foi localizado após aguardar e recarregar a página principal.");
}`;

if (source.includes("const navigateHome = async () =>")) {
  console.log("Navegação resiliente para Resultado de Assembleias já aplicada.");
  process.exit(0);
}

if (!source.includes(oldBlock)) {
  throw new Error("Não foi possível localizar openAssemblyForm para aplicar a navegação resiliente.");
}

source = source.replace(oldBlock, newBlock);
fs.writeFileSync(file, source);
console.log("Navegação resiliente para Resultado de Assembleias aplicada.");
