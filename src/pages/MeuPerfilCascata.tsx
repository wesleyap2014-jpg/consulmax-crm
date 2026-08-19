import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import MeuPerfil from "./MeuPerfil";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  Mail,
  MapPin,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type UserProfile = {
  id: string;
  auth_user_id: string;
  nome: string;
  email: string;
  phone?: string | null;
  telefone?: string | null;
  avatar_url?: string | null;
  role?: string | null;
  scopes?: string[] | null;
  is_active?: boolean | null;
  unit_id?: string | null;
  hierarchy_level?: string | null;
  cidade?: string | null;
  uf?: string | null;
  created_at?: string | null;
};

type UnitRow = {
  id: string;
  nome: string;
  tipo: string;
  cidade?: string | null;
  uf?: string | null;
  manager_user_id?: string | null;
};

type VisibleUser = UserProfile & {
  unit_name?: string | null;
  unit_type?: string | null;
};

type HrEmployee = { id: string; cargo?: string | null; setor?: string | null };
type HrContract = { hire_date?: string | null; role_title?: string | null; department_name?: string | null };
type SaleRow = { data_venda: string; valor_venda?: number | null; administradora?: string | null; segmento?: string | null };
type OpportunityRow = {
  id: string;
  estagio?: string | null;
  stage?: string | null;
  score?: number | null;
  qualification_score?: number | null;
  segmento?: string | null;
  created_at: string;
  updated_at: string;
  qualified_at?: string | null;
  won_at?: string | null;
  lost_at?: string | null;
  next_follow_up_at?: string | null;
};
type GoalRow = { ano: number; [key: string]: number | string | null | undefined };
type AuditRow = { id: number | string; at: string; action?: string | null; table_name?: string | null };

type PrepostoData = {
  profile: UserProfile;
  unit: UnitRow | null;
  managerName: string | null;
  hrEmployee: HrEmployee | null;
  hrContract: HrContract | null;
  sales: SaleRow[];
  opportunities: OpportunityRow[];
  leadCountMonth: number;
  goals: GoalRow[];
  audit: AuditRow[];
  avatarUrl: string | null;
};

const BRAND = "#A11C27";

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

function roleLabel(role?: string | null) {
  if (role === "admin") return "Administrador";
  if (role === "gestor") return "Gestor";
  if (role === "vendedor") return "Vendedor";
  if (role === "viewer") return "Operações";
  return role || "Usuário";
}

function hierarchyLabel(level?: string | null, unitType?: string | null) {
  if (unitType === "matriz") return "Matriz / visão global";
  if (level === "gestor_filial") return "Gestor da filial";
  return "Usuário / vendedor";
}

function formatDateBR(value?: string | null, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(includeTime ? { timeStyle: "short" } : {}),
  }).format(date);
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function onlyDate(value?: string | null) {
  return value ? value.slice(0, 10) : null;
}

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isWon(o: OpportunityRow) {
  const s = normalize(o.estagio || o.stage);
  return s.includes("ganho") || s === "fechado_ganho";
}
function isLost(o: OpportunityRow) {
  const s = normalize(o.estagio || o.stage);
  return s.includes("perdido") || s === "fechado_perdido";
}
function isOpen(o: OpportunityRow) {
  return !isWon(o) && !isLost(o);
}
function isProposal(o: OpportunityRow) {
  const s = normalize(o.estagio || o.stage);
  return s.includes("proposta") || s.includes("negociacao");
}
function pct(value: number, goal: number) {
  if (!goal) return 0;
  return Math.max(0, Math.min(100, (value / goal) * 100));
}

async function resolveAvatar(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl || null;
}

function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#A11C27]/10 text-[#A11C27]">
        <Icon className="h-4 w-4" />
      </span>
      {children}
    </CardTitle>
  );
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(110px,0.9fr)_minmax(0,1.2fr)] gap-3 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 break-words font-semibold text-slate-800">{value || "—"}</span>
    </div>
  );
}

function Kpi({ label, value, helper }: { label: string; value: React.ReactNode; helper?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-slate-900">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-[#A11C27] transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function CascadeToolbar({
  currentProfile,
  visibleUsers,
  selectedId,
  onSelect,
  loading,
}: {
  currentProfile: UserProfile;
  visibleUsers: VisibleUser[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  if (currentProfile.role !== "admin" || visibleUsers.length <= 1) return null;

  const selected = visibleUsers.find((u) => u.id === selectedId) || currentProfile;
  return (
    <Card className="mb-4 border-[#A11C27]/15 bg-white/95 shadow-sm">
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#A11C27]/10 text-[#A11C27]">
            <UsersRound className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Perfis da minha cascata</div>
            <div className="text-xs text-slate-500">Visualize seus prepostos conforme unidade e nível hierárquico.</div>
          </div>
        </div>

        <div className="relative min-w-0 md:w-[360px]">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Visualizando perfil</label>
          <div className="relative">
            <select
              value={selectedId}
              onChange={(e) => onSelect(e.target.value)}
              disabled={loading}
              className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#A11C27]/50 focus:ring-2 focus:ring-[#A11C27]/10 disabled:opacity-60"
            >
              {visibleUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === currentProfile.id ? "Meu perfil" : u.nome} — {u.unit_name || "Sem unidade"}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
          <div className="mt-1 truncate text-[11px] text-slate-500">
            {selected.id === currentProfile.id ? "Você está vendo o seu próprio perfil." : `Perfil de ${selected.nome}.`}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PerfilPreposto({ profileId }: { profileId: string }) {
  const [data, setData] = useState<PrepostoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id,auth_user_id,nome,email,phone,telefone,avatar_url,role,scopes,is_active,unit_id,hierarchy_level,cidade,uf,created_at")
        .eq("id", profileId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error("Perfil não encontrado.");

      const target = profile as UserProfile;
      const now = new Date();
      const monthStart = startOfMonth(now);
      const nextMonth = addMonths(monthStart, 1);
      const chartStart = addMonths(monthStart, -11);
      const goalYears = Array.from(new Set([chartStart.getFullYear(), now.getFullYear()]));

      const [unitRes, hrRes, salesRes, oppRes, leadsRes, goalsRes, auditRes, avatarUrl] = await Promise.all([
        target.unit_id
          ? supabase.from("units").select("id,nome,tipo,cidade,uf,manager_user_id").eq("id", target.unit_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from("hr_employees").select("id,cargo,setor").or(`auth_user_id.eq.${target.auth_user_id},user_id.eq.${target.id}`).maybeSingle(),
        supabase
          .from("vendas")
          .select("data_venda,valor_venda,administradora,segmento")
          .eq("vendedor_id", target.auth_user_id)
          .gte("data_venda", ymd(chartStart))
          .lt("data_venda", ymd(nextMonth))
          .order("data_venda", { ascending: true }),
        supabase
          .from("opportunities")
          .select("id,estagio,stage,score,qualification_score,segmento,created_at,updated_at,qualified_at,won_at,lost_at,next_follow_up_at")
          .eq("vendedor_id", target.auth_user_id)
          .limit(5000),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", target.auth_user_id)
          .gte("created_at", monthStart.toISOString())
          .lt("created_at", nextMonth.toISOString()),
        supabase
          .from("metas_vendedores")
          .select("ano,m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
          .eq("vendedor_id", target.id)
          .in("ano", goalYears),
        supabase
          .from("audit_log")
          .select("id,at,action,table_name")
          .or(`actor.eq.${target.auth_user_id},actor_id.eq.${target.auth_user_id}`)
          .order("at", { ascending: false })
          .limit(10),
        resolveAvatar(target.avatar_url),
      ]);

      const unit = (unitRes as any)?.data || null;
      const hrEmployee = (hrRes as any)?.error ? null : ((hrRes as any)?.data || null);
      let hrContract: HrContract | null = null;
      if (hrEmployee?.id) {
        const contractRes = await supabase
          .from("hr_employee_contracts")
          .select("hire_date,role_title,department_name")
          .eq("employee_id", hrEmployee.id)
          .maybeSingle();
        if (!contractRes.error) hrContract = contractRes.data || null;
      }

      let managerName: string | null = null;
      if (unit?.manager_user_id && unit.manager_user_id !== target.id) {
        const managerRes = await supabase.from("users").select("nome").eq("id", unit.manager_user_id).maybeSingle();
        if (!managerRes.error) managerName = managerRes.data?.nome || null;
      }

      setData({
        profile: target,
        unit,
        managerName,
        hrEmployee,
        hrContract,
        sales: salesRes.error ? [] : ((salesRes.data || []) as SaleRow[]),
        opportunities: oppRes.error ? [] : ((oppRes.data || []) as OpportunityRow[]),
        leadCountMonth: leadsRes.error ? 0 : leadsRes.count || 0,
        goals: goalsRes.error ? [] : ((goalsRes.data || []) as GoalRow[]),
        audit: auditRes.error ? [] : ((auditRes.data || []) as AuditRow[]),
        avatarUrl,
      });
    } catch (e: any) {
      console.error("[PerfilPreposto]", e);
      setError(e?.message || "Falha ao carregar o perfil do preposto.");
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const monthStart = startOfMonth(now);
    const nextMonth = addMonths(monthStart, 1);
    const monthStartYMD = ymd(monthStart);
    const nextMonthYMD = ymd(nextMonth);
    const salesMonth = data.sales.filter((s) => s.data_venda >= monthStartYMD && s.data_venda < nextMonthYMD);
    const salesMonthTotal = salesMonth.reduce((sum, s) => sum + Number(s.valor_venda || 0), 0);
    const ticket = salesMonth.length ? salesMonthTotal / salesMonth.length : 0;
    const wonMonth = data.opportunities.filter((o) => {
      const d = onlyDate(o.won_at);
      return Boolean(d && d >= monthStartYMD && d < nextMonthYMD);
    }).length;
    const lostMonth = data.opportunities.filter((o) => {
      const d = onlyDate(o.lost_at);
      return Boolean(d && d >= monthStartYMD && d < nextMonthYMD);
    }).length;
    const conversion = wonMonth + lostMonth ? (wonMonth / (wonMonth + lostMonth)) * 100 : 0;
    const open = data.opportunities.filter(isOpen);
    const overdue = open.filter((o) => o.next_follow_up_at && new Date(o.next_follow_up_at).getTime() <= now.getTime());
    const highPotential = overdue.filter((o) => Number(o.score || 0) >= 70 || Number(o.qualification_score || 0) >= 18);
    const createdMonth = data.opportunities.filter((o) => {
      const d = onlyDate(o.created_at);
      return Boolean(d && d >= monthStartYMD && d < nextMonthYMD);
    }).length;
    const qualifiedMonth = data.opportunities.filter((o) => {
      const d = onlyDate(o.qualified_at);
      return Boolean(d && d >= monthStartYMD && d < nextMonthYMD);
    }).length;
    const proposalMonth = data.opportunities.filter((o) => {
      const d = onlyDate(o.updated_at);
      return isProposal(o) && Boolean(d && d >= monthStartYMD && d < nextMonthYMD);
    }).length;
    const staleProposals = open.filter((o) => isProposal(o) && Date.now() - new Date(o.updated_at).getTime() > 7 * 86400000).length;
    const currentGoalRow = data.goals.find((g) => Number(g.ano) === now.getFullYear());
    const goalKey = `m${String(now.getMonth() + 1).padStart(2, "0")}`;
    const salesGoal = Number(currentGoalRow?.[goalKey] || 0);
    const chart = Array.from({ length: 12 }, (_, idx) => {
      const date = addMonths(startOfMonth(now), idx - 11);
      const start = ymd(date);
      const end = ymd(addMonths(date, 1));
      const sales = data.sales.filter((s) => s.data_venda >= start && s.data_venda < end).reduce((sum, s) => sum + Number(s.valor_venda || 0), 0);
      const goalRow = data.goals.find((g) => Number(g.ano) === date.getFullYear());
      const key = `m${String(date.getMonth() + 1).padStart(2, "0")}`;
      return {
        mes: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""),
        vendas: sales,
        meta: Number(goalRow?.[key] || 0),
      };
    });
    return {
      salesMonthTotal,
      salesMonthCount: salesMonth.length,
      ticket,
      conversion,
      openCount: open.length,
      overdueFollowups: overdue.length,
      highPotentialFollowups: highPotential.length,
      createdMonth,
      qualifiedMonth,
      proposalMonth,
      staleProposals,
      salesGoal,
      chart,
      qualificationRate: createdMonth ? (qualifiedMonth / createdMonth) * 100 : 0,
    };
  }, [data]);

  const administradoras = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.sales.map((s) => s.administradora?.trim()).filter(Boolean) as string[])).sort();
  }, [data]);
  const segmentos = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set([...data.sales.map((s) => s.segmento?.trim()), ...data.opportunities.map((o) => o.segmento?.trim())].filter(Boolean) as string[])).sort();
  }, [data]);

  if (loading) {
    return (
      <div className="grid min-h-[45vh] place-items-center">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><RefreshCcw className="h-4 w-4 animate-spin" /> Carregando perfil do preposto…</div>
      </div>
    );
  }
  if (error || !data || !metrics) {
    return (
      <Card className="mx-auto mt-8 max-w-xl border-red-200 bg-white/90">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-red-600" />
          <div className="font-bold text-slate-900">Não foi possível carregar este perfil</div>
          <div className="text-sm text-slate-500">{error || "Dados indisponíveis."}</div>
          <Button onClick={load}>Tentar novamente</Button>
        </CardContent>
      </Card>
    );
  }

  const { profile, unit, hrEmployee, hrContract } = data;
  const cargo = hrContract?.role_title || hrEmployee?.cargo || roleLabel(profile.role);
  const setor = hrContract?.department_name || hrEmployee?.setor || "—";
  const phone = profile.phone || profile.telefone || "—";
  const cityUf = [profile.cidade || unit?.cidade, profile.uf || unit?.uf].filter(Boolean).join("/") || "—";

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 pb-10">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-sm">
        <div className="h-24 bg-[linear-gradient(110deg,#1E293F_0%,#1E293F_48%,#A11C27_100%)]" />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:px-7">
          <div className="-mt-12 h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-slate-100 shadow-lg">
            {data.avatarUrl ? <img src={data.avatarUrl} alt={profile.nome} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-slate-400"><UserRound className="h-11 w-11" /></div>}
          </div>
          <div className="min-w-0 flex-1 sm:pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-black text-slate-950">{profile.nome}</h1>
              <Badge className="bg-[#A11C27] hover:bg-[#A11C27]">{roleLabel(profile.role)}</Badge>
              <Badge variant="secondary" className="border border-slate-200 bg-slate-50 text-slate-700"><Eye className="mr-1 h-3 w-3" /> Visualização administrativa</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1"><Building2 className="h-4 w-4" /> {unit?.nome || "Unidade não informada"}</span>
              <span className="inline-flex items-center gap-1"><BriefcaseBusiness className="h-4 w-4" /> {cargo}</span>
            </div>
          </div>
          <Button variant="outline" onClick={load} className="self-start sm:self-auto"><RefreshCcw className="mr-2 h-4 w-4" /> Atualizar</Button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="bg-white/95 xl:col-span-4">
          <CardHeader className="pb-2"><SectionTitle icon={UserRound}>Dados Pessoais</SectionTitle></CardHeader>
          <CardContent className="divide-y divide-slate-100">
            <Field label="Nome" value={profile.nome} />
            <Field label="Telefone" value={<span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-slate-400" />{phone}</span>} />
            <Field label="E-mail" value={<span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-slate-400" />{profile.email}</span>} />
            <Field label="Cidade/UF" value={<span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" />{cityUf}</span>} />
            <Field label="No CRM desde" value={formatDateBR(profile.created_at)} />
          </CardContent>
        </Card>

        <Card className="bg-white/95 xl:col-span-4">
          <CardHeader className="pb-2"><SectionTitle icon={BriefcaseBusiness}>Dados Profissionais</SectionTitle></CardHeader>
          <CardContent className="divide-y divide-slate-100">
            <Field label="Cargo" value={cargo} />
            <Field label="Setor" value={setor} />
            <Field label="Unidade" value={unit?.nome} />
            <Field label="Hierarquia" value={hierarchyLabel(profile.hierarchy_level, unit?.tipo)} />
            <Field label="Gestor" value={data.managerName || (unit?.manager_user_id === profile.id ? "Próprio gestor da unidade" : undefined)} />
            <Field label="Admissão" value={formatDateBR(hrContract?.hire_date)} />
          </CardContent>
        </Card>

        <Card className="bg-white/95 xl:col-span-4">
          <CardHeader className="pb-2"><SectionTitle icon={ShieldCheck}>Perfil de Acesso e Permissões</SectionTitle></CardHeader>
          <CardContent>
            <Field label="Perfil" value={roleLabel(profile.role)} />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(profile.scopes || []).length ? (profile.scopes || []).map((scope) => <Badge key={scope} variant="secondary" className="border border-slate-200 bg-slate-50 text-slate-700"><CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" /> {scopeLabels[scope] || scope}</Badge>) : <span className="text-sm text-slate-500">Nenhum escopo específico registrado.</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="bg-white/95 xl:col-span-4">
          <CardHeader className="pb-2"><SectionTitle icon={Target}>Metas Comerciais</SectionTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-500">Meta mensal de vendas</div>
                  <div className="text-lg font-black text-slate-900">{formatBRL(metrics.salesMonthTotal)}</div>
                  <div className="text-xs text-slate-500">de {formatBRL(metrics.salesGoal)}</div>
                </div>
                <div className="text-lg font-black text-[#A11C27]">{metrics.salesGoal ? `${pct(metrics.salesMonthTotal, metrics.salesGoal).toFixed(0)}%` : "—"}</div>
              </div>
              <div className="mt-2"><Progress value={pct(metrics.salesMonthTotal, metrics.salesGoal)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Kpi label="Prospecções" value={data.leadCountMonth} helper="leads no mês" />
              <Kpi label="Qualificações" value={metrics.qualifiedMonth} helper="concluídas" />
              <Kpi label="Propostas" value={metrics.proposalMonth} helper="em proposta/negociação" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/95 xl:col-span-8">
          <CardHeader className="pb-2"><SectionTitle icon={BarChart3}>Desempenho</SectionTitle></CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Kpi label="Vendas no mês" value={formatBRL(metrics.salesMonthTotal)} helper={`${metrics.salesMonthCount} venda(s)`} />
              <Kpi label="Conversão" value={`${metrics.conversion.toFixed(1)}%`} helper="ganhos x encerrados" />
              <Kpi label="Ticket médio" value={formatBRL(metrics.ticket)} />
              <Kpi label="Oportunidades" value={metrics.openCount} helper="abertas" />
              <Kpi label="Follow-ups" value={metrics.overdueFollowups} helper="pendentes" />
            </div>
            <div className="mt-5 h-[260px] rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-extrabold text-slate-700">Evolução mensal</span><span className="text-[11px] text-slate-500">Últimos 12 meses</span></div>
              <ResponsiveContainer width="100%" height="90%">
                <ComposedChart data={metrics.chart} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(value: number) => formatBRL(Number(value))} />
                  <Bar dataKey="vendas" fill={BRAND} radius={[5, 5, 0, 0]} maxBarSize={28} />
                  <Line dataKey="meta" type="monotone" stroke="#1E293F" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="bg-white/95 xl:col-span-4">
          <CardHeader className="pb-2"><SectionTitle icon={Building2}>Administradoras e Segmentos</SectionTitle></CardHeader>
          <CardContent>
            <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Administradoras com vendas no período</div>
            <div className="mt-2 flex flex-wrap gap-2">{administradoras.length ? administradoras.map((item) => <Badge key={item} className="bg-slate-900 hover:bg-slate-900">{item}</Badge>) : <span className="text-sm text-slate-500">Nenhuma administradora identificada nos últimos 12 meses.</span>}</div>
            <div className="my-5 h-px bg-slate-200" />
            <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Segmentos de atuação</div>
            <div className="mt-2 flex flex-wrap gap-2">{segmentos.length ? segmentos.map((item) => <Badge key={item} variant="secondary" className="border border-[#A11C27]/20 bg-[#A11C27]/5 text-[#7d1620]">{item}</Badge>) : <span className="text-sm text-slate-500">Nenhum segmento identificado.</span>}</div>
          </CardContent>
        </Card>

        <Card className="bg-white/95 xl:col-span-4">
          <CardHeader className="pb-2"><SectionTitle icon={Activity}>Atividade do Usuário</SectionTitle></CardHeader>
          <CardContent>
            <div className="max-h-[320px] space-y-0 overflow-auto pr-1">
              {data.audit.length ? data.audit.map((item, index) => (
                <div key={item.id} className="relative flex gap-3 pb-4">
                  {index < data.audit.length - 1 ? <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" /> : null}
                  <span className="relative mt-1 h-4 w-4 shrink-0 rounded-full border-4 border-white bg-[#A11C27] shadow" />
                  <div className="min-w-0"><div className="text-sm font-bold text-slate-800">{item.action || "Atividade registrada"}</div><div className="text-xs text-slate-500">{item.table_name ? `Em ${item.table_name}` : "CRM"} • {formatDateBR(item.at, true)}</div></div>
                </div>
              )) : <div className="py-8 text-center text-sm text-slate-500">Nenhuma atividade disponível para exibição.</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/95 xl:col-span-4">
          <CardHeader className="pb-2"><SectionTitle icon={ShieldCheck}>Acesso e Segurança</SectionTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><ShieldCheck className="h-4 w-4" /> Conta</div>
              <div className="mt-1 text-xs text-slate-500">{profile.is_active === false ? "Acesso desativado" : "Acesso ativo"}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Clock3 className="h-4 w-4" /> Última atividade registrada</div>
              <div className="mt-1 text-xs text-slate-500">{formatDateBR(data.audit[0]?.at, true)}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
              Por segurança, alteração de senha e dados de autenticação permanecem disponíveis somente no próprio perfil do usuário.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-[#A11C27]/20 bg-white/95">
        <CardHeader className="pb-2"><SectionTitle icon={Sparkles}>IA / Max</SectionTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"><div className="flex gap-2"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><div><div className="text-sm font-extrabold text-slate-900">Follow-ups de alto potencial</div><div className="mt-1 text-xs text-slate-600">{metrics.highPotentialFollowups} pendente(s) com score alto.</div></div></div></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><div><div className="text-sm font-extrabold text-slate-900">Qualificação comercial</div><div className="mt-1 text-xs text-slate-600">{metrics.qualificationRate.toFixed(0)}% das oportunidades criadas no mês foram qualificadas.</div></div></div></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3"><div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><div className="text-sm font-extrabold text-slate-900">Propostas aguardando avanço</div><div className="mt-1 text-xs text-slate-600">{metrics.staleProposals} sem atualização há mais de 7 dias.</div></div></div></div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MeuPerfilCascata() {
  const navigate = useNavigate();
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);
  const [visibleUsers, setVisibleUsers] = useState<VisibleUser[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadingCascade, setLoadingCascade] = useState(true);
  const [cascadeError, setCascadeError] = useState<string | null>(null);

  const loadCascade = useCallback(async () => {
    setLoadingCascade(true);
    setCascadeError(null);
    try {
      const { data: authRes, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const authUser = authRes.user;
      if (!authUser) {
        navigate("/login", { replace: true });
        return;
      }

      const { data: me, error: meError } = await supabase
        .from("users")
        .select("id,auth_user_id,nome,email,phone,telefone,avatar_url,role,scopes,is_active,unit_id,hierarchy_level,cidade,uf,created_at")
        .eq("auth_user_id", authUser.id)
        .maybeSingle();
      if (meError) throw meError;
      if (!me) throw new Error("Perfil do usuário não encontrado.");
      const current = me as UserProfile;
      setCurrentProfile(current);

      if (current.role !== "admin") {
        const selfOnly: VisibleUser[] = [{ ...current }];
        setVisibleUsers(selfOnly);
        setSelectedId(current.id);
        return;
      }

      const { data: currentUnit, error: unitError } = current.unit_id
        ? await supabase.from("units").select("id,nome,tipo,cidade,uf,manager_user_id").eq("id", current.unit_id).maybeSingle()
        : { data: null, error: null as any };
      if (unitError) throw unitError;

      let usersQuery = supabase
        .from("users")
        .select("id,auth_user_id,nome,email,phone,telefone,avatar_url,role,scopes,is_active,unit_id,hierarchy_level,cidade,uf,created_at")
        .eq("is_active", true)
        .order("nome", { ascending: true });

      if (currentUnit?.tipo === "matriz") {
        // Matriz: visão global de todas as unidades.
      } else if (current.hierarchy_level === "gestor_filial" && current.unit_id) {
        usersQuery = usersQuery.eq("unit_id", current.unit_id);
      } else {
        const selfOnly: VisibleUser[] = [{ ...current, unit_name: currentUnit?.nome || null, unit_type: currentUnit?.tipo || null }];
        setVisibleUsers(selfOnly);
        setSelectedId(current.id);
        return;
      }

      const { data: allowedRows, error: usersError } = await usersQuery;
      if (usersError) throw usersError;
      const allowed = ((allowedRows || []) as UserProfile[]).filter((u) => Boolean(u.auth_user_id));
      const unitIds = Array.from(new Set(allowed.map((u) => u.unit_id).filter(Boolean) as string[]));
      const unitMap = new Map<string, UnitRow>();
      if (unitIds.length) {
        const { data: unitsRows } = await supabase.from("units").select("id,nome,tipo,cidade,uf,manager_user_id").in("id", unitIds);
        (unitsRows || []).forEach((u: any) => unitMap.set(u.id, u as UnitRow));
      }

      let finalRows: VisibleUser[] = allowed.map((u) => ({
        ...u,
        unit_name: u.unit_id ? unitMap.get(u.unit_id)?.nome || null : null,
        unit_type: u.unit_id ? unitMap.get(u.unit_id)?.tipo || null : null,
      }));

      if (!finalRows.some((u) => u.id === current.id)) {
        finalRows = [{ ...current, unit_name: currentUnit?.nome || null, unit_type: currentUnit?.tipo || null }, ...finalRows];
      }

      finalRows.sort((a, b) => {
        if (a.id === current.id) return -1;
        if (b.id === current.id) return 1;
        const unitCmp = String(a.unit_name || "").localeCompare(String(b.unit_name || ""), "pt-BR", { sensitivity: "base" });
        if (unitCmp) return unitCmp;
        return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", { sensitivity: "base" });
      });

      setVisibleUsers(finalRows);
      setSelectedId((previous) => (previous && finalRows.some((u) => u.id === previous) ? previous : current.id));
    } catch (e: any) {
      console.error("[MeuPerfilCascata]", e);
      setCascadeError(e?.message || "Não foi possível carregar a hierarquia de perfis.");
    } finally {
      setLoadingCascade(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadCascade();
  }, [loadCascade]);

  if (loadingCascade && !currentProfile) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><RefreshCcw className="h-4 w-4 animate-spin" /> Carregando hierarquia…</div>
      </div>
    );
  }

  if (cascadeError || !currentProfile) {
    return (
      <Card className="mx-auto mt-12 max-w-xl border-red-200 bg-white/90">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-red-600" />
          <div className="font-bold text-slate-900">Não foi possível carregar a cascata de perfis</div>
          <div className="text-sm text-slate-500">{cascadeError || "Dados indisponíveis."}</div>
          <Button onClick={loadCascade}>Tentar novamente</Button>
        </CardContent>
      </Card>
    );
  }

  const effectiveSelectedId = selectedId || currentProfile.id;
  const isOwnProfile = effectiveSelectedId === currentProfile.id;

  return (
    <div>
      <CascadeToolbar
        currentProfile={currentProfile}
        visibleUsers={visibleUsers}
        selectedId={effectiveSelectedId}
        onSelect={setSelectedId}
        loading={loadingCascade}
      />
      {isOwnProfile ? <MeuPerfil /> : <PerfilPreposto key={effectiveSelectedId} profileId={effectiveSelectedId} />}
    </div>
  );
}
