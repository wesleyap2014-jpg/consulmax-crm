import fs from "node:fs";

const file = "src/pages/CentralGrupos.tsx";
if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${file}`);

let source = fs.readFileSync(file, "utf8");
let changed = false;

function replaceRequired(needle, replacement, marker) {
  if (marker && source.includes(marker)) return;
  if (!source.includes(needle)) throw new Error(`Não foi possível aplicar a coluna FIXOS. Trecho ausente: ${needle.slice(0, 120)}`);
  source = source.replace(needle, replacement);
  changed = true;
}

replaceRequired(
  "  lanceEmbutidoMaxPct: number | null;\n  ativo: boolean;",
  "  lanceEmbutidoMaxPct: number | null;\n  fixosLabel: string;\n  ativo: boolean;",
  "  fixosLabel: string;",
);

const helper = `function fixedLancesLabel(row: AnyRow) {
  const config = row?.config && typeof row.config === "object" ? row.config : {};
  const options = Array.isArray(config.lanceOptions) ? config.lanceOptions : [];
  const aiLances = Array.isArray(config?.aiDocumentAnalysis?.result?.lancesPermitidos)
    ? config.aiDocumentAnalysis.result.lancesPermitidos
    : [];
  const direct = [
    ...(Array.isArray(config.fixedLancePcts) ? config.fixedLancePcts : []),
    ...(Array.isArray(config.lancesFixosPcts) ? config.lancesFixosPcts : []),
    ...options
      .filter((option: AnyRow) =>
        option?.enabled !== false &&
        (/fixo/i.test(String(option?.key || "")) ||
          /fixo/i.test(String(option?.nomeComercial || option?.nome || ""))),
      )
      .map((option: AnyRow) => option?.pct),
    ...aiLances
      .filter((lance: AnyRow) => lance?.tipo === "fixo")
      .map((lance: AnyRow) => lance?.percentual),
  ];

  if (row?.permite_lance_fixo !== false && n(row?.lance_fixo_pct) > 0) {
    direct.push(row.lance_fixo_pct);
  }

  const values = Array.from(
    new Set(
      direct
        .map((value) => normalizePct(value))
        .filter(
          (value): value is number =>
            value !== null && Number.isFinite(value) && value > 0,
        )
        .map((value) => Number(value.toFixed(4))),
    ),
  ).sort((a, b) => a - b);

  if (!values.length) return "—";
  return values
    .map(
      (value) =>
        \`${'${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}'}%\`,
    )
    .join(" | ");
}

`;

replaceRequired(
  "function assemblyValue(\n",
  `${helper}function assemblyValue(\n`,
  "function fixedLancesLabel(row: AnyRow)",
);

const embeddedBlock = `    lanceEmbutidoMaxPct: normalizePct(
      row.lance_embutido_max_pct || row.config?.maxLanceEmbutidoPct,
    ),
    ativo: row.is_active !== false,`;
const embeddedWithFixed = `    lanceEmbutidoMaxPct: normalizePct(
      row.lance_embutido_max_pct || row.config?.maxLanceEmbutidoPct,
    ),
    fixosLabel: fixedLancesLabel(row),
    ativo: row.is_active !== false,`;
if (!source.includes("fixosLabel: fixedLancesLabel(row),")) {
  const occurrences = source.split(embeddedBlock).length - 1;
  if (occurrences !== 2) throw new Error(`Esperadas 2 montagens de grupo para FIXOS; encontradas ${occurrences}.`);
  source = source.split(embeddedBlock).join(embeddedWithFixed);
  changed = true;
}

replaceRequired(
  '<table className="w-full min-w-[1120px] text-sm">',
  '<table className="w-full min-w-[1220px] text-sm">',
  'min-w-[1220px]',
);

replaceRequired(
  '                <th className="px-4 py-3">Embutido máx.</th>',
  '                <th className="px-4 py-3">FIXOS</th>\n                <th className="px-4 py-3">Embutido máx.</th>',
  '>FIXOS</th>',
);

replaceRequired(
  '                  <td className="px-4 py-3">{brPct(g.lanceEmbutidoMaxPct)}</td>',
  '                  <td className="px-4 py-3 whitespace-nowrap">{g.fixosLabel}</td>\n                  <td className="px-4 py-3">{brPct(g.lanceEmbutidoMaxPct)}</td>',
  '{g.fixosLabel}</td>',
);

replaceRequired("colSpan={12}", "colSpan={13}", "colSpan={13}");

if (!source.includes(">FIXOS</th>") || !source.includes("{g.fixosLabel}</td>")) {
  throw new Error("A coluna FIXOS não ficou completa após o patch.");
}

if (changed) fs.writeFileSync(file, source);
console.log(changed ? "Coluna FIXOS restaurada na Central de Grupos." : "Coluna FIXOS já estava presente.");
