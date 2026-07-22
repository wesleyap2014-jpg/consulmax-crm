export type BBGroupIdentityRow = {
  grupo: string;
  segmento: string;
  prazo: number;
  taxaAdmPct: number;
  fundoReservaPct: number;
  seguroPct: number;
  venda?: string | null;
};

function stableIdentityNumber(value: unknown, decimals = 8) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toFixed(decimals) : Number(0).toFixed(decimals);
}

export function bbGroupIdentityKey(row: BBGroupIdentityRow) {
  const grupo = String(row.grupo || "").trim();

  if (grupo !== "000000") {
    return `bb:${row.segmento}:grupo:${grupo}`;
  }

  return [
    "bb",
    row.segmento,
    "provisorio",
    `venda-${String(row.venda || "padrao").trim().toLowerCase()}`,
    `prazo-${Number(row.prazo || 0)}`,
    `adm-${stableIdentityNumber(row.taxaAdmPct)}`,
    `fr-${stableIdentityNumber(row.fundoReservaPct)}`,
    `seguro-${stableIdentityNumber(row.seguroPct)}`,
  ].join(":");
}
