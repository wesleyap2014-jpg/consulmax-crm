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

function maxCandidatePool(group: MaxStockRow[], target: number, maxCotas: number): MaxStockRow[] {
  if (group.length <= 48) return group.sort((a, b) => a.codigo.localeCompare(b.codigo));
  const picked = new Map<string, MaxStockRow>();
  const add = (rows: MaxStockRow[], n: number) => rows.slice(0, n).forEach((r) => picked.set(r.id, r));
  for (let n = 1; n <= maxCotas; n++) {
    const t = target / n;
    add([...group].sort((a, b) => Math.abs(a.credito - t) - Math.abs(b.credito - t)), 18);
  }
  add([...group].sort((a, b) => a.entradaBase - b.entradaBase), 20);
  add([...group].sort((a, b) => a.valorParcela - b.valorParcela), 16);
  add([...group].sort((a, b) => a.valorParcela * a.parcelas - b.valorParcela * b.parcelas), 16);
  return [...picked.values()].slice(0, 80).sort((a, b) => a.codigo.localeCompare(b.codigo));
}

function partialScore(credit: number, target: number, size: number, depth: number): number {
  // Mantém também composições menores para permitir junções de 4-5 cotas.
  const future = Math.max(1, 6 - depth);
  const desired = target * Math.min(1, size / Math.max(1, depth));
  return Math.abs(credit - desired) / Math.max(target, 1) + size * 0.001 + (depth >= 4 ? 0.005 : 0) * future;
}

export function maxSearchStrategies(
  stock: MaxStockRow[], criteria: MaxCriteria, vendorPct: number, limit = 3
): { offers: MaxOffer[]; count: number; inspected: number; limited: boolean; reason: string } {
  if (!maxValidCommission(vendorPct)) throw new Error("Comissão inválida.");
  const target = Number(criteria.credito || criteria.preco || 0);
  if (!Number.isFinite(target) || target <= 0) return { offers: [], count: 0, inspected: 0, limited: false, reason: "Informe o crédito ou preço aproximado do bem." };
  const eligible = stock.filter((c) => c.status === "disponivel" && c.credito > 0 && c.parcelas > 0 && c.valorParcela > 0 && Number.isFinite(c.entradaBase) &&
    (!criteria.segmento || c.segmento === criteria.segmento));
  const groupMap = new Map<string, MaxStockRow[]>();
  for (const row of eligible) {
    const key = [row.partnerId, row.adminId, row.segmento].join("|");
    groupMap.set(key, [...(groupMap.get(key) || []), row]);
  }
  const maxCotas = Math.min(5, Math.max(1, Math.floor(criteria.maxCotas || 5)));
  const maxCredit = Math.max(target * 1.4, target + 50000);
  const offers: MaxOffer[] = [];
  let inspected = 0, limited = false;
  for (const group of groupMap.values()) {
    const all = group.filter((x) => x.credito <= maxCredit);
    const candidates = maxCandidatePool(all, target, maxCotas);
    if (candidates.length < all.length) limited = true;
    type Partial = { items: MaxStockRow[]; last: number; credito: number };
    let beam: Partial[] = [{ items: [], last: -1, credito: 0 }];
    for (let depth = 1; depth <= maxCotas; depth++) {
      const expanded: Partial[] = [];
      for (const partial of beam) for (let i = partial.last + 1; i < candidates.length; i++) {
        const item = candidates[i];
        const credit = partial.credito + item.credito;
        if (credit > maxCredit) continue;
        expanded.push({ items: [...partial.items, item], last: i, credito: credit });
      }
      if (!expanded.length) break;
      for (const partial of expanded) {
        inspected++;
        if (partial.credito >= target * 0.55 && partial.credito <= maxCredit)
          offers.push(maxEvaluateOffer(partial.items, criteria, vendorPct));
      }
      // O feixe mantém candidatos por distância ao objetivo e por custo inicial.
      const byTarget = [...expanded].sort((a, b) => partialScore(a.credito, target, a.items.length, depth) - partialScore(b.credito, target, b.items.length, depth)).slice(0, 140);
      const byEntrada = [...expanded].sort((a, b) => a.items.reduce((s, c) => s + maxEntrada(c, vendorPct), 0) - b.items.reduce((s, c) => s + maxEntrada(c, vendorPct), 0)).slice(0, 65);
      const byParcela = [...expanded].sort((a, b) => a.items.reduce((s, c) => s + c.valorParcela, 0) - b.items.reduce((s, c) => s + c.valorParcela, 0)).slice(0, 65);
      const unique = new Map<string, Partial>();
      for (const item of [...byTarget, ...byEntrada, ...byParcela]) unique.set(item.items.map((r) => r.id).join("|"), item);
      beam = [...unique.values()];
      if (expanded.length > beam.length) limited = true;
    }
  }
  if (!offers.length) return { offers: [], count: eligible.length, inspected, limited, reason: eligible.length ? "Não foram encontradas composições próximas ao objetivo no estoque atual." : "Não há cotas disponíveis para os critérios informados." };
  offers.sort((a, b) => a.pontuacao - b.pontuacao || a.qtdCotas - b.qtdCotas || a.id.localeCompare(b.id));
  const selected: MaxOffer[] = [];
  const take = (offer: MaxOffer | undefined, title: string) => { if (offer && !selected.some((s) => s.id === offer.id)) selected.push({ ...offer, titulo: title }); };
  take(offers[0], "Melhor estratégia geral");
  const alternatives = offers.filter((o) => !selected.some((v) => v.id === o.id));
  if (alternatives.length) {
    const viable = alternatives.filter((x) => x.viavelNosCriterios);
    const pool = viable.length ? viable : alternatives;
    take([...pool].sort((a, b) => a.desembolsoInicial - b.desembolsoInicial || a.pontuacao - b.pontuacao)[0], "Menor desembolso inicial");
  }
  if (selected.length < limit) {
    const remaining = offers.filter((o) => !selected.some((v) => v.id === o.id));
    const preferred = criteria.prioridade === "saldo" ?
      [...remaining].sort((a, b) => a.saldo - b.saldo || a.pontuacao - b.pontuacao) :
      [...remaining].sort((a, b) => a.parcelaInicial - b.parcelaInicial || a.pontuacao - b.pontuacao);
    take(preferred[0], criteria.prioridade === "saldo" ? "Menor saldo nominal" : "Menor parcela inicial");
  }
  return { offers: selected.slice(0, limit), count: eligible.length, inspected, limited, reason: selected[0]?.viavelNosCriterios ? "Alternativas encontradas; aprovação, disponibilidade e avaliação final dependem da administradora." : "Nenhuma alternativa avaliada atende a todos os limites informados; veja as restrições em cada cartão." };
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
