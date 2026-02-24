// src/pages/Inicio.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  BookOpen,
  Link as LinkIcon,
  FileText,
} from "lucide-react";

/** ===================== Tipos ===================== */
type UserRow = {
  id: string; // users.id
  auth_user_id: string; // users.auth_user_id
  nome: string;
  role: string; // enum user_role
  user_role?: string | null; // legado
  is_active?: boolean | null;
};

type AgendaRow = {
  id: string;
  tipo: string;
  titulo: string;
  inicio_at: string; // timestamptz
  fim_at: string; // timestamptz
  user_id: string | null; // auth_user_id (na view)
  cliente_nome?: string | null;
  lead_nome?: string | null;
  telefone?: string | null;
  videocall_url?: string | null;
};

type OppRow = {
  id: string;
  segmento: string | null;
  valor_credito: number | null;
  estagio: string | null; // Novo | Qualificando | Proposta | Negociação | ...
  score: number | null;
  expected_close_at: string | null; // date
  vendedor_id: string; // auth_user_id
  lead_id: string;
};

type LeadRow = {
  id: string;
  nome: string;
  telefone?: string | null;
};

type GroupRow = {
  id: string;
  administradora: string;
  segmento: string;
  codigo: string;
  prox_vencimento: string | null; // date
  prox_sorteio: string | null; // date
  prox_assembleia: string | null; // date
};

type ClienteRow = {
  id: string;
  nome: string;
  data_nascimento: string | null; // date
  telefone?: string | null;
};

type GiroDueRow = { owner_auth_id: string; due_count: number };

type GiroItemRow = {
  id?: string | null;
  lead_id?: string | null;
  cliente_id?: string | null;
  cliente_nome?: string | null;
  lead_nome?: string | null;
  nome?: string | null;
  telefone?: string | null;
  carteira_ativa_total?: number | null;
  valor_carteira_ativa?: number | null;
  owner_auth_id?: string | null;
};

type KBProcRow = {
  id: string;
  title?: string | null;
  titulo?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CommissionFlowRow = {
  data_pagamento_vendedor: string | null; // date
  valor_previsto: number | null;
  valor_pago_vendedor: number | null;
};

const ALL = "__all__";

/** ===================== Helpers ===================== */

// Fixamos o "dia" do CRM no fuso de Porto Velho (UTC-4) para evitar drift.
const PV_OFFSET_MIN = -4 * 60; // UTC-4

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function ymdFromDateInOffset(d: Date, offsetMin: number) {
  const utc = d.getTime();
  const local = new Date(utc + offsetMin * 60 * 1000);
  const y = local.getUTCFullYear();
  const m = pad2(local.getUTCMonth() + 1);
  const day = pad2(local.getUTCDate());
  return `${y}-${m}-${day}`;
}
function rangeISOForDayInOffset(ymd: string, offsetMin: number) {
  const [Y, M, D] = (ymd || "").split("-").map((x) => Number(x));
  const startLocalUtc = Date.UTC(Y, M - 1, D, 0, 0, 0, 0);
  const endLocalUtc = Date.UTC(Y, M - 1, D, 23, 59, 59, 999);

  const startUtc = new Date(startLocalUtc - offsetMin * 60 * 1000);
  const endUtc = new Date(endLocalUtc - offsetMin * 60 * 1000);

  return { startISO: startUtc.toISOString(), endISO: endUtc.toISOString() };
}
function addDaysYMD(ymd: string, days: number) {
  const [Y, M, D] = (ymd || "").split("-").map((x) => Number(x));
  const t = Date.UTC(Y, M - 1, D, 12, 0, 0);
  const dt = new Date(t + days * 24 * 60 * 60 * 1000);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function fmtDateBRFromYMD(ymd: string) {
  const [y, m, d] = (ymd || "").split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}
function monthRangeYMDFromOffset(now: Date, offsetMin: number) {
  const utc = now.getTime();
  const local = new Date(utc + offsetMin * 60 * 1000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();

  const start = new Date(Date.UTC(y, m, 1, 12, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 1, 12, 0, 0));

  const f = (dt: Date) => `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
  return { startYMD: f(start), endYMD: f(end), year: y, month: m + 1 };
}
function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDTForOffset(iso: string, offsetMin: number) {
  const d = new Date(iso);
  const local = new Date(d.getTime() + offsetMin * 60 * 1000);
  const dd = pad2(local.getUTCDate());
  const mm = pad2(local.getUTCMonth() + 1);
  const hh = pad2(local.getUTCHours());
  const mi = pad2(local.getUTCMinutes());
  return `${dd}/${mm} ${hh}:${mi}`;
}
function isAdmin(u?: UserRow | null) {
  const r = (u?.role || u?.user_role || "").toLowerCase();
  return r === "admin";
}
function humanErr(e: any) {
  if (!e) return "Erro desconhecido.";
  if (typeof e === "string") return e;
  const msg = e?.message || e?.error_description || e?.details || e?.hint;
  if (msg) return String(msg);
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
function metaFieldForMonth(month: number) {
  const mm = String(month).padStart(2, "0");
  return `m${mm}` as any;
}
function daysDiffYMD(a: string, b: string) {
  // a - b, em dias (a e b no formato YYYY-MM-DD)
  if (!a || !b) return 0;
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ta = Date.UTC(ay, am - 1, ad, 12, 0, 0);
  const tb = Date.UTC(by, bm - 1, bd, 12, 0, 0);
  return Math.round((ta - tb) / (24 * 60 * 60 * 1000));
}

/** ===================== Donut via SVG ===================== */
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(15,23,42,0.9)"
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

/** ===================== Próximos Eventos ===================== */
type DateFlag = "Hoje" | "Amanhã" | "Esta Semana";

type NextEventItem = {
  id: string;
  whenSort: number;
  whenLabel: string; // só data/hora (sem duplicar “Esta Semana …”)
  flag: DateFlag; // tag separada (Hoje/Amanhã/Esta Semana)
  title: string;
  desc?: string | null;
  action?: { label: string; to?: string; href?: string };
};

function flagFromYMD3(today: string, ymd: string): DateFlag {
  if (!ymd) return "Esta Semana";
  if (ymd === today) return "Hoje";
  if (ymd === addDaysYMD(today, 1)) return "Amanhã";
  // depois de amanhã pra frente
  return "Esta Semana";
}

function flagBadgeClass(flag: DateFlag) {
  if (flag === "Hoje") return "bg-amber-50 border border-amber-200 text-amber-800";
  if (flag === "Amanhã") return "bg-slate-50 border border-slate-200 text-slate-700";
  return "bg-slate-50 border border-slate-200 text-slate-700";
}

/** ===================== Pensamento do dia ===================== */
const THOUGHT_URL = "https://meetime.com.br/blog/vendas/as-47-melhores-frases-motivacionais-para-vendas/";

function hashYMD(ymd: string) {
  let h = 2166136261;
  for (let i = 0; i < ymd.length; i++) {
    h ^= ymd.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickDeterministic(arr: string[], ymd: string) {
  if (!arr.length) return null;
  const idx = hashYMD(ymd) % arr.length;
  return arr[idx];
}

const FALLBACK_THOUGHTS: string[] = [
  "Consistência vence talento quando talento não é consistente.",
  "Quem faz follow-up com data, fecha com mais calma e mais previsibilidade.",
  "Venda consultiva: menos pressa, mais clareza — e mais fechamento.",
  "Hoje é dia de simplificar: uma boa pergunta vale mais que dez argumentos.",
  "Você não precisa convencer todo mundo. Só precisa conduzir a pessoa certa até a decisão certa.",
];

async function loadThoughtOfDay(todayYMD: string): Promise<string | null> {
  // 1) tenta buscar do site (pode falhar por CORS)
  try {
    const res = await fetch(THOUGHT_URL, { method: "GET" });
    if (res.ok) {
      const html = await res.text();
      const matches = Array.from(html.matchAll(/>\s*\d+\.\s*“([^”]{8,220})”/g));
      const phrases = matches.map((m) => (m?.[1] || "").trim()).filter(Boolean);
      const picked = pickDeterministic(phrases, todayYMD);
      if (picked) return picked;
    }
  } catch {
    // ignora
  }

  // 2) tenta buscar de um schema de frases (caso exista)
  try {
    const { data, error } = await supabase.from("sales_quotes").select("text,is_active").eq("is_active", true).limit(500);
    if (!error && data && data.length) {
      const arr = (data as any[]).map((r) => String(r.text || "").trim()).filter(Boolean);
      const picked = pickDeterministic(arr, todayYMD);
      if (picked) return picked;
    }
  } catch {
    // ignora
  }

  return pickDeterministic(FALLBACK_THOUGHTS, todayYMD) || FALLBACK_THOUGHTS[0];
}

/** ===================== Página ===================== */
export default function Inicio() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [me, setMe] = useState<UserRow | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // filtro admin (value = users.id)
  const [vendorScope, setVendorScope] = useState<string>(ALL);
  const scopedUser = useMemo(() => (vendorScope === ALL ? null : usersById.get(vendorScope) || null), [vendorScope, usersById]);

  // "Hoje" e mês no offset de Porto Velho
  const rangeToday = useMemo(() => {
    const now = new Date();
    const ymd = ymdFromDateInOffset(now, PV_OFFSET_MIN);
    const { startISO, endISO } = rangeISOForDayInOffset(ymd, PV_OFFSET_MIN);
    return { ymd, br: fmtDateBRFromYMD(ymd), startISO, endISO };
  }, []);
  const rangeMonth = useMemo(() => monthRangeYMDFromOffset(new Date(), PV_OFFSET_MIN), []);

  const OPEN_STAGES = useMemo(() => ["Novo", "Qualificando", "Proposta", "Negociação"], []);

  // ======= KPIs =======
  const [kpi, setKpi] = useState({
    openOppCount: 0,
    openOppTotal: 0,

    todayEventsCount: 0,
    todayGroupsCount: 0,

    monthSalesTotal: 0,
    monthSalesMeta: 0,
    monthSalesPct: 0,

    carteiraAtivaTotal: 0,

    openStockReqCount: 0,
    vendasSemComissaoCount: 0,

    giroDueCount: 0,

    // 🔔 Procedimentos novos
    newProceduresCount: 0,

    // ✅ comissão pendente (valor)
    commissionsPendingTotal: 0,
  });

  const [overdueOpps, setOverdueOpps] = useState<(OppRow & { lead_nome?: string; lead_tel?: string | null; daysWaiting?: number })[]>(
    []
  );

  const [agendaItems, setAgendaItems] = useState<AgendaRow[]>([]);

  // Paginação: Giros Pendentes
  const [giroAll, setGiroAll] = useState<{ id: string; nome: string; carteiraAtiva: number }[]>([]);
  const [giroPage, setGiroPage] = useState(0);
  const GIRO_PAGE_SIZE = 10;

  // Paginação: Próximos Eventos
  const [eventsAll, setEventsAll] = useState<NextEventItem[]>([]);
  const [eventsPage, setEventsPage] = useState(0);
  const EVENTS_PAGE_SIZE = 10;

  const [thoughtOfDay, setThoughtOfDay] = useState<string>("");

  const giroPageCount = useMemo(() => Math.max(1, Math.ceil(giroAll.length / GIRO_PAGE_SIZE)), [giroAll.length]);
  const giroSlice = useMemo(
    () => giroAll.slice(giroPage * GIRO_PAGE_SIZE, giroPage * GIRO_PAGE_SIZE + GIRO_PAGE_SIZE),
    [giroAll, giroPage]
  );

  const eventsPageCount = useMemo(() => Math.max(1, Math.ceil(eventsAll.length / EVENTS_PAGE_SIZE)), [eventsAll.length]);
  const eventsSlice = useMemo(
    () => eventsAll.slice(eventsPage * EVENTS_PAGE_SIZE, eventsPage * EVENTS_PAGE_SIZE + EVENTS_PAGE_SIZE),
    [eventsAll, eventsPage]
  );

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
    if (!meRow) throw new Error("Usuário não encontrado na tabela users.");

    const { data: usersRows, error: usersErr } = await supabase
      .from("users")
      .select("id,auth_user_id,nome,role,user_role,is_active")
      .eq("is_active", true)
      .order("nome", { ascending: true });
    if (usersErr) throw usersErr;

    const admin = isAdmin(meRow);
    const initialScope = admin ? ALL : meRow.id;

    return { meRow, usersRows: usersRows || [], admin, initialScope };
  }

  async function tryLoadLeadsMap(ids: string[]) {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (!uniq.length) return new Map<string, LeadRow>();

    try {
      const { data, error } = await supabase.from("leads").select("id,nome,telefone").in("id", uniq);
      if (!error && data) return new Map((data as any[]).map((l) => [l.id, l as LeadRow]));
    } catch {
      // ignora
    }

    try {
      const { data, error } = await supabase.from("lead").select("id,nome,telefone").in("id", uniq);
      if (!error && data) return new Map((data as any[]).map((l) => [l.id, l as LeadRow]));
    } catch {
      // ignora
    }

    return new Map<string, LeadRow>();
  }

  /**
   * scopeUserId  = users.id (usado por metas/reservas)
   * scopeAuthId  = users.auth_user_id (usado por oportunidades/vendas/agenda/carteira/giro)
   */
  async function loadDashboard(scopeUserId: string, scopeAuthId: string, admin: boolean) {
    const today = rangeToday.ymd;
    const { startYMD, endYMD, year, month } = rangeMonth;

    // Janela “Próximos Eventos” (somente futuro: hoje -> +14)
    const windowStart = today;
    const windowEnd = addDaysYMD(today, 14);
    const windowStartISO = rangeISOForDayInOffset(windowStart, PV_OFFSET_MIN).startISO;
    const windowEndISO = rangeISOForDayInOffset(windowEnd, PV_OFFSET_MIN).endISO;

    // ===== Oportunidades (KPI) — somente estágios abertos =====
    let openOppQ = supabase
      .from("opportunities")
      .select("id,segmento,valor_credito,estagio,score,expected_close_at,vendedor_id,lead_id")
      .in("estagio", OPEN_STAGES)
      .limit(5000);

    if (!admin) openOppQ = openOppQ.eq("vendedor_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) openOppQ = openOppQ.eq("vendedor_id", scopeAuthId);

    const { data: openOppRowsRaw, error: openOppErr } = await openOppQ;
    if (openOppErr) throw openOppErr;

    const openOppRows = (openOppRowsRaw || []) as any as OppRow[];
    const openOppCount = openOppRows.length;
    const openOppTotal = openOppRows.reduce((acc, r) => acc + (Number(r.valor_credito || 0) || 0), 0);

    // ===== Oportunidades Atrasadas (lista) — top 10 por dias esperando ação =====
    const overdueComputed = openOppRows
      .map((o: any) => {
        const d = (o.expected_close_at || "").slice(0, 10);
        const daysWaiting = d ? Math.max(0, daysDiffYMD(today, d)) : 0;
        return { ...o, daysWaiting };
      })
      .sort((a: any, b: any) => (b.daysWaiting || 0) - (a.daysWaiting || 0))
      .slice(0, 10);

    const leadIds = Array.from(new Set(overdueComputed.map((o: any) => o.lead_id).filter(Boolean)));
    const leadsMap = await tryLoadLeadsMap(leadIds);

    const overdueOppsEnriched = overdueComputed.map((o: any) => {
      const ld = leadsMap.get(o.lead_id);
      return { ...o, lead_nome: ld?.nome, lead_tel: ld?.telefone || null };
    });

    // ===== Agenda (janela) =====
    let agQ = supabase
      .from("v_agenda_eventos_enriquecida")
      .select("id,tipo,titulo,inicio_at,fim_at,user_id,cliente_nome,lead_nome,telefone,videocall_url")
      .gte("inicio_at", windowStartISO)
      .lte("inicio_at", windowEndISO)
      .order("inicio_at", { ascending: true })
      .limit(50);

    if (!admin) agQ = agQ.eq("user_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) agQ = agQ.eq("user_id", scopeAuthId);

    const { data: agRows, error: agErr } = await agQ;
    if (agErr) throw agErr;

    // Contagem "Agenda de hoje" (mesmo set)
    const todayStartISO = rangeToday.startISO;
    const todayEndISO = rangeToday.endISO;
    const todayEventsCount = (agRows || []).filter((e: any) => {
      const t = new Date(e.inicio_at).toISOString();
      return t >= todayStartISO && t <= todayEndISO;
    }).length;

    // ===== Eventos de grupos hoje (KPI) =====
    const orExprToday = `prox_vencimento.eq.${today},prox_sorteio.eq.${today},prox_assembleia.eq.${today}`;
    const { data: gTodayRows, error: gTodayErr } = await supabase.from("groups").select("id").or(orExprToday).limit(200);
    if (gTodayErr) throw gTodayErr;
    const todayGroupsCount = (gTodayRows || []).length;

    // ===== Eventos de grupos (janela) =====
    const orExprWindow = `prox_vencimento.gte.${windowStart},prox_vencimento.lte.${windowEnd},prox_sorteio.gte.${windowStart},prox_sorteio.lte.${windowEnd},prox_assembleia.gte.${windowStart},prox_assembleia.lte.${windowEnd}`;
    const { data: gRows, error: gErr } = await supabase
      .from("groups")
      .select("id,administradora,segmento,codigo,prox_vencimento,prox_sorteio,prox_assembleia")
      .or(orExprWindow)
      .limit(300);
    if (gErr) throw gErr;

    // ===== Vendas do mês =====
    let salesQ = supabase.from("vendas").select("valor_venda,vendedor_id,data_venda").gte("data_venda", startYMD).lt("data_venda", endYMD);

    if (!admin) salesQ = salesQ.eq("vendedor_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) salesQ = salesQ.eq("vendedor_id", scopeAuthId);

    const { data: salesRows, error: salesErr } = await salesQ;
    if (salesErr) throw salesErr;
    const monthSalesTotal = (salesRows || []).reduce((acc: number, r: any) => acc + (Number(r.valor_venda || 0) || 0), 0);

    // ===== Meta do mês =====
    const field = metaFieldForMonth(month);
    let metaQ = supabase.from("metas_vendedores").select(`vendedor_id,ano,${field}`).eq("ano", year);

    if (!admin) metaQ = metaQ.eq("vendedor_id", scopeUserId);
    if (admin && scopeUserId !== ALL) metaQ = metaQ.eq("vendedor_id", scopeUserId);

    const { data: metaRows, error: metaErr } = await metaQ;
    if (metaErr) throw metaErr;

    const monthSalesMeta = (metaRows || []).reduce((acc: number, r: any) => acc + (Number(r?.[field] || 0) || 0), 0);
    const monthSalesPct = monthSalesMeta > 0 ? Math.min(100, Math.max(0, (monthSalesTotal / monthSalesMeta) * 100)) : 0;

    // ===== Carteira ativa (codigo=00) =====
    let cartQ = supabase.from("vendas").select("valor_venda,vendedor_id,codigo").eq("codigo", "00");
    if (!admin) cartQ = cartQ.eq("vendedor_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) cartQ = cartQ.eq("vendedor_id", scopeAuthId);

    const { data: cartRows, error: cartErr } = await cartQ;
    if (cartErr) throw cartErr;
    const carteiraAtivaTotal = (cartRows || []).reduce((acc: number, r: any) => acc + (Number(r.valor_venda || 0) || 0), 0);

    // ===== Reservas abertas / vendas sem comissão (KPI) =====
    let reqQ = supabase.from("stock_reservation_requests").select("id").eq("status", "aberta").limit(1000);
    if (!admin) reqQ = reqQ.eq("vendor_id", scopeUserId);
    if (admin && scopeUserId !== ALL) reqQ = reqQ.eq("vendor_id", scopeUserId);

    const { data: reqRows, error: reqErr } = await reqQ;
    if (reqErr) throw reqErr;
    const openStockReqCount = (reqRows || []).length;

    let vscQ = supabase.from("v_vendas_sem_comissao").select("id,vendedor_id").limit(3000);
    if (!admin) vscQ = vscQ.eq("vendedor_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) vscQ = vscQ.eq("vendedor_id", scopeAuthId);

    const { data: vscRows, error: vscErr } = await vscQ;
    if (vscErr) throw vscErr;
    const vendasSemComissaoCount = (vscRows || []).length;

    // ===== Giro pendente (contagem + lista top 10 maiores com paginação) =====
    let giroDueCount = 0;

    if (admin) {
      if (scopeAuthId === ALL) {
        const { data: giroAllC, error: giroAllErr } = await supabase.from("v_giro_due_count").select("owner_auth_id,due_count");
        if (giroAllErr) throw giroAllErr;
        giroDueCount = (giroAllC || []).reduce((acc: number, r: any) => acc + (Number(r?.due_count || 0) || 0), 0);
      } else {
        const { data: giroRow, error: giroErr } = await supabase
          .from("v_giro_due_count")
          .select("owner_auth_id,due_count")
          .eq("owner_auth_id", scopeAuthId)
          .maybeSingle();
        if (giroErr) throw giroErr;
        giroDueCount = (giroRow as GiroDueRow | null)?.due_count || 0;
      }
    } else {
      const { data: giroRow, error: giroErr } = await supabase
        .from("v_giro_due_count")
        .select("owner_auth_id,due_count")
        .eq("owner_auth_id", scopeAuthId)
        .maybeSingle();
      if (giroErr) throw giroErr;
      giroDueCount = (giroRow as GiroDueRow | null)?.due_count || 0;
    }

    // Lista de giros pendentes: top 10 maiores, com paginação client-side
    let giroList: { id: string; nome: string; carteiraAtiva: number }[] = [];
    try {
      let giroItemsQ = supabase
        .from("v_giro_due_items")
        .select("id,lead_id,cliente_id,cliente_nome,lead_nome,nome,telefone,carteira_ativa_total,valor_carteira_ativa,owner_auth_id")
        .limit(5000);

      if (!admin) giroItemsQ = giroItemsQ.eq("owner_auth_id", scopeAuthId);
      if (admin && scopeAuthId !== ALL) giroItemsQ = giroItemsQ.eq("owner_auth_id", scopeAuthId);

      const { data: giroItems, error: giroItemsErr } = await giroItemsQ;
      if (!giroItemsErr && giroItems) {
        giroList = (giroItems as any as GiroItemRow[]).map((r, idx) => {
          const nome = String((r.cliente_nome || r.lead_nome || r.nome || "Cliente") ?? "Cliente").trim();
          const carteira = Number(r.valor_carteira_ativa ?? r.carteira_ativa_total ?? 0) || 0;
          const id = String(r.id || r.cliente_id || r.lead_id || `giro_${idx}`);
          return { id, nome, carteiraAtiva: carteira };
        });
        // 10 maiores (carteira) primeiro
        giroList.sort((a, b) => (b.carteiraAtiva || 0) - (a.carteiraAtiva || 0));
      }
    } catch {
      giroList = [];
    }

    // ===== Aniversários do dia =====
    const { data: allBirth, error: birthErr } = await supabase
      .from("clientes")
      .select("id,nome,data_nascimento,telefone")
      .not("data_nascimento", "is", null)
      .limit(2000);
    if (birthErr) throw birthErr;

    const todayMMDD = today.slice(5);
    const birthdayToday = (allBirth || [])
      .filter((c: ClienteRow) => (c.data_nascimento || "").slice(5) === todayMMDD)
      .slice(0, 20);

    // ===== Procedimentos novos =====
    let newProceduresCount = 0;
    try {
      const sevenDaysAgo = addDaysYMD(today, -7);
      const { data: kbRows, error: kbErr } = await supabase
        .from("kb_procedures")
        .select("id,title,titulo,status,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (!kbErr && kbRows) {
        const active = (kbRows as KBProcRow[]).filter((p) => String(p.status || "").toLowerCase() === "active");
        newProceduresCount = active.filter((p) => (p.created_at || "").slice(0, 10) >= sevenDaysAgo).length;
      }
    } catch {
      newProceduresCount = 0;
    }

    // ===== Fluxo de comissões (Próximos Eventos + Alertas valor pendente) =====
    // Puxamos janela futura e também calculamos pendente total (não pago) dentro da janela
    const { data: cfRows, error: cfErr } = await supabase
      .from("commissions_flow")
      .select("data_pagamento_vendedor,valor_previsto,valor_pago_vendedor")
      .gte("data_pagamento_vendedor", windowStart)
      .lte("data_pagamento_vendedor", windowEnd)
      .limit(5000);

    const commissionsFlow = (!cfErr && cfRows ? (cfRows as any as CommissionFlowRow[]) : []) as CommissionFlowRow[];

    let commissionsPendingTotal = 0;

    // agrega por data
    const cfAgg = new Map<
      string,
      {
        date: string;
        sumPrev: number;
        sumPaid: number;
      }
    >();

    for (const r of commissionsFlow) {
      const d = (r.data_pagamento_vendedor || "").slice(0, 10);
      if (!d) continue;

      const prev = Number(r.valor_previsto || 0) || 0;
      const paid = Number(r.valor_pago_vendedor || 0) || 0;

      // pendente = previsto onde ainda não tem pago
      if (paid <= 0) commissionsPendingTotal += prev;

      const cur = cfAgg.get(d) || { date: d, sumPrev: 0, sumPaid: 0 };
      cur.sumPrev += prev;
      cur.sumPaid += paid;
      cfAgg.set(d, cur);
    }

    /** ===================== Monta Próximos Eventos (somente futuro) ===================== */
    const items: NextEventItem[] = [];

    // Agenda: já está gte(windowStartISO) então não vem passado por data (e não duplicamos flag na label)
    for (const e of (agRows || []) as AgendaRow[]) {
      const startISO = e.inicio_at;
      const startUtcMs = new Date(startISO).getTime();
      const ymd = ymdFromDateInOffset(new Date(startUtcMs), PV_OFFSET_MIN);

      // “Próximos”: se por algum motivo cair dia anterior, descarta
      if (ymd < today) continue;

      const flag = flagFromYMD3(today, ymd);

      items.push({
        id: `ag:${e.id}`,
        whenSort: startUtcMs,
        whenLabel: fmtDTForOffset(startISO, PV_OFFSET_MIN),
        flag,
        title: e.titulo || "Evento",
        desc: `${e.tipo || "Agenda"} • ${(e.cliente_nome || e.lead_nome || "—") as any}`,
        action: { label: "Abrir Agenda", to: "/agenda" },
      });
    }

    // Grupos (date) — título + “Administradora | Segmento”
    for (const g of (gRows || []) as GroupRow[]) {
      const base = `${g.administradora} | ${g.segmento}`;
      const pushGroup = (kind: "Vencimento" | "Sorteio" | "Assembleia", dateYMD: string | null) => {
        if (!dateYMD) return;
        // próximos = desconsidera passados
        if (dateYMD < today) return;

        const flag = flagFromYMD3(today, dateYMD);

        items.push({
          id: `grp:${g.id}:${kind}:${dateYMD}`,
          whenSort: Date.UTC(Number(dateYMD.slice(0, 4)), Number(dateYMD.slice(5, 7)) - 1, Number(dateYMD.slice(8, 10)), 12, 0, 0),
          whenLabel: fmtDateBRFromYMD(dateYMD),
          flag,
          title: `${kind} Grupo ${g.codigo}`,
          desc: base,
          action: { label: "Ver Grupos", to: "/gestao-de-grupos" },
        });
      };

      pushGroup("Assembleia", g.prox_assembleia);
      pushGroup("Vencimento", g.prox_vencimento);
      pushGroup("Sorteio", g.prox_sorteio);
    }

    // Recebimento de Comissão (agrupado por data, somente futuro)
    for (const [d, agg] of cfAgg.entries()) {
      if (d < today) continue;

      const flag = flagFromYMD3(today, d);
      const received = (agg.sumPaid || 0) > 0;

      const msg = received
        ? `🎉 Você recebeu comissão no valor de ${fmtBRL(agg.sumPaid)} ✅`
        : `💰 Você receberá ${fmtBRL(agg.sumPrev)} de comissão 💸`;

      items.push({
        id: `cf:${d}`,
        whenSort: Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)), 13, 0, 0),
        whenLabel: fmtDateBRFromYMD(d),
        flag,
        title: "Recebimento de Comissão",
        desc: msg,
        action: { label: "Abrir Comissões", to: "/comissoes" },
      });
    }

    // Aniversários (somente hoje — é “próximo” por definição)
    for (const c of birthdayToday) {
      const flag: DateFlag = "Hoje";
      items.push({
        id: `bday:${c.id}`,
        whenSort: Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)), 8, 0, 0),
        whenLabel: fmtDateBRFromYMD(today),
        flag,
        title: "Aniversário",
        desc: `É aniversário do seu Cliente “${c.nome}”. Parabenize-o! 🎂🎉`,
        action: { label: "Ver Clientes", to: "/clientes" },
      });
    }

    // Ordena
    items.sort((a, b) => a.whenSort - b.whenSort);

    // ✅ Atualiza estados
    setOverdueOpps(overdueOppsEnriched);
    setAgendaItems((agRows || []) as any);

    setGiroAll(giroList);
    setGiroPage(0); // reseta paginação ao recarregar

    setEventsAll(items);
    setEventsPage(0); // reseta paginação ao recarregar

    // Pensamento do dia
    const thought = await loadThoughtOfDay(today);
    if (thought) setThoughtOfDay(thought);

    setKpi({
      openOppCount,
      openOppTotal,

      todayEventsCount,
      todayGroupsCount,

      monthSalesTotal,
      monthSalesMeta,
      monthSalesPct,

      carteiraAtivaTotal,

      openStockReqCount,
      vendasSemComissaoCount,

      giroDueCount,

      newProceduresCount,

      commissionsPendingTotal,
    });
  }

  function getScopes() {
    if (!me) return null;
    const admin = isAdmin(me);

    if (!admin) {
      return { admin, scopeUserId: me.id, scopeAuthId: me.auth_user_id };
    }

    if (vendorScope === ALL) {
      return { admin, scopeUserId: ALL, scopeAuthId: ALL };
    }

    const u = usersById.get(vendorScope);
    if (!u) return { admin, scopeUserId: vendorScope, scopeAuthId: ALL };

    return { admin, scopeUserId: u.id, scopeAuthId: u.auth_user_id };
  }

  async function reload(hard = false) {
    const scopes = getScopes();
    if (!scopes) return;

    if (hard) setRefreshing(true);
    setErrMsg(null);

    try {
      await loadDashboard(scopes.scopeUserId, scopes.scopeAuthId, scopes.admin);
    } catch (e) {
      console.error("[Inicio] loadDashboard error:", e);
      setErrMsg(humanErr(e));
    } finally {
      if (hard) setRefreshing(false);
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErrMsg(null);

      try {
        const { meRow, usersRows, admin, initialScope } = await loadMeAndUsers();
        if (!alive) return;

        setMe(meRow);
        setUsers(usersRows);
        setVendorScope(initialScope);

        const initScopes = admin
          ? initialScope === ALL
            ? { su: ALL, sa: ALL }
            : { su: meRow.id, sa: meRow.auth_user_id }
          : { su: meRow.id, sa: meRow.auth_user_id };

        await loadDashboard(initScopes.su, initScopes.sa, admin);
      } catch (e) {
        console.error("[Inicio] init error:", e);
        if (!alive) return;
        setErrMsg(humanErr(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando muda filtro do admin, recarrega
  useEffect(() => {
    if (!me) return;
    const admin = isAdmin(me);
    if (!admin) return;

    if (vendorScope !== ALL && !usersById.has(vendorScope)) return;
    reload(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorScope]);

  const admin = isAdmin(me);
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
            Bem-vindo(a), <span className="text-slate-900">{me?.nome?.split(" ")?.[0] || "Max"}</span> 👋
          </div>
          <div className="text-slate-600 text-sm">
            Hoje é <span className="font-medium">{rangeToday.br}</span> • Painel de comando do CRM
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {admin && (
            <div className="min-w-[260px]">
              <Select value={vendorScope} onValueChange={setVendorScope}>
                <SelectTrigger className="bg-white border border-slate-200 text-slate-900">
                  <SelectValue placeholder="Vendedor: Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos (Admin)</SelectItem>
                  {users
                    .filter((u) => (u.role || u.user_role || "").toLowerCase() !== "viewer")
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

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

      {/* Erro visível */}
      {errMsg ? (
        <div className="mt-5">
          <Card className={`${glassCard} border-red-200`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Erro ao carregar o painel
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-700">
              <div className="mb-2">Copia essa mensagem e me manda:</div>
              <pre className="whitespace-pre-wrap break-words rounded-md bg-white border border-slate-200 p-3 text-xs text-slate-800">{errMsg}</pre>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Oportunidades */}
        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Oportunidades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{kpi.openOppCount}</div>
            <div className="text-slate-600 text-sm mt-1">{fmtBRL(kpi.openOppTotal)}</div>
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
            <div className="text-slate-600 text-sm mt-1">
              {admin && vendorScope !== ALL ? `Filtrado: ${scopedUser?.nome || "—"}` : admin ? "Visão geral" : "Somente seus eventos"}
            </div>
            <div className="mt-3">
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200" onClick={() => nav("/agenda")}>
                Abrir Agenda <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Meta x Vendas (mês)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Donut pct={kpi.monthSalesPct} centerTop={`${kpi.monthSalesPct.toFixed(1).replace(".", ",")}%`} centerBottom="da meta" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-600">Realizado</div>
                <div className="text-lg font-semibold text-slate-900">{fmtBRL(kpi.monthSalesTotal)}</div>

                <div className="mt-2 text-sm text-slate-600">Meta do mês</div>
                <div className="text-base font-semibold text-slate-900">{fmtBRL(kpi.monthSalesMeta)}</div>

                <div className="mt-3">
                  <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200" onClick={() => nav("/relatorios")}>
                    Ver Relatórios <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
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
                <span className="inline-flex items-center gap-2">
                  <BookOpen className="h-4 w-4" /> Playbook de Vendas
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>

              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/links")}>
                <span className="inline-flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" /> Links Úteis
                </span>
                <ArrowRight className="h-4 w-4" />
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
              <div className="text-slate-700 inline-flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" />
                Procedimentos novos
              </div>
              <Badge className="bg-slate-100 border border-slate-200 text-slate-800">{kpi.newProceduresCount}</Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-slate-700">Grupos com evento hoje</div>
              <Badge className="bg-slate-100 border border-slate-200 text-slate-800">{kpi.todayGroupsCount}</Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-slate-700">Vendas sem comissão</div>
              <Badge className="bg-slate-100 border border-slate-200 text-slate-800">{kpi.vendasSemComissaoCount}</Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-slate-700">Comissão pendente</div>
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

      {/* Listas: Oportunidades Atrasadas + Giros Pendentes + Próximos Eventos */}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Oportunidades Atrasadas */}
        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Oportunidades Atrasadas
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
                      {o.lead_nome || "Lead"} <span className="text-slate-500">• {(o.estagio || "—") as any}</span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {typeof o.daysWaiting === "number" ? `${o.daysWaiting} dia(s) aguardando` : "—"} •{" "}
                      {o.lead_tel ? `Tel: ${o.lead_tel}` : "Sem telefone"}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{fmtBRL(Number(o.valor_credito || 0) || 0)}</div>
                </div>
              ))
            )}

            <div className="pt-2">
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 w-full" onClick={() => nav("/oportunidades")}>
                Ver Oportunidades <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Giros Pendentes (top 10 maiores com paginação) */}
        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Giros Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {giroAll.length === 0 ? (
              <div className="text-slate-500 text-sm">
                {kpi.giroDueCount > 0 ? `Você tem ${kpi.giroDueCount} giro(s) pendente(s).` : "Sem giros pendentes no momento."}
              </div>
            ) : (
              <>
                {giroSlice.map((g) => (
                  <div key={g.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{g.nome}</div>
                      <div className="text-xs text-slate-500 truncate">Carteira ativa: {fmtBRL(Number(g.carteiraAtiva || 0) || 0)}</div>
                    </div>
                    <Button size="sm" className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200" onClick={() => nav("/giro-de-carteira")}>
                      Abrir <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                ))}

                {/* Paginação */}
                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-slate-500">
                    Página {giroPage + 1} de {giroPageCount}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200"
                      onClick={() => setGiroPage((p) => Math.max(0, p - 1))}
                      disabled={giroPage <= 0}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200"
                      onClick={() => setGiroPage((p) => Math.min(giroPageCount - 1, p + 1))}
                      disabled={giroPage >= giroPageCount - 1}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </>
            )}

            <div className="pt-2">
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 w-full" onClick={() => nav("/giro-de-carteira")}>
                Abrir Giro <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Próximos Eventos (somente futuro, limite 10 com paginação) */}
        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Próximos Eventos
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-2">
            {eventsAll.length === 0 ? (
              <div className="text-slate-500 text-sm">Sem eventos futuros na janela configurada.</div>
            ) : (
              <>
                {eventsSlice.map((e) => (
                  <div key={e.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge className={flagBadgeClass(e.flag)}>{e.flag}</Badge>
                          <div className="text-xs text-slate-500">{e.whenLabel}</div>
                        </div>

                        <div className="text-sm font-medium truncate mt-1">{e.title}</div>
                        {e.desc ? <div className="text-xs text-slate-500 truncate">{e.desc}</div> : null}
                      </div>

                      {e.action ? (
                        <Button
                          size="sm"
                          className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200"
                          onClick={() => {
                            if (e.action?.to) nav(e.action.to);
                            else if (e.action?.href) window.open(e.action.href, "_blank");
                          }}
                        >
                          {e.action.label} <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {/* Paginação */}
                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-slate-500">
                    Página {eventsPage + 1} de {eventsPageCount}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200"
                      onClick={() => setEventsPage((p) => Math.max(0, p - 1))}
                      disabled={eventsPage <= 0}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200"
                      onClick={() => setEventsPage((p) => Math.min(eventsPageCount - 1, p + 1))}
                      disabled={eventsPage >= eventsPageCount - 1}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pensamento do Dia */}
      <div className="mt-6">
        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Pensamento do Dia
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-slate-700">
              {thoughtOfDay ? (
                <span className="font-semibold">“{thoughtOfDay}”</span>
              ) : (
                <>
                  Hoje, foca em 1 coisa: <span className="font-semibold">follow-up com data</span>.
                </>
              )}
            </div>
            <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200" onClick={() => nav("/planejamento")}>
              Abrir Playbook <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
