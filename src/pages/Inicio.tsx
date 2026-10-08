// src/pages/Inicio.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLocation, useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  Bell,
  Gift,
  Ticket,
  Trophy,
  HeartPulse,
  MousePointerClick,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";

/** ===================== Tipos ===================== */
type UserRow = { id: string; auth_user_id: string; nome: string; role?: string | null; user_role?: string | null; is_active?: boolean | null; unit_id?: string | null; hierarchy_level?: string | null };
type UnitRow = { id: string; nome: string; tipo: string; is_active?: boolean | null };
type AgendaRow = { id: string; tipo: string; titulo: string; inicio_at: string; fim_at: string; user_id: string | null; videocall_url?: string | null; cliente?: { id: string; nome?: string | null; telefone?: string | null } | null; lead?: { id: string; nome?: string | null; telefone?: string | null } | null };
type OppRow = { id: string; segmento: string | null; valor_credito: number | null; estagio: string | null; score: number | null; expected_close_at: string | null; fechamento_previsto_em?: string | null; vendedor_id: string; lead_id: string };
type LeadRow = { id: string; nome: string; telefone?: string | null };
type GroupRow = { id: string; administradora: string; segmento: string; codigo: string; participantes?: number | null; prox_vencimento: string | null; prox_sorteio: string | null; prox_assembleia: string | null };
type ClienteRow = { id: string; nome: string; data_nascimento: string | null; telefone?: string | null };
type GiroDueRow = { owner_auth_id: string; due_count: number };
type GiroItemRow = { id?: string | null; task_id?: string | null; giro_task_id?: string | null; lead_id?: string | null; cliente_id?: string | null; cliente_nome?: string | null; lead_nome?: string | null; nome?: string | null; telefone?: string | null; carteira_total?: number | null; carteira_ativa_total?: number | null; valor_carteira_ativa?: number | null; owner_auth_id?: string | null };
type KBProcRow = { id: string; title?: string | null; status?: string | null; created_at?: string | null; updated_at?: string | null };
type CommissionRow = { id: string; venda_id: string; vendedor_id: string; valor_total: number | null; base_calculo?: number | null; percent_aplicado?: number | null; status: string | null; data_venda?: string | null };
type CommissionFlowRow = { id?: string; commission_id: string; mes?: number | null; percentual?: number | null; valor_previsto: number | null; valor_pago_vendedor: number | null; data_pagamento_vendedor: string | null };
type CommissionBatchRow = { id: string; venda_id: string; vendedor_id: string; business_unit_id?: string | null; status?: string | null; legacy?: boolean | null };
type CommissionEntryRow = { id: string; batch_id: string; recipient_user_id?: string | null; recipient_unit_id?: string | null; business_unit_id?: string | null; status?: string | null };
type CommissionEntryFlowRow = { id: string; entry_id: string; batch_id: string; valor_previsto: number | null; valor_pago: number | null; data_pagamento: string | null; status?: string | null };
type VendaMini = { id: string; vendedor_id: string; valor_venda?: number | null; data_venda?: string | null; encarteirada_em?: string | null; codigo?: string | null; cancelada_em?: string | null; reativada_em?: string | null; segmento?: string | null; produto?: string | null; tabela?: string | null; administradora?: string | null; grupo?: string | null; cota?: string | null; status?: string | null; contemplada?: boolean | null; lead_id?: string | null; cliente_lead_id?: string | null; inad?: boolean | null; inad_em?: string | null; inad_revertida_em?: string | null };
type MeuDiaAlert = { id: string; priority: number; title: string; desc?: string | null; icon?: "bell" | "gift" | "ticket" | "trophy" | "alert"; action?: { label: string; to?: string; href?: string } };
type DateFlag = "Hoje" | "Amanhã" | "Esta Semana";
type NextEventItem = { id: string; whenSort: number; whenLabel: string; flag: DateFlag; title: string; desc?: string | null; action?: { label: string; to?: string; href?: string } };
type CarteiraHealth = {
  friendlyCount: number;
  friendlyValue: number;
  reparcelCount: number;
  reparcelValue: number;
  criticalCount: number;
  criticalValue: number;
  riskCount: number;
  regularizedMonth: number;
  recoveryCount: number;
  recoveredMonth: number;
  maxRecoveredMonth: number;
  highIntent7d: number;
  emailsSentMonth: number;
};
type CarteiraHealthKey = "friendly" | "reparcel" | "critical" | "risk" | "regularized" | "recovery" | "highIntent" | "communications";
type CarteiraHealthItem = {
  vendaId: string;
  leadId?: string | null;
  cliente: string;
  telefone?: string | null;
  grupo?: string | null;
  cota?: string | null;
  administradora?: string | null;
  segmento?: string | null;
  vendedorNome?: string | null;
  dias?: number | null;
  statusLabel?: string | null;
  ruler?: string | null;
  stage?: string | null;
  milestone?: number | null;
  ctaType?: string | null;
  sentAt?: string | null;
  clickedAt?: string | null;
  clickCount?: number;
};
type CarteiraHealthLists = Record<CarteiraHealthKey, CarteiraHealthItem[]>;
type DashboardScope = {
  mode: "matrix" | "branch" | "seller";
  isGlobal: boolean;
  currentUserId: string;
  currentUnitId: string | null;
  selectedUserId: string | null;
  profileIds: string[];
  authIds: string[];
  vendedorIds: string[];
};

const ALL = "__all__";
const PV_OFFSET_MIN = -4 * 60;
const EMPTY_CARTEIRA_HEALTH: CarteiraHealth = {
  friendlyCount: 0,
  friendlyValue: 0,
  reparcelCount: 0,
  reparcelValue: 0,
  criticalCount: 0,
  criticalValue: 0,
  riskCount: 0,
  regularizedMonth: 0,
  recoveryCount: 0,
  recoveredMonth: 0,
  maxRecoveredMonth: 0,
  highIntent7d: 0,
  emailsSentMonth: 0,
};
const EMPTY_CARTEIRA_HEALTH_LISTS: CarteiraHealthLists = {
  friendly: [],
  reparcel: [],
  critical: [],
  risk: [],
  regularized: [],
  recovery: [],
  highIntent: [],
  communications: [],
};
const CARTEIRA_HEALTH_META: Record<CarteiraHealthKey, { title: string; description: string }> = {
  friendly: { title: "Inadimplência · 1–30 dias", description: "Clientes na etapa amigável da régua de regularização." },
  reparcel: { title: "Inadimplência · 31–60 dias", description: "Clientes para os quais o MAX passa a trabalhar a possibilidade de reparcelamento." },
  critical: { title: "Inadimplência · +60 dias", description: "Clientes em faixa crítica de inadimplência." },
  risk: { title: "Risco de cancelamento · D+80", description: "Clientes próximos da referência operacional de cancelamento em D+90." },
  regularized: { title: "Regularizados no mês", description: "Clientes que saíram da inadimplência durante o mês atual." },
  recovery: { title: "Cancelados em recuperação", description: "Clientes atualmente dentro da régua pós-cancelamento." },
  highIntent: { title: "Alta intenção · últimos 7 dias", description: "Clientes que clicaram em algum CTA dos e-mails enviados pelo MAX." },
  communications: { title: "Comunicações MAX · mês", description: "E-mails enviados pelas réguas de inadimplência e recuperação no mês atual." },
};

/** ===================== Helpers ===================== */
function pad2(n: number) { return String(n).padStart(2, "0"); }
function ymdFromDateInOffset(d: Date, offsetMin: number) { const local = new Date(d.getTime() + offsetMin * 60 * 1000); return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}`; }
function rangeISOForDayInOffset(ymd: string, offsetMin: number) { const [Y, M, D] = ymd.split("-").map(Number); const startUtc = new Date(Date.UTC(Y, M - 1, D, 0, 0, 0, 0) - offsetMin * 60 * 1000); const endUtc = new Date(Date.UTC(Y, M - 1, D, 23, 59, 59, 999) - offsetMin * 60 * 1000); return { startISO: startUtc.toISOString(), endISO: endUtc.toISOString() }; }
function addDaysYMD(ymd: string, days: number) { const [Y, M, D] = ymd.split("-").map(Number); const dt = new Date(Date.UTC(Y, M - 1, D, 12, 0, 0) + days * 24 * 60 * 60 * 1000); return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`; }
function toYMD(d: string | Date | null | undefined): string | null { if (!d) return null; const s = typeof d === "string" ? d.trim() : d.toISOString(); const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (br) return `${br[3]}-${br[2]}-${br[1]}`; const isoHead = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (isoHead) return `${isoHead[1]}-${isoHead[2]}-${isoHead[3]}`; const dt = new Date(s); if (Number.isNaN(dt.getTime())) return null; return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`; }
function groupAssemblyYMD(dateRaw?: string | null) { return toYMD(dateRaw); }
function fmtDateBRFromYMD(ymd?: string | null) { const d10 = toYMD(ymd) || ""; const [y, m, d] = d10.split("-"); if (!y || !m || !d) return d10 || "—"; return `${d}/${m}/${y}`; }
function monthRangeYMDFromOffset(now: Date, offsetMin: number) { const local = new Date(now.getTime() + offsetMin * 60 * 1000); const y = local.getUTCFullYear(); const m = local.getUTCMonth(); const f = (dt: Date) => `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`; return { startYMD: f(new Date(Date.UTC(y, m, 1, 12, 0, 0))), endYMD: f(new Date(Date.UTC(y, m + 1, 1, 12, 0, 0))), year: y, month: m + 1 }; }
function fmtBRL(v: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0)); }
function fmtDTForOffset(iso: string, offsetMin: number) { const local = new Date(new Date(iso).getTime() + offsetMin * 60 * 1000); return `${pad2(local.getUTCDate())}/${pad2(local.getUTCMonth() + 1)} ${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`; }
function whatsappHref(raw?: string | null) { let digits = String(raw || "").replace(/\D/g, ""); if (!digits) return ""; if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) digits = `55${digits}`; return digits.length >= 12 ? `https://wa.me/${digits}` : ""; }
function ctaLabel(raw?: string | null) { const key = String(raw || "").toLowerCase(); if (key === "reparcelamento") return "Reparcelamento"; if (key === "regularizar") return "Regularização"; if (key === "retomar_projeto") return "Retomar projeto"; if (key === "ajuda") return "Pediu ajuda"; return raw || "—"; }
function isMatrixUser(u?: UserRow | null, unit?: UnitRow | null) { const level = normalizeText(u?.hierarchy_level); return Boolean(u && (level === "matriz" || ((u.role || u.user_role || "").toLowerCase() === "admin" && normalizeText(unit?.tipo) === "matriz"))); }
function isBranchManagerUser(u?: UserRow | null, unit?: UnitRow | null) { return Boolean(u && !isMatrixUser(u, unit) && normalizeText(u.hierarchy_level) === "gestor_filial"); }
function buildDashboardScope(me: UserRow, users: UserRow[], units: UnitRow[], vendorScope: string): DashboardScope {
  const unit = units.find((u) => u.id === me.unit_id) || null;
  const matrix = isMatrixUser(me, unit);
  const branch = isBranchManagerUser(me, unit);
  const allowed = matrix ? users : branch ? users.filter((u) => u.unit_id === me.unit_id) : users.filter((u) => u.id === me.id);
  const selected = vendorScope !== ALL ? allowed.find((u) => u.id === vendorScope) || null : null;
  const scoped = selected ? [selected] : allowed;
  const profileIds = Array.from(new Set(scoped.map((u) => u.id).filter(Boolean)));
  const authIds = Array.from(new Set(scoped.map((u) => u.auth_user_id).filter(Boolean)));
  return {
    mode: matrix ? "matrix" : branch ? "branch" : "seller",
    isGlobal: matrix && vendorScope === ALL,
    currentUserId: me.id,
    currentUnitId: me.unit_id || null,
    selectedUserId: selected?.id || null,
    profileIds,
    authIds,
    vendedorIds: Array.from(new Set([...profileIds, ...authIds])),
  };
}
function humanErr(e: any) { if (!e) return "Erro desconhecido."; if (typeof e === "string") return e; return String(e?.message || e?.error_description || e?.details || e?.hint || JSON.stringify(e)); }
function metaFieldForMonth(month: number) { return `m${String(month).padStart(2, "0")}` as any; }
function daysDiffYMD(a: string, b: string) { if (!a || !b) return 0; const [ay, am, ad] = a.slice(0, 10).split("-").map(Number); const [by, bm, bd] = b.slice(0, 10).split("-").map(Number); return Math.round((Date.UTC(ay, am - 1, ad, 12) - Date.UTC(by, bm - 1, bd, 12)) / 86400000); }
function weekdayYMD(ymd: string) { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay(); }
function isBillingRuleDay(ymd: string) { const w = weekdayYMD(ymd); return w === 2 || w === 4; }
function normalizeText(v?: string | null) { return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(); }
function isOpenOpportunityStage(v?: string | null) { const s = normalizeText(v); return ["novo", "novo lead", "qualificando", "qualificacao", "qualificando/diagnostico", "reuniao agendada", "proposta", "negociacao", "proposta apresentada/negociacao", "fechamento programado/aguardando documentos"].includes(s); }
function stripAccents(s: string) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function normalizeAdmin(raw?: string | null): string { const s = stripAccents(String(raw ?? "")).toLowerCase(); const cleaned = s.replace(/consorcios?|consorcio|holding|sa|s\/a|s\.a\.?/g, "").replace(/[^\w]/g, "").trim(); if (cleaned.includes("embracon")) return "Embracon"; if (cleaned.includes("hs")) return "HS"; if (cleaned.includes("maggi")) return "Maggi"; return (raw ?? "").toString().trim(); }
function normalizeGroupDigits(g?: string | number | null): string { const s = String(g ?? "").trim(); const first = s.split(/[\/\-\s]/)[0] || s; const m = first.match(/\d+/); if (m) return m[0]; return s.replace(/\D/g, ""); }
function groupKey(adm?: string | null, grp?: string | number | null) { return `${normalizeAdmin(adm)}::${normalizeGroupDigits(grp)}`; }
function isVendaCancelada(v?: { codigo?: string | null; cancelada_em?: string | null }) { if (!v) return false; if (v.codigo === "00") return false; if (v.codigo && v.codigo !== "00") return true; if (v.cancelada_em) return true; return false; }
function totalCommissionGross(c: CommissionRow) { return Number(c.valor_total ?? ((Number(c.base_calculo) || 0) * (Number(c.percent_aplicado) || 0))) || 0; }
function paidCommissionGross(flow: CommissionFlowRow[]) { return flow.reduce((acc, f) => acc + (Number(f.valor_pago_vendedor) || 0), 0); }
function pendingCommissionGross(c: CommissionRow, flow: CommissionFlowRow[]) { return Math.max(0, totalCommissionGross(c) - paidCommissionGross(flow)); }
function groupListLabel(groups: Array<{ codigo?: string | null }>, max = 6) { const codes = Array.from(new Set(groups.map((g) => String(g.codigo || "").trim()).filter(Boolean))); if (!codes.length) return "—"; const head = codes.slice(0, max).join(", "); return codes.length > max ? `${head} +${codes.length - max}` : head; }
function hasDraw(drawsByDate: Map<string, boolean>, dateRaw?: string | null) { const d = toYMD(dateRaw); return Boolean(d && drawsByDate.get(d)); }

/** ===================== UI Aux ===================== */
function Donut({ pct, size = 132, stroke = 12, centerTop, centerBottom }: { pct: number; size?: number; stroke?: number; centerTop: React.ReactNode; centerBottom?: React.ReactNode }) { const clamped = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0; const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const dash = (clamped / 100) * c; return (<div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}><svg width={size} height={size} className="block"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth={stroke} /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(15,23,42,0.9)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} /></svg><div className="absolute inset-0 flex flex-col items-center justify-center text-center"><div className="text-xl font-semibold text-slate-900">{centerTop}</div>{centerBottom ? <div className="text-xs text-slate-600 -mt-0.5">{centerBottom}</div> : null}</div></div>); }
function flagFromYMDWeek(today: string, ymd: string): DateFlag { const d = toYMD(ymd); if (d === today) return "Hoje"; if (d === addDaysYMD(today, 1)) return "Amanhã"; return "Esta Semana"; }
function isWithinNextWeekWindow(today: string, ymd: string) { const d = toYMD(ymd); const end = addDaysYMD(today, 6); return Boolean(d && d >= today && d <= end); }
function flagBadgeClass(flag: DateFlag) { if (flag === "Hoje") return "bg-amber-50 border border-amber-200 text-amber-800"; return "bg-slate-50 border border-slate-200 text-slate-700"; }
function alertIcon(kind?: MeuDiaAlert["icon"]) { if (kind === "gift") return <Gift className="h-4 w-4 text-pink-700" />; if (kind === "ticket") return <Ticket className="h-4 w-4 text-amber-700" />; if (kind === "trophy") return <Trophy className="h-4 w-4 text-emerald-700" />; if (kind === "alert") return <AlertTriangle className="h-4 w-4 text-red-700" />; return <Bell className="h-4 w-4 text-slate-700" />; }
const FALLBACK_THOUGHTS = ["Consistência vence talento quando talento não é consistente.", "Quem faz follow-up com data, fecha com mais calma e mais previsibilidade.", "Venda consultiva: menos pressa, mais clareza — e mais fechamento.", "Hoje é dia de simplificar: uma boa pergunta vale mais que dez argumentos.", "Você não precisa convencer todo mundo. Só precisa conduzir a pessoa certa até a decisão certa."];
function pickThought(todayYMD: string) { let h = 2166136261; for (let i = 0; i < todayYMD.length; i++) { h ^= todayYMD.charCodeAt(i); h = Math.imul(h, 16777619); } return FALLBACK_THOUGHTS[Math.abs(h) % FALLBACK_THOUGHTS.length]; }

/** ===================== Página ===================== */
export default function Inicio() {
  const nav = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [me, setMe] = useState<UserRow | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const [vendorScope, setVendorScope] = useState<string>(ALL);
  const scopedUser = useMemo(() => (vendorScope === ALL ? null : usersById.get(vendorScope) || null), [vendorScope, usersById]);
  const currentUnit = useMemo(() => units.find((u) => u.id === me?.unit_id) || null, [units, me?.unit_id]);
  const isMatrixAdmin = isMatrixUser(me, currentUnit);
  const isBranchManager = isBranchManagerUser(me, currentUnit);
  const canManageTeam = isMatrixAdmin || isBranchManager;
  const selectableUsers = useMemo(() => {
    if (isMatrixAdmin) return users;
    if (isBranchManager) return users.filter((u) => u.unit_id === me?.unit_id);
    return me ? users.filter((u) => u.id === me.id) : [];
  }, [users, me, isMatrixAdmin, isBranchManager]);

  const rangeToday = useMemo(() => { const ymd = ymdFromDateInOffset(new Date(), PV_OFFSET_MIN); const { startISO, endISO } = rangeISOForDayInOffset(ymd, PV_OFFSET_MIN); return { ymd, br: fmtDateBRFromYMD(ymd), startISO, endISO }; }, []);
  const rangeMonth = useMemo(() => monthRangeYMDFromOffset(new Date(), PV_OFFSET_MIN), []);

  const [kpi, setKpi] = useState({ openOppCount: 0, openOppTotal: 0, todayEventsCount: 0, todayGroupsCount: 0, myDayCount: 0, pendingGroupRegistrationCount: 0, monthSalesTotal: 0, monthSalesMeta: 0, monthSalesPct: 0, carteiraAtivaTotal: 0, openStockReqCount: 0, vendasSemComissaoCount: 0, giroDueCount: 0, newProceduresCount: 0, commissionsPendingCount: 0, commissionsPendingTotal: 0, commissionScheduledTotal: 0, commissionScheduledDate: "" as string | null });
  const [overdueOpps, setOverdueOpps] = useState<(OppRow & { lead_nome?: string; lead_tel?: string | null; daysWaiting?: number })[]>([]);
  const [giroAll, setGiroAll] = useState<{ id: string; nome: string; carteiraAtiva: number }[]>([]);
  const [giroPage, setGiroPage] = useState(0);
  const GIRO_PAGE_SIZE = 10;
  const [eventsAll, setEventsAll] = useState<NextEventItem[]>([]);
  const [eventsPage, setEventsPage] = useState(0);
  const EVENTS_PAGE_SIZE = 7;
  const [myDayAlerts, setMyDayAlerts] = useState<MeuDiaAlert[]>([]);
  const [myDayPage, setMyDayPage] = useState(0);
  const MY_DAY_PAGE_SIZE = 7;
  const [thoughtOfDay, setThoughtOfDay] = useState<string>(pickThought(rangeToday.ymd));
  const [carteiraHealth, setCarteiraHealth] = useState<CarteiraHealth>(EMPTY_CARTEIRA_HEALTH);
  const [carteiraHealthLists, setCarteiraHealthLists] = useState<CarteiraHealthLists>(EMPTY_CARTEIRA_HEALTH_LISTS);
  const [carteiraHealthModal, setCarteiraHealthModal] = useState<CarteiraHealthKey | null>(null);

  const giroPageCount = useMemo(() => Math.max(1, Math.ceil(giroAll.length / GIRO_PAGE_SIZE)), [giroAll.length]);
  const giroSlice = useMemo(() => giroAll.slice(giroPage * GIRO_PAGE_SIZE, giroPage * GIRO_PAGE_SIZE + GIRO_PAGE_SIZE), [giroAll, giroPage]);
  const eventsPageCount = useMemo(() => Math.max(1, Math.ceil(eventsAll.length / EVENTS_PAGE_SIZE)), [eventsAll.length]);
  const eventsSlice = useMemo(() => eventsAll.slice(eventsPage * EVENTS_PAGE_SIZE, eventsPage * EVENTS_PAGE_SIZE + EVENTS_PAGE_SIZE), [eventsAll, eventsPage]);
  const myDayPageCount = useMemo(() => Math.max(1, Math.ceil(myDayAlerts.length / MY_DAY_PAGE_SIZE)), [myDayAlerts.length]);
  const myDaySlice = useMemo(() => myDayAlerts.slice(myDayPage * MY_DAY_PAGE_SIZE, myDayPage * MY_DAY_PAGE_SIZE + MY_DAY_PAGE_SIZE), [myDayAlerts, myDayPage]);

  async function loadMeAndUsers() {
    const { data: auth } = await supabase.auth.getUser();
    const authId = auth.user?.id;
    if (!authId) throw new Error("Sem usuário autenticado.");
    const { data: meRow, error: meErr } = await supabase.from("users").select("id,auth_user_id,nome,role,user_role,is_active,unit_id,hierarchy_level").eq("auth_user_id", authId).maybeSingle();
    if (meErr) throw meErr;
    if (!meRow) throw new Error("Usuário não encontrado na tabela users.");
    const [{ data: usersRows, error: usersErr }, { data: unitsRows, error: unitsErr }] = await Promise.all([
      supabase.from("users").select("id,auth_user_id,nome,role,user_role,is_active,unit_id,hierarchy_level").eq("is_active", true).order("nome", { ascending: true }),
      supabase.from("units").select("id,nome,tipo,is_active").order("tipo", { ascending: true }).order("nome", { ascending: true }),
    ]);
    if (usersErr) throw usersErr;
    if (unitsErr) throw unitsErr;
    const allUsers = (usersRows || []) as UserRow[];
    const allUnits = (unitsRows || []) as UnitRow[];
    const meUnit = allUnits.find((u) => u.id === (meRow as UserRow).unit_id) || null;
    const canTeam = isMatrixUser(meRow as UserRow, meUnit) || isBranchManagerUser(meRow as UserRow, meUnit);
    return { meRow: meRow as UserRow, usersRows: allUsers, unitsRows: allUnits, initialScope: canTeam ? ALL : meRow.id };
  }

  async function tryLoadLeadsMap(ids: string[]) {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (!uniq.length) return new Map<string, LeadRow>();
    try { const { data, error } = await supabase.from("leads").select("id,nome,telefone").in("id", uniq); if (!error && data) return new Map((data as any[]).map((l) => [l.id, l as LeadRow])); } catch {}
    try { const { data, error } = await supabase.from("lead").select("id,nome,telefone").in("id", uniq); if (!error && data) return new Map((data as any[]).map((l) => [l.id, l as LeadRow])); } catch {}
    return new Map<string, LeadRow>();
  }

  async function loadDashboard(scope: DashboardScope) {
    const today = rangeToday.ymd;
    const tomorrow = addDaysYMD(today, 1);
    const yesterday = addDaysYMD(today, -1);
    const endWeek = addDaysYMD(today, 6);
    const agendaWindowStartISO = `${today}T00:00:00.000Z`;
    const agendaWindowEndISO = `${endWeek}T23:59:59.999Z`;
    const noRowsId = "00000000-0000-0000-0000-000000000000";
    const applyVendedorScope = (query: any) => scope.isGlobal
      ? query
      : scope.vendedorIds.length
        ? query.in("vendedor_id", scope.vendedorIds)
        : query.eq("vendedor_id", noRowsId);
    const applyAuthScope = (query: any, column: string) => scope.isGlobal
      ? query
      : scope.authIds.length
        ? query.in(column, scope.authIds)
        : query.eq(column, noRowsId);

    const scopedGroupKeys = new Set<string>();
    if (!scope.isGlobal) {
      const scopedGroupsQ = applyVendedorScope(
        supabase.from("vendas").select("administradora,grupo,vendedor_id").not("grupo", "is", null).limit(5000)
      );
      const { data: scopedGroupSales, error: scopedGroupErr } = await scopedGroupsQ;
      if (scopedGroupErr) console.warn("[Inicio] Não foi possível delimitar os grupos do escopo:", scopedGroupErr);
      (scopedGroupSales || []).forEach((v: any) => {
        if (v.administradora && v.grupo) scopedGroupKeys.add(groupKey(v.administradora, v.grupo));
      });
    }

    let openOppQ = supabase.from("opportunities").select("id,segmento,valor_credito,estagio,score,expected_close_at,fechamento_previsto_em,vendedor_id,lead_id").limit(5000);
    openOppQ = applyAuthScope(openOppQ, "vendedor_id");
    const { data: openOppRowsRaw, error: openOppErr } = await openOppQ;
    if (openOppErr) console.warn("[Inicio] Não foi possível carregar oportunidades:", openOppErr);
    const openOppRows = ((openOppRowsRaw || []) as any as OppRow[]).filter((o) => isOpenOpportunityStage(o.estagio));
    const openOppCount = openOppRows.length;
    const openOppTotal = openOppRows.reduce((acc, r) => acc + (Number(r.valor_credito || 0) || 0), 0);
    const overdueComputed = openOppRows
      .map((o) => ({ row: o, due: toYMD(o.expected_close_at || o.fechamento_previsto_em) }))
      .filter((o) => Boolean(o.due) && (o.due as string) < today)
      .map(({ row, due }) => ({ ...row, daysWaiting: Math.max(0, daysDiffYMD(today, due as string)) }))
      .sort((a, b) => (b.daysWaiting || 0) - (a.daysWaiting || 0))
      .slice(0, 10);
    const leadsMap = await tryLoadLeadsMap(Array.from(new Set(overdueComputed.map((o) => o.lead_id).filter(Boolean))));
    const overdueOppsEnriched = overdueComputed.map((o) => { const ld = leadsMap.get(o.lead_id); return { ...o, lead_nome: ld?.nome, lead_tel: ld?.telefone || null }; });

    let agQ = supabase
      .from("agenda_eventos")
      .select("id,tipo,titulo,inicio_at,fim_at,user_id,videocall_url,cliente:clientes!agenda_eventos_cliente_id_fkey(id,nome,telefone),lead:leads!agenda_eventos_lead_id_fkey(id,nome,telefone)")
      .gte("inicio_at", agendaWindowStartISO)
      .lte("inicio_at", agendaWindowEndISO)
      .order("inicio_at", { ascending: true })
      .limit(500);
    agQ = scope.isGlobal
      ? agQ
      : scope.vendedorIds.length
        ? agQ.in("user_id", scope.vendedorIds)
        : agQ.eq("user_id", noRowsId);
    const { data: agRowsRaw, error: agErr } = await agQ;
    if (agErr) console.warn("[Inicio] Não foi possível carregar próximos eventos:", agErr);
    const agRows = ((agRowsRaw || []) as unknown as AgendaRow[]).filter((e) => normalizeText(e.tipo) !== "assembleia");
    const todayEventsCount = agRows.filter((e) => {
      const nominalDate = normalizeText(e.tipo) === "aniversario";
      return nominalDate ? toYMD(e.inicio_at) === today : ymdFromDateInOffset(new Date(e.inicio_at), PV_OFFSET_MIN) === today;
    }).length;

    const { data: groupRowsRaw, error: groupsErr } = await supabase.from("groups").select("id,administradora,segmento,codigo,participantes,prox_vencimento,prox_sorteio,prox_assembleia").limit(5000);
    if (groupsErr) console.warn("[Inicio] Não foi possível carregar grupos:", groupsErr);
    const allGroupRows = (groupRowsRaw || []) as any as GroupRow[];
    const groupRows = scope.isGlobal ? allGroupRows : allGroupRows.filter((g) => scopedGroupKeys.has(groupKey(g.administradora, g.codigo)));
    const groupVencYMD = (g: GroupRow) => toYMD(g.prox_vencimento);
    const groupSorteioYMD = (g: GroupRow) => toYMD(g.prox_sorteio);
    const groupAsmYMD = (g: GroupRow) => groupAssemblyYMD(g.prox_assembleia);
    const groupsToday = groupRows.filter((g) => [groupVencYMD(g), groupSorteioYMD(g), groupAsmYMD(g)].includes(today));
    const todayGroupsCount = groupsToday.length;
    const realGroupKeys = new Set(groupRows.map((g) => groupKey(g.administradora, g.codigo)));
    const sorteioDates = Array.from(new Set(groupRows.map((g) => toYMD(g.prox_sorteio)).filter(Boolean) as string[]));
    const drawsByDate = new Map<string, boolean>();
    if (sorteioDates.length) { const { data: draws, error: drawsErr } = await supabase.from("lottery_draws").select("draw_date").in("draw_date", sorteioDates); if (drawsErr) console.warn("[Inicio] Não foi possível carregar resultados da loteria:", drawsErr); (draws || []).forEach((d: any) => drawsByDate.set(toYMD(d.draw_date) as string, true)); }

    const { startYMD, endYMD, year, month } = rangeMonth;
    let salesQ = supabase.from("vendas").select("valor_venda,vendedor_id,data_venda").gte("data_venda", startYMD).lt("data_venda", endYMD);
    salesQ = applyVendedorScope(salesQ);
    const { data: salesRows, error: salesErr } = await salesQ;
    if (salesErr) console.warn("[Inicio] Não foi possível carregar vendas do mês:", salesErr);
    const monthSalesTotal = (salesRows || []).reduce((acc: number, r: any) => acc + (Number(r.valor_venda || 0) || 0), 0);

    const field = metaFieldForMonth(month);
    let metaQ = supabase.from("metas_vendedores").select(`vendedor_id,ano,${field}`).eq("ano", year);
    metaQ = applyVendedorScope(metaQ);
    const { data: metaRows, error: metaErr } = await metaQ;
    if (metaErr) console.warn("[Inicio] Não foi possível carregar metas:", metaErr);
    const monthSalesMeta = (metaRows || []).reduce((acc: number, r: any) => acc + (Number(r?.[field] || 0) || 0), 0);
    const monthSalesPct = monthSalesMeta > 0 ? Math.min(100, Math.max(0, (monthSalesTotal / monthSalesMeta) * 100)) : 0;

    let cartQ = supabase.from("vendas").select("valor_venda,vendedor_id,codigo").eq("codigo", "00");
    cartQ = applyVendedorScope(cartQ);
    const { data: cartRows, error: cartErr } = await cartQ;
    if (cartErr) console.warn("[Inicio] Não foi possível carregar carteira ativa:", cartErr);
    const carteiraAtivaTotal = (cartRows || []).reduce((acc: number, r: any) => acc + (Number(r.valor_venda || 0) || 0), 0);

    let reqQ = supabase.from("vendas").select("id,vendedor_id").eq("status", "nova").eq("tipo_venda", "Bolsão").limit(5000);
    reqQ = applyVendedorScope(reqQ);
    const { data: reqRows, error: reqErr } = await reqQ;
    if (reqErr) console.warn("[Inicio] Não foi possível carregar reservas de Bolsão aguardando encarteiramento:", reqErr);
    const openStockReqCount = (reqRows || []).length;

    let commQ = supabase.from("commissions").select("id,venda_id,vendedor_id,valor_total,base_calculo,percent_aplicado,status,data_venda").limit(5000);
    commQ = applyVendedorScope(commQ);
    const { data: commRowsRaw, error: commErr } = await commQ;
    if (commErr) console.warn("[Inicio] Não foi possível carregar comissões legadas:", commErr);
    const commRows = (commRowsRaw || []) as any as CommissionRow[];
    const commIds = commRows.map((c) => c.id);
    const vendaIdsWithComm = new Set(commRows.map((c) => c.venda_id).filter(Boolean));

    let flowRows: CommissionFlowRow[] = [];
    if (commIds.length) { const { data: flowData, error: flowErr } = await supabase.from("commission_flow").select("id,commission_id,mes,percentual,valor_previsto,valor_pago_vendedor,data_pagamento_vendedor").in("commission_id", commIds).order("mes", { ascending: true }); if (flowErr) console.warn("[Inicio] Não foi possível carregar o fluxo legado de comissões:", flowErr); flowRows = (flowData || []) as any as CommissionFlowRow[]; }
    const flowByCommission = new Map<string, CommissionFlowRow[]>();
    for (const f of flowRows) { if (!flowByCommission.has(f.commission_id)) flowByCommission.set(f.commission_id, []); flowByCommission.get(f.commission_id)!.push(f); }
    const vendaIds = Array.from(new Set(commRows.map((c) => c.venda_id).filter(Boolean)));
    const vendasById = new Map<string, VendaMini>();
    if (vendaIds.length) { const { data: vendasExtras, error: vendasExtrasErr } = await supabase.from("vendas").select("id,vendedor_id,codigo,cancelada_em").in("id", vendaIds); if (vendasExtrasErr) console.warn("[Inicio] Não foi possível validar vendas das comissões legadas:", vendasExtrasErr); (vendasExtras || []).forEach((v: any) => vendasById.set(v.id, v as VendaMini)); }

    let batchQ = supabase.from("commission_batches").select("*").limit(5000);
    batchQ = applyVendedorScope(batchQ);
    const { data: batchRowsRaw, error: batchErr } = await batchQ;
    if (batchErr) console.warn("[Inicio] Não foi possível carregar comissões particionadas:", batchErr);
    const allPartitionBatches = (batchRowsRaw || []) as any as CommissionBatchRow[];
    const partitionBatches = allPartitionBatches.filter((b) => b.legacy !== true && !["estornado", "cancelado"].includes(normalizeText(b.status)));
    const partitionBatchIds = partitionBatches.map((b) => b.id);
    const partitionBatchById = new Map(partitionBatches.map((b) => [b.id, b]));
    const partitionVendaIds = new Set(partitionBatches.map((b) => b.venda_id).filter(Boolean));
    partitionVendaIds.forEach((id) => vendaIdsWithComm.add(id));

    let partitionEntries: CommissionEntryRow[] = [];
    let partitionFlows: CommissionEntryFlowRow[] = [];
    if (partitionBatchIds.length) {
      const [{ data: entryRows, error: entryErr }, { data: entryFlowRows, error: entryFlowErr }] = await Promise.all([
        supabase.from("commission_entries").select("*").in("batch_id", partitionBatchIds).limit(10000),
        supabase.from("commission_entry_flow").select("*").in("batch_id", partitionBatchIds).limit(20000),
      ]);
      if (entryErr) console.warn("[Inicio] Não foi possível carregar divisões de comissão:", entryErr);
      if (entryFlowErr) console.warn("[Inicio] Não foi possível carregar o fluxo particionado:", entryFlowErr);
      partitionEntries = (entryRows || []) as any as CommissionEntryRow[];
      partitionFlows = (entryFlowRows || []) as any as CommissionEntryFlowRow[];
    }

    const visiblePartitionEntries = partitionEntries.filter((entry) => {
      if (["estornado", "cancelado"].includes(normalizeText(entry.status))) return false;
      if (scope.mode === "matrix") return true;
      if (scope.mode === "branch") {
        return Boolean(scope.currentUnitId && (entry.business_unit_id === scope.currentUnitId || entry.recipient_unit_id === scope.currentUnitId));
      }
      return scope.vendedorIds.includes(String(entry.recipient_user_id || ""));
    });
    const visiblePartitionEntryIds = new Set(visiblePartitionEntries.map((entry) => entry.id));
    const visiblePartitionFlows = partitionFlows.filter((flow) => {
      if (!visiblePartitionEntryIds.has(flow.entry_id)) return false;
      if (["estornado", "cancelado"].includes(normalizeText(flow.status))) return false;
      return partitionBatchById.has(flow.batch_id);
    });
    const partitionPendingByBatch = new Map<string, number>();
    for (const flow of visiblePartitionFlows) {
      const pending = Math.max(0, (Number(flow.valor_previsto) || 0) - (Number(flow.valor_pago) || 0));
      if (pending > 0.009) partitionPendingByBatch.set(flow.batch_id, (partitionPendingByBatch.get(flow.batch_id) || 0) + pending);
    }

    const operationalCommissions = commRows.filter((c) => c.status !== "estorno" && !partitionVendaIds.has(c.venda_id) && !isVendaCancelada(vendasById.get(c.venda_id)));
    const pendingCommissions = operationalCommissions.map((c) => ({ c, pending: pendingCommissionGross(c, flowByCommission.get(c.id) || []) })).filter((x) => x.pending > 0.009);
    const commissionsPendingCount = pendingCommissions.length + partitionPendingByBatch.size;
    const commissionsPendingTotal = pendingCommissions.reduce((acc, x) => acc + x.pending, 0) + Array.from(partitionPendingByBatch.values()).reduce((acc, value) => acc + value, 0);

    const scheduledByDate = new Map<string, number>();
    for (const c of operationalCommissions) {
      const flows = (flowByCommission.get(c.id) || []).filter((f) => (Number(f.percentual) || 0) > 0);
      for (const f of flows) {
        if ((Number(f.valor_pago_vendedor) || 0) > 0) continue;
        const direct = toYMD(f.data_pagamento_vendedor);
        if (!direct) continue;
        const value = Number(f.valor_previsto || 0) || 0;
        if (value <= 0) continue;
        scheduledByDate.set(direct, (scheduledByDate.get(direct) || 0) + value);
      }
    }
    for (const flow of visiblePartitionFlows) {
      if ((Number(flow.valor_pago) || 0) > 0 || normalizeText(flow.status) === "pago") continue;
      const direct = toYMD(flow.data_pagamento);
      if (!direct) continue;
      const value = Math.max(0, (Number(flow.valor_previsto) || 0) - (Number(flow.valor_pago) || 0));
      if (value <= 0) continue;
      scheduledByDate.set(direct, (scheduledByDate.get(direct) || 0) + value);
    }
    const scheduledDates = Array.from(scheduledByDate.keys()).filter((d) => d >= today).sort();
    const commissionScheduledDate = scheduledDates[0] || null;
    const commissionScheduledTotal = commissionScheduledDate ? scheduledByDate.get(commissionScheduledDate) || 0 : 0;

    let vendasSemQ = supabase.from("vendas").select("id,data_venda,vendedor_id,segmento,tabela,administradora,grupo,valor_venda,numero_proposta,cliente_lead_id,lead_id,encarteirada_em,codigo,cancelada_em,status,contemplada").not("encarteirada_em", "is", null).order("data_venda", { ascending: false });
    vendasSemQ = applyVendedorScope(vendasSemQ);
    const { data: vendasSemRows, error: vendasSemErr } = await vendasSemQ;
    if (vendasSemErr) console.warn("[Inicio] Não foi possível carregar vendas sem comissão:", vendasSemErr);
    const vendasSemComissaoCount = ((vendasSemRows || []) as any as VendaMini[]).filter((v) => !vendaIdsWithComm.has(v.id)).filter((v) => !isVendaCancelada(v)).length;
    const vendasForStubs = ((vendasSemRows || []) as any as VendaMini[]).filter((v) => !isVendaCancelada(v) && v.administradora && v.grupo);
    const missingGroupsMap = new Map<string, VendaMini>();
    vendasForStubs.forEach((v) => { const k = groupKey(v.administradora, v.grupo); if (!realGroupKeys.has(k) && !missingGroupsMap.has(k)) missingGroupsMap.set(k, v); });
    const pendingGroupRegistrationCount = missingGroupsMap.size;

    let giroList: { id: string; nome: string; carteiraAtiva: number }[] = [];
    let giroRows: GiroItemRow[] = [];
    try {
      let giroItemsQ = supabase.from("v_giro_due_items").select("*").limit(5000);
      giroItemsQ = scope.isGlobal
        ? giroItemsQ
        : scope.vendedorIds.length
          ? giroItemsQ.in("owner_auth_id", scope.vendedorIds)
          : giroItemsQ.eq("owner_auth_id", noRowsId);
      const { data: giroItems, error: giroItemsErr } = await giroItemsQ;
      if (giroItemsErr) throw giroItemsErr;
      giroRows = (giroItems || []) as any as GiroItemRow[];
    } catch (e) {
      console.warn("[Inicio] Não foi possível carregar itens de giro:", e);
    }
    if (!giroRows.length && !scope.isGlobal && scope.vendedorIds.length) {
      const directResults = await Promise.all(scope.vendedorIds.map((ownerId) => supabase.from("v_giro_due_items").select("*").eq("owner_auth_id", ownerId).limit(5000)));
      const rowsById = new Map<string, GiroItemRow>();
      directResults.forEach(({ data }) => ((data || []) as any as GiroItemRow[]).forEach((row, idx) => rowsById.set(String(row.id || row.cliente_id || row.lead_id || `${row.owner_auth_id || "owner"}_${idx}`), row)));
      giroRows = Array.from(rowsById.values());
    }
    if (!giroRows.length) {
      try {
        const { data: rpcRows, error: rpcErr } = await supabase.rpc("next_giro_batch");
        if (rpcErr) throw rpcErr;
        giroRows = (Array.isArray(rpcRows) ? rpcRows : []) as GiroItemRow[];
      } catch (e) {
        console.warn("[Inicio] A fonte alternativa de giros também não respondeu:", e);
      }
    }
    const giroClienteIds = Array.from(new Set(giroRows.map((r) => r.cliente_id).filter(Boolean).map(String)));
    const giroLeadIds = Array.from(new Set(giroRows.map((r) => r.lead_id).filter(Boolean).map(String)));
    const giroClientesById = new Map<string, { nome?: string | null }>();
    const giroLeadsById = new Map<string, { nome?: string | null }>();
    if (giroClienteIds.length) {
      const { data, error } = await supabase.from("clientes").select("id,nome").in("id", giroClienteIds);
      if (error) console.warn("[Inicio] Não foi possível identificar os clientes dos giros:", error);
      else (data || []).forEach((row: any) => giroClientesById.set(String(row.id), row));
    }
    if (giroLeadIds.length) {
      const { data, error } = await supabase.from("leads").select("id,nome").in("id", giroLeadIds);
      if (error) console.warn("[Inicio] Não foi possível identificar os leads dos giros:", error);
      else (data || []).forEach((row: any) => giroLeadsById.set(String(row.id), row));
    }
    giroList = giroRows.map((r, idx) => {
      const cliente = r.cliente_id ? giroClientesById.get(String(r.cliente_id)) : undefined;
      const lead = r.lead_id ? giroLeadsById.get(String(r.lead_id)) : undefined;
      return {
        id: String(r.task_id || r.giro_task_id || r.id || r.cliente_id || r.lead_id || `giro_${idx}`),
        nome: String(cliente?.nome || r.cliente_nome || r.lead_nome || lead?.nome || r.nome || "Cliente sem cadastro").trim(),
        carteiraAtiva: Number(r.valor_carteira_ativa ?? r.carteira_ativa_total ?? r.carteira_total ?? 0) || 0,
      };
    });
    giroList.sort((a, b) => (b.carteiraAtiva || 0) - (a.carteiraAtiva || 0));
    let giroDueCount = giroList.length;
    try {
      let giroCountQ = supabase.from("v_giro_due_count").select("owner_auth_id,due_count");
      giroCountQ = scope.isGlobal
        ? giroCountQ
        : scope.vendedorIds.length
          ? giroCountQ.in("owner_auth_id", scope.vendedorIds)
          : giroCountQ.eq("owner_auth_id", noRowsId);
      const { data: giroCounts, error: giroCountErr } = await giroCountQ;
      if (giroCountErr) throw giroCountErr;
      giroDueCount = Math.max(giroDueCount, (giroCounts || []).reduce((acc: number, r: GiroDueRow) => acc + (Number(r?.due_count || 0) || 0), 0));
    } catch (e) {
      console.warn("[Inicio] Não foi possível carregar o contador de giros; usando os itens encontrados:", e);
    }
    if (!giroList.length) giroDueCount = 0;

    const birthdayToday = agRows
      .filter((e) => normalizeText(e.tipo) === "aniversario" && toYMD(e.inicio_at) === today)
      .map((e) => ({ id: e.cliente?.id || e.lead?.id || e.id, nome: e.cliente?.nome || e.lead?.nome || e.titulo || "Cliente", data_nascimento: e.inicio_at, telefone: e.cliente?.telefone || e.lead?.telefone || null }))
      .slice(0, 50) as ClienteRow[];
    const inadimplentesByBucket = new Map<string, { count: number; names: string[] }>();
    let carteiraHealthNext: CarteiraHealth = { ...EMPTY_CARTEIRA_HEALTH };
    const carteiraHealthListsNext: CarteiraHealthLists = {
      friendly: [],
      reparcel: [],
      critical: [],
      risk: [],
      regularized: [],
      recovery: [],
      highIntent: [],
      communications: [],
    };
    try {
      let healthQ = supabase
        .from("vendas")
        .select("id,vendedor_id,lead_id,cliente_lead_id,valor_venda,grupo,cota,codigo,cancelada_em,reativada_em,inad,inad_em,inad_revertida_em,administradora,segmento,produto")
        .limit(5000);
      healthQ = applyVendedorScope(healthQ);
      const { data: healthRowsRaw, error: healthErr } = await healthQ;
      if (healthErr) throw healthErr;
      const healthRows = (healthRowsRaw || []) as any as VendaMini[];
      const leadIds = Array.from(new Set(healthRows.map((v) => v.lead_id || v.cliente_lead_id).filter(Boolean) as string[]));
      const namesMap = await tryLoadLeadsMap(leadIds);
      const sellerIds = Array.from(new Set(healthRows.map((v) => String(v.vendedor_id || "")).filter(Boolean)));
      const sellerMap = new Map<string, string>();
      if (sellerIds.length) {
        const [{ data: sellersByProfile }, { data: sellersByAuth }] = await Promise.all([
          supabase.from("users").select("id,nome").in("id", sellerIds),
          supabase.from("users").select("auth_user_id,nome").in("auth_user_id", sellerIds),
        ]);
        (sellersByProfile || []).forEach((u: any) => sellerMap.set(String(u.id), String(u.nome || "—")));
        (sellersByAuth || []).forEach((u: any) => sellerMap.set(String(u.auth_user_id), String(u.nome || "—")));
      }
      const monthStart = `${today.slice(0, 7)}-01`;
      const recentClickStart = addDaysYMD(today, -7);
      const healthById = new Map(healthRows.map((v) => [v.id, v] as const));

      const itemFor = (v: VendaMini, extras: Partial<CarteiraHealthItem> = {}): CarteiraHealthItem => {
        const leadId = v.lead_id || v.cliente_lead_id || null;
        const lead = leadId ? namesMap.get(leadId) : undefined;
        return {
          vendaId: v.id,
          leadId,
          cliente: lead?.nome || `Grupo/Cota ${v.grupo || "—"}/${v.cota || "—"}`,
          telefone: lead?.telefone || null,
          grupo: v.grupo || null,
          cota: v.cota || null,
          administradora: v.administradora || null,
          segmento: v.produto || v.segmento || null,
          vendedorNome: sellerMap.get(String(v.vendedor_id || "")) || null,
          ...extras,
        };
      };

      for (const v of healthRows) {
        const cancelled = isVendaCancelada(v);
        const inadStart = toYMD(v.inad_em);
        const reverted = toYMD(v.inad_revertida_em);
        const reactivated = toYMD(v.reativada_em);
        const cancellation = toYMD(v.cancelada_em);
        const leadId = v.lead_id || v.cliente_lead_id || "";
        const nome = namesMap.get(leadId)?.nome || `Grupo/Cota ${v.grupo || "—"}/${v.cota || "—"}`;

        if (v.inad && !reverted && !cancelled && inadStart) {
          const dias = Math.max(1, daysDiffYMD(today, inadStart));
          const value = Number(v.valor_venda || 0) || 0;
          const bucket = dias <= 30 ? "1-30" : dias <= 60 ? "31-60" : "61+";
          const cur = inadimplentesByBucket.get(bucket) || { count: 0, names: [] };
          cur.count += 1;
          if (cur.names.length < 5) cur.names.push(nome);
          inadimplentesByBucket.set(bucket, cur);

          if (dias <= 30) {
            carteiraHealthNext.friendlyCount += 1;
            carteiraHealthNext.friendlyValue += value;
            carteiraHealthListsNext.friendly.push(itemFor(v, { dias, statusLabel: "Régua amigável" }));
          } else if (dias <= 60) {
            carteiraHealthNext.reparcelCount += 1;
            carteiraHealthNext.reparcelValue += value;
            carteiraHealthListsNext.reparcel.push(itemFor(v, { dias, statusLabel: "Verificar reparcelamento" }));
          } else {
            carteiraHealthNext.criticalCount += 1;
            carteiraHealthNext.criticalValue += value;
            carteiraHealthListsNext.critical.push(itemFor(v, { dias, statusLabel: "Faixa crítica" }));
            if (dias >= 80) {
              carteiraHealthNext.riskCount += 1;
              carteiraHealthListsNext.risk.push(itemFor(v, { dias, statusLabel: "Risco de cancelamento" }));
            }
          }
        }

        if (reverted && reverted >= monthStart && reverted <= today) {
          carteiraHealthNext.regularizedMonth += 1;
          carteiraHealthListsNext.regularized.push(itemFor(v, { statusLabel: `Regularizado em ${fmtDateBRFromYMD(reverted)}` }));
        }
        if (cancellation && !reactivated) {
          carteiraHealthNext.recoveryCount += 1;
          carteiraHealthListsNext.recovery.push(itemFor(v, {
            dias: Math.max(0, daysDiffYMD(today, cancellation)),
            statusLabel: `Cancelado em ${fmtDateBRFromYMD(cancellation)}`,
          }));
        }
        if (reactivated && reactivated >= monthStart && reactivated <= today) carteiraHealthNext.recoveredMonth += 1;
      }

      try {
        let msgQ = supabase
          .from("carteira_relationship_messages")
          .select("id,venda_id,vendedor_id,status,ruler,stage,milestone,cta_type,subject,click_count,sent_at,last_clicked_at,seller_attention_at,created_at")
          .gte("created_at", `${addDaysYMD(today, -40)}T00:00:00.000Z`)
          .limit(5000);
        msgQ = applyVendedorScope(msgQ);
        const { data: msgRows, error: msgErr } = await msgQ;
        if (msgErr) throw msgErr;
        const rows = msgRows || [];
        const sentThisMonth = rows.filter((r: any) => r.status === "sent" && toYMD(r.sent_at) && (toYMD(r.sent_at) as string) >= monthStart);
        carteiraHealthNext.emailsSentMonth = sentThisMonth.length;

        carteiraHealthListsNext.communications = sentThisMonth
          .map((r: any) => {
            const v = healthById.get(String(r.venda_id));
            return v ? itemFor(v, {
              ruler: r.ruler,
              stage: r.stage,
              milestone: Number(r.milestone || 0) || null,
              ctaType: r.cta_type || null,
              sentAt: r.sent_at || null,
              clickedAt: r.last_clicked_at || null,
              clickCount: Number(r.click_count || 0),
              statusLabel: r.ruler === "recuperacao" ? "Recuperação" : "Inadimplência",
            }) : null;
          })
          .filter(Boolean) as CarteiraHealthItem[];

        const highIntentRows = rows.filter((r: any) => toYMD(r.last_clicked_at) && (toYMD(r.last_clicked_at) as string) >= recentClickStart);
        const highIntentByVenda = new Map<string, any>();
        for (const row of highIntentRows) {
          const key = String((row as any).venda_id || "");
          const prev = highIntentByVenda.get(key);
          if (!prev || new Date((row as any).last_clicked_at).getTime() > new Date(prev.last_clicked_at).getTime()) highIntentByVenda.set(key, row);
        }
        carteiraHealthNext.highIntent7d = highIntentByVenda.size;
        carteiraHealthListsNext.highIntent = Array.from(highIntentByVenda.values())
          .map((r: any) => {
            const v = healthById.get(String(r.venda_id));
            return v ? itemFor(v, {
              ruler: r.ruler,
              stage: r.stage,
              milestone: Number(r.milestone || 0) || null,
              ctaType: r.cta_type || null,
              sentAt: r.sent_at || null,
              clickedAt: r.last_clicked_at || null,
              clickCount: Number(r.click_count || 0),
              statusLabel: "Cliente clicou no CTA",
            }) : null;
          })
          .filter(Boolean)
          .sort((a: any, b: any) => new Date(b.clickedAt || 0).getTime() - new Date(a.clickedAt || 0).getTime()) as CarteiraHealthItem[];

        const contactedIds = new Set(rows.map((r: any) => r.venda_id));
        carteiraHealthNext.maxRecoveredMonth = healthRows.filter((v: any) => {
          const d = toYMD(v.reativada_em);
          return d && d >= monthStart && d <= today && contactedIds.has(v.id);
        }).length;
      } catch (messageError) {
        console.warn("[Inicio] Histórico das réguas MAX indisponível:", messageError);
      }
    } catch (e) {
      console.warn("[Inicio] Não foi possível carregar Saúde da Carteira:", e);
    }

    let newProceduresCount = 0;
    try { const sevenDaysAgo = addDaysYMD(today, -7); const { data: kbRows, error: kbErr } = await supabase.from("kb_procedures").select("id,title,status,created_at,updated_at").order("created_at", { ascending: false }).limit(200); if (!kbErr && kbRows) newProceduresCount = (kbRows as KBProcRow[]).filter((p) => String(p.status || "").toLowerCase() === "active" && (toYMD(p.created_at) || "") >= sevenDaysAgo).length; } catch {}

    const myDay: MeuDiaAlert[] = [];
    if (pendingGroupRegistrationCount > 0) { const groups = Array.from(missingGroupsMap.values()).map((v) => ({ codigo: normalizeGroupDigits(v.grupo) })); myDay.push({ id: "pending-groups", priority: 10, icon: "alert", title: `Grupos pendentes de cadastro: ${groupListLabel(groups)}`, desc: "Há vendas em grupos que ainda não estão cadastrados na Gestão de Grupos.", action: { label: "Cadastrar Grupos", to: "/gestao-de-grupos" } }); }
    const boletoGroups = groupRows.filter((g) => groupVencYMD(g) === tomorrow);
    if (boletoGroups.length) myDay.push({ id: "boleto-groups", priority: 20, icon: "ticket", title: `Enviar boleto dos grupos ${groupListLabel(boletoGroups)}`, desc: `Vencimento previsto para ${fmtDateBRFromYMD(tomorrow)}.`, action: { label: "Ver Grupos", to: "/gestao-de-grupos" } });
    const vencimentoTodayGroups = groupRows.filter((g) => groupVencYMD(g) === today);
    if (vencimentoTodayGroups.length) myDay.push({ id: "vencimento-today-groups", priority: 25, icon: "ticket", title: `Vencimento dos grupos ${groupListLabel(vencimentoTodayGroups)}`, desc: "Verificar se há clientes com pagamento pendente e emitir alerta/recobrança.", action: { label: "Ver Grupos", to: "/gestao-de-grupos" } });
    const loteriaGroups = groupRows.filter((g) => { const sorteio = groupSorteioYMD(g); const asm = groupAsmYMD(g); if (!sorteio || !asm) return false; return today >= sorteio && today < asm && !hasDraw(drawsByDate, sorteio); });
    if (loteriaGroups.length) myDay.push({ id: "loteria-groups", priority: 30, icon: "alert", title: `Informar resultado da Loteria para os grupos ${groupListLabel(loteriaGroups)}`, desc: "Esse alerta some quando o resultado da Loteria Federal da data do sorteio é informado.", action: { label: "Informar Loteria", to: "/gestao-de-grupos" } });
    const lanceGroups = groupRows.filter((g) => { const adm = normalizeAdmin(g.administradora).toLowerCase(); const sorteio = groupSorteioYMD(g); const asm = groupAsmYMD(g); if (adm === "maggi" || adm === "hs") return sorteio === tomorrow; return asm === tomorrow; });
    if (lanceGroups.length) myDay.push({ id: "lance-groups", priority: 40, icon: "bell", title: `Ofertar lance dos grupos ${groupListLabel(lanceGroups)}`, desc: "Para Maggi e HS Consórcios, o alerta é um dia antes do sorteio. Para as demais, um dia antes da assembleia.", action: { label: "Abrir Oferta", to: "/gestao-de-grupos" } });
    const assembleiaTodayGroups = groupRows.filter((g) => groupAsmYMD(g) === today);
    if (assembleiaTodayGroups.length) myDay.push({ id: "assembleia-today", priority: 50, icon: "bell", title: `Hoje tem assembleia dos grupos ${groupListLabel(assembleiaTodayGroups)}`, desc: "Verificar se os clientes foram contemplados.", action: { label: "Ver Assembleias", to: "/gestao-de-grupos" } });
    const assembleiaYesterdayGroups = groupRows.filter((g) => groupAsmYMD(g) === yesterday);
    if (assembleiaYesterdayGroups.length) myDay.push({ id: "assembleia-result", priority: 60, icon: "alert", title: `Informar o resultado da assembleia dos grupos ${groupListLabel(assembleiaYesterdayGroups)}`, desc: `Assembleia realizada em ${fmtDateBRFromYMD(yesterday)}.`, action: { label: "Informar Resultado", to: "/gestao-de-grupos" } });
    const billingBuckets = [
      { key: "1-30", title: "Inadimplência de 1 a 30 dias", desc: "MAX acompanha com comunicação amigável e foco em regularização." },
      { key: "31-60", title: "Inadimplência de 31 a 60 dias", desc: "MAX passa a oferecer a verificação de reparcelamento como alternativa." },
      { key: "61+", title: "Inadimplência acima de 60 dias", desc: "Faixa crítica: MAX intensifica a comunicação e sinaliza risco de cancelamento." },
    ];

    billingBuckets.forEach((b, idx) => {
      const data = inadimplentesByBucket.get(b.key);
      if (!data || data.count <= 0) return;
      const nomes = data.names.length ? ` Clientes: ${data.names.join(", ")}${data.count > data.names.length ? ` +${data.count - data.names.length}` : ""}.` : "";
      myDay.push({
        id: `inad-${b.key}`,
        priority: 65 + idx,
        icon: "alert",
        title: `${b.title}: ${data.count} cliente(s)`,
        desc: `${b.desc}${nomes}`,
        action: { label: "Abrir Carteira", to: "/carteira" },
      });
    });

    birthdayToday.forEach((c) => myDay.push({ id: `birthday:${c.id}`, priority: 70, icon: "gift", title: `Hoje é aniversário do cliente ${c.nome}`, desc: "Parabenize-o e fortaleça o relacionamento.", action: { label: "Ver Clientes", to: "/clientes" } }));
    const commissionToday = scheduledByDate.get(today) || 0;
    if (commissionToday > 0) myDay.push({ id: "commission-today", priority: 80, icon: "trophy", title: `Hoje você receberá ${fmtBRL(commissionToday)} de comissão`, desc: "Celebre esse momento. Resultado é consequência de processo bem feito.", action: { label: "Abrir Comissões", to: "/comissoes" } });
    myDay.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));

    const items: NextEventItem[] = [];
    for (const e of (agRows || []) as AgendaRow[]) {
      if (normalizeText(e.tipo) === "aniversario") continue;
      const startUtcMs = new Date(e.inicio_at).getTime();
      const ymd = ymdFromDateInOffset(new Date(startUtcMs), PV_OFFSET_MIN);
      if (!isWithinNextWeekWindow(today, ymd)) continue;
      items.push({ id: `ag:${e.id}`, whenSort: startUtcMs, whenLabel: fmtDTForOffset(e.inicio_at, PV_OFFSET_MIN), flag: flagFromYMDWeek(today, ymd), title: e.titulo || "Evento", desc: `${e.tipo || "Agenda"} • ${e.cliente?.nome || e.lead?.nome || "—"}`, action: { label: "Abrir Agenda", to: "/agenda" } });
    }
    for (const [d, total] of scheduledByDate.entries()) { if (!isWithinNextWeekWindow(today, d)) continue; items.push({ id: `cf:${d}`, whenSort: Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)), 13), whenLabel: fmtDateBRFromYMD(d), flag: flagFromYMDWeek(today, d), title: d === today ? "Comissão de hoje" : "Recebimento de Comissão", desc: d === today ? `🎉 Hoje você receberá ${fmtBRL(total)} de comissão. Celebre esse momento.` : `💰 Você receberá ${fmtBRL(total)} de comissão.`, action: { label: "Abrir Comissões", to: "/comissoes" } }); }
    for (const c of birthdayToday) items.push({ id: `bday:${c.id}`, whenSort: Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)), 8), whenLabel: fmtDateBRFromYMD(today), flag: "Hoje", title: "Aniversário", desc: `Hoje é aniversário do cliente ${c.nome}. Parabenize-o! 🎂🎉`, action: { label: "Ver Clientes", to: "/clientes" } });
    items.sort((a, b) => a.whenSort - b.whenSort);

    setOverdueOpps(overdueOppsEnriched);
    setGiroAll(giroList);
    setGiroPage(0);
    setEventsAll(items);
    setEventsPage(0);
    setMyDayAlerts(myDay);
    setMyDayPage(0);
    setThoughtOfDay(pickThought(today));
    setCarteiraHealth(carteiraHealthNext);
    setCarteiraHealthLists(carteiraHealthListsNext);
    setKpi({ openOppCount, openOppTotal, todayEventsCount, todayGroupsCount, myDayCount: myDay.length, pendingGroupRegistrationCount, monthSalesTotal, monthSalesMeta, monthSalesPct, carteiraAtivaTotal, openStockReqCount, vendasSemComissaoCount, giroDueCount, newProceduresCount, commissionsPendingCount, commissionsPendingTotal, commissionScheduledTotal, commissionScheduledDate });
  }

  function getScopes() { return me ? buildDashboardScope(me, users, units, vendorScope) : null; }
  async function reload(hard = false) { const scope = getScopes(); if (!scope) return; if (hard) setRefreshing(true); setErrMsg(null); try { await loadDashboard(scope); } catch (e) { console.error("[Inicio] loadDashboard error:", e); setErrMsg(humanErr(e)); } finally { if (hard) setRefreshing(false); } }

  useEffect(() => { let alive = true; (async () => { setLoading(true); setErrMsg(null); try { const { meRow, usersRows, unitsRows, initialScope } = await loadMeAndUsers(); if (!alive) return; setMe(meRow); setUsers(usersRows); setUnits(unitsRows); setVendorScope(initialScope); await loadDashboard(buildDashboardScope(meRow, usersRows, unitsRows, initialScope)); } catch (e) { console.error("[Inicio] init error:", e); if (alive) setErrMsg(humanErr(e)); } finally { if (alive) setLoading(false); } })(); return () => { alive = false; }; }, []);
  useEffect(() => { if (!me || !canManageTeam) return; if (vendorScope !== ALL && !selectableUsers.some((u) => u.id === vendorScope)) return; reload(false); }, [vendorScope]);
  useEffect(() => { if (!me) return; const path = location.pathname.toLowerCase(); if (path === "/" || path === "/inicio") reload(false); }, [location.pathname, me?.id, vendorScope]);
  useEffect(() => { if (!me) return; const handleRefreshOnReturn = () => { const path = window.location.pathname.toLowerCase(); if (path === "/" || path === "/inicio") reload(false); }; const handleVisibility = () => { if (document.visibilityState === "visible") handleRefreshOnReturn(); }; window.addEventListener("focus", handleRefreshOnReturn); document.addEventListener("visibilitychange", handleVisibility); return () => { window.removeEventListener("focus", handleRefreshOnReturn); document.removeEventListener("visibilitychange", handleVisibility); }; }, [me?.id, vendorScope, users.length]);

  const brand = {
    ruby: "#A11C27",
    navy: "#1E293F",
    gold: "#B5A573",
    cream: "#F5F5F5",
  };

  const glassCard =
    "relative overflow-hidden rounded-3xl border border-white/60 bg-white/75 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-2xl";
  const softCard =
    "relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-[0_16px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl";
  const subtleButton =
    "rounded-xl border border-slate-200 bg-white/80 text-slate-900 shadow-sm hover:bg-slate-50";
  const primaryButton =
    "rounded-xl bg-[#1E293F] text-white shadow-[0_12px_28px_rgba(30,41,63,0.22)] hover:bg-[#A11C27]";

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[radial-gradient(circle_at_top_left,rgba(161,28,39,0.10),transparent_34%),radial-gradient(circle_at_top_right,rgba(181,165,115,0.18),transparent_30%),linear-gradient(135deg,#F8FAFC,#F5F5F5)] p-6 text-slate-900">
        <Card className={`${glassCard} mx-auto mt-12 max-w-xl`}>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1E293F] text-white shadow-lg">
              <RefreshCcw className="h-5 w-5 animate-spin" />
            </div>
            <div>
              <div className="text-base font-semibold text-slate-900">Carregando Central de Comando…</div>
              <div className="text-sm text-slate-500">Organizando seus alertas, eventos e indicadores.</div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ActionCard = ({
    title,
    desc,
    icon,
    to,
  }: {
    title: string;
    desc: string;
    icon: React.ReactNode;
    to: string;
  }) => (
    <button
      type="button"
      onClick={() => nav(to)}
      className="group rounded-2xl border border-slate-200/80 bg-white/75 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#B5A573]/70 hover:bg-white hover:shadow-[0_18px_45px_rgba(15,23,42,0.10)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#1E293F]/95 text-white shadow-md transition-colors group-hover:bg-[#A11C27]">
            {icon}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{desc}</div>
          </div>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-[#A11C27]" />
      </div>
    </button>
  );

  const StatCard = ({
    label,
    value,
    helper,
    icon,
    to,
    featured = false,
  }: {
    label: string;
    value: React.ReactNode;
    helper?: React.ReactNode;
    icon: React.ReactNode;
    to?: string;
    featured?: boolean;
  }) => (
    <Card className={`${softCard} group ${featured ? "border-[#B5A573]/50 bg-gradient-to-br from-white via-white to-[#F5F5F5]" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{label}</div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{value}</div>
            {helper ? <div className="mt-1 text-sm text-slate-500">{helper}</div> : null}
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1E293F] text-white shadow-lg shadow-slate-900/15">
            {icon}
          </div>
        </div>
        {to ? (
          <Button className={`mt-5 w-full ${subtleButton}`} onClick={() => nav(to)}>
            Abrir <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );

  const alertTone = (kind?: MeuDiaAlert["icon"]) => {
    if (kind === "alert") return "border-red-200/80 bg-red-50/80 text-red-900";
    if (kind === "ticket") return "border-amber-200/80 bg-amber-50/85 text-amber-900";
    if (kind === "trophy") return "border-emerald-200/80 bg-emerald-50/85 text-emerald-900";
    if (kind === "gift") return "border-pink-200/80 bg-pink-50/80 text-pink-900";
    return "border-slate-200/80 bg-white/85 text-slate-900";
  };

  const MeuDiaCard = (
    <Card id="meu-dia" className={`${glassCard} border-[#B5A573]/40 bg-gradient-to-br from-white/90 via-white/80 to-[#F5F5F5]/80`}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#A11C27]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-10 h-52 w-52 rounded-full bg-[#B5A573]/20 blur-3xl" />
      <CardHeader className="relative pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#A11C27] text-white shadow-md">
                <Bell className="h-4 w-4" />
              </span>
              Meu Dia
            </CardTitle>
            <div className="mt-1 text-sm text-slate-500">
              Sua central de ação: cobranças, grupos, aniversários, comissões e alertas operacionais.
            </div>
          </div>
          <Badge className="w-fit rounded-full border border-[#B5A573]/50 bg-[#B5A573]/15 px-3 py-1 text-[#1E293F]">
            {kpi.myDayCount} alerta(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-3">
        {myDayAlerts.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">
            Nenhum alerta operacional para hoje. Dia limpo para prospectar, vender e fortalecer relacionamento. 👏
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {myDaySlice.map((a) => (
                <div key={a.id} className={`rounded-2xl border p-4 shadow-sm ${alertTone(a.icon)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/85 shadow-sm">
                        {alertIcon(a.icon)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold leading-snug">{a.title}</div>
                        {a.desc ? <div className="mt-1 text-xs leading-relaxed opacity-80">{a.desc}</div> : null}
                      </div>
                    </div>
                    {a.action ? (
                      <Button
                        size="sm"
                        className="shrink-0 rounded-xl border border-white/70 bg-white/85 text-slate-900 shadow-sm hover:bg-white"
                        onClick={() => {
                          if (a.action?.to) nav(a.action.to);
                          else if (a.action?.href) window.open(a.action.href, "_blank");
                        }}
                      >
                        {a.action.label} <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200/70 pt-3">
              <div className="text-xs text-slate-500">Página {myDayPage + 1} de {myDayPageCount}</div>
              <div className="flex items-center gap-2">
                <Button size="sm" className={subtleButton} onClick={() => setMyDayPage((p) => Math.max(0, p - 1))} disabled={myDayPage <= 0}>
                  Anterior
                </Button>
                <Button size="sm" className={subtleButton} onClick={() => setMyDayPage((p) => Math.min(myDayPageCount - 1, p + 1))} disabled={myDayPage >= myDayPageCount - 1}>
                  Próxima
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[radial-gradient(circle_at_top_left,rgba(161,28,39,0.13),transparent_32%),radial-gradient(circle_at_top_right,rgba(181,165,115,0.18),transparent_30%),linear-gradient(135deg,#F8FAFC,#F5F5F5_42%,#EEF2F7)] p-3 text-slate-900 md:p-4 xl:p-5">
      <div className="mx-auto w-full max-w-[1920px] space-y-6">
        <Card className={`${glassCard} border-white/70 bg-gradient-to-br from-[#1E293F] via-[#26344f] to-[#A11C27] text-white`}>
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[#B5A573]/25 blur-3xl" />
          <CardContent className="relative p-6 md:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <Badge className="mb-3 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-white shadow-sm backdrop-blur">
                  Central de Comando Consulmax
                </Badge>
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Bem-vindo(a), {me?.nome?.split(" ")?.[0] || "Max"} 👋
                </h1>
                <p className="mt-2 text-sm text-white/75 md:text-base">
                  Hoje é <span className="font-semibold text-white">{rangeToday.br}</span>. Você tem <span className="font-semibold text-[#E0CE8C]">{kpi.myDayCount}</span> ação(ões) importante(s) para movimentar a operação.
                </p>

                <div className="mt-4 max-w-4xl rounded-2xl border border-white/15 bg-white/10 p-4 shadow-sm backdrop-blur">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-[#E0CE8C] shadow-sm">
                      <MessageCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Pensamento do Dia</div>
                      <div className="mt-1 text-sm leading-relaxed text-white/88 md:text-base">“{thoughtOfDay || FALLBACK_THOUGHTS[0]}”</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
                {canManageTeam && (
                  <div className="min-w-[260px]">
                    <Select value={vendorScope} onValueChange={setVendorScope}>
                      <SelectTrigger className="rounded-2xl border border-white/20 bg-white/10 text-white shadow-sm backdrop-blur placeholder:text-white/70">
                        <SelectValue placeholder="Vendedor: Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>{isMatrixAdmin ? "Todos (Matriz)" : "Todos da unidade"}</SelectItem>
                        {selectableUsers
                          .filter((u) => (u.role || u.user_role || "").toLowerCase() !== "viewer")
                          .map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button className="rounded-2xl border border-white/20 bg-white/10 text-white shadow-sm backdrop-blur hover:bg-white/20" onClick={() => reload(true)} disabled={refreshing}>
                  <RefreshCcw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <div className="text-xs uppercase tracking-[0.16em] text-white/60">Meu Dia</div>
                <div className="mt-1 text-2xl font-bold">{kpi.myDayCount}</div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <div className="text-xs uppercase tracking-[0.16em] text-white/60">Oportunidades</div>
                <div className="mt-1 text-2xl font-bold">{kpi.openOppCount}</div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <div className="text-xs uppercase tracking-[0.16em] text-white/60">Agenda hoje</div>
                <div className="mt-1 text-2xl font-bold">{kpi.todayEventsCount}</div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <div className="text-xs uppercase tracking-[0.16em] text-white/60">Carteira</div>
                <div className="mt-1 text-lg font-bold">{fmtBRL(kpi.carteiraAtivaTotal)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {errMsg ? (
          <Card className={`${glassCard} border-red-200 bg-red-50/80`}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4" /> Erro ao carregar o painel
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-700">
              <div className="mb-2">Copia essa mensagem e me manda:</div>
              <pre className="whitespace-pre-wrap break-words rounded-2xl border border-red-100 bg-white/80 p-3 text-xs text-slate-800">{errMsg}</pre>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Meu Dia" value={kpi.myDayCount} helper="ações para hoje" icon={<Bell className="h-5 w-5" />} featured />
          <StatCard label="Oportunidades" value={kpi.openOppCount} helper={fmtBRL(kpi.openOppTotal)} icon={<AlertTriangle className="h-5 w-5" />} to="/oportunidades" />
          <StatCard label="Agenda" value={kpi.todayEventsCount} helper={canManageTeam && vendorScope !== ALL ? `Filtrado: ${scopedUser?.nome || "—"}` : isMatrixAdmin ? "Visão geral" : isBranchManager ? "Sua unidade" : "Somente seus eventos"} icon={<Calendar className="h-5 w-5" />} to="/agenda" />
          <Card className={softCard}>
            <CardContent className="flex items-center gap-4 p-5">
              <Donut pct={kpi.monthSalesPct} size={112} stroke={10} centerTop={`${kpi.monthSalesPct.toFixed(1).replace(".", ",")}%`} centerBottom="da meta" />
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Meta x Vendas</div>
                <div className="mt-2 text-sm text-slate-500">Realizado</div>
                <div className="text-base font-bold text-slate-950">{fmtBRL(kpi.monthSalesTotal)}</div>
                <div className="mt-1 text-xs text-slate-500">Meta: {fmtBRL(kpi.monthSalesMeta)}</div>
              </div>
            </CardContent>
          </Card>
          <StatCard label="Carteira ativa" value={fmtBRL(kpi.carteiraAtivaTotal)} helper="cotas ativas" icon={<Wallet className="h-5 w-5" />} to="/carteira" />
        </div>

        {MeuDiaCard}

        <Card className={`${glassCard} border-[#B5A573]/40 bg-gradient-to-br from-white via-white to-[#F8F5EC]`}>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-slate-950">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#1E293F] text-white shadow-md">
                    <HeartPulse className="h-4 w-4" />
                  </span>
                  Saúde da Carteira
                </CardTitle>
                <div className="mt-1 text-sm text-slate-500">MAX acompanha inadimplência, intenção de regularização e recuperação de cancelados. Clique em qualquer indicador para ver os clientes.</div>
              </div>
              <Badge className="w-fit rounded-full border border-[#B5A573]/50 bg-[#B5A573]/15 px-3 py-1 text-[#1E293F]">
                2 réguas automáticas
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { key: "friendly" as CarteiraHealthKey, label: "1–30 dias", value: carteiraHealth.friendlyCount, helper: `${fmtBRL(carteiraHealth.friendlyValue)} em crédito`, tone: "border-amber-200 bg-amber-50/70 hover:bg-amber-50" },
                { key: "reparcel" as CarteiraHealthKey, label: "31–60 dias", value: carteiraHealth.reparcelCount, helper: `${fmtBRL(carteiraHealth.reparcelValue)} em crédito`, tone: "border-orange-200 bg-orange-50/70 hover:bg-orange-50" },
                { key: "critical" as CarteiraHealthKey, label: "+60 dias", value: carteiraHealth.criticalCount, helper: `${fmtBRL(carteiraHealth.criticalValue)} em crédito`, tone: "border-red-200 bg-red-50/70 hover:bg-red-50" },
                { key: "risk" as CarteiraHealthKey, label: "Risco D+80", value: carteiraHealth.riskCount, helper: "próximos da referência D+90", tone: "border-rose-300 bg-rose-50/80 hover:bg-rose-50" },
              ].map((item) => (
                <button type="button" key={item.key} onClick={() => setCarteiraHealthModal(item.key)} className={`group rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#A11C27]/30 ${item.tone}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">{item.label}</div>
                      <div className="mt-2 text-2xl font-black text-slate-950">{item.value}</div>
                      <div className="mt-1 text-xs text-slate-600">{item.helper}</div>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-700" />
                  </div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <button type="button" onClick={() => setCarteiraHealthModal("regularized")} className="group rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-left transition-all hover:-translate-y-0.5 hover:bg-emerald-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-300">
                <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Regularizados no mês</div><ArrowRight className="h-4 w-4 text-emerald-500 transition-transform group-hover:translate-x-0.5" /></div>
                <div className="mt-2 text-xl font-black text-emerald-950">{carteiraHealth.regularizedMonth}</div>
              </button>
              <button type="button" onClick={() => setCarteiraHealthModal("recovery")} className="group rounded-2xl border border-slate-200 bg-white/80 p-4 text-left transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300">
                <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><RotateCcw className="h-4 w-4" /> Cancelados em recuperação</div><ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" /></div>
                <div className="mt-2 text-xl font-black text-slate-950">{carteiraHealth.recoveryCount}</div>
              </button>
              <button type="button" onClick={() => setCarteiraHealthModal("highIntent")} className="group rounded-2xl border border-violet-200 bg-violet-50/70 p-4 text-left transition-all hover:-translate-y-0.5 hover:bg-violet-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-300">
                <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-semibold text-violet-800"><MousePointerClick className="h-4 w-4" /> Alta intenção · 7 dias</div><ArrowRight className="h-4 w-4 text-violet-500 transition-transform group-hover:translate-x-0.5" /></div>
                <div className="mt-2 text-xl font-black text-violet-950">{carteiraHealth.highIntent7d}</div>
              </button>
              <button type="button" onClick={() => setCarteiraHealthModal("communications")} className="group rounded-2xl border border-[#B5A573]/50 bg-[#B5A573]/10 p-4 text-left transition-all hover:-translate-y-0.5 hover:bg-[#B5A573]/15 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#B5A573]/50">
                <div className="flex items-center justify-between gap-2"><div className="text-xs font-semibold text-slate-700">Comunicações MAX · mês</div><ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5" /></div>
                <div className="mt-2 text-xl font-black text-slate-950">{carteiraHealth.emailsSentMonth}</div>
                <div className="mt-1 text-[11px] text-slate-500">{carteiraHealth.maxRecoveredMonth} recuperação(ões) após contato MAX</div>
              </button>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 md:flex-row md:items-center md:justify-between">
              <div className="text-xs leading-relaxed text-slate-600">
                <strong className="text-slate-900">Inadimplência:</strong> 1–30 amigável · 31–60 verificação de reparcelamento · +60 comunicação crítica até a baixa real.
                <span className="mx-2 text-slate-300">|</span>
                <strong className="text-slate-900">Cancelados:</strong> recuperação automática a cada 20 dias.
              </div>
              <Button className={subtleButton} onClick={() => nav("/carteira")}>Abrir Carteira <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={Boolean(carteiraHealthModal)} onOpenChange={(open) => { if (!open) setCarteiraHealthModal(null); }}>
          <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-950">
                <HeartPulse className="h-5 w-5 text-[#A11C27]" />
                {carteiraHealthModal ? CARTEIRA_HEALTH_META[carteiraHealthModal].title : "Saúde da Carteira"}
              </DialogTitle>
              <div className="text-sm text-slate-500">
                {carteiraHealthModal ? CARTEIRA_HEALTH_META[carteiraHealthModal].description : ""}
              </div>
            </DialogHeader>

            <div className="space-y-3">
              {carteiraHealthModal && carteiraHealthLists[carteiraHealthModal].length === 0 ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 text-sm text-emerald-900">Nenhum cliente neste indicador agora.</div>
              ) : null}

              {carteiraHealthModal ? carteiraHealthLists[carteiraHealthModal].map((item, index) => {
                const wa = whatsappHref(item.telefone);
                return (
                  <div key={`${item.vendaId}:${item.sentAt || item.clickedAt || index}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-bold text-slate-950">{item.cliente}</div>
                          {item.statusLabel ? <Badge className="rounded-full border border-slate-200 bg-slate-50 text-slate-700">{item.statusLabel}</Badge> : null}
                          {item.clickCount ? <Badge className="rounded-full border border-violet-200 bg-violet-50 text-violet-700">{item.clickCount} clique(s)</Badge> : null}
                        </div>
                        <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                          <div><span className="font-semibold text-slate-800">Grupo/Cota:</span> {item.grupo || "—"}/{item.cota || "—"}</div>
                          <div><span className="font-semibold text-slate-800">Produto:</span> {item.segmento || "—"}</div>
                          <div><span className="font-semibold text-slate-800">Administradora:</span> {item.administradora || "—"}</div>
                          {typeof item.dias === "number" ? <div><span className="font-semibold text-slate-800">Dias:</span> {item.dias}</div> : null}
                          {item.vendedorNome ? <div><span className="font-semibold text-slate-800">Responsável:</span> {item.vendedorNome}</div> : null}
                          {item.ctaType ? <div><span className="font-semibold text-slate-800">CTA:</span> {ctaLabel(item.ctaType)}</div> : null}
                          {item.sentAt ? <div><span className="font-semibold text-slate-800">Enviado:</span> {fmtDTForOffset(item.sentAt, PV_OFFSET_MIN)}</div> : null}
                          {item.clickedAt ? <div><span className="font-semibold text-slate-800">Último clique:</span> {fmtDTForOffset(item.clickedAt, PV_OFFSET_MIN)}</div> : null}
                          {item.milestone ? <div><span className="font-semibold text-slate-800">Marco:</span> D+{item.milestone}</div> : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {item.leadId ? (
                          <Button className={subtleButton} onClick={() => { setCarteiraHealthModal(null); nav(`/clientes?lead_id=${encodeURIComponent(item.leadId || "")}`); }}>
                            Ver cliente
                          </Button>
                        ) : null}
                        {wa ? (
                          <Button className={primaryButton} onClick={() => window.open(wa, "_blank", "noopener,noreferrer")}>
                            <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                          </Button>
                        ) : (
                          <Button className={subtleButton} disabled>Sem WhatsApp</Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }) : null}
            </div>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className={`${glassCard} xl:col-span-2`}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Rocket className="h-5 w-5 text-[#A11C27]" /> Ações rápidas
              </CardTitle>
              <div className="text-sm text-slate-500">Atalhos principais para movimentar venda, operação e relacionamento.</div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ActionCard title="Oportunidades" desc="Criar, qualificar e avançar negociações." icon={<Target className="h-5 w-5" />} to="/oportunidades" />
                <ActionCard title="Simular" desc="Montar estratégia de consórcio para o lead." icon={<Briefcase className="h-5 w-5" />} to="/simuladores" />
                <ActionCard title="Gerar Proposta" desc="Transformar simulação em proposta visual." icon={<FileText className="h-5 w-5" />} to="/propostas-pro-max" />
                <ActionCard title="Comissões" desc="Acompanhar pendências, fluxo e recibos." icon={<Trophy className="h-5 w-5" />} to="/comissoes" />
                <ActionCard title="Gestão de Grupos" desc="Sorteios, assembleias, lances e vencimentos." icon={<Calendar className="h-5 w-5" />} to="/gestao-de-grupos" />
                <ActionCard title="Contempladas" desc="Consultar estoque e solicitações de reserva." icon={<Ticket className="h-5 w-5" />} to="/estoque-contempladas" />
                <ActionCard title="Playbook" desc="Planejamento, scripts e rotina comercial." icon={<BookOpen className="h-5 w-5" />} to="/planejamento" />
                <ActionCard title="Links Úteis" desc="Materiais e acessos importantes." icon={<LinkIcon className="h-5 w-5" />} to="/links" />
                <ActionCard title="Relatórios" desc="Extrair dados para gestão e decisão." icon={<FileText className="h-5 w-5" />} to="/relatorios" />
              </div>
            </CardContent>
          </Card>

          <Card className={glassCard}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Target className="h-5 w-5 text-[#A11C27]" /> Alertas do sistema
              </CardTitle>
              <div className="text-sm text-slate-500">Resumo operacional para não deixar nada escapar.</div>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                ["Procedimentos novos", kpi.newProceduresCount],
                ["Grupos com evento hoje", kpi.todayGroupsCount],
                ["Grupos pendentes de cadastro", kpi.pendingGroupRegistrationCount],
                ["Vendas sem comissão", kpi.vendasSemComissaoCount],
                ["Comissões pendentes", kpi.commissionsPendingCount],
                ["Giro pendente", kpi.giroDueCount],
                ["Solicitações de reserva", kpi.openStockReqCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between rounded-2xl border border-slate-200/75 bg-white/70 px-3 py-2.5">
                  <div className="text-sm text-slate-700">{label}</div>
                  <Badge className="rounded-full border border-slate-200 bg-slate-50 text-slate-800">{value}</Badge>
                </div>
              ))}
              <div className="rounded-2xl border border-[#B5A573]/40 bg-[#B5A573]/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Total pendente</div>
                    <div className="text-xs text-slate-500">Comissões a receber</div>
                  </div>
                  <div className="text-right text-sm font-bold text-slate-950">{fmtBRL(kpi.commissionsPendingTotal)}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-emerald-950">Comissão programada</div>
                    <div className="text-xs text-emerald-700">{kpi.commissionScheduledDate ? fmtDateBRFromYMD(kpi.commissionScheduledDate) : "Sem data"}</div>
                  </div>
                  <div className="text-right text-sm font-bold text-emerald-950">{fmtBRL(kpi.commissionScheduledTotal)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className={glassCard}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <AlertTriangle className="h-5 w-5 text-[#A11C27]" /> Oportunidades atrasadas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {overdueOpps.length === 0 ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">Nada atrasado por aqui. 👏</div>
              ) : (
                overdueOpps.map((o) => (
                  <div key={o.id} className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950">{o.lead_nome || "Lead"}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {(o.estagio || "—") as any} • {typeof o.daysWaiting === "number" ? `${o.daysWaiting} dia(s) aguardando` : "—"}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-400">{o.lead_tel ? `Tel: ${o.lead_tel}` : "Sem telefone"}</div>
                      </div>
                      <div className="shrink-0 text-right text-sm font-bold text-slate-950">{fmtBRL(Number(o.valor_credito || 0) || 0)}</div>
                    </div>
                  </div>
                ))
              )}
              <Button className={`w-full ${primaryButton}`} onClick={() => nav("/oportunidades")}>Ver Oportunidades <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </CardContent>
          </Card>

          <Card className={glassCard}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Wallet className="h-5 w-5 text-[#A11C27]" /> Giros pendentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {giroAll.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-500">
                  {kpi.giroDueCount > 0 ? `Você tem ${kpi.giroDueCount} giro(s) pendente(s).` : "Sem giros pendentes no momento."}
                </div>
              ) : (
                <>
                  {giroSlice.map((g) => (
                    <div key={g.id} className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-950">{g.nome}</div>
                          <div className="truncate text-xs text-slate-500">Carteira ativa: {fmtBRL(Number(g.carteiraAtiva || 0) || 0)}</div>
                        </div>
                        <Button size="sm" className={subtleButton} onClick={() => nav("/giro-de-carteira")}>Abrir</Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-slate-200/70 pt-3">
                    <div className="text-xs text-slate-500">Página {giroPage + 1} de {giroPageCount}</div>
                    <div className="flex gap-2">
                      <Button size="sm" className={subtleButton} onClick={() => setGiroPage((p) => Math.max(0, p - 1))} disabled={giroPage <= 0}>Anterior</Button>
                      <Button size="sm" className={subtleButton} onClick={() => setGiroPage((p) => Math.min(giroPageCount - 1, p + 1))} disabled={giroPage >= giroPageCount - 1}>Próxima</Button>
                    </div>
                  </div>
                </>
              )}
              <Button className={`w-full ${primaryButton}`} onClick={() => nav("/giro-de-carteira")}>Abrir Giro <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </CardContent>
          </Card>

          <Card className={glassCard}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Calendar className="h-5 w-5 text-[#A11C27]" /> Próximos eventos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {eventsAll.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-500">Sem eventos futuros para esta semana.</div>
              ) : (
                <>
                  {eventsSlice.map((e) => (
                    <div key={e.id} className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge className={`${flagBadgeClass(e.flag)} rounded-full`}>{e.flag}</Badge>
                            <div className="text-xs text-slate-500">{e.whenLabel}</div>
                          </div>
                          <div className="mt-2 truncate text-sm font-semibold text-slate-950">{e.title}</div>
                          {e.desc ? <div className="mt-0.5 truncate text-xs text-slate-500">{e.desc}</div> : null}
                        </div>
                        {e.action ? (
                          <Button size="sm" className={subtleButton} onClick={() => { if (e.action?.to) nav(e.action.to); else if (e.action?.href) window.open(e.action.href, "_blank"); }}>
                            Abrir
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-slate-200/70 pt-3">
                    <div className="text-xs text-slate-500">Página {eventsPage + 1} de {eventsPageCount}</div>
                    <div className="flex gap-2">
                      <Button size="sm" className={subtleButton} onClick={() => setEventsPage((p) => Math.max(0, p - 1))} disabled={eventsPage <= 0}>Anterior</Button>
                      <Button size="sm" className={subtleButton} onClick={() => setEventsPage((p) => Math.min(eventsPageCount - 1, p + 1))} disabled={eventsPage >= eventsPageCount - 1}>Próxima</Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
