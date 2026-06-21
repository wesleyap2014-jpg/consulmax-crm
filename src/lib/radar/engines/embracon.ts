import {
  adminRouteFromKey,
  clamp,
  normalizeText,
  onlyNumber,
  rowMatchesSegment,
  safeId,
  scoreLabel,
} from "../common";
import { estimateProbability, groupBidStats } from "../probability";
import type { AdminRow, AnyRow, EngineContext, EngineResult, RadarCalculation, RadarOffer } from "../types";

type FormaContratacao = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%";
type LanceTipo = "livre" | "fixo_25" | "fixo_50";

function normalizeRules(raw: AnyRow | null | undefined) {
  const r = raw || {};
  return {
    modelo_lance: r?.lance?.modelo ?? r?.modelo_lance ?? "percentual",
    lance_ofert_base: r?.lance?.base_ofertado === "categoria" ? "valor_categoria" : r?.lance_ofert_base ?? "credito",
    lance_embut_base: r?.lance_embutido?.base === "categoria" ? "valor_categoria" : r?.lance_embut_base ?? "credito",
    embut_base: r?.embut_base ?? "credito",
    embut_cap_adm_pct: Number(r?.lance_embutido?.cap_pct ?? r?.embut_cap_adm_pct ?? 0.25),
    modelo_lance_base: r?.modelo_lance_base ?? "credito",
    limit_enabled: r?.limitador_parcela?.existe === false ? false : r?.limit_enabled ?? true,
    redutor_pre_contemplacao_enabled:
      r?.redutor_pre_contratacao?.permite === true ? true : r?.redutor_pre_contemplacao_enabled === true,
    redutor_base: r?.redutor_base ?? (r?.limitador_parcela?.base === "categoria" ? "valor_categoria" : "valor_categoria"),
  };
}

function normalizeFraction(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 100 : value;
}

function formasPermitidas(table: AnyRow): FormaContratacao[] {
  const formas: FormaContratacao[] = [];
  if (table.contrata_parcela_cheia) formas.push("Parcela Cheia");
  if (table.contrata_reduzida_25) formas.push("Reduzida 25%");
  if (table.contrata_reduzida_50) formas.push("Reduzida 50%");
  return formas;
}

function lancesPermitidos(table: AnyRow): LanceTipo[] {
  const lances: LanceTipo[] = [];
  if (table.permite_lance_livre) lances.push("livre");
  if (table.permite_lance_fixo_25) lances.push("fixo_25");
  if (table.permite_lance_fixo_50) lances.push("fixo_50");
  return lances;
}

function lancePct(tipo: LanceTipo, ownBid: number, credit: number) {
  if (tipo === "fixo_25") return 25;
  if (tipo === "fixo_50") return 50;
  return credit > 0 ? (ownBid / credit) * 100 : 0;
}

function formaFactor(forma: FormaContratacao) {
  if (forma === "Reduzida 25%") return 0.75;
  if (forma === "Reduzida 50%") return 0.5;
  return 1;
}

function calcEmbracon(params: {
  table: AnyRow;
  admin: AdminRow;
  forma: FormaContratacao;
  lanceTipo: LanceTipo;
  credit: number;
  ownBid: number;
  embPct: number;
  parcelaContemplacao: number;
}) {
  const { table, admin, forma, lanceTipo, credit, ownBid, embPct, parcelaContemplacao } = params;
  const rules = normalizeRules(admin.rules);
  const prazo = Math.max(1, onlyNumber(table.prazo_limite));
  const taxaAdmFull = normalizeFraction(onlyNumber(table.taxa_adm_pct));
  const frPct = normalizeFraction(onlyNumber(table.fundo_reserva_pct));
  const antecipPct = normalizeFraction(onlyNumber(table.antecip_pct));
  const antecipParcelas = Math.max(0, onlyNumber(table.antecip_parcelas));
  const limitadorPct = normalizeFraction(onlyNumber(table.limitador_parcela_pct));
  const seguroPrestPct = normalizeFraction(onlyNumber(table.seguro_prest_pct));
  const fatorForma = formaFactor(forma);
  const parcelasPagas = clamp(Math.max(0, parcelaContemplacao), 0, prazo);
  const prazoRestante = Math.max(1, prazo - parcelasPagas);
  const valorCategoria = credit * (1 + taxaAdmFull + frPct);
  const parcelaTermo = valorCategoria / prazo;
  const creditoReduzido = credit * fatorForma;
  const fundoReservaReduzido = credit * frPct * fatorForma;
  const taxaAdmLiquida = credit * Math.max(0, taxaAdmFull - antecipPct);
  const baseMensalPre =
    rules.redutor_pre_contemplacao_enabled && rules.redutor_base === "valor_categoria"
      ? (valorCategoria / prazo) * fatorForma
      : (creditoReduzido + taxaAdmLiquida + fundoReservaReduzido) / prazo;
  const seguroMensal = valorCategoria * seguroPrestPct;
  const antecipCada = antecipParcelas > 0 ? (credit * antecipPct) / antecipParcelas : 0;
  const parcelaInicial = baseMensalPre + (antecipParcelas > 0 ? antecipCada : 0) + seguroMensal;
  const parcelaDemais = baseMensalPre + seguroMensal;
  const totalPagoSemSeguro = baseMensalPre * parcelasPagas + antecipCada * Math.min(parcelasPagas, antecipParcelas);
  const pctLance = lancePct(lanceTipo, ownBid, credit);
  const baseOfert = rules.lance_ofert_base === "valor_categoria" ? valorCategoria : credit;
  const baseEmbut = rules.lance_embut_base === "valor_categoria" ? valorCategoria : credit;
  const embutCapPct = table.permite_lance_embutido ? normalizeFraction(rules.embut_cap_adm_pct) : 0;
  const embutidoSolicitado = Math.min(baseEmbut * (embPct / 100), baseEmbut * embutCapPct);
  const lanceFixoValor = baseOfert * (pctLance / 100);
  const lanceEmbutidoValor =
    lanceTipo === "livre" ? embutidoSolicitado : Math.min(embutidoSolicitado, lanceFixoValor);
  const lanceProprioValor = lanceTipo === "livre" ? ownBid : Math.max(0, lanceFixoValor - lanceEmbutidoValor);
  const lanceOfertadoValor = lanceProprioValor + lanceEmbutidoValor;
  const creditoLiquido = Math.max(0, credit - lanceEmbutidoValor);
  const saldoDevedor = Math.max(0, valorCategoria - totalPagoSemSeguro - lanceOfertadoValor);
  const novaParcelaSemLimite = saldoDevedor / prazoRestante;
  const parcelaLimitante = rules.limit_enabled ? valorCategoria * limitadorPct : 0;
  const isServicos = normalizeText(table.segmento).includes("serv");
  const parcelaApos =
    !isServicos && rules.limit_enabled && parcelaLimitante > novaParcelaSemLimite
      ? parcelaLimitante
      : isServicos
        ? parcelaDemais
        : novaParcelaSemLimite;

  return {
    creditoContratado: credit,
    creditoLiquido,
    parcelaInicial,
    parcelaAposContemplacao: parcelaApos,
    parcelaEstimada: parcelaDemais,
    lanceProprio: lanceProprioValor,
    lanceProprioPct: credit > 0 ? (lanceProprioValor / credit) * 100 : 0,
    lanceEmbutido: lanceEmbutidoValor,
    lanceEmbutidoPct: credit > 0 ? (lanceEmbutidoValor / credit) * 100 : 0,
    lanceTotal: lanceOfertadoValor,
    lanceTotalPct: credit > 0 ? (lanceOfertadoValor / credit) * 100 : 0,
    valorCategoria,
    saldoDevedor,
    prazoTotal: prazo,
    prazoRestante,
    taxaAdmPct: taxaAdmFull * 100,
    fundoReservaPct: frPct * 100,
    seguroPct: seguroPrestPct * 100,
    antecipacaoPct: antecipPct * 100,
    antecipacaoParcelas: antecipParcelas,
    limitadorParcelaPct: limitadorPct * 100,
  } satisfies RadarCalculation;
}

function buildOffer(params: {
  ctx: EngineContext;
  table: AnyRow;
  forma: FormaContratacao;
  lanceTipo: LanceTipo;
  calc: RadarCalculation;
}) {
  const { ctx, table, forma, lanceTipo, calc } = params;
  const desiredNet = onlyNumber(ctx.input.creditoLiquido);
  const desiredInstallment = onlyNumber(ctx.input.parcelaDesejada);
  const probabilidade = estimateProbability({ ownBidPct: calc.lanceProprioPct, group: table });
  const stats = groupBidStats(table);
  let score = 50;
  const motivos: string[] = [];
  const alertas: string[] = [];

  if (ctx.input.modo === "credito") {
    if (calc.creditoLiquido >= desiredNet) {
      score += 18;
      motivos.push("poder de compra atende o crédito líquido desejado");
    } else {
      score -= 18;
      alertas.push("poder de compra abaixo do desejado");
    }
    if (desiredInstallment > 0 && calc.parcelaEstimada <= desiredInstallment) score += 10;
  } else if (calc.parcelaEstimada <= desiredInstallment) {
    score += 22;
    motivos.push("parcela estimada atende o orçamento informado");
  } else {
    score -= 18;
    alertas.push("parcela estimada acima do orçamento");
  }

  if (probabilidade >= onlyNumber(ctx.input.probabilidadeMinima)) score += 12;
  if (stats.median !== null) motivos.push(`lance próprio comparado à mediana do grupo (${stats.median.toFixed(2)}%)`);
  if (calc.antecipacaoPct) motivos.push(`considera antecipação de taxa em ${calc.antecipacaoParcelas || 0} parcela(s)`);
  if (calc.limitadorParcelaPct) motivos.push("aplica limitador de parcela quando a regra da tabela exige");

  const finalScore = clamp(Math.round(score), 0, 100);
  const simulatorParams: Record<string, string> = {
    origem: "radar-ofertas",
    tableId: String(table.id || ""),
    credito: String(Math.round(calc.creditoContratado)),
    creditoLiquido: String(Math.round(calc.creditoLiquido)),
    parcela: String(Math.round(calc.parcelaEstimada)),
    lanceProprio: String(Math.round(calc.lanceProprio)),
    lanceProprioPct: String(calc.lanceProprioPct.toFixed(4)),
    lanceEmbutidoPct: String(calc.lanceEmbutidoPct.toFixed(4)),
    forma,
    lanceTipo,
  };

  return {
    ...calc,
    id: safeId("embracon", table.id, forma, lanceTipo, Math.round(calc.creditoContratado), Math.round(calc.lanceTotal)),
    admin: ctx.admin,
    adminKey: "embracon",
    table,
    group: table,
    score: finalScore,
    scoreLabel: scoreLabel(finalScore),
    probabilidadeContemplacao: probabilidade,
    prazoContemplacaoDesejado: onlyNumber(ctx.input.prazoContemplacao),
    segmento: String(table.segmento || ctx.input.segmento),
    nomeTabela: String(table.nome_tabela || "Tabela Embracon"),
    grupoCodigo: null,
    estrategia: `${forma} • ${lanceTipo === "livre" ? "Lance livre" : lanceTipo === "fixo_25" ? "Fixo 25%" : "Fixo 50%"}`,
    motivos: motivos.slice(0, 5),
    alertas: alertas.slice(0, 4),
    simulatorPath: adminRouteFromKey("embracon"),
    simulatorParams,
  } satisfies RadarOffer;
}

export function runEmbraconEngine(ctx: EngineContext, tables: AnyRow[]): EngineResult {
  const desiredNet = onlyNumber(ctx.input.creditoLiquido);
  const desiredInstallment = onlyNumber(ctx.input.parcelaDesejada);
  const ownBid = onlyNumber(ctx.input.lanceProprio);
  const parcelaContemplacao = Math.max(1, onlyNumber(ctx.input.prazoContemplacao));
  const offers: RadarOffer[] = [];

  for (const table of tables) {
    if (table.is_active === false) continue;
    if (normalizeText(table.indice_correcao).includes("nao simula venda")) continue;
    if (!rowMatchesSegment(table, ctx.input.segmento)) continue;
    if (!formasPermitidas(table).length || !lancesPermitidos(table).length) continue;

    const min = onlyNumber(table.faixa_min);
    const max = onlyNumber(table.faixa_max);
    let credits: number[] = [];
    if (ctx.input.modo === "credito") {
      credits = [desiredNet, desiredNet * 1.1, desiredNet * 1.25].filter(Boolean);
    } else {
      const taxa = onlyNumber(table.taxa_adm_pct) + onlyNumber(table.fundo_reserva_pct);
      const prazo = Math.max(1, onlyNumber(table.prazo_limite));
      credits = [(desiredInstallment * prazo) / Math.max(0.1, 1 + taxa)];
    }
    credits = credits.map((credit) => clamp(Math.round(credit), min || 0, max || credit)).filter((credit) => credit > 0);

    for (const credit of [...new Set(credits)]) {
      for (const forma of formasPermitidas(table)) {
        for (const lanceTipo of lancesPermitidos(table)) {
          const embOptions =
            ctx.input.usarEmbutido === "ia"
              ? [0, table.permite_lance_embutido ? 25 : 0]
              : [ctx.input.usarEmbutido === "sim" && table.permite_lance_embutido ? 25 : 0];
          for (const embPct of [...new Set(embOptions)]) {
            const calc = calcEmbracon({ table, admin: ctx.admin, forma, lanceTipo, credit, ownBid, embPct, parcelaContemplacao });
            if (calc.lanceProprio > ownBid + 1) continue;
            offers.push(buildOffer({ ctx, table, forma, lanceTipo, calc }));
          }
        }
      }
    }
  }

  return offers;
}
