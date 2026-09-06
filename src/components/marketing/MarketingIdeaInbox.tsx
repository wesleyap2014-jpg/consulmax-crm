import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Archive, ArrowRight, Brain, Clock3, Lightbulb, Link as LinkIcon, Loader2, MessageSquareText, Radio, RotateCcw, Sparkles, Target, X, Zap } from "lucide-react";

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

type RejectedIdea = {
  id: string;
  idea_id: string;
  idea_snapshot: Record<string, any> | null;
  rejection_reason?: string | null;
  rejected_at: string;
  reactivated_at?: string | null;
};

type Props = {
  ideas: Idea[];
  saving: boolean;
  onQuickCapture: (text: string) => Promise<void> | void;
  onTransform: (idea: Idea) => Promise<void> | void;
  onRefresh: () => Promise<void> | void;
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

const STRUCTURE_FIELDS = [
  ["idea", "IDEIA"],
  ["angle", "ÂNGULO"],
  ["audience", "PÚBLICO"],
  ["objective", "OBJETIVO"],
  ["recommended_format", "FORMATO RECOMENDADO"],
  ["hook", "GANCHO"],
  ["structure", "ESTRUTURA"],
  ["cta", "CTA"],
] as const;

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

function structureOf(idea: Idea | null) {
  if (!idea) return null;
  const meta = idea.source_metadata || {};
  if (meta.idea_structure && typeof meta.idea_structure === "object") return meta.idea_structure as Record<string, any>;
  if (idea.source_type === "radar") {
    return {
      idea: idea.raw_input,
      angle: meta.angle || meta.topic || null,
      audience: meta.audience || null,
      objective: meta.objective || null,
      recommended_format: meta.recommended_format || null,
      hook: meta.recommended_hook || null,
      structure: meta.recommended_structure || null,
      cta: meta.recommended_cta || null,
    };
  }
  return null;
}

function IdeaCard({ idea, saving, onOpen, onTransform }: { idea: Idea; saving: boolean; onOpen: () => void; onTransform: Props["onTransform"] }) {
  const meta = idea.source_metadata || {};
  const radarMeta = idea.source_type === "radar" ? meta : null;
  const refs = Array.isArray(meta.references) ? meta.references : [];
  const priority = radarMeta ? String(radarMeta.priority || "nova") : "";
  const timingDays = radarMeta ? Number(radarMeta.timing_days || 0) : 0;
  const structured = structureOf(idea);

  return (
    <Card className={`group overflow-hidden border-[#1E293F]/10 bg-white shadow-[0_10px_30px_rgba(30,41,63,0.05)] transition hover:-translate-y-0.5 hover:border-[#B5A573]/45 hover:shadow-[0_16px_38px_rgba(30,41,63,0.09)] ${radarMeta && priority === "agora" ? "ring-1 ring-[#A11C27]/15" : ""}`}>
      <CardContent className="p-0">
        <button type="button" onClick={onOpen} className="block w-full p-5 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#1E293F]/5 px-2.5 py-1 text-[11px] font-semibold text-[#1E293F]">{sourceLabel(idea)}</span>
                {structured ? <span className="rounded-full bg-[#E0CE8C]/20 px-2.5 py-1 text-[11px] font-semibold text-[#1E293F]">Max estruturou</span> : null}
                {radarMeta && priority === "agora" ? <span className="rounded-full bg-[#A11C27]/10 px-2.5 py-1 text-[11px] font-semibold text-[#A11C27]">🔥 Agora</span> : null}
                {radarMeta?.consulmax_score ? <span className="rounded-full bg-[#E0CE8C]/20 px-2.5 py-1 text-[11px] font-semibold text-[#1E293F]">Score {Math.round(Number(radarMeta.consulmax_score))}</span> : null}
              </div>
              <h3 className="text-[17px] font-bold leading-snug text-[#1E293F]">{idea.title || "Ideia sem título"}</h3>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{structured?.idea || idea.raw_input}</p>
              {structured?.angle ? <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500"><strong className="text-[#A11C27]">Ângulo:</strong> {String(structured.angle)}</p> : radarMeta?.why_now ? <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500"><strong className="text-[#A11C27]">Por que agora:</strong> {String(radarMeta.why_now)}</p> : null}
            </div>
            <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#A11C27]" />
          </div>
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
            <span>{fmtDate(idea.created_at)}</span>
            {structured?.recommended_format ? <span>{String(structured.recommended_format)}</span> : null}
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

export default function MarketingIdeaInbox({ ideas, saving, onQuickCapture, onTransform, onRefresh }: Props) {
  const [quickText, setQuickText] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [filter, setFilter] = useState<Bucket>("all");
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [adjustment, setAdjustment] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [rejectedIdeas, setRejectedIdeas] = useState<RejectedIdea[]>([]);
  const [loadingArchive, setLoadingArchive] = useState(false);

  const activeIdeas = useMemo(() => ideas.filter((idea) => !["converted", "rejected"].includes(String(idea.status || ""))), [ideas]);
  const counts = useMemo(() => {
    const result = { all: activeIdeas.length, own: 0, operation: 0, radar: 0 };
    activeIdeas.forEach((idea) => { result[bucketOf(idea)] += 1; });
    return result;
  }, [activeIdeas]);
  const visibleIdeas = useMemo(() => filter === "all" ? activeIdeas : activeIdeas.filter((idea) => bucketOf(idea) === filter), [activeIdeas, filter]);

  useEffect(() => {
    if (!selectedIdea) return;
    const refreshed = ideas.find((idea) => idea.id === selectedIdea.id);
    if (refreshed) setSelectedIdea(refreshed);
  }, [ideas, selectedIdea?.id]);

  async function loadRejected() {
    setLoadingArchive(true);
    try {
      const { data, error } = await supabase
        .from("marketing_rejected_ideas")
        .select("id,idea_id,idea_snapshot,rejection_reason,rejected_at,reactivated_at")
        .is("reactivated_at", null)
        .order("rejected_at", { ascending: false });
      if (error) throw error;
      setRejectedIdeas((data || []) as RejectedIdea[]);
    } finally {
      setLoadingArchive(false);
    }
  }

  useEffect(() => {
    loadRejected().catch(() => undefined);
  }, []);

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

  async function requestAdjustment() {
    if (!selectedIdea || !adjustment.trim() || adjusting) return;
    setAdjusting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente no CRM.");
      const currentStructure = structureOf(selectedIdea);
      const response = await fetch("/api/marketing/content-orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "head", idea: selectedIdea.raw_input, current_idea: currentStructure, instructions: adjustment.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.detail || payload?.message || "O Max não conseguiu revisar esta ideia.");
      const result = payload.result || {};
      const metadata = selectedIdea.source_metadata || {};
      const history = Array.isArray(metadata.idea_revision_history) ? metadata.idea_revision_history : [];
      const { error } = await supabase.from("marketing_content_ideas").update({
        title: result.title || selectedIdea.title,
        source_metadata: {
          ...metadata,
          idea_structure: result,
          idea_structure_status: "ready",
          idea_structured_at: new Date().toISOString(),
          idea_revision_history: [...history, { instruction: adjustment.trim(), revised_at: new Date().toISOString() }].slice(-20),
        },
        updated_at: new Date().toISOString(),
      }).eq("id", selectedIdea.id);
      if (error) throw error;
      setAdjustment("");
      await onRefresh();
    } finally {
      setAdjusting(false);
    }
  }

  async function rejectIdea() {
    if (!selectedIdea || rejecting) return;
    setRejecting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id || null;
      const now = new Date().toISOString();
      const snapshot = {
        id: selectedIdea.id,
        title: selectedIdea.title,
        raw_input: selectedIdea.raw_input,
        source_type: selectedIdea.source_type,
        source_url: selectedIdea.source_url || null,
        source_metadata: selectedIdea.source_metadata || {},
        created_at: selectedIdea.created_at,
      };
      const { error: archiveError } = await supabase.from("marketing_rejected_ideas").insert({
        idea_id: selectedIdea.id,
        idea_snapshot: snapshot,
        rejected_by: userId,
        rejected_at: now,
      });
      if (archiveError) throw archiveError;
      const { error: updateError } = await supabase.from("marketing_content_ideas").update({
        status: "rejected",
        source_metadata: { ...(selectedIdea.source_metadata || {}), rejected_at: now },
        updated_at: now,
      }).eq("id", selectedIdea.id);
      if (updateError) throw updateError;
      setSelectedIdea(null);
      await Promise.all([onRefresh(), loadRejected()]);
    } finally {
      setRejecting(false);
    }
  }

  async function reactivateIdea(item: RejectedIdea) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id || null;
    const now = new Date().toISOString();
    const snapshot = item.idea_snapshot || {};
    const { error: ideaError } = await supabase.from("marketing_content_ideas").update({
      status: "inbox",
      source_metadata: { ...(snapshot.source_metadata || {}), reactivated_at: now },
      updated_at: now,
    }).eq("id", item.idea_id);
    if (ideaError) throw ideaError;
    const { error: archiveError } = await supabase.from("marketing_rejected_ideas").update({
      reactivated_at: now,
      reactivated_by: userId,
      updated_at: now,
    }).eq("id", item.id);
    if (archiveError) throw archiveError;
    await Promise.all([onRefresh(), loadRejected()]);
  }

  const filterItems: Array<{ key: Bucket; label: string; icon: React.ReactNode; count: number }> = [
    { key: "all", label: "Todas", icon: <Sparkles className="h-4 w-4" />, count: counts.all },
    { key: "own", label: "Suas Ideias", icon: <Lightbulb className="h-4 w-4" />, count: counts.own },
    { key: "operation", label: "Operação", icon: <Target className="h-4 w-4" />, count: counts.operation },
    { key: "radar", label: "Radar", icon: <Radio className="h-4 w-4" />, count: counts.radar },
  ];

  const selectedMeta = selectedIdea?.source_metadata || null;
  const selectedRefs = selectedMeta && Array.isArray(selectedMeta.references) ? selectedMeta.references : [];
  const selectedStructure = structureOf(selectedIdea);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#B5A573]">Etapa 01 · Descoberta</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1E293F]">Caixa de Ideias</h2>
          <p className="mt-1 text-sm text-slate-500">Capture rápido. O Max organiza. Você ajusta, aprova para Conteúdo ou reprova.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filterItems.map((item) => (
            <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${filter === item.key ? "border-[#1E293F] bg-[#1E293F] text-white shadow-sm" : "border-[#1E293F]/10 bg-white text-slate-600 hover:border-[#B5A573]/50 hover:text-[#1E293F]"}`}>
              {item.icon}<span>{item.label}</span><span className={`rounded-md px-1.5 py-0.5 text-[10px] ${filter === item.key ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      <Card className="border-[#1E293F]/10 bg-white shadow-[0_10px_30px_rgba(30,41,63,0.05)]">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[#E0CE8C]/20 p-2.5 text-[#A11C27]"><Zap className="h-5 w-5" /></div>
            <div className="flex-1">
              <p className="font-bold text-[#1E293F]">⚡ Captura rápida</p>
              <p className="mt-1 text-sm text-slate-500">Escreva do seu jeito. Ao guardar, o Max já organiza a pauta em ideia, ângulo, público, objetivo, formato, gancho, estrutura e CTA.</p>
            </div>
          </div>
          <Textarea rows={3} className="mt-4 resize-none border-slate-200 bg-slate-50/60 focus:bg-white" placeholder="Ex.: falar sobre o empresário que compra imóvel à vista e descapitaliza a empresa..." value={quickText} onChange={(event) => setQuickText(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); saveQuick(); } }} />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">Ctrl + Enter para guardar e organizar</span>
            <Button disabled={!quickText.trim() || saving || capturing} onClick={saveQuick} className="bg-[#1E293F] hover:bg-[#26344f]">{capturing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Max organizando...</> : <>Guardar ideia <Sparkles className="ml-2 h-4 w-4" /></>}</Button>
          </div>
        </CardContent>
      </Card>

      {visibleIdeas.length ? (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {visibleIdeas.map((idea) => <IdeaCard key={idea.id} idea={idea} saving={saving} onOpen={() => { setSelectedIdea(idea); setAdjustment(""); }} onTransform={onTransform} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#B5A573]/40 bg-white px-6 py-10 text-center">
          <Lightbulb className="mx-auto h-7 w-7 text-[#B5A573]" />
          <p className="mt-3 font-semibold text-[#1E293F]">Nenhuma ideia neste filtro</p>
          <p className="mt-1 text-sm text-slate-500">Quando surgir uma nova ideia, ela aparece aqui até ser desenvolvida para Conteúdo.</p>
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={async () => { const next = !archiveOpen; setArchiveOpen(next); if (next) await loadRejected(); }} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-400 transition hover:bg-white hover:text-slate-600">
          <Archive className="h-3.5 w-3.5" />Ideias reprovadas {rejectedIdeas.length ? `· ${rejectedIdeas.length}` : ""}
        </button>
      </div>

      {archiveOpen ? (
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
          <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold text-[#1E293F]">Arquivo de ideias reprovadas</p><p className="text-xs text-slate-400">Fica fora da esteira. Reative somente quando quiser devolver a pauta para Ideias.</p></div><Button size="sm" variant="outline" onClick={() => setArchiveOpen(false)}>Ocultar</Button></div>
          {loadingArchive ? <div className="flex items-center py-5 text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando arquivo...</div> : rejectedIdeas.length ? <div className="grid gap-2 md:grid-cols-2">{rejectedIdeas.map((item) => { const snapshot = item.idea_snapshot || {}; return <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-sm font-semibold text-[#1E293F]">{snapshot.title || "Ideia reprovada"}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{snapshot.source_metadata?.idea_structure?.idea || snapshot.raw_input || "—"}</p><div className="mt-3 flex items-center justify-between gap-2"><span className="text-[10px] text-slate-400">{fmtDate(item.rejected_at)}</span><Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => reactivateIdea(item)}><RotateCcw className="mr-1.5 h-3 w-3" />Reativar</Button></div></div>; })}</div> : <p className="py-4 text-sm text-slate-400">Nenhuma ideia reprovada.</p>}
        </div>
      ) : null}

      {selectedIdea ? (
        <div className="fixed inset-0 z-[80] flex justify-end bg-[#0F172A]/35 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedIdea(null); }}>
          <aside className="h-full w-full max-w-2xl overflow-y-auto bg-[#F8F9FB] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#B5A573]">Ideia organizada pelo Max</p><p className="text-sm font-semibold text-[#1E293F]">{sourceLabel(selectedIdea)}</p></div>
              <Button variant="outline" size="icon" onClick={() => setSelectedIdea(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-5 p-5">
              <div className="rounded-2xl border border-[#1E293F]/10 bg-white p-5 shadow-sm">
                <h3 className="text-xl font-bold leading-snug text-[#1E293F]">{selectedIdea.title || "Ideia sem título"}</h3>
                <p className="mt-2 text-xs text-slate-400">Original: {selectedIdea.raw_input}</p>
              </div>

              {selectedStructure ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {STRUCTURE_FIELDS.map(([key, label]) => <div key={key} className={`rounded-2xl border border-[#1E293F]/10 bg-white p-4 shadow-sm ${key === "idea" || key === "structure" ? "sm:col-span-2" : ""}`}><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#B5A573]">{label}</p><p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-[#1E293F]">{selectedStructure[key] ? String(selectedStructure[key]).replaceAll("_", " ") : "A definir"}</p></div>)}
                </div>
              ) : <div className="rounded-2xl border border-dashed border-[#B5A573]/40 bg-white p-5 text-sm text-slate-500">Esta ideia ainda não tem estrutura do Max. Ao solicitar um ajuste, o Max também fará a primeira organização completa.</div>}

              {selectedMeta?.head_recommendation || selectedStructure?.head_recommendation ? <div className="rounded-2xl border border-[#B5A573]/25 bg-[#E0CE8C]/10 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#A11C27]">Direção do Head</p><p className="mt-2 text-sm leading-6 text-[#1E293F]">{String(selectedStructure?.head_recommendation || selectedMeta?.head_recommendation)}</p></div> : null}

              {selectedRefs.length ? (
                <div className="rounded-2xl border border-[#1E293F]/10 bg-white p-5 shadow-sm">
                  <p className="text-sm font-bold text-[#1E293F]">Referências que sustentaram a ideia</p>
                  <div className="mt-3 space-y-2">
                    {selectedRefs.map((ref: any, index: number) => ref?.url ? <a key={`${selectedIdea.id}-drawer-ref-${index}`} href={String(ref.url)} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-[#A11C27] hover:border-[#B5A573]/50 hover:bg-[#E0CE8C]/10"><span className="inline-flex items-center"><LinkIcon className="mr-2 h-4 w-4" />{String(ref.profile || ref.handle || `Referência ${index + 1}`)}</span><ArrowRight className="h-4 w-4" /></a> : null)}
                  </div>
                </div>
              ) : selectedIdea.source_url ? <a href={selectedIdea.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center text-sm font-semibold text-[#A11C27]"><LinkIcon className="mr-2 h-4 w-4" />Abrir referência</a> : null}

              <div className="rounded-2xl border border-[#1E293F]/10 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3"><div className="rounded-xl bg-[#1E293F]/5 p-2 text-[#1E293F]"><MessageSquareText className="h-4 w-4" /></div><div><p className="text-sm font-bold text-[#1E293F]">Quer mudar alguma coisa?</p><p className="mt-1 text-xs leading-5 text-slate-500">Escreva como você quer reposicionar a ideia. O Max recebe a versão atual, processa seu pedido e refaz a estrutura.</p></div></div>
                <Textarea rows={4} className="mt-4" placeholder="Ex.: quero um ângulo menos comercial e mais provocativo; foque em empresários que têm caixa disponível..." value={adjustment} onChange={(event) => setAdjustment(event.target.value)} />
                <div className="mt-3 flex justify-end"><Button variant="outline" disabled={!adjustment.trim() || adjusting} onClick={requestAdjustment}>{adjusting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Max revisando...</> : <><Sparkles className="mr-2 h-4 w-4" />Solicitar ajustes</>}</Button></div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Button disabled={saving || adjusting || rejecting} onClick={() => onTransform(selectedIdea)} className="h-11 bg-[#A11C27] hover:bg-[#8b1822]"><Sparkles className="mr-2 h-4 w-4" />Desenvolver e Enviar para Conteúdo</Button>
                <Button variant="outline" disabled={saving || adjusting || rejecting} onClick={rejectIdea} className="h-11 border-slate-300 text-slate-500 hover:border-[#A11C27]/30 hover:bg-[#A11C27]/5 hover:text-[#A11C27]">{rejecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}Reprovar</Button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
