import fs from "node:fs";

const file = "src/pages/CentralGrupos.tsx";

if (!fs.existsSync(file)) {
  console.log("patch central grupos fixed lance columns: file not found");
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
  'taxaAdmPct: number | null; fundoReservaPct: number | null; prazoMax: number;',
  'taxaAdmPct: number | null; fundoReservaPct: number | null; prazoLabel: string; prazoMax: number; fixo1Label: string; fixo2Label: string;',
  'prazoLabel: string; prazoMax: number; fixo1Label: string; fixo2Label: string;'
);

replaceOnce(
  'function prazoMaxFrom(row: AnyRow) { const rules = Array.isArray(row?.config?.prazoRules) ? row.config.prazoRules : []; const prazos = rules.map((r: AnyRow) => n(r.prazo)).filter((v: number) => v > 0); if (prazos.length) return Math.max(...prazos); return n(row.prazo_max || row.prazo_restante || row.prazo_original || row.prazo_min); }',
  'function prazoMaxFrom(row: AnyRow) { const rules = Array.isArray(row?.config?.prazoRules) ? row.config.prazoRules : []; const prazos = rules.map((r: AnyRow) => n(r.prazo)).filter((v: number) => v > 0); if (prazos.length) return Math.max(...prazos); return n(row.prazo_max || row.prazo_restante || row.prazo_original || row.prazo_min); }\nfunction prazoLabelFrom(row: AnyRow) { const rules = Array.isArray(row?.config?.prazoRules) ? row.config.prazoRules : []; const prazos = rules.map((r: AnyRow) => n(r.prazo)).filter((v: number) => v > 0); const min = prazos.length ? Math.min(...prazos) : n(row.prazo_min || row.prazo_restante || row.prazo_original || row.prazo_max); const max = prazos.length ? Math.max(...prazos) : n(row.prazo_max || row.prazo_restante || row.prazo_original || row.prazo_min); if (!min && !max) return "—"; if (min && max && min !== max) return `${min} a ${max} meses`; return `${max || min} meses`; }\nfunction fixedLanceLabel(row: AnyRow, key: "primeiro_fixo" | "segundo_fixo", fallbackFlagKeys: string[]) { const opts = Array.isArray(row?.config?.lanceOptions) ? row.config.lanceOptions : []; const opt = opts.find((o: AnyRow) => String(o?.key || "") === key); const enabledByConfig = opt ? opt.enabled !== false : false; const enabledByFlag = fallbackFlagKeys.some((flag) => row?.[flag] === true); const enabled = enabledByConfig || enabledByFlag; if (!enabled) return "Não"; const pct = normalizePct(opt?.pct); return pct ? `Sim (${brPct(pct)})` : "Sim"; }',
  'function fixedLanceLabel'
);

replaceOnce(
  'fundoReservaPct: groupFeePct(row, ["fundo_reserva_pct", "fr_tax_pct"], "fundoReservaPct"), prazoMax: prazoMaxFrom(row), maiorPct: maior',
  'fundoReservaPct: groupFeePct(row, ["fundo_reserva_pct", "fr_tax_pct"], "fundoReservaPct"), prazoLabel: prazoLabelFrom(row), prazoMax: prazoMaxFrom(row), fixo1Label: fixedLanceLabel(row, "primeiro_fixo", ["permite_fixo_25", "permite_primeiro_fixo"]), fixo2Label: fixedLanceLabel(row, "segundo_fixo", ["permite_fixo_50", "permite_segundo_fixo"]), maiorPct: maior',
  'fixo1Label: fixedLanceLabel(row, "primeiro_fixo"'
);

replaceOnce(
  'min-w-[1120px]',
  'min-w-[1260px]',
  'min-w-[1260px]'
);

replaceOnce(
  '<th className="px-4 py-3">F Res.</th><th className="px-4 py-3">Prazo máx.</th>',
  '<th className="px-4 py-3">F Res.</th><th className="px-4 py-3">Prazo</th><th className="px-4 py-3">Fixo 1</th><th className="px-4 py-3">Fixo 2</th>',
  'Fixo 1</th><th className="px-4 py-3">Fixo 2'
);

replaceOnce(
  '<td className="px-4 py-3">{brPct(g.fundoReservaPct)}</td><td className="px-4 py-3">{g.prazoMax || "—"} meses</td>',
  '<td className="px-4 py-3">{brPct(g.fundoReservaPct)}</td><td className="px-4 py-3">{g.prazoLabel}</td><td className="px-4 py-3">{g.fixo1Label}</td><td className="px-4 py-3">{g.fixo2Label}</td>',
  'g.fixo1Label'
);

replaceOnce(
  'colSpan={12}',
  'colSpan={14}',
  'colSpan={14}'
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch central grupos fixed lance columns: applied");
} else {
  console.log("patch central grupos fixed lance columns: no changes");
}
