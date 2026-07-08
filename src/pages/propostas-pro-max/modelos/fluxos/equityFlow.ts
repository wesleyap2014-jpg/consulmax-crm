import {
  buildExtratoFlow,
  creditoLiquido,
  onlyNumber,
  type ExtratoEventEntry,
  type ExtratoMonthEntry,
  type ProposalModelRow,
  type ProposalParams,
} from "./extratoFlow";

export type EquityMode = "direto" | "cadenciado";

export type EquityCompetitor = {
  key: "home_equity" | "pronaf" | "pronamp" | "demais";
  label: string;
  annualRate: number;
  monthlyRate: number;
  monthlyPayment: number;
  totalPaid: number;
  totalInterest: number;
  differenceVsConsortium: number;
};

export type EquityFlowStep = {
  label: string;
  value: number;
  helper: string;
  tone: "navy" | "ruby" | "gold";
};

export type EquityInstallmentDetailEntry = {
  month: number;
  credit: number;
  initialBalance: number;
  installment: number;
  payments: number;
  endingBalance: number;
  eventText: string;
};

export type EquityDirectScenario = {
  key: "sorteio" | "lance";
  label: string;
  description: string;
  creditReleased: number;
  installmentsPaidUntilContemplation: number;
  bidPaid: number;
  totalInvested: number;
  leverageAmount: number;
  leverageMultiplier: number;
  debtAfterContemplation: number;
  averageTerm: number;
  effectiveBidRate: number;
  simpleCetMonthly: number;
  simpleCetAnnual: number;
  compoundCetMonthly: number;
  compoundCetAnnual: number;
  totalCost: number;
  firstInstallment: number;
  postContemplationInstallment: number;
  contemplationMonth: number;
  embeddedBidUsed: number;
  installmentDetails: EquityInstallmentDetailEntry[];
};

export type EquityCashFlowEntry = {
  month: number;
  investmentIncome: number;
  assetIncome: number;
  installment: number;
  netCashFlow: number;
  accumulatedCashFlow: number;
};

export type EquityInstallmentFlowEntry = {
  month: number;
  phase: "antes_contemplacao" | "contemplacao" | "pos_contemplacao";
  dueLabel: string;
  installment: number;
  endingBalance: number;
};

export type EquityScenario = {
  key: EquityMode;
  label: string;
  description: string;
  creditReleased: number;
  capitalPreserved: number;
  strategicBid: number;
  monthlyInvestmentIncome: number;
  monthlyAssetIncome: number;
  monthlyConsortiumCost: number;
  monthlyNetPosition: number;
  annualNetPosition: number;
  effectiveMonthlyCostRate: number;
  effectiveAnnualCostRate: number;
  projectedGain: number;
  roi: number;
  leverageMultiple: number;
  leverageOnBid: number;
  totalPaid: number;
  totalCost: number;
  projectCostMonthlyRate: number;
  projectCostAnnualRate: number;
  steps: EquityFlowStep[];
  cashFlow: EquityCashFlowEntry[];
  installmentFlow: EquityInstallmentFlowEntry[];
};

export type EquityCycle = {
  cycle: number;
  month: number;
  creditReleased: number;
  capitalPreserved: number;
  assetIncome: number;
  investmentIncome: number;
  netPosition: number;
  accumulatedEquity: number;
};

export type EquityFlow = {
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
    assetMonthlyRate: number;
  };
  summary: {
    contractedCredit: number;
    creditAtContemplation: number;
    availableAtContemplation: number;
    contemplationMonth: number;
    planTerm: number;
    firstInstallment: number;
    postContemplationInstallment: number;
    ownBidAtContemplation: number;
    embeddedBidAtContemplation: number;
    investmentUntilContemplation: number;
    consortiumMonthlyCostRate: number;
  };
  direct: EquityScenario;
  directComparisons: {
    lottery: EquityDirectScenario;
    bid: EquityDirectScenario;
  };
  cadenced: EquityScenario & {
    cycles: EquityCycle[];
  };
  competitors: EquityCompetitor[];
  consortiumEntries: ExtratoMonthEntry[];
  consortiumEvents: ExtratoEventEntry[];
};

function normalizeFraction(value: unknown) {
  const parsed = onlyNumber(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function annualToMonthly(annualRate: number) {
  return annualRate > 0 ? Math.pow(1 + annualRate, 1 / 12) - 1 : 0;
}

function financingPayment(principal: number, term: number, monthlyRate: number) {
  const safeTerm = Math.max(1, Math.round(term));
  if (monthlyRate <= 0) return principal / safeTerm;
  return principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -safeTerm)));
}

function monthEntries(entries: ReturnType<typeof buildExtratoFlow>["entries"]) {
  return entries.filter((entry): entry is ExtratoMonthEntry => entry.kind === "month");
}

function eventEntries(entries: ReturnType<typeof buildExtratoFlow>["entries"]) {
  return entries.filter((entry): entry is ExtratoEventEntry => entry.kind === "event");
}

function sumInstallmentsUntil(entries: ExtratoMonthEntry[], month: number) {
  return entries
    .filter((entry) => entry.month <= month)
    .reduce((sum, entry) => sum + entry.installment, 0);
}

function buildDirectScenario({
  key,
  label,
  description,
  creditReleased,
  installmentsPaidUntilContemplation,
  bidPaid,
  debtAfterContemplation,
  totalCost,
  term,
  firstInstallment,
  postContemplationInstallment,
  contemplationMonth,
  embeddedBidUsed,
  installmentDetails,
}: {
  key: "sorteio" | "lance";
  label: string;
  description: string;
  creditReleased: number;
  installmentsPaidUntilContemplation: number;
  bidPaid: number;
  debtAfterContemplation: number;
  totalCost: number;
  term: number;
  firstInstallment: number;
  postContemplationInstallment: number;
  contemplationMonth: number;
  embeddedBidUsed: number;
  installmentDetails: EquityInstallmentDetailEntry[];
}): EquityDirectScenario {
  const totalInvested = installmentsPaidUntilContemplation + bidPaid;
  const leverageAmount = Math.max(0, creditReleased - totalInvested);
  const safeTerm = Math.max(1, term);
  const costBase = Math.max(1, leverageAmount);
  const totalCet = Math.max(0, totalCost) / costBase;
  const simpleCetMonthly = totalCet / safeTerm;
  const compoundCetMonthly = totalCet > 0 ? Math.pow(1 + totalCet, 1 / safeTerm) - 1 : 0;

  return {
    key,
    label,
    description,
    creditReleased,
    installmentsPaidUntilContemplation,
    bidPaid,
    totalInvested,
    leverageAmount,
    leverageMultiplier: totalInvested > 0 ? leverageAmount / totalInvested : 0,
    debtAfterContemplation,
    averageTerm: Math.round(safeTerm),
    effectiveBidRate: creditReleased > 0 ? bidPaid / creditReleased : 0,
    simpleCetMonthly,
    simpleCetAnnual: simpleCetMonthly * 12,
    compoundCetMonthly,
    compoundCetAnnual: Math.pow(1 + compoundCetMonthly, 12) - 1,
    totalCost,
    firstInstallment,
    postContemplationInstallment,
    contemplationMonth,
    embeddedBidUsed,
    installmentDetails,
  };
}

function eventsByMonth(events: ExtratoEventEntry[], month: number) {
  return events
    .filter((event) => event.month === month)
    .map((event) => `${event.title}: ${event.details.join(" | ")}`)
    .join(" / ");
}

function buildBidInstallmentDetails(entries: ExtratoMonthEntry[], events: ExtratoEventEntry[]): EquityInstallmentDetailEntry[] {
  return entries.map((entry) => ({
    month: entry.month,
    credit: entry.credit,
    initialBalance: entry.initialBalance,
    installment: entry.installment,
    payments: entry.payments,
    endingBalance: entry.endingBalance,
    eventText: eventsByMonth(events, entry.month),
  }));
}

function buildLotteryInstallmentDetails(
  entries: ExtratoMonthEntry[],
  events: ExtratoEventEntry[],
  contemplationMonth: number,
  totalMonths: number,
  annualRate: number
): EquityInstallmentDetailEntry[] {
  const rows: EquityInstallmentDetailEntry[] = [];
  const safeContemplationMonth = Math.max(1, contemplationMonth);
  const safeTotalMonths = Math.max(safeContemplationMonth, totalMonths);
  let accumulatedPayments = 0;
  let balanceAfterContemplation = 0;
  let lastCredit = entries[0]?.credit || 0;

  for (const entry of entries) {
    if (entry.month > safeContemplationMonth) break;
    accumulatedPayments = entry.payments;
    lastCredit = entry.credit || lastCredit;
    balanceAfterContemplation = entry.endingBalance;
    rows.push({
      month: entry.month,
      credit: entry.credit,
      initialBalance: entry.initialBalance,
      installment: entry.installment,
      payments: entry.payments,
      endingBalance: entry.endingBalance,
      eventText: eventsByMonth(events, entry.month),
    });
  }

  let balance = Math.max(0, balanceAfterContemplation);
  const planTerm = Math.max(1, safeTotalMonths);
  let postInstallmentExtra = 0;
  const basePostInstallment = balance > 0 ? balance / planTerm : 0;

  for (let month = safeContemplationMonth + 1; month <= safeTotalMonths; month += 1) {
    const originalEntry = entries.find((entry) => entry.month === month);
    let eventText = "";

    if (balance > 0 && month > 1 && (month - 1) % 12 === 0 && annualRate > 0) {
      const correctionBase = balance;
      const correctionValue = correctionBase * annualRate;
      const remainingTerm = Math.max(1, safeTotalMonths - month + 1);
      balance += correctionValue;
      postInstallmentExtra += correctionValue / remainingTerm;
      eventText = `Correção via sorteio: saldo devedor corrigido em ${brMoney(correctionValue)} e parcela ajustada conforme regra do Extrato.`;
    }

    const installment = balance > 0 ? Math.min(balance, basePostInstallment + postInstallmentExtra) : 0;
    const initialBalance = balance;
    balance = Math.max(0, balance - installment);
    accumulatedPayments += installment;
    lastCredit = originalEntry?.credit || lastCredit;

    rows.push({
      month,
      credit: lastCredit,
      initialBalance,
      installment,
      payments: accumulatedPayments,
      endingBalance: balance,
      eventText: eventText || (month === safeContemplationMonth + 1
        ? "Recalculo via sorteio: saldo devedor dividido pelo prazo do simulador, sem abatimento de lance."
        : ""),
    });
  }

  return rows;
}

function scenarioSteps({
  capitalBase,
  strategicBid,
  creditReleased,
  capitalPreserved,
  monthlyInvestmentIncome,
  monthlyAssetIncome,
  monthlyConsortiumCost,
  monthlyNetPosition,
}: {
  capitalBase: number;
  strategicBid: number;
  creditReleased: number;
  capitalPreserved: number;
  monthlyInvestmentIncome: number;
  monthlyAssetIncome: number;
  monthlyConsortiumCost: number;
  monthlyNetPosition: number;
}): EquityFlowStep[] {
  return [
    {
      label: "Capital antes do consórcio",
      value: capitalBase,
      helper: "Referência de capital estratégico usado na operação.",
      tone: "navy",
    },
    {
      label: "Lance no consórcio",
      value: strategicBid,
      helper: "Capital usado para buscar contemplação e destravar crédito.",
      tone: "ruby",
    },
    {
      label: "Capital preservado",
      value: capitalPreserved,
      helper: "Valor que permanece aplicado e gerando renda financeira.",
      tone: "gold",
    },
    {
      label: "Crédito liberado",
      value: creditReleased,
      helper: "Valor disponível na contemplação para aquisição, garantia ou projeto.",
      tone: "navy",
    },
    {
      label: "Renda financeira",
      value: monthlyInvestmentIncome,
      helper: "Rendimento mensal do capital preservado aplicado ao CDI.",
      tone: "gold",
    },
    {
      label: "Renda do ativo",
      value: monthlyAssetIncome,
      helper: "Receita mensal projetada sobre o crédito/ativo formado.",
      tone: "navy",
    },
    {
      label: "Parcela do consórcio",
      value: monthlyConsortiumCost,
      helper: "Custo mensal projetado da carta após contemplação.",
      tone: "ruby",
    },
    {
      label: "Resultado mensal",
      value: monthlyNetPosition,
      helper: "Renda financeira + renda do ativo - parcela do consórcio.",
      tone: monthlyNetPosition >= 0 ? "gold" : "ruby",
    },
  ];
}

function buildCompetitor(
  key: EquityCompetitor["key"],
  label: string,
  annualRate: number,
  principal: number,
  term: number,
  consortiumTotalPaid: number
): EquityCompetitor {
  const monthlyRate = annualToMonthly(annualRate);
  const monthlyPayment = financingPayment(principal, term, monthlyRate);
  const totalPaid = monthlyPayment * Math.max(1, term);
  const totalInterest = Math.max(0, totalPaid - principal);

  return {
    key,
    label,
    annualRate,
    monthlyRate,
    monthlyPayment,
    totalPaid,
    totalInterest,
    differenceVsConsortium: totalPaid - consortiumTotalPaid,
  };
}

export function buildEquityFlow(proposal: ProposalModelRow, params: ProposalParams): EquityFlow {
  const extrato = buildExtratoFlow(proposal, params);
  const entries = monthEntries(extrato.entries);
  const events = eventEntries(extrato.entries);
  const totalMonths = Math.max(1, extrato.totalMonths);
  const rawContemplationMonth = Math.round(onlyNumber(proposal.parcela_contemplacao));
  const contemplationMonth = Math.min(totalMonths, Math.max(1, rawContemplationMonth || 1));
  const cdiAnnualRate = normalizeFraction(params.cdi_anual);
  const cdiMonthlyRate = annualToMonthly(cdiAnnualRate);
  const assetIncomeRate = normalizeFraction(params.aluguel_pct);
  const creditAtContemplation =
    extrato.summary.creditAtContemplation ||
    extrato.summary.correctedContractedCredit ||
    extrato.summary.contractedCredit;
  const creditReleased =
    extrato.summary.availableAtContemplation ||
    creditoLiquido(proposal) ||
    extrato.summary.correctedLiquidCredit ||
    extrato.summary.liquidCredit ||
    creditAtContemplation;
  const ownBid = Math.max(0, extrato.summary.ownBidAtContemplation);
  const embeddedBid = Math.max(0, extrato.summary.embeddedBidAtContemplation);
  const strategicBid = ownBid + embeddedBid;
  const investmentUntilContemplation = Math.max(0, extrato.summary.investmentUntilContemplation);
  const postContemplationInstallment =
    extrato.summary.postContemplationInstallment ||
    entries.find((entry) => entry.month >= contemplationMonth)?.installment ||
    entries[0]?.installment ||
    0;
  const firstInstallment = extrato.summary.firstInstallment || entries[0]?.installment || 0;
  const totalInstallments = entries.reduce((sum, entry) => sum + entry.installment, 0);
  const installmentsPaidUntilContemplation = sumInstallmentsUntil(entries, contemplationMonth);
  const totalPaid = totalInstallments + ownBid;
  const totalCost = Math.max(0, totalPaid - creditReleased);
  const consortiumMonthlyCostRate = creditReleased > 0 ? postContemplationInstallment / creditReleased : 0;
  const totalProjectCostRate = creditReleased > 0 ? totalCost / creditReleased : 0;
  const projectCostMonthlyRate = totalProjectCostRate > 0 ? Math.pow(1 + totalProjectCostRate, 1 / totalMonths) - 1 : 0;
  const projectCostAnnualRate = Math.pow(1 + projectCostMonthlyRate, 12) - 1;
  const capitalBase = Math.max(creditReleased, strategicBid + Math.max(0, creditReleased - strategicBid));
  const capitalPreserved = Math.max(0, capitalBase - ownBid);
  const monthlyInvestmentIncome = capitalPreserved * cdiMonthlyRate;
  const monthlyAssetIncome = creditReleased * assetIncomeRate;
  const monthlyNetPosition = monthlyInvestmentIncome + monthlyAssetIncome - postContemplationInstallment;
  const annualNetPosition = monthlyNetPosition * 12;
  const projectedGain = Math.max(0, creditReleased + capitalPreserved + annualNetPosition - totalPaid);
  const roi = totalPaid > 0 ? projectedGain / totalPaid : 0;
  const leverageMultiple = totalPaid > 0 ? (creditReleased + capitalPreserved) / totalPaid : 0;
  const leverageOnBid = strategicBid > 0 ? creditReleased / strategicBid : 0;
  const contemplationEntry = entries.find((entry) => entry.month === contemplationMonth);
  const debtBeforeBid = contemplationEntry?.endingBalance || 0;
  const debtAfterBid = Math.max(0, debtBeforeBid - strategicBid);
  const bidInstallmentDetails = buildBidInstallmentDetails(entries, events);
  const lotteryTerm = Math.max(1, extrato.summary.planTerm || totalMonths);
  const lotteryInstallmentDetails = buildLotteryInstallmentDetails(entries, events, contemplationMonth, lotteryTerm, annualRate);
  const lotteryTotalPaid = lotteryInstallmentDetails.reduce((sum, entry) => sum + entry.installment, 0);
  const lotteryPostContemplationInstallment =
    lotteryInstallmentDetails.find((entry) => entry.month > contemplationMonth)?.installment ||
    (debtBeforeBid > 0 ? debtBeforeBid / Math.max(1, lotteryTerm) : 0);
  const bidPostContemplationInstallment =
    entries.find((entry) => entry.month > contemplationMonth)?.installment ||
    postContemplationInstallment;
  const lotteryTotalCost = Math.max(0, lotteryTotalPaid - creditAtContemplation);
  const bidTotalCost = Math.max(0, totalPaid - creditReleased);
  const lotteryScenario = buildDirectScenario({
    key: "sorteio",
    label: "Via Sorteio",
    description: "Considera contemplação sem lance, usando o crédito total disponível no momento da contemplação.",
    creditReleased: creditAtContemplation,
    installmentsPaidUntilContemplation,
    bidPaid: 0,
    debtAfterContemplation: debtBeforeBid,
    totalCost: lotteryTotalCost,
    term: lotteryTerm,
    firstInstallment,
    postContemplationInstallment: lotteryPostContemplationInstallment,
    contemplationMonth,
    embeddedBidUsed: 0,
    installmentDetails: lotteryInstallmentDetails,
  });
  const bidScenario = buildDirectScenario({
    key: "lance",
    label: "Via Lance",
    description: "Considera contemplação com lance estratégico, reduzindo o crédito disponível pelo lance embutido.",
    creditReleased,
    installmentsPaidUntilContemplation,
    bidPaid: ownBid,
    debtAfterContemplation: debtAfterBid,
    totalCost: bidTotalCost,
    term: totalMonths,
    firstInstallment,
    postContemplationInstallment: bidPostContemplationInstallment,
    contemplationMonth,
    embeddedBidUsed: embeddedBid,
    installmentDetails: bidInstallmentDetails,
  });
  const installmentFlow: EquityInstallmentFlowEntry[] = entries.map((entry) => ({
    month: entry.month,
    phase:
      entry.month < contemplationMonth
        ? "antes_contemplacao"
        : entry.month === contemplationMonth
        ? "contemplacao"
        : "pos_contemplacao",
    dueLabel:
      entry.month < contemplationMonth
        ? "Antes da contemplação"
        : entry.month === contemplationMonth
        ? "Contemplação"
        : "Pós-contemplação",
    installment: entry.installment,
    endingBalance: entry.endingBalance,
  }));
  const cashFlow: EquityCashFlowEntry[] = [];
  let accumulatedCashFlow = 0;

  for (const entry of entries) {
    const activeAfterContemplation = entry.month >= contemplationMonth;
    const investmentIncome = activeAfterContemplation ? monthlyInvestmentIncome : 0;
    const assetIncome = activeAfterContemplation ? monthlyAssetIncome : 0;
    const netCashFlow = investmentIncome + assetIncome - entry.installment;
    accumulatedCashFlow += netCashFlow;

    cashFlow.push({
      month: entry.month,
      investmentIncome,
      assetIncome,
      installment: entry.installment,
      netCashFlow,
      accumulatedCashFlow,
    });
  }

  const direct: EquityScenario = {
    key: "direto",
    label: "Equity Direto",
    description: "Uma carta estruturada para transformar capital próprio em crédito liberado, mantendo parte do capital aplicado e usando renda do ativo para compensar a parcela.",
    creditReleased,
    capitalPreserved,
    strategicBid,
    monthlyInvestmentIncome,
    monthlyAssetIncome,
    monthlyConsortiumCost: postContemplationInstallment,
    monthlyNetPosition,
    annualNetPosition,
    effectiveMonthlyCostRate: consortiumMonthlyCostRate,
    effectiveAnnualCostRate: Math.pow(1 + consortiumMonthlyCostRate, 12) - 1,
    projectedGain,
    roi,
    leverageMultiple,
    leverageOnBid,
    totalPaid,
    totalCost,
    projectCostMonthlyRate,
    projectCostAnnualRate,
    steps: scenarioSteps({
      capitalBase,
      strategicBid,
      creditReleased,
      capitalPreserved,
      monthlyInvestmentIncome,
      monthlyAssetIncome,
      monthlyConsortiumCost: postContemplationInstallment,
      monthlyNetPosition,
    }),
    cashFlow,
    installmentFlow,
  };

  const cycles: EquityCycle[] = [];
  let accumulatedEquity = 0;
  let cycleCapital = capitalPreserved;

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const cycleCredit = creditReleased * cycle;
    const cycleAssetIncome = monthlyAssetIncome * cycle;
    const cycleInvestmentIncome = cycleCapital * cdiMonthlyRate;
    const cycleCost = postContemplationInstallment * cycle;
    const cycleNet = cycleAssetIncome + cycleInvestmentIncome - cycleCost;
    accumulatedEquity += creditReleased + Math.max(0, cycleNet * 12);

    cycles.push({
      cycle,
      month: contemplationMonth * cycle,
      creditReleased: cycleCredit,
      capitalPreserved: cycleCapital,
      assetIncome: cycleAssetIncome,
      investmentIncome: cycleInvestmentIncome,
      netPosition: cycleNet,
      accumulatedEquity,
    });

    cycleCapital = Math.max(0, cycleCapital + cycleNet * 12);
  }

  const lastCycle = cycles[cycles.length - 1];
  const cadencedMonthlyAssetIncome = monthlyAssetIncome * 3;
  const cadencedInvestmentIncome = Math.max(0, lastCycle?.investmentIncome || 0);
  const cadencedCost = postContemplationInstallment * 3;
  const cadencedMonthlyNet = cadencedMonthlyAssetIncome + cadencedInvestmentIncome - cadencedCost;
  const cadencedTotalPaid = totalPaid * 3;
  const cadencedCapitalPreserved = Math.max(0, lastCycle?.capitalPreserved || capitalPreserved);
  const cadencedCreditReleased = creditReleased * 3;
  const cadencedProjectedGain = Math.max(0, (lastCycle?.accumulatedEquity || cadencedCreditReleased) + cadencedCapitalPreserved - cadencedTotalPaid);

  const cadenced: EquityFlow["cadenced"] = {
    key: "cadenciado",
    label: "Equity Cadenciado",
    description: "Replica a tese em ciclos: crédito, renda, excedente e nova fase. A ideia é transformar a primeira estrutura em uma esteira de expansão patrimonial.",
    creditReleased: cadencedCreditReleased,
    capitalPreserved: cadencedCapitalPreserved,
    strategicBid: strategicBid * 3,
    monthlyInvestmentIncome: cadencedInvestmentIncome,
    monthlyAssetIncome: cadencedMonthlyAssetIncome,
    monthlyConsortiumCost: cadencedCost,
    monthlyNetPosition: cadencedMonthlyNet,
    annualNetPosition: cadencedMonthlyNet * 12,
    effectiveMonthlyCostRate: cadencedCreditReleased > 0 ? cadencedCost / cadencedCreditReleased : 0,
    effectiveAnnualCostRate: cadencedCreditReleased > 0 ? Math.pow(1 + cadencedCost / cadencedCreditReleased, 12) - 1 : 0,
    projectedGain: cadencedProjectedGain,
    roi: cadencedTotalPaid > 0 ? cadencedProjectedGain / cadencedTotalPaid : 0,
    leverageMultiple: cadencedTotalPaid > 0 ? (cadencedCreditReleased + cadencedCapitalPreserved) / cadencedTotalPaid : 0,
    leverageOnBid: strategicBid > 0 ? cadencedCreditReleased / (strategicBid * 3) : 0,
    totalPaid: cadencedTotalPaid,
    totalCost: totalCost * 3,
    projectCostMonthlyRate,
    projectCostAnnualRate,
    steps: scenarioSteps({
      capitalBase: capitalBase * 3,
      strategicBid: strategicBid * 3,
      creditReleased: cadencedCreditReleased,
      capitalPreserved: cadencedCapitalPreserved,
      monthlyInvestmentIncome: cadencedInvestmentIncome,
      monthlyAssetIncome: cadencedMonthlyAssetIncome,
      monthlyConsortiumCost: cadencedCost,
      monthlyNetPosition: cadencedMonthlyNet,
    }),
    cashFlow: cashFlow.map((entry) => ({
      ...entry,
      investmentIncome: entry.investmentIncome * 3,
      assetIncome: entry.assetIncome * 3,
      installment: entry.installment * 3,
      netCashFlow: entry.netCashFlow * 3,
      accumulatedCashFlow: entry.accumulatedCashFlow * 3,
    })),
    installmentFlow: installmentFlow.map((entry) => ({
      ...entry,
      installment: entry.installment * 3,
      endingBalance: entry.endingBalance * 3,
    })),
    cycles,
  };

  const competitors = [
    buildCompetitor("home_equity", "Home Equity", normalizeFraction(params.equity_home_anual), creditReleased, totalMonths, totalPaid),
    buildCompetitor("pronaf", "Pronaf", normalizeFraction(params.equity_pronaf_anual), creditReleased, totalMonths, totalPaid),
    buildCompetitor("pronamp", "Pronamp", normalizeFraction(params.equity_pronamp_anual), creditReleased, totalMonths, totalPaid),
    buildCompetitor("demais", "Demais linhas", normalizeFraction(params.equity_demais_anual), creditReleased, totalMonths, totalPaid),
  ];

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
      assetMonthlyRate: assetIncomeRate,
    },
    summary: {
      contractedCredit: extrato.summary.contractedCredit,
      creditAtContemplation,
      availableAtContemplation: creditReleased,
      contemplationMonth,
      planTerm: extrato.summary.planTerm,
      firstInstallment,
      postContemplationInstallment,
      ownBidAtContemplation: ownBid,
      embeddedBidAtContemplation: embeddedBid,
      investmentUntilContemplation,
      consortiumMonthlyCostRate,
    },
    direct,
    directComparisons: {
      lottery: lotteryScenario,
      bid: bidScenario,
    },
    cadenced,
    competitors,
    consortiumEntries: entries,
    consortiumEvents: events,
  };
}
