import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  CheckCircle2,
  Clapperboard,
  Download,
  Eye,
  FileArchive,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  Palette,
  PlayCircle,
  RefreshCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import {
  renderVisualItem,
  wrapLines,
  type BrandContext,
  type VisualItem,
  type VisualSpec,
} from "./productionVisualRenderer";

type ProductionOrder = {
  id: string;
  content_id: string;
  variant_id: string | null;
  provider: string;
  format: string;
  title: string | null;
  status: string;
  brand_kit_setting_id: string | null;
  blueprint: Record<string, any>;
  metadata: Record<string, any>;
  approved_editorially_at: string | null;
  produced_at: string | null;
  created_at: string;
};

type ContentRow = {
  id: string;
  title: string;
  objective: string | null;
  audience: string | null;
  ai_context: Record<string, any> | null;
};

type VariantRow = {
  id: string;
  content_id: string;
  title: string | null;
  hook: string | null;
  script: string | null;
  caption: string | null;
  cta: string | null;
  duration_seconds: number | null;
  aspect_ratio: string | null;
  status: string;
};

type AssetRow = {
  id: string;
  content_id: string | null;
  variant_id: string | null;
  production_order_id: string | null;
  kind: string;
  asset_role: string | null;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  metadata: Record<string, any> | null;
  width: number | null;
  height: number | null;
  created_at: string;
};

type BrandKit = { id: string; name: string; payload: Record<string, any>; active: boolean };
type BrandAsset = {
  id: string;
  setting_id: string;
  asset_type: string;
  role: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  metadata: Record<string, any>;
  is_primary: boolean;
  active: boolean;
};

type AdjustmentState = {
  orderId: string;
  mode: "static" | "thumbnail";
  target: string;
  instructions: string;
};

type Props = {
  userId: string | null;
  onChanged?: () => Promise<void> | void;
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
};

const CONTENT_BUCKET = "marketing-content-assets";
const BRAND_BUCKET = "marketing-brand-assets";
const FALLBACK_COLORS = ["#1E293F", "#A11C27", "#B5A573", "#E0CE8C", "#F5F5F5"];

const STATUS: Record<string, string> = {
  aguardando_producao: "Aguardando produção",
  aguardando_insumos: "Aguardando insumos",
  recebendo_cortes: "Recebendo cortes",
  pronto_ia: "Pronto para IA",
  produzindo: "Produzindo",
  em_revisao: "Em revisão",
  pronto_aprovacao: "Pronto para aprovação",
  aprovado: "Aprovado",
  ajuste_solicitado: "Ajuste solicitado",
  falhou: "Falhou",
};

const FORMAT_LABEL: Record<string, string> = {
  reel: "Reel",
  video: "Vídeo",
  short: "YouTube Short",
  youtube_long: "YouTube longo",
  carrossel: "Carrossel",
  stories: "Stories",
  post: "Post estático",
  artigo: "Artigo",
  status: "Status",
};

const VIDEO_FORMATS = new Set(["reel", "video", "short", "youtube_long"]);
const STATIC_FORMATS = new Set(["carrossel", "stories", "status", "post"]);
const OUTPUT_ROLES = new Set(["carousel_card", "story_frame", "status_frame", "post_image", "thumbnail", "final_video"]);

const QUICK_ADJUSTMENTS = [
  "Deixar mais clean e com mais respiro",
  "Reduzir a quantidade de texto",
  "Aumentar a força da capa/gancho",
  "Variar mais os layouts entre as telas",
  "Deixar mais premium e institucional",
  "Transformar a explicação em comparação visual",
  "Melhorar a hierarquia e a leitura em celular",
  "Usar menos cor e mais fundo claro",
  "Reforçar o CTA sem parecer anúncio",
];

function safeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function isVideo(order: ProductionOrder) {
  return VIDEO_FORMATS.has(String(order.format).toLowerCase());
}

function isStatic(order: ProductionOrder) {
  return STATIC_FORMATS.has(String(order.format).toLowerCase());
}

function outputRoleFor(order: ProductionOrder) {
  if (order.format === "carrossel") return "carousel_card";
  if (order.format === "stories") return "story_frame";
  if (order.format === "status") return "status_frame";
  return "post_image";
}

function formatVersion(version: number) {
  return `V${String(version).padStart(2, "0")}`;
}

async function loadImage(url: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Não foi possível carregar a logo do Brand Kit."));
    image.src = url;
  });
  return image;
}

function fitImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / image.width, maxH / image.height);
  const w = image.width * ratio;
  const h = image.height * ratio;
  ctx.drawImage(image, x, y + (maxH - h) / 2, w, h);
}

export default function ProductionWorkspaceV2({ userId, onChanged, onNotice, onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [adjustment, setAdjustment] = useState<AdjustmentState | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [ordersRes, contentsRes, variantsRes, assetsRes, kitsRes, brandAssetsRes] = await Promise.all([
        supabase.from("marketing_production_orders").select("*").order("created_at", { ascending: false }),
        supabase.from("marketing_content_items").select("id,title,objective,audience,ai_context").order("created_at", { ascending: false }).limit(200),
        supabase.from("marketing_content_variants").select("id,content_id,title,hook,script,caption,cta,duration_seconds,aspect_ratio,status").order("created_at", { ascending: false }).limit(500),
        supabase.from("marketing_content_assets").select("id,content_id,variant_id,production_order_id,kind,asset_role,file_path,file_name,mime_type,metadata,width,height,created_at").order("created_at", { ascending: true }).limit(1500),
        supabase.from("marketing_content_settings").select("id,name,payload,active").eq("setting_type", "brand_kit").order("created_at", { ascending: true }),
        supabase.from("marketing_brand_assets").select("id,setting_id,asset_type,role,file_path,file_name,mime_type,metadata,is_primary,active").eq("active", true).order("is_primary", { ascending: false }),
      ]);
      const firstError = [ordersRes, contentsRes, variantsRes, assetsRes, kitsRes, brandAssetsRes].find((item) => item.error)?.error;
      if (firstError) throw firstError;

      const nextAssets = (assetsRes.data || []) as AssetRow[];
      setOrders((ordersRes.data || []) as ProductionOrder[]);
      setContents((contentsRes.data || []) as ContentRow[]);
      setVariants((variantsRes.data || []) as VariantRow[]);
      setAssets(nextAssets);
      setBrandKits((kitsRes.data || []) as BrandKit[]);
      setBrandAssets((brandAssetsRes.data || []) as BrandAsset[]);

      const images = nextAssets
        .filter((asset) => asset.kind === "image" && OUTPUT_ROLES.has(asset.asset_role || ""))
        .slice(-60);
      const signed = await Promise.all(images.map(async (asset) => {
        try {
          const { data } = await supabase.storage.from(CONTENT_BUCKET).createSignedUrl(asset.file_path, 20 * 60);
          return [asset.id, data?.signedUrl || ""] as const;
        } catch {
          return [asset.id, ""] as const;
        }
      }));
      setPreviewUrls(Object.fromEntries(signed.filter(([, url]) => Boolean(url))));
    } catch (err: any) {
      onError?.(err?.message || "Erro ao carregar a fila de Produção.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const contentById = useMemo(() => new Map(contents.map((item) => [item.id, item])), [contents]);
  const variantById = useMemo(() => new Map(variants.map((item) => [item.id, item])), [variants]);
  const assetsByOrder = useMemo(() => {
    const map = new Map<string, AssetRow[]>();
    assets.forEach((asset) => {
      if (!asset.production_order_id) return;
      const current = map.get(asset.production_order_id) || [];
      current.push(asset);
      map.set(asset.production_order_id, current);
    });
    return map;
  }, [assets]);

  function kitFor(order: ProductionOrder) {
    return brandKits.find((kit) => kit.id === order.brand_kit_setting_id)
      || brandKits.find((kit) => kit.active)
      || brandKits[0]
      || null;
  }

  async function signedBrandAsset(asset: BrandAsset | undefined) {
    if (!asset) return null;
    const { data, error } = await supabase.storage.from(BRAND_BUCKET).createSignedUrl(asset.file_path, 15 * 60);
    if (error) throw error;
    return data?.signedUrl || null;
  }

  async function prepareBrand(order: ProductionOrder): Promise<BrandContext> {
    const kit = kitFor(order);
    const kitAssets = brandAssets.filter((asset) => asset.setting_id === kit?.id);
    const lightLogo = kitAssets.find((asset) => asset.asset_type === "logo" && asset.is_primary)
      || kitAssets.find((asset) => asset.asset_type === "logo" && asset.metadata?.background_context === "light")
      || kitAssets.find((asset) => asset.asset_type === "logo");
    const titleFont = kitAssets.find((asset) => asset.asset_type === "font" && asset.role === "fonte_titulo")
      || kitAssets.find((asset) => asset.asset_type === "font");
    const bodyFont = kitAssets.find((asset) => asset.asset_type === "font" && asset.role === "fonte_corpo") || titleFont;
    const [logoUrl, titleFontUrl, bodyFontUrl] = await Promise.all([
      signedBrandAsset(lightLogo),
      signedBrandAsset(titleFont),
      signedBrandAsset(bodyFont),
    ]);

    const stamp = order.id.replace(/-/g, "").slice(0, 8);
    const titleFamily = `BrandTitle_${stamp}`;
    const bodyFamily = `BrandBody_${stamp}`;
    if (titleFontUrl) {
      try {
        const font = new FontFace(titleFamily, `url(${titleFontUrl})`);
        await font.load();
        document.fonts.add(font);
      } catch { /* browser fallback */ }
    }
    if (bodyFontUrl) {
      try {
        const font = new FontFace(bodyFamily, `url(${bodyFontUrl})`);
        await font.load();
        document.fonts.add(font);
      } catch { /* browser fallback */ }
    }

    const colors = Array.isArray(kit?.payload?.colors) && kit!.payload.colors.length >= 4
      ? kit!.payload.colors
      : FALLBACK_COLORS;

    return {
      logo: logoUrl ? await loadImage(logoUrl) : null,
      titleFamily: titleFontUrl ? titleFamily : "Arial",
      bodyFamily: bodyFontUrl ? bodyFamily : "Arial",
      navy: colors[0] || FALLBACK_COLORS[0],
      red: colors[1] || FALLBACK_COLORS[1],
      gold: colors[2] || FALLBACK_COLORS[2],
      lightGold: colors[3] || FALLBACK_COLORS[3],
      offWhite: colors[4] || FALLBACK_COLORS[4],
      slogan: kit?.payload?.slogan || "Transformando sonhos em conquistas reais.",
    };
  }

  async function setBrandKit(order: ProductionOrder, settingId: string) {
    const { error } = await supabase
      .from("marketing_production_orders")
      .update({ brand_kit_setting_id: settingId || null, updated_at: new Date().toISOString() })
      .eq("id", order.id);
    if (error) return onError?.(error.message);
    await load();
  }

  async function uploadAsset(
    order: ProductionOrder,
    file: File | Blob,
    fileName: string,
    role: string,
    kind: string,
    extraMetadata: Record<string, any> = {},
    dimensions?: { width?: number; height?: number },
  ) {
    if (!userId) throw new Error("Usuário não identificado.");
    const path = `${userId}/production/${order.id}/${Date.now()}-${safeName(fileName)}`;
    const contentType = file instanceof File
      ? file.type
      : role === "final_video"
        ? "video/mp4"
        : role === "script_pdf"
          ? "application/pdf"
          : "image/png";
    const { error: uploadError } = await supabase.storage
      .from(CONTENT_BUCKET)
      .upload(path, file, { upsert: false, contentType: contentType || undefined });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase.from("marketing_content_assets").insert({
      content_id: order.content_id,
      variant_id: order.variant_id,
      production_order_id: order.id,
      kind,
      asset_role: role,
      file_path: path,
      file_name: fileName,
      mime_type: contentType || null,
      file_size_bytes: file.size,
      width: dimensions?.width || null,
      height: dimensions?.height || null,
      metadata: {
        source: "production_factory_v2",
        generated_at: new Date().toISOString(),
        ...extraMetadata,
      },
      created_by: userId,
    }).select("id").single();

    if (error) {
      await supabase.storage.from(CONTENT_BUCKET).remove([path]);
      throw error;
    }
    return data.id as string;
  }

  async function uploadInputs(order: ProductionOrder, files: FileList | null) {
    if (!files?.length) return;
    setBusyId(order.id);
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const role = file.type.startsWith("video/")
          ? "input_take"
          : file.type.startsWith("audio/")
            ? "input_audio"
            : file.type.startsWith("image/")
              ? "input_broll"
              : "input_reference";
        const kind = file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("audio/")
            ? "audio"
            : file.type.startsWith("image/")
              ? "image"
              : "other";
        await uploadAsset(order, file, file.name, role, kind, { input_index: index + 1 });
      }
      await supabase.from("marketing_production_orders")
        .update({ status: "recebendo_cortes", updated_at: new Date().toISOString() })
        .eq("id", order.id);
      onNotice?.(`${files.length} arquivo(s) recebido(s). Os takes agora pertencem a esta ordem de produção.`);
      await load();
      await onChanged?.();
    } catch (err: any) {
      onError?.(err?.message || "Erro ao enviar os arquivos de produção.");
    } finally {
      setBusyId(null);
    }
  }

  async function uploadFinalVideo(order: ProductionOrder, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusyId(order.id);
    try {
      await uploadAsset(order, file, file.name, "final_video", "video", { final: true });
      await supabase.from("marketing_production_orders").update({
        status: "em_revisao",
        produced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", order.id);
      onNotice?.("Vídeo final anexado. A peça está em revisão e pode seguir para aprovação final.");
      await load();
    } catch (err: any) {
      onError?.(err?.message || "Erro ao anexar o vídeo final.");
    } finally {
      setBusyId(null);
    }
  }

  async function callVisualAI(
    order: ProductionOrder,
    action: "create" | "refine",
    assetKind: "static" | "thumbnail",
    currentSpec?: VisualSpec | null,
    instructions = "",
    target: string | number | null = "all",
  ): Promise<VisualSpec> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Entre novamente no CRM.");
    const response = await fetch("/api/marketing/production-visual", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        production_order_id: order.id,
        action,
        asset_kind: assetKind,
        current_spec: currentSpec || null,
        instructions,
        target,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.detail || payload?.message || "Falha ao preparar a direção visual.");
    }
    return payload.result as VisualSpec;
  }

  async function renderStaticVersion(order: ProductionOrder, spec: VisualSpec, version: number, instruction: string) {
    const items = Array.isArray(spec.items) ? spec.items.filter(Boolean) : [];
    if (!items.length) throw new Error("A IA não retornou telas suficientes para a peça.");
    const brand = await prepareBrand(order);
    const role = outputRoleFor(order);
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index] as VisualItem;
      const rendered = await renderVisualItem({
        provider: order.provider,
        format: order.format,
        assetKind: "static",
        item,
        index,
        total: items.length,
        brand,
      });
      const fileName = `${order.format}-${formatVersion(version).toLowerCase()}-${String(index + 1).padStart(2, "0")}.png`;
      await uploadAsset(order, rendered.blob, fileName, role, "image", {
        visual_engine: "editorial_native_v2",
        visual_version: version,
        visual_item_index: index + 1,
        visual_item_role: item.role || null,
        adjustment_instruction: instruction || null,
      }, rendered);
    }
  }

  async function persistStaticRevision(order: ProductionOrder, spec: VisualSpec, version: number, instruction: string, action: "create" | "refine") {
    const now = new Date().toISOString();
    const history = Array.isArray(order.metadata?.visual_revision_history)
      ? order.metadata.visual_revision_history
      : [];
    const nextHistory = [
      ...history,
      {
        version,
        action,
        instruction: instruction || (action === "create" ? "Geração inicial com regras nativas do formato." : "Nova variação visual."),
        created_at: now,
        created_by: userId,
      },
    ].slice(-30);
    const metadata = {
      ...(order.metadata || {}),
      visual_engine: "editorial_native_v2",
      visual_spec_v2: spec,
      visual_version: version,
      visual_revision_history: nextHistory,
      visual_last_instruction: instruction || null,
      visual_updated_at: now,
    };
    const { error } = await supabase.from("marketing_production_orders").update({
      metadata,
      status: "em_revisao",
      produced_at: now,
      updated_at: now,
    }).eq("id", order.id);
    if (error) throw error;
  }

  async function produceStatic(order: ProductionOrder) {
    setBusyId(order.id);
    try {
      await supabase.from("marketing_production_orders").update({
        status: "produzindo",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", order.id);
      const spec = await callVisualAI(order, "create", "static");
      const version = Number(order.metadata?.visual_version || 0) + 1;
      await renderStaticVersion(order, spec, version, "Geração inicial com regra editorial nativa do formato.");
      await persistStaticRevision(order, spec, version, "Geração inicial com regra editorial nativa do formato.", "create");
      onNotice?.(`${spec.items?.length || 0} peça(s) produzida(s) como ${formatVersion(version)} com o Motor Visual V2.`);
      await load();
      await onChanged?.();
    } catch (err: any) {
      await supabase.from("marketing_production_orders").update({
        status: "falhou",
        metadata: { ...(order.metadata || {}), last_error: err?.message || "Falha na produção visual" },
        updated_at: new Date().toISOString(),
      }).eq("id", order.id);
      onError?.(err?.message || "Erro ao produzir a peça.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function refineStatic(order: ProductionOrder, instructions: string, target: string) {
    setBusyId(order.id);
    try {
      const currentSpec = order.metadata?.visual_spec_v2 as VisualSpec | undefined;
      if (!currentSpec) throw new Error("Produza a primeira versão antes de solicitar ajustes.");
      await supabase.from("marketing_production_orders").update({
        status: "produzindo",
        updated_at: new Date().toISOString(),
      }).eq("id", order.id);
      const spec = await callVisualAI(order, "refine", "static", currentSpec, instructions, target);
      const version = Number(order.metadata?.visual_version || 0) + 1;
      await renderStaticVersion(order, spec, version, instructions);
      await persistStaticRevision(order, spec, version, instructions, "refine");
      onNotice?.(`A IA gerou a ${formatVersion(version)} preservando as versões anteriores.`);
      setAdjustment(null);
      await load();
      await onChanged?.();
    } catch (err: any) {
      onError?.(err?.message || "Erro ao ajustar a peça com IA.");
    } finally {
      setBusyId(null);
    }
  }

  async function generateThumbnail(order: ProductionOrder, refinement?: { instructions: string; target?: string }) {
    setBusyId(order.id);
    try {
      const current = order.metadata?.thumbnail_spec_v2 as VisualSpec | undefined;
      const action = current && refinement ? "refine" : "create";
      const spec = await callVisualAI(
        order,
        action,
        "thumbnail",
        current || null,
        refinement?.instructions || "",
        refinement?.target || "all",
      );
      const item = (spec.items || [])[0];
      if (!item) throw new Error("A IA não retornou direção para a capa.");
      const version = Number(order.metadata?.thumbnail_version || 0) + 1;
      const brand = await prepareBrand(order);
      const rendered = await renderVisualItem({
        provider: order.provider,
        format: order.format,
        assetKind: "thumbnail",
        item,
        index: 0,
        total: 1,
        brand,
      });
      const fileName = `thumbnail-${formatVersion(version).toLowerCase()}.png`;
      await uploadAsset(order, rendered.blob, fileName, "thumbnail", "image", {
        visual_engine: "editorial_native_v2",
        thumbnail_version: version,
        adjustment_instruction: refinement?.instructions || null,
      }, rendered);
      const now = new Date().toISOString();
      const history = Array.isArray(order.metadata?.thumbnail_revision_history)
        ? order.metadata.thumbnail_revision_history
        : [];
      const metadata = {
        ...(order.metadata || {}),
        thumbnail_spec_v2: spec,
        thumbnail_version: version,
        thumbnail_revision_history: [...history, {
          version,
          action,
          instruction: refinement?.instructions || "Geração de capa com regra nativa do formato.",
          created_at: now,
          created_by: userId,
        }].slice(-20),
      };
      const { error } = await supabase.from("marketing_production_orders").update({ metadata, updated_at: now }).eq("id", order.id);
      if (error) throw error;
      onNotice?.(`Capa ${formatVersion(version)} produzida com direção editorial e Brand Kit.`);
      setAdjustment(null);
      await load();
    } catch (err: any) {
      onError?.(err?.message || "Erro ao gerar a capa.");
    } finally {
      setBusyId(null);
    }
  }

  function drawPdfHeader(ctx: CanvasRenderingContext2D, brand: BrandContext, width: number, height: number) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = brand.navy;
    ctx.fillRect(0, 0, width, 20);
    ctx.fillStyle = brand.red;
    ctx.fillRect(0, 20, Math.round(width * 0.14), 6);
    if (brand.logo) fitImage(ctx, brand.logo, 86, 72, 240, 85);
  }

  async function generateScriptPdf(order: ProductionOrder) {
    setBusyId(order.id);
    try {
      const brand = await prepareBrand(order);
      const content = contentById.get(order.content_id);
      const variant = order.variant_id ? variantById.get(order.variant_id) : null;
      const blueprint = order.blueprint || {};
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = 1240;
      const pageH = 1754;
      const pages: HTMLCanvasElement[] = [];
      let canvas: HTMLCanvasElement;
      let ctx: CanvasRenderingContext2D;
      let y = 0;

      const newPage = () => {
        canvas = document.createElement("canvas");
        canvas.width = pageW;
        canvas.height = pageH;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas indisponível.");
        ctx = context;
        drawPdfHeader(ctx, brand, pageW, pageH);
        y = 250;
        pages.push(canvas);
      };
      const ensure = (needed: number) => { if (y + needed > pageH - 150) newPage(); };
      const heading = (text: string) => {
        ensure(90);
        ctx.fillStyle = brand.red;
        ctx.font = `700 25px ${brand.bodyFamily}`;
        ctx.fillText(text.toUpperCase(), 86, y);
        y += 58;
      };
      const paragraph = (text: string, size = 31, bold = false) => {
        if (!text) return;
        ctx.font = `${bold ? 700 : 400} ${size}px ${bold ? brand.titleFamily : brand.bodyFamily}`;
        const lines = wrapLines(ctx, text, pageW - 172);
        lines.forEach((line) => {
          ensure(size * 1.6);
          ctx.fillStyle = brand.navy;
          ctx.fillText(line, 86, y);
          y += size * 1.48;
        });
        y += 18;
      };

      newPage();
      ctx.fillStyle = brand.navy;
      ctx.font = `700 55px ${brand.titleFamily}`;
      wrapLines(ctx, order.title || variant?.title || content?.title || "Roteiro", pageW - 172).slice(0, 4).forEach((line) => {
        ctx.fillText(line, 86, y);
        y += 68;
      });
      y += 24;
      ctx.fillStyle = "#687386";
      ctx.font = `400 25px ${brand.bodyFamily}`;
      ctx.fillText(`${order.provider.toUpperCase()} · ${FORMAT_LABEL[order.format] || order.format} · ${blueprint.duration_seconds || variant?.duration_seconds || "—"}s`, 86, y);
      y += 70;

      if (content?.audience) { heading("Público"); paragraph(content.audience); }
      if (blueprint.objective || content?.objective) { heading("Objetivo"); paragraph(blueprint.objective || content?.objective || ""); }
      heading("Roteiro");
      const cam = blueprint.cam3c || {};
      [
        ["C — Convite", cam.convite],
        ["A — Acordo", cam.acordo],
        ["M1", cam.m1],
        ["M2", cam.m2],
        ["M3", cam.m3],
        ["C — Conclusão", cam.conclusao],
        ["CTA", blueprint.cta || variant?.cta],
      ].forEach(([label, value]) => {
        if (!value) return;
        ensure(120);
        paragraph(String(label), 27, true);
        paragraph(String(value), 30, false);
      });
      if (blueprint.full_script || variant?.script) {
        heading("Roteiro falado completo");
        paragraph(blueprint.full_script || variant?.script || "", 29);
      }
      if (Array.isArray(blueprint.on_screen_texts) && blueprint.on_screen_texts.length) {
        heading("Textos na tela");
        blueprint.on_screen_texts.forEach((item: string) => paragraph(`• ${item}`, 28));
      }
      if (Array.isArray(blueprint.b_roll) && blueprint.b_roll.length) {
        heading("Cortes / B-roll");
        blueprint.b_roll.forEach((item: string) => paragraph(`• ${item}`, 28));
      }

      pages.forEach((page, index) => {
        if (index) doc.addPage();
        doc.addImage(page.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297, undefined, "FAST");
      });
      const blob = doc.output("blob");
      const fileName = `roteiro-${safeName(order.title || "conteudo")}.pdf`;
      saveAs(blob, fileName);
      try {
        await uploadAsset(order, blob, fileName, "script_pdf", "document", { document_type: "recording_script" });
      } catch { /* download remains available */ }
      onNotice?.("Roteiro PDF gerado com o Brand Kit e baixado.");
      await load();
    } catch (err: any) {
      onError?.(err?.message || "Erro ao gerar o roteiro em PDF.");
    } finally {
      setBusyId(null);
    }
  }

  async function analyzeWithAI(order: ProductionOrder) {
    const orderAssets = assetsByOrder.get(order.id) || [];
    const inputs = orderAssets.filter((asset) => ["input_take", "input_audio", "input_broll", "input_reference"].includes(asset.asset_role || ""));
    if (!inputs.length) return onError?.("Envie os takes/cortes antes de pedir a análise da IA.");
    setBusyId(order.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada.");
      const response = await fetch("/api/marketing/production-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ production_order_id: order.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.detail || payload?.message || "Falha ao analisar cortes.");
      onNotice?.("A IA preparou o plano de edição dos takes. A ordem está pronta para o motor de render.");
      await load();
    } catch (err: any) {
      onError?.(err?.message || "Erro na análise de produção por IA.");
    } finally {
      setBusyId(null);
    }
  }

  async function signedContentUrl(asset: AssetRow) {
    const { data, error } = await supabase.storage.from(CONTENT_BUCKET).createSignedUrl(asset.file_path, 10 * 60);
    if (error) throw error;
    return data?.signedUrl || null;
  }

  async function downloadAsset(asset: AssetRow) {
    try {
      const url = await signedContentUrl(asset);
      if (!url) throw new Error("Arquivo indisponível.");
      const response = await fetch(url);
      const blob = await response.blob();
      saveAs(blob, asset.file_name || "arquivo");
    } catch (err: any) {
      onError?.(err?.message || "Erro ao baixar arquivo.");
    }
  }

  function currentOutputAssets(order: ProductionOrder) {
    const orderAssets = assetsByOrder.get(order.id) || [];
    if (isStatic(order)) {
      const version = Number(order.metadata?.visual_version || 0);
      if (!version) return orderAssets.filter((asset) => ["carousel_card", "story_frame", "status_frame", "post_image"].includes(asset.asset_role || ""));
      return orderAssets.filter((asset) => Number(asset.metadata?.visual_version || 0) === version && ["carousel_card", "story_frame", "status_frame", "post_image"].includes(asset.asset_role || ""));
    }
    const thumbVersion = Number(order.metadata?.thumbnail_version || 0);
    return orderAssets.filter((asset) => {
      if (asset.asset_role === "final_video") return true;
      if (asset.asset_role !== "thumbnail") return false;
      return thumbVersion ? Number(asset.metadata?.thumbnail_version || 0) === thumbVersion : true;
    });
  }

  async function downloadZip(order: ProductionOrder) {
    setBusyId(order.id);
    try {
      const outputAssets = currentOutputAssets(order);
      if (!outputAssets.length) throw new Error("Nenhum arquivo final produzido ainda.");
      const zip = new JSZip();
      for (const asset of outputAssets) {
        const url = await signedContentUrl(asset);
        if (!url) continue;
        const blob = await (await fetch(url)).blob();
        zip.file(asset.file_name || asset.id, blob);
      }
      const version = isStatic(order) ? Number(order.metadata?.visual_version || 0) : Number(order.metadata?.thumbnail_version || 0);
      saveAs(await zip.generateAsync({ type: "blob" }), `${safeName(order.title || "producao")}-${version ? formatVersion(version).toLowerCase() : "arquivos"}.zip`);
    } catch (err: any) {
      onError?.(err?.message || "Erro ao montar ZIP.");
    } finally {
      setBusyId(null);
    }
  }

  async function sendForApproval(order: ProductionOrder) {
    if (!order.variant_id || !userId) return onError?.("Esta ordem não está vinculada a uma versão editorial.");
    const currentAssets = currentOutputAssets(order);
    const hasFinal = isVideo(order)
      ? (assetsByOrder.get(order.id) || []).some((asset) => asset.asset_role === "final_video")
      : currentAssets.length > 0;
    if (!hasFinal) return onError?.("Produza ou anexe a peça final antes de enviar para aprovação.");

    setBusyId(order.id);
    try {
      const now = new Date().toISOString();
      const { error: variantError } = await supabase.from("marketing_content_variants").update({
        status: "aprovacao",
        updated_at: now,
      }).eq("id", order.variant_id);
      if (variantError) throw variantError;

      const { error: approvalError } = await supabase.from("marketing_content_approvals").insert({
        variant_id: order.variant_id,
        status: "pending",
        requested_by: userId,
        requested_at: now,
        decision_note: isStatic(order)
          ? `Peça final produzida — ${formatVersion(Number(order.metadata?.visual_version || 0))} — aguardando aprovação de publicação.`
          : "Peça final produzida — aguardando aprovação de publicação.",
      });
      if (approvalError) throw approvalError;

      const metadata = {
        ...(order.metadata || {}),
        approval_visual_version: isStatic(order) ? Number(order.metadata?.visual_version || 0) : null,
        approval_thumbnail_version: isVideo(order) ? Number(order.metadata?.thumbnail_version || 0) : null,
      };
      const { error: orderError } = await supabase.from("marketing_production_orders").update({
        status: "pronto_aprovacao",
        sent_for_approval_at: now,
        metadata,
        updated_at: now,
      }).eq("id", order.id);
      if (orderError) throw orderError;

      onNotice?.("Peça final enviada para a fila de Aprovações.");
      await load();
      await onChanged?.();
    } catch (err: any) {
      onError?.(err?.message || "Erro ao enviar peça para aprovação.");
    } finally {
      setBusyId(null);
    }
  }

  function openAdjustment(order: ProductionOrder, mode: "static" | "thumbnail") {
    setAdjustment({ orderId: order.id, mode, target: "all", instructions: "" });
  }

  function addQuickAdjustment(text: string) {
    setAdjustment((current) => current ? {
      ...current,
      instructions: current.instructions ? `${current.instructions}\n${text}.` : `${text}.`,
    } : current);
  }

  async function submitAdjustment() {
    if (!adjustment?.instructions.trim()) return onError?.("Descreva o ajuste que a IA deve fazer.");
    const order = orders.find((item) => item.id === adjustment.orderId);
    if (!order) return;
    if (adjustment.mode === "thumbnail") {
      await generateThumbnail(order, { instructions: adjustment.instructions.trim(), target: adjustment.target });
      return;
    }
    await refineStatic(order, adjustment.instructions.trim(), adjustment.target);
  }

  async function createNewVariation(order: ProductionOrder) {
    if (!isStatic(order)) return;
    await refineStatic(
      order,
      "Crie uma nova variação visual da peça. Preserve a tese e a sequência lógica, mas mude a composição, o ritmo visual e os layouts para uma alternativa igualmente premium, clean e institucional. Não aumente a quantidade de texto.",
      "all",
    );
  }

  if (loading) {
    return <div className="flex min-h-[260px] items-center justify-center text-[#1E293F]"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando Produção…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2"><Clapperboard className="h-5 w-5 text-[#A11C27]" /><h2 className="text-xl font-semibold text-[#1E293F]">Produção</h2></div>
          <p className="mt-1 max-w-4xl text-sm text-slate-500">Cada formato agora tem regra editorial e visual própria. As versões ficam preservadas e qualquer peça visual pode voltar para a IA com uma orientação de ajuste antes da aprovação final.</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCcw className="mr-2 h-4 w-4" />Atualizar</Button>
      </div>

      <div className="rounded-2xl border border-[#B5A573]/25 bg-[#E0CE8C]/10 p-4">
        <div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 text-[#A11C27]" /><div><p className="text-sm font-semibold text-[#1E293F]">Motor Visual V2</p><p className="mt-1 text-xs leading-5 text-slate-600">Carrossel é tratado como sequência editorial; Stories como conversa; Status como mensagem curta; post estático como uma ideia forte; capas como hook visual. O motor evita repetir o mesmo layout e não usa mais o modelo de “título + subtítulo” em todas as telas.</p></div></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {orders.map((order) => {
          const content = contentById.get(order.content_id);
          const variant = order.variant_id ? variantById.get(order.variant_id) : null;
          const orderAssets = assetsByOrder.get(order.id) || [];
          const inputs = orderAssets.filter((asset) => String(asset.asset_role || "").startsWith("input_"));
          const allOutputs = orderAssets.filter((asset) => OUTPUT_ROLES.has(asset.asset_role || ""));
          const currentOutputs = currentOutputAssets(order);
          const currentVersion = Number(order.metadata?.visual_version || 0);
          const currentThumbVersion = Number(order.metadata?.thumbnail_version || 0);
          const revisionHistory = Array.isArray(order.metadata?.visual_revision_history) ? order.metadata.visual_revision_history : [];
          const thumbHistory = Array.isArray(order.metadata?.thumbnail_revision_history) ? order.metadata.thumbnail_revision_history : [];
          const isBusy = busyId === order.id;
          const isExpanded = expandedId === order.id;
          const showHistory = historyId === order.id;
          const isAdjusting = adjustment?.orderId === order.id;
          const specItems = (order.metadata?.visual_spec_v2?.items || []) as VisualItem[];

          return (
            <Card key={order.id} className="border-[#B5A573]/20 bg-white/95 shadow-sm">
              <CardContent className="p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#1E293F] px-2.5 py-1 text-[10px] font-semibold uppercase text-white">{order.provider}</span>
                      <span className="rounded-full border border-[#B5A573]/35 bg-[#E0CE8C]/15 px-2.5 py-1 text-[10px] font-semibold text-[#1E293F]">{FORMAT_LABEL[order.format] || order.format}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">{STATUS[order.status] || order.status}</span>
                      {isStatic(order) && currentVersion ? <span className="rounded-full bg-[#A11C27]/8 px-2.5 py-1 text-[10px] font-semibold text-[#A11C27]">{formatVersion(currentVersion)}</span> : null}
                      {isVideo(order) && currentThumbVersion ? <span className="rounded-full bg-[#A11C27]/8 px-2.5 py-1 text-[10px] font-semibold text-[#A11C27]">CAPA {formatVersion(currentThumbVersion)}</span> : null}
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-[#1E293F]">{order.title || variant?.title || content?.title || "Peça sem título"}</h3>
                    <p className="mt-1 text-xs text-slate-500">Conteúdo-Mãe: {content?.title || "—"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-slate-50 px-3 py-2"><strong className="block text-lg text-[#1E293F]">{inputs.length}</strong><span className="text-slate-500">insumos</span></div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2"><strong className="block text-lg text-[#1E293F]">{currentOutputs.length}</strong><span className="text-slate-500">saídas atuais</span></div>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Brand Kit da peça</span><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-[#1E293F]" value={order.brand_kit_setting_id || ""} onChange={(event) => setBrandKit(order, event.target.value)}>{brandKits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}{kit.active ? " · ativo" : ""}</option>)}</select></label>
                  <Button variant="outline" onClick={() => setExpandedId(isExpanded ? null : order.id)}><FileText className="mr-2 h-4 w-4" />{isExpanded ? "Ocultar briefing" : "Ver briefing"}</Button>
                </div>

                {isExpanded ? <div className="mt-4 rounded-2xl border border-slate-200 bg-[#F8F8F7] p-4 text-sm text-slate-700"><p className="font-semibold text-[#1E293F]">Roteiro / estrutura aprovada</p><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-sans text-xs leading-5">{variant?.script || order.blueprint?.full_script || JSON.stringify(order.blueprint, null, 2)}</pre>{order.metadata?.visual_spec_v2?.creative_rationale ? <div className="mt-4 border-t border-slate-200 pt-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-[#A11C27]">Direção visual atual</p><p className="mt-1 text-xs leading-5 text-slate-600">{order.metadata.visual_spec_v2.creative_rationale}</p></div> : null}</div> : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {isVideo(order) ? <>
                    <Button disabled={isBusy} variant="outline" onClick={() => generateScriptPdf(order)}>{isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Baixar roteiro PDF</Button>
                    <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-[#1E293F] hover:bg-slate-50"><Upload className="mr-2 h-4 w-4" />Enviar takes/cortes<input type="file" multiple accept="video/*,audio/*,image/*" className="hidden" onChange={(event) => { uploadInputs(order, event.target.files); event.currentTarget.value = ""; }} /></label>
                    <Button disabled={isBusy} variant="outline" onClick={() => generateThumbnail(order)}><ImageIcon className="mr-2 h-4 w-4" />{currentThumbVersion ? "Nova capa" : "Gerar capa"}</Button>
                    {currentThumbVersion ? <Button disabled={isBusy} variant="outline" onClick={() => openAdjustment(order, "thumbnail")}><SlidersHorizontal className="mr-2 h-4 w-4" />Ajustar capa com IA</Button> : null}
                    <Button disabled={isBusy || inputs.length === 0} onClick={() => analyzeWithAI(order)} className="bg-[#1E293F] hover:bg-[#26344f]"><WandSparkles className="mr-2 h-4 w-4" />Analisar cortes com IA</Button>
                    <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-[#B5A573]/50 bg-[#E0CE8C]/10 px-4 text-sm font-medium text-[#1E293F] hover:bg-[#E0CE8C]/20"><PlayCircle className="mr-2 h-4 w-4" />Anexar vídeo final<input type="file" accept="video/*" className="hidden" onChange={(event) => { uploadFinalVideo(order, event.target.files); event.currentTarget.value = ""; }} /></label>
                  </> : null}

                  {isStatic(order) && !currentVersion ? <Button disabled={isBusy} onClick={() => produceStatic(order)} className="bg-[#1E293F] hover:bg-[#26344f]">{isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Palette className="mr-2 h-4 w-4" />}Produzir com Motor Visual V2</Button> : null}
                  {isStatic(order) && currentVersion ? <>
                    <Button disabled={isBusy} onClick={() => openAdjustment(order, "static")} className="bg-[#1E293F] hover:bg-[#26344f]"><WandSparkles className="mr-2 h-4 w-4" />Solicitar ajuste à IA</Button>
                    <Button disabled={isBusy} variant="outline" onClick={() => createNewVariation(order)}><Sparkles className="mr-2 h-4 w-4" />Nova variação</Button>
                  </> : null}

                  {!isVideo(order) && !isStatic(order) ? <Button disabled={isBusy} variant="outline" onClick={() => generateScriptPdf(order)}><FileText className="mr-2 h-4 w-4" />Baixar briefing PDF</Button> : null}
                  {currentOutputs.length ? <Button disabled={isBusy} variant="outline" onClick={() => downloadZip(order)}><FileArchive className="mr-2 h-4 w-4" />Baixar arquivos atuais</Button> : null}
                  {(revisionHistory.length > 1 || thumbHistory.length > 1 || allOutputs.length > currentOutputs.length) ? <Button variant="outline" onClick={() => setHistoryId(showHistory ? null : order.id)}><History className="mr-2 h-4 w-4" />{showHistory ? "Ocultar versões" : "Histórico"}</Button> : null}
                  {currentOutputs.length ? <Button disabled={isBusy || order.status === "pronto_aprovacao"} onClick={() => sendForApproval(order)} className="bg-[#A11C27] hover:bg-[#8b1822]"><Send className="mr-2 h-4 w-4" />Enviar para aprovação</Button> : null}
                </div>

                {isAdjusting ? <div className="mt-4 rounded-2xl border border-[#A11C27]/20 bg-[#A11C27]/[0.025] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#1E293F]">Ajustar {adjustment?.mode === "thumbnail" ? "capa" : "peça"} com IA</p><p className="mt-1 text-xs text-slate-500">Descreva o que deve mudar. A versão atual será preservada.</p></div><button type="button" onClick={() => setAdjustment(null)} className="rounded-full p-1.5 text-slate-400 hover:bg-white"><X className="h-4 w-4" /></button></div>{adjustment?.mode === "static" && specItems.length > 1 ? <label className="mt-3 block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Aplicar em</span><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={adjustment?.target || "all"} onChange={(event) => setAdjustment((current) => current ? { ...current, target: event.target.value } : current)}><option value="all">Toda a peça</option>{specItems.map((item, index) => <option key={index} value={String(index + 1)}>Somente {order.format === "carrossel" ? "card" : "tela"} {index + 1}{item.role ? ` · ${item.role}` : ""}</option>)}</select></label> : null}<div className="mt-3 flex flex-wrap gap-1.5">{QUICK_ADJUSTMENTS.map((item) => <button key={item} type="button" onClick={() => addQuickAdjustment(item)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-600 hover:border-[#B5A573] hover:text-[#1E293F]">{item}</button>)}</div><Textarea rows={4} className="mt-3" value={adjustment?.instructions || ""} onChange={(event) => setAdjustment((current) => current ? { ...current, instructions: event.target.value } : current)} placeholder="Ex.: No card 3, troque o parágrafo por uma comparação em duas colunas. Quero menos texto e mais leitura visual." /><div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => setAdjustment(null)}>Cancelar</Button><Button disabled={isBusy || !adjustment?.instructions.trim()} onClick={submitAdjustment} className="bg-[#A11C27] hover:bg-[#8b1822]">{isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}Gerar nova versão</Button></div></div> : null}

                {order.metadata?.edit_plan ? <div className="mt-4 rounded-2xl border border-[#B5A573]/25 bg-[#E0CE8C]/10 p-4"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#A11C27]" /><p className="text-sm font-semibold text-[#1E293F]">Plano de edição da IA</p></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{typeof order.metadata.edit_plan === "string" ? order.metadata.edit_plan : JSON.stringify(order.metadata.edit_plan, null, 2)}</p></div> : null}

                {currentOutputs.length ? <div className="mt-4"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Arquivos da versão atual</p>{isStatic(order) && currentVersion ? <span className="text-xs font-semibold text-[#A11C27]">{formatVersion(currentVersion)}</span> : null}</div><div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">{currentOutputs.map((asset) => <div key={asset.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">{asset.kind === "image" && previewUrls[asset.id] ? <button type="button" className="block w-full bg-slate-50" onClick={() => window.open(previewUrls[asset.id], "_blank", "noopener,noreferrer")}><img src={previewUrls[asset.id]} alt={asset.file_name || "Peça produzida"} className="aspect-[4/5] w-full object-cover object-top" /></button> : <div className="flex aspect-[4/3] items-center justify-center bg-slate-50"><FileText className="h-8 w-8 text-slate-300" /></div>}<div className="p-3"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-[#A11C27]" /><span className="truncate text-xs font-medium text-[#1E293F]">{asset.file_name || asset.asset_role}</span></div><div className="mt-2 flex gap-1.5"><Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={() => downloadAsset(asset)}><Download className="mr-1.5 h-3.5 w-3.5" />Baixar</Button>{previewUrls[asset.id] ? <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => window.open(previewUrls[asset.id], "_blank", "noopener,noreferrer")}><Eye className="h-3.5 w-3.5" /></Button> : null}</div></div></div>)}</div></div> : null}

                {showHistory ? <div className="mt-4 rounded-2xl border border-slate-200 bg-[#F8F8F7] p-4"><p className="text-sm font-semibold text-[#1E293F]">Histórico de versões</p><div className="mt-3 space-y-2">{[...revisionHistory, ...thumbHistory.map((item: any) => ({ ...item, thumbnail: true }))].sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).map((item: any, index: number) => <div key={`${item.thumbnail ? "thumb" : "visual"}-${item.version}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[#A11C27]">{item.thumbnail ? "CAPA " : ""}{formatVersion(Number(item.version || 0))}</span><span className="text-[10px] text-slate-400">{item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : ""}</span></div><p className="mt-1 text-xs leading-5 text-slate-600">{item.instruction || "Geração sem instrução registrada."}</p></div>)}</div><p className="mt-3 text-[11px] text-slate-400">Os arquivos antigos continuam preservados no Storage. O ZIP e a aprovação usam somente a versão atual.</p></div> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!orders.length ? <div className="rounded-2xl border border-dashed border-[#B5A573]/40 bg-white p-10 text-center"><Clapperboard className="mx-auto h-8 w-8 text-[#B5A573]" /><p className="mt-3 font-medium text-[#1E293F]">Nenhuma ordem de produção</p><p className="mt-1 text-sm text-slate-500">Quando um conteúdo for aprovado editorialmente, as peças escolhidas aparecerão aqui para fabricação.</p></div> : null}

      <div className="rounded-2xl border border-[#B5A573]/20 bg-white p-4 text-xs leading-5 text-slate-500"><strong className="text-[#1E293F]">Vídeo:</strong> o fluxo continua recebendo takes, gerando roteiro institucional, capa e plano de edição. O renderizador multiclipes ainda não está conectado; o sistema não finge uma edição que não aconteceu. <strong className="text-[#1E293F]">Artes estáticas:</strong> a direção, composição e revisões por IA já funcionam dentro da Produção e cada nova versão é preservada.</div>
    </div>
  );
}
