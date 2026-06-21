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

function closenessScore(actual: number, target: number, tolerancePct: number) {
  if (!target) return 85;
  const diffPct = Math.abs(actual - target) / target;
  return clamp(100 - (diffPct / tolerancePct) * 100, 0, 100);
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

export function scoreOffer(calc: RadarCalculation, input: RadarInput, quantidadeCotas = 1): RadarScoreBreakdown {
  const desiredPower = onlyNumber(input.creditoLiquido);
  const desiredInstallment = onlyNumber(input.parcelaDesejada);
  const ownBidAvailable = onlyNumber(input.lanceProprio);
  const desiredMonths = Math.max(1, onlyNumber(input.prazoContemplacao));
  const power = purchasingPower(calc, input);

  const creditoScore = input.modo === "credito" ? minTargetScore(power, desiredPower) : minTargetScore(calc.creditoLiquido, desiredPower);
  const parcelaScore = desiredInstallment > 0 ? maxBudgetScore(calc.parcelaEstimada, desiredInstallment) : 85;
  const lanceScore = ownBidAvailable > 0 ? maxBudgetScore(calc.lanceProprio, ownBidAvailable) : calc.lanceProprio <= 0 ? 100 : 0;
  const prazoScore = closenessScore(desiredMonths, Math.max(1, desiredMonths), 0.35);
  const sobraRatio = ownBidAvailable > 0 ? Math.max(0, ownBidAvailable - calc.lanceProprio) / ownBidAvailable : 0;
  const cotasPenalty = Math.max(0, quantidadeCotas - 1) * 6;
  const eficienciaScore = clamp(92 + sobraRatio * 8 - cotasPenalty, 45, 100);

  const weights =
    input.modo === "parcela"
      ? { credito: 0.22, parcela: 0.35, lance: 0.2, prazo: 0.1, eficiencia: 0.13 }
      : { credito: 0.35, parcela: 0.22, lance: 0.2, prazo: 0.1, eficiencia: 0.13 };

  const total =
    creditoScore * weights.credito +
    parcelaScore * weights.parcela +
    lanceScore * weights.lance +
    prazoScore * weights.prazo +
    eficienciaScore * weights.eficiencia;

  return {
    credito: Math.round(creditoScore),
    parcela: Math.round(parcelaScore),
    lance: Math.round(lanceScore),
    prazo: Math.round(prazoScore),
    eficiencia: Math.round(eficienciaScore),
    total: Math.round(clamp(total, 0, 100)),
  };
}
