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

function configRows(group: AnyRow, key: string): AnyRow[] {
  const value = rowConfig(group)[key];
  return Array.isArray(value) ? value.filter((row) => row && typeof row === "object") : [];
}

function normalizeMaggiGroup(group: AnyRow) {
  const cfg = rowConfig(group);
  const creditRanges = configRows(group, "creditRanges");
  const prazoRules = configRows(group, "prazoRules");
  const lanceOptions = configRows(group, "lanceOptions").filter((lance) => lance.enabled !== false);
  return {
    creditRanges: creditRanges.length
      ? creditRanges
      : [
          { id: "min", label: "Faixa mínima", valor: onlyNumber(group.credito_min) },
          { id: "max", label: "Faixa máxima", valor: onlyNumber(group.credito_max) },
        ].filter((row) => row.valor > 0),
    prazoRules: prazoRules.length
      ? prazoRules
      : [
          {
            id: "prazo",
            prazo: onlyNumber(group.prazo_restante || group.prazo_original),
            taxaAdmPct: onlyNumber(group.taxa_adm_pct),
            fundoReservaPct: onlyNumber(group.fundo_reserva_pct),
          },
        ],
    lanceOptions: lanceOptions.length
      ? lanceOptions
      : [{ key: "livre", enabled: true, nomeComercial: "Lance Livre", pct: 0 }],
    maxLanceEmbutidoPct: normalizeFraction(onlyNumber(cfg.maxLanceEmbutidoPct) || onlyNumber(group.lance_embutido_max_pct) || 0.2),
    seguroMomento: cfg.seguroMomento === "contratacao" ? "contratacao" : "contemplacao",
    customRule: cfg.customRule || { lePrazoPct: 1, leParcelaPct: 0, llPrazoPct: 0.5, llParcelaPct: 0.5 },
    firstParcelRule: cfg.firstParcelRule || { enabled: false, tipo: "nenhum", valor: 0 },
  };
}

function normalizeFraction(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 100 : value;
}

function firstParcelAdd(credit: number, valorCategoria: number, rule: AnyRow) {
  if (!rule?.enabled || rule.tipo === "nenhum") return 0;
  if (rule.tipo === "valor_fixo") return onlyNumber(rule.valor);
  if (rule.tipo === "pct_credito") return credit * onlyNumber(rule.valor);
  if (rule.tipo === "pct_categoria") return valorCategoria * onlyNumber(rule.valor);
  return 0;
}

function calcMaggi(params: {
  group: AnyRow;
  credit: number;
  prazoRule: AnyRow;
  lanceOption: AnyRow;
  ownBid: number;
  embPct: number;
  parcelaContemplacao: number;
}) {
  const { group, credit, prazoRule, lanceOption, ownBid, embPct, parcelaContemplacao } = params;
  const cfg = normalizeMaggiGroup(group);
  const prazo = Math.max(1, onlyNumber(prazoRule.prazo));
  const taxaAdm = normalizeFraction(onlyNumber(prazoRule.taxaAdmPct));
  const fundoReserva = normalizeFraction(onlyNumber(prazoRule.fundoReservaPct));
  const seguroPct = normalizeFraction(onlyNumber(group.seguro_pct));
  const valorCategoria = credit * (1 + taxaAdm + fundoReserva);
  const parcelaBase = valorCategoria / prazo;
  const seguroMensal = valorCategoria * seguroPct;
  const adicionalPrimeira = firstParcelAdd(credit, valorCategoria, cfg.firstParcelRule);
  const parcelaInicial = parcelaBase + (cfg.seguroMomento === "contratacao" ? seguroMensal : 0) + adicionalPrimeira;
  const parcelaAntes = parcelaBase + (cfg.seguroMomento === "contratacao" ? seguroMensal : 0);
  const parcelasPagas = clamp(parcelaContemplacao, 1, prazo);
  const prazoRestanteBase = Math.max(1, prazo - parcelasPagas);
  const lancePct = lanceOption.key === "livre" ? 0 : normalizeFraction(onlyNumber(lanceOption.pct));
  const lanceFixo = valorCategoria * lancePct;
  const maxEmbPct = group.permite_lance_embutido === false ? 0 : cfg.maxLanceEmbutidoPct;
  const embutidoSolicitado = Math.min(valorCategoria * normalizeFraction(embPct), valorCategoria * maxEmbPct);
  const lanceEmbutido = lanceOption.key === "livre" ? embutidoSolicitado : Math.min(embutidoSolicitado, lanceFixo);
  const lanceProprio = lanceOption.key === "livre" ? ownBid : Math.max(0, lanceFixo - lanceEmbutido);
  const lanceTotal = lanceProprio + lanceEmbutido;
  const totalPago = parcelaBase * parcelasPagas + adicionalPrimeira;
  const saldoAposLance = Math.max(0, valorCategoria - totalPago - lanceTotal);
  const regra = String(group.regra_pos_contemplacao || "saldo_devedor_prazo_restante");
  let prazoRestante = prazoRestanteBase;
  let parcelaApos = saldoAposLance / prazoRestanteBase;

  if (regra === "mantem_parcela_reduz_prazo") {
    prazoRestante = Math.max(1, Math.ceil(saldoAposLance / Math.max(1, parcelaBase)));
    parcelaApos = parcelaBase;
  }

  if (regra === "custom") {
    const custom = cfg.customRule;
    const prazoImpact = lanceEmbutido * clamp(onlyNumber(custom.lePrazoPct), 0, 1) + lanceProprio * clamp(onlyNumber(custom.llPrazoPct), 0, 1);
    const parcelaImpact = lanceEmbutido * clamp(onlyNumber(custom.leParcelaPct), 0, 1) + lanceProprio * clamp(onlyNumber(custom.llParcelaPct), 0, 1);
    const parcelasAmortizadas = parcelaBase > 0 ? Math.ceil(prazoImpact / parcelaBase) : 0;
    prazoRestante = Math.max(1, prazoRestanteBase - parcelasAmortizadas);
    parcelaApos = Math.max(0, (saldoAposLance - parcelaImpact) / prazoRestante);
  }

  return {
    creditoContratado: credit,
    creditoLiquido: Math.max(0, credit - lanceEmbutido),
    parcelaInicial,
    parcelaAposContemplacao: parcelaApos,
    parcelaEstimada: parcelaAntes,
    lanceProprio,
    lanceProprioPct: credit > 0 ? (lanceProprio / credit) * 100 : 0,
    lanceEmbutido,
    lanceEmbutidoPct: credit > 0 ? (lanceEmbutido / credit) * 100 : 0,
    lanceTotal,
    lanceTotalPct: credit > 0 ? (lanceTotal / credit) * 100 : 0,
    valorCategoria,
    saldoDevedor: saldoAposLance,
    prazoTotal: prazo,
    prazoRestante,
    taxaAdmPct: taxaAdm * 100,
    fundoReservaPct: fundoReserva * 100,
    seguroPct: seguroPct * 100,
  } satisfies RadarCalculation;
}

function bidCandidates(group: AnyRow, credit: number, ownBidAvailable: number, quantidadeCotas: number, embeddedValuePerQuota = 0) {
  const maxPerQuota = quantidadeCotas > 0 ? ownBidAvailable / quantidadeCotas : ownBidAvailable;
  const stats = groupBidStats(group);
  const pcts = [0, stats.min, stats.median, stats.max, credit > 0 ? (maxPerQuota / credit) * 100 : 0]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const values = pcts.map((pct) => Math.min(maxPerQuota, Math.max(0, credit * (pct / 100) - embeddedValuePerQuota))).filter((value) => value >= 0);
  return [...new Set(values.map((value) => Math.round(value)))];
}

function maxQuotaCount(ctx: EngineContext, credit: number) {
  const desiredPower = onlyNumber(ctx.input.creditoLiquido);
  if (!desiredPower || !credit) return 1;
  return clamp(Math.ceil((desiredPower * 1.15) / credit), 1, 12);
}

function buildOffer(
  ctx: EngineContext,
  group: AnyRow,
  range: AnyRow,
  prazoRule: AnyRow,
  lanceOption: AnyRow,
  calc: RadarCalculation,
  quantidadeCotas: number
) {
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

  if (stats.median !== null) motivos.push(`lance total comparado à mediana do grupo (${stats.median.toFixed(2)}%)`);
  if (stats.median !== null && calc.lanceTotalPct < stats.median) {
    alertas.push(`lance total ${calc.lanceTotalPct.toFixed(2)}%, abaixo da mediana; oportunidade próxima pode exigir lance maior`);
  }
  if (delivery.deliveryRatio) motivos.push(`entrega da última assembleia: ${(delivery.deliveryRatio * 100).toFixed(0)}% do esperado`);
  motivos.push(`regra pós-contemplação: ${group.regra_pos_contemplacao || "saldo devedor / prazo restante"}`);
  if (rowConfig(group).firstParcelRule?.enabled) motivos.push("considera primeira parcela diferenciada");
  if (quantidadeCotas > 1) motivos.push(`combina ${quantidadeCotas} cotas no mesmo grupo/faixa`);

  return {
    ...calc,
    id: safeId("maggi", group.id, range.id, prazoRule.id, lanceOption.key, quantidadeCotas, Math.round(calc.creditoContratado), Math.round(calc.lanceTotal)),
    admin: ctx.admin,
    adminKey: "maggi",
    table: { ...range, ...prazoRule, nome_tabela: `Grupo ${group.grupo} • ${range.label || "Faixa"}` },
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
    nomeTabela: `${quantidadeCotas > 1 ? `${quantidadeCotas} cotas • ` : ""}Grupo ${group.grupo} • ${range.label || "Faixa"}`,
    grupoCodigo: String(group.grupo || ""),
    estrategia: `${lanceOption.nomeComercial || "Lance"} • lance/embutido base categoria • ${rowConfig(group).seguroMomento === "contratacao" ? "seguro na contratação" : "seguro na contemplação"}`,
    motivos: motivos.slice(0, 5),
    alertas: alertas.slice(0, 4),
    simulatorPath: adminRouteFromKey("maggi"),
    simulatorParams: {
      origem: "radar-ofertas",
      groupId: String(group.id || ""),
      grupo: String(group.grupo || ""),
      credito: String(Math.round(calc.creditoContratado)),
      quantidadeCotas: String(quantidadeCotas),
      prazoRuleId: String(prazoRule.id || ""),
      lanceKey: String(lanceOption.key || ""),
      lanceProprioPct: String(calc.lanceProprioPct.toFixed(4)),
      lanceEmbutidoPct: String(calc.lanceEmbutidoPct.toFixed(4)),
    },
  } satisfies RadarOffer;
}

export function runMaggiEngine(ctx: EngineContext, groups: AnyRow[]): EngineResult {
  const desiredNet = onlyNumber(ctx.input.creditoLiquido);
  const desiredInstallment = onlyNumber(ctx.input.parcelaDesejada);
  const ownBid = onlyNumber(ctx.input.lanceProprio);
  const parcelaContemplacao = Math.max(1, onlyNumber(ctx.input.prazoContemplacao));
  const offers: RadarOffer[] = [];

  for (const group of groups) {
    if (group.is_active === false) continue;
    if (!rowMatchesSegment(group, ctx.input.segmento)) continue;
    const cfg = normalizeMaggiGroup(group);
    for (const range of cfg.creditRanges) {
      const credit = onlyNumber(range.valor);
      if (!credit) continue;
      for (const prazoRule of cfg.prazoRules) {
        for (const lanceOption of cfg.lanceOptions) {
          const embOptions =
            ctx.input.usarEmbutido === "ia"
              ? [0, cfg.maxLanceEmbutidoPct]
              : [ctx.input.usarEmbutido === "sim" ? cfg.maxLanceEmbutidoPct : 0];
          for (const embPct of [...new Set(embOptions)]) {
            const maxQty = maxQuotaCount(ctx, credit);
            for (let quantidadeCotas = 1; quantidadeCotas <= maxQty; quantidadeCotas++) {
              const valorCategoria = credit * (1 + normalizeFraction(onlyNumber(prazoRule.taxaAdmPct)) + normalizeFraction(onlyNumber(prazoRule.fundoReservaPct)));
              const embeddedValuePerQuota =
                group.permite_lance_embutido === false ? 0 : Math.min(valorCategoria * normalizeFraction(embPct), valorCategoria * cfg.maxLanceEmbutidoPct);
              const ownBidOptions = lanceOption.key === "livre" ? bidCandidates(group, credit, ownBid, quantidadeCotas, embeddedValuePerQuota) : [0];
              for (const ownBidPerQuota of ownBidOptions) {
                const baseCalc = calcMaggi({ group, credit, prazoRule, lanceOption, ownBid: ownBidPerQuota, embPct, parcelaContemplacao });
                const calc = aggregateCalculation(baseCalc, quantidadeCotas);
                const median = groupBidStats(group).median;
                if (calc.lanceProprio > ownBid + 1) continue;
                if (median !== null && calc.lanceTotalPct < median - 5) continue;
                if (ctx.input.modo === "credito" && purchasingPower(calc, ctx.input) < desiredNet * 0.72) continue;
                if (ctx.input.modo === "parcela" && calc.parcelaEstimada > desiredInstallment * 1.35) continue;
                offers.push(buildOffer(ctx, group, range, prazoRule, lanceOption, calc, quantidadeCotas));
              }
            }
          }
        }
      }
    }
  }

  return offers;
}
