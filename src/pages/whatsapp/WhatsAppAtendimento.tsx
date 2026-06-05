import React, { useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, Plus, RefreshCw, Settings, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { WhatsAppModuleHeader } from "./WhatsAppShell";

type Conv = {
  id: string;
  queue?: string | null;
  stage?: string | null;
  status?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count?: number | null;
  assigned_to?: string | null;
  whatsapp_contacts?: { nome?: string | null; telefone?: string | null; wa_id?: string | null } | null;
};

type Msg = { id: string; direction: "inbound" | "outbound"; body?: string | null; message_type?: string | null; created_at: string };

type Queue = { key: string; label: string; area: "sistema" | "comercial" | "operacional"; color: string; desc: string };

const C = { red: "#A11C27", navy: "#1E293F", gold: "#B5A573", green: "#0f766e", muted: "#64748b" };
const CLOSED = new Set(["fechada", "finalizado", "finalizada", "closed", "fechado_ganho", "fechado_perdido"]);
const QUEUES: Queue[] = [
  { key: "novos_contatos", label: "Novos contatos", area: "sistema", color: C.red, desc: "Entradas novas do WhatsApp" },
  { key: "triagem", label: "Triagem", area: "sistema", color: C.gold, desc: "Classificação inicial" },
  { key: "comercial", label: "Comercial", area: "comercial", color: C.navy, desc: "Atendimento comercial inicial" },
  { key: "qualificacao", label: "Qualificação", area: "comercial", color: C.navy, desc: "Diagnóstico e qualificação" },
  { key: "proposta", label: "Proposta", area: "comercial", color: C.navy, desc: "Simulação e proposta enviada" },
  { key: "negociacao", label: "Negociação", area: "comercial", color: C.navy, desc: "Follow-up e fechamento" },
  { key: "fechado_ganho", label: "Fechado ganho", area: "comercial", color: C.green, desc: "Venda convertida" },
  { key: "fechado_perdido", label: "Fechado perdido", area: "comercial", color: C.muted, desc: "Venda perdida" },
  { key: "cliente_ativo", label: "Cliente ativo", area: "operacional", color: C.green, desc: "Clientes em andamento" },
  { key: "boleto", label: "Boleto", area: "operacional", color: C.green, desc: "Segunda via e pagamentos" },
  { key: "contemplacao", label: "Contemplação", area: "operacional", color: C.green, desc: "Pós-contemplação" },
  { key: "pos_venda", label: "Pós-venda", area: "operacional", color: C.green, desc: "Relacionamento" },
  { key: "suporte", label: "Suporte", area: "operacional", color: C.green, desc: "Suporte geral" },
  { key: "financeiro", label: "Financeiro", area: "operacional", color: C.green, desc: "Demandas financeiras" },
];

function onlyDigits(v?: string | null) { return String(v || "").replace(/\D/g, ""); }
function queueOf(c?: Conv | null) { const raw = String(c?.queue || c?.stage || "novos_contatos").toLowerCase(); return raw === "entrada" ? "novos_contatos" : raw; }
function qdef(key?: string | null) { return QUEUES.find((q) => q.key === String(key || "").toLowerCase()) || QUEUES[0]; }
function isClosed(c?: Conv | null) { return CLOSED.has(String(c?.status || "").toLowerCase()) || CLOSED.has(String(c?.stage || "").toLowerCase()) || CLOSED.has(String(c?.queue || "").toLowerCase()); }
function nameOf(c?: Conv | null) { return c?.whatsapp_contacts?.nome || "Cliente WhatsApp"; }
function phoneOf(c?: Conv | null) { return c?.whatsapp_contacts?.telefone || c?.whatsapp_contacts?.wa_id || ""; }
function initials(v?: string | null) { return String(v || "Cliente").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "C"; }
function rel(v?: string | null) { if (!v) return "—"; const m = Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 60000)); if (m < 1) return "agora"; if (m < 60) return `${m} min`; const h = Math.floor(m / 60); return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`; }
function fmtPhone(v?: string | null) { const d = onlyDigits(v); const l = d.startsWith("55") ? d.slice(2) : d; if (l.length === 11) return `(${l.slice(0, 2)}) ${l.slice(2, 7)}-${l.slice(7)}`; if (l.length === 10) return `(${l.slice(0, 2)}) ${l.slice(2, 6)}-${l.slice(6)}`; return d || "Telefone não identificado"; }

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 pt-10 backdrop-blur-sm"><div className="w-full max-w-4xl rounded-[28px] bg-white p-5 shadow-2xl ring-1 ring-slate-200"><div className="mb-4 flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Central WhatsApp</p><h2 className="text-2xl font-black text-slate-900">{title}</h2>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div><button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>{children}</div></div>;
}

export default function WhatsAppAtendimento() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"todos" | "comercial" | "operacional" | "relatorios">("todos");
  const [search, setSearch] = useState("");
  const [startOpen, setStartOpen] = useState(false);
  const [queuesOpen, setQueuesOpen] = useState(false);
  const [startName, setStartName] = useState("");
  const [startPhone, setStartPhone] = useState("");
  const [startQueue, setStartQueue] = useState("triagem");
  const [startMessage, setStartMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function load(show = false) {
    if (show) setLoading(true); else setRefreshing(true);
    const { data, error } = await supabase.from("whatsapp_conversations").select("*, whatsapp_contacts(id,nome,telefone,wa_id)").order("last_message_at", { ascending: false, nullsFirst: false }).limit(300);
    if (!error) setConvs((data || []) as Conv[]); else console.error(error);
    setLoading(false); setRefreshing(false);
  }

  async function loadMessages(id: string) {
    const { data, error } = await supabase.from("whatsapp_messages").select("id,direction,body,message_type,created_at").eq("conversation_id", id).order("created_at", { ascending: true });
    if (!error) setMsgs((data || []) as Msg[]); else setMsgs([]);
    await supabase.from("whatsapp_conversations").update({ unread_count: 0 }).eq("id", id);
  }

  async function open(c: Conv) { setActive(c); await loadMessages(c.id); }

  useEffect(() => { load(true); }, []);
  useEffect(() => { if (active?.id) loadMessages(active.id); }, [active?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase(); const qd = onlyDigits(q);
    return convs.filter((c) => !q || nameOf(c).toLowerCase().includes(q) || String(c.last_message || "").toLowerCase().includes(q) || onlyDigits(phoneOf(c)).includes(qd));
  }, [convs, search]);

  const counts = useMemo(() => {
    const open = convs.filter((c) => !isClosed(c)).length;
    const closed = convs.filter((c) => isClosed(c)).length;
    const novos = convs.filter((c) => !c.assigned_to && !isClosed(c)).length;
    const won = convs.filter((c) => queueOf(c) === "fechado_ganho").length;
    const lost = convs.filter((c) => queueOf(c) === "fechado_perdido").length;
    const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : 0;
    return { open, closed, novos, won, lost, winRate, total: convs.length, inbound: msgs.filter((m) => m.direction === "inbound").length, outbound: msgs.filter((m) => m.direction === "outbound").length };
  }, [convs, msgs]);

  const kanbanQueues = QUEUES.filter((q) => q.area === tab);
  const byQueue = useMemo(() => {
    const map = new Map<string, Conv[]>(); kanbanQueues.forEach((q) => map.set(q.key, []));
    filtered.forEach((c) => { const k = queueOf(c); if (map.has(k)) map.get(k)?.push(c); });
    return map;
  }, [filtered, tab]);

  async function transfer(queue: string, c: Conv = active as Conv) {
    if (!c?.id) return;
    await supabase.from("whatsapp_conversations").update({ queue, stage: queue, updated_at: new Date().toISOString() }).eq("id", c.id);
    await load();
  }

  async function createTicket() {
    const phone = onlyDigits(startPhone);
    if (!phone) return alert("Informe o telefone com DDD.");
    setSending(true);
    try {
      const now = new Date().toISOString();
      const { data: contact, error: cErr } = await supabase.from("whatsapp_contacts").upsert({ wa_id: phone, telefone: phone, nome: startName || null, updated_at: now }, { onConflict: "wa_id" }).select("id,nome,telefone,wa_id").single();
      if (cErr || !contact?.id) throw cErr || new Error("Contato não criado.");
      const { data: conv, error: vErr } = await supabase.from("whatsapp_conversations").insert({ contact_id: contact.id, queue: startQueue, stage: startQueue, status: "humano", last_message: startMessage || null, last_message_at: now }).select("*, whatsapp_contacts(id,nome,telefone,wa_id)").single();
      if (vErr || !conv?.id) throw vErr || new Error("Ticket não criado.");
      setStartOpen(false); setStartName(""); setStartPhone(""); setStartMessage(""); await load(true); await open(conv as Conv);
    } catch (e: any) { alert(e?.message || "Não foi possível criar ticket."); } finally { setSending(false); }
  }

  function Row({ c }: { c: Conv }) {
    const q = qdef(queueOf(c)); const selected = active?.id === c.id;
    return <button onClick={() => open(c)} className={`flex w-full gap-3 border-b px-4 py-3 text-left hover:bg-slate-50 ${selected ? "bg-slate-100" : "bg-white"}`}><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: q.color }}>{initials(nameOf(c))}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-black text-slate-900">{nameOf(c)}</p><span className="text-[11px] font-bold text-slate-400">{rel(c.last_message_at)}</span></div><p className="mt-1 truncate text-xs text-slate-500">{c.last_message || fmtPhone(phoneOf(c))}</p><div className="mt-2 flex gap-1.5"><span className="rounded-full border px-2 py-0.5 text-[10px] font-bold text-slate-500">{q.label}</span>{!!c.unread_count && <span className="rounded-full bg-[#A11C27] px-2 py-0.5 text-[10px] font-bold text-white">{c.unread_count}</span>}</div></div></button>;
  }

  function Chat() {
    if (!active) return <div className="flex h-full min-h-[72vh] items-center justify-center p-8 text-center text-slate-500"><div><MessageCircle className="mx-auto mb-3 h-12 w-12 text-slate-300" /><p className="text-lg font-black text-slate-800">Selecione uma conversa</p><p className="mt-1 text-sm">A conversa abrirá aqui, no padrão WhatsApp Web.</p></div></div>;
    const q = qdef(queueOf(active));
    return <div className="flex h-full min-h-[72vh] flex-col bg-[#efe7dd]"><div className="flex items-center justify-between border-b bg-white px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: q.color }}>{initials(nameOf(active))}</div><div className="min-w-0"><p className="truncate font-black text-slate-900">{nameOf(active)}</p><p className="text-xs text-slate-500">{fmtPhone(phoneOf(active))} • {q.label}</p></div></div><select value={queueOf(active)} onChange={(e) => transfer(e.target.value)} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold text-slate-600">{QUEUES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></div><div className="flex-1 space-y-2 overflow-auto p-4">{msgs.map((m) => { const out = m.direction === "outbound"; return <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}><div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow ${out ? "bg-[#dcf8c6]" : "bg-white"}`}><p className="whitespace-pre-wrap">{m.body || m.message_type || "Mensagem"}</p><p className="mt-1 text-right text-[10px] text-slate-400">{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p></div></div>; })}</div><div className="border-t bg-white p-3 text-xs text-slate-500">Envio de mensagem permanece pela Central antiga/API; este painel prioriza visualização e gestão do atendimento.</div></div>;
  }

  function Reports() {
    return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-4">{[["Conversas abertas", counts.open, C.red], ["Novos contatos", counts.novos, C.gold], ["Finalizados", counts.closed, C.green], ["Conversão", `${counts.winRate}%`, C.navy]].map(([l, v, color]) => <div key={l} className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">{l}</p><p className="mt-2 text-3xl font-black" style={{ color: color as string }}>{v}</p></div>)}</div><div className="grid gap-4 lg:grid-cols-3"><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Mensagens recebidas</p><p className="mt-2 text-3xl font-black">{counts.inbound}</p><p className="text-sm text-slate-500">Na conversa aberta</p></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Mensagens enviadas</p><p className="mt-2 text-3xl font-black">{counts.outbound}</p><p className="text-sm text-slate-500">Na conversa aberta</p></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Custo de abertura</p><p className="mt-2 text-3xl font-black text-amber-700">Em breve</p><p className="text-sm text-slate-500">Depende da precificação Meta/API</p></div></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><h3 className="text-lg font-black text-slate-900">Indicadores de qualidade planejados</h3><div className="mt-4 grid gap-3 md:grid-cols-3">{["Tempo até primeira resposta", "Tempo médio do ticket aberto", "Avaliação do atendimento", "Volume por fila", "Tickets por usuário", "Custo por conversa"].map((i) => <div key={i} className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700">{i}</div>)}</div></div></div>;
  }

  return <div className="space-y-5"><WhatsAppModuleHeader title="Atendimento WhatsApp" subtitle="Todos no padrão WhatsApp Web; Comercial e Operacional em Kanban; Relatórios para gestão." /><div className="flex flex-col gap-3 rounded-[28px] bg-gradient-to-r from-[#1E293F] to-[#A11C27] p-4 text-white shadow-xl lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-white/60">WhatsApp oficial conectado ao CRM</p><h1 className="text-2xl font-black">Central de Atendimentos</h1></div><div className="flex flex-wrap gap-2"><button onClick={() => setStartOpen(true)} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"><Plus className="mr-2 inline h-4 w-4" />Iniciar conversa</button><button onClick={() => setQueuesOpen(true)} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"><Settings className="mr-2 inline h-4 w-4" />Configurar filas</button><button onClick={() => load()} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"><RefreshCw className={`mr-2 inline h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Atualizar</button></div></div><div className="grid gap-3 md:grid-cols-4"><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-400">Novos</p><p className="text-2xl font-black text-[#B5A573]">{counts.novos}</p></div><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-400">Abertos</p><p className="text-2xl font-black text-[#A11C27]">{counts.open}</p></div><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-400">Finalizados</p><p className="text-2xl font-black text-emerald-700">{counts.closed}</p></div><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-400">Total</p><p className="text-2xl font-black text-[#1E293F]">{counts.total}</p></div></div><div className="rounded-[28px] border bg-white p-3 shadow-sm"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{(["todos", "comercial", "operacional", "relatorios"] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-full px-4 py-2 text-sm font-black ${tab === item ? "bg-[#1E293F] text-white" : "bg-slate-100 text-slate-600"}`}>{item === "todos" ? "Todos" : item === "relatorios" ? "Relatórios" : item.charAt(0).toUpperCase() + item.slice(1)}</button>)}</div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou mensagem..." className="rounded-2xl border bg-slate-50 px-4 py-3 text-sm lg:w-[360px]" /></div></div>{loading ? <div className="flex h-[60vh] items-center justify-center rounded-3xl bg-white"><Loader2 className="h-7 w-7 animate-spin" /></div> : tab === "relatorios" ? <Reports /> : tab === "todos" ? <div className="grid min-h-[72vh] overflow-hidden rounded-3xl border bg-white shadow-sm lg:grid-cols-[390px_1fr]"><div className="border-r"><div className="border-b p-4"><h3 className="text-xl font-black">WhatsApp</h3><div className="mt-3 flex gap-2">{["Tudo", "Não lidas", "Novos", "Meus"].map((chip) => <span key={chip} className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">{chip}</span>)}</div></div><div className="max-h-[72vh] overflow-auto">{filtered.map((c) => <Row key={c.id} c={c} />)}</div></div><Chat /></div> : <div className="flex min-h-[62vh] gap-4 overflow-x-auto pb-5">{kanbanQueues.map((q) => { const items = byQueue.get(q.key) || []; return <div key={q.key} className="w-[320px] shrink-0"><div className="sticky top-0 z-10 mb-3 rounded-3xl border bg-white p-3 shadow-sm"><div className="flex items-center justify-between"><div><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: q.color }} /><p className="font-black text-slate-800">{q.label}</p></div><p className="mt-1 text-xs text-slate-400">{q.desc}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{items.length}</span></div></div><div className="space-y-3">{items.length === 0 ? <div className="rounded-3xl border border-dashed bg-white/70 p-5 text-center text-sm text-slate-400">Nenhum ticket nesta etapa.</div> : items.map((c) => <Row key={c.id} c={c} />)}</div></div>; })}</div>}{startOpen && <Modal title="Iniciar conversa" subtitle="Crie um novo ticket." onClose={() => setStartOpen(false)}><div className="grid gap-4 md:grid-cols-2"><input value={startName} onChange={(e) => setStartName(e.target.value)} placeholder="Nome do cliente" className="rounded-xl border px-3 py-3" /><input value={startPhone} onChange={(e) => setStartPhone(e.target.value)} placeholder="Telefone com DDD" className="rounded-xl border px-3 py-3" /><select value={startQueue} onChange={(e) => setStartQueue(e.target.value)} className="rounded-xl border px-3 py-3 md:col-span-2">{QUEUES.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}</select><textarea value={startMessage} onChange={(e) => setStartMessage(e.target.value)} placeholder="Mensagem inicial" className="min-h-[120px] rounded-xl border px-3 py-3 md:col-span-2" /><button onClick={createTicket} disabled={sending} className="rounded-xl bg-[#A11C27] px-4 py-3 font-bold text-white md:col-span-2">{sending ? "Criando..." : "Criar ticket"}</button></div></Modal>}{queuesOpen && <Modal title="Configurar filas" subtitle="Visualização das filas disponíveis." onClose={() => setQueuesOpen(false)}><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{QUEUES.map((q) => <div key={q.key} className="rounded-3xl border bg-white p-4"><div className="flex items-center gap-3"><span className="h-4 w-4 rounded-full" style={{ background: q.color }} /><div><p className="font-black text-slate-800">{q.label}</p><p className="text-xs uppercase tracking-wide text-slate-400">{q.area}</p></div></div><p className="mt-3 text-sm text-slate-500">{q.desc}</p></div>)}</div></Modal>}</div>;
}
