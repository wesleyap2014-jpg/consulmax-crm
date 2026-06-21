import type { AnyRow, RadarSegment } from "./types";

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
  if (score >= 86) return "Excelente oportunidade";
  if (score >= 72) return "Boa aderência";
  if (score >= 58) return "Ajustável";
  return "Fora do ideal";
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
