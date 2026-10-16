import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CarFront, CircleAlert, ChevronDown, House, Loader2, Bike, Send, Truck, X, Search, Plus, Clock3, History } from "lucide-react";

export type MaxCota = {
  id: string;
  codigo: string;
  segmento: string;
  status: string;
  credito_disponivel: number;
  prazo_restante: number;
  valor_parcela: number;
  partner?: { id: string; nome: string } | null;
  admin?: { id: string; nome: string } | null;
  _calc: { entrada: number };
};

type Segment = "Automóvel" | "Imóvel" | "Pesados" | "Motocicletas";
type Criterion = "entrada" | "parcela" | "saldo";
type Offer = {
  ids: string[];
  codigos: string[];
  administradora: string;
  credito: number;
  entrada: number;
  parcela: number;
  saldo: number;
  faixas: { inicio: number; fim: number; valor: number }[];
};
type Alternative = { type: Criterion; offer: Offer };
type Message = { id: number; speaker: "bot" | "user"; text: string; alternatives?: Alternative[]; note?: string };

const money = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const normalize = (s: string) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const SEGMENTS = [
  { value: "Automóvel" as Segment, label: "Automóvel", Icon: CarFront },
  { value: "Imóvel" as Segment, label: "Imóvel", Icon: House },
  { value: "Pesados" as Segment, label: "Pesados", Icon: Truck },
  { value: "Motocicletas" as Segment, label: "Moto", Icon: Bike },
];
const OPTIONS: { type: Criterion; title: string; color: string; bg: string; border: string }[] = [
  { type: "entrada", title: "Menor Entrada", color: "#A11C27", bg: "#FFF7F7", border: "#F3C5C8" },
  { type: "parcela", title: "Menor Parcela", color: "#2563EB", bg: "#F5F8FF", border: "#C8D9FF" },
  { type: "saldo", title: "Menor Saldo Devedor", color: "#15803D", bg: "#F4FBF6", border: "#B8E3C6" },
];

export function readMaxCredit(text: string): number | null {
  const found = text.toLowerCase().match(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?:\s*(milh(?:ão|ões|ao|oes)|mil|k|m))?/i);
  if (!found) return null;
  const raw = found[1];
  const number = raw.includes(",")
    ? Number(raw.replace(/\./g, "").replace(",", "."))
    : Number(raw.includes(".") && raw.split(".").slice(1).every((p) => p.length === 3) ? raw.replace(/\./g, "") : raw);
  const unit = normalize(found[2] || "");
  const multiplier = unit.startsWith("milh") || unit === "m" ? 1_000_000 : unit === "mil" || unit === "k" ? 1000 : 1;
  const result = number * multiplier;
  return Number.isFinite(result) && result >= 1000 && result <= 100_000_000 ? result : null;
}

function parcelRanges(items: MaxCota[]) {
  const endings = [...new Set(items.map((c) => c.prazo_restante))].sort((a, b) => a - b);
  let start = 1;
  return endings.map((fim) => {
    const value = items.filter((c) => c.prazo_restante >= start).reduce((s, c) => s + c.valor_parcela, 0);
    const line = { inicio: start, fim, valor: value };
    start = fim + 1;
    return line;
  });
}

function makeOffer(items: MaxCota[]): Offer {
  return {
    ids: items.map((c) => c.id),
    codigos: items.map((c) => c.codigo),
    administradora: items[0].admin?.nome || "Administradora não informada",
    credito: items.reduce((s, c) => s + c.credito_disponivel, 0),
    entrada: items.reduce((s, c) => s + c._calc.entrada, 0),
    parcela: items.reduce((s, c) => s + c.valor_parcela, 0),
    saldo: items.reduce((s, c) => s + c.prazo_restante * c.valor_parcela, 0),
    faixas: parcelRanges(items),
  };
}

function better(a: Offer, b: Offer | undefined, kind: Criterion, target: number): boolean {
  if (!b) return true;
  const number = (c: Offer) => kind === "entrada" ? c.entrada : kind === "parcela" ? c.parcela : c.saldo;
  const diff = number(a) - number(b);
  if (Math.abs(diff) > 0.01) return diff < 0;
  const proximity = Math.abs(a.credito - target) - Math.abs(b.credito - target);
  if (Math.abs(proximity) > 0.01) return proximity < 0;
  return a.ids.length < b.ids.length;
}

function candidatePool(group: MaxCota[], target: number) {
  const selected = new Map<string, MaxCota>();
  const add = (sorted: MaxCota[], limit: number) => sorted.slice(0, limit).forEach((c) => selected.set(c.id, c));
  for (const n of [1, 2, 3]) {
    add([...group].sort((a, b) => Math.abs(a.credito_disponivel - target / n) - Math.abs(b.credito_disponivel - target / n)), 20);
  }
  add([...group].sort((a, b) => a._calc.entrada - b._calc.entrada), 12);
  add([...group].sort((a, b) => a.valor_parcela - b.valor_parcela), 12);
  add([...group].sort((a, b) => a.prazo_restante * a.valor_parcela - b.prazo_restante * b.valor_parcela), 12);
  return { candidates: [...selected.values()], limited: selected.size < group.length };
}

export function findMaxAlternatives(cotas: MaxCota[], segment: Segment, target: number) {
  const eligible = cotas.filter((c) =>
    normalize(c.segmento) === normalize(segment) && c.status === "disponivel" &&
    Number.isFinite(c.credito_disponivel) && c.credito_disponivel > 0 &&
    Number.isFinite(c.valor_parcela) && c.valor_parcela > 0 &&
    Number.isInteger(c.prazo_restante) && c.prazo_restante > 0 &&
    Number.isFinite(c._calc?.entrada) && c._calc.entrada >= 0
  );
  const groups = new Map<string, MaxCota[]>();
  for (const cota of eligible) {
    // Preserve the manual selection rule: same partner, admin and segment.
    const key = [cota.partner?.id || "", cota.admin?.id || "", normalize(cota.segmento)].join("|");
    groups.set(key, [...(groups.get(key) || []), cota]);
  }
  for (const tolerance of [0.05, 0.10]) {
    const min = target * (1 - tolerance), max = target * (1 + tolerance);
    const best: Partial<Record<Criterion, Offer>> = {};
    let limited = false;
    for (const group of groups.values()) {
      const pool = candidatePool(group.filter((c) => c.credito_disponivel <= max), target);
      limited ||= pool.limited;
      const candidates = pool.candidates;
      const consider = (items: MaxCota[], amount: number) => {
        if (amount < min || amount > max) return;
        const offer = makeOffer(items);
        for (const kind of ["entrada", "parcela", "saldo"] as const) {
          if (better(offer, best[kind], kind, target)) best[kind] = offer;
        }
      };
      for (let i = 0; i < candidates.length; i++) {
        const a = candidates[i];
        consider([a], a.credito_disponivel);
        for (let j = i + 1; j < candidates.length; j++) {
          const b = candidates[j], pair = a.credito_disponivel + b.credito_disponivel;
          if (pair > max) continue;
          consider([a, b], pair);
          for (let k = j + 1; k < candidates.length; k++) {
            const c = candidates[k], triple = pair + c.credito_disponivel;
            if (triple <= max) consider([a, b, c], triple);
          }
        }
      }
    }
    if (best.entrada && best.parcela && best.saldo) {
      return {
        alternatives: OPTIONS.map((item) => ({ type: item.type, offer: best[item.type]! })),
        tolerance, limited, count: eligible.length,
      };
    }
  }
  return { alternatives: [] as Alternative[], tolerance: 0.1, limited: false, count: eligible.length };
}

function OfferCard({ alternative, onDetails }: { alternative: Alternative; onDetails: (ids: string[]) => void }) {
  const style = OPTIONS.find((o) => o.type === alternative.type)!;
  const o = alternative.offer;
  return (
    <article className="rounded-xl border p-3" style={{ borderColor: style.border, background: style.bg }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-extrabold text-white" style={{ background: style.color }}>{OPTIONS.findIndex((x) => x.type === alternative.type) + 1}</span>
        <strong className="text-[13px]" style={{ color: style.color }}>{style.title}</strong>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        <span className="text-slate-500">Crédito</span><strong className="text-right text-slate-800">{money(o.credito)}</strong>
        <span className="text-slate-500">Entrada</span><strong className="text-right text-slate-800">{money(o.entrada)}</strong>
        <span className="text-slate-500">Parcela inicial</span><strong className="text-right text-slate-800">{money(o.parcela)}</strong>
        <span className="text-slate-500">Saldo estimado*</span><strong className="text-right text-slate-800">{money(o.saldo)}</strong>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">{o.faixas.map((f) => f.inicio + " a " + f.fim + "x " + money(f.valor)).join(" · ")}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{o.administradora} · Cota(s): {o.codigos.join(" + ")}</p>
      <button type="button" onClick={() => onDetails(o.ids)} className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50" style={{ borderColor: style.border, color: style.color }}>Ver detalhes e resumo</button>
    </article>
  );
}


/** Ícone do MAX como cachorro (sem dependência de imagem externa). */
function MaxDog({ size = 42 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" role="img" aria-label="MAX, mascote cachorro da Consulmax" xmlns="http://www.w3.org/2000/svg">
      <circle cx="36" cy="36" r="35" fill="#fff" />
      <path d="M15 29 Q4 10 17 10 Q27 13 30 25 L21 41Z" fill="#493427" stroke="#30241f" strokeWidth="2.2"/>
      <path d="M57 29 Q68 10 55 10 Q45 13 42 25 L51 41Z" fill="#493427" stroke="#30241f" strokeWidth="2.2"/>
      <path d="M17 33 Q17 15 36 16 Q55 15 55 33 L53 48 Q47 60 36 61 Q25 60 19 48Z" fill="#C99B6C" stroke="#392820" strokeWidth="2"/>
      <path d="M25 43 Q29 35 36 39 Q43 35 47 43 Q46 55 36 56 Q26 55 25 43Z" fill="#F8EBDD"/>
      <ellipse cx="28" cy="35" rx="3" ry="4" fill="#242222"/>
      <ellipse cx="44" cy="35" rx="3" ry="4" fill="#242222"/>
      <circle cx="29" cy="34" r="1" fill="white"/>
      <circle cx="45" cy="34" r="1" fill="white"/>
      <path d="M31 44 Q36 40 41 44 Q42 49 36 50 Q30 49 31 44" fill="#312723"/>
      <path d="M36 50 Q36 54 31 53 M36 50 Q36 54 41 53" stroke="#312723" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      <path d="M22 59 Q36 67 50 59 L46 67 L26 67Z" fill="#A11C27"/>
      <circle cx="36" cy="64" r="2" fill="#E0CE8C"/>
    </svg>
  );
}

type StoredSearch = {
  id: string;
  user_id: string;
  segmento: Segment;
  source_mode: "externo" | "crm";
  credito_solicitado: number;
  resultados: Alternative[];
  observacao: string;
  created_at: string;
};

function timeLabel(date: string): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const OPENING: Message = { id: 1, speaker: "bot", text: "Olá! Sou o MAX. Selecione um segmento e me diga qual crédito você procura." };

export default function MaxContempladas({ cotas, sourceMode, onOpenCombination }: {
  cotas: MaxCota[];
  sourceMode: "externo" | "crm";
  onOpenCombination: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [segment, setSegment] = useState<Segment | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([OPENING]);
  const [searching, setSearching] = useState(false);
  const [userId, setUserId] = useState("");
  const [history, setHistory] = useState<StoredSearch[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState("");
  const [showMobileHistory, setShowMobileHistory] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const nextId = useRef(2);
  const listBottom = useRef<HTMLDivElement | null>(null);
  const scrollArea = useRef<HTMLDivElement | null>(null);
  const entry = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !auth.user) {
        setHistoryError("Entre no CRM para acessar seu histórico.");
        setHistoryLoading(false);
        return;
      }
      const uid = auth.user.id;
      setUserId(uid);
      const { data, error } = await supabase.from("stock_max_searches")
        .select("id,user_id,segmento,source_mode,credito_solicitado,resultados,observacao,created_at")
        .eq("user_id", uid).order("created_at", { ascending: false }).limit(70);
      if (!active) return;
      if (error) setHistoryError("Não foi possível carregar o histórico. Novas buscas podem não ser salvas.");
      else setHistory((data || []) as StoredSearch[]);
      setHistoryLoading(false);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    if (scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
  }, [messages, open]);

  function add(...items: Omit<Message, "id">[]) {
    setMessages((previous) => [...previous, ...items.map((item) => ({ ...item, id: nextId.current++ }))]);
  }

  function newSearch() {
    setActiveHistoryId(null);
    setMessages([OPENING]);
    setSegment(null);
    setInput("");
    setShowMobileHistory(false);
  }

  function selectSegment(value: Segment) {
    setSegment(value);
    setActiveHistoryId(null);
    const label = SEGMENTS.find((s) => s.value === value)?.label || value;
    add({ speaker: "user", text: label }, { speaker: "bot", text: "Ótimo! Qual valor de crédito você procura em " + label + "?" });
    setShowMobileHistory(false);
    window.setTimeout(() => entry.current?.focus(), 0);
  }

  function openPast(search: StoredSearch) {
    const rows = Array.isArray(search.resultados) ? search.resultados : [];
    const alternatives = rows.filter((a) =>
      a && OPTIONS.some((o) => o.type === a.type) && a.offer &&
      Array.isArray(a.offer.ids) && typeof a.offer.credito === "number"
    );
    setSegment(search.segmento);
    setActiveHistoryId(search.id);
    setShowMobileHistory(false);
    setMessages([
      OPENING,
      { id: nextId.current++, speaker: "user", text: search.segmento + " · " + money(search.credito_solicitado) },
      { id: nextId.current++, speaker: "bot", text: "Busca salva em " + timeLabel(search.created_at) + (alternatives.length ? ". Estas foram as alternativas encontradas:" : ". Não havia opções compatíveis."), alternatives, note: "Consulta histórica. Os valores, as parcelas e a disponibilidade podem ter mudado. Confira tudo novamente antes de reservar." },
    ]);
  }

  async function persistSearch(target: number, searchSegment: Segment, alternatives: Alternative[], note: string) {
    if (!userId) {
      setHistoryError("Histórico indisponível: faça login novamente no CRM.");
      return;
    }
    const { data, error } = await supabase.from("stock_max_searches").insert({
      user_id: userId, source_mode: sourceMode, segmento: searchSegment,
      credito_solicitado: target, resultados: alternatives, observacao: note,
    }).select("id,user_id,segmento,source_mode,credito_solicitado,resultados,observacao,created_at").single();
    if (error) {
      setHistoryError("Não foi possível salvar esta busca. Consulte o suporte se continuar.");
    } else if (data) {
      setHistory((previous) => [data as StoredSearch, ...previous].slice(0, 70));
      setActiveHistoryId(data.id);
      setHistoryError("");
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || searching) return;
    setInput("");
    if (!segment) {
      add({ speaker: "bot", text: "Primeiro escolha um segmento acima." });
      return;
    }
    const target = readMaxCredit(text);
    if (!target) {
      add({ speaker: "user", text }, { speaker: "bot", text: "Me diga o crédito desejado. Ex.: 120 mil ou R$ 120.000." });
      return;
    }
    setActiveHistoryId(null);
    setSearching(true);
    try {
      const result = findMaxAlternatives(cotas, segment, target);
      add({ speaker: "user", text });
      let note = "";
      if (!result.alternatives.length) {
        const reason = result.count === 0 ? "Não há cotas disponíveis neste segmento." : "Tente outro valor ou atualize o estoque.";
        note = "Nenhuma composição encontrada no estoque carregado.";
        add({ speaker: "bot", text: "Não encontrei alternativas para " + money(target) + " em " + segment + " com até 10% de diferença e até 3 cotas. " + reason });
      } else {
        note = (result.tolerance > 0.05 ? "Margem de ±10%. " : "Margem de ±5%. ") +
          (result.limited ? "Busca rápida limitada a candidatas prioritárias. " : "") +
          "Saldo nominal estimado pelas parcelas a vencer, sujeito a reajustes e encargos.";
        add({
          speaker: "bot", text: "Encontrei três alternativas para " + money(target) + " em " + segment + ":",
          alternatives: result.alternatives, note: note + " Confirme a disponibilidade antes de reservar.",
        });
      }
      void persistSearch(target, segment, result.alternatives, note);
    } finally {
      setSearching(false);
    }
  }

  const filteredHistory = history.filter((item) => {
    const text = normalize(historyFilter);
    return !text || normalize(item.segmento + " " + item.credito_solicitado + " " + money(item.credito_solicitado)).includes(text);
  });

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]" aria-label="Assistente MAX para contempladas">
      {open ? (
        <section role="dialog" aria-label="MAX — busca de contempladas" className="pointer-events-auto absolute bottom-[86px] right-3 flex h-[min(590px,calc(100dvh-115px))] w-[min(940px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-5">
          <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white" style={{ background: "linear-gradient(108deg,#1E293F,#A11C27)" }}>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white"><MaxDog size={39}/></span>
              <div><p className="text-base font-extrabold tracking-wide">MAX</p><p className="text-[11px] text-white/85">Seu parceiro na busca por contempladas</p></div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={newSearch} className="hidden items-center gap-1 rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold hover:bg-white/15 sm:flex"><Plus className="h-3.5 w-3.5" /> Nova busca</button>
              <button type="button" aria-label="Minimizar MAX" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-white/15"><ChevronDown className="h-4 w-4"/></button>
              <button type="button" aria-label="Fechar MAX" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-white/15"><X className="h-4 w-4"/></button>
            </div>
          </header>
          <div className="flex min-h-0 flex-1">
            <aside aria-label="Histórico das minhas buscas" className={"min-h-0 w-full shrink-0 flex-col border-r border-slate-200 bg-slate-50 md:flex md:w-[21%] " + (showMobileHistory ? "flex" : "hidden")}>
              <div className="border-b border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <strong className="flex items-center gap-1.5 text-xs text-[#1E293F]"><History className="h-4 w-4" /> Meu histórico</strong>
                  <button type="button" className="text-[11px] text-[#A11C27] md:hidden" onClick={() => setShowMobileHistory(false)}>Voltar ao chat</button>
                </div>
                <div className="relative mt-3"><Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input aria-label="Filtrar buscas anteriores" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-7 pr-2 text-xs outline-none focus:border-[#A11C27]" placeholder="Buscar..." value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} />
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
                {historyLoading ? <p className="p-2 text-xs text-slate-500">Carregando histórico...</p> : null}
                {!historyLoading && filteredHistory.length === 0 ? <p className="p-2 text-xs leading-relaxed text-slate-500">Suas buscas aparecerão aqui e ficarão salvas para seu próximo acesso.</p> : null}
                {filteredHistory.map((search) => (
                  <button key={search.id} type="button" onClick={() => openPast(search)}
                    className={"w-full rounded-xl border p-2.5 text-left transition hover:border-[#B5A573] hover:bg-white " + (activeHistoryId === search.id ? "border-[#B5A573] bg-white shadow-sm" : "border-transparent")}>
                    <strong className="block truncate text-xs text-[#1E293F]">{money(search.credito_solicitado)}</strong>
                    <span className="mt-1 block truncate text-[11px] text-slate-600">{search.segmento}</span>
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><Clock3 className="h-3 w-3" /> {timeLabel(search.created_at)}</span>
                  </button>
                ))}
              </div>
              {historyError ? <p role="alert" className="border-t p-2 text-[10px] text-red-700">{historyError}</p> : null}
              <p className="border-t border-slate-200 px-3 py-2 text-[10px] text-slate-500">Privado · vinculado ao seu usuário</p>
            </aside>
            <div className={"min-h-0 min-w-0 flex-1 flex-col " + (showMobileHistory ? "hidden md:flex" : "flex")}>
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-[#FAFAFA] px-3 py-2">
                <div className="flex flex-wrap gap-1.5">
                  {SEGMENTS.map(({ value, label, Icon }) => (
                    <button key={value} type="button" onClick={() => selectSegment(value)} aria-pressed={segment === value}
                      className={"flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition " + (segment === value ? "border-[#A11C27] bg-[#A11C27] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#A11C27]")}>
                      <Icon className="h-4 w-4"/> {label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setShowMobileHistory(true)} aria-label="Ver histórico" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"><History className="h-4 w-4"/></button>
              </div>
              <div ref={scrollArea} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-white p-4" aria-live="polite">
                {messages.map((message) => (
                  <div key={message.id} className={"flex gap-2 " + (message.speaker === "user" ? "justify-end" : "justify-start")}>
                    {message.speaker === "bot" ? <span className="mt-1 h-7 w-7 shrink-0 rounded-full border border-slate-200 bg-white"><MaxDog size={26}/></span> : null}
                    <div className={message.alternatives ? "w-full min-w-0" : "max-w-[85%]"}>
                      <div className={"w-fit max-w-full rounded-2xl px-3 py-2 text-sm leading-relaxed " + (message.speaker === "user" ? "ml-auto rounded-br-md bg-[#A11C27] text-white" : "rounded-bl-md bg-slate-100 text-slate-700")}>{message.text}</div>
                      {message.alternatives && message.alternatives.length ? (
                        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                          {message.alternatives.map((alternative) => (
                            <OfferCard key={alternative.type} alternative={alternative} onDetails={(ids) => { setOpen(false); onOpenCombination(ids); }} />
                          ))}
                        </div>
                      ) : null}
                      {message.note ? <p className="mt-2 flex items-start gap-1 text-[11px] leading-relaxed text-slate-500"><CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />{message.note}</p> : null}
                    </div>
                  </div>
                ))}
                <div ref={listBottom}/>
              </div>
              <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t border-slate-100 bg-white p-3">
                <button type="button" onClick={newSearch} title="Nova busca" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-[#A11C27] hover:bg-slate-50"><Plus className="h-5 w-5"/></button>
                <input ref={entry} value={input} onChange={(e) => setInput(e.target.value)} aria-label="Digite o crédito desejado" placeholder={segment ? "Qual crédito você procura? Ex.: 120 mil" : "Selecione um segmento acima"} disabled={!segment || searching}
                  className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-[#A11C27]" />
                <button type="submit" disabled={!segment || !input.trim() || searching} aria-label="Enviar ao MAX" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#A11C27] text-white disabled:opacity-40">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}
                </button>
              </form>
            </div>
          </div>
        </section>
      ) : null}
      <button type="button" onClick={() => setOpen((wasOpen) => !wasOpen)} aria-label={open ? "Recolher MAX" : "Abrir MAX"} aria-expanded={open}
        className="pointer-events-auto absolute bottom-4 right-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-white bg-[#A11C27] shadow-xl transition hover:scale-105 sm:bottom-5 sm:right-5" title="Fale com MAX">
        <MaxDog size={54}/>
        <span className="absolute -bottom-0.5 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-400"/>
      </button>
      {!open ? <span className="pointer-events-none absolute bottom-[85px] right-[28px] rounded-md bg-[#1E293F] px-2 py-1 text-[10px] font-bold text-white sm:bottom-[90px] sm:right-[31px]">MAX</span> : null}
      <span className="sr-only">Origem do estoque: {sourceMode}</span>
    </div>
  );
}
