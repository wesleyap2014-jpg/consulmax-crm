import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { MAX_APPROVED_AVATAR } from "./maxApprovedAvatar";
import { maxCommercialText, maxMoney, type MaxCriteria, type MaxOffer, type MaxOrigin } from "@/lib/contempladas/maxStrategyEngine";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronLeft, Clock3, Copy, FileText, History, Loader2, Plus, RefreshCcw, Search, Send, Sparkles, X } from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  offers?: MaxOffer[];
  note?: string;
  at?: string;
};
type Negotiation = {
  id: string;
  title: string;
  source_mode: MaxOrigin;
  criteria: MaxCriteria;
  messages: ChatMessage[];
  updated_at: string;
};
type LegacySearch = { id: string; segmento: string; credito_solicitado: number; created_at: string; source_mode: string };
type MaxCota = { id: string; status: string };

const opening = (): ChatMessage => ({
  id: "opening", role: "assistant",
  text: "Olá! Sou o MAX. 🐾 Me conte o que seu cliente procura. Posso combinar cartas, comparar entrada, saldo, parcelas e ajudar a montar a negociação.",
});
function Avatar({ size = 32 }: { size?: number }) {
  return <img src={MAX_APPROVED_AVATAR} draggable={false} width={size} height={size} alt="MAX da Consulmax"
    style={{ width: size, height: size }} className="shrink-0 rounded-full border border-[#B5A573] object-cover" />;
}
function currency(n: number | null | undefined) { return n === null || n === undefined ? "—" : maxMoney(n); }

function OfferCard({ offer, number, onOpen, onCopy, busy }: {
  offer: MaxOffer; number: number; onOpen: (offer: MaxOffer) => void; onCopy: (offer: MaxOffer) => void; busy: boolean;
}) {
  const good = offer.viavelNosCriterios;
  const tiles = [
    { label: "Entrada total", value: currency(offer.entrada) },
    { label: "Parcela inicial", value: currency(offer.parcelaInicial) },
    { label: "Saldo nominal *", value: currency(offer.saldo) },
    { label: "Desembolso inicial", value: currency(offer.desembolsoInicial) },
  ];
  return (
    <article className={"flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md " + (good ? "border-[#B5A573]/50" : "border-amber-200")}>
      <div className="bg-[#1E293F] px-4 py-4 text-white">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-[#E0CE8C]">Opção {String(number).padStart(2, "0")}</span>
          <span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold " + (good ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-400/20 text-amber-100")}>
            {good ? <CheckCircle2 className="h-3 w-3"/> : <AlertTriangle className="h-3 w-3"/>}
            {good ? "Pré-viável" : "Requer ajustes"}
          </span>
        </div>
        <p className="min-h-[32px] text-xs font-semibold leading-relaxed text-slate-100">{offer.titulo || "Alternativa comercial"}</p>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-300">Crédito disponível</p>
        <p className="mt-1 break-words text-2xl font-black leading-tight tracking-tight text-[#E0CE8C]">{currency(offer.credito)}</p>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((tile) => (
            <div key={tile.label} className="min-w-0 rounded-xl border border-slate-100 bg-[#F8FAFC] px-3 py-2.5">
              <p className="text-[10px] font-medium text-slate-500">{tile.label}</p>
              <p className="mt-1 break-words text-[13px] font-extrabold tracking-tight text-[#1E293F]">{tile.value}</p>
            </div>
          ))}
        </div>
        {offer.deficit > 0 ?
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/> Faltam {currency(offer.deficit)} para fechar a operação
          </p> : null}
        {offer.complementoCompra > 0 ?
          <p className="text-xs text-slate-600">Complemento do bem: <strong className="text-[#1E293F]">{currency(offer.complementoCompra)}</strong></p> : null}
        {offer.pontosPositivos?.length ?
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0"/>{offer.pontosPositivos.slice(0, 2).join(" · ")}
          </p> : null}
        {offer.alertas?.length ? <div className="space-y-1.5 border-l-2 border-amber-300 pl-2.5">
          {offer.alertas.slice(0, 3).map((alert, i) => <p key={i} className="text-[11px] leading-relaxed text-amber-800">{alert}</p>)}
        </div> : null}
        <div className="mt-auto space-y-2 rounded-xl border border-slate-100 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-[11px] font-bold text-[#1E293F]">{offer.administradora}</span>
            <span className="rounded-full bg-[#F5F0E7] px-2 py-1 text-[10px] font-semibold text-[#6F5C37]">{offer.qtdCotas} {offer.qtdCotas === 1 ? "cota" : "cotas"}</span>
          </div>
          <details className="group rounded-lg bg-[#F8FAFC] px-2.5 py-2 text-[11px] text-slate-600">
            <summary className="cursor-pointer font-semibold text-[#1E293F]">Códigos das cartas <span className="text-[#A11C27]">({offer.codigos.length})</span></summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {offer.codigos.map((codigo, i) => <span key={codigo + i} className="rounded-md border border-[#B5A573]/40 bg-white px-2 py-1 font-semibold text-[#1E293F]">{codigo}</span>)}
            </div>
          </details>
          <details className="group rounded-lg bg-[#F8FAFC] px-2.5 py-2 text-[11px] text-slate-600">
            <summary className="cursor-pointer font-semibold text-[#1E293F]">Ver evolução das parcelas <span className="text-[#A11C27]">({offer.parcelas.length} faixas)</span></summary>
            <div className="mt-2 space-y-1">
              {offer.parcelas.map((faixa, i) => <p key={i} className="flex justify-between gap-2 border-b border-slate-100 py-1 last:border-none">
                <span>{faixa.quantidade} ×</span><strong className="text-[#1E293F]">{currency(faixa.valor)}</strong>
              </p>)}
            </div>
          </details>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50 p-3">
        <button type="button" disabled={busy} onClick={() => onOpen(offer)}
          className="flex min-h-10 items-center justify-center gap-1 rounded-xl bg-[#1E293F] px-2 py-2 text-[11px] font-bold text-white transition hover:bg-[#2b405e] disabled:opacity-50">
          <ArrowRight className="h-3.5 w-3.5"/> Ver cotas
        </button>
        <button type="button" disabled={busy} onClick={() => onCopy(offer)}
          className="flex min-h-10 items-center justify-center gap-1 rounded-xl border border-[#B5A573] bg-white px-2 py-2 text-[11px] font-bold text-[#1E293F] transition hover:bg-[#F8F4E9] disabled:opacity-50">
          <Copy className="h-3.5 w-3.5"/> Copiar proposta
        </button>
      </div>
    </article>
  );
}
export default function MaxContempladas({
  cotas, sourceMode, onOpenCombination, openSignal = 0, suspended = false, commissionPct,
}: {
  cotas: MaxCota[];
  sourceMode: "externo" | "crm";
  onOpenCombination: (ids: string[]) => void;
  openSignal?: number;
  suspended?: boolean;
  commissionPct?: number;
}) {
  const [open, setOpen] = useState(false);
  const [viewHistory, setViewHistory] = useState(false);
  const [source, setSource] = useState<MaxOrigin>("ambos");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [validationBusy, setValidationBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([opening()]);
  const [negotiationId, setNegotiationId] = useState<string | null>(null);
  const [history, setHistory] = useState<Negotiation[]>([]);
  const [legacy, setLegacy] = useState<LegacySearch[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [notice, setNotice] = useState("");
  const [criteria, setCriteria] = useState<MaxCriteria>({});
  const logEnd = useRef<HTMLDivElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const commissionRef = useRef<number | undefined>(commissionPct);
  const requestLock = useRef(false);
  useEffect(() => { if (openSignal > 0) setOpen(true); }, [openSignal]);
  useEffect(() => { if (open) logEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy, open]);
  useEffect(() => { void loadHistory(); }, []);
  useEffect(() => {
    if (commissionRef.current === undefined) { commissionRef.current = commissionPct; return; }
    if (commissionPct === undefined || Math.abs(commissionRef.current - commissionPct) < 0.000001) return;
    commissionRef.current = commissionPct;
    if (open && negotiationId && !requestLock.current) void sendMessage("Recalcule as alternativas com a comissão atual do CRM, mantendo os demais critérios.");
  }, [commissionPct]);

  async function accessToken(): Promise<string> {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente no CRM.");
    return data.session.access_token;
  }
  async function api(payload: Record<string, unknown>) {
    const token = await accessToken();
    const response = await fetch("/api/contempladas/max-consultor", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.message || "Não consegui consultar o estoque agora.");
    return result;
  }
  async function loadHistory() {
    setHistoryLoading(true);
    const auth = await supabase.auth.getUser();
    if (!auth.data.user) { setHistoryLoading(false); setHistoryError("Faça login para visualizar suas negociações."); return; }
    const uid = auth.data.user.id;
    const [negotiations, old] = await Promise.all([
      supabase.from("stock_max_negotiations").select("id,title,source_mode,criteria,messages,updated_at").eq("user_id", uid).order("updated_at", { ascending: false }).limit(50),
      supabase.from("stock_max_searches").select("id,segmento,credito_solicitado,created_at,source_mode").eq("user_id", uid).order("created_at", { ascending: false }).limit(25),
    ]);
    if (!negotiations.error) setHistory((negotiations.data || []) as Negotiation[]);
    else setHistoryError("Histórico temporariamente indisponível.");
    if (!old.error) setLegacy((old.data || []) as LegacySearch[]);
    setHistoryLoading(false);
  }
  function newNegotiation() {
    setNegotiationId(null);
    setCriteria({});
    setMessages([opening()]);
    setInput("");
    setNotice("");
    setViewHistory(false);
    setSource("ambos");
    textInput.current?.focus();
  }
  function resume(item: Negotiation) {
    setNegotiationId(item.id);
    setCriteria(item.criteria || {});
    setSource(item.source_mode || "ambos");
    setMessages([opening(), ...(Array.isArray(item.messages) ? item.messages : [])].slice(-65));
    setNotice("Histórico retomado. Valores e disponibilidade serão consultados novamente ao refinar ou selecionar uma carta.");
    setViewHistory(false);
  }
  async function sendMessage(message: string, startNew = false) {
    const text = message.trim();
    if (!text || requestLock.current) return;
    requestLock.current = true;
    setBusy(true); setNotice(""); setViewHistory(false); setInput("");
    const pending: ChatMessage = { id: crypto.randomUUID(), role: "user", text, at: new Date().toISOString() };
    setMessages((old) => [...old, pending]);
    try {
      const result = await api({ action: "chat", message: text, sourceMode: startNew ? "ambos" : source, negotiationId: startNew ? undefined : (negotiationId || undefined) });
      setNegotiationId(result.negotiationId);
      setCriteria(result.criteria || {});
      setMessages((old) => [...old, result.message as ChatMessage]);
      setNotice(result.aiEnabled ? "" : "Interpretação automática em modo simplificado; IA temporariamente indisponível.");
      void loadHistory();
    } catch (error: any) {
      setMessages((old) => [...old, { id: crypto.randomUUID(), role: "assistant", text: error.message || "Não consegui concluir a consulta.", at: new Date().toISOString() }]);
    } finally {
      setBusy(false); requestLock.current = false;
      textInput.current?.focus();
    }
  }
  async function checkOffer(offer: MaxOffer) {
    const result = await api({ action: "validate", sourceMode: source, negotiationId: negotiationId || undefined, ids: offer.ids });
    return result.offer as MaxOffer;
  }
  async function openOffer(offer: MaxOffer) {
    if (validationBusy) return;
    setValidationBusy(true);
    try {
      const current = await checkOffer(offer);
      if (Math.abs(current.entrada - offer.entrada) > 0.009 || Math.abs(current.saldo - offer.saldo) > 0.009) {
        setNotice("A composição mudou desde a busca. Atualize a negociação para consultar as novas condições antes de abrir as cartas.");
        return;
      }
      onOpenCombination(current.ids);
      setOpen(false);
    } catch (error: any) { setNotice(error.message || "Carta indisponível. Refine a busca."); }
    finally { setValidationBusy(false); }
  }
  async function copyOffer(offer: MaxOffer) {
    if (validationBusy) return;
    setValidationBusy(true);
    try {
      const current = await checkOffer(offer);
      if (Math.abs(current.entrada - offer.entrada) > 0.009 || Math.abs(current.saldo - offer.saldo) > 0.009) {
        setNotice("A entrada ou parcelas mudaram após a atualização. Faça nova busca antes de enviar a proposta.");
        return;
      }
      await navigator.clipboard.writeText(maxCommercialText(current));
      setNotice("Proposta comercial validada e copiada para o WhatsApp. ✅");
    } catch (error: any) { setNotice(error.message || "Não foi possível copiar."); }
    finally { setValidationBusy(false); }
  }
  const items = history.filter((x) => (x.title || "").toLowerCase().includes(historySearch.toLowerCase()));
  return (
    <div className={(suspended ? "hidden " : "") + "pointer-events-none fixed inset-0 z-[70]"} aria-label="MAX 2.0 — consultor de cartas contempladas">
      {open ? (
        <section role="dialog" aria-modal="false" aria-label="MAX 2.0 — negociação consultiva" className="pointer-events-auto absolute bottom-[82px] right-2 flex h-[min(740px,calc(100dvh-95px))] w-[min(1080px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-[#B5A573]/40 bg-white shadow-[0_24px_75px_rgba(15,23,42,0.25)] sm:right-5 sm:rounded-3xl">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#E0CE8C]/20 bg-gradient-to-r from-[#142238] via-[#1E293F] to-[#681B2B] px-3 py-3.5 text-white sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-full border-2 border-[#E0CE8C] bg-[#1E293F] p-0.5 shadow-lg"><Avatar size={48}/></div>
              <div className="min-w-0">
                <strong className="block text-base font-extrabold tracking-wide">MAX <span className="rounded-full border border-[#E0CE8C]/40 bg-[#E0CE8C]/15 px-2 py-0.5 text-[10px] font-bold text-[#E0CE8C]">2.0</span></strong>
                <p className="truncate text-[11px] text-slate-200">Especialista em cartas contempladas</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" title="Nova negociação" onClick={newNegotiation} className="rounded-xl border border-white/15 p-2.5 hover:bg-white/15"><Plus className="h-4 w-4"/></button>
              <button type="button" aria-pressed={viewHistory} title="Mostrar ou ocultar negociações" onClick={() => setViewHistory((v) => !v)} className={"rounded-xl border border-white/15 p-2.5 hover:bg-white/15 " + (viewHistory ? "bg-white/20" : "")}><History className="h-4 w-4"/></button>
              <button type="button" aria-label="Minimizar MAX" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-white/15"><ChevronDown className="h-4 w-4"/></button>
              <button type="button" aria-label="Fechar MAX" onClick={() => setOpen(false)} className="hidden rounded-lg p-2 hover:bg-white/15 sm:block"><X className="h-4 w-4"/></button>
            </div>
          </header>
          <div className="flex min-h-0 flex-1">
            <aside className={(viewHistory ? "flex " : "hidden ") + "w-full shrink-0 flex-col overflow-hidden border-r border-[#E6EAF0] bg-[#F7F8FB] md:w-[255px]"}>
              <div className="border-b border-slate-200 p-3">
                <div className="flex items-center justify-between gap-1">
                  <strong className="text-sm font-extrabold text-[#1E293F]">Minhas negociações</strong>
                  <button type="button" onClick={() => setViewHistory(false)} className="rounded-md p-1 text-slate-500 md:hidden"><ChevronLeft className="h-4 w-4"/></button>
                </div>
                <button type="button" onClick={newNegotiation} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E293F] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#2B405E]">
                  <Plus className="h-3.5 w-3.5"/> Nova negociação
                </button>
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/>
                  <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Localizar negociação..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-2 text-xs outline-none focus:border-[#B5A573]"/>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
                {historyLoading ? <p className="p-2 text-xs text-slate-500">Carregando...</p> : null}
                {historyError ? <p role="status" className="p-2 text-xs text-amber-700">{historyError}</p> : null}
                {!historyLoading && items.length === 0 ? <p className="p-2 text-xs text-slate-500">Suas negociações aparecerão aqui.</p> : null}
                {items.map((item) => (
                  <button key={item.id} type="button" onClick={() => resume(item)} className={"w-full rounded-xl border p-3 text-left transition hover:bg-white hover:shadow-sm " + (negotiationId === item.id ? "border-[#B5A573] bg-white shadow-sm" : "border-transparent bg-white/40")}>
                    <strong className="block truncate text-xs font-bold text-[#1E293F]">{item.title}</strong>
                    <span className="mt-2 flex items-center gap-1 text-[10px] text-slate-500"><Clock3 className="h-3 w-3"/>{new Date(item.updated_at).toLocaleDateString("pt-BR")}</span>
                  </button>
                ))}
                {legacy.length ? <details className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-2">
                  <summary className="cursor-pointer px-2 py-2 text-[11px] font-bold text-slate-600">Buscas anteriores · {legacy.length}</summary>
                  {legacy.slice(0, 12).map((search) => (
                    <button key={search.id} type="button" onClick={() => {
                      newNegotiation();
                      void sendMessage("Procure cartas de " + search.segmento + " com crédito próximo de " + maxMoney(search.credito_solicitado) + " no estoque atual.", true);
                    }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-xs text-slate-600 transition hover:bg-[#F8FAFC]">
                      <RefreshCcw className="h-3.5 w-3.5 shrink-0 text-[#B5A573]"/>
                      <span className="min-w-0 truncate">{search.segmento} · {maxMoney(search.credito_solicitado)}</span>
                    </button>
                  ))}
                </details> : null}
              </div>
              <p className="border-t border-slate-200 px-3 py-2 text-[10px] text-slate-500">Histórico privado por vendedor</p>
            </aside>
            <div className={(viewHistory ? "hidden md:flex " : "flex ") + "min-w-0 flex-1 flex-col"}>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-3 sm:px-5">
                <div className="flex items-center gap-2 text-xs text-[#1E293F]"><span className="rounded-lg bg-[#FCEDEE] p-2 text-[#A11C27]"><Sparkles className="h-4 w-4"/></span><span className="font-extrabold">Consultoria comercial</span><span className="hidden rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 sm:inline">Pronto para ajudar</span></div>
                <label className="flex items-center gap-2 text-xs text-slate-600">Consultar
                  <select aria-label="Origem do estoque para o MAX" value={source} onChange={(e) => {
                    if (messages.length > 1) newNegotiation();
                    setSource(e.target.value as MaxOrigin);
                  }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-[#1E293F] outline-none focus:border-[#B5A573]">
                    <option value="ambos">Todos os estoques</option>
                    <option value="externo">Estoque externo</option>
                    <option value="crm">Estoque CRM</option>
                  </select>
                </label>
              </div>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#F8F9FC] p-3 sm:p-5" aria-live="polite">
                {messages.length === 1 && !busy ? <div className="ml-9 rounded-2xl border border-[#E0CE8C]/50 bg-white p-3.5 shadow-sm sm:p-4">
                  <p className="mb-2 text-xs font-bold text-[#1E293F]">Por onde começamos?</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Preciso de uma carta de imóvel de R$ 500 mil",
                      "Monte uma combinação de cartas para um carro de R$ 150 mil",
                      "Como você pode me ajudar?"
                    ].map((suggestion) => <button key={suggestion} type="button" onClick={() => { setInput(suggestion); textInput.current?.focus(); }}
                      className="rounded-xl border border-slate-200 bg-[#F8FAFC] px-3 py-2 text-left text-[11px] font-medium text-[#1E293F] transition hover:border-[#B5A573] hover:bg-[#FAF7F0]">
                      {suggestion}
                    </button>)}
                  </div>
                </div> : null}
                {Object.keys(criteria).some((key) => key !== "maxCotas" && (criteria as any)[key] != null) ? <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-[11px] shadow-sm">
                  <span className="font-bold text-slate-500">NEGOCIAÇÃO</span>
                  {criteria.segmento ? <span className="rounded-full bg-[#1E293F] px-2.5 py-1 text-white">{criteria.segmento}</span> : null}
                  {criteria.credito ? <span className="rounded-full bg-[#F5F0E7] px-2.5 py-1 font-semibold text-[#6F5C37]">Crédito {maxMoney(criteria.credito)}</span> : null}
                  {criteria.recursos !== undefined ? <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-[#1E293F]">Recursos {maxMoney(criteria.recursos)}</span> : null}
                  {criteria.parcelaMax ? <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-[#1E293F]">Parcela até {maxMoney(criteria.parcelaMax)}</span> : null}
                  {criteria.maxCotas ? <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-[#1E293F]">Até {criteria.maxCotas} cotas (pedido)</span> : null}
                </div> : null}
                {messages.map((message) => (
                  <div key={message.id} className={"flex items-start gap-2 " + (message.role === "user" ? "justify-end" : "")}>
                    {message.role === "assistant" ? <Avatar size={30}/> : null}
                    <div className={message.offers?.length ? "w-full min-w-0" : "max-w-[88%]"}>
                      <div className={"w-fit max-w-full whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm " + (message.role === "user" ? "ml-auto rounded-br-md bg-[#A11C27] text-white" : "rounded-bl-md border border-slate-200 bg-white text-[#1E293F]")}>{message.text}</div>
                      {message.role === "assistant" && message.offers?.length ? (
                        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                          {message.offers.map((o, i) => <OfferCard key={o.id + i} number={i + 1} offer={o} busy={validationBusy} onOpen={openOffer} onCopy={copyOffer}/>)}
                        </div>
                      ) : null}
                      {message.note ? <p className="mt-2 flex gap-1 text-[11px] leading-relaxed text-slate-500"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0"/>{message.note}</p> : null}
                    </div>
                  </div>
                ))}
                {busy ? <div className="flex items-center gap-2 text-xs font-medium text-[#1E293F]"><Avatar size={30}/><Loader2 className="h-4 w-4 animate-spin text-[#A11C27]"/> O MAX está consultando e analisando as alternativas...</div> : null}
                <div ref={logEnd}/>
              </div>
              {notice ? <p role="status" className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">{notice}</p> : null}
              <div className="border-t border-slate-100 bg-white px-3 pt-2 text-[10px] text-slate-500 sm:px-5">
                Resultados e saldo nominal estimados. Disponibilidade, garantia e condições dependem de confirmação.
              </div>
              <form onSubmit={(e) => { e.preventDefault(); void sendMessage(input); }} className="flex shrink-0 items-end gap-2 bg-white px-3 pb-3 pt-2 sm:px-5 sm:pb-4">
                <textarea ref={textInput} value={input} rows={2} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }}
                  aria-label="Converse com o MAX" placeholder="Ex.: Meu cliente quer um carro de R$ 130 mil, tem R$ 45 mil e quer parcela até R$ 2 mil..."
                  disabled={busy} className="min-h-[54px] max-h-32 min-w-0 flex-1 resize-none rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-sm shadow-inner outline-none focus:border-[#B5A573] focus:ring-2 focus:ring-[#B5A573]/10"/>
                <button disabled={busy || !input.trim()} type="submit" aria-label="Enviar ao MAX" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#A11C27] text-white shadow-md transition hover:bg-[#8C1721] disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}
                </button>
              </form>
            </div>
          </div>
        </section>
      ) : null}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Abrir ou minimizar MAX" aria-expanded={open}
        className="pointer-events-auto absolute bottom-4 right-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-[3px] border-[#E0CE8C] bg-[#1E293F] shadow-xl transition hover:scale-105 sm:bottom-5 sm:right-5">
        <Avatar size={60}/>
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-400"/>
      </button>
      {!open ? <span className="pointer-events-none absolute bottom-[86px] right-[27px] rounded-lg bg-[#1E293F] px-2 py-1 text-[10px] font-bold text-white sm:right-[29px]">MAX 2.0</span> : null}
    </div>
  );
}
