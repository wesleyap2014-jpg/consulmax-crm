import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CalendarRange,
  CheckCircle2,
  ShieldCheck,
  Target,
  Trophy,
  UserCog,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { ACCESS_GUIDES } from "@/access/permissionCatalog";

const scopeLabels: Record<string, string> = {
  vendas: "Vendas",
  pos_venda: "Pós-venda",
  leads: "Leads",
  oportunidades: "Oportunidades",
  simuladores: "Simuladores",
  propostas: "Propostas",
  carteira: "Carteira",
  estoque_contempladas: "Contempladas",
  gestao_grupos: "Gestão de Grupos",
  clientes: "Clientes",
  agenda: "Agenda",
  planejamento: "Planejamento",
  relatorios: "Relatórios",
  comissoes: "Comissões",
  ranking: "Ranking",
  usuarios: "Usuários",
  parametros: "Parâmetros",
  links: "Links",
  procedimentos: "Procedimentos",
  processos: "Processos",
  fluxo_caixa: "Fluxo de Caixa",
  giro_carteira: "Giro de Carteira",
  financeiro: "Financeiro",
  administrativo: "Administrativo",
  lgpd: "LGPD",
  suporte: "Suporte",
};

type PartnerRequirements = {
  vendas_mes?: number;
  simulacoes_mes?: number;
  prospeccoes_mes?: number;
  qualificacoes_mes?: number;
  reunioes_treinamentos_mes?: number;
  compromisso_semanal_abordagens?: number;
};

type PartnerActuals = {
  vendasMes: number | null;
  simulacoesMes: number | null;
  prospeccoesMes: number | null;
  qualificacoesMes: number | null;
  reunioesTreinamentosMes: number | null;
  abordagensSemana: number | null;
};

type Summary = {
  accessProfileName: string | null;
  accessProfileDescription: string | null;
  permissions: Record<string, any> | null;
  partnerCategoryName: string | null;
  partnerCategoryDescription: string | null;
  partnerCategorySince: string | null;
  requirements: PartnerRequirements | null;
  actuals: PartnerActuals | null;
};

function roleLabel(role?: string | null) {
  if (role === "admin") return "Administrador";
  if (role === "gestor") return "Gestor";
  if (role === "vendedor") return "Vendedor";
  if (role === "viewer") return "Operações";
  return role || "Usuário";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 0, 0, 0, 0);
}

function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function progressPct(actual: number | null, goal?: number) {
  const target = Number(goal || 0);
  if (!target || actual === null) return 0;
  return Math.max(0, Math.min(100, (actual / target) * 100));
}

function countOrNull(result: { count?: number | null; error?: any }) {
  return result?.error ? null : Number(result?.count || 0);
}

async function countSimulationsForLeads(leadIds: string[], monthStart: Date, nextMonth: Date) {
  if (!leadIds.length) return 0;
  const chunks: string[][] = [];
  for (let i = 0; i < leadIds.length; i += 80) chunks.push(leadIds.slice(i, i + 80));

  const results = await Promise.all(
    chunks.map((ids) =>
      supabase
        .from("sim_simulations")
        .select("id", { count: "exact", head: true })
        .in("lead_id", ids)
        .gte("created_at", monthStart.toISOString())
        .lt("created_at", nextMonth.toISOString()),
    ),
  );

  if (results.some((result) => result.error)) return null;
  return results.reduce((total, result) => total + Number(result.count || 0), 0);
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-[#A11C27] transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function RequirementTile({
  label,
  actual,
  goal,
  helper,
}: {
  label: string;
  actual: number | null;
  goal?: number;
  helper: string;
}) {
  const target = Number(goal || 0);
  const percentage = progressPct(actual, target);
  const completed = target > 0 && actual !== null && actual >= target;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div>
        {completed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
      </div>
      <div className="mt-1 flex items-end gap-1.5">
        <span className="text-2xl font-black text-slate-900">{actual === null ? "—" : actual}</span>
        <span className="pb-0.5 text-xs font-semibold text-slate-400">/ {target || "—"}</span>
      </div>
      <div className="mt-2"><ProgressBar value={percentage} /></div>
      <div className="mt-1.5 text-[11px] leading-4 text-slate-500">{helper}</div>
    </div>
  );
}

export default function ProfileAccessSummary({
  userId,
  role,
  scopes,
}: {
  userId: string;
  role?: string | null;
  scopes?: string[] | null;
}) {
  const [summary, setSummary] = useState<Summary>({
    accessProfileName: null,
    accessProfileDescription: null,
    permissions: null,
    partnerCategoryName: null,
    partnerCategoryDescription: null,
    partnerCategorySince: null,
    requirements: null,
    actuals: null,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [assignmentRes, userRes] = await Promise.all([
          supabase
            .from("user_access_assignments")
            .select("access_profile_id,partner_category_id,partner_category_since")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase.from("users").select("auth_user_id").eq("id", userId).maybeSingle(),
        ]);

        if (assignmentRes.error) throw assignmentRes.error;
        if (userRes.error) throw userRes.error;

        const assignment = assignmentRes.data;
        const authUserId = userRes.data?.auth_user_id || null;

        const [profileRes, categoryRes] = await Promise.all([
          assignment?.access_profile_id
            ? supabase
                .from("access_profiles")
                .select("name,description,permissions")
                .eq("id", assignment.access_profile_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          assignment?.partner_category_id
            ? supabase
                .from("partner_categories")
                .select("name,description,requirements")
                .eq("id", assignment.partner_category_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        const category = (categoryRes as any)?.data || null;
        let actuals: PartnerActuals | null = null;

        if (category && authUserId) {
          const now = new Date();
          const monthStart = startOfMonth(now);
          const nextMonth = addMonths(monthStart, 1);
          const weekStart = startOfWeekMonday(now);
          const nextWeek = new Date(weekStart);
          nextWeek.setDate(nextWeek.getDate() + 7);

          const [salesRes, prospectionsRes, qualificationsRes, meetingsRes, weeklyApproachesRes, leadIdsRes] = await Promise.all([
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
              .gte("qualified_at", monthStart.toISOString())
              .lt("qualified_at", nextMonth.toISOString()),
            supabase
              .from("agenda_eventos")
              .select("id", { count: "exact", head: true })
              .eq("user_id", authUserId)
              .gte("inicio_at", monthStart.toISOString())
              .lt("inicio_at", nextMonth.toISOString())
              .or("tipo.eq.reuniao,titulo.ilike.%treinamento%,descricao.ilike.%treinamento%"),
            supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("owner_id", authUserId)
              .gte("created_at", weekStart.toISOString())
              .lt("created_at", nextWeek.toISOString()),
            supabase.from("leads").select("id").eq("owner_id", authUserId).limit(5000),
          ]);

          const leadIds = leadIdsRes.error ? [] : (leadIdsRes.data || []).map((row: any) => row.id).filter(Boolean);
          const simulations = leadIdsRes.error
            ? null
            : await countSimulationsForLeads(leadIds, monthStart, nextMonth);

          actuals = {
            vendasMes: countOrNull(salesRes),
            simulacoesMes: simulations,
            prospeccoesMes: countOrNull(prospectionsRes),
            qualificacoesMes: countOrNull(qualificationsRes),
            reunioesTreinamentosMes: countOrNull(meetingsRes),
            abordagensSemana: countOrNull(weeklyApproachesRes),
          };
        }

        if (!cancelled) {
          setSummary({
            accessProfileName: (profileRes as any)?.data?.name || null,
            accessProfileDescription: (profileRes as any)?.data?.description || null,
            permissions: ((profileRes as any)?.data?.permissions || null) as Record<string, any> | null,
            partnerCategoryName: category?.name || null,
            partnerCategoryDescription: category?.description || null,
            partnerCategorySince: assignment?.partner_category_since || null,
            requirements: (category?.requirements || null) as PartnerRequirements | null,
            actuals,
          });
        }
      } catch (e) {
        console.warn("[ProfileAccessSummary]", e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const allowedGuides = useMemo(() => {
    if (!summary.permissions) return [];
    if (summary.permissions?.["*"]?.view === true) return ACCESS_GUIDES.map((guide) => guide.label);
    return ACCESS_GUIDES.filter((guide) => summary.permissions?.[guide.key]?.view === true).map((guide) => guide.label);
  }, [summary.permissions]);

  const requirementMetrics = useMemo(() => {
    const req = summary.requirements;
    const act = summary.actuals;
    if (!req || !act) return [];
    return [
      { label: "Vendas no mês", actual: act.vendasMes, goal: req.vendas_mes },
      { label: "Simulações no mês", actual: act.simulacoesMes, goal: req.simulacoes_mes },
      { label: "Prospecções no mês", actual: act.prospeccoesMes, goal: req.prospeccoes_mes },
      { label: "Qualificações no mês", actual: act.qualificacoesMes, goal: req.qualificacoes_mes },
      { label: "Reuniões / treinamentos", actual: act.reunioesTreinamentosMes, goal: req.reunioes_treinamentos_mes },
      { label: "Abordagens na semana", actual: act.abordagensSemana, goal: req.compromisso_semanal_abordagens },
    ].filter((item) => Number(item.goal || 0) > 0);
  }, [summary.actuals, summary.requirements]);

  const completedGoals = requirementMetrics.filter(
    (item) => item.actual !== null && Number(item.actual) >= Number(item.goal || 0),
  ).length;
  const availableGoals = requirementMetrics.filter((item) => item.actual !== null).length;
  const averageProgress = availableGoals
    ? requirementMetrics
        .filter((item) => item.actual !== null)
        .reduce((sum, item) => sum + progressPct(item.actual, item.goal), 0) / availableGoals
    : 0;

  const currentPeriod = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date());
  const visibleGuideBadges = allowedGuides.slice(0, 6);
  const hiddenGuideCount = Math.max(0, allowedGuides.length - visibleGuideBadges.length);

  return (
    <>
      <Card className="bg-white/95 xl:col-span-4">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#A11C27]/10 text-[#A11C27]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            Perfil de Acesso
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-[minmax(120px,0.9fr)_minmax(0,1.2fr)] gap-3 text-sm">
            <span className="text-slate-500">Perfil de acesso</span>
            <span className="font-extrabold text-slate-900">
              {loaded ? summary.accessProfileName || "Acesso legado atual" : "Carregando…"}
            </span>
          </div>
          <div className="grid grid-cols-[minmax(120px,0.9fr)_minmax(0,1.2fr)] gap-3 text-sm">
            <span className="text-slate-500">Papel técnico</span>
            <span className="font-semibold text-slate-800">{roleLabel(role)}</span>
          </div>
          <div className="grid grid-cols-[minmax(120px,0.9fr)_minmax(0,1.2fr)] gap-3 text-sm">
            <span className="text-slate-500">Categoria</span>
            <span className="font-extrabold text-slate-900">
              {loaded ? summary.partnerCategoryName || "Não se aplica" : "Carregando…"}
            </span>
          </div>
          {summary.partnerCategoryName ? (
            <div className="grid grid-cols-[minmax(120px,0.9fr)_minmax(0,1.2fr)] gap-3 text-sm">
              <span className="text-slate-500">Na categoria desde</span>
              <span className="font-semibold text-slate-800">{formatDate(summary.partnerCategorySince)}</span>
            </div>
          ) : null}

          {summary.accessProfileDescription ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
              {summary.accessProfileDescription}
            </div>
          ) : null}

          {summary.accessProfileName ? (
            <div className="border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <UserCog className="h-3.5 w-3.5" /> Guias liberadas
                </div>
                <Badge variant="secondary" className="border border-slate-200 bg-slate-50 text-slate-700">
                  {allowedGuides.length}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {visibleGuideBadges.map((guide) => (
                  <Badge key={guide} variant="secondary" className="border border-slate-200 bg-slate-50 text-slate-700">
                    <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" /> {guide}
                  </Badge>
                ))}
                {hiddenGuideCount > 0 ? (
                  <Badge variant="secondary" className="border border-slate-200 bg-slate-50 text-slate-600">
                    +{hiddenGuideCount}
                  </Badge>
                ) : null}
              </div>
            </div>
          ) : !summary.accessProfileName && (scopes || []).length ? (
            <div className="border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <UserCog className="h-3.5 w-3.5" /> Escopos legados
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(scopes || []).map((scope) => (
                  <Badge key={scope} variant="secondary" className="border border-slate-200 bg-slate-50 text-slate-700">
                    <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" /> {scopeLabels[scope] || scope}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {summary.partnerCategoryName ? (
        <Card className="border-[#A11C27]/15 bg-white/95 xl:col-span-12">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base font-black text-slate-900">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#A11C27]/10 text-[#A11C27]">
                    <Trophy className="h-4.5 w-4.5" />
                  </span>
                  Programa de Parceiros
                  <Badge className="bg-[#A11C27] hover:bg-[#A11C27]">{summary.partnerCategoryName}</Badge>
                </CardTitle>
                <div className="mt-1.5 max-w-3xl text-sm text-slate-500">
                  {summary.partnerCategoryDescription || "Metas exigidas para a categoria atual."}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" /> Período: {currentPeriod}</span>
                  <span>Categoria desde {formatDate(summary.partnerCategorySince)}</span>
                </div>
              </div>

              {availableGoals > 0 ? (
                <div className="min-w-[220px] rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Aderência às metas</div>
                      <div className="mt-0.5 text-xl font-black text-slate-900">{averageProgress.toFixed(0)}%</div>
                    </div>
                    <div className="text-right text-xs font-semibold text-slate-500">
                      {completedGoals} de {availableGoals}<br />cumpridas
                    </div>
                  </div>
                  <div className="mt-2"><ProgressBar value={averageProgress} /></div>
                </div>
              ) : null}
            </div>
          </CardHeader>

          <CardContent>
            {summary.requirements && summary.actuals ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <RequirementTile
                  label="Vendas no mês"
                  actual={summary.actuals.vendasMes}
                  goal={summary.requirements.vendas_mes}
                  helper="vendas registradas no mês"
                />
                <RequirementTile
                  label="Simulações no mês"
                  actual={summary.actuals.simulacoesMes}
                  goal={summary.requirements.simulacoes_mes}
                  helper="simulações vinculadas aos leads do usuário"
                />
                <RequirementTile
                  label="Prospecções no mês"
                  actual={summary.actuals.prospeccoesMes}
                  goal={summary.requirements.prospeccoes_mes}
                  helper="leads registrados no mês"
                />
                <RequirementTile
                  label="Qualificações no mês"
                  actual={summary.actuals.qualificacoesMes}
                  goal={summary.requirements.qualificacoes_mes}
                  helper="oportunidades qualificadas no mês"
                />
                <RequirementTile
                  label="Reuniões / treinamentos"
                  actual={summary.actuals.reunioesTreinamentosMes}
                  goal={summary.requirements.reunioes_treinamentos_mes}
                  helper="eventos registrados na Agenda"
                />
                <RequirementTile
                  label="Abordagens na semana"
                  actual={summary.actuals.abordagensSemana}
                  goal={summary.requirements.compromisso_semanal_abordagens}
                  helper="leads/prospecções registrados nesta semana"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-500">
                <div className="flex items-center gap-2 font-bold text-slate-700"><Target className="h-4 w-4" /> Metas da categoria</div>
                <div className="mt-1">As metas ainda não estão disponíveis para este perfil.</div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
