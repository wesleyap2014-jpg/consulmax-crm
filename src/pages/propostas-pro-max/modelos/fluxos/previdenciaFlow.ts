import {
  buildExtratoFlow,
  creditoLiquido,
  onlyNumber,
  type ExtratoMonthEntry,
  type ProposalModelRow,
  type ProposalParams,
} from "./extratoFlow";

export type PrevidenciaChartPoint = {
  month: number;
  consortiumInstallment: number;
  monthlyIncome: number;
  accumulatedIncome: number;
  consortiumCapital: number;
  grossBalance: number;
  netBalance: number;
  cdiNetBalance: number;
  cdiGrossIncome: number;
  cdiTax: number;
  consortiumDetail?: ExtratoMonthEntry;
};

export type PrevidenciaFlow = {
  cdi: {
    annualRate: number;
    monthlyRate: number;
    label: string;
  };
  tax: {
    rate: number;
    amount: number;
    grossUpIncome: number;
    grossUpCapital: number;
    grossUpMonthlyRate: number;
  };
  summary: {
    capitalAtContemplation: number;
    contemplationMonth: number;
    remainingMonths: number;
    totalInvested: number;
    finalGrossBalance: number;
    finalNetBalance: number;
    grossIncome: number;
    netIncome: number;
    monthlyIrr: number;
    annualIrr: number;
    roi: number;
    monthlyReturn: number;
    cdiPercent: number;
  };
  cdiComparison: {
    investedPrincipal: number;
    grossBalance: number;
    netBalance: number;
    grossIncome: number;
    tax: number;
    netIncome: number;
  };
  consortiumEntries: ExtratoMonthEntry[];
  chart: PrevidenciaChartPoint[];
};

type InvestmentLot = {
  month: number;
  principal: number;
  balance: number;
};

function normalizeFraction(value: unknown) {
  const parsed = onlyNumber(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function taxRateByMonths(months: number) {
  const days = months * 30;
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}

function monthEntries(entries: ReturnType<typeof buildExtratoFlow>["entries"]) {
  return entries.filter((entry): entry is ExtratoMonthEntry => entry.kind === "month");
}

function calculateLotsNet(lots: InvestmentLot[], finalMonth: number) {
  let principal = 0;
  let grossBalance = 0;
  let grossIncome = 0;
  let tax = 0;

  for (const lot of lots) {
    const income = Math.max(0, lot.balance - lot.principal);
    const ageMonths = Math.max(1, finalMonth - lot.month + 1);
    const lotTax = income * taxRateByMonths(ageMonths);

    principal += lot.principal;
    grossBalance += lot.balance;
    grossIncome += income;
    tax += lotTax;
  }

  return {
    principal,
    grossBalance,
    grossIncome,
    tax,
    netIncome: Math.max(0, grossIncome - tax),
    netBalance: Math.max(0, grossBalance - tax),
  };
}

function calculateIrr(cashFlows: number[]) {
  const hasPositive = cashFlows.some((value) => value > 0);
  const hasNegative = cashFlows.some((value) => value < 0);
  if (!hasPositive || !hasNegative) return 0;

  function npv(rate: number) {
    return cashFlows.reduce((sum, cashFlow, index) => sum + cashFlow / Math.pow(1 + rate, index), 0);
  }

  let low = -0.95;
  let high = 1;
  let lowValue = npv(low);
  let highValue = npv(high);

  for (let attempts = 0; attempts < 12 && lowValue * highValue > 0; attempts += 1) {
    high *= 2;
    highValue = npv(high);
  }

  if (lowValue * highValue > 0) return 0;

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const value = npv(mid);

    if (Math.abs(value) < 0.0001) return mid;
    if (lowValue * value < 0) {
      high = mid;
      highValue = value;
    } else {
      low = mid;
      lowValue = value;
    }
  }

  return (low + high) / 2;
}

export function buildPrevidenciaFlow(proposal: ProposalModelRow, params: ProposalParams): PrevidenciaFlow {
  const extrato = buildExtratoFlow(proposal, params);
  const consortiumEntries = monthEntries(extrato.entries);
  const totalMonths = Math.max(1, extrato.totalMonths);
  const cdiAnnualRate = normalizeFraction(params.cdi_anual);
  const cdiMonthlyRate = cdiAnnualRate > 0 ? Math.pow(1 + cdiAnnualRate, 1 / 12) - 1 : 0;
  const rawContemplationMonth = Math.round(onlyNumber(proposal.parcela_contemplacao));
  const contemplationMonth = Math.min(totalMonths, Math.max(1, rawContemplationMonth || 1));
  const remainingMonths = Math.max(0, totalMonths - contemplationMonth);
  const capitalAtContemplation =
    extrato.summary.availableAtContemplation ||
    creditoLiquido(proposal) ||
    extrato.summary.liquidCredit ||
    extrato.summary.contractedCredit;
  const hasContemplation = rawContemplationMonth > 0;
  const ownBidPaid = hasContemplation ? extrato.summary.ownBidAtContemplation : 0;
  const totalInstallments = consortiumEntries.reduce((sum, entry) => sum + entry.installment, 0);
  const totalInvested = totalInstallments + ownBidPaid;
  const consortiumByMonth = new Map(consortiumEntries.map((entry) => [entry.month, entry]));
  const monthlyInvestingLots: InvestmentLot[] = [];
  const cashFlows = Array.from({ length: totalMonths + 1 }, () => 0);
  const chart: PrevidenciaChartPoint[] = [];

  let previdenciaBalance = 0;
  let accumulatedIncome = 0;
  let finalGrossBalance = 0;
  let finalNetBalance = 0;

  for (let month = 1; month <= totalMonths; month += 1) {
    const consortiumDetail = consortiumByMonth.get(month);
    const installment = consortiumDetail?.installment || 0;
    const ownBid = month === contemplationMonth ? ownBidPaid : 0;
    const monthlyContribution = installment + ownBid;

    cashFlows[month] -= monthlyContribution;

    if (monthlyContribution > 0) {
      monthlyInvestingLots.push({
        month,
        principal: monthlyContribution,
        balance: monthlyContribution,
      });
    }

    for (const lot of monthlyInvestingLots) {
      lot.balance += lot.balance * cdiMonthlyRate;
    }

    if (month === contemplationMonth) {
      previdenciaBalance = capitalAtContemplation;
    }

    let monthlyIncome = 0;
    if (month > contemplationMonth && previdenciaBalance > 0) {
      monthlyIncome = previdenciaBalance * cdiMonthlyRate;
      previdenciaBalance += monthlyIncome;
      accumulatedIncome += monthlyIncome;
    }

    const cdiComparison = calculateLotsNet(monthlyInvestingLots, month);

    finalGrossBalance = previdenciaBalance;
    finalNetBalance = previdenciaBalance;
    const consortiumCapital =
      month < contemplationMonth
        ? consortiumDetail?.payments || 0
        : capitalAtContemplation + accumulatedIncome;

    chart.push({
      month,
      consortiumInstallment: installment,
      monthlyIncome,
      accumulatedIncome,
      consortiumCapital,
      grossBalance: previdenciaBalance,
      netBalance: finalNetBalance,
      cdiNetBalance: cdiComparison.netBalance,
      cdiGrossIncome: cdiComparison.grossIncome,
      cdiTax: cdiComparison.tax,
      consortiumDetail,
    });
  }

  const finalTaxRate = taxRateByMonths(Math.max(1, remainingMonths));
  const grossIncome = Math.max(0, finalGrossBalance - capitalAtContemplation);
  const netIncome = grossIncome;
  finalNetBalance = finalGrossBalance;
  cashFlows[totalMonths] += finalNetBalance;

  const monthlyIrr = calculateIrr(cashFlows);
  const roi = totalInvested > 0 ? netIncome / totalInvested : 0;
  const monthlyReturn = totalMonths > 0 ? Math.pow(1 + roi, 1 / totalMonths) - 1 : 0;
  const grossUpIncome = finalTaxRate < 1 ? netIncome / (1 - finalTaxRate) : netIncome;
  const taxAmount = Math.max(0, grossUpIncome - netIncome);
  const grossUpCapital = capitalAtContemplation + grossUpIncome;
  const grossUpMonthlyRate =
    capitalAtContemplation > 0 && totalMonths > 0
      ? Math.pow(grossUpCapital / capitalAtContemplation, 1 / totalMonths) - 1
      : 0;
  const cdiPercent = cdiMonthlyRate > 0 ? grossUpMonthlyRate / cdiMonthlyRate : 0;
  const cdiComparison = calculateLotsNet(monthlyInvestingLots, totalMonths);

  return {
    cdi: {
      annualRate: cdiAnnualRate,
      monthlyRate: cdiMonthlyRate,
      label: "100% do CDI",
    },
    tax: {
      rate: finalTaxRate,
      amount: taxAmount,
      grossUpIncome,
      grossUpCapital,
      grossUpMonthlyRate,
    },
    summary: {
      capitalAtContemplation,
      contemplationMonth,
      remainingMonths,
      totalInvested,
      finalGrossBalance,
      finalNetBalance,
      grossIncome,
      netIncome,
      monthlyIrr,
      annualIrr: Math.pow(1 + monthlyReturn, 12) - 1,
      roi,
      monthlyReturn,
      cdiPercent,
    },
    cdiComparison,
    consortiumEntries,
    chart,
  };
}
