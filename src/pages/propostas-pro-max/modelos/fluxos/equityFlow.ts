import {
  buildExtratoFlow,
  creditoLiquido,
  onlyNumber,
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
  cadenced: EquityScenario & {
    cycles: EquityCycle[];
  };
  competitors: EquityCompetitor[];
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
  return entries.filter((entry) => entry.kind === "month");
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
    cadenced,
    competitors,
  };
}
