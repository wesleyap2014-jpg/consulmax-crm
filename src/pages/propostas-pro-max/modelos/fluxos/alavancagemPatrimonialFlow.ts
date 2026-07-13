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
  manualReinvestedCapital: number;
  totalInvested: number;
  totalPaidConsortium: number;
  finalCost: number;
  paidOnAssetPct: number;
  roi: number;
  leverageMultiple: number;
  averageMonthlyIncome: number;
  firstMonthlyIncome: number;
  finalMonthlyIncome: number;
  postContemplationInstallment: number;
  finalCashGap: number;
  cashRelief: number;
};

export type AlavancagemPatrimonialFlow = {
  correction: {
    label: string;
    annualRate: number;
    monthlyRate: number;
    source: string;
  };
  rentCorrection: {
    annualRate: number;
    monthlyRate: number;
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
    postContemplationInstallment: number;
    postContemplationTerm: number;
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

function getManualOptimizedCapital(params: ProposalParams) {
  const raw =
    (params as any).patrimonial_capital_reinvestido_otimizada ??
    (params as any).capital_reinvestido_otimizada ??
    (params as any).patrimonial_capital_reinvestido ??
    0;
  return Math.max(0, onlyNumber(raw));
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
  manualReinvestedCapital,
  totalPaidConsortium,
  firstMonthlyIncome,
  averageMonthlyIncome,
  finalMonthlyIncome,
  postContemplationInstallment,
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
  manualReinvestedCapital: number;
  totalPaidConsortium: number;
  firstMonthlyIncome: number;
  averageMonthlyIncome: number;
  finalMonthlyIncome: number;
  postContemplationInstallment: number;
  cashRelief: number;
}): PatrimonialScenario {
  const totalInvested = totalPaidConsortium + manualReinvestedCapital;
  const finalEquity = Math.max(0, finalAssetValue - finalDebtBalance + accumulatedReserve);
  const wealthGain = finalEquity - totalInvested;
  const finalCost = Math.max(0, totalPaidConsortium - accumulatedIncome);

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
    manualReinvestedCapital,
    totalInvested,
    totalPaidConsortium,
    finalCost,
    paidOnAssetPct: finalAssetValue > 0 ? finalCost / finalAssetValue : 0,
    roi: totalInvested > 0 ? wealthGain / totalInvested : 0,
    leverageMultiple: totalInvested > 0 ? finalEquity / totalInvested : 0,
    averageMonthlyIncome,
    firstMonthlyIncome,
    finalMonthlyIncome,
    postContemplationInstallment,
    finalCashGap: postContemplationInstallment - finalMonthlyIncome,
    cashRelief,
  };
}

export function buildAlavancagemPatrimonialFlow(
  proposal: ProposalModelRow,
  params: ProposalParams,
  options?: { manualOptimizedCapital?: number }
): AlavancagemPatrimonialFlow {
  const extrato = buildExtratoFlow(proposal, params);
  const entries = monthEntries(extrato.entries);
  const totalMonths = Math.max(1, extrato.totalMonths);
  const rawContemplationMonth = Math.round(onlyNumber(proposal.parcela_contemplacao));
  const contemplationMonth = Math.min(totalMonths, Math.max(1, rawContemplationMonth || 1));
  const cdiAnnualRate = normalizeFraction(params.cdi_anual);
  const cdiMonthlyRate = cdiAnnualRate > 0 ? Math.pow(1 + cdiAnnualRate, 1 / 12) - 1 : 0;
  const rentAnnualRate = normalizeFraction(params.igpm12m);
  const rentMonthlyRate = rentAnnualRate > 0 ? Math.pow(1 + rentAnnualRate, 1 / 12) - 1 : 0;
  const traditionalIncomeRate = normalizeFraction(params.aluguel_pct);
  const optimizedIncomeRate = normalizeFraction(params.airbnb_pct) || traditionalIncomeRate;
  const expenseRate = normalizeFraction(params.condominio_pct);
  const manualOptimizedCapital = Math.max(0, onlyNumber(options?.manualOptimizedCapital));
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
  const totalPaidConsortium = totalInstallments + extrato.summary.ownBidAtContemplation;
  const postContemplationInstallment =
    entries.find((entry) => entry.month >= contemplationMonth)?.installment ||
    extrato.summary.postContemplationInstallment ||
    extrato.summary.nextInstallments ||
    extrato.summary.firstInstallment ||
    0;
  const entriesByMonth = new Map(entries.map((entry) => [entry.month, entry]));
  const chart: PatrimonialChartPoint[] = [];

  let assetValue = 0;
  let traditionalRent = 0;
  let optimizedRent = 0;
  let traditionalAccumulatedIncome = 0;
  let optimizedAccumulatedIncome = 0;
  let optimizedReserve = 0;
  let manualReserveStarted = false;
  let traditionalIncomeSum = 0;
  let optimizedIncomeSum = 0;
  let incomeMonths = 0;
  let traditionalCashRelief = 0;
  let optimizedCashRelief = 0;
  let finalDebtBalance = 0;
  let firstTraditionalIncome = 0;
  let firstOptimizedIncome = 0;
  let finalTraditionalIncome = 0;
  let finalOptimizedIncome = 0;

  for (let month = 1; month <= totalMonths; month += 1) {
    const detail = entriesByMonth.get(month);
    const installment = detail?.installment || 0;
    const debtBalance = detail?.endingBalance || 0;

    if (month === contemplationMonth) {
      assetValue = availableAtContemplation;
      traditionalRent = assetValue * traditionalIncomeRate;
      optimizedRent = assetValue * optimizedIncomeRate;
      optimizedReserve = manualOptimizedCapital;
      manualReserveStarted = true;
    } else if (month > contemplationMonth && assetValue > 0) {
      assetValue += assetValue * extrato.monthlyRate;
      const monthsAfterContemplation = month - contemplationMonth;
      if (rentAnnualRate > 0 && monthsAfterContemplation > 0 && monthsAfterContemplation % 12 === 0) {
        traditionalRent *= 1 + rentAnnualRate;
        optimizedRent *= 1 + rentAnnualRate;
      }
    }

    if (manualReserveStarted && manualOptimizedCapital > 0) {
      optimizedReserve *= 1 + cdiMonthlyRate;
    }

    let traditionalNetIncome = 0;
    let optimizedNetIncome = 0;

    if (month >= contemplationMonth && assetValue > 0) {
      incomeMonths += 1;
      traditionalNetIncome = Math.max(0, traditionalRent * (1 - expenseRate));
      optimizedNetIncome = Math.max(0, optimizedRent * (1 - expenseRate));

      if (!firstTraditionalIncome) firstTraditionalIncome = traditionalNetIncome;
      if (!firstOptimizedIncome) firstOptimizedIncome = optimizedNetIncome;

      traditionalAccumulatedIncome += traditionalNetIncome;
      optimizedAccumulatedIncome += optimizedNetIncome;
      traditionalIncomeSum += traditionalNetIncome;
      optimizedIncomeSum += optimizedNetIncome;
      traditionalCashRelief += Math.min(installment, traditionalNetIncome);
      optimizedCashRelief += Math.min(installment, optimizedNetIncome);
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
    description: "Compra planejada de um ativo para locacao, com aluguel corrigido ajudando a reduzir o desembolso mensal e formando patrimonio.",
    monthlyIncomeRate: traditionalIncomeRate,
    monthlyIncomeLabel: "Aluguel projetado",
    finalAssetValue,
    finalDebtBalance,
    accumulatedIncome: traditionalAccumulatedIncome,
    accumulatedReserve: 0,
    manualReinvestedCapital: 0,
    totalPaidConsortium,
    firstMonthlyIncome: firstTraditionalIncome,
    averageMonthlyIncome: averageTraditionalIncome,
    finalMonthlyIncome: finalTraditionalIncome,
    postContemplationInstallment,
    cashRelief: traditionalCashRelief,
  });

  const optimized = buildScenario({
    key: "otimizada",
    label: "Alavancagem Otimizada",
    description: "Combina renda otimizada do ativo com capital reinvestido informado na tela, projetando reserva financeira e patrimonio liquido ampliado.",
    monthlyIncomeRate: optimizedIncomeRate,
    monthlyIncomeLabel: "Renda otimizada",
    finalAssetValue,
    finalDebtBalance,
    accumulatedIncome: optimizedAccumulatedIncome,
    accumulatedReserve: optimizedReserve,
    manualReinvestedCapital: manualOptimizedCapital,
    totalPaidConsortium,
    firstMonthlyIncome: firstOptimizedIncome,
    averageMonthlyIncome: averageOptimizedIncome,
    finalMonthlyIncome: finalOptimizedIncome,
    postContemplationInstallment,
    cashRelief: optimizedCashRelief,
  });

  return {
    correction: {
      label: extrato.index.label,
      annualRate: extrato.index.annualRate,
      monthlyRate: extrato.monthlyRate,
      source: extrato.index.source,
    },
    rentCorrection: {
      annualRate: rentAnnualRate,
      monthlyRate: rentMonthlyRate,
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
      postContemplationInstallment,
      postContemplationTerm: Math.max(0, extrato.summary.planTerm - contemplationMonth),
    },
    traditional,
    optimized,
    chart,
    entries,
  };
}
