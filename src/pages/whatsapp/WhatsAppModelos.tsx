import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, FileText, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { StatCard, StatusPill, WhatsAppModuleHeader } from "./WhatsAppShell";

type TemplateRow = {
  id?: string;
  name?: string | null;
  template_name?: string | null;
  status?: string | null;
  category?: string | null;
  language?: string | null;
  body?: string | null;
  components?: any[] | null;
  quality_score?: any;
  rejected_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type MetaOverview = {
  phone_number?: any;
  waba?: any;
  business_profile?: any;
  ids?: { phone_number_id?: string | null; waba_id?: string | null };
  warnings?: any[];
  billing?: any;
};

const fallbackTemplates: TemplateRow[] = [
  { name: "boas_vindas_consulmax", category: "Marketing/Utilidade", language: "pt_BR", status: "Em análise", body: "Boas-vindas quando a cota do cliente é alocada." },
  { name: "solicitacao_contato_consulmax", category: "Marketing", language: "pt_BR", status: "Em análise", body: "Solicita permissão para continuar atendimento pelo WhatsApp." },
  { name: "autorizacao_marketing_consulmax", category: "Marketing", language: "pt_BR", status: "Em análise", body: "Autorização para envio de conteúdos, novidades e oportunidades." },
  { name: "documentacao_pendente_consulmax", category: "Marketing/Utilidade", language: "pt_BR", status: "Em análise", body: "Solicitação de documentação pendente para andamento do processo." },
  { name: "call_permission_optin", category: "Marketing", language: "pt_BR", status: "Ativo", body: "Solicitação de permissão para ligação pelo WhatsApp." },
];

function tone(status?: string | null): "green" | "red" | "gold" | "blue" | "slate" {
  const s = String(status || "").toLowerCase();
  if (s.includes("approved") || s.includes("ativo") || s.includes("active")) return "green";
  if (s.includes("reject") || s.includes("reprov")) return "red";
  if (s.includes("pending") || s.includes("analysis") || s.includes("análise")) return "gold";
  return "slate";
}

function statusLabel(status?: string | null) {
  const s = String(status || "").toUpperCase();
  const map: Record<string, string> = {
    APPROVED: "Aprovado",
    PENDING: "Em análise",
    REJECTED: "Recusado",
    PAUSED: "Pausado",
    DISABLED: "Desativado",
    ACTIVE: "Ativo",
  };
  return map[s] || status || "—";
}

export default function WhatsAppModelos() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [overview, setOverview] = useState<MetaOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"meta" | "crm" | "fallback">("crm");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [templatesRes, overviewRes] = await Promise.all([
        fetch("/api/meta/whatsapp?resource=templates"),
        fetch("/api/meta/whatsapp?resource=overview"),
      ]);

      const templatesJson = await templatesRes.json().catch(() => null);
      const overviewJson = await overviewRes.json().catch(() => null);

      if (overviewJson?.ok) setOverview(overviewJson as MetaOverview);

      if (templatesRes.ok && templatesJson?.ok && Array.isArray(templatesJson.templates)) {
        setRows(templatesJson.templates as TemplateRow[]);
        setSource("meta");
        return;
      }

      const { data } = await supabase.from("whatsapp_templates").select("*").order("updated_at", { ascending: false }).limit(100);
      if (data && data.length > 0) {
        setRows(data as TemplateRow[]);
        setSource("crm");
        setErrorMsg(templatesJson?.error?.error?.message || templatesJson?.error || null);
      } else {
        setRows(fallbackTemplates);
        setSource("fallback");
        setErrorMsg(templatesJson?.error?.error?.message || templatesJson?.error || "Não foi possível sincronizar com a Meta. Exibindo modelos conhecidos.");
      }
    } catch (error: any) {
      setRows(fallbackTemplates);
      setSource("fallback");
      setErrorMsg(error?.message || "Não foi possível carregar modelos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const approved = rows.filter((r) => tone(r.status) === "green").length;
    const pending = rows.filter((r) => tone(r.status) === "gold").length;
    const rejected = rows.filter((r) => tone(r.status) === "red").length;
    return { approved, pending, rejected, total: rows.length };
  }, [rows]);

  const phone = overview?.phone_number;
  const waba = overview?.waba;
  const profile = overview?.business_profile;

  return (
    <div className="space-y-5">
      <WhatsAppModuleHeader title="Modelos e Conta Meta" subtitle="Sincronize templates aprovados, dados do número, WABA, perfil comercial e informações operacionais da Meta.">
        <button onClick={load} className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/25 hover:bg-white/20">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Sincronizar Meta
        </button>
      </WhatsAppModuleHeader>

      {errorMsg && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          Aviso: {typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg)}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={FileText} title="Modelos" value={stats.total} note={source === "meta" ? "Sincronizados da Meta" : source === "crm" ? "Cadastrados no CRM" : "Lista provisória"} tone="navy" />
        <StatCard icon={CheckCircle2} title="Aprovados" value={stats.approved} note="Prontos para envio" tone="green" />
        <StatCard icon={Clock3} title="Em análise" value={stats.pending} note="Aguardando Meta" tone="gold" />
        <StatCard icon={XCircle} title="Recusados" value={stats.rejected} note="Precisam revisão" tone="ruby" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-900">Biblioteca de modelos</h2>
              <p className="text-sm text-slate-500">Templates vindos da Meta ou fallback do CRM.</p>
            </div>
            <StatusPill tone={source === "meta" ? "green" : "gold"}>{source === "meta" ? "Fonte: Meta" : source === "crm" ? "Fonte: CRM" : "Fonte: provisória"}</StatusPill>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400"><th className="py-3">Modelo</th><th>Categoria</th><th>Idioma</th><th>Status</th><th>Qualidade</th><th>Motivo</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, idx) => (
                  <tr key={r.id || r.name || idx}>
                    <td className="py-3"><p className="font-black text-slate-900">{r.name || r.template_name || "Modelo"}</p><p className="line-clamp-2 max-w-[460px] text-xs text-slate-400">{r.body || "Sem prévia cadastrada"}</p></td>
                    <td>{r.category || "—"}</td>
                    <td>{r.language || "pt_BR"}</td>
                    <td><StatusPill tone={tone(r.status)}>{statusLabel(r.status)}</StatusPill></td>
                    <td className="text-xs text-slate-500">{r.quality_score?.score || r.quality_score?.date || "—"}</td>
                    <td className="max-w-[220px] truncate text-xs text-slate-400">{r.rejected_reason || "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-400">Nenhum modelo encontrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#A11C27]/10 text-[#A11C27]"><ShieldCheck className="h-6 w-6" /></div>
            <h2 className="mt-4 text-xl font-black text-slate-900">Conta WhatsApp</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p><b>Número:</b> {phone?.display_phone_number || "—"}</p>
              <p><b>Nome verificado:</b> {phone?.verified_name || waba?.name || "—"}</p>
              <p><b>Qualidade:</b> {phone?.quality_rating || "—"}</p>
              <p><b>Limite de mensagens:</b> {phone?.messaging_limit_tier || "—"}</p>
              <p><b>WABA ID:</b> {overview?.ids?.waba_id || waba?.id || "—"}</p>
              <p><b>Moeda:</b> {waba?.currency || "—"}</p>
            </div>
          </div>

          <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <h2 className="text-lg font-black text-slate-900">Perfil comercial</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p><b>Sobre:</b> {profile?.about || "—"}</p>
              <p><b>E-mail:</b> {profile?.email || "—"}</p>
              <p><b>Site:</b> {Array.isArray(profile?.websites) ? profile.websites.join(", ") : "—"}</p>
              <p><b>Categoria:</b> {profile?.vertical || "—"}</p>
            </div>
          </div>

          <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <h2 className="text-lg font-black text-slate-900">Pagamentos e custos</h2>
            <p className="mt-2 text-sm text-slate-500">A consulta direta de fatura/cobrança depende de permissões específicas do Business Manager. Por enquanto, vamos calcular custo no CRM cruzando templates enviados, categoria, país e tabela de preços.</p>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">Status: {overview?.billing?.note || "Endpoint preparado para expansão."}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
