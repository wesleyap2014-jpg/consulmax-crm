import fs from "node:fs";

function replaceOnce(src, before, after, label) {
  if (!src.includes(before)) {
    console.log(`[ranking-highlights-closeout-v2] ${label}: trecho não encontrado`);
    return src;
  }
  console.log(`[ranking-highlights-closeout-v2] ${label}: aplicado`);
  return src.replace(before, after);
}

// 1) Cards de feed: manter somente o essencial e usar foto no resumo.
{
  const path = "src/components/ranking/rankingFeedCard.ts";
  let src = fs.readFileSync(path, "utf8");
  let changed = false;

  const leaderHelperRegex = /\n  if \(input\.helper\) \{\n    ctx\.fillStyle = "#64748B";\n    ctx\.font = "600 25px Manrope";\n    drawWrappedText\(ctx, input\.helper, 366, 770, 560, 34, 3\);\n  \}\n/;
  if (leaderHelperRegex.test(src)) {
    src = src.replace(leaderHelperRegex, "\n");
    changed = true;
    console.log("[ranking-highlights-closeout-v2] remove descrição do card individual: aplicado");
  }

  if (src.includes("items.forEach((item, index) => {")) {
    src = src.replace(
      "items.forEach((item, index) => {",
      "for (let index = 0; index < items.length; index += 1) {\n    const item = items[index];",
    );
    src = src.replace("\n  });\n\n  drawFooter(ctx);", "\n  }\n\n  drawFooter(ctx);");
    changed = true;
    console.log("[ranking-highlights-closeout-v2] resumo preparado para fotos assíncronas: aplicado");
  }

  const numberBadgeRegex = /\n    fillRoundRect\(ctx, 82, y \+ 18, 54, 90, 18, index === 0 \? GOLD : RUBY\);\n    ctx\.fillStyle = "#FFFFFF";\n    ctx\.font = "800 25px Manrope";\n    ctx\.textAlign = "center";\n    ctx\.fillText\(String\(index \+ 1\), 109, y \+ 73\);\n    ctx\.textAlign = "left";\n/;
  if (numberBadgeRegex.test(src)) {
    src = src.replace(numberBadgeRegex, "\n    await drawAvatar(ctx, item, 82, y + 24, 78);\n");
    changed = true;
    console.log("[ranking-highlights-closeout-v2] números do resumo substituídos por foto: aplicado");
  }

  const summaryHelperRegex = /\n    if \(item\.helper\) \{\n      ctx\.fillStyle = "#94A3B8";\n      ctx\.font = "600 17px Manrope";\n      drawWrappedText\(ctx, item\.helper, 164, y \+ 103, 800, 22, 1\);\n    \}\n/;
  if (summaryHelperRegex.test(src)) {
    src = src.replace(summaryHelperRegex, "\n");
    changed = true;
    console.log("[ranking-highlights-closeout-v2] remove descrição do card resumo: aplicado");
  }

  if (src.includes('ctx.fillText(item.label.toUpperCase(), 164, y + 34);')) {
    src = src.replace('ctx.fillText(item.label.toUpperCase(), 164, y + 34);', 'ctx.fillText(item.label.toUpperCase(), 184, y + 34);');
    changed = true;
  }
  if (src.includes('drawWrappedText(ctx, item.name || "Sem registros", 164, y + 75, 550, 34, 1);')) {
    src = src.replace(
      'drawWrappedText(ctx, item.name || "Sem registros", 164, y + 75, 550, 34, 1);',
      'drawWrappedText(ctx, item.name || "Sem registros", 184, y + 75, 530, 34, 1);',
    );
    changed = true;
  }

  if (changed) fs.writeFileSync(path, src);
}

// 2) Destaques: suportar abertura automática da semana anterior e do mês anterior.
{
  const path = "src/components/ranking/RankingDestaques.tsx";
  let src = fs.readFileSync(path, "utf8");

  if (!src.includes("function weekRange(offsetWeeks = 0)")) {
    src = replaceOnce(src, "function weekRange() {", "function weekRange(offsetWeeks = 0) {", "weekRange com offset");
    src = replaceOnce(
      src,
      "  start.setUTCDate(start.getUTCDate() - sinceMonday);\n  const end = new Date(start);",
      "  start.setUTCDate(start.getUTCDate() - sinceMonday);\n  if (offsetWeeks) start.setUTCDate(start.getUTCDate() + offsetWeeks * 7);\n  const end = new Date(start);",
      "aplica offset semanal",
    );
  }

  if (!src.includes("weekOffset = 0")) {
    src = replaceOnce(
      src,
      "function periodLabel(mode: PeriodMode, year: number, month: number) {",
      "function periodLabel(mode: PeriodMode, year: number, month: number, weekOffset = 0) {",
      "periodLabel com offset",
    );
    src = replaceOnce(src, "  const range = weekRange();", "  const range = weekRange(weekOffset);", "label usa semana selecionada");
  }

  if (!src.includes("const [weekOffset, setWeekOffset]")) {
    src = replaceOnce(
      src,
      '  const [period, setPeriod] = useState<PeriodMode>("week");',
      '  const [period, setPeriod] = useState<PeriodMode>(() => new URLSearchParams(window.location.search).get("period") === "month" ? "month" : "week");\n  const [weekOffset, setWeekOffset] = useState(() => {\n    const query = new URLSearchParams(window.location.search);\n    return query.get("period") === "week" && query.get("scope") === "previous" ? -1 : 0;\n  });',
      "estado inicial por deep link",
    );
  }

  src = replaceOnce(
    src,
    '  const range = useMemo(() => (period === "week" ? weekRange() : monthRange(year, month)), [period, year, month]);',
    '  const range = useMemo(() => (period === "week" ? weekRange(weekOffset) : monthRange(year, month)), [period, weekOffset, year, month]);',
    "range usa semana anterior",
  );

  if (src.includes("periodLabel(period, year, month)")) {
    src = src.split("periodLabel(period, year, month)").join("periodLabel(period, year, month, weekOffset)");
    console.log("[ranking-highlights-closeout-v2] labels de período atualizados: aplicado");
  }

  src = replaceOnce(
    src,
    '{period === "week" ? "Semana atual" : "Mês selecionado"} •',
    '{period === "week" ? (weekOffset < 0 ? "Semana anterior" : "Semana atual") : "Mês selecionado"} •',
    "rótulo semana anterior",
  );

  src = replaceOnce(
    src,
    'onClick={() => setPeriod("week")}',
    'onClick={() => { setPeriod("week"); setWeekOffset(0); }}',
    "botão Semana volta para atual",
  );

  fs.writeFileSync(path, src);
}

// 3) Ranking: ao abrir o fechamento mensal pelo Meu Dia, selecionar o mês anterior.
{
  const path = "src/pages/RankingVendedores.tsx";
  let src = fs.readFileSync(path, "utf8");

  if (!src.includes("const openPreviousHighlightsMonth")) {
    src = replaceOnce(
      src,
      'export default function RankingVendedores() {\n  const now = new Date();\n\n  const [authUserId, setAuthUserId] = useState<string | null>(null);\n  const [year, setYear] = useState(now.getUTCFullYear());\n  const [month, setMonth] = useState(now.getUTCMonth());',
      'export default function RankingVendedores() {\n  const now = new Date();\n  const highlightsQuery = new URLSearchParams(window.location.search);\n  const openPreviousHighlightsMonth = highlightsQuery.get("tab") === "destaques" && highlightsQuery.get("period") === "month" && highlightsQuery.get("scope") === "previous";\n  const initialRankingDate = openPreviousHighlightsMonth\n    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))\n    : now;\n\n  const [authUserId, setAuthUserId] = useState<string | null>(null);\n  const [year, setYear] = useState(initialRankingDate.getUTCFullYear());\n  const [month, setMonth] = useState(initialRankingDate.getUTCMonth());',
      "mês anterior no fechamento",
    );
  }

  fs.writeFileSync(path, src);
}

// 4) Meu Dia: fechamento semanal na segunda e mensal no primeiro dia útil.
{
  const path = "src/pages/Inicio.tsx";
  let src = fs.readFileSync(path, "utf8");

  const lastBusinessHelper = 'function isLastBusinessDayOfMonthYMD(ymd: string) { const day = weekdayYMD(ymd); if (day === 0 || day === 6) return false; let next = addDaysYMD(ymd, 1); while ([0, 6].includes(weekdayYMD(next))) next = addDaysYMD(next, 1); return next.slice(0, 7) !== ymd.slice(0, 7); }';
  if (!src.includes("function isFirstBusinessDayOfMonthYMD")) {
    src = replaceOnce(
      src,
      lastBusinessHelper,
      `${lastBusinessHelper}\nfunction isFirstBusinessDayOfMonthYMD(ymd: string) { const day = weekdayYMD(ymd); if (day === 0 || day === 6) return false; let prev = addDaysYMD(ymd, -1); while ([0, 6].includes(weekdayYMD(prev))) prev = addDaysYMD(prev, -1); return prev.slice(0, 7) !== ymd.slice(0, 7); }`,
      "helper primeiro dia útil",
    );
  }

  src = replaceOnce(
    src,
    '    if (weekdayYMD(today) === 5) {\n      myDay.push({\n        id: `weekly-highlights-${today}`',
    '    if (weekdayYMD(today) === 1) {\n      myDay.push({\n        id: `weekly-highlights-${today}`',
    "fechamento semanal na segunda",
  );
  src = replaceOnce(
    src,
    '        desc: "Abra a aba Destaques, confira os campeões da semana e baixe o card para compartilhar com o time.",',
    '        desc: "Confira os destaques da semana anterior e gere os cards para compartilhar com o time.",',
    "descrição semanal anterior",
  );
  src = replaceOnce(
    src,
    '        action: { label: "Abrir Destaques", to: "/ranking?tab=destaques" },',
    '        action: { label: "Abrir Destaques", to: "/ranking?tab=destaques&period=week&scope=previous" },',
    "deep link semana anterior",
  );

  src = replaceOnce(
    src,
    '    if (isLastBusinessDayOfMonthYMD(today)) {\n      myDay.push({\n        id: `monthly-highlights-${today}`',
    '    if (isFirstBusinessDayOfMonthYMD(today)) {\n      myDay.push({\n        id: `monthly-highlights-${today}`',
    "fechamento mensal no primeiro dia útil",
  );
  src = replaceOnce(
    src,
    '        desc: "Confira os destaques do mês e gere o card de fechamento para compartilhar com o time.",',
    '        desc: "Confira os destaques do mês anterior e gere os cards de fechamento para compartilhar com o time.",',
    "descrição mensal anterior",
  );

  const weeklyLink = '        action: { label: "Abrir Destaques", to: "/ranking?tab=destaques&period=week&scope=previous" },';
  const monthlyOldLink = '        action: { label: "Abrir Destaques", to: "/ranking?tab=destaques" },';
  const monthlyIndex = src.indexOf('id: `monthly-highlights-${today}`');
  if (monthlyIndex >= 0) {
    const tail = src.slice(monthlyIndex);
    const linkIndex = tail.indexOf(monthlyOldLink);
    if (linkIndex >= 0) {
      const absolute = monthlyIndex + linkIndex;
      src = src.slice(0, absolute) + '        action: { label: "Abrir Destaques", to: "/ranking?tab=destaques&period=month&scope=previous" },' + src.slice(absolute + monthlyOldLink.length);
      console.log("[ranking-highlights-closeout-v2] deep link mês anterior: aplicado");
    } else if (!tail.includes('period=month&scope=previous')) {
      console.log("[ranking-highlights-closeout-v2] deep link mês anterior: trecho não encontrado");
    }
  }

  if (!src.includes(weeklyLink)) {
    console.log("[ranking-highlights-closeout-v2] aviso: deep link semanal não confirmado");
  }

  fs.writeFileSync(path, src);
}

console.log("[ranking-highlights-closeout-v2] concluído");
