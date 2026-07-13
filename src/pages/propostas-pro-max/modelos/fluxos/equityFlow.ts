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
  insuranceMonthly: number;
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

export type EquityCadencedQuota = {
  index: number;
  code: number | string;
  credit: number;
  adminRate: number;
  reserveRate: number;
  term: number;
  initialInstallment: number;
  totalBid: number;
  embeddedBid: number;
  ownBid: number;
  creditReleased: number;
  postInstallment: number;
  postInstallmentsCount: number;
  totalInstallmentsProjected: number;
  leverageAmount: number;
  debtAfterContemplation: number;
  installmentDetails: EquityInstallmentDetailEntry[];
};

export type EquityCadencedParcelFlowEntry = { label: string; value: number };
export type EquityCadencedCashFlowEntry = { label: string; outflow: number; inflow: number; net: number };
export type EquityCadencedIndicators = {
  averageTerm: number;
  effectiveBidRate: number;
  simpleCetMonthly: number;
  simpleCetAnnual: number;
  compoundCetMonthly: number;
  compoundCetAnnual: number;
};
export type EquityCadencedStrategy = {
  quotaCount: number;
  reusableBid: number;
  totalCredit: number;
  totalCreditReleased: number;
  totalOwnBid: number;
  totalEmbeddedBid: number;
  totalBid: number;
  totalLeverage: number;
  totalDebtAfterContemplation: number;
  totalInitialInstallments: number;
  totalPostInstallments: number;
  totalProjectedInstallments: number;
  totalCost: number;
  quotas: EquityCadencedQuota[];
  parcelFlow: EquityCadencedParcelFlowEntry[];
  cashFlow: EquityCadencedCashFlowEntry[];
  indicators: EquityCadencedIndicators;
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
    strategy: EquityCadencedStrategy;
  };
  competitors: EquityCompetitor[];
  consortiumEntries: ExtratoMonthEntry[];
  consortiumEvents: ExtratoEventEntry[];
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

function annualToMonthly(annualRate: number) {
  return annualRate > 0 ? Math.pow(1 + annualRate, 1 / 12) - 1 : 0;
}

function moneyForEvent(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
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

function calculateCetFromTotalCost(totalCost: number, leverageBase: number, term: number) {
  const safeBase = Math.max(1, leverageBase);
  const safeTerm = Math.max(1, Math.round(term));
  const totalCet = Math.max(0, totalCost) / safeBase;
  const simpleMonthly = totalCet / safeTerm;
  const compoundMonthly = totalCet > 0 ? Math.pow(1 + totalCet, 1 / safeTerm) - 1 : 0;

  return {
    simpleMonthly,
    simpleAnnual: simpleMonthly * 12,
    compoundMonthly,
    compoundAnnual: Math.pow(1 + compoundMonthly, 12) - 1,
  };
}

function monthEventText(entry: EquityInstallmentDetailEntry) {
  return normalizeText(entry.eventText || "");
}

function inferContemplationMonthFromDetails(details: EquityInstallmentDetailEntry[], fallback = 1) {
  const found = details.find((entry) => monthEventText(entry).includes("contemplacao"));
  return found?.month || Math.max(1, fallback);
}

function firstMoneyAfterPattern(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return onlyNumber(match[1]);
  }
  return 0;
}

function postContemplationCorrectionCost(details: EquityInstallmentDetailEntry[], contemplationMonth?: number) {
  const effectiveContemplationMonth = contemplationMonth || inferContemplationMonthFromDetails(details, 1);

  return details.reduce((sum, entry) => {
    if (entry.month <= effectiveContemplationMonth) return sum;
    const text = entry.eventText || "";
    const normalized = normalizeText(text);
    if (!normalized.includes("correcao")) return sum;

    const correctionValue = firstMoneyAfterPattern(text, [
      /Corre[cç][aã]o:\s*(R\$\s*[\d.,]+)/i,
      /corrigido\s+em\s*(R\$\s*[\d.,]+)/i,
    ]);

    return sum + Math.max(0, correctionValue);
  }, 0);
}

function adminReserveCostFromDetails(
  details: EquityInstallmentDetailEntry[],
  adminRate: number,
  reserveRate: number,
  planTerm: number
) {
  const totalFeeRate = Math.max(0, adminRate) + Math.max(0, reserveRate);
  const safeTerm = Math.max(1, Math.round(planTerm));
  if (totalFeeRate <= 0) return 0;

  return details.reduce((sum, entry) => {
    const creditBase = Math.max(0, entry.credit);
    return sum + (creditBase * totalFeeRate) / safeTerm;
  }, 0);
}

function insuranceCostFromDetails(details: EquityInstallmentDetailEntry[]) {
  return details.reduce((sum, entry) => sum + Math.max(0, onlyNumber(entry.insuranceMonthly)), 0);
}

function operationalCostFromDetails({
  details,
  adminRate,
  reserveRate,
  planTerm,
  contemplationMonth,
}: {
  details: EquityInstallmentDetailEntry[];
  adminRate: number;
  reserveRate: number;
  planTerm: number;
  contemplationMonth?: number;
}) {
  // Custo econômico do consórcio para CET:
  // taxa de administração + fundo reserva + seguro explícito + reajustes após contemplação.
  // Fundo comum, lance próprio e lance embutido não são custo; são capital/antecipação/uso do crédito.
  return (
    adminReserveCostFromDetails(details, adminRate, reserveRate, planTerm) +
    insuranceCostFromDetails(details) +
    postContemplationCorrectionCost(details, contemplationMonth)
  );
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
  const cet = calculateCetFromTotalCost(totalCost, leverageAmount, safeTerm);

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
    simpleCetMonthly: cet.simpleMonthly,
    simpleCetAnnual: cet.simpleAnnual,
    compoundCetMonthly: cet.compoundMonthly,
    compoundCetAnnual: cet.compoundAnnual,
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
    insuranceMonthly: onlyNumber(entry.insuranceMonthly),
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
      insuranceMonthly: onlyNumber(entry.insuranceMonthly),
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
      eventText = `Correção via sorteio: saldo devedor corrigido em ${moneyForEvent(correctionValue)} e parcela ajustada conforme regra do Extrato.`;
    }

    const insuranceMonthly = onlyNumber(originalEntry?.insuranceMonthly);
    const installment = balance > 0 ? Math.min(balance, basePostInstallment + postInstallmentExtra + insuranceMonthly) : 0;
    const amortization = Math.max(0, installment - insuranceMonthly);
    const initialBalance = balance;
    balance = Math.max(0, balance - amortization);
    accumulatedPayments += installment;
    lastCredit = originalEntry?.credit || lastCredit;

    rows.push({
      month,
      credit: lastCredit,
      initialBalance,
      installment,
      insuranceMonthly,
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


function rowTextValue(row: ProposalModelRow, keys: string[]) {
  for (const key of keys) {
    const fromRoot = row[key];
    const fromPromax = row.promax?.[key as keyof NonNullable<ProposalModelRow["promax"]>];
    const value = fromRoot ?? fromPromax;
    if (value !== null && value !== undefined && String(value).trim()) return value;
  }
  return null;
}

function getCadencedSourceRows(proposal: ProposalModelRow): ProposalModelRow[] {
  const promax = proposal.promax as Record<string, unknown> | undefined;
  const root = proposal as Record<string, unknown>;
  const rawPromaxCadenced = promax?.cadenced_rows;
  const rawPromaxUnified = promax?.unified_rows;
  const rawRootCadenced = root.cadenced_rows;
  const rawRootUnified = root.unified_rows;
  const raw = Array.isArray(rawPromaxCadenced)
    ? rawPromaxCadenced
    : Array.isArray(rawPromaxUnified)
    ? rawPromaxUnified
    : Array.isArray(rawRootCadenced)
    ? rawRootCadenced
    : Array.isArray(rawRootUnified)
    ? rawRootUnified
    : null;
  if (raw?.length) return raw as ProposalModelRow[];

  const requestedCount = Math.max(
    1,
    Math.round(
      onlyNumber(rowTextValue(proposal, ["quantidade_cotas", "qtd_cotas", "numero_cotas", "cotas", "cadencia_qtd_cotas"])) || 1
    )
  );

  return Array.from({ length: requestedCount }, () => proposal);
}

function buildCadencedStrategy(rows: ProposalModelRow[], params: ProposalParams): EquityCadencedStrategy {
  const sortedRows = [...rows].sort((a, b) => {
    const codeA = onlyNumber(a.code);
    const codeB = onlyNumber(b.code);
    if (codeA && codeB && codeA !== codeB) return codeA - codeB;
    return String(a.code || "").localeCompare(String(b.code || ""), "pt-BR", { numeric: true });
  });

  const quotas: EquityCadencedQuota[] = sortedRows.map((row, index) => {
    const rowFlow = buildExtratoFlow(row, params);
    const rowEntries = monthEntries(rowFlow.entries);
    const rowEvents = eventEntries(rowFlow.entries);
    const installmentDetails = buildBidInstallmentDetails(rowEntries, rowEvents);
    const totalInstallmentsProjected = rowEntries.reduce((sum, entry) => sum + entry.installment, 0);
    const rawContemplationMonth = Math.round(onlyNumber(row.parcela_contemplacao));
    const contemplationMonth = Math.min(rowFlow.totalMonths || 1, Math.max(1, rawContemplationMonth || 1));
    const contemplationEntry = rowEntries.find((entry) => entry.month === contemplationMonth);
    const newTerm = Math.max(
      0,
      Math.round(onlyNumber(row.novo_prazo)) || rowEntries.filter((entry) => entry.month > contemplationMonth && entry.installment > 0).length
    );
    const ownBid = Math.max(0, rowFlow.summary.ownBidAtContemplation);
    const embeddedBid = Math.max(0, rowFlow.summary.embeddedBidAtContemplation);
    const totalBid = ownBid + embeddedBid;
    const creditReleased =
      rowFlow.summary.availableAtContemplation ||
      creditoLiquido(row) ||
      rowFlow.summary.correctedLiquidCredit ||
      rowFlow.summary.liquidCredit ||
      rowFlow.summary.creditAtContemplation;
    const debtBeforeBid = contemplationEntry?.endingBalance || 0;
    const debtAfterContemplation = Math.max(0, debtBeforeBid - totalBid);

    return {
      index: index + 1,
      code: row.code || index + 1,
      credit: rowFlow.summary.contractedCredit,
      adminRate: rowFlow.summary.adminTaxPct,
      reserveRate: rowFlow.summary.reserveTaxPct,
      term: rowFlow.summary.planTerm,
      initialInstallment: rowFlow.summary.firstInstallment || rowEntries[0]?.installment || 0,
      totalBid,
      embeddedBid,
      ownBid,
      creditReleased,
      postInstallment:
        rowFlow.summary.postContemplationInstallment ||
        rowEntries.find((entry) => entry.month > contemplationMonth)?.installment ||
        rowEntries[rowEntries.length - 1]?.installment ||
        0,
      postInstallmentsCount: Math.max(0, newTerm || rowFlow.summary.planTerm - contemplationMonth),
      totalInstallmentsProjected,
      leverageAmount: Math.max(0, creditReleased - ownBid),
      debtAfterContemplation,
      installmentDetails,
    };
  });

  const totalCredit = quotas.reduce((sum, item) => sum + item.credit, 0);
  const totalCreditReleased = quotas.reduce((sum, item) => sum + item.creditReleased, 0);
  const totalOwnBid = quotas.reduce((sum, item) => sum + item.ownBid, 0);
  const totalEmbeddedBid = quotas.reduce((sum, item) => sum + item.embeddedBid, 0);
  const totalBid = quotas.reduce((sum, item) => sum + item.totalBid, 0);
  const totalLeverage = quotas.reduce((sum, item) => sum + item.leverageAmount, 0);
  const totalDebtAfterContemplation = quotas.reduce((sum, item) => sum + item.debtAfterContemplation, 0);
  const totalInitialInstallments = quotas.reduce((sum, item) => sum + item.initialInstallment, 0);
  const totalPostInstallments = quotas.reduce((sum, item) => sum + item.postInstallment, 0);
  const totalProjectedInstallments = quotas.reduce((sum, item) => sum + item.totalInstallmentsProjected, 0);
  const reusableBid = Math.max(...quotas.map((item) => item.ownBid), 0);
  const averageTerm = quotas.length ? Math.round(quotas.reduce((sum, item) => sum + item.postInstallmentsCount, 0) / quotas.length) : 0;
  const parcelFlow: EquityCadencedParcelFlowEntry[] = [];

  for (let step = 0; step <= quotas.length; step += 1) {
    const contemplated = quotas.slice(0, step);
    const pending = quotas.slice(step);
    const value = contemplated.reduce((sum, item) => sum + item.postInstallment, 0) + pending.reduce((sum, item) => sum + item.initialInstallment, 0);
    const label = step === 0 ? "Parcela Inicial" : step === quotas.length ? `Parcela ${step + 1} em diante` : `Parcela ${step + 1}`;
    parcelFlow.push({ label, value });
  }

  const cashFlow = quotas.map((item) => ({
    label: `M${item.index}`,
    outflow: item.ownBid,
    inflow: item.creditReleased,
    net: item.leverageAmount,
  }));

  const totalCost = quotas.reduce((sum, item) => {
    const quotaContemplationMonth = inferContemplationMonthFromDetails(item.installmentDetails, item.index);
    return sum + operationalCostFromDetails({
      details: item.installmentDetails,
      adminRate: item.adminRate,
      reserveRate: item.reserveRate,
      planTerm: item.term,
      contemplationMonth: quotaContemplationMonth,
    });
  }, 0);
  const weightedAverageTerm = totalLeverage > 0
    ? Math.round(quotas.reduce((sum, item) => sum + item.postInstallmentsCount * item.leverageAmount, 0) / totalLeverage)
    : averageTerm;
  const cetTerm = Math.max(1, weightedAverageTerm || averageTerm || 1);
  const cet = calculateCetFromTotalCost(totalCost, totalLeverage, cetTerm);

  return {
    quotaCount: quotas.length,
    reusableBid,
    totalCredit,
    totalCreditReleased,
    totalOwnBid,
    totalEmbeddedBid,
    totalBid,
    totalLeverage,
    totalDebtAfterContemplation,
    totalInitialInstallments,
    totalPostInstallments,
    totalProjectedInstallments,
    totalCost,
    quotas,
    parcelFlow,
    cashFlow,
    indicators: {
      averageTerm: cetTerm,
      effectiveBidRate: totalLeverage > 0 ? reusableBid / totalLeverage : 0,
      simpleCetMonthly: cet.simpleMonthly,
      simpleCetAnnual: cet.simpleAnnual,
      compoundCetMonthly: cet.compoundMonthly,
      compoundCetAnnual: cet.compoundAnnual,
    },
  };
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
  const correctionAnnualRate = Math.max(0, extrato.index.annualRate || 0);
  const lotteryInstallmentDetails = buildLotteryInstallmentDetails(entries, events, contemplationMonth, lotteryTerm, correctionAnnualRate);
  const lotteryTotalPaid = lotteryInstallmentDetails.reduce((sum, entry) => sum + entry.installment, 0);
  const lotteryPostContemplationInstallment =
    lotteryInstallmentDetails.find((entry) => entry.month > contemplationMonth)?.installment ||
    (debtBeforeBid > 0 ? debtBeforeBid / Math.max(1, lotteryTerm) : 0);
  const bidPostContemplationInstallment =
    entries.find((entry) => entry.month > contemplationMonth)?.installment ||
    postContemplationInstallment;
  const lotteryTotalCost = operationalCostFromDetails({
    details: lotteryInstallmentDetails,
    adminRate: extrato.summary.adminTaxPct,
    reserveRate: extrato.summary.reserveTaxPct,
    planTerm: lotteryTerm,
    contemplationMonth,
  });
  const bidTotalCost = operationalCostFromDetails({
    details: bidInstallmentDetails,
    adminRate: extrato.summary.adminTaxPct,
    reserveRate: extrato.summary.reserveTaxPct,
    planTerm: extrato.summary.planTerm || totalMonths,
    contemplationMonth,
  });
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
  const cadencedStrategy = buildCadencedStrategy(getCadencedSourceRows(proposal), params);
  const cadencedMultiplier = Math.max(1, cadencedStrategy.quotaCount);
  const cadencedMonthlyAssetIncome = monthlyAssetIncome * cadencedMultiplier;
  const cadencedInvestmentIncome = Math.max(0, lastCycle?.investmentIncome || 0);
  const cadencedCost = cadencedStrategy.totalPostInstallments || postContemplationInstallment * cadencedMultiplier;
  const cadencedMonthlyNet = cadencedMonthlyAssetIncome + cadencedInvestmentIncome - cadencedCost;
  // Para análise econômica da cadência, o CET usa apenas o custo econômico:
  // taxas, fundo reserva, seguro explícito e reajustes pós-contemplação.
  const cadencedTotalPaid = cadencedStrategy.totalCost;
  const cadencedCapitalPreserved = Math.max(0, lastCycle?.capitalPreserved || capitalPreserved);
  const cadencedCreditReleased = cadencedStrategy.totalCreditReleased || creditReleased * cadencedMultiplier;
  const cadencedProjectedGain = Math.max(0, (lastCycle?.accumulatedEquity || cadencedCreditReleased) + cadencedCapitalPreserved - cadencedTotalPaid);

  const cadenced: EquityFlow["cadenced"] = {
    key: "cadenciado",
    label: "Equity Cadenciado",
    description: "Replica a tese em ciclos: crédito, renda, excedente e nova fase. A ideia é transformar a primeira estrutura em uma esteira de expansão patrimonial.",
    creditReleased: cadencedCreditReleased,
    capitalPreserved: cadencedCapitalPreserved,
    strategicBid: cadencedStrategy.reusableBid || strategicBid,
    monthlyInvestmentIncome: cadencedInvestmentIncome,
    monthlyAssetIncome: cadencedMonthlyAssetIncome,
    monthlyConsortiumCost: cadencedCost,
    monthlyNetPosition: cadencedMonthlyNet,
    annualNetPosition: cadencedMonthlyNet * 12,
    effectiveMonthlyCostRate: cadencedStrategy.indicators.compoundCetMonthly,
    effectiveAnnualCostRate: cadencedStrategy.indicators.compoundCetAnnual,
    projectedGain: cadencedProjectedGain,
    roi: cadencedTotalPaid > 0 ? cadencedProjectedGain / cadencedTotalPaid : 0,
    leverageMultiple: cadencedTotalPaid > 0 ? (cadencedCreditReleased + cadencedCapitalPreserved) / cadencedTotalPaid : 0,
    leverageOnBid: (cadencedStrategy.reusableBid || strategicBid) > 0 ? cadencedCreditReleased / (cadencedStrategy.reusableBid || strategicBid) : 0,
    totalPaid: cadencedTotalPaid,
    totalCost: cadencedStrategy.totalCost || totalCost * cadencedMultiplier,
    projectCostMonthlyRate,
    projectCostAnnualRate,
    steps: scenarioSteps({
      capitalBase: cadencedStrategy.totalCreditReleased || capitalBase * cadencedMultiplier,
      strategicBid: cadencedStrategy.reusableBid || strategicBid,
      creditReleased: cadencedCreditReleased,
      capitalPreserved: cadencedCapitalPreserved,
      monthlyInvestmentIncome: cadencedInvestmentIncome,
      monthlyAssetIncome: cadencedMonthlyAssetIncome,
      monthlyConsortiumCost: cadencedCost,
      monthlyNetPosition: cadencedMonthlyNet,
    }),
    cashFlow: cashFlow.map((entry) => ({
      ...entry,
      investmentIncome: entry.investmentIncome * cadencedMultiplier,
      assetIncome: entry.assetIncome * cadencedMultiplier,
      installment: entry.installment * cadencedMultiplier,
      netCashFlow: entry.netCashFlow * cadencedMultiplier,
      accumulatedCashFlow: entry.accumulatedCashFlow * cadencedMultiplier,
    })),
    installmentFlow: installmentFlow.map((entry) => ({
      ...entry,
      installment: entry.installment * cadencedMultiplier,
      endingBalance: entry.endingBalance * cadencedMultiplier,
    })),
    cycles,
    strategy: cadencedStrategy,
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
