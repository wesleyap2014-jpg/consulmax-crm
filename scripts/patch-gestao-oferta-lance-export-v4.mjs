import fs from 'fs';

const file = 'src/pages/GestaoDeGrupos.tsx';
let src = fs.readFileSync(file, 'utf8');

const lines = (arr) => arr.join('\n') + '\n';

function replaceOnce(from, to, label) {
  if (!src.includes(from)) throw new Error('patch-gestao-oferta-lance-export-v4: anchor not found: ' + label);
  src = src.replace(from, to);
}

// Wider overlays and more elegant compact table. Offer Lance benefits from the wide layout; the assembly overlay also remains comfortable.
src = src.split('w-full max-w-6xl rounded-2xl bg-white shadow-xl max-h-[88vh] flex flex-col').join('w-full max-w-[98vw] rounded-2xl bg-white shadow-xl max-h-[92vh] flex flex-col');
src = src.replace('rounded-xl border overflow-auto max-h-[52vh]', 'rounded-xl border overflow-auto max-h-[62vh]');
src = src.replace('min-w-[1280px] w-full text-sm', 'w-full text-xs table-fixed');
src = src.replace('min-w-[1080px] w-full text-sm', 'w-full text-xs table-fixed');

// Shorter column names on screen and PDF.
const replacements = [
  ['<th>Administradora</th>', '<th>Admin</th>'],
  ['<th>Referência</th>', '<th>Ref</th>'],
  ['<th>Participantes</th>', '<th>Part</th>'],
  ['<th>Contemplados</th>', '<th>Entregas</th>'],
  ['<th className="p-2 text-left">Administradora</th>', '<th className="p-1.5 text-left">Admin</th>'],
  ['<th className="p-2 text-left">Grupo</th>', '<th className="p-1.5 text-left">Grupo</th>'],
  ['<th className="p-2 text-left">Cota</th>', '<th className="p-1.5 text-left">Cota</th>'],
  ['<th className="p-2 text-left">Cliente</th>', '<th className="p-1.5 text-left">Cliente</th>'],
  ['<th className="p-2 text-left">Estratégia/Lance</th>', '<th className="p-1.5 text-left">Estratégia/Lance</th>'],
  ['<th className="p-2 text-left">Status</th>', '<th className="p-1.5 text-left">Status</th>'],
  ['<th className="p-2 text-left">Referência</th>', '<th className="p-1.5 text-left">Ref</th>'],
  ['<th className="p-2 text-left">Participantes</th>', '<th className="p-1.5 text-left">Part</th>'],
  ['<th className="p-2 text-left">Mediana</th>', '<th className="p-1.5 text-left">Mediana</th>'],
  ['<th className="p-2 text-left">Contemplados</th>', '<th className="p-1.5 text-left">Entregas</th>'],
];
for (const [from, to] of replacements) src = src.split(from).join(to);

// Compact cells.
src = src.split('className="p-2 text-right"').join('className="p-1.5 text-right"');
src = src.split('className="p-2">').join('className="p-1.5">');

const oldExport = /  const exportarPDF = \(\) => \{[\s\S]*?\n  \};\n\n  const total = linhas\.length;/;
const newExport = lines([
  '  const ofertaFileBaseName = () => {',
  '    const ymd = toYMD(dataAsm);',
  '    const suffix = ymd ? ymd.slice(8, 10) + "-" + ymd.slice(5, 7) : "sem-data";',
  '    return "Oferta_Lance_" + suffix;',
  '  };',
  '',
  '  const ofertaExportRows = () =>',
  '    linhas.map((o) => ({',
  '      Admin: o.administradora || "—",',
  '      Grupo: o.grupo || "—",',
  '      Cota: o.cota ?? "—",',
  '      Cliente: o.cliente ?? "—",',
  '      "Estratégia/Lance": o.estrategia_lance || "—",',
  '      Status: o.status || "Ativa",',
  '      Ref: o.referencia ?? "—",',
  '      Part: o.participantes ?? "—",',
  '      Mediana: o.mediana != null ? toPct4(Number(o.mediana)) : "—",',
  '      Entregas: o.contemplados ?? "—",',
  '    }));',
  '',
  '  const exportarOferta = async () => {',
  '    if (!linhas.length) return;',
  '    const choice = window.prompt("Exportar Oferta de Lance como PDF ou Excel?", "PDF");',
  '    if (!choice) return;',
  '    const normalized = choice.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim();',
  '    const fileName = ofertaFileBaseName();',
  '    const rows = ofertaExportRows();',
  '',
  '    if (["excel", "xlsx", "xls", "planilha"].includes(normalized)) {',
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
  '    if (!["pdf", "p"].includes(normalized)) {',
  '      alert("Escolha PDF ou Excel.");',
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
  '      headStyles: { fillColor: [30, 41, 63], textColor: 255, fontStyle: "bold" },',
  '      alternateRowStyles: { fillColor: [248, 249, 251] },',
  '      columnStyles: {',
  '        0: { cellWidth: 20 },',
  '        1: { cellWidth: 14 },',
  '        2: { cellWidth: 14 },',
  '        3: { cellWidth: 48 },',
  '        4: { cellWidth: 52 },',
  '        5: { cellWidth: 24 },',
  '        6: { cellWidth: 13, halign: "right" },',
  '        7: { cellWidth: 14, halign: "right" },',
  '        8: { cellWidth: 20, halign: "right" },',
  '        9: { cellWidth: 16, halign: "right" },',
  '      },',
  '      margin: { left: 10, right: 10 },',
  '    });',
  '    doc.save(fileName + ".pdf");',
  '  };',
  '',
  '  const total = linhas.length;',
]);

if (!oldExport.test(src)) throw new Error('patch-gestao-oferta-lance-export-v4: export function anchor not found');
src = src.replace(oldExport, newExport);

replaceOnce('              <Button variant="secondary" onClick={exportarPDF} disabled={total === 0} className="inline-flex items-center gap-2">\n                Exportar PDF\n              </Button>', '              <Button variant="secondary" onClick={exportarOferta} disabled={total === 0} className="inline-flex items-center gap-2">\n                Exportar\n              </Button>', 'export button');

fs.writeFileSync(file, src);
console.log('patch-gestao-oferta-lance-export-v4 applied');
