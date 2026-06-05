import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageCircle, Plus, RefreshCw, Settings, X, Send, Paperclip, Smile, Mic, Phone, CheckCircle2 } from "lucide-react";
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
  lead_id?: string | null;
  whatsapp_contacts?: { id?: string | null; nome?: string | null; telefone?: string | null; wa_id?: string | null } | null;
};

type Msg = { id: string; direction: "inbound" | "outbound"; body?: string | null; message_type?: string | null; created_at: string; raw_payload?: any; media_mime_type?: string | null };
type Queue = { key: string; label: string; board: "comercial" | "operacional"; color: string; desc: string; terminal?: boolean };
type ContactOption = { source: "lead" | "cliente" | "whatsapp" | "manual"; id?: string | null; nome: string; telefone: string; email?: string | null; lead_id?: string | null; cliente_id?: string | null };
type Template = { name: string; language?: string | null; category?: string | null; body?: string | null; status?: string | null };

const C = { red: "#A11C27", navy: "#1E293F", gold: "#B5A573", green: "#0f766e", muted: "#64748b" };
const CLOSED = new Set(["fechada", "finalizado", "finalizada", "closed", "fechado_ganho", "fechado_perdido"]);
const COMMERCIAL: Queue[] = [
  { key: "com_novo", label: "Novo", board: "comercial", color: C.red, desc: "Entrada comercial" },
  { key: "com_qualificando", label: "Qualificando/Diagnóstico", board: "comercial", color: C.navy, desc: "Diagnóstico inicial" },
  { key: "com_reuniao", label: "Reunião Agendada", board: "comercial", color: C.navy, desc: "Reunião marcada" },
  { key: "com_proposta", label: "Proposta Apresentada/Negociação", board: "comercial", color: C.navy, desc: "Proposta e follow-up" },
  { key: "com_fechamento", label: "Fechamento Programado/Aguardando Documentos", board: "comercial", color: C.gold, desc: "Documentos/fechamento" },
  { key: "fechado_ganho", label: "Fechado Ganho", board: "comercial", color: C.green, desc: "Sai do Kanban e vai para relatórios", terminal: true },
  { key: "fechado_perdido", label: "Fechado Perdido", board: "comercial", color: C.muted, desc: "Sai do Kanban e vai para relatórios", terminal: true },
];
const OPERATIONAL: Queue[] = [
  { key: "op_novo_cliente", label: "Novo Cliente", board: "operacional", color: C.red, desc: "Entrada operacional" },
  { key: "op_sucesso", label: "Sucesso do Cliente", board: "operacional", color: C.green, desc: "Acompanhamento" },
  { key: "op_suporte", label: "Suporte ao Cliente", board: "operacional", color: C.green, desc: "Suporte geral" },
  { key: "op_contemplacao", label: "Contemplação", board: "operacional", color: C.green, desc: "Processo de contemplação" },
  { key: "op_transferencia", label: "Transferência de Cota", board: "operacional", color: C.green, desc: "Transferência" },
  { key: "op_financeiro", label: "Financeiro", board: "operacional", color: C.gold, desc: "Demandas financeiras" },
  { key: "op_outras", label: "Outras Solicitações", board: "operacional", color: C.muted, desc: "Solicitações diversas" },
];
const ALL_QUEUES = [...COMMERCIAL, ...OPERATIONAL];
const LEGACY_MAP: Record<string, string> = {
  novos_contatos: "com_novo",
  entrada: "com_novo",
  triagem: "com_novo",
  comercial: "com_novo",
  qualificacao: "com_qualificando",
  proposta: "com_proposta",
  negociacao: "com_proposta",
  cliente_ativo: "op_novo_cliente",
  boleto: "op_financeiro",
  contemplacao: "op_contemplacao",
  pos_venda: "op_sucesso",
  suporte: "op_suporte",
  financeiro: "op_financeiro",
};

function onlyDigits(v?: string | null) { return String(v || "").replace(/\D/g, ""); }
function normalizeQueue(raw?: string | null) { const k = String(raw || "com_novo").toLowerCase(); return LEGACY_MAP[k] || k; }
function queueOf(c?: Conv | null) { return normalizeQueue(c?.queue || c?.stage); }
function qdef(key?: string | null) { return ALL_QUEUES.find((q) => q.key === normalizeQueue(key)) || COMMERCIAL[0]; }
function boardOf(c?: Conv | null): "comercial" | "operacional" { return qdef(queueOf(c)).board; }
function isClosed(c?: Conv | null) { return CLOSED.has(String(c?.status || "").toLowerCase()) || CLOSED.has(String(c?.stage || "").toLowerCase()) || CLOSED.has(String(c?.queue || "").toLowerCase()); }
function nameOf(c?: Conv | null) { return c?.whatsapp_contacts?.nome || "Cliente WhatsApp"; }
function phoneOf(c?: Conv | null) { return c?.whatsapp_contacts?.telefone || c?.whatsapp_contacts?.wa_id || ""; }
function initials(v?: string | null) { return String(v || "Cliente").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "C"; }
function rel(v?: string | null) { if (!v) return "—"; const m = Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 60000)); if (m < 1) return "agora"; if (m < 60) return `${m} min`; const h = Math.floor(m / 60); return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`; }
function fmtPhone(v?: string | null) { const d = onlyDigits(v); const l = d.startsWith("55") ? d.slice(2) : d; if (l.length === 11) return `(${l.slice(0, 2)}) ${l.slice(2, 7)}-${l.slice(7)}`; if (l.length === 10) return `(${l.slice(0, 2)}) ${l.slice(2, 6)}-${l.slice(6)}`; return d || "Telefone não identificado"; }
function brl(v: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0); }
function in24h(c?: Conv | null) { if (!c?.last_message_at) return false; return Date.now() - new Date(c.last_message_at).getTime() <= 24 * 60 * 60 * 1000; }
function withCountry(country: string, phone: string) { const d = onlyDigits(phone); const code = onlyDigits(country) || "55"; if (!d) return ""; return d.startsWith(code) ? d : `${code}${d}`; }

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 pt-10 backdrop-blur-sm"><div className="w-full max-w-5xl rounded-[28px] bg-white p-5 shadow-2xl ring-1 ring-slate-200"><div className="mb-4 flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Central WhatsApp</p><h2 className="text-2xl font-black text-slate-900">{title}</h2>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div><button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>{children}</div></div>;
}

export default function WhatsAppAtendimento() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"todos" | "comercial" | "operacional" | "relatorios">("todos");
  const [listFilter, setListFilter] = useState<"tudo" | "nao_lidas" | "novos" | "meus">("tudo");
  const [search, setSearch] = useState("");
  const [startOpen, setStartOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [queuesOpen, setQueuesOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);
  const [country, setCountry] = useState("55");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [startBoard, setStartBoard] = useState<"comercial" | "operacional">("comercial");
  const [startQueue, setStartQueue] = useState("com_novo");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [startTemplate, setStartTemplate] = useState("");
  const [startMessage, setStartMessage] = useState("");
  const [templateFallbackMessage, setTemplateFallbackMessage] = useState("");
  const [sendSatisfaction, setSendSatisfaction] = useState(true);
  const [messageText, setMessageText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load(show = false) {
    if (show) setLoading(true); else setRefreshing(true);
    const { data, error } = await supabase.from("whatsapp_conversations").select("*, whatsapp_contacts(id,nome,telefone,wa_id)").order("last_message_at", { ascending: false, nullsFirst: false }).limit(300);
    if (!error) setConvs((data || []) as Conv[]); else console.error(error);
    setLoading(false); setRefreshing(false);
  }

  async function loadMessages(id: string) {
    const { data, error } = await supabase.from("whatsapp_messages").select("id,direction,body,message_type,created_at,raw_payload,media_mime_type").eq("conversation_id", id).order("created_at", { ascending: true });
    if (!error) setMsgs((data || []) as Msg[]); else setMsgs([]);
    await supabase.from("whatsapp_conversations").update({ unread_count: 0 }).eq("id", id);
  }

  async function open(c: Conv) { setActive(c); await loadMessages(c.id); }

  async function loadTemplates() {
    const res = await fetch("/api/meta/whatsapp?resource=templates").catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    const approved = Array.isArray(json?.templates) ? json.templates.filter((t: Template) => String(t.status || "").toUpperCase() === "APPROVED") : [];
    setTemplates(approved);
    if (approved[0] && !startTemplate) setStartTemplate(approved[0].name);
  }

  async function searchContacts(q: string) {
    setContactQuery(q);
    if (q.trim().length < 2) { setContacts([]); return; }
    const like = `%${q.trim()}%`;
    const [leads, clientes, wa] = await Promise.all([
      supabase.from("leads").select("id,nome,telefone,email").or(`nome.ilike.${like},telefone.ilike.${like},email.ilike.${like}`).limit(8).then((r) => r.data || []),
      supabase.from("clientes").select("id,nome,telefone,email,lead_id").or(`nome.ilike.${like},telefone.ilike.${like},email.ilike.${like}`).limit(8).then((r) => r.data || []),
      supabase.from("whatsapp_contacts").select("id,nome,telefone,wa_id,lead_id").or(`nome.ilike.${like},telefone.ilike.${like},wa_id.ilike.${like}`).limit(8).then((r) => r.data || []),
    ]);
    const rows: ContactOption[] = [
      ...leads.map((x: any) => ({ source: "lead" as const, id: x.id, lead_id: x.id, nome: x.nome || "Lead", telefone: x.telefone || "", email: x.email || null })),
      ...clientes.map((x: any) => ({ source: "cliente" as const, id: x.id, cliente_id: x.id, lead_id: x.lead_id || null, nome: x.nome || "Cliente", telefone: x.telefone || "", email: x.email || null })),
      ...wa.map((x: any) => ({ source: "whatsapp" as const, id: x.id, lead_id: x.lead_id || null, nome: x.nome || "Contato WhatsApp", telefone: x.telefone || x.wa_id || "" })),
    ];
    const seen = new Set<string>();
    setContacts(rows.filter((r) => { const key = `${onlyDigits(r.telefone)}-${r.nome}`; if (!onlyDigits(r.telefone) || seen.has(key)) return false; seen.add(key); return true; }));
  }

  useEffect(() => { load(true); loadTemplates(); }, []);
  useEffect(() => { if (active?.id) loadMessages(active.id); }, [active?.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, active?.id]);
  useEffect(() => { setStartQueue(startBoard === "comercial" ? "com_novo" : "op_novo_cliente"); }, [startBoard]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase(); const qd = onlyDigits(q);
    return convs.filter((c) => {
      if (listFilter === "nao_lidas" && !c.unread_count) return false;
      if (listFilter === "novos" && (c.assigned_to || isClosed(c))) return false;
      if (listFilter === "meus" && !c.assigned_to) return false;
      if (!q) return true;
      return nameOf(c).toLowerCase().includes(q) || String(c.last_message || "").toLowerCase().includes(q) || onlyDigits(phoneOf(c)).includes(qd);
    });
  }, [convs, search, listFilter]);

  const counts = useMemo(() => {
    const open = convs.filter((c) => !isClosed(c)).length;
    const closed = convs.filter((c) => isClosed(c)).length;
    const novos = convs.filter((c) => !c.assigned_to && !isClosed(c)).length;
    const won = convs.filter((c) => queueOf(c) === "fechado_ganho").length;
    const lost = convs.filter((c) => queueOf(c) === "fechado_perdido").length;
    const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : 0;
    const outbound = msgs.filter((m) => m.direction === "outbound").length;
    const inbound = msgs.filter((m) => m.direction === "inbound").length;
    return { open, closed, novos, won, lost, winRate, total: convs.length, inbound, outbound, estimatedOpenings: convs.filter((c) => !!c.last_message_at).length, estimatedCostBRL: 0 };
  }, [convs, msgs]);

  const kanbanQueues = (tab === "comercial" ? COMMERCIAL : OPERATIONAL).filter((q) => !q.terminal);
  const byQueue = useMemo(() => {
    const map = new Map<string, Conv[]>(); kanbanQueues.forEach((q) => map.set(q.key, []));
    filtered.forEach((c) => { const k = queueOf(c); if (map.has(k)) map.get(k)?.push(c); });
    return map;
  }, [filtered, tab]);

  async function transfer(queue: string, c: Conv = active as Conv) {
    if (!c?.id) return;
    await supabase.from("whatsapp_conversations").update({ queue, stage: queue, updated_at: new Date().toISOString() }).eq("id", c.id);
    setActive((prev) => prev?.id === c.id ? { ...prev, queue, stage: queue } : prev);
    await load();
  }

  function selectedStartContact() {
    if (selectedContact) return selectedContact;
    const phone = withCountry(country, manualPhone);
    return { source: "manual" as const, nome: manualName || "Contato", telefone: phone };
  }

  async function createTicket() {
    const contact = selectedStartContact();
    const phone = onlyDigits(contact.telefone);
    if (!phone) return alert("Informe ou selecione um contato com telefone.");
    setSending(true);
    try {
      const now = new Date().toISOString();
      const { data: waContact, error: cErr } = await supabase.from("whatsapp_contacts").upsert({ wa_id: phone, telefone: phone, nome: contact.nome || null, lead_id: contact.lead_id || null, updated_at: now }, { onConflict: "wa_id" }).select("id,nome,telefone,wa_id,lead_id").single();
      if (cErr || !waContact?.id) throw cErr || new Error("Contato não criado.");
      const { data: existing } = await supabase.from("whatsapp_conversations").select("*, whatsapp_contacts(id,nome,telefone,wa_id)").eq("contact_id", waContact.id).not("status", "in", "(fechada,finalizado)").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const conv = existing?.id ? existing : (await supabase.from("whatsapp_conversations").insert({ contact_id: waContact.id, lead_id: waContact.lead_id || contact.lead_id || null, queue: startQueue, stage: startQueue, status: "humano", last_message: "Ticket criado", last_message_at: now, unread_count: 0 }).select("*, whatsapp_contacts(id,nome,telefone,wa_id)").single()).data;
      if (!conv?.id) throw new Error("Ticket não criado.");
      setStartOpen(false); setSelectedContact(null); setManualName(""); setManualPhone(""); setStartMessage(""); setTemplateFallbackMessage(""); await load(true); await open(conv as Conv);
      if (startMessage.trim() && in24h(conv as Conv)) await sendPayload(conv as Conv, startMessage.trim());
    } catch (e: any) { alert(e?.message || "Não foi possível criar ticket."); } finally { setSending(false); }
  }

  function fileToBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || "")); r.onerror = reject; r.readAsDataURL(f); });
  }

  async function sendPayload(conv: Conv, body?: string) {
    const text = String(body ?? messageText).trim();
    if (!conv?.id) return;
    if (!in24h(conv)) return alert("Este cliente está fora da janela de 24h. Selecione um modelo aprovado para reabrir a conversa.");
    if (!text && !file) return;
    setSending(true);
    try {
      const payload: any = { conversation_id: conv.id, to: phoneOf(conv), body: text };
      if (file) { payload.file_base64 = await fileToBase64(file); payload.file_name = file.name; payload.mime_type = file.type || "application/octet-stream"; payload.caption = text; }
      const res = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.error?.message || json?.error?.message || json?.error || "Falha ao enviar mensagem");
      setMessageText(""); setFile(null); await loadMessages(conv.id); await load();
    } catch (e: any) { alert(e?.message || "Não foi possível enviar."); } finally { setSending(false); }
  }

  async function finishConversation() {
    if (!active?.id) return;
    const now = new Date().toISOString();
    await supabase.from("whatsapp_conversations").update({ status: "fechada", stage: "finalizado", queue: "finalizado", closed_at: now, updated_at: now }).eq("id", active.id);
    if (sendSatisfaction && in24h(active)) {
      await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: active.id, to: phoneOf(active), body: "Antes de encerrar, como você avalia nosso atendimento de 1 a 5? 😊" }) });
    }
    setFinishOpen(false); setActive(null); setMsgs([]); await load(true);
  }

  function Row({ c }: { c: Conv }) {
    const q = qdef(queueOf(c)); const selected = active?.id === c.id;
    return <button draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)} onClick={() => open(c)} className={`flex w-full gap-3 border-b px-4 py-3 text-left hover:bg-slate-50 ${selected ? "bg-slate-100" : "bg-white"}`}><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: q.color }}>{initials(nameOf(c))}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-black text-slate-900">{nameOf(c)}</p><span className="text-[11px] font-bold text-slate-400">{rel(c.last_message_at)}</span></div><p className="mt-1 truncate text-xs text-slate-500">{c.last_message || fmtPhone(phoneOf(c))}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full border px-2 py-0.5 text-[10px] font-bold text-slate-500">Ticket #{c.id.slice(0, 8).toUpperCase()}</span><span className="rounded-full border px-2 py-0.5 text-[10px] font-bold text-slate-500">{q.board === "comercial" ? "Comercial" : "Operacional"}</span><span className="rounded-full border px-2 py-0.5 text-[10px] font-bold text-slate-500">{q.label}</span>{!!c.unread_count && <span className="rounded-full bg-[#A11C27] px-2 py-0.5 text-[10px] font-bold text-white">{c.unread_count}</span>}</div></div></button>;
  }

  function Chat() {
    if (!active) return <div className="flex h-full min-h-[72vh] items-center justify-center p-8 text-center text-slate-500"><div><MessageCircle className="mx-auto mb-3 h-12 w-12 text-slate-300" /><p className="text-lg font-black text-slate-800">Selecione uma conversa</p><p className="mt-1 text-sm">A conversa abrirá aqui, no padrão WhatsApp Web.</p></div></div>;
    const q = qdef(queueOf(active));
    const outside = !in24h(active);
    return <div className="flex h-full max-h-[72vh] min-h-[72vh] flex-col bg-[#efe7dd]"><div className="flex items-center justify-between border-b bg-white px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: q.color }}>{initials(nameOf(active))}</div><div className="min-w-0"><p className="truncate font-black text-slate-900">{nameOf(active)}</p><p className="text-xs text-slate-500">Ticket #{active.id.slice(0, 8).toUpperCase()} • {q.board === "comercial" ? "Comercial" : "Operacional"} • {q.label}</p></div></div><div className="flex gap-2"><select value={queueOf(active)} onChange={(e) => transfer(e.target.value)} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold text-slate-600">{ALL_QUEUES.map((item) => <option key={item.key} value={item.key}>{item.board === "comercial" ? "Comercial" : "Operacional"} · {item.label}</option>)}</select><button onClick={() => setFinishOpen(true)} className="rounded-xl border px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"><CheckCircle2 className="mr-1 inline h-4 w-4" />Finalizar</button></div></div><div className="flex-1 space-y-2 overflow-y-auto p-4">{msgs.map((m) => { const out = m.direction === "outbound"; return <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}><div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow ${out ? "bg-[#dcf8c6]" : "bg-white"}`}><p className="whitespace-pre-wrap">{m.body || m.message_type || "Mensagem"}</p><p className="mt-1 text-right text-[10px] text-slate-400">{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p></div></div>; })}<div ref={endRef} /></div>{outside && <div className="border-t bg-amber-50 p-3 text-xs font-bold text-amber-800">Cliente fora da janela de 24h. Use modelo aprovado para reabertura antes de enviar texto livre.</div>}<div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }} className="border-t bg-white p-3"><input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />{file && <div className="mb-2 flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600"><span>{file.name}</span><button onClick={() => setFile(null)}>remover</button></div>}<div className="flex items-end gap-2"><button onClick={() => alert("Emoji será conectado na próxima etapa visual.")} className="rounded-full p-3 hover:bg-slate-100"><Smile className="h-5 w-5" /></button><button onClick={() => fileRef.current?.click()} className="rounded-full p-3 hover:bg-slate-100"><Paperclip className="h-5 w-5" /></button><button onClick={() => alert("Gravação de áudio será conectada na próxima etapa.")} className="rounded-full p-3 hover:bg-slate-100"><Mic className="h-5 w-5" /></button><button onClick={() => alert("Ligação pelo WhatsApp exige permissão do cliente.")} className="rounded-full p-3 hover:bg-slate-100"><Phone className="h-5 w-5" /></button><textarea disabled={outside} value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPayload(active); } }} placeholder={outside ? "Reabra com modelo aprovado para enviar mensagem." : "Digite sua mensagem..."} className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border bg-slate-50 px-4 py-3 text-sm" /><button onClick={() => sendPayload(active)} disabled={sending || outside || (!messageText.trim() && !file)} className="rounded-2xl bg-[#A11C27] p-3 text-white disabled:opacity-40">{sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button></div></div></div>;
  }

  function Reports() {
    return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-4">{[["Conversas abertas", counts.open, C.red], ["Novos contatos", counts.novos, C.gold], ["Finalizados", counts.closed, C.green], ["Conversão", `${counts.winRate}%`, C.navy]].map(([l, v, color]) => <div key={l} className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">{l}</p><p className="mt-2 text-3xl font-black" style={{ color: color as string }}>{v}</p></div>)}</div><div className="grid gap-4 lg:grid-cols-4"><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Mensagens recebidas</p><p className="mt-2 text-3xl font-black">{counts.inbound}</p><p className="text-sm text-slate-500">Na conversa aberta</p></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Mensagens enviadas</p><p className="mt-2 text-3xl font-black">{counts.outbound}</p><p className="text-sm text-slate-500">Na conversa aberta</p></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Aberturas estimadas</p><p className="mt-2 text-3xl font-black">{counts.estimatedOpenings}</p><p className="text-sm text-slate-500">Tickets com interação registrada</p></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-400">Custo estimado</p><p className="mt-2 text-3xl font-black text-amber-700">{brl(counts.estimatedCostBRL)}</p><p className="text-sm text-slate-500">Aguardando tabela de preços</p></div></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><h3 className="text-lg font-black text-slate-900">Custos e qualidade</h3><div className="mt-4 grid gap-3 md:grid-cols-3">{["Custo por campanha", "Custo por modelo/template", "Custo por vendedor", "Tempo até primeira resposta", "Tempo médio do ticket aberto", "Avaliação do atendimento"].map((i) => <div key={i} className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700">{i}</div>)}</div></div></div>;
  }

  return <div className="space-y-5"><WhatsAppModuleHeader title="Atendimento WhatsApp" subtitle="Tickets únicos, busca de contatos, WhatsApp Web em Todos e Kanban comercial/operacional." /><div className="flex flex-col gap-3 rounded-[28px] bg-gradient-to-r from-[#1E293F] to-[#A11C27] p-4 text-white shadow-xl lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-white/60">WhatsApp oficial conectado ao CRM</p><h1 className="text-2xl font-black">Central de Atendimentos</h1></div><div className="flex flex-wrap gap-2"><button onClick={() => setStartOpen(true)} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"><Plus className="mr-2 inline h-4 w-4" />Iniciar conversa</button><button onClick={() => setQueuesOpen(true)} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"><Settings className="mr-2 inline h-4 w-4" />Configurar filas</button><button onClick={() => load()} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"><RefreshCw className={`mr-2 inline h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Atualizar</button></div></div><div className="grid gap-3 md:grid-cols-4"><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-400">Novos</p><p className="text-2xl font-black text-[#B5A573]">{counts.novos}</p></div><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-400">Abertos</p><p className="text-2xl font-black text-[#A11C27]">{counts.open}</p></div><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-400">Finalizados</p><p className="text-2xl font-black text-emerald-700">{counts.closed}</p></div><div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-400">Total</p><p className="text-2xl font-black text-[#1E293F]">{counts.total}</p></div></div><div className="rounded-[28px] border bg-white p-3 shadow-sm"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{(["todos", "comercial", "operacional", "relatorios"] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-full px-4 py-2 text-sm font-black ${tab === item ? "bg-[#1E293F] text-white" : "bg-slate-100 text-slate-600"}`}>{item === "todos" ? "Todos" : item === "relatorios" ? "Relatórios" : item.charAt(0).toUpperCase() + item.slice(1)}</button>)}</div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou mensagem..." className="rounded-2xl border bg-slate-50 px-4 py-3 text-sm lg:w-[360px]" /></div></div>{loading ? <div className="flex h-[60vh] items-center justify-center rounded-3xl bg-white"><Loader2 className="h-7 w-7 animate-spin" /></div> : tab === "relatorios" ? <Reports /> : tab === "todos" ? <div className="grid min-h-[72vh] overflow-hidden rounded-3xl border bg-white shadow-sm lg:grid-cols-[430px_1fr]"><div className="border-r"><div className="border-b p-4"><h3 className="text-xl font-black">WhatsApp</h3><div className="mt-3 flex gap-2">{[["tudo", "Tudo"], ["nao_lidas", "Não lidas"], ["novos", "Novos"], ["meus", "Meus"]].map(([key, label]) => <button key={key} onClick={() => setListFilter(key as any)} className={`rounded-full border px-3 py-1 text-xs font-bold ${listFilter === key ? "bg-[#1E293F] text-white" : "bg-slate-50 text-slate-600"}`}>{label}</button>)}</div></div><div className="max-h-[72vh] overflow-auto">{filtered.map((c) => <Row key={c.id} c={c} />)}</div></div><Chat /></div> : <div className="flex min-h-[62vh] gap-4 overflow-x-auto pb-5">{kanbanQueues.map((q) => { const items = byQueue.get(q.key) || []; return <div key={q.key} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData("text/plain"); const c = convs.find((x) => x.id === id); if (c) transfer(q.key, c); }} className="w-[330px] shrink-0"><div className="sticky top-0 z-10 mb-3 rounded-3xl border bg-white p-3 shadow-sm"><div className="flex items-center justify-between"><div><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: q.color }} /><p className="font-black text-slate-800">{q.label}</p></div><p className="mt-1 text-xs text-slate-400">{q.desc}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{items.length}</span></div></div><div className="space-y-3">{items.length === 0 ? <div className="rounded-3xl border border-dashed bg-white/70 p-5 text-center text-sm text-slate-400">Nenhum ticket nesta etapa.</div> : items.map((c) => <Row key={c.id} c={c} />)}</div></div>; })}</div>}{startOpen && <Modal title="Iniciar conversa" subtitle="Pesquise leads/clientes/contatos ou adicione um contato manualmente." onClose={() => setStartOpen(false)}><div className="grid gap-5 lg:grid-cols-[1fr_360px]"><div className="space-y-4"><input value={contactQuery} onChange={(e) => searchContacts(e.target.value)} placeholder="Pesquisar cliente, lead, telefone ou e-mail..." className="w-full rounded-2xl border px-4 py-3 text-sm" /><div className="max-h-64 overflow-auto rounded-2xl border">{contacts.length === 0 ? <div className="p-4 text-sm text-slate-400">Pesquise pelo menos 2 letras. Se não encontrar, adicione manualmente ao lado.</div> : contacts.map((c) => <button key={`${c.source}-${c.id}-${c.telefone}`} onClick={() => { setSelectedContact(c); setManualName(c.nome); setManualPhone(c.telefone); }} className={`flex w-full items-center justify-between border-b p-3 text-left hover:bg-slate-50 ${selectedContact?.telefone === c.telefone ? "bg-slate-100" : ""}`}><div><p className="font-black text-slate-800">{c.nome}</p><p className="text-xs text-slate-500">{fmtPhone(c.telefone)} • {c.source}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">{c.source}</span></button>)}</div><div className="grid gap-3 md:grid-cols-2"><label className="space-y-1"><span className="text-xs font-black uppercase text-slate-400">País</span><select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm"><option value="55">Brasil +55</option><option value="1">EUA/Canadá +1</option><option value="351">Portugal +351</option><option value="34">Espanha +34</option></select></label><label className="space-y-1"><span className="text-xs font-black uppercase text-slate-400">Número manual</span><input value={manualPhone} onChange={(e) => { setManualPhone(e.target.value); setSelectedContact(null); }} placeholder="DDD + número" className="w-full rounded-2xl border px-4 py-3 text-sm" /></label><label className="space-y-1 md:col-span-2"><span className="text-xs font-black uppercase text-slate-400">Nome manual</span><input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Nome do contato" className="w-full rounded-2xl border px-4 py-3 text-sm" /></label></div></div><div className="space-y-3 rounded-3xl bg-slate-50 p-4"><label className="space-y-1"><span className="text-xs font-black uppercase text-slate-400">Kanban</span><select value={startBoard} onChange={(e) => setStartBoard(e.target.value as any)} className="w-full rounded-2xl border px-4 py-3 text-sm"><option value="comercial">Comercial</option><option value="operacional">Operacional</option></select></label><label className="space-y-1"><span className="text-xs font-black uppercase text-slate-400">Etapa</span><select value={startQueue} onChange={(e) => setStartQueue(e.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm">{(startBoard === "comercial" ? COMMERCIAL : OPERATIONAL).filter((q) => !q.terminal).map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}</select></label><label className="space-y-1"><span className="text-xs font-black uppercase text-slate-400">Modelo aprovado para reabertura</span><select value={startTemplate} onChange={(e) => setStartTemplate(e.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm"><option value="">Selecionar quando necessário</option>{templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}</select></label><label className="space-y-1"><span className="text-xs font-black uppercase text-slate-400">Mensagem automática após aceite</span><textarea value={templateFallbackMessage} onChange={(e) => setTemplateFallbackMessage(e.target.value)} className="min-h-[90px] w-full rounded-2xl border px-4 py-3 text-sm" placeholder="Mensagem que será enviada após o cliente aceitar/responder." /></label><label className="space-y-1"><span className="text-xs font-black uppercase text-slate-400">Mensagem inicial na janela de 24h</span><textarea value={startMessage} onChange={(e) => setStartMessage(e.target.value)} className="min-h-[90px] w-full rounded-2xl border px-4 py-3 text-sm" placeholder="Se estiver na janela de 24h, será enviada direto." /></label><button onClick={createTicket} disabled={sending} className="w-full rounded-2xl bg-[#A11C27] px-4 py-3 font-black text-white disabled:opacity-50">{sending ? "Criando..." : "Criar ticket"}</button></div></div></Modal>}{finishOpen && <Modal title="Finalizar conversa" subtitle="Escolha se deseja enviar a pesquisa de satisfação." onClose={() => setFinishOpen(false)}><div className="space-y-4"><label className="flex items-center gap-3 rounded-2xl border p-4"><input type="checkbox" checked={sendSatisfaction} onChange={(e) => setSendSatisfaction(e.target.checked)} /><span className="font-bold text-slate-700">Enviar pesquisa de satisfação para o cliente</span></label><button onClick={finishConversation} className="rounded-2xl bg-[#A11C27] px-4 py-3 font-black text-white">Finalizar atendimento</button></div></Modal>}{queuesOpen && <Modal title="Configurar filas" subtitle="Etapas oficiais dos Kanbans Comercial e Operacional." onClose={() => setQueuesOpen(false)}><div className="grid gap-4 lg:grid-cols-2"><div><h3 className="mb-3 font-black text-slate-900">Comercial</h3><div className="space-y-2">{COMMERCIAL.map((q) => <div key={q.key} className="rounded-2xl border p-3"><p className="font-black">{q.label}</p><p className="text-xs text-slate-500">{q.desc}</p></div>)}</div></div><div><h3 className="mb-3 font-black text-slate-900">Operacional</h3><div className="space-y-2">{OPERATIONAL.map((q) => <div key={q.key} className="rounded-2xl border p-3"><p className="font-black">{q.label}</p><p className="text-xs text-slate-500">{q.desc}</p></div>)}</div></div></div></Modal>}</div>;
}
