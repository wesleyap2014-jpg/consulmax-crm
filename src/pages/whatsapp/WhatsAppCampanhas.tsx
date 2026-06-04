import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Clock3, Download, Filter, Megaphone, RefreshCw, Send, ShieldCheck, Users } from "lucide-react";
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

function fmt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function statusTone(status?: string | null): "green" | "red" | "gold" | "blue" | "slate" {
  if (status === "sent" || status === "finished" || status === "accepted") return "green";
  if (status === "failed" || status === "opted_out") return "red";
  if (status === "authorization_sent" || status === "scheduled" || status === "running") return "gold";
  if (status === "pending") return "blue";
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

export default function WhatsAppCampanhas() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const sent = recipients.filter((r) => r.status === "sent").length;
    const waiting = recipients.filter((r) => r.status === "authorization_sent").length;
    const failed = recipients.filter((r) => r.status === "failed").length;
    const total = recipients.length;
    return { sent, waiting, failed, total, response: total ? Math.round((sent / total) * 100) : 0 };
  }, [recipients]);

  return (
    <div className="space-y-5">
      <WhatsAppModuleHeader
        title="Campanhas & Autorizações"
        subtitle="Crie campanhas, solicite consentimento, acompanhe aceites e automatize envios pelo WhatsApp oficial."
      >
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/25 hover:bg-white/20">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
          <button className="inline-flex items-center gap-2 rounded-2xl bg-[#B5A573] px-4 py-2 text-sm font-black text-white shadow-lg shadow-black/10">
            <Megaphone className="h-4 w-4" /> Criar campanha
          </button>
        </div>
      </WhatsAppModuleHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={ShieldCheck} title="Autorizados" value={fmt(stats.sent)} note="Contatos enviados/autorizados" tone="green" />
        <StatCard icon={Clock3} title="Aguardando autorização" value={fmt(stats.waiting)} note="Pedido enviado" tone="gold" />
        <StatCard icon={Send} title="Campanhas recentes" value={fmt(campaigns.length)} note="Últimos registros" tone="navy" />
        <StatCard icon={CheckCircle2} title="Taxa de envio" value={`${stats.response}%`} note="Base carregada" tone="ruby" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_390px]">
        <div className="space-y-4">
          <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#A11C27]">Construtor de campanha</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">Fluxo com consentimento automático</h2>
                <p className="mt-1 text-sm text-slate-500">Sem autorização, o sistema envia o template de aceite antes da campanha.</p>
              </div>
              <StatusPill tone="green">Pronto para templates</StatusPill>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {[
                ["1", "Selecionar público", Users],
                ["2", "Enviar autorização", ShieldCheck],
                ["3", "Aguardar aceite", Clock3],
                ["4", "Disparar campanha", Send],
                ["5", "Relatório", CheckCircle2],
              ].map(([num, label, Icon]: any) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1E293F] text-white"><Icon className="h-4 w-4" /></div>
                  <p className="mt-3 text-xs font-black text-[#A11C27]">{num}</p>
                  <p className="text-sm font-bold text-slate-800">{label}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-black text-slate-900">Públicos rápidos</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    ["Leads", "Base comercial"],
                    ["Clientes", "Carteira ativa"],
                    ["Agenda WhatsApp", "Contatos recentes"],
                  ].map(([a, b]) => (
                    <button key={a} className="rounded-2xl border border-slate-200 p-3 text-left hover:border-[#A11C27]/40 hover:bg-[#A11C27]/5">
                      <p className="text-sm font-black text-slate-900">{a}</p>
                      <p className="text-xs text-slate-500">{b}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-black text-slate-900">Resumo operacional</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Template de autorização</span><b>autorizacao_marketing_consulmax</b></div>
                  <div className="flex justify-between"><span className="text-slate-500">Pendentes</span><b>{fmt(stats.waiting)}</b></div>
                  <div className="flex justify-between"><span className="text-slate-500">Enviados</span><b>{fmt(stats.sent)}</b></div>
                  <div className="rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800">Somente contatos autorizados recebem a campanha automaticamente.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">Destinatários da campanha</h2>
                <p className="text-sm text-slate-500">Status de autorização e envio dos últimos destinatários.</p>
              </div>
              <div className="flex gap-2">
                <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600"><Filter className="mr-2 inline h-4 w-4" />Filtros</button>
                <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600"><Download className="mr-2 inline h-4 w-4" />Exportar</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-3">Nome</th><th>WhatsApp</th><th>Status</th><th>Erro</th><th>Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recipients.slice(0, 10).map((r) => (
                    <tr key={r.id} className="text-slate-700">
                      <td className="py-3 font-bold text-slate-900">{r.nome || "Contato"}</td>
                      <td>{r.telefone_digits || "—"}</td>
                      <td><StatusPill tone={statusTone(r.status)}>{humanStatus(r.status)}</StatusPill></td>
                      <td className="max-w-[260px] truncate text-xs text-slate-400">{r.error_message || "—"}</td>
                      <td className="text-xs text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "—"}</td>
                    </tr>
                  ))}
                  {recipients.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">Nenhum destinatário encontrado.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <p className="text-lg font-black text-slate-900">Prévia no WhatsApp</p>
            <p className="text-xs text-emerald-600">Visualização aproximada do template</p>
            <div className="mt-4 rounded-[32px] border-[10px] border-slate-900 bg-[#efe7dd] p-4 shadow-2xl">
              <div className="rounded-2xl bg-white p-3 text-sm shadow">
                <b>Olá, {'{{nome_cliente}}'}, tudo bem?</b>
                <p className="mt-2">A Consulmax gostaria de enviar conteúdos, novidades e oportunidades relacionadas a consórcios e planejamento financeiro.</p>
                <p className="mt-2">Você aceita receber essas mensagens por aqui?</p>
              </div>
              <div className="mt-2 rounded-xl bg-white py-2 text-center text-sm font-black text-emerald-700">Sim, aceito</div>
              <div className="mt-2 rounded-xl bg-white py-2 text-center text-sm font-black text-red-600">Não quero receber</div>
            </div>
          </div>

          <div className="rounded-[26px] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <p className="text-lg font-black text-slate-900">Campanhas recentes</p>
            <div className="mt-3 space-y-2">
              {campaigns.map((c) => (
                <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2"><p className="truncate font-bold text-slate-900">{c.name || "Campanha"}</p><StatusPill tone={statusTone(c.status)}>{humanStatus(c.status)}</StatusPill></div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{c.message_body || "Sem mensagem"}</p>
                </div>
              ))}
              {campaigns.length === 0 && <p className="text-sm text-slate-400">Nenhuma campanha recente.</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
