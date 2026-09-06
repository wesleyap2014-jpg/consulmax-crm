import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Brain, Clock3, Lightbulb, Link as LinkIcon, Radio, Sparkles, Target, X, Zap } from "lucide-react";

type Idea = {
  id: string;
  title: string | null;
  raw_input: string;
  source_type: string;
  source_url?: string | null;
  source_metadata?: Record<string, any> | null;
  status: string;
  created_at: string;
};

type Props = {
  ideas: Idea[];
  saving: boolean;
  onQuickCapture: (text: string) => Promise<void> | void;
  onTransform: (idea: Idea) => Promise<void> | void;
};

type Bucket = "all" | "own" | "operation" | "radar";

const OPERATION_TYPES = new Set([
  "customer", "client", "cliente", "meeting", "reuniao", "reunião", "objection", "objecao", "objeção",
  "sale", "venda", "question", "duvida", "dúvida", "whatsapp", "comment", "comentario", "comentário",
  "operation", "operacao", "operação",
]);

const SOURCE_LABELS: Record<string, string> = {
  manual: "Sua ideia", audio: "Áudio", video: "Vídeo / referência", customer: "Cliente", client: "Cliente",
  cliente: "Cliente", meeting: "Reunião", reuniao: "Reunião", "reunião": "Reunião", objection: "Objeção",
  objecao: "Objeção", "objeção": "Objeção", sale: "Venda", venda: "Venda", question: "Dúvida", duvida: "Dúvida",
  "dúvida": "Dúvida", whatsapp: "WhatsApp", comment: "Comentário", comentario: "Comentário", "comentário": "Comentário",
  operation: "Operação", operacao: "Operação", "operação": "Operação", radar: "Pulso do Radar",
};

function fmtDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function bucketOf(idea: Idea): Exclude<Bucket, "all"> {
  const bucket = String(idea.source_metadata?.idea_bucket || "").toLowerCase();
  const source = String(idea.source_type || "").toLowerCase();
  if (bucket === "radar" || source === "radar") return "radar";
  if (bucket === "operation" || OPERATION_TYPES.has(source)) return "operation";
  return "own";
}

function sourceLabel(idea: Idea) {
  return SOURCE_LABELS[String(idea.source_type || "").toLowerCase()] || idea.source_type || "Ideia";
}

function IdeaCard({ idea, saving, onOpen, onTransform }: { idea: Idea; saving: boolean; onOpen: () => void; onTransform: Props["onTransform"] }) {
  const radarMeta = idea.source_type === "radar" ? (idea.source_metadata || {}) : null;
  const refs = radarMeta && Array.isArray(radarMeta.references) ? radarMeta.references : [];
  const priority = radarMeta ? String(radarMeta.priority || "nova") : "";
  const timingDays = radarMeta ? Number(radarMeta.timing_days || 0) : 0;

  return (
    <Card className={`group overflow-hidden border-[#1E293F]/10 bg-white shadow-[0_10px_30px_rgba(30,41,63,0.05)] transition hover:-translate-y-0.5 hover:border-[#B5A573]/45 hover:shadow-[0_16px_38px_rgba(30,41,63,0.09)] ${radarMeta && priority === "agora" ? "ring-1 ring-[#A11C27]/15" : ""}`}>
      <CardContent className="p-0">
        <button type="button" onClick={onOpen} className="block w-full p-5 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#1E293F]/5 px-2.5 py-1 text-[11px] font-semibold text-[#1E293F]">{sourceLabel(idea)}</span>
                {radarMeta && priority === "agora" ? <span className="rounded-full bg-[#A11C27]/10 px-2.5 py-1 text-[11px] font-semibold text-[#A11C27]">🔥 Agora</span> : null}
                {radarMeta?.consulmax_score ? <span className="rounded-full bg-[#E0CE8C]/20 px-2.5 py-1 text-[11px] font-semibold text-[#1E293F]">Score {Math.round(Number(radarMeta.consulmax_score))}</span> : null}
              </div>
              <h3 className="text-[17px] font-bold leading-snug text-[#1E293F]">{idea.title || "Ideia sem título"}</h3>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{idea.raw_input}</p>
              {radarMeta?.why_now ? <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500"><strong className="text-[#A11C27]">Por que agora:</strong> {String(radarMeta.why_now)}</p> : null}
            </div>
            <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#A11C27]" />
          </div>
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
            <span>{fmtDate(idea.created_at)}</span>
            {timingDays ? <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />até {timingDays} dias</span> : null}
            {refs.length ? <span>{refs.length} referência(s)</span> : null}
          </div>
          <Button size="sm" disabled={saving} onClick={() => onTransform(idea)} className="h-8 bg-[#1E293F] px-3 text-xs hover:bg-[#26344f]">
            Desenvolver <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MarketingIdeaInbox({ ideas, saving, onQuickCapture, onTransform }: Props) {
  const [quickText, setQuickText] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [filter, setFilter] = useState<Bucket>("all");
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);

  const activeIdeas = useMemo(() => ideas.filter((idea) => idea.status !== "converted"), [ideas]);
  const counts = useMemo(() => {
    const result = { all: activeIdeas.length, own: 0, operation: 0, radar: 0 };
    activeIdeas.forEach((idea) => { result[bucketOf(idea)] += 1; });
    return result;
  }, [activeIdeas]);
  const visibleIdeas = useMemo(() => filter === "all" ? activeIdeas : activeIdeas.filter((idea) => bucketOf(idea) === filter), [activeIdeas, filter]);

  async function saveQuick() {
    const text = quickText.trim();
    if (!text || saving || capturing) return;
    setCapturing(true);
    try {
      await onQuickCapture(text);
      setQuickText("");
      setFilter("own");
    } finally {
      setCapturing(false);
    }
  }

  const filterItems: Array<{ key: Bucket; label: string; icon: React.ReactNode; count: number }> = [
    { key: "all", label: "Todas", icon: <Sparkles className="h-4 w-4" />, count: counts.all },
    { key: "own", label: "Suas Ideias", icon: <Lightbulb className="h-4 w-4" />, count: counts.own },
    { key: "operation", label: "Operação", icon: <Target className="h-4 w-4" />, count: counts.operation },
    { key: "radar", label: "Radar", icon: <Radio className="h-4 w-4" />, count: counts.radar },
  ];

  const selectedMeta = selectedIdea?.source_type === "radar" ? (selectedIdea.source_metadata || {}) : null;
  const selectedRefs = selectedMeta && Array.isArray(selectedMeta.references) ? selectedMeta.references : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#B5A573]">Etapa 01 · Descoberta</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1E293F]">Caixa de Ideias</h2>
          <p className="mt-1 text-sm text-slate-500">Aqui ficam somente ideias que ainda não avançaram para Conteúdo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filterItems.map((item) => (
            <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${filter === item.key ? "border-[#1E293F] bg-[#1E293F] text-white shadow-sm" : "border-[#1E293F]/10 bg-white text-slate-600 hover:border-[#B5A573]/50 hover:text-[#1E293F]"}`}>
              {item.icon}<span>{item.label}</span><span className={`rounded-md px-1.5 py-0.5 text-[10px] ${filter === item.key ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_.6fr]">
        <Card className="border-[#1E293F]/10 bg-white shadow-[0_10px_30px_rgba(30,41,63,0.05)]">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-[#E0CE8C]/20 p-2.5 text-[#A11C27]"><Zap className="h-5 w-5" /></div>
              <div className="flex-1">
                <p className="font-bold text-[#1E293F]">⚡ Captura rápida</p>
                <p className="mt-1 text-sm text-slate-500">Teve a ideia? Registre sem interromper o raciocínio. O desenvolvimento acontece depois.</p>
              </div>
            </div>
            <Textarea rows={3} className="mt-4 resize-none border-slate-200 bg-slate-50/60 focus:bg-white" placeholder="Ex.: falar sobre o empresário que compra imóvel à vista e descapitaliza a empresa..." value={quickText} onChange={(event) => setQuickText(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); saveQuick(); } }} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">Ctrl + Enter para guardar</span>
              <Button disabled={!quickText.trim() || saving || capturing} onClick={saveQuick} className="bg-[#1E293F] hover:bg-[#26344f]">{capturing ? "Salvando..." : "Guardar ideia"}</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 bg-[#1E293F] text-white shadow-[0_14px_34px_rgba(30,41,63,0.18)]">
          <CardContent className="relative p-5">
            <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#B5A573]/10" />
            <Brain className="h-6 w-6 text-[#E0CE8C]" />
            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#E0CE8C]">Próxima evolução</p>
            <p className="mt-1 text-lg font-bold">Ideia estruturada</p>
            <p className="mt-2 text-sm leading-6 text-white/70">O espaço estratégico para construir problema, público, tese, posicionamento, intenção, funil e direção criativa.</p>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">Vamos desenhar esta etapa como ferramenta de marketing — não como formulário.</div>
          </CardContent>
        </Card>
      </div>

      {visibleIdeas.length ? (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {visibleIdeas.map((idea) => <IdeaCard key={idea.id} idea={idea} saving={saving} onOpen={() => setSelectedIdea(idea)} onTransform={onTransform} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#B5A573]/40 bg-white px-6 py-10 text-center">
          <Lightbulb className="mx-auto h-7 w-7 text-[#B5A573]" />
          <p className="mt-3 font-semibold text-[#1E293F]">Nenhuma ideia neste filtro</p>
          <p className="mt-1 text-sm text-slate-500">Quando surgir uma nova ideia, ela aparece aqui até ser desenvolvida para Conteúdo.</p>
        </div>
      )}

      {selectedIdea ? (
        <div className="fixed inset-0 z-[80] flex justify-end bg-[#0F172A]/35 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedIdea(null); }}>
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-[#F8F9FB] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#B5A573]">Detalhe da ideia</p><p className="text-sm font-semibold text-[#1E293F]">{sourceLabel(selectedIdea)}</p></div>
              <Button variant="outline" size="icon" onClick={() => setSelectedIdea(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-5 p-5">
              <div className="rounded-2xl border border-[#1E293F]/10 bg-white p-5 shadow-sm">
                <h3 className="text-xl font-bold leading-snug text-[#1E293F]">{selectedIdea.title || "Ideia sem título"}</h3>
                <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-600">{selectedIdea.raw_input}</p>
              </div>

              {selectedMeta ? (
                <div className="rounded-2xl border border-[#B5A573]/25 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap gap-2">
                    {selectedMeta.consulmax_score ? <span className="rounded-full bg-[#E0CE8C]/20 px-2.5 py-1 text-xs font-semibold text-[#1E293F]">Score Consulmax {Math.round(Number(selectedMeta.consulmax_score))}</span> : null}
                    {selectedMeta.stage ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Pulso {String(selectedMeta.stage)}</span> : null}
                    {selectedMeta.timing_days ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Até {Number(selectedMeta.timing_days)} dias</span> : null}
                  </div>
                  {selectedMeta.why_now ? <div className="mt-4 rounded-xl bg-[#E0CE8C]/12 px-3 py-3 text-sm leading-6 text-[#1E293F]"><strong>Por que agora:</strong> {String(selectedMeta.why_now)}</div> : null}
                  <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    {selectedMeta.recommended_format ? <div><span className="text-xs text-slate-400">Formato</span><p className="font-semibold text-[#1E293F]">{String(selectedMeta.recommended_format)}</p></div> : null}
                    {selectedMeta.recommended_hook ? <div><span className="text-xs text-slate-400">Gancho</span><p className="font-semibold text-[#1E293F]">{String(selectedMeta.recommended_hook).replaceAll("_", " ")}</p></div> : null}
                  </div>
                </div>
              ) : null}

              {selectedRefs.length ? (
                <div className="rounded-2xl border border-[#1E293F]/10 bg-white p-5 shadow-sm">
                  <p className="text-sm font-bold text-[#1E293F]">Referências que sustentaram a ideia</p>
                  <div className="mt-3 space-y-2">
                    {selectedRefs.map((ref: any, index: number) => ref?.url ? <a key={`${selectedIdea.id}-drawer-ref-${index}`} href={String(ref.url)} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-[#A11C27] hover:border-[#B5A573]/50 hover:bg-[#E0CE8C]/10"><span className="inline-flex items-center"><LinkIcon className="mr-2 h-4 w-4" />{String(ref.profile || ref.handle || `Referência ${index + 1}`)}</span><ArrowRight className="h-4 w-4" /></a> : null)}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-400">Usamos as referências para ler assunto, abordagem e apetite do mercado — nunca para copiar texto ou criação.</p>
                </div>
              ) : selectedIdea.source_url ? <a href={selectedIdea.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center text-sm font-semibold text-[#A11C27]"><LinkIcon className="mr-2 h-4 w-4" />Abrir referência</a> : null}

              <Button disabled={saving} onClick={() => onTransform(selectedIdea)} className="h-11 w-full bg-[#A11C27] hover:bg-[#8b1822]"><Sparkles className="mr-2 h-4 w-4" />Desenvolver e enviar para Conteúdo</Button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
