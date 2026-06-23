import fs from "node:fs";

const file = "src/pages/CentralGrupos.tsx";

if (!fs.existsSync(file)) {
  console.log("patch central grupos fees columns: file not found");
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
  'type GrupoCentral = { id: string; origem: "bb" | "maggi"; administradora: string; grupo: string; nome: string; segmento: string; creditoMin: number; creditoMax: number; prazoMax: number; maiorPct: number | null; menorPct: number | null; medianaPct: number | null; lanceEmbutidoMaxPct: number | null; ativo: boolean };',
  'type GrupoCentral = { id: string; origem: "bb" | "maggi"; administradora: string; grupo: string; nome: string; segmento: string; creditoMin: number; creditoMax: number; taxaAdmPct: number | null; fundoReservaPct: number | null; prazoMax: number; maiorPct: number | null; menorPct: number | null; medianaPct: number | null; lanceEmbutidoMaxPct: number | null; ativo: boolean };',
  'taxaAdmPct: number | null; fundoReservaPct: number | null;'
);

replaceOnce(
  'function prazoMaxFrom(row: AnyRow) { const rules = Array.isArray(row?.config?.prazoRules) ? row.config.prazoRules : []; const prazos = rules.map((r: AnyRow) => n(r.prazo)).filter((v: number) => v > 0); if (prazos.length) return Math.max(...prazos); return n(row.prazo_max || row.prazo_restante || row.prazo_original || row.prazo_min); }',
  'function prazoMaxFrom(row: AnyRow) { const rules = Array.isArray(row?.config?.prazoRules) ? row.config.prazoRules : []; const prazos = rules.map((r: AnyRow) => n(r.prazo)).filter((v: number) => v > 0); if (prazos.length) return Math.max(...prazos); return n(row.prazo_max || row.prazo_restante || row.prazo_original || row.prazo_min); }\nfunction groupFeePct(row: AnyRow, topLevelKeys: string[], configKey: "taxaAdmPct" | "fundoReservaPct") { const direct = topLevelKeys.map((key) => row?.[key]).find((value) => n(value) > 0); if (direct !== undefined) return normalizePct(direct); const rules = Array.isArray(row?.config?.prazoRules) ? row.config.prazoRules : []; const ruleValue = rules.map((r: AnyRow) => r?.[configKey]).find((value: unknown) => n(value) > 0); if (ruleValue !== undefined) return normalizePct(ruleValue); const ranges = Array.isArray(row?.config?.creditRanges) ? row.config.creditRanges : []; const rangeValue = ranges.map((r: AnyRow) => r?.[configKey]).find((value: unknown) => n(value) > 0); return rangeValue !== undefined ? normalizePct(rangeValue) : null; }',
  'function groupFeePct'
);

replaceOnce(
  'return { id: `bb-${row.id}`, origem: "bb", administradora: "BB Consórcios", grupo: String(row.grupo || "—"), nome: String(row.nome_grupo || `Grupo ${row.grupo || ""}`), segmento: normalizeSegmento(row.segmento), creditoMin: credit.min, creditoMax: credit.max, prazoMax: prazoMaxFrom(row), maiorPct: maior, menorPct: menor, medianaPct: mediana, lanceEmbutidoMaxPct: normalizePct(row.lance_embutido_max_pct || row.config?.maxLanceEmbutidoPct), ativo: row.is_active !== false };',
  'return { id: `bb-${row.id}`, origem: "bb", administradora: "BB Consórcios", grupo: String(row.grupo || "—"), nome: String(row.nome_grupo || `Grupo ${row.grupo || ""}`), segmento: normalizeSegmento(row.segmento), creditoMin: credit.min, creditoMax: credit.max, taxaAdmPct: groupFeePct(row, ["taxa_adm_pct", "taxa_administracao_pct", "adm_tax_pct"], "taxaAdmPct"), fundoReservaPct: groupFeePct(row, ["fundo_reserva_pct", "fr_tax_pct"], "fundoReservaPct"), prazoMax: prazoMaxFrom(row), maiorPct: maior, menorPct: menor, medianaPct: mediana, lanceEmbutidoMaxPct: normalizePct(row.lance_embutido_max_pct || row.config?.maxLanceEmbutidoPct), ativo: row.is_active !== false };',
  'taxaAdmPct: groupFeePct(row, ["taxa_adm_pct", "taxa_administracao_pct", "adm_tax_pct"], "taxaAdmPct")'
);

replaceOnce(
  'return { id: `maggi-${row.id}`, origem: "maggi", administradora: "Maggi", grupo: String(row.grupo || "—"), nome: String(row.nome_grupo || `Grupo ${row.grupo || ""}`), segmento: normalizeSegmento(row.segmento), creditoMin: credit.min, creditoMax: credit.max, prazoMax: prazoMaxFrom(row), maiorPct: maior, menorPct: menor, medianaPct: mediana, lanceEmbutidoMaxPct: normalizePct(row.lance_embutido_max_pct || row.config?.maxLanceEmbutidoPct), ativo: row.is_active !== false };',
  'return { id: `maggi-${row.id}`, origem: "maggi", administradora: "Maggi", grupo: String(row.grupo || "—"), nome: String(row.nome_grupo || `Grupo ${row.grupo || ""}`), segmento: normalizeSegmento(row.segmento), creditoMin: credit.min, creditoMax: credit.max, taxaAdmPct: groupFeePct(row, ["taxa_adm_pct", "taxa_administracao_pct", "adm_tax_pct"], "taxaAdmPct"), fundoReservaPct: groupFeePct(row, ["fundo_reserva_pct", "fr_tax_pct"], "fundoReservaPct"), prazoMax: prazoMaxFrom(row), maiorPct: maior, menorPct: menor, medianaPct: mediana, lanceEmbutidoMaxPct: normalizePct(row.lance_embutido_max_pct || row.config?.maxLanceEmbutidoPct), ativo: row.is_active !== false };',
  'taxaAdmPct: groupFeePct(row, ["taxa_adm_pct", "taxa_administracao_pct", "adm_tax_pct"], "taxaAdmPct"), fundoReservaPct: groupFeePct(row, ["fundo_reserva_pct", "fr_tax_pct"], "fundoReservaPct"), prazoMax: prazoMaxFrom(row), maiorPct: maior'
);

replaceOnce(
  '<table className="w-full min-w-[980px] text-sm">',
  '<table className="w-full min-w-[1120px] text-sm">',
  'min-w-[1120px]'
);

replaceOnce(
  '<th className="px-4 py-3">Faixa de crédito</th><th className="px-4 py-3">Prazo máx.</th>',
  '<th className="px-4 py-3">Faixa de crédito</th><th className="px-4 py-3">Tx Adm</th><th className="px-4 py-3">F Res.</th><th className="px-4 py-3">Prazo máx.</th>',
  'Tx Adm</th><th className="px-4 py-3">F Res.'
);

replaceOnce(
  '<td className="px-4 py-3">{brMoney(g.creditoMin)} até {brMoney(g.creditoMax)}</td><td className="px-4 py-3">{g.prazoMax || "—"} meses</td>',
  '<td className="px-4 py-3">{brMoney(g.creditoMin)} até {brMoney(g.creditoMax)}</td><td className="px-4 py-3">{brPct(g.taxaAdmPct)}</td><td className="px-4 py-3">{brPct(g.fundoReservaPct)}</td><td className="px-4 py-3">{g.prazoMax || "—"} meses</td>',
  'brPct(g.taxaAdmPct)'
);

replaceOnce(
  'colSpan={10}',
  'colSpan={12}',
  'colSpan={12}'
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch central grupos fees columns: applied");
} else {
  console.log("patch central grupos fees columns: no changes");
}
