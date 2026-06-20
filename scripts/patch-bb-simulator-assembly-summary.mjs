import fs from "node:fs";

const file = "src/pages/simuladores/BBConsorciosSimulator.tsx";

if (!fs.existsSync(file)) {
  console.log("patch bb simulator assembly summary: file not found");
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

replaceOnce("  AlertTriangle,\n  Building2,", "  AlertTriangle,\n  Bike,\n  Building2,", "  Bike,");
replaceOnce(
  '{ key: "motocicleta" as const, label: "Motocicleta", icon: PackageCheck },',
  '{ key: "motocicleta" as const, label: "Motocicleta", icon: Bike },',
  'label: "Motocicleta", icon: Bike'
);

const helpers = `
function assemblyResultFrom(group?: BBGroup | null) {
  const config = (group?.config || {}) as Record<string, any>;
  const raw = config?.assemblyResult;
  if (!raw || typeof raw !== "object") return null;

  const maiorPct = Number(raw.maiorPct || 0);
  const menorPct = Number(raw.menorPct || 0);
  const medianaPct = Number(raw.medianaPct || 0) || (maiorPct > 0 && menorPct > 0 ? (maiorPct + menorPct) / 2 : 0);

  return {
    dataAssembleia: String(raw.dataAssembleia || raw.data || "").trim(),
    maiorPct,
    menorPct,
    medianaPct,
    qtdeContemplados: Number(raw.qtdeContemplados || raw.entregas || 0),
  };
}

function suggestedLanceLivrePct(group: BBGroup | null, cfg: BBConfig) {
  const assembly = assemblyResultFrom(group);
  if (assembly?.medianaPct && assembly.medianaPct > 0) return assembly.medianaPct;
  const livre = cfg.lanceOptions.find((l) => l.key === "livre");
  return Number(livre?.pct || 0);
}

function latestAssemblySummary(group: BBGroup | null) {
  if (!group) return null;
  const cfg = normalizeConfig(group);
  const assembly = assemblyResultFrom(group);
  const nextAssembly = cfg.creditRanges.map((range) => range.assembleia).find(Boolean) || "";

  return {
    data: assembly?.dataAssembleia || "—",
    maiorPct: assembly?.maiorPct ? pctHuman(assembly.maiorPct) : "—",
    menorPct: assembly?.menorPct ? pctHuman(assembly.menorPct) : "—",
    entregas: assembly?.qtdeContemplados ? String(assembly.qtdeContemplados) : "—",
    proxima: nextAssembly || "—",
  };
}
`;

replaceOnce(
  'function ConfigOverlay({ open, onClose, initialSegmento, editing, groups, onEditGroup, onDeleteGroup, onSaved }: { open: boolean; onClose: () => void; initialSegmento: SegmentoBB; editing: BBGroup | null; groups: BBGroup[]; onEditGroup: (group: BBGroup | null) => void; onDeleteGroup: (group: BBGroup) => Promise<void>; onSaved: () => Promise<void> }) {',
  `${helpers}\nfunction ConfigOverlay({ open, onClose, initialSegmento, editing, groups, onEditGroup, onDeleteGroup, onSaved }: { open: boolean; onClose: () => void; initialSegmento: SegmentoBB; editing: BBGroup | null; groups: BBGroup[]; onEditGroup: (group: BBGroup | null) => void; onDeleteGroup: (group: BBGroup) => Promise<void>; onSaved: () => Promise<void> }) {`,
  'function assemblyResultFrom'
);

replaceOnce(
  '  const selectedConfig = useMemo(() => normalizeConfig(selectedGroup), [selectedGroup]);\n  const selectedLead = useMemo(() => leads.find((l) => l.id === leadId) || null, [leads, leadId]);',
  '  const selectedConfig = useMemo(() => normalizeConfig(selectedGroup), [selectedGroup]);\n  const latestAssembly = useMemo(() => latestAssemblySummary(selectedGroup), [selectedGroup]);\n  const selectedLead = useMemo(() => leads.find((l) => l.id === leadId) || null, [leads, leadId]);',
  'const latestAssembly = useMemo(() => latestAssemblySummary(selectedGroup), [selectedGroup]);'
);

replaceOnce(
  '    const livre = selectedConfig.lanceOptions.find((l) => l.key === "livre");\n    setLanceLivrePct(formatPercentInput(livre?.pct || 0));',
  '    setLanceLivrePct(formatPercentInput(suggestedLanceLivrePct(selectedGroup, selectedConfig)));',
  'suggestedLanceLivrePct(selectedGroup, selectedConfig)'
);

replaceOnce(
  '<Label>Percentual do lance livre</Label>',
  '<Label>Lance Livre Sugerido</Label>',
  'Lance Livre Sugerido'
);

const assemblyCard = '{latestAssembly && <div className="md:col-span-2 rounded-2xl border bg-slate-50/70 p-3"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Última assembleia</div><div className="mt-2 grid gap-2 text-sm md:grid-cols-5"><div><div className="text-xs text-slate-500">Data</div><div className="font-bold text-slate-800">{latestAssembly.data}</div></div><div><div className="text-xs text-slate-500">Maior %</div><div className="font-bold text-slate-800">{latestAssembly.maiorPct}</div></div><div><div className="text-xs text-slate-500">Menor %</div><div className="font-bold text-slate-800">{latestAssembly.menorPct}</div></div><div><div className="text-xs text-slate-500">Entregas</div><div className="font-bold text-slate-800">{latestAssembly.entregas}</div></div><div><div className="text-xs text-slate-500">Próxima</div><div className="font-bold text-slate-800">{latestAssembly.proxima}</div></div></div></div>}';

replaceOnce(
  '}</select></div><div><Label>Crédito desejado</Label>',
  `}</select></div>${assemblyCard}<div><Label>Crédito desejado</Label>`,
  'Última assembleia'
);

replaceOnce(
  '<GrupoTabela group={selectedGroup} onSelectRange={(range) => { setCreditoInput(formatMoneyInput(range.valor)); if (range.prazo) setPrazoInput(String(range.prazo)); if (range.minContemplacaoPct) setLanceLivrePct(formatPercentInput(range.minContemplacaoPct)); setSimCode(null); }} />',
  '<GrupoTabela group={selectedGroup} onSelectRange={(range) => { setCreditoInput(formatMoneyInput(range.valor)); if (range.prazo) setPrazoInput(String(range.prazo)); setSimCode(null); }} />',
  'onSelectRange={(range) => { setCreditoInput(formatMoneyInput(range.valor)); if (range.prazo) setPrazoInput(String(range.prazo)); setSimCode(null); }}'
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch bb simulator assembly summary: applied");
} else {
  console.log("patch bb simulator assembly summary: no changes");
}
