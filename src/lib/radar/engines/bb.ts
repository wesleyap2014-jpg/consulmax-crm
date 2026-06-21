import {
  adminRouteFromKey,
  aggregateCalculation,
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
    return ranges.map((range, index) => (range && typeof range === "object" ? range : { id: `range-${index}`, label: `Faixa ${index + 1}`, valor: range }));
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
  const saldoDevedor = Math.max(0, valorCategoria - lanceTotal);
  const parcelasPagas = clamp(Math.max(1, parcelaContemplacao), 1, prazo);
  const prazoRestante = Math.max(1, prazo - parcelasPagas);

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

function maxQuotaCount(ctx: EngineContext, credit: number) {
  const desiredPower = onlyNumber(ctx.input.creditoLiquido);
  if (!desiredPower || !credit) return 1;
  return clamp(Math.ceil((desiredPower * 1.15) / credit), 1, 12);
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
  if (quantidadeCotas > 1) motivos.push(`combina ${quantidadeCotas} cotas no mesmo grupo/faixa`);

  return {
    ...calc,
    id: safeId("bb", group.id, range.id, quantidadeCotas, Math.round(calc.creditoContratado), Math.round(calc.lanceTotal)),
    admin: ctx.admin,
    adminKey: "bb",
    table: { ...range, nome_tabela: `Grupo ${group.grupo || group.codigo || ""} • ${range.label || "Faixa"}` },
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
    nomeTabela: `${quantidadeCotas > 1 ? `${quantidadeCotas} cotas • ` : ""}Grupo ${group.grupo || group.codigo || ""} • ${range.label || "Faixa"}`,
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
    for (const range of creditRanges(group)) {
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
          for (const ownBidPerQuota of bidCandidates(group, credit, ownBid, quantidadeCotas, embeddedValuePerQuota)) {
            const baseCalc = calcBb({ group, range, credit, ownBid: ownBidPerQuota, embPct, parcelaContemplacao });
            const calc = aggregateCalculation(baseCalc, quantidadeCotas);
            const median = groupBidStats(group).median;
            if (calc.lanceProprio > ownBid + 1) continue;
            if (median !== null && calc.lanceTotalPct < median - 5) continue;
            if (ctx.input.modo === "credito" && purchasingPower(calc, ctx.input) < desiredNet * 0.9) continue;
            if (ctx.input.modo === "parcela" && calc.parcelaEstimada > desiredInstallment * 1.35) continue;
            offers.push(buildOffer(ctx, group, range, calc, quantidadeCotas));
          }
        }
      }
    }
  }

  return offers;
}
