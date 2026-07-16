import {
  buildExtratoFlow,
  creditoContratado,
  onlyNumber,
  type ProposalModelRow,
  type ProposalParams,
} from "./extratoFlow";

type LancePrimeParams = ProposalParams & {
  lance_prime_mensal?: number;
};

export type LancePrimeInstallment = {
  month: number;
  payment: number;
  interest: number;
  amortization: number;
  endingBalance: number;
};

export type LancePrimeProjectionRow = {
  month: number;
  lanceInstallment: number;
  consortiumInstallment: number;
  totalInstallment: number;
  priceInstallment: number;
  sacInstallment: number;
};

export type LancePrimeFlow = {
  eligible: boolean;
  reasons: string[];
  adminName: string;
  credit: number;
  financedBid: number;
  bidWasEstimated: boolean;
  bidPercent: number;
  termMonths: number;
  monthlyRate: number;
  financedAmount: number;
  iof: number;
  iofAdditional: number;
  iofDaily: number;
  installment: number;
  totalFinancingPayments: number;
  interestCost: number;
  cetMonthly: number;
  cetAnnual: number;
  consortiumInstallment: number;
  consortiumTotalPayments: number;
  mixedMonthlyCommitment: number;
  mixedTotalPayments: number;
  traditionalMonthlyRate: number;
  traditionalTermMonths: number;
  traditionalInstallment: number;
  traditionalTotalPayments: number;
  traditionalSacFirstInstallment: number;
  traditionalSacLastInstallment: number;
  traditionalSacTotalPayments: number;
  projectedDifference: number;
  availableCredit: number;
  schedule: LancePrimeInstallment[];
  projection: LancePrimeProjectionRow[];
  projectionTotals: {
    totalInstallment: number;
    priceInstallment: number;
    sacInstallment: number;
  };
};

const IOF_ADDITIONAL_RATE = 0.0038;
const IOF_DAILY_RATE = 0.000082;
const IOF_DAYS_LIMIT = 365;
const MINIMUM_CREDIT = 2_000_000;
const TRADITIONAL_FINANCING_TERM = 420;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeFraction(value: unknown) {
  const parsed = onlyNumber(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function pricePayment(principal: number, monthlyRate: number, months: number) {
  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate <= 0) return principal / months;
  return principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)));
}

function buildPriceSchedule(principal: number, monthlyRate: number, months: number): LancePrimeInstallment[] {
  const payment = pricePayment(principal, monthlyRate, months);
  const rows: LancePrimeInstallment[] = [];
  let balance = principal;

  for (let month = 1; month <= months; month += 1) {
    const interest = balance * monthlyRate;
    const scheduledAmortization = Math.max(0, payment - interest);
    const amortization = month === months ? balance : Math.min(balance, scheduledAmortization);
    balance = Math.max(0, balance - amortization);
    rows.push({
      month,
      payment: interest + amortization,
      interest,
      amortization,
      endingBalance: balance,
    });
  }

  return rows;
}

function buildSacSchedule(principal: number, monthlyRate: number, months: number): LancePrimeInstallment[] {
  if (principal <= 0 || months <= 0) return [];
  const amortizationBase = principal / months;
  const rows: LancePrimeInstallment[] = [];
  let balance = principal;

  for (let month = 1; month <= months; month += 1) {
    const interest = balance * monthlyRate;
    const amortization = month === months ? balance : Math.min(balance, amortizationBase);
    balance = Math.max(0, balance - amortization);
    rows.push({
      month,
      payment: interest + amortization,
      interest,
      amortization,
      endingBalance: balance,
    });
  }

  return rows;
}

function calculateIof(principal: number, schedule: LancePrimeInstallment[]) {
  const additional = principal * IOF_ADDITIONAL_RATE;
  const daily = schedule.reduce((sum, item) => {
    const days = Math.min(IOF_DAYS_LIMIT, item.month * 30);
    return sum + item.amortization * IOF_DAILY_RATE * days;
  }, 0);
  return { additional, daily, total: additional + daily };
}

function financeIof(netBid: number, monthlyRate: number, months: number) {
  let financedAmount = netBid;
  let schedule = buildPriceSchedule(financedAmount, monthlyRate, months);
  let iof = calculateIof(financedAmount, schedule);

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const nextAmount = netBid + iof.total;
    if (Math.abs(nextAmount - financedAmount) < 0.01) {
      financedAmount = nextAmount;
      break;
    }
    financedAmount = nextAmount;
    schedule = buildPriceSchedule(financedAmount, monthlyRate, months);
    iof = calculateIof(financedAmount, schedule);
  }

  schedule = buildPriceSchedule(financedAmount, monthlyRate, months);
  iof = calculateIof(financedAmount, schedule);
  return { financedAmount, schedule, iof };
}

function monthlyIrr(netAmount: number, payments: number[], fallback: number) {
  if (netAmount <= 0 || !payments.length) return fallback;
  const npv = (rate: number) => payments.reduce(
    (value, payment, index) => value + payment / Math.pow(1 + rate, index + 1),
    -netAmount
  );

  let low = 0;
  let high = Math.max(0.05, fallback * 4, 0.5);
  while (npv(high) > 0 && high < 10) high *= 2;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (low + high) / 2;
    if (npv(middle) > 0) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function proposalAdminName(proposal: ProposalModelRow) {
  const unifiedRows = proposal.promax?.cadenced_rows || proposal.promax?.unified_rows || [];
  if (Array.isArray(unifiedRows) && unifiedRows.length) {
    const names = Array.from(new Set(unifiedRows.map((row) => String(row.promax?.administradora || row.administradora || "").trim()).filter(Boolean)));
    if (names.length) return names.join(" + ");
  }
  return String(proposal.promax?.administradora || proposal.administradora || "Não informada").trim();
}

function proposedOwnBid(proposal: ProposalModelRow, credit: number, extratoOwnBid: number) {
  const own = onlyNumber(proposal.lance_proprio_valor) || extratoOwnBid;
  if (own > 0) return { value: own, estimated: false };
  const offered = onlyNumber(proposal.lance_ofertado_valor);
  const embedded = onlyNumber(proposal.lance_embutido_valor);
  if (offered > embedded) return { value: offered - embedded, estimated: false };
  return { value: credit * 0.5, estimated: true };
}

export function buildLancePrimeFlow(proposal: ProposalModelRow, params: LancePrimeParams): LancePrimeFlow {
  const extrato = buildExtratoFlow(proposal, params);
  const credit = creditoContratado(proposal);
  const adminName = proposalAdminName(proposal);
  const isEmbracon = normalizeText(adminName).includes("embracon");
  const reasons: string[] = [];

  if (credit < MINIMUM_CREDIT) reasons.push("Crédito simulado inferior a R$ 2 milhões.");
  if (!isEmbracon) reasons.push("O Lance Prime está disponível exclusivamente para operações Embracon.");

  const proposedBid = proposedOwnBid(proposal, credit, extrato.summary.ownBidAtContemplation);
  const financedBid = Math.max(0, proposedBid.value);
  const monthlyRate = Math.max(0, normalizeFraction(params.lance_prime_mensal));
  const termCandidate = Math.round(
    onlyNumber(proposal.lance_prime_prazo_meses) ||
    onlyNumber(proposal.novo_prazo) ||
    onlyNumber(proposal.prazo_venda) ||
    120
  );
  const termMonths = Math.max(12, Math.min(240, termCandidate));
  const financed = financeIof(financedBid, monthlyRate, termMonths);
  const installment = financed.schedule[0]?.payment || 0;
  const totalFinancingPayments = financed.schedule.reduce((sum, item) => sum + item.payment, 0);
  const cetMonthly = monthlyIrr(financedBid, financed.schedule.map((item) => item.payment), monthlyRate);
  const cetAnnual = Math.pow(1 + cetMonthly, 12) - 1;
  const consortiumRows = extrato.entries.filter((entry) => entry.kind === "month");
  const consortiumTotalPayments = consortiumRows.reduce((sum, entry) => sum + entry.installment, 0);
  const consortiumInstallment = extrato.summary.postContemplationInstallment || extrato.summary.nextInstallments || extrato.summary.firstInstallment;
  const mixedMonthlyCommitment = consortiumInstallment + installment;
  const mixedTotalPayments = consortiumTotalPayments + totalFinancingPayments;
  const traditionalAnnualRate = Math.max(0, normalizeFraction(params.fin_imob_anual));
  const traditionalMonthlyRate = Math.pow(1 + traditionalAnnualRate, 1 / 12) - 1;
  const traditionalPriceSchedule = buildPriceSchedule(credit, traditionalMonthlyRate, TRADITIONAL_FINANCING_TERM);
  const traditionalSacSchedule = buildSacSchedule(credit, traditionalMonthlyRate, TRADITIONAL_FINANCING_TERM);
  const traditionalInstallment = traditionalPriceSchedule[0]?.payment || 0;
  const traditionalTotalPayments = traditionalPriceSchedule.reduce((sum, item) => sum + item.payment, 0);
  const traditionalSacTotalPayments = traditionalSacSchedule.reduce((sum, item) => sum + item.payment, 0);
  const consortiumByMonth = new Map(consortiumRows.map((entry) => [entry.month, entry.installment]));
  const projectionMonths = Math.max(
    TRADITIONAL_FINANCING_TERM,
    financed.schedule.length,
    ...consortiumRows.map((entry) => entry.month)
  );
  const projection: LancePrimeProjectionRow[] = Array.from({ length: projectionMonths }, (_, index) => {
    const month = index + 1;
    const lanceInstallment = financed.schedule[index]?.payment || 0;
    const consortiumInstallment = consortiumByMonth.get(month) || 0;
    return {
      month,
      lanceInstallment,
      consortiumInstallment,
      totalInstallment: lanceInstallment + consortiumInstallment,
      priceInstallment: traditionalPriceSchedule[index]?.payment || 0,
      sacInstallment: traditionalSacSchedule[index]?.payment || 0,
    };
  });
  const projectionTotals = projection.reduce(
    (totals, item) => ({
      totalInstallment: totals.totalInstallment + item.totalInstallment,
      priceInstallment: totals.priceInstallment + item.priceInstallment,
      sacInstallment: totals.sacInstallment + item.sacInstallment,
    }),
    { totalInstallment: 0, priceInstallment: 0, sacInstallment: 0 }
  );

  return {
    eligible: reasons.length === 0,
    reasons,
    adminName,
    credit,
    financedBid,
    bidWasEstimated: proposedBid.estimated,
    bidPercent: credit > 0 ? financedBid / credit : 0,
    termMonths,
    monthlyRate,
    financedAmount: financed.financedAmount,
    iof: financed.iof.total,
    iofAdditional: financed.iof.additional,
    iofDaily: financed.iof.daily,
    installment,
    totalFinancingPayments,
    interestCost: Math.max(0, totalFinancingPayments - financed.financedAmount),
    cetMonthly,
    cetAnnual,
    consortiumInstallment,
    consortiumTotalPayments,
    mixedMonthlyCommitment,
    mixedTotalPayments,
    traditionalMonthlyRate,
    traditionalTermMonths: TRADITIONAL_FINANCING_TERM,
    traditionalInstallment,
    traditionalTotalPayments,
    traditionalSacFirstInstallment: traditionalSacSchedule[0]?.payment || 0,
    traditionalSacLastInstallment: traditionalSacSchedule[traditionalSacSchedule.length - 1]?.payment || 0,
    traditionalSacTotalPayments,
    projectedDifference: traditionalTotalPayments - mixedTotalPayments,
    availableCredit: extrato.summary.availableAtContemplation || credit,
    schedule: financed.schedule,
    projection,
    projectionTotals,
  };
}
