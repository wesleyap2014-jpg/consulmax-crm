import {
  buildExtratoFlow,
  onlyNumber,
  type ExtratoMonthEntry,
  type ProposalModelRow,
  type ProposalParams,
} from "./extratoFlow";

export type AlavancagemPatrimonialMode = "tradicional" | "otimizada";
export type OptimizedAssetDestination = "uso" | "aluguel";

export type PatrimonialChartPoint = {
  month: number;
  assetValue: number;
  debtBalance: number;
  traditionalEquity: number;
  optimizedEquity: number;
  traditionalNetIncome: number;
  optimizedNetIncome: number;
  optimizedFundReturn: number;
  optimizedReserve: number;
  installment: number;
  detail?: ExtratoMonthEntry;
};

export type OptimizedPatrimonialProjectionEntry = {
  month: number;
  assetValue: number;
  debtBalance: number;
  installment: number;
  bidPayment: number;
  totalPaidConsortium: number;
  fundOpeningBalance: number;
  fundReturn: number;
  fundEndingBalance: number;
  accumulatedFundReturn: number;
  rentGross: number;
  rentExpenses: number;
  rentNet: number;
  accumulatedRentNet: number;
  monthlyOutflow: number;
  monthlySurplus: number;
  accumulatedExternalOutflow: number;
  cashPurchasePatrimony: number;
  optimizedPatrimony: number;
  patrimonialAdvantage: number;
  detail?: ExtratoMonthEntry;
};

export type OptimizedPatrimonialStrategy = {
  destination: OptimizedAssetDestination;
  availableCapital: number;
  ownBid: number;
  investedCapital: number;
  fundStartMonth: number;
  totalInstallments: number;
  totalPaidConsortium: number;
  fundFinalBalance: number;
  fundAccumulatedReturn: number;
  firstFundReturn: number;
  finalFundReturn: number;
  accumulatedGrossRent: number;
  accumulatedRentExpenses: number;
  accumulatedNetRent: number;
  firstNetRent: number;
  finalNetRent: number;
  finalMonthlyOutflow: number;
  finalMonthlySurplus: number;
  externalCashOutflow: number;
  economicBenefit: number;
  netAssetCost: number;
  cashPurchasePatrimony: number;
  optimizedPatrimony: number;
  patrimonialAdvantage: number;
  capitalPreservedPct: number;
  projection: OptimizedPatrimonialProjectionEntry[];
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
  optimizedStrategy: OptimizedPatrimonialStrategy;
  chart: PatrimonialChartPoint[];
  entries: ExtratoMonthEntry[];
};

export type AlavancagemPatrimonialOptions = {
  availableCapital?: number;
  assetDestination?: OptimizedAssetDestination;
  /** Mantido para propostas abertas em versões anteriores. */
  manualOptimizedCapital?: number;
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

function buildTraditionalScenario({
  monthlyIncomeRate,
  finalAssetValue,
  finalDebtBalance,
  accumulatedIncome,
  totalPaidConsortium,
  firstMonthlyIncome,
  averageMonthlyIncome,
  finalMonthlyIncome,
  postContemplationInstallment,
  cashRelief,
}: {
  monthlyIncomeRate: number;
  finalAssetValue: number;
  finalDebtBalance: number;
  accumulatedIncome: number;
  totalPaidConsortium: number;
  firstMonthlyIncome: number;
  averageMonthlyIncome: number;
  finalMonthlyIncome: number;
  postContemplationInstallment: number;
  cashRelief: number;
}): PatrimonialScenario {
  const finalEquity = Math.max(0, finalAssetValue - finalDebtBalance);
  const wealthGain = finalEquity - totalPaidConsortium;
  const finalCost = Math.max(0, totalPaidConsortium - accumulatedIncome);

  return {
    key: "tradicional",
    label: "Alavancagem Tradicional",
    description: "Compra planejada de um ativo para locação, com aluguel corrigido ajudando a reduzir o desembolso mensal e formando patrimônio.",
    monthlyIncomeRate,
    monthlyIncomeLabel: "Aluguel projetado",
    finalAssetValue,
    finalDebtBalance,
    finalEquity,
    accumulatedIncome,
    accumulatedReserve: 0,
    manualReinvestedCapital: 0,
    totalInvested: totalPaidConsortium,
    totalPaidConsortium,
    finalCost,
    paidOnAssetPct: finalAssetValue > 0 ? finalCost / finalAssetValue : 0,
    roi: totalPaidConsortium > 0 ? wealthGain / totalPaidConsortium : 0,
    leverageMultiple: totalPaidConsortium > 0 ? finalEquity / totalPaidConsortium : 0,
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
  options?: AlavancagemPatrimonialOptions
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
  const expenseRate = normalizeFraction(params.condominio_pct);
  const destination: OptimizedAssetDestination = options?.assetDestination === "aluguel" ? "aluguel" : "uso";
  const creditAtContemplation =
    extrato.summary.creditAtContemplation ||
    extrato.summary.correctedContractedCredit ||
    extrato.summary.contractedCredit;
  const availableAtContemplation =
    extrato.summary.availableAtContemplation ||
    extrato.summary.correctedLiquidCredit ||
    extrato.summary.liquidCredit ||
    creditAtContemplation;
  const ownBidAtContemplation = Math.max(0, extrato.summary.ownBidAtContemplation);
  const explicitAvailableCapital = Math.max(
    0,
    onlyNumber(options?.availableCapital) || onlyNumber(options?.manualOptimizedCapital)
  );
  const availableCapital = explicitAvailableCapital || availableAtContemplation;
  const investedCapital = Math.max(0, availableCapital - ownBidAtContemplation);
  const cashPurchaseRemainder = Math.max(0, availableCapital - availableAtContemplation);
  const investmentUntilContemplation =
    extrato.summary.investmentUntilContemplation ||
    sumInstallmentsUntil(entries, contemplationMonth) + ownBidAtContemplation;
  const totalInstallments = entries.reduce((sum, entry) => sum + entry.installment, 0);
  const totalPaidConsortium = totalInstallments + ownBidAtContemplation;
  const postContemplationInstallment =
    entries.find((entry) => entry.month >= contemplationMonth)?.installment ||
    extrato.summary.postContemplationInstallment ||
    extrato.summary.nextInstallments ||
    extrato.summary.firstInstallment ||
    0;
  const entriesByMonth = new Map(entries.map((entry) => [entry.month, entry]));
  const chart: PatrimonialChartPoint[] = [];
  const optimizedProjection: OptimizedPatrimonialProjectionEntry[] = [];

  let assetValue = 0;
  let traditionalRent = 0;
  let optimizedRent = 0;
  let traditionalAccumulatedIncome = 0;
  let traditionalIncomeSum = 0;
  let traditionalIncomeMonths = 0;
  let traditionalCashRelief = 0;
  let firstTraditionalIncome = 0;
  let finalTraditionalIncome = 0;

  let fundBalance = 0;
  let accumulatedFundReturn = 0;
  let firstFundReturn = 0;
  let finalFundReturn = 0;
  let accumulatedGrossRent = 0;
  let accumulatedRentExpenses = 0;
  let accumulatedNetRent = 0;
  let firstOptimizedRent = 0;
  let finalOptimizedRent = 0;
  let runningInstallments = 0;
  let finalDebtBalance = 0;

  for (let month = 1; month <= totalMonths; month += 1) {
    const detail = entriesByMonth.get(month);
    const installment = detail?.installment || 0;
    const debtBalance = detail?.endingBalance || 0;

    if (month === contemplationMonth) {
      assetValue = availableAtContemplation;
      traditionalRent = assetValue * traditionalIncomeRate;
      optimizedRent = assetValue * traditionalIncomeRate;
    } else if (month > contemplationMonth && assetValue > 0) {
      assetValue += assetValue * extrato.monthlyRate;
      const monthsAfterContemplation = month - contemplationMonth;
      if (rentAnnualRate > 0 && monthsAfterContemplation % 12 === 0) {
        traditionalRent *= 1 + rentAnnualRate;
        optimizedRent *= 1 + rentAnnualRate;
      }
    }

    let traditionalNetIncome = 0;
    if (month >= contemplationMonth && assetValue > 0) {
      traditionalIncomeMonths += 1;
      traditionalNetIncome = Math.max(0, traditionalRent * (1 - expenseRate));
      if (!firstTraditionalIncome) firstTraditionalIncome = traditionalNetIncome;
      traditionalAccumulatedIncome += traditionalNetIncome;
      traditionalIncomeSum += traditionalNetIncome;
      traditionalCashRelief += Math.min(installment, traditionalNetIncome);
      finalTraditionalIncome = traditionalNetIncome;
    }

    const fundOpeningBalance = month === contemplationMonth
      ? investedCapital
      : month > contemplationMonth
        ? fundBalance
        : 0;
    const fundReturn = fundOpeningBalance * cdiMonthlyRate;
    fundBalance = fundOpeningBalance + fundReturn;
    accumulatedFundReturn += fundReturn;
    if (!firstFundReturn && fundReturn > 0) firstFundReturn = fundReturn;
    if (fundReturn > 0) finalFundReturn = fundReturn;

    const hasRentalIncome = destination === "aluguel" && month >= contemplationMonth && assetValue > 0;
    const rentGross = hasRentalIncome ? optimizedRent : 0;
    const rentExpenses = rentGross * expenseRate;
    const rentNet = Math.max(0, rentGross - rentExpenses);
    accumulatedGrossRent += rentGross;
    accumulatedRentExpenses += rentExpenses;
    accumulatedNetRent += rentNet;
    if (!firstOptimizedRent && rentNet > 0) firstOptimizedRent = rentNet;
    if (rentNet > 0) finalOptimizedRent = rentNet;

    runningInstallments += installment;
    const bidPayment = month === contemplationMonth ? ownBidAtContemplation : 0;
    const totalPaidToDate = runningInstallments + (month >= contemplationMonth ? ownBidAtContemplation : 0);
    const accumulatedExternalOutflow = totalPaidToDate - accumulatedNetRent;
    const monthlyOutflow = Math.max(0, installment + bidPayment - rentNet);
    const monthlySurplus = Math.max(0, rentNet - installment - bidPayment);
    const cashPurchasePatrimony = month >= contemplationMonth ? assetValue + cashPurchaseRemainder : 0;
    const optimizedPatrimony = month >= contemplationMonth
      ? Math.max(0, assetValue - debtBalance + fundBalance)
      : Math.max(0, fundBalance);
    const patrimonialAdvantage = optimizedPatrimony - cashPurchasePatrimony;

    finalDebtBalance = debtBalance;

    optimizedProjection.push({
      month,
      assetValue,
      debtBalance,
      installment,
      bidPayment,
      totalPaidConsortium: totalPaidToDate,
      fundOpeningBalance,
      fundReturn,
      fundEndingBalance: fundBalance,
      accumulatedFundReturn,
      rentGross,
      rentExpenses,
      rentNet,
      accumulatedRentNet: accumulatedNetRent,
      monthlyOutflow,
      monthlySurplus,
      accumulatedExternalOutflow,
      cashPurchasePatrimony,
      optimizedPatrimony,
      patrimonialAdvantage,
      detail,
    });

    chart.push({
      month,
      assetValue,
      debtBalance,
      traditionalEquity: month < contemplationMonth
        ? detail?.payments || 0
        : Math.max(0, assetValue - debtBalance),
      optimizedEquity: optimizedPatrimony,
      traditionalNetIncome,
      optimizedNetIncome: rentNet,
      optimizedFundReturn: fundReturn,
      optimizedReserve: fundBalance,
      installment,
      detail,
    });
  }

  const finalAssetValue = chart[chart.length - 1]?.assetValue || 0;
  const averageTraditionalIncome = traditionalIncomeMonths > 0
    ? traditionalIncomeSum / traditionalIncomeMonths
    : 0;
  const traditional = buildTraditionalScenario({
    monthlyIncomeRate: traditionalIncomeRate,
    finalAssetValue,
    finalDebtBalance,
    accumulatedIncome: traditionalAccumulatedIncome,
    totalPaidConsortium,
    firstMonthlyIncome: firstTraditionalIncome,
    averageMonthlyIncome: averageTraditionalIncome,
    finalMonthlyIncome: finalTraditionalIncome,
    postContemplationInstallment,
    cashRelief: traditionalCashRelief,
  });

  const cashPurchasePatrimony = finalAssetValue + cashPurchaseRemainder;
  const optimizedPatrimony = Math.max(0, finalAssetValue - finalDebtBalance + fundBalance);
  const patrimonialAdvantage = optimizedPatrimony - cashPurchasePatrimony;
  const economicBenefit = accumulatedFundReturn + accumulatedNetRent;
  const netAssetCost = totalPaidConsortium - economicBenefit;
  const finalProjection = optimizedProjection[optimizedProjection.length - 1];
  const optimizedStrategy: OptimizedPatrimonialStrategy = {
    destination,
    availableCapital,
    ownBid: ownBidAtContemplation,
    investedCapital,
    fundStartMonth: contemplationMonth,
    totalInstallments,
    totalPaidConsortium,
    fundFinalBalance: fundBalance,
    fundAccumulatedReturn: accumulatedFundReturn,
    firstFundReturn,
    finalFundReturn,
    accumulatedGrossRent,
    accumulatedRentExpenses,
    accumulatedNetRent,
    firstNetRent: firstOptimizedRent,
    finalNetRent: finalOptimizedRent,
    finalMonthlyOutflow: finalProjection?.monthlyOutflow || 0,
    finalMonthlySurplus: finalProjection?.monthlySurplus || 0,
    externalCashOutflow: totalPaidConsortium - accumulatedNetRent,
    economicBenefit,
    netAssetCost,
    cashPurchasePatrimony,
    optimizedPatrimony,
    patrimonialAdvantage,
    capitalPreservedPct: availableCapital > 0 ? investedCapital / availableCapital : 0,
    projection: optimizedProjection,
  };

  const optimized: PatrimonialScenario = {
    key: "otimizada",
    label: "Alavancagem Otimizada",
    description: destination === "aluguel"
      ? "Compra o bem com o crédito do consórcio, preserva parte do capital no Fundo DI e usa a renda líquida do aluguel para reduzir o desembolso da operação."
      : "Compra o bem com o crédito do consórcio e preserva no Fundo DI a parcela do capital que não foi utilizada no lance.",
    monthlyIncomeRate: cdiMonthlyRate,
    monthlyIncomeLabel: "Fundo DI",
    finalAssetValue,
    finalDebtBalance,
    finalEquity: optimizedPatrimony,
    accumulatedIncome: accumulatedNetRent,
    accumulatedReserve: fundBalance,
    manualReinvestedCapital: investedCapital,
    totalInvested: totalPaidConsortium + investedCapital,
    totalPaidConsortium,
    finalCost: netAssetCost,
    paidOnAssetPct: finalAssetValue > 0 ? netAssetCost / finalAssetValue : 0,
    roi: investedCapital > 0 ? accumulatedFundReturn / investedCapital : 0,
    leverageMultiple: availableCapital > 0 ? optimizedPatrimony / availableCapital : 0,
    averageMonthlyIncome: accumulatedNetRent / Math.max(1, totalMonths - contemplationMonth + 1),
    firstMonthlyIncome: firstOptimizedRent,
    finalMonthlyIncome: finalOptimizedRent,
    postContemplationInstallment,
    finalCashGap: (finalProjection?.installment || 0) - finalOptimizedRent,
    cashRelief: accumulatedNetRent,
  };

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
      optimizedRate: traditionalIncomeRate,
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
      ownBidAtContemplation,
      postContemplationInstallment,
      postContemplationTerm: Math.max(0, extrato.summary.planTerm - contemplationMonth),
    },
    traditional,
    optimized,
    optimizedStrategy,
    chart,
    entries,
  };
}
