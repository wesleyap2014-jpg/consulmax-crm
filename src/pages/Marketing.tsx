import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  Copy,
  Download,
  FileImage,
  FolderKanban,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";

type MediaPlan = {
  id: string;
  name: string;
  reference_month: string;
  objective: string | null;
  audience: string | null;
  channels: string[];
  content_pillars: string[];
  budget: number | null;
  status: "rascunho" | "ativo" | "concluido" | "arquivado";
  created_at: string;
};

type Campaign = {
  id: string;
  name: string;
  objective: string | null;
  audience: string | null;
  segment: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "planejamento" | "ativa" | "pausada" | "concluida" | "arquivada";
  notes: string | null;
  created_at: string;
};

type ContentStatus = "ideia" | "producao" | "aprovacao" | "aprovado" | "programado" | "publicado" | "arquivado";

type ContentItem = {
  id: string;
  plan_id: string | null;
  campaign_id: string | null;
  title: string;
  theme: string | null;
  objective: string | null;
  audience: string | null;
  segment: string | null;
  channel: string | null;
  format: string | null;
  status: ContentStatus;
  scheduled_for: string | null;
  scheduled_time: string | null;
  art_text: string | null;
  caption: string | null;
  whatsapp_copy: string | null;
  video_script: string | null;
  visual_brief: string | null;
  cta: string | null;
  created_at: string;
};

type Creative = {
  id: string;
  campaign_id: string | null;
  content_id: string | null;
  title: string;
  description: string | null;
  segment: string | null;
  channel: string | null;
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

type StudioResult = {
  title: string;
  art_text: string;
  caption: string;
  whatsapp_copy: string;
  video_script: string;
  visual_brief: string;
  cta: string;
};

type ModalKind = "plan" | "calendar" | "campaign" | "creative" | null;

const BRAND = {
  red: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
};

const CONTENT_STATUS: Array<{ value: ContentStatus; label: string; className: string }> = [
  { value: "ideia", label: "Ideia", className: "bg-slate-100 text-slate-700" },
  { value: "producao", label: "Em produção", className: "bg-blue-50 text-blue-700" },
  { value: "aprovacao", label: "Em aprovação", className: "bg-amber-50 text-amber-700" },
  { value: "aprovado", label: "Aprovado", className: "bg-indigo-50 text-indigo-700" },
  { value: "programado", label: "Programado", className: "bg-purple-50 text-purple-700" },
  { value: "publicado", label: "Publicado", className: "bg-emerald-50 text-emerald-700" },
  { value: "arquivado", label: "Arquivado", className: "bg-gray-100 text-gray-600" },
];

const CHANNELS = ["Instagram", "WhatsApp", "Facebook", "LinkedIn", "E-mail", "Reunião", "Interno"];
const FORMATS = ["Feed", "Story", "Reels", "Carrossel", "Card", "Mensagem", "Vídeo", "E-mail", "Encontro"];
const SEGMENTS = ["Institucional", "Imóveis", "Automóveis", "Pesados", "Agronegócio", "Investimento", "Parceiros", "Pós-venda"];

const emptyStudioResult: StudioResult = {
  title: "",
  art_text: "",
  caption: "",
  whatsapp_copy: "",
  video_script: "",
  visual_brief: "",
  cta: "",
};

function monthKey(value?: string | null) {
  const source = value ? new Date(`${value.slice(0, 10)}T12:00:00`) : new Date();
  return `${source.getFullYear()}-${String(source.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: string) {
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function brDate(value?: string | null) {
  if (!value) return "Sem data";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function normalizeList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function statusInfo(status: ContentStatus) {
  return CONTENT_STATUS.find((item) => item.value === status) || CONTENT_STATUS[0];
}

function safeJson(text: string): Partial<StudioResult> | null {
  try {
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

function calendarCells(referenceMonth: string) {
  const [year, month] = referenceMonth.slice(0, 7).split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const leading = first.getDay();
  const cells: Array<string | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= lastDay; day += 1) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function firstDayOfCurrentMonth() {
  return `${monthKey()}-01`;
}

function nextMonth(value: string, increment: number) {
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00`);
  date.setMonth(date.getMonth() + increment);
  return `${monthKey(date.toISOString())}-01`;
}

function isImage(mime?: string | null) {
  return Boolean(mime?.startsWith("image/"));
}

function copyText(value: string) {
  if (!value) return;
  navigator.clipboard.writeText(value).catch(() => undefined);
}

export default function Marketing() {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [activeTab, setActiveTab] = useState("plano");

  const [plans, setPlans] = useState<MediaPlan[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [creativeUrls, setCreativeUrls] = useState<Record<string, string>>({});
  const [activePlanId, setActivePlanId] = useState("");

  const [planForm, setPlanForm] = useState({
    name: `Plano de mídia — ${monthLabel(firstDayOfCurrentMonth())}`,
    reference_month: monthKey(),
    objective: "",
    audience: "",
    channels: "Instagram, WhatsApp",
    content_pillars: "Educação, Oportunidades, Autoridade, Relacionamento",
    budget: "",
  });
  const [calendarForm, setCalendarForm] = useState({
    title: "",
    scheduled_for: new Date().toISOString().slice(0, 10),
    channel: "WhatsApp",
    format: "Card",
    segment: "Institucional",
    objective: "",
    campaign_id: "",
    status: "ideia" as ContentStatus,
  });
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    objective: "",
    audience: "",
    segment: "Institucional",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    notes: "",
  });
  const [creativeForm, setCreativeForm] = useState({
    title: "",
    description: "",
    campaign_id: "",
    segment: "Institucional",
    channel: "WhatsApp",
    format: "Story",
    caption: "",
    usage_instructions: "",
    external_url: "",
    visibility: "todos" as Creative["visibility"],
    status: "publicado" as Creative["status"],
    valid_until: "",
  });
  const [creativeFile, setCreativeFile] = useState<File | null>(null);

  const [studioForm, setStudioForm] = useState({
    theme: "",
    objective: "",
    audience: "",
    segment: "Institucional",
    channel: "Instagram",
    format: "Feed",
    tone: "Premium, didático, consultivo e direto",
    campaign_id: "",
    scheduled_for: "",
  });
  const [studioResult, setStudioResult] = useState<StudioResult>(emptyStudioResult);
  const [generating, setGenerating] = useState(false);
  const [creativeSearch, setCreativeSearch] = useState("");
  const [creativeSegment, setCreativeSegment] = useState("todos");
  const [creativeCampaign, setCreativeCampaign] = useState("todos");

  const canManage = role === "admin";
  const activePlan = useMemo(() => plans.find((plan) => plan.id === activePlanId) || null, [plans, activePlanId]);
  const planContents = useMemo(
    () => contents.filter((item) => item.plan_id === activePlanId),
    [contents, activePlanId],
  );

  const visibleCreatives = useMemo(() => {
    const query = creativeSearch.trim().toLowerCase();
    return creatives.filter((creative) => {
      const matchesQuery = !query || `${creative.title} ${creative.description || ""} ${creative.segment || ""}`.toLowerCase().includes(query);
      const matchesSegment = creativeSegment === "todos" || creative.segment === creativeSegment;
      const matchesCampaign = creativeCampaign === "todos" || creative.campaign_id === creativeCampaign;
      return matchesQuery && matchesSegment && matchesCampaign;
    });
  }, [creatives, creativeSearch, creativeSegment, creativeCampaign]);

  const summary = useMemo(() => ({
    monthItems: activePlan ? planContents.length : contents.filter((item) => item.scheduled_for?.startsWith(monthKey())).length,
    producing: contents.filter((item) => ["producao", "aprovacao"].includes(item.status)).length,
    activeCampaigns: campaigns.filter((campaign) => campaign.status === "ativa").length,
    publishedCreatives: creatives.filter((creative) => creative.status === "publicado").length,
  }), [activePlan, planContents.length, contents, campaigns, creatives]);

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (role && role !== "admin") setActiveTab("criativos");
  }, [role]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    const auth = await supabase.auth.getUser();
    const authUser = auth.data.user;
    if (!authUser) {
      setError("Não foi possível identificar o usuário autenticado.");
      setLoading(false);
      return;
    }
    setUserId(authUser.id);

    const [profileRes, plansRes, campaignsRes, contentRes, creativesRes] = await Promise.all([
      supabase.from("users").select("role").eq("auth_user_id", authUser.id).maybeSingle(),
      supabase.from("marketing_media_plans").select("*").order("reference_month", { ascending: false }),
      supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("marketing_content_items").select("*").order("scheduled_for", { ascending: true }),
      supabase.from("marketing_creatives").select("*").order("created_at", { ascending: false }),
    ]);

    setRole(String(profileRes.data?.role || "viewer"));
    const firstError = plansRes.error || campaignsRes.error || contentRes.error || creativesRes.error;
    if (firstError) {
      setError(`A estrutura da Central de Marketing ainda não está disponível no Supabase: ${firstError.message}`);
    }

    const loadedPlans = (plansRes.data || []) as MediaPlan[];
    const loadedCreatives = (creativesRes.data || []) as Creative[];
    setPlans(loadedPlans);
    setCampaigns((campaignsRes.data || []) as Campaign[]);
    setContents((contentRes.data || []) as ContentItem[]);
    setCreatives(loadedCreatives);
    setActivePlanId((current) => current || loadedPlans.find((plan) => plan.status === "ativo")?.id || loadedPlans[0]?.id || "");

    const signedEntries = await Promise.all(loadedCreatives.map(async (creative) => {
      if (!creative.file_path) return [creative.id, creative.external_url || ""] as const;
      const { data } = await supabase.storage.from("marketing-creatives").createSignedUrl(creative.file_path, 60 * 60);
      return [creative.id, data?.signedUrl || creative.external_url || ""] as const;
    }));
    setCreativeUrls(Object.fromEntries(signedEntries));
    setLoading(false);
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  }

  async function createPlan() {
    if (!planForm.name.trim() || !planForm.reference_month) return;
    setSaving(true);
    const { data, error: insertError } = await supabase.from("marketing_media_plans").insert({
      name: planForm.name.trim(),
      reference_month: `${planForm.reference_month}-01`,
      objective: planForm.objective.trim() || null,
      audience: planForm.audience.trim() || null,
      channels: normalizeList(planForm.channels),
      content_pillars: normalizeList(planForm.content_pillars),
      budget: planForm.budget ? Number(planForm.budget.replace(",", ".")) : null,
      status: plans.length ? "rascunho" : "ativo",
      created_by: userId,
    }).select("*").single();
    setSaving(false);
    if (insertError) return setError(insertError.message);
    const created = data as MediaPlan;
    setPlans((current) => [created, ...current]);
    setActivePlanId(created.id);
    setModal(null);
    showNotice("Plano de mídia criado.");
  }

  async function createCalendarItem() {
    if (!activePlanId || !calendarForm.title.trim()) return;
    setSaving(true);
    const { data, error: insertError } = await supabase.from("marketing_content_items").insert({
      plan_id: activePlanId,
      campaign_id: calendarForm.campaign_id || null,
      title: calendarForm.title.trim(),
      objective: calendarForm.objective.trim() || null,
      channel: calendarForm.channel,
      format: calendarForm.format,
      segment: calendarForm.segment,
      scheduled_for: calendarForm.scheduled_for || null,
      status: calendarForm.status,
      created_by: userId,
    }).select("*").single();
    setSaving(false);
    if (insertError) return setError(insertError.message);
    setContents((current) => [...current, data as ContentItem]);
    setCalendarForm((current) => ({ ...current, title: "", objective: "" }));
    setModal(null);
    showNotice("Conteúdo adicionado ao calendário.");
  }

  async function applyConsulmaxRoutine() {
    if (!activePlan || !canManage) return;
    const cells = calendarCells(activePlan.reference_month).filter(Boolean) as string[];
    const routine: Record<number, { title: string; channel: string; format: string; audience: string }> = {
      1: { title: "Fala Parceiro", channel: "Reunião", format: "Encontro", audience: "Parceiros" },
      2: { title: "Você Sabia?", channel: "WhatsApp", format: "Card", audience: "Parceiros e colaboradores" },
      3: { title: "Fala Comigo, Parceiro", channel: "WhatsApp", format: "Mensagem", audience: "Parceiros" },
      4: { title: "Você Sabia?", channel: "WhatsApp", format: "Card", audience: "Parceiros e colaboradores" },
      5: { title: "Destaques da Semana", channel: "WhatsApp", format: "Card", audience: "Parceiros e colaboradores" },
    };
    const existingKeys = new Set(planContents.map((item) => `${item.scheduled_for}|${item.title}`));
    const rows = cells.flatMap((date) => {
      const item = routine[new Date(`${date}T12:00:00`).getDay()];
      if (!item || existingKeys.has(`${date}|${item.title}`)) return [];
      return [{
        plan_id: activePlan.id,
        title: item.title,
        audience: item.audience,
        channel: item.channel,
        format: item.format,
        segment: "Parceiros",
        scheduled_for: date,
        status: "programado",
        created_by: userId,
      }];
    });
    if (!rows.length) return showNotice("A rotina já está lançada neste mês.");
    setSaving(true);
    const { data, error: insertError } = await supabase.from("marketing_content_items").insert(rows).select("*");
    setSaving(false);
    if (insertError) return setError(insertError.message);
    setContents((current) => [...current, ...((data || []) as ContentItem[])]);
    showNotice(`${rows.length} ações recorrentes adicionadas ao plano.`);
  }

  async function updateContentStatus(item: ContentItem, status: ContentStatus) {
    const approval = status === "aprovado" ? { approved_by: userId, approved_at: new Date().toISOString() } : {};
    const { data, error: updateError } = await supabase.from("marketing_content_items")
      .update({ status, ...approval }).eq("id", item.id).select("*").single();
    if (updateError) return setError(updateError.message);
    setContents((current) => current.map((row) => row.id === item.id ? data as ContentItem : row));
  }

  async function removeContent(item: ContentItem) {
    if (!window.confirm(`Excluir “${item.title}” do plano?`)) return;
    const { error: deleteError } = await supabase.from("marketing_content_items").delete().eq("id", item.id);
    if (deleteError) return setError(deleteError.message);
    setContents((current) => current.filter((row) => row.id !== item.id));
  }

  async function createCampaign() {
    if (!campaignForm.name.trim()) return;
    setSaving(true);
    const { data, error: insertError } = await supabase.from("marketing_campaigns").insert({
      name: campaignForm.name.trim(),
      objective: campaignForm.objective.trim() || null,
      audience: campaignForm.audience.trim() || null,
      segment: campaignForm.segment || null,
      start_date: campaignForm.start_date || null,
      end_date: campaignForm.end_date || null,
      notes: campaignForm.notes.trim() || null,
      status: "planejamento",
      created_by: userId,
    }).select("*").single();
    setSaving(false);
    if (insertError) return setError(insertError.message);
    setCampaigns((current) => [data as Campaign, ...current]);
    setCampaignForm((current) => ({ ...current, name: "", objective: "", audience: "", end_date: "", notes: "" }));
    setModal(null);
    showNotice("Campanha criada.");
  }

  async function updateCampaignStatus(campaign: Campaign, status: Campaign["status"]) {
    const { data, error: updateError } = await supabase.from("marketing_campaigns")
      .update({ status }).eq("id", campaign.id).select("*").single();
    if (updateError) return setError(updateError.message);
    setCampaigns((current) => current.map((row) => row.id === campaign.id ? data as Campaign : row));
  }

  async function generateContent() {
    if (!studioForm.theme.trim()) return setError("Informe o tema do conteúdo.");
    setGenerating(true);
    setError(null);
    const prompt = `
Crie um conteúdo de marketing completo para a Consulmax Consórcios.

Tema: ${studioForm.theme}
Objetivo: ${studioForm.objective || "educar e gerar conversa"}
Público: ${studioForm.audience || "clientes e parceiros da Consulmax"}
Segmento: ${studioForm.segment}
Canal: ${studioForm.channel}
Formato: ${studioForm.format}
Tom: ${studioForm.tone}

Contexto da marca:
- Empresa: Consulmax Consórcios.
- Posicionamento: consultivo, estratégico, premium e próximo.
- Slogan: Transformando sonhos em conquistas reais.
- Evite promessas de contemplação, rentabilidade ou resultado garantido.
- O texto deve ser comercialmente atraente, mas claro e responsável.

Responda APENAS em JSON válido, sem markdown, exatamente com estas chaves:
{
  "title": "título do conteúdo",
  "art_text": "texto curto que deve aparecer na arte",
  "caption": "legenda completa para a publicação",
  "whatsapp_copy": "versão pronta para enviar no WhatsApp",
  "video_script": "roteiro curto caso o formato comporte vídeo",
  "visual_brief": "orientação visual detalhada para criar o material",
  "cta": "chamada para ação"
}`;

    try {
      const response = await fetch("/api/max-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          mode: "marketing",
          context: { studio: studioForm, campaign: campaigns.find((campaign) => campaign.id === studioForm.campaign_id) || null },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const body = await response.json();
      const parsed = safeJson(String(body?.answer || ""));
      if (!parsed) throw new Error("A IA respondeu em um formato inesperado. Tente novamente.");
      setStudioResult({ ...emptyStudioResult, ...parsed });
      showNotice("Conteúdo criado pelo Estúdio.");
    } catch (generateError: any) {
      setError(generateError?.message || "Não foi possível gerar o conteúdo.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveStudioContent() {
    if (!studioResult.title.trim()) return;
    setSaving(true);
    const { data, error: insertError } = await supabase.from("marketing_content_items").insert({
      plan_id: activePlanId || null,
      campaign_id: studioForm.campaign_id || null,
      title: studioResult.title.trim(),
      theme: studioForm.theme.trim() || null,
      objective: studioForm.objective.trim() || null,
      audience: studioForm.audience.trim() || null,
      segment: studioForm.segment,
      channel: studioForm.channel,
      format: studioForm.format,
      status: "producao",
      scheduled_for: studioForm.scheduled_for || null,
      art_text: studioResult.art_text || null,
      caption: studioResult.caption || null,
      whatsapp_copy: studioResult.whatsapp_copy || null,
      video_script: studioResult.video_script || null,
      visual_brief: studioResult.visual_brief || null,
      cta: studioResult.cta || null,
      created_by: userId,
    }).select("*").single();
    setSaving(false);
    if (insertError) return setError(insertError.message);
    setContents((current) => [...current, data as ContentItem]);
    showNotice("Conteúdo salvo em produção.");
  }

  async function createCreative() {
    if (!creativeForm.title.trim() || (!creativeFile && !creativeForm.external_url.trim())) {
      return setError("Informe um título e envie um arquivo ou link do criativo.");
    }
    setSaving(true);
    setError(null);
    let filePath: string | null = null;
    let mimeType: string | null = null;
    try {
      if (creativeFile) {
        const safeName = creativeFile.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 140);
        filePath = `library/${new Date().getFullYear()}/${Date.now()}-${safeName}`;
        mimeType = creativeFile.type || null;
        const { error: uploadError } = await supabase.storage.from("marketing-creatives").upload(filePath, creativeFile, {
          upsert: false,
          contentType: creativeFile.type || undefined,
        });
        if (uploadError) throw uploadError;
      }
      const { data, error: insertError } = await supabase.from("marketing_creatives").insert({
        title: creativeForm.title.trim(),
        description: creativeForm.description.trim() || null,
        campaign_id: creativeForm.campaign_id || null,
        segment: creativeForm.segment,
        channel: creativeForm.channel,
        format: creativeForm.format,
        caption: creativeForm.caption.trim() || null,
        usage_instructions: creativeForm.usage_instructions.trim() || null,
        file_path: filePath,
        external_url: creativeForm.external_url.trim() || null,
        mime_type: mimeType,
        visibility: creativeForm.visibility,
        status: creativeForm.status,
        valid_until: creativeForm.valid_until || null,
        published_at: creativeForm.status === "publicado" ? new Date().toISOString() : null,
        created_by: userId,
      }).select("*").single();
      if (insertError) throw insertError;
      const created = data as Creative;
      setCreatives((current) => [created, ...current]);
      if (filePath) {
        const { data: signed } = await supabase.storage.from("marketing-creatives").createSignedUrl(filePath, 60 * 60);
        setCreativeUrls((current) => ({ ...current, [created.id]: signed?.signedUrl || "" }));
      } else {
        setCreativeUrls((current) => ({ ...current, [created.id]: created.external_url || "" }));
      }
      setCreativeForm((current) => ({ ...current, title: "", description: "", caption: "", usage_instructions: "", external_url: "", valid_until: "" }));
      setCreativeFile(null);
      setModal(null);
      showNotice("Criativo publicado na biblioteca.");
    } catch (creativeError: any) {
      if (filePath) await supabase.storage.from("marketing-creatives").remove([filePath]);
      setError(creativeError?.message || "Não foi possível publicar o criativo.");
    } finally {
      setSaving(false);
    }
  }

  async function updateCreativeStatus(creative: Creative, status: Creative["status"]) {
    const { data, error: updateError } = await supabase.from("marketing_creatives")
      .update({ status, published_at: status === "publicado" ? new Date().toISOString() : null })
      .eq("id", creative.id).select("*").single();
    if (updateError) return setError(updateError.message);
    setCreatives((current) => current.map((row) => row.id === creative.id ? data as Creative : row));
  }

  async function removeCreative(creative: Creative) {
    if (!window.confirm(`Excluir o criativo “${creative.title}”?`)) return;
    const { error: deleteError } = await supabase.from("marketing_creatives").delete().eq("id", creative.id);
    if (deleteError) return setError(deleteError.message);
    if (creative.file_path) await supabase.storage.from("marketing-creatives").remove([creative.file_path]);
    setCreatives((current) => current.filter((row) => row.id !== creative.id));
  }

  async function openCreative(creative: Creative) {
    let url = creative.external_url || creativeUrls[creative.id];
    if (creative.file_path) {
      const { data, error: signedError } = await supabase.storage.from("marketing-creatives").createSignedUrl(creative.file_path, 60 * 10, {
        download: creative.title,
      });
      if (signedError) return setError(signedError.message);
      url = data?.signedUrl || url;
    }
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  function openCalendarForDate(date?: string | null) {
    setCalendarForm((current) => ({ ...current, scheduled_for: date || new Date().toISOString().slice(0, 10) }));
    setModal("calendar");
  }

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Carregando Central de Marketing…</div>;
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-10">
      <section className="overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-[0_18px_55px_rgba(30,41,63,.12)] backdrop-blur-xl">
        <div className="relative overflow-hidden px-5 py-6 md:px-8 md:py-8">
          <div className="absolute inset-0 opacity-90" style={{ background: "linear-gradient(120deg, rgba(161,28,39,.10), rgba(181,165,115,.12) 45%, rgba(30,41,63,.08))" }} />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg" style={{ background: `linear-gradient(145deg, ${BRAND.red}, ${BRAND.navy})` }}>
                <Megaphone className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.22em] text-[#A11C27]">Consulmax</p>
                <h1 className="mt-1 text-2xl font-bold text-[#1E293F] md:text-3xl">Central de Marketing</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                  Planeje a comunicação, produza conteúdos com o Max e entregue campanhas prontas para parceiros e colaboradores.
                </p>
              </div>
            </div>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setModal("plan")}><CalendarDays className="mr-2 h-4 w-4" />Novo plano</Button>
                <Button onClick={() => setActiveTab("estudio")}><Wand2 className="mr-2 h-4 w-4" />Criar conteúdo</Button>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CircleCheckBig className="mr-2 inline h-4 w-4" />Materiais oficiais liberados para uso.
              </div>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span><button type="button" onClick={() => setError(null)} className="font-semibold">Fechar</button>
        </div>
      )}
      {notice && <div className="fixed right-5 top-20 z-[70] rounded-2xl bg-[#1E293F] px-4 py-3 text-sm text-white shadow-xl"><Check className="mr-2 inline h-4 w-4" />{notice}</div>}

      {canManage && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={CalendarDays} label="Ações no plano" value={summary.monthItems} detail={activePlan ? monthLabel(activePlan.reference_month) : "Mês atual"} color="red" />
          <SummaryCard icon={Wand2} label="Em produção" value={summary.producing} detail="Produção e aprovação" color="blue" />
          <SummaryCard icon={Target} label="Campanhas ativas" value={summary.activeCampaigns} detail="Em execução agora" color="gold" />
          <SummaryCard icon={ImageIcon} label="Criativos publicados" value={summary.publishedCreatives} detail="Disponíveis para o time" color="green" />
        </section>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="min-w-max border border-white/80 bg-white/75 p-1.5 shadow-sm backdrop-blur">
            {canManage && <TabsTrigger value="plano"><CalendarDays className="mr-2 h-4 w-4" />Plano de mídia</TabsTrigger>}
            {canManage && <TabsTrigger value="estudio"><Sparkles className="mr-2 h-4 w-4" />Estúdio de conteúdo</TabsTrigger>}
            {canManage && <TabsTrigger value="campanhas"><FolderKanban className="mr-2 h-4 w-4" />Campanhas</TabsTrigger>}
            <TabsTrigger value="criativos"><ImageIcon className="mr-2 h-4 w-4" />Central de criativos</TabsTrigger>
          </TabsList>
        </div>

        {canManage && <TabsContent value="plano" className="mt-5 space-y-5">
          <Card className="border-white/70 bg-white/85 shadow-lg backdrop-blur">
            <CardContent className="p-4 md:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#A11C27]">Planejamento editorial</p>
                  {activePlan ? (
                    <>
                      <h2 className="mt-1 truncate text-xl font-bold text-[#1E293F]">{activePlan.name}</h2>
                      <p className="mt-1 text-sm text-slate-600">{activePlan.objective || "Organize os canais, pautas e entregas do mês."}</p>
                    </>
                  ) : <h2 className="mt-1 text-xl font-bold text-[#1E293F]">Crie o primeiro plano de mídia</h2>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {plans.length > 0 && (
                    <select value={activePlanId} onChange={(event) => setActivePlanId(event.target.value)} className="h-10 max-w-[280px] rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#A11C27]/20">
                      {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                    </select>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setModal("plan")}><Plus className="mr-1.5 h-4 w-4" />Plano</Button>
                  <Button variant="outline" size="sm" disabled={!activePlan || saving} onClick={() => void applyConsulmaxRoutine()}><RefreshCcw className="mr-1.5 h-4 w-4" />Aplicar rotina</Button>
                  <Button size="sm" disabled={!activePlan} onClick={() => openCalendarForDate()}><Plus className="mr-1.5 h-4 w-4" />Adicionar ação</Button>
                </div>
              </div>
              {activePlan && (
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                  <InfoLine label="Público" value={activePlan.audience || "Não definido"} />
                  <InfoLine label="Canais" value={activePlan.channels?.join(" • ") || "Não definidos"} />
                  <InfoLine label="Pilares" value={activePlan.content_pillars?.join(" • ") || "Não definidos"} />
                </div>
              )}
            </CardContent>
          </Card>

          {activePlan ? (
            <CalendarBoard
              plan={activePlan}
              items={planContents}
              campaigns={campaigns}
              onAdd={openCalendarForDate}
              onStatus={updateContentStatus}
              onRemove={removeContent}
              onPrevious={() => {
                const target = nextMonth(activePlan.reference_month, -1);
                const found = plans.find((plan) => monthKey(plan.reference_month) === monthKey(target));
                if (found) setActivePlanId(found.id);
                else {
                  setPlanForm((current) => ({ ...current, reference_month: monthKey(target), name: `Plano de mídia — ${monthLabel(target)}` }));
                  setModal("plan");
                }
              }}
              onNext={() => {
                const target = nextMonth(activePlan.reference_month, 1);
                const found = plans.find((plan) => monthKey(plan.reference_month) === monthKey(target));
                if (found) setActivePlanId(found.id);
                else {
                  setPlanForm((current) => ({ ...current, reference_month: monthKey(target), name: `Plano de mídia — ${monthLabel(target)}` }));
                  setModal("plan");
                }
              }}
            />
          ) : (
            <EmptyState icon={CalendarDays} title="Nenhum plano de mídia criado" description="Comece definindo o mês, os objetivos, o público, os canais e os pilares editoriais." action="Criar plano de mídia" onAction={() => setModal("plan")} />
          )}
        </TabsContent>}

        {canManage && <TabsContent value="estudio" className="mt-5">
          <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <Card className="h-fit border-white/70 bg-white/90 shadow-lg">
              <CardHeader><CardTitle className="flex items-center gap-2 text-[#1E293F]"><Wand2 className="h-5 w-5 text-[#A11C27]" />Briefing do conteúdo</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Field label="Tema ou pauta"><Input value={studioForm.theme} onChange={(event) => setStudioForm((current) => ({ ...current, theme: event.target.value }))} placeholder="Ex.: Como funciona a contemplação por lance" /></Field>
                <Field label="Objetivo"><Textarea rows={2} value={studioForm.objective} onChange={(event) => setStudioForm((current) => ({ ...current, objective: event.target.value }))} placeholder="O que o conteúdo deve ensinar ou provocar?" /></Field>
                <Field label="Público"><Input value={studioForm.audience} onChange={(event) => setStudioForm((current) => ({ ...current, audience: event.target.value }))} placeholder="Ex.: empresários e produtores rurais" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Segmento"><NativeSelect value={studioForm.segment} onChange={(value) => setStudioForm((current) => ({ ...current, segment: value }))} options={SEGMENTS} /></Field>
                  <Field label="Canal"><NativeSelect value={studioForm.channel} onChange={(value) => setStudioForm((current) => ({ ...current, channel: value }))} options={CHANNELS} /></Field>
                  <Field label="Formato"><NativeSelect value={studioForm.format} onChange={(value) => setStudioForm((current) => ({ ...current, format: value }))} options={FORMATS} /></Field>
                  <Field label="Publicação"><Input type="date" value={studioForm.scheduled_for} onChange={(event) => setStudioForm((current) => ({ ...current, scheduled_for: event.target.value }))} /></Field>
                </div>
                <Field label="Campanha"><NativeSelect allowEmpty emptyLabel="Sem campanha" value={studioForm.campaign_id} onChange={(value) => setStudioForm((current) => ({ ...current, campaign_id: value }))} options={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))} /></Field>
                <Field label="Tom da comunicação"><Input value={studioForm.tone} onChange={(event) => setStudioForm((current) => ({ ...current, tone: event.target.value }))} /></Field>
                <Button className="w-full" onClick={() => void generateContent()} disabled={generating || !studioForm.theme.trim()}>
                  {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {generating ? "Criando conteúdo…" : "Criar com o Max"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-white/70 bg-white/90 shadow-lg">
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div><CardTitle className="text-[#1E293F]">Conteúdo produzido</CardTitle><p className="mt-1 text-sm text-slate-500">Revise, copie e salve no plano de mídia.</p></div>
                {studioResult.title && <Button variant="outline" size="sm" onClick={() => void saveStudioContent()} disabled={saving}><Check className="mr-1.5 h-4 w-4" />Salvar em produção</Button>}
              </CardHeader>
              <CardContent>
                {!studioResult.title ? (
                  <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#A11C27]/10 text-[#A11C27]"><Sparkles className="h-7 w-7" /></div>
                    <h3 className="mt-4 font-semibold text-[#1E293F]">Seu conteúdo aparecerá aqui</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">O Estúdio entrega texto da arte, legenda, WhatsApp, roteiro de vídeo, briefing visual e CTA em uma única criação.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <StudioBlock title="Título" value={studioResult.title} onChange={(value) => setStudioResult((current) => ({ ...current, title: value }))} />
                    <StudioBlock title="Texto da arte" value={studioResult.art_text} onChange={(value) => setStudioResult((current) => ({ ...current, art_text: value }))} />
                    <StudioBlock title="Legenda" value={studioResult.caption} onChange={(value) => setStudioResult((current) => ({ ...current, caption: value }))} large />
                    <StudioBlock title="Mensagem para WhatsApp" value={studioResult.whatsapp_copy} onChange={(value) => setStudioResult((current) => ({ ...current, whatsapp_copy: value }))} large />
                    <StudioBlock title="Roteiro de vídeo" value={studioResult.video_script} onChange={(value) => setStudioResult((current) => ({ ...current, video_script: value }))} large />
                    <StudioBlock title="Briefing visual" value={studioResult.visual_brief} onChange={(value) => setStudioResult((current) => ({ ...current, visual_brief: value }))} large />
                    <StudioBlock title="Chamada para ação" value={studioResult.cta} onChange={(value) => setStudioResult((current) => ({ ...current, cta: value }))} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>}

        {canManage && <TabsContent value="campanhas" className="mt-5 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-xl font-bold text-[#1E293F]">Campanhas</h2><p className="text-sm text-slate-600">Reúna estratégia, conteúdo e criativos em kits de comunicação.</p></div>
            <Button onClick={() => setModal("campaign")}><Plus className="mr-2 h-4 w-4" />Nova campanha</Button>
          </div>
          {campaigns.length ? (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {campaigns.map((campaign) => {
                const contentCount = contents.filter((item) => item.campaign_id === campaign.id).length;
                const creativeCount = creatives.filter((item) => item.campaign_id === campaign.id).length;
                return (
                  <Card key={campaign.id} className="border-white/70 bg-white/90 shadow-md">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><span className="rounded-full bg-[#B5A573]/15 px-2.5 py-1 text-xs font-semibold text-[#7d6e3f]">{campaign.segment || "Institucional"}</span><h3 className="mt-3 truncate text-lg font-bold text-[#1E293F]">{campaign.name}</h3></div>
                        <select value={campaign.status} onChange={(event) => void updateCampaignStatus(campaign, event.target.value as Campaign["status"])} className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs">
                          <option value="planejamento">Planejamento</option><option value="ativa">Ativa</option><option value="pausada">Pausada</option><option value="concluida">Concluída</option><option value="arquivada">Arquivada</option>
                        </select>
                      </div>
                      <p className="mt-3 min-h-[44px] text-sm leading-6 text-slate-600">{campaign.objective || "Campanha ainda sem objetivo detalhado."}</p>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <InfoLine label="Período" value={`${brDate(campaign.start_date)} — ${brDate(campaign.end_date)}`} />
                        <InfoLine label="Público" value={campaign.audience || "Não definido"} />
                      </div>
                      <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500"><span>{contentCount} conteúdos</span><span>•</span><span>{creativeCount} criativos</span></div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : <EmptyState icon={FolderKanban} title="Nenhuma campanha criada" description="Crie kits completos para iniciativas como Troca de Chaves, Lance Prime e Agronegócio." action="Criar campanha" onAction={() => setModal("campaign")} />}
        </TabsContent>}

        <TabsContent value="criativos" className="mt-5 space-y-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#A11C27]">Biblioteca oficial</p><h2 className="mt-1 text-xl font-bold text-[#1E293F]">Criativos para parceiros e colaboradores</h2><p className="mt-1 text-sm text-slate-600">Baixe o material e copie a comunicação sugerida para divulgar com segurança.</p></div>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={creativeSearch} onChange={(event) => setCreativeSearch(event.target.value)} placeholder="Buscar criativos" className="pl-9" /></div>
              <NativeSelect value={creativeSegment} onChange={setCreativeSegment} options={[{ value: "todos", label: "Todos os segmentos" }, ...SEGMENTS.map((value) => ({ value, label: value }))]} className="w-[190px]" />
              <NativeSelect value={creativeCampaign} onChange={setCreativeCampaign} options={[{ value: "todos", label: "Todas as campanhas" }, ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))]} className="w-[210px]" />
              {canManage && <Button onClick={() => setModal("creative")}><Upload className="mr-2 h-4 w-4" />Publicar criativo</Button>}
            </div>
          </div>

          {visibleCreatives.length ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleCreatives.map((creative) => {
                const url = creativeUrls[creative.id] || creative.external_url || "";
                const campaign = campaigns.find((item) => item.id === creative.campaign_id);
                const expired = creative.valid_until && new Date(`${creative.valid_until}T23:59:59`) < new Date();
                return (
                  <Card key={creative.id} className={`group overflow-hidden border-white/70 bg-white/90 shadow-md transition hover:-translate-y-0.5 hover:shadow-xl ${expired ? "opacity-70" : ""}`}>
                    <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
                      {isImage(creative.mime_type) && url ? <img src={url} alt={creative.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : (
                        <div className="flex h-full flex-col items-center justify-center text-slate-400"><FileImage className="h-12 w-12" /><span className="mt-2 text-xs font-medium">{creative.format || "Material"}</span></div>
                      )}
                      <div className="absolute left-3 top-3 flex flex-wrap gap-2"><span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#1E293F] shadow-sm backdrop-blur">{creative.segment || "Institucional"}</span>{expired && <span className="rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white">Expirado</span>}</div>
                    </div>
                    <CardContent className="p-4">
                      {campaign && <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A11C27]">{campaign.name}</p>}
                      <h3 className="mt-1 line-clamp-2 font-bold text-[#1E293F]">{creative.title}</h3>
                      <p className="mt-2 line-clamp-2 min-h-[40px] text-sm text-slate-600">{creative.description || creative.usage_instructions || "Material oficial Consulmax pronto para divulgação."}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-slate-600"><span className="rounded-full bg-slate-100 px-2 py-1">{creative.channel || "Todos os canais"}</span><span className="rounded-full bg-slate-100 px-2 py-1">{creative.format || "Criativo"}</span><span className="rounded-full bg-slate-100 px-2 py-1">{creative.visibility === "todos" ? "Todos" : creative.visibility}</span></div>
                      {creative.valid_until && <p className="mt-3 text-xs text-slate-500">Disponível até {brDate(creative.valid_until)}</p>}
                      <div className="mt-4 flex gap-2">
                        <Button size="sm" className="flex-1" onClick={() => void openCreative(creative)} disabled={!url}><Download className="mr-1.5 h-4 w-4" />{creative.external_url && !creative.file_path ? "Abrir" : "Baixar"}</Button>
                        <Button size="icon" variant="outline" onClick={() => copyText(creative.caption || creative.usage_instructions || "")} title="Copiar legenda" disabled={!creative.caption && !creative.usage_instructions}><Copy className="h-4 w-4" /></Button>
                        {canManage && <Button size="icon" variant="ghost" onClick={() => void removeCreative(creative)} title="Excluir"><Trash2 className="h-4 w-4 text-red-600" /></Button>}
                      </div>
                      {canManage && <select value={creative.status} onChange={(event) => void updateCreativeStatus(creative, event.target.value as Creative["status"])} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"><option value="rascunho">Rascunho</option><option value="aprovacao">Em aprovação</option><option value="publicado">Publicado</option><option value="arquivado">Arquivado</option></select>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : <EmptyState icon={ImageIcon} title="Nenhum criativo encontrado" description={canManage ? "Publique o primeiro material oficial ou ajuste os filtros da biblioteca." : "Ainda não há materiais liberados para estes filtros."} action={canManage ? "Publicar criativo" : undefined} onAction={canManage ? () => setModal("creative") : undefined} />}
        </TabsContent>
      </Tabs>

      <Dialog open={modal === "plan"} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Novo plano de mídia</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <Field label="Nome do plano"><Input value={planForm.name} onChange={(event) => setPlanForm((current) => ({ ...current, name: event.target.value }))} /></Field>
            <Field label="Mês de referência"><Input type="month" value={planForm.reference_month} onChange={(event) => setPlanForm((current) => ({ ...current, reference_month: event.target.value, name: `Plano de mídia — ${monthLabel(`${event.target.value}-01`)}` }))} /></Field>
            <div className="md:col-span-2"><Field label="Objetivo"><Textarea rows={2} value={planForm.objective} onChange={(event) => setPlanForm((current) => ({ ...current, objective: event.target.value }))} placeholder="Ex.: fortalecer autoridade e gerar oportunidades qualificadas" /></Field></div>
            <div className="md:col-span-2"><Field label="Público prioritário"><Input value={planForm.audience} onChange={(event) => setPlanForm((current) => ({ ...current, audience: event.target.value }))} placeholder="Ex.: empresários, produtores rurais e parceiros comerciais" /></Field></div>
            <Field label="Canais, separados por vírgula"><Input value={planForm.channels} onChange={(event) => setPlanForm((current) => ({ ...current, channels: event.target.value }))} /></Field>
            <Field label="Orçamento previsto"><Input inputMode="decimal" value={planForm.budget} onChange={(event) => setPlanForm((current) => ({ ...current, budget: event.target.value }))} placeholder="0,00" /></Field>
            <div className="md:col-span-2"><Field label="Pilares de conteúdo, separados por vírgula"><Input value={planForm.content_pillars} onChange={(event) => setPlanForm((current) => ({ ...current, content_pillars: event.target.value }))} /></Field></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button onClick={() => void createPlan()} disabled={saving || !planForm.name.trim()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar plano</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "calendar"} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Adicionar ao calendário editorial</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="md:col-span-2"><Field label="Título da ação"><Input value={calendarForm.title} onChange={(event) => setCalendarForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Você Sabia? — Lance embutido" /></Field></div>
            <Field label="Data"><Input type="date" value={calendarForm.scheduled_for} onChange={(event) => setCalendarForm((current) => ({ ...current, scheduled_for: event.target.value }))} /></Field>
            <Field label="Status"><NativeSelect value={calendarForm.status} onChange={(value) => setCalendarForm((current) => ({ ...current, status: value as ContentStatus }))} options={CONTENT_STATUS.map((status) => ({ value: status.value, label: status.label }))} /></Field>
            <Field label="Canal"><NativeSelect value={calendarForm.channel} onChange={(value) => setCalendarForm((current) => ({ ...current, channel: value }))} options={CHANNELS} /></Field>
            <Field label="Formato"><NativeSelect value={calendarForm.format} onChange={(value) => setCalendarForm((current) => ({ ...current, format: value }))} options={FORMATS} /></Field>
            <Field label="Segmento"><NativeSelect value={calendarForm.segment} onChange={(value) => setCalendarForm((current) => ({ ...current, segment: value }))} options={SEGMENTS} /></Field>
            <Field label="Campanha"><NativeSelect allowEmpty emptyLabel="Sem campanha" value={calendarForm.campaign_id} onChange={(value) => setCalendarForm((current) => ({ ...current, campaign_id: value }))} options={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))} /></Field>
            <div className="md:col-span-2"><Field label="Objetivo"><Textarea rows={2} value={calendarForm.objective} onChange={(event) => setCalendarForm((current) => ({ ...current, objective: event.target.value }))} /></Field></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button onClick={() => void createCalendarItem()} disabled={saving || !calendarForm.title.trim()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Adicionar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "campaign"} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="md:col-span-2"><Field label="Nome da campanha"><Input value={campaignForm.name} onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Troca de Chaves" /></Field></div>
            <div className="md:col-span-2"><Field label="Objetivo"><Textarea rows={2} value={campaignForm.objective} onChange={(event) => setCampaignForm((current) => ({ ...current, objective: event.target.value }))} /></Field></div>
            <Field label="Público"><Input value={campaignForm.audience} onChange={(event) => setCampaignForm((current) => ({ ...current, audience: event.target.value }))} /></Field>
            <Field label="Segmento"><NativeSelect value={campaignForm.segment} onChange={(value) => setCampaignForm((current) => ({ ...current, segment: value }))} options={SEGMENTS} /></Field>
            <Field label="Início"><Input type="date" value={campaignForm.start_date} onChange={(event) => setCampaignForm((current) => ({ ...current, start_date: event.target.value }))} /></Field>
            <Field label="Fim"><Input type="date" value={campaignForm.end_date} onChange={(event) => setCampaignForm((current) => ({ ...current, end_date: event.target.value }))} /></Field>
            <div className="md:col-span-2"><Field label="Orientações da campanha"><Textarea rows={3} value={campaignForm.notes} onChange={(event) => setCampaignForm((current) => ({ ...current, notes: event.target.value }))} /></Field></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button onClick={() => void createCampaign()} disabled={saving || !campaignForm.name.trim()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar campanha</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "creative"} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Publicar criativo</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="md:col-span-2"><Field label="Título"><Input value={creativeForm.title} onChange={(event) => setCreativeForm((current) => ({ ...current, title: event.target.value }))} placeholder="Nome claro para o parceiro localizar o material" /></Field></div>
            <div className="md:col-span-2"><Field label="Descrição"><Textarea rows={2} value={creativeForm.description} onChange={(event) => setCreativeForm((current) => ({ ...current, description: event.target.value }))} /></Field></div>
            <Field label="Campanha"><NativeSelect allowEmpty emptyLabel="Sem campanha" value={creativeForm.campaign_id} onChange={(value) => setCreativeForm((current) => ({ ...current, campaign_id: value }))} options={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))} /></Field>
            <Field label="Segmento"><NativeSelect value={creativeForm.segment} onChange={(value) => setCreativeForm((current) => ({ ...current, segment: value }))} options={SEGMENTS} /></Field>
            <Field label="Canal"><NativeSelect value={creativeForm.channel} onChange={(value) => setCreativeForm((current) => ({ ...current, channel: value }))} options={CHANNELS} /></Field>
            <Field label="Formato"><NativeSelect value={creativeForm.format} onChange={(value) => setCreativeForm((current) => ({ ...current, format: value }))} options={FORMATS} /></Field>
            <Field label="Visibilidade"><NativeSelect value={creativeForm.visibility} onChange={(value) => setCreativeForm((current) => ({ ...current, visibility: value as Creative["visibility"] }))} options={[{ value: "todos", label: "Parceiros e colaboradores" }, { value: "parceiros", label: "Somente parceiros" }, { value: "colaboradores", label: "Somente colaboradores" }]} /></Field>
            <Field label="Status"><NativeSelect value={creativeForm.status} onChange={(value) => setCreativeForm((current) => ({ ...current, status: value as Creative["status"] }))} options={[{ value: "rascunho", label: "Rascunho" }, { value: "aprovacao", label: "Em aprovação" }, { value: "publicado", label: "Publicado" }]} /></Field>
            <Field label="Validade da oferta"><Input type="date" value={creativeForm.valid_until} onChange={(event) => setCreativeForm((current) => ({ ...current, valid_until: event.target.value }))} /></Field>
            <Field label="Arquivo (imagem, vídeo ou PDF)"><Input type="file" accept="image/*,video/*,application/pdf" onChange={(event) => setCreativeFile(event.target.files?.[0] || null)} /></Field>
            <div className="md:col-span-2"><Field label="Ou link externo / Canva"><Input value={creativeForm.external_url} onChange={(event) => setCreativeForm((current) => ({ ...current, external_url: event.target.value }))} placeholder="https://..." /></Field></div>
            <div className="md:col-span-2"><Field label="Legenda sugerida"><Textarea rows={4} value={creativeForm.caption} onChange={(event) => setCreativeForm((current) => ({ ...current, caption: event.target.value }))} /></Field></div>
            <div className="md:col-span-2"><Field label="Orientação de uso"><Textarea rows={2} value={creativeForm.usage_instructions} onChange={(event) => setCreativeForm((current) => ({ ...current, usage_instructions: event.target.value }))} placeholder="Ex.: publicar no Status e enviar individualmente para clientes do segmento" /></Field></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button><Button onClick={() => void createCreative()} disabled={saving || !creativeForm.title.trim() || (!creativeFile && !creativeForm.external_url.trim())}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Publicar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, detail, color }: { icon: React.ElementType; label: string; value: number; detail: string; color: "red" | "blue" | "gold" | "green" }) {
  const styles = { red: "bg-red-50 text-[#A11C27]", blue: "bg-blue-50 text-blue-700", gold: "bg-amber-50 text-amber-700", green: "bg-emerald-50 text-emerald-700" };
  return <Card className="border-white/70 bg-white/85 shadow-md"><CardContent className="flex items-center gap-4 p-4"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${styles[color]}`}><Icon className="h-5 w-5" /></div><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="text-2xl font-bold text-[#1E293F]">{value}</p><p className="text-[11px] text-slate-400">{detail}</p></div></CardContent></Card>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="block text-xs font-semibold text-slate-600">{label}</label>{children}</div>;
}

function NativeSelect({ value, onChange, options, allowEmpty, emptyLabel = "Selecione", className = "" }: { value: string; onChange: (value: string) => void; options: Array<string | { value: string; label: string }>; allowEmpty?: boolean; emptyLabel?: string; className?: string }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className={`h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#A11C27]/20 ${className}`}>{allowEmpty && <option value="">{emptyLabel}</option>}{options.map((option) => { const item = typeof option === "string" ? { value: option, label: option } : option; return <option key={item.value} value={item.value}>{item.label}</option>; })}</select>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2.5"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 truncate text-xs font-medium text-slate-700" title={value}>{value}</p></div>;
}

function EmptyState({ icon: Icon, title, description, action, onAction }: { icon: React.ElementType; title: string; description: string; action?: string; onAction?: () => void }) {
  return <Card className="border-dashed border-slate-200 bg-white/75"><CardContent className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#A11C27]/10 text-[#A11C27]"><Icon className="h-7 w-7" /></div><h3 className="mt-4 font-semibold text-[#1E293F]">{title}</h3><p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>{action && onAction && <Button className="mt-5" onClick={onAction}><Plus className="mr-2 h-4 w-4" />{action}</Button>}</CardContent></Card>;
}

function StudioBlock({ title, value, onChange, large }: { title: string; value: string; onChange: (value: string) => void; large?: boolean }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p><button type="button" onClick={() => copyText(value)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-[#A11C27]" title="Copiar"><Copy className="h-3.5 w-3.5" /></button></div><Textarea value={value} onChange={(event) => onChange(event.target.value)} rows={large ? 7 : 3} className="resize-y border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" /></div>;
}

function CalendarBoard({ plan, items, campaigns, onAdd, onStatus, onRemove, onPrevious, onNext }: { plan: MediaPlan; items: ContentItem[]; campaigns: Campaign[]; onAdd: (date?: string | null) => void; onStatus: (item: ContentItem, status: ContentStatus) => void; onRemove: (item: ContentItem) => void; onPrevious: () => void; onNext: () => void }) {
  const cells = calendarCells(plan.reference_month);
  const byDate = useMemo(() => {
    const map: Record<string, ContentItem[]> = {};
    items.forEach((item) => { if (!item.scheduled_for) return; (map[item.scheduled_for] ||= []).push(item); });
    return map;
  }, [items]);
  return <Card className="overflow-hidden border-white/70 bg-white/90 shadow-lg"><CardHeader className="border-b border-slate-100"><div className="flex items-center justify-between gap-3"><Button size="icon" variant="outline" onClick={onPrevious} title="Mês anterior"><ChevronLeft className="h-4 w-4" /></Button><div className="text-center"><CardTitle className="capitalize text-[#1E293F]">{monthLabel(plan.reference_month)}</CardTitle><p className="mt-1 text-xs text-slate-500">{items.length} ações planejadas</p></div><Button size="icon" variant="outline" onClick={onNext} title="Próximo mês"><ChevronRight className="h-4 w-4" /></Button></div></CardHeader><CardContent className="p-0"><div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => <div key={day} className="px-1 py-2.5">{day}</div>)}</div><div className="grid grid-cols-7">{cells.map((date, index) => { const dayItems = date ? byDate[date] || [] : []; return <div key={`${date || "empty"}-${index}`} className={`min-h-[128px] border-b border-r border-slate-100 p-1.5 md:min-h-[150px] md:p-2 ${date ? "bg-white hover:bg-slate-50/70" : "bg-slate-50/60"}`}>{date && <><button type="button" onClick={() => onAdd(date)} className="mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-slate-600 hover:bg-[#A11C27] hover:text-white">{Number(date.slice(-2))}</button><div className="space-y-1.5">{dayItems.slice(0, 3).map((item) => { const info = statusInfo(item.status); const campaign = campaigns.find((row) => row.id === item.campaign_id); return <div key={item.id} className={`group rounded-xl px-2 py-1.5 text-[10px] leading-4 ${info.className}`} title={`${item.title}${campaign ? ` — ${campaign.name}` : ""}`}><div className="flex items-start justify-between gap-1"><span className="line-clamp-2 font-semibold">{item.title}</span><button type="button" onClick={(event) => { event.stopPropagation(); void onRemove(item); }} className="hidden shrink-0 group-hover:block"><Trash2 className="h-3 w-3" /></button></div><select value={item.status} onChange={(event) => void onStatus(item, event.target.value as ContentStatus)} className="mt-1 hidden w-full rounded bg-white/70 px-1 py-0.5 text-[9px] outline-none group-hover:block">{CONTENT_STATUS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></div>; })}{dayItems.length > 3 && <p className="px-1 text-[10px] font-medium text-slate-500">+ {dayItems.length - 3} ações</p>}</div></>}</div>; })}</div></CardContent></Card>;
}
