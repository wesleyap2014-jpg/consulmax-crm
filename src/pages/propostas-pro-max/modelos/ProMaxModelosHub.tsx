import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, FileSpreadsheet, House, LineChart, Lock, Phone, TrendingUp, UserRound, X } from "lucide-react";
import { buildAlavancagemFinanceiraFlow } from "./fluxos/alavancagemFinanceiraFlow.ts";
import { buildAlavancagemPatrimonialFlow } from "./fluxos/alavancagemPatrimonialFlow.ts";
import { buildAquisicaoFlow } from "./fluxos/aquisicaoFlow";
import { buildEquityFlow } from "./fluxos/equityFlow";
import { buildExtratoFlow, onlyNumber } from "./fluxos/extratoFlow";
import { buildPrevidenciaFlow } from "./fluxos/previdenciaFlow";

type ProposalModelRow = Parameters<typeof buildExtratoFlow>[0];
type ProposalParams = Parameters<typeof buildExtratoFlow>[1];
type AcquisitionFlow = ReturnType<typeof buildAquisicaoFlow>;
type AcquisitionChartPoint = AcquisitionFlow["chart"][number];
type AcquisitionComparison = AcquisitionFlow["comparisons"][number];
type FinancingSummary = AcquisitionFlow["sac"];
type PrevidenciaFlow = ReturnType<typeof buildPrevidenciaFlow>;
type PrevidenciaChartPoint = PrevidenciaFlow["chart"][number];
type AlavancagemFinanceiraFlow = ReturnType<typeof buildAlavancagemFinanceiraFlow>;
type AlavancagemTraditionalScenario = AlavancagemFinanceiraFlow["traditional"]["scenarios"][number];
type AlavancagemPatrimonialFlow = ReturnType<typeof buildAlavancagemPatrimonialFlow>;
type PatrimonialChartPoint = AlavancagemPatrimonialFlow["chart"][number];
type EquityFlow = ReturnType<typeof buildEquityFlow>;
type EquityMode = "direto" | "cadenciado";
type EquityDirectDetailKey = "sorteio" | "lance";

type ModelKey = "extrato" | "aquisicao" | "previdencia" | "alav_financeira" | "alav_patrimonial" | "equity" | "blindagem_caixa";

type ProMaxModelosHubProps = {
  proposal: ProposalModelRow;
  params: ProposalParams;
  allowedModels?: string[];
};

type AcquisitionDetailKey = "consortium" | "sac" | "price";
type AlavancagemFinanceiraMode = "tradicional" | "acelerada";
type AlavancagemPatrimonialMode = "tradicional" | "otimizada";

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
};

function ConsulmaxLogoMark() {
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex shrink-0 items-center justify-center overflow-visible xl:w-[360px] 2xl:w-[430px]">
      {failed ? (
        <div className="text-center text-4xl font-black tracking-tight text-white drop-shadow-[0_14px_30px_rgba(0,0,0,.24)]">Consulmax</div>
      ) : (
        <img
          src="/logo-consulmax.png"
          alt="Consulmax"
          className="h-32 w-auto max-w-[430px] scale-[1.7] object-contain drop-shadow-[0_16px_34px_rgba(0,0,0,.24)]"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

const MODELS: Array<{ key: ModelKey; label: string; description: string }> = [
  { key: "extrato", label: "Extrato", description: "Correção da carta, crédito líquido e parcelas projetadas." },
  { key: "aquisicao", label: "Aquisição", description: "Modelo de compra do bem ou objetivo do cliente." },
  { key: "previdencia", label: "Previdência", description: "Comparativo de longo prazo e reserva futura." },
  { key: "alav_financeira", label: "Alav. Financeira", description: "Uso de capital próprio, lance e custo de oportunidade." },
  { key: "alav_patrimonial", label: "Alavancagem Patrimonial", description: "Construção de patrimônio com carta corrigida." },
  { key: "equity", label: "Equity", description: "Capital com garantia planejada, direto ou cadenciado." },
  { key: "blindagem_caixa", label: "Blindagem de Caixa", description: "Reestruturação de dívida cara e preservação de caixa." },
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

function rowText(row: ProposalModelRow, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = key.startsWith("promax.")
      ? row.promax?.[key.replace("promax.", "") as keyof NonNullable<ProposalModelRow["promax"]>]
      : row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function phoneLabel(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "-";
}

function whatsappHref(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${normalized}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CX";
}

function getConsultant(row: ProposalModelRow) {
  const name = rowText(row, ["promax.vendedor_nome", "vendedor_nome", "consultor_nome", "seller_name"], "Consultor Consulmax");
  const phone = rowText(row, ["promax.vendedor_telefone", "vendedor_telefone", "vendedor_whatsapp", "phone", "telefone"]);
  const email = rowText(row, ["promax.vendedor_email", "vendedor_email", "email"]);
  const photoUrl = rowText(row, ["promax.vendedor_foto_url", "vendedor_foto_url", "avatar_url", "photo_url", "foto_url"]);

  return { name, phone, email, photoUrl };
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

function axisMoney(value: number) {
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    return `R$ ${(abs / 1_000_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} mi`;
  }

  if (abs >= 1_000) {
    return `R$ ${(abs / 1_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} mil`;
  }

  return `R$ ${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

function niceChartMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function ComparisonCard({
  item,
  tone,
  highlight,
  onOpen,
}: {
  item: AcquisitionComparison;
  tone: "navy" | "ruby" | "gold";
  highlight?: string;
  onOpen?: () => void;
}) {
  const color = tone === "ruby" ? C.ruby : tone === "gold" ? C.gold : C.navy;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300"
      style={{ borderColor: onOpen ? `${color}55` : undefined }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[.12em] text-slate-500">{item.label}</div>
          <div className="mt-2 text-2xl font-black" style={{ color }}>
            {brMoney(item.totalPaid)}
          </div>
        </div>
        {highlight ? (
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black" style={{ color }}>
            {highlight}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs font-semibold text-slate-500">Crédito/valor</div>
          <div className="font-black" style={{ color: C.navy }}>{brMoney(item.creditOrFinancedValue)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500">Prazo</div>
          <div className="font-black" style={{ color: C.navy }}>{item.term} meses</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500">Parcela inicial</div>
          <div className="font-black" style={{ color: C.navy }}>{brMoney(item.initialInstallment)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500">Parcela final</div>
          <div className="font-black" style={{ color: C.navy }}>{brMoney(item.finalInstallment)}</div>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Custo total</span>
          <strong style={{ color }}>{brMoney(item.totalCost)}</strong>
        </div>
        <div className="mt-2 flex justify-between gap-3">
          <span className="text-slate-500">Diferença vs consórcio</span>
          <strong style={{ color }}>{brMoney(item.differenceVsConsortium)}</strong>
        </div>
      </div>
      {onOpen ? (
        <div className="mt-4 text-xs font-black uppercase tracking-[.1em]" style={{ color }}>
          Ver detalhamento das parcelas
        </div>
      ) : null}
    </button>
  );
}

function chartX(index: number, total: number) {
  const left = 92;
  const width = 1440;
  return left + (index / Math.max(1, total - 1)) * width;
}

function chartY(value: number, maxY: number) {
  const top = 34;
  const height = 220;
  return top + height - (value / Math.max(1, maxY)) * height;
}

function linePoints(points: AcquisitionChartPoint[], key: "consortium" | "sac" | "price", maxY: number) {
  return points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => key !== "consortium" || point.consortiumDetail)
    .map(({ point, index }) => `${chartX(index, points.length).toFixed(2)},${chartY(point[key], maxY).toFixed(2)}`)
    .join(" ");
}

function lastRenderablePoint(points: AcquisitionChartPoint[], key: "consortium" | "sac" | "price") {
  const source = key === "consortium" ? points.filter((point) => point.consortiumDetail) : points;
  return source[source.length - 1] || null;
}

function ParcelEvolutionChart({ points }: { points: AcquisitionChartPoint[] }) {
  const [hovered, setHovered] = useState<AcquisitionChartPoint | null>(null);
  const rawMaxY = Math.max(
    1,
    ...points.flatMap((point) => [point.consortium, point.sac, point.price])
  );
  const maxY = niceChartMax(rawMaxY);
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const left = 92;
  const right = 1532;
  const top = 34;
  const bottom = 254;
  const bandWidth = Math.max(1.5, (right - left) / Math.max(1, points.length));
  const endMonth = points[points.length - 1]?.month || 1;
  const hoveredIndex = hovered ? Math.max(0, hovered.month - 1) : -1;
  const hoveredX = hovered ? chartX(hoveredIndex, points.length) : 0;
  const tooltipLeft = hovered ? Math.min(78, Math.max(8, (hoveredX / 1600) * 100)) : 50;
  const endLabels = [
    { key: "consortium" as const, label: "Consórcio", color: C.gold },
    { key: "sac" as const, label: "SAC", color: C.ruby },
    { key: "price" as const, label: "PRICE", color: C.navy },
  ].map((item) => {
    const point = lastRenderablePoint(points, item.key);
    const index = point ? points.findIndex((candidate) => candidate.month === point.month) : -1;
    return {
      ...item,
      point,
      x: index >= 0 ? chartX(index, points.length) : 0,
      y: point ? chartY(point[item.key], maxY) : 0,
    };
  });
  const priceSegments = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    const dashOn = index % 6 < 4;
    if (!next || !dashOn) return null;

    return {
      key: `${point.month}-${next.month}`,
      x1: chartX(index, points.length),
      y1: chartY(point.price, maxY),
      x2: chartX(index + 1, points.length),
      y2: chartY(next.price, maxY),
    };
  }).filter(Boolean) as Array<{ key: string; x1: number; y1: number; x2: number; y2: number }>;

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b bg-slate-50/70 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
            <BarChart3 className="h-4 w-4" /> Evolução das parcelas
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">Passe o cursor sobre os meses para ver os detalhes da projeção.</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-black">
          <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 shadow-sm"><i className="h-0.5 w-5 rounded-full" style={{ background: C.gold }} /> Consórcio</span>
          <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 shadow-sm"><i className="w-5 border-t-[3px] border-dotted" style={{ borderColor: C.ruby }} /> SAC</span>
          <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 shadow-sm"><i className="w-5 border-t-[3px] border-dashed" style={{ borderColor: C.navy }} /> Price</span>
        </div>
      </div>
      <div className="relative bg-transparent p-4 md:p-5">
        {hovered ? (
          <div
            className="pointer-events-none absolute top-16 z-10 w-[292px] rounded-xl border bg-white p-3 text-xs shadow-xl ring-1 ring-slate-900/5"
            style={{ left: `${tooltipLeft}%` }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-black" style={{ color: C.navy }}>Mês {hovered.month}</div>
              <div className="rounded-full bg-slate-100 px-2 py-0.5 font-black text-slate-500">detalhes</div>
            </div>
            <div className="mt-2 grid gap-1.5">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Consórcio</span><strong style={{ color: C.gold }}>{brMoney(hovered.consortium)}</strong></div>
              {hovered.consortiumDetail ? (
                <>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Crédito</span><strong>{brMoney(hovered.consortiumDetail.credit)}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Saldo devedor</span><strong>{brMoney(hovered.consortiumDetail.endingBalance)}</strong></div>
                </>
              ) : null}
              <div className="flex justify-between gap-3"><span className="text-slate-500">SAC</span><strong style={{ color: C.ruby }}>{brMoney(hovered.sac)}</strong></div>
              {hovered.sacDetail ? (
                <div className="flex justify-between gap-3"><span className="text-slate-500">Juros SAC</span><strong>{brMoney(hovered.sacDetail.interest)}</strong></div>
              ) : null}
              <div className="flex justify-between gap-3"><span className="text-slate-500">Price</span><strong style={{ color: C.navy }}>{brMoney(hovered.price)}</strong></div>
              {hovered.priceDetail ? (
                <div className="flex justify-between gap-3"><span className="text-slate-500">Juros Price</span><strong>{brMoney(hovered.priceDetail.interest)}</strong></div>
              ) : null}
              {hovered.consortiumEvents.length ? (
                <div className="mt-1 rounded bg-amber-50 p-2 font-semibold text-amber-900">
                  {hovered.consortiumEvents.map((event) => event.title).join(" | ")}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <svg
          viewBox="0 0 1600 320"
          className="block h-[340px] w-full max-w-none"
          role="img"
          aria-label="Gráfico de evolução das parcelas mês a mês"
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <filter id="lineGlow" x="-10%" y="-20%" width="120%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0F172A" floodOpacity="0.12" />
            </filter>
          </defs>
          <rect x="0" y="0" width="1600" height="320" fill="transparent" />
          {grid.map((ratio) => {
            const y = bottom - ratio * (bottom - top);
            return (
              <g key={ratio}>
                <line x1={left} x2={right} y1={y} y2={y} stroke="#E2E8F0" strokeWidth="1" strokeDasharray={ratio === 0 ? "0" : "4 7"} />
                <text x="78" y={y + 4} textAnchor="end" fontSize="11" fontWeight="700" fill="#64748B">
                  {axisMoney(maxY * ratio)}
                </text>
              </g>
            );
          })}
          <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="#CBD5E1" strokeWidth="1.5" />
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const month = Math.max(1, Math.round(1 + (endMonth - 1) * ratio));
            const x = left + (right - left) * ratio;
            return (
              <g key={ratio}>
                <line x1={x} x2={x} y1={bottom} y2={bottom + 5} stroke="#CBD5E1" strokeWidth="1.2" />
                <text x={x} y="282" textAnchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"} fontSize="11" fontWeight="700" fill="#64748B">
                  Mês {month}
                </text>
              </g>
            );
          })}

          <polyline points={linePoints(points, "sac", maxY)} fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={linePoints(points, "consortium", maxY)} fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={linePoints(points, "sac", maxY)} fill="none" stroke={C.ruby} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 10" filter="url(#lineGlow)" opacity="1" />
          <polyline points={linePoints(points, "consortium", maxY)} fill="none" stroke={C.gold} strokeWidth="4.75" strokeLinecap="round" strokeLinejoin="round" filter="url(#lineGlow)" opacity="1" />
          {priceSegments.map((segment) => (
            <line
              key={`price-shadow-${segment.key}`}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke="#FFFFFF"
              strokeWidth="9"
              strokeLinecap="round"
            />
          ))}
          {priceSegments.map((segment) => (
            <line
              key={`price-${segment.key}`}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={C.navy}
              strokeWidth="5"
              strokeLinecap="round"
              opacity="1"
            />
          ))}
          {endLabels.map((item) => item.point ? (
            <g key={item.key} transform={`translate(${Math.min(item.x + 12, 1500)}, ${Math.max(32, Math.min(258, item.y))})`}>
              <rect x="0" y="-13" width={item.key === "consortium" ? 78 : 48} height="22" rx="11" fill="#FFFFFF" stroke="#E2E8F0" />
              <text x="10" y="2" fontSize="10" fontWeight="800" fill={item.color}>{item.label}</text>
            </g>
          ) : null)}
          {hovered ? (
            <>
              <line x1={hoveredX} x2={hoveredX} y1={top} y2={bottom} stroke="#94A3B8" strokeDasharray="4 4" strokeWidth="1.5" />
              {hovered.consortiumDetail ? <circle cx={hoveredX} cy={chartY(hovered.consortium, maxY)} r="5" fill={C.gold} stroke="#FFFFFF" strokeWidth="2" /> : null}
              <circle cx={hoveredX} cy={chartY(hovered.sac, maxY)} r="5.5" fill={C.ruby} stroke="#FFFFFF" strokeWidth="2.25" />
              <circle cx={hoveredX} cy={chartY(hovered.price, maxY)} r="5.5" fill={C.navy} stroke="#FFFFFF" strokeWidth="2.25" />
            </>
          ) : null}
          {points.map((point, index) => {
            const x = chartX(index, points.length);
            return (
              <rect
                key={point.month}
                x={x - bandWidth / 2}
                y={top}
                width={bandWidth}
                height={bottom - top}
                fill="transparent"
                pointerEvents="all"
                onMouseEnter={() => setHovered(point)}
                onMouseMove={() => setHovered(point)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function DetailOverlay({
  open,
  acquisition,
  onClose,
}: {
  open: AcquisitionDetailKey | null;
  acquisition: AcquisitionFlow;
  onClose: () => void;
}) {
  if (!open) return null;

  const isConsortium = open === "consortium";
  const financing: FinancingSummary | null = open === "sac" ? acquisition.sac : open === "price" ? acquisition.price : null;
  const title = isConsortium ? "Base Pró Max - Detalhamento do Consórcio" : financing?.label || "Detalhamento";
  const subtitle = isConsortium
    ? "Parcelas projetadas pelo mesmo motor do Extrato, com crédito, saldo e eventos da estratégia."
    : "Parcelas do financiamento com composição mensal de juros, amortização e saldo devedor.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <section className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h3 className="text-xl font-black" style={{ color: C.navy }}>{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            aria-label="Fechar detalhamento"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 border-b bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label={isConsortium ? "Crédito disponível" : "Valor financiado"}
            value={brMoney(isConsortium ? acquisition.consortium.availableAtContemplation : financing?.financedValue || 0)}
          />
          <Metric
            label="Prazo"
            value={`${isConsortium ? acquisition.consortium.term : financing?.term || 0} meses`}
            tone="gold"
          />
          <Metric
            label="Parcela inicial"
            value={brMoney(isConsortium ? acquisition.consortium.initialInstallment : financing?.initialInstallment || 0)}
            tone="ruby"
          />
          <Metric
            label="Total pago"
            value={brMoney(isConsortium ? acquisition.consortium.totalPaid : financing?.totalPaid || 0)}
          />
        </div>

        <div className="overflow-auto">
          {isConsortium ? (
            <table className="min-w-[1020px] w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-white text-xs uppercase tracking-[.08em] text-slate-500 shadow-sm">
                <tr>
                  <th className="p-3 text-left">Mês</th>
                  <th className="p-3 text-right">Crédito</th>
                  <th className="p-3 text-right">Saldo inicial</th>
                  <th className="p-3 text-right">Parcela</th>
                  <th className="p-3 text-right">Pago acumulado</th>
                  <th className="p-3 text-right">Saldo final</th>
                  <th className="p-3 text-left">Evento do Extrato</th>
                </tr>
              </thead>
              <tbody>
                {acquisition.consortiumEntries.map((entry) => {
                  const events = acquisition.consortiumEvents.filter((event) => event.month === entry.month);
                  return (
                    <tr key={entry.month} className="border-t">
                      <td className="p-3 font-black" style={{ color: C.navy }}>Mês {entry.month}</td>
                      <td className="p-3 text-right">{brMoney(entry.credit)}</td>
                      <td className="p-3 text-right">{brMoney(entry.initialBalance)}</td>
                      <td className="p-3 text-right font-semibold">{brMoney(entry.installment)}</td>
                      <td className="p-3 text-right">{brMoney(entry.payments)}</td>
                      <td className="p-3 text-right font-black" style={{ color: entry.endingBalance <= 0 ? C.gold : C.ruby }}>
                        {brMoney(entry.endingBalance)}
                      </td>
                      <td className="max-w-[320px] p-3 text-xs text-slate-600">
                        {events.length ? events.map((event) => `${event.title}: ${event.details.join(" | ")}`).join(" / ") : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="min-w-[880px] w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-white text-xs uppercase tracking-[.08em] text-slate-500 shadow-sm">
                <tr>
                  <th className="p-3 text-left">Mês</th>
                  <th className="p-3 text-right">Parcela</th>
                  <th className="p-3 text-right">Juros</th>
                  <th className="p-3 text-right">Amortização</th>
                  <th className="p-3 text-right">Saldo devedor</th>
                </tr>
              </thead>
              <tbody>
                {(financing?.entries || []).map((entry) => (
                  <tr key={entry.month} className="border-t">
                    <td className="p-3 font-black" style={{ color: C.navy }}>Mês {entry.month}</td>
                    <td className="p-3 text-right font-semibold">{brMoney(entry.installment)}</td>
                    <td className="p-3 text-right">{brMoney(entry.interest)}</td>
                    <td className="p-3 text-right">{brMoney(entry.amortization)}</td>
                    <td className="p-3 text-right font-black" style={{ color: entry.endingBalance <= 0 ? C.gold : C.ruby }}>
                      {brMoney(entry.endingBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function previdenciaLinePoints(
  points: PrevidenciaChartPoint[],
  key: "consortiumInstallment" | "monthlyIncome" | "cdiNetBalance" | "consortiumCapital",
  maxY: number,
  yForValue = chartY
) {
  return points
    .map((point, index) => `${chartX(index, points.length).toFixed(2)},${yForValue(point[key], maxY).toFixed(2)}`)
    .join(" ");
}

function PrevidenciaChart({ flow }: { flow: PrevidenciaFlow }) {
  const [hovered, setHovered] = useState<PrevidenciaChartPoint | null>(null);
  const points = flow.chart;
  const rawCapitalMax = Math.max(
    1,
    ...points.flatMap((point) => [point.cdiNetBalance, point.consortiumCapital])
  );
  const rawMonthlyMax = Math.max(
    1,
    ...points.flatMap((point) => [point.consortiumInstallment, point.monthlyIncome])
  );
  const capitalMaxY = niceChartMax(rawCapitalMax);
  const monthlyMaxY = niceChartMax(rawMonthlyMax);
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const left = 92;
  const right = 1532;
  const top = 34;
  const bottom = 254;
  const bandWidth = Math.max(1.5, (right - left) / Math.max(1, points.length));
  const endMonth = points[points.length - 1]?.month || 1;
  const hoveredIndex = hovered ? Math.max(0, hovered.month - 1) : -1;
  const hoveredX = hovered ? chartX(hoveredIndex, points.length) : 0;
  const tooltipLeft = hovered ? Math.min(78, Math.max(8, (hoveredX / 1600) * 100)) : 50;

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b bg-slate-50/70 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
            <BarChart3 className="h-4 w-4" /> Parcela x rentabilidade mensal
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            Passe o cursor sobre os meses para ver rentabilidade mensal, acumulada e patrimônio líquido projetado.
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-black">
          <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 shadow-sm"><i className="w-5 border-t-[3px] border-dotted" style={{ borderColor: C.gold }} /> Parcela consórcio</span>
          <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 shadow-sm"><i className="h-0.5 w-5 rounded-full" style={{ background: C.navy }} /> Rentabilidade</span>
          <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 shadow-sm"><i className="h-0.5 w-5 rounded-full" style={{ background: C.gold }} /> Capital consórcio</span>
          <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 shadow-sm"><i className="w-5 border-t-[3px] border-dashed" style={{ borderColor: C.ruby }} /> CDI acumulado</span>
        </div>
      </div>
      <div className="relative bg-transparent p-4 md:p-5">
        {hovered ? (
          <div
            className="pointer-events-none absolute top-16 z-10 w-[310px] rounded-xl border bg-white p-3 text-xs shadow-xl ring-1 ring-slate-900/5"
            style={{ left: `${tooltipLeft}%` }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-black" style={{ color: C.navy }}>Mês {hovered.month}</div>
              <div className="rounded-full bg-slate-100 px-2 py-0.5 font-black text-slate-500">100% CDI</div>
            </div>
            <div className="mt-2 grid gap-1.5">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Parcela consórcio</span><strong style={{ color: C.gold }}>{brMoney(hovered.consortiumInstallment)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Rentabilidade no mês</span><strong style={{ color: C.navy }}>{brMoney(hovered.monthlyIncome)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Rentabilidade acumulada</span><strong>{brMoney(hovered.accumulatedIncome)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Capital com consórcio</span><strong style={{ color: C.gold }}>{brMoney(hovered.consortiumCapital)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">CDI acumulado líquido</span><strong style={{ color: C.ruby }}>{brMoney(hovered.cdiNetBalance)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">IR CDI acumulado</span><strong>{brMoney(hovered.cdiTax)}</strong></div>
            </div>
          </div>
        ) : null}

        <svg
          viewBox="0 0 1600 320"
          className="block h-[340px] w-full max-w-none"
          role="img"
          aria-label="Gráfico comparativo de parcela do consórcio e rentabilidade mensal"
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <filter id="previdenciaLineGlow" x="-10%" y="-20%" width="120%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0F172A" floodOpacity="0.12" />
            </filter>
          </defs>
          <rect x="0" y="0" width="1600" height="320" fill="transparent" />
          {grid.map((ratio) => {
            const y = bottom - ratio * (bottom - top);
            return (
              <g key={ratio}>
                <line x1={left} x2={right} y1={y} y2={y} stroke="#E2E8F0" strokeWidth="1" strokeDasharray={ratio === 0 ? "0" : "4 7"} />
                <text x="78" y={y + 4} textAnchor="end" fontSize="11" fontWeight="700" fill="#64748B">
                  {axisMoney(capitalMaxY * ratio)}
                </text>
                <text x="1546" y={y + 4} textAnchor="start" fontSize="11" fontWeight="700" fill="#64748B">
                  {axisMoney(monthlyMaxY * ratio)}
                </text>
              </g>
            );
          })}
          <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="#CBD5E1" strokeWidth="1.5" />
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const month = Math.max(1, Math.round(1 + (endMonth - 1) * ratio));
            const x = left + (right - left) * ratio;
            return (
              <g key={ratio}>
                <line x1={x} x2={x} y1={bottom} y2={bottom + 5} stroke="#CBD5E1" strokeWidth="1.2" />
                <text x={x} y="282" textAnchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"} fontSize="11" fontWeight="700" fill="#64748B">
                  Mês {month}
                </text>
              </g>
            );
          })}

          <polyline points={previdenciaLinePoints(points, "consortiumInstallment", monthlyMaxY)} fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={previdenciaLinePoints(points, "monthlyIncome", monthlyMaxY)} fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={previdenciaLinePoints(points, "consortiumCapital", capitalMaxY)} fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={previdenciaLinePoints(points, "cdiNetBalance", capitalMaxY)} fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={previdenciaLinePoints(points, "consortiumInstallment", monthlyMaxY)} fill="none" stroke={C.gold} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 9" filter="url(#previdenciaLineGlow)" />
          <polyline points={previdenciaLinePoints(points, "monthlyIncome", monthlyMaxY)} fill="none" stroke={C.navy} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#previdenciaLineGlow)" />
          <polyline points={previdenciaLinePoints(points, "consortiumCapital", capitalMaxY)} fill="none" stroke={C.gold} strokeWidth="4.75" strokeLinecap="round" strokeLinejoin="round" filter="url(#previdenciaLineGlow)" />
          <polyline points={previdenciaLinePoints(points, "cdiNetBalance", capitalMaxY)} fill="none" stroke={C.ruby} strokeWidth="4.25" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="14 10" filter="url(#previdenciaLineGlow)" />
          {hovered ? (
            <>
              <line x1={hoveredX} x2={hoveredX} y1={top} y2={bottom} stroke="#94A3B8" strokeDasharray="4 4" strokeWidth="1.5" />
              <circle cx={hoveredX} cy={chartY(hovered.consortiumInstallment, monthlyMaxY)} r="5.5" fill={C.gold} stroke="#FFFFFF" strokeWidth="2.25" />
              <circle cx={hoveredX} cy={chartY(hovered.monthlyIncome, monthlyMaxY)} r="5.5" fill={C.navy} stroke="#FFFFFF" strokeWidth="2.25" />
              <circle cx={hoveredX} cy={chartY(hovered.consortiumCapital, capitalMaxY)} r="5.5" fill={C.gold} stroke="#FFFFFF" strokeWidth="2.25" />
              <circle cx={hoveredX} cy={chartY(hovered.cdiNetBalance, capitalMaxY)} r="5.5" fill={C.ruby} stroke="#FFFFFF" strokeWidth="2.25" />
            </>
          ) : null}
          {points.map((point, index) => {
            const x = chartX(index, points.length);
            return (
              <rect
                key={point.month}
                x={x - bandWidth / 2}
                y={top}
                width={bandWidth}
                height={bottom - top}
                fill="transparent"
                pointerEvents="all"
                onMouseEnter={() => setHovered(point)}
                onMouseMove={() => setHovered(point)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function PrevidenciaModel({ proposal, params }: ProMaxModelosHubProps) {
  const flow = useMemo(() => buildPrevidenciaFlow(proposal, params), [proposal, params]);
  const { summary, cdiComparison, cdi, tax } = flow;
  const patrimonioDifference = summary.finalNetBalance - cdiComparison.netBalance;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[.12em]" style={{ color: C.navy }}>
              <TrendingUp className="h-3.5 w-3.5" /> Previdência
            </div>
            <h2 className="mt-3 text-2xl font-black" style={{ color: C.navy }}>
              Consórcio como construção de renda futura
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              O modelo captura o crédito líquido na contemplação e simula esse capital aplicado pelo prazo restante
              a 100% do CDI. A leitura compara a parcela reajustada do consórcio com a rentabilidade mensal projetada
              e mostra o cenário alternativo de aplicar apenas os valores pagos mês a mês.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[520px]">
            <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">CDI aplicado</div>
              <div className="mt-1 text-xl font-black" style={{ color: C.ruby }}>{brPercent(cdi.monthlyRate)} a.m.</div>
              <div className="text-xs text-slate-500">{cdi.label} | {brPercent(cdi.annualRate)} a.a.</div>
            </div>
            <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">IR referência gross up</div>
              <div className="mt-1 text-xl font-black" style={{ color: C.gold }}>{brPercent(tax.rate)}</div>
              <div className="text-xs text-slate-500">Consórcio isento | referência renda fixa</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Crédito líquido aplicado" value={brMoney(summary.capitalAtContemplation)} tone="gold" />
        <Metric label="Patrimônio acumulado" value={brMoney(summary.finalNetBalance)} />
        <Metric label="Rentabilidade líquida" value={brMoney(summary.netIncome)} tone="ruby" />
        <Metric label="Investimento realizado" value={brMoney(summary.totalInvested)} />
        <Metric label="ROI" value={brPercent(summary.roi)} tone="gold" />
        <Metric label="Rentabilidade a.m." value={brPercent(summary.monthlyReturn)} />
        <Metric label="% do CDI mensal" value={brPercent(summary.cdiPercent)} />
        <Metric label="Gross up mensal" value={brPercent(tax.grossUpMonthlyRate)} tone="ruby" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
            <LineChart className="h-4 w-4" /> Investimento x Rentabilidade
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b pb-2">
              <span className="text-slate-500">Mês da contemplação</span>
              <strong style={{ color: C.navy }}>Mês {summary.contemplationMonth}</strong>
            </div>
            <div className="flex justify-between gap-4 border-b pb-2">
              <span className="text-slate-500">Prazo aplicado após contemplação</span>
              <strong style={{ color: C.navy }}>{summary.remainingMonths} meses</strong>
            </div>
            <div className="flex justify-between gap-4 border-b pb-2">
              <span className="text-slate-500">Rendimento bruto projetado</span>
              <strong style={{ color: C.gold }}>{brMoney(summary.grossIncome)}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Capital acumulado</span>
              <strong style={{ color: C.navy }}>{brMoney(summary.finalNetBalance)}</strong>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
              <FileSpreadsheet className="h-4 w-4" /> Comparativo
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[.08em] text-slate-500">
                <tr>
                  <th className="p-3 text-left">Cenário</th>
                  <th className="p-3 text-right">Capital/Principal</th>
                  <th className="p-3 text-right">Patrimônio bruto</th>
                  <th className="p-3 text-right">Rentabilidade</th>
                  <th className="p-3 text-right">IR</th>
                  <th className="p-3 text-right">Patrimônio líquido</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="p-3 font-black" style={{ color: C.gold }}>Consórcio</td>
                  <td className="p-3 text-right">{brMoney(summary.capitalAtContemplation)}</td>
                  <td className="p-3 text-right">{brMoney(summary.finalGrossBalance)}</td>
                  <td className="p-3 text-right">{brMoney(summary.grossIncome)}</td>
                  <td className="p-3 text-right">{brMoney(0)}</td>
                  <td className="p-3 text-right font-black" style={{ color: C.navy }}>{brMoney(summary.finalNetBalance)}</td>
                </tr>
                <tr className="border-t">
                  <td className="p-3 font-black" style={{ color: C.ruby }}>Fundo DI</td>
                  <td className="p-3 text-right">{brMoney(cdiComparison.investedPrincipal)}</td>
                  <td className="p-3 text-right">{brMoney(cdiComparison.grossBalance)}</td>
                  <td className="p-3 text-right">{brMoney(cdiComparison.grossIncome)}</td>
                  <td className="p-3 text-right">{brMoney(cdiComparison.tax)}</td>
                  <td className="p-3 text-right font-black" style={{ color: C.navy }}>{brMoney(cdiComparison.netBalance)}</td>
                </tr>
                <tr className="border-t bg-slate-50/70">
                  <td className="p-3 font-black" style={{ color: patrimonioDifference >= 0 ? C.gold : C.ruby }}>Diferença Consórcio x Fundo DI</td>
                  <td className="p-3 text-right">-</td>
                  <td className="p-3 text-right">-</td>
                  <td className="p-3 text-right">-</td>
                  <td className="p-3 text-right">-</td>
                  <td className="p-3 text-right font-black" style={{ color: patrimonioDifference >= 0 ? C.gold : C.ruby }}>
                    {brMoney(patrimonioDifference)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <PrevidenciaChart flow={flow} />
    </div>
  );
}

function ExtratoModel({ proposal, params }: ProMaxModelosHubProps) {
  const [projectionPage, setProjectionPage] = useState(1);
  const flow = useMemo(() => buildExtratoFlow(proposal, params), [proposal, params]);
  const { index, monthlyRate, summary } = flow;
  const annualRate = index.annualRate;
  const {
    contractedCredit,
    creditAtContemplation,
    embeddedBidAtContemplation,
    availableAtContemplation,
    ownBidAtContemplation,
    investmentUntilContemplation,
    adminTaxPct,
    reserveTaxPct,
    planTerm,
    consortiumMonthlyTaxPct,
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
              Entenda a evolução do seu investimento
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Aqui você acompanha, mês a mês, quanto já terá investido, a projeção de correção do seu crédito,
              a evolução das parcelas e os eventos importantes da estratégia, como contemplação e reajustes.
              A ideia é deixar claro como a carta se comporta ao longo do tempo e qual será sua posição em cada etapa.
            </p>
          </div>
          <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm">
            <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">Índice aplicado</div>
            <div className="mt-1 text-xl font-black" style={{ color: C.ruby }}>{index.label} {brPercent(annualRate)}</div>
            <div className="text-xs text-slate-500">{index.source} | mês: {brPercent(monthlyRate)}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
            <LineChart className="h-4 w-4" /> Resumo da Proposta
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric label="Crédito contratado" value={brMoney(contractedCredit)} />
            <Metric label="Crédito na contemplação" value={brMoney(creditAtContemplation)} tone="ruby" />
            <Metric label="Lance embutido na contemplação" value={brMoney(embeddedBidAtContemplation)} tone="gold" />
            <Metric label="Disponível na contemplação" value={brMoney(availableAtContemplation)} />
            <Metric label="Lance próprio na contemplação" value={brMoney(ownBidAtContemplation)} tone="ruby" />
            <Metric label="Investimento até a contemplação" value={brMoney(investmentUntilContemplation)} tone="gold" />
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
            <div className="flex justify-between gap-4 border-b pb-2">
              <span className="text-slate-500">Mês contemplação</span>
              <strong className="text-right" style={{ color: C.navy }}>{proposal.parcela_contemplacao || "-"}</strong>
            </div>
            <div className="flex justify-between gap-4 border-b pb-2">
              <span className="text-slate-500">Taxa de Administração</span>
              <strong className="text-right" style={{ color: C.navy }}>{brPercent(adminTaxPct)}</strong>
            </div>
            <div className="flex justify-between gap-4 border-b pb-2">
              <span className="text-slate-500">Fundo Reserva</span>
              <strong className="text-right" style={{ color: C.navy }}>{brPercent(reserveTaxPct)}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Taxa Mensalizada ({planTerm} meses)</span>
              <strong className="text-right" style={{ color: C.navy }}>{brPercent(consortiumMonthlyTaxPct)}</strong>
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

function AquisicaoModel({ proposal, params }: ProMaxModelosHubProps) {
  const [detailOpen, setDetailOpen] = useState<AcquisitionDetailKey | null>(null);
  const acquisition = useMemo(() => buildAquisicaoFlow(proposal, params), [proposal, params]);
  const { consortium, sac, price, financingRate, correction } = acquisition;
  const bestFinancingSavings = Math.max(sac.estimatedSavingsVsConsortium, price.estimatedSavingsVsConsortium);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[.12em]" style={{ color: C.navy }}>
              <LineChart className="h-3.5 w-3.5" /> Aquisição
            </div>
            <h2 className="mt-3 text-2xl font-black" style={{ color: C.navy }}>
              Consórcio x Financiamento
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Compare, de forma clara e estratégica, o custo e a evolução do consórcio frente às diferentes formas de
              financiamento. Analise parcelas, custos totais e os benefícios do planejamento financeiro.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[520px]">
            <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">Taxa financiamento</div>
              <div className="mt-1 text-xl font-black" style={{ color: C.ruby }}>{brPercent(financingRate.monthlyRate)} a.m.</div>
              <div className="text-xs text-slate-500">
                {financingRate.source} | equiv. {brPercent(financingRate.annualEquivalentRate)} a.a. | {financingRate.termSource}
              </div>
            </div>
            <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">Correção consórcio</div>
              <div className="mt-1 text-xl font-black" style={{ color: C.gold }}>{correction.label} {brPercent(correction.annualRate)}</div>
              <div className="text-xs text-slate-500">{correction.source} | mês: {brPercent(correction.monthlyRate)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ComparisonCard item={consortium} tone="gold" highlight="Base Pró Max" onOpen={() => setDetailOpen("consortium")} />
        <ComparisonCard item={acquisition.comparisons[1]} tone="ruby" highlight="SAC" onOpen={() => setDetailOpen("sac")} />
        <ComparisonCard item={acquisition.comparisons[2]} tone="navy" highlight="PRICE" onOpen={() => setDetailOpen("price")} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
            <TrendingUp className="h-4 w-4" /> Economia estimada
          </div>
          <div className="mt-4 rounded-lg p-4" style={{ background: "linear-gradient(135deg, rgba(181,165,115,.18), rgba(161,28,39,.08))" }}>
            <div className="text-xs font-black uppercase tracking-[.12em] text-slate-500">Maior diferença encontrada</div>
            <div className="mt-2 text-3xl font-black" style={{ color: C.ruby }}>{brMoney(bestFinancingSavings)}</div>
            <p className="mt-2 text-sm text-slate-600">
              Diferença entre o total pago no consórcio e o financiamento mais caro da comparação, considerando o mesmo valor de aquisição.
            </p>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b pb-2">
              <span className="text-slate-500">Crédito corrigido na contemplação</span>
              <strong className="text-right" style={{ color: C.navy }}>{brMoney(consortium.creditAtContemplation)}</strong>
            </div>
            <div className="flex justify-between gap-4 border-b pb-2">
              <span className="text-slate-500">Lance embutido projetado</span>
              <strong className="text-right" style={{ color: C.navy }}>{brMoney(consortium.embeddedBidAtContemplation)}</strong>
            </div>
            <div className="flex justify-between gap-4 border-b pb-2">
              <span className="text-slate-500">Crédito disponível para aquisição</span>
              <strong className="text-right" style={{ color: C.ruby }}>{brMoney(consortium.availableAtContemplation)}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Lance próprio considerado</span>
              <strong className="text-right" style={{ color: C.gold }}>{brMoney(consortium.ownBidAtContemplation)}</strong>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
              <FileSpreadsheet className="h-4 w-4" /> Quadro comparativo
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[.08em] text-slate-500">
                <tr>
                  <th className="p-3 text-left">Modelo</th>
                  <th className="p-3 text-right">Crédito/valor</th>
                  <th className="p-3 text-right">Prazo</th>
                  <th className="p-3 text-right">Parcela inicial</th>
                  <th className="p-3 text-right">Parcela final</th>
                  <th className="p-3 text-right">Total pago</th>
                  <th className="p-3 text-right">Custo total</th>
                  <th className="p-3 text-right">Economia</th>
                </tr>
              </thead>
              <tbody>
                {acquisition.comparisons.map((item) => (
                  <tr key={item.label} className="border-t">
                    <td className="p-3 font-black" style={{ color: item.label === "Consórcio" ? C.gold : C.navy }}>{item.label}</td>
                    <td className="p-3 text-right">{brMoney(item.creditOrFinancedValue)}</td>
                    <td className="p-3 text-right">{item.term} meses</td>
                    <td className="p-3 text-right">{brMoney(item.initialInstallment)}</td>
                    <td className="p-3 text-right">{brMoney(item.finalInstallment)}</td>
                    <td className="p-3 text-right font-semibold">{brMoney(item.totalPaid)}</td>
                    <td className="p-3 text-right">{brMoney(item.totalCost)}</td>
                    <td className="p-3 text-right font-black" style={{ color: item.estimatedSavingsVsConsortium > 0 ? C.ruby : C.navy }}>
                      {item.label === "Consórcio" ? "-" : brMoney(item.estimatedSavingsVsConsortium)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ParcelEvolutionChart points={acquisition.chart} />
      <DetailOverlay open={detailOpen} acquisition={acquisition} onClose={() => setDetailOpen(null)} />
    </div>
  );
}

function AlavancagemSelectorCard({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      style={{
        borderColor: active ? C.ruby : undefined,
        boxShadow: active ? "0 10px 24px rgba(161,28,39,.14)" : undefined,
      }}
    >
      <div className="text-sm font-black" style={{ color: active ? C.ruby : C.navy }}>{label}</div>
      <div className="mt-1 text-xs leading-snug text-slate-500">{description}</div>
    </button>
  );
}

function TraditionalScenarioCard({ scenario, tone }: { scenario: AlavancagemTraditionalScenario; tone: "gold" | "ruby" }) {
  const color = tone === "gold" ? C.gold : C.ruby;

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm" style={{ borderColor: `${color}44` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[.12em] text-slate-500">{scenario.label}</div>
          <div className="mt-2 text-2xl font-black" style={{ color }}>{brMoney(scenario.availableCredit)}</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{scenario.description}</p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black" style={{ color }}>
          Contemplação mês {scenario.contemplationMonth}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-500">Parcelas pagas</div>
          <div className="font-black" style={{ color: C.navy }}>{brMoney(scenario.installmentsPaid)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-500">% de ganho</div>
          <div className="font-black" style={{ color }}>{brPercent(scenario.gainRate)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-500">TIR</div>
          <div className="font-black" style={{ color: C.navy }}>{brPercent(scenario.tirMonthly)} a.m.</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-500">ROI</div>
          <div className="font-black" style={{ color: C.navy }}>{brPercent(scenario.saleRoi)}</div>
        </div>
      </div>

      <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: "linear-gradient(135deg, rgba(181,165,115,.16), rgba(30,41,63,.05))" }}>
        <div className="flex justify-between gap-3">
          <span className="font-semibold text-slate-600">Ganho projetado na venda</span>
          <strong style={{ color }}>{brMoney(scenario.projectedGain)}</strong>
        </div>
      </div>
    </div>
  );
}

function SaleStrategyPanel({ traditional }: { traditional: AlavancagemFinanceiraFlow["traditional"] }) {
  const items = [
    { label: "Venda (Sorteio)", value: traditional.saleStrategy.lotterySaleValue, tone: "gold" as const },
    { label: "Lucro (Sorteio)", value: traditional.saleStrategy.lotteryProfit, tone: "navy" as const },
    { label: "Venda (Lance)", value: traditional.saleStrategy.bidSaleValue, tone: "ruby" as const },
    { label: "Lucro (Lance)", value: traditional.saleStrategy.bidProfit, tone: "navy" as const },
  ];

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b p-5">
        <div
          className="flex w-full items-center justify-center rounded-full px-4 py-3 text-center text-xs font-black uppercase tracking-[.18em] text-white shadow-sm"
          style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}
        >
          Estratégia de venda do crédito
        </div>
        <p className="mx-auto mt-3 max-w-3xl text-center text-sm text-slate-600">
          A venda projetada usa o percentual configurado em Ágio revenda carta aplicado sobre o crédito disponível em cada estratégia.
        </p>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const color = item.tone === "ruby" ? C.ruby : item.tone === "gold" ? C.gold : C.navy;
          return (
            <div key={item.label} className="rounded-xl border bg-slate-50 p-4 shadow-sm">
              <div className="text-xs font-black uppercase tracking-[.1em] text-slate-500">{item.label}</div>
              <div className="mt-2 text-xl font-black" style={{ color }}>{brMoney(item.value)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AlavancagemTimeline({ flow }: { flow: AlavancagemFinanceiraFlow }) {
  const { accelerated, summary } = flow;
  const points = [
    { label: "Entrada no grupo", value: flow.entries[0]?.installment || 0, detail: "Primeira parcela" },
    { label: "Contemplação", value: summary.investmentUntilContemplation, detail: `Parcelas + lance próprio no mês ${summary.contemplationMonth}` },
    { label: "Revenda com reforço", value: accelerated.resaleValue, detail: `Reforço de ${brPercent(accelerated.premiumRate)}` },
  ];

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
        <BarChart3 className="h-4 w-4" /> Linha estratégica
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {points.map((point, index) => (
          <div key={point.label} className="relative rounded-lg border bg-slate-50 p-4">
            {index < points.length - 1 ? (
              <div className="absolute left-[calc(100%-8px)] top-1/2 hidden h-px w-7 bg-slate-300 md:block" />
            ) : null}
            <div className="text-xs font-black uppercase tracking-[.1em] text-slate-500">{point.label}</div>
            <div className="mt-2 text-xl font-black" style={{ color: index === 2 ? C.ruby : index === 1 ? C.gold : C.navy }}>
              {brMoney(point.value)}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">{point.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlavancagemFinanceiraModel({
  proposal,
  params,
  allowedModes,
}: ProMaxModelosHubProps & { allowedModes?: AlavancagemFinanceiraMode[] }) {
  const [mode, setMode] = useState<AlavancagemFinanceiraMode>("tradicional");
  const flow = useMemo(() => buildAlavancagemFinanceiraFlow(proposal, params), [proposal, params]);
  const { correction, summary, traditional, accelerated } = flow;
  const sorteio = traditional.scenarios[0];
  const lanceFixo = traditional.scenarios[1];
  const visibleModes = allowedModes?.length ? allowedModes : (["tradicional", "acelerada"] as AlavancagemFinanceiraMode[]);

  useEffect(() => {
    if (!visibleModes.includes(mode)) setMode(visibleModes[0] || "tradicional");
  }, [mode, visibleModes]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[.12em]" style={{ color: C.navy }}>
              <TrendingUp className="h-3.5 w-3.5" /> Alavancagem Financeira
            </div>
            <h2 className="mt-3 text-2xl font-black" style={{ color: C.navy }}>
              Estratégias para ampliar capital com consórcio
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Compare a alavancagem tradicional, voltada a projetos de prazo maior, com a alavancagem acelerada,
              que usa lance estratégico, ágio sobre o capital pago e revenda da carta contemplada.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[520px]">
            <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">Correção da carta</div>
              <div className="mt-1 text-xl font-black" style={{ color: C.gold }}>{correction.label} {brPercent(correction.annualRate)}</div>
              <div className="text-xs text-slate-500">{correction.source} | mês: {brPercent(correction.monthlyRate)}</div>
            </div>
            <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">
                {mode === "tradicional" ? "Ágio revenda carta" : "Reforço venda"}
              </div>
              <div className="mt-1 text-xl font-black" style={{ color: C.ruby }}>
                {brPercent(mode === "tradicional" ? traditional.saleRate : accelerated.premiumRate)}
              </div>
              <div className="text-xs text-slate-500">
                {mode === "tradicional" ? "Aplicado sobre o crédito disponível" : "Aplicado sobre parcelas + lance próprio"}
              </div>
            </div>
          </div>
        </div>
      </section>

      {visibleModes.length > 1 ? (
        <section className="grid gap-3 md:grid-cols-2">
          {visibleModes.includes("tradicional") ? (
            <AlavancagemSelectorCard
              active={mode === "tradicional"}
              label="Alavancagem Tradicional"
              description="Projetos de prazo maior, comparando contemplação por sorteio e lance fixo."
              onClick={() => setMode("tradicional")}
            />
          ) : null}
          {visibleModes.includes("acelerada") ? (
            <AlavancagemSelectorCard
              active={mode === "acelerada"}
              label="Alavancagem Acelerada"
              description="Oferta de lance estratégico, ágio sobre valores pagos e revenda da carta."
              onClick={() => setMode("acelerada")}
            />
          ) : null}
        </section>
      ) : null}

      {mode === "tradicional" ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Crédito contratado" value={brMoney(summary.contractedCredit)} />
            <Metric label="Crédito na contemplação" value={brMoney(summary.creditAtContemplation)} tone="gold" />
            <Metric label="Valor investido até a contemplação" value={brMoney(summary.investmentUntilContemplation)} tone="ruby" />
            <Metric label="Lance embutido" value={brMoney(summary.embeddedBidAtContemplation)} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <TraditionalScenarioCard scenario={sorteio} tone="gold" />
            <TraditionalScenarioCard scenario={lanceFixo} tone="ruby" />
          </section>

          <SaleStrategyPanel traditional={traditional} />
        </>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Parcelas + lance próprio" value={brMoney(accelerated.investedValue)} tone="gold" />
            <Metric label="Revenda com ágio" value={brMoney(accelerated.resaleValue)} />
            <Metric label="Resultado bruto" value={brMoney(accelerated.grossResult)} tone="ruby" />
            <Metric label="ROI da operação" value={brPercent(accelerated.roi)} tone="gold" />
            <Metric label="Rentabilidade a.m." value={brPercent(accelerated.monthlyReturn)} />
            <Metric label="Lance estratégico" value={brMoney(accelerated.strategicBid)} tone="ruby" />
            <Metric label="Ágio aplicado" value={brPercent(accelerated.premiumRate)} />
            <Metric label="Crédito disponível" value={brMoney(accelerated.availableCredit)} tone="gold" />
          </section>

          <section className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
                <TrendingUp className="h-4 w-4" /> Mecânica acelerada
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4 border-b pb-2">
                  <span className="text-slate-500">Mês da contemplação/revenda</span>
                  <strong style={{ color: C.navy }}>Mês {accelerated.contemplationMonth}</strong>
                </div>
                <div className="flex justify-between gap-4 border-b pb-2">
                  <span className="text-slate-500">Parcelas pagas</span>
                  <strong style={{ color: C.navy }}>{brMoney(accelerated.installmentsPaid)}</strong>
                </div>
                <div className="flex justify-between gap-4 border-b pb-2">
                  <span className="text-slate-500">Lance próprio</span>
                  <strong style={{ color: C.ruby }}>{brMoney(accelerated.ownBid)}</strong>
                </div>
                <div className="flex justify-between gap-4 border-b pb-2">
                  <span className="text-slate-500">Lance embutido</span>
                  <strong style={{ color: C.gold }}>{brMoney(accelerated.embeddedBid)}</strong>
                </div>
                <div className="flex justify-between gap-4 border-b pb-2">
                  <span className="text-slate-500">Base para ágio</span>
                  <strong style={{ color: C.navy }}>{brMoney(accelerated.investedValue)}</strong>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Ágio financeiro projetado</span>
                  <strong style={{ color: C.ruby }}>{brMoney(accelerated.premiumValue)}</strong>
                </div>
              </div>
            </div>

            <AlavancagemTimeline flow={flow} />
          </section>
        </>
      )}
    </div>
  );
}

function patrimonialLinePoints(
  points: PatrimonialChartPoint[],
  key: "traditionalEquity" | "optimizedEquity" | "debtBalance",
  maxY: number
) {
  return points
    .map((point, index) => `${chartX(index, points.length).toFixed(2)},${chartY(point[key], maxY).toFixed(2)}`)
    .join(" ");
}

function patrimonialIncomePoints(points: PatrimonialChartPoint[], maxY: number) {
  return points
    .map((point, index) => `${chartX(index, points.length).toFixed(2)},${chartY(point.optimizedNetIncome, maxY).toFixed(2)}`)
    .join(" ");
}

function PatrimonialChart({ flow }: { flow: AlavancagemPatrimonialFlow }) {
  const [hovered, setHovered] = useState<PatrimonialChartPoint | null>(null);
  const points = flow.chart;
  const active = hovered || points[Math.max(0, points.length - 1)];
  const rawCapitalMax = Math.max(
    1,
    ...points.flatMap((point) => [point.optimizedEquity, point.traditionalEquity, point.debtBalance, point.assetValue])
  );
  const rawIncomeMax = Math.max(1, ...points.map((point) => point.optimizedNetIncome));
  const capitalMaxY = niceChartMax(rawCapitalMax);
  const incomeMaxY = niceChartMax(rawIncomeMax);
  const hoverIndex = active ? Math.max(0, points.findIndex((point) => point.month === active.month)) : -1;
  const hoverX = active ? chartX(hoverIndex, points.length) : 0;
  const hoverCapitalY = active ? chartY(active.optimizedEquity, capitalMaxY) : 0;

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
            <BarChart3 className="h-4 w-4" /> Evolução patrimonial
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Passe o cursor para ver patrimônio líquido, renda mensal e saldo devedor em cada mês.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-black">
          <span className="rounded-full border bg-white px-3 py-1.5" style={{ color: C.gold }}>Patrimônio tradicional</span>
          <span className="rounded-full border bg-white px-3 py-1.5" style={{ color: C.navy }}>Patrimônio otimizado</span>
          <span className="rounded-full border bg-white px-3 py-1.5" style={{ color: C.ruby }}>Saldo devedor</span>
          <span className="rounded-full border bg-white px-3 py-1.5" style={{ color: C.ruby }}>Renda otimizada</span>
        </div>
      </div>

      <div className="relative h-[360px] overflow-hidden px-5 py-5">
        <svg viewBox="0 0 1620 310" className="h-full w-full overflow-visible" preserveAspectRatio="none">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = chartY(capitalMaxY * ratio, capitalMaxY);
            return (
              <g key={ratio}>
                <line x1="92" x2="1532" y1={y} y2={y} stroke="#E2E8F0" strokeDasharray="5 8" />
                <text x="44" y={y + 4} textAnchor="end" className="fill-slate-500 text-[12px] font-bold">
                  {axisMoney(capitalMaxY * ratio)}
                </text>
              </g>
            );
          })}
          {[0, 0.5, 1].map((ratio) => {
            const y = chartY(incomeMaxY * ratio, incomeMaxY);
            return (
              <text key={ratio} x="1584" y={y + 4} textAnchor="end" className="fill-slate-500 text-[12px] font-bold">
                {axisMoney(incomeMaxY * ratio)}
              </text>
            );
          })}
          <line x1="92" x2="1532" y1="254" y2="254" stroke="#CBD5E1" />
          <polyline points={patrimonialLinePoints(points, "traditionalEquity", capitalMaxY)} fill="none" stroke={C.gold} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={patrimonialLinePoints(points, "optimizedEquity", capitalMaxY)} fill="none" stroke={C.navy} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={patrimonialLinePoints(points, "debtBalance", capitalMaxY)} fill="none" stroke={C.ruby} strokeWidth="4" strokeDasharray="10 10" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={patrimonialIncomePoints(points, incomeMaxY)} fill="none" stroke={C.ruby} strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />

          {active ? (
            <g>
              <line x1={hoverX} x2={hoverX} y1="34" y2="254" stroke="#94A3B8" strokeDasharray="5 5" />
              <circle cx={hoverX} cy={hoverCapitalY} r="5" fill={C.navy} />
            </g>
          ) : null}

          {points.map((point, index) => (
            <rect
              key={point.month}
              x={chartX(index, points.length) - 8}
              y="24"
              width="16"
              height="250"
              fill="transparent"
              onMouseEnter={() => setHovered(point)}
              onMouseMove={() => setHovered(point)}
            />
          ))}

          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const index = Math.min(points.length - 1, Math.max(0, Math.round((points.length - 1) * ratio)));
            const point = points[index];
            return (
              <text key={ratio} x={chartX(index, points.length)} y="292" textAnchor="middle" className="fill-slate-600 text-[12px] font-black">
                Mês {point?.month || 1}
              </text>
            );
          })}
        </svg>

        {active ? (
          <div
            className="pointer-events-none absolute top-16 w-[300px] rounded-xl border bg-white/95 p-4 text-xs shadow-2xl"
            style={{ left: hoverX > 1180 ? "auto" : `${Math.max(110, (hoverX / 1620) * 100)}%`, right: hoverX > 1180 ? 72 : "auto" }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <strong style={{ color: C.navy }}>Mês {active.month}</strong>
              <span className="rounded-full bg-slate-100 px-2 py-1 font-black text-slate-500">detalhes</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Patrimônio tradicional</span><strong style={{ color: C.gold }}>{brMoney(active.traditionalEquity)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Patrimônio otimizado</span><strong style={{ color: C.navy }}>{brMoney(active.optimizedEquity)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Saldo devedor</span><strong style={{ color: C.ruby }}>{brMoney(active.debtBalance)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Renda otimizada</span><strong>{brMoney(active.optimizedNetIncome)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Reserva reinvestida</span><strong>{brMoney(active.optimizedReserve)}</strong></div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PatrimonialScenarioPanel({ scenario, tone }: { scenario: AlavancagemPatrimonialFlow["traditional"]; tone: "gold" | "ruby" }) {
  const color = tone === "gold" ? C.gold : C.ruby;

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm" style={{ borderColor: `${color}44` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[.12em] text-slate-500">{scenario.label}</div>
          <div className="mt-2 text-2xl font-black" style={{ color }}>{brMoney(scenario.finalEquity)}</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{scenario.description}</p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black" style={{ color }}>
          {scenario.monthlyIncomeLabel}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-500">Renda mensal final</div>
          <div className="font-black" style={{ color: C.navy }}>{brMoney(scenario.finalMonthlyIncome)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-500">Renda acumulada</div>
          <div className="font-black" style={{ color }}>{brMoney(scenario.accumulatedIncome)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-500">ROI patrimonial</div>
          <div className="font-black" style={{ color: C.navy }}>{brPercent(scenario.roi)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-500">Multiplicador</div>
          <div className="font-black" style={{ color: C.navy }}>{scenario.leverageMultiple.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x</div>
        </div>
      </div>

      <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: "linear-gradient(135deg, rgba(181,165,115,.16), rgba(30,41,63,.05))" }}>
        <div className="flex justify-between gap-3">
          <span className="font-semibold text-slate-600">Alívio de caixa projetado</span>
          <strong style={{ color }}>{brMoney(scenario.cashRelief)}</strong>
        </div>
      </div>
    </div>
  );
}

function AlavancagemPatrimonialModel({
  proposal,
  params,
  allowedModes,
}: ProMaxModelosHubProps & { allowedModes?: AlavancagemPatrimonialMode[] }) {
  const [mode, setMode] = useState<AlavancagemPatrimonialMode>("tradicional");
  const flow = useMemo(() => buildAlavancagemPatrimonialFlow(proposal, params), [proposal, params]);
  const { correction, cdi, income, summary, traditional, optimized } = flow;
  const visibleModes = allowedModes?.length ? allowedModes : (["tradicional", "otimizada"] as AlavancagemPatrimonialMode[]);
  const activeScenario = mode === "tradicional" ? traditional : optimized;
  const difference = optimized.finalEquity - traditional.finalEquity;

  useEffect(() => {
    if (!visibleModes.includes(mode)) setMode(visibleModes[0] || "tradicional");
  }, [mode, visibleModes]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[.12em]" style={{ color: C.navy }}>
              <TrendingUp className="h-3.5 w-3.5" /> Alavancagem Patrimonial
            </div>
            <h2 className="mt-3 text-2xl font-black" style={{ color: C.navy }}>
              Construção de patrimônio com carta corrigida
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Compare a formação patrimonial tradicional com uma estratégia otimizada, usando renda projetada do bem,
              correção da carta, saldo devedor e reinvestimento do excedente ao CDI.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[520px]">
            <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">Correção do patrimônio</div>
              <div className="mt-1 text-xl font-black" style={{ color: C.gold }}>{correction.label} {brPercent(correction.annualRate)}</div>
              <div className="text-xs text-slate-500">{correction.source} | mês: {brPercent(correction.monthlyRate)}</div>
            </div>
            <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">
                {mode === "tradicional" ? "Aluguel projetado" : "Renda otimizada"}
              </div>
              <div className="mt-1 text-xl font-black" style={{ color: C.ruby }}>
                {brPercent(activeScenario.monthlyIncomeRate)} a.m.
              </div>
              <div className="text-xs text-slate-500">
                Despesa operacional: {brPercent(income.expenseRate)} | CDI reinvestimento: {brPercent(cdi.monthlyRate)} a.m.
              </div>
            </div>
          </div>
        </div>
      </section>

      {visibleModes.length > 1 ? (
        <section className="grid gap-3 md:grid-cols-2">
          {visibleModes.includes("tradicional") ? (
            <AlavancagemSelectorCard
              active={mode === "tradicional"}
              label="Alavancagem Tradicional"
              description="Carta contemplada formando patrimônio, com renda conservadora de aluguel no fluxo."
              onClick={() => setMode("tradicional")}
            />
          ) : null}
          {visibleModes.includes("otimizada") ? (
            <AlavancagemSelectorCard
              active={mode === "otimizada"}
              label="Alavancagem Otimizada"
              description="Renda otimizada do bem e reinvestimento do excedente para ampliar patrimônio."
              onClick={() => setMode("otimizada")}
            />
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Crédito contratado" value={brMoney(summary.contractedCredit)} />
        <Metric label="Disponível na contemplação" value={brMoney(summary.availableAtContemplation)} tone="gold" />
        <Metric label="Patrimônio líquido final" value={brMoney(activeScenario.finalEquity)} tone={mode === "tradicional" ? "gold" : "ruby"} />
        <Metric label="Investimento realizado" value={brMoney(activeScenario.totalInvested)} />
        <Metric label="Renda mensal final" value={brMoney(activeScenario.finalMonthlyIncome)} tone="gold" />
        <Metric label="Renda acumulada" value={brMoney(activeScenario.accumulatedIncome)} />
        <Metric label="ROI patrimonial" value={brPercent(activeScenario.roi)} tone="ruby" />
        <Metric label="Multiplicador patrimonial" value={`${activeScenario.leverageMultiple.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <PatrimonialScenarioPanel scenario={traditional} tone="gold" />
        <PatrimonialScenarioPanel scenario={optimized} tone="ruby" />
      </section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div
          className="m-5 flex w-[calc(100%-2.5rem)] items-center justify-center rounded-full px-4 py-3 text-center text-xs font-black uppercase tracking-[.18em] text-white shadow-sm"
          style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}
        >
          Comparativo patrimonial
        </div>
        <div className="grid gap-3 border-t p-5 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Diferença otimizada x tradicional" value={brMoney(difference)} tone={difference >= 0 ? "gold" : "ruby"} />
          <Metric label="Reserva reinvestida" value={brMoney(optimized.accumulatedReserve)} tone="ruby" />
          <Metric label="Alívio de caixa tradicional" value={brMoney(traditional.cashRelief)} />
          <Metric label="Alívio de caixa otimizado" value={brMoney(optimized.cashRelief)} tone="gold" />
        </div>
      </section>

      <PatrimonialChart flow={flow} />
    </div>
  );
}

function EquityFlowBoard({ scenario, flow }: { scenario: EquityFlow["direct"]; flow?: EquityFlow }) {
  const nodes = flow
    ? [
        {
          label: "Credito contratado",
          value: brMoney(flow.summary.contractedCredit),
          helper: "Ponto de partida da carta usada na operacao.",
          tone: "navy" as const,
          className: "left-1/2 top-4 -translate-x-1/2",
        },
        {
          label: "Lance proprio",
          value: brMoney(flow.summary.ownBidAtContemplation),
          helper: "Aporte direto usado na estrategia via lance.",
          tone: "ruby" as const,
          className: "right-8 top-20",
        },
        {
          label: "Credito via lance",
          value: brMoney(flow.directComparisons.bid.creditReleased),
          helper: "Credito liquido depois do lance utilizado.",
          tone: "ruby" as const,
          className: "right-8 top-1/2 -translate-y-1/2",
        },
        {
          label: "Projeto/garantia",
          value: brMoney(flow.directComparisons.bid.leverageAmount),
          helper: "Capital de terceiros liberado para executar a tese.",
          tone: "gold" as const,
          className: "right-24 bottom-12",
        },
        {
          label: "Parcela consorcio",
          value: brMoney(flow.summary.postContemplationInstallment),
          helper: "Fluxo mensal reajustado pelo motor do Extrato.",
          tone: "ruby" as const,
          className: "left-1/2 bottom-4 -translate-x-1/2",
        },
        {
          label: "Saldo devedor",
          value: brMoney(flow.directComparisons.bid.debtAfterContemplation),
          helper: "Saldo remanescente depois da contemplacao.",
          tone: "navy" as const,
          className: "left-8 top-1/2 -translate-y-1/2",
        },
        {
          label: "Credito via sorteio",
          value: brMoney(flow.directComparisons.lottery.creditReleased),
          helper: "Credito integral disponivel sem lance proprio.",
          tone: "gold" as const,
          className: "left-8 top-20",
        },
      ]
    : scenario.steps.slice(0, 7).map((step, index) => ({
        label: step.label,
        value: brMoney(step.value),
        helper: step.helper,
        tone: step.tone,
        className: [
          "left-1/2 top-4 -translate-x-1/2",
          "right-8 top-20",
          "right-8 top-1/2 -translate-y-1/2",
          "right-24 bottom-12",
          "left-1/2 bottom-4 -translate-x-1/2",
          "left-8 top-1/2 -translate-y-1/2",
          "left-8 top-20",
        ][index],
      }));

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
            <LineChart className="h-4 w-4" /> Como o fluxo financeiro funciona
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Uma leitura visual da operacao: carta, contemplacao, credito liberado, saldo devedor e custo mensal.
          </p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black" style={{ color: C.ruby }}>
          {scenario.label}
        </div>
      </div>

      <div className="relative mt-5 min-h-[520px] overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_center,rgba(181,165,115,.18),rgba(248,250,252,.72)_42%,rgba(255,255,255,.95)_72%)] p-5">
        <div className="absolute left-1/2 top-1/2 z-[1] flex h-40 w-40 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border bg-white text-center shadow-xl">
          <div className="text-xs font-black uppercase tracking-[.12em] text-slate-500">Equity</div>
          <div className="mt-1 text-2xl font-black" style={{ color: C.navy }}>
            {flow ? `${flow.directComparisons.bid.leverageMultiplier.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x` : `${scenario.leverageMultiple.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`}
          </div>
          <div className="mt-1 px-3 text-[11px] font-semibold text-slate-500">multiplicador da alavancagem</div>
        </div>
        <div className="absolute left-1/2 top-1/2 h-[330px] w-[330px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-slate-300/80" />
        <div className="absolute left-1/2 top-1/2 h-[430px] w-[430px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200/80" />
        {nodes.map((step) => {
          const color = step.tone === "ruby" ? C.ruby : step.tone === "gold" ? C.gold : C.navy;
          return (
            <div key={step.label} className={`absolute z-[2] w-[250px] rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur ${step.className}`}>
              <div className="text-xs font-black uppercase tracking-[.1em] text-slate-500">{step.label}</div>
              <div className="mt-2 text-xl font-black" style={{ color }}>{step.value}</div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{step.helper}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}


function EquityDirectFlowCard({
  scenario,
  tone,
}: {
  scenario: EquityFlow["directComparisons"]["lottery"];
  tone: "gold" | "ruby";
}) {
  const color = tone === "ruby" ? C.ruby : C.gold;
  const isLance = scenario.key === "lance";
  const lanceText = isLance
    ? `via lance, com lance proprio de ${brMoney(scenario.bidPaid)}${scenario.embeddedBidUsed > 0 ? ` e lance embutido de ${brMoney(scenario.embeddedBidUsed)}` : ""}`
    : "via sorteio, sem lance pago";

  const preRows = scenario.installmentDetails.filter((entry) => entry.month > 1 && entry.month < scenario.contemplationMonth);
  const preTotal = preRows.reduce((sum, entry) => sum + entry.installment, 0);
  const preAverage = preRows.length ? preTotal / preRows.length : scenario.firstInstallment;

  const flowSteps: Array<{
    key: string;
    title: string;
    value?: string;
    helper: string;
    accent?: "navy" | "ruby" | "gold";
    visual?: "money" | "guarantee" | "contemplation";
  }> = [
    {
      key: "entrada",
      title: "Entrada hoje",
      value: brMoney(scenario.firstInstallment),
      helper: "Você entra hoje pagando a primeira parcela da carta.",
      accent: tone,
    },
  ];

  if (scenario.contemplationMonth > 1) {
    flowSteps.push({
      key: "pre",
      title: "Parcelas pre",
      value: brMoney(preAverage),
      helper: `Fluxo medio das parcelas antes da contemplacao, sem contar a primeira parcela. Total projetado no periodo: ${brMoney(preTotal)}.`,
      accent: "navy",
    });
  }

  flowSteps.push({
    key: "contemplacao",
    title: `Contemplação mês ${scenario.contemplationMonth}`,
    helper: `Você é contemplado ${lanceText}.`,
    accent: tone,
    visual: "contemplation",
  });

  flowSteps.push({
    key: "pos",
    title: "Parcela pos",
    value: brMoney(scenario.postContemplationInstallment),
    helper: "Apos a contemplacao, voce assume o fluxo mensal projetado da operacao.",
    accent: "navy",
  });

  flowSteps.push({
    key: "alienacao",
    title: "Alienação do imóvel",
    helper: "Você aliena o proprio imovel como garantia, viabilizando a liberacao do credito para uso estrategico.",
    accent: "navy",
    visual: "guarantee",
  });

  flowSteps.push({
    key: "reinvestimento",
    title: "Reinvestimento",
    value: brMoney(scenario.creditReleased),
    helper: "O valor total do credito liberado pode ser reinvestido no negocio para gerar mais lucro, caixa e expansao patrimonial.",
    accent: tone,
  });

  const desktopPositions = flowSteps.length >= 6
    ? [
        "left-1/2 top-4 -translate-x-1/2",
        "right-4 top-[20%]",
        "right-6 bottom-[20%]",
        "left-1/2 bottom-4 -translate-x-1/2",
        "left-6 bottom-[20%]",
        "left-4 top-[20%]",
      ]
    : [
        "left-1/2 top-4 -translate-x-1/2",
        "right-4 top-[25%]",
        "right-8 bottom-[20%]",
        "left-8 bottom-[20%]",
        "left-4 top-[25%]",
      ];

  const accentColor = (accent?: "navy" | "ruby" | "gold") => accent === "ruby" ? C.ruby : accent === "gold" ? C.gold : C.navy;

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm" style={{ borderColor: tone === "ruby" ? "rgba(161,28,39,.38)" : "rgba(181,165,115,.42)" }}>
      <div className="border-b p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
              <LineChart className="h-4 w-4" /> Fluxo Financeiro
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Leitura simplificada da operação {scenario.label.toLowerCase()}, do primeiro pagamento até o reinvestimento do crédito.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black" style={{ color }}>{scenario.label}</span>
        </div>
      </div>

      <div className="relative overflow-hidden bg-[radial-gradient(circle_at_center,rgba(181,165,115,.18),rgba(248,250,252,.76)_44%,rgba(255,255,255,.96)_74%)] p-4 lg:min-h-[700px]">
        <div className="hidden lg:block absolute left-1/2 top-1/2 h-[395px] w-[395px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-slate-300/80" />
        <div className="hidden lg:block absolute left-1/2 top-1/2 h-[270px] w-[270px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200/90" />
        <div className="hidden lg:flex absolute left-1/2 top-1/2 z-[1] h-40 w-40 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border bg-white text-center shadow-xl">
          <div className="text-[11px] font-black uppercase tracking-[.13em] text-slate-500">Alavancagem</div>
          <div className="mt-1 text-2xl font-black" style={{ color }}>
            {scenario.leverageMultiplier.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x
          </div>
          <div className="mt-1 px-3 text-[11px] font-semibold text-slate-500">sobre o capital investido</div>
        </div>

        <div className="grid gap-4 lg:hidden">
          <div className="mx-auto flex h-36 w-36 flex-col items-center justify-center rounded-full border bg-white text-center shadow-xl">
            <div className="text-[11px] font-black uppercase tracking-[.13em] text-slate-500">Alavancagem</div>
            <div className="mt-1 text-2xl font-black" style={{ color }}>
              {scenario.leverageMultiplier.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x
            </div>
            <div className="mt-1 px-3 text-[11px] font-semibold text-slate-500">sobre o capital investido</div>
          </div>
          {flowSteps.map((step, index) => (
            <div key={step.key} className="rounded-xl border bg-white p-4 shadow-md">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: accentColor(step.accent) }}>
                  {index + 1}
                </span>
                <div className="text-xs font-black uppercase tracking-[.1em] text-slate-500">{step.title}</div>
              </div>
              {step.visual === "guarantee" ? (
                <div className="mt-3 flex items-center gap-3" style={{ color: C.navy }}>
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <House className="h-6 w-6" />
                    <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow">
                      <Lock className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className="text-sm font-black">Imóvel em garantia</div>
                </div>
              ) : step.visual === "contemplation" ? (
                <div className="mt-3 flex items-center gap-3" style={{ color: accentColor(step.accent) }}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-black">Carta contemplada</div>
                </div>
              ) : (
                <div className="mt-2 text-xl font-black" style={{ color: accentColor(step.accent) }}>{step.value}</div>
              )}
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{step.helper}</p>
            </div>
          ))}
        </div>

        <div className="hidden lg:block">
          {flowSteps.map((step, index) => (
            <div key={step.key} className={`absolute z-[2] w-[190px] rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur ${desktopPositions[index]}`}>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: accentColor(step.accent) }}>
                  {index + 1}
                </span>
                <div className="text-[11px] font-black uppercase tracking-[.1em] text-slate-500">{step.title}</div>
              </div>
              {step.visual === "guarantee" ? (
                <div className="mt-3 flex items-center gap-3" style={{ color: C.navy }}>
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <House className="h-6 w-6" />
                    <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow">
                      <Lock className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className="text-sm font-black">Imóvel em garantia</div>
                </div>
              ) : step.visual === "contemplation" ? (
                <div className="mt-3 flex items-center gap-3" style={{ color: accentColor(step.accent) }}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-black">Carta contemplada</div>
                </div>
              ) : (
                <div className="mt-2 text-xl font-black" style={{ color: accentColor(step.accent) }}>{step.value}</div>
              )}
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{step.helper}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EquityCompetitorTable({ flow }: { flow: EquityFlow }) {
  const equityBase = flow.directComparisons.bid;

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
          <FileSpreadsheet className="h-4 w-4" /> Comparativo com linhas de crédito
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Compara o crédito liberado do Equity com linhas tradicionais, usando as taxas configuradas nos parâmetros.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[.08em] text-slate-500">
            <tr>
              <th className="p-3 text-left">Linha</th>
              <th className="p-3 text-right">Taxa a.m.</th>
              <th className="p-3 text-right">Taxa a.a.</th>
              <th className="p-3 text-right">Parcela estimada</th>
              <th className="p-3 text-right">Total pago</th>
              <th className="p-3 text-right">Juros/custo</th>
              <th className="p-3 text-right">Diferença vs consórcio</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="p-3 font-black" style={{ color: C.gold }}>Equity com consórcio</td>
              <td className="p-3 text-right">{brPercent(equityBase.compoundCetMonthly)}</td>
              <td className="p-3 text-right">{brPercent(equityBase.compoundCetAnnual)}</td>
              <td className="p-3 text-right">{brMoney(flow.direct.monthlyConsortiumCost)}</td>
              <td className="p-3 text-right font-semibold">{brMoney(equityBase.totalInvested + equityBase.debtAfterContemplation)}</td>
              <td className="p-3 text-right">{brMoney(equityBase.totalCost)}</td>
              <td className="p-3 text-right font-black">-</td>
            </tr>
            {flow.competitors.map((item) => (
              <tr key={item.key} className="border-t">
                <td className="p-3 font-black" style={{ color: C.navy }}>{item.label}</td>
                <td className="p-3 text-right">{brPercent(item.monthlyRate)}</td>
                <td className="p-3 text-right">{brPercent(item.annualRate)}</td>
                <td className="p-3 text-right">{brMoney(item.monthlyPayment)}</td>
                <td className="p-3 text-right font-semibold">{brMoney(item.totalPaid)}</td>
                <td className="p-3 text-right">{brMoney(item.totalInterest)}</td>
                <td className="p-3 text-right font-black" style={{ color: item.differenceVsConsortium >= 0 ? C.ruby : C.gold }}>
                  {brMoney(item.differenceVsConsortium)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EquityCadencedCycles({ cycles }: { cycles: EquityFlow["cadenced"]["cycles"] }) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
        <BarChart3 className="h-4 w-4" /> Esteira cadenciada
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {cycles.map((cycle) => (
          <div key={cycle.cycle} className="rounded-xl border bg-slate-50 p-4 shadow-sm">
            <div className="text-xs font-black uppercase tracking-[.1em] text-slate-500">Ciclo {cycle.cycle} | mês {cycle.month}</div>
            <div className="mt-2 text-xl font-black" style={{ color: cycle.cycle === 3 ? C.ruby : C.gold }}>
              {brMoney(cycle.accumulatedEquity)}
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Crédito em operação</span><strong>{brMoney(cycle.creditReleased)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Renda do ativo</span><strong>{brMoney(cycle.assetIncome)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Renda financeira</span><strong>{brMoney(cycle.investmentIncome)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Resultado mensal</span><strong>{brMoney(cycle.netPosition)}</strong></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EquityDirectProjectCost({ flow }: { flow: EquityFlow }) {
  const { direct, summary } = flow;
  const leverageLabel = direct.leverageOnBid > 0
    ? `${direct.leverageOnBid.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`
    : `${direct.leverageMultiple.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;

  return (
    <section className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
          <TrendingUp className="h-4 w-4" /> Custo do projeto
        </div>
        <div className="mt-4 rounded-xl p-5" style={{ background: "linear-gradient(135deg, rgba(181,165,115,.20), rgba(161,28,39,.08))" }}>
          <div className="text-xs font-black uppercase tracking-[.12em] text-slate-500">Custos totais / alavancagem</div>
          <div className="mt-2 text-3xl font-black" style={{ color: C.ruby }}>{brPercent(direct.projectCostMonthlyRate)} a.m.</div>
          <div className="mt-1 text-lg font-black" style={{ color: C.navy }}>{brPercent(direct.projectCostAnnualRate)} a.a.</div>
          <p className="mt-2 text-sm text-slate-600">
            Taxa efetiva aproximada pela relação entre custo total do consórcio e crédito disponível, descapitalizada pelo prazo do projeto.
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
          <FileSpreadsheet className="h-4 w-4" /> Leitura financeira
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500">Custo total do projeto</div>
            <div className="font-black" style={{ color: C.ruby }}>{brMoney(direct.totalCost)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500">Alavancagem</div>
            <div className="font-black" style={{ color: C.gold }}>{leverageLabel}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500">Lance próprio</div>
            <div className="font-black" style={{ color: C.ruby }}>{brMoney(summary.ownBidAtContemplation)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500">Lance embutido</div>
            <div className="font-black" style={{ color: C.navy }}>{brMoney(summary.embeddedBidAtContemplation)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function EquityDirectComparisonCard({
  scenario,
  tone,
  onOpenDetails,
}: {
  scenario: EquityFlow["directComparisons"]["lottery"];
  tone: "gold" | "ruby";
  onOpenDetails: () => void;
}) {
  const color = tone === "ruby" ? C.ruby : C.gold;
  const multiplier = `${scenario.leverageMultiplier.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}x`;

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm" style={{ borderColor: tone === "ruby" ? "rgba(161,28,39,.42)" : "rgba(181,165,115,.42)" }}>
      <div className="border-b p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[.14em]" style={{ color }}>{scenario.label}</div>
            <div className="mt-2 text-3xl font-black" style={{ color }}>{brMoney(scenario.creditReleased)}</div>
            <p className="mt-2 text-sm text-slate-600">{scenario.description}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black" style={{ color }}>
            {multiplier}
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <Metric label="Credito liberado" value={brMoney(scenario.creditReleased)} tone={tone} />
        <Metric label="Parcelas pagas ate a contemplacao" value={brMoney(scenario.installmentsPaidUntilContemplation)} />
        <Metric label="Lance pago" value={brMoney(scenario.bidPaid)} tone={scenario.bidPaid > 0 ? "ruby" : undefined} />
        <Metric label="Total investido" value={brMoney(scenario.totalInvested)} />
        <Metric label="Alavancagem" value={brMoney(scenario.leverageAmount)} tone="gold" />
        <Metric label="Multiplicador da alavancagem" value={multiplier} tone={tone} />
        <Metric label="Saldo devedor apos contemplacao" value={brMoney(scenario.debtAfterContemplation)} />
        <button
          type="button"
          onClick={onOpenDetails}
          className="rounded-lg border bg-slate-50 px-4 py-3 text-left text-xs font-black uppercase tracking-[.1em] transition hover:bg-white"
          style={{ color }}
        >
          Ver detalhamento das parcelas
        </button>
      </div>

      <div className="border-t bg-slate-50/70 p-5">
        <div className="inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[.12em] text-white" style={{ background: `linear-gradient(90deg, ${C.navy}, ${color})` }}>
          Indicadores da Operacao
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Metric label="Prazo medio" value={`${scenario.averageTerm} meses`} />
          <Metric label="CET comp. a.m." value={brPercent(scenario.compoundCetMonthly)} tone="gold" />
          <Metric label="CET simples a.m." value={brPercent(scenario.simpleCetMonthly)} />
          <Metric label="Lance efetivo" value={brPercent(scenario.effectiveBidRate)} tone={tone} />
          <Metric label="CET comp. a.a." value={brPercent(scenario.compoundCetAnnual)} tone="ruby" />
          <Metric label="CET simples a.a." value={brPercent(scenario.simpleCetAnnual)} />
        </div>
      </div>
    </section>
  );
}

function EquityParcelDetailOverlay({
  open,
  flow,
  onClose,
}: {
  open: EquityDirectDetailKey | null;
  flow: EquityFlow;
  onClose: () => void;
}) {
  if (!open) return null;

  const scenario = open === "sorteio" ? flow.directComparisons.lottery : flow.directComparisons.bid;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <section className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h3 className="text-xl font-black" style={{ color: C.navy }}>
              Equity {scenario.label} - Detalhamento das Parcelas
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Parcelas projetadas pelo mesmo motor do Extrato, preservando correcao, contemplacao, lance e saldo devedor.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            aria-label="Fechar detalhamento"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 border-b bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Credito liberado" value={brMoney(scenario.creditReleased)} tone={open === "lance" ? "ruby" : "gold"} />
          <Metric label="Prazo" value={`${flow.summary.planTerm} meses`} />
          <Metric label="Total investido" value={brMoney(scenario.totalInvested)} />
          <Metric label="Saldo devedor" value={brMoney(scenario.debtAfterContemplation)} tone="ruby" />
        </div>

        <div className="overflow-auto">
          <table className="min-w-[1020px] w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-white text-xs uppercase tracking-[.08em] text-slate-500 shadow-sm">
              <tr>
                <th className="p-3 text-left">Mes</th>
                <th className="p-3 text-right">Credito</th>
                <th className="p-3 text-right">Saldo inicial</th>
                <th className="p-3 text-right">Parcela</th>
                <th className="p-3 text-right">Pago acumulado</th>
                <th className="p-3 text-right">Saldo final</th>
                <th className="p-3 text-left">Evento do Extrato</th>
              </tr>
            </thead>
            <tbody>
              {scenario.installmentDetails.map((entry) => (
                <tr key={entry.month} className="border-t">
                  <td className="p-3 font-black" style={{ color: C.navy }}>Mes {entry.month}</td>
                  <td className="p-3 text-right">{brMoney(entry.credit)}</td>
                  <td className="p-3 text-right">{brMoney(entry.initialBalance)}</td>
                  <td className="p-3 text-right font-semibold">{brMoney(entry.installment)}</td>
                  <td className="p-3 text-right">{brMoney(entry.payments)}</td>
                  <td className="p-3 text-right font-black" style={{ color: entry.endingBalance <= 0 ? C.gold : C.ruby }}>
                    {brMoney(entry.endingBalance)}
                  </td>
                  <td className="max-w-[320px] p-3 text-xs text-slate-600">
                    {entry.eventText || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EquityCashFlowTable({ scenario, contemplationMonth }: { scenario: EquityFlow["direct"]; contemplationMonth: number }) {
  const rows = scenario.cashFlow.filter((entry) => entry.month >= contemplationMonth).slice(0, 12);

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
          <LineChart className="h-4 w-4" /> Fluxo de caixa projetado
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Primeiros 12 meses a partir da contemplação, somando renda financeira, renda do ativo e parcela do consórcio.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[.08em] text-slate-500">
            <tr>
              <th className="p-3 text-left">Mês</th>
              <th className="p-3 text-right">Renda financeira</th>
              <th className="p-3 text-right">Renda do ativo</th>
              <th className="p-3 text-right">Parcela</th>
              <th className="p-3 text-right">Fluxo líquido</th>
              <th className="p-3 text-right">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.month} className="border-t">
                <td className="p-3 font-black" style={{ color: C.navy }}>Mês {entry.month}</td>
                <td className="p-3 text-right">{brMoney(entry.investmentIncome)}</td>
                <td className="p-3 text-right">{brMoney(entry.assetIncome)}</td>
                <td className="p-3 text-right" style={{ color: C.ruby }}>{brMoney(entry.installment)}</td>
                <td className="p-3 text-right font-black" style={{ color: entry.netCashFlow >= 0 ? C.gold : C.ruby }}>{brMoney(entry.netCashFlow)}</td>
                <td className="p-3 text-right font-semibold">{brMoney(entry.accumulatedCashFlow)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EquityInstallmentFlowTable({ scenario }: { scenario: EquityFlow["direct"] }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
          <CalendarDays className="h-4 w-4" /> Fluxo de vencimento das parcelas
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Fluxo mês a mês vindo do Extrato, preservando correção, contemplação, lance e novo prazo.
        </p>
      </div>
      <div className="max-h-[440px] overflow-auto">
        <table className="min-w-[760px] w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[.08em] text-slate-500">
            <tr>
              <th className="p-3 text-left">Mês</th>
              <th className="p-3 text-left">Fase</th>
              <th className="p-3 text-right">Parcela</th>
              <th className="p-3 text-right">Saldo devedor</th>
            </tr>
          </thead>
          <tbody>
            {scenario.installmentFlow.map((entry) => (
              <tr key={entry.month} className="border-t">
                <td className="p-3 font-black" style={{ color: C.navy }}>Mês {entry.month}</td>
                <td className="p-3">
                  <span
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black"
                    style={{ color: entry.phase === "contemplacao" ? C.ruby : entry.phase === "pos_contemplacao" ? C.gold : C.navy }}
                  >
                    {entry.dueLabel}
                  </span>
                </td>
                <td className="p-3 text-right font-semibold">{brMoney(entry.installment)}</td>
                <td className="p-3 text-right font-black" style={{ color: entry.endingBalance <= 0 ? C.gold : C.ruby }}>
                  {brMoney(entry.endingBalance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EquityModel({
  proposal,
  params,
  allowedModes,
}: ProMaxModelosHubProps & { allowedModes?: EquityMode[] }) {
  const [mode, setMode] = useState<EquityMode>("direto");
  const [directDetailOpen, setDirectDetailOpen] = useState<EquityDirectDetailKey | null>(null);
  const flow = useMemo(() => buildEquityFlow(proposal, params), [proposal, params]);
  const visibleModes = allowedModes?.length ? allowedModes : (["direto", "cadenciado"] as EquityMode[]);
  const scenario = mode === "direto" ? flow.direct : flow.cadenced;

  useEffect(() => {
    if (!visibleModes.includes(mode)) setMode(visibleModes[0] || "direto");
  }, [mode, visibleModes]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[.12em]" style={{ color: C.navy }}>
              <TrendingUp className="h-3.5 w-3.5" /> Equity com Consórcio
            </div>
            <h2 className="mt-3 text-2xl font-black" style={{ color: C.navy }}>
              Capital estratégico sem vender participação
            </h2>
            <p className="mt-2 max-w-4xl text-sm text-slate-600">
              Equity com consórcio é uma forma de estruturar capital usando carta contemplada: o cliente aporta uma parte
              como lance, preserva capital aplicado, libera crédito para aquisição/projeto/garantia e compara o custo com linhas
              como Home Equity, Pronaf, Pronamp e demais créditos.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[560px]">
            <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">Quanto eu pego?</div>
              <div className="mt-1 text-xl font-black" style={{ color: C.gold }}>{brMoney(scenario.creditReleased)}</div>
              <div className="text-xs text-slate-500">Crédito disponível no modelo selecionado</div>
            </div>
            <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-bold uppercase tracking-[.08em] text-slate-500">Qual o custo?</div>
              <div className="mt-1 text-xl font-black" style={{ color: C.ruby }}>{brPercent(scenario.effectiveMonthlyCostRate)} a.m.</div>
              <div className="text-xs text-slate-500">{brPercent(scenario.effectiveAnnualCostRate)} a.a. equivalente</div>
            </div>
          </div>
        </div>
      </section>

      {visibleModes.length > 1 ? (
        <section className="grid gap-3 md:grid-cols-2">
          {visibleModes.includes("direto") ? (
            <AlavancagemSelectorCard
              active={mode === "direto"}
              label="Equity Direto"
              description="Uma carta, uma contemplação e uma tese clara de crédito, renda e capital preservado."
              onClick={() => setMode("direto")}
            />
          ) : null}
          {visibleModes.includes("cadenciado") ? (
            <AlavancagemSelectorCard
              active={mode === "cadenciado"}
              label="Equity Cadenciado"
              description="Repete a tese em ciclos para formar uma esteira de capital e patrimônio."
              onClick={() => setMode("cadenciado")}
            />
          ) : null}
        </section>
      ) : null}

      {mode === "direto" ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Crédito contratado" value={brMoney(flow.summary.contractedCredit)} />
            <Metric label="Crédito Via Sorteio" value={brMoney(flow.directComparisons.lottery.creditReleased)} tone="gold" />
            <Metric label="Crédito Via Lance" value={brMoney(flow.directComparisons.bid.creditReleased)} tone="ruby" />
            <Metric label="Lance Próprio" value={brMoney(flow.summary.ownBidAtContemplation)} tone="ruby" />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <EquityDirectComparisonCard
              scenario={flow.directComparisons.lottery}
              tone="gold"
              onOpenDetails={() => setDirectDetailOpen("sorteio")}
            />
            <EquityDirectComparisonCard
              scenario={flow.directComparisons.bid}
              tone="ruby"
              onOpenDetails={() => setDirectDetailOpen("lance")}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <EquityDirectFlowCard scenario={flow.directComparisons.lottery} tone="gold" />
            <EquityDirectFlowCard scenario={flow.directComparisons.bid} tone="ruby" />
          </section>
          <EquityParcelDetailOverlay open={directDetailOpen} flow={flow} onClose={() => setDirectDetailOpen(null)} />
        </>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Crédito contratado" value={brMoney(flow.summary.contractedCredit)} />
            <Metric label="Crédito liberado" value={brMoney(scenario.creditReleased)} tone="gold" />
            <Metric label="Capital preservado" value={brMoney(scenario.capitalPreserved)} />
            <Metric label="Lance estratégico" value={brMoney(scenario.strategicBid)} tone="ruby" />
            <Metric label="Renda financeira mês" value={brMoney(scenario.monthlyInvestmentIncome)} tone="gold" />
            <Metric label="Renda do ativo mês" value={brMoney(scenario.monthlyAssetIncome)} />
            <Metric label="Resultado mensal" value={brMoney(scenario.monthlyNetPosition)} tone={scenario.monthlyNetPosition >= 0 ? "gold" : "ruby"} />
            <Metric label="ROI projetado" value={brPercent(scenario.roi)} tone="ruby" />
          </section>

          <section className="grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
                <FileSpreadsheet className="h-4 w-4" /> Como funciona?
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4 border-b pb-2">
                  <span className="text-slate-500">Mês da contemplação</span>
                  <strong style={{ color: C.navy }}>Mês {flow.summary.contemplationMonth}</strong>
                </div>
                <div className="flex justify-between gap-4 border-b pb-2">
                  <span className="text-slate-500">Crédito na contemplação</span>
                  <strong style={{ color: C.gold }}>{brMoney(flow.summary.creditAtContemplation)}</strong>
                </div>
                <div className="flex justify-between gap-4 border-b pb-2">
                  <span className="text-slate-500">Lance embutido</span>
                  <strong style={{ color: C.navy }}>{brMoney(flow.summary.embeddedBidAtContemplation)}</strong>
                </div>
                <div className="flex justify-between gap-4 border-b pb-2">
                  <span className="text-slate-500">Lance próprio</span>
                  <strong style={{ color: C.ruby }}>{brMoney(flow.summary.ownBidAtContemplation)}</strong>
                </div>
                <div className="flex justify-between gap-4 border-b pb-2">
                  <span className="text-slate-500">Renda do ativo</span>
                  <strong style={{ color: C.navy }}>{brPercent(flow.income.assetMonthlyRate)} a.m.</strong>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">CDI aplicado no capital preservado</span>
                  <strong style={{ color: C.gold }}>{brPercent(flow.cdi.monthlyRate)} a.m.</strong>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-black" style={{ color: C.navy }}>
                <TrendingUp className="h-4 w-4" /> Quanto eu ganho?
              </div>
              <div className="mt-4 rounded-xl p-5" style={{ background: "linear-gradient(135deg, rgba(181,165,115,.20), rgba(161,28,39,.08))" }}>
                <div className="text-xs font-black uppercase tracking-[.12em] text-slate-500">Ganho projetado da tese</div>
                <div className="mt-2 text-3xl font-black" style={{ color: C.ruby }}>{brMoney(scenario.projectedGain)}</div>
                <p className="mt-2 text-sm text-slate-600">
                  Considera crédito liberado, capital preservado, resultado anual estimado e custo total do consórcio no modelo selecionado.
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Metric label="Multiplicador" value={`${scenario.leverageMultiple.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`} />
                <Metric label="Resultado anual" value={brMoney(scenario.annualNetPosition)} tone={scenario.annualNetPosition >= 0 ? "gold" : "ruby"} />
              </div>
            </div>
          </section>

          <EquityFlowBoard scenario={scenario} />
          <EquityCadencedCycles cycles={flow.cadenced.cycles} />
        </>
      )}
      <EquityCompetitorTable flow={flow} />
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

export default function ProMaxModelosHub({ proposal, params, allowedModels }: ProMaxModelosHubProps) {
  const [activeModel, setActiveModel] = useState<ModelKey>("extrato");
  const visibleModels = useMemo(() => {
    if (!allowedModels?.length) return MODELS;
    const allowed = new Set(allowedModels);
    return MODELS.filter((item) => allowed.has(item.key));
  }, [allowedModels]);
  const model = visibleModels.find((item) => item.key === activeModel) || visibleModels[0] || MODELS[0];
  const allowedAlavFinanceiraModes = useMemo(() => {
    if (!allowedModels?.length) return undefined;
    const allowed = new Set(allowedModels);
    const modes: AlavancagemFinanceiraMode[] = [];
    if (allowed.has("alav_financeira_tradicional")) modes.push("tradicional");
    if (allowed.has("alav_financeira_acelerada")) modes.push("acelerada");
    return modes.length ? modes : undefined;
  }, [allowedModels]);
  const allowedAlavPatrimonialModes = useMemo(() => {
    if (!allowedModels?.length) return undefined;
    const allowed = new Set(allowedModels);
    const modes: AlavancagemPatrimonialMode[] = [];
    if (allowed.has("alav_patrimonial_tradicional")) modes.push("tradicional");
    if (allowed.has("alav_patrimonial_otimizada")) modes.push("otimizada");
    return modes.length ? modes : undefined;
  }, [allowedModels]);
  const allowedEquityModes = useMemo(() => {
    if (!allowedModels?.length) return undefined;
    const allowed = new Set(allowedModels);
    const modes: EquityMode[] = [];
    if (allowed.has("equity_direto")) modes.push("direto");
    if (allowed.has("equity_cadenciado")) modes.push("cadenciado");
    return modes.length ? modes : undefined;
  }, [allowedModels]);
  const consultant = getConsultant(proposal);

  useEffect(() => {
    if (visibleModels.length && !visibleModels.some((item) => item.key === activeModel)) {
      setActiveModel(visibleModels[0].key);
    }
  }, [activeModel, visibleModels]);

  return (
    <div className="space-y-4">
      <section
        className="relative overflow-hidden rounded-xl border p-5 shadow-sm"
        style={{ background: "linear-gradient(135deg, #1E293F 0%, #A11C27 100%)", borderColor: "rgba(255,255,255,.22)" }}
      >
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-[1] flex flex-col gap-5 text-white lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[.12em]">
              <TrendingUp className="h-3.5 w-3.5" /> Modelos Pró Max
            </div>
            <h1 className="mt-3 max-w-4xl text-2xl font-black md:text-4xl">
              <span className="block">Proposta de Investimento Personalizada</span>
              <span className="mt-1 block font-medium text-white/85">Para {proposal.lead_nome || "você"}</span>
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-white/78">
              Uma visão clara da sua estratégia, com crédito, lance, contemplação e evolução das parcelas organizados
              para apoiar uma decisão mais segura e mostrar o caminho do investimento com transparência.
            </p>
          </div>
          <div className="hidden xl:flex xl:flex-1 xl:justify-end xl:pr-5 2xl:pr-7">
            <ConsulmaxLogoMark />
          </div>
          <div className="w-full rounded-lg border border-white/20 bg-white/95 p-4 text-slate-900 shadow-sm lg:max-w-sm">
            <div className="flex items-center gap-3">
              {consultant.photoUrl ? (
                <img
                  src={consultant.photoUrl}
                  alt={consultant.name}
                  className="h-14 w-14 rounded-full object-cover ring-2 ring-white"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full font-black text-white" style={{ background: C.navy }}>
                  {initials(consultant.name)}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[.08em] text-slate-500">Consultor</div>
                <div className="truncate text-sm font-black" style={{ color: C.navy }}>{consultant.name}</div>
                {consultant.phone ? (
                  <a
                    href={whatsappHref(consultant.phone)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 transition hover:text-emerald-700"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {phoneLabel(consultant.phone)}
                  </a>
                ) : (
                  <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-600">
                    <UserRound className="h-3.5 w-3.5" />
                    {consultant.email || "Atendimento Consulmax"}
                  </div>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              Especialista Consulmax responsável por conduzir sua estratégia com clareza, segurança e foco no melhor aproveitamento da carta.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
        {visibleModels.map((item) => {
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

      {activeModel === "extrato" ? (
        <ExtratoModel proposal={proposal} params={params} />
      ) : activeModel === "aquisicao" ? (
        <AquisicaoModel proposal={proposal} params={params} />
      ) : activeModel === "previdencia" ? (
        <PrevidenciaModel proposal={proposal} params={params} />
      ) : activeModel === "alav_financeira" ? (
        <AlavancagemFinanceiraModel proposal={proposal} params={params} allowedModes={allowedAlavFinanceiraModes} />
      ) : activeModel === "alav_patrimonial" ? (
        <AlavancagemPatrimonialModel proposal={proposal} params={params} allowedModes={allowedAlavPatrimonialModes} />
      ) : activeModel === "equity" ? (
        <EquityModel proposal={proposal} params={params} allowedModes={allowedEquityModes} />
      ) : (
        <PlaceholderModel model={model} />
      )}
    </div>
  );
}
