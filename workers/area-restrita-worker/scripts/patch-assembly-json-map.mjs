import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/assembly-result-sync.mjs");
let source = fs.readFileSync(file, "utf8");

function replaceFunction(input, functionName, replacement) {
  const signature = `async function ${functionName}(`;
  const start = input.indexOf(signature);
  if (start < 0) throw new Error(`Função ${functionName} não localizada.`);
  const braceStart = input.indexOf("{", start);
  if (braceStart < 0) throw new Error(`Abertura da função ${functionName} não localizada.`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = braceStart; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return `${input.slice(0, start)}${replacement}${input.slice(index + 1)}`;
    }
  }
  throw new Error(`Fechamento da função ${functionName} não localizado.`);
}

if (!source.includes("const ASSEMBLY_SEARCH_URL =")) {
  const homeLine = source.match(/const HOME_URL = [^\n]+;/)?.[0];
  if (!homeLine) throw new Error("Constante HOME_URL não localizada.");
  source = source.replace(
    homeLine,
    `${homeLine}\nconst ASSEMBLY_SEARCH_URL = PORTAL_URL ? new URL("/NewResultadoAssembleia/AssembleiaPesquisa.asp", PORTAL_URL).href : "";`,
  );
}

source = replaceFunction(source, "openAssemblyForm", `async function openAssemblyForm(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(ASSEMBLY_SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
    for (let waitAttempt = 0; waitAttempt < 30; waitAttempt += 1) {
      const formFrame = await findAssemblyFrame(page);
      if (formFrame) return formFrame;
      await page.waitForTimeout(400);
    }
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
  }
  throw new Error("O formulário direto de Resultado de Assembleias não foi carregado.");
}`);

source = replaceFunction(source, "configureSearch", `async function configureSearch(frame, groupRow) {
  const expectedSegment = portalSegment(groupRow.segmento);
  if (!expectedSegment) throw new Error(\`Segmento não reconhecido para o grupo \${groupRow.grupo}: \${groupRow.segmento || "vazio"}.\`);
  const segmentCode = expectedSegment === "automovel" ? "AUT" : "IMV";

  await frame.locator("select#segmento").waitFor({ state: "visible", timeout: 15000 });
  await frame.locator("select#segmento").selectOption({ value: segmentCode });
  await frame.waitForFunction(() => document.querySelector("select#grupo")?.options?.length > 1, null, { timeout: 15000 });

  const expectedGroup = canonicalGroupNumber(groupRow.grupo);
  const groupOptions = await frame.locator("select#grupo option").evaluateAll((nodes) => nodes.map((node) => ({
    value: node.value,
    label: String(node.textContent || "").replace(/\\s+/g, " ").trim(),
  })));
  const groupOption = groupOptions.find((option) => canonicalGroupNumber(option.label || option.value) === expectedGroup);
  if (!groupOption) throw new Error(\`O grupo \${expectedGroup} não foi encontrado no portal.\`);
  await frame.locator("select#grupo").selectOption({ value: groupOption.value });
  await frame.waitForFunction(() => document.querySelector("select#data")?.options?.length > 1, null, { timeout: 15000 });

  const dateOptions = await frame.locator("select#data option").evaluateAll((nodes) => nodes.map((node) => ({
    value: node.value,
    label: String(node.textContent || "").replace(/\\s+/g, " ").trim(),
  })));
  const dated = dateOptions
    .map((option) => ({ ...option, parsed: parseReference(option.label) }))
    .filter((option) => option.parsed && /^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(option.value))
    .sort((a, b) => b.parsed.key - a.parsed.key);
  const latest = dated[0];
  if (!latest) throw new Error(\`Nenhuma data de assembleia foi encontrada para o grupo \${expectedGroup}.\`);
  await frame.locator("select#data").selectOption({ value: latest.value });
  return { reference: latest.label, referenceKey: latest.parsed.key, assemblyDateValue: latest.value };
}`);

source = replaceFunction(source, "clickSearch", `async function clickSearch(frame) {
  const button = frame.locator("form#FrmAssembleia #Pesquisar");
  await button.waitFor({ state: "visible", timeout: 15000 });
  await Promise.all([
    frame.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null),
    button.click({ force: true, timeout: 15000 }),
  ]);
}`);

source = replaceFunction(source, "readResultTable", `async function readResultTable(page, expectedGroup) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    for (const frame of page.frames()) {
      const result = await frame.evaluate(() => {
        const normalizeText = (value) => String(value || "")
          .normalize("NFD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .replace(/\\s+/g, " ")
          .trim()
          .toLowerCase();
        const directRows = (table) => Array.from(table.children).flatMap((child) => {
          if (child.tagName === "TR") return [child];
          if (["THEAD", "TBODY", "TFOOT"].includes(child.tagName)) {
            return Array.from(child.children).filter((row) => row.tagName === "TR");
          }
          return [];
        });

        for (const table of document.querySelectorAll("table")) {
          const rows = directRows(table);
          let headerIndex = -1;
          for (let index = 0; index < rows.length; index += 1) {
            const labels = Array.from(rows[index].children)
              .filter((cell) => cell.tagName === "TH" || cell.tagName === "TD")
              .map((cell) => normalizeText(cell.textContent || ""));
            if (
              labels.length === 4
              && labels[0] === "cota"
              && labels[1] === "tipo de contemplacao"
              && labels[2].startsWith("lance")
              && labels[3] === "data"
            ) {
              headerIndex = index;
              break;
            }
          }
          if (headerIndex < 0) continue;

          const data = [];
          for (const row of rows.slice(headerIndex + 1)) {
            const cells = Array.from(row.children)
              .filter((cell) => cell.tagName === "TD")
              .map((cell) => String(cell.textContent || "").replace(/\\s+/g, " ").trim());
            if (cells.length !== 4) continue;
            data.push({ cota: cells[0], tipo: cells[1], lancePct: cells[2], data: cells[3] });
          }
          if (data.length) {
            const bodyText = String(document.body?.innerText || "");
            const groupMatch = bodyText.match(/Grupo\\s*:\\s*0*(\\d{3,5})/i);
            return { rows: data, group: groupMatch?.[1] || null };
          }
        }
        return null;
      }).catch(() => null);

      if (result?.rows?.length) {
        const returnedGroup = canonicalGroupNumber(result.group || expectedGroup);
        if (returnedGroup && returnedGroup !== canonicalGroupNumber(expectedGroup)) continue;
        return result.rows;
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(\`A tabela interna de resultados da assembleia do grupo \${expectedGroup} não foi localizada.\`);
}`);

if (
  !source.includes("const ASSEMBLY_SEARCH_URL =")
  || !source.includes('select#segmento')
  || !source.includes('form#FrmAssembleia #Pesquisar')
  || !source.includes('labels.length === 4')
  || !source.includes('labels[1] === "tipo de contemplacao"')
) {
  throw new Error("O mapa real do portal de assembleias não foi aplicado integralmente.");
}

fs.writeFileSync(file, source);
console.log("Mapa real das assembleias Maggi aplicado: URL direta, IDs fixos e tabela interna exata.");
