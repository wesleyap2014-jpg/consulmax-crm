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
  Bell,
  Link as LinkIcon,
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
  inicio_at: string;
  fim_at: string;
  user_id: string | null; // auth_user_id (na view)
  cliente_nome?: string | null;
  lead_nome?: string | null;
  telefone?: string | null;
  videocall_url?: string | null;
};

type OppRow = {
  id: string;
  valor_credito: number | null;
  stage: string | null;
  estagio: string | null;
  expected_close_at: string | null; // date (YMD)
  vendedor_id: string; // auth_user_id
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
  vendor_id: string; // users.id
  vendor_pct: number;
  status: string;
  created_at: string;
};

type VendaSemComissaoRow = {
  id: string;
  data_venda: string | null;
  vendedor_id: string | null; // auth_user_id
  vendedor_nome: string | null;
  segmento: string | null;
  tabela: string | null;
  administradora: string | null;
  numero_proposta: string | null;
  credito: number | null;
};

type CommissionRow = {
  id: string;
  vendedor_id: string; // users.id
  valor_total: number | null;
  status: string | null;
  created_at?: string | null;
};

type GiroDueRow = { owner_auth_id: string; due_count: number };

type GroupRow = {
  id: string;
  codigo?: string | null;
  administradora?: string | null;
  segmento?: string | null;
  prox_vencimento?: string | null; // date
  prox_sorteio?: string | null; // date
  prox_assembleia?: string | null; // date
};

type ClienteRow = {
  id: string;
  nome: string;
  telefone?: string | null;
  data_nascimento?: string | null; // date
};

type ProcedureRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const ALL = "__all__";

/** ===================== Helpers ===================== */
function todayYMD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDateBRFromYMD(ymd: string) {
  const [y, m, d] = (ymd || "").split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
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

function stageIsClosed(stage?: string | null, estagio?: string | null) {
  const st = (stage || "").trim().toLowerCase();
  const es = (estagio || "").trim().toLowerCase();
  if (st === "fechado_ganho" || st === "fechado_perdido") return true;
  if (es === "fechado (ganho)" || es === "fechado (perdido)") return true;
  if (st.startsWith("fechado")) return true;
  if (es.startsWith("fechado")) return true;
  return false;
}

function metaFieldForMonth(month: number) {
  const mm = String(month).padStart(2, "0");
  return `m${mm}` as any;
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

// Para evitar “deslize” quando a view/campo é timestamp SEM timezone:
function dayStartLocalNoZ(ymd: string) {
  return `${ymd}T00:00:00`;
}
function dayEndLocalNoZ(ymd: string) {
  return `${ymd}T23:59:59.999`;
}

// diferença em dias (considerando datas YMD)
function diffDays(ymdA: string, ymdB: string) {
  const a = new Date(`${ymdA}T00:00:00`);
  const b = new Date(`${ymdB}T00:00:00`);
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function ymdFromDate(dt: Date) {
  return todayYMD(dt);
}

function addDaysYMD(baseYMD: string, days: number) {
  const d = new Date(`${baseYMD}T00:00:00`);
  d.setDate(d.getDate() + days);
  return ymdFromDate(d);
}

function safeTitle(s?: string | null) {
  return (s || "").trim() || "—";
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
type NextEventKind =
  | "grupo_vencimento"
  | "grupo_sorteio"
  | "grupo_assembleia"
  | "agenda"
  | "giro"
  | "aniversario"
  | "procedimento";

type NextEvent = {
  key: string;
  kind: NextEventKind;
  dateYMD: string; // referência de ordenação
  title: string;
  desc?: string;
  action?: { label: string; onClick: () => void };
};

function flagForEvent(today: string, dateYMD: string) {
  const d = diffDays(dateYMD, today); // date - today
  if (d < 0) return { label: "Atrasado", className: "bg-red-100 border border-red-200 text-red-800" };
  if (d === 0) return { label: "Hoje", className: "bg-emerald-100 border border-emerald-200 text-emerald-800" };
  if (d <= 7) return { label: "Em breve", className: "bg-amber-100 border border-amber-200 text-amber-900" };
  return { label: "Futuro", className: "bg-slate-100 border border-slate-200 text-slate-800" };
}

/** ===================== Maximize-se (dica diária) ===================== */
type DailyTip = { dateYMD: string; text: string; source?: string };

const TIP_CACHE_KEY = "@consulmax:inicio:daily_tip_v1";

const FALLBACK_TIPS: string[] = [
  "Hoje, faça follow-up com data: ‘posso te retornar hoje às 16h ou amanhã às 10h?’ — isso mata o ‘vou ver e te aviso’.",
  "Vendas é prioridade: antes de abrir qualquer tarefa, faça 5 contatos de alto valor. O resto vem depois.",
  "Quando o cliente pedir ‘só um orçamento’, responda com pergunta: ‘pra eu te mandar certo, você quer mais economia na parcela ou mais velocidade pra contemplar?’",
  "Fechamento melhora quando você resume: ‘então seu objetivo é X, prazo Y, e você tem Z pra lance… posso te mostrar o caminho mais inteligente?’",
];

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

  const rangeToday = useMemo(() => {
    const ymd = todayYMD();
    return {
      ymd,
      br: fmtDateBRFromYMD(ymd),
      startNoZ: dayStartLocalNoZ(ymd),
      endNoZ: dayEndLocalNoZ(ymd),
    };
  }, []);

  const rangeMonth = useMemo(() => monthRangeYMD(new Date()), []);

  // KPIs
  const [kpi, setKpi] = useState({
    overdueOppCount: 0,
    overdueOppTotal: 0,

    todayEventsCount: 0,
    todayGroupsCount: 0,

    monthSalesTotal: 0,
    monthSalesMeta: 0,
    monthSalesPct: 0,

    carteiraAtivaTotal: 0,

    openStockReqCount: 0,
    vendasSemComissaoCount: 0,

    commissionsPendingCount: 0,
    commissionsPendingTotal: 0,

    giroDueCount: 0,

    proceduresNewCount: 0,
  });

  const [todayAgendaEvents, setTodayAgendaEvents] = useState<AgendaRow[]>([]);
  const [overdueOpps, setOverdueOpps] = useState<(OppRow & { lead_nome?: string; lead_tel?: string | null })[]>([]);
  const [stockReqs, setStockReqs] = useState<StockReqRow[]>([]);
  const [vendasSemComissao, setVendasSemComissao] = useState<VendaSemComissaoRow[]>([]);

  const [nextEvents, setNextEvents] = useState<NextEvent[]>([]);
  const [dailyTip, setDailyTip] = useState<DailyTip | null>(null);

  const admin = isAdmin(me);
  const glassCard = "bg-white/80 border-slate-200/70 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.08)]";

  /** ===================== Escopo ===================== */
  function resolveScope(meRow: UserRow, usersMap: Map<string, UserRow>, scopeValue: string) {
    const admin = isAdmin(meRow);

    if (!admin) {
      return { admin, scopeUserId: meRow.id, scopeAuthId: meRow.auth_user_id, label: meRow.nome };
    }
    if (scopeValue === ALL) {
      return { admin, scopeUserId: ALL, scopeAuthId: ALL, label: "Todos (Admin)" };
    }
    const u = usersMap.get(scopeValue);
    if (!u) return { admin, scopeUserId: scopeValue, scopeAuthId: ALL, label: "Vendedor" };
    return { admin, scopeUserId: u.id, scopeAuthId: u.auth_user_id, label: u.nome };
  }

  /** ===================== Procedimentos: notificação ===================== */
  function proceduresSeenKey(authId: string) {
    return `@consulmax:procedimentos:last_seen:${authId}`;
  }

  async function loadProceduresNewCount(scopeAuthId: string) {
    // notificação é por usuário logado (auth id), não por vendedor filtrado
    const { data: auth } = await supabase.auth.getUser();
    const authId = auth.user?.id;
    if (!authId) return 0;

    const lastSeen = localStorage.getItem(proceduresSeenKey(authId));
    // se nunca viu, considera “a partir de 7 dias atrás” pra não explodir número
    const baseline = lastSeen || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // tenta status (se existir) mas não depende
    let q = supabase
      .from("kb_procedures")
      .select("id,created_at,updated_at,status,title")
      .or("status.eq.active,status.eq.review,status.is.null")
      .gt("created_at", baseline)
      .order("created_at", { ascending: false })
      .limit(50);

    // (opcional) se você quiser no futuro filtrar por área/canal etc, faz aqui

    const { data, error } = await q;
    if (error) {
      // se a tabela/campos não existirem por algum motivo, não derruba a home
      console.warn("[Inicio] kb_procedures notify error:", error);
      return 0;
    }
    return (data || []).length;
  }

  async function markProceduresAsSeen() {
    const { data: auth } = await supabase.auth.getUser();
    const authId = auth.user?.id;
    if (!authId) return;
    localStorage.setItem(proceduresSeenKey(authId), new Date().toISOString());
    setKpi((p) => ({ ...p, proceduresNewCount: 0 }));
  }

  /** ===================== Dica diária ===================== */
  async function loadDailyTip() {
    const today = rangeToday.ymd;

    // cache
    try {
      const raw = localStorage.getItem(TIP_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DailyTip;
        if (parsed?.dateYMD === today && parsed?.text) {
          setDailyTip(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }

    // 1) Ideal: seu backend buscar “na internet” e devolver pronto
    try {
      const r = await fetch("/api/daily-sales-insight", { method: "GET" });
      if (r.ok) {
        const j = (await r.json()) as { text?: string; source?: string };
        const text = (j?.text || "").trim();
        if (text) {
          const tip: DailyTip = { dateYMD: today, text, source: j?.source || "internet" };
          setDailyTip(tip);
          localStorage.setItem(TIP_CACHE_KEY, JSON.stringify(tip));
          return;
        }
      }
    } catch {
      // ignore
    }

    // 2) Fallback: API pública (pode falhar por CORS / rate-limit)
    try {
      const r = await fetch("https://zenquotes.io/api/today", { method: "GET" });
      if (r.ok) {
        const arr = (await r.json()) as any[];
        const q = arr?.[0]?.q ? String(arr[0].q) : "";
        if (q) {
          const text = `Insight de vendas do dia: ${q}`;
          const tip: DailyTip = { dateYMD: today, text, source: "zenquotes" };
          setDailyTip(tip);
          localStorage.setItem(TIP_CACHE_KEY, JSON.stringify(tip));
          return;
        }
      }
    } catch {
      // ignore
    }

    // 3) Fallback final: local (nunca quebra)
    const idx = Math.abs(today.split("-").join("").split("").reduce((a, c) => a + (c.charCodeAt(0) || 0), 0)) % FALLBACK_TIPS.length;
    const tip: DailyTip = { dateYMD: today, text: FALLBACK_TIPS[idx], source: "local" };
    setDailyTip(tip);
    localStorage.setItem(TIP_CACHE_KEY, JSON.stringify(tip));
  }

  /** ===================== Loader principal ===================== */
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

    return { meRow: meRow as UserRow, usersRows: (usersRows || []) as UserRow[] };
  }

  async function loadDashboard(scopeUserId: string, scopeAuthId: string, admin: boolean) {
    const today = rangeToday.ymd;
    const { startYMD, endYMD, year, month } = rangeMonth;

    // ===== Oportunidades atrasadas (auth_user_id) =====
    let oppQ = supabase
      .from("opportunities")
      .select("id,valor_credito,stage,estagio,expected_close_at,vendedor_id,lead_id")
      .lt("expected_close_at", today)
      .order("expected_close_at", { ascending: true })
      .limit(12);

    if (!admin) oppQ = oppQ.eq("vendedor_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) oppQ = oppQ.eq("vendedor_id", scopeAuthId);

    const { data: oppRowsRaw, error: oppErr } = await oppQ;
    if (oppErr) throw oppErr;

    const oppRows = (oppRowsRaw || []).filter((o: any) => !stageIsClosed(o?.stage, o?.estagio));
    const overdueOppCount = oppRows.length;
    const overdueOppTotal = oppRows.reduce((acc: number, r: any) => acc + (Number(r.valor_credito || 0) || 0), 0);

    // Enriquecer leads
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

    // ===== Agenda “do dia” (sem deslize de data) =====
    let agQ = supabase
      .from("v_agenda_eventos_enriquecida")
      .select("id,tipo,titulo,inicio_at,fim_at,user_id,cliente_nome,lead_nome,telefone,videocall_url")
      .gte("inicio_at", rangeToday.startNoZ)
      .lte("inicio_at", rangeToday.endNoZ)
      .order("inicio_at", { ascending: true })
      .limit(50);

    if (!admin) agQ = agQ.eq("user_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) agQ = agQ.eq("user_id", scopeAuthId);

    const { data: agRows, error: agErr } = await agQ;
    if (agErr) throw agErr;

    // ===== Eventos de grupos HOJE (pra KPI) =====
    const orExpr = `prox_vencimento.eq.${today},prox_sorteio.eq.${today},prox_assembleia.eq.${today}`;
    const { data: gTodayRows, error: gErr } = await supabase.from("groups").select("id").or(orExpr).limit(200);
    if (gErr) throw gErr;
    const todayGroupsCount = (gTodayRows || []).length;

    // ===== Vendas do mês (auth_user_id) =====
    let salesQ = supabase.from("vendas").select("valor_venda,vendedor_id,data_venda").gte("data_venda", startYMD).lt("data_venda", endYMD);
    if (!admin) salesQ = salesQ.eq("vendedor_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) salesQ = salesQ.eq("vendedor_id", scopeAuthId);

    const { data: salesRows, error: salesErr } = await salesQ;
    if (salesErr) throw salesErr;
    const monthSalesTotal = (salesRows || []).reduce((acc: number, r: any) => acc + (Number(r.valor_venda || 0) || 0), 0);

    // ===== Meta do mês (users.id) =====
    const field = metaFieldForMonth(month);
    let metaQ = supabase.from("metas_vendedores").select(`vendedor_id,ano,${field}`).eq("ano", year);
    if (!admin) metaQ = metaQ.eq("vendedor_id", scopeUserId);
    if (admin && scopeUserId !== ALL) metaQ = metaQ.eq("vendedor_id", scopeUserId);

    const { data: metaRows, error: metaErr } = await metaQ;
    if (metaErr) throw metaErr;

    const monthSalesMeta = (metaRows || []).reduce((acc: number, r: any) => acc + (Number(r?.[field] || 0) || 0), 0);
    const monthSalesPct = monthSalesMeta > 0 ? Math.min(100, Math.max(0, (monthSalesTotal / monthSalesMeta) * 100)) : 0;

    // ===== Carteira ativa (codigo = 00) =====
    let cartQ = supabase.from("vendas").select("valor_venda,vendedor_id,codigo").eq("codigo", "00");
    if (!admin) cartQ = cartQ.eq("vendedor_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) cartQ = cartQ.eq("vendedor_id", scopeAuthId);

    const { data: cartRows, error: cartErr } = await cartQ;
    if (cartErr) throw cartErr;
    const carteiraAtivaTotal = (cartRows || []).reduce((acc: number, r: any) => acc + (Number(r.valor_venda || 0) || 0), 0);

    // ===== Reservas abertas (users.id) =====
    let reqQ = supabase
      .from("stock_reservation_requests")
      .select("id,cota_id,vendor_id,vendor_pct,status,created_at")
      .eq("status", "aberta")
      .order("created_at", { ascending: false })
      .limit(10);

    if (!admin) reqQ = reqQ.eq("vendor_id", scopeUserId);
    if (admin && scopeUserId !== ALL) reqQ = reqQ.eq("vendor_id", scopeUserId);

    const { data: reqRows, error: reqErr } = await reqQ;
    if (reqErr) throw reqErr;
    const openStockReqCount = (reqRows || []).length;

    // ===== Vendas sem comissão (auth_user_id) =====
    let vscQ = supabase
      .from("v_vendas_sem_comissao")
      .select("id,data_venda,vendedor_id,vendedor_nome,segmento,tabela,administradora,numero_proposta,credito")
      .order("data_venda", { ascending: false })
      .limit(10);

    if (!admin) vscQ = vscQ.eq("vendedor_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) vscQ = vscQ.eq("vendedor_id", scopeAuthId);

    const { data: vscRows, error: vscErr } = await vscQ;
    if (vscErr) throw vscErr;
    const vendasSemComissaoCount = (vscRows || []).length;

    // ===== Comissões pendentes (users.id) =====
    let comQ = supabase
      .from("commissions")
      .select("id,vendedor_id,valor_total,status,created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (!admin) comQ = comQ.eq("vendedor_id", scopeUserId);
    if (admin && scopeUserId !== ALL) comQ = comQ.eq("vendedor_id", scopeUserId);

    const { data: comRows, error: comErr } = await comQ;
    if (comErr) throw comErr;

    const pend = (comRows || []).filter((c: CommissionRow) => {
      const st = (c.status || "").toLowerCase();
      return st && st !== "pago" && st !== "estorno";
    });
    const commissionsPendingCount = pend.length;
    const commissionsPendingTotal = pend.reduce((acc: number, r: any) => acc + (Number(r.valor_total || 0) || 0), 0);

    // ===== Giro pendente (count) =====
    let giroDueCount = 0;

    if (admin && scopeAuthId === ALL) {
      const { data: giroAll, error: giroAllErr } = await supabase.from("v_giro_due_count").select("owner_auth_id,due_count");
      if (giroAllErr) throw giroAllErr;
      giroDueCount = (giroAll || []).reduce((acc: number, r: any) => acc + (Number(r?.due_count || 0) || 0), 0);
    } else {
      const { data: giroRow, error: giroErr } = await supabase
        .from("v_giro_due_count")
        .select("owner_auth_id,due_count")
        .eq("owner_auth_id", scopeAuthId)
        .maybeSingle();
      if (giroErr) throw giroErr;
      giroDueCount = (giroRow as GiroDueRow | null)?.due_count || 0;
    }

    // ===== Procedimentos novos =====
    const proceduresNewCount = await loadProceduresNewCount(scopeAuthId);

    // ===== Próximos Eventos (agregado) =====
    const nextDays = 14;
    const endNext = addDaysYMD(today, nextDays);

    // (A) Groups: eventos entre ontem..+14
    const groupsOr = [
      `prox_vencimento.gte.${addDaysYMD(today, -1)}`,
      `prox_vencimento.lte.${endNext}`,
      `prox_sorteio.gte.${addDaysYMD(today, -1)}`,
      `prox_sorteio.lte.${endNext}`,
      `prox_assembleia.gte.${addDaysYMD(today, -1)}`,
      `prox_assembleia.lte.${endNext}`,
    ].join(",");

    const { data: groupRowsRaw, error: grpErr } = await supabase
      .from("groups")
      .select("id,codigo,administradora,segmento,prox_vencimento,prox_sorteio,prox_assembleia")
      .or(groupsOr)
      .limit(400);

    if (grpErr) {
      console.warn("[Inicio] groups next-events error:", grpErr);
    }

    const groupRows = (groupRowsRaw || []) as GroupRow[];

    // (B) Agenda próximos dias (sem deslize)
    let agNextQ = supabase
      .from("v_agenda_eventos_enriquecida")
      .select("id,tipo,titulo,inicio_at,fim_at,user_id,cliente_nome,lead_nome,telefone,videocall_url")
      .gte("inicio_at", dayStartLocalNoZ(addDaysYMD(today, -1)))
      .lte("inicio_at", dayEndLocalNoZ(endNext))
      .order("inicio_at", { ascending: true })
      .limit(120);

    if (!admin) agNextQ = agNextQ.eq("user_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) agNextQ = agNextQ.eq("user_id", scopeAuthId);

    const { data: agNextRows, error: agNextErr } = await agNextQ;
    if (agNextErr) {
      console.warn("[Inicio] agenda next-events error:", agNextErr);
    }

    // (C) Giro lista (tentativa): se você tiver uma view listando os clientes
    // Se não existir, só mostramos “Giro pendente: X”
    let giroList: Array<{ id: string; nome: string; telefone?: string | null; due_date?: string | null }> = [];
    try {
      let giroListQ = supabase
        .from("v_giro_due_list" as any)
        .select("id,nome,telefone,due_date,owner_auth_id")
        .limit(20);

      if (!admin) giroListQ = giroListQ.eq("owner_auth_id", scopeAuthId);
      if (admin && scopeAuthId !== ALL) giroListQ = giroListQ.eq("owner_auth_id", scopeAuthId);

      const { data: giroListRows, error: giroListErr } = await giroListQ;
      if (giroListErr) throw giroListErr;

      giroList = (giroListRows || []) as any;
    } catch (e) {
      // ok: não quebra
    }

    // (D) Aniversários (próximos 14 dias) — busca “muitos” e filtra no front (mantém simples e estável)
    let birthdayCandidates: ClienteRow[] = [];
    try {
      const { data: clRows, error: clErr } = await supabase
        .from("clientes")
        .select("id,nome,telefone,data_nascimento")
        .not("data_nascimento", "is", null)
        .limit(2000);
      if (clErr) throw clErr;
      birthdayCandidates = (clRows || []) as ClienteRow[];
    } catch (e) {
      // ignore
    }

    const todayMMDD = today.slice(5);
    const mmddInRange = (mmdd: string) => {
      // checa próximos 14 dias pelo calendário real
      for (let i = 0; i <= nextDays; i++) {
        const ymd = addDaysYMD(today, i);
        if (ymd.slice(5) === mmdd) return ymd;
      }
      // e “atrasados” de ontem
      const ymdPrev = addDaysYMD(today, -1);
      if (ymdPrev.slice(5) === mmdd) return ymdPrev;
      return null;
    };

    const birthdayEvents: NextEvent[] = birthdayCandidates
      .map((c) => {
        const dn = (c.data_nascimento || "").slice(0, 10);
        if (!dn) return null;
        const mmdd = dn.slice(5);
        const dateYMD = mmddInRange(mmdd);
        if (!dateYMD) return null;
        return {
          key: `bday:${c.id}:${dateYMD}`,
          kind: "aniversario",
          dateYMD,
          title: `Aniversário: ${safeTitle(c.nome)}`,
          desc: c.telefone ? `Telefone: ${c.telefone}` : "Sem telefone",
          action: { label: "Abrir Clientes", onClick: () => nav("/clientes") },
        } as NextEvent;
      })
      .filter(Boolean) as NextEvent[];

    const groupEvents: NextEvent[] = [];
    for (const g of groupRows) {
      const base = `${g.administradora || "Admin"} • Grupo ${g.codigo || g.id.slice(0, 6)}`;
      if (g.prox_vencimento) {
        groupEvents.push({
          key: `g:${g.id}:venc:${g.prox_vencimento}`,
          kind: "grupo_vencimento",
          dateYMD: g.prox_vencimento,
          title: `Vencimento • ${base}`,
          desc: `Próx. vencimento do grupo`,
          action: { label: "Abrir Gestão", onClick: () => nav("/gestao-de-grupos") },
        });
      }
      if (g.prox_sorteio) {
        groupEvents.push({
          key: `g:${g.id}:sort:${g.prox_sorteio}`,
          kind: "grupo_sorteio",
          dateYMD: g.prox_sorteio,
          title: `Sorteio • ${base}`,
          desc: `Próx. sorteio do grupo`,
          action: { label: "Abrir Gestão", onClick: () => nav("/gestao-de-grupos") },
        });
      }
      if (g.prox_assembleia) {
        groupEvents.push({
          key: `g:${g.id}:ass:${g.prox_assembleia}`,
          kind: "grupo_assembleia",
          dateYMD: g.prox_assembleia,
          title: `Assembleia • ${base}`,
          desc: `Próx. assembleia do grupo`,
          action: { label: "Abrir Gestão", onClick: () => nav("/gestao-de-grupos") },
        });
      }
    }

    const agendaEvents: NextEvent[] = (agNextRows || []).map((e: any) => {
      const ymd = String(e.inicio_at || "").slice(0, 10) || today;
      const who = e.cliente_nome || e.lead_nome || "—";
      return {
        key: `ag:${e.id}`,
        kind: "agenda",
        dateYMD: ymd,
        title: `Agenda • ${safeTitle(e.titulo)}`,
        desc: `${who} • ${fmtDT(e.inicio_at)}`,
        action: { label: "Abrir Agenda", onClick: () => nav("/agenda") },
      };
    });

    const giroEvents: NextEvent[] =
      giroList.length > 0
        ? giroList.map((g) => ({
            key: `giro:${g.id}:${g.due_date || today}`,
            kind: "giro",
            dateYMD: (g.due_date || today).slice(0, 10),
            title: `Giro de Carteira • ${safeTitle(g.nome)}`,
            desc: g.telefone ? `Telefone: ${g.telefone}` : "Cliente sem telefone",
            action: { label: "Abrir Giro", onClick: () => nav("/giro-de-carteira") },
          }))
        : giroDueCount > 0
        ? [
            {
              key: `giro:count:${today}`,
              kind: "giro",
              dateYMD: today,
              title: `Giro de Carteira pendente: ${giroDueCount}`,
              desc: "Clientes com giro a ser realizado",
              action: { label: "Abrir Giro", onClick: () => nav("/giro-de-carteira") },
            },
          ]
        : [];

    const proceduresEvents: NextEvent[] =
      proceduresNewCount > 0
        ? [
            {
              key: `proc:new:${today}`,
              kind: "procedimento",
              dateYMD: today,
              title: `Procedimentos novos: ${proceduresNewCount}`,
              desc: "Atualizações no módulo de Procedimentos",
              action: {
                label: "Ver Procedimentos",
                onClick: async () => {
                  await markProceduresAsSeen();
                  nav("/procedimentos");
                },
              },
            },
          ]
        : [];

    const merged = [...groupEvents, ...agendaEvents, ...giroEvents, ...birthdayEvents, ...proceduresEvents]
      .filter((ev) => !!ev?.dateYMD)
      .sort((a, b) => {
        // ordena por data e depois por título
        if (a.dateYMD !== b.dateYMD) return a.dateYMD.localeCompare(b.dateYMD);
        return a.title.localeCompare(b.title);
      })
      .slice(0, 30);

    // ===== Set states =====
    setOverdueOpps(overdueOppsEnriched);
    setTodayAgendaEvents((agRows || []) as any);
    setStockReqs(reqRows || []);
    setVendasSemComissao((vscRows || []) as any);

    setNextEvents(merged);

    setKpi({
      overdueOppCount,
      overdueOppTotal,

      todayEventsCount: (agRows || []).length,
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

      proceduresNewCount,
    });

    // dica do dia (não bloqueia o painel)
    loadDailyTip().catch(() => null);
  }

  async function reload(hard = false) {
    if (!me) return;

    const scope = resolveScope(me, usersById, vendorScope);
    if (hard) setRefreshing(true);
    setErrMsg(null);

    try {
      await loadDashboard(scope.scopeUserId, scope.scopeAuthId, scope.admin);
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
        const { meRow, usersRows } = await loadMeAndUsers();
        if (!alive) return;

        const admin = isAdmin(meRow);
        const initialScope = admin ? ALL : meRow.id;

        setMe(meRow);
        setUsers(usersRows);
        setVendorScope(initialScope);

        const usersMap = new Map(usersRows.map((u) => [u.id, u]));
        const scope = resolveScope(meRow, usersMap, initialScope);

        await loadDashboard(scope.scopeUserId, scope.scopeAuthId, admin);
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
    if (!isAdmin(me)) return;
    if (vendorScope !== ALL && !usersById.has(vendorScope)) return;
    reload(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorScope]);

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
              <pre className="whitespace-pre-wrap break-words rounded-md bg-white border border-slate-200 p-3 text-xs text-slate-800">
                {errMsg}
              </pre>
            </CardContent>
          </Card>
        </div>
      ) : null}

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
              <Calendar className="h-4 w-4" /> Agenda de Hoje
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

              {/* ✅ renomeado */}
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/planejamento")}>
                Playbook de Vendas <ArrowRight className="h-4 w-4" />
              </Button>

              {/* ✅ novo */}
              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/links")}>
                Links Úteis <LinkIcon className="h-4 w-4" />
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

            {/* ✅ Procedimentos novos */}
            <div className="flex items-center justify-between">
              <div className="text-slate-700 flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Procedimentos novos
              </div>
              <Badge className="bg-slate-100 border border-slate-200 text-slate-800">{kpi.proceduresNewCount}</Badge>
            </div>

            <div className="pt-1">
              <Button
                size="sm"
                className="w-full bg-white hover:bg-slate-50 text-slate-900 border border-slate-200"
                onClick={async () => {
                  await markProceduresAsSeen();
                  nav("/procedimentos");
                }}
              >
                Ver Procedimentos <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
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
                      {o.lead_nome || "Lead"} <span className="text-slate-500">• {(o.estagio || o.stage || "—") as any}</span>
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

        {/* ✅ Renomeado e refeito: Próximos Eventos */}
        <Card className={glassCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Próximos Eventos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {nextEvents.length === 0 ? (
              <div className="text-slate-500 text-sm">Sem eventos próximos.</div>
            ) : (
              nextEvents.map((e) => {
                const flag = flagForEvent(rangeToday.ymd, e.dateYMD);
                return (
                  <div key={e.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{e.title}</div>
                        <div className="text-xs text-slate-500 truncate">
                          {fmtDateBRFromYMD(e.dateYMD)} • {e.desc || "—"}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${flag.className}`}>
                        {flag.label}
                      </span>
                    </div>

                    {e.action ? (
                      <div className="mt-2">
                        <Button
                          size="sm"
                          className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200"
                          onClick={e.action.onClick}
                        >
                          {e.action.label} <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })
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
              {dailyTip?.text ? (
                <>
                  <span className="font-semibold">Dica do dia:</span> {dailyTip.text}
                  {dailyTip.source ? <span className="text-xs text-slate-500"> • fonte: {dailyTip.source}</span> : null}
                </>
              ) : (
                <>
                  Hoje, foca em 1 coisa: <span className="font-semibold">follow-up com data</span>. Quem deixa “aberto” vira “vou ver e te aviso”.
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200"
                onClick={() => {
                  // força atualizar dica
                  localStorage.removeItem(TIP_CACHE_KEY);
                  loadDailyTip().catch(() => null);
                }}
              >
                Atualizar dica <RefreshCcw className="h-4 w-4 ml-2" />
              </Button>

              <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200" onClick={() => nav("/planejamento")}>
                Abrir Playbook <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* mantidos (dados carregados) */}
      {/* stockReqs: {stockReqs.length} | vendasSemComissao: {vendasSemComissao.length} */}
      {/* todayAgendaEvents: {todayAgendaEvents.length} */}
    </div>
  );
}
