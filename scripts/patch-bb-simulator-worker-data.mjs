import fs from "node:fs";

const file = "src/pages/simuladores/BBConsorciosSimulator.tsx";

if (!fs.existsSync(file)) {
  console.log("patch bb simulator worker data: file not found");
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
  'type SegmentoBB = "auto_ipca" | "auto_fipe" | "pesados" | "imoveis" | "outros_bens";',
  'type SegmentoBB = "auto_ipca" | "auto_fipe" | "pesados" | "imoveis" | "outros_bens" | "motocicleta";',
  '| "motocicleta"'
);

replaceOnce(
  'type CreditRange = { id: string; label: string; valor: number };',
  'type CreditRange = {\n  id: string;\n  label: string;\n  valor: number;\n  parcela?: number;\n  prazo?: number;\n  vagas?: number;\n  bem?: string;\n  taxaAdmPct?: number;\n  fundoReservaPct?: number;\n  seguroPct?: number;\n  minContemplacaoPct?: number;\n  assembleia?: string;\n  vencimento?: string;\n};',
  'minContemplacaoPct?: number'
);

replaceOnce(
  '  { key: "pesados" as const, label: "Pesados", icon: Truck },\n  { key: "imoveis" as const, label: "Imóveis", icon: Home },',
  '  { key: "pesados" as const, label: "Pesados", icon: Truck },\n  { key: "motocicleta" as const, label: "Motocicleta", icon: PackageCheck },\n  { key: "imoveis" as const, label: "Imóveis", icon: Home },',
  'key: "motocicleta" as const'
);

replaceOnce(
  '        valor: Number(r.valor || 0),\n      }))',
  '        valor: Number(r.valor || 0),\n        parcela: Number(r.parcela || 0) || undefined,\n        prazo: Number(r.prazo || 0) || undefined,\n        vagas: Number(r.vagas || 0) || undefined,\n        bem: r.bem ? String(r.bem) : undefined,\n        taxaAdmPct: Number(r.taxaAdmPct ?? group?.taxa_adm_pct ?? 0),\n        fundoReservaPct: Number(r.fundoReservaPct ?? group?.fundo_reserva_pct ?? 0),\n        seguroPct: Number(r.seguroPct ?? group?.seguro_pct ?? 0),\n        minContemplacaoPct: Number(r.minContemplacaoPct || 0) || undefined,\n        assembleia: r.assembleia ? String(r.assembleia) : undefined,\n        vencimento: r.vencimento ? String(r.vencimento) : undefined,\n      }))',
  'parcela: Number(r.parcela || 0) || undefined'
);

replaceOnce(
  'function defaultForm(segmento: SegmentoBB): GroupForm {',
  'function findBestCreditRange(ranges: CreditRange[], credito: number, prazo?: number) {\n  const valid = ranges.filter((range) => Number(range.valor || 0) > 0);\n  if (!valid.length || !credito) return null;\n\n  const exact = valid.find((range) => Number(range.valor || 0) === credito && (!prazo || !range.prazo || Number(range.prazo) === prazo));\n  if (exact) return exact;\n\n  const samePrazo = prazo ? valid.filter((range) => !range.prazo || Number(range.prazo) === prazo) : valid;\n  const pool = samePrazo.length ? samePrazo : valid;\n\n  return [...pool].sort((a, b) => Math.abs(Number(a.valor || 0) - credito) - Math.abs(Number(b.valor || 0) - credito))[0] || null;\n}\n\nfunction defaultForm(segmento: SegmentoBB): GroupForm {',
  'function findBestCreditRange'
);

replaceOnce(
  '  const cfg = normalizeConfig(group);\n  const sortedPrazoRules = [...cfg.prazoRules].sort((a, b) => a.prazo - b.prazo);\n  const exactRule = sortedPrazoRules.find((r) => r.prazo === prazo);\n  const nearestRule = exactRule || sortedPrazoRules.find((r) => r.prazo >= prazo) || sortedPrazoRules[sortedPrazoRules.length - 1];\n  const prazoMin = sortedPrazoRules.length ? Math.min(...sortedPrazoRules.map((r) => r.prazo)) : Number(group.prazo_min || 1);\n  const prazoMax = sortedPrazoRules.length ? Math.max(...sortedPrazoRules.map((r) => r.prazo)) : Number(group.prazo_max || prazo || 1);\n  const prazoFinal = clamp(Math.max(1, prazo || prazoMax), prazoMin || 1, prazoMax || prazo || 1);',
  '  const cfg = normalizeConfig(group);\n  const selectedRange = findBestCreditRange(cfg.creditRanges, credito, prazo);\n  const sortedPrazoRules = [...cfg.prazoRules].sort((a, b) => a.prazo - b.prazo);\n  const prazoReferencia = Number(selectedRange?.prazo || prazo || 0);\n  const exactRule = sortedPrazoRules.find((r) => r.prazo === prazoReferencia);\n  const nearestRule = exactRule || sortedPrazoRules.find((r) => r.prazo >= prazoReferencia) || sortedPrazoRules[sortedPrazoRules.length - 1];\n  const prazoMin = sortedPrazoRules.length ? Math.min(...sortedPrazoRules.map((r) => r.prazo)) : Number(group.prazo_min || 1);\n  const prazoMax = sortedPrazoRules.length ? Math.max(...sortedPrazoRules.map((r) => r.prazo)) : Number(group.prazo_max || prazoReferencia || 1);\n  const prazoFinal = clamp(Math.max(1, prazoReferencia || prazoMax), prazoMin || 1, prazoMax || prazoReferencia || 1);',
  'const selectedRange = findBestCreditRange'
);

replaceOnce(
  '  const taxaAdm = Number(nearestRule?.taxaAdmPct ?? group.taxa_adm_pct ?? 0);\n  const fundoReserva = Number(nearestRule?.fundoReservaPct ?? group.fundo_reserva_pct ?? 0);\n  const seguroPct = Number(group.seguro_pct || 0);',
  '  const taxaAdm = Number(selectedRange?.taxaAdmPct ?? nearestRule?.taxaAdmPct ?? group.taxa_adm_pct ?? 0);\n  const fundoReserva = Number(selectedRange?.fundoReservaPct ?? nearestRule?.fundoReservaPct ?? group.fundo_reserva_pct ?? 0);\n  const seguroPct = Number(selectedRange?.seguroPct ?? group.seguro_pct ?? 0);',
  'selectedRange?.taxaAdmPct'
);

replaceOnce(
  '  const valorCategoria = credito * (1 + taxaAdm + fundoReserva);\n  const parcelaBase = valorCategoria / prazoFinal;\n  const seguroMensal = valorCategoria * seguroPct;\n  const parcelaAntes = parcelaBase + seguroMensal;',
  '  const valorCategoria = credito * (1 + taxaAdm + fundoReserva);\n  const parcelaPortal = Number(selectedRange?.parcela || 0);\n  const parcelaBase = parcelaPortal > 0 ? parcelaPortal : valorCategoria / prazoFinal;\n  const seguroMensal = parcelaPortal > 0 ? 0 : valorCategoria * seguroPct;\n  const parcelaAntes = parcelaBase + seguroMensal;',
  'const parcelaPortal = Number(selectedRange?.parcela || 0);'
);

src = src.replace('md:grid-cols-5">{segmentos.map', 'md:grid-cols-3 lg:grid-cols-6">{segmentos.map');
if (src.includes('md:grid-cols-3 lg:grid-cols-6">{segmentos.map')) changed = true;

const grupoTabelaReplacement = [
'function GrupoTabela({ group, onSelectRange }: { group: BBGroup | null; onSelectRange?: (range: CreditRange) => void }) {',
'  const cfg = normalizeConfig(group);',
'  if (!group || !cfg.creditRanges.length || !cfg.prazoRules.length) return null;',
'  const prazos = [...cfg.prazoRules].sort((a, b) => a.prazo - b.prazo);',
'  const hasPortalRows = cfg.creditRanges.some((range) => Number(range.parcela || 0) > 0 || Number(range.prazo || 0) > 0);',
'  const rows = hasPortalRows',
'    ? cfg.creditRanges.map((range) => ({',
'        key: range.id,',
'        range,',
'        label: range.label || brMoney(range.valor),',
'        valor: Number(range.valor || 0),',
'        bem: range.bem || "—",',
'        prazo: Number(range.prazo || group.prazo_max || 0),',
'        vagas: Number(range.vagas || 0),',
'        taxaAdmPct: Number(range.taxaAdmPct ?? group.taxa_adm_pct ?? 0),',
'        fundoReservaPct: Number(range.fundoReservaPct ?? group.fundo_reserva_pct ?? 0),',
'        parcela: Number(range.parcela || 0),',
'      }))',
'    : cfg.creditRanges.flatMap((range) =>',
'        prazos.map((prazo) => {',
'          const valorCategoria = range.valor * (1 + prazo.taxaAdmPct + prazo.fundoReservaPct);',
'          const parcela = prazo.prazo > 0 ? valorCategoria / prazo.prazo : 0;',
'          return {',
'            key: `${range.id}_${prazo.id}`,',
'            range: { ...range, prazo: prazo.prazo, taxaAdmPct: prazo.taxaAdmPct, fundoReservaPct: prazo.fundoReservaPct },',
'            label: range.label || brMoney(range.valor),',
'            valor: Number(range.valor || 0),',
'            bem: range.bem || "—",',
'            prazo: prazo.prazo,',
'            vagas: Number(range.vagas || 0),',
'            taxaAdmPct: prazo.taxaAdmPct,',
'            fundoReservaPct: prazo.fundoReservaPct,',
'            parcela,',
'          };',
'        })',
'      );',
'',
'  return (',
'    <Card className="rounded-[28px] border bg-white/78 shadow-sm backdrop-blur">',
'      <CardHeader><CardTitle style={{ color: C.navy }}>Tabela do grupo selecionado</CardTitle></CardHeader>',
'      <CardContent>',
'        <div className="overflow-auto rounded-2xl border">',
'          <table className="w-full min-w-[920px] text-sm">',
'            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Faixa</th><th className="p-3">Crédito</th><th className="p-3">Bem</th><th className="p-3">Prazo</th><th className="p-3">Vagas</th><th className="p-3">Taxa adm</th><th className="p-3">Fundo reserva</th><th className="p-3">Parcela portal</th></tr></thead>',
'            <tbody>{rows.map((row) => <tr key={row.key} className="border-t cursor-pointer transition hover:bg-slate-50" title="Clique para usar esta faixa na simulação" onClick={() => onSelectRange?.(row.range)}><td className="p-3 font-semibold text-slate-700">{row.label}</td><td className="p-3">{brMoney(row.valor)}</td><td className="p-3">{row.bem}</td><td className="p-3">{row.prazo ? `${row.prazo} meses` : "—"}</td><td className="p-3">{row.vagas || "—"}</td><td className="p-3">{pctHuman(row.taxaAdmPct)}</td><td className="p-3">{pctHuman(row.fundoReservaPct)}</td><td className="p-3 font-semibold">{row.parcela ? brMoney(row.parcela) : "—"}</td></tr>)}</tbody>',
'          </table>',
'        </div><div className="mt-2 text-xs text-slate-500">Clique em uma faixa para preencher automaticamente crédito, prazo e lance mínimo quando o robô BB tiver lido esses dados no portal.</div>',
'      </CardContent>',
'    </Card>',
'  );',
'}',
'',
'export default function BBConsorciosSimulator() {'
].join("\n");

if (!src.includes('Parcela portal')) {
  const grupoTabelaRegex = /function GrupoTabela\([\s\S]*?\nexport default function BBConsorciosSimulator\(\) \{/;
  if (grupoTabelaRegex.test(src)) {
    src = src.replace(grupoTabelaRegex, grupoTabelaReplacement);
    changed = true;
  }
}

replaceOnce(
  '<GrupoTabela group={selectedGroup} onSelectCredit={(valor) => { setCreditoInput(formatMoneyInput(valor)); setSimCode(null); }} />',
  '<GrupoTabela group={selectedGroup} onSelectRange={(range) => { setCreditoInput(formatMoneyInput(range.valor)); if (range.prazo) setPrazoInput(String(range.prazo)); if (range.minContemplacaoPct) setLanceLivrePct(formatPercentInput(range.minContemplacaoPct)); setSimCode(null); }} />',
  'onSelectRange={(range) => { setCreditoInput'
);

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch bb simulator worker data: applied");
} else {
  console.log("patch bb simulator worker data: no changes");
}
