import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Download, Filter, Megaphone, RefreshCw, Send, ShieldCheck, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { StatCard, StatusPill, WhatsAppModuleHeader } from "./WhatsAppShell";

type Campaign = {
  id: string;
  name?: string | null;
  status?: string | null;
  message_body?: string | null;
  created_at?: string | null;
  scheduled_at?: string | null;
};

type Recipient = {
  id: string;
  nome?: string | null;
  telefone_digits?: string | null;
  status?: string | null;
  error_message?: string | null;
  created_at?: string | null;
};

type ContactBook = {
  id?: string | null;
  nome?: string | null;
  telefone?: string | null;
  telefone_digits?: string | null;
  lead_id?: string | null;
  cliente_id?: string | null;
  origem?: string | null;
};

type MetaTemplate = {
  id?: string;
  name: string;
  template_name?: string | null;
  status?: string | null;
  category?: string | null;
  language?: string | null;
  body?: string | null;
  components?: any[] | null;
};

const FALLBACK_APPROVED_TEMPLATES: MetaTemplate[] = [
  {
    name: "call_permission_optin",
    template_name: "call_permission_optin",
    status: "APPROVED",
    category: "MARKETING",
    language: "pt_BR",
    body: "Olá, aqui é da Consulmax Consórcios. Podemos te ligar pelo WhatsApp para agilizar seu atendimento?",
  },
];

function onlyDigits(v?: string | null) { return String(v || "").replace(/\D/g, ""); }
function fmt(n: number) { return new Intl.NumberFormat("pt-BR").format(n || 0); }
function firstName(v?: string | null) { return String(v || "").trim().split(/\s+/)[0] || "cliente"; }

function statusTone(status?: string | null): "green" | "red" | "gold" | "blue" | "slate" {
  if (status === "sent" || status === "finished" || status === "accepted") return "green";
  if (status === "failed" || status === "opted_out" || status === "skipped") return "red";
  if (status === "authorization_sent" || status === "scheduled" || status === "running") return "gold";
  if (status === "pending" || status === "draft") return "blue";
  return "slate";
}

function humanStatus(status?: string | null) {
  const map: Record<string, string> = {
    pending: "Pendente",
    authorization_sent: "Aguardando aceite",
    sent: "Enviado",
    skipped: "Ignorado",
    failed: "Falhou",
    scheduled: "Agendada",
    running: "Rodando",
    finished: "Finalizada",
    draft: "Rascunho",
  };
  return map[String(status || "")] || status || "—";
}

function isApprovedTemplate(template: MetaTemplate) {
  const status = String(template.status || "").toUpperCase();
  return status === "APPROVED" || status === "ATIVO" || status === "ACTIVE";
}

export default function WhatsAppCampanhas() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [approvedTemplates, setApprovedTemplates] = useState<MetaTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesSource, setTemplatesSource] = useState<"meta" | "fallback" | "empty">("empty");
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [campaignName, setCampaignName] = useState("");
  const [audience, setAudience] = useState<"leads" | "clientes" | "agenda">("leads");
  const [templateName, setTemplateName] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  async function loadApprovedTemplates() {
    setTemplatesLoading(true);
    try {
      const response = await fetch("/api/meta/whatsapp?resource=templates");
      const json = await response.json().catch(() => null);
      const templates = Array.isArray(json?.templates) ? (json.templates as MetaTemplate[]) : [];
      const approved = templates.filter(isApprovedTemplate);

      if (response.ok && json?.ok && approved.length > 0) {
        setApprovedTemplates(approved);
        setTemplatesSource("meta");
        if (!templateName) {
          setTemplateName(approved[0].name);
          setMessageBody(approved[0].body || "");
        }
        return;
      }

      const fallback = FALLBACK_APPROVED_TEMPLATES.filter(isApprovedTemplate);
      setApprovedTemplates(fallback);
      setTemplatesSource(fallback.length ? "fallback" : "empty");
      if (!templateName && fallback.length > 0) {
        setTemplateName(fallback[0].name);
        setMessageBody(fallback[0].body || "");
      }
    } catch {
      const fallback = FALLBACK_APPROVED_TEMPLATES.filter(isApprovedTemplate);
      setApprovedTemplates(fallback);
      setTemplatesSource(fallback.length ? "fallback" : "empty");
      if (!templateName && fallback.length > 0) {
        setTemplateName(fallback[0].name);
        setMessageBody(fallback[0].body || "");
      }
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [{ data: camp }, { data: rec }] = await Promise.all([
        supabase.from("whatsapp_campaigns").select("id,name,status,message_body,created_at,scheduled_at").order("created_at", { ascending: false }).limit(8),
        supabase.from("whatsapp_campaign_recipients").select("id,nome,telefone_digits,status,error_message,created_at").order("created_at", { ascending: false }).limit(50),
      ]);
      setCampaigns((camp || []) as Campaign[]);
      setRecipients((rec || []) as Recipient[]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAudience(limit = 500) {
    let query = supabase
      .from("whatsapp_contact_book")
      .select("id,nome,telefone,telefone_digits,lead_id,cliente_id,origem")
      .limit(limit);

    if (audience === "leads") query = query.not("lead_id", "is", null);
    if (audience === "clientes") query = query.not("cliente_id", "is", null);

    const { data, error } = await query;
    if (error) throw error;

    const seen = new Set<string>();
    return ((data || []) as ContactBook[]).filter((c) => {
      const phone = onlyDigits(c.telefone_digits || c.telefone);
      if (!phone || seen.has(phone)) return false;
      seen.add(phone);
      return true;
    });
  }

  async function updatePreviewCount() {
    try {
      const rows = await fetchAudience(1000);
      setPreviewCount(rows.length);
    } catch {
      setPreviewCount(0);
    }
  }

  useEffect(() => { load(); loadApprovedTemplates(); }, []);
  useEffect(() => { if (createOpen) { updatePreviewCount(); loadApprovedTemplates(); } }, [createOpen, audience]);

  const stats = useMemo(() => {
    const sent = recipients.filter((r) => r.status === "sent").length;
    const waiting = recipients.filter((r) => r.status === "authorization_sent").length;
    const failed = recipients.filter((r) => r.status === "failed").length;
    const total = recipients.length;
    return { sent, waiting, failed, total, response: total ? Math.round((sent / total) * 100) : 0 };
  }, [recipients]);

  function resetForm() {
    setCampaignName("");
    setAudience("leads");
    const first = approvedTemplates[0];
    setTemplateName(first?.name || "");
    setMessageBody(first?.body || "");
    setScheduledAt("");
    setPreviewCount(null);
  }

  async function saveCampaign(status: "draft" | "scheduled" | "pending") {
    const name = campaignName.trim();
    const body = messageBody.trim();
    if (!name) return alert("Informe o nome da campanha.");
    if (!templateName) return alert("Selecione um modelo aprovado.");
    if (!body) return alert("O modelo selecionado não possui corpo de mensagem disponível.");

    setSaving(true);
    try {
      const contacts = await fetchAudience(1000);
      if (contacts.length === 0) return alert("Nenhum contato encontrado para esse público.");

      const finalStatus = scheduledAt ? "scheduled" : status;
      const selectedTemplate = approvedTemplates.find((tpl) => tpl.name === templateName);
      const { data: campaign, error } = await supabase
        .from("whatsapp_campaigns")
        .insert({
          name,
          campaign_type: "template",
          template_name: templateName,
          template_category: selectedTemplate?.category || null,
          template_language: selectedTemplate?.language || "pt_BR",
          status: finalStatus,
          audience_source: audience,
          message_body: body,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error || !campaign?.id) throw error || new Error("Não foi possível criar campanha.");

      const rows = contacts.map((c) => ({
        campaign_id: campaign.id,
        contact_book_id: c.id && c.id.length === 36 ? c.id : null,
        telefone_digits: onlyDigits(c.telefone_digits || c.telefone),
        nome: c.nome || null,
        status: "pending",
      }));

      const { error: recError } = await supabase
        .from("whatsapp_campaign_recipients")
        .upsert(rows, { onConflict: "campaign_id,telefone_digits" });

      if (recError) throw recError;

      alert(`Campanha criada com ${rows.length} destinatário(s).`);
      setCreateOpen(false);
      resetForm();
      await load();
    } catch (error: any) {
      console.error("Erro ao criar campanha:", error);
      alert(error?.message || "Não foi possível criar a campanha.");
    } finally {
      setSaving(false);
    }
  }

  const currentTemplate = approvedTemplates.find((t) => t.name === templateName) || approvedTemplates[0];
  const previewName = "Pedro";
  const previewText = (messageBody || currentTemplate?.body || "")
    .replace(/{{\s*nome_cliente\s*}}/gi, previewName)
    .replace(/{{\s*primeiro_nome\s*}}/gi, firstName(previewName))
    .replace(/{{\s*nome\s*}}/gi, previewName)
    .replace(/{{\s*telefone\s*}}/gi, "(69) 99999-0000")
    .replace(/{{\s*etapa_processo\s*}}/gi, "contemplação");

  return (
    <div className="space-y-5">
      <WhatsAppModuleHeader title="Campanhas & Autorizações" subtitle="Crie campanhas, solicite consentimento, acompanhe aceites e automatize envios pelo WhatsApp oficial.">
        <div className="flex gap-2">
          <button onClick={() => { load(); loadApprovedTemplates(); }} className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/25 hover:bg-white/20">
            <RefreshCw className={`h-4 w-4 ${loading || templatesLoading ? "animate-spin" : ""}`} /> Atualizar
          </button>
          <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-2xl bg-[#B5A573] px-4 py-2 text-sm font-black text-white shadow-lg shadow-black/10">
            <Megaphone className="h-4 w-4" /> Criar campanha
          </button>
        </div>
      </WhatsAppModuleHeader>

      {createOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 pt-8 backdrop-blur-sm">
          <div className="grid w-full max-w-6xl gap-0 overflow-hidden rounded-[30px] bg-white shadow-2xl lg:grid-cols-[1fr_390px]">
            <div className="p-5 md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#A11C27]">Nova campanha</p>
                  <h2 className="text-2xl font-black text-slate-900">Criar campanha WhatsApp</h2>
                  <p className="text-sm text-slate-500">Selecione público e um modelo aprovado pela Meta. Modelos em análise ou recusados não aparecem aqui.</p>
                </div>
                <button onClick={() => setCreateOpen(false)} className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-black text-slate-700">Nome da campanha</span>
                  <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Ex.: Carta contemplada imóvel" className="w-full rounded-2xl border px-4 py-3 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-black text-slate-700">Agendamento opcional</span>
                  <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm" />
                </label>
              </div>

              <div className="mt-5">
                <p className="text-sm font-black text-slate-700">Público</p>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {[
                    ["leads", "Leads", "Contatos com lead vinculado"],
                    ["clientes", "Clientes", "Contatos com cliente vinculado"],
                    ["agenda", "Agenda WhatsApp", "Todos da agenda de contatos"],
                  ].map(([value, label, desc]) => (
                    <button key={value} type="button" onClick={() => setAudience(value as any)} className={`rounded-2xl border p-4 text-left transition ${audience === value ? "border-[#A11C27] bg-[#A11C27]/5" : "border-slate-200 bg-white hover:border-[#B5A573]"}`}>
                      <p className="font-black text-slate-900">{label}</p>
                      <p className="text-xs text-slate-500">{desc}</p>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs font-bold text-slate-500">Prévia do público: {previewCount === null ? "calculando..." : `${fmt(previewCount)} contato(s)`}</p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-[320px_1fr]">
                <label className="space-y-1">
                  <span className="text-sm font-black text-slate-700">Modelo aprovado</span>
                  <select
                    value={templateName}
                    disabled={approvedTemplates.length === 0 || templatesLoading}
                    onChange={(e) => {
                      const value = e.target.value;
                      setTemplateName(value);
                      const tpl = approvedTemplates.find((t) => t.name === value);
                      if (tpl) setMessageBody(tpl.body || "");
                    }}
                    className="w-full rounded-2xl border px-4 py-3 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {approvedTemplates.length === 0 ? (
                      <option value="">Nenhum modelo aprovado encontrado</option>
                    ) : (
                      approvedTemplates.map((tpl) => <option key={tpl.id || tpl.name} value={tpl.name}>{tpl.name} · {tpl.category || "sem categoria"}</option>)
                    )}
                  </select>
                  <p className="text-xs text-slate-400">Fonte: {templatesSource === "meta" ? "Meta" : templatesSource === "fallback" ? "fallback aprovado" : "sem modelos"}</p>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-black text-slate-700">Mensagem do modelo</span>
                  <textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} className="min-h-[190px] w-full rounded-2xl border px-4 py-3 text-sm" />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button onClick={() => saveCampaign("draft")} disabled={saving || approvedTemplates.length === 0} className="rounded-2xl border px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">Salvar rascunho</button>
                <button onClick={() => saveCampaign("pending")} disabled={saving || approvedTemplates.length === 0} className="rounded-2xl bg-[#A11C27] px-4 py-3 text-sm font-black text-white hover:opacity-95 disabled:opacity-50">{saving ? "Salvando..." : scheduledAt ? "Salvar e agendar" : "Criar campanha"}</button>
              </div>
            </div>

            <aside className="border-l bg-slate-50 p-5">
              <p className="text-lg font-black text-slate-900">Prévia</p>
              <p className="text-xs text-slate-500">{currentTemplate?.name || "Selecione um modelo aprovado"}</p>
              <div className="mt-4 rounded-[32px] border-[10px] border-slate-900 bg-[#efe7dd] p-4 shadow-2xl">
                <div className="whitespace-pre-line rounded-2xl bg-white p-3 text-sm shadow">{previewText || "Nenhuma mensagem disponível."}</div>
                {templateName === "autorizacao_marketing_consulmax" && <>
                  <div className="mt-2 rounded-xl bg-white py-2 text-center text-sm font-black text-emerald-700">Sim, aceito</div>
                  <div className="mt-2 rounded-xl bg-white py-2 text-center text-sm font-black text-red-600">Não quero receber</div>
                </>}
              </div>
            </aside>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={ShieldCheck} title="Autorizados/Enviados" value={fmt(stats.sent)} note="Contatos enviados" tone="green" />
        <StatCard icon={Clock3} title="Aguardando autorização" value={fmt(stats.waiting)} note="Pedido enviado" tone="gold" />
        <StatCard icon={Send} title="Modelos aprovados" value={fmt(approvedTemplates.length)} note="Disponíveis para campanha" tone="navy" />
        <StatCard icon={CheckCircle2} title="Taxa de envio" value={`${stats.response}%`} note="Base carregada" tone="ruby" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_390px]">
        <div className="space-y-4">
          <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#A11C27]">Construtor de campanha</p><h2 className="mt-1 text-xl font-black text-slate-900">Fluxo com consentimento automático</h2><p className="mt-1 text-sm text-slate-500">A campanha usa apenas modelos aprovados pela Meta.</p></div>
              <StatusPill tone="green">Modelos aprovados</StatusPill>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[["1", "Selecionar público", Users], ["2", "Escolher modelo", ShieldCheck], ["3", "Agendar", Clock3], ["4", "Disparar campanha", Send], ["5", "Relatório", CheckCircle2]].map(([num, label, Icon]: any) => <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1E293F] text-white"><Icon className="h-4 w-4" /></div><p className="mt-3 text-xs font-black text-[#A11C27]">{num}</p><p className="text-sm font-bold text-slate-800">{label}</p></div>)}
            </div>
          </div>

          <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-xl font-black text-slate-900">Destinatários da campanha</h2><p className="text-sm text-slate-500">Status de autorização e envio dos últimos destinatários.</p></div><div className="flex gap-2"><button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600"><Filter className="mr-2 inline h-4 w-4" />Filtros</button><button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600"><Download className="mr-2 inline h-4 w-4" />Exportar</button></div></div>
            <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400"><th className="py-3">Nome</th><th>WhatsApp</th><th>Status</th><th>Erro</th><th>Data</th></tr></thead><tbody className="divide-y divide-slate-100">{recipients.slice(0, 10).map((r) => <tr key={r.id} className="text-slate-700"><td className="py-3 font-bold text-slate-900">{r.nome || "Contato"}</td><td>{r.telefone_digits || "—"}</td><td><StatusPill tone={statusTone(r.status)}>{humanStatus(r.status)}</StatusPill></td><td className="max-w-[260px] truncate text-xs text-slate-400">{r.error_message || "—"}</td><td className="text-xs text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "—"}</td></tr>)}{recipients.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">Nenhum destinatário encontrado.</td></tr>}</tbody></table></div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur"><p className="text-lg font-black text-slate-900">Campanhas recentes</p><div className="mt-3 space-y-2">{campaigns.map((c) => <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-2"><p className="truncate font-bold text-slate-900">{c.name || "Campanha"}</p><StatusPill tone={statusTone(c.status)}>{humanStatus(c.status)}</StatusPill></div><p className="mt-1 line-clamp-2 text-xs text-slate-500">{c.message_body || "Sem mensagem"}</p></div>)}{campaigns.length === 0 && <p className="text-sm text-slate-400">Nenhuma campanha recente.</p>}</div></div>
        </aside>
      </div>
    </div>
  );
}
