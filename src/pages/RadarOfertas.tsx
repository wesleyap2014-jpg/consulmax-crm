// src/pages/RadarOfertas.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Loader2,
  Search,
  Send,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";

type AnyRow = Record<string, any>;

type AdminRow = {
  id: string;
  name: string;
  slug?: string | null;
  behavior?: AnyRow | null;
};

type SearchMode = "credito" | "parcela";
type EmbedDecision = "ia" | "sim" | "nao";
type RadarSegment = "Automóvel" | "Imóvel" | "Serviços";

type RadarInput = {
  modo: SearchMode;
  segmento: RadarSegment;
  creditoLiquido: string;
  parcelaDesejada: string;
  lanceProprio: string;
  prazoContemplacao: string;
  usarEmbutido: EmbedDecision;
  probabilidadeMinima: string;
};

type RadarOffer = {
  id: string;
  admin: AdminRow;
  table: AnyRow;
  group?: AnyRow | null;
  score: number;
  scoreLabel: string;
  creditoContratado: number;
  creditoLiquido: number;
  parcelaEstimada: number;
  lanceProprio: number;
  lanceProprioPct: number;
  lanceEmbutido: number;
  lanceEmbutidoPct: number;
  lanceTotal: number;
  lanceTotalPct: number;
  mediaGrupoPct: number | null;
  probabilidadeContemplacao: number;
  prazoContemplacaoDesejado: number;
  prazo: number;
  segmento: string;
  estrategia: string;
  motivos: string[];
  alertas: string[];
};

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  lightGold: "#E0CE8C",
  off: "#F5F5F5",
};

const RADAR_SEGMENTS: RadarSegment[] = ["Automóvel", "Imóvel", "Serviços"];
const PROBABILITY_OPTIONS = ["40", "50", "60", "70", "80", "90"];
const SELECTED_OFFER_STORAGE = "@consulmax:radar-ofertas:selected-offer-v1";

const PROBABILITY_PARAMS = {
  menorLancePctChance: 90,
  medianaPctChance: 95,
  maiorLancePctChance: 99.9,
  abaixoMenorChanceInicial: 89,
  abaixoMenorChancePiso: 80,
  abaixoMenorGapAtePisoPct: 10,
  muitoAbaixoChancePiso: 45,
  muitoAbaixoGapPct: 35,
};

const DEFAULT_INPUT: RadarInput = {
  modo: "credito",
  segmento: "Automóvel",
  creditoLiquido: "150000",
  parcelaDesejada: "1500",
  lanceProprio: "30000",
  prazoContemplacao: "6",
  usarEmbutido: "ia",
  probabilidadeMinima: "60",
};

function onlyNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const cleaned = value
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function brMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function brPct(value: number) {
  return `${(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function slugify(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function pickNumber(row: AnyRow | null | undefined, keys: string[]) {
  if (!row) return 0;
  for (const key of keys) {
    const n = onlyNumber(row[key]);
    if (n > 0) return n;
  }
  return 0;
}

function findByKey(row: AnyRow, includes: string[], excludes: string[] = []) {
  const entries = Object.keys(row || {});
  const key = entries.find((k) => {
    const nk = normalizeText(k);
    return includes.every((term) => nk.includes(term)) && excludes.every((term) => !nk.includes(term));
  });
  return key ? row[key] : undefined;
}

function parseMaybeJson(value: unknown): AnyRow | AnyRow[] | null {
  if (!value) return null;
  if (typeof value === "object") return value as AnyRow | AnyRow[];
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function rowConfig(row: AnyRow | null | undefined): AnyRow {
  const parsed = parseMaybeJson(row?.config);
  return parsed && !Array.isArray(parsed) ? parsed : {};
}

function asRows(value: unknown): AnyRow[] {
  const parsed = parseMaybeJson(value) || value;
  if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === "object") as AnyRow[];
  if (!parsed || typeof parsed !== "object") return [];

  const row = parsed as AnyRow;
  const nested = row.items || row.rows || row.data || row.results || row.ranges || row.creditRanges;
  if (Array.isArray(nested)) return nested.filter((item) => item && typeof item === "object") as AnyRow[];

  const values = Object.values(row);
  if (values.length && values.every((item) => item && typeof item === "object")) return values as AnyRow[];
  return [row];
}

function configRows(row: AnyRow, key: string) {
  return asRows(rowConfig(row)[key]);
}

function adminSlug(admin: AdminRow) {
  return admin.slug || slugify(admin.name);
}

function isBbAdmin(admin: AdminRow) {
  const key = `${adminSlug(admin)} ${normalizeText(admin.name)}`;
  return (
    key.includes("bb-consorcios") ||
    key.includes("bb consorcios") ||
    key.includes("banco do brasil") ||
    key.includes("bb")
  );
}

function adminRoute(admin: AdminRow) {
  const key = `${adminSlug(admin)} ${normalizeText(admin.name)}`;
  if (key.includes("maggi")) return "/simuladores/maggi";
  if (key.includes("embracon")) return "/simuladores/embracon";
  if (key.includes("bb-consorcios") || key.includes("bb consorcios") || key.includes("banco do brasil") || key.includes("bb"))
    return "/simuladores/bb-consorcios";
  return `/simuladores/${adminSlug(admin)}`;
}

function simulatorSearchParams(offer: RadarOffer) {
  const params = new URLSearchParams({
    origem: "radar-ofertas",
    radar: "1",
    admin: adminSlug(offer.admin),
    tableId: String(offer.table.id || ""),
    groupId: String(offer.table.group_id || offer.group?.id || ""),
    grupo: String(offer.table.grupo || offer.group?.grupo || offer.group?.codigo || ""),
    segmento: offer.segmento,
    credito: String(Math.round(offer.creditoContratado)),
    creditoLiquido: String(Math.round(offer.creditoLiquido)),
    parcela: String(Math.round(offer.parcelaEstimada)),
    prazo: String(Math.round(offer.prazo)),
    prazoContemplacao: String(Math.round(offer.prazoContemplacaoDesejado || 0)),
    lanceProprio: String(Math.round(offer.lanceProprio)),
    lanceProprioPct: String(Number(offer.lanceProprioPct || 0).toFixed(4)),
    lanceEmbutido: String(Math.round(offer.lanceEmbutido)),
    lanceEmbutidoPct: String(Number(offer.lanceEmbutidoPct || 0).toFixed(4)),
    lanceTotal: String(Math.round(offer.lanceTotal)),
    lanceTotalPct: String(Number(offer.lanceTotalPct || 0).toFixed(4)),
    probabilidade: String(Number(offer.probabilidadeContemplacao || 0).toFixed(2)),
  });

  return params.toString();
}

function tableCreditMin(table: AnyRow) {
  return (
    pickNumber(table, [
      "faixa_credito_min",
      "credito_min",
      "min_credit",
      "valor_min",
      "minimo",
      "credito_de",
      "valor_credito_min",
      "valor_bem_min",
      "valor_credito",
      "valor_bem",
      "valor_carta",
      "credito",
      "credit_value",
    ]) ||
    onlyNumber(findByKey(table, ["faixa", "min"])) ||
    onlyNumber(findByKey(table, ["credito", "min"])) ||
    10_000
  );
}

function tableCreditMax(table: AnyRow) {
  return (
    pickNumber(table, [
      "faixa_credito_max",
      "credito_max",
      "max_credit",
      "valor_max",
      "maximo",
      "credito_ate",
      "credito_disponivel",
      "credito",
      "valor_credito",
      "valor_bem",
      "valor_carta",
      "credit_value",
    ]) ||
    onlyNumber(findByKey(table, ["faixa", "max"])) ||
    onlyNumber(findByKey(table, ["credito", "max"])) ||
    2_000_000
  );
}

function tableDeadline(table: AnyRow) {
  return pickNumber(table, ["prazo_limite", "prazo_maximo", "prazo", "max_prazo", "prazo_meses", "prazo_encerramento_meses", "months", "term"]) || 240;
}

function tableFeePct(table: AnyRow) {
  const raw =
    pickNumber(table, ["taxa_adm", "taxa_admin", "taxa_administracao", "administration_fee", "taxa", "taxa_total", "taxa_plano"]) ||
    onlyNumber(findByKey(table, ["tax"])) ||
    18;
  return raw <= 1 ? raw * 100 : raw;
}

function maxEmbeddedPct(admin: AdminRow, table: AnyRow) {
  const behavior = admin.behavior || {};
  const raw =
    pickNumber(table, [
      "lance_embutido_max",
      "max_embutido",
      "embutido_max",
      "lance_embutido_pct",
      "max_lance_embutido",
      "percentual_lance_embutido",
      "lance_embutido_max_pct",
    ]) ||
    pickNumber(behavior, ["lance_embutido_max", "max_embutido", "embutido_max", "max_lance_embutido"]) ||
    25;
  return clamp(raw <= 1 ? raw * 100 : raw, 0, 80);
}

function groupAveragePct(group: AnyRow | null | undefined) {
  return groupBidStats(group).median;
}

function normalizePct(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value <= 1 ? value * 100 : value;
}

function groupBidStats(group: AnyRow | null | undefined) {
  const empty = { min: null as number | null, median: null as number | null, max: null as number | null };
  if (!group) return empty;

  const assembly = rowConfig(group).assemblyResult;
  const assemblyRow = !Array.isArray(assembly) && assembly && typeof assembly === "object" ? assembly as AnyRow : {};
  const high = normalizePct(pickNumber(group, ["maior_pct_contemplado", "maior_lance_pct", "lance_maximo_pct", "highest_bid_pct"]) ||
    pickNumber(assemblyRow, ["maior_pct_contemplado", "maior_lance_pct", "lance_maximo_pct", "highest_bid_pct", "maior_lance", "highestBidPct"]));
  const low = normalizePct(pickNumber(group, ["menor_pct_contemplado", "menor_lance_pct", "lance_minimo_pct", "lowest_bid_pct"]) ||
    pickNumber(assemblyRow, ["menor_pct_contemplado", "menor_lance_pct", "lance_minimo_pct", "lowest_bid_pct", "menor_lance", "lowestBidPct"]));

  const bids = asRows(assembly)
    .map((row) =>
      pickNumber(row, [
        "percentual_lance",
        "lance_pct",
        "lance_percentual",
        "percentual",
        "pct",
        "bidPct",
        "bid_percent",
        "valor_lance_percentual",
      ])
    )
    .filter((value) => value > 0)
    .map(normalizePct);

  let median: number | null = null;
  if (bids.length) {
    const sorted = [...bids].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  const raw =
    pickNumber(group, ["mediana_lance", "median_lance", "media_lance_livre", "media_lance", "avg_lance", "lance_medio", "median", "mediana"]) ||
    pickNumber(assemblyRow, ["mediana_lance", "median_lance", "media_lance_livre", "media_lance", "avg_lance", "lance_medio", "median", "mediana"]) ||
    onlyNumber(findByKey(group, ["media", "lance"])) ||
    onlyNumber(findByKey(group, ["mediana"]));
  if (!median && raw) median = normalizePct(raw);
  if (!median && high > 0 && low > 0) median = (high + low) / 2;

  return {
    min: low > 0 ? low : bids.length ? Math.min(...bids) : null,
    median,
    max: high > 0 ? high : bids.length ? Math.max(...bids) : null,
  };
}

function interpolate(value: number, from: number, to: number, chanceFrom: number, chanceTo: number) {
  if (to === from) return chanceTo;
  const ratio = clamp((value - from) / (to - from), 0, 1);
  return chanceFrom + (chanceTo - chanceFrom) * ratio;
}

function estimateProbability(params: { ownBidPct: number; totalBidPct: number; group: AnyRow | null; desiredMonths: number }) {
  const { ownBidPct, group } = params;
  const stats = groupBidStats(group);
  const min = stats.min;
  const median = stats.median;
  const max = stats.max;

  if (!min && !median && !max) {
    return clamp(Math.round(60 + ownBidPct * 0.8), 5, PROBABILITY_PARAMS.maiorLancePctChance);
  }

  const baseAnchor = median ?? min ?? max ?? 0;
  const minAnchor = min ?? Math.max(0, baseAnchor - 10);
  const medianAnchor = median ?? (min && max ? (min + max) / 2 : baseAnchor);
  const maxAnchor = max ?? medianAnchor + 10;

  let probability = PROBABILITY_PARAMS.abaixoMenorChancePiso;

  if (ownBidPct >= maxAnchor) {
    probability = PROBABILITY_PARAMS.maiorLancePctChance;
  } else if (ownBidPct >= medianAnchor) {
    probability = interpolate(
      ownBidPct,
      medianAnchor,
      maxAnchor,
      PROBABILITY_PARAMS.medianaPctChance,
      PROBABILITY_PARAMS.maiorLancePctChance
    );
  } else if (ownBidPct >= minAnchor) {
    probability = interpolate(
      ownBidPct,
      minAnchor,
      medianAnchor,
      PROBABILITY_PARAMS.menorLancePctChance,
      PROBABILITY_PARAMS.medianaPctChance
    );
  } else {
    const gap = minAnchor - ownBidPct;
    if (gap <= PROBABILITY_PARAMS.abaixoMenorGapAtePisoPct) {
      probability = interpolate(
        gap,
        0,
        PROBABILITY_PARAMS.abaixoMenorGapAtePisoPct,
        PROBABILITY_PARAMS.abaixoMenorChanceInicial,
        PROBABILITY_PARAMS.abaixoMenorChancePiso
      );
    } else {
      probability = interpolate(
        gap,
        PROBABILITY_PARAMS.abaixoMenorGapAtePisoPct,
        PROBABILITY_PARAMS.muitoAbaixoGapPct,
        PROBABILITY_PARAMS.abaixoMenorChancePiso,
        PROBABILITY_PARAMS.muitoAbaixoChancePiso
      );
    }
  }

  return clamp(Number(probability.toFixed(1)), 1, PROBABILITY_PARAMS.maiorLancePctChance);
}

function segmentAliases(segmento: RadarSegment) {
  const aliases: Record<RadarSegment, string[]> = {
    Automóvel: [
      "automovel",
      "auto",
      "veiculo",
      "veiculos",
      "motocicleta",
      "motocicletas",
      "moto",
      "motos",
      "pesado",
      "pesados",
      "caminhao",
      "caminhoes",
      "onibus",
      "implemento",
      "implementos",
    ],
    Imóvel: ["imovel", "imoveis", "imovel estendido", "imoveis estendido", "residencial", "construcao", "reforma"],
    Serviços: ["servico", "servicos"],
  };

  return aliases[segmento];
}

function matchesSegment(row: AnyRow, segmento: RadarSegment) {
  const haystack = normalizeText(
    `${row.segmento || ""} ${row.segment || ""} ${row.produto || ""} ${row.product || ""} ${row.category || ""} ${row.category_name || ""} ${row.categoria || ""} ${row.tipo_bem || ""} ${row.nome_tabela || ""} ${row.name || ""}`
  );
  return segmentAliases(segmento).some((term) => haystack.includes(term));
}

function groupMatches(group: AnyRow, admin: AdminRow, segmento: RadarSegment) {
  const adminName = normalizeText(admin.name);
  const adminSlugText = normalizeText(adminSlug(admin));
  const gAdmin = normalizeText(group.administradora || group.admin || group.admin_name || group.name_admin || "");
  const sameAdmin = !gAdmin || adminName.includes(gAdmin) || gAdmin.includes(adminName) || gAdmin.includes(adminSlugText);
  return sameAdmin && matchesSegment(group, segmento);
}

function scoreLabel(score: number) {
  if (score >= 86) return "Excelente oportunidade";
  if (score >= 72) return "Boa aderência";
  if (score >= 58) return "Ajustável";
  return "Fora do ideal";
}

function safeId(...parts: Array<string | number | undefined>) {
  return parts.filter(Boolean).join("-").replace(/[^a-zA-Z0-9_-]/g, "");
}

function reducerOptions(table: AnyRow) {
  const haystack = normalizeText(
    `${Object.keys(table || {}).join(" ")} ${table.forma_contratacao || ""} ${table.redutor || ""} ${table.reduzida || ""} ${table.tipo_parcela || ""}`
  );
  const options = new Set<number>([1]);
  if (haystack.includes("25")) options.add(0.75);
  if (haystack.includes("50")) options.add(0.5);
  return [...options].sort((a, b) => a - b);
}

function groupCode(group: AnyRow) {
  return String(group.codigo || group.grupo || group.group_code || group.code || group.numero_grupo || "").trim();
}

function rangeName(range: AnyRow, index: number) {
  return String(range.nome || range.name || range.label || range.descricao || range.description || `Faixa ${index + 1}`);
}

function availableQuotaCount(row: AnyRow) {
  return pickNumber(row, ["cotas", "qtd_cotas", "quantidade_cotas", "available_quotas", "quotas", "quotaCount", "cotas_disponiveis"]);
}

function reserveFundPct(row: AnyRow) {
  const raw = pickNumber(row, ["fundo_reserva", "fundo_reserva_pct", "reserve_fund", "reserveFundPct"]);
  return raw <= 1 && raw > 0 ? raw * 100 : raw;
}

function tableFromBbGroup(group: AnyRow, admin: AdminRow, range: AnyRow = {}, index = 0): AnyRow {
  const code = groupCode(group);
  return {
    ...group,
    ...range,
    id: `${group.id || code || "bb-group"}-${range.id || range.codigo || range.code || index}`,
    group_id: group.id,
    codigo: code || group.codigo,
    grupo: code || group.grupo,
    original_admin_id: group.admin_id,
    admin_id: admin.id,
    administradora: group.administradora || "BB Consórcios",
    nome_tabela: `${code ? `Grupo ${code}` : "Grupo BB"} • ${rangeName(range, index)}`,
    faixa_credito_min: pickNumber(range, ["faixa_credito_min", "credito_min", "min_credit", "valor_min", "valor_credito_min", "valor_bem_min"]) || tableCreditMin(group),
    faixa_credito_max: tableCreditMax(range) || tableCreditMax(group),
    prazo_limite: tableDeadline(range) || tableDeadline(group),
    config: group.config,
    _group: group,
    _range: range,
    _source: "sim_bb_groups",
  };
}

function tablesFromBbGroup(group: AnyRow, admin: AdminRow) {
  const rawRanges = parseMaybeJson(rowConfig(group).creditRanges) || rowConfig(group).creditRanges;
  const ranges = Array.isArray(rawRanges)
    ? rawRanges.map((range) => (range && typeof range === "object" ? range as AnyRow : { valor_credito: range }))
    : configRows(group, "creditRanges");

  if (!ranges.length) return [tableFromBbGroup(group, admin)];
  return ranges.map((range, index) => tableFromBbGroup(group, admin, range, index));
}

function buildScenario(params: {
  input: RadarInput;
  admin: AdminRow;
  table: AnyRow;
  group: AnyRow | null;
  credit: number;
  reducer: number;
  embPct: number;
}) {
  const { input, admin, table, group, credit, reducer, embPct } = params;
  const desiredNet = onlyNumber(input.creditoLiquido);
  const desiredInstallment = onlyNumber(input.parcelaDesejada);
  const ownBid = onlyNumber(input.lanceProprio);
  const desiredMonths = Math.max(0, onlyNumber(input.prazoContemplacao));
  const minProbability = onlyNumber(input.probabilidadeMinima);

  const embedded = credit * (embPct / 100);
  const totalBid = ownBid + embedded;
  const net = Math.max(0, credit - embedded);
  const prazo = group ? Math.min(tableDeadline(table), tableDeadline(group)) : tableDeadline(table);
  const totalWithFee = credit * (1 + tableFeePct(table) / 100);
  const installment = (totalWithFee / Math.max(1, prazo)) * reducer;
  const bidPct = credit > 0 ? (totalBid / credit) * 100 : 0;
  const ownBidPct = credit > 0 ? (ownBid / credit) * 100 : 0;
  const avgPct = groupAveragePct(group);
  const probability = estimateProbability({ ownBidPct, totalBidPct: bidPct, group, desiredMonths });

  const motivos: string[] = [];
  const alertas: string[] = [];
  let score = 45;

  if (input.modo === "credito") {
    if (net >= desiredNet) {
      score += 22;
      motivos.push("crédito líquido atende o valor desejado");
    } else {
      score -= 18;
      alertas.push("crédito líquido ficou abaixo do solicitado");
    }

    if (desiredInstallment > 0) {
      if (installment <= desiredInstallment) {
        score += 10;
        motivos.push("parcela estimada dentro do orçamento informado");
      } else {
        score -= 12;
        alertas.push("parcela estimada passa do limite informado");
      }
    }
  } else {
    if (installment <= desiredInstallment) {
      score += 24;
      motivos.push("parcela estimada atende ao valor informado");
    } else {
      score -= 22;
      alertas.push("parcela estimada passa do limite informado");
    }

    motivos.push(`com essa parcela, estima crédito líquido de ${brMoney(net)}`);
  }

  if (input.usarEmbutido === "ia") motivos.push(embPct > 0 ? `IA considerou embutido de ${brPct(embPct)}` : "IA considerou proposta sem embutido");
  else if (embPct > 0) motivos.push(`usa lance embutido permitido de ${brPct(embPct)}`);
  else motivos.push("não utiliza lance embutido");

  if (reducer < 1) motivos.push(`simula parcela reduzida de ${brPct(reducer * 100)} da parcela cheia`);

  if (avgPct !== null) {
    if (ownBidPct >= avgPct + 2) {
      score += 18;
      motivos.push(`lance próprio acima da mediana/média do grupo (${brPct(avgPct)})`);
    } else if (ownBidPct >= avgPct) {
      score += 12;
      motivos.push(`lance próprio próximo da mediana/média do grupo (${brPct(avgPct)})`);
    } else {
      score -= 10;
      alertas.push(`lance próprio abaixo da mediana/média do grupo (${brPct(avgPct)})`);
    }
  } else {
    alertas.push("sem média/mediana de lance cadastrada para este grupo");
  }

  if (desiredMonths > 0 && desiredMonths <= 3 && (avgPct === null || ownBidPct < avgPct + 4)) {
    score -= 7;
    alertas.push("prazo de contemplação muito curto para a força do lance estimada");
  }

  if (minProbability > 0) {
    if (probability >= minProbability) {
      score += 10;
      motivos.push(`probabilidade estimada atende o mínimo de ${brPct(minProbability)}`);
    } else {
      score -= 12;
      alertas.push(`probabilidade estimada abaixo do mínimo de ${brPct(minProbability)}`);
    }
  }

  const finalScore = clamp(Math.round(score), 0, 100);

  return {
    id: safeId(admin.id, table.id, group?.id, Math.round(credit), Math.round(embPct * 100), Math.round(reducer * 100)),
    admin,
    table,
    group,
    score: finalScore,
    scoreLabel: scoreLabel(finalScore),
    creditoContratado: credit,
    creditoLiquido: net,
    parcelaEstimada: installment,
    lanceProprio: ownBid,
    lanceProprioPct: ownBidPct,
    lanceEmbutido: embedded,
    lanceEmbutidoPct: embPct,
    lanceTotal: totalBid,
    lanceTotalPct: bidPct,
    mediaGrupoPct: avgPct,
    probabilidadeContemplacao: probability,
    prazoContemplacaoDesejado: desiredMonths,
    prazo,
    segmento: String(table.segmento || group?.segmento || input.segmento || "Não informado"),
    estrategia: embPct > 0 ? "Lance próprio + embutido permitido" : "Lance próprio sem embutido",
    motivos: motivos.slice(0, 5),
    alertas: alertas.slice(0, 4),
  } satisfies RadarOffer;
}

function buildOffers(input: RadarInput, admins: AdminRow[], tables: AnyRow[], groups: AnyRow[]) {
  const desiredNet = onlyNumber(input.creditoLiquido);
  const desiredInstallment = onlyNumber(input.parcelaDesejada);
  const minProbability = onlyNumber(input.probabilidadeMinima);
  if (input.modo === "credito" && !desiredNet) return [];
  if (input.modo === "parcela" && !desiredInstallment) return [];

  const selectedAdmins = admins.filter((a) => isBbAdmin(a));
  const byAdmin = new Map(selectedAdmins.map((a) => [a.id, a]));
  const results: RadarOffer[] = [];

  for (const table of tables) {
    const admin = byAdmin.get(String(table.admin_id || table.administradora_id || table.sim_admin_id || ""));
    if (!admin) continue;
    if (!matchesSegment(table, input.segmento)) continue;

    const possibleGroups = groups.filter((g) => groupMatches(g, admin, input.segmento));
    const group = table._source === "sim_bb_groups" ? table : possibleGroups[0] || null;

    const minCredit = tableCreditMin(table);
    const maxCredit = tableCreditMax(table);
    const prazo = tableDeadline(table);
    const feePct = tableFeePct(table);
    const reducers = reducerOptions(table);
    const allowedEmbPct = maxEmbeddedPct(admin, table);
    const embOptions =
      input.usarEmbutido === "ia"
        ? [...new Set([0, allowedEmbPct].filter((value) => value >= 0))]
        : [input.usarEmbutido === "sim" ? allowedEmbPct : 0];
    const credits: number[] = [];

    if (input.modo === "credito") {
      for (const embPct of embOptions) {
        const wantedGross = desiredNet / Math.max(0.1, 1 - embPct / 100);
        credits.push(clamp(wantedGross, minCredit, maxCredit));
        credits.push(clamp(wantedGross * 1.1, minCredit, maxCredit));
        credits.push(clamp(wantedGross * 1.25, minCredit, maxCredit));
      }
    } else {
      for (const reducer of reducers) {
        const estimatedCredit = (desiredInstallment * prazo) / Math.max(0.1, 1 + feePct / 100) / Math.max(0.1, reducer);
        credits.push(clamp(estimatedCredit, minCredit, maxCredit));
        credits.push(clamp(estimatedCredit * 0.9, minCredit, maxCredit));
        credits.push(clamp(estimatedCredit * 1.1, minCredit, maxCredit));
      }
    }

    for (const credit of [...new Set(credits.map((value) => Math.round(value)))]) {
      for (const reducer of reducers) {
        for (const embPct of embOptions) {
          results.push(buildScenario({ input, admin, table, group, credit, reducer, embPct }));
        }
      }
    }
  }

  const unique = new Map<string, RadarOffer>();
  for (const offer of results.sort((a, b) => b.score - a.score)) {
    const key = `${offer.admin.id}-${offer.table.id}-${Math.round(offer.creditoContratado)}-${Math.round(offer.lanceEmbutido)}-${Math.round(offer.parcelaEstimada)}`;
    if (!unique.has(key)) unique.set(key, offer);
  }

  return [...unique.values()]
    .filter((offer) => offer.probabilidadeContemplacao >= minProbability)
    .sort((a, b) => b.probabilidadeContemplacao - a.probabilidadeContemplacao || b.score - a.score)
    .slice(0, 30);
}

function OfferCard({ offer, rank, onOpen, onCopy }: { offer: RadarOffer; rank: number; onOpen: () => void; onCopy: () => void }) {
  const accent = C.ruby;
  const probabilityLabel = offer.probabilidadeContemplacao >= 95 ? "Alta" : offer.probabilidadeContemplacao >= 90 ? "Boa" : "Média";
  const isFeatured = rank === 1;
  const quotas = availableQuotaCount(offer.table) || availableQuotaCount(offer.group || {});
  const taxaAdm = tableFeePct(offer.table);
  const fundoReserva = reserveFundPct(offer.table);

  return (
    <Card
      className="relative overflow-hidden rounded-[28px] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl"
      style={{
        borderColor: isFeatured ? accent : "rgba(15,23,42,.10)",
        borderWidth: isFeatured ? 2 : 1,
        boxShadow: isFeatured ? "0 18px 42px rgba(161,28,39,.18)" : undefined,
      }}
    >
      {isFeatured && (
        <div className="absolute left-0 right-0 top-0 flex items-center gap-2 px-4 py-2 text-xs font-black text-white" style={{ background: accent }}>
          <Trophy className="h-3.5 w-3.5" /> Recomendado pela IA
        </div>
      )}

      <CardContent className={isFeatured ? "p-5 pt-12" : "p-5"}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.08em] text-slate-500">
              <Building2 className="h-3.5 w-3.5" /> {offer.admin.name}
            </div>
            <h3 className="mt-2 truncate text-base font-black" style={{ color: C.navy }}>
              {offer.table.nome_tabela || offer.table.name || "Oferta BB Consórcios"}
            </h3>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-black" style={{ color: C.navy }}>{quotas ? `${quotas} cotas` : `#${rank}`}</div>
            <button type="button" onClick={onCopy} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
              <Send className="h-3.5 w-3.5" /> Enviar PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Valor contratado</div>
            <div className="mt-1 text-lg font-black" style={{ color: C.navy }}>{brMoney(offer.creditoContratado)}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Crédito líquido</div>
            <div className="mt-1 text-lg font-black" style={{ color: accent }}>{brMoney(offer.creditoLiquido)}</div>
          </div>
        </div>

        <div className="my-5 flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: "rgba(161,28,39,.08)" }}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-[5px] bg-white text-center"
              style={{ borderColor: accent, color: accent }}
            >
              <span className="text-base font-black leading-none">{Math.round(offer.probabilidadeContemplacao)}%</span>
              <span className="text-[9px] font-bold leading-none">{probabilityLabel}</span>
            </div>
            <div className="text-xs text-slate-600">
              <div className="font-black" style={{ color: C.navy }}>Assertividade</div>
              <div>{offer.scoreLabel}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-black" style={{ color: accent }}>
              {Math.max(1, offer.prazoContemplacaoDesejado || 3)} meses
            </div>
            <div className="text-xs font-semibold text-slate-500">até a contemplação</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
          <CardLine label="Lance próprio" value={brMoney(offer.lanceProprio)} />
          <CardLine label="% lance próprio" value={brPct(offer.lanceProprioPct)} />
          <CardLine label="Parcela mensal" value={brMoney(offer.parcelaEstimada)} />
          <CardLine label="Lance embutido" value={brMoney(offer.lanceEmbutido)} />
          <CardLine label="Mediana grupo" value={offer.mediaGrupoPct === null ? "Sem dados" : brPct(offer.mediaGrupoPct)} />
          <CardLine label="Prazo total" value={`${offer.prazo} meses`} />
          <CardLine label="Taxa adm." value={brPct(taxaAdm)} />
          <CardLine label="Fundo reserva" value={fundoReserva ? brPct(fundoReserva) : "0,00%"} />
        </div>

        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-3">
          <div className="text-xs font-bold" style={{ color: C.navy }}>Estratégia sugerida</div>
          <p className="mt-1 text-xs text-slate-600">{offer.estrategia}</p>
          {offer.alertas[0] && <p className="mt-2 text-xs text-amber-700">{offer.alertas[0]}</p>}
        </div>

        <div className="mt-5 space-y-2">
          <Button variant="ghost" className="w-full rounded-2xl font-black text-slate-700">
            Expandir detalhes <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
          <Button className="w-full rounded-2xl text-white" style={{ background: accent }} onClick={onOpen}>
            Seguir contratação <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CardLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 font-black" style={{ color: C.navy }}>{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white/75 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-base font-black" style={{ color: C.navy }}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function RadarOfertas() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [tables, setTables] = useState<AnyRow[]>([]);
  const [groupsDb, setGroupsDb] = useState<AnyRow[]>([]);
  const [input, setInput] = useState<RadarInput>(DEFAULT_INPUT);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      const [adminsRes, bbGroupsRes] = await Promise.all([
        supabase.from("sim_admins").select("*").order("name", { ascending: true }),
        supabase.from("sim_bb_groups").select("*"),
      ]);

      if (!alive) return;

      const loadedAdmins = ((adminsRes.data || []) as AdminRow[]).filter((a) => a.id && a.name && isBbAdmin(a));
      const bbAdmin = loadedAdmins[0] || { id: "bb-consorcios", name: "BB Consórcios", slug: "bb-consorcios", behavior: null };

      const bbAdmins = loadedAdmins.length ? loadedAdmins : [bbAdmin];
      const bbGroups = ((bbGroupsRes.data || []) as AnyRow[]).map((group) => tableFromBbGroup(group, bbAdmin));
      const bbTables = ((bbGroupsRes.data || []) as AnyRow[]).flatMap((group) => tablesFromBbGroup(group, bbAdmin));

      setAdmins(bbAdmins);
      setTables(bbTables.filter((table) => table.admin_id));
      setGroupsDb(bbGroups);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const effectiveTables = useMemo(() => tables, [tables]);
  const allGroups = useMemo(() => groupsDb, [groupsDb]);

  const availableAdmins = useMemo(() => {
    return admins.filter((admin) =>
      isBbAdmin(admin) &&
      effectiveTables.some((table) => String(table.admin_id || table.administradora_id || table.sim_admin_id || "") === admin.id)
    );
  }, [admins, effectiveTables]);

  const offers = useMemo(() => buildOffers(input, availableAdmins, effectiveTables, allGroups), [input, availableAdmins, effectiveTables, allGroups]);

  function update<K extends keyof RadarInput>(key: K, value: RadarInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
    setSearched(false);
  }

  function copyOffer(offer: RadarOffer) {
    const text = [
      `Radar de Ofertas Consulmax`,
      `Administradora: ${offer.admin.name}`,
      `Tabela/Grupo: ${offer.table.nome_tabela || offer.table.name || "Sugestão"}`,
      offer.group?.codigo ? `Grupo: ${offer.group.codigo}` : null,
      `Crédito contratado: ${brMoney(offer.creditoContratado)}`,
      `Poder de compra estimado na contemplação: ${brMoney(offer.creditoLiquido)}`,
      `Parcela estimada: ${brMoney(offer.parcelaEstimada)}`,
      `Lance próprio: ${brMoney(offer.lanceProprio)}`,
      `Lance embutido: ${brMoney(offer.lanceEmbutido)}`,
      `Lance total: ${brMoney(offer.lanceTotal)} (${brPct(offer.lanceTotalPct)})`,
      `Mediana/média: ${offer.mediaGrupoPct === null ? "não cadastrada" : brPct(offer.mediaGrupoPct)}`,
      `Probabilidade estimada: ${brPct(offer.probabilidadeContemplacao)}`,
      `Score: ${offer.score}/100 - ${offer.scoreLabel}`,
      `Estratégia: ${offer.estrategia}`,
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function openOfferInSimulator(offer: RadarOffer) {
    const payload = {
      source: "radar-ofertas",
      savedAt: new Date().toISOString(),
      offer,
    };

    try {
      sessionStorage.setItem(SELECTED_OFFER_STORAGE, JSON.stringify(payload));
    } catch {}

    navigate(`${adminRoute(offer.admin)}?${simulatorSearchParams(offer)}`);
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando Radar de Ofertas...
      </div>
    );
  }

  if (searched) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <section
          className="relative overflow-hidden rounded-[30px] border p-6 md:p-8 shadow-sm"
          style={{ background: "linear-gradient(135deg, rgba(30,41,63,.98), rgba(161,28,39,.94))", borderColor: "rgba(255,255,255,.22)" }}
        >
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: "rgba(181,165,115,.30)" }} />
          <div className="relative z-[1] flex flex-col gap-4 text-white md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" /> Resultado do Radar
              </div>
              <h1 className="text-2xl font-black tracking-tight md:text-4xl">Ofertas BB Consórcios encontradas</h1>
              <p className="mt-3 max-w-3xl text-sm text-white/80 md:text-base">
                Critérios: {input.modo === "credito" ? `poder de compra de ${brMoney(onlyNumber(input.creditoLiquido))}` : `parcela de ${brMoney(onlyNumber(input.parcelaDesejada))}`}, segmento {input.segmento}, lance próprio de {brMoney(onlyNumber(input.lanceProprio))} e probabilidade mínima de {brPct(onlyNumber(input.probabilidadeMinima))}.
              </p>
            </div>
            <Button variant="outline" className="rounded-2xl border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => setSearched(false)}>
              Voltar e ajustar busca
            </Button>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Possibilidades analisadas" value={`${offers.length}`} />
          <Metric label="Fonte atual" value="BB Consórcios" />
          <Metric label="Embutido" value={input.usarEmbutido === "ia" ? "IA Decide" : input.usarEmbutido === "sim" ? "Sim" : "Não"} />
          <Metric label="Prazo desejado" value={`${onlyNumber(input.prazoContemplacao) || 0} meses`} />
        </div>

        {offers.length === 0 ? (
          <Card className="rounded-[28px] border bg-white/80 p-6 text-sm text-slate-600">
            Nenhuma combinação aderente foi encontrada com os dados atuais da BB Consórcios. Revise crédito/parcela, segmento, lance próprio ou probabilidade mínima.
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
            {offers.map((offer, index) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                rank={index + 1}
                onOpen={() => openOfferInSimulator(offer)}
                onCopy={() => copyOffer(offer)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <section
        className="relative overflow-hidden rounded-[30px] border p-6 md:p-8 shadow-sm"
        style={{ background: "linear-gradient(135deg, rgba(30,41,63,.98), rgba(161,28,39,.94))", borderColor: "rgba(255,255,255,.22)" }}
      >
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: "rgba(181,165,115,.30)" }} />
        <div className="absolute -bottom-24 left-12 h-60 w-60 rounded-full blur-3xl" style={{ background: "rgba(255,255,255,.12)" }} />
        <div className="relative z-[1] max-w-4xl text-white">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
            <Target className="h-3.5 w-3.5" /> Radar de Ofertas
          </div>
          <h1 className="text-2xl font-black tracking-tight md:text-4xl">Encontre oportunidade por crédito ou por parcela.</h1>
          <p className="mt-3 max-w-3xl text-sm text-white/80 md:text-base">
            Nesta primeira versão, o Radar usa somente os grupos importados da BB Consórcios e interpreta o crédito líquido como poder de compra desejado na contemplação.
          </p>
        </div>
      </section>

      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="p-5 md:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-black" style={{ color: C.navy }}>Buscar ofertas</h2>
            <p className="text-sm text-slate-600">Escolha se o ponto de partida é o poder de compra desejado ou o valor da parcela.</p>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => update("modo", "credito")}
              className="rounded-2xl border p-4 text-left transition"
              style={{ borderColor: input.modo === "credito" ? C.ruby : "rgba(30,41,63,.14)", background: input.modo === "credito" ? "rgba(161,28,39,.07)" : "white" }}
            >
              <div className="font-black" style={{ color: C.navy }}>Buscar por crédito</div>
              <div className="text-sm text-slate-600">Informe o poder de compra desejado na contemplação.</div>
            </button>
            <button
              type="button"
              onClick={() => update("modo", "parcela")}
              className="rounded-2xl border p-4 text-left transition"
              style={{ borderColor: input.modo === "parcela" ? C.ruby : "rgba(30,41,63,.14)", background: input.modo === "parcela" ? "rgba(161,28,39,.07)" : "white" }}
            >
              <div className="font-black" style={{ color: C.navy }}>Buscar por parcela</div>
              <div className="text-sm text-slate-600">Informe a parcela e veja quanto crédito dá para contratar.</div>
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {input.modo === "credito" ? (
              <Field label="Crédito líquido desejado">
                <input className="w-full rounded-2xl border px-3 py-2" value={input.creditoLiquido} onChange={(e) => update("creditoLiquido", e.target.value)} placeholder="150000" />
              </Field>
            ) : (
              <Field label="Parcela desejada">
                <input className="w-full rounded-2xl border px-3 py-2" value={input.parcelaDesejada} onChange={(e) => update("parcelaDesejada", e.target.value)} placeholder="1500" />
              </Field>
            )}

            <Field label="Lance próprio disponível">
              <input className="w-full rounded-2xl border px-3 py-2" value={input.lanceProprio} onChange={(e) => update("lanceProprio", e.target.value)} placeholder="30000" />
            </Field>
            <Field label="Prazo desejado para contemplação">
              <input className="w-full rounded-2xl border px-3 py-2" value={input.prazoContemplacao} onChange={(e) => update("prazoContemplacao", e.target.value)} placeholder="6 meses" />
            </Field>
            <Field label="Segmento">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.segmento} onChange={(e) => update("segmento", e.target.value as RadarSegment)}>
                {RADAR_SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            <Field label="Fonte de ofertas">
              <input className="w-full rounded-2xl border bg-slate-50 px-3 py-2 text-slate-500" value="BB Consórcios" disabled />
            </Field>
            <Field label="Usar lance embutido?">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.usarEmbutido} onChange={(e) => update("usarEmbutido", e.target.value as RadarInput["usarEmbutido"])}>
                <option value="ia">IA Decide</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </Field>
            <Field label="Probabilidade mínima">
              <select className="w-full rounded-2xl border px-3 py-2" value={input.probabilidadeMinima} onChange={(e) => update("probabilidadeMinima", e.target.value)}>
                {PROBABILITY_OPTIONS.map((value) => <option key={value} value={value}>{value}%</option>)}
              </select>
            </Field>
            {input.modo === "credito" && (
              <Field label="Parcela máxima opcional">
                <input className="w-full rounded-2xl border px-3 py-2" value={input.parcelaDesejada} onChange={(e) => update("parcelaDesejada", e.target.value)} placeholder="1500" />
              </Field>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="rounded-2xl" onClick={() => setInput(DEFAULT_INPUT)}>Limpar filtros</Button>
            <Button className="rounded-2xl text-white" style={{ background: C.ruby }} onClick={() => setSearched(true)}>
              <Search className="mr-2 h-4 w-4" /> Buscar melhores ofertas
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border bg-white/80 shadow-sm backdrop-blur">
        <CardContent className="p-5 md:p-6">
          <h2 className="text-lg font-black" style={{ color: C.navy }}>Categorias consideradas</h2>
          <div className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-3">
            <div className="rounded-2xl border bg-white/75 p-4">
              <b>Automóvel</b>
              <p className="mt-1">Motocicletas, automóvel e pesados.</p>
            </div>
            <div className="rounded-2xl border bg-white/75 p-4">
              <b>Imóvel</b>
              <p className="mt-1">Imóveis e imóvel estendido.</p>
            </div>
            <div className="rounded-2xl border bg-white/75 p-4">
              <b>Serviços</b>
              <p className="mt-1">Categorias de serviços disponíveis na BB Consórcios.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
