import fs from "node:fs";

const file = "src/index.ts";

if (!fs.existsSync(file)) {
  console.log("patch bid rules from bem tooltip: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(needle, replacement, marker = replacement) {
  if (!src.includes(marker) && src.includes(needle)) {
    src = src.replace(needle, replacement);
    changed = true;
  }
}

replaceOnce(
  "  pageIndex: number;\n  venda?: string | null;\n};",
  "  pageIndex: number;\n  venda?: string | null;\n  lanceFixoPcts: number[];\n  permiteLanceEmbutido: boolean;\n  lanceHint: string;\n};",
  "lanceFixoPcts: number[];"
);

replaceOnce(
  `function pctDecimal(value: unknown) {
  const parsed = parseNumberBR(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}`,
  `function pctDecimal(value: unknown) {
  const parsed = parseNumberBR(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function parseBidRulesFromBemHint(value: unknown) {
  const normalized = normalizeText(value);
  const fixedPcts = Array.from(normalized.matchAll(/FIXO[^0-9]{0,20}(\\d+(?:[,.]\\d+)?)/g))
    .map((match) => parseNumberBR(match[1]))
    .filter((pct) => pct > 0 && pct <= 100);

  const uniqueFixedPcts = Array.from(new Set(fixedPcts.map((pct) => Number(pct.toFixed(4))))).sort(
    (a, b) => a - b
  );

  return {
    lanceFixoPcts: uniqueFixedPcts,
    permiteLanceEmbutido: normalized.includes("EMBUTIDO"),
  };
}`,
  "function parseBidRulesFromBemHint"
);

const patchedReadCurrentTable = `async function readCurrentTable(page: Page, segmento: SegmentKey, pageIndex: number, venda: string | null) {
  await waitForGroupRowsStable(page, { segmento, venda, pageIndex });

  const rows = await page.evaluate(
    ({ tableSelector }) => {
      function clean(value: unknown) {
        return String(value || "").replace(/\\s+/g, " ").trim();
      }

      function collectHint(element: Element | null) {
        if (!element) return "";

        const attrs = [
          "title",
          "alt",
          "aria-label",
          "data-title",
          "data-tooltip",
          "data-original-title",
          "onmouseover",
          "onmouseenter",
        ];

        const parts: string[] = [];
        const collect = (node: Element) => {
          for (const attr of attrs) {
            const value = node.getAttribute(attr);
            if (value) parts.push(value);
          }
        };

        collect(element);
        element.querySelectorAll("*").forEach((child) => collect(child));
        parts.push((element as HTMLElement).innerText || element.textContent || "");
        parts.push((element as HTMLElement).outerHTML || "");

        return clean(parts.join(" "));
      }

      const table = document.querySelector(tableSelector);
      const source = table || document;

      const trs = Array.from(source.querySelectorAll("tr"));

      return trs
        .map((tr) => {
          const tds = Array.from(tr.querySelectorAll("td"));
          const cells = tds.map((td) => clean((td as HTMLElement).innerText || td.textContent));
          const bemCell = tds[3] || null;

          return {
            cells: cells.slice(0, 12),
            lanceHint: collectHint(bemCell),
          };
        })
        .filter((row) => row.cells.length >= 12);
    },
    { tableSelector: SELECTORS.gruposTable }
  );

  const mapped: RawGroupRow[] = rows
    .map((row) => {
      const cells = row.cells;
      const bidRules = parseBidRulesFromBemHint(row.lanceHint);

      return {
        grupo: String(cells[0] || "").trim(),
        segmento,
        prazo: parseNumberBR(cells[1]),
        vagas: parseNumberBR(cells[2]),
        bem: String(cells[3] || "").trim(),
        taxaAdmPct: pctDecimal(cells[4]),
        fundoReservaPct: pctDecimal(cells[5]),
        seguroPct: pctDecimal(cells[6]),
        credito: parseNumberBR(cells[7]),
        parcela: parseNumberBR(cells[8]),
        assembleia: String(cells[9] || "").trim(),
        vencimento: String(cells[10] || "").trim(),
        minContemplacaoPct: pctDecimal(cells[11]),
        pageIndex,
        venda,
        lanceFixoPcts: bidRules.lanceFixoPcts,
        permiteLanceEmbutido: bidRules.permiteLanceEmbutido,
        lanceHint: String(row.lanceHint || ""),
      };
    })
    .filter((row) => {
      return (
        /^\\d{4,6}$/.test(row.grupo) &&
        row.prazo > 0 &&
        row.credito > 0 &&
        row.parcela > 0
      );
    });

  log(\`página \${pageIndex + 1} lida\`, {
    linhas: mapped.length,
    segmento,
    venda,
    comFixo: mapped.filter((row) => row.lanceFixoPcts.length > 0).length,
    comEmbutido: mapped.filter((row) => row.permiteLanceEmbutido).length,
  });

  return mapped;
}`;

const readCurrentTableRegex = /async function readCurrentTable\(page: Page, segmento: SegmentKey, pageIndex: number, venda: string \| null\) \{[\s\S]*?\n\}\n\nasync function clickNextPageIfExists/;
if (!src.includes("parseBidRulesFromBemHint(row.lanceHint)") && readCurrentTableRegex.test(src)) {
  src = src.replace(readCurrentTableRegex, `${patchedReadCurrentTable}\n\nasync function clickNextPageIfExists`);
  changed = true;
}

replaceOnce(
  "    const minContemplacao = minCont.length ? Math.min(...minCont) : 0;\n\n    return {",
  "    const minContemplacao = minCont.length ? Math.min(...minCont) : 0;\n    const fixedLancePcts = Array.from(\n      new Set(list.flatMap((row) => row.lanceFixoPcts || []).map((pct) => Number(Number(pct || 0).toFixed(4))))\n    )\n      .filter((pct) => pct > 0 && pct <= 100)\n      .sort((a, b) => a - b);\n    const permiteLanceEmbutido = list.some((row) => row.permiteLanceEmbutido);\n    const maxLanceEmbutidoPct = permiteLanceEmbutido ? 0.3 : 0;\n\n    return {",
  "const fixedLancePcts = Array.from"
);

replaceOnce(
  "      permite_lance_embutido: false,\n      lance_embutido_max_pct: 0,\n      permite_fixo_25: false,\n      permite_fixo_50: false,",
  "      permite_lance_embutido: permiteLanceEmbutido,\n      lance_embutido_max_pct: maxLanceEmbutidoPct,\n      permite_fixo_25: fixedLancePcts.some((pct) => Math.abs(pct - 25) < 0.01),\n      permite_fixo_50: fixedLancePcts.some((pct) => Math.abs(pct - 50) < 0.01),",
  "permite_lance_embutido: permiteLanceEmbutido"
);

replaceOnce(
  `        lanceOptions: [
          {
            key: "livre",
            enabled: true,
            nomeComercial: "Lance Livre",
            pct: minContemplacao,
          },
          {
            key: "primeiro_fixo",
            enabled: false,
            nomeComercial: "1º Lance Fixo",
            pct: 0,
          },
          {
            key: "segundo_fixo",
            enabled: false,
            nomeComercial: "2º Lance Fixo",
            pct: 0,
          },
        ],
        maxLanceEmbutidoPct: 0,`,
  `        lanceOptions: [
          {
            key: "livre",
            enabled: true,
            nomeComercial: "Lance Livre",
            pct: minContemplacao,
          },
          ...fixedLancePcts.map((pct, index) => ({
            key: index === 0 ? "primeiro_fixo" : index === 1 ? "segundo_fixo" : \`fixo_\${String(pct).replace(/\\D/g, "_")}\`,
            enabled: true,
            nomeComercial: \`Lance Fixo \${Number(pct).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%\`,
            pct: pct / 100,
          })),
        ],
        fixedLancePcts,
        permiteLanceEmbutido,
        lanceEmbutidoBase: "credito",
        maxLanceEmbutidoPct,`,
  "fixedLancePcts,"
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch bid rules from bem tooltip: applied");
} else {
  console.log("patch bid rules from bem tooltip: no changes");
}
