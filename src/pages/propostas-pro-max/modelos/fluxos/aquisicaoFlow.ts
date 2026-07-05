import {
  buildExtratoFlow,
  creditoLiquido,
  onlyNumber,
  type ExtratoEventEntry,
  type ExtratoMonthEntry,
  type ProposalModelRow,
  type ProposalParams,
} from "./extratoFlow";

export type FinancingMode = "sac" | "price";

export type FinancingMonthEntry = {
  month: number;
  installment: number;
  interest: number;
  amortization: number;
  endingBalance: number;
};

export type FinancingSummary = {
  mode: FinancingMode;
  label: string;
  financedValue: number;
  term: number;
  monthlyRate: number;
  annualEquivalentRate: number;
  initialInstallment: number;
  finalInstallment: number;
  totalPaid: number;
  totalCost: number;
  differenceVsConsortium: number;
  estimatedSavingsVsConsortium: number;
  entries: FinancingMonthEntry[];
};

export type AcquisitionComparison = {
  label: string;
  creditOrFinancedValue: number;
  term: number;
  initialInstallment: number;
  finalInstallment: number;
  totalPaid: number;
  totalCost: number;
  differenceVsConsortium: number;
  estimatedSavingsVsConsortium: number;
};

export type AcquisitionChartPoint = {
  month: number;
  consortium: number;
  sac: number;
  price: number;
  consortiumDetail?: ExtratoMonthEntry;
  consortiumEvents: ExtratoEventEntry[];
  sacDetail?: FinancingMonthEntry;
  priceDetail?: FinancingMonthEntry;
};

export type AcquisitionFlow = {
  consortium: AcquisitionComparison & {
    ownBidAtContemplation: number;
    embeddedBidAtContemplation: number;
    creditAtContemplation: number;
    availableAtContemplation: number;
  };
  sac: FinancingSummary;
  price: FinancingSummary;
  comparisons: AcquisitionComparison[];
  consortiumEntries: ExtratoMonthEntry[];
  consortiumEvents: ExtratoEventEntry[];
  chart: AcquisitionChartPoint[];
  financingRate: {
    label: string;
    source: string;
    monthlyRate: number;
    annualEquivalentRate: number;
    isRealEstate: boolean;
    termSource: string;
  };
  correction: {
    label: string;
    annualRate: number;
    monthlyRate: number;
    source: string;
  };
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeFraction(value: unknown) {
  const parsed = onlyNumber(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function resolveFinancingRate(row: ProposalModelRow, params: ProposalParams) {
  const segment = normalizeText(row.segmento);
  const isRealEstate =
    segment.includes("imovel") ||
    segment.includes("imob") ||
    segment.includes("habit") ||
    segment.includes("terreno") ||
    segment.includes("constr");

  if (isRealEstate) {
    const annualRate = normalizeFraction(params.fin_imob_anual);
    const monthlyRate = annualRate > 0 ? Math.pow(1 + annualRate, 1 / 12) - 1 : 0;
    return {
      label: "Financiamento imobiliário",
      source: "fin_imob_anual",
      monthlyRate,
      annualEquivalentRate: annualRate,
      isRealEstate: true,
      termSource: "Prazo imobiliário padrão",
    };
  }

  const monthlyRate = normalizeFraction(params.fin_veic_mensal);
  return {
    label: "Financiamento de veículos",
    source: "fin_veic_mensal",
    monthlyRate,
    annualEquivalentRate: Math.pow(1 + monthlyRate, 12) - 1,
    isRealEstate: false,
    termSource: "Prazo da proposta",
  };
}

function buildFinancingSummary(
  mode: FinancingMode,
  financedValue: number,
  term: number,
  monthlyRate: number,
  consortiumTotalPaid: number
): FinancingSummary {
  const safeTerm = Math.max(1, Math.round(term));
  const safeValue = Math.max(0, financedValue);
  const entries: FinancingMonthEntry[] = [];
  let balance = safeValue;
  let totalPaid = 0;
  const sacAmortization = safeValue / safeTerm;
  const priceInstallment =
    monthlyRate > 0
      ? safeValue * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -safeTerm)))
      : safeValue / safeTerm;

  for (let month = 1; month <= safeTerm; month += 1) {
    const interest = balance * monthlyRate;
    const amortization = mode === "sac" ? Math.min(sacAmortization, balance) : Math.min(priceInstallment - interest, balance);
    const installment = mode === "sac" ? amortization + interest : amortization + interest;

    balance = Math.max(0, balance - amortization);
    totalPaid += installment;

    entries.push({
      month,
      installment,
      interest,
      amortization,
      endingBalance: balance,
    });
  }

  const initialInstallment = entries[0]?.installment || 0;
  const finalInstallment = entries[entries.length - 1]?.installment || 0;
  const totalCost = Math.max(0, totalPaid - safeValue);
  const differenceVsConsortium = totalPaid - consortiumTotalPaid;

  return {
    mode,
    label: mode === "sac" ? "Financiamento SAC" : "Financiamento Price",
    financedValue: safeValue,
    term: safeTerm,
    monthlyRate,
    annualEquivalentRate: Math.pow(1 + monthlyRate, 12) - 1,
    initialInstallment,
    finalInstallment,
    totalPaid,
    totalCost,
    differenceVsConsortium,
    estimatedSavingsVsConsortium: Math.max(0, differenceVsConsortium),
    entries,
  };
}

function monthEntries(entries: ReturnType<typeof buildExtratoFlow>["entries"]) {
  return entries.filter((entry): entry is ExtratoMonthEntry => entry.kind === "month");
}

function eventEntries(entries: ReturnType<typeof buildExtratoFlow>["entries"]) {
  return entries.filter((entry): entry is ExtratoEventEntry => entry.kind === "event");
}

function comparisonFromFinancing(summary: FinancingSummary): AcquisitionComparison {
  return {
    label: summary.label,
    creditOrFinancedValue: summary.financedValue,
    term: summary.term,
    initialInstallment: summary.initialInstallment,
    finalInstallment: summary.finalInstallment,
    totalPaid: summary.totalPaid,
    totalCost: summary.totalCost,
    differenceVsConsortium: summary.differenceVsConsortium,
    estimatedSavingsVsConsortium: summary.estimatedSavingsVsConsortium,
  };
}

export function buildAquisicaoFlow(proposal: ProposalModelRow, params: ProposalParams): AcquisitionFlow {
  const extrato = buildExtratoFlow(proposal, params);
  const consortiumMonths = monthEntries(extrato.entries);
  const consortiumEvents = eventEntries(extrato.entries);
  const totalInstallmentsPaid = consortiumMonths.reduce((sum, entry) => sum + entry.installment, 0);
  const hasContemplation = onlyNumber(proposal.parcela_contemplacao) > 0;
  const ownBidPaid = hasContemplation ? extrato.summary.ownBidAtContemplation : 0;
  const acquisitionValue =
    extrato.summary.availableAtContemplation ||
    creditoLiquido(proposal) ||
    extrato.summary.liquidCredit ||
    extrato.summary.contractedCredit;
  const consortiumTotalPaid = totalInstallmentsPaid + ownBidPaid;
  const consortiumTotalCost = Math.max(0, consortiumTotalPaid - acquisitionValue);
  const planTerm = Math.max(1, extrato.summary.planTerm || extrato.totalMonths);
  const financingRate = resolveFinancingRate(proposal, params);
  const financingTerm = financingRate.isRealEstate ? 420 : planTerm;
  const sac = buildFinancingSummary("sac", acquisitionValue, financingTerm, financingRate.monthlyRate, consortiumTotalPaid);
  const price = buildFinancingSummary("price", acquisitionValue, financingTerm, financingRate.monthlyRate, consortiumTotalPaid);
  const consortium: AcquisitionFlow["consortium"] = {
    label: "Consórcio",
    creditOrFinancedValue: acquisitionValue,
    term: extrato.totalMonths,
    initialInstallment: consortiumMonths[0]?.installment || 0,
    finalInstallment: consortiumMonths[consortiumMonths.length - 1]?.installment || 0,
    totalPaid: consortiumTotalPaid,
    totalCost: consortiumTotalCost,
    differenceVsConsortium: 0,
    estimatedSavingsVsConsortium: 0,
    ownBidAtContemplation: ownBidPaid,
    embeddedBidAtContemplation: extrato.summary.embeddedBidAtContemplation,
    creditAtContemplation: extrato.summary.creditAtContemplation,
    availableAtContemplation: extrato.summary.availableAtContemplation,
  };

  const chartMonths = Math.max(extrato.totalMonths, sac.term, price.term);
  const consortiumByMonth = new Map(consortiumMonths.map((entry) => [entry.month, entry]));
  const eventsByMonth = new Map<number, ExtratoEventEntry[]>();
  const sacByMonth = new Map(sac.entries.map((entry) => [entry.month, entry]));
  const priceByMonth = new Map(price.entries.map((entry) => [entry.month, entry]));
  const chart: AcquisitionChartPoint[] = [];

  for (const event of consortiumEvents) {
    const current = eventsByMonth.get(event.month) || [];
    current.push(event);
    eventsByMonth.set(event.month, current);
  }

  for (let month = 1; month <= chartMonths; month += 1) {
    const consortiumDetail = consortiumByMonth.get(month);
    const sacDetail = sacByMonth.get(month);
    const priceDetail = priceByMonth.get(month);

    chart.push({
      month,
      consortium: consortiumDetail?.installment || 0,
      sac: sacDetail?.installment || 0,
      price: priceDetail?.installment || 0,
      consortiumDetail,
      consortiumEvents: eventsByMonth.get(month) || [],
      sacDetail,
      priceDetail,
    });
  }

  return {
    consortium,
    sac,
    price,
    comparisons: [consortium, comparisonFromFinancing(sac), comparisonFromFinancing(price)],
    consortiumEntries: consortiumMonths,
    consortiumEvents,
    chart,
    financingRate,
    correction: {
      label: extrato.index.label,
      annualRate: extrato.index.annualRate,
      monthlyRate: extrato.monthlyRate,
      source: extrato.index.source,
    },
  };
}
