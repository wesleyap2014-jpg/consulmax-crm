import React, { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { StatCard, StatusPill, WhatsAppModuleHeader } from "./WhatsAppShell";

type Consent = {
  id: string;
  telefone_digits?: string | null;
  nome?: string | null;
  consent_status?: string | null;
  source?: string | null;
  template_name?: string | null;
  consented_at?: string | null;
  revoked_at?: string | null;
  last_interaction_at?: string | null;
};

type OptOut = { id: string; telefone_digits?: string | null; reason?: string | null; created_at?: string | null };

function fmt(n: number) { return new Intl.NumberFormat("pt-BR").format(n || 0); }

function tone(status?: string | null): "green" | "red" | "gold" | "blue" | "slate" {
  if (status === "accepted") return "green";
  if (status === "revoked") return "red";
  if (status === "pending") return "gold";
  return "slate";
}

function human(status?: string | null) {
  const map: Record<string, string> = { accepted: "Aceite", revoked: "Recusado", pending: "Pendente" };
  return map[String(status || "")] || status || "—";
}

export default function WhatsAppAutorizacoes() {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [optouts, setOptouts] = useState<OptOut[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [{ data: c }, { data: o }] = await Promise.all([
        supabase.from("whatsapp_marketing_consents").select("*").order("updated_at", { ascending: false }).limit(200),
        supabase.from("whatsapp_opt_outs").select("id,telefone_digits,reason,created_at").order("created_at", { ascending: false }).limit(100),
      ]);
      setConsents((c || []) as Consent[]);
      setOptouts((o || []) as OptOut[]);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const accepted = consents.filter((c) => c.consent_status === "accepted").length;
    const revoked = consents.filter((c) => c.consent_status === "revoked").length;
    return { accepted, revoked, optouts: optouts.length, total: consents.length };
  }, [consents, optouts]);

  return (
    <div className="space-y-5">
      <WhatsAppModuleHeader title="Autorizações WhatsApp" subtitle="Controle aceites, recusas, opt-outs e histórico de consentimento para campanhas de marketing.">
        <button onClick={load} className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/25 hover:bg-white/20"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar</button>
      </WhatsAppModuleHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={ShieldCheck} title="Total mapeado" value={fmt(stats.total)} note="Registros de consentimento" tone="navy" />
        <StatCard icon={CheckCircle2} title="Aceites" value={fmt(stats.accepted)} note="Pode receber campanhas" tone="green" />
        <StatCard icon={XCircle} title="Recusas" value={fmt(stats.revoked)} note="Não receber marketing" tone="ruby" />
        <StatCard icon={Ban} title="Opt-out" value={fmt(stats.optouts)} note="Responderam SAIR/STOP" tone="gold" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-xl font-black text-slate-900">Histórico de consentimento</h2><p className="text-sm text-slate-500">Lista de contatos que aceitaram ou recusaram mensagens.</p></div><StatusPill tone="blue">LGPD/Opt-in</StatusPill></div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400"><th className="py-3">Contato</th><th>Telefone</th><th>Status</th><th>Origem</th><th>Última interação</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {consents.map((c) => <tr key={c.id}><td className="py-3 font-bold text-slate-900">{c.nome || "Contato"}</td><td>{c.telefone_digits || "—"}</td><td><StatusPill tone={tone(c.consent_status)}>{human(c.consent_status)}</StatusPill></td><td className="text-slate-500">{c.source || c.template_name || "—"}</td><td className="text-xs text-slate-400">{c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleString("pt-BR") : "—"}</td></tr>)}
                {consents.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-slate-400">Nenhuma autorização registrada ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <div className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-[#B5A573]" /><h2 className="text-lg font-black text-slate-900">Regra operacional</h2></div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p><b>Sem aceite:</b> enviar primeiro o template de autorização.</p>
              <p><b>Com aceite:</b> pode entrar em campanhas aprovadas.</p>
              <p><b>Recusou/SAIR:</b> bloquear novos disparos.</p>
            </div>
          </div>
          <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <h2 className="text-lg font-black text-slate-900">Últimos opt-outs</h2>
            <div className="mt-3 space-y-2">
              {optouts.slice(0, 8).map((o) => <div key={o.id} className="rounded-2xl border border-red-100 bg-red-50 p-3"><p className="font-bold text-red-800">{o.telefone_digits}</p><p className="text-xs text-red-600">{o.reason || "Solicitou descadastro"}</p></div>)}
              {optouts.length === 0 && <p className="text-sm text-slate-400">Nenhum opt-out registrado.</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
