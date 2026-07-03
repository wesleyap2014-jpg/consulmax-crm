import fs from 'fs';

const file = 'src/pages/GestaoDeGrupos.tsx';
let src = fs.readFileSync(file, 'utf8');

const lines = (arr) => arr.join('\n');

const rowNew = lines([
  'linhas.map((o, i) => (',
  '                    <tr key={`${o.administradora}-${o.grupo}-${o.cota}-${i}`} className="odd:bg-muted/30">',
  '                      <td className="p-2">{o.administradora}</td>',
  '                      <td className="p-2">{o.grupo}</td>',
  '                      <td className="p-2">{o.cota ?? "—"}</td>',
  '                      <td className="p-2">{o.cliente ?? "—"}</td>',
  '                      <td className="p-2">{o.estrategia_lance || "—"}</td>',
  '                      <td className="p-2">{o.status || "Ativa"}</td>',
  '                      <td className="p-2 text-right">{o.referencia ?? "—"}</td>',
  '                      <td className="p-2 text-right">{o.participantes ?? "—"}</td>',
  '                      <td className="p-2 text-right">{o.mediana != null ? toPct4(Number(o.mediana)) : "—"}</td>',
  '                      <td className="p-2 text-right">{o.contemplados ?? "—"}</td>',
  '                    </tr>',
  '                  ))',
]);

const oldFragmentRegex = /linhas\.map\(\(o, i\) => \(\s*<React\.Fragment[\s\S]*?<\/React\.Fragment>\s*\)\)/;
if (oldFragmentRegex.test(src)) {
  src = src.replace(oldFragmentRegex, rowNew);
}

const oldEightCellRegex = /linhas\.map\(\(o, i\) => \(\s*<tr key=\{`\$\{o\.administradora\}-\$\{o\.grupo\}-\$\{o\.cota\}-\$\{i\}`\} className="odd:bg-muted\/30">\s*<td className="p-2">\{o\.administradora\}<\/td>[\s\S]*?<td className="p-2 text-right">\{o\.contemplados \?\? "—"\}<\/td>\s*<\/tr>\s*\)\)/;
if (oldEightCellRegex.test(src) && !src.includes('{o.estrategia_lance || "—"}')) {
  src = src.replace(oldEightCellRegex, rowNew);
}

if (!src.includes('{o.estrategia_lance || "—"}')) {
  throw new Error('patch-gestao-oferta-lance-strategy-v3: row replacement failed');
}

src = src.replace(/colSpan=\{8\}/g, 'colSpan={10}');
src = src.replace('min-w-[1080px]', 'min-w-[1280px]');

fs.writeFileSync(file, src);
console.log('patch-gestao-oferta-lance-strategy-v3 applied');
