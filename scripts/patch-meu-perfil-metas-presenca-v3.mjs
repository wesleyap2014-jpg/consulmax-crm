import fs from "node:fs";

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, src) { fs.writeFileSync(path, src); }
function replace(src, before, after, label) {
  if (!src.includes(before)) {
    console.log(`[perfil-v3] ${label}: trecho não encontrado`);
    return src;
  }
  console.log(`[perfil-v3] ${label}: aplicado`);
  return src.replace(before, after);
}

// 1) Regras do Programa de Parceiros
{
  const path = "src/components/profile/ProfileAccessSummary.tsx";
  let src = read(path);

  src = src.replace(
    /async function countSimulationsForLeads\([\s\S]*?\n}\n\nfunction ProgressBar/,
`async function countSimulationsForLeads(leadIds: string[], monthStart: Date, nextMonth: Date) {
  if (!leadIds.length) return 0;
  const chunks: string[][] = [];
  for (let i = 0; i < leadIds.length; i += 80) chunks.push(leadIds.slice(i, i + 80));

  const results = await Promise.all(
    chunks.map((ids) =>
      supabase
        .from("sim_simulations")
        .select("lead_id")
        .in("lead_id", ids)
        .gte("created_at", monthStart.toISOString())
        .lt("created_at", nextMonth.toISOString()),
    ),
  );

  if (results.some((result) => result.error)) return null;
  const distinctLeads = new Set<string>();
  results.forEach((result) => {
    (result.data || []).forEach((row: any) => {
      if (row?.lead_id) distinctLeads.add(row.lead_id);
    });
  });
  return distinctLeads.size;
}

function ProgressBar`);

  src = src.replace(
    /const \[salesRes, prospectionsRes, qualificationsRes, meetingsRes, weeklyApproachesRes, leadIdsRes\] = await Promise\.all\(\[[\s\S]*?\n          \]\);/,
`const [
            salesRes,
            leadProspectionsRes,
            opportunityProspectionsRes,
            qualificationsRes,
            meetingsRes,
            leadWeeklyApproachesRes,
            opportunityWeeklyApproachesRes,
            leadIdsRes,
          ] = await Promise.all([
            supabase
              .from("vendas")
              .select("id", { count: "exact", head: true })
              .eq("vendedor_id", authUserId)
              .gte("data_venda", ymd(monthStart))
              .lt("data_venda", ymd(nextMonth)),
            supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("owner_id", authUserId)
              .gte("created_at", monthStart.toISOString())
              .lt("created_at", nextMonth.toISOString()),
            supabase
              .from("opportunities")
              .select("id", { count: "exact", head: true })
              .eq("vendedor_id", authUserId)
              .gte("created_at", monthStart.toISOString())
              .lt("created_at", nextMonth.toISOString()),
            supabase
              .from("opportunities")
              .select("id", { count: "exact", head: true })
              .eq("vendedor_id", authUserId)
              .gte("qualified_at", monthStart.toISOString())
              .lt("qualified_at", nextMonth.toISOString()),
            supabase
              .from("agenda_event_attendance")
              .select("id", { count: "exact", head: true })
              .eq("user_id", userId)
              .gte("attended_at", monthStart.toISOString())
              .lt("attended_at", nextMonth.toISOString()),
            supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("owner_id", authUserId)
              .gte("created_at", weekStart.toISOString())
              .lt("created_at", nextWeek.toISOString()),
            supabase
              .from("opportunities")
              .select("id", { count: "exact", head: true })
              .eq("vendedor_id", authUserId)
              .gte("created_at", weekStart.toISOString())
              .lt("created_at", nextWeek.toISOString()),
            supabase.from("leads").select("id").eq("owner_id", authUserId).limit(5000),
          ]);`);

  src = replace(
    src,
`            prospeccoesMes: countOrNull(prospectionsRes),
            qualificacoesMes: countOrNull(qualificationsRes),
            reunioesTreinamentosMes: countOrNull(meetingsRes),
            abordagensSemana: countOrNull(weeklyApproachesRes),`,
`            prospeccoesMes:
              leadProspectionsRes.error || opportunityProspectionsRes.error
                ? null
                : Number(leadProspectionsRes.count || 0) + Number(opportunityProspectionsRes.count || 0),
            qualificacoesMes: countOrNull(qualificationsRes),
            reunioesTreinamentosMes: countOrNull(meetingsRes),
            abordagensSemana:
              leadWeeklyApproachesRes.error || opportunityWeeklyApproachesRes.error
                ? null
                : Number(leadWeeklyApproachesRes.count || 0) + Number(opportunityWeeklyApproachesRes.count || 0),`,
    "regras de prospecção e abordagem",
  );

  src = replace(src, 'helper="simulações vinculadas aos leads do usuário"', 'helper="leads distintos com pelo menos 1 simulação no mês"', "texto simulações");
  src = replace(src, 'helper="leads registrados no mês"', 'helper="novos leads + novas oportunidades no mês"', "texto prospecções");
  src = replace(src, 'helper="eventos registrados na Agenda"', 'helper="presenças confirmadas por link da Agenda"', "texto presença");
  src = replace(src, 'helper="leads/prospecções registrados nesta semana"', 'helper="novos leads + novas oportunidades nesta semana"', "texto abordagens");

  write(path, src);
}

// 2) Meu Perfil e cascata: layout, gráfico, legibilidade e histórico humano
for (const path of ["src/pages/MeuPerfil.tsx", "src/pages/MeuPerfilCascata.tsx"]) {
  let src = read(path);

  if (!src.includes('import UserActivityFeed from "@/components/profile/UserActivityFeed";')) {
    const anchor = 'import ProfileAccessSummary from "@/components/profile/ProfileAccessSummary";\n';
    if (src.includes(anchor)) src = src.replace(anchor, `${anchor}import UserActivityFeed from "@/components/profile/UserActivityFeed";\n`);
  }

  src = src.replace(
    /        <Card className="bg-white\/95 xl:col-span-4">\s*<CardHeader className="pb-2"><SectionTitle icon=\{Target\}>Metas Comerciais<\/SectionTitle><\/CardHeader>[\s\S]*?        <\/Card>\n\n        <Card className="bg-white\/95 xl:col-span-8">/,
    '        <Card className="bg-white/95 xl:col-span-12">',
  );

  src = src.replace('className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"', 'className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6"');
  src = src.replace(
    '<Kpi label="Vendas no mês" value={formatBRL(metrics.salesMonthTotal)} helper={`${metrics.salesMonthCount} venda(s)`} />',
    '<Kpi label="Realizado no mês" value={formatBRL(metrics.salesMonthTotal)} helper={`${metrics.salesMonthCount} venda(s)`} />\n              <Kpi label="Meta mensal" value={formatBRL(metrics.salesGoal)} helper={metrics.salesGoal ? `${pct(metrics.salesMonthTotal, metrics.salesGoal).toFixed(0)}% atingido` : "Meta não definida"} />',
  );

  src = src.replace(
    'mes: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""),',
    'mes: `${new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "")}/${String(date.getFullYear()).slice(-2)}`,',
  );

  src = src.replace('className="bg-slate-900 hover:bg-slate-900"', 'className="bg-[#1E293F] text-white hover:bg-[#1E293F]"');
  src = src.replace('className="border border-[#A11C27]/20 bg-[#A11C27]/5 text-[#7d1620]"', 'className="border border-[#A11C27]/25 bg-[#A11C27]/10 text-[#7d1620]"');

  src = src.replace(
    /        <Card className="bg-white\/95 xl:col-span-4">\s*<CardHeader className="pb-2"><SectionTitle icon=\{Activity\}>Atividade do Usuário<\/SectionTitle><\/CardHeader>[\s\S]*?        <\/Card>\n\n        <Card className="bg-white\/95 xl:col-span-4">/,
    '        <UserActivityFeed userId={profile.id} />\n\n        <Card className="bg-white/95 xl:col-span-4">',
  );

  write(path, src);
  console.log(`[perfil-v3] ${path}: refinado`);
}

// 3) Agenda: gerar/copiar link de presença para reuniões
{
  const path = "src/pages/AgendaLiveKit.tsx";
  let src = read(path);

  if (!src.includes("async function copyAttendanceLink(ev: AgendaEvento)")) {
    src = src.replace(
      "  async function saveReschedule()",
`  async function copyAttendanceLink(ev: AgendaEvento) {
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Usuário não autenticado.");

      let { data: existing, error: selectError } = await supabase
        .from("agenda_attendance_links")
        .select("token")
        .eq("event_id", ev.id)
        .maybeSingle();
      if (selectError) throw selectError;

      let token = existing?.token || null;
      if (!token) {
        const { data: created, error: insertError } = await supabase
          .from("agenda_attendance_links")
          .insert({ event_id: ev.id, created_by: authData.user.id, is_active: true })
          .select("token")
          .single();
        if (insertError) throw insertError;
        token = created?.token || null;
      }

      if (!token) throw new Error("Não foi possível gerar o link.");
      clipboardCopy(`${window.location.origin}/presenca/${token}`);
    } catch (e: any) {
      alert("Não foi possível gerar o link de presença: " + (e?.message || "erro desconhecido"));
    }
  }

  async function saveReschedule()`);
  }

  src = src.replace(
    '{renderVideoActions(ev, true)}{wa &&',
    '{renderVideoActions(ev, true)}{ev.tipo === "reuniao" && <button style={btnTiny} onClick={() => copyAttendanceLink(ev)}>Link de presença</button>}{wa &&',
  );
  src = src.replace(
    '{renderVideoActions(e)}{wa ?',
    '{renderVideoActions(e)}{e.tipo === "reuniao" && <button style={btnSecondary} onClick={() => copyAttendanceLink(e)}>Link de presença</button>}{wa ?',
  );

  write(path, src);
  console.log("[perfil-v3] AgendaLiveKit: link de presença aplicado");
}

// 4) Rota pública de presença
{
  const path = "src/router.tsx";
  let src = read(path);
  if (!src.includes('const PublicAgendaAttendance = React.lazy(() => import("./pages/PublicAgendaAttendance"));')) {
    src = src.replace(
      'const PublicPonto = React.lazy(() => import("./pages/PublicPonto"));',
      'const PublicPonto = React.lazy(() => import("./pages/PublicPonto"));\nconst PublicAgendaAttendance = React.lazy(() => import("./pages/PublicAgendaAttendance"));',
    );
  }
  if (!src.includes('{ path: "/presenca/:token", element: withSuspense(<PublicAgendaAttendance />) },')) {
    src = src.replace(
      '{ path: "/registro-ponto", element: <Navigate to="/ponto" replace /> },',
      '{ path: "/registro-ponto", element: <Navigate to="/ponto" replace /> },\n  { path: "/presenca/:token", element: withSuspense(<PublicAgendaAttendance />) },',
    );
  }
  write(path, src);
  console.log("[perfil-v3] router: rota pública de presença aplicada");
}
