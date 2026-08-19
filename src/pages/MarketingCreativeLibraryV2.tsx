import React, { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Check,
  Copy,
  Download,
  File,
  FileImage,
  Film,
  Images,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

type CampaignRef = { id: string; name: string };

type Creative = {
  id: string;
  campaign_id: string | null;
  title: string;
  description: string | null;
  segment: string | null;
  channel: string | null;
  channels?: string[] | null;
  format: string | null;
  caption: string | null;
  usage_instructions: string | null;
  file_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  visibility: "todos" | "parceiros" | "colaboradores";
  status: "rascunho" | "aprovacao" | "publicado" | "arquivado";
  valid_until: string | null;
  created_at: string;
};

type CreativeAsset = {
  id: string;
  creative_id: string;
  position: number;
  file_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  file_name: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
};

type FileMeta = {
  file: File;
  width: number | null;
  height: number | null;
  duration: number | null;
};

type FormatConfig = {
  label: string;
  kind: "image" | "video" | "document";
  min: number;
  max: number;
  ratio?: number;
  ratioLabel?: string;
  recommended?: string;
  accept: string;
  hint: string;
};

const CHANNELS = ["Instagram", "WhatsApp", "Facebook", "LinkedIn", "TikTok", "YouTube", "E-mail", "Interno"];
const SEGMENTS = ["Institucional", "Imóveis", "Automóveis", "Pesados", "Agronegócio", "Investimento", "Parceiros", "Pós-venda"];

const FORMAT_CONFIG: Record<string, FormatConfig> = {
  Feed: {
    label: "Feed",
    kind: "image",
    min: 1,
    max: 1,
    ratio: 4 / 5,
    ratioLabel: "4:5",
    recommended: "1080 × 1350 px",
    accept: "image/jpeg,image/png,image/webp",
    hint: "Uma única imagem vertical para feed.",
  },
  Carrossel: {
    label: "Carrossel",
    kind: "image",
    min: 2,
    max: 20,
    ratio: 4 / 5,
    ratioLabel: "4:5",
    recommended: "1080 × 1350 px por página",
    accept: "image/jpeg,image/png,image/webp",
    hint: "Envie todas as páginas de uma vez, na ordem em que serão publicadas.",
  },
  Stories: {
    label: "Stories",
    kind: "image",
    min: 1,
    max: 20,
    ratio: 9 / 16,
    ratioLabel: "9:16",
    recommended: "1080 × 1920 px",
    accept: "image/jpeg,image/png,image/webp",
    hint: "Uma ou várias telas verticais para Stories/Status.",
  },
  Reels: {
    label: "Reels",
    kind: "video",
    min: 1,
    max: 1,
    ratio: 9 / 16,
    ratioLabel: "9:16",
    recommended: "1080 × 1920 px",
    accept: "video/mp4,video/quicktime,video/webm",
    hint: "Um vídeo vertical por criativo.",
  },
  Card: {
    label: "Card",
    kind: "image",
    min: 1,
    max: 1,
    ratio: 1,
    ratioLabel: "1:1",
    recommended: "1080 × 1080 px",
    accept: "image/jpeg,image/png,image/webp",
    hint: "Uma arte quadrada para distribuição geral.",
  },
  "Vídeo": {
    label: "Vídeo",
    kind: "video",
    min: 1,
    max: 1,
    accept: "video/mp4,video/quicktime,video/webm",
    hint: "Vídeo avulso sem proporção obrigatória.",
  },
  Documento: {
    label: "Documento",
    kind: "document",
    min: 1,
    max: 1,
    accept: "application/pdf,image/jpeg,image/png,image/webp",
    hint: "PDF ou imagem de apoio.",
  },
};

const FORMAT_TABS = ["Todos", "Feed", "Carrossel", "Stories", "Reels", "Card", "Vídeo", "Outros"];

function normalizeFormat(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "Outros";
  if (raw.toLowerCase() === "story") return "Stories";
  if (raw.toLowerCase() === "carousel") return "Carrossel";
  return FORMAT_CONFIG[raw] ? raw : "Outros";
}

function brDate(value?: string | null) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 140);
}

function isImage(mime?: string | null) {
  return Boolean(mime?.startsWith("image/"));
}

function isVideo(mime?: string | null) {
  return Boolean(mime?.startsWith("video/"));
}

async function mediaMeta(file: File): Promise<FileMeta> {
  if (file.type.startsWith("image/")) {
    const url = URL.createObjectURL(file);
    try {
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
        image.src = url;
      });
      return { file, ...size, duration: null };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  if (file.type.startsWith("video/")) {
    const url = URL.createObjectURL(file);
    try {
      const size = await new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration || 0 });
        video.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
        video.src = url;
      });
      return { file, ...size };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return { file, width: null, height: null, duration: null };
}

function formatIcon(format: string) {
  if (format === "Reels" || format === "Vídeo") return Film;
  if (format === "Carrossel" || format === "Stories") return Images;
  if (format === "Documento") return File;
  return FileImage;
}

export default function MarketingCreativeLibraryV2({
  canManage,
  campaigns,
  userId,
  onChanged,
}: {
  canManage: boolean;
  campaigns: CampaignRef[];
  userId: string | null;
  onChanged?: () => void;
}) {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [assets, setAssets] = useState<CreativeAsset[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [detail, setDetail] = useState<Creative | null>(null);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("todos");
  const [campaign, setCampaign] = useState("todos");
  const [formatTab, setFormatTab] = useState("Todos");
  const [selectedFiles, setSelectedFiles] = useState<FileMeta[]>([]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    campaign_id: "",
    segment: "Institucional",
    channels: ["Instagram"] as string[],
    format: "Feed",
    caption: "",
    usage_instructions: "",
    external_url: "",
    visibility: "todos" as Creative["visibility"],
    status: "publicado" as Creative["status"],
    valid_until: "",
  });

  const config = FORMAT_CONFIG[form.format] || FORMAT_CONFIG.Feed;

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    const [creativeRes, assetRes] = await Promise.all([
      supabase.from("marketing_creatives").select("*").order("created_at", { ascending: false }),
      supabase.from("marketing_creative_assets").select("*").order("position", { ascending: true }),
    ]);
    const firstError = creativeRes.error || assetRes.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const loadedCreatives = (creativeRes.data || []) as Creative[];
    const loadedAssets = (assetRes.data || []) as CreativeAsset[];
    setCreatives(loadedCreatives);
    setAssets(loadedAssets);

    const signedPairs = await Promise.all(loadedAssets.map(async (asset) => {
      if (!asset.file_path) return [asset.id, asset.external_url || ""] as const;
      const { data } = await supabase.storage.from("marketing-creatives").createSignedUrl(asset.file_path, 60 * 60);
      return [asset.id, data?.signedUrl || ""] as const;
    }));
    setUrls(Object.fromEntries(signedPairs));
    setLoading(false);
  }

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  }

  const assetsByCreative = useMemo(() => {
    const map: Record<string, CreativeAsset[]> = {};
    assets.forEach((asset) => (map[asset.creative_id] ||= []).push(asset));
    Object.values(map).forEach((list) => list.sort((a, b) => a.position - b.position));
    return map;
  }, [assets]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return creatives.filter((creative) => {
      const channels = creative.channels?.length ? creative.channels : creative.channel ? [creative.channel] : [];
      const matchesQuery = !query || `${creative.title} ${creative.description || ""} ${creative.segment || ""} ${channels.join(" ")} ${creative.format || ""}`.toLowerCase().includes(query);
      const matchesSegment = segment === "todos" || creative.segment === segment;
      const matchesCampaign = campaign === "todos" || creative.campaign_id === campaign;
      const normalized = normalizeFormat(creative.format);
      const matchesFormat = formatTab === "Todos" || normalized === formatTab;
      return matchesQuery && matchesSegment && matchesCampaign && matchesFormat;
    });
  }, [creatives, search, segment, campaign, formatTab]);

  const grouped = useMemo(() => {
    const order = ["Feed", "Carrossel", "Stories", "Reels", "Card", "Vídeo", "Outros"];
    return order.map((format) => ({
      format,
      items: filtered.filter((creative) => normalizeFormat(creative.format) === format),
    })).filter((group) => group.items.length > 0);
  }, [filtered]);

  const formatCounts = useMemo(() => {
    const counts: Record<string, number> = { Todos: creatives.length };
    creatives.forEach((creative) => {
      const group = normalizeFormat(creative.format);
      counts[group] = (counts[group] || 0) + 1;
    });
    return counts;
  }, [creatives]);

  function toggleChannel(channel: string) {
    setForm((current) => {
      const exists = current.channels.includes(channel);
      return { ...current, channels: exists ? current.channels.filter((item) => item !== channel) : [...current.channels, channel] };
    });
  }

  function changeFormat(format: string) {
    setForm((current) => ({ ...current, format, external_url: FORMAT_CONFIG[format].max > 1 ? "" : current.external_url }));
    setSelectedFiles([]);
    setError(null);
  }

  async function selectFiles(list: FileList | null) {
    const files = Array.from(list || []);
    setError(null);
    if (!files.length) return setSelectedFiles([]);
    if (files.length < config.min || files.length > config.max) {
      return setError(config.min === config.max
        ? `O formato ${config.label} aceita exatamente ${config.max} arquivo${config.max === 1 ? "" : "s"}.`
        : `O formato ${config.label} aceita de ${config.min} a ${config.max} arquivos.`);
    }

    try {
      const metas = await Promise.all(files.map(mediaMeta));
      for (const item of metas) {
        if (config.kind === "image" && !item.file.type.startsWith("image/")) throw new Error(`${config.label} aceita apenas imagens.`);
        if (config.kind === "video" && !item.file.type.startsWith("video/")) throw new Error(`${config.label} aceita apenas vídeos.`);
        if (config.ratio && item.width && item.height) {
          const ratio = item.width / item.height;
          const tolerance = 0.025;
          if (Math.abs(ratio - config.ratio) / config.ratio > tolerance) {
            throw new Error(`${item.file.name} está em ${item.width}×${item.height}. Para ${config.label}, use proporção ${config.ratioLabel}${config.recommended ? ` (ex.: ${config.recommended})` : ""}.`);
          }
        }
      }
      setSelectedFiles(metas);
    } catch (selectionError: any) {
      setSelectedFiles([]);
      setError(selectionError?.message || "Arquivo incompatível com o formato selecionado.");
    }
  }

  async function publishCreative() {
    if (!form.title.trim()) return setError("Informe o título do criativo.");
    if (!form.channels.length) return setError("Selecione pelo menos um canal.");
    const isMulti = config.max > 1;
    if (isMulti && selectedFiles.length < config.min) return setError(`Selecione pelo menos ${config.min} arquivos para ${config.label}.`);
    if (!isMulti && !selectedFiles.length && !form.external_url.trim()) return setError("Envie o arquivo do criativo ou informe um link externo.");

    setSaving(true);
    setError(null);
    const uploaded: string[] = [];
    let createdId: string | null = null;
    try {
      const batch = crypto.randomUUID();
      const uploadedMetas: Array<FileMeta & { path: string }> = [];

      for (let index = 0; index < selectedFiles.length; index += 1) {
        const item = selectedFiles[index];
        const name = safeFileName(item.file.name);
        const path = `library/${new Date().getFullYear()}/${batch}/${String(index + 1).padStart(2, "0")}-${name}`;
        const { error: uploadError } = await supabase.storage.from("marketing-creatives").upload(path, item.file, {
          upsert: false,
          contentType: item.file.type || undefined,
        });
        if (uploadError) throw uploadError;
        uploaded.push(path);
        uploadedMetas.push({ ...item, path });
      }

      const first = uploadedMetas[0];
      const { data: created, error: insertError } = await supabase.from("marketing_creatives").insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        campaign_id: form.campaign_id || null,
        segment: form.segment,
        channels: form.channels,
        channel: form.channels[0] || null,
        format: form.format,
        caption: form.caption.trim() || null,
        usage_instructions: form.usage_instructions.trim() || null,
        file_path: first?.path || null,
        external_url: !first ? form.external_url.trim() || null : null,
        mime_type: first?.file.type || null,
        visibility: form.visibility,
        status: form.status,
        valid_until: form.valid_until || null,
        published_at: form.status === "publicado" ? new Date().toISOString() : null,
        created_by: userId,
      }).select("*").single();
      if (insertError || !created) throw insertError || new Error("Não foi possível criar o criativo.");
      createdId = created.id;

      const assetRows = uploadedMetas.length
        ? uploadedMetas.map((item, index) => ({
            creative_id: created.id,
            position: index,
            file_path: item.path,
            mime_type: item.file.type || null,
            file_name: item.file.name,
            width: item.width,
            height: item.height,
            duration_seconds: item.duration,
          }))
        : [{
            creative_id: created.id,
            position: 0,
            external_url: form.external_url.trim(),
            mime_type: null,
            file_name: null,
            width: null,
            height: null,
            duration_seconds: null,
          }];

      const { error: assetError } = await supabase.from("marketing_creative_assets").insert(assetRows);
      if (assetError) throw assetError;

      setPublishOpen(false);
      setSelectedFiles([]);
      setForm((current) => ({
        ...current,
        title: "",
        description: "",
        caption: "",
        usage_instructions: "",
        external_url: "",
        valid_until: "",
      }));
      await load();
      onChanged?.();
      flash("Criativo publicado na biblioteca.");
    } catch (publishError: any) {
      if (createdId) await supabase.from("marketing_creatives").delete().eq("id", createdId);
      if (uploaded.length) await supabase.storage.from("marketing-creatives").remove(uploaded);
      setError(publishError?.message || "Não foi possível publicar o criativo.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(creative: Creative, status: Creative["status"]) {
    const { error: updateError } = await supabase.from("marketing_creatives")
      .update({ status, published_at: status === "publicado" ? new Date().toISOString() : null })
      .eq("id", creative.id);
    if (updateError) return setError(updateError.message);
    await load();
    onChanged?.();
  }

  async function removeCreative(creative: Creative) {
    if (!window.confirm(`Excluir “${creative.title}” e todos os arquivos desse criativo?`)) return;
    const files = (assetsByCreative[creative.id] || []).map((asset) => asset.file_path).filter(Boolean) as string[];
    const { error: deleteError } = await supabase.from("marketing_creatives").delete().eq("id", creative.id);
    if (deleteError) return setError(deleteError.message);
    if (files.length) await supabase.storage.from("marketing-creatives").remove(files);
    setDetail(null);
    await load();
    onChanged?.();
  }

  async function downloadAsset(asset: CreativeAsset, creative: Creative) {
    if (asset.external_url) return window.open(asset.external_url, "_blank", "noopener,noreferrer");
    if (!asset.file_path) return;
    const { data, error: signedError } = await supabase.storage.from("marketing-creatives").createSignedUrl(asset.file_path, 60 * 10, {
      download: asset.file_name || creative.title,
    });
    if (signedError) return setError(signedError.message);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function downloadPackage(creative: Creative) {
    const list = assetsByCreative[creative.id] || [];
    if (list.length <= 1) return list[0] ? downloadAsset(list[0], creative) : undefined;
    setZipping(true);
    setError(null);
    try {
      const zip = new JSZip();
      for (let index = 0; index < list.length; index += 1) {
        const asset = list[index];
        const url = urls[asset.id] || asset.external_url || "";
        if (!url) continue;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Não foi possível baixar ${asset.file_name || `arquivo ${index + 1}`}.`);
        const blob = await response.blob();
        const fallbackExt = asset.mime_type?.includes("png") ? "png" : asset.mime_type?.includes("webp") ? "webp" : asset.mime_type?.startsWith("video/") ? "mp4" : "jpg";
        const filename = safeFileName(asset.file_name || `${String(index + 1).padStart(2, "0")}.${fallbackExt}`);
        zip.file(`${String(index + 1).padStart(2, "0")}-${filename}`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${safeFileName(creative.title || "criativo")}.zip`);
    } catch (zipError: any) {
      setError(zipError?.message || "Não foi possível montar o pacote de arquivos.");
    } finally {
      setZipping(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-[360px] items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Carregando criativos…</div>;
  }

  return (
    <div className="space-y-5">
      {notice && <div className="fixed right-5 top-20 z-[80] rounded-2xl bg-[#1E293F] px-4 py-3 text-sm text-white shadow-xl"><Check className="mr-2 inline h-4 w-4" />{notice}</div>}
      {error && <div className="flex items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span>{error}</span><button type="button" onClick={() => setError(null)}><X className="h-4 w-4" /></button></div>}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#A11C27]">Biblioteca oficial</p>
          <h2 className="mt-1 text-xl font-bold text-[#1E293F]">Central de Criativos</h2>
          <p className="mt-1 text-sm text-slate-600">Materiais organizados por formato, prontos para baixar e publicar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar criativos" className="pl-9" /></div>
          <select value={segment} onChange={(event) => setSegment(event.target.value)} className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm"><option value="todos">Todos os segmentos</option>{SEGMENTS.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={campaign} onChange={(event) => setCampaign(event.target.value)} className="h-10 max-w-[220px] rounded-2xl border border-slate-200 bg-white px-3 text-sm"><option value="todos">Todas as campanhas</option>{campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          {canManage && <Button onClick={() => { setError(null); setPublishOpen(true); }}><Upload className="mr-2 h-4 w-4" />Publicar criativo</Button>}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FORMAT_TABS.map((tab) => (
          <button key={tab} type="button" onClick={() => setFormatTab(tab)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${formatTab === tab ? "border-[#A11C27] bg-[#A11C27] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-[#A11C27]/40"}`}>
            {tab} <span className={`ml-1.5 text-xs ${formatTab === tab ? "text-white/75" : "text-slate-400"}`}>{formatCounts[tab] || 0}</span>
          </button>
        ))}
      </div>

      {grouped.length ? grouped.map((group) => (
        <section key={group.format} className="space-y-3">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-2">
            <h3 className="text-lg font-bold text-[#1E293F]">{group.format}</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{group.items.length}</span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {group.items.map((creative) => {
              const list = assetsByCreative[creative.id] || [];
              const first = list[0];
              const url = first ? urls[first.id] || first.external_url || "" : creative.external_url || "";
              const campaignName = campaigns.find((item) => item.id === creative.campaign_id)?.name;
              const channels = creative.channels?.length ? creative.channels : creative.channel ? [creative.channel] : [];
              const expired = creative.valid_until && new Date(`${creative.valid_until}T23:59:59`) < new Date();
              const normalized = normalizeFormat(creative.format);
              const Icon = formatIcon(normalized);
              return (
                <Card key={creative.id} className={`group overflow-hidden border-white/70 bg-white/90 shadow-md transition hover:-translate-y-0.5 hover:shadow-xl ${expired ? "opacity-70" : ""}`}>
                  <button type="button" onClick={() => setDetail(creative)} className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 text-left">
                    {first && isImage(first.mime_type) && url ? <img src={url} alt={creative.title} className="h-full w-full object-contain p-2 transition duration-300 group-hover:scale-[1.015]" /> : first && isVideo(first.mime_type) && url ? <video src={url} muted preload="metadata" className="h-full w-full object-contain" /> : <div className="flex flex-col items-center justify-center text-slate-400"><Icon className="h-12 w-12" /><span className="mt-2 text-xs font-medium">{normalized}</span></div>}
                    <div className="absolute left-3 top-3 flex gap-2"><span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-[#1E293F] shadow">{normalized}</span>{list.length > 1 && <span className="rounded-full bg-[#1E293F]/90 px-2.5 py-1 text-[11px] font-bold text-white shadow">{list.length} arquivos</span>}</div>
                    {expired && <span className="absolute right-3 top-3 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white">Expirado</span>}
                  </button>
                  <CardContent className="p-4">
                    {campaignName && <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A11C27]">{campaignName}</p>}
                    <h4 className="mt-1 line-clamp-2 font-bold text-[#1E293F]">{creative.title}</h4>
                    <p className="mt-2 line-clamp-2 min-h-[40px] text-sm text-slate-600">{creative.description || creative.usage_instructions || "Material oficial pronto para divulgação."}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">{channels.slice(0, 4).map((channel) => <span key={channel} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{channel}</span>)}</div>
                    {creative.valid_until && <p className="mt-3 text-xs text-slate-500">Disponível até {brDate(creative.valid_until)}</p>}
                    <div className="mt-4 flex gap-2"><Button size="sm" className="flex-1" onClick={() => list.length > 1 ? void downloadPackage(creative) : setDetail(creative)}>{list.length > 1 ? <><Download className="mr-1.5 h-4 w-4" />Baixar pacote</> : <>Ver material</>}</Button><Button size="icon" variant="outline" disabled={!creative.caption && !creative.usage_instructions} onClick={() => navigator.clipboard.writeText(creative.caption || creative.usage_instructions || "")} title="Copiar legenda"><Copy className="h-4 w-4" /></Button>{canManage && <Button size="icon" variant="ghost" onClick={() => void removeCreative(creative)} title="Excluir"><Trash2 className="h-4 w-4 text-red-600" /></Button>}</div>
                    {canManage && <select value={creative.status} onChange={(event) => void updateStatus(creative, event.target.value as Creative["status"])} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"><option value="rascunho">Rascunho</option><option value="aprovacao">Em aprovação</option><option value="publicado">Publicado</option><option value="arquivado">Arquivado</option></select>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )) : <div className="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/70 p-8 text-center"><FileImage className="h-10 w-10 text-slate-300" /><h3 className="mt-4 font-semibold text-[#1E293F]">Nenhum criativo encontrado</h3><p className="mt-2 text-sm text-slate-500">Ajuste os filtros ou publique um novo material.</p>{canManage && <Button className="mt-5" onClick={() => setPublishOpen(true)}><Plus className="mr-2 h-4 w-4" />Publicar criativo</Button>}</div>}

      <Dialog open={publishOpen} onOpenChange={(open) => { setPublishOpen(open); if (!open) { setSelectedFiles([]); setError(null); } }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Publicar criativo</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="md:col-span-2"><Field label="Título"><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></Field></div>
            <div className="md:col-span-2"><Field label="Descrição"><Textarea rows={2} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field></div>

            <div className="md:col-span-2">
              <Field label="Canais">
                <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  {CHANNELS.map((channel) => {
                    const active = form.channels.includes(channel);
                    return <button key={channel} type="button" onClick={() => toggleChannel(channel)} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${active ? "border-[#A11C27] bg-[#A11C27] text-white" : "border-slate-200 bg-white text-slate-600"}`}>{active && <Check className="mr-1 inline h-3.5 w-3.5" />}{channel}</button>;
                  })}
                </div>
              </Field>
            </div>

            <Field label="Formato diretor">
              <select value={form.format} onChange={(event) => changeFormat(event.target.value)} className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm">
                {Object.keys(FORMAT_CONFIG).map((format) => <option key={format}>{format}</option>)}
              </select>
            </Field>
            <Field label="Segmento"><select value={form.segment} onChange={(event) => setForm((current) => ({ ...current, segment: event.target.value }))} className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm">{SEGMENTS.map((item) => <option key={item}>{item}</option>)}</select></Field>

            <div className="md:col-span-2 rounded-2xl border border-[#B5A573]/35 bg-[#B5A573]/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-[#1E293F]">Padrão do formato: {config.label}</p><p className="mt-1 text-sm text-slate-600">{config.hint}</p></div>{config.ratioLabel && <div className="rounded-xl bg-white px-3 py-2 text-right text-xs shadow-sm"><strong className="block text-[#A11C27]">{config.ratioLabel}</strong><span className="text-slate-500">{config.recommended}</span></div>}</div>
              <p className="mt-3 text-xs text-slate-500">Arquivos aceitos: {config.kind === "image" ? "JPG, PNG ou WEBP" : config.kind === "video" ? "MP4, MOV ou WEBM" : "PDF, JPG, PNG ou WEBP"}. Quantidade: {config.min === config.max ? config.max : `${config.min} a ${config.max}`}.</p>
            </div>

            <div className="md:col-span-2">
              <Field label={config.max > 1 ? `Arquivos do ${config.label}` : "Arquivo"}>
                <Input type="file" accept={config.accept} multiple={config.max > 1} onChange={(event) => void selectFiles(event.target.files)} />
              </Field>
              {selectedFiles.length > 0 && <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{selectedFiles.length} arquivo{selectedFiles.length === 1 ? "" : "s"} validado{selectedFiles.length === 1 ? "" : "s"}: {selectedFiles.map((item) => item.file.name).join(" • ")}</div>}
            </div>

            {config.max === 1 && <div className="md:col-span-2"><Field label="Ou link externo / Canva"><Input value={form.external_url} onChange={(event) => setForm((current) => ({ ...current, external_url: event.target.value }))} placeholder="https://..." /></Field></div>}
            <Field label="Campanha"><select value={form.campaign_id} onChange={(event) => setForm((current) => ({ ...current, campaign_id: event.target.value }))} className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"><option value="">Sem campanha</option>{campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Validade"><Input type="date" value={form.valid_until} onChange={(event) => setForm((current) => ({ ...current, valid_until: event.target.value }))} /></Field>
            <Field label="Visibilidade"><select value={form.visibility} onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value as Creative["visibility"] }))} className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"><option value="todos">Todos</option><option value="parceiros">Parceiros</option><option value="colaboradores">Colaboradores</option></select></Field>
            <Field label="Status"><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as Creative["status"] }))} className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"><option value="rascunho">Rascunho</option><option value="aprovacao">Em aprovação</option><option value="publicado">Publicado</option><option value="arquivado">Arquivado</option></select></Field>
            <div className="md:col-span-2"><Field label="Legenda sugerida"><Textarea rows={4} value={form.caption} onChange={(event) => setForm((current) => ({ ...current, caption: event.target.value }))} /></Field></div>
            <div className="md:col-span-2"><Field label="Orientação de uso"><Textarea rows={2} value={form.usage_instructions} onChange={(event) => setForm((current) => ({ ...current, usage_instructions: event.target.value }))} /></Field></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPublishOpen(false)}>Cancelar</Button><Button onClick={() => void publishCreative()} disabled={saving || !form.title.trim() || !form.channels.length || (config.max > 1 ? selectedFiles.length < config.min : !selectedFiles.length && !form.external_url.trim())}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Publicar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          {detail && (() => {
            const list = assetsByCreative[detail.id] || [];
            const channels = detail.channels?.length ? detail.channels : detail.channel ? [detail.channel] : [];
            return <><DialogHeader><DialogTitle>{detail.title}</DialogTitle></DialogHeader><div className="space-y-4"><div className="flex flex-wrap gap-2">{channels.map((channel) => <span key={channel} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{channel}</span>)}<span className="rounded-full bg-[#A11C27]/10 px-3 py-1 text-xs font-semibold text-[#A11C27]">{normalizeFormat(detail.format)}</span></div>{detail.description && <p className="text-sm leading-6 text-slate-600">{detail.description}</p>}<div className={`grid gap-4 ${list.length > 1 ? "md:grid-cols-2" : ""}`}>{list.map((asset, index) => { const url = urls[asset.id] || asset.external_url || ""; return <div key={asset.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"><div className="flex min-h-[220px] items-center justify-center bg-white">{isImage(asset.mime_type) && url ? <img src={url} alt={`${detail.title} ${index + 1}`} className="max-h-[520px] w-full object-contain" /> : isVideo(asset.mime_type) && url ? <video src={url} controls className="max-h-[520px] w-full" /> : <File className="h-14 w-14 text-slate-300" />}</div><div className="flex items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-700">{asset.file_name || `Arquivo ${index + 1}`}</p>{asset.width && asset.height && <p className="mt-0.5 text-[11px] text-slate-400">{asset.width} × {asset.height}</p>}</div><Button size="sm" variant="outline" onClick={() => void downloadAsset(asset, detail)}><Download className="mr-1.5 h-4 w-4" />Baixar</Button></div></div>; })}</div>{detail.caption && <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Legenda sugerida</p><Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(detail.caption || "")}><Copy className="mr-1.5 h-4 w-4" />Copiar</Button></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{detail.caption}</p></div>}</div><DialogFooter className="mt-4">{list.length > 1 && <Button onClick={() => void downloadPackage(detail)} disabled={zipping}>{zipping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Baixar pacote completo</Button>}<Button variant="outline" onClick={() => setDetail(null)}>Fechar</Button></DialogFooter></>;
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="block text-xs font-semibold text-slate-600">{label}</label>{children}</div>;
}
