import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Link as LinkIcon, Sparkles, Zap } from "lucide-react";

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

const OPERATION_TYPES = new Set([
  "customer",
  "client",
  "cliente",
  "meeting",
  "reuniao",
  "reunião",
  "objection",
  "objecao",
  "objeção",
  "sale",
  "venda",
  "question",
  "duvida",
  "dúvida",
  "whatsapp",
  "comment",
  "comentario",
  "comentário",
  "operation",
  "operacao",
  "operação",
]);

const SOURCE_LABELS: Record<string, string> = {
  manual: "Sua ideia",
  audio: "Áudio",
  video: "Vídeo / referência",
  customer: "Cliente",
  client: "Cliente",
  cliente: "Cliente",
  meeting: "Reunião",
  reuniao: "Reunião",
  "reunião": "Reunião",
  objection: "Objeção",
  objecao: "Objeção",
  "objeção": "Objeção",
  sale: "Venda",
  venda: "Venda",
  question: "Dúvida",
  duvida: "Dúvida",
  "dúvida": "Dúvida",
  whatsapp: "WhatsApp",
  comment: "Comentário",
  comentario: "Comentário",
  "comentário": "Comentário",
  operation: "Operação",
  operacao: "Operação",
  "operação": "Operação",
  radar: "Pulso do Radar",
};

function fmtDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function Status({ value }: { value: string }) {
  const label = value === "converted" ? "Convertida" : value === "inbox" ? "Caixa de ideias" : value;
  return <span className="inline-flex shrink-0 rounded-full border border-[#B5A573]/35 bg-[#E0CE8C]/15 px-2.5 py-1 text-xs font-medium text-[#1E293F]">{label}</span>;
}

function IdeaCard({ idea, saving, onTransform }: { idea: Idea; saving: boolean; onTransform: Props["onTransform"] }) {
  const radarMeta = idea.source_type === "radar" ? (idea.source_metadata || {}) : null;
  const references = radarMeta && Array.isArray(radarMeta.references) ? radarMeta.references : [];
  const timingDays = radarMeta ? Number(radarMeta.timing_days || 0) : 0;
  const priority = radarMeta ? String(radarMeta.priority || "nova") : "";
  const sourceLabel = SOURCE_LABELS[String(idea.source_type || "").toLowerCase()] || idea.source_type || "Ideia";

  return (
    <Card className={`border-[#B5A573]/20 ${radarMeta && priority === "agora" ? "ring-1 ring-[#A11C27]/20" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {radarMeta ? (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${priority === "agora" ? "bg-[#A11C27]/10 text-[#A11C27]" : "bg-[#E0CE8C]/20 text-[#1E293F]"}`}>
                  {priority === "agora" ? "🔥 Agora" : "✨ Nova do Radar"}
                </span>
                {radarMeta.consulmax_score ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">Score Consulmax {Math.round(Number(radarMeta.consulmax_score))}</span> : null}
                {timingDays ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">Produzir em até {timingDays} dias</span> : null}
              </div>
            ) : null}

            <p className="font-semibold text-[#1E293F]">{idea.title || "Ideia sem título"}</p>
            {radarMeta?.why_now ? <div className="mt-2 rounded-xl bg-[#E0CE8C]/12 px-3 py-2 text-sm text-[#1E293F]"><strong>Por que agora:</strong> {String(radarMeta.why_now)}</div> : null}
            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{idea.raw_input}</p>

            {radarMeta ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                {radarMeta.recommended_format ? <span>Formato: <strong className="text-[#1E293F]">{String(radarMeta.recommended_format)}</strong></span> : null}
                {radarMeta.recommended_hook ? <span>• Gancho: <strong className="text-[#1E293F]">{String(radarMeta.recommended_hook).replaceAll("_", " ")}</strong></span> : null}
                {radarMeta.stage ? <span>• Pulso: <strong className="text-[#1E293F]">{String(radarMeta.stage)}</strong></span> : null}
              </div>
            ) : null}

            {references.length ? (
              <div className="mt-4 rounded-xl border border-[#B5A573]/20 bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Referências do Radar</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {references.map((ref: any, index: number) => ref?.url ? (
                    <a key={`${idea.id}-ref-${index}`} href={String(ref.url)} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-[#B5A573]/25 bg-white px-2.5 py-1.5 text-xs font-medium text-[#A11C27] hover:bg-[#E0CE8C]/10">
                      <LinkIcon className="mr-1.5 h-3.5 w-3.5" />{String(ref.profile || ref.handle || `Referência ${index + 1}`)}
                    </a>
                  ) : null)}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">Referência de sinal, formato e abordagem — nunca para copiar criação, texto ou roteiro.</p>
              </div>
            ) : idea.source_url ? (
              <a href={idea.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center text-xs font-medium text-[#A11C27]">
                <LinkIcon className="mr-1.5 h-3.5 w-3.5" />Abrir referência
              </a>
            ) : null}
          </div>
          <Status value={idea.status} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-400">{sourceLabel} · {fmtDate(idea.created_at)}</span>
          {idea.status !== "converted" ? (
            <Button size="sm" disabled={saving} onClick={() => onTransform(idea)} className="bg-[#A11C27] hover:bg-[#8b1822]">
              <Sparkles className="mr-1.5 h-4 w-4" />Transformar com Max
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function IdeaSection({ title, description, ideas, saving, onTransform }: { title: string; description: string; ideas: Idea[]; saving: boolean; onTransform: Props["onTransform"] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[#1E293F]">{title}</h3>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">{ideas.length}</span>
      </div>
      {ideas.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} saving={saving} onTransform={onTransform} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#B5A573]/35 bg-white/60 px-5 py-6 text-sm text-slate-500">Nenhuma ideia neste bloco ainda.</div>
      )}
    </section>
  );
}

export default function MarketingIdeaInbox({ ideas, saving, onQuickCapture, onTransform }: Props) {
  const [quickText, setQuickText] = useState("");
  const [capturing, setCapturing] = useState(false);

  const groups = useMemo(() => {
    const own: Idea[] = [];
    const operation: Idea[] = [];
    const radar: Idea[] = [];

    for (const idea of ideas) {
      const bucket = String(idea.source_metadata?.idea_bucket || "").toLowerCase();
      const source = String(idea.source_type || "").toLowerCase();
      if (bucket === "radar" || source === "radar") radar.push(idea);
      else if (bucket === "operation" || OPERATION_TYPES.has(source)) operation.push(idea);
      else own.push(idea);
    }
    return { own, operation, radar };
  }, [ideas]);

  async function saveQuick() {
    const text = quickText.trim();
    if (!text || saving || capturing) return;
    setCapturing(true);
    try {
      await onQuickCapture(text);
      setQuickText("");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#1E293F]">Caixa de Ideias</h2>
        <p className="text-sm text-slate-500">Três fontes de inteligência editorial: o que você pensa, o que a operação ensina e o que o mercado sinaliza.</p>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.25fr_.75fr]">
        <Card className="border-[#B5A573]/25 bg-white">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-[#E0CE8C]/20 p-2 text-[#A11C27]"><Zap className="h-5 w-5" /></div>
              <div className="flex-1">
                <p className="font-semibold text-[#1E293F]">⚡ Captura rápida</p>
                <p className="mt-1 text-sm text-slate-500">Teve a ideia? Jogue aqui em poucos segundos. Sem briefing e sem formulário.</p>
              </div>
            </div>
            <Textarea
              rows={3}
              className="mt-4 resize-none"
              placeholder="Ex.: falar sobre o empresário que compra imóvel à vista e descapitaliza a empresa..."
              value={quickText}
              onChange={(event) => setQuickText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  saveQuick();
                }
              }}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">Ctrl + Enter para salvar</span>
              <Button disabled={!quickText.trim() || saving || capturing} onClick={saveQuick} className="bg-[#1E293F] hover:bg-[#26344f]">
                {capturing ? "Salvando..." : "Guardar ideia"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#B5A573]/20 bg-[#1E293F] text-white">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#E0CE8C]">Próxima etapa</p>
            <p className="mt-2 text-lg font-semibold">🧠 Ideia estruturada</p>
            <p className="mt-2 text-sm text-white/70">Aqui vamos construir o raciocínio de marketing de verdade: problema, público, tese, posicionamento, intenção, funil e estratégia criativa — sem transformar isso num formulário burocrático.</p>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">Estrutura reservada para desenharmos juntos na próxima etapa.</div>
          </CardContent>
        </Card>
      </div>

      <IdeaSection title="💡 Suas Ideias" description="O que você pensou." ideas={groups.own} saving={saving} onTransform={onTransform} />
      <IdeaSection title="🎯 Ideias da operação" description="Clientes, objeções, reuniões, vendas e dúvidas que podem virar conteúdo." ideas={groups.operation} saving={saving} onTransform={onTransform} />
      <IdeaSection title="📡 Ideias do Radar" description="Mercado, concorrentes, tendências e sinais do Pulso." ideas={groups.radar} saving={saving} onTransform={onTransform} />
    </div>
  );
}
