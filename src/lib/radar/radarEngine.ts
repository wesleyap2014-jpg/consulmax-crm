import { findAdminKey, onlyNumber } from "./common";
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

export function findBestOffers(input: RadarInput, data: RadarSourceData) {
  const minProbability = onlyNumber(input.probabilidadeMinima);
  const offers: RadarOffer[] = [];

  if (shouldRun(input, "bb")) {
    offers.push(...runBbEngine({ input, admin: findAdmin(data.admins, "bb") }, data.bbGroups || []));
  }

  if (shouldRun(input, "maggi")) {
    offers.push(...runMaggiEngine({ input, admin: findAdmin(data.admins, "maggi") }, data.maggiGroups || []));
  }

  return dedupeOffers(offers)
    .filter((offer) => offer.probabilidadeContemplacao >= minProbability)
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
