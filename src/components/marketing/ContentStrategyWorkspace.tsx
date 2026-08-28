import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  Lightbulb,
  Loader2,
  Pencil,
  RefreshCcw,
  Sparkles,
  Target,
  TestTube2,
  X,
  XCircle,
} from "lucide-react";

type ContentRow = {
  id: string;
  title: string;
  theme: string | null;
  thesis: string | null;
  objective: string | null;
  audience: string | null;
  segment: string | null;
  content_pillar: string | null;
  cta: string | null;
  status: string;
  head_recommendation: string | null;
  ai_context: Record<string, any> | null;
  created_at: string;
};

type VariantRow = {
  id: string;
  content_id: string;
  provider: string;
  format: string;
  title: string | null;
  hook: string | null;
  body: string | null;
  caption: string | null;
  script: string | null;
  cta: string | null;
  creative_brief: string | null;
  duration_seconds: number | null;
  aspect_ratio: string | null;
  status: string;
  ai_generation_metadata: Record<string, any> | null;
  created_at: string;
};

type Props = {
  userId: string | null;
  onNewContent: () => void;
  onChanged?: () => Promise<void> | void;
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
};

const EMPTY_STRATEGY = {
  head_note: "",
  stage: "teste",
  validation_status: "untested",
  organized_idea: {
    audience: "",
    problem: "",
    desire: "",
    transformation: "",
    thesis: "",
    belief: "",
    why_now: "",
    proof: "",
    next_action: "",
    central_phrase: "",
  },
  angle: { type: "", reason: "" },
  classification: { type: "", reason: "" },
  test: {
    provider: "instagram",
    format: "reel",
    objective: "",
    title: "",
    thumb: "",
    on_screen_hook: "",
    cam3c: { convite: "", acordo: "", m1: "", m2: "", m3: "", conclusao: "" },
    full_script: "",
    on_screen_texts: [],
    b_roll: [],
    cta_type: "",
    cta: "",
    caption: "",
    duration_seconds: 45,
    aspect_ratio: "9:16",
  },
  validation: { signals: [], weak: "", promising: "", validated: "" },
  deepening_plan: {},
  derivations: {},
  next_content_recommendation: "",
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function mergeDeep(target: any, source: any): any {
  if (Array.isArray(source)) return source;
  if (!source || typeof source !== "object") return source ?? target;
  const out = { ...(target || {}) };
  Object.keys(source).forEach((key) => {
    out[key] = source[key] && typeof source[key] === "object" && !Array.isArray(source[key])
      ? mergeDeep(out[key], source[key])
      : source[key];
  });
  return out;
}

function formatLabel(value: string) {
  const labels: Record<string, string> = {
    reel: "Reel",
    video: "Vídeo",
    short: "Short",
    carrossel: "Carrossel",
    stories: "Stories",
    post: "Post",
    artigo: "Artigo",
    status: "Status",
  };
  return labels[value] || value;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    ideia: "Em conteúdo",
    rascunho: "Em análise",
    producao: "Em produção",
    aprovacao: "Aprovação final",
    aprovado: "Aprovado",
    rejeitado: "Descartado",
    arquivado: "Arquivado",
    agendado: "Agendado",
    publicado: "Publicado",
  };
  return labels[value] || value;
}

function StatusBadge({ value }: { value: string }) {
  const stronger = value === "producao" || value === "aprovado" || value === "publicado";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${stronger ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#B5A573]/35 bg-[#E0CE8C]/15 text-[#1E293F]"}`}>
      {statusLabel(value)}
    </span>
  );
}

function SectionTitle({ step, title, description }: { step: string; title: string; description?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-[#1E293F] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">{step}</span>
        <h3 className="font-semibold text-[#1E293F]">{title}</h3>
      </div>
      {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
    </div>
  );
}

function Field({ label, value, onChange, rows = 3 }: { label: string; value: any; onChange: (value: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      <Textarea rows={rows} value={String(value || "")} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export default function ContentStrategyWorkspace({ userId, onNewContent, onChanged, onNotice, onError }: Props) {
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(clone(EMPTY_STRATEGY));
  const [revisionInstructions, setRevisionInstructions] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [contentRes, variantRes] = await Promise.all([
        supabase
          .from("marketing_content_items")
          .select("id,title,theme,thesis,objective,audience,segment,content_pillar,cta,status,head_recommendation,ai_context,created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("marketing_content_variants")
          .select("id,content_id,provider,format,title,hook,body,caption,script,cta,creative_brief,duration_seconds,aspect_ratio,status,ai_generation_metadata,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (contentRes.error) throw contentRes.error;
      if (variantRes.error) throw variantRes.error;
      setContents((contentRes.data || []) as ContentRow[]);
      setVariants((variantRes.data || []) as VariantRow[]);
    } catch (err: any) {
      onError?.(err?.message || "Não foi possível carregar a etapa de Conteúdo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selectedContent = useMemo(
    () => contents.find((item) => item.id === selectedContentId) || null,
    [contents, selectedContentId],
  );

  const variantsByContent = useMemo(() => {
    const map = new Map<string, VariantRow[]>();
    variants.forEach((variant) => {
      const list = map.get(variant.content_id) || [];
      list.push(variant);
      map.set(variant.content_id, list);
    });
    return map;
  }, [variants]);

  function getTestVariant(contentId: string) {
    return (variantsByContent.get(contentId) || []).find((variant) =>
      variant.ai_generation_metadata?.motor_version === "content_engine_v2" &&
      variant.ai_generation_metadata?.stage === "teste",
    ) || null;
  }

  function getStrategy(content: ContentRow) {
    return mergeDeep(clone(EMPTY_STRATEGY), content.ai_context?.content_strategy_v2 || {});
  }

  function setPath(path: string[], value: any) {
    setDraft((current: any) => {
      const next = clone(current);
      let cursor = next;
      path.slice(0, -1).forEach((key) => {
        if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
        cursor = cursor[key];
      });
      cursor[path[path.length - 1]] = value;
      return next;
    });
  }

  function openReview(content: ContentRow) {
    setSelectedContentId(content.id);
    setDraft(getStrategy(content));
    setRevisionInstructions("");
  }

  async function callStrategyApi(content: ContentRow, action: "structure" | "revise", current?: any, instructions?: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Entre novamente no CRM.");
    const response = await fetch("/api/marketing/content-strategy", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, content, current_strategy: current || null, instructions: instructions || "" }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) throw new Error(payload?.detail || payload?.message || "Falha ao executar o Motor de Conteúdo.");
    return payload.result;
  }

  function creativeBriefFrom(strategy: any) {
    const test = strategy?.test || {};
    const texts = Array.isArray(test.on_screen_texts) ? test.on_screen_texts.join(" | ") : "";
    const bRoll = Array.isArray(test.b_roll) ? test.b_roll.join(" | ") : "";
    return [
      test.thumb ? `THUMB: ${test.thumb}` : "",
      texts ? `TEXTOS NA TELA: ${texts}` : "",
      bRoll ? `B-ROLL/CORTES: ${bRoll}` : "",
    ].filter(Boolean).join("\n");
  }

  async function persistStrategy(content: ContentRow, strategy: any, createIfMissing = true) {
    if (!userId) throw new Error("Usuário não identificado.");
    const test = strategy?.test || {};
    const currentContext = content.ai_context || {};
    const { error: contentError } = await supabase
      .from("marketing_content_items")
      .update({
        thesis: strategy?.organized_idea?.thesis || content.thesis,
        audience: strategy?.organized_idea?.audience || content.audience,
        objective: test.objective || content.objective,
        cta: test.cta || content.cta,
        head_recommendation: strategy?.head_note || content.head_recommendation,
        ai_context: { ...currentContext, content_strategy_v2: strategy, content_engine_version: 2 },
        updated_at: new Date().toISOString(),
      })
      .eq("id", content.id);
    if (contentError) throw contentError;

    const metadata = {
      motor_version: "content_engine_v2",
      stage: "teste",
      blueprint: test,
      validation: strategy?.validation || {},
      generated_at: new Date().toISOString(),
    };

    const existing = getTestVariant(content.id);
    const row = {
      provider: test.provider || "instagram",
      format: test.format || "reel",
      title: test.title || null,
      hook: test.on_screen_hook || test?.cam3c?.convite || null,
      body: [test?.cam3c?.m1, test?.cam3c?.m2, test?.cam3c?.m3].filter(Boolean).join("\n\n") || null,
      caption: test.caption || null,
      script: test.full_script || null,
      cta: test.cta || null,
      creative_brief: creativeBriefFrom(strategy) || null,
      duration_seconds: Number.isFinite(Number(test.duration_seconds)) ? Number(test.duration_seconds) : null,
      aspect_ratio: test.aspect_ratio || "9:16",
      ai_generation_metadata: metadata,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabase.from("marketing_content_variants").update(row).eq("id", existing.id);
      if (error) throw error;
      return existing.id;
    }

    if (!createIfMissing) return null;
    const { data, error } = await supabase
      .from("marketing_content_variants")
      .insert({
        content_id: content.id,
        ...row,
        status: "rascunho",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async function structureContent(content: ContentRow) {
    setSaving(true);
    try {
      const strategy = await callStrategyApi(content, "structure");
      await persistStrategy(content, strategy, true);
      onNotice?.("O Max estruturou a tese e criou uma peça de teste completa. O aprofundamento ficou planejado para depois da validação.");
      await load();
      await onChanged?.();
      const refreshed = { ...content, ai_context: { ...(content.ai_context || {}), content_strategy_v2: strategy } };
      openReview(refreshed);
    } catch (err: any) {
      onError?.(err?.message || "Erro ao estruturar conteúdo.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!selectedContent) return;
    setSaving(true);
    try {
      await persistStrategy(selectedContent, draft, true);
      onNotice?.("Ajustes editoriais salvos.");
      await load();
      await onChanged?.();
    } catch (err: any) {
      onError?.(err?.message || "Erro ao salvar os ajustes editoriais.");
    } finally {
      setSaving(false);
    }
  }

  async function reviseWithMax() {
    if (!selectedContent || !revisionInstructions.trim()) return;
    setSaving(true);
    try {
      const strategy = await callStrategyApi(selectedContent, "revise", draft, revisionInstructions.trim());
      setDraft(mergeDeep(clone(EMPTY_STRATEGY), strategy));
      setRevisionInstructions("");
      onNotice?.("O Max revisou o conteúdo. Confira as mudanças e salve antes de aprovar.");
    } catch (err: any) {
      onError?.(err?.message || "Erro ao revisar com o Max.");
    } finally {
      setSaving(false);
    }
  }

  async function approveEditorial() {
    if (!selectedContent || !userId) return;
    setSaving(true);
    try {
      const variantId = await persistStrategy(selectedContent, draft, true);
      if (!variantId) throw new Error("Peça de teste não encontrada.");
      const now = new Date().toISOString();
      const { error: variantError } = await supabase.from("marketing_content_variants").update({ status: "producao", updated_at: now }).eq("id", variantId);
      if (variantError) throw variantError;
      const { error: contentError } = await supabase.from("marketing_content_items").update({ status: "producao", approved_by: userId, approved_at: now, updated_at: now }).eq("id", selectedContent.id);
      if (contentError) throw contentError;
      const { error: approvalError } = await supabase.from("marketing_content_approvals").insert({
        variant_id: variantId,
        status: "approved",
        requested_by: userId,
        decided_by: userId,
        requested_at: now,
        decided_at: now,
        decision_note: "Aprovação editorial — Motor de Conteúdo V2 — peça de teste liberada para Produção.",
      });
      if (approvalError) throw approvalError;
      onNotice?.("Conteúdo aprovado editorialmente e enviado para Produção.");
      setSelectedContentId(null);
      await load();
      await onChanged?.();
    } catch (err: any) {
      onError?.(err?.message || "Erro ao aprovar o conteúdo para Produção.");
    } finally {
      setSaving(false);
    }
  }

  async function rejectEditorial() {
    if (!selectedContent || !userId) return;
    const reason = window.prompt("Motivo do descarte/reprovação editorial:", "A tese ou abordagem não deve seguir para produção.");
    if (reason === null) return;
    setSaving(true);
    try {
      const variantId = await persistStrategy(selectedContent, draft, true);
      if (!variantId) throw new Error("Peça de teste não encontrada.");
      const now = new Date().toISOString();
      const { error: variantError } = await supabase.from("marketing_content_variants").update({ status: "rejeitado", updated_at: now }).eq("id", variantId);
      if (variantError) throw variantError;
      const { error: approvalError } = await supabase.from("marketing_content_approvals").insert({
        variant_id: variantId,
        status: "rejected",
        requested_by: userId,
        decided_by: userId,
        requested_at: now,
        decided_at: now,
        decision_note: `Reprovação editorial — ${reason || "sem observação"}`,
      });
      if (approvalError) throw approvalError;
      onNotice?.("Peça de teste descartada. O Conteúdo-Mãe continua disponível para uma nova abordagem.");
      setSelectedContentId(null);
      await load();
      await onChanged?.();
    } catch (err: any) {
      onError?.(err?.message || "Erro ao reprovar o conteúdo.");
    } finally {
      setSaving(false);
    }
  }

  const deepening = draft?.deepening_plan || {};
  const test = draft?.test || EMPTY_STRATEGY.test;
  const organized = draft?.organized_idea || EMPTY_STRATEGY.organized_idea;
  const cam = test?.cam3c || EMPTY_STRATEGY.test.cam3c;

  if (loading) {
    return <div className="flex min-h-[260px] items-center justify-center text-[#1E293F]"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando Conteúdo…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2"><Target className="h-5 w-5 text-[#A11C27]" /><h2 className="text-xl font-semibold text-[#1E293F]">Conteúdo</h2></div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Aqui a ideia vira tese, estratégia e uma peça de teste completa. Você revisa, ajusta e só depois libera para Produção.</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-slate-500">
            <span className="rounded-full bg-[#1E293F] px-2 py-1 text-white">IDEIA</span><ChevronRight className="h-3 w-3" />
            <span className="rounded-full bg-[#A11C27] px-2 py-1 text-white">TESTE</span><ChevronRight className="h-3 w-3" />
            <span>VALIDAÇÃO</span><ChevronRight className="h-3 w-3" /><span>APROFUNDAMENTO</span><ChevronRight className="h-3 w-3" /><span>DISTRIBUIÇÃO</span>
          </div>
        </div>
        <div className="flex gap-2"><Button variant="outline" onClick={load}><RefreshCcw className="mr-2 h-4 w-4" />Atualizar</Button><Button onClick={onNewContent} className="bg-[#A11C27] hover:bg-[#8b1822]"><Lightbulb className="mr-2 h-4 w-4" />Novo conteúdo</Button></div>
      </div>

      <div className="space-y-3">
        {contents.map((content) => {
          const strategy = getStrategy(content);
          const hasStrategy = Boolean(content.ai_context?.content_strategy_v2);
          const testVariant = getTestVariant(content.id);
          const legacyCount = (variantsByContent.get(content.id) || []).filter((variant) => variant.id !== testVariant?.id).length;
          return (
            <Card key={content.id} className="border-[#B5A573]/20 bg-white/95 shadow-sm">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-5xl">
                    <div className="flex flex-wrap items-center gap-2"><p className="text-lg font-semibold text-[#1E293F]">{content.title}</p><StatusBadge value={content.status} />{hasStrategy ? <span className="rounded-full border border-[#A11C27]/20 bg-[#A11C27]/5 px-2 py-1 text-[10px] font-semibold text-[#A11C27]">MOTOR V2</span> : null}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{hasStrategy ? strategy.organized_idea?.central_phrase || strategy.organized_idea?.thesis : content.thesis || content.theme || "Tese ainda não estruturada."}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{hasStrategy ? strategy.organized_idea?.audience || "Público a definir" : content.audience || "Público não definido"}</span>
                      <span>•</span><span>{hasStrategy ? strategy.angle?.type || "Ângulo a definir" : content.content_pillar || "Sem ângulo"}</span>
                      {hasStrategy && strategy.classification?.type ? <><span>•</span><span className="font-semibold text-[#1E293F]">{strategy.classification.type}</span></> : null}
                      {legacyCount ? <><span>•</span><span>{legacyCount} versão(ões) do fluxo anterior preservada(s)</span></> : null}
                    </div>
                    {hasStrategy ? <div className="mt-3 grid gap-2 md:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Problema</p><p className="mt-1 text-xs leading-5 text-[#1E293F]">{strategy.organized_idea?.problem}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Transformação</p><p className="mt-1 text-xs leading-5 text-[#1E293F]">{strategy.organized_idea?.transformation}</p></div><div className="rounded-xl bg-[#E0CE8C]/15 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-[#A11C27]">Peça de teste</p><p className="mt-1 text-xs font-medium text-[#1E293F]">{test?.provider || strategy.test?.provider || "Instagram"} · {formatLabel(strategy.test?.format || "reel")}</p></div></div> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {!hasStrategy ? <Button disabled={saving} onClick={() => structureContent(content)} className="bg-[#1E293F] hover:bg-[#26344f]">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Estruturar conteúdo</Button> : <Button variant="outline" onClick={() => openReview(content)}><FileText className="mr-2 h-4 w-4" />Abrir conteúdo</Button>}
                  </div>
                </div>
                {hasStrategy && testVariant ? <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#B5A573]/25 bg-[#F5F5F5]/60 p-4 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2"><TestTube2 className="h-4 w-4 text-[#A11C27]" /><p className="text-sm font-semibold text-[#1E293F]">Teste inicial · {testVariant.provider} {formatLabel(testVariant.format)}</p><StatusBadge value={testVariant.status} /></div><p className="mt-1 text-xs text-slate-500">{testVariant.hook || testVariant.title || "Roteiro de teste estruturado"}</p></div><Button size="sm" variant="outline" onClick={() => openReview(content)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Revisar roteiro</Button></div> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!contents.length ? <div className="rounded-2xl border border-dashed border-[#B5A573]/40 bg-white p-8 text-center"><p className="font-medium text-[#1E293F]">Nenhum conteúdo para analisar</p><p className="mt-1 text-sm text-slate-500">Transforme uma ideia em Conteúdo-Mãe ou crie um conteúdo manualmente.</p></div> : null}

      {selectedContent ? (
        <div className="fixed inset-0 z-[80] flex items-stretch justify-end bg-[#1E293F]/35 backdrop-blur-[2px]">
          <div className="h-full w-full overflow-y-auto bg-[#F8F8F7] shadow-2xl md:max-w-[980px]">
            <div className="sticky top-0 z-10 border-b border-[#B5A573]/20 bg-white/95 px-5 py-4 backdrop-blur md:px-7">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A11C27]">Cérebro Editorial · Revisão de Conteúdo</p><h2 className="mt-1 text-xl font-semibold text-[#1E293F]">{selectedContent.title}</h2><p className="mt-1 text-xs text-slate-500">Aprovar aqui significa liberar a peça de teste para Produção — não publicar.</p></div>
                <button onClick={() => setSelectedContentId(null)} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="space-y-5 p-5 md:p-7">
              <section className="rounded-2xl border border-[#B5A573]/20 bg-white p-5">
                <SectionTitle step="1" title="Ideia organizada" description="Antes do formato: público, problema, desejo, transformação e tese." />
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Público" value={organized.audience} onChange={(v) => setPath(["organized_idea", "audience"], v)} />
                  <Field label="Problema" value={organized.problem} onChange={(v) => setPath(["organized_idea", "problem"], v)} />
                  <Field label="Desejo" value={organized.desire} onChange={(v) => setPath(["organized_idea", "desire"], v)} />
                  <Field label="Transformação" value={organized.transformation} onChange={(v) => setPath(["organized_idea", "transformation"], v)} />
                  <Field label="Tese central" value={organized.thesis} onChange={(v) => setPath(["organized_idea", "thesis"], v)} rows={4} />
                  <Field label="Crença a reforçar/questionar/substituir" value={organized.belief} onChange={(v) => setPath(["organized_idea", "belief"], v)} rows={4} />
                  <Field label="Por que prestar atenção agora" value={organized.why_now} onChange={(v) => setPath(["organized_idea", "why_now"], v)} />
                  <Field label="Prova / lógica / demonstração" value={organized.proof} onChange={(v) => setPath(["organized_idea", "proof"], v)} />
                  <Field label="Próxima ação desejada" value={organized.next_action} onChange={(v) => setPath(["organized_idea", "next_action"], v)} />
                  <Field label="Ideia central em uma frase" value={organized.central_phrase} onChange={(v) => setPath(["organized_idea", "central_phrase"], v)} />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Ângulo escolhido" value={draft.angle?.type} onChange={(v) => setPath(["angle", "type"], v)} /><Field label="Por que este ângulo" value={draft.angle?.reason} onChange={(v) => setPath(["angle", "reason"], v)} /><Field label="HERO / HUB / HELP" value={draft.classification?.type} onChange={(v) => setPath(["classification", "type"], v)} /><Field label="Justificativa" value={draft.classification?.reason} onChange={(v) => setPath(["classification", "reason"], v)} /></div>
              </section>

              <section className="rounded-2xl border border-[#A11C27]/15 bg-white p-5">
                <SectionTitle step="2" title="Peça de teste — Reel" description="C + A + M1 + M2 + M3 + Conclusão. Esta é a peça que será produzida primeiro." />
                <div className="grid gap-3 md:grid-cols-2"><Field label="Título" value={test.title} onChange={(v) => setPath(["test", "title"], v)} /><Field label="Thumb" value={test.thumb} onChange={(v) => setPath(["test", "thumb"], v)} /><Field label="Gancho na tela" value={test.on_screen_hook} onChange={(v) => setPath(["test", "on_screen_hook"], v)} /><Field label="Objetivo" value={test.objective} onChange={(v) => setPath(["test", "objective"], v)} /></div>
                <div className="mt-4 space-y-3 rounded-2xl bg-[#F5F5F5] p-4"><Field label="C — Convite" value={cam.convite} onChange={(v) => setPath(["test", "cam3c", "convite"], v)} /><Field label="A — Acordo" value={cam.acordo} onChange={(v) => setPath(["test", "cam3c", "acordo"], v)} /><Field label="M1 — Diagnóstico / primeiro ponto" value={cam.m1} onChange={(v) => setPath(["test", "cam3c", "m1"], v)} /><Field label="M2 — Explicação / mecanismo" value={cam.m2} onChange={(v) => setPath(["test", "cam3c", "m2"], v)} /><Field label="M3 — Aplicação / consequência" value={cam.m3} onChange={(v) => setPath(["test", "cam3c", "m3"], v)} /><Field label="C — Conclusão" value={cam.conclusao} onChange={(v) => setPath(["test", "cam3c", "conclusao"], v)} /></div>
                <div className="mt-4 space-y-3"><Field label="Roteiro falado completo" value={test.full_script} onChange={(v) => setPath(["test", "full_script"], v)} rows={10} /><Field label="Textos na tela — um por linha" value={(test.on_screen_texts || []).join("\n")} onChange={(v) => setPath(["test", "on_screen_texts"], v.split("\n").map((x) => x.trim()).filter(Boolean))} rows={5} /><Field label="Cortes / B-roll — um por linha" value={(test.b_roll || []).join("\n")} onChange={(v) => setPath(["test", "b_roll"], v.split("\n").map((x) => x.trim()).filter(Boolean))} rows={5} /><div className="grid gap-3 md:grid-cols-2"><Field label="Tipo de CTA" value={test.cta_type} onChange={(v) => setPath(["test", "cta_type"], v)} /><Field label="CTA" value={test.cta} onChange={(v) => setPath(["test", "cta"], v)} /></div><Field label="Legenda" value={test.caption} onChange={(v) => setPath(["test", "caption"], v)} rows={7} /><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Duração estimada (s)</span><Input type="number" value={test.duration_seconds || ""} onChange={(e) => setPath(["test", "duration_seconds"], Number(e.target.value) || null)} /></label><label><span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Proporção</span><Input value={test.aspect_ratio || "9:16"} onChange={(e) => setPath(["test", "aspect_ratio"], e.target.value)} /></label></div></div>
              </section>

              <section className="rounded-2xl border border-[#B5A573]/20 bg-white p-5">
                <SectionTitle step="3" title="Validação" description="A tese só escala depois de mostrar sinais. Os critérios devem ser comparados ao histórico da própria conta." />
                <div className="flex flex-wrap gap-2">{(draft.validation?.signals || []).map((signal: string) => <span key={signal} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{signal}</span>)}</div>
                <div className="mt-4 grid gap-3 md:grid-cols-3"><Field label="Fraca" value={draft.validation?.weak} onChange={(v) => setPath(["validation", "weak"], v)} rows={5} /><Field label="Promissora" value={draft.validation?.promising} onChange={(v) => setPath(["validation", "promising"], v)} rows={5} /><Field label="Validada" value={draft.validation?.validated} onChange={(v) => setPath(["validation", "validated"], v)} rows={5} /></div>
              </section>

              <section className="rounded-2xl border border-[#B5A573]/20 bg-white p-5">
                <SectionTitle step="4" title="Aprofundamento e distribuição — planejamento" description="Estas peças ainda NÃO estão em produção. Elas mostram como espremer a tese caso o teste seja validado." />
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ["instagram_carousel", "Instagram · Carrossel"],
                    ["instagram_stories", "Instagram · Stories"],
                    ["tiktok", "TikTok"],
                    ["youtube_short", "YouTube · Short"],
                    ["youtube_long", "YouTube · Longo"],
                    ["linkedin", "LinkedIn"],
                    ["whatsapp", "WhatsApp / Status"],
                    ["facebook", "Facebook"],
                  ].map(([key, label]) => {
                    const item = deepening?.[key] || {};
                    const preview = item.title || item.hook || item.angle || item.objective || item.approach || item.reason || "Planejamento disponível";
                    return <div key={key} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-[#1E293F]">{label}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">PÓS-VALIDAÇÃO</span></div><p className="mt-2 text-xs leading-5 text-slate-600">{String(preview)}</p>{Array.isArray(item.cards) ? <p className="mt-2 text-[11px] text-slate-400">{item.cards.length} cards planejados</p> : null}{Array.isArray(item.frames) ? <p className="mt-2 text-[11px] text-slate-400">{item.frames.length} stories planejados</p> : null}{Array.isArray(item.outline) ? <p className="mt-2 text-[11px] text-slate-400">{item.outline.length} blocos de aprofundamento</p> : null}</div>;
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-[#B5A573]/20 bg-white p-5">
                <SectionTitle step="5" title="Derivações e próxima pauta" description="O objetivo é criar um ecossistema ao redor de uma tese forte, não uma sequência de posts desconectados." />
                <div className="grid gap-3 md:grid-cols-2"><Field label="3 novos ganchos — um por linha" value={(draft.derivations?.hooks || []).join("\n")} onChange={(v) => setPath(["derivations", "hooks"], v.split("\n").filter(Boolean))} rows={5} /><Field label="3 perguntas para Stories — uma por linha" value={(draft.derivations?.story_questions || []).join("\n")} onChange={(v) => setPath(["derivations", "story_questions"], v.split("\n").filter(Boolean))} rows={5} /><Field label="Próximo conteúdo recomendado" value={draft.next_content_recommendation} onChange={(v) => setPath(["next_content_recommendation"], v)} rows={5} /><Field label="Nota do Head" value={draft.head_note} onChange={(v) => setPath(["head_note"], v)} rows={5} /></div>
              </section>

              <section className="rounded-2xl border border-[#A11C27]/15 bg-[#A11C27]/[0.03] p-5">
                <SectionTitle step="AJUSTE" title="Pedir uma revisão ao Max" description="Descreva o que você quer mudar. O Max preserva a tese, a menos que você peça explicitamente outra direção." />
                <Textarea rows={4} placeholder="Ex.: O gancho está muito comercial. Quero algo mais provocativo e com linguagem de empresário." value={revisionInstructions} onChange={(e) => setRevisionInstructions(e.target.value)} />
                <div className="mt-3 flex justify-end"><Button variant="outline" disabled={saving || !revisionInstructions.trim()} onClick={reviseWithMax}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Revisar com Max</Button></div>
              </section>
            </div>

            <div className="sticky bottom-0 border-t border-[#B5A573]/20 bg-white/95 px-5 py-4 backdrop-blur md:px-7">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2"><Button variant="outline" disabled={saving} onClick={saveDraft}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}Salvar ajustes</Button><Button variant="outline" disabled={saving} onClick={rejectEditorial} className="border-[#A11C27]/25 text-[#A11C27] hover:bg-[#A11C27]/5"><XCircle className="mr-2 h-4 w-4" />Descartar</Button></div>
                <Button disabled={saving} onClick={approveEditorial} className="bg-[#A11C27] hover:bg-[#8b1822]">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Aprovar para Produção</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
