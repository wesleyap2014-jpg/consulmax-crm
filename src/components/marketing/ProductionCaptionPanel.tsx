import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Sparkles } from "lucide-react";

const NO_CAPTION_FORMATS = new Set(["stories", "story", "status"]);

function formatLabel(format: string) {
  const labels: Record<string, string> = {
    reel: "Reel",
    video: "Vídeo",
    short: "YouTube Short",
    youtube_long: "YouTube",
    carrossel: "Carrossel",
    stories: "Stories",
    story: "Story",
    post: "Post",
    artigo: "Artigo",
    status: "Status",
  };
  return labels[String(format || "").toLowerCase()] || format;
}

export function captionRequiredForFormat(format: string) {
  return !NO_CAPTION_FORMATS.has(String(format || "").toLowerCase());
}

type Props = {
  order: any;
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
  onChanged?: () => Promise<void> | void;
};

export default function ProductionCaptionPanel({ order, onNotice, onError, onChanged }: Props) {
  const required = useMemo(() => captionRequiredForFormat(String(order?.format || "")), [order?.format]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [loadedCaption, setLoadedCaption] = useState("");

  async function load() {
    if (!order?.variant_id || !required) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("marketing_content_variants")
        .select("caption,hashtags")
        .eq("id", order.variant_id)
        .maybeSingle();
      if (error) throw error;
      const nextCaption = String(data?.caption || "");
      setCaption(nextCaption);
      setLoadedCaption(nextCaption);
      setHashtags(Array.isArray(data?.hashtags) ? data.hashtags : []);
    } catch (error: any) {
      onError?.(error?.message || "Não foi possível carregar a legenda.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [order?.variant_id, required]);

  async function generate() {
    if (!order?.id) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente no CRM.");
      const response = await fetch("/api/marketing/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ production_order_id: order.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.detail || payload?.message || "Falha ao gerar legenda.");
      if (!payload.required) {
        onNotice?.("Este formato não precisa de legenda externa.");
        return;
      }
      const nextCaption = String(payload.caption || "");
      setCaption(nextCaption);
      setLoadedCaption(nextCaption);
      setHashtags(Array.isArray(payload.hashtags) ? payload.hashtags : []);
      onNotice?.(`Legenda de ${formatLabel(order.format)} gerada pelo Max e salva na versão editorial.`);
      await onChanged?.();
    } catch (error: any) {
      onError?.(error?.message || "Não foi possível gerar a legenda.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!order?.variant_id) return onError?.("Esta ordem não está vinculada a uma versão editorial.");
    const value = caption.trim();
    if (!value) return onError?.("A legenda não pode ficar vazia para este formato.");
    setBusy(true);
    try {
      const { error } = await supabase
        .from("marketing_content_variants")
        .update({ caption: value, updated_at: new Date().toISOString() })
        .eq("id", order.variant_id);
      if (error) throw error;
      setCaption(value);
      setLoadedCaption(value);
      onNotice?.("Legenda salva.");
      await onChanged?.();
    } catch (error: any) {
      onError?.(error?.message || "Erro ao salvar legenda.");
    } finally {
      setBusy(false);
    }
  }

  if (!required) {
    return <div className="basis-full w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><strong className="text-[#1E293F]">Legenda:</strong> {formatLabel(order?.format)} não exige legenda externa. O conteúdo deve estar na própria peça.</div>;
  }

  return <div className="basis-full w-full rounded-2xl border border-[#B5A573]/30 bg-white p-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[#1E293F]">Legenda da publicação</p><span className="rounded-full bg-[#A11C27]/10 px-2 py-0.5 text-[10px] font-semibold text-[#A11C27]">OBRIGATÓRIA PARA {String(formatLabel(order?.format)).toUpperCase()}</span></div>
        <p className="mt-1 text-xs text-slate-500">O Max adapta a legenda ao canal e ao formato. Você pode editar antes de enviar para aprovação.</p>
      </div>
      <Button size="sm" variant="outline" disabled={busy || loading} onClick={() => void generate()}>{busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}{caption.trim() ? "Gerar novamente" : "Gerar com Max"}</Button>
    </div>
    {loading ? <div className="mt-3 text-xs text-slate-400"><Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />Carregando legenda…</div> : <>
      <Textarea className="mt-3 min-h-36 bg-slate-50 text-sm leading-6" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Gere a legenda com o Max ou escreva manualmente…" />
      {hashtags.length ? <p className="mt-2 text-xs leading-5 text-[#A11C27]">{hashtags.map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ")}</p> : null}
      <div className="mt-3 flex items-center justify-between gap-3"><p className="text-[11px] text-slate-400">{caption.trim().length} caracteres</p><Button size="sm" disabled={busy || !caption.trim() || caption === loadedCaption} onClick={() => void save()} className="bg-[#1E293F] hover:bg-[#26344f]"><Save className="mr-2 h-3.5 w-3.5" />Salvar legenda</Button></div>
    </>}
  </div>;
}
