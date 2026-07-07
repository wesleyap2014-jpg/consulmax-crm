import {
  buildExtratoFlow,
  onlyNumber,
  type ExtratoMonthEntry,
  type ProposalModelRow,
  type ProposalParams,
} from "./extratoFlow";

export type AlavancagemPatrimonialMode = "tradicional" | "otimizada";

export type PatrimonialChartPoint = {
  month: number;
  assetValue: number;
  debtBalance: number;
  traditionalEquity: number;
  optimizedEquity: number;
  traditionalNetIncome: number;
  optimizedNetIncome: number;
  optimizedReserve: number;
  installment: number;
  detail?: ExtratoMonthEntry;
};

export type PatrimonialScenario = {
  key: AlavancagemPatrimonialMode;
  label: string;
  description: string;
  monthlyIncomeRate: number;
  monthlyIncomeLabel: string;
  finalAssetValue: number;
  finalDebtBalance: number;
  finalEquity: number;
  accumulatedIncome: number;
  accumulatedReserve: number;
  totalInvested: number;
  roi: number;
  leverageMultiple: number;
  averageMonthlyIncome: number;
  finalMonthlyIncome: number;
  cashRelief: number;
};

export type AlavancagemPatrimonialFlow = {
  correction: {
    label: string;
    annualRate: number;
    monthlyRate: number;
    source: string;
  };
  cdi: {
    annualRate: number;
    monthlyRate: number;
  };
  income: {
    traditionalRate: number;
    optimizedRate: number;
    expenseRate: number;
  };
  summary: {
    contractedCredit: number;
    creditAtContemplation: number;
    availableAtContemplation: number;
    contemplationMonth: number;
    planTerm: number;
    investmentUntilContemplation: number;
    embeddedBidAtContemplation: number;
    ownBidAtContemplation: number;
  };
  traditional: PatrimonialScenario;
  optimized: PatrimonialScenario;
  chart: PatrimonialChartPoint[];
  entries: ExtratoMonthEntry[];
};

function normalizeFraction(value: unknown) {
  const parsed = onlyNumber(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function monthEntries(entries: ReturnType<typeof buildExtratoFlow>["entries"]) {
  return entries.filter((entry): entry is ExtratoMonthEntry => entry.kind === "month");
}

function sumInstallmentsUntil(entries: ExtratoMonthEntry[], month: number) {
  return entries
    .filter((entry) => entry.month <= month)
    .reduce((sum, entry) => sum + entry.installment, 0);
}

function buildScenario({
  key,
  label,
  description,
  monthlyIncomeRate,
  monthlyIncomeLabel,
  finalAssetValue,
  finalDebtBalance,
  accumulatedIncome,
  accumulatedReserve,
  totalInvested,
  averageMonthlyIncome,
  finalMonthlyIncome,
  cashRelief,
}: {
  key: AlavancagemPatrimonialMode;
  label: string;
  description: string;
  monthlyIncomeRate: number;
  monthlyIncomeLabel: string;
  finalAssetValue: number;
  finalDebtBalance: number;
  accumulatedIncome: number;
  accumulatedReserve: number;
  totalInvested: number;
  averageMonthlyIncome: number;
  finalMonthlyIncome: number;
  cashRelief: number;
}): PatrimonialScenario {
  const finalEquity = Math.max(0, finalAssetValue - finalDebtBalance + accumulatedReserve);
  const wealthGain = Math.max(0, finalEquity - totalInvested);

  return {
    key,
    label,
    description,
    monthlyIncomeRate,
    monthlyIncomeLabel,
    finalAssetValue,
    finalDebtBalance,
    finalEquity,
    accumulatedIncome,
    accumulatedReserve,
    totalInvested,
    roi: totalInvested > 0 ? wealthGain / totalInvested : 0,
    leverageMultiple: totalInvested > 0 ? finalEquity / totalInvested : 0,
    averageMonthlyIncome,
    finalMonthlyIncome,
    cashRelief,
  };
}

export function buildAlavancagemPatrimonialFlow(
  proposal: ProposalModelRow,
  params: ProposalParams
): AlavancagemPatrimonialFlow {
  const extrato = buildExtratoFlow(proposal, params);
  const entries = monthEntries(extrato.entries);
  const totalMonths = Math.max(1, extrato.totalMonths);
  const rawContemplationMonth = Math.round(onlyNumber(proposal.parcela_contemplacao));
  const contemplationMonth = Math.min(totalMonths, Math.max(1, rawContemplationMonth || 1));
  const cdiAnnualRate = normalizeFraction(params.cdi_anual);
  const cdiMonthlyRate = cdiAnnualRate > 0 ? Math.pow(1 + cdiAnnualRate, 1 / 12) - 1 : 0;
  const traditionalIncomeRate = normalizeFraction(params.aluguel_pct);
  const optimizedIncomeRate = normalizeFraction(params.airbnb_pct) || traditionalIncomeRate;
  const expenseRate = normalizeFraction(params.condominio_pct);
  const creditAtContemplation =
    extrato.summary.creditAtContemplation ||
    extrato.summary.correctedContractedCredit ||
    extrato.summary.contractedCredit;
  const availableAtContemplation =
    extrato.summary.availableAtContemplation ||
    extrato.summary.correctedLiquidCredit ||
    extrato.summary.liquidCredit ||
    creditAtContemplation;
  const investmentUntilContemplation =
    extrato.summary.investmentUntilContemplation ||
    sumInstallmentsUntil(entries, contemplationMonth) + extrato.summary.ownBidAtContemplation;
  const totalInstallments = entries.reduce((sum, entry) => sum + entry.installment, 0);
  const totalInvested = totalInstallments + extrato.summary.ownBidAtContemplation;
  const entriesByMonth = new Map(entries.map((entry) => [entry.month, entry]));
  const chart: PatrimonialChartPoint[] = [];

  let assetValue = 0;
  let traditionalAccumulatedIncome = 0;
  let optimizedAccumulatedIncome = 0;
  let optimizedReserve = 0;
  let traditionalIncomeSum = 0;
  let optimizedIncomeSum = 0;
  let incomeMonths = 0;
  let traditionalCashRelief = 0;
  let optimizedCashRelief = 0;
  let finalDebtBalance = 0;
  let finalTraditionalIncome = 0;
  let finalOptimizedIncome = 0;

  for (let month = 1; month <= totalMonths; month += 1) {
    const detail = entriesByMonth.get(month);
    const installment = detail?.installment || 0;
    const debtBalance = detail?.endingBalance || 0;

    if (month === contemplationMonth) assetValue = availableAtContemplation;
    if (month > contemplationMonth && assetValue > 0) {
      assetValue += assetValue * extrato.monthlyRate;
    }

    let traditionalNetIncome = 0;
    let optimizedNetIncome = 0;

    if (month >= contemplationMonth && assetValue > 0) {
      incomeMonths += 1;
      const traditionalGrossIncome = assetValue * traditionalIncomeRate;
      const optimizedGrossIncome = assetValue * optimizedIncomeRate;

      traditionalNetIncome = Math.max(0, traditionalGrossIncome * (1 - expenseRate));
      optimizedNetIncome = Math.max(0, optimizedGrossIncome * (1 - expenseRate));

      traditionalAccumulatedIncome += traditionalNetIncome;
      optimizedAccumulatedIncome += optimizedNetIncome;
      traditionalIncomeSum += traditionalNetIncome;
      optimizedIncomeSum += optimizedNetIncome;
      traditionalCashRelief += Math.min(installment, traditionalNetIncome);
      optimizedCashRelief += Math.min(installment, optimizedNetIncome);
      optimizedReserve = optimizedReserve * (1 + cdiMonthlyRate) + optimizedNetIncome;
      finalTraditionalIncome = traditionalNetIncome;
      finalOptimizedIncome = optimizedNetIncome;
    }

    finalDebtBalance = debtBalance;

    chart.push({
      month,
      assetValue,
      debtBalance,
      traditionalEquity: month < contemplationMonth
        ? detail?.payments || 0
        : Math.max(0, assetValue - debtBalance),
      optimizedEquity: month < contemplationMonth
        ? detail?.payments || 0
        : Math.max(0, assetValue - debtBalance + optimizedReserve),
      traditionalNetIncome,
      optimizedNetIncome,
      optimizedReserve,
      installment,
      detail,
    });
  }

  const finalAssetValue = chart[chart.length - 1]?.assetValue || 0;
  const averageTraditionalIncome = incomeMonths > 0 ? traditionalIncomeSum / incomeMonths : 0;
  const averageOptimizedIncome = incomeMonths > 0 ? optimizedIncomeSum / incomeMonths : 0;

  const traditional = buildScenario({
    key: "tradicional",
    label: "Alavancagem Tradicional",
    description: "Forma patrimônio com a carta contemplada e considera renda conservadora do bem para aliviar o fluxo mensal.",
    monthlyIncomeRate: traditionalIncomeRate,
    monthlyIncomeLabel: "Aluguel projetado",
    finalAssetValue,
    finalDebtBalance,
    accumulatedIncome: traditionalAccumulatedIncome,
    accumulatedReserve: 0,
    totalInvested,
    averageMonthlyIncome: averageTraditionalIncome,
    finalMonthlyIncome: finalTraditionalIncome,
    cashRelief: traditionalCashRelief,
  });

  const optimized = buildScenario({
    key: "otimizada",
    label: "Alavancagem Otimizada",
    description: "Projeta renda otimizada do bem e reinveste o excedente a CDI para ampliar o patrimônio líquido.",
    monthlyIncomeRate: optimizedIncomeRate,
    monthlyIncomeLabel: "Renda otimizada",
    finalAssetValue,
    finalDebtBalance,
    accumulatedIncome: optimizedAccumulatedIncome,
    accumulatedReserve: optimizedReserve,
    totalInvested,
    averageMonthlyIncome: averageOptimizedIncome,
    finalMonthlyIncome: finalOptimizedIncome,
    cashRelief: optimizedCashRelief,
  });

  return {
    correction: {
      label: extrato.index.label,
      annualRate: extrato.index.annualRate,
      monthlyRate: extrato.monthlyRate,
      source: extrato.index.source,
    },
    cdi: {
      annualRate: cdiAnnualRate,
      monthlyRate: cdiMonthlyRate,
    },
    income: {
      traditionalRate: traditionalIncomeRate,
      optimizedRate: optimizedIncomeRate,
      expenseRate,
    },
    summary: {
      contractedCredit: extrato.summary.contractedCredit,
      creditAtContemplation,
      availableAtContemplation,
      contemplationMonth,
      planTerm: extrato.summary.planTerm,
      investmentUntilContemplation,
      embeddedBidAtContemplation: extrato.summary.embeddedBidAtContemplation,
      ownBidAtContemplation: extrato.summary.ownBidAtContemplation,
    },
    traditional,
    optimized,
    chart,
    entries,
  };
}
