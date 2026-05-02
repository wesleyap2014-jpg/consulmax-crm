// src/pages/Agenda.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ====== Configuráveis ====== */
const ENABLE_DESKTOP_NOTIF = true;

const EMOJI = {
  festa: "\u{1F389}",
  brilho: "\u{2728}",
  brinde: "\u{1F942}",
  calendario: "\u{1F4C5}",
};

const BIRTHDAY_MSG = (nome: string) => {
  const primeiro = (nome || "").trim().split(/\s+/)[0] || "Olá";

  return (
`${primeiro}, ${EMOJI.festa} *Feliz Aniversário!* ${EMOJI.festa}

Hoje celebramos mais um capítulo da sua história, cheio de conquistas, aprendizados e sonhos que se renovam.
Que este novo ciclo seja repleto de *prosperidade, saúde e realizações* — e que cada meta se transforme em vitória.

Na *Consulmax*, acreditamos que planejar é o caminho para conquistar. Que você continue sonhando grande e realizando cada vez mais! ${EMOJI.brilho}

Um brinde ao seu futuro e a todas as conquistas que estão por vir.
${EMOJI.brinde} Parabéns pelo seu dia!`
  );
};

/** ====== Tipagens ====== */
type AgendaTipo = "aniversario" | "contato" | "assembleia" | "reuniao" | "visita" | "outro";
type AgendaOrigem = "auto" | "manual";

type AgendaEvento = {
  id: string;
  tipo: AgendaTipo;
  titulo: string | null;
  cliente_id: string | null;
  lead_id: string | null;
  user_id: string | null;
  inicio_at: string;
  fim_at: string | null;
  videocall_url: string | null;
  origem: AgendaOrigem;
  relacao_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  cliente?: { id: string; nome: string | null; telefone: string | null; observacoes?: string | null } | null;
  lead?: { id: string; nome: string | null; telefone: string | null; descricao?: string | null } | null;
  owner?: { id: string; auth_user_id: string; nome: string | null; role: string | null } | null;
};

type UserProfile = {
  id: string;
  auth_user_id: string;
  nome: string | null;
  role: "admin" | "vendedor" | "viewer" | string | null;
};

type ClienteLite = {
  id: string;
  nome: string | null;
  telefone: string | null;
  observacoes?: string | null;
};

type LeadLite = {
  id: string;
  nome: string | null;
  telefone: string | null;
  descricao?: string | null;
};

type ViewMode = "hoje" | "semana" | "mes" | "aniversarios" | "assembleias" | "manual" | "todos";

/** ====== Constantes ====== */
const PAGE_SIZE = 20;
const TIPOS: AgendaTipo[] = ["aniversario", "contato", "assembleia", "reuniao", "visita", "outro"];
const ORIGENS: AgendaOrigem[] = ["auto", "manual"];

const CALENDAR_DATE_TYPES: AgendaTipo[] = ["aniversario", "assembleia"];

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  goldLight: "#E0CE8C",
  off: "#F5F5F5",
  text: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  card: "rgba(255,255,255,0.62)",
};

/** ====== Helpers ====== */
const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");

function isMidnightUTC(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
}

function formatUTCDateBR(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function fmtDateTimeSmart(iso?: string | null) {
  if (!iso) return "—";

  if (isMidnightUTC(iso)) return formatUTCDateBR(iso);

  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateSmart(iso?: string | null) {
  if (!iso) return "—";

  if (isMidnightUTC(iso)) return formatUTCDateBR(iso);

  return new Date(iso).toLocaleDateString("pt-BR");
}

function fmtHour(iso?: string | null) {
  if (!iso) return "—";

  if (isMidnightUTC(iso)) return "Dia todo";

  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfMonthDate(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonthDate(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/**
 * Eventos normais usam dia local.
 * Ex.: reunião marcada hoje às 10h no Brasil precisa cair no hoje local.
 */
function localStartOfDayISO(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toISOString();
}

function localEndOfDayISO(dateStr: string) {
  const d = new Date(`${dateStr}T23:59:59.999`);
  return d.toISOString();
}

function isoRangeForLocalDay(dateStr: string) {
  return {
    startIso: localStartOfDayISO(dateStr),
    endIso: localEndOfDayISO(dateStr),
  };
}

/**
 * Aniversários e assembleias automáticas/all-day precisam usar a data nominal UTC.
 * Isso evita o bug:
 * - aniversário de amanhã aparecendo como hoje;
 * - aniversário de hoje sumindo do painel no decorrer do dia.
 */
function utcDayRange(dateStr: string) {
  return {
    startIso: `${dateStr}T00:00:00.000Z`,
    endIso: `${dateStr}T23:59:59.999Z`,
  };
}

function utcRangeByDateStrings(dateFrom: string, dateTo: string) {
  return {
    startIso: `${dateFrom}T00:00:00.000Z`,
    endIso: `${dateTo}T23:59:59.999Z`,
  };
}

function defaultEndFromStart(isoStart: string) {
  return new Date(new Date(isoStart).getTime() + 30 * 60 * 1000).toISOString();
}

function whatsappUrl(raw?: string | null) {
  const d = onlyDigits(String(raw || ""));
  if (!d) return null;

  const withCountry = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${withCountry}`;
}

function waWithText(phone?: string | null, text?: string) {
  const base = whatsappUrl(phone);
  if (!base) return null;

  if (!text) return base;

  const safeText = String(text)
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  return `${base}?text=${encodeURIComponent(safeText)}`;
}

function clipboardCopy(text: string) {
  try {
    const safeText = String(text).normalize("NFC");
    (navigator as any).clipboard?.writeText(safeText);
    alert("Copiado para a área de transferência.");
  } catch {
    prompt("Copie o texto:", text);
  }
}

function eventPerson(ev: AgendaEvento) {
  return ev.cliente?.nome || ev.lead?.nome || "—";
}

function eventPhone(ev: AgendaEvento) {
  return ev.cliente?.telefone || ev.lead?.telefone || null;
}

function eventIsCalendarDateType(ev: AgendaEvento) {
  return CALENDAR_DATE_TYPES.includes(ev.tipo);
}

function eventDateKey(ev: AgendaEvento) {
  const d = new Date(ev.inicio_at);

  if (eventIsCalendarDateType(ev) || isMidnightUTC(ev.inicio_at)) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  return toISODate(d);
}

function eventIsToday(ev: AgendaEvento) {
  return eventDateKey(ev) === todayKey();
}

function eventIsLate(ev: AgendaEvento) {
  if (eventIsCalendarDateType(ev)) return false;
  if (ev.origem !== "manual") return false;

  return new Date(ev.inicio_at).getTime() < Date.now();
}

function statusBadge(ev: AgendaEvento) {
  if (eventIsToday(ev)) {
    return {
      label: "Hoje",
      bg: "#E0CE8C33",
      color: "#7a641f",
      border: "#E0CE8C",
    };
  }

  if (eventIsLate(ev)) {
    return {
      label: "Atrasado",
      bg: "#A11C2722",
      color: C.ruby,
      border: "#A11C2755",
    };
  }

  return {
    label: "Programado",
    bg: "#1E293F14",
    color: C.navy,
    border: "#1E293F33",
  };
}

function monthNamePt(monthIndex: number) {
  const nomes = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  return nomes[monthIndex] || "";
}

function makeMonthDays(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const startWeekDay = first.getDay();
  const daysInMonth = last.getDate();

  const items: Array<{ date: Date | null; key: string }> = [];

  for (let i = 0; i < startWeekDay; i++) {
    items.push({ date: null, key: `empty-${i}` });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthIndex, day);
    items.push({ date, key: toISODate(date) });
  }

  return items;
}

function sameDateKey(a: Date, b = new Date()) {
  return toISODate(a) === toISODate(b);
}

function setTimeOnDate(dateStr: string, hour: number, minute: number) {
  return `${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Baixa um .ics de um único evento manual */
function downloadICS(ev: AgendaEvento) {
  const dt = (iso?: string | null) => (iso ? new Date(iso) : new Date());

  const dtToICS = (d: Date) => {
    const pad = (n: number, s = 2) => String(n).padStart(s, "0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  };

  const start = dt(ev.inicio_at);
  const end = dt(ev.fim_at || defaultEndFromStart(ev.inicio_at));

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Consulmax CRM//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.id}@consulmaxcrm`,
    `DTSTAMP:${dtToICS(new Date())}`,
    `DTSTART:${dtToICS(start)}`,
    `DTEND:${dtToICS(end)}`,
    `SUMMARY:${(ev.titulo || ev.tipo || "Evento").replace(/\n/g, " ")}`,
    ev.videocall_url ? `URL:${ev.videocall_url}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `${(ev.titulo || ev.tipo || "evento").replace(/\s+/g, "-")}.ics`;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

/** ====== Select base ====== */
const EVENT_SELECT = `
  id,tipo,titulo,cliente_id,lead_id,user_id,inicio_at,fim_at,videocall_url,origem,relacao_id,created_at,updated_at,
  cliente:clientes!agenda_eventos_cliente_id_fkey (id,nome,telefone,observacoes),
  lead:leads!agenda_eventos_lead_id_fkey (id,nome,telefone,descricao),
  owner:users!agenda_eventos_user_id_fkey (id,auth_user_id,nome,role)
`;

/** ====== Página ====== */
export default function AgendaPage() {
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const isAdmin = me?.role === "admin";

  const today = useMemo(() => new Date(), []);
  const weekAhead = useMemo(() => addDays(new Date(), 7), []);

  const [viewMode, setViewMode] = useState<ViewMode>("semana");

  const [dateFrom, setDateFrom] = useState<string>(() => toISODate(today));
  const [dateTo, setDateTo] = useState<string>(() => toISODate(weekAhead));
  const [fTipo, setFTipo] = useState<"" | AgendaTipo>("");
  const [fOrigem, setFOrigem] = useState<"" | AgendaOrigem>("");
  const [fUser, setFUser] = useState<string>("");

  const [eventsAll, setEventsAll] = useState<AgendaEvento[]>([]);
  const [events, setEvents] = useState<AgendaEvento[]>([]);
  const [todayEvents, setTodayEvents] = useState<AgendaEvento[]>([]);

  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [leads, setLeads] = useState<LeadLite[]>([]);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number>(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)), [total]);

  const [editing, setEditing] = useState<AgendaEvento | null>(null);
  const [editStart, setEditStart] = useState<string>("");
  const [editEnd, setEditEnd] = useState<string>("");

  const [noteEvent, setNoteEvent] = useState<AgendaEvento | null>(null);
  const [noteText, setNoteText] = useState("");

  const [birthdays, setBirthdays] = useState<AgendaEvento[]>([]);
  const [assemblies, setAssemblies] = useState<AgendaEvento[]>([]);
  const [loadingSide, setLoadingSide] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");

  const [mustOpenAgenda, setMustOpenAgenda] = useState<{ has: boolean; birthdays: AgendaEvento[] } | null>(null);

  const refreshTimer = useRef<number | null>(null);

  /** Calendário de novo evento */
  const nowForCalendar = useMemo(() => new Date(), []);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(nowForCalendar.getMonth());
  const [calendarYear, setCalendarYear] = useState(nowForCalendar.getFullYear());
  const [selectedDateForNew, setSelectedDateForNew] = useState<string>(todayKey());

  /** Criar manual */
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTipo, setNewTipo] = useState<AgendaTipo>("reuniao");
  const [newStart, setNewStart] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [newEnd, setNewEnd] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(30, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [newLink, setNewLink] = useState("");
  const [newRelationKind, setNewRelationKind] = useState<"none" | "cliente" | "lead">("none");
  const [newClienteId, setNewClienteId] = useState("");
  const [newLeadId, setNewLeadId] = useState("");
  const [newSearch, setNewSearch] = useState("");

  /** Auth */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const role = (user?.app_metadata as any)?.role || "viewer";

      if (user) {
        setMe({ id: user.id, role });
      }
    })();
  }, []);

  /** Usuários, clientes e leads */
  useEffect(() => {
    if (!me?.id) return;

    (async () => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from("users")
          .select("id,auth_user_id,nome,role")
          .order("nome", { ascending: true });

        if (!error) setUsers((data || []) as any);
      }

      const [{ data: cls }, { data: lds }] = await Promise.all([
        supabase
          .from("clientes")
          .select("id,nome,telefone,observacoes")
          .order("nome", { ascending: true })
          .limit(500),

        supabase
          .from("leads")
          .select("id,nome,telefone,descricao")
          .order("nome", { ascending: true })
          .limit(500),
      ]);

      setClientes((cls || []) as any);
      setLeads((lds || []) as any);
    })();
  }, [me?.id, isAdmin]);

  /** Helpers de query */
  function applyCommonFilters(query: any) {
    let q = query;

    if (fOrigem) q = q.eq("origem", fOrigem);
    if (isAdmin && fUser) q = q.eq("user_id", fUser);

    return q;
  }

  async function fetchCalendarDateEvents(tipo: AgendaTipo, fromDate: string, toDate: string) {
    const { startIso, endIso } = utcRangeByDateStrings(fromDate, toDate);

    let query = supabase
      .from("agenda_eventos")
      .select(EVENT_SELECT)
      .eq("tipo", tipo)
      .gte("inicio_at", startIso)
      .lte("inicio_at", endIso)
      .order("inicio_at", { ascending: true })
      .limit(1000);

    query = applyCommonFilters(query);

    const { data, error } = await query;

    if (error) throw error;

    return (data || []) as any as AgendaEvento[];
  }

  async function fetchNormalEvents(fromDate: string, toDate: string, tipo?: AgendaTipo | "") {
    const startFromIso = localStartOfDayISO(fromDate);
    const endToIso = localEndOfDayISO(toDate);

    let query = supabase
      .from("agenda_eventos")
      .select(EVENT_SELECT)
      .gte("inicio_at", startFromIso)
      .lte("inicio_at", endToIso)
      .order("inicio_at", { ascending: true })
      .limit(1000);

    if (tipo) {
      query = query.eq("tipo", tipo);
    } else {
      query = query.neq("tipo", "aniversario").neq("tipo", "assembleia");
    }

    query = applyCommonFilters(query);

    const { data, error } = await query;

    if (error) throw error;

    return (data || []) as any as AgendaEvento[];
  }

  function mergeEvents(listas: AgendaEvento[][]) {
    const map = new Map<string, AgendaEvento>();

    listas.flat().forEach((ev) => {
      if (!ev?.id) return;
      map.set(ev.id, ev);
    });

    return Array.from(map.values()).sort((a, b) => {
      const da = eventDateKey(a);
      const db = eventDateKey(b);

      if (da !== db) return da.localeCompare(db);

      return new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime();
    });
  }

  function paginateRows(rows: AgendaEvento[], targetPage: number) {
    const start = (targetPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    setEventsAll(rows);
    setTotal(rows.length);
    setEvents(rows.slice(start, end));
    setPage(targetPage);
  }

  /** Grade principal */
  async function loadEvents(targetPage = 1) {
    if (!dateFrom || !dateTo) {
      alert("Informe período de início e fim.");
      return;
    }

    setLoading(true);

    try {
      let rows: AgendaEvento[] = [];

      if (fTipo === "aniversario") {
        rows = await fetchCalendarDateEvents("aniversario", dateFrom, dateTo);
      } else if (fTipo === "assembleia") {
        rows = await fetchCalendarDateEvents("assembleia", dateFrom, dateTo);
      } else if (fTipo) {
        rows = await fetchNormalEvents(dateFrom, dateTo, fTipo);
      } else {
        const [normais, aniversarios, assembleias] = await Promise.all([
          fetchNormalEvents(dateFrom, dateTo),
          fetchCalendarDateEvents("aniversario", dateFrom, dateTo),
          fetchCalendarDateEvents("assembleia", dateFrom, dateTo),
        ]);

        rows = mergeEvents([normais, aniversarios, assembleias]);
      }

      paginateRows(rows, targetPage);
    } catch (e: any) {
      alert("Erro ao carregar agenda: " + (e?.message || "erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }

  async function loadTodayEvents() {
    const today = todayKey();

    try {
      const [normais, aniversarios, assembleias] = await Promise.all([
        fetchNormalEvents(today, today),
        fetchCalendarDateEvents("aniversario", today, today),
        fetchCalendarDateEvents("assembleia", today, today),
      ]);

      const rows = mergeEvents([normais, aniversarios, assembleias]);
      setTodayEvents(rows);
    } catch {
      setTodayEvents([]);
    }
  }

  useEffect(() => {
    if (!me?.id) return;

    loadEvents(1);
    loadTodayEvents();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    if (!me?.id) return;

    loadEvents(1);
    loadTodayEvents();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, fTipo, fOrigem, fUser, isAdmin]);

  /** Abas rápidas */
  function applyViewMode(mode: ViewMode) {
    setViewMode(mode);

    const now = new Date();

    if (mode === "hoje") {
      setDateFrom(toISODate(now));
      setDateTo(toISODate(now));
      setFTipo("");
      setFOrigem("");
    }

    if (mode === "semana") {
      setDateFrom(toISODate(now));
      setDateTo(toISODate(addDays(now, 7)));
      setFTipo("");
      setFOrigem("");
    }

    if (mode === "mes") {
      setDateFrom(toISODate(startOfMonthDate(now)));
      setDateTo(toISODate(endOfMonthDate(now)));
      setFTipo("");
      setFOrigem("");
    }

    if (mode === "aniversarios") {
      setDateFrom(toISODate(now));
      setDateTo(toISODate(addDays(now, 120)));
      setFTipo("aniversario");
      setFOrigem("");
    }

    if (mode === "assembleias") {
      setDateFrom(toISODate(now));
      setDateTo(toISODate(addDays(now, 120)));
      setFTipo("assembleia");
      setFOrigem("");
    }

    if (mode === "manual") {
      setDateFrom(toISODate(now));
      setDateTo(toISODate(addDays(now, 30)));
      setFTipo("");
      setFOrigem("manual");
    }

    if (mode === "todos") {
      setDateFrom(toISODate(now));
      setDateTo(toISODate(addDays(now, 30)));
      setFTipo("");
      setFOrigem("");
    }
  }

  /** Painéis rápidos */
  async function loadSideLists() {
    setLoadingSide(true);

    try {
      const fromDate = todayKey();
      const toDate = toISODate(addDays(new Date(), 120));
      const { startIso, endIso } = utcRangeByDateStrings(fromDate, toDate);

      let qBirth = supabase
        .from("agenda_eventos")
        .select(`
          id,tipo,titulo,cliente_id,lead_id,user_id,inicio_at,fim_at,videocall_url,origem,relacao_id,created_at,updated_at,
          cliente:clientes!agenda_eventos_cliente_id_fkey (id,nome,telefone,observacoes),
          lead:leads!agenda_eventos_lead_id_fkey (id,nome,telefone,descricao)
        `)
        .eq("tipo", "aniversario")
        .gte("inicio_at", startIso)
        .lte("inicio_at", endIso)
        .order("inicio_at", { ascending: true })
        .limit(100);

      let qAsm = supabase
        .from("agenda_eventos")
        .select(`
          id,tipo,titulo,cliente_id,lead_id,user_id,inicio_at,fim_at,videocall_url,origem,relacao_id,created_at,updated_at
        `)
        .eq("tipo", "assembleia")
        .gte("inicio_at", startIso)
        .lte("inicio_at", endIso)
        .order("inicio_at", { ascending: true })
        .limit(100);

      if (quickSearch) {
        qBirth = qBirth.ilike("titulo", `%${quickSearch}%`);
        qAsm = qAsm.ilike("titulo", `%${quickSearch}%`);
      }

      const [{ data: b }, { data: a }] = await Promise.all([qBirth, qAsm]);

      setBirthdays((b || []) as any);
      setAssemblies((a || []) as any);
    } finally {
      setLoadingSide(false);
    }
  }

  useEffect(() => {
    loadSideLists();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickSearch]);

  /** Realtime com debounce */
  useEffect(() => {
    const ch = supabase
      .channel("agenda-realtime-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_eventos" }, () => {
        if (refreshTimer.current) window.clearTimeout(refreshTimer.current);

        refreshTimer.current = window.setTimeout(() => {
          loadEvents(page);
          loadTodayEvents();
          loadSideLists();
        }, 250);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, fUser, isAdmin, dateFrom, dateTo, fTipo, fOrigem]);

  /** Modal obrigatório ao entrar quando houver evento hoje */
  useEffect(() => {
    (async () => {
      if (!me?.id) return;

      const key = `agenda:shown:${todayKey()}`;
      if (localStorage.getItem(key)) return;

      const today = todayKey();
      const { startIso, endIso } = utcDayRange(today);

      const { data: bdays } = await supabase
        .from("agenda_eventos")
        .select(`
          id,tipo,titulo,inicio_at,
          cliente:clientes!agenda_eventos_cliente_id_fkey(id,nome,telefone)
        `)
        .eq("tipo", "aniversario")
        .gte("inicio_at", startIso)
        .lte("inicio_at", endIso)
        .limit(20);

      const [normais, assembleias] = await Promise.all([
        fetchNormalEvents(today, today),
        fetchCalendarDateEvents("assembleia", today, today),
      ]);

      const hasToday = (bdays?.length || 0) > 0 || normais.length > 0 || assembleias.length > 0;

      if (hasToday) {
        setMustOpenAgenda({ has: true, birthdays: (bdays || []) as any });

        if (ENABLE_DESKTOP_NOTIF) {
          tryNotifyDesktop(bdays || [], [...normais, ...assembleias]);
        }
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  /** Calendário overlay */
  function openCalendarOverlay() {
    const n = new Date();

    setCalendarMonth(n.getMonth());
    setCalendarYear(n.getFullYear());
    setCalendarOpen(true);
  }

  function moveCalendarMonth(delta: number) {
    const d = new Date(calendarYear, calendarMonth + delta, 1);

    setCalendarYear(d.getFullYear());
    setCalendarMonth(d.getMonth());
  }

  function selectCalendarDay(date: Date) {
    const key = toISODate(date);

    setSelectedDateForNew(key);
    setNewStart(setTimeOnDate(key, 9, 0));
    setNewEnd(setTimeOnDate(key, 9, 30));
    setNewTipo("reuniao");
    setNewTitle("");
    setNewLink("");
    setNewRelationKind("none");
    setNewClienteId("");
    setNewLeadId("");
    setNewSearch("");

    setCalendarOpen(false);
    setCreating(true);
  }

  /** Reagendar/excluir */
  function openEdit(ev: AgendaEvento) {
    setEditing(ev);

    const s = new Date(ev.inicio_at);
    const e = new Date(ev.fim_at || defaultEndFromStart(ev.inicio_at));

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

    setEditStart(fmt(s));
    setEditEnd(fmt(e));
  }

  function closeEdit() {
    setEditing(null);
    setEditStart("");
    setEditEnd("");
  }

  async function saveReschedule() {
    if (!editing) return;

    if (editing.origem !== "manual") {
      alert("Somente eventos manuais podem ser reagendados aqui.");
      return;
    }

    if (!editStart || !editEnd) {
      alert("Informe início e fim.");
      return;
    }

    const startIso = new Date(editStart).toISOString();
    const endIso = new Date(editEnd).toISOString();

    if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
      alert("O fim não pode ser anterior ao início.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from("agenda_eventos")
        .update({ inicio_at: startIso, fim_at: endIso })
        .eq("id", editing.id);

      if (error) {
        alert("Não foi possível reagendar: " + error.message);
        return;
      }

      closeEdit();

      await loadEvents(page);
      await loadTodayEvents();
      await loadSideLists();

      alert("Evento reagendado!");
    } finally {
      setLoading(false);
    }
  }

  async function deleteEvent(ev: AgendaEvento) {
    if (ev.origem !== "manual") {
      alert("Somente eventos manuais podem ser excluídos aqui.");
      return;
    }

    if (!confirm("Tem certeza que deseja excluir este evento?")) return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from("agenda_eventos")
        .delete()
        .eq("id", ev.id);

      if (error) {
        alert("Não foi possível excluir: " + error.message);
        return;
      }

      await loadEvents(page);
      await loadTodayEvents();
      await loadSideLists();

      alert("Evento excluído.");
    } finally {
      setLoading(false);
    }
  }

  async function createManual() {
    if (!newTitle.trim()) return alert("Informe o título.");
    if (!newStart || !newEnd) return alert("Informe início e fim.");

    const startIso = new Date(newStart).toISOString();
    const endIso = new Date(newEnd).toISOString();

    if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
      alert("O fim não pode ser anterior ao início.");
      return;
    }

    const payload: any = {
      tipo: newTipo,
      titulo: newTitle.trim(),
      inicio_at: startIso,
      fim_at: endIso,
      origem: "manual",
      videocall_url: newLink.trim() || null,
      user_id: me?.id || null,
      cliente_id: null,
      lead_id: null,
    };

    if (newRelationKind === "cliente" && newClienteId) {
      payload.cliente_id = newClienteId;
    }

    if (newRelationKind === "lead" && newLeadId) {
      payload.lead_id = newLeadId;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from("agenda_eventos")
        .insert([payload]);

      if (error) {
        alert("Falha ao criar evento: " + error.message);
        return;
      }

      setCreating(false);
      setNewTitle("");
      setNewLink("");
      setNewRelationKind("none");
      setNewClienteId("");
      setNewLeadId("");
      setNewSearch("");

      await loadEvents(1);
      await loadTodayEvents();
      await loadSideLists();

      alert("Evento criado!");
    } finally {
      setLoading(false);
    }
  }

  function openNote(ev: AgendaEvento) {
    setNoteEvent(ev);
    setNoteText("");
  }

  function closeNote() {
    setNoteEvent(null);
    setNoteText("");
  }

  async function saveNote() {
    if (!noteEvent) return;

    const txt = noteText.trim();
    if (!txt) return alert("Digite uma observação para registrar.");

    const stamp = new Date().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const linha = `\n\n[Agenda - ${stamp}] ${noteEvent.titulo || noteEvent.tipo}: ${txt}`;

    setLoading(true);

    try {
      if (noteEvent.cliente_id) {
        const atual = noteEvent.cliente?.observacoes || "";

        const { error } = await supabase
          .from("clientes")
          .update({ observacoes: `${atual}${linha}` })
          .eq("id", noteEvent.cliente_id);

        if (error) {
          alert("Não foi possível registrar a nota no cliente: " + error.message);
          return;
        }
      } else if (noteEvent.lead_id) {
        const atual = noteEvent.lead?.descricao || "";

        const { error } = await supabase
          .from("leads")
          .update({ descricao: `${atual}${linha}` })
          .eq("id", noteEvent.lead_id);

        if (error) {
          alert("Não foi possível registrar a nota no lead: " + error.message);
          return;
        }
      } else {
        alert("Este evento não está vinculado a cliente ou lead. Vincule o evento para registrar histórico.");
        return;
      }

      closeNote();

      await loadEvents(page);
      await loadTodayEvents();

      alert("Nota registrada no histórico.");
    } finally {
      setLoading(false);
    }
  }

  /** Render helpers */
  const showingFrom = useMemo(() => (total ? (page - 1) * PAGE_SIZE + 1 : 0), [page, total]);
  const showingTo = useMemo(() => Math.min(page * PAGE_SIZE, total || 0), [page, total]);

  const todayBirthdays = useMemo(
    () => todayEvents.filter((e) => e.tipo === "aniversario"),
    [todayEvents]
  );

  const todayAssemblies = useMemo(
    () => todayEvents.filter((e) => e.tipo === "assembleia"),
    [todayEvents]
  );

  const todayManual = useMemo(
    () => todayEvents.filter((e) => e.origem === "manual"),
    [todayEvents]
  );

  const lateEvents = useMemo(
    () => eventsAll.filter(eventIsLate),
    [eventsAll]
  );

  const filteredClientes = useMemo(() => {
    const q = newSearch.trim().toLowerCase();

    if (!q) return clientes.slice(0, 120);

    return clientes
      .filter((c) => `${c.nome || ""} ${c.telefone || ""}`.toLowerCase().includes(q))
      .slice(0, 120);
  }, [clientes, newSearch]);

  const filteredLeads = useMemo(() => {
    const q = newSearch.trim().toLowerCase();

    if (!q) return leads.slice(0, 120);

    return leads
      .filter((l) => `${l.nome || ""} ${l.telefone || ""}`.toLowerCase().includes(q))
      .slice(0, 120);
  }, [leads, newSearch]);

  const calendarDays = useMemo(
    () => makeMonthDays(calendarYear, calendarMonth),
    [calendarYear, calendarMonth]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!editing && !noteEvent && !mustOpenAgenda?.has && !calendarOpen && !creating) return;

      if (e.key === "Escape") {
        if (editing) closeEdit();
        if (noteEvent) closeNote();
        if (calendarOpen) setCalendarOpen(false);
        if (creating) setCreating(false);
        if (mustOpenAgenda?.has) setMustOpenAgenda(null);
      }

      if (e.key === "Enter" && editing) {
        saveReschedule();
      }
    }

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, noteEvent, mustOpenAgenda?.has, calendarOpen, creating]);

  return (
    <div className="agenda-wrap" style={{ maxWidth: 1240, margin: "0 auto", padding: 16 }}>
      <div className="lg-blobs">
        <div className="lg-blob ruby" />
        <div className="lg-blob navy" />
      </div>
      <div className="lg-shine" />

      <header style={hero}>
        <div>
          <p style={eyebrow}>CRM Consulmax</p>
          <h1 style={{ margin: "2px 0 6px 0", color: C.navy, letterSpacing: -0.4 }}>
            Agenda Operacional
          </h1>
          <p style={{ margin: 0, color: C.muted }}>
            Compromissos, aniversários, assembleias e contatos em uma visão prática para ação.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            style={btnSecondary}
            onClick={() => {
              loadEvents(page);
              loadTodayEvents();
              loadSideLists();
            }}
            disabled={loading}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>

          <button style={btnPrimary} onClick={openCalendarOverlay}>
            + Novo evento
          </button>
        </div>
      </header>

      <section style={kpiGrid}>
        <MetricCard
          title="Eventos hoje"
          value={todayEvents.length}
          hint={`${todayManual.length} manuais`}
          tone="navy"
        />

        <MetricCard
          title="Aniversários hoje"
          value={todayBirthdays.length}
          hint="Ação rápida no WhatsApp"
          tone="gold"
        />

        <MetricCard
          title="Assembleias hoje"
          value={todayAssemblies.length}
          hint="Acompanhar grupos"
          tone="ruby"
        />

        <MetricCard
          title="Atrasados no filtro"
          value={lateEvents.length}
          hint="Revisar ou concluir"
          tone={lateEvents.length ? "ruby" : "navy"}
        />
      </section>

      {todayEvents.length > 0 && (
        <section style={card} aria-label="Prioridades do dia">
          <div style={listHeader}>
            <div>
              <p style={eyebrow}>Prioridades</p>
              <h3 style={{ margin: 0, color: C.navy }}>Hoje na sua agenda</h3>
            </div>

            <button style={btnSecondary} onClick={() => applyViewMode("hoje")}>
              Ver somente hoje
            </button>
          </div>

          <div style={todayGrid}>
            {todayEvents.slice(0, 8).map((ev) => {
              const badge = statusBadge(ev);
              const person = eventPerson(ev);
              const wa = waWithText(eventPhone(ev), ev.tipo === "aniversario" ? BIRTHDAY_MSG(person) : undefined);

              return (
                <div key={ev.id} style={priorityCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={chip(ev.tipo)}>{ev.tipo}</span>
                    <span style={{ ...miniBadge, background: badge.bg, color: badge.color, borderColor: badge.border }}>
                      {badge.label}
                    </span>
                  </div>

                  <strong style={{ color: C.text, marginTop: 10, display: "block" }}>
                    {ev.titulo || ev.tipo}
                  </strong>

                  <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 13 }}>
                    {fmtHour(ev.inicio_at)} • {person}
                  </p>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" style={btnTiny}>
                        WhatsApp
                      </a>
                    )}

                    {ev.tipo === "aniversario" && (
                      <button style={btnTiny} onClick={() => clipboardCopy(BIRTHDAY_MSG(person))}>
                        Copiar parabéns
                      </button>
                    )}

                    {(ev.cliente_id || ev.lead_id) && (
                      <button style={btnTiny} onClick={() => openNote(ev)}>
                        Registrar nota
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section style={card}>
        <div style={tabWrap}>
          {[
            ["hoje", "Hoje"],
            ["semana", "Semana"],
            ["mes", "Mês"],
            ["aniversarios", "Aniversários"],
            ["assembleias", "Assembleias"],
            ["manual", "Manuais"],
            ["todos", "Todos"],
          ].map(([key, label]) => (
            <button
              key={key}
              style={viewMode === key ? tabActive : tab}
              onClick={() => applyViewMode(key as ViewMode)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section style={quickPanelsGrid}>
        <div style={card} aria-label="Painel de aniversários próximos">
          <div style={listHeader}>
            <div>
              <p style={eyebrow}>Relacionamento</p>
              <h3 style={{ margin: 0 }}>Aniversários próximos</h3>
            </div>

            <input
              style={{ ...input, width: 230 }}
              placeholder="Buscar título/nome..."
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              aria-label="Buscar aniversários por título ou nome"
            />
          </div>

          <div style={{ maxHeight: 290, overflow: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Quando</th>
                  <th style={th}>Cliente</th>
                  <th style={th}>Ações</th>
                </tr>
              </thead>

              <tbody>
                {loadingSide && (
                  <tr>
                    <td style={td} colSpan={3}>
                      <div className="skl" style={{ width: "100%", height: 18 }} />
                      <div className="skl" style={{ width: "80%", height: 18, marginTop: 8 }} />
                    </td>
                  </tr>
                )}

                {!loadingSide && birthdays.length === 0 && (
                  <tr>
                    <td style={td} colSpan={3}>Nenhum aniversário próximo.</td>
                  </tr>
                )}

                {birthdays.map((b, i) => {
                  const nome = b.cliente?.nome || b.lead?.nome || b.titulo || "Cliente";
                  const phone = b.cliente?.telefone || b.lead?.telefone || null;
                  const waMsg = waWithText(phone, BIRTHDAY_MSG(nome));
                  const isToday = eventIsToday(b);

                  return (
                    <tr key={b.id} className={i % 2 ? "bgRow" : undefined}>
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {fmtDateSmart(b.inicio_at)}
                          {isToday && (
                            <span style={{ ...miniBadge, background: "#E0CE8C33", color: "#7a641f", borderColor: "#E0CE8C" }}>
                              Hoje
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={td}>{nome}</td>

                      <td style={td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {waMsg ? (
                            <a href={waMsg} target="_blank" rel="noreferrer" style={btnPrimary}>
                              Parabenizar {EMOJI.festa}
                            </a>
                          ) : (
                            <button
                              style={btnPrimary}
                              onClick={() => clipboardCopy(BIRTHDAY_MSG(nome))}
                              title="Sem telefone: copia a mensagem para você colar no WhatsApp"
                            >
                              Copiar {EMOJI.festa}
                            </button>
                          )}

                          <button style={btnSecondary} onClick={() => clipboardCopy(BIRTHDAY_MSG(nome))}>
                            Copiar texto
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={card} aria-label="Painel de assembleias próximas">
          <div style={listHeader}>
            <div>
              <p style={eyebrow}>Grupos</p>
              <h3 style={{ margin: 0 }}>Assembleias próximas</h3>
            </div>

            <button style={btnSecondary} onClick={loadSideLists} disabled={loadingSide}>
              Atualizar
            </button>
          </div>

          <div style={{ maxHeight: 290, overflow: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Quando</th>
                  <th style={th}>Título/Grupo</th>
                </tr>
              </thead>

              <tbody>
                {loadingSide && (
                  <tr>
                    <td style={td} colSpan={2}>
                      <div className="skl" style={{ width: "100%", height: 18 }} />
                      <div className="skl" style={{ width: "70%", height: 18, marginTop: 8 }} />
                    </td>
                  </tr>
                )}

                {!loadingSide && assemblies.length === 0 && (
                  <tr>
                    <td style={td} colSpan={2}>Nenhuma assembleia próxima.</td>
                  </tr>
                )}

                {assemblies.map((a, i) => {
                  const isToday = eventIsToday(a);

                  return (
                    <tr key={a.id} className={i % 2 ? "bgRow" : undefined}>
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {fmtDateTimeSmart(a.inicio_at)}
                          {isToday && (
                            <span style={{ ...miniBadge, background: "#E0CE8C33", color: "#7a641f", borderColor: "#E0CE8C" }}>
                              Hoje
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={td}>{a.titulo || "Assembleia"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section style={card} aria-label="Filtros de pesquisa">
        <div style={listHeader}>
          <div>
            <p style={eyebrow}>Filtros</p>
            <h3 style={{ margin: 0 }}>Pesquisar agenda</h3>
          </div>

          <small style={{ color: C.muted }}>
            {total > 0 ? `Mostrando ${showingFrom}-${showingTo} de ${total}` : "Nenhum evento"}
          </small>
        </div>

        <div style={gridFilters}>
          <label style={label}>
            De
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={input} />
          </label>

          <label style={label}>
            Até
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={input} />
          </label>

          <label style={label}>
            Tipo
            <select value={fTipo} onChange={(e) => setFTipo(e.target.value as any)} style={input}>
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <label style={label}>
            Origem
            <select value={fOrigem} onChange={(e) => setFOrigem(e.target.value as any)} style={input}>
              <option value="">Todas</option>
              {ORIGENS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>

          {isAdmin && (
            <label style={label}>
              Usuário
              <select value={fUser} onChange={(e) => setFUser(e.target.value)} style={input}>
                <option value="">Equipe toda</option>
                {users.map((u) => (
                  <option key={u.id} value={u.auth_user_id}>
                    {u.nome || u.id} ({(u.role || "").toUpperCase()})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, gap: 12, flexWrap: "wrap" }}>
          <small style={{ color: C.muted }}>
            Aniversários e assembleias usam data nominal. Reuniões, visitas e contatos usam data/hora local.
          </small>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{ ...btnSecondary, opacity: page <= 1 ? 0.6 : 1 }}
              disabled={page <= 1 || loading}
              onClick={() => paginateRows(eventsAll, page - 1)}
            >
              ‹ Anterior
            </button>

            <span style={{ fontSize: 12, color: "#475569", alignSelf: "center" }}>
              Página {page} de {totalPages}
            </span>

            <button
              style={{ ...btnSecondary, opacity: page >= totalPages ? 0.6 : 1 }}
              disabled={page >= totalPages || loading}
              onClick={() => paginateRows(eventsAll, page + 1)}
            >
              Próxima ›
            </button>
          </div>
        </div>
      </section>

      <section style={card} aria-label="Lista de eventos">
        <div style={listHeader}>
          <div>
            <p style={eyebrow}>Agenda</p>
            <h3 style={{ margin: 0 }}>Eventos encontrados</h3>
          </div>

          <button style={btnSecondary} onClick={() => loadEvents(page)} disabled={loading}>
            Recarregar
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Status</th>
                <th style={th}>Início</th>
                <th style={th}>Fim</th>
                <th style={th}>Tipo</th>
                <th style={th}>Origem</th>
                <th style={th}>Título</th>
                <th style={th}>Cliente/Lead</th>
                <th style={th}>Responsável</th>
                <th style={{ ...th, width: 410 }}>Ações</th>
              </tr>
            </thead>

            <tbody>
              {events.map((e, i) => {
                const person = eventPerson(e);
                const phone = eventPhone(e);
                const wa = phone ? whatsappUrl(phone) : null;
                const canEdit = e.origem === "manual";
                const badge = statusBadge(e);

                return (
                  <tr key={e.id} className={i % 2 ? "bgRow" : undefined}>
                    <td style={td}>
                      <span style={{ ...miniBadge, background: badge.bg, color: badge.color, borderColor: badge.border }}>
                        {badge.label}
                      </span>
                    </td>

                    <td style={td}>{fmtDateTimeSmart(e.inicio_at)}</td>
                    <td style={td}>{fmtDateTimeSmart(e.fim_at)}</td>

                    <td style={td}>
                      <span style={chip(e.tipo)}>{e.tipo}</span>
                    </td>

                    <td style={td}>{e.origem}</td>
                    <td style={td}>{e.titulo || "—"}</td>
                    <td style={td}>{person}</td>
                    <td style={td}>{e.owner?.nome || "—"}</td>

                    <td style={td}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {wa ? (
                          <a href={wa} target="_blank" rel="noreferrer" style={btnSecondary}>
                            WhatsApp
                          </a>
                        ) : (
                          <button style={{ ...btnSecondary, opacity: 0.5 }} disabled>
                            WhatsApp
                          </button>
                        )}

                        {e.tipo === "aniversario" && (
                          <button style={btnSecondary} onClick={() => clipboardCopy(BIRTHDAY_MSG(person))}>
                            Copiar parabéns
                          </button>
                        )}

                        {e.videocall_url ? (
                          <>
                            <a href={e.videocall_url} target="_blank" rel="noreferrer" style={btnSecondary}>
                              Abrir link
                            </a>

                            <button style={btnSecondary} onClick={() => clipboardCopy(e.videocall_url!)}>
                              Copiar link
                            </button>
                          </>
                        ) : (
                          <button style={{ ...btnSecondary, opacity: 0.5 }} disabled>
                            Sem link
                          </button>
                        )}

                        {(e.cliente_id || e.lead_id) && (
                          <button style={btnSecondary} onClick={() => openNote(e)}>
                            Registrar nota
                          </button>
                        )}

                        <button
                          style={{ ...btnSecondary, opacity: canEdit ? 1 : 0.5 }}
                          disabled={!canEdit || loading}
                          onClick={() => openEdit(e)}
                        >
                          Reagendar
                        </button>

                        <button
                          style={{ ...btnGhost, opacity: canEdit ? 1 : 0.5 }}
                          disabled={!canEdit || loading}
                          onClick={() => deleteEvent(e)}
                        >
                          Excluir
                        </button>

                        {canEdit && (
                          <button style={btnSecondary} onClick={() => downloadICS(e)}>
                            .ics
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {events.length === 0 && (
                <tr>
                  <td style={td} colSpan={9}>
                    {loading ? "Carregando..." : "Nenhum evento encontrado para os filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {calendarOpen && (
        <>
          <div style={backdrop} onClick={() => setCalendarOpen(false)} />

          <div role="dialog" aria-modal="true" style={calendarModal}>
            <div style={listHeader}>
              <div>
                <p style={eyebrow}>Novo evento</p>
                <h3 style={{ margin: 0, color: C.navy }}>
                  Escolha uma data
                </h3>
              </div>

              <button style={btnGhost} onClick={() => setCalendarOpen(false)}>
                Fechar
              </button>
            </div>

            <div style={calendarTop}>
              <button style={btnSecondary} onClick={() => moveCalendarMonth(-1)}>
                ‹
              </button>

              <strong style={{ color: C.navy, fontSize: 18 }}>
                {monthNamePt(calendarMonth)} de {calendarYear}
              </strong>

              <button style={btnSecondary} onClick={() => moveCalendarMonth(1)}>
                ›
              </button>
            </div>

            <div style={calendarWeekGrid}>
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <div key={d} style={calendarWeekDay}>
                  {d}
                </div>
              ))}
            </div>

            <div style={calendarGrid}>
              {calendarDays.map((item) => {
                if (!item.date) {
                  return <div key={item.key} style={calendarEmptyDay} />;
                }

                const key = toISODate(item.date);
                const isToday = sameDateKey(item.date);
                const count = eventsAll.filter((ev) => eventDateKey(ev) === key).length;

                return (
                  <button
                    key={item.key}
                    style={{
                      ...calendarDay,
                      ...(isToday ? calendarDayToday : {}),
                    }}
                    onClick={() => selectCalendarDay(item.date!)}
                  >
                    <span style={{ fontWeight: 900 }}>
                      {item.date.getDate()}
                    </span>

                    {isToday && (
                      <small style={{ color: C.ruby, fontWeight: 900 }}>
                        Hoje
                      </small>
                    )}

                    {count > 0 && (
                      <small style={calendarCount}>
                        {count} evento{count > 1 ? "s" : ""}
                      </small>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {creating && (
        <>
          <div style={backdrop} onClick={() => setCreating(false)} />

          <div role="dialog" aria-modal="true" style={eventModal}>
            <div style={listHeader}>
              <div>
                <p style={eyebrow}>Novo compromisso</p>
                <h3 style={{ margin: 0 }}>
                  Criar evento em {selectedDateForNew.split("-").reverse().join("/")}
                </h3>
              </div>

              <button
                style={btnSecondary}
                onClick={() => {
                  setCreating(false);
                  setCalendarOpen(true);
                }}
              >
                Trocar data
              </button>
            </div>

            <div style={gridCreate}>
              <label style={label}>
                Título
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={input}
                  placeholder="Ex.: Reunião com cliente"
                  autoFocus
                />
              </label>

              <label style={label}>
                Tipo
                <select value={newTipo} onChange={(e) => setNewTipo(e.target.value as AgendaTipo)} style={input}>
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>

              <label style={label}>
                Início
                <input type="datetime-local" value={newStart} onChange={(e) => setNewStart(e.target.value)} style={input} />
              </label>

              <label style={label}>
                Fim
                <input type="datetime-local" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} style={input} />
              </label>

              <label style={label}>
                Vincular a
                <select
                  value={newRelationKind}
                  onChange={(e) => {
                    setNewRelationKind(e.target.value as any);
                    setNewClienteId("");
                    setNewLeadId("");
                  }}
                  style={input}
                >
                  <option value="none">Não vincular</option>
                  <option value="cliente">Cliente</option>
                  <option value="lead">Lead</option>
                </select>
              </label>

              {newRelationKind !== "none" && (
                <label style={label}>
                  Buscar
                  <input
                    value={newSearch}
                    onChange={(e) => setNewSearch(e.target.value)}
                    style={input}
                    placeholder="Nome ou telefone..."
                  />
                </label>
              )}

              {newRelationKind === "cliente" && (
                <label style={{ ...label, gridColumn: "span 2" }}>
                  Cliente
                  <select value={newClienteId} onChange={(e) => setNewClienteId(e.target.value)} style={input}>
                    <option value="">Selecione o cliente</option>
                    {filteredClientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome || "Cliente sem nome"} {c.telefone ? `• ${c.telefone}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {newRelationKind === "lead" && (
                <label style={{ ...label, gridColumn: "span 2" }}>
                  Lead
                  <select value={newLeadId} onChange={(e) => setNewLeadId(e.target.value)} style={input}>
                    <option value="">Selecione o lead</option>
                    {filteredLeads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome || "Lead sem nome"} {l.telefone ? `• ${l.telefone}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label style={{ ...label, gridColumn: "1 / -1" }}>
                Link de vídeo opcional
                <input
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  style={input}
                  placeholder="https://meet..."
                />
              </label>

              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={btnGhost} onClick={() => setCreating(false)} disabled={loading}>
                  Cancelar
                </button>

                <button style={btnPrimary} onClick={createManual} disabled={loading}>
                  {loading ? "Criando..." : "Criar evento"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {editing && (
        <>
          <div style={backdrop} onClick={closeEdit} />

          <div role="dialog" aria-modal="true" style={modal}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              Reagendar evento
            </h3>

            <div style={grid2}>
              <label style={label}>
                Início
                <input type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} style={input} autoFocus />
              </label>

              <label style={label}>
                Fim
                <input type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} style={input} />
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button style={btnGhost} onClick={closeEdit} disabled={loading}>
                Cancelar
              </button>

              <button style={btnPrimary} onClick={saveReschedule} disabled={loading}>
                {loading ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </>
      )}

      {noteEvent && (
        <>
          <div style={backdrop} onClick={closeNote} />

          <div role="dialog" aria-modal="true" style={modal}>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>
              Registrar nota
            </h3>

            <p style={{ margin: "0 0 12px", color: C.muted }}>
              {eventPerson(noteEvent)} • {noteEvent.titulo || noteEvent.tipo}
            </p>

            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              style={{ ...input, width: "100%", minHeight: 130, resize: "vertical", boxSizing: "border-box" }}
              placeholder="Ex.: Cliente confirmou reunião, deseja simular imóvel de R$ 300 mil..."
              autoFocus
            />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button style={btnGhost} onClick={closeNote} disabled={loading}>
                Cancelar
              </button>

              <button style={btnPrimary} onClick={saveNote} disabled={loading}>
                {loading ? "Salvando..." : "Salvar nota"}
              </button>
            </div>
          </div>
        </>
      )}

      {mustOpenAgenda?.has && (
        <>
          <div style={backdrop} />

          <div role="dialog" aria-modal="true" style={modal}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>
              Eventos de hoje
            </h3>

            {mustOpenAgenda.birthdays?.length ? (
              <div style={{ margin: "8px 0 12px 0" }}>
                <strong>Aniversários:</strong>

                <ul style={{ margin: "8px 0 0 18px" }}>
                  {mustOpenAgenda.birthdays.map((b) => (
                    <li key={b.id}>
                      {b.cliente?.nome || b.titulo || "Cliente"} — {fmtDateSmart(b.inicio_at)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p style={{ margin: "8px 0 12px 0" }}>
                Há compromissos hoje na sua agenda.
              </p>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                style={btnSecondary}
                onClick={() => {
                  localStorage.setItem(`agenda:shown:${todayKey()}`, "1");

                  if (location.pathname !== "/agenda") {
                    window.location.assign("/agenda");
                  } else {
                    setMustOpenAgenda(null);
                  }
                }}
              >
                Abrir Agenda
              </button>

              <button
                style={btnGhost}
                onClick={() => {
                  localStorage.setItem(`agenda:shown:${todayKey()}`, "1");
                  setMustOpenAgenda(null);
                }}
              >
                Depois
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        .bgRow {
          background: rgba(248,250,252,.7);
        }

        .agenda-wrap {
          position: relative;
          z-index: 1;
        }

        .lg-blobs {
          position: fixed;
          inset: -20vh -10vw auto auto;
          pointer-events: none;
          z-index: 0;
        }

        .lg-blob {
          position: absolute;
          filter: blur(60px);
          opacity: .22;
        }

        .lg-blob.ruby {
          width: 46vw;
          height: 46vw;
          background: radial-gradient(35% 35% at 50% 50%, #A11C27 0%, transparent 70%);
          top: -10vh;
          left: -12vw;
        }

        .lg-blob.navy {
          width: 40vw;
          height: 40vw;
          background: radial-gradient(35% 35% at 50% 50%, #1E293F 0%, transparent 70%);
          top: 30vh;
          right: -12vw;
        }

        .lg-shine {
          position: fixed;
          right: 2vw;
          bottom: 2vh;
          width: 26vw;
          height: 26vw;
          background: radial-gradient(35% 35% at 50% 50%, rgba(224,206,140,.28), transparent 70%);
          filter: blur(40px);
          pointer-events: none;
          z-index: 0;
        }

        .skl {
          background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 37%, #f1f5f9 63%);
          background-size: 400% 100%;
          animation: skl 1.4s ease infinite;
          border-radius: 8px;
        }

        @keyframes skl {
          0% { background-position: 100% 50%; }
          100% { background-position: 0 50%; }
        }

        button, a {
          transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
        }

        button:hover:not(:disabled), a:hover {
          transform: translateY(-1px);
        }

        @media (max-width: 1100px) {
          .agenda-wrap {
            padding: 12px !important;
          }
        }
      `}</style>
    </div>
  );
}

/** ====== Componentes auxiliares ====== */
function MetricCard({
  title,
  value,
  hint,
  tone,
}: {
  title: string;
  value: number | string;
  hint: string;
  tone: "ruby" | "navy" | "gold";
}) {
  const color = tone === "ruby" ? C.ruby : tone === "gold" ? C.gold : C.navy;

  return (
    <div style={metricCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <p style={{ margin: 0, color: C.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7 }}>
            {title}
          </p>

          <strong style={{ display: "block", color: C.navy, fontSize: 30, lineHeight: 1.1, marginTop: 8 }}>
            {value}
          </strong>

          <span style={{ display: "block", color: C.muted, fontSize: 12, marginTop: 6 }}>
            {hint}
          </span>
        </div>

        <span style={{
          width: 38,
          height: 38,
          borderRadius: 14,
          background: `${color}18`,
          border: `1px solid ${color}33`,
          boxShadow: `0 10px 25px ${color}18`,
        }} />
      </div>
    </div>
  );
}

/** ====== Notificação Desktop ====== */
function tryNotifyDesktop(bdays: any[], evs: any[]) {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  const title = bdays?.length
    ? `${EMOJI.festa} ${bdays.length} aniversário(s) hoje`
    : `${EMOJI.calendario} Você tem ${evs?.length || 1} compromisso(s) hoje`;

  const body = bdays?.length
    ? bdays.slice(0, 3).map((b: any) => b?.cliente?.nome || b?.titulo || "Cliente").join(", ")
    : "Abra a Agenda para conferir seus compromissos.";

  const show = () => {
    try {
      const n = new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: "consulmax-agenda-dia",
        renotify: false,
      });

      n.onclick = () => {
        try {
          window.focus();
        } catch {}

        window.location.assign("/agenda");
        n.close();
      };
    } catch {
      /* ignore */
    }
  };

  if (Notification.permission === "granted") {
    show();
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((p) => {
      if (p === "granted") show();
    });
  }
}

/** ====== Estilos ====== */
const card: React.CSSProperties = {
  position: "relative",
  background: C.card,
  borderRadius: 20,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.68)",
  boxShadow: "0 14px 44px rgba(30,41,63,0.10), 0 8px 26px rgba(161,28,39,0.08), inset 0 1px 0 rgba(255,255,255,0.42)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  marginBottom: 16,
};

const hero: React.CSSProperties = {
  ...card,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: 20,
};

const metricCard: React.CSSProperties = {
  ...card,
  marginBottom: 0,
  minHeight: 112,
};

const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const quickPanelsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginBottom: 16,
};

const todayGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const priorityCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.66)",
  border: "1px solid rgba(226,232,240,0.9)",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

const gridFilters: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  alignItems: "center",
};

const gridCreate: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  alignItems: "center",
};

const listHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const input: React.CSSProperties = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  outline: "none",
  background: "#fff",
  color: C.text,
};

const label: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: "#334155",
  fontWeight: 700,
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
};

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  color: "#475569",
  padding: "10px 8px",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "10px 8px",
  borderTop: "1px solid rgba(226,232,240,0.9)",
  verticalAlign: "middle",
  fontSize: 13,
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 12,
  background: C.ruby,
  color: "#fff",
  border: 0,
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 12px 26px rgba(161,28,39,0.20)",
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 11,
  background: "#f8fafc",
  color: C.navy,
  border: "1px solid #e2e8f0",
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const btnGhost: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 11,
  background: "#fff",
  color: C.text,
  border: "1px solid #e2e8f0",
  fontWeight: 700,
  cursor: "pointer",
};

const btnTiny: React.CSSProperties = {
  ...btnSecondary,
  padding: "6px 9px",
  fontSize: 12,
};

const tabWrap: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const tab: React.CSSProperties = {
  padding: "9px 13px",
  borderRadius: 999,
  background: "rgba(255,255,255,.7)",
  color: C.navy,
  border: "1px solid #e2e8f0",
  fontWeight: 800,
  cursor: "pointer",
};

const tabActive: React.CSSProperties = {
  ...tab,
  background: C.navy,
  color: "#fff",
  border: `1px solid ${C.navy}`,
  boxShadow: "0 12px 26px rgba(30,41,63,.18)",
};

const eyebrow: React.CSSProperties = {
  margin: 0,
  color: C.ruby,
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 1.1,
};

const miniBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  border: "1px solid transparent",
  whiteSpace: "nowrap",
};

function chip(tipo: AgendaTipo): React.CSSProperties {
  const tipoColor: Record<AgendaTipo, string> = {
    aniversario: C.goldLight,
    assembleia: C.navy,
    reuniao: C.ruby,
    visita: "#0ea5e9",
    contato: "#7c3aed",
    outro: "#64748b",
  };

  const c = tipoColor[tipo] || "#64748b";

  return {
    padding: "3px 9px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    background: `${c}22`,
    color: c,
    border: `1px solid ${c}55`,
    whiteSpace: "nowrap",
    display: "inline-flex",
  };
}

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  zIndex: 40,
};

const modal: React.CSSProperties = {
  position: "fixed",
  zIndex: 50,
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(620px, 92vw)",
  background: "#fff",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 20px 60px rgba(0,0,0,0.24)",
  border: "1px solid #eef2f7",
};

const calendarModal: React.CSSProperties = {
  position: "fixed",
  zIndex: 50,
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(860px, 94vw)",
  maxHeight: "90vh",
  overflow: "auto",
  background: "#fff",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 24px 70px rgba(0,0,0,0.26)",
  border: "1px solid #eef2f7",
};

const eventModal: React.CSSProperties = {
  position: "fixed",
  zIndex: 55,
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(820px, 94vw)",
  maxHeight: "90vh",
  overflow: "auto",
  background: "#fff",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
  border: "1px solid #eef2f7",
};

const calendarTop: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};

const calendarWeekGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 8,
  marginBottom: 8,
};

const calendarWeekDay: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  fontWeight: 900,
  color: C.muted,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const calendarGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  gap: 8,
};

const calendarEmptyDay: React.CSSProperties = {
  minHeight: 92,
  borderRadius: 16,
  background: "#f8fafc",
  border: "1px dashed #e2e8f0",
};

const calendarDay: React.CSSProperties = {
  minHeight: 92,
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  background: "#fff",
  color: C.navy,
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "space-between",
  padding: 10,
  textAlign: "left",
};

const calendarDayToday: React.CSSProperties = {
  border: `2px solid ${C.ruby}`,
  background: "#A11C2708",
};

const calendarCount: React.CSSProperties = {
  color: C.muted,
  fontSize: 11,
  fontWeight: 800,
};
