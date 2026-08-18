import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  CalendarClock,
  Check,
  Copy,
  Edit3,
  Image as ImageIcon,
  Loader2,
  Mail,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

type NewsletterStatus = "rascunho" | "aprovacao" | "programada" | "enviada" | "arquivada";

type Newsletter = {
  id: string;
  campaign_id: string | null;
  title: string;
  subject: string;
  preheader: string | null;
  audience: string | null;
  segment: string | null;
  scheduled_for: string | null;
  status: NewsletterStatus;
  content: string | null;
  cta_text: string | null;
  cta_url: string | null;
  banner_file_path: string | null;
  banner_external_url: string | null;
  notes: string | null;
  sent_at: string | null;
  created_at: string;
};

type CampaignOption = {
  id: string;
  name: string;
};

type GeneratedNewsletter = {
  title: string;
  subject: string;
  preheader: string;
  content: string;
  cta_text: string;
};

const SEGMENTS = [
  "Institucional",
  "Imóveis",
  "Automóveis",
  "Pesados",
  "Agronegócio",
  "Investimento",
  "Parceiros",
  "Pós-venda",
];

const STATUS_OPTIONS: Array<{ value: NewsletterStatus; label: string }> = [
  { value: "rascunho", label: "Rascunho" },
  { value: "aprovacao", label: "Em aprovação" },
  { value: "programada", label: "Programada" },
  { value: "enviada", label: "Enviada" },
  { value: "arquivada", label: "Arquivada" },
];

const STATUS_CLASS: Record<NewsletterStatus, string> = {
  rascunho: "bg-slate-100 text-slate-700",
  aprovacao: "bg-amber-50 text-amber-700",
  programada: "bg-purple-50 text-purple-700",
  enviada: "bg-emerald-50 text-emerald-700",
  arquivada: "bg-gray-100 text-gray-600",
};

function emptyForm() {
  return {
    title: "",
    subject: "",
    preheader: "",
    audience: "",
    segment: "Institucional",
    campaign_id: "",
    scheduled_date: "",
    scheduled_time: "09:00",
    status: "rascunho" as NewsletterStatus,
    content: "",
    cta_text: "",
    cta_url: "",
    banner_external_url: "",
    notes: "",
  };
}

function parseJson(text: string): Partial<GeneratedNewsletter> | null {
  try {
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sem agendamento";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Sem agendamento";
  }
}

function toSchedule(date: string, time: string) {
  if (!date) return null;
  const local = new Date(`${date}T${time || "09:00"}:00`);
  return Number.isNaN(local.getTime()) ? null : local.toISOString();
}

function scheduleParts(value?: string | null) {
  if (!value) return { date: "", time: "09:00" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "09:00" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export default function MarketingNewsletterPanel() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [bannerUrls, setBannerUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    void loadAll();
  }, []);

  const visibleNewsletters = useMemo(() => {
    const query = search.trim().toLowerCase();
    return newsletters.filter((newsletter) => {
      const matchesQuery = !query || `${newsletter.title} ${newsletter.subject} ${newsletter.audience || ""}`.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "todos" || newsletter.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [newsletters, search, statusFilter]);

  const summary = useMemo(() => ({
    drafts: newsletters.filter((item) => ["rascunho", "aprovacao"].includes(item.status)).length,
    scheduled: newsletters.filter((item) => item.status === "programada").length,
    sent: newsletters.filter((item) => item.status === "enviada").length,
  }), [newsletters]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    const [newsletterRes, campaignRes] = await Promise.all([
      supabase.from("marketing_newsletters").select("*").order("created_at", { ascending: false }),
      supabase.from("marketing_campaigns").select("id,name").order("created_at", { ascending: false }),
    ]);

    if (newsletterRes.error) {
      setError(`Não foi possível carregar as newsletters: ${newsletterRes.error.message}`);
      setLoading(false);
      return;
    }

    const loaded = (newsletterRes.data || []) as Newsletter[];
    setNewsletters(loaded);
    setCampaigns((campaignRes.data || []) as CampaignOption[]);

    const entries = await Promise.all(loaded.map(async (item) => {
      if (!item.banner_file_path) return [item.id, item.banner_external_url || ""] as const;
      const { data } = await supabase.storage.from("marketing-creatives").createSignedUrl(item.banner_file_path, 60 * 60);
      return [item.id, data?.signedUrl || item.banner_external_url || ""] as const;
    }));
    setBannerUrls(Object.fromEntries(entries));
    setLoading(false);
  }

  function openNew() {
    setEditingId(null);
    setBannerFile(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(item: Newsletter) {
    const scheduled = scheduleParts(item.scheduled_for);
    setEditingId(item.id);
    setBannerFile(null);
    setForm({
      title: item.title || "",
      subject: item.subject || "",
      preheader: item.preheader || "",
      audience: item.audience || "",
      segment: item.segment || "Institucional",
      campaign_id: item.campaign_id || "",
      scheduled_date: scheduled.date,
      scheduled_time: scheduled.time,
      status: item.status,
      content: item.content || "",
      cta_text: item.cta_text || "",
      cta_url: item.cta_url || "",
      banner_external_url: item.banner_external_url || "",
      notes: item.notes || "",
    });
    setDialogOpen(true);
  }

  async function generateWithMax() {
    const theme = form.title.trim() || form.subject.trim();
    if (!theme) return setError("Informe pelo menos um título ou assunto para orientar o Max.");
    setGenerating(true);
    setError(null);

    const prompt = `
Crie uma newsletter para a Consulmax Consórcios.

Tema/título desejado: ${form.title || "a definir"}
Assunto atual: ${form.subject || "a definir"}
Público: ${form.audience || "clientes e parceiros da Consulmax"}
Segmento: ${form.segment}
Objetivo: informar, gerar autoridade e estimular uma conversa comercial de forma responsável.

Diretrizes:
- Tom premium, consultivo, didático e direto.
- Escreva em português do Brasil.
- Não prometa contemplação, rentabilidade ou resultado garantido.
- Use parágrafos curtos, leitura agradável em e-mail e uma chamada para ação clara.
- Evite excesso de emojis.

Responda APENAS em JSON válido, sem markdown, com estas chaves:
{
  "title": "título editorial da newsletter",
  "subject": "assunto do e-mail",
  "preheader": "texto curto de pré-cabeçalho",
  "content": "corpo completo da newsletter",
  "cta_text": "texto curto do botão ou chamada para ação"
}`;

    try {
      const response = await fetch("/api/max-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          mode: "marketing",
          context: { newsletter: form },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const body = await response.json();
      const parsed = parseJson(String(body?.answer || ""));
      if (!parsed) throw new Error("O Max respondeu em um formato inesperado. Tente novamente.");
      setForm((current) => ({
        ...current,
        title: parsed.title || current.title,
        subject: parsed.subject || current.subject,
        preheader: parsed.preheader || current.preheader,
        content: parsed.content || current.content,
        cta_text: parsed.cta_text || current.cta_text,
      }));
      showNotice("Newsletter criada com o Max.");
    } catch (generateError: any) {
      setError(generateError?.message || "Não foi possível gerar a newsletter.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveNewsletter() {
    if (!form.title.trim() || !form.subject.trim()) {
      return setError("Informe o título da newsletter e o assunto do e-mail.");
    }

    setSaving(true);
    setError(null);
    let uploadedPath: string | null = null;

    try {
      const auth = await supabase.auth.getUser();
      const userId = auth.data.user?.id || null;
      const current = editingId ? newsletters.find((item) => item.id === editingId) : null;
      let bannerFilePath = current?.banner_file_path || null;

      if (bannerFile) {
        const safeName = bannerFile.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 140);
        uploadedPath = `newsletters/${new Date().getFullYear()}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("marketing-creatives").upload(uploadedPath, bannerFile, {
          upsert: false,
          contentType: bannerFile.type || undefined,
        });
        if (uploadError) throw uploadError;
        bannerFilePath = uploadedPath;
      }

      const payload = {
        campaign_id: form.campaign_id || null,
        title: form.title.trim(),
        subject: form.subject.trim(),
        preheader: form.preheader.trim() || null,
        audience: form.audience.trim() || null,
        segment: form.segment || null,
        scheduled_for: toSchedule(form.scheduled_date, form.scheduled_time),
        status: form.status,
        content: form.content.trim() || null,
        cta_text: form.cta_text.trim() || null,
        cta_url: form.cta_url.trim() || null,
        banner_file_path: bannerFilePath,
        banner_external_url: form.banner_external_url.trim() || null,
        notes: form.notes.trim() || null,
        sent_at: form.status === "enviada" ? (current?.sent_at || new Date().toISOString()) : null,
      };

      const request = editingId
        ? supabase.from("marketing_newsletters").update(payload).eq("id", editingId)
        : supabase.from("marketing_newsletters").insert({ ...payload, created_by: userId });

      const { data, error: saveError } = await request.select("*").single();
      if (saveError) throw saveError;

      const saved = data as Newsletter;
      setNewsletters((items) => editingId
        ? items.map((item) => item.id === editingId ? saved : item)
        : [saved, ...items]);

      if (saved.banner_file_path) {
        const { data: signed } = await supabase.storage.from("marketing-creatives").createSignedUrl(saved.banner_file_path, 60 * 60);
        setBannerUrls((urls) => ({ ...urls, [saved.id]: signed?.signedUrl || saved.banner_external_url || "" }));
      } else {
        setBannerUrls((urls) => ({ ...urls, [saved.id]: saved.banner_external_url || "" }));
      }

      if (bannerFile && current?.banner_file_path && current.banner_file_path !== saved.banner_file_path) {
        await supabase.storage.from("marketing-creatives").remove([current.banner_file_path]);
      }

      setDialogOpen(false);
      setEditingId(null);
      setBannerFile(null);
      setForm(emptyForm());
      showNotice(editingId ? "Newsletter atualizada." : "Newsletter criada.");
    } catch (saveError: any) {
      if (uploadedPath) await supabase.storage.from("marketing-creatives").remove([uploadedPath]);
      setError(saveError?.message || "Não foi possível salvar a newsletter.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(item: Newsletter, status: NewsletterStatus) {
    const { data, error: updateError } = await supabase.from("marketing_newsletters")
      .update({
        status,
        sent_at: status === "enviada" ? (item.sent_at || new Date().toISOString()) : null,
      })
      .eq("id", item.id)
      .select("*")
      .single();
    if (updateError) return setError(updateError.message);
    setNewsletters((items) => items.map((row) => row.id === item.id ? data as Newsletter : row));
  }

  async function removeNewsletter(item: Newsletter) {
    if (!window.confirm(`Excluir a newsletter “${item.title}”?`)) return;
    const { error: deleteError } = await supabase.from("marketing_newsletters").delete().eq("id", item.id);
    if (deleteError) return setError(deleteError.message);
    if (item.banner_file_path) await supabase.storage.from("marketing-creatives").remove([item.banner_file_path]);
    setNewsletters((items) => items.filter((row) => row.id !== item.id));
    showNotice("Newsletter excluída.");
  }

  if (loading) {
    return <div className="flex min-h-[360px] items-center justify-center gap-3 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Carregando newsletters…</div>;
  }

  return (
    <div className="space-y-5">
      {notice && <div className="fixed right-5 top-20 z-[80] rounded-2xl bg-[#1E293F] px-4 py-3 text-sm text-white shadow-xl"><Check className="mr-2 inline h-4 w-4" />{notice}</div>}
      {error && (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span><button type="button" onClick={() => setError(null)} className="font-semibold">Fechar</button>
        </div>
      )}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#A11C27]">Relacionamento e autoridade</p>
          <h2 className="mt-1 text-xl font-bold text-[#1E293F]">Newsletter</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Crie, revise e organize as newsletters da Consulmax. O envio por e-mail será integrado em uma etapa posterior; aqui ficam o conteúdo e o histórico editorial.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Criar newsletter</Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <MiniSummary icon={Edit3} label="Em elaboração" value={summary.drafts} />
        <MiniSummary icon={CalendarClock} label="Programadas" value={summary.scheduled} />
        <MiniSummary icon={Mail} label="Enviadas" value={summary.sent} />
      </section>

      <Card className="border-white/70 bg-white/90 shadow-md">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título, assunto ou público" className="pl-9" />
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="todos">Todos os status</option>
              {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {visibleNewsletters.length ? (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {visibleNewsletters.map((item) => {
            const bannerUrl = bannerUrls[item.id] || item.banner_external_url || "";
            const statusLabel = STATUS_OPTIONS.find((status) => status.value === item.status)?.label || item.status;
            return (
              <Card key={item.id} className="overflow-hidden border-white/70 bg-white/90 shadow-md">
                {bannerUrl ? (
                  <div className="aspect-[16/6] overflow-hidden bg-slate-100"><img src={bannerUrl} alt="" className="h-full w-full object-cover" /></div>
                ) : (
                  <div className="flex aspect-[16/4] items-center justify-center bg-gradient-to-r from-[#1E293F] to-[#A11C27] text-white/80"><Mail className="h-8 w-8" /></div>
                )}
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[item.status]}`}>{statusLabel}</span>
                      <h3 className="mt-3 line-clamp-2 text-lg font-bold text-[#1E293F]">{item.title}</h3>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(item)} title="Editar"><Edit3 className="h-4 w-4" /></Button>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-700">Assunto: {item.subject}</p>
                  <p className="mt-2 line-clamp-2 min-h-[40px] text-sm text-slate-500">{item.preheader || item.content || "Newsletter ainda sem conteúdo."}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500">
                    <div><span className="font-semibold text-slate-700">Público</span><p className="mt-1 line-clamp-2">{item.audience || "Não definido"}</p></div>
                    <div><span className="font-semibold text-slate-700">Agendamento</span><p className="mt-1">{formatDateTime(item.scheduled_for)}</p></div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    <select value={item.status} onChange={(event) => void updateStatus(item, event.target.value as NewsletterStatus)} className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-xs">
                      {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                    <Button size="icon" variant="outline" title="Copiar conteúdo" disabled={!item.content} onClick={() => item.content && navigator.clipboard.writeText(item.content).catch(() => undefined)}><Copy className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="Excluir" onClick={() => void removeNewsletter(item)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed border-slate-200 bg-white/70">
          <CardContent className="flex min-h-[260px] flex-col items-center justify-center p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#A11C27]/10 text-[#A11C27]"><Mail className="h-7 w-7" /></div>
            <h3 className="mt-4 font-semibold text-[#1E293F]">Nenhuma newsletter encontrada</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Crie a primeira edição ou ajuste os filtros da busca.</p>
            <Button className="mt-4" onClick={openNew}><Plus className="mr-2 h-4 w-4" />Criar newsletter</Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Editar newsletter" : "Criar newsletter"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="md:col-span-2"><Field label="Título da newsletter"><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Patrimônio em Movimento — Agosto" /></Field></div>
            <div className="md:col-span-2"><Field label="Assunto do e-mail"><Input value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Assunto que aparecerá na caixa de entrada" /></Field></div>
            <div className="md:col-span-2"><Field label="Pré-cabeçalho"><Input value={form.preheader} onChange={(event) => setForm((current) => ({ ...current, preheader: event.target.value }))} placeholder="Complemento curto exibido ao lado do assunto" /></Field></div>
            <Field label="Público / lista"><Input value={form.audience} onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))} placeholder="Ex.: clientes investidores e empresários" /></Field>
            <Field label="Segmento"><NativeSelect value={form.segment} onChange={(value) => setForm((current) => ({ ...current, segment: value }))} options={SEGMENTS} /></Field>
            <Field label="Campanha"><NativeSelect allowEmpty emptyLabel="Sem campanha" value={form.campaign_id} onChange={(value) => setForm((current) => ({ ...current, campaign_id: value }))} options={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))} /></Field>
            <Field label="Status"><NativeSelect value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value as NewsletterStatus }))} options={STATUS_OPTIONS} /></Field>
            <Field label="Data prevista"><Input type="date" value={form.scheduled_date} onChange={(event) => setForm((current) => ({ ...current, scheduled_date: event.target.value }))} /></Field>
            <Field label="Horário"><Input type="time" value={form.scheduled_time} onChange={(event) => setForm((current) => ({ ...current, scheduled_time: event.target.value }))} /></Field>
            <div className="md:col-span-2 flex justify-end"><Button type="button" variant="outline" onClick={() => void generateWithMax()} disabled={generating || (!form.title.trim() && !form.subject.trim())}>{generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{generating ? "Criando…" : "Criar texto com o Max"}</Button></div>
            <div className="md:col-span-2"><Field label="Conteúdo da newsletter"><Textarea rows={12} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} placeholder="Escreva ou gere o conteúdo completo da newsletter" /></Field></div>
            <Field label="Texto do CTA"><Input value={form.cta_text} onChange={(event) => setForm((current) => ({ ...current, cta_text: event.target.value }))} placeholder="Ex.: Solicitar uma análise" /></Field>
            <Field label="Link do CTA"><Input value={form.cta_url} onChange={(event) => setForm((current) => ({ ...current, cta_url: event.target.value }))} placeholder="https://..." /></Field>
            <Field label="Banner / imagem de capa"><Input type="file" accept="image/*" onChange={(event) => setBannerFile(event.target.files?.[0] || null)} /></Field>
            <Field label="Ou URL de imagem"><Input value={form.banner_external_url} onChange={(event) => setForm((current) => ({ ...current, banner_external_url: event.target.value }))} placeholder="https://..." /></Field>
            <div className="md:col-span-2"><Field label="Observações internas"><Textarea rows={2} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></Field></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => void saveNewsletter()} disabled={saving || !form.title.trim() || !form.subject.trim()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{editingId ? "Salvar alterações" : "Criar newsletter"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniSummary({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <Card className="border-white/70 bg-white/90 shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1E293F]/8 text-[#1E293F]"><Icon className="h-5 w-5" /></div>
        <div><p className="text-xs font-medium text-slate-500">{label}</p><p className="text-xl font-bold text-[#1E293F]">{value}</p></div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}

function NativeSelect({ value, onChange, options, allowEmpty, emptyLabel = "Selecione" }: {
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { value: string; label: string }>;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#A11C27]/20">
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {options.map((option) => {
        const normalized = typeof option === "string" ? { value: option, label: option } : option;
        return <option key={normalized.value} value={normalized.value}>{normalized.label}</option>;
      })}
    </select>
  );
}
