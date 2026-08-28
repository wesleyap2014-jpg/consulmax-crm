import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  CheckCircle2,
  Clapperboard,
  Download,
  FileArchive,
  FileText,
  Image as ImageIcon,
  Loader2,
  Palette,
  PlayCircle,
  RefreshCcw,
  Send,
  Sparkles,
  Upload,
  WandSparkles,
} from "lucide-react";

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

type ContentRow = { id: string; title: string; objective: string | null; audience: string | null; ai_context: Record<string, any> | null };
type VariantRow = { id: string; content_id: string; title: string | null; hook: string | null; script: string | null; caption: string | null; cta: string | null; duration_seconds: number | null; aspect_ratio: string | null; status: string };
type AssetRow = { id: string; content_id: string | null; variant_id: string | null; production_order_id: string | null; kind: string; asset_role: string | null; file_path: string; file_name: string | null; mime_type: string | null; created_at: string };
type BrandKit = { id: string; name: string; payload: Record<string, any>; active: boolean };
type BrandAsset = { id: string; setting_id: string; asset_type: string; role: string; file_path: string; file_name: string; mime_type: string | null; metadata: Record<string, any>; is_primary: boolean; active: boolean };

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
  post: "Post",
  artigo: "Artigo",
  status: "Status",
};

const VIDEO_FORMATS = new Set(["reel", "video", "short", "youtube_long"]);
const STATIC_FORMATS = new Set(["carrossel", "stories", "status"]);

function safeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120);
}

function isVideo(order: ProductionOrder) { return VIDEO_FORMATS.has(String(order.format).toLowerCase()); }
function isStatic(order: ProductionOrder) { return STATIC_FORMATS.has(String(order.format).toLowerCase()); }

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const paragraphs = String(text || "").split(/\n+/);
  const lines: string[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    });
    if (line) lines.push(line);
    if (paragraphIndex < paragraphs.length - 1) lines.push("");
  });
  return lines;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao gerar imagem.")), "image/png", 1));
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

export default function ProductionWorkspace({ userId, onChanged, onNotice, onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [ordersRes, contentsRes, variantsRes, assetsRes, kitsRes, brandAssetsRes] = await Promise.all([
        supabase.from("marketing_production_orders").select("*").order("created_at", { ascending: false }),
        supabase.from("marketing_content_items").select("id,title,objective,audience,ai_context").order("created_at", { ascending: false }).limit(200),
        supabase.from("marketing_content_variants").select("id,content_id,title,hook,script,caption,cta,duration_seconds,aspect_ratio,status").order("created_at", { ascending: false }).limit(500),
        supabase.from("marketing_content_assets").select("id,content_id,variant_id,production_order_id,kind,asset_role,file_path,file_name,mime_type,created_at").order("created_at", { ascending: true }).limit(1000),
        supabase.from("marketing_content_settings").select("id,name,payload,active").eq("setting_type", "brand_kit").order("created_at", { ascending: true }),
        supabase.from("marketing_brand_assets").select("id,setting_id,asset_type,role,file_path,file_name,mime_type,metadata,is_primary,active").eq("active", true).order("is_primary", { ascending: false }),
      ]);
      const firstError = [ordersRes, contentsRes, variantsRes, assetsRes, kitsRes, brandAssetsRes].find((item) => item.error)?.error;
      if (firstError) throw firstError;
      setOrders((ordersRes.data || []) as ProductionOrder[]);
      setContents((contentsRes.data || []) as ContentRow[]);
      setVariants((variantsRes.data || []) as VariantRow[]);
      setAssets((assetsRes.data || []) as AssetRow[]);
      setBrandKits((kitsRes.data || []) as BrandKit[]);
      setBrandAssets((brandAssetsRes.data || []) as BrandAsset[]);
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
    return brandKits.find((kit) => kit.id === order.brand_kit_setting_id) || brandKits.find((kit) => kit.active) || brandKits[0] || null;
  }

  async function signedBrandAsset(asset: BrandAsset | undefined) {
    if (!asset) return null;
    const { data, error } = await supabase.storage.from(BRAND_BUCKET).createSignedUrl(asset.file_path, 15 * 60);
    if (error) throw error;
    return data?.signedUrl || null;
  }

  async function prepareBrand(order: ProductionOrder) {
    const kit = kitFor(order);
    const kitAssets = brandAssets.filter((asset) => asset.setting_id === kit?.id);
    const primaryLogo = kitAssets.find((asset) => asset.asset_type === "logo" && asset.is_primary) || kitAssets.find((asset) => asset.asset_type === "logo" && (asset.metadata?.background_context === "light" || asset.metadata?.background_context === "any")) || kitAssets.find((asset) => asset.asset_type === "logo");
    const titleFont = kitAssets.find((asset) => asset.asset_type === "font" && asset.role === "fonte_titulo") || kitAssets.find((asset) => asset.asset_type === "font");
    const bodyFont = kitAssets.find((asset) => asset.asset_type === "font" && asset.role === "fonte_corpo") || titleFont;
    const [logoUrl, titleFontUrl, bodyFontUrl] = await Promise.all([signedBrandAsset(primaryLogo), signedBrandAsset(titleFont), signedBrandAsset(bodyFont)]);
    const stamp = order.id.replace(/-/g, "").slice(0, 8);
    const titleFamily = `BrandTitle_${stamp}`;
    const bodyFamily = `BrandBody_${stamp}`;
    if (titleFontUrl) {
      try { const font = new FontFace(titleFamily, `url(${titleFontUrl})`); await font.load(); document.fonts.add(font); } catch { /* browser fallback */ }
    }
    if (bodyFontUrl) {
      try { const font = new FontFace(bodyFamily, `url(${bodyFontUrl})`); await font.load(); document.fonts.add(font); } catch { /* browser fallback */ }
    }
    const colors = Array.isArray(kit?.payload?.colors) && kit!.payload.colors.length >= 4 ? kit!.payload.colors : FALLBACK_COLORS;
    return {
      kit,
      logoUrl,
      logo: logoUrl ? await loadImage(logoUrl) : null,
      titleFamily: titleFontUrl ? titleFamily : "Arial",
      bodyFamily: bodyFontUrl ? bodyFamily : "Arial",
      navy: colors[0] || FALLBACK_COLORS[0],
      red: colors[1] || FALLBACK_COLORS[1],
      gold: colors[2] || FALLBACK_COLORS[2],
      lightGold: colors[3] || FALLBACK_COLORS[3],
      offWhite: colors[4] || FALLBACK_COLORS[4],
    };
  }

  async function setBrandKit(order: ProductionOrder, settingId: string) {
    const { error } = await supabase.from("marketing_production_orders").update({ brand_kit_setting_id: settingId || null, updated_at: new Date().toISOString() }).eq("id", order.id);
    if (error) return onError?.(error.message);
    await load();
  }

  async function uploadAsset(order: ProductionOrder, file: File | Blob, fileName: string, role: string, kind: string) {
    if (!userId) throw new Error("Usuário não identificado.");
    const path = `${userId}/production/${order.id}/${Date.now()}-${safeName(fileName)}`;
    const contentType = file instanceof File ? file.type : (role === "final_video" ? "video/mp4" : role === "script_pdf" ? "application/pdf" : "image/png");
    const { error: uploadError } = await supabase.storage.from(CONTENT_BUCKET).upload(path, file, { upsert: false, contentType: contentType || undefined });
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
      metadata: { source: "production_factory_v1", generated_at: new Date().toISOString() },
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
        const role = file.type.startsWith("video/") ? "input_take" : file.type.startsWith("audio/") ? "input_audio" : file.type.startsWith("image/") ? "input_broll" : "input_reference";
        const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") ? "image" : "other";
        await uploadAsset(order, file, file.name, role, kind);
      }
      await supabase.from("marketing_production_orders").update({ status: "recebendo_cortes", updated_at: new Date().toISOString() }).eq("id", order.id);
      onNotice?.(`${files.length} arquivo(s) recebido(s). Os takes agora pertencem a esta ordem de produção.`);
      await load();
      await onChanged?.();
    } catch (err: any) { onError?.(err?.message || "Erro ao enviar os arquivos de produção."); }
    finally { setBusyId(null); }
  }

  async function uploadFinalVideo(order: ProductionOrder, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusyId(order.id);
    try {
      await uploadAsset(order, file, file.name, "final_video", "video");
      await supabase.from("marketing_production_orders").update({ status: "em_revisao", produced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", order.id);
      onNotice?.("Vídeo final anexado. A peça está em revisão e pode seguir para aprovação final.");
      await load();
    } catch (err: any) { onError?.(err?.message || "Erro ao anexar o vídeo final."); }
    finally { setBusyId(null); }
  }

  function drawBrandHeader(ctx: CanvasRenderingContext2D, brand: any, width: number, height: number) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = brand.navy;
    ctx.fillRect(0, 0, width, Math.max(18, Math.round(height * 0.012)));
    ctx.fillStyle = brand.red;
    ctx.fillRect(0, Math.max(18, Math.round(height * 0.012)), Math.round(width * 0.16), Math.max(7, Math.round(height * 0.004)));
    if (brand.logo) fitImage(ctx, brand.logo, Math.round(width * 0.075), Math.round(height * 0.055), Math.round(width * 0.31), Math.round(height * 0.075));
  }

  async function renderCard(order: ProductionOrder, index: number, total: number, title: string, text: string, role: string) {
    const brand = await prepareBrand(order);
    const isStory = order.format === "stories" || order.format === "status";
    const width = 1080;
    const height = isStory ? 1920 : 1350;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível neste navegador.");
    drawBrandHeader(ctx, brand, width, height);

    const x = 82;
    const maxW = width - 164;
    const isCover = index === 0;
    const titleSize = isCover ? (isStory ? 74 : 68) : (isStory ? 58 : 52);
    let y = isStory ? 440 : 350;
    ctx.fillStyle = brand.red;
    ctx.font = `700 ${isStory ? 22 : 18}px ${brand.bodyFamily}`;
    ctx.fillText(isCover ? "CONTEÚDO" : `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, x, y - 90);

    ctx.fillStyle = brand.navy;
    ctx.font = `700 ${titleSize}px ${brand.titleFamily}`;
    const titleLines = wrapLines(ctx, title || "", maxW);
    titleLines.slice(0, isStory ? 7 : 5).forEach((line) => { ctx.fillText(line, x, y); y += titleSize * 1.16; });

    if (text && text !== title) {
      y += isStory ? 62 : 50;
      ctx.fillStyle = "#445066";
      ctx.font = `400 ${isStory ? 34 : 30}px ${brand.bodyFamily}`;
      const textLines = wrapLines(ctx, text, maxW);
      textLines.slice(0, isStory ? 11 : 8).forEach((line) => { ctx.fillText(line, x, y); y += (isStory ? 52 : 46); });
    }

    ctx.fillStyle = brand.gold;
    ctx.fillRect(x, height - (isStory ? 220 : 150), 92, 6);
    ctx.fillStyle = brand.navy;
    ctx.font = `600 ${isStory ? 22 : 18}px ${brand.bodyFamily}`;
    const footer = brand.kit?.name || "Brand Kit";
    ctx.fillText(footer, x, height - (isStory ? 165 : 105));
    return { blob: await canvasToBlob(canvas), width, height, brand };
  }

  async function produceStatic(order: ProductionOrder) {
    setBusyId(order.id);
    try {
      await supabase.from("marketing_production_orders").update({ status: "produzindo", started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", order.id);
      const blueprint = order.blueprint || {};
      let items: Array<{ title: string; text: string; role: string }> = [];
      if (order.format === "carrossel") {
        items = (Array.isArray(blueprint.cards) ? blueprint.cards : []).map((card: any, i: number) => ({ title: card.title || (i === 0 ? blueprint.title : `Card ${i + 1}`), text: card.text || card.content || "", role: "carousel_card" }));
      } else if (order.format === "stories" || order.format === "status") {
        const source = Array.isArray(blueprint.frames) ? blueprint.frames : Array.isArray(blueprint.status_sequence) ? blueprint.status_sequence : [];
        items = source.map((frame: any, i: number) => ({ title: typeof frame === "string" ? frame : frame.title || `Story ${i + 1}`, text: typeof frame === "string" ? "" : frame.content || frame.text || frame.interaction || "", role: order.format === "status" ? "status_frame" : "story_frame" }));
      }
      if (!items.length) throw new Error("Esta peça ainda não tem estrutura visual suficiente para ser produzida.");

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const rendered = await renderCard(order, index, items.length, item.title, item.text, item.role);
        const fileName = `${order.format}-${String(index + 1).padStart(2, "0")}.png`;
        await uploadAsset(order, rendered.blob, fileName, item.role, "image");
      }
      await supabase.from("marketing_production_orders").update({ status: "em_revisao", produced_at: new Date().toISOString(), metadata: { ...(order.metadata || {}), visual_engine: "brand_canvas_v1", output_count: items.length }, updated_at: new Date().toISOString() }).eq("id", order.id);
      onNotice?.(`${items.length} peça(s) produzida(s) no Brand Kit e enviadas para revisão.`);
      await load();
      await onChanged?.();
    } catch (err: any) {
      await supabase.from("marketing_production_orders").update({ status: "falhou", metadata: { ...(order.metadata || {}), last_error: err?.message || "Falha na produção" }, updated_at: new Date().toISOString() }).eq("id", order.id);
      onError?.(err?.message || "Erro ao produzir a peça.");
      await load();
    } finally { setBusyId(null); }
  }

  async function generateThumbnail(order: ProductionOrder) {
    setBusyId(order.id);
    try {
      const blueprint = order.blueprint || {};
      const title = blueprint.thumb || blueprint.on_screen_hook || order.title || "Conteúdo";
      const rendered = await renderCard(order, 0, 1, title, "", "thumbnail");
      await uploadAsset(order, rendered.blob, "thumbnail.png", "thumbnail", "image");
      onNotice?.("Capa produzida com o Brand Kit oficial.");
      await load();
    } catch (err: any) { onError?.(err?.message || "Erro ao gerar a capa."); }
    finally { setBusyId(null); }
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
      const pageCanvases: HTMLCanvasElement[] = [];
      let canvas: HTMLCanvasElement;
      let ctx: CanvasRenderingContext2D;
      let y = 0;

      const newPage = () => {
        canvas = document.createElement("canvas"); canvas.width = pageW; canvas.height = pageH;
        const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas indisponível."); ctx = context;
        drawBrandHeader(ctx, brand, pageW, pageH);
        y = 250;
        pageCanvases.push(canvas);
      };
      const ensure = (needed: number) => { if (y + needed > pageH - 150) newPage(); };
      const heading = (text: string) => {
        ensure(90); ctx.fillStyle = brand.red; ctx.font = `700 25px ${brand.bodyFamily}`; ctx.fillText(text.toUpperCase(), 86, y); y += 58;
      };
      const paragraph = (text: string, size = 31, bold = false) => {
        if (!text) return;
        ctx.font = `${bold ? 700 : 400} ${size}px ${bold ? brand.titleFamily : brand.bodyFamily}`;
        const lines = wrapLines(ctx, text, pageW - 172);
        lines.forEach((line) => { ensure(size * 1.6); ctx.fillStyle = brand.navy; ctx.fillText(line, 86, y); y += size * 1.48; });
        y += 18;
      };
      newPage();
      ctx.fillStyle = brand.navy; ctx.font = `700 55px ${brand.titleFamily}`;
      wrapLines(ctx, order.title || variant?.title || content?.title || "Roteiro", pageW - 172).slice(0, 4).forEach((line) => { ctx.fillText(line, 86, y); y += 68; });
      y += 24;
      ctx.fillStyle = "#687386"; ctx.font = `400 25px ${brand.bodyFamily}`;
      ctx.fillText(`${order.provider.toUpperCase()} · ${FORMAT_LABEL[order.format] || order.format} · ${blueprint.duration_seconds || variant?.duration_seconds || "—"}s`, 86, y); y += 70;
      if (content?.audience) { heading("Público"); paragraph(content.audience); }
      if (blueprint.objective || content?.objective) { heading("Objetivo"); paragraph(blueprint.objective || content?.objective || ""); }
      heading("Roteiro");
      const cam = blueprint.cam3c || {};
      [["C — Convite", cam.convite], ["A — Acordo", cam.acordo], ["M1", cam.m1], ["M2", cam.m2], ["M3", cam.m3], ["C — Conclusão", cam.conclusao], ["CTA", blueprint.cta || variant?.cta]].forEach(([label, value]) => {
        if (!value) return; ensure(120); paragraph(String(label), 27, true); paragraph(String(value), 30, false);
      });
      if (blueprint.full_script || variant?.script) { heading("Roteiro falado completo"); paragraph(blueprint.full_script || variant?.script || "", 29); }
      if (Array.isArray(blueprint.on_screen_texts) && blueprint.on_screen_texts.length) { heading("Textos na tela"); blueprint.on_screen_texts.forEach((item: string) => paragraph(`• ${item}`, 28)); }
      if (Array.isArray(blueprint.b_roll) && blueprint.b_roll.length) { heading("Cortes / B-roll"); blueprint.b_roll.forEach((item: string) => paragraph(`• ${item}`, 28)); }

      pageCanvases.forEach((page, index) => {
        if (index) doc.addPage();
        doc.addImage(page.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297, undefined, "FAST");
      });
      const blob = doc.output("blob");
      const fileName = `roteiro-${safeName(order.title || "conteudo")}.pdf`;
      saveAs(blob, fileName);
      try { await uploadAsset(order, blob, fileName, "script_pdf", "document"); } catch { /* download remains available even if archival upload fails */ }
      onNotice?.("Roteiro PDF gerado com o Brand Kit e baixado.");
      await load();
    } catch (err: any) { onError?.(err?.message || "Erro ao gerar o roteiro em PDF."); }
    finally { setBusyId(null); }
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
    } catch (err: any) { onError?.(err?.message || "Erro na análise de produção por IA."); }
    finally { setBusyId(null); }
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
    } catch (err: any) { onError?.(err?.message || "Erro ao baixar arquivo."); }
  }

  async function downloadZip(order: ProductionOrder) {
    setBusyId(order.id);
    try {
      const outputAssets = (assetsByOrder.get(order.id) || []).filter((asset) => ["carousel_card", "story_frame", "status_frame", "thumbnail", "final_video"].includes(asset.asset_role || ""));
      if (!outputAssets.length) throw new Error("Nenhum arquivo final produzido ainda.");
      const zip = new JSZip();
      for (const asset of outputAssets) {
        const url = await signedContentUrl(asset);
        if (!url) continue;
        const blob = await (await fetch(url)).blob();
        zip.file(asset.file_name || `${asset.id}`, blob);
      }
      saveAs(await zip.generateAsync({ type: "blob" }), `${safeName(order.title || "producao")}.zip`);
    } catch (err: any) { onError?.(err?.message || "Erro ao montar ZIP."); }
    finally { setBusyId(null); }
  }

  async function sendForApproval(order: ProductionOrder) {
    if (!order.variant_id || !userId) return onError?.("Esta ordem não está vinculada a uma versão editorial.");
    const orderAssets = assetsByOrder.get(order.id) || [];
    const hasFinal = isVideo(order)
      ? orderAssets.some((asset) => asset.asset_role === "final_video")
      : orderAssets.some((asset) => ["carousel_card", "story_frame", "status_frame", "thumbnail"].includes(asset.asset_role || ""));
    if (!hasFinal) return onError?.("Produza ou anexe a peça final antes de enviar para aprovação.");
    setBusyId(order.id);
    try {
      const now = new Date().toISOString();
      const { error: variantError } = await supabase.from("marketing_content_variants").update({ status: "aprovacao", updated_at: now }).eq("id", order.variant_id);
      if (variantError) throw variantError;
      const { error: approvalError } = await supabase.from("marketing_content_approvals").insert({ variant_id: order.variant_id, status: "pending", requested_by: userId, requested_at: now, decision_note: "Peça final produzida — aguardando aprovação de publicação." });
      if (approvalError) throw approvalError;
      const { error: orderError } = await supabase.from("marketing_production_orders").update({ status: "pronto_aprovacao", sent_for_approval_at: now, updated_at: now }).eq("id", order.id);
      if (orderError) throw orderError;
      onNotice?.("Peça final enviada para a fila de Aprovações.");
      await load();
      await onChanged?.();
    } catch (err: any) { onError?.(err?.message || "Erro ao enviar peça para aprovação."); }
    finally { setBusyId(null); }
  }

  if (loading) return <div className="flex min-h-[260px] items-center justify-center text-[#1E293F]"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando Produção…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2"><Clapperboard className="h-5 w-5 text-[#A11C27]" /><h2 className="text-xl font-semibold text-[#1E293F]">Produção</h2></div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Aqui o conteúdo aprovado vira peça real. Roteiros, takes, capas, carrosséis e arquivos finais ficam centralizados por ordem de produção.</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCcw className="mr-2 h-4 w-4" />Atualizar</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {orders.map((order) => {
          const content = contentById.get(order.content_id);
          const variant = order.variant_id ? variantById.get(order.variant_id) : null;
          const orderAssets = assetsByOrder.get(order.id) || [];
          const inputs = orderAssets.filter((asset) => String(asset.asset_role || "").startsWith("input_"));
          const outputs = orderAssets.filter((asset) => ["carousel_card", "story_frame", "status_frame", "thumbnail", "final_video"].includes(asset.asset_role || ""));
          const isBusy = busyId === order.id;
          const isExpanded = expandedId === order.id;
          return (
            <Card key={order.id} className="border-[#B5A573]/20 bg-white/95 shadow-sm">
              <CardContent className="p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#1E293F] px-2.5 py-1 text-[10px] font-semibold uppercase text-white">{order.provider}</span>
                      <span className="rounded-full border border-[#B5A573]/35 bg-[#E0CE8C]/15 px-2.5 py-1 text-[10px] font-semibold text-[#1E293F]">{FORMAT_LABEL[order.format] || order.format}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">{STATUS[order.status] || order.status}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-[#1E293F]">{order.title || variant?.title || content?.title || "Peça sem título"}</h3>
                    <p className="mt-1 text-xs text-slate-500">Conteúdo-Mãe: {content?.title || "—"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-slate-50 px-3 py-2"><strong className="block text-lg text-[#1E293F]">{inputs.length}</strong><span className="text-slate-500">insumos</span></div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2"><strong className="block text-lg text-[#1E293F]">{outputs.length}</strong><span className="text-slate-500">saídas</span></div>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Brand Kit da peça</span><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-[#1E293F]" value={order.brand_kit_setting_id || ""} onChange={(e) => setBrandKit(order, e.target.value)}>{brandKits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}{kit.active ? " · ativo" : ""}</option>)}</select></label>
                  <Button variant="outline" onClick={() => setExpandedId(isExpanded ? null : order.id)}><FileText className="mr-2 h-4 w-4" />{isExpanded ? "Ocultar briefing" : "Ver briefing"}</Button>
                </div>

                {isExpanded ? <div className="mt-4 rounded-2xl border border-slate-200 bg-[#F8F8F7] p-4 text-sm text-slate-700"><p className="font-semibold text-[#1E293F]">Roteiro / estrutura aprovada</p><pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-5">{variant?.script || order.blueprint?.full_script || JSON.stringify(order.blueprint, null, 2)}</pre></div> : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {isVideo(order) ? <>
                    <Button disabled={isBusy} variant="outline" onClick={() => generateScriptPdf(order)}>{isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Baixar roteiro PDF</Button>
                    <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-[#1E293F] hover:bg-slate-50"><Upload className="mr-2 h-4 w-4" />Enviar takes/cortes<input type="file" multiple accept="video/*,audio/*,image/*" className="hidden" onChange={(e) => { uploadInputs(order, e.target.files); e.currentTarget.value = ""; }} /></label>
                    <Button disabled={isBusy} variant="outline" onClick={() => generateThumbnail(order)}><ImageIcon className="mr-2 h-4 w-4" />Gerar capa</Button>
                    <Button disabled={isBusy || inputs.length === 0} onClick={() => analyzeWithAI(order)} className="bg-[#1E293F] hover:bg-[#26344f]"><WandSparkles className="mr-2 h-4 w-4" />Analisar cortes com IA</Button>
                    <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-[#B5A573]/50 bg-[#E0CE8C]/10 px-4 text-sm font-medium text-[#1E293F] hover:bg-[#E0CE8C]/20"><PlayCircle className="mr-2 h-4 w-4" />Anexar vídeo final<input type="file" accept="video/*" className="hidden" onChange={(e) => { uploadFinalVideo(order, e.target.files); e.currentTarget.value = ""; }} /></label>
                  </> : null}
                  {isStatic(order) ? <Button disabled={isBusy} onClick={() => produceStatic(order)} className="bg-[#1E293F] hover:bg-[#26344f]">{isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Palette className="mr-2 h-4 w-4" />}Produzir peças</Button> : null}
                  {!isVideo(order) && !isStatic(order) ? <Button disabled={isBusy} variant="outline" onClick={() => generateScriptPdf(order)}><FileText className="mr-2 h-4 w-4" />Baixar briefing PDF</Button> : null}
                  {outputs.length ? <Button disabled={isBusy} variant="outline" onClick={() => downloadZip(order)}><FileArchive className="mr-2 h-4 w-4" />Baixar arquivos</Button> : null}
                  {outputs.length ? <Button disabled={isBusy || order.status === "pronto_aprovacao"} onClick={() => sendForApproval(order)} className="bg-[#A11C27] hover:bg-[#8b1822]"><Send className="mr-2 h-4 w-4" />Enviar para aprovação</Button> : null}
                </div>

                {order.metadata?.edit_plan ? <div className="mt-4 rounded-2xl border border-[#B5A573]/25 bg-[#E0CE8C]/10 p-4"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#A11C27]" /><p className="text-sm font-semibold text-[#1E293F]">Plano de edição da IA</p></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{typeof order.metadata.edit_plan === "string" ? order.metadata.edit_plan : JSON.stringify(order.metadata.edit_plan, null, 2)}</p></div> : null}

                {outputs.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">{outputs.slice(-9).map((asset) => <button key={asset.id} type="button" onClick={() => downloadAsset(asset)} className="rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#A11C27]" /><span className="truncate text-xs font-medium text-[#1E293F]">{asset.file_name || asset.asset_role}</span></div><p className="mt-1 text-[10px] text-slate-400">{asset.asset_role}</p></button>)}</div> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!orders.length ? <div className="rounded-2xl border border-dashed border-[#B5A573]/40 bg-white p-10 text-center"><Clapperboard className="mx-auto h-8 w-8 text-[#B5A573]" /><p className="mt-3 font-medium text-[#1E293F]">Nenhuma ordem de produção</p><p className="mt-1 text-sm text-slate-500">Quando um conteúdo for aprovado editorialmente, as peças escolhidas aparecerão aqui para fabricação.</p></div> : null}

      <div className="rounded-2xl border border-[#B5A573]/20 bg-white p-4 text-xs leading-5 text-slate-500"><strong className="text-[#1E293F]">Motor de vídeo:</strong> a fábrica já recebe os takes, gera o roteiro institucional, produz a capa e cria o plano de edição por IA. O arquivo de vídeo final ainda precisa ser anexado enquanto o renderizador multiclipes não estiver conectado; o sistema não simula uma edição que não aconteceu.</div>
    </div>
  );
}
