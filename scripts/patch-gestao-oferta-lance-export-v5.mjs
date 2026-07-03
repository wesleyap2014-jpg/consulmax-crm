import fs from 'fs';

const file = 'src/pages/GestaoDeGrupos.tsx';
let src = fs.readFileSync(file, 'utf8');

const lines = (arr) => arr.join('\n') + '\n';

function replaceOnce(from, to, label) {
  if (!src.includes(from)) throw new Error('patch-gestao-oferta-lance-export-v5: anchor not found: ' + label);
  src = src.replace(from, to);
}

// Reduce overlay width after the wide-report patch.
src = src
  .split('w-full max-w-[98vw] rounded-2xl bg-white shadow-xl max-h-[92vh] flex flex-col')
  .join('w-full max-w-[88vw] rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col');

const stateAnchor = lines([
  '  const [dataAsm, setDataAsm] = useState<string>("");',
  '  const [linhas, setLinhas] = useState<OfertaRow[]>([]);',
  '  const [loading, setLoading] = useState(false);',
]);
const stateReplacement = lines([
  '  const [dataAsm, setDataAsm] = useState<string>("");',
  '  const [linhas, setLinhas] = useState<OfertaRow[]>([]);',
  '  const [loading, setLoading] = useState(false);',
  '  const [exportMenuOpen, setExportMenuOpen] = useState(false);',
]);
if (!src.includes('const [exportMenuOpen, setExportMenuOpen]')) {
  replaceOnce(stateAnchor, stateReplacement, 'export menu state');
}

const exportFnRegex = /  const exportarOferta = async \(\) => \{[\s\S]*?\n  \};\n\n  const total = linhas\.length;/;
const exportFnReplacement = lines([
  '  const exportarOferta = async (format: "pdf" | "excel") => {',
  '    if (!linhas.length) return;',
  '    setExportMenuOpen(false);',
  '    const fileName = ofertaFileBaseName();',
  '    const rows = ofertaExportRows();',
  '',
  '    if (format === "excel") {',
  '      const XLSX = await import("xlsx");',
  '      const ws = XLSX.utils.json_to_sheet(rows);',
  '      ws["!cols"] = [',
  '        { wch: 12 },',
  '        { wch: 8 },',
  '        { wch: 8 },',
  '        { wch: 28 },',
  '        { wch: 28 },',
  '        { wch: 14 },',
  '        { wch: 8 },',
  '        { wch: 8 },',
  '        { wch: 12 },',
  '        { wch: 10 },',
  '      ];',
  '      const wb = XLSX.utils.book_new();',
  '      XLSX.utils.book_append_sheet(wb, ws, "Oferta de Lance");',
  '      XLSX.writeFile(wb, fileName + ".xlsx");',
  '      return;',
  '    }',
  '',
  '    const { default: jsPDF } = await import("jspdf");',
  '    const autoTableModule: any = await import("jspdf-autotable");',
  '    const autoTable = autoTableModule.default || autoTableModule.autoTable;',
  '    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });',
  '    const ymd = toYMD(dataAsm);',
  '    const dataLegivel = formatBR(ymd);',
  '    doc.setFontSize(13);',
  '    doc.text("Oferta de Lance", 14, 14);',
  '    doc.setFontSize(8);',
  '    doc.text("Data da Assembleia: " + dataLegivel + " • Total de cotas: " + linhas.length, 14, 20);',
  '',
  '    autoTable(doc, {',
  '      startY: 24,',
  '      head: [["Admin", "Grupo", "Cota", "Cliente", "Estratégia/Lance", "Status", "Ref", "Part", "Mediana", "Entregas"]],',
  '      body: rows.map((r) => [r.Admin, r.Grupo, r.Cota, r.Cliente, r["Estratégia/Lance"], r.Status, r.Ref, r.Part, r.Mediana, r.Entregas]),',
  '      styles: { fontSize: 7, cellPadding: 1.6, overflow: "linebreak", valign: "middle" },',
  '      headStyles: { fillColor: [30, 41, 63], textColor: 255, fontStyle: "bold", halign: "center" },',
  '      alternateRowStyles: { fillColor: [248, 249, 251] },',
  '      columnStyles: {',
  '        0: { cellWidth: 20 },',
  '        1: { cellWidth: 14, halign: "center" },',
  '        2: { cellWidth: 14, halign: "center" },',
  '        3: { cellWidth: 48 },',
  '        4: { cellWidth: 52 },',
  '        5: { cellWidth: 24 },',
  '        6: { cellWidth: 13, halign: "center" },',
  '        7: { cellWidth: 14, halign: "center" },',
  '        8: { cellWidth: 20, halign: "center" },',
  '        9: { cellWidth: 16, halign: "center" },',
  '      },',
  '      margin: { left: 10, right: 10 },',
  '    });',
  '    doc.save(fileName + ".pdf");',
  '  };',
  '',
  '  const total = linhas.length;',
]);
if (!exportFnRegex.test(src)) throw new Error('patch-gestao-oferta-lance-export-v5: export function anchor not found');
src = src.replace(exportFnRegex, exportFnReplacement);

const exportButtonOld = lines([
  '              <Button variant="secondary" onClick={exportarOferta} disabled={total === 0} className="inline-flex items-center gap-2">',
  '                Exportar',
  '              </Button>',
]).trim();
const exportButtonNew = lines([
  '              <div className="relative">',
  '                <Button',
  '                  variant="secondary"',
  '                  onClick={() => setExportMenuOpen((open) => !open)}',
  '                  disabled={total === 0}',
  '                  className="inline-flex items-center gap-2"',
  '                >',
  '                  Exportar',
  '                </Button>',
  '                {exportMenuOpen && (',
  '                  <div className="absolute right-0 z-50 mt-2 w-36 overflow-hidden rounded-xl border bg-white shadow-lg">',
  '                    <button className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => exportarOferta("pdf")}>',
  '                      PDF',
  '                    </button>',
  '                    <button className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => exportarOferta("excel")}>',
  '                      Excel',
  '                    </button>',
  '                  </div>',
  '                )}',
  '              </div>',
]).trim();
replaceOnce(exportButtonOld, exportButtonNew, 'export dropdown button');

// Center compact columns in header and body: Grupo, Cota, Ref, Part, Mediana, Entregas.
const alignReplacements = [
  ['<th className="p-1.5 text-left">Grupo</th>', '<th className="p-1.5 text-center">Grupo</th>'],
  ['<th className="p-1.5 text-left">Cota</th>', '<th className="p-1.5 text-center">Cota</th>'],
  ['<th className="p-1.5 text-left">Ref</th>', '<th className="p-1.5 text-center">Ref</th>'],
  ['<th className="p-1.5 text-left">Part</th>', '<th className="p-1.5 text-center">Part</th>'],
  ['<th className="p-1.5 text-left">Mediana</th>', '<th className="p-1.5 text-center">Mediana</th>'],
  ['<th className="p-1.5 text-left">Entregas</th>', '<th className="p-1.5 text-center">Entregas</th>'],
  ['<td className="p-1.5">{o.grupo}</td>', '<td className="p-1.5 text-center">{o.grupo}</td>'],
  ['<td className="p-1.5">{o.cota ?? "—"}</td>', '<td className="p-1.5 text-center">{o.cota ?? "—"}</td>'],
  ['<td className="p-1.5 text-right">{o.referencia ?? "—"}</td>', '<td className="p-1.5 text-center">{o.referencia ?? "—"}</td>'],
  ['<td className="p-1.5 text-right">{o.participantes ?? "—"}</td>', '<td className="p-1.5 text-center">{o.participantes ?? "—"}</td>'],
  ['<td className="p-1.5 text-right">{o.mediana != null ? toPct4(Number(o.mediana)) : "—"}</td>', '<td className="p-1.5 text-center">{o.mediana != null ? toPct4(Number(o.mediana)) : "—"}</td>'],
  ['<td className="p-1.5 text-right">{o.contemplados ?? "—"}</td>', '<td className="p-1.5 text-center">{o.contemplados ?? "—"}</td>'],
];
for (const [from, to] of alignReplacements) src = src.split(from).join(to);

fs.writeFileSync(file, src);
console.log('patch-gestao-oferta-lance-export-v5 applied');
