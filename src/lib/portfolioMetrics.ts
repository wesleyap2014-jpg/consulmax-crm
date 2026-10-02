// Datas de competência da carteira usam o calendário de Rondônia (UTC-4).
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Manaus",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type PortfolioMovement = {
  valor_venda?: number | string | null;
  encarteirada_em?: string | null;
  cancelada_em?: string | null;
};

export function portfolioDay(value?: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00-04:00`);
    return Number.isNaN(date.getTime()) || dayFormatter.format(date) !== value ? null : value;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dayFormatter.format(date);
}

export function portfolioDateInputToISO(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || portfolioDay(value) !== value) return null;
  return new Date(`${value}T00:00:00-04:00`).toISOString();
}

export function portfolioDateInRange(value?: string | null, start = "", end = ""): boolean {
  const day = portfolioDay(value);
  return Boolean(day && (!start || day >= start) && (!end || day <= end));
}

export function portfolioMovementTotals(rows: readonly PortfolioMovement[], start = "", end = "") {
  let vendido = 0;
  let cancelado = 0;
  for (const row of rows) {
    const value = Number(row.valor_venda || 0);
    if (!Number.isFinite(value)) continue;
    if (portfolioDateInRange(row.encarteirada_em, start, end)) vendido += value;
    if (portfolioDateInRange(row.cancelada_em, start, end)) cancelado += value;
  }
  return { vendido, cancelado, liquido: vendido - cancelado };
}

export function portfolioMonthlySeries(rows: readonly PortfolioMovement[], months: readonly string[], start = "", end = "") {
  const totals = new Map(months.map((month) => [month, { vendido: 0, cancelado: 0 }]));
  for (const row of rows) {
    const value = Number(row.valor_venda || 0);
    if (!Number.isFinite(value)) continue;
    for (const [field, totalField] of [["encarteirada_em", "vendido"], ["cancelada_em", "cancelado"]] as const) {
      const day = portfolioDay(row[field]);
      if (!day || (start && day < start) || (end && day > end)) continue;
      const month = totals.get(day.slice(0, 7));
      if (month) month[totalField] += value;
    }
  }
  return months.map((mes) => {
    const { vendido, cancelado } = totals.get(mes)!;
    return { mes, vendido, cancelado, liquido: vendido - cancelado };
  });
}
