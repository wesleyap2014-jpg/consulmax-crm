import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  AtSign,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clapperboard,
  FileText,
  Layers,
  Lightbulb,
  Link as LinkIcon,
  Loader2,
  Megaphone,
  MessageCircle,
  Palette,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Workflow,
} from "lucide-react";

type ContentItem = {
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
  created_at: string;
};

type Idea = {
  id: string;
  title: string | null;
  raw_input: string;
  source_type: string;
  status: string;
  created_at: string;
};

type Variant = {
  id: string;
  content_id: string;
  social_account_id: string | null;
  provider: string;
  format: string;
  title: string | null;
  hook: string | null;
  body: string | null;
  caption: string | null;
  script: string | null;
  cta: string | null;
  status: string;
  planned_at: string | null;
  published_at: string | null;
  created_at: string;
};

type SocialAccount = {
  id: string;
  provider: string;
  username: string | null;
  display_name: string | null;
  account_type: string | null;
  editorial_role: string | null;
  status: string;
  is_default: boolean;
  capabilities: Record<string, boolean> | null;
  last_sync_at: string | null;
};

type Publication = {
  id: string;
  variant_id: string;
  social_account_id: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  status: string;
  provider_post_url: string | null;
  error_message: string | null;
};

type MarketProfile = {
  id: string;
  provider: string;
  handle: string;
  display_name: string | null;
  profile_url: string | null;
  profile_type: string;
  segment: string | null;
  active: boolean;
};

type Pulse = {
  id: string;
  provider: string;
  dimension_type: string;
  dimension_value: string;
  score: number;
  confidence: number;
  stage: string;
  sample_size: number;
  generated_at: string;
};

type VideoProject = {
  id: string;
  content_id: string | null;
  title: string;
  objective: string | null;
  target_duration_seconds: number | null;
  target_format: string | null;
  instructions: string | null;
  status: string;
  created_at: string;
};

type VideoClip = {
  id: string;
  project_id: string;
  asset_id: string | null;
  source_order: number | null;
  sort_order: number | null;
  selected: boolean;
};

type ContentMetric = {
  views: number | null;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
};

type Attribution = {
  entity_type: string;
  value: number | null;
};

type Setting = {
  id: string;
  setting_type: string;
  name: string;
  active: boolean;
};

type Modal = "idea" | "content" | "video" | "radar" | null;

const BRAND = {
  navy: "#1E293F",
  red: "#A11C27",
  gold: "#B5A573",
  lightGold: "#E0CE8C",
};

const PROVIDERS = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" },
  { key: "whatsapp", label: "WhatsApp" },
];

const EXPANSION_TARGETS = [
  { provider: "instagram", format: "reel" },
  { provider: "tiktok", format: "video" },
  { provider: "youtube", format: "short" },
  { provider: "instagram", format: "carrossel" },
  { provider: "instagram", format: "stories" },
  { provider: "linkedin", format: "post" },
  { provider: "linkedin", format: "artigo" },
  { provider: "whatsapp", format: "status" },
];

function fmtDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function num(value: number | null | undefined) {
  return Number(value || 0);
}

function Status({ value }: { value: string }) {
  const labels: Record<string, string> = {
    inbox: "Caixa de ideias",
    converted: "Convertida",
    ideia: "Ideia",
    producao: "Em produção",
    aprovacao: "Em aprovação",
    aprovado: "Aprovado",
    programado: "Programado",
    publicado: "Publicado",
    rascunho: "Rascunho",
    agendado: "Agendado",
    scheduled: "Agendado",
    publishing: "Publicando",
    failed: "Falhou",
    connected: "Conectada",
    attention: "Atenção",
    expired: "Expirada",
    upload: "Recebendo cortes",
    analyzing: "Analisando",
    edit_plan: "Plano de edição",
    editing: "Editando",
    rendering: "Renderizando",
    review: "Revisão",
    approved: "Aprovado",
    quente: "Quente",
    aquecendo: "Aquecendo",
    emergente: "Emergente",
    saturando: "Saturando",
    esfriando: "Esfriando",
    estavel: "Estável",
  };

  return (
    <span className="inline-flex rounded-full border border-[#B5A573]/35 bg-[#E0CE8C]/15 px-2.5 py-1 text-xs font-medium text-[#1E293F]">
      {labels[value] || value}
    </span>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#B5A573]/45 bg-white/70 p-8 text-center">
      <p className="font-medium text-[#1E293F]">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">{description}</p>
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return (
    <Card className="border-[#B5A573]/20 bg-white/90 shadow-sm">
      <CardContent className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <div className="mt-2 text-3xl font-semibold text-[#1E293F]">{value}</div>
        {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
      </CardContent>
    </Card>
  );
}

export default function MarketingContentCenter() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [activeTab, setActiveTab] = useState("visao");
  const [userId, setUserId] = useState<string | null>(null);

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [marketProfiles, setMarketProfiles] = useState<MarketProfile[]>([]);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [videoProjects, setVideoProjects] = useState<VideoProject[]>([]);
  const [videoClips, setVideoClips] = useState<VideoClip[]>([]);
  const [metrics, setMetrics] = useState<ContentMetric[]>([]);
  const [attributions, setAttributions] = useState<Attribution[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);

  const [ideaForm, setIdeaForm] = useState({ title: "", raw_input: "", source_type: "manual" });
  const [contentForm, setContentForm] = useState({
    title: "",
    theme: "",
    thesis: "",
    objective: "Autoridade + geração de leads",
    audience: "",
    segment: "",
    content_pillar: "",
    cta: "",
  });
  const [videoForm, setVideoForm] = useState({
    title: "",
    content_id: "",
    objective: "Criar edição profissional multicanal",
    target_duration_seconds: "60",
    target_format: "9:16",
    instructions: "",
  });
  const [radarForm, setRadarForm] = useState({
    provider: "instagram",
    handle: "",
    display_name: "",
    profile_url: "",
    profile_type: "competitor",
    segment: "Consórcio",
  });

  const contentById = useMemo(() => new Map(contents.map((item) => [item.id, item])), [contents]);
  const clipsByProject = useMemo(() => {
    const map = new Map<string, number>();
    videoClips.forEach((clip) => map.set(clip.project_id, (map.get(clip.project_id) || 0) + 1));
    return map;
  }, [videoClips]);

  const dashboard = useMemo(() => {
    const approvals = variants.filter((item) => item.status === "aprovacao").length + contents.filter((item) => item.status === "aprovacao").length;
    const production = variants.filter((item) => item.status === "producao").length + videoProjects.filter((item) => ["analyzing", "edit_plan", "editing", "rendering", "review"].includes(item.status)).length;
    const scheduled = variants.filter((item) => item.status === "agendado").length + publications.filter((item) => item.status === "scheduled").length;
    const connected = accounts.filter((item) => item.status === "connected").length;
    return { approvals, production, scheduled, connected };
  }, [accounts, contents, publications, variants, videoProjects]);

  const analytics = useMemo(() => {
    const total = metrics.reduce(
      (acc, item) => ({
        views: acc.views + num(item.views),
        reach: acc.reach + num(item.reach),
        clicks: acc.clicks + num(item.clicks),
        interactions: acc.interactions + num(item.likes) + num(item.comments) + num(item.shares) + num(item.saves),
      }),
      { views: 0, reach: 0, clicks: 0, interactions: 0 },
    );
    const leads = attributions.filter((item) => item.entity_type === "lead").length;
    const opportunities = attributions.filter((item) => item.entity_type === "opportunity").length;
    const sales = attributions.filter((item) => item.entity_type === "sale").length;
    const revenue = attributions.filter((item) => item.entity_type === "sale").reduce((sum, item) => sum + num(item.value), 0);
    return { ...total, leads, opportunities, sales, revenue };
  }, [attributions, metrics]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id || null;
      setUserId(currentUserId);

      const [
        ideasRes,
        contentsRes,
        variantsRes,
        accountsRes,
        publicationsRes,
        marketRes,
        pulsesRes,
        videoRes,
        clipsRes,
        metricsRes,
        attributionsRes,
        settingsRes,
      ] = await Promise.all([
        supabase.from("marketing_content_ideas").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("marketing_content_items").select("id,title,theme,thesis,objective,audience,segment,content_pillar,cta,status,head_recommendation,created_at").order("created_at", { ascending: false }).limit(100),
        supabase.from("marketing_content_variants").select("*").order("created_at", { ascending: false }).limit(300),
        supabase.from("marketing_social_accounts").select("*").order("provider"),
        supabase.from("marketing_publications").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("marketing_market_profiles").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("marketing_algorithm_pulses").select("*").order("generated_at", { ascending: false }).limit(100),
        supabase.from("marketing_video_projects").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("marketing_video_clips").select("id,project_id,asset_id,source_order,sort_order,selected").limit(500),
        supabase.from("marketing_content_metrics").select("views,reach,impressions,likes,comments,shares,saves,clicks").limit(2000),
        supabase.from("marketing_content_attributions").select("entity_type,value").limit(2000),
        supabase.from("marketing_content_settings").select("id,setting_type,name,active").order("setting_type"),
      ]);

      const firstError = [ideasRes, contentsRes, variantsRes, accountsRes, publicationsRes, marketRes, pulsesRes, videoRes, clipsRes, metricsRes, attributionsRes, settingsRes].find((result) => result.error)?.error;
      if (firstError) throw firstError;

      setIdeas((ideasRes.data || []) as Idea[]);
      setContents((contentsRes.data || []) as ContentItem[]);
      setVariants((variantsRes.data || []) as Variant[]);
      setAccounts((accountsRes.data || []) as SocialAccount[]);
      setPublications((publicationsRes.data || []) as Publication[]);
      setMarketProfiles((marketRes.data || []) as MarketProfile[]);
      setPulses((pulsesRes.data || []) as Pulse[]);
      setVideoProjects((videoRes.data || []) as VideoProject[]);
      setVideoClips((clipsRes.data || []) as VideoClip[]);
      setMetrics((metricsRes.data || []) as ContentMetric[]);
      setAttributions((attributionsRes.data || []) as Attribution[]);
      setSettings((settingsRes.data || []) as Setting[]);
    } catch (err: any) {
      setError(err?.message || "Não foi possível carregar a Central de Conteúdo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function createIdea() {
    if (!ideaForm.raw_input.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from("marketing_content_ideas").insert({
        title: ideaForm.title.trim() || null,
        raw_input: ideaForm.raw_input.trim(),
        source_type: ideaForm.source_type,
        created_by: userId,
      });
      if (insertError) throw insertError;
      setIdeaForm({ title: "", raw_input: "", source_type: "manual" });
      setModal(null);
      setNotice("Ideia adicionada à caixa de entrada do Head de Conteúdo.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Erro ao salvar ideia.");
    } finally {
      setSaving(false);
    }
  }

  async function createContent() {
    if (!contentForm.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from("marketing_content_items").insert({
        title: contentForm.title.trim(),
        theme: contentForm.theme.trim() || null,
        thesis: contentForm.thesis.trim() || null,
        objective: contentForm.objective.trim() || null,
        audience: contentForm.audience.trim() || null,
        segment: contentForm.segment.trim() || null,
        content_pillar: contentForm.content_pillar.trim() || null,
        cta: contentForm.cta.trim() || null,
        source_type: "manual",
        status: "ideia",
        created_by: userId,
      });
      if (insertError) throw insertError;
      setModal(null);
      setNotice("Conteúdo-mãe criado.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Erro ao criar conteúdo-mãe.");
    } finally {
      setSaving(false);
    }
  }

  async function callMax(payload: any) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Entre novamente no CRM.");

    const response = await fetch("/api/marketing/content-orchestrator", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result?.ok) throw new Error(result?.message || result?.detail || "Erro no Max Content.");
    return result.result;
  }

  async function transformIdea(idea: Idea) {
    setSaving(true);
    setError(null);
    try {
      const result = await callMax({ action: "head", idea: idea.raw_input });
      const { data: created, error: insertError } = await supabase
        .from("marketing_content_items")
        .insert({
          title: result.title || idea.title || "Conteúdo sem título",
          theme: result.theme || null,
          thesis: result.thesis || null,
          objective: result.objective || null,
          audience: result.audience || null,
          content_pillar: result.content_pillar || null,
          cta: result.cta || null,
          head_recommendation: result.head_recommendation || null,
          ai_context: { recommended_targets: result.recommended_targets || [] },
          source_type: idea.source_type,
          source_idea_id: idea.id,
          status: "ideia",
          created_by: userId,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      const { error: updateError } = await supabase
        .from("marketing_content_ideas")
        .update({ status: "converted", converted_content_id: created.id })
        .eq("id", idea.id);
      if (updateError) throw updateError;
      setNotice("O Max transformou a ideia em Conteúdo-Mãe.");
      setActiveTab("conteudos");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Erro ao transformar ideia.");
    } finally {
      setSaving(false);
    }
  }

  async function expandContent(content: ContentItem) {
    setSaving(true);
    setError(null);
    try {
      const result = await callMax({ action: "expand", content, targets: EXPANSION_TARGETS });
      const generated = Array.isArray(result.variants) ? result.variants : [];
      if (!generated.length) throw new Error("O Max não retornou desdobramentos.");

      const rows = generated.map((variant: any) => ({
        content_id: content.id,
        provider: variant.provider,
        format: variant.format,
        title: variant.title || null,
        hook: variant.hook || null,
        body: variant.body || null,
        caption: variant.caption || null,
        script: variant.script || null,
        cta: variant.cta || null,
        hashtags: Array.isArray(variant.hashtags) ? variant.hashtags : [],
        creative_brief: variant.creative_brief || null,
        duration_seconds: Number.isFinite(Number(variant.duration_seconds)) ? Number(variant.duration_seconds) : null,
        aspect_ratio: variant.aspect_ratio || null,
        ai_generation_metadata: { head_note: result.head_note || null, generated_at: new Date().toISOString() },
        status: "rascunho",
        created_by: userId,
      }));

      const { error: insertError } = await supabase.from("marketing_content_variants").insert(rows);
      if (insertError) throw insertError;
      await supabase.from("marketing_content_items").update({ status: "producao", head_recommendation: result.head_note || content.head_recommendation }).eq("id", content.id);
      setNotice(`${rows.length} versões foram criadas pelo Max Content.`);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Erro ao desdobrar conteúdo.");
    } finally {
      setSaving(false);
    }
  }

  async function sendToApproval(variant: Variant) {
    setSaving(true);
    try {
      const { error: updateError } = await supabase.from("marketing_content_variants").update({ status: "aprovacao" }).eq("id", variant.id);
      if (updateError) throw updateError;
      await supabase.from("marketing_content_approvals").insert({ variant_id: variant.id, status: "pending", requested_by: userId });
      setNotice("Versão enviada para aprovação.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Erro ao enviar para aprovação.");
    } finally {
      setSaving(false);
    }
  }

  async function approveVariant(variant: Variant) {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error: updateError } = await supabase.from("marketing_content_variants").update({ status: "aprovado" }).eq("id", variant.id);
      if (updateError) throw updateError;
      await supabase
        .from("marketing_content_approvals")
        .update({ status: "approved", decided_by: userId, decided_at: now })
        .eq("variant_id", variant.id)
        .eq("status", "pending");
      setNotice("Versão aprovada.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Erro ao aprovar versão.");
    } finally {
      setSaving(false);
    }
  }

  async function createVideoProject() {
    if (!videoForm.title.trim()) return;
    setSaving(true);
    try {
      const { error: insertError } = await supabase.from("marketing_video_projects").insert({
        title: videoForm.title.trim(),
        content_id: videoForm.content_id || null,
        objective: videoForm.objective.trim() || null,
        target_duration_seconds: Number(videoForm.target_duration_seconds) || null,
        target_format: videoForm.target_format || null,
        instructions: videoForm.instructions.trim() || null,
        status: "upload",
        created_by: userId,
      });
      if (insertError) throw insertError;
      setModal(null);
      setNotice("Projeto de vídeo criado. Agora envie os cortes brutos.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Erro ao criar projeto de vídeo.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadClips(project: VideoProject, files: FileList | null) {
    if (!files?.length || !userId) return;
    setSaving(true);
    setError(null);
    try {
      const existing = clipsByProject.get(project.id) || 0;
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const path = `${userId}/${project.id}/${Date.now()}-${index}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("marketing-content-assets").upload(path, file, { upsert: false });
        if (uploadError) throw uploadError;
        const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") ? "image" : "other";
        const { data: asset, error: assetError } = await supabase
          .from("marketing_content_assets")
          .insert({
            content_id: project.content_id,
            kind,
            file_path: path,
            file_name: file.name,
            mime_type: file.type || null,
            file_size_bytes: file.size,
            created_by: userId,
          })
          .select("id")
          .single();
        if (assetError) throw assetError;
        const order = existing + index + 1;
        const { error: clipError } = await supabase.from("marketing_video_clips").insert({
          project_id: project.id,
          asset_id: asset.id,
          source_order: order,
          sort_order: order,
          selected: true,
        });
        if (clipError) throw clipError;
      }
      setNotice(`${files.length} corte(s) enviado(s). O material está pronto para a etapa de análise/edição.`);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Erro ao enviar cortes.");
    } finally {
      setSaving(false);
    }
  }

  async function createRadarProfile() {
    if (!radarForm.handle.trim()) return;
    setSaving(true);
    try {
      const { error: insertError } = await supabase.from("marketing_market_profiles").insert({
        provider: radarForm.provider,
        handle: radarForm.handle.trim(),
        display_name: radarForm.display_name.trim() || null,
        profile_url: radarForm.profile_url.trim() || null,
        profile_type: radarForm.profile_type,
        segment: radarForm.segment.trim() || null,
        created_by: userId,
      });
      if (insertError) throw insertError;
      setModal(null);
      setNotice("Perfil adicionado ao Radar de Mercado.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Erro ao adicionar perfil ao Radar.");
    } finally {
      setSaving(false);
    }
  }

  const pendingApprovals = variants.filter((item) => item.status === "aprovacao");
  const calendarVariants = variants.filter((item) => item.planned_at).sort((a, b) => String(a.planned_at).localeCompare(String(b.planned_at)));

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[#1E293F]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando Central de Conteúdo…
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-[#F5F5F5] via-white to-[#E0CE8C]/10 p-4 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <div className="flex flex-col gap-4 rounded-3xl border border-[#B5A573]/25 bg-white/90 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="icon" onClick={() => navigate("/marketing")} title="Voltar para Central de Marketing">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#A11C27]" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A11C27]">Max Content</p>
              </div>
              <h1 className="mt-1 text-2xl font-semibold text-[#1E293F] md:text-3xl">Central de Conteúdo</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">Planejamento, produção, desdobramento multicanal, vídeo, aprovação, distribuição e inteligência editorial em um único fluxo.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={loadAll}><RefreshCcw className="mr-2 h-4 w-4" />Atualizar</Button>
            <Button onClick={() => setModal("idea")} className="bg-[#A11C27] hover:bg-[#8b1822]"><Lightbulb className="mr-2 h-4 w-4" />Nova ideia</Button>
          </div>
        </div>

        {error ? <div className="rounded-2xl border border-[#A11C27]/30 bg-[#A11C27]/5 px-4 py-3 text-sm text-[#A11C27]">{error}</div> : null}
        {notice ? <div className="rounded-2xl border border-[#B5A573]/35 bg-[#E0CE8C]/15 px-4 py-3 text-sm text-[#1E293F]">{notice}</div> : null}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
          <div className="overflow-x-auto pb-1">
            <TabsList className="h-auto min-w-max flex-wrap justify-start gap-1 bg-white p-1.5 shadow-sm">
              <TabsTrigger value="visao"><Bot className="mr-1.5 h-4 w-4" />Visão Geral</TabsTrigger>
              <TabsTrigger value="ideias"><Lightbulb className="mr-1.5 h-4 w-4" />Ideias</TabsTrigger>
              <TabsTrigger value="conteudos"><Layers className="mr-1.5 h-4 w-4" />Conteúdos</TabsTrigger>
              <TabsTrigger value="producao"><Clapperboard className="mr-1.5 h-4 w-4" />Produção</TabsTrigger>
              <TabsTrigger value="aprovacoes"><CheckCircle2 className="mr-1.5 h-4 w-4" />Aprovações</TabsTrigger>
              <TabsTrigger value="calendario"><CalendarDays className="mr-1.5 h-4 w-4" />Calendário</TabsTrigger>
              <TabsTrigger value="publicacoes"><Send className="mr-1.5 h-4 w-4" />Publicações</TabsTrigger>
              <TabsTrigger value="radar"><Search className="mr-1.5 h-4 w-4" />Radar</TabsTrigger>
              <TabsTrigger value="pulso"><Activity className="mr-1.5 h-4 w-4" />Pulso</TabsTrigger>
              <TabsTrigger value="analytics"><BarChart3 className="mr-1.5 h-4 w-4" />Analytics</TabsTrigger>
              <TabsTrigger value="config"><Settings className="mr-1.5 h-4 w-4" />Configurações</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="visao" className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi label="Aguardando aprovação" value={dashboard.approvals} detail="Conteúdos e versões" />
              <Kpi label="Em produção" value={dashboard.production} detail="Peças e projetos de vídeo" />
              <Kpi label="Agendados" value={dashboard.scheduled} detail="Fila de distribuição" />
              <Kpi label="Contas conectadas" value={dashboard.connected} detail={`${accounts.length} cadastrada(s)`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
              <Card className="border-[#B5A573]/20">
                <CardHeader><CardTitle className="flex items-center gap-2 text-[#1E293F]"><Bot className="h-5 w-5 text-[#A11C27]" />Mesa do Head de Conteúdo</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {contents.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-[#1E293F]">{item.title}</p>
                          <p className="mt-1 text-sm text-slate-500">{item.head_recommendation || item.thesis || item.theme || "Aguardando leitura estratégica do Head."}</p>
                        </div>
                        <Status value={item.status} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setActiveTab("conteudos"); }}><FileText className="mr-1.5 h-4 w-4" />Abrir</Button>
                        <Button size="sm" disabled={saving} onClick={() => expandContent(item)} className="bg-[#1E293F] hover:bg-[#26344f]"><Sparkles className="mr-1.5 h-4 w-4" />Desdobrar com Max</Button>
                      </div>
                    </div>
                  ))}
                  {!contents.length ? <Empty title="Nenhum conteúdo-mãe ainda" description="Comece enviando uma ideia. O Head pode transformá-la em uma pauta estruturada e depois desdobrá-la para as redes." /> : null}
                </CardContent>
              </Card>

              <Card className="border-[#B5A573]/20">
                <CardHeader><CardTitle className="text-[#1E293F]">Inteligência agora</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-2xl bg-[#1E293F] p-4 text-white">
                    <p className="text-xs uppercase tracking-[0.15em] text-[#E0CE8C]">Pulso mais recente</p>
                    {pulses[0] ? (
                      <><p className="mt-2 text-xl font-semibold">{pulses[0].provider} · {Math.round(Number(pulses[0].score))}/100</p><p className="mt-1 text-sm text-white/70">{pulses[0].dimension_value} · confiança {Math.round(Number(pulses[0].confidence))}%</p></>
                    ) : <p className="mt-2 text-sm text-white/70">Sem evidência suficiente ainda. O sistema não inventa um “apetite” sem dados.</p>}
                  </div>
                  <div className="rounded-2xl border border-[#B5A573]/25 p-4">
                    <p className="text-sm font-medium text-[#1E293F]">Radar de Mercado</p>
                    <p className="mt-1 text-2xl font-semibold text-[#1E293F]">{marketProfiles.filter((p) => p.active).length}</p>
                    <p className="text-xs text-slate-500">perfis monitoráveis cadastrados</p>
                  </div>
                  <div className="rounded-2xl border border-[#B5A573]/25 p-4">
                    <p className="text-sm font-medium text-[#1E293F]">Memória editorial</p>
                    <p className="mt-1 text-2xl font-semibold text-[#1E293F]">{contents.length + variants.length}</p>
                    <p className="text-xs text-slate-500">conteúdos + versões armazenadas</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="ideias" className="space-y-4">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#1E293F]">Caixa de Ideias</h2><p className="text-sm text-slate-500">Pensamentos, áudios, reuniões, comentários, Radar e referências entram aqui antes de virar pauta.</p></div><Button onClick={() => setModal("idea")}><Plus className="mr-2 h-4 w-4" />Adicionar</Button></div>
            <div className="grid gap-3 lg:grid-cols-2">
              {ideas.map((idea) => (
                <Card key={idea.id} className="border-[#B5A573]/20"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#1E293F]">{idea.title || "Ideia sem título"}</p><p className="mt-2 line-clamp-4 text-sm text-slate-600">{idea.raw_input}</p></div><Status value={idea.status} /></div><div className="mt-4 flex items-center justify-between"><span className="text-xs text-slate-400">{idea.source_type} · {fmtDate(idea.created_at)}</span>{idea.status !== "converted" ? <Button size="sm" disabled={saving} onClick={() => transformIdea(idea)} className="bg-[#A11C27] hover:bg-[#8b1822]"><Sparkles className="mr-1.5 h-4 w-4" />Transformar com Max</Button> : null}</div></CardContent></Card>
              ))}
            </div>
            {!ideas.length ? <Empty title="Sua caixa de ideias está vazia" description="Pode começar com uma frase simples. O Head de Conteúdo organiza tema, tese, público, objetivo e possibilidades de distribuição." /> : null}
          </TabsContent>

          <TabsContent value="conteudos" className="space-y-4">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#1E293F]">Conteúdos-Mãe</h2><p className="text-sm text-slate-500">Uma tese central, várias expressões nativas para cada canal.</p></div><Button onClick={() => setModal("content")}><Plus className="mr-2 h-4 w-4" />Novo conteúdo</Button></div>
            <div className="space-y-3">
              {contents.map((item) => {
                const children = variants.filter((variant) => variant.content_id === item.id);
                return <Card key={item.id} className="border-[#B5A573]/20"><CardContent className="p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="max-w-4xl"><div className="flex flex-wrap items-center gap-2"><p className="text-lg font-semibold text-[#1E293F]">{item.title}</p><Status value={item.status} /></div><p className="mt-2 text-sm text-slate-600">{item.thesis || item.theme || "Tese ainda não registrada."}</p><div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500"><span>{item.content_pillar || "Sem pilar"}</span><span>•</span><span>{item.audience || "Público não definido"}</span><span>•</span><span>{children.length} desdobramento(s)</span></div>{item.head_recommendation ? <div className="mt-3 rounded-xl bg-[#E0CE8C]/15 px-3 py-2 text-sm text-[#1E293F]"><strong>Head:</strong> {item.head_recommendation}</div> : null}</div><Button disabled={saving} onClick={() => expandContent(item)} className="shrink-0 bg-[#1E293F] hover:bg-[#26344f]"><Sparkles className="mr-2 h-4 w-4" />Desdobrar conteúdo</Button></div>{children.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{children.map((variant) => <div key={variant.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold capitalize text-[#1E293F]">{variant.provider}</p><p className="text-xs text-slate-500">{variant.format}</p></div><Status value={variant.status} /></div><p className="mt-2 line-clamp-2 text-xs text-slate-600">{variant.hook || variant.title || variant.caption || "Versão criada"}</p>{variant.status === "rascunho" ? <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => sendToApproval(variant)}>Enviar à aprovação</Button> : null}</div>)}</div> : null}</CardContent></Card>;
              })}
            </div>
            {!contents.length ? <Empty title="Nenhum Conteúdo-Mãe" description="Crie manualmente ou transforme uma ideia com o Max Content." /> : null}
          </TabsContent>

          <TabsContent value="producao" className="space-y-4">
            <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold text-[#1E293F]">Produção e Estúdio de Vídeo</h2><p className="text-sm text-slate-500">Envie vários cortes brutos para um mesmo projeto e mantenha a ordem de origem e a ordem editorial separadas.</p></div><Button onClick={() => setModal("video")}><Clapperboard className="mr-2 h-4 w-4" />Novo projeto</Button></div>
            <div className="grid gap-3 lg:grid-cols-2">
              {videoProjects.map((project) => <Card key={project.id} className="border-[#B5A573]/20"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#1E293F]">{project.title}</p><p className="mt-1 text-sm text-slate-500">{contentById.get(project.content_id || "")?.title || "Projeto independente"}</p></div><Status value={project.status} /></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-2"><p className="text-lg font-semibold text-[#1E293F]">{clipsByProject.get(project.id) || 0}</p><p className="text-[11px] text-slate-500">cortes</p></div><div className="rounded-xl bg-slate-50 p-2"><p className="text-lg font-semibold text-[#1E293F]">{project.target_duration_seconds || "—"}</p><p className="text-[11px] text-slate-500">segundos alvo</p></div><div className="rounded-xl bg-slate-50 p-2"><p className="text-lg font-semibold text-[#1E293F]">{project.target_format || "—"}</p><p className="text-[11px] text-slate-500">formato</p></div></div><label className="mt-4 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-[#B5A573]/50 px-3 py-3 text-sm font-medium text-[#1E293F] hover:bg-[#E0CE8C]/10"><Upload className="mr-2 h-4 w-4" />Enviar cortes brutos<input type="file" multiple accept="video/*,audio/*,image/*" className="hidden" onChange={(event) => { uploadClips(project, event.target.files); event.currentTarget.value = ""; }} /></label><p className="mt-2 text-xs text-slate-400">O render profissional depende do motor de mídia; os arquivos e a estrutura de edição já ficam organizados no CRM.</p></CardContent></Card>)}
            </div>
            {!videoProjects.length ? <Empty title="Nenhum projeto de vídeo" description="Crie um projeto e envie os takes, gravações de tela, B-roll, fotos ou áudio. O CRM preserva cada corte como asset do projeto." /> : null}
          </TabsContent>

          <TabsContent value="aprovacoes" className="space-y-4">
            <h2 className="text-xl font-semibold text-[#1E293F]">Fila de Aprovações</h2>
            <div className="space-y-3">{pendingApprovals.map((variant) => <Card key={variant.id} className="border-[#B5A573]/20"><CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold text-[#1E293F]">{variant.title || contentById.get(variant.content_id)?.title || "Conteúdo"}</p><p className="mt-1 text-sm capitalize text-slate-500">{variant.provider} · {variant.format}</p><p className="mt-2 line-clamp-2 text-sm text-slate-600">{variant.hook || variant.caption || variant.body || variant.script}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setActiveTab("conteudos")}>Revisar</Button><Button disabled={saving} onClick={() => approveVariant(variant)} className="bg-[#A11C27] hover:bg-[#8b1822]"><CheckCircle2 className="mr-2 h-4 w-4" />Aprovar</Button></div></CardContent></Card>)}</div>
            {!pendingApprovals.length ? <Empty title="Nada aguardando aprovação" description="Quando uma versão for enviada para aprovação, ela aparecerá aqui antes de entrar na fila de distribuição." /> : null}
          </TabsContent>

          <TabsContent value="calendario" className="space-y-4">
            <div><h2 className="text-xl font-semibold text-[#1E293F]">Calendário Editorial</h2><p className="text-sm text-slate-500">Agenda unificada de versões planejadas em todas as contas e canais.</p></div>
            <div className="space-y-2">{calendarVariants.map((variant) => <div key={variant.id} className="flex flex-col gap-2 rounded-2xl border border-[#B5A573]/20 bg-white p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold text-[#1E293F]">{variant.title || contentById.get(variant.content_id)?.title}</p><p className="text-sm capitalize text-slate-500">{variant.provider} · {variant.format}</p></div><div className="flex items-center gap-3"><span className="text-sm text-slate-600">{fmtDate(variant.planned_at)}</span><Status value={variant.status} /></div></div>)}</div>
            {!calendarVariants.length ? <Empty title="Calendário sem itens agendados" description="A estrutura está pronta; quando uma versão receber data/hora, ela passa a aparecer neste calendário unificado." /> : null}
          </TabsContent>

          <TabsContent value="publicacoes" className="space-y-4">
            <div><h2 className="text-xl font-semibold text-[#1E293F]">Publicações</h2><p className="text-sm text-slate-500">Fila operacional separada da criação. A publicação real será executada pelas autorizações OAuth de cada conta.</p></div>
            <div className="space-y-2">{publications.map((publication) => { const variant = variants.find((item) => item.id === publication.variant_id); return <div key={publication.id} className="rounded-2xl border border-[#B5A573]/20 bg-white p-4"><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold text-[#1E293F]">{variant?.title || "Publicação"}</p><p className="text-sm capitalize text-slate-500">{variant?.provider} · {variant?.format}</p></div><div className="flex items-center gap-3"><span className="text-sm text-slate-500">{fmtDate(publication.scheduled_at || publication.published_at)}</span><Status value={publication.status} /></div></div>{publication.error_message ? <p className="mt-2 text-sm text-[#A11C27]">{publication.error_message}</p> : null}</div>; })}</div>
            {!publications.length ? <Empty title="Nenhuma publicação na fila" description="A fila ficará ativa à medida que as contas forem conectadas por OAuth e conteúdos aprovados forem agendados." /> : null}
          </TabsContent>

          <TabsContent value="radar" className="space-y-4">
            <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold text-[#1E293F]">Radar de Mercado</h2><p className="text-sm text-slate-500">Concorrentes e referências ficam cadastrados para análise de sinais públicos, nunca de dados privados.</p></div><Button onClick={() => setModal("radar")}><Plus className="mr-2 h-4 w-4" />Adicionar perfil</Button></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{marketProfiles.map((profile) => <Card key={profile.id} className="border-[#B5A573]/20"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="font-semibold text-[#1E293F]">{profile.display_name || profile.handle}</p><p className="text-sm capitalize text-slate-500">{profile.provider} · {profile.profile_type}</p></div><span className={`h-2.5 w-2.5 rounded-full ${profile.active ? "bg-[#B5A573]" : "bg-slate-300"}`} /></div><p className="mt-3 text-xs text-slate-500">{profile.segment || "Segmento não informado"}</p>{profile.profile_url ? <a className="mt-3 inline-flex items-center text-sm text-[#A11C27]" href={profile.profile_url} target="_blank" rel="noreferrer"><LinkIcon className="mr-1.5 h-4 w-4" />Abrir perfil</a> : null}</CardContent></Card>)}</div>
            {!marketProfiles.length ? <Empty title="Radar ainda sem perfis" description="Cadastre concorrentes, criadores, administradoras e referências. A coleta posterior respeitará as APIs e o que for publicamente permitido em cada plataforma." /> : null}
          </TabsContent>

          <TabsContent value="pulso" className="space-y-4">
            <div><h2 className="text-xl font-semibold text-[#1E293F]">Pulso do Algoritmo</h2><p className="text-sm text-slate-500">Inferência baseada em performance observada. Score e confiança só aparecem quando há evidência suficiente.</p></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{pulses.map((pulse) => <Card key={pulse.id} className="border-[#B5A573]/20"><CardContent className="p-5"><div className="flex items-center justify-between"><p className="font-semibold capitalize text-[#1E293F]">{pulse.provider}</p><Status value={pulse.stage} /></div><p className="mt-3 text-sm text-slate-500">{pulse.dimension_type}: <strong className="text-[#1E293F]">{pulse.dimension_value}</strong></p><div className="mt-4 flex items-end justify-between"><div><p className="text-4xl font-semibold text-[#1E293F]">{Math.round(Number(pulse.score))}</p><p className="text-xs text-slate-400">score / 100</p></div><div className="text-right"><p className="font-semibold text-[#A11C27]">{Math.round(Number(pulse.confidence))}%</p><p className="text-xs text-slate-400">confiança · n={pulse.sample_size}</p></div></div></CardContent></Card>)}</div>
            {!pulses.length ? <Empty title="Ainda não há Pulso calculado" description="Correto por design: o CRM não inventará tendências. Essa tela será alimentada por métricas próprias + observações públicas do Radar e exibirá a amostra usada em cada conclusão." /> : null}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div><h2 className="text-xl font-semibold text-[#1E293F]">Analytics de Conteúdo → Receita</h2><p className="text-sm text-slate-500">Mídia e negócio no mesmo painel para separar conteúdo que dá view de conteúdo que gera oportunidade.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Views" value={analytics.views.toLocaleString("pt-BR")} /><Kpi label="Alcance" value={analytics.reach.toLocaleString("pt-BR")} /><Kpi label="Interações" value={analytics.interactions.toLocaleString("pt-BR")} /><Kpi label="Cliques" value={analytics.clicks.toLocaleString("pt-BR")} /></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Leads atribuídos" value={analytics.leads} /><Kpi label="Oportunidades" value={analytics.opportunities} /><Kpi label="Vendas" value={analytics.sales} /><Kpi label="Valor atribuído" value={analytics.revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} /></div>
            {!metrics.length && !attributions.length ? <Empty title="Sem histórico de performance ainda" description="As tabelas de métricas e atribuição já estão prontas. Elas começam a ganhar valor quando as contas sociais e o rastreamento CRM estiverem alimentando o ciclo." /> : null}
          </TabsContent>

          <TabsContent value="config" className="space-y-5">
            <div><h2 className="text-xl font-semibold text-[#1E293F]">Configurações</h2><p className="text-sm text-slate-500">Central de Contas, identidade, personas, linha editorial, regras de IA e automações.</p></div>
            <Card className="border-[#B5A573]/25">
              <CardHeader><CardTitle className="flex items-center gap-2 text-[#1E293F]"><AtSign className="h-5 w-5 text-[#A11C27]" />Central de Contas</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-[#B5A573]/25 bg-[#E0CE8C]/10 p-4 text-sm text-[#1E293F]"><ShieldCheck className="mr-2 inline h-4 w-4" />Login, senha e 2FA permanecem na tela oficial de cada rede. O CRM armazena somente a autorização/tokens protegidos no backend.</div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {PROVIDERS.map((provider) => {
                    const providerAccounts = accounts.filter((account) => account.provider === provider.key);
                    return <div key={provider.key} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><p className="font-semibold text-[#1E293F]">{provider.label}</p><p className="text-xs text-slate-500">{providerAccounts.length} conta(s)</p></div><AtSign className="h-5 w-5 text-[#B5A573]" /></div><div className="mt-3 space-y-2">{providerAccounts.map((account) => <div key={account.id} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-medium text-[#1E293F]">{account.username || account.display_name || "Conta"}</p><Status value={account.status} /></div><p className="mt-1 text-xs text-slate-400">{account.editorial_role || account.account_type || "Função editorial não definida"}</p></div>)}{!providerAccounts.length ? <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Nenhuma conta conectada.</p> : null}</div><Button variant="outline" className="mt-3 w-full" onClick={() => setNotice(`${provider.label}: estrutura OAuth preparada no banco. A ativação exige cadastrar o app oficial e suas credenciais no backend.`)}>+ Conectar conta</Button></div>;
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[{ type: "brand_kit", label: "Brand Kit", icon: Palette }, { type: "persona", label: "Personas", icon: Users }, { type: "editorial_line", label: "Linha Editorial", icon: Megaphone }, { type: "ai_rule", label: "Regras de IA", icon: Bot }].map((entry) => { const Icon = entry.icon; const count = settings.filter((item) => item.setting_type === entry.type && item.active).length; return <Card key={entry.type} className="border-[#B5A573]/20"><CardContent className="p-5"><Icon className="h-5 w-5 text-[#A11C27]" /><p className="mt-3 font-semibold text-[#1E293F]">{entry.label}</p><p className="mt-1 text-sm text-slate-500">{count} configuração(ões) ativa(s)</p></CardContent></Card>; })}
            </div>
            <div className="grid gap-3 md:grid-cols-2"><Card className="border-[#B5A573]/20"><CardContent className="p-5"><Workflow className="h-5 w-5 text-[#A11C27]" /><p className="mt-3 font-semibold text-[#1E293F]">Autonomia</p><p className="mt-1 text-sm text-slate-500">A arquitetura suporta Assistido → Semiautomático → Autônomo. A fase inicial permanece com aprovação humana.</p></CardContent></Card><Card className="border-[#B5A573]/20"><CardContent className="p-5"><MessageCircle className="h-5 w-5 text-[#A11C27]" /><p className="mt-3 font-semibold text-[#1E293F]">Community Manager</p><p className="mt-1 text-sm text-slate-500">Comentários e perguntas poderão alimentar ideias e pautas quando cada rede conceder as permissões correspondentes.</p></CardContent></Card></div>
          </TabsContent>
        </Tabs>
      </div>

      {modal === "idea" ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-xl"><h3 className="text-lg font-semibold text-[#1E293F]">Nova ideia</h3><div className="mt-4 space-y-3"><Input placeholder="Título opcional" value={ideaForm.title} onChange={(e) => setIdeaForm((old) => ({ ...old, title: e.target.value }))} /><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={ideaForm.source_type} onChange={(e) => setIdeaForm((old) => ({ ...old, source_type: e.target.value }))}><option value="manual">Texto / pensamento</option><option value="audio">Áudio</option><option value="video">Vídeo</option><option value="link">Referência / link</option><option value="comment">Comentário</option><option value="meeting">Reunião</option><option value="customer">Cliente</option><option value="radar">Radar</option></select><Textarea rows={8} placeholder="Escreva a ideia do jeito que ela veio. O Head organiza depois." value={ideaForm.raw_input} onChange={(e) => setIdeaForm((old) => ({ ...old, raw_input: e.target.value }))} /></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button disabled={saving || !ideaForm.raw_input.trim()} onClick={createIdea} className="bg-[#A11C27] hover:bg-[#8b1822]">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Salvar ideia</Button></div></div></div> : null}

      {modal === "content" ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-xl"><h3 className="text-lg font-semibold text-[#1E293F]">Novo Conteúdo-Mãe</h3><div className="mt-4 grid gap-3 md:grid-cols-2"><Input className="md:col-span-2" placeholder="Título" value={contentForm.title} onChange={(e) => setContentForm((old) => ({ ...old, title: e.target.value }))} /><Input placeholder="Tema" value={contentForm.theme} onChange={(e) => setContentForm((old) => ({ ...old, theme: e.target.value }))} /><Input placeholder="Pilar editorial" value={contentForm.content_pillar} onChange={(e) => setContentForm((old) => ({ ...old, content_pillar: e.target.value }))} /><Textarea className="md:col-span-2" rows={4} placeholder="Tese principal" value={contentForm.thesis} onChange={(e) => setContentForm((old) => ({ ...old, thesis: e.target.value }))} /><Input placeholder="Público" value={contentForm.audience} onChange={(e) => setContentForm((old) => ({ ...old, audience: e.target.value }))} /><Input placeholder="Segmento" value={contentForm.segment} onChange={(e) => setContentForm((old) => ({ ...old, segment: e.target.value }))} /><Input placeholder="Objetivo" value={contentForm.objective} onChange={(e) => setContentForm((old) => ({ ...old, objective: e.target.value }))} /><Input placeholder="CTA" value={contentForm.cta} onChange={(e) => setContentForm((old) => ({ ...old, cta: e.target.value }))} /></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button disabled={saving || !contentForm.title.trim()} onClick={createContent}>Criar conteúdo</Button></div></div></div> : null}

      {modal === "video" ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-xl"><h3 className="text-lg font-semibold text-[#1E293F]">Novo projeto de vídeo</h3><div className="mt-4 space-y-3"><Input placeholder="Nome do projeto" value={videoForm.title} onChange={(e) => setVideoForm((old) => ({ ...old, title: e.target.value }))} /><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={videoForm.content_id} onChange={(e) => setVideoForm((old) => ({ ...old, content_id: e.target.value }))}><option value="">Projeto independente</option>{contents.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><div className="grid grid-cols-2 gap-3"><Input type="number" min="5" placeholder="Duração alvo (s)" value={videoForm.target_duration_seconds} onChange={(e) => setVideoForm((old) => ({ ...old, target_duration_seconds: e.target.value }))} /><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={videoForm.target_format} onChange={(e) => setVideoForm((old) => ({ ...old, target_format: e.target.value }))}><option value="9:16">Vertical 9:16</option><option value="16:9">Horizontal 16:9</option><option value="1:1">Quadrado 1:1</option><option value="4:5">Feed 4:5</option></select></div><Textarea rows={4} placeholder="Instruções: ritmo, ordem, B-roll, multicâmera, observações…" value={videoForm.instructions} onChange={(e) => setVideoForm((old) => ({ ...old, instructions: e.target.value }))} /></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button disabled={saving || !videoForm.title.trim()} onClick={createVideoProject}>Criar projeto</Button></div></div></div> : null}

      {modal === "radar" ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-xl"><h3 className="text-lg font-semibold text-[#1E293F]">Adicionar ao Radar</h3><div className="mt-4 grid gap-3 md:grid-cols-2"><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={radarForm.provider} onChange={(e) => setRadarForm((old) => ({ ...old, provider: e.target.value }))}><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="linkedin">LinkedIn</option><option value="youtube">YouTube</option><option value="facebook">Facebook</option><option value="other">Outro</option></select><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={radarForm.profile_type} onChange={(e) => setRadarForm((old) => ({ ...old, profile_type: e.target.value }))}><option value="competitor">Concorrente</option><option value="reference">Referência</option><option value="administrator">Administradora</option><option value="creator">Criador</option><option value="other">Outro</option></select><Input placeholder="@usuario / handle" value={radarForm.handle} onChange={(e) => setRadarForm((old) => ({ ...old, handle: e.target.value }))} /><Input placeholder="Nome" value={radarForm.display_name} onChange={(e) => setRadarForm((old) => ({ ...old, display_name: e.target.value }))} /><Input className="md:col-span-2" placeholder="URL pública do perfil" value={radarForm.profile_url} onChange={(e) => setRadarForm((old) => ({ ...old, profile_url: e.target.value }))} /><Input className="md:col-span-2" placeholder="Segmento" value={radarForm.segment} onChange={(e) => setRadarForm((old) => ({ ...old, segment: e.target.value }))} /></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button disabled={saving || !radarForm.handle.trim()} onClick={createRadarProfile}>Adicionar ao Radar</Button></div></div></div> : null}
    </div>
  );
}
