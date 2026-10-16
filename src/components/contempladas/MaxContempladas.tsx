import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, CarFront, CircleAlert, ChevronDown, House, Loader2, Bike, Send, Truck, X } from "lucide-react";

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

export default function MaxContempladas({ cotas, sourceMode, onOpenCombination }: {
  cotas: MaxCota[];
  sourceMode: "externo" | "crm";
  onOpenCombination: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [segment, setSegment] = useState<Segment | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ id: 1, speaker: "bot", text: "Olá! Sou o MAX. Em qual segmento você quer encontrar cartas contempladas?" }]);
  const [searching, setSearching] = useState(false);
  const nextId = useRef(2);
  const bottom = useRef<HTMLDivElement | null>(null);
  const entry = useRef<HTMLInputElement | null>(null);
  const availableCount = useMemo(() => cotas.filter((r) => r.status === "disponivel").length, [cotas]);

  useEffect(() => { if (open) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, open]);

  function add(...items: Omit<Message, "id">[]) {
    setMessages((previous) => [...previous, ...items.map((item) => ({ ...item, id: nextId.current++ }))]);
  }

  function selectSegment(value: Segment) {
    setSegment(value);
    const label = SEGMENTS.find((s) => s.value === value)?.label || value;
    add({ speaker: "user", text: label }, { speaker: "bot", text: "Qual valor de crédito você procura em " + label + "?" });
    window.setTimeout(() => entry.current?.focus(), 0);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || searching) return;
    setInput("");
    if (!segment) {
      add({ speaker: "user", text }, { speaker: "bot", text: "Primeiro escolha um segmento acima." });
      return;
    }
    const target = readMaxCredit(text);
    if (!target) {
      add({ speaker: "user", text }, { speaker: "bot", text: "Me diga o crédito desejado, por exemplo: 120 mil ou R$ 120.000." });
      return;
    }
    setSearching(true);
    const result = findMaxAlternatives(cotas, segment, target);
    add({ speaker: "user", text });
    if (!result.alternatives.length) {
      const reason = result.count === 0 ? "Não há cotas disponíveis deste segmento no estoque atual." : "Tente outro valor ou atualize o estoque.";
      add({ speaker: "bot", text: "Não encontrei alternativas para " + money(target) + " em " + segment + " com até 10% de diferença e até 3 cotas. " + reason });
    } else {
      const margin = result.tolerance > 0.05 ? "Ampliei a busca para ±10%. " : "Créditos dentro de ±5% do pedido. ";
      const limit = result.limited ? "A busca usa uma amostra priorizada por compatibilidade e pode não encontrar todas as junções. " : "";
      add({
        speaker: "bot",
        text: "Encontrei estas 3 alternativas para " + money(target) + " em " + segment + ":",
        alternatives: result.alternatives,
        note: margin + limit + "*Saldo estimado pela soma nominal das parcelas a vencer, sujeito a reajustes, seguros e taxas. Confirme valores e disponibilidade antes da reserva.",
      });
    }
    setSearching(false);
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]" aria-label="Assistente MAX para contempladas">
      {open ? (
        <section role="dialog" aria-label="Conversa com MAX" className="pointer-events-auto absolute bottom-[86px] right-3 flex h-[min(690px,calc(100dvh-105px))] max-h-[calc(100dvh-105px)] w-[min(440px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-5">
          <header className="flex shrink-0 items-center justify-between gap-3 p-3 text-white" style={{ background: "linear-gradient(115deg,#1E293F,#A11C27)" }}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white text-[#A11C27]"><Bot className="h-5 w-5" /></span>
              <div><p className="text-sm font-extrabold tracking-wide">MAX</p><p className="text-[11px] text-white/80">Seu especialista em contempladas</p></div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Minimizar MAX" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-white/15"><ChevronDown className="h-4 w-4" /></button>
              <button type="button" aria-label="Fechar MAX" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-white/15"><X className="h-4 w-4" /></button>
            </div>
          </header>
          <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-3 py-2">
            <p className="mb-2 text-[11px] font-semibold text-slate-600">Escolha o segmento:</p>
            <div className="grid grid-cols-4 gap-1.5">
              {SEGMENTS.map(({ value, label, Icon }) => (
                <button key={value} type="button" onClick={() => selectSegment(value)} aria-pressed={segment === value}
                  className={"flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-[10px] font-semibold transition " + (segment === value ? "border-[#A11C27] bg-[#A11C27] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#A11C27]")}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-white px-3 py-4" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={"flex " + (message.speaker === "user" ? "justify-end" : "justify-start")}>
                <div className={message.alternatives ? "w-full" : "max-w-[85%]"}>
                  <div className={"rounded-2xl px-3 py-2 text-[13px] leading-relaxed " + (message.speaker === "user" ? "rounded-br-md bg-[#A11C27] text-white" : "rounded-bl-md bg-slate-100 text-slate-700")}>{message.text}</div>
                  {message.alternatives ? (
                    <div className="mt-2 space-y-2">
                      {message.alternatives.map((alternative) => (
                        <OfferCard key={alternative.type} alternative={alternative} onDetails={(ids) => { setOpen(false); onOpenCombination(ids); }} />
                      ))}
                      {message.note ? <p className="flex items-start gap-1 text-[10px] leading-relaxed text-slate-500"><CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />{message.note}</p> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            <div ref={bottom} />
          </div>
          <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t border-slate-100 bg-white p-3">
            <input ref={entry} value={input} onChange={(e) => setInput(e.target.value)} aria-label="Digite o crédito desejado"
              placeholder={segment ? "Ex.: 120 mil" : "Selecione o segmento acima"} disabled={!segment || searching}
              className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-[#A11C27]" />
            <button type="submit" disabled={!segment || !input.trim() || searching} aria-label="Enviar ao MAX" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#A11C27] text-white disabled:opacity-40">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </section>
      ) : null}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? "Recolher MAX" : "Abrir MAX"} aria-expanded={open}
        className="pointer-events-auto absolute bottom-4 right-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-[#A11C27] text-white shadow-xl transition hover:scale-105 sm:bottom-5 sm:right-5" title="Fale com MAX">
        <Bot className="h-7 w-7" />
        <span className="absolute -bottom-0.5 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
      </button>
      {!open ? <span className="pointer-events-none absolute bottom-[75px] right-[25px] rounded-md bg-[#1E293F] px-2 py-1 text-[10px] font-bold text-white sm:bottom-[80px] sm:right-[30px]">MAX</span> : null}
      {availableCount === 0 && open ? <span className="sr-only">Estoque sem cotas disponíveis</span> : null}
      <span className="sr-only">Origem do estoque: {sourceMode}</span>
    </div>
  );
}
