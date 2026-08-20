import fs from "node:fs";

const path = "src/pages/RankingVendedores.tsx";
let src = fs.readFileSync(path, "utf8");
let changed = false;

if (!src.includes('const [section, setSection] = useState<"ranking" | "destaques">("ranking");')) {
  const anchor = '  const [mode, setMode] = useState<RankingMode>("producao");\n';
  if (src.includes(anchor)) {
    src = src.replace(anchor, `${anchor}  const [section, setSection] = useState<"ranking" | "destaques">("ranking");\n`);
    changed = true;
  }
}

const earlyReturnAnchor = '  return (\n    <div className="p-4 md:p-6 animate-in fade-in slide-in-from-bottom-2">';
if (!src.includes('section === "destaques"')) {
  const earlyReturn = `  if (section === "destaques") {\n    return (\n      <div className="p-4 md:p-6 animate-in fade-in slide-in-from-bottom-2">\n        <div className="pointer-events-none fixed inset-0 -z-10">\n          <div className="absolute -top-16 -left-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-25 bg-[#A11C27]" />\n          <div className="absolute top-10 right-10 w-[360px] h-[360px] rounded-full blur-3xl opacity-25 bg-[#1E293F]" />\n          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[260px] h-[260px] rounded-full blur-3xl opacity-30 bg-[#E0CE8C]" />\n        </div>\n\n        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">\n          <div>\n            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2 text-[#1E293F]">\n              <Trophy className="h-7 w-7 text-[#B5A573]" />\n              Ranking dos Vendedores\n              <Badge className="ml-2" variant="danger">{months[month]}/{year}</Badge>\n            </h1>\n            <p className="text-sm text-muted-foreground">Reconhecimento dos destaques comerciais do time.</p>\n          </div>\n\n          <div className="flex flex-wrap gap-3 items-end justify-end">\n            <div className="flex items-center gap-2">\n              <CalIcon className="h-4 w-4 text-muted-foreground" />\n              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>\n                <SelectTrigger className="w-[140px] bg-white/80"><SelectValue /></SelectTrigger>\n                <SelectContent>\n                  {months.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}\n                </SelectContent>\n              </Select>\n            </div>\n            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>\n              <SelectTrigger className="w-[110px] bg-white/80"><SelectValue /></SelectTrigger>\n              <SelectContent>\n                {Array.from({ length: 6 }).map((_, idx) => {\n                  const y = now.getUTCFullYear() - 3 + idx;\n                  return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;\n                })}\n              </SelectContent>\n            </Select>\n          </div>\n        </div>\n\n        <div className="mb-6 inline-flex rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">\n          <button type="button" onClick={() => setSection("ranking")} className="rounded-xl px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Ranking</button>\n          <button type="button" onClick={() => setSection("destaques")} className="rounded-xl bg-[#1E293F] px-5 py-2 text-sm font-semibold text-white shadow-sm">Destaques</button>\n        </div>\n\n        <RankingDestaques year={year} month={month} />\n      </div>\n    );\n  }\n\n${earlyReturnAnchor}`;
  if (src.includes(earlyReturnAnchor)) {
    src = src.replace(earlyReturnAnchor, earlyReturn);
    changed = true;
  }
}

const metricsAnchor = '      {/* Métricas rápidas */}';
if (!src.includes('onClick={() => setSection("destaques")} className="rounded-xl px-5 py-2')) {
  const tabs = `      <div className="mb-6 inline-flex rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">\n        <button type="button" onClick={() => setSection("ranking")} className="rounded-xl bg-[#1E293F] px-5 py-2 text-sm font-semibold text-white shadow-sm">Ranking</button>\n        <button type="button" onClick={() => setSection("destaques")} className="rounded-xl px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Destaques</button>\n      </div>\n\n${metricsAnchor}`;
  if (src.includes(metricsAnchor)) {
    src = src.replace(metricsAnchor, tabs);
    changed = true;
  }
}

// O v1 injeta o bloco no corpo do Ranking. Nesta versão ele deve existir somente na aba Destaques.
src = src.replace(/\n\s*<RankingDestaques year=\{year\} month=\{month\} \/>\n\n\s*\{\/\* Minha posição \+ Insights \*\//, '\n\n      {/* Minha posição + Insights */');

if (src.includes("Destaques do mês")) {
  src = src.replace("Destaques do mês", "Insights do mês");
  changed = true;
}

if (changed) fs.writeFileSync(path, src);
console.log(`[ranking-tabs-v2] ${changed ? "aplicado" : "sem alterações"}`);
