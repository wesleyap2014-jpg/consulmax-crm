import fs from "node:fs";

const file = "src/pages/CentralGrupos.tsx";

if (!fs.existsSync(file)) {
  console.log("patch central grupos merge fixed lance columns: file not found");
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
  'fixo1Label: string; fixo2Label: string;',
  'fixosLabel: string;',
  'fixosLabel: string;'
);

replaceOnce(
  'function fixedLanceLabel(row: AnyRow, key: "primeiro_fixo" | "segundo_fixo", fallbackFlagKeys: string[]) { const opts = Array.isArray(row?.config?.lanceOptions) ? row.config.lanceOptions : []; const opt = opts.find((o: AnyRow) => String(o?.key || "") === key); const enabledByConfig = opt ? opt.enabled !== false : false; const enabledByFlag = fallbackFlagKeys.some((flag) => row?.[flag] === true); const enabled = enabledByConfig || enabledByFlag; if (!enabled) return "Não"; const pct = normalizePct(opt?.pct); return pct ? `Sim (${brPct(pct)})` : "Sim"; }',
  'function fixedLancePct(row: AnyRow, key: "primeiro_fixo" | "segundo_fixo", fallbackFlagKeys: string[], fallbackPct: number) { const opts = Array.isArray(row?.config?.lanceOptions) ? row.config.lanceOptions : []; const opt = opts.find((o: AnyRow) => String(o?.key || "") === key); const enabledByConfig = opt ? opt.enabled !== false : false; const enabledByFlag = fallbackFlagKeys.some((flag) => row?.[flag] === true); if (!enabledByConfig && !enabledByFlag) return null; return normalizePct(opt?.pct) || fallbackPct; }\nfunction fixedLancesLabel(row: AnyRow) { const values = [fixedLancePct(row, "primeiro_fixo", ["permite_fixo_25", "permite_primeiro_fixo"], 25), fixedLancePct(row, "segundo_fixo", ["permite_fixo_50", "permite_segundo_fixo"], 50)].filter((value): value is number => value !== null && Number.isFinite(Number(value))); if (!values.length) return "—"; return values.map((value) => `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`).join(" | "); }',
  'function fixedLancesLabel'
);

replaceOnce(
  'fixo1Label: fixedLanceLabel(row, "primeiro_fixo", ["permite_fixo_25", "permite_primeiro_fixo"]), fixo2Label: fixedLanceLabel(row, "segundo_fixo", ["permite_fixo_50", "permite_segundo_fixo"]),',
  'fixosLabel: fixedLancesLabel(row),',
  'fixosLabel: fixedLancesLabel(row)'
);

replaceOnce(
  '<th className="px-4 py-3">Prazo</th><th className="px-4 py-3">Fixo 1</th><th className="px-4 py-3">Fixo 2</th>',
  '<th className="px-4 py-3">Prazo</th><th className="px-4 py-3">Fixos</th>',
  '<th className="px-4 py-3">Fixos</th>'
);

replaceOnce(
  '<td className="px-4 py-3">{g.prazoLabel}</td><td className="px-4 py-3">{g.fixo1Label}</td><td className="px-4 py-3">{g.fixo2Label}</td>',
  '<td className="px-4 py-3">{g.prazoLabel}</td><td className="px-4 py-3">{g.fixosLabel}</td>',
  'g.fixosLabel'
);

replaceOnce(
  'colSpan={14}',
  'colSpan={13}',
  'colSpan={13}'
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch central grupos merge fixed lance columns: applied");
} else {
  console.log("patch central grupos merge fixed lance columns: no changes");
}
