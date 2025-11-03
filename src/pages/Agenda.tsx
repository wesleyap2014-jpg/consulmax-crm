// src/pages/Agenda.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ====== Configuráveis ====== */
const BIRTHDAY_MSG = (nome: string) => {
  const primeiro = (nome || "").trim().split(/\s+/)[0] || "Olá";
  return (
`${primeiro}, 🎉 *Feliz Aniversário!* 🎉

Hoje celebramos mais um capítulo da sua história, cheio de conquistas, aprendizados e sonhos que se renovam.
Que este novo ciclo seja repleto de *prosperidade, saúde e realizações* — e que cada meta se transforme em vitória.

Na *Consulmax*, acreditamos que planejar é o caminho para conquistar. Que você continue sonhando grande e realizando cada vez mais! ✨

Um brinde ao seu futuro e a todas as conquistas que estão por vir.
🥂 Parabéns pelo seu dia!`
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
  cliente?: { id: string; nome: string | null; telefone: string | null } | null;
  lead?: { id: string; nome: string | null; telefone: string | null } | null;
  owner?: { id: string; auth_user_id: string; nome: string | null; role: string | null } | null;
};

type UserProfile = {
  id: string;
  auth_user_id: string;
  nome: string | null;
  role: "admin" | "vendedor" | "viewer" | string | null;
};

/** ====== Constantes ====== */
const PAGE_SIZE = 20;
const TIPOS: AgendaTipo[] = ["aniversario", "contato", "assembleia", "reuniao", "visita", "outro"];
const ORIGENS: AgendaOrigem[] = ["auto", "manual"];

/** ====== Helpers ====== */
const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");

// ---------- Correção definitiva de fuso para "all-day" ----------
function isMidnightUTC(iso?: string | null) {
  if (!iso) return false;
  // Usa campos UTC para evitar desvio por fuso local
  const d = new Date(iso);
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
}
// Extrai YYYY-MM-DD quando é 00:00:00Z (sem converter para local)
function ymdFromISO(iso?: string | null) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/);
  return m ? m[1] : null;
}
function formatYMD_BR(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}
// Data/hora com tratamento de "all-day"
function fmtDateTimeSmart(iso?: string | null) {
  if (!iso) return "—";
  if (isMidnightUTC(iso)) {
    const ymd = ymdFromISO(iso);
    return ymd ? formatYMD_BR(ymd) : new Date(iso).toLocaleDateString("pt-BR");
  }
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}
// Data sem hora com tratamento de "all-day"
function fmtDateSmart(iso?: string | null) {
  if (!iso) return "—";
  if (isMidnightUTC(iso)) {
    const ymd = ymdFromISO(iso);
    return ymd ? formatYMD_BR(ymd) : new Date(iso).toLocaleDateString("pt-BR");
  }
  return new Date(iso).toLocaleDateString("pt-BR");
}
// ----------------------------------------------------------------

const defaultEndFromStart = (isoStart: string) => new Date(new Date(isoStart).getTime() + 30 * 60 * 1000).toISOString();
const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function localStartOfDayISO(dateStr: string) {
  // dateStr YYYY-MM-DD (local). Gera range sem “comer” um dia.
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toISOString();
}
function localEndOfDayISO(dateStr: string) {
  const d = new Date(`${dateStr}T23:59:59.999`);
  return d.toISOString();
}
function isoRangeForLocalDay(dateStr: string) {
  return { startIso: localStartOfDayISO(dateStr), endIso: localEndOfDayISO(dateStr) };
}

const whatsappUrl = (raw?: string | null) => {
  const d = onlyDigits(String(raw || ""));
  if (!d) return null;
  const withCountry = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${withCountry}`;
};
const waWithText = (phone?: string | null, text?: string) => {
  const base = whatsappUrl(phone);
  if (!base) return null;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
};
function clipboardCopy(text: string) {
  try { (navigator as any).clipboard?.writeText(text); alert("Copiado para a área de transferência."); }
  catch { prompt("Copie o texto e envie no WhatsApp:", text); }
}

// Baixa um .ics de um único evento manual
function downloadICS(ev: AgendaEvento) {
  const dt = (iso?: string | null) => (iso ? new Date(iso) : new Date());
  const dtToICS = (d: Date) => {
    const pad = (n: number, s = 2) => String(n).padStart(s, "0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  };
  const start = dt(ev.inicio_at);
  const end = dt(ev.fim_at || defaultEndFromStart(ev.inicio_at));
  const ics = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Consulmax CRM//Agenda//PT-BR","CALSCALE:GREGORIAN","METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.id}@consulmaxcrm`,
    `DTSTAMP:${dtToICS(new Date())}`,
    `DTSTART:${dtToICS(start)}`,
    `DTEND:${dtToICS(end)}`,
    `SUMMARY:${(ev.titulo || ev.tipo || "Evento").replace(/\n/g, " ")}`,
    (ev.videocall_url ? `URL:${ev.videocall_url}` : ""),
    "END:VEVENT","END:VCALENDAR"
  ].filter(Boolean).join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${(ev.titulo || ev.tipo || "evento").replace(/\s+/g, "-")}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear(), mm = String(d.getMonth()+1).padStart(2,"0"), dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

/** ====== Página ====== */
export default function AgendaPage() {
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const isAdmin = me?.role === "admin";

  // filtros
  const today = useMemo(() => new Date(), []);
  const weekAhead = useMemo(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), []);
  const [dateFrom, setDateFrom] = useState<string>(() => toISODate(today));
  const [dateTo, setDateTo] = useState<string>(() => toISODate(weekAhead));
  const [fTipo, setFTipo] = useState<"" | AgendaTipo>("");
  const [fOrigem, setFOrigem] = useState<"" | AgendaOrigem>("");
  const [fUser, setFUser] = useState<string>("");

  // grade principal
  const [events, setEvents] = useState<AgendaEvento[]>([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number>(0);
  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)), [total]);

  // modal reagendar
  const [editing, setEditing] = useState<AgendaEvento | null>(null);
  const [editStart, setEditStart] = useState<string>("");
  const [editEnd, setEditEnd] = useState<string>("");

  // painéis rápidos
  const [birthdays, setBirthdays] = useState<AgendaEvento[]>([]);
  const [assemblies, setAssemblies] = useState<AgendaEvento[]>([]);
  const [loadingSide, setLoadingSide] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");

  // alerta de eventos do dia (obrigatório ao entrar)
  const [mustOpenAgenda, setMustOpenAgenda] = useState<{ has: boolean; birthdays: AgendaEvento[] } | null>(null);

  // debounce realtime
  const refreshTimer = useRef<number | null>(null);

  /** auth */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      const role = (user?.app_metadata as any)?.role || "viewer";
      if (user) setMe({ id: user.id, role });
    })();
  }, []);

  /** usuários (filtro admin) */
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id,auth_user_id,nome,role")
        .order("nome", { ascending: true });
      if (!error) setUsers((data || []) as any);
    })();
  }, [isAdmin]);

  /** grade principal */
  async function loadEvents(targetPage = 1) {
    if (!dateFrom || !dateTo) { alert("Informe período (início e fim)."); return; }
    setLoading(true);
    try {
      const from = (targetPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { startIso: startFromIso } = isoRangeForLocalDay(dateFrom);
      const { endIso: endToIso } = isoRangeForLocalDay(dateTo);

      let query = supabase
        .from("agenda_eventos")
        .select(
          `
          id,tipo,titulo,cliente_id,lead_id,user_id,inicio_at,fim_at,videocall_url,origem,relacao_id,created_at,updated_at,
          cliente:clientes!agenda_eventos_cliente_id_fkey (id,nome,telefone),
          lead:leads!agenda_eventos_lead_id_fkey (id,nome,telefone),
          owner:users!agenda_eventos_user_id_fkey (id,auth_user_id,nome,role)
        `,
          { count: "exact" }
        )
        .gte("inicio_at", startFromIso)
        .lte("inicio_at", endToIso)
        .order("inicio_at", { ascending: true });

      if (fTipo) query = query.eq("tipo", fTipo);
      if (fOrigem) query = query.eq("origem", fOrigem);
      if (isAdmin && fUser) query = query.eq("user_id", fUser);

      const { data, error, count } = await query.range(from, to);
      if (error) { alert("Erro ao carregar agenda: " + error.message); return; }
      setEvents((data || []) as any);
      setTotal(count || 0);
      setPage(targetPage);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadEvents(1); /* eslint-disable-next-line */ }, [me?.id]);
  useEffect(() => { loadEvents(1); /* eslint-disable-next-line */ }, [dateFrom, dateTo, fTipo, fOrigem, fUser]);

  /** painéis rápidos: próximos 120 dias */
  async function loadSideLists() {
    setLoadingSide(true);
    try {
      const nowIso = new Date().toISOString();
      const toIso = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();

      let qBirth = supabase
        .from("agenda_eventos")
        .select(`id,tipo,titulo,cliente_id,inicio_at,origem,videocall_url,cliente:clientes!agenda_eventos_cliente_id_fkey (id,nome,telefone)`) 
        .eq("tipo", "aniversario")
        .gte("inicio_at", nowIso)
        .lte("inicio_at", toIso)
        .order("inicio_at", { ascending: true })
        .limit(80);

      let qAsm = supabase
        .from("agenda_eventos")
        .select(`id,tipo,titulo,relacao_id,inicio_at,origem,videocall_url`)
        .eq("tipo", "assembleia")
        .gte("inicio_at", nowIso)
        .lte("inicio_at", toIso)
        .order("inicio_at", { ascending: true })
        .limit(80);

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
  useEffect(() => { loadSideLists(); }, [quickSearch]);

  // realtime com debounce para evitar múltiplos reloads
  useEffect(() => {
    const ch = supabase
      .channel("agenda-realtime-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_eventos" }, () => {
        if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
        refreshTimer.current = window.setTimeout(() => {
          loadEvents(page);
          loadSideLists();
        }, 250);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); if (refreshTimer.current) window.clearTimeout(refreshTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /** Forçar abertura da Agenda se houver evento hoje (foco: aniversários) */
  useEffect(() => {
    (async () => {
      if (!me?.id) return;
      const key = `agenda:shown:${todayKey()}`;
      if (localStorage.getItem(key)) return; // já mostrado hoje

      const { startIso, endIso } = isoRangeForLocalDay(todayKey());
      const { data: bdays } = await supabase.from("agenda_eventos")
        .select("id,tipo,titulo,inicio_at,cliente:clientes!agenda_eventos_cliente_id_fkey(id,nome,telefone)")
        .eq("tipo","aniversario").gte("inicio_at", startIso).lte("inicio_at", endIso).limit(20);
      const { data: evs } = await supabase.from("agenda_eventos")
        .select("id").gte("inicio_at", startIso).lte("inicio_at", endIso).limit(1);

      if ((bdays?.length || 0) > 0 || (evs?.length || 0) > 0) {
        setMustOpenAgenda({ has: true, birthdays: (bdays || []) as any });
      }
    })();
  }, [me?.id]);

  /** reagendar/excluir */
  function openEdit(ev: AgendaEvento) {
    setEditing(ev);
    const s = new Date(ev.inicio_at);
    const e = new Date(ev.fim_at || defaultEndFromStart(ev.inicio_at));
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    setEditStart(fmt(s)); setEditEnd(fmt(e));
  }
  function closeEdit(){ setEditing(null); setEditStart(""); setEditEnd(""); }

  async function saveReschedule() {
    if (!editing) return;
    if (editing.origem !== "manual") { alert("Somente eventos manuais podem ser reagendados aqui."); return; }
    const startIso = new Date(editStart).toISOString();
    const endIso = new Date(editEnd).toISOString();
    setLoading(true);
    try {
      const { error } = await supabase.from("agenda_eventos").update({ inicio_at: startIso, fim_at: endIso }).eq("id", editing.id);
      if (error) { alert("Não foi possível reagendar: " + error.message); return; }
      closeEdit(); await loadEvents(page); alert("Evento reagendado!");
    } finally {
      setLoading(false);
    }
  }
  async function deleteEvent(ev: AgendaEvento) {
    if (ev.origem !== "manual") { alert("Somente eventos manuais podem ser excluídos aqui."); return; }
    if (!confirm("Tem certeza que deseja excluir este evento?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("agenda_eventos").delete().eq("id", ev.id);
      if (error) { alert("Não foi possível excluir: " + error.message); return; }
      await loadEvents(page); alert("Evento excluído.");
    } finally {
      setLoading(false);
    }
  }

  /** criar manual */
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTipo, setNewTipo] = useState<AgendaTipo>("reuniao");
  const [newStart, setNewStart] = useState<string>(() => { const d=new Date(); d.setMinutes(0,0,0); return d.toISOString().slice(0,16); });
  const [newEnd, setNewEnd] = useState<string>(() => { const d=new Date(); d.setMinutes(30,0,0); return d.toISOString().slice(0,16); });
  const [newLink, setNewLink] = useState("");
  async function createManual() {
    if (!newTitle.trim()) return alert("Informe o título.");
    const startIso = new Date(newStart).toISOString();
    const endIso = new Date(newEnd).toISOString();
    setLoading(true);
    try {
      const { error } = await supabase.from("agenda_eventos").insert([{ tipo: newTipo, titulo: newTitle.trim(), inicio_at: startIso, fim_at: endIso, origem: "manual", videocall_url: newLink.trim() || null }]);
      if (error) { alert("Falha ao criar evento: " + error.message); return; }
      setCreating(false); setNewTitle(""); setNewLink(""); await loadEvents(1); alert("Evento criado!");
    } finally {
      setLoading(false);
    }
  }

  /** render */
  const showingFrom = useMemo(() => (total ? (page - 1) * PAGE_SIZE + 1 : 0), [page, total]);
  const showingTo = useMemo(() => Math.min(page * PAGE_SIZE, total || 0), [page, total]);

  // handlers de teclado para modais
  useEffect(() => {
    function onKey(e: KeyboardEvent){
      if (!editing && !mustOpenAgenda?.has) return;
      if (e.key === "Escape") { if (editing) closeEdit(); if (mustOpenAgenda?.has) setMustOpenAgenda(null); }
      if (e.key === "Enter" && editing) { saveReschedule(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, mustOpenAgenda?.has]);

  return (
    <div className="agenda-wrap" style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      {/* Liquid Glass background blobs */}
      <div className="lg-blobs">
        <div className="lg-blob ruby" />
        <div className="lg-blob navy" />
      </div>
      <div className="lg-shine" />

      <h1 style={{ margin: "16px 0" }}>Agenda</h1>

      {/* Painéis rápidos */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {/* Aniversários */}
        <div style={card} aria-label="Painel de aniversários (próximos)">
          <div style={listHeader}>
            <h3 style={{ margin: 0 }}>Aniversários (próximos)</h3>
            <input
              style={{ ...input, width: 220 }}
              placeholder="Buscar título/nome…"
              value={quickSearch}
              onChange={(e)=>setQuickSearch(e.target.value)}
              aria-label="Buscar aniversários por título ou nome"
            />
          </div>
          <div style={{ maxHeight: 290, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr><th style={th}>Quando</th><th style={th}>Cliente</th><th style={th}>Ações</th></tr>
              </thead>
              <tbody>
                {loadingSide && (
                  <tr><td style={td} colSpan={3}>
                    <div className="skl" style={{ width: "100%", height: 18 }} />
                    <div className="skl" style={{ width: "80%", height: 18, marginTop: 8 }} />
                  </td></tr>
                )}
                {!loadingSide && birthdays.length===0 && <tr><td style={td} colSpan={3}>Nenhum aniversário próximo.</td></tr>}
                {birthdays.map((b,i)=>{
                  const nome = b.cliente?.nome || b.titulo || "Cliente";
                  const phone = b.cliente?.telefone || null;
                  const waMsg = waWithText(phone, BIRTHDAY_MSG(nome));
                  return (
                    <tr key={b.id} className={i%2 ? "bgRow": undefined}>
                      <td style={td}>{fmtDateSmart(b.inicio_at)}</td>
                      <td style={td}>{nome}</td>
                      <td style={td}>
                        <div style={{ display:"flex", gap:8 }}>
                          {waMsg ? (
                            <a href={waMsg} target="_blank" rel="noreferrer" style={btnPrimary} aria-label={`Parabenizar ${nome} pelo WhatsApp`}>
                              Parabenizar 🎉
                            </a>
                          ) : (
                            <button
                              style={btnPrimary}
                              onClick={() => clipboardCopy(BIRTHDAY_MSG(nome))}
                              title="Sem telefone: copia a mensagem para você colar no WhatsApp"
                              aria-label="Copiar mensagem de aniversário"
                            >
                              Parabenizar 🎉
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Assembleias */}
        <div style={card} aria-label="Painel de assembleias (próximas)">
          <div style={listHeader}>
            <h3 style={{ margin: 0 }}>Assembleias (próximas)</h3>
            <button style={btnSecondary} onClick={loadSideLists} disabled={loadingSide} aria-label="Atualizar lista de assembleias">Atualizar</button>
          </div>
          <div style={{ maxHeight: 290, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr><th style={th}>Quando</th><th style={th}>Título/Grupo</th></tr>
              </thead>
              <tbody>
                {loadingSide && (
                  <tr><td style={td} colSpan={2}>
                    <div className="skl" style={{ width: "100%", height: 18 }} />
                    <div className="skl" style={{ width: "70%", height: 18, marginTop: 8 }} />
                  </td></tr>
                )}
                {!loadingSide && assemblies.length===0 && <tr><td style={td} colSpan={2}>Nenhuma assembleia próxima.</td></tr>}
                {assemblies.map((a,i)=>(
                  <tr key={a.id} className={i%2 ? "bgRow": undefined}>
                    <td style={td}>{fmtDateTimeSmart(a.inicio_at)}</td>
                    <td style={td}>{a.titulo || "Assembleia"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Filtros, criação e grade principal */}
      <div style={card} aria-label="Filtros de pesquisa">
        <h3 style={{ margin: "0 0 12px 0" }}>Filtros</h3>
        <div style={grid4}>
          <label style={label}>De<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={input} aria-label="Data inicial"/></label>
          <label style={label}>Até<input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={input} aria-label="Data final"/></label>
          <label style={label}>Tipo<select value={fTipo} onChange={e=>setFTipo(e.target.value as any)} style={input} aria-label="Tipo de evento">
            <option value="">Todos</option>{TIPOS.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
          <label style={label}>Origem<select value={fOrigem} onChange={e=>setFOrigem(e.target.value as any)} style={input} aria-label="Origem do evento">
            <option value="">Todas</option>{ORIGENS.map(o=><option key={o} value={o}>{o}</option>)}</select></label>
          {isAdmin && <label style={label}>Usuário<select value={fUser} onChange={e=>setFUser(e.target.value)} style={input} aria-label="Filtrar por usuário">
            <option value="">Equipe toda</option>{users.map(u=><option key={u.id} value={u.id}>{u.nome || u.id} ({(u.role||"").toUpperCase()})</option>)}</select></label>}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:12 }}>
          <small style={{ color:"#64748b" }}>{total>0?`Mostrando ${showingFrom}-${showingTo} de ${total}`:"Nenhum evento"}</small>
          <div style={{ display:"flex", gap:8 }}>
            <button style={{ ...btnSecondary, opacity: page<=1?0.6:1 }} disabled={page<=1||loading} onClick={()=>loadEvents(page-1)} aria-label="Página anterior">‹ Anterior</button>
            <span style={{ fontSize:12, color:"#475569", alignSelf:"center" }}>Página {page} de {totalPages}</span>
            <button style={{ ...btnSecondary, opacity: page>=totalPages?0.6:1 }} disabled={page>=totalPages||loading} onClick={()=>loadEvents(page+1)} aria-label="Próxima página">Próxima ›</button>
          </div>
        </div>
      </div>

      <div style={card} aria-label="Criar evento manual">
        <div style={listHeader}>
          <h3 style={{ margin: 0 }}>Criar evento manual</h3>
          <button style={btnSecondary} onClick={()=>setCreating(v=>!v)} disabled={loading} aria-expanded={creating} aria-controls="form-criar-evento">{creating?"Fechar":"Novo"}</button>
        </div>
        {creating && (
          <div id="form-criar-evento" style={grid4}>
            <label style={label}>Título<input value={newTitle} onChange={e=>setNewTitle(e.target.value)} style={input} placeholder="Ex.: Reunião com cliente" aria-label="Título do evento" autoFocus/></label>
            <label style={label}>Tipo<select value={newTipo} onChange={e=>setNewTipo(e.target.value as AgendaTipo)} style={input} aria-label="Tipo do evento">
              {TIPOS.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
            <label style={label}>Início<input type="datetime-local" value={newStart} onChange={e=>setNewStart(e.target.value)} style={input} aria-label="Início"/></label>
            <label style={label}>Fim<input type="datetime-local" value={newEnd} onChange={e=>setNewEnd(e.target.value)} style={input} aria-label="Fim"/></label>
            <label style={{ ...label, gridColumn:"1 / span 4" }}>Link de vídeo (opcional)
              <input value={newLink} onChange={e=>setNewLink(e.target.value)} style={input} placeholder="https://meet..." aria-label="Link de videoconferência"/></label>
            <div style={{ gridColumn:"1 / span 4", display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={btnGhost} onClick={()=>setCreating(false)} disabled={loading} aria-label="Cancelar criação">Cancelar</button>
              <button style={btnPrimary} onClick={createManual} disabled={loading} aria-label="Criar evento">{loading?"Criando...":"Criar"}</button>
            </div>
          </div>
        )}
      </div>

      <div style={card} aria-label="Lista de eventos">
        <div style={listHeader}>
          <h3 style={{ margin: 0 }}>Eventos</h3>
          <button style={btnSecondary} onClick={()=>loadEvents(page)} disabled={loading} aria-label="Recarregar eventos">Recarregar</button>
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:0 }}>
            <thead>
              <tr>
                <th style={th}>Início</th><th style={th}>Fim</th><th style={th}>Tipo</th><th style={th}>Origem</th>
                <th style={th}>Título</th><th style={th}>Cliente/Lead</th><th style={th}>Responsável</th><th style={{ ...th, width:360 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e,i)=>{
                const person = e.cliente?.nome || e.lead?.nome || "—";
                const phone = e.cliente?.telefone || e.lead?.telefone || null;
                const wa = phone ? `https://wa.me/${onlyDigits(phone).startsWith("55") ? onlyDigits(phone) : "55"+onlyDigits(phone)}` : null;
                const canEdit = e.origem === "manual";
                const tipoColor: Record<AgendaTipo, string> = {
                  aniversario: "#E0CE8C",
                  assembleia: "#1E293F",
                  reuniao: "#A11C27",
                  visita: "#0ea5e9",
                  contato: "#7c3aed",
                  outro: "#64748b",
                } as const;
                return (
                  <tr key={e.id} className={i%2 ? "bgRow": undefined}>
                    <td style={td}>{fmtDateTimeSmart(e.inicio_at)}</td>
                    <td style={td}>{fmtDateTimeSmart(e.fim_at)}</td>
                    <td style={td}>
                      <span title={e.tipo} style={{ padding:"2px 8px", borderRadius:999, fontSize:12, background: `${tipoColor[e.tipo] || "#e2e8f0"}22`, color: tipoColor[e.tipo] || "#0f172a", border:`1px solid ${(tipoColor[e.tipo] || "#e2e8f0")}55` }}>{e.tipo}</span>
                    </td>
                    <td style={td}>{e.origem}</td>
                    <td style={td}>{e.titulo || "—"}</td>
                    <td style={td}>{person}</td>
                    <td style={td}>{e.owner?.nome || "—"}</td>
                    <td style={td}>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                        {wa ? <a href={wa} target="_blank" rel="noreferrer" style={btnSecondary} aria-label={`Abrir WhatsApp de ${person}`}>WhatsApp</a>
                            : <button style={{ ...btnSecondary, opacity:.5 }} disabled aria-label="Sem WhatsApp">WhatsApp</button>}
                        {e.videocall_url ? (
                          <>
                            <a href={e.videocall_url} target="_blank" rel="noreferrer" style={btnSecondary} aria-label="Abrir link de videoconferência">Abrir link</a>
                            <button style={btnSecondary} onClick={()=>clipboardCopy(e.videocall_url!)} aria-label="Copiar link de videoconferência">Copiar link</button>
                          </>
                        ) : <button style={{ ...btnSecondary, opacity:.5 }} disabled aria-label="Sem link de vídeo">Sem link</button>}
                        <button style={{ ...btnSecondary, opacity: canEdit?1:.5 }} disabled={!canEdit||loading} onClick={()=>openEdit(e)} aria-label="Reagendar evento">Reagendar</button>
                        <button style={{ ...btnGhost, opacity: canEdit?1:.5 }} disabled={!canEdit||loading} onClick={()=>deleteEvent(e)} aria-label="Excluir evento">Excluir</button>
                        {canEdit && (
                          <button style={btnSecondary} onClick={()=>downloadICS(e)} aria-label="Exportar para calendário (.ics)">.ics</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {events.length===0 && <tr><td style={td} colSpan={8}>{loading?"Carregando...":"Nenhum evento encontrado para os filtros."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de reagendamento */}
      {editing && (
        <>
          <div style={backdrop} onClick={closeEdit} />
          <div role="dialog" aria-modal="true" style={modal}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Reagendar evento</h3>
            <div style={grid2}>
              <label style={label}>Início<input type="datetime-local" value={editStart} onChange={e=>setEditStart(e.target.value)} style={input} aria-label="Novo início" autoFocus/></label>
              <label style={label}>Fim<input type="datetime-local" value={editEnd} onChange={e=>setEditEnd(e.target.value)} style={input} aria-label="Novo fim"/></label>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 }}>
              <button style={btnGhost} onClick={closeEdit} disabled={loading} aria-label="Cancelar">Cancelar</button>
              <button style={btnPrimary} onClick={saveReschedule} disabled={loading} aria-label="Salvar reagendamento">{loading?"Salvando...":"Salvar"}</button>
            </div>
          </div>
        </>
      )}

      {/* Modal obrigatório ao entrar quando houver eventos hoje */}
      {mustOpenAgenda?.has && (
        <>
          <div style={backdrop} />
          <div role="dialog" aria-modal="true" style={modal}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Eventos de hoje</h3>
            {mustOpenAgenda.birthdays?.length ? (
              <div style={{margin:"8px 0 12px 0"}}>
                <strong>Aniversários:</strong>
                <ul style={{margin:"8px 0 0 18px"}}>
                  {mustOpenAgenda.birthdays.map(b => <li key={b.id}>{b.cliente?.nome || b.titulo || "Cliente"} — {fmtDateSmart(b.inicio_at)}</li>)}
                </ul>
              </div>
            ) : <p style={{margin:"8px 0 12px 0"}}>Há compromissos hoje na sua agenda.</p>}
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button
                style={btnSecondary}
                onClick={()=>{
                  localStorage.setItem(`agenda:shown:${todayKey()}`, "1");
                  if (location.pathname !== "/agenda") {
                    window.location.assign("/agenda");
                  } else {
                    setMustOpenAgenda(null);
                  }
                }}
                aria-label="Abrir Agenda"
              >Abrir Agenda</button>
              <button
                style={btnGhost}
                onClick={()=>{ localStorage.setItem(`agenda:shown:${todayKey()}`, "1"); setMustOpenAgenda(null); }}
                aria-label="Lembrar depois"
              >Depois</button>
            </div>
          </div>
        </>
      )}

      {/* estilos globais para Liquid Glass + skeleton */}
      <style>{`
        .bgRow{background:#f8fafc}
        .lg-blobs { position: fixed; inset: -20vh -10vw auto auto; pointer-events: none; z-index: 0; }
        .lg-blob { position:absolute; filter: blur(60px); opacity:.22; }
        .lg-blob.ruby  { width:46vw; height:46vw; background: radial-gradient(35% 35% at 50% 50%, #A11C27 0%, transparent 70%); top: -10vh; left:-12vw; }
        .lg-blob.navy  { width:40vw; height:40vw; background: radial-gradient(35% 35% at 50% 50%, #1E293F 0%, transparent 70%); top: 30vh; right:-12vw; }
        .lg-shine { position: fixed; right:2vw; bottom:2vh; width:26vw; height:26vw; background: radial-gradient(35% 35% at 50% 50%, rgba(224,206,140,.28), transparent 70%); filter: blur(40px); pointer-events:none; z-index:0; }
        .agenda-wrap { position: relative; z-index: 1; }
        .skl { background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 37%, #f1f5f9 63%); background-size: 400% 100%; animation: skl 1.4s ease infinite; border-radius: 8px; }
        @keyframes skl { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
      `}</style>
    </div>
  );
}

/** estilos */
const card: React.CSSProperties = {
  position: "relative",
  background:"rgba(255,255,255,0.52)",
  borderRadius:16,
  padding:16,
  border:"1px solid rgba(255,255,255,0.6)",
  boxShadow:"0 10px 40px rgba(161,28,39,0.12), inset 0 1px 0 rgba(255,255,255,0.35)",
  backdropFilter:"blur(12px)",
  WebkitBackdropFilter:"blur(12px)",
  marginBottom:16
};
const grid2: React.CSSProperties = { display:"grid", gap:12, gridTemplateColumns:"repeat(2, minmax(0,1fr))" };
const grid4: React.CSSProperties = { display:"grid", gap:12, gridTemplateColumns:"repeat(4, minmax(0,1fr))", alignItems:"center" };
const listHeader: React.CSSProperties = { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 };
const input: React.CSSProperties = { padding:10, borderRadius:10, border:"1px solid #e5e7eb", outline:"none", background:"#fff" };
const label: React.CSSProperties = { display:"grid", gap:6, fontSize:12, color:"#334155" };
const th: React.CSSProperties = { textAlign:"left", fontSize:12, color:"#475569", padding:"10px 8px" };
const td: React.CSSProperties = { padding:"10px 8px", borderTop:"1px solid #eee", verticalAlign:"middle" };
const btnPrimary: React.CSSProperties = { padding:"10px 16px", borderRadius:12, background:"#A11C27", color:"#fff", border:0, fontWeight:700, cursor:"pointer" };
const btnSecondary: React.CSSProperties = { padding:"8px 12px", borderRadius:10, background:"#f1f5f9", color:"#0f172a", border:"1px solid #e2e8f0", fontWeight:600, cursor:"pointer" };
const btnGhost: React.CSSProperties = { padding:"8px 12px", borderRadius:10, background:"#fff", color:"#0f172a", border:"1px solid #e2e8f0", fontWeight:600, cursor:"pointer" };
const backdrop: React.CSSProperties = { position:"fixed", inset:0, background:"rgba(15, 23, 42, 0.45)", zIndex:40 };
const modal: React.CSSProperties = { position:"fixed", zIndex:50, top:"50%", left:"50%", transform:"translate(-50%, -50%)", width:"min(560px, 92vw)", background:"#fff", borderRadius:14, padding:18, boxShadow:"0 12px 48px rgba(0,0,0,0.22)" };
