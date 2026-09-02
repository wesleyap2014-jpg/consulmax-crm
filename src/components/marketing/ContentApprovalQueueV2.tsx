import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Image as ImageIcon, Loader2, RotateCcw, XCircle } from "lucide-react";

type Variant = {
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
  hashtags?: string[] | null;
  status: string;
  planned_at: string | null;
};

type ContentItem = {
  id: string;
  title: string;
};

type ProductionOrder = {
  id: string;
  variant_id: string | null;
  status: string;
  metadata: Record<string, any> | null;
};

type Asset = {
  id: string;
  production_order_id: string | null;
  variant_id: string | null;
  kind: string;
  asset_role: string | null;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

type Props = {
  userId: string | null;
  variants: Variant[];
  contents: ContentItem[];
  saving?: boolean;
  onChanged?: () => Promise<void> | void;
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
};

type Decision = { type: "return" | "reject"; variant: Variant; note: string } | null;

const CONTENT_BUCKET = "marketing-content-assets";
const FINAL_ROLES = new Set(["carousel_card", "story_frame", "status_frame", "post_image", "thumbnail", "final_video"]);
const NO_CAPTION_FORMATS = new Set(["stories", "story", "status"]);

function needsCaption(format: string) {
  return !NO_CAPTION_FORMATS.has(String(format || "").toLowerCase());
}

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

function latestBatch(assets: Asset[]) {
  const finals = assets.filter((asset) => FINAL_ROLES.has(String(asset.asset_role || "")));
  if (!finals.length) return [];

  const external = finals.filter((asset) => asset.metadata?.source === "external_visual_studio" || asset.metadata?.final === true);
  if (external.length) {
    const latestStamp = external
      .map((asset) => String(asset.metadata?.imported_at || asset.created_at || ""))
      .sort()
      .at(-1);
    return external.filter((asset) => String(asset.metadata?.imported_at || asset.created_at || "") === latestStamp);
  }

  const maxVisualVersion = Math.max(0, ...finals.map((asset) => Number(asset.metadata?.visual_version || 0)));
  if (maxVisualVersion > 0) return finals.filter((asset) => Number(asset.metadata?.visual_version || 0) === maxVisualVersion);
  return finals;
}

export default function ContentApprovalQueueV2({ userId, variants, contents, saving, onChanged, onNotice, onError }: Props) {
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [decision, setDecision] = useState<Decision>(null);

  const pending = useMemo(() => variants.filter((variant) => variant.status === "aprovacao"), [variants]);
  const contentById = useMemo(() => new Map(contents.map((content) => [content.id, content])), [contents]);
  const orderByVariant = useMemo(() => new Map(orders.filter((order) => order.variant_id).map((order) => [String(order.variant_id), order])), [orders]);

  async function loadMedia() {
    const ids = pending.map((variant) => variant.id);
    if (!ids.length) {
      setOrders([]);
      setAssets([]);
      setUrls({});
      return;
    }

    setLoading(true);
    try {
      const { data: orderRows, error: orderError } = await supabase
        .from("marketing_production_orders")
        .select("id,variant_id,status,metadata")
        .in("variant_id", ids);
      if (orderError) throw orderError;
      const nextOrders = (orderRows || []) as ProductionOrder[];
      setOrders(nextOrders);

      const orderIds = nextOrders.map((order) => order.id);
      if (!orderIds.length) {
        setAssets([]);
        setUrls({});
        return;
      }

      const { data: assetRows, error: assetError } = await supabase
        .from("marketing_content_assets")
        .select("id,production_order_id,variant_id,kind,asset_role,file_path,file_name,mime_type,metadata,created_at")
        .in("production_order_id", orderIds)
        .order("created_at", { ascending: true });
      if (assetError) throw assetError;
      const nextAssets = (assetRows || []) as Asset[];
      setAssets(nextAssets);

      const finalAssets = nextAssets.filter((asset) => FINAL_ROLES.has(String(asset.asset_role || "")));
      const signed = await Promise.all(finalAssets.map(async (asset) => {
        const { data } = await supabase.storage.from(CONTENT_BUCKET).createSignedUrl(asset.file_path, 20 * 60);
        return [asset.id, data?.signedUrl || ""] as const;
      }));
      setUrls(Object.fromEntries(signed.filter(([, url]) => Boolean(url))));
    } catch (error: any) {
      onError?.(error?.message || "Não foi possível carregar as peças em aprovação.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadMedia(); }, [pending.map((item) => item.id).join("|")]);

  function assetsFor(variant: Variant) {
    const order = orderByVariant.get(variant.id);
    if (!order) return [];
    return latestBatch(assets.filter((asset) => asset.production_order_id === order.id));
  }

  async function finishApproval(variant: Variant) {
    if (!userId) return onError?.("Usuário não identificado.");
    if (needsCaption(variant.format) && !String(variant.caption || "").trim()) {
      return onError?.(`Gere ou preencha a legenda do ${formatLabel(variant.format)} antes de aprovar.`);
    }

    const order = orderByVariant.get(variant.id);
    const now = new Date().toISOString();
    setBusyId(variant.id);
    try {
      const { error: approvalError } = await supabase
        .from("marketing_content_approvals")
        .update({ status: "approved", decided_by: userId, decided_at: now, decision_note: "Peça final aprovada para calendário." })
        .eq("variant_id", variant.id)
        .eq("status", "pending");
      if (approvalError) throw approvalError;

      const { error: variantError } = await supabase
        .from("marketing_content_variants")
        .update({ status: "aprovado", updated_at: now })
        .eq("id", variant.id);
      if (variantError) throw variantError;

      if (order) {
        const { error: orderError } = await supabase
          .from("marketing_production_orders")
          .update({ status: "aprovado", updated_at: now })
          .eq("id", order.id);
        if (orderError) throw orderError;
      }

      onNotice?.("Peça aprovada. Ela saiu de Aprovações e foi enviada ao Calendário para agendamento.");
      await onChanged?.();
    } catch (error: any) {
      onError?.(error?.message || "Erro ao aprovar a peça.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitDecision() {
    if (!decision || !userId) return;
    const note = decision.note.trim();
    if (!note) return onError?.(decision.type === "return" ? "Descreva os ajustes que devem ser feitos na imagem." : "Informe o motivo da reprovação.");

    const variant = decision.variant;
    const order = orderByVariant.get(variant.id);
    const now = new Date().toISOString();
    setBusyId(variant.id);
    try {
      const approvalStatus = decision.type === "return" ? "changes_requested" : "rejected";
      const { error: approvalError } = await supabase
        .from("marketing_content_approvals")
        .update({ status: approvalStatus, decided_by: userId, decided_at: now, decision_note: note })
        .eq("variant_id", variant.id)
        .eq("status", "pending");
      if (approvalError) throw approvalError;

      const { error: variantError } = await supabase
        .from("marketing_content_variants")
        .update({ status: decision.type === "return" ? "producao" : "rejeitado", updated_at: now })
        .eq("id", variant.id);
      if (variantError) throw variantError;

      if (order) {
        const metadata = {
          ...(order.metadata || {}),
          ...(decision.type === "return"
            ? { approval_return_note: note, approval_returned_at: now, approval_returned_by: userId }
            : { approval_rejection_note: note, approval_rejected_at: now, approval_rejected_by: userId }),
        };
        const { error: orderError } = await supabase
          .from("marketing_production_orders")
          .update({ status: decision.type === "return" ? "ajuste_solicitado" : "rejeitado", metadata, updated_at: now })
          .eq("id", order.id);
        if (orderError) throw orderError;
      }

      onNotice?.(decision.type === "return"
        ? "Peça devolvida para Produção com os ajustes solicitados na imagem."
        : "Peça reprovada e retirada do fluxo de publicação.");
      setDecision(null);
      await onChanged?.();
    } catch (error: any) {
      onError?.(error?.message || "Erro ao registrar a decisão.");
    } finally {
      setBusyId(null);
    }
  }

  if (!pending.length) {
    return <div className="rounded-2xl border border-dashed border-[#B5A573]/45 bg-white/70 p-8 text-center"><p className="font-medium text-[#1E293F]">Nada aguardando aprovação</p><p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">Quando uma peça final sair da Produção, ela aparecerá aqui com a mídia e a legenda para decisão.</p></div>;
  }

  return <>
    <div className="space-y-4">
      {loading ? <div className="rounded-2xl border border-[#B5A573]/20 bg-white p-4 text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando mídias finais…</div> : null}
      {pending.map((variant) => {
        const finalAssets = assetsFor(variant);
        const captionRequired = needsCaption(variant.format);
        const isBusy = busyId === variant.id || Boolean(saving);
        return <Card key={variant.id} className="overflow-hidden border-[#B5A573]/25 bg-white shadow-sm">
          <CardContent className="p-0">
            <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
              <div className="border-b border-slate-100 bg-[#F5F5F5] p-4 lg:border-b-0 lg:border-r">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#A11C27]">Peça final</p><p className="text-sm text-slate-500">{variant.provider} · {formatLabel(variant.format)}</p></div>
                  <span className="rounded-full bg-[#E0CE8C]/30 px-2.5 py-1 text-[11px] font-semibold text-[#1E293F]">EM APROVAÇÃO</span>
                </div>
                {finalAssets.length ? <div className={`grid gap-3 ${finalAssets.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
                  {finalAssets.map((asset, index) => {
                    const url = urls[asset.id];
                    const isVideo = String(asset.mime_type || "").startsWith("video/") || asset.kind === "video" || asset.asset_role === "final_video";
                    return <div key={asset.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {url ? (isVideo
                        ? <video controls className="max-h-[620px] w-full bg-black object-contain" src={url} />
                        : <img className="max-h-[620px] w-full object-contain" src={url} alt={`Peça final ${index + 1}`} />)
                        : <div className="flex h-56 items-center justify-center text-sm text-slate-400"><ImageIcon className="mr-2 h-5 w-5" />Prévia indisponível</div>}
                      {finalAssets.length > 1 ? <div className="border-t px-3 py-2 text-center text-xs text-slate-500">Imagem {index + 1} de {finalAssets.length}</div> : null}
                    </div>;
                  })}
                </div> : <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-400"><ImageIcon className="mr-2 h-5 w-5" />Nenhuma mídia final encontrada para esta versão.</div>}
              </div>

              <div className="flex flex-col p-5">
                <div>
                  <p className="text-lg font-semibold text-[#1E293F]">{variant.title || contentById.get(variant.content_id)?.title || "Conteúdo"}</p>
                  {variant.hook ? <p className="mt-2 text-sm text-slate-600">{variant.hook}</p> : null}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E293F]">Legenda</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${captionRequired ? "bg-[#A11C27]/10 text-[#A11C27]" : "bg-slate-200 text-slate-600"}`}>{captionRequired ? "OBRIGATÓRIA" : "NÃO SE APLICA"}</span></div>
                  {captionRequired ? <>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{variant.caption?.trim() || "Legenda ainda não gerada."}</p>
                    {Array.isArray(variant.hashtags) && variant.hashtags.length ? <p className="mt-3 text-xs leading-5 text-[#A11C27]">{variant.hashtags.map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ")}</p> : null}
                  </> : <p className="mt-2 text-sm text-slate-500">Este formato não usa legenda externa; a mensagem está na própria peça.</p>}
                </div>

                <div className="mt-auto flex flex-wrap gap-2 pt-6">
                  <Button disabled={isBusy} onClick={() => void finishApproval(variant)} className="bg-[#1E293F] hover:bg-[#26344f]"><CheckCircle2 className="mr-2 h-4 w-4" />Aprovar</Button>
                  <Button disabled={isBusy} variant="outline" onClick={() => setDecision({ type: "return", variant, note: "" })} className="border-[#B5A573]/50"><RotateCcw className="mr-2 h-4 w-4" />Devolver</Button>
                  <Button disabled={isBusy} variant="outline" onClick={() => setDecision({ type: "reject", variant, note: "" })} className="border-[#A11C27]/30 text-[#A11C27] hover:bg-[#A11C27]/5"><XCircle className="mr-2 h-4 w-4" />Reprovar</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>;
      })}
    </div>

    {decision ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-semibold text-[#1E293F]">{decision.type === "return" ? "Devolver para ajustes" : "Reprovar peça"}</h3>
        <p className="mt-1 text-sm text-slate-500">{decision.type === "return"
          ? "Descreva exatamente o que precisa mudar na criação da imagem. Essa orientação voltará junto com a peça para Produção."
          : "Registre o motivo da reprovação. A peça será encerrada e não seguirá para o Calendário."}</p>
        <Textarea className="mt-4" rows={7} autoFocus placeholder={decision.type === "return" ? "Ex.: reduzir texto do card 2, trocar a imagem da capa, dar mais respiro e manter as cores do Brand Kit…" : "Motivo da reprovação…"} value={decision.note} onChange={(event) => setDecision((current) => current ? { ...current, note: event.target.value } : current)} />
        <div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={Boolean(busyId)} onClick={() => setDecision(null)}>Cancelar</Button><Button disabled={Boolean(busyId) || !decision.note.trim()} onClick={() => void submitDecision()} className={decision.type === "return" ? "bg-[#1E293F] hover:bg-[#26344f]" : "bg-[#A11C27] hover:bg-[#8b1822]"}>{busyId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{decision.type === "return" ? "Devolver à Produção" : "Confirmar reprovação"}</Button></div>
      </div>
    </div> : null}
  </>;
}
