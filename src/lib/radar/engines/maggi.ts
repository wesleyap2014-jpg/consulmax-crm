import { adminRouteFromKey, clamp, onlyNumber, rowConfig, rowMatchesSegment, safeId, scoreLabel } from "../common";
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

function buildOffer(ctx: EngineContext, group: AnyRow, range: AnyRow, prazoRule: AnyRow, lanceOption: AnyRow, calc: RadarCalculation) {
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

  if (stats.median !== null) motivos.push(`lance próprio comparado à mediana do grupo (${stats.median.toFixed(2)}%)`);
  motivos.push(`regra pós-contemplação: ${group.regra_pos_contemplacao || "saldo devedor / prazo restante"}`);
  if (rowConfig(group).firstParcelRule?.enabled) motivos.push("considera primeira parcela diferenciada");

  const finalScore = clamp(Math.round(score + (probabilidade >= onlyNumber(ctx.input.probabilidadeMinima) ? 12 : 0)), 0, 100);
  return {
    ...calc,
    id: safeId("maggi", group.id, range.id, prazoRule.id, lanceOption.key, Math.round(calc.creditoContratado), Math.round(calc.lanceTotal)),
    admin: ctx.admin,
    adminKey: "maggi",
    table: { ...range, ...prazoRule, nome_tabela: `Grupo ${group.grupo} • ${range.label || "Faixa"}` },
    group,
    score: finalScore,
    scoreLabel: scoreLabel(finalScore),
    probabilidadeContemplacao: probabilidade,
    prazoContemplacaoDesejado: onlyNumber(ctx.input.prazoContemplacao),
    segmento: String(group.segmento || ctx.input.segmento),
    nomeTabela: `Grupo ${group.grupo} • ${range.label || "Faixa"}`,
    grupoCodigo: String(group.grupo || ""),
    estrategia: `${lanceOption.nomeComercial || "Lance"} • ${rowConfig(group).seguroMomento === "contratacao" ? "seguro na contratação" : "seguro na contemplação"}`,
    motivos: motivos.slice(0, 5),
    alertas: alertas.slice(0, 4),
    simulatorPath: adminRouteFromKey("maggi"),
    simulatorParams: {
      origem: "radar-ofertas",
      groupId: String(group.id || ""),
      grupo: String(group.grupo || ""),
      credito: String(Math.round(calc.creditoContratado)),
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
      if (ctx.input.modo === "credito" && credit < desiredNet) continue;
      for (const prazoRule of cfg.prazoRules) {
        for (const lanceOption of cfg.lanceOptions) {
          const embOptions =
            ctx.input.usarEmbutido === "ia"
              ? [0, cfg.maxLanceEmbutidoPct]
              : [ctx.input.usarEmbutido === "sim" ? cfg.maxLanceEmbutidoPct : 0];
          for (const embPct of [...new Set(embOptions)]) {
            const calc = calcMaggi({ group, credit, prazoRule, lanceOption, ownBid, embPct, parcelaContemplacao });
            if (calc.lanceProprio > ownBid + 1) continue;
            if (ctx.input.modo === "parcela" && calc.parcelaEstimada > desiredInstallment * 1.25) continue;
            offers.push(buildOffer(ctx, group, range, prazoRule, lanceOption, calc));
          }
        }
      }
    }
  }

  return offers;
}
