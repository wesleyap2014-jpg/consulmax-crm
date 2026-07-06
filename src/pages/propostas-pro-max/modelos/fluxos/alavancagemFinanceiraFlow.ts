import {
  buildExtratoFlow,
  creditoLiquido,
  onlyNumber,
} from "./extratoFlow";

function normalizeFraction(value) {
  const parsed = onlyNumber(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function monthEntries(entries) {
  return entries.filter((entry) => entry.kind === "month");
}

function eventEntries(entries) {
  return entries.filter((entry) => entry.kind === "event");
}

function sumInstallmentsUntil(entries, month) {
  return entries
    .filter((entry) => entry.month <= month)
    .reduce((sum, entry) => sum + entry.installment, 0);
}

function leverageMultiple(availableCredit, investedValue) {
  return investedValue > 0 ? availableCredit / investedValue : 0;
}

export function buildAlavancagemFinanceiraFlow(proposal, params) {
  const extrato = buildExtratoFlow(proposal, params);
  const entries = monthEntries(extrato.entries);
  const events = eventEntries(extrato.entries);
  const explicitContemplation = Math.max(0, Math.round(onlyNumber(proposal.parcela_contemplacao)));
  const contemplationMonth = Math.max(1, explicitContemplation || entries[entries.length - 1]?.month || 1);
  const installmentsPaid = sumInstallmentsUntil(entries, contemplationMonth);
  const creditAtContemplation =
    extrato.summary.creditAtContemplation ||
    extrato.summary.correctedContractedCredit ||
    extrato.summary.contractedCredit;
  const availableAtContemplation =
    extrato.summary.availableAtContemplation ||
    creditoLiquido(proposal) ||
    extrato.summary.liquidCredit ||
    creditAtContemplation;
  const ownBid = Math.max(0, extrato.summary.ownBidAtContemplation);
  const embeddedBid = Math.max(0, extrato.summary.embeddedBidAtContemplation);
  const fixedBidInvested = installmentsPaid + ownBid;
  const lotteryInvested = installmentsPaid;
  const premiumRate = normalizeFraction(params.alav_agio_pct);
  const resaleValue = fixedBidInvested * (1 + premiumRate);
  const premiumValue = Math.max(0, resaleValue - fixedBidInvested);
  const acceleratedRoi = fixedBidInvested > 0 ? premiumValue / fixedBidInvested : 0;
  const monthlyReturn = acceleratedRoi > 0
    ? Math.pow(1 + acceleratedRoi, 1 / Math.max(1, contemplationMonth)) - 1
    : 0;

  const sorteio = {
    key: "sorteio",
    label: "Contemplação por sorteio",
    description: "Considera apenas as parcelas pagas até a contemplação, sem aporte de lance próprio.",
    contemplationMonth,
    installmentsPaid,
    ownBid: 0,
    embeddedBid: 0,
    investedValue: lotteryInvested,
    availableCredit: creditAtContemplation,
    leverageMultiple: leverageMultiple(creditAtContemplation, lotteryInvested),
    projectedGain: Math.max(0, creditAtContemplation - lotteryInvested),
  };

  const lanceFixo = {
    key: "lance_fixo",
    label: "Lance fixo",
    description: "Considera as parcelas pagas somadas ao lance próprio estratégico na contemplação.",
    contemplationMonth,
    installmentsPaid,
    ownBid,
    embeddedBid,
    investedValue: fixedBidInvested,
    availableCredit: availableAtContemplation,
    leverageMultiple: leverageMultiple(availableAtContemplation, fixedBidInvested),
    projectedGain: Math.max(0, availableAtContemplation - fixedBidInvested),
  };

  const eventsByMonth = new Map();
  for (const event of events) {
    const current = eventsByMonth.get(event.month) || [];
    current.push(event);
    eventsByMonth.set(event.month, current);
  }

  const chart = entries.map((entry) => {
    const accumulatedInstallments = sumInstallmentsUntil(entries, entry.month);
    const acceleratedInvested = accumulatedInstallments + (entry.month >= contemplationMonth ? ownBid : 0);
    const acceleratedResaleValue = entry.month >= contemplationMonth ? acceleratedInvested * (1 + premiumRate) : 0;

    return {
      month: entry.month,
      installment: entry.installment,
      accumulatedInstallments,
      traditionalInvested: accumulatedInstallments + (entry.month >= contemplationMonth ? ownBid : 0),
      acceleratedResaleValue,
      acceleratedResult: Math.max(0, acceleratedResaleValue - acceleratedInvested),
      monthDetail: entry,
      events: eventsByMonth.get(entry.month) || [],
    };
  });

  return {
    correction: {
      label: extrato.index.label,
      annualRate: extrato.index.annualRate,
      monthlyRate: extrato.monthlyRate,
      source: extrato.index.source,
    },
    summary: {
      contemplationMonth,
      planTerm: extrato.summary.planTerm,
      contractedCredit: extrato.summary.contractedCredit,
      creditAtContemplation,
      availableAtContemplation,
      ownBidAtContemplation: ownBid,
      embeddedBidAtContemplation: embeddedBid,
      investmentUntilContemplation: fixedBidInvested,
    },
    traditional: {
      scenarios: [sorteio, lanceFixo],
      differenceInvested: lanceFixo.investedValue - sorteio.investedValue,
      differenceAvailableCredit: lanceFixo.availableCredit - sorteio.availableCredit,
    },
    accelerated: {
      premiumRate,
      contemplationMonth,
      installmentsPaid,
      ownBid,
      embeddedBid,
      strategicBid: ownBid + embeddedBid,
      investedValue: fixedBidInvested,
      resaleValue,
      premiumValue,
      grossResult: premiumValue,
      roi: acceleratedRoi,
      monthlyReturn,
      availableCredit: availableAtContemplation,
    },
    entries,
    events,
    chart,
  };
}
