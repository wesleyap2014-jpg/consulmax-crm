import type { AnyRow, RadarCalculation, RadarInput, RadarScoreBreakdown, RadarSegment } from "./types";

export function onlyNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;

  const cleaned = value
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizePct(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value <= 1 ? value * 100 : value;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function brMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export function brPct(value: number) {
  return `${(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function slugify(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function pickNumber(row: AnyRow | null | undefined, keys: string[]) {
  if (!row) return 0;
  for (const key of keys) {
    const n = onlyNumber(row[key]);
    if (n > 0) return n;
  }
  return 0;
}

export function parseMaybeJson(value: unknown): AnyRow | AnyRow[] | null {
  if (!value) return null;
  if (typeof value === "object") return value as AnyRow | AnyRow[];
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function rowConfig(row: AnyRow | null | undefined): AnyRow {
  const parsed = parseMaybeJson(row?.config);
  return parsed && !Array.isArray(parsed) ? parsed : {};
}

export function asRows(value: unknown): AnyRow[] {
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

export function segmentAliases(segmento: RadarSegment) {
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
      "automoveis",
      "automóveis",
      "auto_ipca",
      "auto_fipe",
      "outros bens",
      "outros_bens",
    ],
    Imóvel: ["imovel", "imoveis", "imóvel", "imóveis", "imovel estendido", "imoveis estendido", "residencial", "construcao", "reforma"],
    Serviços: ["servico", "servicos", "serviço", "serviços"],
  };

  return aliases[segmento];
}

export function rowMatchesSegment(row: AnyRow, segmento: RadarSegment) {
  const haystack = normalizeText(
    `${row.segmento || ""} ${row.segment || ""} ${row.produto || ""} ${row.product || ""} ${row.category || ""} ${row.category_name || ""} ${row.categoria || ""} ${row.tipo_bem || ""} ${row.nome_tabela || ""} ${row.name || ""} ${row.nome_grupo || ""}`
  );
  return segmentAliases(segmento).some((term) => haystack.includes(normalizeText(term)));
}

export function safeId(...parts: Array<string | number | undefined | null>) {
  return parts.filter(Boolean).join("-").replace(/[^a-zA-Z0-9_-]/g, "");
}

export function scoreLabel(score: number) {
  if (score >= 88) return "Aderência excelente";
  if (score >= 76) return "Boa aderência";
  if (score >= 62) return "Aderência parcial";
  return "Baixa aderência";
}

export function findAdminKey(nameOrSlug: string) {
  const key = normalizeText(nameOrSlug);
  if (key.includes("maggi")) return "maggi";
  if (key.includes("embracon")) return "embracon";
  if (key.includes("bb") || key.includes("banco do brasil") || key.includes("bb consorcios")) return "bb";
  return "";
}

export function adminRouteFromKey(adminKey: string) {
  if (adminKey === "maggi") return "/simuladores/maggi";
  if (adminKey === "embracon") return "/simuladores/embracon";
  if (adminKey === "bb") return "/simuladores/bb-consorcios";
  return "/simuladores";
}

export function purchasingPower(calc: Pick<RadarCalculation, "creditoLiquido" | "lanceProprio">, input: RadarInput) {
  const ownBidAvailable = onlyNumber(input.lanceProprio);
  return calc.creditoLiquido + Math.max(0, ownBidAvailable - calc.lanceProprio);
}

function minTargetScore(actual: number, target: number) {
  if (!target) return 85;
  if (actual >= target) {
    const excess = (actual - target) / target;
    return clamp(100 - Math.max(0, excess - 0.15) * 80, 70, 100);
  }
  return clamp((actual / target) * 100, 0, 100);
}

function maxBudgetScore(actual: number, target: number) {
  if (!target) return 85;
  if (actual <= target) return clamp(100 - Math.max(0, target - actual) / target * 8, 92, 100);
  return clamp(100 - ((actual - target) / target) * 120, 0, 100);
}

function assemblyRow(group: AnyRow | null | undefined): AnyRow {
  const assembly = rowConfig(group).assemblyResult;
  if (assembly && !Array.isArray(assembly) && typeof assembly === "object") return assembly as AnyRow;
  return {};
}

function pickNumberDeep(group: AnyRow | null | undefined, keys: string[]) {
  return pickNumber(group, keys) || pickNumber(rowConfig(group), keys) || pickNumber(assemblyRow(group), keys);
}

export function groupDeliveryStats(group: AnyRow | null | undefined) {
  const activeParticipants = pickNumberDeep(group, [
    "participantes_ativos",
    "participantesAtivos",
    "activeParticipants",
    "cotas_ativas",
    "cotasAtivas",
    "active_quotas",
  ]);
  const totalAssemblies = pickNumberDeep(group, [
    "assembleias_total",
    "total_assembleias",
    "totalAssemblies",
    "qtd_assembleias",
    "quantidade_assembleias",
    "assemblyCount",
  ]);
  const lastDelivered = pickNumberDeep(group, [
    "entregas_ultima_assembleia",
    "entrega_ultima_assembleia",
    "cotas_entregues_ultima",
    "contemplados_ultima_assembleia",
    "ultima_entrega",
    "lastDelivered",
    "deliveredLastAssembly",
    "delivered_last_assembly",
    "quantidadeContemplados",
    "contemplados",
  ]);

  const expectedPerAssembly = activeParticipants > 0 && totalAssemblies > 0 ? activeParticipants / totalAssemblies : 0;
  const deliveryRatio = expectedPerAssembly > 0 && lastDelivered > 0 ? lastDelivered / expectedPerAssembly : 0;

  return {
    activeParticipants: activeParticipants || null,
    totalAssemblies: totalAssemblies || null,
    expectedPerAssembly: expectedPerAssembly || null,
    lastDelivered: lastDelivered || null,
    deliveryRatio: deliveryRatio || null,
  };
}

export function groupNextAssembly(group: AnyRow | null | undefined) {
  const cfg = rowConfig(group);
  const assembly = assemblyRow(group);
  const raw =
    group?.proxima_assembleia ||
    group?.data_proxima_assembleia ||
    group?.next_assembly_date ||
    group?.nextAssemblyDate ||
    cfg.proximaAssembleia ||
    cfg.nextAssemblyDate ||
    cfg.next_assembly_date ||
    assembly.proximaAssembleia ||
    assembly.nextAssemblyDate ||
    assembly.next_assembly_date;
  return raw ? String(raw) : null;
}

function deliveryScore(group: AnyRow | null | undefined) {
  const stats = groupDeliveryStats(group);
  if (!stats.deliveryRatio) return 70;
  const pct = stats.deliveryRatio * 100;
  if (pct >= 100) return 100;
  if (pct >= 70) return 84 + ((pct - 70) / 30) * 14;
  if (pct >= 40) return 58 + ((pct - 40) / 30) * 22;
  if (pct >= 20) return 35 + ((pct - 20) / 20) * 18;
  return clamp(15 + pct, 0, 35);
}

function nextAssemblyScore(group: AnyRow | null | undefined) {
  const raw = groupNextAssembly(group);
  if (!raw) return 70;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 70;
  const today = new Date();
  const days = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (days < 0) return 45;
  if (days <= 7) return 100;
  if (days <= 15) return 92;
  if (days <= 30) return 82;
  if (days <= 60) return 68;
  return 55;
}

function groupProfileScore(calc: RadarCalculation, group: AnyRow | null | undefined) {
  const cfg = rowConfig(group);
  const assembly = cfg.assemblyResult;
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
    .map(normalizePct)
    .sort((a, b) => a - b);
  const listMedian = bids.length ? (bids.length % 2 ? bids[Math.floor(bids.length / 2)] : (bids[bids.length / 2 - 1] + bids[bids.length / 2]) / 2) : 0;
  const statsSource = assembly || group;
  const med =
    listMedian ||
    pickNumber(statsSource && !Array.isArray(statsSource) ? (statsSource as AnyRow) : {}, ["medianaPct"]) ||
    pickNumber(group, ["mediana_pct_contemplado", "mediana_pct_lance_livre", "mediana_lance_livre", "mediana_lance", "median_lance", "media_lance_livre", "media_lance", "avg_lance", "lance_medio", "median", "mediana"]) ||
    pickNumber(cfg, ["mediana_pct_contemplado", "mediana_pct_lance_livre", "mediana_lance_livre", "mediana_lance", "median_lance", "media_lance_livre", "media_lance", "avg_lance", "lance_medio", "median", "mediana"]) ||
    pickNumber(statsSource && !Array.isArray(statsSource) ? (statsSource as AnyRow) : {}, [
      "medianaPct",
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
    ]);
  const medianPct = normalizePct(med);
  if (!medianPct) return 70;
  const gap = calc.lanceTotalPct - medianPct;
  if (gap >= 5) return 100;
  if (gap >= 0) return 92 + (gap / 5) * 8;
  if (gap >= -5) return 78 + ((gap + 5) / 5) * 12;
  if (gap >= -10) return 58 + ((gap + 10) / 5) * 16;
  return clamp(58 + gap * 2, 10, 58);
}

function feeScore(value: number, excellent: number, acceptable: number) {
  if (!value) return 75;
  if (value <= excellent) return 100;
  if (value <= acceptable) return 100 - ((value - excellent) / (acceptable - excellent)) * 30;
  return clamp(70 - ((value - acceptable) / acceptable) * 50, 20, 70);
}

export function aggregateCalculation(calc: RadarCalculation, quantidadeCotas: number): RadarCalculation {
  if (quantidadeCotas <= 1) return calc;
  const q = quantidadeCotas;
  const creditoContratado = calc.creditoContratado * q;
  const creditoLiquido = calc.creditoLiquido * q;
  const lanceProprio = calc.lanceProprio * q;
  const lanceEmbutido = calc.lanceEmbutido * q;
  const lanceTotal = calc.lanceTotal * q;

  return {
    ...calc,
    creditoContratado,
    creditoLiquido,
    parcelaInicial: calc.parcelaInicial * q,
    parcelaAposContemplacao: calc.parcelaAposContemplacao * q,
    parcelaEstimada: calc.parcelaEstimada * q,
    lanceProprio,
    lanceProprioPct: creditoContratado > 0 ? (lanceProprio / creditoContratado) * 100 : 0,
    lanceEmbutido,
    lanceEmbutidoPct: creditoContratado > 0 ? (lanceEmbutido / creditoContratado) * 100 : 0,
    lanceTotal,
    lanceTotalPct: creditoContratado > 0 ? (lanceTotal / creditoContratado) * 100 : 0,
    valorCategoria: calc.valorCategoria * q,
    saldoDevedor: calc.saldoDevedor * q,
  };
}

export function scoreOffer(calc: RadarCalculation, input: RadarInput, quantidadeCotas = 1, group?: AnyRow | null): RadarScoreBreakdown {
  const desiredPower = onlyNumber(input.creditoLiquido);
  const desiredInstallment = onlyNumber(input.parcelaDesejada);
  const ownBidAvailable = onlyNumber(input.lanceProprio);
  const power = purchasingPower(calc, input);

  const creditoScore = input.modo === "credito" ? minTargetScore(power, desiredPower) : minTargetScore(calc.creditoLiquido, desiredPower);
  const parcelaScore = desiredInstallment > 0 ? maxBudgetScore(calc.parcelaEstimada, desiredInstallment) : 85;
  const lanceScore = ownBidAvailable > 0 ? maxBudgetScore(calc.lanceProprio, ownBidAvailable) : calc.lanceProprio <= 0 ? 100 : 0;
  const perfilGrupoScore = groupProfileScore(calc, group);
  const entregasScore = deliveryScore(group);
  const taxaAdmScore = feeScore(calc.taxaAdmPct, 16, 24);
  const fundoReservaScore = feeScore(calc.fundoReservaPct, 0.5, 3);
  const assembleiaScore = nextAssemblyScore(group);
  const cotasPenalty = Math.max(0, quantidadeCotas - 1) * 6;

  const weights =
    input.modo === "parcela"
      ? { credito: 0.18, parcela: 0.28, lance: 0.16, perfilGrupo: 0.16, entregas: 0.1, taxaAdm: 0.05, fundoReserva: 0.03, assembleia: 0.04 }
      : { credito: 0.25, parcela: 0.2, lance: 0.15, perfilGrupo: 0.18, entregas: 0.1, taxaAdm: 0.05, fundoReserva: 0.03, assembleia: 0.04 };

  const total =
    creditoScore * weights.credito +
    parcelaScore * weights.parcela +
    lanceScore * weights.lance +
    perfilGrupoScore * weights.perfilGrupo +
    entregasScore * weights.entregas +
    taxaAdmScore * weights.taxaAdm +
    fundoReservaScore * weights.fundoReserva +
    assembleiaScore * weights.assembleia -
    cotasPenalty;

  return {
    credito: Math.round(creditoScore),
    parcela: Math.round(parcelaScore),
    lance: Math.round(lanceScore),
    perfilGrupo: Math.round(perfilGrupoScore),
    entregas: Math.round(entregasScore),
    taxaAdm: Math.round(taxaAdmScore),
    fundoReserva: Math.round(fundoReservaScore),
    assembleia: Math.round(assembleiaScore),
    total: Math.round(clamp(total, 0, 100)),
  };
}
