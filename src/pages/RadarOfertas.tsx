// src/pages/RadarOfertas.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Copy,
  FileText,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { brMoney, brPct, rowConfig } from "@/lib/radar/common";
import { findBestOffers, offerToSimulatorQuery } from "@/lib/radar/radarEngine";
import type { AdminFilter, AdminRow, AnyRow, RadarInput, RadarOffer, RadarSegment, RadarSourceData } from "@/lib/radar/types";

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  lightGold: "#E0CE8C",
  off: "#F5F5F5",
};

const RADAR_SEGMENTS: RadarSegment[] = ["Automóvel", "Imóvel", "Serviços"];
const PROBABILITY_OPTIONS = ["40", "50", "60", "70", "80", "90", "95"];
const ADMIN_OPTIONS: Array<{ value: AdminFilter; label: string }> = [
  { value: "todas", label: "IA Decide" },
  { value: "bb", label: "BB Consórcios" },
  { value: "embracon", label: "Embracon" },
  { value: "maggi", label: "Maggi" },
];
const SELECTED_OFFER_STORAGE = "@consulmax:radar-ofertas:selected-offer-v1";

const DEFAULT_INPUT: RadarInput = {
  modo: "credito",
  administradora: "todas",
  segmento: "Automóvel",
  creditoLiquido: "150000",
  parcelaDesejada: "1500",
  lanceProprio: "30000",
  prazoContemplacao: "6",
  usarEmbutido: "ia",
  probabilidadeMinima: "80",
};

function onlyNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const cleaned = value
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white/75 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-base font-black" style={{ color: C.navy }}>{value}</div>
    </div>
  );
}

function CardLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 font-black" style={{ color: C.navy }}>{value}</div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 text-xs last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[62%] text-right font-bold" style={{ color: C.navy }}>{value}</span>
    </div>
  );
}

function brDate(value?: string | null) {
  if (!value) return "Não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function offerForReevaluation(offer: RadarOffer) {
  return {
    id: offer.id,
    admin: offer.admin.name,
    nomeTabela: offer.nomeTabela,
    grupoCodigo: offer.grupoCodigo,
    creditoContratado: offer.creditoContratado,
    creditoLiquido: offer.creditoLiquido,
    poderCompra: offer.poderCompra,
    lanceProprio: offer.lanceProprio,
    lanceEmbutido: offer.lanceEmbutido,
    lanceTotalPct: offer.lanceTotalPct,
    parcelaAposContemplacao: offer.parcelaAposContemplacao,
    probabilidadeContemplacao: offer.probabilidadeContemplacao,
    score: offer.score,
    scoreBreakdown: offer.scoreBreakdown,
    motivos: offer.motivos,
    alertas: offer.alertas,
  };
}

function groupSummariesForReevaluation(offers: RadarOffer[]) {
  const map = new Map<string, any>();
  for (const offer of offers) {
    const code = String(offer.grupoCodigo || "");
    if (!code || map.has(code)) continue;
    const group = offer.group || {};
    const cfg = rowConfig(group);
    const assembly = cfg.assemblyResult || {};
    const rawRanges = Array.isArray(cfg.creditRanges) ? cfg.creditRanges : [];
    const ranges = rawRanges
      .map((range: any, index: number) => ({
        id: String(range.id || range.key || range.label || `faixa-${index + 1}`),
        label: String(range.label || range.nome || range.name || `Faixa ${index + 1}`),
        valor: onlyNumber(range.valor || range.credito || range.valor_credito || range.credit_value),
      }))
      .filter((range: any) => range.valor > 0);

    map.set(code, {
      grupoCodigo: code,
      admin: offer.admin.name,
      segmento: offer.segmento,
      menorPct: onlyNumber(assembly.menorPct || cfg.menorPct || group.menor_pct_contemplado),
      medianaPct: onlyNumber(assembly.medianaPct || cfg.medianaPct || group.mediana_pct_contemplado),
      maiorPct: onlyNumber(assembly.maiorPct || cfg.maiorPct || group.maior_pct_contemplado),
      ranges,
    });
  }
  return [...map.values()];
}

function commercialProposal(offer: RadarOffer) {
  return {
    admin: offer.admin.name,
    nomeTabela: offer.nomeTabela,
    grupoCodigo: offer.grupoCodigo,
    segmento: offer.segmento,
    creditoContratado: offer.creditoContratado,
    creditoLiquido: offer.creditoLiquido,
    poderCompra: offer.poderCompra,
    quantidadeCotas: offer.quantidadeCotas || 1,
    lanceProprio: offer.lanceProprio,
    lanceEmbutido: offer.lanceEmbutido,
    lanceTotal: offer.lanceTotal,
    parcelaInicial: offer.parcelaInicial,
    parcelaEstimada: offer.parcelaEstimada,
    parcelaAposContemplacao: offer.parcelaAposContemplacao,
    prazoRestante: offer.prazoRestante,
    probabilidadeContemplacao: offer.probabilidadeContemplacao,
    score: offer.score,
    scoreLabel: offer.scoreLabel,
    estrategia: offer.estrategia,
    generatedAt: new Date().toISOString(),
  };
}

function proposalUrl(offer: RadarOffer) {
  const url = new URL("/proposta.html", window.location.origin);
  url.hash = `p=${encodeProposalPayload(commercialProposal(offer))}`;
  return url.toString();
}

function encodeProposalPayload(proposal: ReturnType<typeof commercialProposal>) {
  const json = JSON.stringify(proposal);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseProposalFromUrl() {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("proposta");
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as ReturnType<typeof commercialProposal>;
  } catch {
    return null;
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ProposalCard({ proposal }: { proposal: ReturnType<typeof commercialProposal> }) {
  return (
    <div className="rounded-[28px] border bg-white p-5 shadow-sm" style={{ borderColor: "rgba(161,28,39,.22)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[.12em] text-slate-500">Proposta Consulmax</div>
          <h2 className="mt-1 text-xl font-black" style={{ color: C.navy }}>{proposal.nomeTabela}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {proposal.admin} {proposal.grupoCodigo ? `• Grupo ${proposal.grupoCodigo}` : ""} {proposal.segmento ? `• ${proposal.segmento}` : ""}
          </p>
        </div>
        <div className="rounded-full px-3 py-1 text-xs font-black text-white" style={{ background: C.ruby }}>
          {Math.round(proposal.probabilidadeContemplacao)}%
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <CardLine label="Crédito contratado" value={brMoney(proposal.creditoContratado)} />
        <CardLine label="Poder de compra" value={brMoney(proposal.poderCompra)} />
        <CardLine label="Crédito líquido" value={brMoney(proposal.creditoLiquido)} />
        <CardLine label="Cotas" value={`${proposal.quantidadeCotas}`} />
        <CardLine label="Lance próprio" value={brMoney(proposal.lanceProprio)} />
        <CardLine label="Lance embutido" value={brMoney(proposal.lanceEmbutido)} />
        <CardLine label="1ª parcela" value={brMoney(proposal.parcelaInicial)} />
        <CardLine label="Demais até contemplação" value={brMoney(proposal.parcelaEstimada)} />
        <CardLine label="Parcela pós-contemplação" value={brMoney(proposal.parcelaAposContemplacao)} />
        <CardLine label="Prazo após contemplação" value={`${proposal.prazoRestante} meses`} />
      </div>

      <div className="mt-5 rounded-2xl p-4" style={{ background: "rgba(161,28,39,.08)" }}>
        <div className="text-xs font-semibold text-slate-500">Aderência da proposta</div>
        <div className="mt-1 text-lg font-black" style={{ color: C.ruby }}>{proposal.score}/100</div>
        <div className="text-sm text-slate-600">{proposal.scoreLabel}</div>
      </div>

      <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-4">
        <div className="text-xs font-bold" style={{ color: C.navy }}>Estratégia sugerida</div>
        <p className="mt-1 text-sm text-slate-600">{proposal.estrategia}</p>
      </div>
    </div>
  );
}

function proposalText(offer: RadarOffer, link?: string) {
  return [
    "Proposta Consulmax",
    `Administradora: ${offer.admin.name}`,
    `Oferta: ${offer.nomeTabela}`,
    offer.grupoCodigo ? `Grupo: ${offer.grupoCodigo}` : null,
    `Crédito contratado: ${brMoney(offer.creditoContratado)}`,
    `Crédito líquido: ${brMoney(offer.creditoLiquido)}`,
    `Poder de compra: ${brMoney(offer.poderCompra)}`,
    `Cotas: ${offer.quantidadeCotas || 1}`,
    `Lance próprio: ${brMoney(offer.lanceProprio)}`,
    `Lance embutido: ${brMoney(offer.lanceEmbutido)}`,
    `1ª parcela: ${brMoney(offer.parcelaInicial)}`,
    `Demais até contemplação: ${brMoney(offer.parcelaEstimada)}`,
    `Parcela pós-contemplação: ${brMoney(offer.parcelaAposContemplacao)}`,
    `Prazo após contemplação: ${offer.prazoRestante} meses`,
    `Probabilidade estimada: ${brPct(offer.probabilidadeContemplacao)}`,
    link ? `Link da proposta: ${link}` : null,
  ].filter(Boolean).join("\n");
}

function printProposal(offer: RadarOffer) {
  const proposal = commercialProposal(offer);
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Proposta Consulmax</title>
        <style>
          @page { size: A4; margin: 14mm; }
          * { box-sizing: border-box; }
          body { margin: 0; background: #eef1f6; font-family: Arial, sans-serif; color: #1E293F; }
          .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; box-shadow: 0 18px 45px rgba(15,23,42,.14); }
          .hero { padding: 28px 32px; color: #fff; background: linear-gradient(135deg, #1E293F 0%, #A11C27 100%); }
          .brand { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
          .brand strong { font-size: 20px; letter-spacing: .01em; }
          .pill { border: 1px solid rgba(255,255,255,.35); border-radius: 999px; padding: 8px 12px; font-size: 12px; font-weight: 800; }
          h1 { margin: 26px 0 8px; max-width: 620px; font-size: 30px; line-height: 1.08; }
          .subtitle { margin: 0; color: rgba(255,255,255,.78); font-size: 13px; }
          .summary { display: grid; grid-template-columns: 1.15fr .85fr; gap: 18px; padding: 24px 32px 6px; }
          .highlight { border-radius: 22px; padding: 20px; background: rgba(161,28,39,.08); border: 1px solid rgba(161,28,39,.18); }
          .highlight .label, .stat .label, .row .label { color: #64748b; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
          .highlight .money { margin-top: 6px; color: #A11C27; font-size: 32px; font-weight: 900; }
          .score { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-radius: 22px; padding: 20px; background: #F8FAFC; border: 1px solid #E2E8F0; }
          .badge { display: grid; place-items: center; width: 86px; height: 86px; border-radius: 50%; border: 7px solid #A11C27; color: #A11C27; background: #fff; font-weight: 900; }
          .badge span { display: block; font-size: 24px; line-height: 1; }
          .badge small { font-size: 10px; }
          .section { padding: 18px 32px; }
          .section h2 { margin: 0 0 12px; color: #1E293F; font-size: 16px; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
          .stat { min-height: 84px; border: 1px solid #E2E8F0; border-radius: 18px; padding: 14px; background: #fff; }
          .stat .value { margin-top: 7px; color: #1E293F; font-size: 17px; font-weight: 900; }
          .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
          .box { border: 1px solid #E2E8F0; border-radius: 20px; padding: 16px; background: #fff; }
          .row { display: flex; justify-content: space-between; gap: 14px; padding: 10px 0; border-bottom: 1px solid #EEF2F7; }
          .row:last-child { border-bottom: 0; }
          .row .value { text-align: right; font-weight: 900; }
          .strategy { border-radius: 20px; padding: 18px; background: #FFF8EA; border: 1px solid rgba(181,165,115,.45); color: #1E293F; }
          .footer { margin-top: 16px; padding: 18px 32px 26px; color: #64748b; font-size: 11px; }
          .ruby { color: #A11C27; }
          @media print {
            body { background: #fff; }
            .sheet { width: auto; min-height: auto; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <main class="sheet">
          <header class="hero">
            <div class="brand">
              <strong>Consulmax</strong>
              <div class="pill">Proposta comercial</div>
            </div>
            <h1>${escapeHtml(proposal.nomeTabela)}</h1>
            <p class="subtitle">${escapeHtml(proposal.admin)} ${proposal.grupoCodigo ? `• Grupo ${escapeHtml(proposal.grupoCodigo)}` : ""} ${proposal.segmento ? `• ${escapeHtml(proposal.segmento)}` : ""}</p>
          </header>

          <section class="summary">
            <div class="highlight">
              <div class="label">Poder de compra estimado</div>
              <div class="money">${escapeHtml(brMoney(proposal.poderCompra))}</div>
              <p>Crédito líquido somado à sobra de lance próprio disponível para compra.</p>
            </div>
            <div class="score">
              <div>
                <div class="label">Aderência</div>
                <h2>${escapeHtml(proposal.score)}/100</h2>
                <p>${escapeHtml(proposal.scoreLabel)}</p>
              </div>
              <div class="badge"><div><span>${escapeHtml(Math.round(proposal.probabilidadeContemplacao))}%</span><small>chance</small></div></div>
            </div>
          </section>

          <section class="section">
            <h2>Resumo da contratação</h2>
            <div class="grid">
              <div class="stat"><div class="label">Crédito contratado</div><div class="value">${escapeHtml(brMoney(proposal.creditoContratado))}</div></div>
              <div class="stat"><div class="label">Crédito líquido</div><div class="value">${escapeHtml(brMoney(proposal.creditoLiquido))}</div></div>
              <div class="stat"><div class="label">Cotas</div><div class="value">${escapeHtml(proposal.quantidadeCotas)}</div></div>
              <div class="stat"><div class="label">Lance próprio</div><div class="value">${escapeHtml(brMoney(proposal.lanceProprio))}</div></div>
              <div class="stat"><div class="label">Lance embutido</div><div class="value">${escapeHtml(brMoney(proposal.lanceEmbutido))}</div></div>
              <div class="stat"><div class="label">Lance total</div><div class="value">${escapeHtml(brMoney(proposal.lanceTotal))}</div></div>
            </div>
          </section>

          <section class="section two">
            <div class="box">
              <h2>Parcelas</h2>
              <div class="row"><div class="label">1ª parcela</div><div class="value">${escapeHtml(brMoney(proposal.parcelaInicial))}</div></div>
              <div class="row"><div class="label">Até contemplação</div><div class="value">${escapeHtml(brMoney(proposal.parcelaEstimada))}</div></div>
              <div class="row"><div class="label">Após contemplação</div><div class="value ruby">${escapeHtml(brMoney(proposal.parcelaAposContemplacao))}</div></div>
            </div>
            <div class="box">
              <h2>Condições</h2>
              <div class="row"><div class="label">Prazo pós-contemplação</div><div class="value">${escapeHtml(proposal.prazoRestante)} meses</div></div>
              <div class="row"><div class="label">Probabilidade</div><div class="value ruby">${escapeHtml(brPct(proposal.probabilidadeContemplacao))}</div></div>
              <div class="row"><div class="label">Administradora</div><div class="value">${escapeHtml(proposal.admin)}</div></div>
            </div>
          </section>

          <section class="section">
            <div class="strategy">
              <strong>Estratégia sugerida</strong>
              <p>${escapeHtml(proposal.estrategia)}</p>
            </div>
          </section>

          <footer class="footer">
            Proposta gerada pelo Radar de Ofertas Consulmax. Valores sujeitos à confirmação da administradora, disponibilidade do grupo e regras vigentes no momento da contratação.
          </footer>
        </main>
        <script>window.print();</script>
      </body>
    </html>
  `;
  const popup = window.open("", "_blank", "width=900,height=900");
  if (!popup) return;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

function ProposalPublicView({ proposal }: { proposal: ReturnType<typeof commercialProposal> }) {
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black" style={{ color: C.ruby }}>Consulmax</div>
            <h1 className="text-2xl font-black" style={{ color: C.navy }}>Informações comerciais da proposta</h1>
          </div>
          <Button type="button" className="rounded-2xl text-white" style={{ background: C.ruby }} onClick={() => window.print()}>
            <FileText className="mr-2 h-4 w-4" /> Salvar PDF
          </Button>
        </div>
        <ProposalCard proposal={proposal} />
      </div>
    </div>
  );
}

function OfferDetailsDrawer({
  offer,
  onClose,
  onOpen,
  onCopy,
  onCopyLink,
  onEmail,
  onWhatsApp,
  onPrint,
}: {
  offer: RadarOffer;
  onClose: () => void;
  onOpen: () => void;
  onCopy: () => void;
  onCopyLink: () => void;
  onEmail: () => void;
  onWhatsApp: () => void;
  onPrint: () => void;
}) {
  const taxaFrTotal = offer.taxaAdmPct + offer.fundoReservaPct;
  const parcelasPagas = Math.max(1, offer.prazoTotal - offer.prazoRestante);
  const totalPagoAteContemplacao = offer.parcelaInicial * parcelasPagas;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Fechar detalhes" className="absolute inset-0 bg-slate-950/35" onClick={onClose} />
      <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-[620px] flex-col overflow-hidden bg-white shadow-2xl">
        <div className="border-b bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[.12em] text-slate-500">Detalhes da proposta</div>
              <h2 className="mt-1 text-lg font-black" style={{ color: C.navy }}>{offer.nomeTabela}</h2>
              <p className="mt-1 text-xs text-slate-500">{offer.admin.name} {offer.grupoCodigo ? `• Grupo ${offer.grupoCodigo}` : ""}</p>
            </div>
            <button type="button" className="rounded-full border p-2 text-slate-500 hover:bg-slate-50" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button type="button" variant="outline" className="rounded-2xl" onClick={onPrint}>
              <FileText className="mr-2 h-4 w-4" /> PDF
            </Button>
            <Button type="button" variant="outline" className="rounded-2xl" onClick={onEmail}>
              <Mail className="mr-2 h-4 w-4" /> E-mail
            </Button>
            <Button type="button" variant="outline" className="rounded-2xl" onClick={onCopyLink}>
              <Link2 className="mr-2 h-4 w-4" /> Link
            </Button>
            <Button type="button" variant="outline" className="rounded-2xl" onClick={onWhatsApp}>
              <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50 p-4">
          <ProposalCard proposal={commercialProposal(offer)} />

          <div className="rounded-[28px] border bg-white p-4">
            <h3 className="text-sm font-black" style={{ color: C.navy }}>Memória de cálculo</h3>
            <div className="mt-2 px-1">
              <DetailLine label="Taxa adm. total" value={brPct(offer.taxaAdmPct)} />
              <DetailLine label="Fundo reserva total" value={brPct(offer.fundoReservaPct)} />
              <DetailLine label="Taxa + fundo" value={brPct(taxaFrTotal)} />
              <DetailLine label="Valor da categoria" value={brMoney(offer.valorCategoria)} />
              <DetailLine label="Parcela inicial" value={`${brMoney(offer.valorCategoria)} / ${offer.prazoTotal} = ${brMoney(offer.parcelaInicial)}`} />
              <DetailLine label="Parcela da contemplação" value={`${parcelasPagas} de ${offer.prazoTotal}`} />
              <DetailLine label="Prazo restante" value={`${offer.prazoTotal} - ${parcelasPagas} = ${offer.prazoRestante} meses`} />
              <DetailLine label="Total pago até contemplação" value={`${brMoney(offer.parcelaInicial)} x ${parcelasPagas} = ${brMoney(totalPagoAteContemplacao)}`} />
              <DetailLine label="Lance total" value={`${brMoney(offer.lanceTotal)} (${brPct(offer.lanceTotalPct)})`} />
              <DetailLine label="Saldo pós-contemplação" value={brMoney(offer.saldoDevedor)} />
              <DetailLine label="Parcela pós-contemplação" value={`${brMoney(offer.saldoDevedor)} / ${offer.prazoRestante} = ${brMoney(offer.parcelaAposContemplacao)}`} />
            </div>
          </div>

          <div className="rounded-[28px] border bg-white p-4">
            <h3 className="text-sm font-black" style={{ color: C.navy }}>Critérios de aderência</h3>
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
              <DetailLine label="Crédito" value={`${offer.scoreBreakdown.credito}/100`} />
              <DetailLine label="Parcela" value={`${offer.scoreBreakdown.parcela}/100`} />
              <DetailLine label="Lance" value={`${offer.scoreBreakdown.lance}/100`} />
              <DetailLine label="Perfil do grupo" value={`${offer.scoreBreakdown.perfilGrupo}/100`} />
              <DetailLine label="Entregas" value={`${offer.scoreBreakdown.entregas}/100`} />
              <DetailLine label="Taxa adm." value={`${offer.scoreBreakdown.taxaAdm}/100`} />
              <DetailLine label="Fundo reserva" value={`${offer.scoreBreakdown.fundoReserva}/100`} />
              <DetailLine label="Assembleia" value={`${offer.scoreBreakdown.assembleia}/100`} />
              <DetailLine label="Cotas" value={`${offer.scoreBreakdown.cotas}/100`} />
            </div>
          </div>

          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-[24px] border bg-white p-4">
              <h3 className="font-black" style={{ color: C.navy }}>Motivos</h3>
              <ul className="mt-2 space-y-1 text-slate-600">
                {offer.motivos.length ? offer.motivos.map((item, index) => <li key={`${index}-${item}`}>• {item}</li>) : <li>Sem motivos adicionais.</li>}
              </ul>
            </div>
            <div className="rounded-[24px] border bg-white p-4">
              <h3 className="font-black" style={{ color: C.navy }}>Alertas</h3>
              <ul className="mt-2 space-y-1 text-amber-700">
                {offer.alertas.length ? offer.alertas.map((item, index) => <li key={`${index}-${item}`}>• {item}</li>) : <li>Nenhum alerta relevante.</li>}
              </ul>
            </div>
          </div>

          <div className="rounded-[28px] border bg-white p-4 text-xs">
            <h3 className="font-black" style={{ color: C.navy }}>Parâmetros enviados ao simulador</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {Object.entries(offer.simulatorParams).map(([key, value]) => (
                <DetailLine key={key} label={key} value={String(value)} />
              ))}
            </div>
          </div>
        </div>

        <div className="border-t bg-white p-4">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="rounded-2xl" onClick={onCopy}>
              <Copy className="mr-2 h-4 w-4" /> Copiar resumo
            </Button>
            <Button type="button" className="rounded-2xl text-white" style={{ background: C.ruby }} onClick={onOpen}>
              Seguir contratação <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function OfferCard({
  offer,
  rank,
  onOpen,
  onDetails,
}: {
  offer: RadarOffer;
  rank: number;
  onOpen: () => void;
  onDetails: () => void;
}) {
  const isFeatured = rank === 1;
  const probabilityLabel = offer.probabilidadeContemplacao >= 95 ? "Alta" : offer.probabilidadeContemplacao >= 90 ? "Boa" : "Média";

  return (
    <Card
      className="relative overflow-hidden rounded-[28px] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl"
      style={{
        borderColor: isFeatured ? C.ruby : "rgba(15,23,42,.10)",
        borderWidth: isFeatured ? 2 : 1,
        boxShadow: isFeatured ? "0 18px 42px rgba(161,28,39,.18)" : undefined,
      }}
    >
      {isFeatured && (
        <div className="absolute left-0 right-0 top-0 flex items-center gap-2 px-4 py-2 text-xs font-black text-white" style={{ background: C.ruby }}>
          <Trophy className="h-3.5 w-3.5" /> Maior aderência
        </div>
      )}

      <CardContent className={isFeatured ? "p-5 pt-12" : "p-5"}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.08em] text-slate-500">
              <Building2 className="h-3.5 w-3.5" /> {offer.admin.name}
            </div>
            <h3 className="mt-2 truncate text-base font-black" style={{ color: C.navy }}>
              {offer.nomeTabela}
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Segmento/Tabela: {offer.segmento || "Não informado"} {offer.table?.nome_tabela ? `• ${offer.table.nome_tabela}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-black" style={{ color: C.navy }}>{offer.grupoCodigo ? `Grupo ${offer.grupoCodigo}` : `#${rank}`}</div>
            <button type="button" onClick={onDetails} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
              <Send className="h-3.5 w-3.5" /> Enviar proposta
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Valor contratado</div>
            <div className="mt-1 text-lg font-black" style={{ color: C.navy }}>{brMoney(offer.creditoContratado)}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Poder de compra</div>
            <div className="mt-1 text-lg font-black" style={{ color: C.ruby }}>{brMoney(offer.poderCompra)}</div>
          </div>
        </div>

        <div className="my-5 flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: "rgba(161,28,39,.08)" }}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-[5px] bg-white text-center"
              style={{ borderColor: C.ruby, color: C.ruby }}
            >
              <span className="text-base font-black leading-none">{Math.round(offer.probabilidadeContemplacao)}%</span>
              <span className="text-[9px] font-bold leading-none">{probabilityLabel}</span>
            </div>
            <div className="text-xs text-slate-600">
              <div className="font-black" style={{ color: C.navy }}>Probabilidade</div>
              <div>chance de contemplação</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-black" style={{ color: C.ruby }}>{offer.score}/100</div>
            <div className="text-xs font-semibold text-slate-500">{offer.scoreLabel}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
          <CardLine label="Crédito líquido" value={brMoney(offer.creditoLiquido)} />
          <CardLine label="Cotas" value={`${offer.quantidadeCotas || 1}`} />
          <CardLine label="Lance próprio" value={brMoney(offer.lanceProprio)} />
          <CardLine label="Sobra do lance" value={brMoney(offer.lanceProprioSobra)} />
          <CardLine label="% lance total" value={brPct(offer.lanceTotalPct)} />
          <CardLine label="1ª parcela" value={brMoney(offer.parcelaInicial)} />
          <CardLine label="Demais até contemplação" value={brMoney(offer.parcelaEstimada)} />
          <CardLine label="Parcela pós-contemplação" value={brMoney(offer.parcelaAposContemplacao)} />
          <CardLine label="Prazo após contemplação" value={`${offer.prazoRestante} meses`} />
          <CardLine label="Lance embutido" value={brMoney(offer.lanceEmbutido)} />
          <CardLine label="Taxa adm. mensal" value={brPct(offer.prazoRestante > 0 ? offer.taxaAdmPct / offer.prazoRestante : offer.taxaAdmPct)} />
          <CardLine label="Fundo reserva mensal" value={brPct(offer.prazoRestante > 0 ? offer.fundoReservaPct / offer.prazoRestante : offer.fundoReservaPct)} />
          <CardLine label="Índice de entrega" value={offer.entregaIndicePct ? brPct(offer.entregaIndicePct) : "Sem dado"} />
          <CardLine label="Próxima assembleia" value={brDate(offer.proximaAssembleia)} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
          <div>Crédito aderente: <b>{offer.scoreBreakdown.credito}/100</b></div>
          <div>Parcela aderente: <b>{offer.scoreBreakdown.parcela}/100</b></div>
          <div>Lance aderente: <b>{offer.scoreBreakdown.lance}/100</b></div>
          <div>Perfil do grupo: <b>{offer.scoreBreakdown.perfilGrupo}/100</b></div>
          <div>Entregas: <b>{offer.scoreBreakdown.entregas}/100</b></div>
          <div>Taxa/Fundo: <b>{Math.round((offer.scoreBreakdown.taxaAdm + offer.scoreBreakdown.fundoReserva) / 2)}/100</b></div>
          <div>Cotas: <b>{offer.scoreBreakdown.cotas}/100</b></div>
        </div>

        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-3">
          <div className="text-xs font-bold" style={{ color: C.navy }}>Estratégia sugerida</div>
          <p className="mt-1 text-xs text-slate-600">{offer.estrategia}</p>
          {offer.motivos[0] && <p className="mt-2 text-xs text-slate-500">{offer.motivos[0]}</p>}
          {offer.alertas[0] && <p className="mt-2 text-xs text-amber-700">{offer.alertas[0]}</p>}
        </div>

        <div className="mt-5 space-y-2">
          <Button type="button" variant="ghost" className="w-full rounded-2xl font-black text-slate-700" onClick={onDetails}>
            Expandir detalhes <ChevronDown className="ml-2 h-4 w-4 -rotate-90" />
          </Button>
          <Button className="w-full rounded-2xl text-white" style={{ background: C.ruby }} onClick={onOpen}>
            Seguir contratação <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RadarOfertas() {
  const navigate = useNavigate();
  const sharedProposal = useMemo(() => parseProposalFromUrl(), []);
  const [loading, setLoading] = useState(true);
  const [sourceData, setSourceData] = useState<RadarSourceData>({
    admins: [],
    bbGroups: [],
    embraconTables: [],
    maggiGroups: [],
  });
  const [input, setInput] = useState<RadarInput>(DEFAULT_INPUT);
  const [searched, setSearched] = useState(false);
  const [detailsOffer, setDetailsOffer] = useState<RadarOffer | null>(null);
  const [reevaluationLoading, setReevaluationLoading] = useState(false);
  const [reevaluationError, setReevaluationError] = useState("");
  const [reevaluation, setReevaluation] = useState<any>(null);

  useEffect(() => {
    if (sharedProposal) {
      setLoading(false);
      return;
    }

    let alive = true;

    (async () => {
      setLoading(true);
      const [adminsRes, bbGroupsRes, maggiGroupsRes] = await Promise.all([
        supabase.from("sim_admins").select("*").order("name", { ascending: true }),
        supabase.from("sim_bb_groups").select("*"),
        supabase.from("sim_maggi_groups").select("*"),
      ]);

      if (!alive) return;

      setSourceData({
        admins: (adminsRes.data || []) as AdminRow[],
        embraconTables: [],
        bbGroups: (bbGroupsRes.data || []) as AnyRow[],
        maggiGroups: (maggiGroupsRes.data || []) as AnyRow[],
      });
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [sharedProposal]);

  const offers = useMemo(() => findBestOffers(input, sourceData), [input, sourceData]);
  const topOffers = offers.slice(0, 3);
  const otherOffers = offers.slice(3);

  function update<K extends keyof RadarInput>(key: K, value: RadarInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
    setSearched(false);
    setReevaluation(null);
    setReevaluationError("");
  }

  async function requestAiReevaluation() {
    setReevaluationLoading(true);
    setReevaluationError("");
    setReevaluation(null);

    try {
      const response = await fetch("/api/radar-ai-reevaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          offers: offers.slice(0, 30).map(offerForReevaluation),
          groupSummaries: groupSummariesForReevaluation(offers.slice(0, 30)),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Falha ao confirmar com IA");
      setReevaluation(data);
    } catch (error: any) {
      setReevaluationError(error?.message || "Falha ao confirmar com IA");
    } finally {
      setReevaluationLoading(false);
    }
  }

  function copyOffer(offer: RadarOffer) {
    const text = [
      "Radar de Ofertas Consulmax",
      `Administradora: ${offer.admin.name}`,
      `Tabela/Grupo: ${offer.nomeTabela}`,
      offer.grupoCodigo ? `Grupo: ${offer.grupoCodigo}` : null,
      `Cotas: ${offer.quantidadeCotas || 1}`,
      `Crédito contratado: ${brMoney(offer.creditoContratado)}`,
      `Crédito líquido: ${brMoney(offer.creditoLiquido)}`,
      `Poder de compra estimado: ${brMoney(offer.poderCompra)}`,
      `Primeira parcela: ${brMoney(offer.parcelaInicial)}`,
      `Demais parcelas até a contemplação: ${brMoney(offer.parcelaEstimada)}`,
      `Parcela pós-contemplação: ${brMoney(offer.parcelaAposContemplacao)}`,
      `Prazo após contemplação: ${offer.prazoRestante} meses`,
      `Lance próprio: ${brMoney(offer.lanceProprio)} (${brPct(offer.lanceProprioPct)})`,
      `Lance total: ${brMoney(offer.lanceTotal)} (${brPct(offer.lanceTotalPct)})`,
      `Sobra do lance próprio: ${brMoney(offer.lanceProprioSobra)}`,
      `Lance embutido: ${brMoney(offer.lanceEmbutido)} (${brPct(offer.lanceEmbutidoPct)})`,
      `Taxa adm. mensal: ${brPct(offer.prazoRestante > 0 ? offer.taxaAdmPct / offer.prazoRestante : offer.taxaAdmPct)}`,
      `Fundo reserva mensal: ${brPct(offer.prazoRestante > 0 ? offer.fundoReservaPct / offer.prazoRestante : offer.fundoReservaPct)}`,
      `Índice de entrega: ${offer.entregaIndicePct ? brPct(offer.entregaIndicePct) : "Sem dado"}`,
      `Próxima assembleia: ${brDate(offer.proximaAssembleia)}`,
      `Probabilidade estimada: ${brPct(offer.probabilidadeContemplacao)}`,
      `Score de aderência: ${offer.score}/100`,
      `Estratégia: ${offer.estrategia}`,
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function copyProposalLink(offer: RadarOffer) {
    navigator.clipboard?.writeText(proposalUrl(offer)).catch(() => {});
  }

  function emailProposal(offer: RadarOffer) {
    const link = proposalUrl(offer);
    const subject = `Proposta Consulmax - ${offer.nomeTabela}`;
    const body = proposalText(offer, link);
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function whatsAppProposal(offer: RadarOffer) {
    const link = proposalUrl(offer);
    const text = `Olá, segue a proposta Consulmax:\n\n${proposalText(offer, link)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  function openOfferInSimulator(offer: RadarOffer) {
    try {
      sessionStorage.setItem(
        SELECTED_OFFER_STORAGE,
        JSON.stringify({ source: "radar-ofertas", savedAt: new Date().toISOString(), offer })
      );
    } catch {}

    navigate(`${offer.simulatorPath}?${offerToSimulatorQuery(offer)}`);
  }

  if (sharedProposal) {
    return <ProposalPublicView proposal={sharedProposal} />;
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando Radar de Ofertas...
      </div>
    );
  }

  if (searched) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <section
          className="relative overflow-hidden rounded-[30px] border p-6 md:p-8 shadow-sm"
          style={{ background: "linear-gradient(135deg, rgba(30,41,63,.98), rgba(161,28,39,.94))", borderColor: "rgba(255,255,255,.22)" }}
        >
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: "rgba(181,165,115,.30)" }} />
          <div className="relative z-[1] flex flex-col gap-4 text-white md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" /> Resultado do Radar
              </div>
              <h1 className="text-2xl font-black tracking-tight md:text-4xl">Melhores ofertas calculadas pelos motores reais</h1>
              <p className="mt-3 max-w-3xl text-sm text-white/80 md:text-base">
                Critérios: {input.modo === "credito" ? `poder de compra de ${brMoney(onlyNumber(input.creditoLiquido))}` : `parcela de ${brMoney(onlyNumber(input.parcelaDesejada))}`}, segmento {input.segmento}, lance próprio de {brMoney(onlyNumber(input.lanceProprio))} e probabilidade mínima de {brPct(onlyNumber(input.probabilidadeMinima))}.
              </p>
            </div>
            <Button variant="outline" className="rounded-2xl border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => setSearched(false)}>
              Voltar e ajustar busca
            </Button>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Ofertas aprovadas" value={`${offers.length}`} />
          <Metric label="Fonte" value={ADMIN_OPTIONS.find((item) => item.value === input.administradora)?.label || "IA Decide"} />
          <Metric label="Embutido" value={input.usarEmbutido === "ia" ? "IA Decide" : input.usarEmbutido === "sim" ? "Sim" : "Não"} />
          <Metric label="Prazo desejado" value={`${onlyNumber(input.prazoContemplacao) || 0} meses`} />
        </div>

        {offers.length === 0 ? (
          <Card className="rounded-[28px] border bg-white/80 p-6 text-sm text-slate-600">
            Nenhuma combinação atingiu a probabilidade mínima solicitada. Ajuste crédito/parcela, lance próprio, administradora ou probabilidade mínima.
          </Card>
        ) : (
          <div className="space-y-8">
            <section className="space-y-3">
              <div
                className="relative overflow-hidden rounded-[34px] border-2 p-4 shadow-sm md:p-5"
                style={{ borderColor: C.ruby, background: "linear-gradient(135deg, rgba(161,28,39,.07), rgba(181,165,115,.14), #fff)" }}
              >
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black text-white" style={{ background: C.ruby }}>
                      <Trophy className="h-3.5 w-3.5" /> Maiores aderências
                    </div>
                    <h2 className="mt-2 text-2xl font-black" style={{ color: C.navy }}>Top 3 Ofertas</h2>
                    <p className="text-sm text-slate-600">As três propostas com maior aderência ao pedido do cliente. A chance de contemplação entra como desempate.</p>
                  </div>
                  <div className="rounded-2xl border bg-white/80 px-4 py-2 text-sm font-black" style={{ color: C.ruby, borderColor: "rgba(161,28,39,.18)" }}>
                    {topOffers.length} maiores aderências
                  </div>
                </div>
                <div className="mb-4 flex flex-col gap-2 rounded-2xl border bg-white/75 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-black" style={{ color: C.navy }}>Reavaliação consultiva</div>
                    <p className="text-xs text-slate-600">A IA pode confirmar a melhor opção ou pedir até 3 testes usando apenas faixas válidas. O ranking não é alterado automaticamente.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl"
                    disabled={reevaluationLoading}
                    onClick={requestAiReevaluation}
                  >
                    {reevaluationLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Confirmar com IA
                  </Button>
                </div>
                {reevaluationError && (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {reevaluationError}
                  </div>
                )}
                {reevaluation && (
                  <div className="mb-4 rounded-2xl border bg-white p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-black" style={{ color: C.navy }}>Resultado da IA</div>
                        <p className="mt-1 text-sm text-slate-600">{reevaluation.summary}</p>
                      </div>
                      <div className="rounded-2xl px-3 py-2 text-xs font-black text-white" style={{ background: C.ruby }}>
                        {(() => {
                          const finalOffer = offers.find((offer) => offer.id === reevaluation.finalOfferId);
                          return finalOffer ? `Indicação: Grupo ${finalOffer.grupoCodigo} • ${brMoney(finalOffer.creditoContratado)}` : "Indicação consultiva";
                        })()}
                      </div>
                    </div>
                    {Array.isArray(reevaluation.tests) && reevaluation.tests.length > 0 && (
                      <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                        {reevaluation.tests.map((test: any, index: number) => (
                          <div key={`${test.groupCode || index}-${index}`} className="rounded-2xl bg-slate-50 p-3">
                            <div className="font-black" style={{ color: C.navy }}>Teste {index + 1} • Grupo {test.groupCode || "N/D"}</div>
                            <div className="mt-1 text-slate-600">Crédito testado: {brMoney(Number(test.requestedCredit || 0))}</div>
                            <div className="text-slate-600">Status: {test.status === "calculated" ? "calculado pelo motor" : "não validado pelo motor"}</div>
                            {test.reason && <div className="mt-1 text-slate-500">{test.reason}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {Array.isArray(reevaluation.commercialNotes) && reevaluation.commercialNotes.length > 0 && (
                      <ul className="mt-3 space-y-1 text-xs text-slate-600">
                        {reevaluation.commercialNotes.map((note: string, index: number) => <li key={`${index}-${note}`}>• {note}</li>)}
                      </ul>
                    )}
                  </div>
                )}
                <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                  {topOffers.map((offer, index) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      rank={index + 1}
                      onOpen={() => openOfferInSimulator(offer)}
                      onDetails={() => setDetailsOffer(offer)}
                    />
                  ))}
                </div>
              </div>
            </section>

            {otherOffers.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xl font-black" style={{ color: C.navy }}>Outras ofertas parecidas</h2>
                <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                  {otherOffers.map((offer, index) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      rank={index + 4}
                      onOpen={() => openOfferInSimulator(offer)}
                      onDetails={() => setDetailsOffer(offer)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {detailsOffer && (
          <OfferDetailsDrawer
            offer={detailsOffer}
            onClose={() => setDetailsOffer(null)}
            onOpen={() => openOfferInSimulator(detailsOffer)}
            onCopy={() => copyOffer(detailsOffer)}
            onCopyLink={() => copyProposalLink(detailsOffer)}
            onEmail={() => emailProposal(detailsOffer)}
            onWhatsApp={() => whatsAppProposal(detailsOffer)}
            onPrint={() => printProposal(detailsOffer)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <section
        className="relative overflow-hidden rounded-[30px] border p-6 md:p-8 shadow-sm"
        style={{ background: "linear-gradient(135deg, rgba(30,41,63,.98), rgba(161,28,39,.94))", borderColor: "rgba(255,255,255,.22)" }}
      >
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: "rgba(181,165,115,.30)" }} />
        <div className="absolute -bottom-24 left-12 h-60 w-60 rounded-full blur-3xl" style={{ background: "rgba(255,255,255,.12)" }} />
        <div className="relative z-[1] max-w-4xl text-white">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
            <Target className="h-3.5 w-3.5" /> Radar de Ofertas
          </div>
          <h1 className="text-2xl font-black tracking-tight md:text-4xl">Encontre a melhor oferta usando os motores dos simuladores.</h1>
          <p className="mt-3 max-w-3xl text-sm text-white/80 md:text-base">
            O Radar consulta os grupos disponíveis de BB e Maggi, aplica as regras configuradas em cada simulador/grupo e retorna somente ofertas com probabilidade igual ou superior ao filtro.
          </p>
        </div>
      </section>

      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="p-5 md:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-black" style={{ color: C.navy }}>Buscar ofertas</h2>
            <p className="text-sm text-slate-600">Escolha o objetivo, o segmento e deixe o Radar testar as combinações permitidas.</p>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => update("modo", "credito")}
              className="rounded-2xl border p-4 text-left transition"
              style={{ borderColor: input.modo === "credito" ? C.ruby : "rgba(30,41,63,.14)", background: input.modo === "credito" ? "rgba(161,28,39,.07)" : "white" }}
            >
              <div className="font-black" style={{ color: C.navy }}>Buscar por crédito</div>
              <div className="text-sm text-slate-600">Informe o poder de compra desejado na contemplação.</div>
            </button>
            <button
              type="button"
              onClick={() => update("modo", "parcela")}
              className="rounded-2xl border p-4 text-left transition"
              style={{ borderColor: input.modo === "parcela" ? C.ruby : "rgba(30,41,63,.14)", background: input.modo === "parcela" ? "rgba(161,28,39,.07)" : "white" }}
            >
              <div className="font-black" style={{ color: C.navy }}>Buscar por parcela</div>
              <div className="text-sm text-slate-600">Informe a parcela e veja quanto crédito dá para contratar.</div>
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {input.modo === "credito" ? (
              <Field label="Crédito líquido desejado">
                <input className="w-full rounded-2xl border px-3 py-2" value={input.creditoLiquido} onChange={(e) => update("creditoLiquido", e.target.value)} placeholder="150000" />
              </Field>
            ) : (
              <Field label="Parcela desejada">
                <input className="w-full rounded-2xl border px-3 py-2" value={input.parcelaDesejada} onChange={(e) => update("parcelaDesejada", e.target.value)} placeholder="1500" />
              </Field>
            )}

            <Field label="Lance próprio disponível">
              <input className="w-full rounded-2xl border px-3 py-2" value={input.lanceProprio} onChange={(e) => update("lanceProprio", e.target.value)} placeholder="30000" />
            </Field>
            <Field label="Prazo desejado para contemplação">
              <input className="w-full rounded-2xl border px-3 py-2" value={input.prazoContemplacao} onChange={(e) => update("prazoContemplacao", e.target.value)} placeholder="6 meses" />
            </Field>
            <Field label="Segmento">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.segmento} onChange={(e) => update("segmento", e.target.value as RadarSegment)}>
                {RADAR_SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Administradora">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.administradora} onChange={(e) => update("administradora", e.target.value as AdminFilter)}>
                {ADMIN_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Usar lance embutido?">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.usarEmbutido} onChange={(e) => update("usarEmbutido", e.target.value as RadarInput["usarEmbutido"])}>
                <option value="ia">IA Decide</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </Field>
            <Field label="Probabilidade mínima">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.probabilidadeMinima} onChange={(e) => update("probabilidadeMinima", e.target.value)}>
                {PROBABILITY_OPTIONS.map((value) => <option key={value} value={value}>{value}%</option>)}
              </select>
            </Field>
            {input.modo === "credito" && (
              <Field label="Parcela máxima opcional">
                <input className="w-full rounded-2xl border px-3 py-2" value={input.parcelaDesejada} onChange={(e) => update("parcelaDesejada", e.target.value)} placeholder="1500" />
              </Field>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="rounded-2xl" onClick={() => setInput(DEFAULT_INPUT)}>Limpar filtros</Button>
            <Button className="rounded-2xl text-white" style={{ background: C.ruby }} onClick={() => setSearched(true)}>
              <Search className="mr-2 h-4 w-4" /> Buscar melhores ofertas
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="p-5 md:p-6">
          <h2 className="text-lg font-black" style={{ color: C.navy }}>Motores conectados</h2>
          <div className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-3">
            <div className="rounded-2xl border bg-white/75 p-4">
              <b>BB Consórcios</b>
              <p className="mt-1">Usa `sim_bb_groups.config.creditRanges` e `assemblyResult`.</p>
            </div>
            <div className="rounded-2xl border bg-white/75 p-4">
              <b>Embracon</b>
              <p className="mt-1">Aguardando schema de grupos disponíveis. O Radar não busca Embracon somente por tabela.</p>
            </div>
            <div className="rounded-2xl border bg-white/75 p-4">
              <b>Maggi</b>
              <p className="mt-1">Usa `sim_maggi_groups.config`, prazo, lances, customRule e primeira parcela.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
