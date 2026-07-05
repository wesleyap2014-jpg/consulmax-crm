export type ProposalModelRow = {
  code: number;
  created_at?: string | null;
  lead_nome?: string | null;
  lead_telefone?: string | null;
  segmento?: string | null;
  grupo?: string | null;
  credito?: number | string | null;
  valor_categoria?: number | string | null;
  novo_credito?: number | string | null;
  parcela_ate_1_ou_2?: number | string | null;
  parcela_demais?: number | string | null;
  parcela_escolhida?: number | string | null;
  parcela_contemplacao?: number | string | null;
  lance_embutido_valor?: number | string | null;
  lance_proprio_valor?: number | string | null;
  lance_ofertado_valor?: number | string | null;
  lance_embutido_pct?: number | string | null;
  lance_proprio_pct?: number | string | null;
  lance_ofertado_pct?: number | string | null;
  lance_percebido_pct?: number | string | null;
  saldo_devedor_final?: number | string | null;
  prazo_venda?: number | string | null;
  novo_prazo?: number | string | null;
  adm_tax_pct?: number | string | null;
  fr_tax_pct?: number | string | null;
  index_code?: string | null;
  index_12m_value?: number | string | null;
  administradora?: string | null;
  nome_tabela?: string | null;
  vendedor_nome?: string | null;
  vendedor_telefone?: string | null;
  vendedor_email?: string | null;
  vendedor_foto_url?: string | null;
  forma_contratacao?: string | null;
  parcela_termo?: number | string | null;
  parcela_limitante?: number | string | null;
  nova_parcela_sem_limite?: number | string | null;
  antecip_parcelas?: number | string | null;
  promax?: {
    administradora?: string | null;
    vendedor_nome?: string | null;
    vendedor_telefone?: string | null;
    vendedor_email?: string | null;
    vendedor_foto_url?: string | null;
  };
  [key: string]: unknown;
};

export type ProposalParams = {
  selic_anual: number;
  cdi_anual: number;
  reforco_pct: number;
  ipca12m: number;
  igpm12m: number;
  incc12m: number;
  inpc12m: number;
  fin_veic_mensal: number;
  fin_imob_anual: number;
  aluguel_pct: number;
  airbnb_pct: number;
  condominio_pct: number;
};

export type ExtratoMonthEntry = {
  kind: "month";
  month: number;
  credit: number;
  initialBalance: number;
  installment: number;
  payments: number;
  endingBalance: number;
};

export type ExtratoEventEntry = {
  kind: "event";
  month: number;
  title: string;
  details: string[];
};

export type ExtratoEntry = ExtratoMonthEntry | ExtratoEventEntry;

export type CorrectionIndex = {
  label: string;
  annualRate: number;
  source: string;
};

export type ExtratoFlow = {
  index: CorrectionIndex;
  monthlyRate: number;
  entries: ExtratoEntry[];
  totalMonths: number;
  summary: {
    baseCredit: number;
    contractedCredit: number;
    liquidCredit: number;
    firstInstallment: number;
    nextInstallments: number;
    postContemplationInstallment: number;
    debt: number;
    correctedBaseCredit: number;
    correctedContractedCredit: number;
    correctedLiquidCredit: number;
    correctedDebt: number;
    correctionValue: number;
    creditAtContemplation: number;
    embeddedBidAtContemplation: number;
    availableAtContemplation: number;
    ownBidAtContemplation: number;
    investmentUntilContemplation: number;
    adminTaxPct: number;
    reserveTaxPct: number;
  };
};

export function onlyNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const cleaned = value
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function brMoney(value: unknown) {
  return onlyNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeIndexRate(value: unknown) {
  const parsed = onlyNumber(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function normalizeFraction(value: unknown) {
  const parsed = onlyNumber(value);
  if (!parsed) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

export function resolveCorrectionIndex(row: ProposalModelRow, params: ProposalParams): CorrectionIndex {
  const explicitCode = normalizeText(row.index_code).toUpperCase();
  const explicitRate = normalizeIndexRate(row.index_12m_value);

  if (explicitRate > 0) {
    return {
      label: row.index_code ? String(row.index_code).toUpperCase() : "Índice informado",
      annualRate: explicitRate,
      source: "Valor gravado na simulação",
    };
  }

  if (explicitCode.includes("INCC")) return { label: "INCC", annualRate: normalizeFraction(params.incc12m), source: "Parâmetros Pró Max" };
  if (explicitCode.includes("IGPM") || explicitCode.includes("IGP")) return { label: "IGP-M", annualRate: normalizeFraction(params.igpm12m), source: "Parâmetros Pró Max" };
  if (explicitCode.includes("INPC")) return { label: "INPC", annualRate: normalizeFraction(params.inpc12m), source: "Parâmetros Pró Max" };
  if (explicitCode.includes("IPCA")) return { label: "IPCA", annualRate: normalizeFraction(params.ipca12m), source: "Parâmetros Pró Max" };

  const segment = normalizeText(row.segmento);
  if (segment.includes("imovel") || segment.includes("imob")) {
    return { label: "INCC", annualRate: normalizeFraction(params.incc12m), source: "Inferido pelo segmento" };
  }

  return { label: "IPCA", annualRate: normalizeFraction(params.ipca12m), source: "Padrão Pró Max" };
}

export function creditoContratado(row: ProposalModelRow) {
  return onlyNumber(row.credito) || onlyNumber(row.valor_categoria) || onlyNumber(row.novo_credito);
}

export function valorCategoria(row: ProposalModelRow) {
  return onlyNumber(row.valor_categoria) || creditoContratado(row);
}

export function creditoLiquido(row: ProposalModelRow) {
  const novoCredito = onlyNumber(row.novo_credito);
  if (novoCredito > 0) return novoCredito;
  return Math.max(0, creditoContratado(row) - onlyNumber(row.lance_embutido_valor));
}

function parcelaInicial(row: ProposalModelRow) {
  return onlyNumber(row.parcela_ate_1_ou_2) || onlyNumber(row.parcela_escolhida);
}

function demaisParcelas(row: ProposalModelRow) {
  return onlyNumber(row.parcela_demais) || onlyNumber(row.parcela_escolhida) || parcelaInicial(row);
}

function parcelaAposContemplacao(row: ProposalModelRow) {
  return (
    onlyNumber(row.parcela_escolhida) ||
    onlyNumber(row.nova_parcela_sem_limite) ||
    onlyNumber(row.parcela_limitante) ||
    demaisParcelas(row)
  );
}

function specialInstallmentMonths(row: ProposalModelRow) {
  const explicitMonths = Math.max(0, Math.round(onlyNumber(row.antecip_parcelas)));
  if (explicitMonths > 0) return explicitMonths;

  const first = onlyNumber(row.parcela_ate_1_ou_2);
  const regular = onlyNumber(row.parcela_demais) || onlyNumber(row.parcela_escolhida);
  return first > 0 && regular > 0 && Math.abs(first - regular) > 0.01 ? 2 : 0;
}

function monthlyAnticipationValue(row: ProposalModelRow) {
  return Math.max(0, parcelaInicial(row) - demaisParcelas(row));
}

function lancePago(row: ProposalModelRow) {
  return (
    onlyNumber(row.lance_ofertado_valor) ||
    onlyNumber(row.lance_embutido_valor) + onlyNumber(row.lance_proprio_valor)
  );
}

function bidPctFromValue(value: unknown, base: number) {
  return base > 0 ? onlyNumber(value) / base : 0;
}

function bidAtCredit(row: ProposalModelRow, credit: number, contractedCredit: number) {
  const totalPct =
    normalizeFraction(row.lance_ofertado_pct) ||
    bidPctFromValue(row.lance_ofertado_valor, contractedCredit);
  const embeddedPct =
    normalizeFraction(row.lance_embutido_pct) ||
    bidPctFromValue(row.lance_embutido_valor, contractedCredit);
  const ownPct =
    normalizeFraction(row.lance_proprio_pct) ||
    Math.max(0, totalPct - embeddedPct) ||
    bidPctFromValue(row.lance_proprio_valor, contractedCredit);

  const total = credit * totalPct;
  const embedded = total > 0 ? Math.min(total, credit * embeddedPct) : credit * embeddedPct;
  const own = Math.max(0, total || credit * ownPct) - embedded;

  return {
    total: total || embedded + Math.max(0, credit * ownPct),
    embedded,
    own: Math.max(0, own),
  };
}

function baseInstallmentForMonth(row: ProposalModelRow, month: number, contemplated: boolean) {
  const antecipParcelas = specialInstallmentMonths(row);
  const first = parcelaInicial(row);

  if (contemplated && antecipParcelas > 0 && month <= antecipParcelas) {
    return parcelaAposContemplacao(row) + monthlyAnticipationValue(row);
  }

  if (antecipParcelas > 0 && month <= antecipParcelas && first > 0) return first;
  if (contemplated) return parcelaAposContemplacao(row);

  const regular = demaisParcelas(row);
  return regular || first;
}

export function buildExtratoFlow(proposal: ProposalModelRow, params: ProposalParams): ExtratoFlow {
  const index = resolveCorrectionIndex(proposal, params);
  const annualRate = index.annualRate;
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  const baseCredit = valorCategoria(proposal);
  const contractedCredit = creditoContratado(proposal);
  const liquidCredit = creditoLiquido(proposal);
  const firstInstallment = parcelaInicial(proposal);
  const nextInstallments = demaisParcelas(proposal);
  const postContemplationInstallment = parcelaAposContemplacao(proposal);
  const debt = onlyNumber(proposal.saldo_devedor_final) || Math.max(0, baseCredit - lancePago(proposal));
  const adminTaxPct = normalizeFraction(proposal.adm_tax_pct);
  const reserveTaxPct = normalizeFraction(proposal.fr_tax_pct);
  const totalTaxPct = adminTaxPct + reserveTaxPct;
  const contemplationMonth = Math.max(0, Math.round(onlyNumber(proposal.parcela_contemplacao)));
  const newTerm = Math.max(0, Math.round(onlyNumber(proposal.novo_prazo)));
  const saleTerm = Math.max(0, Math.round(onlyNumber(proposal.prazo_venda)));
  const plannedMonths = contemplationMonth > 0 && newTerm > 0
    ? contemplationMonth + newTerm
    : Math.max(saleTerm, newTerm, 1);
  const bidPaid = lancePago(proposal);
  const initialBid = bidAtCredit(proposal, contractedCredit, contractedCredit);

  const entries: ExtratoEntry[] = [];
  let month = 1;
  let credit = contractedCredit;
  let balance = baseCredit;
  let payments = 0;
  let installmentCorrectionFactor = 1;
  let postContemplationInstallmentExtra = 0;
  let contemplated = false;
  let guard = 0;
  let creditAtContemplation = contemplationMonth > 0 ? contractedCredit : contractedCredit;
  let embeddedBidAtContemplation = initialBid.embedded || onlyNumber(proposal.lance_embutido_valor);
  let ownBidAtContemplation = initialBid.own || onlyNumber(proposal.lance_proprio_valor);
  let availableAtContemplation = Math.max(0, creditAtContemplation - embeddedBidAtContemplation);
  let investmentUntilContemplation = 0;

  while (month <= plannedMonths && balance > 0 && guard < 420) {
    guard += 1;

    if (month > 1 && (month - 1) % 12 === 0) {
      const correctionBase = contemplated ? balance : credit;
      const correctionValue = correctionBase * annualRate;
      const taxValue = contemplated ? 0 : correctionValue * totalTaxPct;
      const totalAdjustment = correctionValue + taxValue;

      credit += correctionValue;
      balance += totalAdjustment;

      if (contemplated) {
        const remainingTerm = Math.max(1, plannedMonths - month + 1);
        postContemplationInstallmentExtra += correctionValue / remainingTerm;
      } else {
        const factor = correctionBase > 0 ? (correctionBase + totalAdjustment) / correctionBase : 1;
        installmentCorrectionFactor *= factor;
      }

      entries.push({
        kind: "event",
        month,
        title: "Correção",
        details: contemplated
          ? [
              "Base: saldo devedor",
              `Saldo pré: ${brMoney(correctionBase)}`,
              `Correção: ${brMoney(correctionValue)}`,
              `Impacto mensal: ${brMoney(correctionValue / Math.max(1, plannedMonths - month + 1))}`,
              `Nova parcela: ${brMoney(baseInstallmentForMonth(proposal, month, contemplated) * installmentCorrectionFactor + postContemplationInstallmentExtra)}`,
            ]
          : [
              "Base: crédito contratado",
              `Crédito pré: ${brMoney(correctionBase)}`,
              `Correção: ${brMoney(correctionValue)}`,
              `Taxas: ${brMoney(taxValue)}`,
              `Nova parcela: ${brMoney(baseInstallmentForMonth(proposal, month, contemplated) * installmentCorrectionFactor)}`,
            ],
      });
    }

    const initialBalance = balance;
    const installment = baseInstallmentForMonth(proposal, month, contemplated) * installmentCorrectionFactor + (contemplated ? postContemplationInstallmentExtra : 0);
    const monthlyPayment = Math.min(installment, balance);
    payments += monthlyPayment;
    balance = Math.max(0, balance - monthlyPayment);

    entries.push({
      kind: "month",
      month,
      credit,
      initialBalance,
      installment: monthlyPayment,
      payments,
      endingBalance: balance,
    });

    if (!contemplated && contemplationMonth > 0 && month === contemplationMonth) {
      const balanceBeforeBid = balance;
      const correctedBid = bidAtCredit(proposal, credit, contractedCredit);
      const paidBid = correctedBid.total || bidPaid;
      const nextInstallmentAfterContemplation =
        baseInstallmentForMonth(proposal, month + 1, true) * installmentCorrectionFactor + postContemplationInstallmentExtra;

      creditAtContemplation = credit;
      embeddedBidAtContemplation = correctedBid.embedded;
      ownBidAtContemplation = correctedBid.own;
      availableAtContemplation = Math.max(0, credit - correctedBid.embedded);
      investmentUntilContemplation = payments + correctedBid.own;
      balance = Math.max(0, balance - paidBid);
      payments += paidBid;
      contemplated = true;

      entries.push({
        kind: "event",
        month,
        title: "Contemplação",
        details: [
          `Crédito corrigido: ${brMoney(credit)}`,
          `Lance pago: ${brMoney(paidBid)}`,
          `Saldo antes do lance: ${brMoney(balanceBeforeBid)}`,
          `Saldo após o lance: ${brMoney(balance)}`,
          `Nova parcela: ${brMoney(nextInstallmentAfterContemplation)}`,
          `Novo prazo: ${newTerm || "-"} meses`,
        ],
      });
    }

    month += 1;
  }

  return {
    index,
    monthlyRate,
    entries,
    totalMonths: Math.max(1, month - 1),
    summary: {
      baseCredit,
      contractedCredit,
      liquidCredit,
      firstInstallment,
      nextInstallments,
      postContemplationInstallment,
      debt,
      correctedBaseCredit: baseCredit * (1 + annualRate),
      correctedContractedCredit: contractedCredit * (1 + annualRate),
      correctedLiquidCredit: liquidCredit * (1 + annualRate),
      correctedDebt: debt * (1 + annualRate),
      correctionValue: baseCredit * annualRate,
      creditAtContemplation,
      embeddedBidAtContemplation,
      availableAtContemplation,
      ownBidAtContemplation,
      investmentUntilContemplation,
      adminTaxPct,
      reserveTaxPct,
    },
  };
}
