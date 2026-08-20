import fs from "node:fs";

const path = "src/pages/MeuPerfilCascata.tsx";
let src = fs.readFileSync(path, "utf8");
let changed = false;

const aggregateAnchor = "function PerfilAgregado({ users }: { users: VisibleUser[] }) {";

if (!src.includes("type ConsolidatedPartnerProgram =")) {
  if (!src.includes(aggregateAnchor)) throw new Error("[meu-perfil-partner-v2] PerfilAgregado não encontrado");

  const helpers = `type ConsolidatedPartnerProgram = {
  participantCount: number;
  selectedCount: number;
  categories: Array<{ name: string; count: number }>;
  goals: {
    vendasMes: number;
    simulacoesMes: number;
    prospeccoesMes: number;
    qualificacoesMes: number;
    reunioesTreinamentosMes: number;
    abordagensSemana: number;
  };
  actuals: {
    vendasMes: number | null;
    simulacoesMes: number | null;
    prospeccoesMes: number | null;
    qualificacoesMes: number | null;
    reunioesTreinamentosMes: number | null;
    abordagensSemana: number | null;
  };
};

function startOfWeekMondayPartner(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

async function countDistinctSimulatedPartnerLeads(leadIds: string[], monthStart: Date, nextMonth: Date) {
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
  const distinct = new Set<string>();
  results.forEach((result) => {
    (result.data || []).forEach((row: any) => {
      if (row?.lead_id) distinct.add(row.lead_id);
    });
  });
  return distinct.size;
}

`;

  src = src.replace(aggregateAnchor, helpers + aggregateAnchor);
  changed = true;
  console.log("[meu-perfil-partner-v2] tipos e helpers: aplicado");
}

const start = src.indexOf(aggregateAnchor);
const end = src.indexOf("export default function MeuPerfilCascata()", start);
if (start < 0 || end < 0) throw new Error("[meu-perfil-partner-v2] bloco consolidado não encontrado");

let block = src.slice(start, end);

function replaceBlock(before, after, label) {
  if (!block.includes(before)) {
    console.log(`[meu-perfil-partner-v2] ${label}: trecho não encontrado`);
    return;
  }
  block = block.replace(before, after);
  changed = true;
  console.log(`[meu-perfil-partner-v2] ${label}: aplicado`);
}

replaceBlock(
  `  const [error, setError] = useState<string | null>(null);\n\n  const userKey = users.map((u) => u.id).sort().join("|");`,
  `  const [error, setError] = useState<string | null>(null);\n  const [partnerProgram, setPartnerProgram] = useState<ConsolidatedPartnerProgram | null>(null);\n\n  const userKey = users.map((u) => u.id).sort().join("|");`,
  "estado Programa de Parceiros",
);

replaceBlock(
  `    setLoading(true);\n    setError(null);\n    try {`,
  `    setLoading(true);\n    setError(null);\n    setPartnerProgram(null);\n    try {`,
  "reset Programa de Parceiros",
);

const aggregateSet = `      setAggregate({
        sales: (salesRes.data || []) as SaleRow[],
        opportunities: (oppRes.data || []) as OpportunityRow[],
        leadCountMonth: leadsRes.count || 0,
        goals: (goalsRes.data || []) as Array<GoalRow & { vendedor_id?: string | null }>,
      });`;

const aggregateSetWithPartner = `      setAggregate({
        sales: (salesRes.data || []) as SaleRow[],
        opportunities: (oppRes.data || []) as OpportunityRow[],
        leadCountMonth: leadsRes.count || 0,
        goals: (goalsRes.data || []) as Array<GoalRow & { vendedor_id?: string | null }>,
      });

      try {
        const assignmentsRes = await supabase
          .from("user_access_assignments")
          .select("user_id,partner_category_id")
          .in("user_id", profileIds);
        if (assignmentsRes.error) throw assignmentsRes.error;

        const selectedById = new Map(users.map((user) => [user.id, user]));
        const assignmentByUser = new Map<string, any>();
        (assignmentsRes.data || []).forEach((row: any) => {
          if (row?.user_id && row?.partner_category_id) assignmentByUser.set(row.user_id, row);
        });
        const partnerAssignments = Array.from(assignmentByUser.values()).filter((row: any) => selectedById.has(row.user_id));

        if (!partnerAssignments.length) {
          setPartnerProgram({
            participantCount: 0,
            selectedCount: users.length,
            categories: [],
            goals: { vendasMes: 0, simulacoesMes: 0, prospeccoesMes: 0, qualificacoesMes: 0, reunioesTreinamentosMes: 0, abordagensSemana: 0 },
            actuals: { vendasMes: 0, simulacoesMes: 0, prospeccoesMes: 0, qualificacoesMes: 0, reunioesTreinamentosMes: 0, abordagensSemana: 0 },
          });
        } else {
          const categoryIds = Array.from(new Set(partnerAssignments.map((row: any) => row.partner_category_id).filter(Boolean)));
          const categoriesRes = await supabase
            .from("partner_categories")
            .select("id,name,requirements")
            .in("id", categoryIds);
          if (categoriesRes.error) throw categoriesRes.error;

          const categoryMap = new Map<string, any>();
          (categoriesRes.data || []).forEach((row: any) => categoryMap.set(row.id, row));
          const validAssignments = partnerAssignments.filter((row: any) => categoryMap.has(row.partner_category_id));
          const participantUsers = validAssignments
            .map((row: any) => selectedById.get(row.user_id))
            .filter(Boolean) as VisibleUser[];
          const participantProfileIds = participantUsers.map((user) => user.id).filter(Boolean);
          const participantAuthIds = participantUsers.map((user) => user.auth_user_id).filter(Boolean);

          const goals = {
            vendasMes: 0,
            simulacoesMes: 0,
            prospeccoesMes: 0,
            qualificacoesMes: 0,
            reunioesTreinamentosMes: 0,
            abordagensSemana: 0,
          };
          const categoryCounts = new Map<string, number>();

          validAssignments.forEach((assignment: any) => {
            const category = categoryMap.get(assignment.partner_category_id);
            const req = category?.requirements || {};
            goals.vendasMes += Number(req.vendas_mes || 0);
            goals.simulacoesMes += Number(req.simulacoes_mes || 0);
            goals.prospeccoesMes += Number(req.prospeccoes_mes || 0);
            goals.qualificacoesMes += Number(req.qualificacoes_mes || 0);
            goals.reunioesTreinamentosMes += Number(req.reunioes_treinamentos_mes || 0);
            goals.abordagensSemana += Number(req.compromisso_semanal_abordagens || 0);
            const categoryName = String(category?.name || "Sem categoria");
            categoryCounts.set(categoryName, Number(categoryCounts.get(categoryName) || 0) + 1);
          });

          if (!participantAuthIds.length || !participantProfileIds.length) {
            setPartnerProgram({
              participantCount: 0,
              selectedCount: users.length,
              categories: [],
              goals,
              actuals: { vendasMes: 0, simulacoesMes: 0, prospeccoesMes: 0, qualificacoesMes: 0, reunioesTreinamentosMes: 0, abordagensSemana: 0 },
            });
          } else {
            const weekStart = startOfWeekMondayPartner(now);
            const nextWeek = new Date(weekStart);
            nextWeek.setDate(nextWeek.getDate() + 7);

            const [
              programSalesRes,
              leadProspectionsRes,
              opportunityProspectionsRes,
              qualificationsRes,
              meetingsRes,
              leadWeeklyRes,
              opportunityWeeklyRes,
              leadIdsRes,
            ] = await Promise.all([
              supabase
                .from("vendas")
                .select("id", { count: "exact", head: true })
                .in("vendedor_id", participantAuthIds)
                .gte("data_venda", ymd(monthStart))
                .lt("data_venda", ymd(nextMonth)),
              supabase
                .from("leads")
                .select("id", { count: "exact", head: true })
                .in("owner_id", participantAuthIds)
                .gte("created_at", monthStart.toISOString())
                .lt("created_at", nextMonth.toISOString()),
              supabase
                .from("opportunities")
                .select("id", { count: "exact", head: true })
                .in("vendedor_id", participantAuthIds)
                .gte("created_at", monthStart.toISOString())
                .lt("created_at", nextMonth.toISOString()),
              supabase
                .from("opportunities")
                .select("id", { count: "exact", head: true })
                .in("vendedor_id", participantAuthIds)
                .gte("qualified_at", monthStart.toISOString())
                .lt("qualified_at", nextMonth.toISOString()),
              supabase
                .from("agenda_event_attendance")
                .select("id", { count: "exact", head: true })
                .in("user_id", participantProfileIds)
                .gte("attended_at", monthStart.toISOString())
                .lt("attended_at", nextMonth.toISOString()),
              supabase
                .from("leads")
                .select("id", { count: "exact", head: true })
                .in("owner_id", participantAuthIds)
                .gte("created_at", weekStart.toISOString())
                .lt("created_at", nextWeek.toISOString()),
              supabase
                .from("opportunities")
                .select("id", { count: "exact", head: true })
                .in("vendedor_id", participantAuthIds)
                .gte("created_at", weekStart.toISOString())
                .lt("created_at", nextWeek.toISOString()),
              supabase.from("leads").select("id").in("owner_id", participantAuthIds).limit(10000),
            ]);

            const participantLeadIds = leadIdsRes.error
              ? []
              : (leadIdsRes.data || []).map((row: any) => row.id).filter(Boolean);
            const simulations = leadIdsRes.error
              ? null
              : await countDistinctSimulatedPartnerLeads(participantLeadIds, monthStart, nextMonth);
            const count = (result: any) => result?.error ? null : Number(result?.count || 0);
            const addCounts = (first: number | null, second: number | null) => first === null || second === null ? null : first + second;

            setPartnerProgram({
              participantCount: participantUsers.length,
              selectedCount: users.length,
              categories: Array.from(categoryCounts.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })),
              goals,
              actuals: {
                vendasMes: count(programSalesRes),
                simulacoesMes: simulations,
                prospeccoesMes: addCounts(count(leadProspectionsRes), count(opportunityProspectionsRes)),
                qualificacoesMes: count(qualificationsRes),
                reunioesTreinamentosMes: count(meetingsRes),
                abordagensSemana: addCounts(count(leadWeeklyRes), count(opportunityWeeklyRes)),
              },
            });
          }
        }
      } catch (partnerError) {
        console.warn("[PerfilAgregado:ProgramaParceiros]", partnerError);
        setPartnerProgram({
          participantCount: 0,
          selectedCount: users.length,
          categories: [],
          goals: { vendasMes: 0, simulacoesMes: 0, prospeccoesMes: 0, qualificacoesMes: 0, reunioesTreinamentosMes: 0, abordagensSemana: 0 },
          actuals: { vendasMes: null, simulacoesMes: null, prospeccoesMes: null, qualificacoesMes: null, reunioesTreinamentosMes: null, abordagensSemana: null },
        });
      }`;

replaceBlock(aggregateSet, aggregateSetWithPartner, "cálculo consolidado do Programa de Parceiros");

replaceBlock(
  `  const previewUsers = users.slice(0, 8);\n  const remaining = Math.max(0, users.length - previewUsers.length);\n\n  return (`,
  `  const previewUsers = users.slice(0, 8);\n  const remaining = Math.max(0, users.length - previewUsers.length);\n  const partnerMetrics = partnerProgram ? [\n    { label: "Vendas no mês", actual: partnerProgram.actuals.vendasMes, goal: partnerProgram.goals.vendasMes, helper: "vendas registradas no mês" },\n    { label: "Simulações no mês", actual: partnerProgram.actuals.simulacoesMes, goal: partnerProgram.goals.simulacoesMes, helper: "leads distintos com pelo menos 1 simulação no mês" },\n    { label: "Prospecções no mês", actual: partnerProgram.actuals.prospeccoesMes, goal: partnerProgram.goals.prospeccoesMes, helper: "novos leads + novas oportunidades no mês" },\n    { label: "Qualificações no mês", actual: partnerProgram.actuals.qualificacoesMes, goal: partnerProgram.goals.qualificacoesMes, helper: "oportunidades qualificadas no mês" },\n    { label: "Reuniões / treinamentos", actual: partnerProgram.actuals.reunioesTreinamentosMes, goal: partnerProgram.goals.reunioesTreinamentosMes, helper: "presenças confirmadas por link da Agenda" },\n    { label: "Abordagens na semana", actual: partnerProgram.actuals.abordagensSemana, goal: partnerProgram.goals.abordagensSemana, helper: "novos leads + novas oportunidades nesta semana" },\n  ] : [];\n  const partnerAvailableMetrics = partnerMetrics.filter((item) => item.actual !== null && Number(item.goal || 0) > 0);\n  const partnerCompletedMetrics = partnerAvailableMetrics.filter((item) => Number(item.actual || 0) >= Number(item.goal || 0)).length;\n  const partnerAverageProgress = partnerAvailableMetrics.length\n    ? partnerAvailableMetrics.reduce((sum, item) => sum + Math.max(0, Math.min(100, (Number(item.actual || 0) / Number(item.goal || 1)) * 100)), 0) / partnerAvailableMetrics.length\n    : 0;\n\n  return (`,
  "métricas do Programa de Parceiros",
);

const iaAnchor = `      <Card className="overflow-hidden border-[#A11C27]/20 bg-white/95">
        <CardHeader className="pb-2"><SectionTitle icon={Sparkles}>IA / Max — consolidado</SectionTitle></CardHeader>`;

const partnerCard = `      <Card className="border-[#A11C27]/15 bg-white/95">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base font-black text-slate-900">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#A11C27]/10 text-[#A11C27]">
                  <Target className="h-4.5 w-4.5" />
                </span>
                Programa de Parceiros — consolidado
                {partnerProgram ? <Badge className="bg-[#A11C27] hover:bg-[#A11C27]">{partnerProgram.participantCount} participante(s)</Badge> : null}
              </CardTitle>
              <div className="mt-1.5 max-w-3xl text-sm text-slate-500">
                Realizado e meta somam somente os usuários selecionados que pertencem ao Programa de Parceiros. Cada meta respeita a categoria individual de cada participante.
              </div>
              {partnerProgram?.categories?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {partnerProgram.categories.map((item) => (
                    <Badge key={item.name} variant="secondary" className="border border-slate-200 bg-slate-50 text-slate-700">
                      {item.count} {item.name}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            {partnerAvailableMetrics.length > 0 ? (
              <div className="min-w-[220px] rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Aderência às metas</div>
                    <div className="mt-0.5 text-xl font-black text-slate-900">{partnerAverageProgress.toFixed(0)}%</div>
                  </div>
                  <div className="text-right text-xs font-semibold text-slate-500">
                    {partnerCompletedMetrics} de {partnerAvailableMetrics.length}<br />cumpridas
                  </div>
                </div>
                <div className="mt-2"><Progress value={partnerAverageProgress} /></div>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {partnerProgram?.participantCount ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {partnerMetrics.map((item) => {
                const target = Number(item.goal || 0);
                const percentage = target > 0 && item.actual !== null ? Math.max(0, Math.min(100, (Number(item.actual || 0) / target) * 100)) : 0;
                const completed = target > 0 && item.actual !== null && Number(item.actual) >= target;
                return (
                  <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{item.label}</div>
                      {completed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
                    </div>
                    <div className="mt-1 flex items-end gap-1.5">
                      <span className="text-2xl font-black text-slate-900">{item.actual === null ? "—" : item.actual}</span>
                      <span className="pb-0.5 text-xs font-semibold text-slate-400">/ {target || "—"}</span>
                    </div>
                    <div className="mt-2"><Progress value={percentage} /></div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>{item.helper}</span>
                      <span className="shrink-0 font-extrabold text-slate-700">{target > 0 && item.actual !== null ? percentage.toFixed(0) + "%" : "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-500">
              Nenhum dos usuários selecionados possui categoria ativa no Programa de Parceiros.
            </div>
          )}
        </CardContent>
      </Card>

`;

if (!block.includes("Programa de Parceiros — consolidado")) {
  if (!block.includes(iaAnchor)) {
    console.log("[meu-perfil-partner-v2] card Programa de Parceiros: âncora não encontrada");
  } else {
    block = block.replace(iaAnchor, partnerCard + iaAnchor);
    changed = true;
    console.log("[meu-perfil-partner-v2] card Programa de Parceiros: aplicado");
  }
}

src = src.slice(0, start) + block + src.slice(end);

if (changed) fs.writeFileSync(path, src);
console.log(`[meu-perfil-partner-v2] concluído${changed ? " com alterações" : " sem alterações"}`);
