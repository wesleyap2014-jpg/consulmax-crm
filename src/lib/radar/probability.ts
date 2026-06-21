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

export function groupBidStats(group: AnyRow | null | undefined) {
  const empty = { min: null as number | null, median: null as number | null, max: null as number | null };
  if (!group) return empty;

  const assembly = rowConfig(group).assemblyResult;
  const assemblyRow = !Array.isArray(assembly) && assembly && typeof assembly === "object" ? (assembly as AnyRow) : {};
  const high = normalizePct(
    pickNumber(group, ["maior_pct_contemplado", "maior_lance_pct", "lance_maximo_pct", "highest_bid_pct"]) ||
      pickNumber(assemblyRow, ["maior_pct_contemplado", "maior_lance_pct", "lance_maximo_pct", "highest_bid_pct", "maior_lance", "highestBidPct"])
  );
  const low = normalizePct(
    pickNumber(group, ["menor_pct_contemplado", "menor_lance_pct", "lance_minimo_pct", "lowest_bid_pct"]) ||
      pickNumber(assemblyRow, ["menor_pct_contemplado", "menor_lance_pct", "lance_minimo_pct", "lowest_bid_pct", "menor_lance", "lowestBidPct"])
  );

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

  const rawMedian = normalizePct(
    pickNumber(group, ["mediana_lance", "median_lance", "media_lance_livre", "media_lance", "avg_lance", "lance_medio", "median", "mediana"]) ||
      pickNumber(assemblyRow, ["mediana_lance", "median_lance", "media_lance_livre", "media_lance", "avg_lance", "lance_medio", "median", "mediana"])
  );

  if (!median && rawMedian) median = rawMedian;
  if (!median && high > 0 && low > 0) median = (high + low) / 2;

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
