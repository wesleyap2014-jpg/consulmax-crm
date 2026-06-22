import { applyRelativeFeeScores, findAdminKey, onlyNumber } from "./common";
import { runBbEngine } from "./engines/bb";
import { runMaggiEngine } from "./engines/maggi";
import type { AdminFilter, AdminRow, RadarInput, RadarOffer, RadarSourceData } from "./types";

function adminKey(admin: AdminRow) {
  return findAdminKey(`${admin.slug || ""} ${admin.name || ""}`);
}

function fallbackAdmin(key: Exclude<AdminFilter, "todas">): AdminRow {
  const names = {
    bb: "BB Consórcios",
    embracon: "EMBRACON",
    maggi: "MAGGI",
  };

  return { id: key, name: names[key], slug: key, behavior: {}, rules: {} };
}

function findAdmin(admins: AdminRow[], key: Exclude<AdminFilter, "todas">) {
  return admins.find((admin) => adminKey(admin) === key) || fallbackAdmin(key);
}

function shouldRun(input: RadarInput, key: Exclude<AdminFilter, "todas">) {
  return input.administradora === "todas" || input.administradora === key;
}

function dedupeOffers(offers: RadarOffer[]) {
  const map = new Map<string, RadarOffer>();
  for (const offer of offers) {
    const key = `${offer.adminKey}-${offer.group?.id || offer.table.id}-${offer.quantidadeCotas}-${Math.round(offer.creditoContratado)}-${Math.round(offer.lanceTotal)}-${Math.round(offer.parcelaEstimada)}`;
    if (!map.has(key)) map.set(key, offer);
  }
  return [...map.values()];
}

function groupKey(offer: RadarOffer) {
  return `${offer.adminKey}-${offer.group?.id || offer.grupoCodigo || offer.table.id}`;
}

function targetMetrics(input: RadarInput, offer: RadarOffer) {
  const desiredPower = onlyNumber(input.creditoLiquido);
  const desiredInstallment = onlyNumber(input.parcelaDesejada);
  const ownBid = onlyNumber(input.lanceProprio);

  return {
    creditGap: desiredPower > 0 ? Math.abs(offer.poderCompra - desiredPower) / desiredPower : 0,
    installmentGap: desiredInstallment > 0 ? Math.abs(offer.parcelaAposContemplacao - desiredInstallment) / desiredInstallment : 0,
    bidGap: ownBid > 0 ? Math.abs(offer.lanceProprio - ownBid) / ownBid : 0,
  };
}

function limitOffersPerGroup(offers: RadarOffer[], input: RadarInput) {
  const groups = new Map<string, RadarOffer[]>();
  for (const offer of offers) {
    const key = groupKey(offer);
    groups.set(key, [...(groups.get(key) || []), offer]);
  }

  const selected: RadarOffer[] = [];

  for (const groupOffers of groups.values()) {
    const ordered = [...groupOffers].sort((a, b) => b.score - a.score || b.probabilidadeContemplacao - a.probabilidadeContemplacao);
    const bucket = new Map<string, RadarOffer>();

    const byCredit = [...ordered].sort((a, b) => targetMetrics(input, a).creditGap - targetMetrics(input, b).creditGap || b.score - a.score)[0];
    const byInstallment = [...ordered].sort((a, b) => targetMetrics(input, a).installmentGap - targetMetrics(input, b).installmentGap || b.score - a.score)[0];
    const byBid = [...ordered].sort((a, b) => targetMetrics(input, a).bidGap - targetMetrics(input, b).bidGap || b.score - a.score)[0];

    for (const offer of [byCredit, byInstallment, byBid, ordered[0]]) {
      if (!offer || bucket.has(offer.id)) continue;
      bucket.set(offer.id, offer);
      if (bucket.size >= 3) break;
    }

    selected.push(...bucket.values());
  }

  return selected;
}

export function findBestOffers(input: RadarInput, data: RadarSourceData) {
  const minProbability = onlyNumber(input.probabilidadeMinima);
  const minAdherence = onlyNumber(input.aderenciaMinima);
  const offers: RadarOffer[] = [];

  if (shouldRun(input, "bb")) {
    offers.push(...runBbEngine({ input, admin: findAdmin(data.admins, "bb") }, data.bbGroups || []));
  }

  if (shouldRun(input, "maggi")) {
    offers.push(...runMaggiEngine({ input, admin: findAdmin(data.admins, "maggi") }, data.maggiGroups || []));
  }

  const filtered = dedupeOffers(offers).filter((offer) => offer.probabilidadeContemplacao >= minProbability);

  const scored = applyRelativeFeeScores(filtered)
    .filter((offer) => offer.score >= minAdherence)
    .sort((a, b) => b.score - a.score || b.probabilidadeContemplacao - a.probabilidadeContemplacao);

  return limitOffersPerGroup(scored, input)
    .sort((a, b) => b.score - a.score || b.probabilidadeContemplacao - a.probabilidadeContemplacao)
    .slice(0, 30);
}

export function offerToSimulatorQuery(offer: RadarOffer) {
  const params = new URLSearchParams({
    ...offer.simulatorParams,
    radar: "1",
    admin: offer.adminKey,
    probabilidade: String(Number(offer.probabilidadeContemplacao || 0).toFixed(2)),
    parcela: String(Math.round(offer.parcelaEstimada)),
    parcelaApos: String(Math.round(offer.parcelaAposContemplacao)),
    creditoLiquido: String(Math.round(offer.creditoLiquido)),
    poderCompra: String(Math.round(offer.poderCompra)),
    quantidadeCotas: String(offer.quantidadeCotas || 1),
    lanceProprio: String(Math.round(offer.lanceProprio)),
    lanceEmbutido: String(Math.round(offer.lanceEmbutido)),
    lanceTotal: String(Math.round(offer.lanceTotal)),
  });

  return params.toString();
}
