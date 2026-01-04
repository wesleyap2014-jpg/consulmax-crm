// src/pages/Inicio.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  RefreshCcw,
  AlertTriangle,
  Calendar,
  Briefcase,
  Wallet,
  Target,
  Rocket,
  MessageCircle,
  ArrowRight,
} from "lucide-react";

/** ===================== Tipos ===================== */
type UserRow = {
  id: string;
  auth_user_id: string;
  nome: string;
  role: string; // enum user_role
  user_role?: string | null; // legado
  is_active?: boolean | null;
};

type AgendaRow = {
  id: string;
  tipo: string;
  titulo: string;
  inicio_at: string;
  fim_at: string;
  user_id: string | null;
  cliente_nome?: string | null;
  lead_nome?: string | null;
  telefone?: string | null;
  videocall_url?: string | null;
};

type OppRow = {
  id: string;
  valor_credito: number | null;
  stage: string;
  expected_close_at: string | null;
  vendedor_id: string;
  lead_id: string;
};

type LeadRow = {
  id: string;
  nome: string;
  telefone?: string | null;
};

type StockReqRow = {
  id: string;
  cota_id: string;
  vendor_id: string;
  vendor_pct: number;
  status: string;
  created_at: string;
};

type VendaSemComissaoRow = {
  id: string;
  data_venda: string | null;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  segmento: string | null;
  tabela: string | null;
  administradora: string | null;
  numero_proposta: string | null;
  credito: number | null;
};

type CommissionRow = {
  id: string;
  vendedor_id: string;
  valor_total: number | null;
  status: string | null; // commission_status
};

type GiroDueRow = { owner_auth_id: string; due_count: number };

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtDateBRFromYMD(ymd: string) {
  // "2026-01-04" -> "04/01/2026"
  const [y, m, d] = (ymd || "").split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}
function startOfDayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}
function endOfDayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}
function monthRangeYMD(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 1);
  const f = (dt: Date) => {
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };
  return { startYMD: f(start), endYMD: f(end), year: y, month: m + 1 };
}
function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDT(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function isAdmin(u?: UserRow | null) {
  const r = (u?.role || u?.user_role || "").toLowerCase();
  return r === "admin";
}

// Donut simples via SVG (sem depender de Recharts)
function Donut({
  pct,
  size = 132,
  stroke = 12,
  centerTop,
  centerBottom,
}: {
  pct: number; // 0..100
  size?: number;
  stroke?: number;
  centerTop: React.ReactNode;
  centerBottom?: React.ReactNode;
}) {
  const clamped = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(148,163,184,0.35)" // slate-400-ish
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(15,23,42,0.9)" // slate-900-ish
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-xl font-semibold text-slate-900">{centerTop}</div>
        {centerBottom ? <div className="text-xs text-slate-600 -mt-0.5">{centerBottom}</div> : null}
      </div>
    </div>
  );
}

/** ===================== Página ===================== */
export default function Inicio() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [me, setMe] = useState<UserRow | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const rangeToday = useMemo(() => {
    const now = new Date();
    const ymd = todayYMD();
    return {
      ymd,
      br: fmtDateBRFromYMD(ymd),
      startISO: startOfDayISO(now),
      endISO: endOfDayISO(now),
    };
  }, []);
  const rangeMonth = useMemo(() => monthRangeYMD(new Date()), []);

  // ======= Dados da Home =======
  const [kpi, setKpi] = useState({
    overdueOppCount: 0,
    overdueOppTotal: 0,

    todayEventsCount: 0,
    todayGroupsCount: 0,

    monthSalesTotal: 0,
    monthSalesMeta: 0,
    monthSalesPct: 0, // % da meta realizada (0..100)

    carteiraAtivaTotal: 0,

    openStockReqCount: 0,
    vendasSemComissaoCount: 0,

    commissionsPendingCount: 0,
    commissionsPendingTotal: 0,

    giroDueCount: 0,
  });

  const [todayEvents, setTodayEvents] = useState<AgendaRow[]>([]);
  const [overdueOpps, setOverdueOpps] = useState<(OppRow & { lead_nome?: string; lead_tel?: string | null })[]>([]);
  const [stockReqs, setStockReqs] = useState<StockReqRow[]>([]);
  const [vendasSemComissao, setVendasSemComissao] = useState<VendaSemComissaoRow[]>([]);

  async function loadMeAndUsers() {
    const { data: auth } = await supabase.auth.getUser();
    const authId = auth.user?.id;
    if (!authId) throw new Error("Sem usuário autenticado.");

    const { data: meRow, error: meErr } = await supabase
      .from("users")
      .select("id,auth_user_id,nome,role,user_role,is_active")
      .eq("auth_user_id", authId)
      .maybeSingle();
    if (meErr) throw meErr;

    const { data: usersRows, error: usersErr } = await supabase
      .from("users")
      .select("id,auth_user_id,nome,role,user_role,is_active")
      .eq("is_active", true)
      .order("nome", { ascending: true });
    if (usersErr) throw usersErr;

    setMe(meRow || null);
    setUsers(usersRows || []);
  }

  function isClosedStage(stage?: string | null) {
    const st = (stage || "").trim();
    const low = st.toLowerCase();
    // cobre padrões antigos e atuais
    return (
      low === "fechado_ganho" ||
      low === "fechado_perdido" ||
      low === "fechado (ganho)" ||
      low === "fechado (perdido)" ||
      low.startsWith("fechado_") ||
      low.startsWith("fechado ")
    );
  }

  async function loadDashboard(scopeUserId: string, scopeAuthId: string, admin: boolean) {
    const today = rangeToday.ymd;
    const { startYMD, endYMD, year, month } = rangeMonth;

    // ===== Oportunidades atrasadas (NÃO trazer fechado_ganho/fechado_perdido) =====
    let oppQ = supabase
      .from("opportunities")
      .select("id,valor_credito,stage,expected_close_at,vendedor_id,lead_id")
      .lt("expected_close_at", today)
      // mantém filtro no banco para os valores conhecidos
      .not("stage", "in", '("fechado_ganho","fechado_perdido","Fechado (Ganho)","Fechado (Perdido)")')
      .order("expected_close_at", { ascending: true })
      .limit(12);

    // RBAC: admin vê tudo; vendedor vê só o próprio
    if (!admin) oppQ = oppQ.eq("vendedor_id", scopeUserId);

    const { data: oppRowsRaw, error: oppErr } = await oppQ;
    if (oppErr) throw oppErr;

    // fallback: garante que não entra nada "fechado_*" mesmo se o stage vier diferente
    const oppRows = (oppRowsRaw || []).filter((o: any) => !isClosedStage(o?.stage));

    const overdueOppCount = oppRows.length;
    const overdueOppTotal = oppRows.reduce((acc: number, r: any) => acc + (Number(r.valor_credito || 0) || 0), 0);

    // Enriquecer com lead (nome/telefone)
    const leadIds = Array.from(new Set(oppRows.map((o: any) => o.lead_id).filter(Boolean)));
    let leadsMap = new Map<string, LeadRow>();
    if (leadIds.length) {
      const { data: lds, error: lErr } = await supabase.from("leads").select("id,nome,telefone").in("id", leadIds);
      if (lErr) throw lErr;
      leadsMap = new Map((lds || []).map((l) => [l.id, l]));
    }
    const overdueOppsEnriched = oppRows.map((o: any) => {
      const ld = leadsMap.get(o.lead_id);
      return { ...o, lead_nome: ld?.nome, lead_tel: ld?.telefone || null };
    });

    // ===== Agenda de hoje (view enriquecida) =====
    let agQ = supabase
      .from("v_agenda_eventos_enriquecida")
      .select("id,tipo,titulo,inicio_at,fim_at,user_id,cliente_nome,lead_nome,telefone,videocall_url")
      .gte("inicio_at", rangeToday.startISO)
      .lte("inicio_at", rangeToday.endISO)
      .order("inicio_at", { ascending: true })
      .limit(10);

    if (!admin) agQ = agQ.eq("user_id", scopeUserId);

    const { data: agRows, error: agErr } = await agQ;
    if (agErr) throw agErr;
    const todayEventsCount = (agRows || []).length;

    // ===== Eventos de grupos hoje =====
    const orExpr = `prox_vencimento.eq.${today},prox_sorteio.eq.${today},prox_assembleia.eq.${today}`;
    const { data: gRows, error: gErr } = await supabase.from("groups").select("id").or(orExpr).limit(200);
    if (gErr) throw gErr;
    const todayGroupsCount = (gRows || []).length;

    // ===== Vendas do mês =====
    let salesQ = supabase
      .from("vendas")
      .select("valor_venda,vendedor_id,data_venda")
      .gte("data_venda", startYMD)
      .lt("data_venda", endYMD);

    if (!admin) salesQ = salesQ.eq("vendedor_id", scopeUserId);

    const { data: salesRows, error: salesErr } = await salesQ;
    if (salesErr) throw salesErr;
    const monthSalesTotal = (salesRows || []).reduce((acc, r) => acc + (Number((r as any).valor_venda || 0) || 0), 0);

    // ===== Meta do mês (para donut: Meta x Venda) =====
    // Observação: baseado no que você já usa na Carteira (metas_vendedores).
    // Esperado: metas_vendedores(vendedor_id, ano, meta_mensal, meta_anual)
    let monthSalesMeta = 0;
    try {
      let metaQ = supabase
        .from("metas_vendedores")
        .select("vendedor_id,ano,meta_mensal,meta_anual")
        .eq("ano", year);

      if (!admin) metaQ = metaQ.eq("vendedor_id", scopeUserId);

      const { data: metaRows, error: metaErr } = await metaQ;
      if (metaErr) throw metaErr;

      const rows = (metaRows || []) as any[];
      // se houver mais de uma linha por vendedor/ano, somamos (admin pode ter vários vendedores)
      monthSalesMeta = rows.reduce((acc, r) => {
        const mm = Number(r?.meta_mensal || 0) || 0;
        const ma = Number(r?.meta_anual || 0) || 0;
        const fallback = ma > 0 ? ma / 12 : 0;
        return acc + (mm > 0 ? mm : fallback);
      }, 0);
    } catch {
      // se a tabela/colunas ainda não estiverem prontas, meta fica 0 (não quebra o painel)
      monthSalesMeta = 0;
    }

    const monthSalesPct =
      monthSalesMeta > 0 ? Math.min(100, Math.max(0, (monthSalesTotal / monthSalesMeta) * 100)) : 0;

    // ===== Carteira ativa (codigo='00') =====
    let cartQ = supabase.from("vendas").select("valor_venda,vendedor_id,codigo").eq("codigo", "00");
    if (!admin) cartQ = cartQ.eq("vendedor_id", scopeUserId);

    const { data: cartRows, error: cartErr } = await cartQ;
    if (cartErr) throw cartErr;
    const carteiraAtivaTotal = (cartRows || []).reduce((acc, r) => acc + (Number((r as any).valor_venda || 0) || 0), 0);

    // ===== Reservas (solicitações abertas) =====
    let reqQ = supabase
      .from("stock_reservation_requests")
      .select("id,cota_id,vendor_id,vendor_pct,status,created_at")
      .eq("status", "aberta")
      .order("created_at", { ascending: false })
      .limit(10);

    if (!admin) reqQ = reqQ.eq("vendor_id", scopeUserId);

    const { data: reqRows, error: reqErr } = await reqQ;
    if (reqErr) throw reqErr;
    const openStockReqCount = (reqRows || []).length;

    // ===== Vendas sem comissão (view) =====
    let vscQ = supabase
      .from("v_vendas_sem_comissao")
      .select("id,data_venda,vendedor_id,vendedor_nome,segmento,tabela,administradora,numero_proposta,credito")
      .order("data_venda", { ascending: false })
      .limit(10);

    if (!admin) vscQ = vscQ.eq("vendedor_id", scopeUserId);

    const { data: vscRows, error: vscErr } = await vscQ;
    if (vscErr) throw vscErr;
    const vendasSemComissaoCount = (vscRows || []).length;

    // ===== Comissões pendentes =====
    let comQ = supabase
      .from("commissions")
      .select("id,vendedor_id,valor_total,status,created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (!admin) comQ = comQ.eq("vendedor_id", scopeUserId);

    const { data: comRows, error: comErr } = await comQ;
    if (comErr) throw comErr;

    const pend = (comRows || []).filter((c: any) => {
      const st = (c.status || "").toLowerCase();
      return st && st !== "pago" && st !== "estorno";
    });
    const commissionsPendingCount = pend.length;
    const commissionsPendingTotal = pend.reduce((acc: number, r: any) => acc + (Number(r.valor_total || 0) || 0), 0);

    // ===== Giro pendente (view) =====
    let giroDueCount = 0;
    if (admin) {
      const { data: giroAll, error: giroAllErr } = await supabase.from("v_giro_due_count").select("owner_auth_id,due_count");
      if (giroAllErr) throw giroAllErr;
      giroDueCount = (giroAll || []).reduce((acc, r: any) => acc + (Number(r?.due_count || 0) || 0), 0);
    } else {
      const { data: giroRow, error: giroErr } = await supabase
        .from("v_giro_due_count")
        .select("owner_auth_id,due_count")
        .eq("owner_auth_id", scopeAuthId)
        .maybeSingle();
      if (giroErr) throw giroErr;
      giroDueCount = (giroRow as GiroDueRow | null)?.due_count || 0;
    }

    setOverdueOpps(overdueOppsEnriched);
    setTodayEvents((agRows || []) as any);
    setStockReqs(reqRows || []);
    setVendasSemComissao((vscRows || []) as any);

    setKpi({
      overdueOppCount,
      overdueOppTotal,

      todayEventsCount,
      todayGroupsCount,

      monthSalesTotal,
      monthSalesMeta,
      monthSalesPct,

      carteiraAtivaTotal,

      openStockReqCount,
      vendasSemComissaoCount,

      commissionsPendingCount,
      commissionsPendingTotal,

      giroDueCount,
    });
  }

  async function reload(hard = false) {
    if (!me) return;

    const admin = isAdmin(me);

    // ✅ Regra nova:
    // - Admin vê TUDO (sem filtro por vendedor)
    // - Vendedor logado vê SOMENTE o próprio (baseado no auth user id -> users.id)
    const scopeUserId = admin ? me.id : me.id;
    const scopeAuthId = me.auth_user_id;

    if (hard) setRefreshing(true);
    try {
      await loadDashboard(scopeUserId, scopeAuthId, admin);
    } finally {
      if (hard) setRefreshing(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadMeAndUsers();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando `me` carregar, faz o primeiro load do painel
  useEffect(() => {
    if (!me) return;
    reload(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  const admin = isAdmin(me);

  // Light Glass (para fundo claro)
  const glassCard = "bg-white/80 border-slate-200/70 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.08)]";

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-slate-600 text-sm">Carregando Início…</div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] p-6 text-slate-900">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-semibold">
            Bem-vindo, <span className="text-slate-900">{me?.nome?.split(" ")?.[0] || "Max"}</span> 👋
          </div>
          <div className="text-slate-600 text-sm">
            Hoje é <span className="font-medium">{rangeToday.br}</span> • Painel de comando do CRM
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200"
            onClick={() => reload(true)}
            disabled={refreshing}
            title="Atualizar painel"
          >
            <RefreshCcw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Oportunidades atrasadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{kpi.overdueOppCount}</div>
            <div className="text-slate-600 text-sm mt-1">{fmtBRL(kpi.overdueOppTotal)}</div>
            <div className="mt-3">
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200" onClick={() => nav("/oportunidades")}>
                Ver Oportunidades <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Agenda de hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{kpi.todayEventsCount}</div>
            <div className="text-slate-600 text-sm mt-1">{admin ? "Visão geral (Admin)" : "Somente seus eventos"}</div>
            <div className="mt-3">
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200" onClick={() => nav("/agenda")}>
                Abrir Agenda <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Vendas no mês (Donut Meta x Realizado) */}
        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Meta x Vendas (mês)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Donut
                pct={kpi.monthSalesPct}
                centerTop={`${kpi.monthSalesPct.toFixed(1).replace(".", ",")}%`}
                centerBottom="da meta"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-600">Realizado</div>
                <div className="text-lg font-semibold text-slate-900">{fmtBRL(kpi.monthSalesTotal)}</div>

                <div className="mt-2 text-sm text-slate-600">Meta</div>
                <div className="text-base font-semibold text-slate-900">{fmtBRL(kpi.monthSalesMeta)}</div>

                <div className="mt-3">
                  <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200" onClick={() => nav("/relatorios")}>
                    Ver Relatórios <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>

            {kpi.monthSalesMeta <= 0 ? (
              <div className="mt-3 text-xs text-slate-500">
                *Meta do mês não encontrada (metas_vendedores). Se quiser, eu ajusto o select conforme o schema exato da sua tabela.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Carteira ativa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{fmtBRL(kpi.carteiraAtivaTotal)}</div>
            <div className="text-slate-600 text-sm mt-1">Somatório (codigo = 00)</div>
            <div className="mt-3">
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200" onClick={() => nav("/carteira")}>
                Abrir Carteira <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ações rápidas + Alertas */}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className={`${glassCard} xl:col-span-2`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Rocket className="h-4 w-4" /> Ações rápidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/oportunidades")}>
                Nova / Gerir Oportunidades <ArrowRight className="h-4 w-4" />
              </Button>
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/simuladores")}>
                Simular <ArrowRight className="h-4 w-4" />
              </Button>
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/propostas")}>
                Gerar Proposta <ArrowRight className="h-4 w-4" />
              </Button>
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/comissoes")}>
                Comissões <ArrowRight className="h-4 w-4" />
              </Button>
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/gestao-de-grupos")}>
                Gestão de Grupos <ArrowRight className="h-4 w-4" />
              </Button>
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/estoque-contempladas")}>
                Contempladas <ArrowRight className="h-4 w-4" />
              </Button>
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/planejamento")}>
                Maximize-se (Playbook) <ArrowRight className="h-4 w-4" />
              </Button>
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/relatorios")}>
                Extrair Relatório <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Target className="h-4 w-4" /> Alertas do sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-slate-700">Grupos com evento hoje</div>
              <Badge className="bg-slate-100 border border-slate-200 text-slate-800">{kpi.todayGroupsCount}</Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-slate-700">Vendas sem comissão</div>
              <Badge className="bg-slate-100 border border-slate-200 text-slate-800">{kpi.vendasSemComissaoCount}</Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-slate-700">Comissões pendentes</div>
              <Badge className="bg-slate-100 border border-slate-200 text-slate-800">{kpi.commissionsPendingCount}</Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-slate-700">Total pendente</div>
              <div className="text-slate-900 font-medium">{fmtBRL(kpi.commissionsPendingTotal)}</div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-slate-700">Giro pendente</div>
              <Badge className="bg-slate-100 border border-slate-200 text-slate-800">{kpi.giroDueCount}</Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-slate-700">Solicitações de reserva</div>
              <Badge className="bg-slate-100 border border-slate-200 text-slate-800">{kpi.openStockReqCount}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Listas */}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className={`${glassCard} xl:col-span-2`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Atrasadas (top 12)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueOpps.length === 0 ? (
              <div className="text-slate-500 text-sm">Nada atrasado por aqui. 👏</div>
            ) : (
              overdueOpps.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {o.lead_nome || "Lead"} <span className="text-slate-500">• {o.stage}</span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      Fecha em: {o.expected_close_at || "—"} • {o.lead_tel ? `Tel: ${o.lead_tel}` : "Sem telefone"}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{fmtBRL(Number(o.valor_credito || 0) || 0)}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Próximos eventos (hoje)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {todayEvents.length === 0 ? (
              <div className="text-slate-500 text-sm">Sem eventos marcados hoje.</div>
            ) : (
              todayEvents.map((e) => (
                <div key={e.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="text-sm font-medium truncate">{e.titulo}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {fmtDT(e.inicio_at)} • {e.cliente_nome || e.lead_nome || "—"}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200" onClick={() => nav("/agenda")}>
                      Abrir <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                    {e.videocall_url ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200"
                        onClick={() => window.open(e.videocall_url!, "_blank")}
                      >
                        Vídeo <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Maximize-se */}
      <div className="mt-6">
        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Maximize-se
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-slate-700">
              Hoje, foca em 1 coisa: <span className="font-semibold">follow-up com data</span>. Quem deixa “aberto” vira “vou ver e te aviso”.
            </div>
            <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200" onClick={() => nav("/planejamento")}>
              Abrir Playbook <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* (mantidos no state caso você queira usar depois; não renderiza por enquanto) */}
      {/* stockReqs: {stockReqs.length} | vendasSemComissao: {vendasSemComissao.length} */}
    </div>
  );
}
