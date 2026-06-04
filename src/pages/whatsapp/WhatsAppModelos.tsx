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
  created_at?: string | null;
  updated_at?: string | null;
};

function tone(status?: string | null): "green" | "red" | "gold" | "blue" | "slate" {
  const s = String(status || "").toLowerCase();
  if (s.includes("approved") || s.includes("ativo") || s.includes("active")) return "green";
  if (s.includes("reject") || s.includes("reprov")) return "red";
  if (s.includes("pending") || s.includes("analysis") || s.includes("análise")) return "gold";
  return "slate";
}

export default function WhatsAppModelos() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100);
      setRows((data || []) as TemplateRow[]);
    } catch {
      setRows([]);
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

  return (
    <div className="space-y-5">
      <WhatsAppModuleHeader title="Modelos de mensagem" subtitle="Acompanhe templates aprovados, categorias, variáveis e status para uso no atendimento e nas campanhas.">
        <button onClick={load} className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/25 hover:bg-white/20">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </WhatsAppModuleHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={FileText} title="Modelos" value={stats.total} note="Cadastrados no CRM" tone="navy" />
        <StatCard icon={CheckCircle2} title="Aprovados" value={stats.approved} note="Prontos para envio" tone="green" />
        <StatCard icon={Clock3} title="Em análise" value={stats.pending} note="Aguardando Meta" tone="gold" />
        <StatCard icon={XCircle} title="Recusados" value={stats.rejected} note="Precisam revisão" tone="ruby" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
          <div className="mb-4">
            <h2 className="text-xl font-black text-slate-900">Biblioteca de modelos</h2>
            <p className="text-sm text-slate-500">Templates usados para abrir conversas, campanhas, documentos e ligações.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400"><th className="py-3">Modelo</th><th>Categoria</th><th>Idioma</th><th>Status</th><th>Atualização</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, idx) => (
                  <tr key={r.id || idx}>
                    <td className="py-3"><p className="font-black text-slate-900">{r.name || r.template_name || "Modelo"}</p><p className="line-clamp-1 text-xs text-slate-400">{r.body || "Sem prévia cadastrada"}</p></td>
                    <td>{r.category || "—"}</td><td>{r.language || "pt_BR"}</td><td><StatusPill tone={tone(r.status)}>{r.status || "—"}</StatusPill></td><td className="text-xs text-slate-400">{r.updated_at ? new Date(r.updated_at).toLocaleString("pt-BR") : "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-slate-400">Nenhum modelo encontrado. Quando integrarmos a sincronização com a Meta, eles aparecerão aqui automaticamente.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#A11C27]/10 text-[#A11C27]"><ShieldCheck className="h-6 w-6" /></div>
          <h2 className="mt-4 text-xl font-black text-slate-900">Padrão recomendado</h2>
          <p className="mt-2 text-sm text-slate-500">Use modelos curtos, com variáveis claras e botões objetivos. Para campanhas, prefira CTA de resposta rápida para abrir a conversa.</p>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-black">Variáveis principais</p>
            <p className="mt-2"><b>{"{{nome_cliente}}"}</b> — primeiro nome ou nome completo</p>
            <p><b>{"{{etapa_processo}}"}</b> — contemplação, contrato, cadastro</p>
            <p><b>{"{{link_campanha}}"}</b> — link de landing page ou formulário</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
