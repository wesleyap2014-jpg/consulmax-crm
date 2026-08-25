import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  CalendarDays,
  Cake,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Filter,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";

type AgendaTipo = "aniversario" | "assembleia" | "contato" | "reuniao" | "visita" | "outro";
type ViewMode = "day" | "week" | "month";
type UserProfile = {
  id: string;
  auth_user_id: string;
  nome: string | null;
  role?: string | null;
  user_role?: string | null;
  unit_id?: string | null;
  hierarchy_level?: string | null;
};
type PersonLite = { id: string; nome: string | null; telefone: string | null; observacoes?: string | null; descricao?: string | null };
type OpportunityLite = { id: string; codigo?: string | null; estagio?: string | null; segmento?: string | null; valor_credito?: number | null };
type AgendaEvent = {
  id: string;
  tipo: AgendaTipo;
  titulo: string | null;
  cliente_id: string | null;
  lead_id: string | null;
  user_id: string | null;
  inicio_at: string;
  fim_at: string | null;
  videocall_url: string | null;
  meeting_link?: string | null;
  descricao?: string | null;
  video_room_id?: string | null;
  video_status?: string | null;
  origem: string;
  relacao_id?: string | null;
  completed_at?: string | null;
  completion_notes?: string | null;
  opportunity_id?: string | null;
  cliente?: PersonLite | null;
  lead?: PersonLite | null;
  owner?: UserProfile | null;
  opportunity?: OpportunityLite | null;
};

type CreateDraft = {
  title: string;
  type: Exclude<AgendaTipo, "aniversario" | "assembleia">;
  date: string;
  hour: string;
  minute: string;
  duration: number;
  relationKind: "none" | "cliente" | "lead";
  relationId: string;
  personSearch: string;
  ownerId: string;
  link: string;
  description: string;
};

type RescheduleDraft = { date: string; hour: string; minute: string; duration: number };

const C = {
  navy: "#1E293F",
  ruby: "#A11C27",
  gold: "#B5A573",
  goldLight: "#E0CE8C",
  bg: "#F5F5F5",
  text: "#1f2937",
  muted: "#64748b",
  line: "#e5e7eb",
};

const EVENT_SELECT = `
  id,tipo,titulo,cliente_id,lead_id,user_id,inicio_at,fim_at,videocall_url,meeting_link,descricao,video_room_id,video_status,origem,relacao_id,completed_at,completion_notes,opportunity_id,
  cliente:clientes!agenda_eventos_cliente_id_fkey(id,nome,telefone,observacoes),
  lead:leads!agenda_eventos_lead_id_fkey(id,nome,telefone,descricao),
  owner:users!agenda_eventos_user_id_fkey(id,auth_user_id,nome,role,user_role,unit_id,hierarchy_level),
  opportunity:opportunities!agenda_eventos_opportunity_id_fkey(id,codigo,estagio,segmento,valor_credito)
`;

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const PX_PER_MINUTE = 1;
const WEEK_START_HOUR = 6;
const WEEK_END_HOUR = 23;
const WEEK_HEIGHT = (WEEK_END_HOUR - WEEK_START_HOUR) * 60 * PX_PER_MINUTE;
const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const TYPE_LABEL: Record<AgendaTipo, string> = {
  aniversario: "Aniversário",
  assembleia: "Assembleia",
  contato: "Contato",
  reuniao: "Reunião",
  visita: "Visita",
  outro: "Outro",
};

function pad(n: number) { return String(n).padStart(2, "0"); }
function toDateKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDateKey(key: string) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0, 0); }
function addDays(d: Date, days: number) { const x = new Date(d); x.setDate(x.getDate() + days); return x; }
function startOfWeek(d: Date) { const x = new Date(d); const day = x.getDay(); const diff = day === 0 ? -6 : 1 - day; x.setDate(x.getDate() + diff); x.setHours(0, 0, 0, 0); return x; }
function endOfWeek(d: Date) { const x = addDays(startOfWeek(d), 6); x.setHours(23, 59, 59, 999); return x; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function normalizeText(v?: string | null) { return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function onlyDigits(v?: string | null) { return String(v || "").replace(/\D/g, ""); }
function localDateTime(date: string, hour: string, minute: string) { const [y, m, d] = date.split("-").map(Number); return new Date(y, m - 1, d, Number(hour), Number(minute), 0, 0); }
function isMidnightUTC(iso?: string | null) { if (!iso) return false; const d = new Date(iso); return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0; }
function eventDateKey(ev: AgendaEvent) {
  const d = new Date(ev.inicio_at);
  if ((ev.tipo === "aniversario" || ev.tipo === "assembleia") && isMidnightUTC(ev.inicio_at)) {
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  return toDateKey(d);
}
function fmtTime(iso?: string | null) { if (!iso) return "—"; return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function fmtDateTime(iso?: string | null) { if (!iso) return "—"; return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
function fmtDate(iso?: string | null) { if (!iso) return "—"; return new Date(iso).toLocaleDateString("pt-BR"); }
function durationMinutes(ev: AgendaEvent) { const s = new Date(ev.inicio_at).getTime(); const e = ev.fim_at ? new Date(ev.fim_at).getTime() : s + 30 * 60000; return Math.max(15, Math.round((e - s) / 60000)); }
function eventPerson(ev: AgendaEvent) { return ev.cliente?.nome || ev.lead?.nome || "Sem vínculo"; }
function eventPhone(ev: AgendaEvent) { return ev.cliente?.telefone || ev.lead?.telefone || null; }
function isCompleted(ev: AgendaEvent) { return Boolean(ev.completed_at); }
function isLate(ev: AgendaEvent) { return !isCompleted(ev) && ev.tipo !== "aniversario" && new Date(ev.inicio_at).getTime() < Date.now(); }
function money(value?: number | null) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(value || 0)); }
function whatsappHref(phone?: string | null, text?: string) { const digits = onlyDigits(phone); if (!digits) return ""; const number = digits.startsWith("55") ? digits : `55${digits}`; return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`; }
function birthdayMessage(name: string) { const first = String(name || "").trim().split(/\s+/)[0] || "Olá"; return `${first}, 🎉 Feliz Aniversário! 🎉\n\nQue este novo ciclo seja repleto de prosperidade, saúde e realizações. Na Consulmax, acreditamos que planejar é o caminho para conquistar. Que você continue sonhando grande e realizando cada vez mais! ✨\n\n🥂 Parabéns pelo seu dia!`; }
function typeAccent(type: AgendaTipo) { if (type === "reuniao") return C.ruby; if (type === "aniversario") return C.gold; if (type === "visita") return C.gold; return C.navy; }
function eventStatus(ev: AgendaEvent) { if (isCompleted(ev)) return "Concluído"; if (isLate(ev)) return "Atrasado"; if (eventDateKey(ev) === toDateKey(new Date())) return "Hoje"; return "Programado"; }
function statusClass(ev: AgendaEvent) { if (isCompleted(ev)) return "done"; if (isLate(ev)) return "late"; return "scheduled"; }
function monthCells(base: Date) {
  const first = new Date(base.getFullYear(), base.getMonth(), 1, 12);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
function periodRange(view: ViewMode, anchor: string) {
  const d = parseDateKey(anchor);
  if (view === "day") return { start: startOfDay(d), end: endOfDay(d) };
  if (view === "month") return { start: startOfMonth(d), end: endOfMonth(d) };
  return { start: startOfWeek(d), end: endOfWeek(d) };
}
function periodTitle(view: ViewMode, anchor: string) {
  const d = parseDateKey(anchor);
  if (view === "day") return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  if (view === "month") return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
  const start = startOfWeek(d); const end = endOfWeek(d);
  if (start.getMonth() === end.getMonth()) return `${pad(start.getDate())}–${pad(end.getDate())} de ${MONTHS[start.getMonth()].toLowerCase()} de ${end.getFullYear()}`;
  return `${pad(start.getDate())} ${MONTHS[start.getMonth()].slice(0, 3).toLowerCase()} – ${pad(end.getDate())} ${MONTHS[end.getMonth()].slice(0, 3).toLowerCase()} ${end.getFullYear()}`;
}
function downloadICS(ev: AgendaEvent) {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = (d: Date) => `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  const start = new Date(ev.inicio_at); const end = new Date(ev.fim_at || new Date(start.getTime() + 30 * 60000));
  const rows = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Consulmax CRM//Agenda//PT-BR", "BEGIN:VEVENT", `UID:${ev.id}@consulmaxcrm`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${(ev.titulo || TYPE_LABEL[ev.tipo]).replace(/\n/g, " ")}`, "END:VEVENT", "END:VCALENDAR"];
  const blob = new Blob([rows.join("\r\n")], { type: "text/calendar;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${(ev.titulo || "evento").replace(/\s+/g, "-")}.ics`; a.click(); URL.revokeObjectURL(url);
}

async function invokeLiveKitRoom(ev: AgendaEvent) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const res = await fetch("/api/livekit-room", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ agenda_evento_id: ev.id, role: "host", participant_name: "Consultor Consulmax" }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Não foi possível abrir a sala.");
  return json;
}

export default function AgendaExecutive() {
  const [me, setMe] = useState<UserProfile | null>(null);
  const [team, setTeam] = useState<UserProfile[]>([]);
  const [isMatrix, setIsMatrix] = useState(false);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => toDateKey(new Date()));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [advancedFilters, setAdvancedFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"" | AgendaTipo>("");
  const [filterUser, setFilterUser] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "completed" | "late">("all");
  const [filterOrigin, setFilterOrigin] = useState("");
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [overdue, setOverdue] = useState<AgendaEvent[]>([]);
  const [birthdays, setBirthdays] = useState<AgendaEvent[]>([]);
  const [clients, setClients] = useState<PersonLite[]>([]);
  const [leads, setLeads] = useState<PersonLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<AgendaEvent | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [historyNote, setHistoryNote] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleDraft, setRescheduleDraft] = useState<RescheduleDraft>({ date: toDateKey(new Date()), hour: "09", minute: "00", duration: 60 });
  const [birthdayStatus, setBirthdayStatus] = useState("");
  const [createDraft, setCreateDraft] = useState<CreateDraft>({ title: "", type: "reuniao", date: toDateKey(new Date()), hour: "09", minute: "00", duration: 60, relationKind: "none", relationId: "", personSearch: "", ownerId: "", link: "", description: "" });
  const refreshTimer = useRef<number | null>(null);
  const range = useMemo(() => periodRange(view, anchor), [view, anchor]);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const authId = auth.user?.id;
      if (!authId) return;
      const { data: profile } = await supabase.from("users").select("id,auth_user_id,nome,role,user_role,unit_id,hierarchy_level").eq("auth_user_id", authId).maybeSingle();
      if (!profile) return;
      let unitType = "";
      if (profile.unit_id) { const { data: unit } = await supabase.from("units").select("tipo").eq("id", profile.unit_id).maybeSingle(); unitType = normalizeText(unit?.tipo); }
      const matrix = normalizeText(profile.hierarchy_level) === "matriz" || (normalizeText(profile.role || profile.user_role) === "admin" && unitType === "matriz");
      const branch = !matrix && normalizeText(profile.hierarchy_level) === "gestor_filial";
      let q = supabase.from("users").select("id,auth_user_id,nome,role,user_role,unit_id,hierarchy_level").eq("is_active", true).order("nome");
      if (branch && profile.unit_id) q = q.eq("unit_id", profile.unit_id);
      if (!matrix && !branch) q = q.eq("auth_user_id", authId);
      const { data: teamRows } = await q;
      setMe(profile as UserProfile); setIsMatrix(matrix); setCanManageTeam(matrix || branch); setTeam((teamRows || [profile]) as UserProfile[]);
      setCreateDraft((d) => ({ ...d, ownerId: authId }));
    })();
  }, []);

  useEffect(() => {
    if (!me) return;
    (async () => {
      const [c, l] = await Promise.all([
        supabase.from("clientes").select("id,nome,telefone,observacoes").order("nome").limit(800),
        supabase.from("leads").select("id,nome,telefone,descricao").order("nome").limit(800),
      ]);
      setClients((c.data || []) as PersonLite[]); setLeads((l.data || []) as PersonLite[]);
    })();
  }, [me?.auth_user_id]);

  const applyScope = useCallback((query: any) => {
    if (filterUser) return query.eq("user_id", filterUser);
    if (isMatrix) return query;
    const ids = team.map((u) => u.auth_user_id).filter(Boolean);
    return ids.length ? query.in("user_id", ids) : query.eq("user_id", me?.auth_user_id || "00000000-0000-0000-0000-000000000000");
  }, [filterUser, isMatrix, team, me?.auth_user_id]);

  const loadData = useCallback(async () => {
    if (!me || !team.length) return;
    setLoading(true);
    try {
      let mainQ = supabase.from("agenda_eventos").select(EVENT_SELECT).gte("inicio_at", range.start.toISOString()).lte("inicio_at", range.end.toISOString()).order("inicio_at", { ascending: true }).limit(1000);
      mainQ = applyScope(mainQ);
      const lateStart = new Date(); lateStart.setDate(lateStart.getDate() - 120);
      let lateQ = supabase.from("agenda_eventos").select(EVENT_SELECT).gte("inicio_at", lateStart.toISOString()).lt("inicio_at", new Date().toISOString()).is("completed_at", null).neq("tipo", "aniversario").order("inicio_at", { ascending: true }).limit(300);
      lateQ = applyScope(lateQ);
      const bStart = new Date(); bStart.setHours(0, 0, 0, 0); const bEnd = addDays(bStart, 90); bEnd.setHours(23, 59, 59, 999);
      let birthQ = supabase.from("agenda_eventos").select(EVENT_SELECT).eq("tipo", "aniversario").gte("inicio_at", bStart.toISOString()).lte("inicio_at", bEnd.toISOString()).order("inicio_at", { ascending: true }).limit(200);
      birthQ = applyScope(birthQ);
      const [main, late, birth] = await Promise.all([mainQ, lateQ, birthQ]);
      if (main.error) throw main.error; if (late.error) throw late.error; if (birth.error) throw birth.error;
      setEvents((main.data || []) as unknown as AgendaEvent[]);
      setOverdue((late.data || []) as unknown as AgendaEvent[]);
      setBirthdays((birth.data || []) as unknown as AgendaEvent[]);
    } catch (e: any) {
      console.error("[agenda] load", e); alert("Não foi possível carregar a agenda: " + (e?.message || "erro desconhecido"));
    } finally { setLoading(false); }
  }, [me, team.length, range.start.getTime(), range.end.getTime(), applyScope]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const channel = supabase.channel("agenda-executive-realtime").on("postgres_changes", { event: "*", schema: "public", table: "agenda_eventos" }, () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(loadData, 250);
    }).subscribe();
    return () => { if (refreshTimer.current) window.clearTimeout(refreshTimer.current); supabase.removeChannel(channel); };
  }, [loadData]);

  const todayBirthdays = useMemo(() => birthdays.filter((e) => eventDateKey(e) === toDateKey(new Date())), [birthdays]);
  useEffect(() => {
    if (!todayBirthdays.length) return;
    const key = `agenda:birthday-whatsapp:${toDateKey(new Date())}`;
    if (localStorage.getItem(key)) return;
    (async () => {
      try {
        setBirthdayStatus("Enviando felicitações de hoje…");
        const response = await fetch("/api/agenda/birthday-whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: toDateKey(new Date()) }) });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.ok) throw new Error(json?.error || "Falha no envio automático.");
        localStorage.setItem(key, new Date().toISOString());
        setBirthdayStatus(Number(json.sent || 0) ? `${json.sent} felicitação(ões) enviada(s)` : "Felicitações verificadas");
      } catch (e: any) { setBirthdayStatus(e?.message || "Envio automático indisponível"); }
    })();
  }, [todayBirthdays.length]);

  const filteredEvents = useMemo(() => {
    const needle = normalizeText(search); const digits = onlyDigits(search);
    return events.filter((ev) => {
      if (ev.tipo === "aniversario") return false;
      if (filterType && ev.tipo !== filterType) return false;
      if (filterOrigin && ev.origem !== filterOrigin) return false;
      if (filterStatus === "pending" && isCompleted(ev)) return false;
      if (filterStatus === "completed" && !isCompleted(ev)) return false;
      if (filterStatus === "late" && !isLate(ev)) return false;
      if (!needle && !digits) return true;
      const hay = normalizeText(`${ev.titulo || ""} ${eventPerson(ev)} ${ev.owner?.nome || ""} ${ev.opportunity?.codigo || ""} ${ev.tipo}`);
      return hay.includes(needle) || (!!digits && onlyDigits(eventPhone(ev)).includes(digits));
    });
  }, [events, search, filterType, filterOrigin, filterStatus]);

  const filteredOverdue = useMemo(() => overdue.filter((ev) => {
    if (filterType && ev.tipo !== filterType) return false;
    if (filterOrigin && ev.origem !== filterOrigin) return false;
    const n = normalizeText(search); if (!n) return true;
    return normalizeText(`${ev.titulo || ""} ${eventPerson(ev)} ${ev.opportunity?.codigo || ""}`).includes(n);
  }), [overdue, search, filterType, filterOrigin]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(parseDateKey(anchor)), i)), [anchor]);
  const monthDays = useMemo(() => monthCells(parseDateKey(anchor)), [anchor]);
  const miniDays = useMemo(() => monthCells(parseDateKey(anchor)), [anchor]);

  function navigatePeriod(delta: number) {
    const d = parseDateKey(anchor);
    if (view === "day") d.setDate(d.getDate() + delta);
    if (view === "week") d.setDate(d.getDate() + delta * 7);
    if (view === "month") d.setMonth(d.getMonth() + delta);
    setAnchor(toDateKey(d));
  }
  function goToday() { setAnchor(toDateKey(new Date())); }
  function openCreate(date = anchor, hour = "09", minute = "00") {
    setCreateDraft({ title: "", type: "reuniao", date, hour, minute, duration: 60, relationKind: "none", relationId: "", personSearch: "", ownerId: me?.auth_user_id || "", link: "", description: "" }); setCreateOpen(true);
  }
  function chooseDay(date: string) { setAnchor(date); setView("day"); }
  function openDetails(ev: AgendaEvent) { setSelectedEvent(ev); setCompletionNote(ev.completion_notes || ""); setHistoryNote(""); setRescheduling(false); const start = new Date(ev.inicio_at); setRescheduleDraft({ date: toDateKey(start), hour: pad(start.getHours()), minute: pad(Math.floor(start.getMinutes() / 5) * 5), duration: durationMinutes(ev) }); }

  async function createEvent() {
    if (!createDraft.title.trim()) return alert("Informe o título do compromisso.");
    const start = localDateTime(createDraft.date, createDraft.hour, createDraft.minute); const end = new Date(start.getTime() + createDraft.duration * 60000);
    const payload: any = { tipo: createDraft.type, titulo: createDraft.title.trim(), inicio_at: start.toISOString(), fim_at: end.toISOString(), origem: "manual", user_id: createDraft.ownerId || me?.auth_user_id, cliente_id: null, lead_id: null, videocall_url: createDraft.link.trim() || null, meeting_link: createDraft.link.trim() || null, descricao: createDraft.description.trim() || null };
    if (createDraft.relationKind === "cliente" && createDraft.relationId) payload.cliente_id = createDraft.relationId;
    if (createDraft.relationKind === "lead" && createDraft.relationId) payload.lead_id = createDraft.relationId;
    setLoading(true); const { error } = await supabase.from("agenda_eventos").insert(payload); setLoading(false);
    if (error) return alert("Não foi possível criar o compromisso: " + error.message);
    setCreateOpen(false); await loadData();
  }

  async function saveReschedule() {
    if (!selectedEvent) return;
    const start = localDateTime(rescheduleDraft.date, rescheduleDraft.hour, rescheduleDraft.minute); const end = new Date(start.getTime() + rescheduleDraft.duration * 60000);
    const { error } = await supabase.from("agenda_eventos").update({ inicio_at: start.toISOString(), fim_at: end.toISOString(), updated_at: new Date().toISOString() }).eq("id", selectedEvent.id);
    if (error) return alert("Não foi possível reagendar: " + error.message);
    setRescheduling(false); await loadData(); setSelectedEvent((ev) => ev ? { ...ev, inicio_at: start.toISOString(), fim_at: end.toISOString() } : ev);
  }
  async function completeEvent() {
    if (!selectedEvent) return;
    const now = new Date().toISOString(); const { error } = await supabase.from("agenda_eventos").update({ completed_at: now, completion_notes: completionNote.trim() || null, updated_at: now }).eq("id", selectedEvent.id);
    if (error) return alert("Não foi possível concluir: " + error.message);
    setSelectedEvent({ ...selectedEvent, completed_at: now, completion_notes: completionNote.trim() || null }); await loadData();
  }
  async function reopenEvent() {
    if (!selectedEvent) return; const { error } = await supabase.from("agenda_eventos").update({ completed_at: null, updated_at: new Date().toISOString() }).eq("id", selectedEvent.id); if (error) return alert(error.message); setSelectedEvent({ ...selectedEvent, completed_at: null }); await loadData();
  }
  async function saveHistoryNote() {
    if (!selectedEvent || !historyNote.trim()) return;
    const stamp = new Date().toLocaleString("pt-BR"); const line = `\n\n[Agenda - ${stamp}] ${selectedEvent.titulo || TYPE_LABEL[selectedEvent.tipo]}: ${historyNote.trim()}`;
    let error: any = null;
    if (selectedEvent.cliente_id) ({ error } = await supabase.from("clientes").update({ observacoes: `${selectedEvent.cliente?.observacoes || ""}${line}` }).eq("id", selectedEvent.cliente_id));
    else if (selectedEvent.lead_id) ({ error } = await supabase.from("leads").update({ descricao: `${selectedEvent.lead?.descricao || ""}${line}` }).eq("id", selectedEvent.lead_id));
    else return alert("Este compromisso não está vinculado a cliente ou lead.");
    if (error) return alert("Não foi possível registrar a nota: " + error.message); setHistoryNote(""); alert("Nota registrada no histórico.");
  }
  async function deleteEvent() {
    if (!selectedEvent || selectedEvent.origem !== "manual") return;
    if (!confirm("Excluir este compromisso?")) return;
    const { error } = await supabase.from("agenda_eventos").delete().eq("id", selectedEvent.id); if (error) return alert(error.message); setSelectedEvent(null); await loadData();
  }
  async function enterVideo() {
    if (!selectedEvent) return; setVideoLoading(true);
    try { const data = await invokeLiveKitRoom(selectedEvent); const url = data?.clientUrl || selectedEvent.videocall_url || `${location.origin}/agenda/sala/${selectedEvent.id}?cliente=1`; setSelectedEvent({ ...selectedEvent, videocall_url: url, video_room_id: data?.room?.id || selectedEvent.video_room_id, video_status: data?.room?.status || "created" }); window.open(`/agenda/sala/${selectedEvent.id}`, "_blank"); await loadData(); }
    catch (e: any) { alert(e?.message || "Não foi possível abrir a sala."); } finally { setVideoLoading(false); }
  }
  function openOpportunity(ev: AgendaEvent) { if (!ev.opportunity_id) return; sessionStorage.setItem("crm:open-opportunity", ev.opportunity_id); window.location.assign(`/oportunidades?opportunity_id=${ev.opportunity_id}`); }

  const relationRows = useMemo(() => {
    const source = createDraft.relationKind === "cliente" ? clients : createDraft.relationKind === "lead" ? leads : [];
    const needle = normalizeText(createDraft.personSearch); const digits = onlyDigits(createDraft.personSearch);
    return source.filter((p) => !needle || normalizeText(p.nome).includes(needle) || (!!digits && onlyDigits(p.telefone).includes(digits))).slice(0, 80);
  }, [createDraft.relationKind, createDraft.personSearch, clients, leads]);

  const actualToday = toDateKey(new Date());
  const isTodayAnchor = anchor === actualToday;
  const visibleDayEvents = filteredEvents.filter((e) => eventDateKey(e) === anchor).sort((a, b) => new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime());
  const dayUpcoming = visibleDayEvents.filter((e) => !isCompleted(e) && (!isTodayAnchor || new Date(e.inicio_at).getTime() >= Date.now()));
  const dayCompleted = visibleDayEvents.filter(isCompleted);
  const dayLate = isTodayAnchor ? filteredOverdue : visibleDayEvents.filter(isLate);

  return (
    <div className="cx-agenda">
      <style>{AGENDA_CSS}</style>
      <header className="cx-topbar">
        <div className="cx-title"><span>CRM Consulmax</span><h1>Agenda</h1></div>
        <div className="cx-period-nav">
          <button className="cx-icon-btn" onClick={() => navigatePeriod(-1)} aria-label="Período anterior"><ChevronLeft size={18} /></button>
          <button className="cx-today-btn" onClick={goToday}>Hoje</button>
          <button className="cx-icon-btn" onClick={() => navigatePeriod(1)} aria-label="Próximo período"><ChevronRight size={18} /></button>
          <strong className="cx-period-title">{periodTitle(view, anchor)}</strong>
        </div>
        <div className="cx-view-switch">
          <button className={view === "day" ? "active" : ""} onClick={() => { setView("day"); if (!anchor) goToday(); }}>Hoje</button>
          <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Semana</button>
          <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>Mês</button>
        </div>
        <div className="cx-top-actions">
          <label className="cx-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar compromisso, cliente ou OP…" /></label>
          <button className="cx-secondary" onClick={() => setSidebarOpen((v) => !v)}><Filter size={16} /> Filtros</button>
          <button className="cx-primary" onClick={() => openCreate(isTodayAnchor ? actualToday : anchor)}><Plus size={17} /> Novo compromisso</button>
        </div>
      </header>

      <div className={`cx-layout ${sidebarOpen ? "with-sidebar" : ""}`}>
        {sidebarOpen && <aside className="cx-sidebar">
          <div className="cx-side-head"><strong>{MONTHS[parseDateKey(anchor).getMonth()]} {parseDateKey(anchor).getFullYear()}</strong><button className="cx-icon-btn small" onClick={() => setSidebarOpen(false)} title="Recolher"><PanelLeftClose size={16} /></button></div>
          <MiniCalendar days={miniDays} anchor={anchor} onPick={chooseDay} events={filteredEvents} birthdays={birthdays} />
          <button className="cx-filter-toggle" onClick={() => setAdvancedFilters((v) => !v)}><Filter size={15} /> {advancedFilters ? "Ocultar filtros" : "Mais filtros"}</button>
          {advancedFilters && <div className="cx-filter-stack">
            <label>Tipo<select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}><option value="">Todos</option><option value="reuniao">Reunião</option><option value="contato">Contato</option><option value="visita">Visita</option><option value="assembleia">Assembleia</option><option value="outro">Outro</option></select></label>
            <label>Status<select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}><option value="all">Todos</option><option value="pending">Pendentes</option><option value="completed">Concluídos</option><option value="late">Atrasados</option></select></label>
            <label>Origem<select value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value)}><option value="">Todas</option><option value="manual">Manual</option><option value="auto">Automática</option><option value="groups">Grupos</option></select></label>
            {canManageTeam && <label>Responsável<select value={filterUser} onChange={(e) => setFilterUser(e.target.value)}><option value="">Equipe toda</option>{team.map((u) => <option key={u.auth_user_id} value={u.auth_user_id}>{u.nome || "Usuário"}</option>)}</select></label>}
            <button className="cx-reset" onClick={() => { setFilterType(""); setFilterStatus("all"); setFilterOrigin(""); setFilterUser(""); setSearch(""); }}><RotateCcw size={14} /> Limpar filtros</button>
          </div>}
          <BirthdayPanel birthdays={birthdays} status={birthdayStatus} onOpen={(ev) => openDetails(ev)} />
        </aside>}

        <main className="cx-calendar-area">
          {!sidebarOpen && <button className="cx-floating-sidebar" onClick={() => setSidebarOpen(true)} title="Abrir painel lateral"><PanelLeftOpen size={17} /></button>}
          {loading && <div className="cx-loading">Atualizando agenda…</div>}
          {view === "week" && <WeekView days={weekDays} events={filteredEvents} onOpen={openDetails} onCreate={(date, hour) => openCreate(date, pad(hour), "00")} />}
          {view === "day" && <DayView date={anchor} late={dayLate} upcoming={dayUpcoming} completed={dayCompleted} onOpen={openDetails} onCreate={() => openCreate(anchor)} />}
          {view === "month" && <MonthView days={monthDays} anchor={anchor} events={filteredEvents} birthdays={birthdays} onPickDay={chooseDay} onOpen={openDetails} />}
        </main>
      </div>

      {selectedEvent && <EventDrawer ev={selectedEvent} completionNote={completionNote} setCompletionNote={setCompletionNote} historyNote={historyNote} setHistoryNote={setHistoryNote} rescheduling={rescheduling} setRescheduling={setRescheduling} rescheduleDraft={rescheduleDraft} setRescheduleDraft={setRescheduleDraft} videoLoading={videoLoading} onClose={() => setSelectedEvent(null)} onComplete={completeEvent} onReopen={reopenEvent} onSaveReschedule={saveReschedule} onSaveNote={saveHistoryNote} onVideo={enterVideo} onOpportunity={openOpportunity} onDelete={deleteEvent} />}
      {createOpen && <CreateDrawer draft={createDraft} setDraft={setCreateDraft} team={team} canManageTeam={canManageTeam} relationRows={relationRows} loading={loading} onClose={() => setCreateOpen(false)} onSave={createEvent} />}
    </div>
  );
}

function MiniCalendar({ days, anchor, onPick, events, birthdays }: { days: Date[]; anchor: string; onPick: (d: string) => void; events: AgendaEvent[]; birthdays: AgendaEvent[] }) {
  const month = parseDateKey(anchor).getMonth(); const today = toDateKey(new Date());
  return <div className="cx-mini"><div className="cx-mini-week">{DAY_NAMES.map((d) => <span key={d}>{d[0]}</span>)}</div><div className="cx-mini-grid">{days.map((d) => { const key = toDateKey(d); const has = events.some((e) => eventDateKey(e) === key); const hasBirthday = birthdays.some((e) => eventDateKey(e) === key); return <button key={key} className={`${d.getMonth() !== month ? "outside" : ""} ${key === anchor ? "selected" : ""} ${key === today ? "today" : ""}`} onClick={() => onPick(key)}><span>{d.getDate()}</span>{(has || hasBirthday) && <i className={hasBirthday ? "birthday" : ""} />}</button>; })}</div></div>;
}

function BirthdayPanel({ birthdays, status, onOpen }: { birthdays: AgendaEvent[]; status: string; onOpen: (e: AgendaEvent) => void }) {
  return <section className="cx-birthdays"><div className="cx-birthday-title"><Cake size={17} /><div><strong>Aniversários</strong><small>{status || "Relacionamento"}</small></div></div><div className="cx-birthday-list">{birthdays.slice(0, 6).map((ev) => { const name = eventPerson(ev); const wa = whatsappHref(eventPhone(ev), birthdayMessage(name)); return <div key={ev.id} className="cx-birthday-row" onClick={() => onOpen(ev)}><span className="cx-birthday-date">{eventDateKey(ev).slice(8, 10)}/{eventDateKey(ev).slice(5, 7)}</span><div><strong>{name}</strong><small>{ev.owner?.nome || ""}</small></div>{wa && <a href={wa} onClick={(e) => e.stopPropagation()} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle size={15} /></a>}</div>; })}{!birthdays.length && <small className="cx-empty-small">Nenhum aniversário próximo.</small>}</div></section>;
}

function WeekView({ days, events, onOpen, onCreate }: { days: Date[]; events: AgendaEvent[]; onOpen: (e: AgendaEvent) => void; onCreate: (date: string, hour: number) => void }) {
  return <section className="cx-week-card"><div className="cx-week-head"><div className="cx-week-corner" />{days.map((d) => { const key = toDateKey(d); return <div key={key} className={`cx-week-day-head ${key === toDateKey(new Date()) ? "today" : ""}`}><span>{d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span><strong>{d.getDate()}</strong><div className="cx-all-day">{events.filter((e) => e.tipo === "assembleia" && eventDateKey(e) === key).slice(0, 2).map((e) => <button key={e.id} onClick={() => onOpen(e)}>{e.titulo || "Assembleia"}</button>)}</div></div>; })}</div><div className="cx-week-scroll"><div className="cx-week-body" style={{ height: WEEK_HEIGHT }}><div className="cx-time-col">{HOURS.map((h) => <span key={h} style={{ top: (h - WEEK_START_HOUR) * 60 * PX_PER_MINUTE - 8 }}>{pad(h)}:00</span>)}</div>{days.map((d) => { const key = toDateKey(d); const timed = events.filter((e) => e.tipo !== "assembleia" && eventDateKey(e) === key); return <div key={key} className={`cx-day-col ${key === toDateKey(new Date()) ? "today" : ""}`} onDoubleClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const minute = Math.max(0, Math.min((e.clientY - rect.top) / PX_PER_MINUTE, WEEK_HEIGHT)); const hour = Math.min(WEEK_END_HOUR - 1, WEEK_START_HOUR + Math.floor(minute / 60)); onCreate(key, hour); }}>{HOURS.map((h) => <i key={h} style={{ top: (h - WEEK_START_HOUR) * 60 * PX_PER_MINUTE }} />)}{timed.map((ev, idx) => { const start = new Date(ev.inicio_at); const mins = (start.getHours() - WEEK_START_HOUR) * 60 + start.getMinutes(); const top = Math.max(0, Math.min(WEEK_HEIGHT - 34, mins * PX_PER_MINUTE)); const height = Math.max(34, Math.min(durationMinutes(ev) * PX_PER_MINUTE, WEEK_HEIGHT - top)); return <button key={ev.id} className={`cx-event-block ${statusClass(ev)}`} style={{ top, height, borderLeftColor: typeAccent(ev.tipo), marginLeft: (idx % 3) * 3 }} onClick={() => onOpen(ev)} title={`${fmtTime(ev.inicio_at)} • ${ev.titulo || TYPE_LABEL[ev.tipo]} • ${eventPerson(ev)}`}><span>{fmtTime(ev.inicio_at)}</span><strong>{ev.titulo || TYPE_LABEL[ev.tipo]}</strong><small>{eventPerson(ev)}{ev.opportunity?.codigo ? ` • ${ev.opportunity.codigo}` : ""}</small></button>; })}</div>; })}</div></div></section>;
}

function DayView({ date, late, upcoming, completed, onOpen, onCreate }: { date: string; late: AgendaEvent[]; upcoming: AgendaEvent[]; completed: AgendaEvent[]; onOpen: (e: AgendaEvent) => void; onCreate: () => void }) {
  return <div className="cx-day-view"><div className="cx-day-summary"><div><CalendarDays size={18} /><span>{parseDateKey(date).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</span></div><button className="cx-primary compact" onClick={onCreate}><Plus size={15} /> Compromisso</button></div><EventGroup title="Atrasados" count={late.length} tone="late" rows={late} onOpen={onOpen} empty="Nada atrasado." /><EventGroup title="Próximos" count={upcoming.length} tone="next" rows={upcoming} onOpen={onOpen} empty="Nenhum compromisso pendente." /><EventGroup title="Concluídos" count={completed.length} tone="done" rows={completed} onOpen={onOpen} empty="Nenhum compromisso concluído neste dia." /></div>;
}

function EventGroup({ title, count, tone, rows, onOpen, empty }: { title: string; count: number; tone: string; rows: AgendaEvent[]; onOpen: (e: AgendaEvent) => void; empty: string }) {
  return <section className={`cx-event-group ${tone}`}><div className="cx-group-head"><h3>{title}</h3><span>{count}</span></div><div className="cx-group-list">{rows.map((ev) => <button key={ev.id} className="cx-list-event" onClick={() => onOpen(ev)}><span className="cx-list-time">{fmtTime(ev.inicio_at)}</span><i style={{ background: typeAccent(ev.tipo) }} /><div className="cx-list-main"><strong>{ev.titulo || TYPE_LABEL[ev.tipo]}</strong><small>{eventPerson(ev)} • {TYPE_LABEL[ev.tipo]}{ev.opportunity?.codigo ? ` • ${ev.opportunity.codigo}` : ""}</small></div><div className="cx-list-owner">{ev.owner?.nome || "—"}</div><span className={`cx-status ${statusClass(ev)}`}>{eventStatus(ev)}</span><ChevronRight size={16} /></button>)}{!rows.length && <div className="cx-empty-row">{empty}</div>}</div></section>;
}

function MonthView({ days, anchor, events, birthdays, onPickDay, onOpen }: { days: Date[]; anchor: string; events: AgendaEvent[]; birthdays: AgendaEvent[]; onPickDay: (d: string) => void; onOpen: (e: AgendaEvent) => void }) {
  const month = parseDateKey(anchor).getMonth(); return <section className="cx-month-card"><div className="cx-month-week">{DAY_NAMES.map((d) => <span key={d}>{d}</span>)}</div><div className="cx-month-grid">{days.map((d) => { const key = toDateKey(d); const rows = events.filter((e) => eventDateKey(e) === key).slice(0, 3); const total = events.filter((e) => eventDateKey(e) === key).length; const b = birthdays.filter((e) => eventDateKey(e) === key).length; return <div key={key} className={`cx-month-day ${d.getMonth() !== month ? "outside" : ""} ${key === toDateKey(new Date()) ? "today" : ""}`}><button className="cx-month-number" onClick={() => onPickDay(key)}>{d.getDate()}</button>{b > 0 && <button className="cx-month-birthday" onClick={() => onPickDay(key)}><Cake size={12} /> {b}</button>}<div className="cx-month-events">{rows.map((ev) => <button key={ev.id} onClick={() => onOpen(ev)} style={{ borderLeftColor: typeAccent(ev.tipo) }}><span>{fmtTime(ev.inicio_at)}</span>{ev.titulo || TYPE_LABEL[ev.tipo]}</button>)}{total > 3 && <button className="cx-more" onClick={() => onPickDay(key)}>+ {total - 3} mais</button>}</div></div>; })}</div></section>;
}

function Drawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <><div className="cx-drawer-backdrop" onClick={onClose} /><aside className="cx-drawer">{children}</aside></>;
}

function EventDrawer(props: { ev: AgendaEvent; completionNote: string; setCompletionNote: (v: string) => void; historyNote: string; setHistoryNote: (v: string) => void; rescheduling: boolean; setRescheduling: (v: boolean) => void; rescheduleDraft: RescheduleDraft; setRescheduleDraft: (v: RescheduleDraft) => void; videoLoading: boolean; onClose: () => void; onComplete: () => void; onReopen: () => void; onSaveReschedule: () => void; onSaveNote: () => void; onVideo: () => void; onOpportunity: (e: AgendaEvent) => void; onDelete: () => void }) {
  const { ev } = props; const wa = whatsappHref(eventPhone(ev)); const phone = onlyDigits(eventPhone(ev)); const completed = isCompleted(ev);
  return <Drawer onClose={props.onClose}><div className="cx-drawer-head"><div><span className="cx-eyebrow">Detalhes do compromisso</span><h2>{ev.titulo || TYPE_LABEL[ev.tipo]}</h2></div><button className="cx-icon-btn" onClick={props.onClose}><X size={18} /></button></div><div className="cx-event-meta"><span className={`cx-status ${statusClass(ev)}`}>{eventStatus(ev)}</span><span className="cx-type-chip" style={{ borderColor: typeAccent(ev.tipo), color: typeAccent(ev.tipo) }}>{TYPE_LABEL[ev.tipo]}</span>{ev.opportunity?.codigo && <button className="cx-op-chip" onClick={() => props.onOpportunity(ev)}>{ev.opportunity.codigo}</button>}</div><div className="cx-detail-card"><Detail icon={<Clock size={16} />} label="Quando" value={`${fmtDateTime(ev.inicio_at)} até ${fmtTime(ev.fim_at)}`} /><Detail icon={<Users size={16} />} label="Cliente / Lead" value={eventPerson(ev)} /><Detail icon={<Users size={16} />} label="Responsável" value={ev.owner?.nome || "—"} />{ev.opportunity && <Detail icon={<FileText size={16} />} label="Oportunidade" value={`${ev.opportunity.codigo || "Oportunidade"} • ${ev.opportunity.segmento || "—"} • ${money(ev.opportunity.valor_credito)}`} />}{ev.descricao && <Detail icon={<FileText size={16} />} label="Descrição" value={ev.descricao} />}</div><div className="cx-action-grid">{wa && <a className="cx-action-btn" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={17} /> WhatsApp</a>}{phone && <a className="cx-action-btn" href={`tel:${phone}`}><Phone size={17} /> Ligar</a>}{ev.opportunity_id && <button className="cx-action-btn" onClick={() => props.onOpportunity(ev)}><ExternalLink size={17} /> Abrir oportunidade</button>}<button className="cx-action-btn strong" onClick={props.onVideo} disabled={props.videoLoading}><Video size={17} /> {props.videoLoading ? "Preparando…" : "Entrar na reunião"}</button>{(ev.meeting_link || ev.videocall_url) && <a className="cx-action-btn" href={ev.meeting_link || ev.videocall_url || "#"} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Abrir link</a>}<button className="cx-action-btn" onClick={() => downloadICS(ev)}><Download size={17} /> Adicionar calendário</button></div><section className="cx-drawer-section"><div className="cx-section-title"><h3>Conclusão</h3>{completed && <span>Concluído em {fmtDateTime(ev.completed_at)}</span>}</div><textarea value={props.completionNote} onChange={(e) => props.setCompletionNote(e.target.value)} placeholder="Resumo do atendimento, resultado ou próximo passo…" />{completed ? <button className="cx-secondary full" onClick={props.onReopen}><RotateCcw size={16} /> Reabrir compromisso</button> : <button className="cx-primary full" onClick={props.onComplete}><CheckCircle2 size={16} /> Marcar como concluído</button>}</section><section className="cx-drawer-section"><div className="cx-section-title"><h3>Reagendar</h3><button className="cx-link-btn" onClick={() => props.setRescheduling(!props.rescheduling)}>{props.rescheduling ? "Cancelar" : "Alterar data e hora"}</button></div>{props.rescheduling && <TimeControls value={props.rescheduleDraft} onChange={props.setRescheduleDraft} onSave={props.onSaveReschedule} />}</section>{(ev.cliente_id || ev.lead_id) && <section className="cx-drawer-section"><div className="cx-section-title"><h3>Histórico</h3><span>Registrar no cliente/lead</span></div><textarea value={props.historyNote} onChange={(e) => props.setHistoryNote(e.target.value)} placeholder="Digite uma anotação…" /><button className="cx-secondary full" onClick={props.onSaveNote}>Registrar anotação</button></section>}{ev.origem === "manual" && <button className="cx-danger-link" onClick={props.onDelete}><Trash2 size={15} /> Excluir compromisso</button>}</Drawer>;
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="cx-detail"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>; }

function TimeControls({ value, onChange, onSave }: { value: RescheduleDraft; onChange: (v: RescheduleDraft) => void; onSave: () => void }) {
  return <div className="cx-time-controls"><label>Data<input type="date" value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} /></label><label>Hora<select value={value.hour} onChange={(e) => onChange({ ...value, hour: e.target.value })}>{HOUR_OPTIONS.map((h) => <option key={h}>{h}</option>)}</select></label><label>Min<select value={value.minute} onChange={(e) => onChange({ ...value, minute: e.target.value })}>{MINUTE_OPTIONS.map((m) => <option key={m}>{m}</option>)}</select></label><label>Duração<select value={value.duration} onChange={(e) => onChange({ ...value, duration: Number(e.target.value) })}>{DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d} min</option>)}</select></label><button className="cx-primary full-row" onClick={onSave}>Salvar novo horário</button></div>;
}

function CreateDrawer({ draft, setDraft, team, canManageTeam, relationRows, loading, onClose, onSave }: { draft: CreateDraft; setDraft: React.Dispatch<React.SetStateAction<CreateDraft>>; team: UserProfile[]; canManageTeam: boolean; relationRows: PersonLite[]; loading: boolean; onClose: () => void; onSave: () => void }) {
  return <Drawer onClose={onClose}><div className="cx-drawer-head"><div><span className="cx-eyebrow">Agenda</span><h2>Novo compromisso</h2></div><button className="cx-icon-btn" onClick={onClose}><X size={18} /></button></div><div className="cx-form"><label className="full">Título<input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Ex.: Reunião de planejamento" autoFocus /></label><label>Tipo<select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as CreateDraft["type"] }))}><option value="reuniao">Reunião</option><option value="contato">Contato / Follow-up</option><option value="visita">Visita</option><option value="outro">Outro</option></select></label><label>Data<input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} /></label><label>Hora<select value={draft.hour} onChange={(e) => setDraft((d) => ({ ...d, hour: e.target.value }))}>{HOUR_OPTIONS.map((h) => <option key={h}>{h}</option>)}</select></label><label>Minuto<select value={draft.minute} onChange={(e) => setDraft((d) => ({ ...d, minute: e.target.value }))}>{MINUTE_OPTIONS.map((m) => <option key={m}>{m}</option>)}</select></label><label>Duração<select value={draft.duration} onChange={(e) => setDraft((d) => ({ ...d, duration: Number(e.target.value) }))}>{DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d} minutos</option>)}</select></label>{canManageTeam && <label>Responsável<select value={draft.ownerId} onChange={(e) => setDraft((d) => ({ ...d, ownerId: e.target.value }))}>{team.map((u) => <option key={u.auth_user_id} value={u.auth_user_id}>{u.nome || "Usuário"}</option>)}</select></label>}<label>Vincular a<select value={draft.relationKind} onChange={(e) => setDraft((d) => ({ ...d, relationKind: e.target.value as any, relationId: "", personSearch: "" }))}><option value="none">Sem vínculo</option><option value="cliente">Cliente</option><option value="lead">Lead / Oportunidade</option></select></label>{draft.relationKind !== "none" && <><label className="full">Buscar pessoa<input value={draft.personSearch} onChange={(e) => setDraft((d) => ({ ...d, personSearch: e.target.value }))} placeholder="Nome ou telefone…" /></label><label className="full">{draft.relationKind === "cliente" ? "Cliente" : "Lead"}<select value={draft.relationId} onChange={(e) => setDraft((d) => ({ ...d, relationId: e.target.value }))}><option value="">Selecione…</option>{relationRows.map((p) => <option key={p.id} value={p.id}>{p.nome || "Sem nome"}{p.telefone ? ` • ${p.telefone}` : ""}</option>)}</select></label></>}<label className="full">Link de reunião (opcional)<input value={draft.link} onChange={(e) => setDraft((d) => ({ ...d, link: e.target.value }))} placeholder="Google Meet, Teams ou outro link" /></label><label className="full">Observações<textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Objetivo da reunião ou contexto do atendimento…" /></label></div><div className="cx-drawer-footer"><button className="cx-secondary" onClick={onClose}>Cancelar</button><button className="cx-primary" onClick={onSave} disabled={loading}>{loading ? "Criando…" : "Criar compromisso"}</button></div></Drawer>;
}

const AGENDA_CSS = `
.cx-agenda{min-height:calc(100vh - 30px);padding:14px 16px 28px;background:linear-gradient(180deg,#f8fafc 0%,#f5f5f5 100%);color:${C.text};font-family:inherit}.cx-topbar{max-width:1680px;margin:0 auto 12px;background:#fff;border:1px solid rgba(30,41,63,.08);border-radius:18px;padding:12px 14px;display:grid;grid-template-columns:auto minmax(330px,1fr) auto;grid-template-areas:'title nav views' 'title actions actions';gap:10px 18px;align-items:center;box-shadow:0 8px 30px rgba(30,41,63,.06)}.cx-title{grid-area:title;min-width:145px}.cx-title span,.cx-eyebrow{display:block;color:${C.gold};font-size:10px;text-transform:uppercase;letter-spacing:1.1px;font-weight:900}.cx-title h1{margin:1px 0 0;color:${C.navy};font-size:25px;letter-spacing:-.5px}.cx-period-nav{grid-area:nav;display:flex;align-items:center;gap:7px;min-width:0}.cx-period-title{margin-left:7px;color:${C.navy};font-size:15px;text-transform:capitalize;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cx-icon-btn{width:36px;height:36px;border:1px solid ${C.line};background:#fff;border-radius:10px;color:${C.navy};display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.cx-icon-btn:hover{background:#f8fafc}.cx-icon-btn.small{width:30px;height:30px}.cx-today-btn,.cx-secondary,.cx-primary,.cx-action-btn,.cx-reset,.cx-filter-toggle{border-radius:10px;border:1px solid ${C.line};padding:9px 12px;font-weight:800;font-size:13px;display:inline-flex;gap:7px;align-items:center;justify-content:center;cursor:pointer;text-decoration:none}.cx-today-btn,.cx-secondary{background:#fff;color:${C.navy}}.cx-primary{background:${C.navy};border-color:${C.navy};color:#fff;box-shadow:0 8px 20px rgba(30,41,63,.16)}.cx-primary:hover{filter:brightness(1.05)}.cx-primary.compact{padding:7px 10px;font-size:12px}.cx-primary.full,.cx-secondary.full{width:100%;margin-top:9px}.cx-view-switch{grid-area:views;display:flex;border:1px solid ${C.line};background:#f8fafc;padding:3px;border-radius:11px}.cx-view-switch button{border:0;background:transparent;color:${C.muted};font-weight:800;padding:7px 11px;border-radius:8px;cursor:pointer}.cx-view-switch button.active{background:${C.navy};color:#fff;box-shadow:0 4px 12px rgba(30,41,63,.16)}.cx-top-actions{grid-area:actions;display:flex;justify-content:flex-end;align-items:center;gap:8px}.cx-search{min-width:320px;max-width:520px;flex:1;display:flex;align-items:center;gap:7px;border:1px solid ${C.line};border-radius:10px;padding:0 10px;background:#fff;color:${C.muted}}.cx-search input{border:0;outline:0;background:transparent;width:100%;padding:9px 0;color:${C.text}}.cx-layout{max-width:1680px;margin:0 auto;display:grid;grid-template-columns:1fr;gap:12px;align-items:start}.cx-layout.with-sidebar{grid-template-columns:238px minmax(0,1fr)}.cx-sidebar{position:sticky;top:10px;background:#fff;border:1px solid rgba(30,41,63,.08);border-radius:16px;padding:12px;box-shadow:0 8px 30px rgba(30,41,63,.05);max-height:calc(100vh - 24px);overflow:auto}.cx-side-head{display:flex;align-items:center;justify-content:space-between;color:${C.navy};font-size:13px;margin-bottom:10px}.cx-mini-week,.cx-mini-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}.cx-mini-week span{text-align:center;color:#94a3b8;font-size:10px;font-weight:800;padding:4px 0}.cx-mini-grid button{aspect-ratio:1;border:0;background:transparent;border-radius:8px;color:${C.navy};font-size:11px;position:relative;cursor:pointer}.cx-mini-grid button:hover{background:#f1f5f9}.cx-mini-grid button.outside{opacity:.35}.cx-mini-grid button.selected{background:${C.navy};color:#fff}.cx-mini-grid button.today:not(.selected){outline:1px solid ${C.ruby};color:${C.ruby};font-weight:900}.cx-mini-grid button i{position:absolute;width:4px;height:4px;border-radius:50%;background:${C.navy};bottom:3px;left:50%;transform:translateX(-50%)}.cx-mini-grid button i.birthday{background:${C.gold}}.cx-mini-grid button.selected i{background:#fff}.cx-filter-toggle{width:100%;margin-top:12px;background:#f8fafc;color:${C.navy}}.cx-filter-stack{display:grid;gap:8px;margin-top:9px;padding:10px;background:#f8fafc;border-radius:12px}.cx-filter-stack label,.cx-form label,.cx-time-controls label{display:grid;gap:5px;color:#475569;font-size:11px;font-weight:800}.cx-filter-stack select,.cx-form input,.cx-form select,.cx-form textarea,.cx-time-controls input,.cx-time-controls select,.cx-drawer-section textarea{width:100%;box-sizing:border-box;border:1px solid ${C.line};border-radius:9px;background:#fff;padding:9px;color:${C.text};outline:none}.cx-filter-stack select:focus,.cx-form input:focus,.cx-form select:focus,.cx-form textarea:focus,.cx-time-controls input:focus,.cx-time-controls select:focus,.cx-drawer-section textarea:focus{border-color:${C.gold};box-shadow:0 0 0 3px rgba(181,165,115,.13)}.cx-reset{background:transparent;color:${C.muted};padding:7px}.cx-birthdays{margin-top:14px;padding-top:13px;border-top:1px solid ${C.line}}.cx-birthday-title{display:flex;align-items:center;gap:8px;color:${C.gold};margin-bottom:8px}.cx-birthday-title div{display:grid}.cx-birthday-title strong{color:${C.navy};font-size:13px}.cx-birthday-title small{font-size:10px;color:${C.muted}}.cx-birthday-list{display:grid;gap:5px}.cx-birthday-row{display:grid;grid-template-columns:40px minmax(0,1fr) 28px;align-items:center;gap:6px;padding:7px 6px;border-radius:9px;cursor:pointer}.cx-birthday-row:hover{background:#f8fafc}.cx-birthday-date{font-size:10px;font-weight:900;color:${C.gold}}.cx-birthday-row div{display:grid;min-width:0}.cx-birthday-row strong{font-size:11px;color:${C.navy};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cx-birthday-row small{font-size:9px;color:${C.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cx-birthday-row a{color:${C.navy};display:flex}.cx-empty-small{color:${C.muted};font-size:11px;padding:6px}.cx-calendar-area{position:relative;min-width:0}.cx-floating-sidebar{position:absolute;z-index:5;top:10px;left:10px;width:34px;height:34px;border:1px solid ${C.line};border-radius:10px;background:#fff;color:${C.navy};display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 14px rgba(30,41,63,.08)}.cx-loading{position:absolute;z-index:8;right:14px;top:12px;background:${C.navy};color:#fff;border-radius:999px;padding:6px 10px;font-size:10px;font-weight:800;box-shadow:0 6px 18px rgba(30,41,63,.2)}.cx-week-card,.cx-month-card,.cx-day-summary,.cx-event-group{background:#fff;border:1px solid rgba(30,41,63,.08);border-radius:16px;box-shadow:0 8px 30px rgba(30,41,63,.05);overflow:hidden}.cx-week-head{display:grid;grid-template-columns:58px repeat(7,minmax(118px,1fr));border-bottom:1px solid ${C.line};position:sticky;top:0;z-index:4;background:#fff}.cx-week-corner{border-right:1px solid ${C.line}}.cx-week-day-head{min-height:65px;border-right:1px solid ${C.line};padding:8px;text-align:center;display:flex;flex-direction:column;align-items:center}.cx-week-day-head span{font-size:10px;color:${C.muted};text-transform:uppercase;font-weight:800}.cx-week-day-head strong{width:27px;height:27px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:14px;color:${C.navy}}.cx-week-day-head.today strong{background:${C.ruby};color:#fff}.cx-all-day{width:100%;display:grid;gap:2px;margin-top:3px}.cx-all-day button{border:0;border-left:2px solid ${C.gold};background:#f8fafc;color:${C.navy};font-size:9px;padding:3px 4px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}.cx-week-scroll{overflow:auto;max-height:calc(100vh - 185px)}.cx-week-body{display:grid;grid-template-columns:58px repeat(7,minmax(118px,1fr));min-width:890px;position:relative}.cx-time-col{position:relative;border-right:1px solid ${C.line}}.cx-time-col span{position:absolute;right:7px;font-size:9px;color:#94a3b8}.cx-day-col{position:relative;border-right:1px solid ${C.line};background:#fff}.cx-day-col.today{background:rgba(161,28,39,.018)}.cx-day-col>i{position:absolute;left:0;right:0;border-top:1px solid #eef2f7}.cx-event-block{position:absolute;left:4px;right:4px;border:0;border-left:3px solid ${C.navy};border-radius:7px;background:#f8fafc;color:${C.navy};padding:5px 6px;text-align:left;display:flex;flex-direction:column;overflow:hidden;cursor:pointer;box-shadow:0 2px 7px rgba(15,23,42,.05);z-index:2}.cx-event-block:hover{box-shadow:0 6px 16px rgba(15,23,42,.12);z-index:3}.cx-event-block>span{font-size:9px;font-weight:800;color:${C.muted}}.cx-event-block>strong{font-size:10px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cx-event-block>small{font-size:8px;color:${C.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cx-event-block.late{background:rgba(161,28,39,.07)}.cx-event-block.done{opacity:.5;background:#f1f5f9}.cx-day-view{display:grid;gap:12px}.cx-day-summary{padding:13px 15px;display:flex;justify-content:space-between;align-items:center}.cx-day-summary>div{display:flex;align-items:center;gap:8px;color:${C.navy};font-weight:800;text-transform:capitalize}.cx-event-group{overflow:visible}.cx-group-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid ${C.line}}.cx-group-head h3{margin:0;font-size:14px;color:${C.navy}}.cx-group-head span{border-radius:999px;padding:3px 8px;background:#f1f5f9;color:${C.navy};font-size:10px;font-weight:900}.cx-event-group.late .cx-group-head h3{color:${C.ruby}}.cx-group-list{display:grid}.cx-list-event{display:grid;grid-template-columns:55px 3px minmax(0,1fr) minmax(90px,150px) auto 20px;gap:10px;align-items:center;border:0;border-bottom:1px solid #f1f5f9;background:#fff;padding:10px 14px;text-align:left;cursor:pointer;color:${C.text}}.cx-list-event:hover{background:#fafafa}.cx-list-time{font-weight:900;color:${C.navy};font-size:12px}.cx-list-event>i{height:28px;border-radius:3px}.cx-list-main{display:grid;min-width:0}.cx-list-main strong{font-size:12px;color:${C.navy};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cx-list-main small,.cx-list-owner{font-size:10px;color:${C.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cx-status{display:inline-flex;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:900;white-space:nowrap}.cx-status.late{background:rgba(161,28,39,.1);color:${C.ruby}}.cx-status.done{background:#eef2f7;color:#64748b}.cx-status.scheduled{background:rgba(30,41,63,.07);color:${C.navy}}.cx-empty-row{padding:18px;color:${C.muted};font-size:11px;text-align:center}.cx-month-week,.cx-month-grid{display:grid;grid-template-columns:repeat(7,minmax(115px,1fr))}.cx-month-week{border-bottom:1px solid ${C.line};background:#fafafa}.cx-month-week span{text-align:center;padding:9px;color:${C.muted};font-size:10px;font-weight:900;text-transform:uppercase}.cx-month-grid{min-width:805px}.cx-month-day{min-height:128px;border-right:1px solid ${C.line};border-bottom:1px solid ${C.line};padding:7px;position:relative;background:#fff}.cx-month-day.outside{background:#fafafa;color:#94a3b8}.cx-month-day.today{background:rgba(161,28,39,.018)}.cx-month-number{width:26px;height:26px;border:0;background:transparent;border-radius:50%;font-weight:900;color:${C.navy};cursor:pointer}.cx-month-day.today .cx-month-number{background:${C.ruby};color:#fff}.cx-month-birthday{position:absolute;right:7px;top:8px;border:0;background:rgba(181,165,115,.13);color:${C.gold};border-radius:999px;padding:4px 6px;display:flex;gap:3px;align-items:center;font-size:9px;font-weight:900;cursor:pointer}.cx-month-events{display:grid;gap:3px;margin-top:4px}.cx-month-events>button{border:0;border-left:2px solid ${C.navy};background:#f8fafc;color:${C.navy};border-radius:4px;padding:4px 5px;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;cursor:pointer}.cx-month-events>button span{color:${C.muted};font-weight:800;margin-right:4px}.cx-month-events .cx-more{border-left:0;background:transparent;color:${C.muted};font-weight:800}.cx-drawer-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.28);z-index:80;backdrop-filter:blur(1px)}.cx-drawer{position:fixed;z-index:81;right:0;top:0;bottom:0;width:min(440px,96vw);background:#fff;box-shadow:-16px 0 50px rgba(15,23,42,.18);padding:18px;overflow:auto;animation:cxSlide .18s ease-out}.cx-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:13px;border-bottom:1px solid ${C.line}}.cx-drawer-head h2{margin:3px 0 0;color:${C.navy};font-size:20px;line-height:1.2}.cx-event-meta{display:flex;gap:6px;flex-wrap:wrap;margin:13px 0}.cx-type-chip,.cx-op-chip{border:1px solid ${C.navy};background:#fff;border-radius:999px;padding:4px 8px;font-size:9px;font-weight:900}.cx-op-chip{border-color:rgba(181,165,115,.45);color:#7a641f;background:rgba(181,165,115,.08);cursor:pointer}.cx-detail-card{border:1px solid ${C.line};border-radius:13px;padding:4px 12px}.cx-detail{display:grid;grid-template-columns:24px 1fr;gap:7px;padding:10px 0;border-bottom:1px solid #f1f5f9;color:${C.navy}}.cx-detail:last-child{border-bottom:0}.cx-detail>span{margin-top:1px;color:${C.gold}}.cx-detail div{display:grid}.cx-detail small{font-size:9px;color:${C.muted};text-transform:uppercase;letter-spacing:.4px;font-weight:800}.cx-detail strong{font-size:11px;line-height:1.45;color:${C.text}}.cx-action-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:13px 0}.cx-action-btn{background:#fff;color:${C.navy};border:1px solid ${C.line};border-radius:10px;padding:9px 10px;font-size:10px;font-weight:800;display:flex;gap:7px;align-items:center;justify-content:flex-start;cursor:pointer;text-decoration:none}.cx-action-btn.strong{background:${C.navy};border-color:${C.navy};color:#fff}.cx-drawer-section{margin-top:14px;padding-top:13px;border-top:1px solid ${C.line}}.cx-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.cx-section-title h3{margin:0;color:${C.navy};font-size:13px}.cx-section-title span{font-size:9px;color:${C.muted}}.cx-drawer-section textarea{min-height:78px;resize:vertical;font-family:inherit}.cx-link-btn{border:0;background:transparent;color:${C.ruby};font-size:10px;font-weight:800;cursor:pointer}.cx-time-controls{display:grid;grid-template-columns:1.5fr .8fr .8fr 1fr;gap:6px}.cx-time-controls .full-row{grid-column:1/-1;margin-top:3px}.cx-danger-link{margin-top:18px;border:0;background:transparent;color:${C.ruby};font-size:10px;font-weight:800;display:flex;align-items:center;gap:5px;cursor:pointer}.cx-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:15px}.cx-form label.full{grid-column:1/-1}.cx-form textarea{min-height:86px;resize:vertical;font-family:inherit}.cx-drawer-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:13px;border-top:1px solid ${C.line}}@keyframes cxSlide{from{transform:translateX(20px);opacity:.7}to{transform:translateX(0);opacity:1}}@media(max-width:1100px){.cx-topbar{grid-template-columns:auto 1fr;grid-template-areas:'title views' 'nav nav' 'actions actions'}.cx-layout.with-sidebar{grid-template-columns:210px minmax(0,1fr)}.cx-list-event{grid-template-columns:50px 3px minmax(0,1fr) auto 18px}.cx-list-owner{display:none}}@media(max-width:760px){.cx-agenda{padding:8px}.cx-topbar{grid-template-columns:1fr;grid-template-areas:'title' 'nav' 'views' 'actions';border-radius:14px}.cx-period-nav{flex-wrap:wrap}.cx-period-title{width:100%;margin:3px 0 0}.cx-top-actions{justify-content:stretch;flex-wrap:wrap}.cx-search{min-width:100%;order:3}.cx-top-actions>.cx-secondary,.cx-top-actions>.cx-primary{flex:1}.cx-view-switch{width:100%}.cx-view-switch button{flex:1}.cx-layout.with-sidebar{grid-template-columns:1fr}.cx-sidebar{position:relative;top:auto;max-height:none}.cx-week-scroll{max-height:70vh}.cx-list-event{grid-template-columns:46px 3px minmax(0,1fr) auto 16px;padding:9px 10px}.cx-list-event>.cx-status{display:none}.cx-month-card{overflow:auto}.cx-action-grid{grid-template-columns:1fr}.cx-time-controls{grid-template-columns:1fr 1fr}.cx-form{grid-template-columns:1fr}.cx-form label.full{grid-column:auto}.cx-drawer{width:94vw;padding:16px}.cx-period-title{font-size:13px}}
`;
