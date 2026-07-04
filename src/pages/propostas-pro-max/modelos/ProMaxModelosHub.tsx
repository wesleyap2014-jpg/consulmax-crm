import React, { useMemo, useState } from "react";
import { BarChart3, CalendarDays, FileSpreadsheet, LineChart, Lock, TrendingUp } from "lucide-react";
import { buildExtratoFlow, onlyNumber, type ProposalModelRow, type ProposalParams } from "./fluxos/extratoFlow";

type ModelKey = "extrato" | "aquisicao" | "previdencia" | "alav_financeira" | "alav_patrimonial" | "cadenciada" | "equity";

type ProMaxModelosHubProps = {
  proposal: ProposalModelRow;
  params: ProposalParams;
};

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
};

const MODELS: Array<{ key: ModelKey; label: string; description: string }> = [
  { key: "extrato", label: "Extrato", description: "Correção da carta, crédito líquido e parcelas projetadas." },
  { key: "aquisicao", label: "Aquisição", description: "Modelo de compra do bem ou objetivo do cliente." },
  { key: "previdencia", label: "Previdência", description: "Comparativo de longo prazo e reserva futura." },
  { key: "alav_financeira", label: "Alav. Financeira", description: "Uso de capital próprio, lance e custo de oportunidade." },
  { key: "alav_patrimonial", label: "Alavancagem Patrimonial", description: "Construção de patrimônio com carta corrigida." },
  { key: "cadenciada", label: "Cadenciada", description: "Estratégia com múltiplas cartas e fases de aquisição." },
  { key: "equity", label: "Equity", description: "Estratégia orientada a participação, entrada e saída." },
];

const PROJECTION_PAGE_SIZE = 12;

function brMoney(value: unknown) {
  return onlyNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function brPercent(value: number) {
  return `${(value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function getAdminName(row: ProposalModelRow) {
  return row.promax?.administradora || row.administradora || "Não informado";
}

function Metric({ label, value, tone = "navy" }: { label: string; value: string; tone?: "navy" | "ruby" | "gold" }) {
  const color = tone === "ruby" ? C.ruby : tone === "gold" ? C.gold : C.navy;
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[.08em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-black" style={{ color }}>{value}</div>
    </div>
  );
}

function ExtratoModel({ proposal, params }: ProMaxModelosHubProps) {
  const [projectionPage, setProjectionPage] = useState(1);
  const flow = useMemo(() => buildExtratoFlow(proposal, params), [proposal, params]);
  const { index, monthlyRate, summary } = flow;
  const annualRate = index.annualRate;
  const {
    baseCredit,
    contractedCredit,
    firstInstallment,
    nextInstallments,
    debt,
    correctedBaseCredit,
    correctedContractedCredit,
    correctedLiquidCredit,
    correctedDebt,
    correctionValue,
  } = summary;

  const totalProjectionPages = Math.max(1, Math.ceil(flow.totalMonths / PROJECTION_PAGE_SIZE));
  const safeProjectionPage = Math.min(projectionPage, totalProjectionPages);
  const projectionStartMonth = (safeProjectionPage - 1) * PROJECTION_PAGE_SIZE + 1;
  const projectionEndMonth = Math.min(safeProjectionPage * PROJECTION_PAGE_SIZE, flow.totalMonths);
  const visibleProjection = flow.entries.filter(
    (entry) => entry.month >= projectionStartMonth && entry.month <= projectionEndMonth
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[.12em]" style={{ color: C.navy }}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Extrato da carta
            </div>
            <h2 className="mt-3 text-2xl font-black" style={{ color: C.navy }}>
              Reajuste estimado da proposta #{proposal.code}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Primeiro modelo visual da Propostas Pró Max: mostra a carta atual, o índice de correção aplicado
              e a projeção de crédito, saldo, parcela e pagamentos ao longo do prazo projetado.
            </p>
          </div>
          <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm">
            <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">Índice aplicado</div>
            <div className="mt-1 text-xl font-black" style={{ color: C.ruby }}>{index.label} {brPercent(annualRate)}</div>
            <div className="text-xs text-slate-500">{index.source} | mês: {brPercent(monthlyRate)}</div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Carta atual" value={brMoney(baseCredit)} />
        <Metric label="Carta corrigida 12m" value={brMoney(correctedBaseCredit)} tone="ruby" />
        <Metric label="Reajuste estimado" value={brMoney(correctionValue)} tone="gold" />
        <Metric label="Crédito líquido corrigido" value={brMoney(correctedLiquidCredit)} />
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
            <LineChart className="h-4 w-4" /> Leitura comercial do reajuste
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric label="Crédito contratado" value={brMoney(contractedCredit)} />
            <Metric label="Crédito contratado corrigido" value={brMoney(correctedContractedCredit)} tone="ruby" />
            <Metric label="Parcela inicial atual" value={brMoney(firstInstallment)} />
            <Metric label="Demais parcelas corrigidas" value={brMoney(nextInstallments * (1 + annualRate))} tone="gold" />
            <Metric label="Saldo devedor base" value={brMoney(debt)} />
            <Metric label="Saldo devedor corrigido" value={brMoney(correctedDebt)} tone="ruby" />
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
            <CalendarDays className="h-4 w-4" /> Dados da proposta
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b pb-2">
              <span className="text-slate-500">Lead</span>
              <strong className="text-right" style={{ color: C.navy }}>{proposal.lead_nome || "-"}</strong>
            </div>
            <div className="flex justify-between gap-4 border-b pb-2">
              <span className="text-slate-500">Administradora</span>
              <strong className="text-right" style={{ color: C.navy }}>{getAdminName(proposal)}</strong>
            </div>
            <div className="flex justify-between gap-4 border-b pb-2">
              <span className="text-slate-500">Segmento</span>
              <strong className="text-right" style={{ color: C.navy }}>{proposal.segmento || "-"}</strong>
            </div>
            <div className="flex justify-between gap-4 border-b pb-2">
              <span className="text-slate-500">Tabela/grupo</span>
              <strong className="text-right" style={{ color: C.navy }}>{proposal.nome_tabela || proposal.grupo || "-"}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Mês contemplação</span>
              <strong className="text-right" style={{ color: C.navy }}>{proposal.parcela_contemplacao || "-"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
            <BarChart3 className="h-4 w-4" /> Projeção mês a mês
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setProjectionPage((current) => Math.max(1, current - 1))}
              disabled={safeProjectionPage <= 1}
            >
              Anterior
            </button>
            <span className="min-w-[150px] text-center">
              Meses {projectionStartMonth}-{projectionEndMonth} de {flow.totalMonths}
            </span>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setProjectionPage((current) => Math.min(totalProjectionPages, current + 1))}
              disabled={safeProjectionPage >= totalProjectionPages}
            >
              Próxima
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[.08em] text-slate-500">
              <tr>
                <th className="p-3 text-left">Mês</th>
                <th className="p-3 text-right">Crédito</th>
                <th className="p-3 text-right">Saldo In</th>
                <th className="p-3 text-right">Parcela</th>
                <th className="p-3 text-right">Pgtos</th>
                <th className="p-3 text-right">Saldo devedor</th>
              </tr>
            </thead>
            <tbody>
              {visibleProjection.map((item, index) => {
                if (item.kind === "event") {
                  return (
                    <tr key={`${item.kind}-${item.month}-${index}`} className="border-t bg-amber-50/70">
                      <td className="p-3 font-black" style={{ color: C.ruby }}>Evento: {item.title}</td>
                      <td className="p-3 text-sm font-semibold text-amber-900" colSpan={5}>
                        {item.details.join(" | ")}
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={`${item.kind}-${item.month}`} className="border-t">
                    <td className="p-3 font-bold" style={{ color: C.navy }}>Mês {item.month}</td>
                    <td className="p-3 text-right font-semibold">{brMoney(item.credit)}</td>
                    <td className="p-3 text-right">{brMoney(item.initialBalance)}</td>
                    <td className="p-3 text-right">{brMoney(item.installment)}</td>
                    <td className="p-3 text-right">{brMoney(item.payments)}</td>
                    <td className="p-3 text-right font-black" style={{ color: item.endingBalance <= 0 ? C.gold : C.ruby }}>
                      {brMoney(item.endingBalance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PlaceholderModel({ model }: { model: (typeof MODELS)[number] }) {
  return (
    <section className="rounded-xl border bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100" style={{ color: C.navy }}>
        <Lock className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-2xl font-black" style={{ color: C.navy }}>{model.label}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
        {model.description} Este ambiente já está reservado para a próxima etapa da Propostas Pró Max.
      </p>
    </section>
  );
}

export default function ProMaxModelosHub({ proposal, params }: ProMaxModelosHubProps) {
  const [activeModel, setActiveModel] = useState<ModelKey>("extrato");
  const model = MODELS.find((item) => item.key === activeModel) || MODELS[0];

  return (
    <div className="space-y-4">
      <section
        className="relative overflow-hidden rounded-xl border p-5 shadow-sm"
        style={{ background: "linear-gradient(135deg, #1E293F 0%, #A11C27 100%)", borderColor: "rgba(255,255,255,.22)" }}
      >
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-[1] flex flex-col gap-3 text-white md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[.12em]">
              <TrendingUp className="h-3.5 w-3.5" /> Modelos Pró Max
            </div>
            <h1 className="mt-3 text-2xl font-black md:text-4xl">Ambiente da proposta #{proposal.code}</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/78">
              Escolha o modelo que será montado para o cliente no link público. O Extrato já calcula a correção da carta.
            </p>
          </div>
          <div className="rounded-lg border border-white/20 bg-white/95 px-4 py-3 text-slate-900">
            <div className="text-xs font-semibold text-slate-500">Lead</div>
            <div className="text-sm font-black" style={{ color: C.navy }}>{proposal.lead_nome || "Lead não informado"}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
        {MODELS.map((item) => {
          const active = item.key === activeModel;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveModel(item.key)}
              className="rounded-lg border bg-white p-3 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              style={{
                borderColor: active ? C.ruby : undefined,
                boxShadow: active ? "0 10px 24px rgba(161,28,39,.14)" : undefined,
              }}
            >
              <div className="font-black" style={{ color: active ? C.ruby : C.navy }}>{item.label}</div>
              <div className="mt-1 text-xs leading-snug text-slate-500">{item.description}</div>
            </button>
          );
        })}
      </section>

      {activeModel === "extrato" ? <ExtratoModel proposal={proposal} params={params} /> : <PlaceholderModel model={model} />}
    </div>
  );
}
