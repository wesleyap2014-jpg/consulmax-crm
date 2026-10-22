import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/assembly-result-sync.mjs");
let source = fs.readFileSync(file, "utf8");

if (!source.includes("async function readAssemblyAuditEvidence(page, expectedGroup)")) {
  const anchor = "function isoDateFromBrazilian(value) {";
  if (!source.includes(anchor)) throw new Error("Âncora de auditoria das assembleias não encontrada.");

  const helper = `async function readAssemblyAuditEvidence(page, expectedGroup) {
  const expected = canonicalGroupNumber(expectedGroup);
  for (const frame of page.frames()) {
    const evidence = await frame.evaluate(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const directRows = (table) => Array.from(table.children).flatMap((child) => {
        if (child.tagName === "TR") return [child];
        if (["THEAD", "TBODY", "TFOOT"].includes(child.tagName)) {
          return Array.from(child.children).filter((row) => row.tagName === "TR");
        }
        return [];
      });

      const tables = [];
      for (const table of document.querySelectorAll("table")) {
        if (!visible(table)) continue;
        const rows = directRows(table)
          .map((row) => Array.from(row.children)
            .filter((cell) => cell.tagName === "TH" || cell.tagName === "TD")
            .map((cell) => String(cell.textContent || "").replace(/\\s+/g, " ").trim()))
          .filter((cells) => cells.some(Boolean));
        if (!rows.length) continue;
        const flat = rows.flat().join(" ").toLowerCase();
        if (!flat.includes("lance") && !flat.includes("contempla")) continue;
        tables.push(rows.slice(0, 120));
      }

      const contextLines = String(document.body?.innerText || "")
        .split(/\\r?\\n/)
        .map((line) => line.replace(/\\s+/g, " ").trim())
        .filter(Boolean)
        .filter((line) => /lance|livre|fixo|contempla|assembleia|grupo|percent|%/i.test(line))
        .slice(0, 160);

      return {
        url: location.href,
        title: document.title || "",
        tables,
        contextLines,
      };
    }).catch(() => null);

    if (!evidence) continue;
    const haystack = JSON.stringify(evidence);
    const groupMatches = !expected || haystack.includes(expected) || haystack.includes(String(Number(expected)));
    if (groupMatches || evidence.tables?.length) return evidence;
  }
  return { url: null, title: null, tables: [], contextLines: [] };
}

`;
  source = source.replace(anchor, `${helper}${anchor}`);
}

const rowsAnchor = "      const rows = await readResultTable(page, groupNumber);";
if (!source.includes("const portalAudit = await readAssemblyAuditEvidence(page, groupNumber);")) {
  if (!source.includes(rowsAnchor)) throw new Error("Leitura das linhas da assembleia não localizada.");
  source = source.replace(
    rowsAnchor,
    `${rowsAnchor}
      const portalAudit = await readAssemblyAuditEvidence(page, groupNumber);`,
  );
}

const resultAnchor = "        lancesLivres: stats.lancesLivres,";
if (!source.includes("rawPortalRows: rows,")) {
  if (!source.includes(resultAnchor)) throw new Error("Bloco assemblyResult não localizado.");
  source = source.replace(
    resultAnchor,
    `${resultAnchor}
        rawPortalRows: rows,
        portalAudit: {
          url: portalAudit?.url || null,
          title: portalAudit?.title || null,
          tables: Array.isArray(portalAudit?.tables) ? portalAudit.tables : [],
          contextLines: Array.isArray(portalAudit?.contextLines) ? portalAudit.contextLines : [],
        },`,
  );
}

if (
  !source.includes("async function readAssemblyAuditEvidence(page, expectedGroup)")
  || !source.includes("rawPortalRows: rows")
  || !source.includes("contextLines: Array.isArray(portalAudit?.contextLines)")
) {
  throw new Error("Auditoria bruta das assembleias não foi aplicada integralmente.");
}

fs.writeFileSync(file, source);
console.log("Auditoria bruta das assembleias Maggi habilitada para comparar portal, tabela e classificação.");
