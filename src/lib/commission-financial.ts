/**
 * Fonte única das projeções de comissões exibidas em Início e Comissões.
 *
 * Contratos históricos (commissions + commission_flow) usam os pagamentos
 * originais: os batches legacy são espelhos e NÃO devem ser somados.
 * Contratos novos usam apenas commission_batches legacy=false e suas partilhas.
 *
 * "Programada" é uma parte da comissão ainda pendente, nunca uma soma adicional.
 * A programação depende de uma data lançada no fluxo; nenhuma data é inventada.
 */
import { supabase } from "@/lib/supabaseClient";

type AnyRow = Record<string, any>;
export type CommissionFinanceEvent = { date: string; amount: number };
export type CommissionFinanceLine = {
  key: string;
  vendaId: string;
  vendedorId: string;
  unidadeId: string | null;
  recipientId: string | null;
  recipientType: "vendedor" | "empresa" | "unidade" | string;
  recipientUnitId: string | null;
  saleDate: string;
  administradora: string;
  segmento: string;
  tabela: string;
  cancelled: boolean;
  reversed: boolean;
  hasRefund: boolean;
  gross: number;
  paid: number;
  pending: number;
  programmed: number;
  paidEvents: CommissionFinanceEvent[];
  scheduledEvents: CommissionFinanceEvent[];
};
export type CommissionFinanceFilters = {
  viewerId: string;
  viewerAuthId?: string | null;
  matrix: boolean;
  branch: boolean;
  viewerUnitId?: string | null;
  saleVendorIds?: string[] | null;
  unitId?: string | null;
  start?: string | null;
  end?: string | null;
  administradora?: string | null;
  segmento?: string | null;
  tabela?: string | null;
  status?: "all" | "a_pagar" | "pago" | "estorno";
};
export type CommissionFinanceSummary = {
  gross: number;
  paid: number;
  pending: number;
  programmed: number;
  lost: number;
  countPending: number;
  nextScheduledDate: string | null;
  nextScheduledAmount: number;
  scheduledByDate: Map<string, number>;
  paidEvents: CommissionFinanceEvent[];
  scheduledEvents: CommissionFinanceEvent[];
};

const n = (value: unknown) => Math.max(0, Number(value) || 0);
const cent = (value: number) => Math.round(value * 100) / 100;
const dateOf = (value: unknown): string => String(value || "").slice(0, 10);
const norm = (value: unknown): string => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const empty = "00000000-0000-0000-0000-000000000000";
function saleCancelled(sale?: AnyRow): boolean {
  if (!sale) return false;
  if (String(sale.codigo || "") === "00") return false;
  return Boolean((sale.codigo && String(sale.codigo) !== "00") || sale.cancelada_em);
}

async function tableRows(table: string, select = "*"): Promise<AnyRow[]> {
  // Paginação explícita: PostgREST pode limitar cada resposta a 1.000 linhas.
  // O resultado precisa ser completo para os dois painéis permanecerem iguais.
  const pageSize = 1000;
  const accumulated: AnyRow[] = [];
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const { data, error } = await supabase.from(table as any).select(select)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("Fonte financeira indisponível (" + table + "): " + error.message);
    const page = (data || []) as AnyRow[];
    accumulated.push(...page);
    if (page.length < pageSize) return accumulated;
  }
  throw new Error("Limite de paginação financeira atingido para " + table);
}

function lineFromFlows(args: {
  key: string; vendaId: string; vendedorId: string; unidadeId: string | null;
  recipientId: string | null; recipientType: string; recipientUnitId: string | null;
  sale?: AnyRow; batch?: AnyRow; commission?: AnyRow; entry?: AnyRow; flows: AnyRow[];
  legacy: boolean; hasRefund?: boolean;
}): CommissionFinanceLine {
  const { key, vendaId, vendedorId, unidadeId, recipientId, recipientType, recipientUnitId, sale, batch, commission, entry, flows, legacy } = args;
  const gross = n(legacy ? commission?.valor_total ?? (Number(commission?.base_calculo || 0) * Number(commission?.percent_aplicado || 0)) : entry?.gross_amount);
  const actualPaid = cent(flows.reduce((sum, f) => sum + n(legacy ? f.valor_pago_vendedor : f.valor_pago), 0));
  const paid = Math.min(gross, actualPaid);
  const cancelled = saleCancelled(sale);
  const reversed = legacy ? commission?.status === "estorno" : ["estornado", "cancelado"].includes(norm(entry?.status)) || ["estornado", "cancelado"].includes(norm(batch?.status));
  const pending = cancelled || reversed ? 0 : cent(Math.max(0, gross - paid));
  const paidEvents: CommissionFinanceEvent[] = [];
  let availablePaidForEvents = paid;
  const scheduledCandidate: CommissionFinanceEvent[] = [];
  for (const f of flows) {
    const flowPaid = n(legacy ? f.valor_pago_vendedor : f.valor_pago);
    const scheduledDate = dateOf(legacy ? f.data_pagamento_vendedor : f.data_pagamento);
    if (!scheduledDate) continue;
    if (flowPaid > 0 && availablePaidForEvents > 0) {
      const amount = cent(Math.min(flowPaid, availablePaidForEvents));
      paidEvents.push({ date: scheduledDate, amount });
      availablePaidForEvents = cent(Math.max(0, availablePaidForEvents - amount));
    }
    if (cancelled || reversed) continue;
    // Em fluxos antigos, o valor_previsto pode conter o crédito da venda
    // em vez da comissão (ex.: 400.000,00 para comissão de 4.000,00).
    const expected = legacy
      ? cent(gross * n(f.percentual))
      : n(f.valor_previsto);
    const rest = cent(Math.max(0, expected - flowPaid));
    if (rest > 0) scheduledCandidate.push({ date: scheduledDate, amount: rest });
  }
  let availableToProgram = pending;
  const scheduledEvents = scheduledCandidate.sort((a, b) => a.date.localeCompare(b.date)).flatMap((f) => {
    const amount = cent(Math.min(availableToProgram, f.amount));
    availableToProgram = cent(Math.max(0, availableToProgram - amount));
    return amount > 0 ? [{ date: f.date, amount }] : [];
  });
  return {
    key, vendaId, vendedorId, unidadeId, recipientId, recipientType, recipientUnitId,
    saleDate: dateOf(sale?.data_venda || batch?.data_venda || commission?.data_venda),
    administradora: String(sale?.administradora || commission?.administradora || ""),
    segmento: String(sale?.segmento || commission?.segmento || ""),
    tabela: String(sale?.tabela || commission?.tabela || ""),
    cancelled, reversed, hasRefund: !!args.hasRefund, gross, paid, pending,
    programmed: cent(scheduledEvents.reduce((sum, event) => sum + event.amount, 0)),
    paidEvents, scheduledEvents
  };
}

export async function loadCommissionFinancialLedger(): Promise<CommissionFinanceLine[]> {
  const [sales, commissions, legacyFlows, batches, entries, partitionFlows, users, adjustments] = await Promise.all([
    tableRows("vendas", "id,vendedor_id,data_venda,administradora,segmento,tabela,codigo,cancelada_em"),
    tableRows("commissions"),
    tableRows("commission_flow"),
    tableRows("commission_batches"),
    tableRows("commission_entries"),
    tableRows("commission_entry_flow"),
    tableRows("users", "id,auth_user_id,unit_id"),
    tableRows("commission_adjustments", "id,entry_id,is_reversed"),
  ]);
  const salesById = new Map(sales.map(s => [String(s.id), s]));
  const usersById = new Map(users.flatMap(u => [u.id, u.auth_user_id].filter(Boolean).map(id => [String(id), u])));
  const legacyFlowById = new Map<string, AnyRow[]>();
  for (const f of legacyFlows) {
    const key = String(f.commission_id);
    legacyFlowById.set(key, [...(legacyFlowById.get(key) || []), f]);
  }
  const newBatches = batches.filter(b => b.legacy === false);
  const modernSales = new Set(newBatches.map(b => String(b.venda_id)));
  const newBatchById = new Map(newBatches.map(b => [String(b.id), b]));
  const activeRefundEntries = new Set(adjustments.filter(a => a.is_reversed !== true).map(a => String(a.entry_id)));
  const modernFlowByEntry = new Map<string, AnyRow[]>();
  for (const f of partitionFlows) {
    const key = String(f.entry_id);
    modernFlowByEntry.set(key, [...(modernFlowByEntry.get(key) || []), f]);
  }

  const result: CommissionFinanceLine[] = [];
  for (const c of commissions) {
    if (modernSales.has(String(c.venda_id))) continue;
    const sale = salesById.get(String(c.venda_id));
    const rawVendor = String(sale?.vendedor_id || c.vendedor_id || empty);
    const profile = usersById.get(rawVendor);
    result.push(lineFromFlows({
      key: "legacy:" + c.id, vendaId: String(c.venda_id),
      vendedorId: String(profile?.id || rawVendor),
      unidadeId: profile?.unit_id || null,
      recipientId: String(profile?.id || rawVendor), recipientType: "vendedor",
      recipientUnitId: null, sale, commission: c,
      flows: legacyFlowById.get(String(c.id)) || [], legacy: true,
    }));
  }
  for (const entry of entries) {
    const batch = newBatchById.get(String(entry.batch_id));
    if (!batch) continue; // espelhos históricos não são uma segunda comissão
    const sale = salesById.get(String(batch.venda_id));
    const rawVendor = String(batch.vendedor_id || sale?.vendedor_id || empty);
    const seller = usersById.get(rawVendor);
    const recipient = usersById.get(String(entry.recipient_user_id || ""));
    result.push(lineFromFlows({
      key: "new:" + entry.id, vendaId: String(batch.venda_id),
      vendedorId: String(seller?.id || rawVendor),
      unidadeId: batch.business_unit_id || seller?.unit_id || null,
      recipientId: recipient?.id || entry.recipient_user_id || null,
      recipientType: String(entry.recipient_type || ""),
      recipientUnitId: entry.recipient_unit_id || null,
      sale, batch, entry, hasRefund: activeRefundEntries.has(String(entry.id)),
      flows: modernFlowByEntry.get(String(entry.id)) || [], legacy: false,
    }));
  }
  return result;
}

export function selectCommissionFinance(
  lines: CommissionFinanceLine[], filters: CommissionFinanceFilters
): CommissionFinanceLine[] {
  const sellerIds = filters.saleVendorIds?.length ? new Set(filters.saleVendorIds) : null;
  const viewerIds = new Set([filters.viewerId, filters.viewerAuthId].filter(Boolean));
  const normalizedFilters = { admin: norm(filters.administradora), segment: norm(filters.segmento), table: norm(filters.tabela) };
  return lines.filter(line => {
    const mine = !["empresa", "unidade"].includes(line.recipientType) && !!line.recipientId && viewerIds.has(line.recipientId);
    // A matriz recebe a parte EMPRESA, o gestor da filial a parte UNIDADE,
    // e cada consultor as próprias partes como vendedor (cumulativas).
    const company = filters.matrix && line.recipientType === "empresa";
    const unit = (filters.matrix || filters.branch) && line.recipientType === "unidade" &&
      !!filters.viewerUnitId && (line.recipientUnitId === filters.viewerUnitId || line.unidadeId === filters.viewerUnitId);
    if (!mine && !company && !unit) return false;
    if (sellerIds && !sellerIds.has(line.vendedorId)) return false;
    if (filters.unitId && filters.unitId !== "all" && line.unidadeId !== filters.unitId) return false;
    if (filters.start && line.saleDate < filters.start) return false;
    if (filters.end && line.saleDate > filters.end) return false;
    if (normalizedFilters.admin && normalizedFilters.admin !== "all" && norm(line.administradora) !== normalizedFilters.admin) return false;
    if (normalizedFilters.segment && normalizedFilters.segment !== "all" && norm(line.segmento) !== normalizedFilters.segment) return false;
    if (normalizedFilters.table && normalizedFilters.table !== "all" && norm(line.tabela) !== normalizedFilters.table) return false;
    if (filters.status === "pago" && (line.pending > 0 || line.gross <= 0 || line.cancelled || line.reversed)) return false;
    if (filters.status === "a_pagar" && line.pending <= 0) return false;
    if (filters.status === "estorno" && !line.reversed && !line.cancelled && !line.hasRefund) return false;
    return true;
  });
}

export function summarizeCommissionFinance(lines: CommissionFinanceLine[], today: string): CommissionFinanceSummary {
  const scheduledByDate = new Map<string, number>();
  const paidEvents: CommissionFinanceEvent[] = [];
  const scheduledEvents: CommissionFinanceEvent[] = [];
  let gross = 0, paid = 0, pending = 0, lost = 0, countPending = 0;
  for (const line of lines) {
    if (line.cancelled || line.reversed) lost += Math.max(0, line.gross - line.paid);
    else {
      gross += line.gross;
      paid += line.paid;
      pending += line.pending;
      if (line.pending > 0.009) countPending++;
    }
    if (!line.cancelled && !line.reversed) {
      paidEvents.push(...line.paidEvents);
      for (const event of line.scheduledEvents) {
        scheduledEvents.push(event);
        scheduledByDate.set(event.date, cent((scheduledByDate.get(event.date) || 0) + event.amount));
      }
    }
  }
  const nextScheduledDate = Array.from(scheduledByDate.keys()).filter(d => d >= today).sort()[0] || null;
  return {
    gross: cent(gross), paid: cent(paid), pending: cent(pending),
    programmed: cent(scheduledEvents.reduce((acc, e) => acc + e.amount, 0)),
    lost: cent(lost), countPending,
    nextScheduledDate,
    nextScheduledAmount: nextScheduledDate ? scheduledByDate.get(nextScheduledDate) || 0 : 0,
    scheduledByDate, paidEvents, scheduledEvents,
  };
}

export type FinanceChart = { labels: string[]; previstoBruto: number[]; pagoBruto: number[] };
export function monthlyCommissionFinanceChart(summary: CommissionFinanceSummary, year: number): FinanceChart {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const previstoBruto = Array(12).fill(0);
  const pagoBruto = Array(12).fill(0);
  const consume = (events: CommissionFinanceEvent[], output: number[]) => events.forEach(ev => {
    const d = ev.date;
    if (Number(d.slice(0, 4)) === year) output[Number(d.slice(5, 7)) - 1] += ev.amount;
  });
  consume(summary.scheduledEvents, previstoBruto);
  consume(summary.paidEvents, pagoBruto);
  return { labels, previstoBruto, pagoBruto };
}
export function weeklyCommissionFinanceChart(summary: CommissionFinanceSummary, year: number, month: number): FinanceChart {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const intervals: {start: number; end: number; label: string}[] = [];
  // Não eliminar os primeiros dias do mês quando o dia 1 não é sexta.
  let day = 1;
  while (day <= last.getDate()) {
    const current = new Date(year, month, day);
    const untilThursday = (4 - current.getDay() + 7) % 7;
    const endDay = Math.min(last.getDate(), day + untilThursday);
    const from = String(day).padStart(2,"0");
    const to = String(endDay).padStart(2,"0");
    const mo = String(month + 1).padStart(2,"0");
    intervals.push({ start: day, end: endDay, label: "S" + (intervals.length + 1) + " (" + from + "/" + mo + "–" + to + "/" + mo + ")" });
    day = endDay + 1;
  }
  const previstoBruto = intervals.map(() => 0), pagoBruto = intervals.map(() => 0);
  const consume = (events: CommissionFinanceEvent[], target: number[]) => events.forEach(ev => {
    if (Number(ev.date.slice(0,4)) !== year || Number(ev.date.slice(5,7)) !== month + 1) return;
    const day = Number(ev.date.slice(8,10));
    const index = intervals.findIndex(iv => iv.start <= day && iv.end >= day);
    if (index >= 0) target[index] += ev.amount;
  });
  consume(summary.scheduledEvents, previstoBruto);
  consume(summary.paidEvents, pagoBruto);
  return { labels: intervals.map(iv=>iv.label), previstoBruto, pagoBruto };
}
