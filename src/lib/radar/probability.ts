import { asRows, clamp, normalizePct, pickNumber, rowConfig } from "./common";
import type { AnyRow } from "./types";

export const PROBABILITY_PARAMS = {
  menorLancePctChance: 90,
  medianaPctChance: 95,
  maiorLancePctChance: 99.9,
  abaixoMenorChanceInicial: 89,
  abaixoMenorChancePiso: 80,
  abaixoMenorGapAtePisoPct: 10,
  muitoAbaixoChancePiso: 45,
  muitoAbaixoGapPct: 35,
};

function interpolate(value: number, from: number, to: number, chanceFrom: number, chanceTo: number) {
  if (to === from) return chanceTo;
  const ratio = clamp((value - from) / (to - from), 0, 1);
  return chanceFrom + (chanceTo - chanceFrom) * ratio;
}

const MIN_KEYS = [
  "menor_pct_contemplado",
  "menor_pct_lance_livre",
  "menor_lance_livre",
  "menor_pct_contemplado",
  "menor_lance_pct",
  "lance_minimo_pct",
  "lowest_bid_pct",
  "menor_lance",
  "lowestBidPct",
  "menorLancePct",
  "menorLanceContemplado",
  "menorLanceContempladoPct",
  "minBidPct",
  "min_bid_pct",
  "lowestBid",
];

const MEDIAN_KEYS = [
  "mediana_pct_contemplado",
  "mediana_pct_lance_livre",
  "mediana_lance_livre",
  "mediana_lance",
  "median_lance",
  "media_lance_livre",
  "media_lance",
  "avg_lance",
  "lance_medio",
  "median",
  "mediana",
  "medianaLance",
  "medianaLancePct",
  "mediaLance",
  "mediaLancePct",
  "lanceMedio",
  "lanceMedioPct",
  "averageBidPct",
  "avgBidPct",
  "medianBidPct",
];

const MAX_KEYS = [
  "maior_pct_contemplado",
  "maior_pct_lance_livre",
  "maior_lance_livre",
  "maior_pct_contemplado",
  "maior_lance_pct",
  "lance_maximo_pct",
  "highest_bid_pct",
  "maior_lance",
  "highestBidPct",
  "maiorLancePct",
  "maiorLanceContemplado",
  "maiorLanceContempladoPct",
  "maxBidPct",
  "max_bid_pct",
  "highestBid",
];

const BID_KEYS = [
  "percentual_lance",
  "lance_pct",
  "lance_percentual",
  "percentual",
  "pct",
  "bidPct",
  "bid_percent",
  "valor_lance_percentual",
  "lancePct",
  "lancePercentual",
  "percentualLance",
  "bid",
];

function nestedRows(value: unknown): AnyRow[] {
  const direct = asRows(value);
  const nested: AnyRow[] = [];
  for (const row of direct) {
    nested.push(row);
    for (const item of Object.values(row)) {
      if (Array.isArray(item)) nested.push(...asRows(item));
      else if (item && typeof item === "object") nested.push(...asRows(item));
    }
  }
  return nested;
}

function assemblyValue(group: AnyRow | null | undefined, key: "maiorPct" | "menorPct" | "medianaPct") {
  const cfg = rowConfig(group);
  const assembly = cfg.assemblyResult;
  if (assembly && !Array.isArray(assembly) && typeof assembly === "object") {
    return normalizePct(pickNumber(assembly as AnyRow, [key]));
  }
  return 0;
}

function lanceLivreFromConfig(group: AnyRow | null | undefined) {
  const cfg = rowConfig(group);
  const raw =
    cfg.lanceLivreMedia ||
    cfg.lance_livre_media ||
    cfg.lanceLivre ||
    cfg.lance_livre ||
    cfg.percentual_lance_livre ||
    cfg.lanceLivrePct;
  return normalizePct(typeof raw === "number" ? raw : pickNumber(cfg, ["lanceLivreMedia", "lance_livre_media", "lanceLivre", "lance_livre", "percentual_lance_livre", "lanceLivrePct"]));
}

export function groupBidStats(group: AnyRow | null | undefined) {
  const empty = { min: null as number | null, median: null as number | null, max: null as number | null };
  if (!group) return empty;

  const config = rowConfig(group);
  const assembly = config.assemblyResult || config.resultadoAssembleia || config.assembly || config.assemblies || config.resultados;
  const assemblyRow = !Array.isArray(assembly) && assembly && typeof assembly === "object" ? (assembly as AnyRow) : {};
  const high = normalizePct(
    assemblyValue(group, "maiorPct") || pickNumber(group, MAX_KEYS) || pickNumber(config, MAX_KEYS) || pickNumber(assemblyRow, MAX_KEYS)
  );
  const low = normalizePct(
    assemblyValue(group, "menorPct") || pickNumber(group, MIN_KEYS) || pickNumber(config, MIN_KEYS) || pickNumber(assemblyRow, MIN_KEYS) || lanceLivreFromConfig(group)
  );

  const bids = nestedRows(assembly)
    .map((row) => pickNumber(row, BID_KEYS))
    .filter((value) => value > 0)
    .map(normalizePct);

  let median: number | null = null;
  if (bids.length) {
    const sorted = [...bids].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  const rawMedian = normalizePct(
    assemblyValue(group, "medianaPct") || pickNumber(group, MEDIAN_KEYS) || pickNumber(config, MEDIAN_KEYS) || pickNumber(assemblyRow, MEDIAN_KEYS)
  );

  if (!median && rawMedian) median = rawMedian;
  if (!median && high > 0 && low > 0) median = (high + low) / 2;
  if (!median && high > 0) median = high;
  if (!median && low > 0) median = low;

  return {
    min: low > 0 ? low : bids.length ? Math.min(...bids) : null,
    median,
    max: high > 0 ? high : bids.length ? Math.max(...bids) : null,
  };
}

export function estimateProbability(params: { bidPct: number; group?: AnyRow | null }) {
  const { bidPct, group } = params;
  const stats = groupBidStats(group);
  const min = stats.min;
  const median = stats.median;
  const max = stats.max;

  if (!min && !median && !max) return 0;

  const baseAnchor = median ?? min ?? max ?? 0;
  const minAnchor = min ?? Math.max(0, baseAnchor - 10);
  const medianAnchor = median ?? (min && max ? (min + max) / 2 : baseAnchor);
  const maxAnchor = max ?? medianAnchor + 10;

  let probability = PROBABILITY_PARAMS.abaixoMenorChancePiso;

  if (bidPct >= maxAnchor) {
    probability = PROBABILITY_PARAMS.maiorLancePctChance;
  } else if (bidPct >= medianAnchor) {
    probability = interpolate(
      bidPct,
      medianAnchor,
      maxAnchor,
      PROBABILITY_PARAMS.medianaPctChance,
      PROBABILITY_PARAMS.maiorLancePctChance
    );
  } else if (bidPct >= minAnchor) {
    probability = interpolate(
      bidPct,
      minAnchor,
      medianAnchor,
      PROBABILITY_PARAMS.menorLancePctChance,
      PROBABILITY_PARAMS.medianaPctChance
    );
  } else {
    const gap = minAnchor - bidPct;
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
