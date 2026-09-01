import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { jsPDF } from "jspdf";
import {
  CheckCircle2,
  Clipboard,
  Download,
  Loader2,
  Palette,
  RefreshCcw,
  Send,
  Sparkles,
  Unplug,
  UploadCloud,
  WandSparkles,
} from "lucide-react";

type VisualPromptPackage = {
  revision: number;
  generated_at: string;
  format: string;
  provider: string;
  dimensions: { width: number; height: number; ratio: string; label: string };
  total_items: number;
  identity: { name: string; colors: string[]; fonts: string; slogan: string; style: string };
  canva: {
    max_images_per_prompt: number;
    batch_count: number;
    prompts: Array<{ index: number; from_item: number; to_item: number; image_count: number; char_count: number; prompt: string }>;
  };
  firefly: {
    strategy: string;
    compact_target: number;
    prompts: Array<{ index: number; char_count: number; compact_target: number; prompt: string }>;
  };
  creative_spec: any;
};

type CanvaStatus = {
  configured: boolean;
  missing: string[];
  callback_url: string;
  connection: any | null;
};

type Props = {
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
  onChanged?: () => Promise<void> | void;
};

const CONTENT_BUCKET = "marketing-content-assets";
const FINAL_ROLES = ["carousel_card", "story_frame", "status_frame", "post_image", "thumbnail", "final_video"];

async function authFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente no CRM.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.message || payload?.detail || "Falha na operação.") as Error & { payload?: any };
    error.payload = payload;
    throw error;
  }
  return payload;
}

function safeName(value: string) {
  return String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function outputRole(format: string) {
  if (format === "carrossel") return "carousel_card";
  if (format === "stories") return "story_frame";
  if (format === "status") return "status_frame";
  if (["reel", "short", "youtube_long", "video"].includes(format)) return "thumbnail";
  return "post_image";
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

export function CanvaProductionStatusBar({ onNotice, onError, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<CanvaStatus | null>(null);

  async function load() {
    setLoading(true);
    try {
      setStatus(await authFetch("/api/marketing/canva-connect"));
    } catch (error: any) {
      onError?.(error?.message || "Erro ao carregar a conexão Canva.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function connect() {
    setBusy(true);
    try {
      const payload = await authFetch("/api/marketing/canva-connect", {
        method: "POST",
        body: JSON.stringify({ action: "connect" }),
      });
      if (!payload.auth_url) throw new Error("O Canva não retornou a URL de autorização.");
      window.location.href = payload.auth_url;
    } catch (error: any) {
      onError?.(error?.message || "Não foi possível conectar o Canva.");
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Desconectar o Canva do CRM? Os designs existentes não serão apagados.")) return;
    setBusy(true);
    try {
      await authFetch("/api/marketing/canva-connect", {
        method: "POST",
        body: JSON.stringify({ action: "disconnect" }),
      });
      onNotice?.("Canva desconectado. O Estúdio de Prompts continua funcionando normalmente.");
      await load();
      await onChanged?.();
    } catch (error: any) {
      onError?.(error?.message || "Erro ao desconectar o Canva.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-[#B5A573]/25 bg-white p-4 text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando estúdio visual…</div>;
  }

  const connected = status?.connection?.status === "connected";

  return (
    <div className="rounded-2xl border border-[#1E293F]/15 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#1E293F] p-2 text-white"><Palette className="h-5 w-5" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[#1E293F]">Max · Estúdio de Prompts Visuais</p>
              <span className="rounded-full bg-[#E0CE8C]/25 px-2 py-0.5 text-[10px] font-semibold text-[#1E293F]">IDENTIDADE FIXA · COMPOSIÇÃO VARIÁVEL</span>
              {connected ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">CANVA CONECTADO</span> : null}
            </div>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-600">O CRM é o diretor criativo: define identidade, conteúdo, composição e instruções. Canva AI, Firefly ou um designer humano executam a peça. Templates deixam de ser obrigatórios.</p>
            <p className="mt-2 text-xs font-medium text-[#1E293F]">Regra central: identidade fixa, composição variável e conteúdo comandando o design.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {status?.configured && !connected ? <Button disabled={busy} onClick={connect} variant="outline"><Sparkles className="mr-2 h-4 w-4" />Conectar Canva</Button> : null}
          {connected ? <>
            <Button variant="outline" disabled={busy} onClick={load}><RefreshCcw className="mr-2 h-4 w-4" />Atualizar conexão</Button>
            <Button variant="outline" disabled={busy} onClick={disconnect}><Unplug className="mr-2 h-4 w-4" />Desconectar Canva</Button>
          </> : null}
        </div>
      </div>
    </div>
  );
}

export function CanvaOrderActions({ order, onNotice, onError, onChanged }: { order: any } & Props) {
  const [busy, setBusy] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [variation, setVariation] = useState("");
  const [promptPackage, setPromptPackage] = useState<VisualPromptPackage | null>(order?.metadata?.visual_prompt_package || null);

  const supported = useMemo(() => ["carrossel", "stories", "status", "post", "reel", "short", "youtube_long", "video"].includes(String(order?.format || "")), [order?.format]);
  if (!supported) return null;

  async function getCreativeSpec(refineInstructions?: string) {
    const current = order.metadata?.visual_spec_v2 || order.metadata?.canva_creative_spec || promptPackage?.creative_spec || null;
    const assetKind = ["reel", "short", "youtube_long", "video"].includes(String(order.format)) ? "thumbnail" : "static";
    if (current && !refineInstructions) return current;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada.");
    const response = await fetch("/api/marketing/production-visual", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        production_order_id: order.id,
        action: current && refineInstructions ? "refine" : "create",
        asset_kind: assetKind,
        current_spec: current,
        instructions: refineInstructions || "",
        target: "all",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) throw new Error(payload?.detail || payload?.message || "Falha ao preparar a direção criativa.");
    return payload.result;
  }

  async function generatePrompt(refineInstructions?: string) {
    setBusy(true);
    try {
      const spec = await getCreativeSpec(refineInstructions);
      const payload = await authFetch("/api/marketing/visual-prompt", {
        method: "POST",
        body: JSON.stringify({ production_order_id: order.id, creative_spec: spec }),
      });
      setPromptPackage(payload.package);
      setShowPrompts(true);
      setVariation("");
      onNotice?.(`Prompt visual V${String(payload.package?.revision || 1).padStart(2, "0")} gerado. Canva limitado a 6 imagens por prompt e Firefly dividido por card.`);
      await onChanged?.();
    } catch (error: any) {
      onError?.(error?.message || "Não foi possível gerar o prompt visual.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCanva() {
    if (!promptPackage) return;
    const prompts = promptPackage.canva?.prompts || [];
    if (!prompts.length) return;
    await copyToClipboard(prompts[0].prompt);
    setShowPrompts(true);
    onNotice?.(prompts.length > 1 ? `Lote 1/${prompts.length} do Canva copiado. Os demais lotes estão abertos abaixo.` : "Prompt para Canva AI copiado.");
  }

  async function copyFirefly() {
    if (!promptPackage) return;
    const prompts = promptPackage.firefly?.prompts || [];
    if (!prompts.length) return;
    await copyToClipboard(prompts[0].prompt);
    setShowPrompts(true);
    onNotice?.(prompts.length > 1 ? `Prompt do card 1/${prompts.length} para Firefly copiado. Os demais estão abertos abaixo.` : "Prompt para Firefly copiado.");
  }

  function downloadBriefing() {
    if (!promptPackage) return;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 16;
    const maxWidth = 178;
    let y = 18;
    const write = (text: string, size = 9, bold = false) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(String(text || ""), maxWidth);
      const height = lines.length * (size * 0.38 + 1.4);
      if (y + height > 282) { doc.addPage(); y = 18; }
      doc.text(lines, margin, y);
      y += height + 2;
    };
    write("BRIEFING VISUAL — MAX CONTENT", 14, true);
    write(order.title || "Peça de conteúdo", 11, true);
    write(`${promptPackage.dimensions.label} · ${promptPackage.dimensions.ratio} · ${promptPackage.total_items} imagem(ns)`);
    write(`Identidade: ${promptPackage.identity.name}`);
    write(`Cores: ${promptPackage.identity.colors.join(", ")}`);
    write(`Fontes: ${promptPackage.identity.fonts}`);
    write("Regra: todo texto deve permanecer em português do Brasil, exatamente como fornecido.", 9, true);
    promptPackage.canva.prompts.forEach((item) => {
      write(`CANVA AI — LOTE ${item.index}/${promptPackage.canva.batch_count} — cards ${item.from_item} a ${item.to_item}`, 10, true);
      write(item.prompt, 8);
    });
    promptPackage.firefly.prompts.forEach((item) => {
      write(`FIREFLY — CARD ${item.index} — ${item.char_count} caracteres`, 10, true);
      write(item.prompt, 8);
    });
    doc.save(`briefing-visual-${safeName(order.title || order.id)}-v${String(promptPackage.revision).padStart(2, "0")}.pdf`);
  }

  async function uploadFinal(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Usuário não identificado.");
      const role = outputRole(String(order.format || "post"));
      const now = new Date().toISOString();
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (!file.type.startsWith("image/")) throw new Error("Nesta etapa, envie somente imagens finais.");
        const path = `${user.id}/production/${order.id}/external/${Date.now()}-${String(index + 1).padStart(2, "0")}-${safeName(file.name)}`;
        const { error: uploadError } = await supabase.storage.from(CONTENT_BUCKET).upload(path, file, { upsert: false, contentType: file.type || "image/png" });
        if (uploadError) throw uploadError;
        const { error: assetError } = await supabase.from("marketing_content_assets").insert({
          content_id: order.content_id,
          variant_id: order.variant_id,
          production_order_id: order.id,
          kind: "image",
          asset_role: role,
          file_path: path,
          file_name: file.name,
          mime_type: file.type || "image/png",
          file_size_bytes: file.size,
          metadata: {
            source: "external_visual_studio",
            final: true,
            sequence_index: index + 1,
            prompt_revision: promptPackage?.revision || order.metadata?.visual_prompt_revision || null,
            imported_at: now,
          },
          created_by: user.id,
        });
        if (assetError) {
          await supabase.storage.from(CONTENT_BUCKET).remove([path]);
          throw assetError;
        }
      }
      const metadata = {
        ...(order.metadata || {}),
        visual_execution_mode: "external_ai_or_human",
        external_visual_uploaded_at: now,
        external_visual_count: files.length,
      };
      const { error: orderError } = await supabase.from("marketing_production_orders").update({
        metadata,
        status: "em_revisao",
        produced_at: now,
        updated_at: now,
      }).eq("id", order.id);
      if (orderError) throw orderError;
      onNotice?.(`${files.length} imagem(ns) final(is) enviada(s). A peça está em revisão.`);
      await onChanged?.();
    } catch (error: any) {
      onError?.(error?.message || "Erro ao enviar a peça final.");
    } finally {
      setBusy(false);
    }
  }

  async function requestApproval() {
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("marketing_content_assets")
        .select("id")
        .eq("production_order_id", order.id)
        .in("asset_role", FINAL_ROLES)
        .limit(1);
      if (error) throw error;
      if (!data?.length) throw new Error("Faça upload da peça final antes de solicitar aprovação.");
      const { error: updateError } = await supabase.from("marketing_production_orders").update({
        status: "pronto_aprovacao",
        updated_at: new Date().toISOString(),
      }).eq("id", order.id);
      if (updateError) throw updateError;
      onNotice?.("Peça encaminhada para aprovação final.");
      await onChanged?.();
    } catch (error: any) {
      onError?.(error?.message || "Erro ao solicitar aprovação.");
    } finally {
      setBusy(false);
    }
  }

  const canvaPrompts = promptPackage?.canva?.prompts || [];
  const fireflyPrompts = promptPackage?.firefly?.prompts || [];

  return <div className="contents">
    <Button disabled={busy} onClick={() => generatePrompt()} className="bg-[#1E293F] hover:bg-[#26344f]">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}{promptPackage ? "Gerar novo prompt visual" : "Gerar prompt visual"}</Button>
    {promptPackage ? <>
      <Button variant="outline" disabled={busy} onClick={copyCanva}><Clipboard className="mr-2 h-4 w-4" />Copiar para Canva AI</Button>
      <Button variant="outline" disabled={busy} onClick={copyFirefly}><Clipboard className="mr-2 h-4 w-4" />Copiar para Firefly</Button>
      <Button variant="outline" disabled={busy} onClick={downloadBriefing}><Download className="mr-2 h-4 w-4" />Baixar briefing visual PDF</Button>
      <Button variant="outline" disabled={busy} onClick={() => setShowPrompts((value) => !value)}><Palette className="mr-2 h-4 w-4" />{showPrompts ? "Fechar prompts" : "Ver prompts"}</Button>
    </> : null}
    <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-[#B5A573]/50 bg-[#E0CE8C]/10 px-4 text-sm font-medium text-[#1E293F] hover:bg-[#E0CE8C]/20"><UploadCloud className="mr-2 h-4 w-4" />Fazer upload da peça final<input type="file" multiple accept="image/*" className="hidden" onChange={(event) => { void uploadFinal(event.target.files); event.currentTarget.value = ""; }} /></label>
    <Button variant="outline" disabled={busy} onClick={requestApproval}><Send className="mr-2 h-4 w-4" />Solicitar aprovação</Button>

    {showPrompts && promptPackage ? <div className="basis-full w-full rounded-2xl border border-[#1E293F]/15 bg-[#F5F5F5] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[#1E293F]">Prompt visual V{String(promptPackage.revision).padStart(2, "0")}</p><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#A11C27]">PORTUGUÊS DO BRASIL OBRIGATÓRIO</span></div>
          <p className="mt-1 text-xs text-slate-600">{promptPackage.dimensions.label} · {promptPackage.dimensions.ratio} · {promptPackage.total_items} imagem(ns). O Canva recebe no máximo 6 imagens por prompt; o Firefly recebe um prompt compacto por card.</p>
        </div>
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#1E293F]">Canva AI</p>
        <p className="mt-1 text-[11px] text-slate-500">Se houver mais de 6 cards, os prompts são divididos automaticamente em lotes. Cole um lote de cada vez.</p>
        <div className="mt-3 space-y-3">
          {canvaPrompts.map((item) => <div key={item.index} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-[#1E293F]">Lote {item.index}/{promptPackage.canva.batch_count} · cards {item.from_item}–{item.to_item} · {item.image_count} imagem(ns)</p><Button size="sm" variant="outline" onClick={async () => { await copyToClipboard(item.prompt); onNotice?.(`Prompt Canva lote ${item.index} copiado.`); }}><Clipboard className="mr-2 h-3.5 w-3.5" />Copiar lote</Button></div>
            <Textarea readOnly rows={10} className="mt-2 bg-slate-50 text-xs leading-5" value={item.prompt} />
          </div>)}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#1E293F]">Adobe Firefly</p>
        <p className="mt-1 text-[11px] text-slate-500">Um card por vez, com prompt enxuto. O contador de caracteres ajuda a escolher modelos do Firefly que tenham limites menores.</p>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {fireflyPrompts.map((item) => <div key={item.index} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-[#1E293F]">Card {item.index} · {item.char_count} caracteres</p><Button size="sm" variant="outline" onClick={async () => { await copyToClipboard(item.prompt); onNotice?.(`Prompt Firefly card ${item.index} copiado.`); }}><Clipboard className="mr-2 h-3.5 w-3.5" />Copiar</Button></div>
            <Textarea readOnly rows={8} className="mt-2 bg-slate-50 text-xs leading-5" value={item.prompt} />
          </div>)}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#B5A573]/35 bg-white p-3">
        <p className="text-xs font-semibold text-[#1E293F]">Gerar nova variação de prompt</p>
        <p className="mt-1 text-[11px] text-slate-500">Ajuste a direção criativa sem trocar a identidade da marca nem inventar conteúdo.</p>
        <Textarea rows={3} className="mt-2" value={variation} onChange={(event) => setVariation(event.target.value)} placeholder="Ex.: capa mais minimalista; card 3 com comparação visual mais forte; usar mais fundo claro e menos elementos." />
        <div className="mt-2 flex justify-end"><Button size="sm" disabled={busy} onClick={() => generatePrompt(variation.trim() || "Crie uma nova variação de composição mantendo a identidade, a tese e todo o texto aprovado.")} className="bg-[#1E293F] hover:bg-[#26344f]"><Sparkles className="mr-2 h-3.5 w-3.5" />Gerar nova variação</Button></div>
      </div>
    </div> : null}
  </div>;
}
