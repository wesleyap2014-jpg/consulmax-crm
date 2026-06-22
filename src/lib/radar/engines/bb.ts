import {
  adminRouteFromKey,
  aggregateCalculation,
  brMoney,
  clamp,
  groupDeliveryStats,
  groupNextAssembly,
  onlyNumber,
  purchasingPower,
  rowConfig,
  rowMatchesSegment,
  safeId,
  scoreLabel,
  scoreOffer,
} from "../common";
import { estimateProbability, groupBidStats } from "../probability";
import type { AnyRow, EngineContext, EngineResult, RadarCalculation, RadarOffer } from "../types";

function creditRanges(group: AnyRow) {
  const ranges = rowConfig(group).creditRanges;
  if (Array.isArray(ranges) && ranges.length) {
    return ranges.map((range, index) => {
      const fallback = { id: `faixa-${index + 1}`, label: `Faixa ${index + 1}`, valor: range };
      if (!range || typeof range !== "object") return fallback;

      return {
        ...range,
        id: String(range.id || range.key || fallback.id),
        label: String(range.label || range.nome || range.name || fallback.label),
      };
    });
  }

  return [
    { id: "min", label: "Faixa mínima", valor: onlyNumber(group.credito_min || group.valor_min) },
    { id: "max", label: "Faixa máxima", valor: onlyNumber(group.credito_max || group.valor_max || group.valor_credito) },
  ].filter((range) => onlyNumber(range.valor) > 0);
}

function tableDeadline(row: AnyRow) {
  return Math.max(1, onlyNumber(row.prazo_limite || row.prazo_maximo || row.prazo || row.prazo_meses || row.months || row.term) || 240);
}

function tableFeePct(row: AnyRow) {
  const cfg = rowConfig(row);
  const raw =
    onlyNumber(row.taxa_adm || row.taxa_admin || row.taxa_administracao || row.taxa_total || row.taxa_plano || row.taxa_adm_pct) ||
    onlyNumber(row.taxaAdmPct || row.taxaAdministracao || row.taxaAdministracaoPct || row.adminFeePct || row.administrationFeePct) ||
    onlyNumber(cfg.taxa_adm || cfg.taxa_admin || cfg.taxa_administracao || cfg.taxa_total || cfg.taxa_plano || cfg.taxa_adm_pct) ||
    onlyNumber(cfg.taxaAdmPct || cfg.taxaAdministracao || cfg.taxaAdministracaoPct || cfg.adminFeePct || cfg.administrationFeePct);
  return raw > 0 && raw <= 1 ? raw * 100 : raw;
}

function tableFrPct(row: AnyRow) {
  const cfg = rowConfig(row);
  const raw =
    onlyNumber(row.fundo_reserva || row.fundo_reserva_pct || row.reserve_fund || row.reserveFundPct) ||
    onlyNumber(row.fundoReservaPct || row.fundoReserva || row.reserveFund || row.reserve_fee_pct) ||
    onlyNumber(cfg.fundo_reserva || cfg.fundo_reserva_pct || cfg.reserve_fund || cfg.reserveFundPct) ||
    onlyNumber(cfg.fundoReservaPct || cfg.fundoReserva || cfg.reserveFund || cfg.reserve_fee_pct);
  return raw > 0 && raw <= 1 ? raw * 100 : raw;
}

function maxEmbeddedPct(group: AnyRow) {
  const cfg = rowConfig(group);
  const raw =
    onlyNumber(group.lance_embutido_max || group.max_embutido || group.embutido_max || group.lance_embutido_pct || group.lance_embutido_max_pct) ||
    onlyNumber(cfg.maxLanceEmbutidoPct);
  return raw <= 1 ? raw * 100 : raw;
}

function embeddedConfig(group: AnyRow, range: AnyRow) {
  const cfg = { ...rowConfig(group), ...rowConfig(range) };
  const explicitNo = group.permite_lance_embutido === false || range.permite_lance_embutido === false || cfg.permiteLanceEmbutido === false;
  const explicitYes = group.permite_lance_embutido === true || range.permite_lance_embutido === true || cfg.permiteLanceEmbutido === true;
  const maxPct = maxEmbeddedPct({ ...group, config: { ...rowConfig(group), ...rowConfig(range) } });
  const base = String(cfg.lanceEmbutidoBase || cfg.embut_base || cfg.embutidoBase || group.lance_embutido_base || "credito");
  return {
    allowed: !explicitNo && (explicitYes || maxPct > 0),
    maxPct: explicitNo ? 0 : maxPct,
    base: base.includes("categoria") || base.includes("valor") ? "valor_categoria" : "credito",
  };
}

function calcBb(params: { group: AnyRow; range: AnyRow; credit: number; ownBid: number; embPct: number; parcelaContemplacao: number }) {
  const { group, range, credit, ownBid, embPct, parcelaContemplacao } = params;
  const prazo = tableDeadline(range) || tableDeadline(group);
  const taxa = (tableFeePct(range) || tableFeePct(group) || 0) / 100;
  const fr = (tableFrPct(range) || tableFrPct(group) || 0) / 100;
  const valorCategoria = credit * (1 + taxa + fr);
  const parcela = valorCategoria / prazo;
  const embCfg = embeddedConfig(group, range);
  const embBase = embCfg.base === "valor_categoria" ? valorCategoria : credit;
  const lanceEmbutido = embCfg.allowed ? embBase * (embPct / 100) : 0;
  const lanceTotal = ownBid + lanceEmbutido;
  const parcelasPagas = clamp(Math.max(1, parcelaContemplacao), 1, prazo);
  const prazoRestante = Math.max(1, prazo - parcelasPagas);
  const totalPagoAteContemplacao = parcela * parcelasPagas;
  const saldoDevedor = Math.max(0, valorCategoria - totalPagoAteContemplacao - lanceTotal);

  return {
    creditoContratado: credit,
    creditoLiquido: Math.max(0, credit - lanceEmbutido),
    parcelaInicial: parcela,
    parcelaAposContemplacao: saldoDevedor / prazoRestante,
    parcelaEstimada: parcela,
    lanceProprio: ownBid,
    lanceProprioPct: credit > 0 ? (ownBid / credit) * 100 : 0,
    lanceEmbutido,
    lanceEmbutidoPct: embPct,
    lanceTotal,
    lanceTotalPct: credit > 0 ? (lanceTotal / credit) * 100 : 0,
    valorCategoria,
    saldoDevedor,
    prazoTotal: prazo,
    prazoRestante,
    taxaAdmPct: taxa * 100,
    fundoReservaPct: fr * 100,
    seguroPct: 0,
  } satisfies RadarCalculation;
}

function bidCandidates(group: AnyRow, credit: number, ownBidAvailable: number, quantidadeCotas: number, embeddedValuePerQuota = 0) {
  const maxPerQuota = quantidadeCotas > 0 ? ownBidAvailable / quantidadeCotas : ownBidAvailable;
  const stats = groupBidStats(group);
  const pcts = [stats.median, stats.max, credit > 0 ? (maxPerQuota / credit) * 100 : 0]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const values = pcts.map((pct) => Math.min(maxPerQuota, Math.max(0, credit * (pct / 100) - embeddedValuePerQuota))).filter((value) => value >= 0);
  return [...new Set(values.map((value) => Math.round(value)))];
}

function maxOwnBidAllowed(ctx: EngineContext) {
  const ownBid = onlyNumber(ctx.input.lanceProprio);
  if (!ownBid) return 0;
  return ownBid + Math.max(ownBid * 0.1, 10000);
}

function maxQuotaCount(ctx: EngineContext, credit: number) {
  const desiredPower = onlyNumber(ctx.input.creditoLiquido);
  if (!desiredPower || !credit) return 1;
  return clamp(Math.ceil((desiredPower * 1.15) / credit), 1, 12);
}

type ComboItem = {
  range: AnyRow;
  quantity: number;
};

type RangeCombo = {
  id: string;
  label: string;
  totalCredit: number;
  totalQty: number;
  items: ComboItem[];
};

function normalizeRangeCredit(range: AnyRow) {
  return onlyNumber(range.valor || range.valor_credito || range.credito || range.credit_value);
}

function comboId(items: ComboItem[]) {
  return items.map((item) => `${item.range.id || item.range.label}x${item.quantity}`).join("_");
}

function comboLabel(items: ComboItem[]) {
  return items.map((item) => `${item.quantity}x ${item.range.label || "Faixa"}`).join(" + ");
}

function buildComboFromCounts(ranges: AnyRow[], counts: number[]) {
  const items = counts
    .map((quantity, index) => ({ range: ranges[index], quantity }))
    .filter((item) => item.quantity > 0);
  const totalCredit = items.reduce((sum, item) => sum + normalizeRangeCredit(item.range) * item.quantity, 0);
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    id: comboId(items),
    label: comboLabel(items),
    totalCredit,
    totalQty,
    items,
  } satisfies RangeCombo;
}

function generateMixedRangeCombos(ctx: EngineContext, ranges: AnyRow[]) {
  const desiredPower = onlyNumber(ctx.input.creditoLiquido);
  const usableRanges = ranges
    .map((range) => ({ ...range, valor: normalizeRangeCredit(range) }))
    .filter((range) => range.valor > 0)
    .sort((a, b) => a.valor - b.valor);

  if (!desiredPower || usableRanges.length < 2) return [];

  const maxQty = 12;
  const beamLimit = 260;
  const candidateLimit = 45;
  const byId = new Map<string, RangeCombo>();
  let beam: Array<{ total: number; counts: number[] }> = [{ total: 0, counts: usableRanges.map(() => 0) }];

  for (let qty = 1; qty <= maxQty; qty++) {
    const expanded = new Map<string, { total: number; counts: number[] }>();

    for (const state of beam) {
      usableRanges.forEach((range, index) => {
        const counts = [...state.counts];
        counts[index] += 1;
        const total = state.total + range.valor;
        const key = counts.join(",");
        if (!expanded.has(key)) expanded.set(key, { total, counts });
      });
    }

    const ordered = [...expanded.values()].sort((a, b) => Math.abs(a.total - desiredPower) - Math.abs(b.total - desiredPower));
    beam = ordered.slice(0, beamLimit);

    for (const state of ordered.slice(0, beamLimit)) {
      const uniqueRanges = state.counts.filter((count) => count > 0).length;
      if (uniqueRanges < 2) continue;
      const combo = buildComboFromCounts(usableRanges, state.counts);
      byId.set(combo.id, combo);
    }
  }

  return [...byId.values()]
    .sort((a, b) => Math.abs(a.totalCredit - desiredPower) - Math.abs(b.totalCredit - desiredPower))
    .slice(0, candidateLimit);
}

function comboEmbeddedPctOptions(ctx: EngineContext, group: AnyRow, combo: RangeCombo) {
  const maxPct = Math.min(...combo.items.map((item) => embeddedConfig(group, item.range).allowed ? embeddedConfig(group, item.range).maxPct : 0));
  if (ctx.input.usarEmbutido === "nao" || maxPct <= 0) return [0];
  if (ctx.input.usarEmbutido === "sim") return [maxPct];
  return [0, maxPct];
}

function comboEmbeddedTotal(group: AnyRow, combo: RangeCombo, embPct: number) {
  return combo.items.reduce((sum, item) => {
    const credit = normalizeRangeCredit(item.range);
    const embCfg = embeddedConfig(group, item.range);
    if (!embCfg.allowed || embPct <= 0) return sum;
    const taxa = (tableFeePct(item.range) || tableFeePct(group) || 0) / 100;
    const fr = (tableFrPct(item.range) || tableFrPct(group) || 0) / 100;
    const valorCategoria = credit * (1 + taxa + fr);
    const base = embCfg.base === "valor_categoria" ? valorCategoria : credit;
    return sum + base * (embPct / 100) * item.quantity;
  }, 0);
}

function comboBidCandidates(group: AnyRow, totalCredit: number, ownBidAvailable: number, embeddedTotal = 0) {
  const stats = groupBidStats(group);
  const pcts = [stats.median, stats.max, totalCredit > 0 ? (ownBidAvailable / totalCredit) * 100 : 0]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const values = pcts
    .map((pct) => Math.max(0, totalCredit * (pct / 100) - embeddedTotal))
    .concat(ownBidAvailable)
    .filter((value) => value >= 0);
  return [...new Set(values.map((value) => Math.round(value)))];
}

function sumCalculations(calcs: RadarCalculation[]): RadarCalculation | null {
  if (!calcs.length) return null;
  const creditoContratado = calcs.reduce((sum, calc) => sum + calc.creditoContratado, 0);
  const creditoLiquido = calcs.reduce((sum, calc) => sum + calc.creditoLiquido, 0);
  const lanceProprio = calcs.reduce((sum, calc) => sum + calc.lanceProprio, 0);
  const lanceEmbutido = calcs.reduce((sum, calc) => sum + calc.lanceEmbutido, 0);
  const lanceTotal = calcs.reduce((sum, calc) => sum + calc.lanceTotal, 0);
  const valorCategoria = calcs.reduce((sum, calc) => sum + calc.valorCategoria, 0);
  const weightedTaxa = calcs.reduce((sum, calc) => sum + calc.creditoContratado * calc.taxaAdmPct, 0);
  const weightedFr = calcs.reduce((sum, calc) => sum + calc.creditoContratado * calc.fundoReservaPct, 0);

  return {
    creditoContratado,
    creditoLiquido,
    parcelaInicial: calcs.reduce((sum, calc) => sum + calc.parcelaInicial, 0),
    parcelaAposContemplacao: calcs.reduce((sum, calc) => sum + calc.parcelaAposContemplacao, 0),
    parcelaEstimada: calcs.reduce((sum, calc) => sum + calc.parcelaEstimada, 0),
    lanceProprio,
    lanceProprioPct: creditoContratado > 0 ? (lanceProprio / creditoContratado) * 100 : 0,
    lanceEmbutido,
    lanceEmbutidoPct: creditoContratado > 0 ? (lanceEmbutido / creditoContratado) * 100 : 0,
    lanceTotal,
    lanceTotalPct: creditoContratado > 0 ? (lanceTotal / creditoContratado) * 100 : 0,
    valorCategoria,
    saldoDevedor: calcs.reduce((sum, calc) => sum + calc.saldoDevedor, 0),
    prazoTotal: Math.max(...calcs.map((calc) => calc.prazoTotal)),
    prazoRestante: Math.max(...calcs.map((calc) => calc.prazoRestante)),
    taxaAdmPct: creditoContratado > 0 ? weightedTaxa / creditoContratado : 0,
    fundoReservaPct: creditoContratado > 0 ? weightedFr / creditoContratado : 0,
    seguroPct: 0,
  };
}

function calcCombo(params: { group: AnyRow; combo: RangeCombo; ownBid: number; embPct: number; parcelaContemplacao: number }) {
  const { group, combo, ownBid, embPct, parcelaContemplacao } = params;
  const calcs: RadarCalculation[] = [];

  for (const item of combo.items) {
    const credit = normalizeRangeCredit(item.range);
    if (!credit || item.quantity <= 0) continue;
    const componentCredit = credit * item.quantity;
    const ownBidForComponent = combo.totalCredit > 0 ? ownBid * (componentCredit / combo.totalCredit) : 0;
    const ownBidPerQuota = ownBidForComponent / item.quantity;
    const baseCalc = calcBb({ group, range: item.range, credit, ownBid: ownBidPerQuota, embPct, parcelaContemplacao });
    calcs.push(aggregateCalculation(baseCalc, item.quantity));
  }

  return sumCalculations(calcs);
}

function buildOffer(ctx: EngineContext, group: AnyRow, range: AnyRow, calc: RadarCalculation, quantidadeCotas: number) {
  const desiredNet = onlyNumber(ctx.input.creditoLiquido);
  const desiredInstallment = onlyNumber(ctx.input.parcelaDesejada);
  const probabilidade = estimateProbability({ bidPct: calc.lanceTotalPct, group });
  const stats = groupBidStats(group);
  const power = purchasingPower(calc, ctx.input);
  const scoreBreakdown = scoreOffer(calc, ctx.input, quantidadeCotas, group);
  const delivery = groupDeliveryStats(group);
  const motivos: string[] = [];
  const alertas: string[] = [];

  if (ctx.input.modo === "credito") {
    if (power >= desiredNet) motivos.push("poder de compra atende o objetivo informado");
    else alertas.push("poder de compra abaixo do desejado");
  } else if (desiredInstallment > 0 && calc.parcelaEstimada > desiredInstallment) {
    alertas.push("parcela estimada acima do orçamento");
  }

  if (stats.min !== null) motivos.push(`menor lance contemplado: ${stats.min.toFixed(2)}%`);
  if (stats.median !== null) motivos.push(`mediana/média do grupo: ${stats.median.toFixed(2)}%`);
  if (stats.max !== null) motivos.push(`maior lance contemplado: ${stats.max.toFixed(2)}%`);
  if (stats.median !== null && calc.lanceTotalPct < stats.median) {
    alertas.push(`lance total ${calc.lanceTotalPct.toFixed(2)}%, abaixo da mediana; oportunidade próxima pode exigir lance maior`);
  }
  if (delivery.deliveryRatio) motivos.push(`entrega da última assembleia: ${(delivery.deliveryRatio * 100).toFixed(0)}% do esperado`);
  motivos.push("faixa importada do portal BB Consórcios");
  if (range.comboLabel) motivos.push(`combina ${quantidadeCotas} cotas em faixas do mesmo grupo`);
  else if (quantidadeCotas > 1) motivos.push(`combina ${quantidadeCotas} cotas no mesmo grupo/faixa`);
  if (calc.lanceProprio > onlyNumber(ctx.input.lanceProprio)) alertas.push(`exige lance próprio ${brMoney(calc.lanceProprio - onlyNumber(ctx.input.lanceProprio))} acima do informado`);

  return {
    ...calc,
    id: safeId("bb", group.id, range.id, quantidadeCotas, Math.round(calc.creditoContratado), Math.round(calc.lanceTotal)),
    admin: ctx.admin,
    adminKey: "bb",
    table: { ...range, nome_tabela: `Grupo ${group.grupo || group.codigo || ""} • ${range.comboLabel ? "Combinação de faixas" : range.label || "Faixa"}` },
    group,
    score: scoreBreakdown.total,
    scoreBreakdown,
    scoreLabel: scoreLabel(scoreBreakdown.total),
    poderCompra: power,
    lanceProprioDisponivel: onlyNumber(ctx.input.lanceProprio),
    lanceProprioSobra: Math.max(0, onlyNumber(ctx.input.lanceProprio) - calc.lanceProprio),
    quantidadeCotas,
    entregaMediaEsperada: delivery.expectedPerAssembly,
    entregaUltimaAssembleia: delivery.lastDelivered,
    entregaIndicePct: delivery.deliveryRatio ? delivery.deliveryRatio * 100 : null,
    proximaAssembleia: groupNextAssembly(group),
    probabilidadeContemplacao: probabilidade,
    prazoContemplacaoDesejado: onlyNumber(ctx.input.prazoContemplacao),
    segmento: String(group.segmento || ctx.input.segmento),
    nomeTabela: `${quantidadeCotas > 1 ? `${quantidadeCotas} cotas • ` : ""}Grupo ${group.grupo || group.codigo || ""} • ${range.comboLabel || range.label || "Faixa"}`,
    grupoCodigo: String(group.grupo || group.codigo || ""),
    estrategia: calc.lanceEmbutido > 0 ? `Lance próprio + embutido BB (${embeddedConfig(group, range).base === "valor_categoria" ? "base categoria" : "base crédito"})` : "Lance próprio sem embutido",
    motivos: motivos.slice(0, 5),
    alertas: alertas.slice(0, 4),
    simulatorPath: adminRouteFromKey("bb"),
    simulatorParams: {
      origem: "radar-ofertas",
      groupId: String(group.id || ""),
      grupo: String(group.grupo || group.codigo || ""),
      credito: String(Math.round(calc.creditoContratado)),
      quantidadeCotas: String(quantidadeCotas),
      faixas: range.comboLabel ? String(range.comboLabel) : String(range.label || ""),
      lanceProprioPct: String(calc.lanceProprioPct.toFixed(4)),
      lanceEmbutidoPct: String(calc.lanceEmbutidoPct.toFixed(4)),
    },
  } satisfies RadarOffer;
}

export function runBbEngine(ctx: EngineContext, groups: AnyRow[]): EngineResult {
  const desiredNet = onlyNumber(ctx.input.creditoLiquido);
  const desiredInstallment = onlyNumber(ctx.input.parcelaDesejada);
  const ownBid = onlyNumber(ctx.input.lanceProprio);
  const parcelaContemplacao = Math.max(1, onlyNumber(ctx.input.prazoContemplacao));
  const offers: RadarOffer[] = [];

  for (const group of groups) {
    if (group.is_active === false) continue;
    if (!rowMatchesSegment(group, ctx.input.segmento)) continue;
    const ranges = creditRanges(group);
    for (const range of ranges) {
      const credit = onlyNumber(range.valor || range.valor_credito || range.credito || range.credit_value);
      if (!credit) continue;

      const embCfg = embeddedConfig(group, range);
      const embOptions =
        ctx.input.usarEmbutido === "ia"
          ? [0, embCfg.allowed ? embCfg.maxPct : 0]
          : [ctx.input.usarEmbutido === "sim" && embCfg.allowed ? embCfg.maxPct : 0];
      for (const embPct of [...new Set(embOptions)]) {
        const maxQty = maxQuotaCount(ctx, credit);
        for (let quantidadeCotas = 1; quantidadeCotas <= maxQty; quantidadeCotas++) {
          const embBase = embCfg.base === "valor_categoria" ? credit * (1 + ((tableFeePct(range) || tableFeePct(group) || 0) / 100) + ((tableFrPct(range) || tableFrPct(group) || 0) / 100)) : credit;
          const embeddedValuePerQuota = embCfg.allowed ? embBase * (embPct / 100) : 0;
          for (const ownBidPerQuota of bidCandidates(group, credit, maxOwnBidAllowed(ctx), quantidadeCotas, embeddedValuePerQuota)) {
            const baseCalc = calcBb({ group, range, credit, ownBid: ownBidPerQuota, embPct, parcelaContemplacao });
            const calc = aggregateCalculation(baseCalc, quantidadeCotas);
            const median = groupBidStats(group).median;
            if (calc.lanceProprio > maxOwnBidAllowed(ctx)) continue;
            if (median !== null && calc.lanceTotalPct < median - 5) continue;
            if (ctx.input.modo === "credito" && purchasingPower(calc, ctx.input) < desiredNet * 0.9) continue;
            if (ctx.input.modo === "parcela" && calc.parcelaEstimada > desiredInstallment * 1.35) continue;
            offers.push(buildOffer(ctx, group, range, calc, quantidadeCotas));
          }
        }
      }
    }

    for (const combo of generateMixedRangeCombos(ctx, ranges)) {
      for (const embPct of comboEmbeddedPctOptions(ctx, group, combo)) {
        const embeddedTotal = comboEmbeddedTotal(group, combo, embPct);
        for (const ownBidTotal of comboBidCandidates(group, combo.totalCredit, ownBid, embeddedTotal)) {
          const calc = calcCombo({ group, combo, ownBid: ownBidTotal, embPct, parcelaContemplacao });
          const median = groupBidStats(group).median;
          if (!calc) continue;
          if (calc.lanceProprio > maxOwnBidAllowed(ctx)) continue;
          if (median !== null && calc.lanceTotalPct < median - 5) continue;
          if (ctx.input.modo === "credito" && purchasingPower(calc, ctx.input) < desiredNet * 0.9) continue;
          if (ctx.input.modo === "parcela" && calc.parcelaEstimada > desiredInstallment * 1.35) continue;

          offers.push(
            buildOffer(
              ctx,
              group,
              {
                id: combo.id,
                label: `Combinação - ${combo.label}`,
                valor: combo.totalCredit,
                comboLabel: `Combinação - ${combo.label}`,
                comboItems: combo.items.map((item) => ({
                  id: item.range.id,
                  label: item.range.label,
                  valor: normalizeRangeCredit(item.range),
                  quantity: item.quantity,
                })),
              },
              calc,
              combo.totalQty
            )
          );
        }
      }
    }
  }

  return offers;
}
