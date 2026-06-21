import { adminRouteFromKey, clamp, onlyNumber, rowConfig, rowMatchesSegment, safeId, scoreLabel } from "../common";
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
  return onlyNumber(row.taxa_adm || row.taxa_admin || row.taxa_administracao || row.taxa_total || row.taxa_plano || row.taxa_adm_pct);
}

function tableFrPct(row: AnyRow) {
  return onlyNumber(row.fundo_reserva || row.fundo_reserva_pct || row.reserve_fund || row.reserveFundPct);
}

function maxEmbeddedPct(group: AnyRow) {
  const cfg = rowConfig(group);
  const raw =
    onlyNumber(group.lance_embutido_max || group.max_embutido || group.embutido_max || group.lance_embutido_pct || group.lance_embutido_max_pct) ||
    onlyNumber(cfg.maxLanceEmbutidoPct) ||
    25;
  return raw <= 1 ? raw * 100 : raw;
}

function calcBb(params: { group: AnyRow; range: AnyRow; credit: number; ownBid: number; embPct: number }) {
  const { group, range, credit, ownBid, embPct } = params;
  const prazo = tableDeadline(range) || tableDeadline(group);
  const taxa = (tableFeePct(range) || tableFeePct(group) || 18) / 100;
  const fr = (tableFrPct(range) || tableFrPct(group) || 0) / 100;
  const valorCategoria = credit * (1 + taxa + fr);
  const parcela = valorCategoria / prazo;
  const lanceEmbutido = credit * (embPct / 100);
  const lanceTotal = ownBid + lanceEmbutido;
  const saldoDevedor = Math.max(0, valorCategoria - lanceTotal);

  return {
    creditoContratado: credit,
    creditoLiquido: Math.max(0, credit - lanceEmbutido),
    parcelaInicial: parcela,
    parcelaAposContemplacao: saldoDevedor / prazo,
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
    prazoRestante: prazo,
    taxaAdmPct: taxa * 100,
    fundoReservaPct: fr * 100,
    seguroPct: 0,
  } satisfies RadarCalculation;
}

function buildOffer(ctx: EngineContext, group: AnyRow, range: AnyRow, calc: RadarCalculation) {
  const desiredNet = onlyNumber(ctx.input.creditoLiquido);
  const desiredInstallment = onlyNumber(ctx.input.parcelaDesejada);
  const probabilidade = estimateProbability({ ownBidPct: calc.lanceProprioPct, group });
  const stats = groupBidStats(group);
  let score = 50;
  const motivos: string[] = [];
  const alertas: string[] = [];

  if (ctx.input.modo === "credito") {
    if (calc.creditoLiquido >= desiredNet) score += 18;
    else {
      score -= 18;
      alertas.push("poder de compra abaixo do desejado");
    }
  } else if (calc.parcelaEstimada <= desiredInstallment) score += 22;
  else {
    score -= 18;
    alertas.push("parcela estimada acima do orçamento");
  }

  if (stats.min !== null) motivos.push(`menor lance contemplado: ${stats.min.toFixed(2)}%`);
  if (stats.median !== null) motivos.push(`mediana/média do grupo: ${stats.median.toFixed(2)}%`);
  if (stats.max !== null) motivos.push(`maior lance contemplado: ${stats.max.toFixed(2)}%`);
  motivos.push("faixa importada do portal BB Consórcios");

  const finalScore = clamp(Math.round(score + (probabilidade >= onlyNumber(ctx.input.probabilidadeMinima) ? 12 : 0)), 0, 100);

  return {
    ...calc,
    id: safeId("bb", group.id, range.id, Math.round(calc.creditoContratado), Math.round(calc.lanceTotal)),
    admin: ctx.admin,
    adminKey: "bb",
    table: { ...range, nome_tabela: `Grupo ${group.grupo || group.codigo || ""} • ${range.label || "Faixa"}` },
    group,
    score: finalScore,
    scoreLabel: scoreLabel(finalScore),
    probabilidadeContemplacao: probabilidade,
    prazoContemplacaoDesejado: onlyNumber(ctx.input.prazoContemplacao),
    segmento: String(group.segmento || ctx.input.segmento),
    nomeTabela: `Grupo ${group.grupo || group.codigo || ""} • ${range.label || "Faixa"}`,
    grupoCodigo: String(group.grupo || group.codigo || ""),
    estrategia: calc.lanceEmbutido > 0 ? "Lance próprio + embutido BB" : "Lance próprio sem embutido",
    motivos: motivos.slice(0, 5),
    alertas: alertas.slice(0, 4),
    simulatorPath: adminRouteFromKey("bb"),
    simulatorParams: {
      origem: "radar-ofertas",
      groupId: String(group.id || ""),
      grupo: String(group.grupo || group.codigo || ""),
      credito: String(Math.round(calc.creditoContratado)),
      lanceProprioPct: String(calc.lanceProprioPct.toFixed(4)),
      lanceEmbutidoPct: String(calc.lanceEmbutidoPct.toFixed(4)),
    },
  } satisfies RadarOffer;
}

export function runBbEngine(ctx: EngineContext, groups: AnyRow[]): EngineResult {
  const desiredNet = onlyNumber(ctx.input.creditoLiquido);
  const desiredInstallment = onlyNumber(ctx.input.parcelaDesejada);
  const ownBid = onlyNumber(ctx.input.lanceProprio);
  const offers: RadarOffer[] = [];

  for (const group of groups) {
    if (group.is_active === false) continue;
    if (!rowMatchesSegment(group, ctx.input.segmento)) continue;
    for (const range of creditRanges(group)) {
      const credit = onlyNumber(range.valor || range.valor_credito || range.credito || range.credit_value);
      if (!credit) continue;
      if (ctx.input.modo === "credito" && credit < desiredNet) continue;
      if (ctx.input.modo === "parcela" && calcBb({ group, range, credit, ownBid, embPct: 0 }).parcelaEstimada > desiredInstallment * 1.25) continue;

      const embOptions =
        ctx.input.usarEmbutido === "ia"
          ? [0, maxEmbeddedPct(group)]
          : [ctx.input.usarEmbutido === "sim" ? maxEmbeddedPct(group) : 0];
      for (const embPct of [...new Set(embOptions)]) {
        const calc = calcBb({ group, range, credit, ownBid, embPct });
        offers.push(buildOffer(ctx, group, range, calc));
      }
    }
  }

  return offers;
}

