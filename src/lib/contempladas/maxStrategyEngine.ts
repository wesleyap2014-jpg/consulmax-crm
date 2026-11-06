// MAX 2.0: motor financeiro determinístico. Não chama IA e não acessa dados externos.
// A API deve fornecer somente cotas atualizadas e disponíveis.
export type MaxSegment = "Automóvel" | "Imóvel" | "Pesados" | "Motocicletas" | "Serviços";
export type MaxPriority = "geral" | "entrada" | "parcela" | "saldo";
export type MaxOrigin = "externo" | "crm" | "ambos";

export type MaxCriteria = {
  segmento?: MaxSegment;
  credito?: number;
  preco?: number;
  avaliacao?: number;
  recursos?: number;
  parcelaMax?: number;
  prioridade?: MaxPriority;
  maxCotas?: number;
};

export type MaxStockRow = {
  id: string;
  codigo: string;
  segmento: MaxSegment;
  status: string;
  partnerId: string;
  adminId: string;
  administradora: string;
  origem: "externo" | "crm";
  credito: number;
  entradaBase: number;
  parcelas: number;
  valorParcela: number;
  taxaTransferencia?: number | null;
  transferenciaConfirmadaIsenta?: boolean;
  regraVeiculo?: string | null;
};

export type MaxInstallmentRange = { inicio: number; fim: number; quantidade: number; valor: number };
export type MaxOffer = {
  id: string;
  ids: string[];
  codigos: string[];
  segmento: MaxSegment;
  administradora: string;
  origem: string;
  qtdCotas: number;
  credito: number;
  entrada: number;
  saldo: number;
  parcelaInicial: number;
  parcelas: MaxInstallmentRange[];
  prazoMaximo: number;
  custoTotalNominal: number;
  complementoCompra: number;
  desembolsoInicial: number;
  recursosRestantes: number | null;
  deficit: number;
  diferencaCreditoSaldo: number;
  atendeParcela: boolean | null;
  atendeAvaliacao: boolean | null;
  atendeOrcamento: boolean | null;
  atendeCredito: boolean | null;
  viavelNosCriterios: boolean;
  alertas: string[];
  pontosPositivos: string[];
  pontuacao: number;
  titulo?: string;
};

export const MAX_VENDOR_COMMISSION_OPTIONS = [0.005, 0.01, 0.015, 0.02, 0.025] as const;
export const MAX_DEFAULT_VENDOR_COMMISSION = 0.025;
export const MAX_CONSULMAX_COMMISSION = 0.025;
export const MAX_EXTERNAL_BASE_COMMISSION = MAX_DEFAULT_VENDOR_COMMISSION + MAX_CONSULMAX_COMMISSION;

export const maxMoney = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const roundBRL = (n: number) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

export function maxNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const s = raw.replace(/R\$\s?/g, "").replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  if (s.includes(",")) return Number(s.replace(",", ".")) || 0;
  return Number(s) || 0;
}

export function maxNorm(text: unknown): string {
  return String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function maxExternalSegment(category: unknown): MaxSegment {
  const value = maxNorm(category);
  if (value.includes("imovel")) return "Imóvel";
  if (value.includes("moto")) return "Motocicletas";
  if (["caminhao", "pesado", "trator", "maquina", "onibus", "agricol", "implemento"].some((v) => value.includes(v))) return "Pesados";
  if (value.includes("servico")) return "Serviços";
  return "Automóvel";
}

export function maxValidCommission(pct: number): boolean {
  return MAX_VENDOR_COMMISSION_OPTIONS.some((allowed) => Math.abs(allowed - pct) < 0.00001);
}

export function maxEntrada(row: MaxStockRow, vendorPct: number): number {
  if (!maxValidCommission(vendorPct)) throw new Error("Percentual de comissão não permitido.");
  return roundBRL(row.entradaBase + row.credito * (vendorPct + MAX_CONSULMAX_COMMISSION));
}

export function maxExternalRow(raw: Record<string, unknown>): MaxStockRow | null {
  const credito = maxNumber(raw.valor_credito);
  const entrada = maxNumber(raw.entrada);
  const semComissao = maxNumber(raw.entrada_sem_comissao);
  const entradaBase = semComissao > 0 ? semComissao : Math.max(0, entrada - credito * MAX_EXTERNAL_BASE_COMMISSION);
  const codigo = String(raw.id ?? "").trim();
  if (!codigo || !credito) return null;
  const reserva = maxNorm(raw.reserva);
  const status = reserva.includes("reservad") || reserva.includes("vendid") || reserva.includes("transferid") || reserva.includes("indispon") ? "reservada" : "disponivel";
  const administrador = String(raw.administradora || "Administradora não informada").slice(0, 120);
  return {
    id: "external-" + codigo,
    codigo,
    segmento: maxExternalSegment(raw.categoria),
    status,
    partnerId: "external",
    adminId: "external-admin-" + maxNorm(administrador).replace(/\s+/g, "-"),
    administradora: administrador,
    origem: "externo",
    credito: roundBRL(credito),
    entradaBase: roundBRL(entradaBase),
    parcelas: Math.floor(maxNumber(raw.parcelas)),
    valorParcela: roundBRL(maxNumber(raw.valor_parcela)),
    taxaTransferencia: typeof raw.taxa_transferencia === "number" ? raw.taxa_transferencia : null,
    transferenciaConfirmadaIsenta: false,
  };
}

export function maxInternalRow(raw: Record<string, any>): MaxStockRow {
  return {
    id: String(raw.id),
    codigo: String(raw.codigo || ""),
    segmento: raw.segmento as MaxSegment,
    status: String(raw.status || ""),
    partnerId: String(raw.partner_id || raw.partner?.id || ""),
    adminId: String(raw.admin_id || raw.admin?.id || ""),
    administradora: String(raw.admin?.nome || "Administradora não informada"),
    origem: "crm",
    credito: roundBRL(maxNumber(raw.credito_disponivel)),
    entradaBase: roundBRL(maxNumber(raw.valor_pago_ao_cliente)),
    parcelas: Math.floor(maxNumber(raw.prazo_restante)),
    valorParcela: roundBRL(maxNumber(raw.valor_parcela)),
    taxaTransferencia: null,
    transferenciaConfirmadaIsenta: false,
  };
}

export function maxParcelaRanges(rows: MaxStockRow[]): MaxInstallmentRange[] {
  const endDates = [...new Set(rows.map((r) => r.parcelas).filter((n) => n > 0 && Number.isInteger(n)))].sort((a, b) => a - b);
  let inicio = 1;
  const faixas: MaxInstallmentRange[] = [];
  for (const fim of endDates) {
    const valor = roundBRL(rows.filter((r) => r.parcelas >= inicio).reduce((sum, c) => sum + c.valorParcela, 0));
    if (valor > 0 && fim >= inicio) faixas.push({ inicio, fim, quantidade: fim - inicio + 1, valor });
    inicio = fim + 1;
  }
  return faixas;
}

export function maxEvaluateOffer(rows: MaxStockRow[], criteria: MaxCriteria, vendorPct: number): MaxOffer {
  if (!rows.length) throw new Error("A composição não contém cotas.");
  const admin = rows[0];
  if (!rows.every((r) => r.status === "disponivel" && r.partnerId === admin.partnerId && r.adminId === admin.adminId && r.segmento === admin.segmento)) {
    throw new Error("A combinação não respeita as restrições de administradora, parceiro, segmento ou disponibilidade.");
  }
  const credito = roundBRL(rows.reduce((a, c) => a + c.credito, 0));
  const entrada = roundBRL(rows.reduce((a, c) => a + maxEntrada(c, vendorPct), 0));
  const saldo = roundBRL(rows.reduce((a, c) => a + c.valorParcela * c.parcelas, 0));
  const parcelaInicial = roundBRL(rows.reduce((a, c) => a + c.valorParcela, 0));
  const preco = Number(criteria.preco || 0);
  const recursosInformados = criteria.recursos !== undefined;
  const recursos = Number(criteria.recursos || 0);
  const target = Number(criteria.credito || preco || 0);
  const complementoCompra = preco > 0 ? roundBRL(Math.max(0, preco - credito)) : 0;
  const desembolsoInicial = roundBRL(entrada + complementoCompra);
  const recursosRestantes = recursosInformados ? roundBRL(recursos - desembolsoInicial) : null;
  const deficit = recursosInformados ? roundBRL(Math.max(0, desembolsoInicial - recursos)) : 0;
  const atendeParcela = criteria.parcelaMax !== undefined ? parcelaInicial <= criteria.parcelaMax + 0.005 : null;
  const atendeAvaliacao = criteria.avaliacao !== undefined ? saldo <= criteria.avaliacao + 0.005 : null;
  const atendeOrcamento = recursosInformados ? deficit === 0 : null;
  const atendeCredito = target > 0 ? credito >= target * 0.90 : null;
  const alertas: string[] = [];
  const pontosPositivos: string[] = [];
  if (atendeOrcamento === false) alertas.push("Faltam " + maxMoney(deficit) + " para cobrir entrada e complemento de compra.");
  if (atendeParcela === false) alertas.push("Parcela inicial acima do limite informado.");
  if (atendeAvaliacao === false) alertas.push("Saldo nominal acima da avaliação informada; análise da administradora necessária.");
  if (atendeCredito === false) alertas.push("Crédito abaixo de 90% do objetivo. Verifique complemento de aquisição.");
  if (preco > 0 && complementoCompra > 0) alertas.push("Compra exige complemento de " + maxMoney(complementoCompra) + " além da entrada.");
  if (atendeOrcamento === true) pontosPositivos.push("Desembolso inicial dentro dos recursos.");
  if (atendeParcela === true) pontosPositivos.push("Parcela inicial dentro do limite.");
  if (atendeAvaliacao === true) pontosPositivos.push("Saldo nominal abaixo da avaliação informada.");
  if (rows.length === 1) pontosPositivos.push("Operação com uma única carta.");
  const faixas = maxParcelaRanges(rows);
  if (faixas.length > 1) pontosPositivos.push("As parcelas diminuem após o encerramento de uma ou mais cartas.");
  const viavelNosCriterios = [atendeOrcamento, atendeParcela, atendeAvaliacao, atendeCredito].every((v) => v !== false);
  const creditoGap = target > 0 ? Math.abs(credito - target) / Math.max(target, 1) : 0;
  const prioridade = criteria.prioridade || "geral";
  const weightEntrada = prioridade === "entrada" ? 1.8 : 0.36;
  const weightParcela = prioridade === "parcela" ? 1.8 : 0.42;
  const weightSaldo = prioridade === "saldo" ? 1.8 : 0.30;
  const denominator = Math.max(credito, target, 1);
  const parcelaDen = Math.max(Number(criteria.parcelaMax || 0), parcelaInicial, 1);
  const score =
    (viavelNosCriterios ? 0 : 900) +
    (recursosInformados ? deficit / denominator * 950 : 0) +
    (atendeParcela === false ? (parcelaInicial - Number(criteria.parcelaMax)) / parcelaDen * 400 : 0) +
    (atendeAvaliacao === false ? (saldo - Number(criteria.avaliacao)) / denominator * 500 : 0) +
    creditoGap * 135 +
    entrada / denominator * weightEntrada * 50 +
    parcelaInicial / parcelaDen * weightParcela * 10 +
    saldo / denominator * weightSaldo * 45 +
    (rows.length - 1) * 5;
  return {
    id: rows.map((r) => r.id).sort().join("|"),
    ids: rows.map((r) => r.id),
    codigos: rows.map((r) => r.codigo),
    segmento: admin.segmento,
    administradora: admin.administradora,
    origem: admin.origem,
    qtdCotas: rows.length,
    credito, entrada, saldo, parcelaInicial, parcelas: faixas,
    prazoMaximo: Math.max(...rows.map((r) => r.parcelas)),
    custoTotalNominal: roundBRL(entrada + saldo),
    complementoCompra, desembolsoInicial, recursosRestantes, deficit,
    diferencaCreditoSaldo: roundBRL(credito - saldo),
    atendeParcela, atendeAvaliacao, atendeOrcamento, atendeCredito,
    viavelNosCriterios,
    alertas, pontosPositivos, pontuacao: roundBRL(score),
  };
}


/**
 * Busca progressiva com largura de feixe variável.
 * NÃO impõe quantidade máxima de cartas por proposta: o limite natural é o
 * próprio estoque compatível e o valor do crédito. O orçamento computacional
 * limita quantas COMBINAÇÕES serão analisadas, não quantas cartas podem compor
 * uma alternativa. Quando a busca for parcial, o retorno indica isso.
 */
const MAX_SEARCH_EXPANSIONS = 240_000;
const MAX_GROUP_EXPANSIONS = 120_000;
const MAX_STOCK_SAMPLES = 180;

function maxCandidatePool(group: MaxStockRow[], target: number): { rows: MaxStockRow[]; sampled: boolean } {
  const ascending = [...group].sort((a, b) => a.credito - b.credito || a.codigo.localeCompare(b.codigo));
  if (ascending.length <= MAX_STOCK_SAMPLES) return { rows: ascending, sampled: false };
  const picked = new Map<string, MaxStockRow>();
  const take = (rows: MaxStockRow[], n: number) => rows.slice(0, n).forEach((row) => picked.set(row.id, row));
  const probes = new Set([1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 50, 64, 80, 100]);
  const smallest = ascending[0]?.credito || 1;
  const probable = Math.ceil(target / Math.max(smallest, 1));
  probes.add(Math.max(1, probable));
  probes.add(Math.max(1, Math.floor(probable / 2)));
  for (const count of probes) {
    const ideal = target / count;
    take([...ascending].sort((a, b) => Math.abs(a.credito - ideal) - Math.abs(b.credito - ideal)), 8);
  }
  take(ascending, 34);
  take([...ascending].sort((a, b) => a.entradaBase - b.entradaBase), 28);
  take([...ascending].sort((a, b) => a.valorParcela - b.valorParcela), 22);
  take([...ascending].sort((a, b) => a.valorParcela * a.parcelas - b.valorParcela * b.parcelas), 22);
  const rows = [...picked.values()].sort((a, b) => a.credito - b.credito || a.codigo.localeCompare(b.codigo)).slice(0, MAX_STOCK_SAMPLES);
  return { rows, sampled: rows.length < group.length };
}

type MaxSearchPartial = { items: MaxStockRow[]; last: number; credito: number; entrada: number; parcela: number };
const partKey = (p: MaxSearchPartial) => p.items.map((x) => x.id).join("|");
const sortPartial = (a: MaxSearchPartial, b: MaxSearchPartial) => a.last - b.last || a.credito - b.credito;
const scorePartial = (p: MaxSearchPartial, target: number, expectedCount: number) =>
  Math.abs(p.credito - target * Math.min(1, p.items.length / Math.max(1, expectedCount))) / Math.max(1, target);

export function maxSearchStrategies(
  stock: MaxStockRow[], criteria: MaxCriteria, vendorPct: number, limit = 3
): { offers: MaxOffer[]; count: number; inspected: number; limited: boolean; reason: string } {
  if (!maxValidCommission(vendorPct)) throw new Error("Comissão inválida.");
  const target = Number(criteria.credito || criteria.preco || 0);
  if (!Number.isFinite(target) || target <= 0) {
    return { offers: [], count: 0, inspected: 0, limited: false, reason: "Informe o crédito ou preço aproximado do bem." };
  }
  const eligible = stock.filter((row) =>
    row.status === "disponivel" && row.credito > 0 && row.parcelas > 0 &&
    row.valorParcela > 0 && Number.isFinite(row.entradaBase) &&
    (!criteria.segmento || row.segmento === criteria.segmento));
  const groupMap = new Map<string, MaxStockRow[]>();
  for (const row of eligible) {
    const key = [row.partnerId, row.adminId, row.segmento].join("|");
    groupMap.set(key, [...(groupMap.get(key) || []), row]);
  }
  const maxCredit = Math.max(target * 1.4, target + 50000);
  const allOffers = new Map<string, MaxOffer>();
  let inspected = 0;
  let limited = false;
  // maxCotas = 0 ou ausente: nenhuma restrição de quantidade; > 0: pedido explícito do vendedor.
  const requestedMaximum = criteria.maxCotas && criteria.maxCotas > 0 ? Math.floor(criteria.maxCotas) : null;
  for (const group of groupMap.values()) {
    if (inspected >= MAX_SEARCH_EXPANSIONS) { limited = true; break; }
    const compatible = group.filter((row) => row.credito <= maxCredit);
    const { rows: candidates, sampled } = maxCandidatePool(compatible, target);
    if (!candidates.length) continue;
    if (sampled) limited = true;
    const smallest = candidates[0].credito;
    const possibleByValue = Math.max(1, Math.floor((maxCredit + 0.005) / smallest));
    const maxDepth = Math.min(candidates.length, possibleByValue, requestedMaximum ?? candidates.length);
    const totalGroupBudget = Math.min(MAX_GROUP_EXPANSIONS, MAX_SEARCH_EXPANSIONS - inspected);
    let groupChecked = 0;
    const orderedCredit = candidates.map((row) => row.credito).sort((a, b) => a - b);
    const median = orderedCredit[Math.floor(orderedCredit.length / 2)] || smallest;
    const expectedCount = Math.max(1, Math.min(maxDepth, Math.round(target / median)));
    let beam: MaxSearchPartial[] = [{ items: [], last: -1, credito: 0, entrada: 0, parcela: 0 }];
    for (let depth = 1; depth <= maxDepth && beam.length; depth++) {
      const expanded: MaxSearchPartial[] = [];
      outer: for (const partial of beam) {
        for (let idx = partial.last + 1; idx < candidates.length; idx++) {
          if (groupChecked >= totalGroupBudget) { limited = true; break outer; }
          const row = candidates[idx];
          groupChecked++;
          inspected++;
          const credito = partial.credito + row.credito;
          if (credito > maxCredit) continue;
          const next = {
            items: [...partial.items, row], last: idx, credito,
            entrada: partial.entrada + maxEntrada(row, vendorPct),
            parcela: partial.parcela + row.valorParcela
          };
          expanded.push(next);
        }
      }
      if (!expanded.length) break;
      // Diversificação: composição próxima, parcelas leves, entrada baixa e
      // avanço progressivo para possibilitar junções com muitas cartas.
      const byCredit = [...expanded].sort((a, b) =>
        Math.abs(a.credito - target) - Math.abs(b.credito - target) || sortPartial(a, b)).slice(0, 70);
      const byProgress = [...expanded].sort((a, b) =>
        scorePartial(a, target, expectedCount) - scorePartial(b, target, expectedCount) || sortPartial(a, b)).slice(0, 75);
      const byEntrada = [...expanded].sort((a, b) => a.entrada - b.entrada || sortPartial(a, b)).slice(0, 48);
      const byParcela = [...expanded].sort((a, b) => a.parcela - b.parcela || sortPartial(a, b)).slice(0, 48);
      const byContinuity = [...expanded].sort(sortPartial).slice(0, 25);
      const diverse = new Map<string, MaxSearchPartial>();
      for (const item of [...byCredit, ...byProgress, ...byEntrada, ...byParcela, ...byContinuity]) diverse.set(partKey(item), item);
      const promising = [...diverse.values()];
      if (expanded.length > promising.length) limited = true;
      for (const partial of promising) {
        if (partial.credito < target * 0.55 || partial.credito > maxCredit) continue;
        const evaluated = maxEvaluateOffer(partial.items, criteria, vendorPct);
        allOffers.set(evaluated.id, evaluated);
      }
      // Ajuste pela profundidade natural: buscar muitas cotas não pode consumir
      // todo o processamento nas primeiras iterações.
      const adaptiveBeam = Math.max(5, Math.floor(totalGroupBudget / Math.max(1, candidates.length * maxDepth)));
      const beamWidth = Math.min(depth < 8 ? 105 : depth < 18 ? 56 : depth < 40 ? 28 : 14, adaptiveBeam);
      // Mistura os melhores de cada prioridade sem consumir todo o feixe com uma só.
      const nextBeam = new Map<string, MaxSearchPartial>();
      const sources = [byCredit, byProgress, byEntrada, byParcela, byContinuity];
      const perSource = Math.max(3, Math.ceil(beamWidth / sources.length));
      for (const source of sources)
        for (const item of source.slice(0, perSource)) nextBeam.set(partKey(item), item);
      for (const item of promising) {
        if (nextBeam.size >= beamWidth) break;
        nextBeam.set(partKey(item), item);
      }
      beam = [...nextBeam.values()].sort(sortPartial);
      if (expanded.length > beam.length) limited = true;
      if (groupChecked >= totalGroupBudget) break;
      // Uma vez que nenhuma combinação pode receber outra carta sem ultrapassar
      // o crédito tolerado, a profundidade se esgotou naturalmente.
    }
  }
  const offers = [...allOffers.values()];
  if (!offers.length) {
    return { offers: [], count: eligible.length, inspected, limited,
      reason: eligible.length ? "Não foram encontradas composições próximas ao objetivo no estoque atual." :
        "Não há cotas disponíveis para os critérios informados." };
  }
  offers.sort((a, b) => a.pontuacao - b.pontuacao || a.qtdCotas - b.qtdCotas || a.id.localeCompare(b.id));
  const selected: MaxOffer[] = [];
  const take = (offer: MaxOffer | undefined, title: string) => {
    if (offer && !selected.some((s) => s.id === offer.id)) selected.push({ ...offer, titulo: title });
  };
  take(offers[0], "Melhor estratégia geral");
  const remaining = () => offers.filter((offer) => !selected.some((s) => s.id === offer.id));
  const alternatives = remaining();
  if (alternatives.length) {
    const viable = alternatives.filter((offer) => offer.viavelNosCriterios);
    const pool = viable.length ? viable : alternatives;
    take([...pool].sort((a, b) => a.desembolsoInicial - b.desembolsoInicial || a.pontuacao - b.pontuacao)[0], "Menor desembolso inicial");
  }
  if (selected.length < limit) {
    const rest = remaining();
    const byPriority = criteria.prioridade === "saldo" ?
      [...rest].sort((a, b) => a.saldo - b.saldo || a.pontuacao - b.pontuacao) :
      [...rest].sort((a, b) => a.parcelaInicial - b.parcelaInicial || a.pontuacao - b.pontuacao);
    take(byPriority[0], criteria.prioridade === "saldo" ? "Menor saldo nominal" : "Menor parcela inicial");
  }
  return { offers: selected.slice(0, limit), count: eligible.length, inspected, limited,
    reason: selected[0]?.viavelNosCriterios ?
      "Alternativas encontradas; aprovação, disponibilidade e avaliação final dependem da administradora." :
      "Nenhuma alternativa avaliada atende a todos os limites informados; veja as restrições em cada cartão." };
}

export function maxCommercialText(offer: MaxOffer): string {
  const icon = offer.segmento === "Imóvel" ? "🏠" : offer.segmento === "Pesados" ? "🚜" : offer.segmento === "Motocicletas" ? "🏍️" : "🚘";
  const lines = [
    icon + " *OPORTUNIDADE | CARTA CONTEMPLADA*",
    "",
    "💰 *Crédito:* " + maxMoney(offer.credito),
    "💵 *Entrada:* " + maxMoney(offer.entrada),
  ];
  if (offer.segmento === "Automóvel" || offer.segmento === "Motocicletas" || offer.segmento === "Pesados") {
    lines.push("🚘 *Referência de avaliação (saldo nominal):* " + maxMoney(offer.saldo));
  }
  lines.push("📅 *Parcelas:*");
  for (const period of offer.parcelas) lines.push("• " + period.quantidade + " × " + maxMoney(period.valor));
  lines.push("", "✅ Crédito já contemplado, sujeito a confirmação de disponibilidade.");
  lines.push("📌 Custos de transferência, cadastro e condições de veículos sujeitos à confirmação da administradora.");
  lines.push("📌 Sujeito à análise e aprovação da administradora.");
  return lines.join("\n");
}
