// src/pages/Inicio.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLocation, useNavigate } from "react-router-dom";

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
  Bell,
  Gift,
  Ticket,
  Trophy,
} from "lucide-react";

/** ===================== Tipos ===================== */
type UserRow = { id: string; auth_user_id: string; nome: string; role?: string | null; user_role?: string | null; is_active?: boolean | null };
type AgendaRow = { id: string; tipo: string; titulo: string; inicio_at: string; fim_at: string; user_id: string | null; cliente_nome?: string | null; lead_nome?: string | null; telefone?: string | null; videocall_url?: string | null };
type OppRow = { id: string; segmento: string | null; valor_credito: number | null; estagio: string | null; score: number | null; expected_close_at: string | null; vendedor_id: string; lead_id: string };
type LeadRow = { id: string; nome: string; telefone?: string | null };
type GroupRow = { id: string; administradora: string; segmento: string; codigo: string; participantes?: number | null; prox_vencimento: string | null; prox_sorteio: string | null; prox_assembleia: string | null };
type LastAssemblyRow = { group_id: string; date: string | null; ll_high?: number | null; ll_low?: number | null; median?: number | null; reference_number?: number | null };
type ClienteRow = { id: string; nome: string; data_nascimento: string | null; telefone?: string | null };
type GiroDueRow = { owner_auth_id: string; due_count: number };
type GiroItemRow = { id?: string | null; lead_id?: string | null; cliente_id?: string | null; cliente_nome?: string | null; lead_nome?: string | null; nome?: string | null; telefone?: string | null; carteira_ativa_total?: number | null; valor_carteira_ativa?: number | null; owner_auth_id?: string | null };
type KBProcRow = { id: string; title?: string | null; titulo?: string | null; status?: string | null; created_at?: string | null; updated_at?: string | null };
type CommissionRow = { id: string; venda_id: string; vendedor_id: string; valor_total: number | null; base_calculo?: number | null; percent_aplicado?: number | null; status: string | null; data_venda?: string | null };
type CommissionFlowRow = { id?: string; commission_id: string; mes?: number | null; percentual?: number | null; valor_previsto: number | null; valor_pago_vendedor: number | null; data_pagamento_vendedor: string | null };
type VendaMini = { id: string; vendedor_id: string; valor_venda?: number | null; data_venda?: string | null; encarteirada_em?: string | null; codigo?: string | null; cancelada_em?: string | null; segmento?: string | null; tabela?: string | null; administradora?: string | null; grupo?: string | null; cota?: string | null; status?: string | null; contemplada?: boolean | null; lead_id?: string | null; cliente_lead_id?: string | null; inad?: boolean | null; inad_em?: string | null; inad_revertida_em?: string | null };
type MeuDiaAlert = { id: string; priority: number; title: string; desc?: string | null; icon?: "bell" | "gift" | "ticket" | "trophy" | "alert"; action?: { label: string; to?: string; href?: string } };
type DateFlag = "Hoje" | "Amanhã" | "Esta Semana";
type NextEventItem = { id: string; whenSort: number; whenLabel: string; flag: DateFlag; title: string; desc?: string | null; action?: { label: string; to?: string; href?: string } };

const ALL = "__all__";
const PV_OFFSET_MIN = -4 * 60;

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
function isAdmin(u?: UserRow | null) { return (u?.role || u?.user_role || "").toLowerCase() === "admin"; }
function humanErr(e: any) { if (!e) return "Erro desconhecido."; if (typeof e === "string") return e; return String(e?.message || e?.error_description || e?.details || e?.hint || JSON.stringify(e)); }
function metaFieldForMonth(month: number) { return `m${String(month).padStart(2, "0")}` as any; }
function daysDiffYMD(a: string, b: string) { if (!a || !b) return 0; const [ay, am, ad] = a.slice(0, 10).split("-").map(Number); const [by, bm, bd] = b.slice(0, 10).split("-").map(Number); return Math.round((Date.UTC(ay, am - 1, ad, 12) - Date.UTC(by, bm - 1, bd, 12)) / 86400000); }
function weekdayYMD(ymd: string) { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay(); }
function isBillingRuleDay(ymd: string) { const w = weekdayYMD(ymd); return w === 2 || w === 4; }
function normalizeText(v?: string | null) { return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(); }
function isOpenOpportunityStage(v?: string | null) { const s = normalizeText(v); return ["novo", "qualificando", "qualificacao", "proposta", "negociacao"].includes(s); }
function stripAccents(s: string) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function normalizeAdmin(raw?: string | null): string { const s = stripAccents(String(raw ?? "")).toLowerCase(); const cleaned = s.replace(/consorcios?|consorcio|holding|sa|s\/a|s\.a\.?/g, "").replace(/[^\w]/g, "").trim(); if (cleaned.includes("embracon")) return "Embracon"; if (cleaned.includes("hs")) return "HS"; if (cleaned.includes("maggi")) return "Maggi"; return (raw ?? "").toString().trim(); }
function normalizeGroupDigits(g?: string | number | null): string { const s = String(g ?? "").trim(); const first = s.split(/[\/\-\s]/)[0] || s; const m = first.match(/\d+/); if (m) return m[0]; return s.replace(/\D/g, ""); }
function groupKey(adm?: string | null, grp?: string | number | null) { return `${normalizeAdmin(adm)}::${normalizeGroupDigits(grp)}`; }
function isVendaCancelada(v?: { codigo?: string | null; cancelada_em?: string | null }) { if (!v) return false; if (v.codigo === "00") return false; if (v.codigo && v.codigo !== "00") return true; if (v.cancelada_em) return true; return false; }
function totalCommissionGross(c: CommissionRow) { return Number(c.valor_total ?? ((Number(c.base_calculo) || 0) * (Number(c.percent_aplicado) || 0))) || 0; }
function paidCommissionGross(flow: CommissionFlowRow[]) { return flow.reduce((acc, f) => acc + (Number(f.valor_pago_vendedor) || 0), 0); }
function pendingCommissionGross(c: CommissionRow, flow: CommissionFlowRow[]) { return Math.max(0, totalCommissionGross(c) - paidCommissionGross(flow)); }
function fmtPct4(v: number | null | undefined) { if (v == null) return "—"; return `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`; }
function groupListLabel(groups: Array<{ codigo?: string | null }>, max = 6) { const codes = Array.from(new Set(groups.map((g) => String(g.codigo || "").trim()).filter(Boolean))); if (!codes.length) return "—"; const head = codes.slice(0, max).join(", "); return codes.length > max ? `${head} +${codes.length - max}` : head; }
function hasDraw(drawsByDate: Map<string, boolean>, dateRaw?: string | null) { const d = toYMD(dateRaw); return Boolean(d && drawsByDate.get(d)); }
function lastAsmInfo(lastAsmByGroup: Map<string, LastAssemblyRow>, groupId: string) { const r = lastAsmByGroup.get(groupId); if (!r) return "Sem apuração anterior"; const med = r.median ?? (r.ll_high != null && r.ll_low != null ? (r.ll_high + r.ll_low) / 2 : null); return `Última apuração: ${fmtDateBRFromYMD(r.date)}${med != null ? ` • Mediana: ${fmtPct4(med)}` : ""}${r.reference_number != null ? ` • Ref: ${r.reference_number}` : ""}`; }

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
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const [vendorScope, setVendorScope] = useState<string>(ALL);
  const scopedUser = useMemo(() => (vendorScope === ALL ? null : usersById.get(vendorScope) || null), [vendorScope, usersById]);

  const rangeToday = useMemo(() => { const ymd = ymdFromDateInOffset(new Date(), PV_OFFSET_MIN); const { startISO, endISO } = rangeISOForDayInOffset(ymd, PV_OFFSET_MIN); return { ymd, br: fmtDateBRFromYMD(ymd), startISO, endISO }; }, []);
  const rangeMonth = useMemo(() => monthRangeYMDFromOffset(new Date(), PV_OFFSET_MIN), []);
  const OPEN_STAGES = useMemo(() => ["Novo", "Qualificando", "Qualificação", "Qualificacao", "Proposta", "Negociação", "Negociacao"], []);

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
    const { data: meRow, error: meErr } = await supabase.from("users").select("id,auth_user_id,nome,role,user_role,is_active").eq("auth_user_id", authId).maybeSingle();
    if (meErr) throw meErr;
    if (!meRow) throw new Error("Usuário não encontrado na tabela users.");
    const { data: usersRows, error: usersErr } = await supabase.from("users").select("id,auth_user_id,nome,role,user_role,is_active").eq("is_active", true).order("nome", { ascending: true });
    if (usersErr) throw usersErr;
    return { meRow: meRow as UserRow, usersRows: (usersRows || []) as UserRow[], admin: isAdmin(meRow), initialScope: isAdmin(meRow) ? ALL : meRow.id };
  }

  async function tryLoadLeadsMap(ids: string[]) {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (!uniq.length) return new Map<string, LeadRow>();
    try { const { data, error } = await supabase.from("leads").select("id,nome,telefone").in("id", uniq); if (!error && data) return new Map((data as any[]).map((l) => [l.id, l as LeadRow])); } catch {}
    try { const { data, error } = await supabase.from("lead").select("id,nome,telefone").in("id", uniq); if (!error && data) return new Map((data as any[]).map((l) => [l.id, l as LeadRow])); } catch {}
    return new Map<string, LeadRow>();
  }

  async function loadDashboard(scopeUserId: string, scopeAuthId: string, admin: boolean) {
    const today = rangeToday.ymd;
    const tomorrow = addDaysYMD(today, 1);
    const yesterday = addDaysYMD(today, -1);
    const endWeek = addDaysYMD(today, 6);
    const windowStartISO = rangeISOForDayInOffset(today, PV_OFFSET_MIN).startISO;
    const windowEndISO = rangeISOForDayInOffset(endWeek, PV_OFFSET_MIN).endISO;

    let openOppQ = supabase.from("opportunities").select("id,segmento,valor_credito,estagio,score,expected_close_at,vendedor_id,lead_id").in("estagio", OPEN_STAGES).limit(5000);
    if (!admin) openOppQ = openOppQ.eq("vendedor_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) openOppQ = openOppQ.eq("vendedor_id", scopeAuthId);
    const { data: openOppRowsRaw, error: openOppErr } = await openOppQ;
    if (openOppErr) throw openOppErr;
    const openOppRows = ((openOppRowsRaw || []) as any as OppRow[]).filter((o) => isOpenOpportunityStage(o.estagio));
    const openOppCount = openOppRows.length;
    const openOppTotal = openOppRows.reduce((acc, r) => acc + (Number(r.valor_credito || 0) || 0), 0);
    const overdueComputed = openOppRows.filter((o) => Boolean(toYMD(o.expected_close_at)) && (toYMD(o.expected_close_at) as string) < today).map((o) => ({ ...o, daysWaiting: Math.max(0, daysDiffYMD(today, toYMD(o.expected_close_at) as string)) })).sort((a, b) => (b.daysWaiting || 0) - (a.daysWaiting || 0)).slice(0, 10);
    const leadsMap = await tryLoadLeadsMap(Array.from(new Set(overdueComputed.map((o) => o.lead_id).filter(Boolean))));
    const overdueOppsEnriched = overdueComputed.map((o) => { const ld = leadsMap.get(o.lead_id); return { ...o, lead_nome: ld?.nome, lead_tel: ld?.telefone || null }; });

    let agQ = supabase.from("v_agenda_eventos_enriquecida").select("id,tipo,titulo,inicio_at,fim_at,user_id,cliente_nome,lead_nome,telefone,videocall_url").gte("inicio_at", windowStartISO).lte("inicio_at", windowEndISO).order("inicio_at", { ascending: true }).limit(200);
    if (!admin) agQ = agQ.eq("user_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) agQ = agQ.eq("user_id", scopeAuthId);
    const { data: agRows, error: agErr } = await agQ;
    if (agErr) throw agErr;
    const todayEventsCount = (agRows || []).filter((e: any) => { const t = new Date(e.inicio_at).toISOString(); return t >= rangeToday.startISO && t <= rangeToday.endISO; }).length;

    const { data: groupRowsRaw, error: groupsErr } = await supabase.from("groups").select("id,administradora,segmento,codigo,participantes,prox_vencimento,prox_sorteio,prox_assembleia").limit(5000);
    if (groupsErr) throw groupsErr;
    const groupRows = (groupRowsRaw || []) as any as GroupRow[];
    const groupVencYMD = (g: GroupRow) => toYMD(g.prox_vencimento);
    const groupSorteioYMD = (g: GroupRow) => toYMD(g.prox_sorteio);
    const groupAsmYMD = (g: GroupRow) => groupAssemblyYMD(g.prox_assembleia);
    const groupsToday = groupRows.filter((g) => [groupVencYMD(g), groupSorteioYMD(g), groupAsmYMD(g)].includes(today));
    const todayGroupsCount = groupsToday.length;
    const groupsWindow = groupRows.filter((g) => [groupVencYMD(g), groupSorteioYMD(g), groupAsmYMD(g)].filter(Boolean).some((d) => (d as string) >= today && (d as string) <= endWeek));

    const realGroupKeys = new Set(groupRows.map((g) => groupKey(g.administradora, g.codigo)));
    const sorteioDates = Array.from(new Set(groupRows.map((g) => toYMD(g.prox_sorteio)).filter(Boolean) as string[]));
    const drawsByDate = new Map<string, boolean>();
    if (sorteioDates.length) { const { data: draws, error: drawsErr } = await supabase.from("lottery_draws").select("draw_date").in("draw_date", sorteioDates); if (drawsErr) throw drawsErr; (draws || []).forEach((d: any) => drawsByDate.set(toYMD(d.draw_date) as string, true)); }

    const lastAsmByGroup = new Map<string, LastAssemblyRow>();
    const realGroupIds = groupRows.map((g) => g.id).filter(Boolean);
    if (realGroupIds.length) { const { data: lastAsm, error: lastAsmErr } = await supabase.from("v_group_last_assembly").select("group_id,date,ll_high,ll_low,median,reference_number").in("group_id", realGroupIds); if (!lastAsmErr) (lastAsm || []).forEach((r: any) => lastAsmByGroup.set(r.group_id, r as LastAssemblyRow)); }

    const { startYMD, endYMD, year, month } = rangeMonth;
    let salesQ = supabase.from("vendas").select("valor_venda,vendedor_id,data_venda").gte("data_venda", startYMD).lt("data_venda", endYMD);
    if (!admin) salesQ = salesQ.eq("vendedor_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) salesQ = salesQ.eq("vendedor_id", scopeAuthId);
    const { data: salesRows, error: salesErr } = await salesQ;
    if (salesErr) throw salesErr;
    const monthSalesTotal = (salesRows || []).reduce((acc: number, r: any) => acc + (Number(r.valor_venda || 0) || 0), 0);

    const field = metaFieldForMonth(month);
    let metaQ = supabase.from("metas_vendedores").select(`vendedor_id,ano,${field}`).eq("ano", year);
    if (!admin) metaQ = metaQ.eq("vendedor_id", scopeUserId);
    if (admin && scopeUserId !== ALL) metaQ = metaQ.eq("vendedor_id", scopeUserId);
    const { data: metaRows, error: metaErr } = await metaQ;
    if (metaErr) throw metaErr;
    const monthSalesMeta = (metaRows || []).reduce((acc: number, r: any) => acc + (Number(r?.[field] || 0) || 0), 0);
    const monthSalesPct = monthSalesMeta > 0 ? Math.min(100, Math.max(0, (monthSalesTotal / monthSalesMeta) * 100)) : 0;

    let cartQ = supabase.from("vendas").select("valor_venda,vendedor_id,codigo").eq("codigo", "00");
    if (!admin) cartQ = cartQ.eq("vendedor_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) cartQ = cartQ.eq("vendedor_id", scopeAuthId);
    const { data: cartRows, error: cartErr } = await cartQ;
    if (cartErr) throw cartErr;
    const carteiraAtivaTotal = (cartRows || []).reduce((acc: number, r: any) => acc + (Number(r.valor_venda || 0) || 0), 0);

    let reqQ = supabase.from("stock_reservation_requests").select("id").eq("status", "aberta").limit(1000);
    if (!admin) reqQ = reqQ.eq("vendor_id", scopeUserId);
    if (admin && scopeUserId !== ALL) reqQ = reqQ.eq("vendor_id", scopeUserId);
    const { data: reqRows, error: reqErr } = await reqQ;
    if (reqErr) throw reqErr;
    const openStockReqCount = (reqRows || []).length;

    let commQ = supabase.from("commissions").select("id,venda_id,vendedor_id,valor_total,base_calculo,percent_aplicado,status,data_venda").limit(5000);
    if (!admin) commQ = commQ.eq("vendedor_id", scopeUserId);
    if (admin && scopeUserId !== ALL) commQ = commQ.eq("vendedor_id", scopeUserId);
    const { data: commRowsRaw, error: commErr } = await commQ;
    if (commErr) throw commErr;
    const commRows = (commRowsRaw || []) as any as CommissionRow[];
    const commIds = commRows.map((c) => c.id);
    const vendaIdsWithComm = new Set(commRows.map((c) => c.venda_id).filter(Boolean));

    let flowRows: CommissionFlowRow[] = [];
    if (commIds.length) { const { data: flowData, error: flowErr } = await supabase.from("commission_flow").select("id,commission_id,mes,percentual,valor_previsto,valor_pago_vendedor,data_pagamento_vendedor").in("commission_id", commIds).order("mes", { ascending: true }); if (flowErr) throw flowErr; flowRows = (flowData || []) as any as CommissionFlowRow[]; }
    const flowByCommission = new Map<string, CommissionFlowRow[]>();
    for (const f of flowRows) { if (!flowByCommission.has(f.commission_id)) flowByCommission.set(f.commission_id, []); flowByCommission.get(f.commission_id)!.push(f); }
    const vendaIds = Array.from(new Set(commRows.map((c) => c.venda_id).filter(Boolean)));
    const vendasById = new Map<string, VendaMini>();
    if (vendaIds.length) { const { data: vendasExtras, error: vendasExtrasErr } = await supabase.from("vendas").select("id,vendedor_id,codigo,cancelada_em").in("id", vendaIds); if (vendasExtrasErr) throw vendasExtrasErr; (vendasExtras || []).forEach((v: any) => vendasById.set(v.id, v as VendaMini)); }
    const operationalCommissions = commRows.filter((c) => c.status !== "estorno" && !isVendaCancelada(vendasById.get(c.venda_id)));
    const pendingCommissions = operationalCommissions.map((c) => ({ c, pending: pendingCommissionGross(c, flowByCommission.get(c.id) || []) })).filter((x) => x.pending > 0.009);
    const commissionsPendingCount = pendingCommissions.length;
    const commissionsPendingTotal = pendingCommissions.reduce((acc, x) => acc + x.pending, 0);

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
    const scheduledDates = Array.from(scheduledByDate.keys()).filter((d) => d >= today).sort();
    const commissionScheduledDate = scheduledDates[0] || null;
    const commissionScheduledTotal = commissionScheduledDate ? scheduledByDate.get(commissionScheduledDate) || 0 : 0;

    let vendasSemQ = supabase.from("vendas").select("id,data_venda,vendedor_id,segmento,tabela,administradora,grupo,valor_venda,numero_proposta,cliente_lead_id,lead_id,encarteirada_em,codigo,cancelada_em,status,contemplada").not("encarteirada_em", "is", null).order("data_venda", { ascending: false });
    if (!admin) vendasSemQ = vendasSemQ.eq("vendedor_id", scopeAuthId);
    if (admin && scopeAuthId !== ALL) vendasSemQ = vendasSemQ.eq("vendedor_id", scopeAuthId);
    const { data: vendasSemRows, error: vendasSemErr } = await vendasSemQ;
    if (vendasSemErr) throw vendasSemErr;
    const vendasSemComissaoCount = ((vendasSemRows || []) as any as VendaMini[]).filter((v) => !vendaIdsWithComm.has(v.id)).filter((v) => !isVendaCancelada(v)).length;
    const vendasForStubs = ((vendasSemRows || []) as any as VendaMini[]).filter((v) => !isVendaCancelada(v) && v.administradora && v.grupo);
    const missingGroupsMap = new Map<string, VendaMini>();
    vendasForStubs.forEach((v) => { const k = groupKey(v.administradora, v.grupo); if (!realGroupKeys.has(k) && !missingGroupsMap.has(k)) missingGroupsMap.set(k, v); });
    const pendingGroupRegistrationCount = missingGroupsMap.size;

    let giroDueCount = 0;
    if (admin && scopeAuthId === ALL) { const { data, error } = await supabase.from("v_giro_due_count").select("owner_auth_id,due_count"); if (error) throw error; giroDueCount = (data || []).reduce((acc: number, r: any) => acc + (Number(r?.due_count || 0) || 0), 0); } else { const { data, error } = await supabase.from("v_giro_due_count").select("owner_auth_id,due_count").eq("owner_auth_id", scopeAuthId).maybeSingle(); if (error) throw error; giroDueCount = (data as GiroDueRow | null)?.due_count || 0; }
    let giroList: { id: string; nome: string; carteiraAtiva: number }[] = [];
    try { let giroItemsQ = supabase.from("v_giro_due_items").select("id,lead_id,cliente_id,cliente_nome,lead_nome,nome,telefone,carteira_ativa_total,valor_carteira_ativa,owner_auth_id").limit(5000); if (!admin) giroItemsQ = giroItemsQ.eq("owner_auth_id", scopeAuthId); if (admin && scopeAuthId !== ALL) giroItemsQ = giroItemsQ.eq("owner_auth_id", scopeAuthId); const { data: giroItems, error: giroItemsErr } = await giroItemsQ; if (!giroItemsErr && giroItems) { giroList = (giroItems as any as GiroItemRow[]).map((r, idx) => ({ id: String(r.id || r.cliente_id || r.lead_id || `giro_${idx}`), nome: String((r.cliente_nome || r.lead_nome || r.nome || "Cliente") ?? "Cliente").trim(), carteiraAtiva: Number(r.valor_carteira_ativa ?? r.carteira_ativa_total ?? 0) || 0 })); giroList.sort((a, b) => (b.carteiraAtiva || 0) - (a.carteiraAtiva || 0)); } } catch { giroList = []; }

    const { data: allBirth, error: birthErr } = await supabase.from("clientes").select("id,nome,data_nascimento,telefone").not("data_nascimento", "is", null).limit(2000);
    if (birthErr) throw birthErr;
    const birthdayToday = ((allBirth || []) as ClienteRow[]).filter((c) => (toYMD(c.data_nascimento) || "").slice(5) === today.slice(5)).slice(0, 50);
    const inadimplentesByBucket = new Map<string, { count: number; names: string[] }>();
    if (isBillingRuleDay(today)) {
      try {
        let inadQ = supabase
          .from("vendas")
          .select("id,vendedor_id,lead_id,cliente_lead_id,grupo,cota,codigo,cancelada_em,inad,inad_em,inad_revertida_em")
          .eq("inad", true)
          .is("inad_revertida_em", null)
          .limit(5000);

        if (!admin) inadQ = inadQ.eq("vendedor_id", scopeAuthId);
        if (admin && scopeAuthId !== ALL) inadQ = inadQ.eq("vendedor_id", scopeAuthId);

        const { data: inadRowsRaw, error: inadErr } = await inadQ;
        if (inadErr) throw inadErr;

        const inadRows = ((inadRowsRaw || []) as any as VendaMini[])
          .filter((v) => !isVendaCancelada(v))
          .filter((v) => Boolean(toYMD(v.inad_em)));

        const inadLeadIds = Array.from(
          new Set(
            inadRows
              .map((v) => v.lead_id || v.cliente_lead_id)
              .filter(Boolean) as string[]
          )
        );

        const inadLeadsMap = await tryLoadLeadsMap(inadLeadIds);

        for (const v of inadRows) {
          const base = toYMD(v.inad_em);
          if (!base) continue;

          const dias = Math.max(1, daysDiffYMD(today, base));
          const leadId = v.lead_id || v.cliente_lead_id || "";
          const nome = inadLeadsMap.get(leadId)?.nome || `Grupo ${v.grupo || "—"} / Cota ${v.cota || "—"}`;

          let bucket = "";
          if (dias <= 15) bucket = "1-15";
          else if (dias <= 30) bucket = "16-30";
          else if (dias <= 60) bucket = "31-60";
          else bucket = "60+";

          const cur = inadimplentesByBucket.get(bucket) || { count: 0, names: [] };
          cur.count += 1;
          if (cur.names.length < 5) cur.names.push(nome);
          inadimplentesByBucket.set(bucket, cur);
        }
      } catch (e) {
        console.warn("[Inicio] Não foi possível carregar régua de inadimplência:", e);
      }
    }

    let newProceduresCount = 0;
    try { const sevenDaysAgo = addDaysYMD(today, -7); const { data: kbRows, error: kbErr } = await supabase.from("kb_procedures").select("id,title,titulo,status,created_at,updated_at").order("created_at", { ascending: false }).limit(200); if (!kbErr && kbRows) newProceduresCount = (kbRows as KBProcRow[]).filter((p) => String(p.status || "").toLowerCase() === "active" && (toYMD(p.created_at) || "") >= sevenDaysAgo).length; } catch {}

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
      { key: "1-15", title: "Clientes inadimplentes de 1 a 15 dias", desc: "Cliente inadimplente: reenviar boleto de cobrança." },
      { key: "16-30", title: "Clientes inadimplentes de 16 a 30 dias", desc: "Realizar ligação solicitando o pagamento da parcela em aberto." },
      { key: "31-60", title: "Clientes inadimplentes de 30 a 60 dias", desc: "Ligar para entender a situação e agendar uma data de regularização." },
      { key: "60+", title: "Clientes inadimplentes há mais de 60 dias", desc: "Ligar e ofertar reparcelamento das parcelas inadimplentes." },
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
    for (const e of (agRows || []) as AgendaRow[]) { const startUtcMs = new Date(e.inicio_at).getTime(); const ymd = ymdFromDateInOffset(new Date(startUtcMs), PV_OFFSET_MIN); if (!isWithinNextWeekWindow(today, ymd)) continue; items.push({ id: `ag:${e.id}`, whenSort: startUtcMs, whenLabel: fmtDTForOffset(e.inicio_at, PV_OFFSET_MIN), flag: flagFromYMDWeek(today, ymd), title: e.titulo || "Evento", desc: `${e.tipo || "Agenda"} • ${(e.cliente_nome || e.lead_nome || "—") as any}`, action: { label: "Abrir Agenda", to: "/agenda" } }); }
    const pushGroupEvent = (g: GroupRow, kind: "Vencimento" | "Sorteio" | "Assembleia", dateRaw: string | null) => {
      const d = kind === "Assembleia" ? groupAssemblyYMD(dateRaw) : toYMD(dateRaw);
      if (!d || !isWithinNextWeekWindow(today, d)) return;
      const drawInfo = kind === "Sorteio" || kind === "Assembleia" ? ` • Loteria: ${hasDraw(drawsByDate, g.prox_sorteio) ? "informada" : "pendente"}` : "";
      items.push({ id: `grp:${g.id}:${kind}:${d}`, whenSort: Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)), kind === "Vencimento" ? 9 : kind === "Sorteio" ? 11 : 12), whenLabel: fmtDateBRFromYMD(d), flag: flagFromYMDWeek(today, d), title: `${kind} Grupo ${g.codigo}`, desc: `${g.administradora} | ${g.segmento} | ${lastAsmInfo(lastAsmByGroup, g.id)}${drawInfo}`, action: { label: "Ver Grupos", to: "/gestao-de-grupos" } });
    };
    groupsWindow.forEach((g) => { pushGroupEvent(g, "Vencimento", g.prox_vencimento); pushGroupEvent(g, "Sorteio", g.prox_sorteio); pushGroupEvent(g, "Assembleia", g.prox_assembleia); });
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
    setKpi({ openOppCount, openOppTotal, todayEventsCount, todayGroupsCount, myDayCount: myDay.length, pendingGroupRegistrationCount, monthSalesTotal, monthSalesMeta, monthSalesPct, carteiraAtivaTotal, openStockReqCount, vendasSemComissaoCount, giroDueCount, newProceduresCount, commissionsPendingCount, commissionsPendingTotal, commissionScheduledTotal, commissionScheduledDate });
  }

  function getScopes() { if (!me) return null; const admin = isAdmin(me); if (!admin) return { admin, scopeUserId: me.id, scopeAuthId: me.auth_user_id }; if (vendorScope === ALL) return { admin, scopeUserId: ALL, scopeAuthId: ALL }; const u = usersById.get(vendorScope); if (!u) return { admin, scopeUserId: vendorScope, scopeAuthId: ALL }; return { admin, scopeUserId: u.id, scopeAuthId: u.auth_user_id }; }
  async function reload(hard = false) { const scopes = getScopes(); if (!scopes) return; if (hard) setRefreshing(true); setErrMsg(null); try { await loadDashboard(scopes.scopeUserId, scopes.scopeAuthId, scopes.admin); } catch (e) { console.error("[Inicio] loadDashboard error:", e); setErrMsg(humanErr(e)); } finally { if (hard) setRefreshing(false); } }

  useEffect(() => { let alive = true; (async () => { setLoading(true); setErrMsg(null); try { const { meRow, usersRows, admin, initialScope } = await loadMeAndUsers(); if (!alive) return; setMe(meRow); setUsers(usersRows); setVendorScope(initialScope); const initScopes = admin && initialScope === ALL ? { su: ALL, sa: ALL } : { su: meRow.id, sa: meRow.auth_user_id }; await loadDashboard(initScopes.su, initScopes.sa, admin); } catch (e) { console.error("[Inicio] init error:", e); if (alive) setErrMsg(humanErr(e)); } finally { if (alive) setLoading(false); } })(); return () => { alive = false; }; }, []);
  useEffect(() => { if (!me || !isAdmin(me)) return; if (vendorScope !== ALL && !usersById.has(vendorScope)) return; reload(false); }, [vendorScope]);
  useEffect(() => { if (!me) return; const path = location.pathname.toLowerCase(); if (path === "/" || path === "/inicio") reload(false); }, [location.pathname, me?.id, vendorScope]);
  useEffect(() => { if (!me) return; const handleRefreshOnReturn = () => { const path = window.location.pathname.toLowerCase(); if (path === "/" || path === "/inicio") reload(false); }; const handleVisibility = () => { if (document.visibilityState === "visible") handleRefreshOnReturn(); }; window.addEventListener("focus", handleRefreshOnReturn); document.addEventListener("visibilitychange", handleVisibility); return () => { window.removeEventListener("focus", handleRefreshOnReturn); document.removeEventListener("visibilitychange", handleVisibility); }; }, [me?.id, vendorScope, users.length]);

  const admin = isAdmin(me);
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
    <div className="min-h-[calc(100vh-64px)] bg-[radial-gradient(circle_at_top_left,rgba(161,28,39,0.13),transparent_32%),radial-gradient(circle_at_top_right,rgba(181,165,115,0.18),transparent_30%),linear-gradient(135deg,#F8FAFC,#F5F5F5_42%,#EEF2F7)] p-4 text-slate-900 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
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
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
                {admin && (
                  <div className="min-w-[260px]">
                    <Select value={vendorScope} onValueChange={setVendorScope}>
                      <SelectTrigger className="rounded-2xl border border-white/20 bg-white/10 text-white shadow-sm backdrop-blur placeholder:text-white/70">
                        <SelectValue placeholder="Vendedor: Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>Todos (Admin)</SelectItem>
                        {users
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Meu Dia" value={kpi.myDayCount} helper="ações para hoje" icon={<Bell className="h-5 w-5" />} featured />
          <StatCard label="Oportunidades" value={kpi.openOppCount} helper={fmtBRL(kpi.openOppTotal)} icon={<AlertTriangle className="h-5 w-5" />} to="/oportunidades" />
          <StatCard label="Agenda" value={kpi.todayEventsCount} helper={admin && vendorScope !== ALL ? `Filtrado: ${scopedUser?.nome || "—"}` : admin ? "Visão geral" : "Somente seus eventos"} icon={<Calendar className="h-5 w-5" />} to="/agenda" />
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
                <ActionCard title="Gerar Proposta" desc="Transformar simulação em proposta visual." icon={<FileText className="h-5 w-5" />} to="/propostas" />
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

        <Card className={`${glassCard} border-[#B5A573]/40`}>
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1E293F] text-white shadow-md">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-950">Pensamento do Dia</div>
                <div className="mt-1 text-sm text-slate-600">“{thoughtOfDay || FALLBACK_THOUGHTS[0]}”</div>
              </div>
            </div>
            <Button className={primaryButton} onClick={() => nav("/planejamento")}>Abrir Playbook <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
