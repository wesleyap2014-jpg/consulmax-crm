import React, { useEffect, useMemo, useState } from "react";
import { History, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Opportunity = { estagio: string | null; won_at: string | null; lost_at: string | null; };
type Note = { kind: string | null };
export type WeeklyLead = {
  id: string; nome: string; telefone: string | null; ownerName: string;
  segment: string; lastContactAt: string | null; bought: boolean;
  opportunities: Opportunity[]; notes: Note[];
};
type Advice = { id: string; reason: string; approach: string };
type Props = {
  leads: WeeklyLead[];
  onShowHistory: (id: string) => void;
  whatsappHref: (phone?: string | null) => string | null;
  disabled?: boolean;
};
function days(iso: string | null) {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / 86400000)) : null;
}
function score(lead: WeeklyLead, hasWhatsApp: boolean) {
  const gap = days(lead.lastContactAt);
  if (!hasWhatsApp || gap === null) return -10000;
  const active = lead.opportunities.some((o) => !/ganho|perdido/i.test(o.estagio || "") && !o.won_at && !o.lost_at);
  const lost = lead.opportunities.some((o) => /perdido/i.test(o.estagio || "") || o.lost_at);
  const advanced = lead.opportunities.some((o) => /proposta|negocia|fechamento/i.test(o.estagio || ""));
  const ageScore = gap >= 21 && gap <= 120 ? 55 : gap > 120 && gap <= 270 ? 35 : gap >= 7 ? 15 : -60;
  return ageScore + (advanced ? 20 : 0) + (lost ? 17 : 0)
    + (lead.notes.some((n) => n.kind === "manual" || n.kind === "follow_up") ? 10 : 0)
    - (active ? 130 : 0) - (lead.bought ? 170 : 0);
}
function backup(lead: WeeklyLead): Advice {
  const gap = days(lead.lastContactAt);
  const lost = lead.opportunities.some((o) => /perdido/i.test(o.estagio || "") || !!o.lost_at);
  return {
    id: lead.id,
    reason: lost ? "Negociação anterior encerrada; vale verificar se o projeto voltou a fazer sentido." : "Relacionamento registrado há " + gap + " dias sem nova interação identificada.",
    approach: "Pergunte se o planejamento ainda está de pé antes de falar de condições comerciais.",
  };
}
function date(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "Não informada";
}
export default function WeeklyMaxRecommendations({ leads, onShowHistory, whatsappHref, disabled }: Props) {
  const [ranked, setRanked] = useState<Advice[] | null>(null);
  const [aiMode, setAiMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const candidates = useMemo(() => leads
    .filter((l) => score(l, Boolean(whatsappHref(l.telefone))) > -10000)
    .sort((a, b) => score(b, Boolean(whatsappHref(b.telefone))) - score(a, Boolean(whatsappHref(a.telefone))) || a.id.localeCompare(b.id))
    .slice(0, 30), [leads, whatsappHref]);
  const fallback = useMemo(() => candidates.slice(0, 10).map(backup), [candidates]);
  useEffect(() => {
    let disposed = false;
    setRanked(null);
    setAiMode(false);
    if (disabled || !candidates.length) return;
    (async () => {
      setBusy(true);
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.access_token) return;
        const res = await fetch("/api/meus-leads/weekly-max", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token },
          body: JSON.stringify({ candidateIds: candidates.map((item) => item.id) }),
        });
        if (!res.ok) return;
        const payload = await res.json();
        const allowed = new Set(candidates.map((item) => item.id));
        const seen = new Set<string>();
        const fromAi: Advice[] = (Array.isArray(payload.recommendations) ? payload.recommendations : [])
          .filter((r: Advice) => allowed.has(r.id) && !seen.has(r.id) && typeof r.reason === "string" && seen.add(r.id))
          .slice(0, 10);
        if (!fromAi.length || disposed) return;
        const completed = [...fromAi, ...fallback.filter((r) => !seen.has(r.id))].slice(0, 10);
        setRanked(completed);
        setAiMode(true);
      } catch {
        // As sugestões fundamentadas no histórico continuam disponíveis sem IA.
      } finally {
        if (!disposed) setBusy(false);
      }
    })();
    return () => { disposed = true; };
  }, [candidates, disabled, fallback]);
  const advice = ranked || fallback;
  const byId = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  return (
    <section className="overflow-hidden rounded-2xl border border-[#B5A573]/25 bg-white/95 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-[#1E293F]"><Sparkles className="h-5 w-5 text-[#A11C27]" /> MAX recomenda: 10 contatos desta semana</h2>
          <p className="mt-1 text-xs text-slate-500">Pessoas com histórico para retomar o relacionamento. Nenhuma mensagem é enviada automaticamente.</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          {busy ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> MAX analisando</> : aiMode ? "MAX • análise contextual" : "Seleção pelo histórico"}
        </span>
      </div>
      {!advice.length && <p className="p-5 text-sm text-slate-500">{disabled ? "Históricos incompletos; confira os dados antes de gerar recomendações." : "Ainda não há contatos com interação registrada e telefone válido para recomendar."}</p>}
      <div className="grid gap-2 p-3 md:grid-cols-2">
        {advice.map((item, index) => {
          const lead = byId.get(item.id);
          if (!lead) return null;
          const wa = whatsappHref(lead.telefone);
          return <div key={lead.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <div className="flex items-start gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#A11C27]/10 text-xs font-black text-[#A11C27]">{index + 1}</span>
              <div>
                <button type="button" className="text-left text-sm font-bold text-[#1E293F] hover:text-[#A11C27]" onClick={() => onShowHistory(lead.id)}>{lead.nome}</button>
                <div className="mt-0.5 text-xs text-slate-500">{lead.segment} • {lead.ownerName} • Último contato: {date(lead.lastContactAt)}</div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-700">{item.reason}</p>
            <p className="text-xs text-slate-500"><strong>Como retomar:</strong> {item.approach}</p>
            <div className="mt-auto flex gap-2">
              <button type="button" className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-semibold" onClick={() => onShowHistory(lead.id)}><History className="h-3.5 w-3.5" /> Histórico</button>
              {wa && <a className="inline-flex items-center gap-1 rounded-lg bg-[#0f766e] px-3 py-2 text-xs font-semibold text-white" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>}
            </div>
          </div>;
        })}
      </div>
    </section>
  );
}
