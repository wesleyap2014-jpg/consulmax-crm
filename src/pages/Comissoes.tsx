// src/pages/Comissoes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Filter as FilterIcon,
  Settings,
  Save,
  DollarSign,
  FileText,
  PlusCircle,
  RotateCcw,
  Pencil,
  Trash2,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ========================= Tipos ========================= */
type UUID = string;
type User = {
  id: UUID;
  auth_user_id?: UUID | null;
  nome: string | null;
  email: string | null;
  phone?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  pix_key?: string | null;
  pix_type?: string | null;
};
type UserSecure = {
  id: UUID;
  nome: string | null;
  email: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  pix_key: string | null;
  cpf: string | null;
  cpf_mascarado: string | null;
};
type SimTable = { id: UUID; segmento: string; nome_tabela: string };
type Venda = {
  id: UUID;
  data_venda: string;
  vendedor_id: UUID;
  segmento: string | null;
  tabela: string | null;
  administradora: string | null;
  valor_venda: number | null;
  numero_proposta?: string | null;
  cliente_lead_id?: string | null;
  lead_id?: string | null;
};
type Commission = {
  id: UUID;
  venda_id: UUID;
  vendedor_id: UUID;
  sim_table_id: UUID | null;
  data_venda: string | null;
  segmento: string | null;
  tabela: string | null;
  administradora: string | null;
  valor_venda: number | null;
  base_calculo: number | null;
  percent_aplicado: number | null;
  valor_total: number | null;
  status: "a_pagar" | "pago" | "estorno";
  data_pagamento: string | null;
  recibo_url: string | null;
  comprovante_url: string | null;
  cliente_nome?: string | null;
  numero_proposta?: string | null;
};
type CommissionFlow = {
  id: UUID;
  commission_id: UUID;
  mes: number;
  percentual: number;
  valor_previsto: number | null;
  valor_recebido_admin: number | null;
  data_recebimento_admin: string | null;
  valor_pago_vendedor: number | null;
  data_pagamento_vendedor: string | null;
  recibo_vendedor_url: string | null;
  comprovante_pagto_url: string | null;
};
type CommissionRule = {
  vendedor_id: string;
  sim_table_id: string;
  percent_padrao: number;        // armazenado como fração (ex.: 0.012 = 1,20%)
  fluxo_meses: number;
  fluxo_percentuais: number[];   // frações que somam 1.00
  obs: string | null;
};

/* ========================= Helpers ========================= */
const BRL = (v?: number | null) =>
  (typeof v === "number" ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct100 = (v?: number | null) =>
  `${(((typeof v === "number" ? v : 0) * 100) as number).toFixed(2).replace(".", ",")}%`;

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);

const sum = (arr: (number | null | undefined)[]) => arr.reduce((a, b) => a + (b || 0), 0);

const clamp0 = (n: number) => (n < 0 ? 0 : n);

const formatISODateBR = (iso?: string | null) =>
  (!iso ? "—" : iso.split("-").reverse().join("/"));

const normalize = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

function valorPorExtenso(n: number) {
  const u = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez","onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove"];
  const d = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const c = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const ext = (n0: number): string =>
    n0 < 20 ? u[n0] :
    n0 < 100 ? d[Math.floor(n0 / 10)] + (n0 % 10 ? " e " + u[n0 % 10] : "") :
    n0 === 100 ? "cem" :
    c[Math.floor(n0 / 100)] + (n0 % 100 ? " e " + ext(n0 % 100) : "");
  const i = Math.floor(n);
  const ct = Math.round((n - i) * 100);
  return `${ext(i)} ${i === 1 ? "real" : "reais"}${ct ? ` e ${ext(ct)} ${ct === 1 ? "centavo" : "centavos"}` : ""}`;
}

/* ====== Helpers de estágio do pagamento (2 etapas) ====== */
function hasRegisteredButUnpaid(flow?: CommissionFlow[]) {
  if (!flow) return false;
  return flow.some(
    (f) =>
      (Number(f.percentual) || 0) > 0 &&
      !!f.data_pagamento_vendedor &&
      (Number(f.valor_pago_vendedor) || 0) === 0
  );
}

function isFullyPaid(flow?: CommissionFlow[]) {
  if (!flow) return false;
  const relevant = flow.filter((f) => (Number(f.percentual) || 0) > 0);
  return relevant.length > 0 && relevant.every((f) => (Number(f.valor_pago_vendedor) || 0) > 0);
}

/* ============== Cálculo de datas-base (constantes & utils) ============== */
/* Mantidos exatamente como no arquivo bom */
const now = new Date();
const yStart = new Date(now.getFullYear(), 0, 1);
const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), 1);
const isBetween = (iso?: string | null, s?: Date, e?: Date) =>
  iso
    ? new Date(iso + "T00:00:00").getTime() >= (s?.getTime() || 0) &&
      new Date(iso + "T00:00:00").getTime() <= (e?.getTime() || now.getTime())
    : false;

/* Novos helpers de datas (para gráficos semanais por quintas-feiras) */
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/**
 * Retorna todas as quintas-feiras de um mês.
 * @param year Ano (ex.: 2025)
 * @param month Índice do mês (0 = jan, 11 = dez)
 */
function getThursdaysOfMonth(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = endOfMonth(firstDay);
  const thursdays: Date[] = [];

  // 0=Dom ... 4=Qui
  let d = new Date(year, month, 1);
  // avançar até a primeira quinta
  while (d.getDay() !== 4) d = new Date(year, month, d.getDate() + 1);

  // coletar todas as quintas do mês
  while (d <= lastDay) {
    thursdays.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    d = new Date(year, month, d.getDate() + 7);
  }

  return thursdays;
}

/**
 * Constrói intervalos semanais baseados nas quintas-feiras:
 * [qui_i .. dia anterior à próxima qui], e o último vai até o fim do mês.
 * Retorna pares { start, end } (Date).
 */
function getWeeklyIntervalsByThursdays(
  year: number,
  month: number
): Array<{ start: Date; end: Date }> {
  const thursdays = getThursdaysOfMonth(year, month);
  const eom = endOfMonth(new Date(year, month, 1));

  if (thursdays.length === 0) {
    // fallback: mês sem quinta (teoricamente não ocorre)
    return [{ start: new Date(year, month, 1), end: eom }];
  }

  const intervals: Array<{ start: Date; end: Date }> = [];

  for (let i = 0; i < thursdays.length; i++) {
    const start = thursdays[i];
    const end =
      i < thursdays.length - 1
        ? new Date(thursdays[i + 1].getFullYear(), thursdays[i + 1].getMonth(), thursdays[i + 1].getDate() - 1)
        : eom;

    intervals.push({
      start: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
      end: new Date(end.getFullYear(), end.getMonth(), end.getDate()),
    });
  }

  return intervals;
}

/* ============== Projeções automáticas (Etapa 1 — valores BRUTOS) ============== */
/**
 * Observações:
 * - "Previsto" usa o cronograma do fluxo: data_venda + (mes-1) meses.
 * - "Pago" usa a data efetiva: flow.data_pagamento_vendedor.
 * - Os valores são **brutos** (sem aplicar imposto); a UI pode derivar o líquido com `impostoFrac`.
 */

function addMonths(dateISO?: string | null, months?: number | null): Date | null {
  if (!dateISO) return null;
  const d = new Date(dateISO + "T00:00:00");
  if (!isFinite(d.getTime())) return null;
  const m = Math.max(0, (months || 0));
  return new Date(d.getFullYear(), d.getMonth() + m, d.getDate());
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function yearKey(d: Date) {
  return `${d.getFullYear()}`;
}
function isInRange(d: Date, start: Date, end: Date) {
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

type ProjSeries = {
  labels: string[];
  previstoBruto: number[];
  pagoBruto: number[];
};

function projectMonthlyFlows(rows: Array<Commission & { flow?: CommissionFlow[] }>): ProjSeries {
  const now = new Date();
  const year = now.getFullYear();
  const months: string[] = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const previsto: number[] = Array(12).fill(0);
  const pagos: number[] = Array(12).fill(0);

  for (const r of rows) {
    const total = r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0));
    const flows = (r.flow || []).filter(f => (Number(f.percentual) || 0) > 0);
    for (const f of flows) {
      const expectedDate = addMonths(r.data_venda, (f.mes || 1) - 1);
      const expectedVal = (f.valor_previsto ?? (total * (f.percentual || 0))) || 0;

      if (expectedDate && expectedDate.getFullYear() === year) {
        previsto[expectedDate.getMonth()] += expectedVal;
      }

      if (f.data_pagamento_vendedor) {
        const pd = new Date(f.data_pagamento_vendedor + "T00:00:00");
        if (pd.getFullYear() === year) {
          pagos[pd.getMonth()] += (f.valor_pago_vendedor ?? 0);
        }
      }
    }
  }

  return { labels: months, previstoBruto: previsto, pagoBruto: pagos };
}

function projectWeeklyFlows(rows: Array<Commission & { flow?: CommissionFlow[] }>): ProjSeries & {
  intervals: Array<{ start: Date; end: Date }>;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const intervals = getWeeklyIntervalsByThursdays(year, month);

  const labels: string[] = intervals.map(({ start, end }, i) => {
    const s = `${String(start.getDate()).padStart(2,"0")}/${String(start.getMonth()+1).padStart(2,"0")}`;
    const e = `${String(end.getDate()).padStart(2,"0")}/${String(end.getMonth()+1).padStart(2,"0")}`;
    return `S${i+1} (${s}–${e})`;
  });

  const previsto: number[] = Array(intervals.length).fill(0);
  const pagos: number[] = Array(intervals.length).fill(0);

  for (const r of rows) {
    const total = r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0));
    const flows = (r.flow || []).filter(f => (Number(f.percentual) || 0) > 0);

    for (const f of flows) {
      const expectedDate = addMonths(r.data_venda, (f.mes || 1) - 1);
      const expectedVal = (f.valor_previsto ?? (total * (f.percentual || 0))) || 0;

      if (expectedDate && expectedDate.getFullYear() === year && expectedDate.getMonth() === month) {
        const idx = intervals.findIndex(iv => isInRange(expectedDate, iv.start, iv.end));
        if (idx >= 0) previsto[idx] += expectedVal;
      }

      if (f.data_pagamento_vendedor) {
        const pd = new Date(f.data_pagamento_vendedor + "T00:00:00");
        if (pd.getFullYear() === year && pd.getMonth() === month) {
          const idx2 = intervals.findIndex(iv => isInRange(pd, iv.start, iv.end));
          if (idx2 >= 0) pagos[idx2] += (f.valor_pago_vendedor ?? 0);
        }
      }
    }
  }

  return { labels, previstoBruto: previsto, pagoBruto: pagos, intervals };
}

function projectAnnualFlows(rows: Array<Commission & { flow?: CommissionFlow[] }>): ProjSeries {
  const now = new Date();
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 4 + i);
  const labels = years.map(y => String(y));
  const previsto: number[] = Array(years.length).fill(0);
  const pagos: number[] = Array(years.length).fill(0);

  for (const r of rows) {
    const total = r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0));
    const flows = (r.flow || []).filter(f => (Number(f.percentual) || 0) > 0);

    for (const f of flows) {
      const expectedDate = addMonths(r.data_venda, (f.mes || 1) - 1);
      const expectedVal = (f.valor_previsto ?? (total * (f.percentual || 0))) || 0;

      if (expectedDate) {
        const yi = years.indexOf(expectedDate.getFullYear());
        if (yi >= 0) previsto[yi] += expectedVal;
      }

      if (f.data_pagamento_vendedor) {
        const pd = new Date(f.data_pagamento_vendedor + "T00:00:00");
        const yi2 = years.indexOf(pd.getFullYear());
        if (yi2 >= 0) pagos[yi2] += (f.valor_pago_vendedor ?? 0);
      }
    }
  }

  return { labels, previstoBruto: previsto, pagoBruto: pagos };
}

/* ============== KPI & Totais por período (novos) ============== */
/**
 * Considera apenas o que foi **pago** dentro do intervalo [s..e], no nível das parcelas do fluxo.
 * - totalBruta: soma BRUTA proporcional de cada parcela paga no período.
 * - totalLiquida: totalBruta * (1 - impostoFrac).
 * - pagoLiquido: soma do valor efetivamente pago no período (líquido do imposto).
 * - pendente: diferença entre totalLiquida e pagoLiquido (se houver divergência entre previsto x pago).
 * - pct: pagoLiquido / totalLiquida (0..100%).
 *
 * Depende de: `rows`, `impostoFrac`, helpers: `sum`, `clamp0`, `addMonths`.
 */
function totalsInRangePaidOnly(s: Date, e: Date) {
  const flowsPaidInRange: Array<{
    brutoDaParcela: number;
    pagoBruto: number;
  }> = [];

  for (const r of rows) {
    const totalComissao = (r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0))) || 0;
    const flows = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);

    for (const f of flows) {
      const dataPgISO = f.data_pagamento_vendedor || null;
      if (!dataPgISO) continue;

      const dataPg = new Date(dataPgISO + "T00:00:00");
      if (dataPg.getTime() < s.getTime() || dataPg.getTime() > e.getTime()) continue;

      const brutoParcelaPrev = (f.valor_previsto ?? (totalComissao * (f.percentual || 0))) || 0;
      const pagoBruto = f.valor_pago_vendedor ?? 0;

      flowsPaidInRange.push({
        brutoDaParcela: brutoParcelaPrev,
        pagoBruto,
      });
    }
  }

  const totalBruta = sum(flowsPaidInRange.map((x) => x.brutoDaParcela));
  const totalLiquida = totalBruta * (1 - impostoFrac);
  const pagoLiquido = sum(flowsPaidInRange.map((x) => x.pagoBruto)) * (1 - impostoFrac);
  const pendente = clamp0(totalLiquida - pagoLiquido);
  const pct = totalLiquida > 0 ? (pagoLiquido / totalLiquida) * 100 : 0;

  return { totalBruta, totalLiquida, pagoLiquido, pendente, pct };
}

/**
 * Combina **projeção** (previsto) e **pago** dentro do intervalo [s..e].
 * - Previsto: usa a data esperada da parcela = data_venda + (mes-1) meses.
 * - Pago: usa a data efetiva de pagamento da parcela.
 * - totalBruta: soma dos valores BRUTOS previstos no período (independe do pago).
 * - totalLiquida: totalBruta * (1 - impostoFrac).
 * - pagoLiquido: valores efetivamente pagos **no período** (líquidos).
 * - pendente: totalLiquida - pagoLiquido (>= 0).
 * - pct: pagoLiquido / totalLiquida (0..100%).
 *
 * Depende de: `rows`, `impostoFrac`, helpers: `sum`, `clamp0`, `addMonths`.
 */
function totalsInRangePaidAndProjected(s: Date, e: Date) {
  let totalPrevistoBruto = 0;
  let totalPagoBruto = 0;

  for (const r of rows) {
    const totalComissao = (r.valor_total ?? ((r.base_calculo ?? 0) * (r.percent_aplicado ?? 0))) || 0;
    const flows = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);

    for (const f of flows) {
      const expectedDate = addMonths(r.data_venda, (f.mes || 1) - 1);
      const previstoBruto = (f.valor_previsto ?? (totalComissao * (f.percentual || 0))) || 0;

      // Previsto dentro do período
      if (expectedDate && expectedDate.getTime() >= s.getTime() && expectedDate.getTime() <= e.getTime()) {
        totalPrevistoBruto += previstoBruto;
      }

      // Pago dentro do período
      if (f.data_pagamento_vendedor) {
        const pd = new Date(f.data_pagamento_vendedor + "T00:00:00");
        if (pd.getTime() >= s.getTime() && pd.getTime() <= e.getTime()) {
          totalPagoBruto += (f.valor_pago_vendedor ?? 0);
        }
      }
    }
  }

  const totalLiquida = totalPrevistoBruto * (1 - impostoFrac);
  const pagoLiquido = totalPagoBruto * (1 - impostoFrac);
  const pendente = clamp0(totalLiquida - pagoLiquido);
  const pct = totalLiquida > 0 ? (pagoLiquido / totalLiquida) * 100 : 0;

  return {
    totalBruta: totalPrevistoBruto,
    totalLiquida,
    pagoLiquido,
    pendente,
    pct,
  };
}

/* ========================= Página ========================= */
export default function ComissoesPage() {
/* Filtros (sem período) */
const [vendedorId, setVendedorId] = useState<string>("all");
const [status, setStatus] = useState<"all" | "a_pagar" | "pago" | "estorno">("all");
const [segmento, setSegmento] = useState<string>("all");
const [tabela, setTabela] = useState<string>("all");

/* Bases */
const [users, setUsers] = useState<User[]>([]);
const [usersSecure, setUsersSecure] = useState<UserSecure[]>([]);
const [simTables, setSimTables] = useState<SimTable[]>([]);
const [clientesMap, setClientesMap] = useState<Record<string, string>>({});

/* Memos */
const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
const usersByAuth = useMemo(() => {
  const m: Record<string, User> = {};
  users.forEach((u) => { if (u.auth_user_id) m[u.auth_user_id] = u; });
  return m;
}, [users]);
const simTablesById = useMemo(() => Object.fromEntries(simTables.map((t) => [t.id, t])), [simTables]);

/* Dados */
const [loading, setLoading] = useState(false);
const [rows, setRows] = useState<(Commission & { flow?: CommissionFlow[] })[]>([]);
const [vendasSemCom, setVendasSemCom] = useState<Venda[]>([]);
const [genBusy, setGenBusy] = useState<string | null>(null);

/* ================== Estados auxiliares ================== */

/* Regras */
const [openRules, setOpenRules] = useState(false);
const [ruleVendedorId, setRuleVendedorId] = useState<string | null>(null);
const [ruleSimTableId, setRuleSimTableId] = useState<string | null>(null);
const [rulePercent, setRulePercent] = useState<number>(0);
const [ruleMeses, setRuleMeses] = useState<number>(0);
const [rulePercentuais, setRulePercentuais] = useState<number[]>([]);
const [ruleObs, setRuleObs] = useState<string | null>(null);
const [ruleRows, setRuleRows] = useState<CommissionRule[]>([]);

/* Pagamento */
const [openPay, setOpenPay] = useState(false);
const [payCommissionId, setPayCommissionId] = useState<string | null>(null);
const [payFlow, setPayFlow] = useState<CommissionFlow | null>(null);
const [paySelected, setPaySelected] = useState<string[]>([]);
const [payDate, setPayDate] = useState<string>(toDateInput(new Date()));
const [payValue, setPayValue] = useState<number>(0);
const [payDefaultTab, setPayDefaultTab] = useState<"pendentes" | "pagas">("pendentes");

/* Recibo */
const [reciboDate, setReciboDate] = useState<string>(toDateInput(new Date()));
const [reciboImpostoPct, setReciboImpostoPct] = useState<number>(5);
const [reciboVendor, setReciboVendor] = useState<User | null>(null);

/* Expand/Collapse */
const [showPaid, setShowPaid] = useState(true);
const [showUnpaid, setShowUnpaid] = useState(true);
const [showVendasSem, setShowVendasSem] = useState(false);

/* Busca/paginação - Comissões Pagas */
const [paidSearch, setPaidSearch] = useState<string>("");
const [paidPage, setPaidPage] = useState<number>(1);
const pageSize = 10;

/* ================== Efeitos de carregamento de bases ================== */
useEffect(() => {
  async function loadBases() {
    setLoading(true);
    try {
      const { data: usersData, error: errUsers } = await supabase
        .from("users")
        .select("*")
        .order("nome", { ascending: true });
      if (errUsers) throw errUsers;
      setUsers(usersData || []);

      const { data: simData, error: errSim } = await supabase
        .from("sim_tables")
        .select("*")
        .order("nome_tabela", { ascending: true });
      if (errSim) throw errSim;
      setSimTables(simData || []);

      const { data: secureData, error: errSecure } = await supabase
        .from("users_secure")
        .select("*");
      if (errSecure) throw errSecure;
      setUsersSecure(secureData || []);

      // Montar clientesMap (lead_id -> nome)
      const { data: leads, error: errLeads } = await supabase
        .from("leads")
        .select("id, nome");
      if (errLeads) throw errLeads;
      const m: Record<string, string> = {};
      (leads || []).forEach((l: any) => {
        m[l.id] = l.nome;
      });
      setClientesMap(m);
    } catch (e) {
      console.error("Erro ao carregar bases:", e);
    } finally {
      setLoading(false);
    }
  }
  loadBases();
}, []);

/* Fetch principal */
async function fetchData() {
  setLoading(true);
  try {
    // commissions (sem período)
    let qb = supabase.from("commissions").select("*");
    if (status !== "all") qb = qb.eq("status", status);
    if (vendedorId !== "all") qb = qb.eq("vendedor_id", vendedorId);
    if (segmento !== "all") qb = qb.eq("segmento", segmento);
    if (tabela !== "all") qb = qb.eq("tabela", tabela);
    const { data: comms } = await qb.order("data_venda", { ascending: false });

    const ids = (comms || []).map((c) => c.id);
    const { data: flows } = await supabase
      .from("commission_flow")
      .select("*")
      .in("commission_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .order("mes", { ascending: true });

    const flowBy: Record<string, CommissionFlow[]> = {};
    (flows || []).forEach((f) => {
      if (!flowBy[f.commission_id]) flowBy[f.commission_id] = [];
      if (!flowBy[f.commission_id].some((x) => x.mes === f.mes)) flowBy[f.commission_id].push(f as CommissionFlow);
    });

    // clientes extras
    let vendasExtras: Record<string, { clienteId?: string; numero_proposta?: string | null; cliente_nome?: string | null }> = {};
    if (comms && comms.length) {
      const { data: vendas } = await supabase
        .from("vendas")
        .select("id, numero_proposta, cliente_lead_id, lead_id")
        .in("id", comms.map((c: any) => c.venda_id));
      const cliIds = Array.from(new Set((vendas || []).map((v) => v.lead_id || v.cliente_lead_id).filter(Boolean) as string[]));
      let nomes: Record<string, string> = {};
      if (cliIds.length) {
        const { data: cli } = await supabase.from("leads").select("id, nome").in("id", cliIds);
        (cli || []).forEach((c: any) => { nomes[c.id] = c.nome || ""; });
      }
      (vendas || []).forEach((v) => {
        const cid = v.lead_id || v.cliente_lead_id || undefined;
        vendasExtras[v.id] = { clienteId: cid, numero_proposta: v.numero_proposta || null, cliente_nome: cid ? (nomes[cid] || null) : null };
      });
    }

    setRows(
      (comms || []).map((c: any) => ({
        ...(c as Commission),
        flow: flowBy[c.id] || [],
        cliente_nome: vendasExtras[c.venda_id]?.cliente_nome || null,
        numero_proposta: vendasExtras[c.venda_id]?.numero_proposta || null,
      })),
    );

    // vendas sem comissão
    const { data: vendasPeriodo } = await supabase
      .from("vendas")
      .select("id, data_venda, vendedor_id, segmento, tabela, administradora, valor_venda, numero_proposta, cliente_lead_id, lead_id")
      .order("data_venda", { ascending: false });
    const { data: commVendaIds } = await supabase.from("commissions").select("venda_id");
    const hasComm = new Set((commVendaIds || []).map((r: any) => r.venda_id));
    const vendasFiltered = (vendasPeriodo || []).filter((v) => !hasComm.has(v.id));
    const vendasFiltered2 = vendasFiltered.filter((v) => {
      const vendCanon = canonUserId(v.vendedor_id) || v.vendedor_id;
      return (
        (vendedorId === "all" || vendCanon === vendedorId) &&
        (segmento === "all" || v.segmento === segmento) &&
        (tabela === "all" || (v.tabela || "") === tabela)
      );
    });
    setVendasSemCom(vendasFiltered2 as Venda[]);

    const clientIds = Array.from(
      new Set((vendasFiltered2 || []).map((v) => v.lead_id || v.cliente_lead_id).filter((x): x is string => !!x)),
    );
    if (clientIds.length) {
      const { data: cli } = await supabase.from("leads").select("id, nome").in("id", clientIds);
      const map: Record<string, string> = {};
      (cli || []).forEach((c: any) => (map[c.id] = c.nome || ""));
      setClientesMap(map);
    } else setClientesMap({});

    // reconcile status por parcelas
    try {
      setRows(prev => {
        const withFix = prev.map(r => {
          const relevant = (r.flow || []).filter(f => (Number(f.percentual) || 0) > 0);
          const allPaid = relevant.length > 0 && relevant.every(f => (Number(f.valor_pago_vendedor) || 0) > 0);
          if (allPaid && r.status !== "pago") {
            const lastDate = r.data_pagamento || (relevant[relevant.length - 1]?.data_pagamento_vendedor ?? null);
            supabase.from("commissions")
              .update({ status: "pago", data_pagamento: lastDate })
              .eq("id", r.id)
              .then(({ error }) => { if (error) console.warn("[reconcile] commissions.update falhou:", error.message); });
            return { ...r, status: "pago", data_pagamento: lastDate };
          }
          return r;
        });
        return withFix;
      });
    } catch (e) {
      console.warn("[reconcile] erro:", e);
    }
  } finally {
    setLoading(false);
  }
}
useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [vendedorId, status, segmento, tabela]);

/* ============== Lógica de Regras de Comissão ============== */

/* Ajusta quantidade de meses do fluxo e mantém os campos */
function onChangeMeses(n: number) {
  setRuleMeses(n);
  const arr = [...ruleFluxoPct];
  if (n > arr.length) { while (arr.length < n) arr.push("0,00"); } else arr.length = n;
  setRuleFluxoPct(arr);
}

/* Soma digitada no fluxo (em “pontos percentuais”, ex.: 2,25 soma) */
const fluxoSoma = useMemo(
  () => ruleFluxoPct.reduce((a, b) => a + (parseFloat((b || "0").replace(",", ".")) || 0), 0),
  [ruleFluxoPct]
);

/* Carrega regras do vendedor selecionado (com enriquecimento de segmento/tabela/admin) */
async function fetchRulesForVendor(vId: string) {
  if (!vId) { setRuleRows([]); return; }
  const { data: rules } = await supabase
    .from("commission_rules")
    .select("vendedor_id, sim_table_id, percent_padrao, fluxo_meses, fluxo_percentuais, obs")
    .eq("vendedor_id", vId);
  if (!rules || !rules.length) { setRuleRows([]); return; }

  const stIds = Array.from(new Set(rules.map((r) => r.sim_table_id)));
  const { data: st } = await supabase.from("sim_tables").select("id, segmento, nome_tabela").in("id", stIds);
  const bySt: Record<string, SimTable> = {}; (st || []).forEach((s) => { bySt[s.id] = s as SimTable; });

  // buscar administradora provável baseada nas vendas para nome_tabela/segmento
  const tableNames = Array.from(new Set((st || []).map(s => s.nome_tabela))).filter(Boolean);
  let adminMap: Record<string, string> = {};
  if (tableNames.length) {
    const { data: vendas } = await supabase
      .from("vendas")
      .select("segmento, tabela, administradora")
      .in("tabela", tableNames);
    (vendas || []).forEach(v => {
      const key = `${v.segmento || "-"}|${v.tabela || "-"}`;
      if (!adminMap[key] && v.administradora) adminMap[key] = v.administradora;
    });
  }

  setRuleRows(rules.map((r) => {
    const stInfo = bySt[r.sim_table_id];
    const key = `${stInfo?.segmento || "-"}|${stInfo?.nome_tabela || "-"}`;
    return {
      ...(r as CommissionRule),
      segmento: stInfo?.segmento || "-",
      nome_tabela: stInfo?.nome_tabela || "-",
      administradora: adminMap[key] || "—",
    };
  }));
}

/* Atualiza a lista quando abrir o diálogo e trocar de vendedor */
useEffect(() => { if (openRules) fetchRulesForVendor(ruleVendorId); }, [openRules, ruleVendorId]);

/* Salvar/Upsert de regra com validação da soma do fluxo */
async function saveRule() {
  if (!ruleVendorId || !ruleSimTableId) return alert("Selecione vendedor e tabela.");

  // % padrão digitado (ex.: "2,25")
  const pctPadraoPercent = parseFloat((rulePercent || "0").replace(",", "."));
  if (!isFinite(pctPadraoPercent) || pctPadraoPercent <= 0) return alert("Informe o % Padrão corretamente.");

  // soma do fluxo digitada
  const somaFluxo = fluxoSoma; // já está em 'pontos percentuais' (ex.: 2.25) se usuário digitou assim
  const soma100 = Math.abs(somaFluxo - 1.0) < 1e-6;
  const somaIgualPadrao = Math.abs(somaFluxo - pctPadraoPercent) < 1e-6;

  if (!(soma100 || somaIgualPadrao)) {
    return alert(`Soma do fluxo (M1..Mn) deve ser 1,00 (100%) ou igual ao % padrão. Soma atual = ${somaFluxo.toFixed(2).replace(".", ",")}`);
  }

  // normalizar fluxo em frações que somam 1.00
  let fluxo_percentuais_frac: number[] = [];
  if (soma100) {
    fluxo_percentuais_frac = ruleFluxoPct.map((x) => parseFloat((x || "0").replace(",", ".")) || 0);
  } else {
    fluxo_percentuais_frac = ruleFluxoPct.map((x) => {
      const v = parseFloat((x || "0").replace(",", ".")) || 0;
      return pctPadraoPercent > 0 ? v / pctPadraoPercent : 0;
    });
  }

  // converter % padrão para fração
  const percent_padrao_frac = pctPadraoPercent / 100;

  const { error } = await supabase
    .from("commission_rules")
    .upsert(
      {
        vendedor_id: ruleVendorId,
        sim_table_id: ruleSimTableId,
        percent_padrao: percent_padrao_frac,
        fluxo_meses: ruleMeses,
        fluxo_percentuais: fluxo_percentuais_frac,
        obs: ruleObs || null,
      },
      { onConflict: "vendedor_id,sim_table_id" },
    );
  if (error) return alert(error.message);
  await fetchRulesForVendor(ruleVendorId);
  alert("Regra salva.");
}

/* Remover regra */
async function deleteRule(vId: string, stId: string) {
  if (!confirm("Excluir esta regra?")) return;
  const { error } = await supabase.from("commission_rules").delete().eq("vendedor_id", vId).eq("sim_table_id", stId);
  if (error) return alert(error.message);
  await fetchRulesForVendor(vId);
}

/* Carregar uma regra existente no formulário para edição */
function loadRuleToForm(r: CommissionRule & { segmento: string; nome_tabela: string }) {
  setRuleVendorId(r.vendedor_id);
  setRuleSimTableId(r.sim_table_id);
  setRulePercent(((r.percent_padrao || 0) * 100).toFixed(2).replace(".", ","));
  setRuleMeses(r.fluxo_meses);
  // trazer para a UI no formato “pontos percentuais” do padrão
  const padraoPctPercent = (r.percent_padrao || 0) * 100;
  const arr = r.fluxo_percentuais.map((p) => (p * padraoPctPercent).toFixed(2).replace(".", ","));
  setRuleFluxoPct(arr);
  setRuleObs(r.obs || "");
}

/* ============== Garantir fluxo (regra ou 1×100%) ============== */
async function ensureFlowForCommission(c: Commission): Promise<CommissionFlow[]> {
  const { data: existing } = await supabase
    .from("commission_flow")
    .select("*")
    .eq("commission_id", c.id)
    .order("mes", { ascending: true });

  if (existing && existing.length > 0) return existing as CommissionFlow[];

  let meses = 1;
  let percentuais: number[] = [1];

  if (c.vendedor_id && c.sim_table_id) {
    const { data: rule } = await supabase
      .from("commission_rules")
      .select("fluxo_meses, fluxo_percentuais")
      .eq("vendedor_id", c.vendedor_id)
      .eq("sim_table_id", c.sim_table_id)
      .limit(1);

    if (rule && rule[0]) {
      const soma = (rule[0].fluxo_percentuais || []).reduce((a: number, b: number) => a + (b || 0), 0);
      if (rule[0].fluxo_meses > 0 && Math.abs(soma - 1) < 1e-6) {
        meses = rule[0].fluxo_meses;
        percentuais = rule[0].fluxo_percentuais;
      }
    }
  }

  const valorTotal = c.valor_total ?? ((c.base_calculo ?? 0) * (c.percent_aplicado ?? 0));
  const inserts = percentuais.map((p, idx) => ({
    commission_id: c.id,
    mes: idx + 1,
    percentual: p,
    valor_previsto: Math.round((valorTotal * p) * 100) / 100,
    valor_recebido_admin: null,
    data_recebimento_admin: null,
    valor_pago_vendedor: 0,
    data_pagamento_vendedor: null,
    recibo_vendedor_url: null,
    comprovante_pagto_url: null,
  }));

  const { error } = await supabase.from("commission_flow").insert(inserts as any[]);
  if (error) console.warn("[ensureFlowForCommission] erro ao inserir fluxo:", error.message);

  const { data: created } = await supabase
    .from("commission_flow")
    .select("*")
    .eq("commission_id", c.id)
    .order("mes", { ascending: true });

  return (created || []) as CommissionFlow[];
}

/* ========================= Pagamento (overlay) ========================= */
async function openPaymentFor(c: Commission) {
  setPayCommissionId(c.id);

  // Garante fluxo
  let { data } = await supabase
    .from("commission_flow")
    .select("*")
    .eq("commission_id", c.id)
    .order("mes", { ascending: true });
  if (!data || data.length === 0) {
    const created = await ensureFlowForCommission(c);
    data = created as any;
  }

  // cálculo correto (EXIBIÇÃO)
  const arr = (data || []).map((f: any) => ({
    ...f,
    _valor_previsto_calc: (c.valor_total ?? 0) * (f.percentual ?? 0),
  }));

  const uniq = new Map<number, CommissionFlow & { _valor_previsto_calc?: number }>();
  arr.forEach((f: any) => uniq.set(f.mes, f));
  const finalArr = Array.from(uniq.values());

  setPayFlow(finalArr);

  // Pré-selecionar tudo que está pendente (percentual > 0 e sem pagamento)
  const pre = Object.fromEntries(
    finalArr
      .filter((f) => (Number(f.percentual) || 0) > 0 && (Number(f.valor_pago_vendedor) || 0) === 0)
      .map((f) => [f.id, true])
  );
  setPaySelected(pre);

  // define a aba inicial: se já há data lançada sem valor -> "Arquivos"
  const registered = hasRegisteredButUnpaid(finalArr);
  setPayDefaultTab(registered ? "arquivos" : "selecionar");

  setPayDate(toDateInput(new Date()));
  setPayValue("");
  setOpenPay(true);
}

async function uploadToBucket(file: File, commissionId: string) {
  const path = `${commissionId}/${Date.now()}-${file.name}`;
  const { data, error } = await supabase.storage.from("comissoes").upload(path, file, { upsert: false });
  if (error) { alert("Falha ao enviar arquivo: " + error.message); return null; }
  return data?.path || null;
}
async function getSignedUrl(path: string | null | undefined) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("comissoes").createSignedUrl(path, 60 * 10);
  if (error) { console.warn("Signed URL error:", error.message); return null; }
  return (data as any)?.signedUrl || null;
}

async function paySelectedParcels(payload: {
  data_pagamento_vendedor?: string;
  valor_pago_vendedor?: number;
  recibo_file?: File | null;
  comprovante_file?: File | null;
}) {
  // uploads
  let reciboPath: string | null = null, compPath: string | null = null;
  if (payload.recibo_file) reciboPath = await uploadToBucket(payload.recibo_file, payCommissionId);
  if (payload.comprovante_file) compPath = await uploadToBucket(payload.comprovante_file, payCommissionId);

  // candidatos relevantes
  const candidates = payFlow.filter((f) => (Number(f.percentual) || 0) > 0);

  // seleção explícita…
  let selected = candidates.filter((f) => paySelected[f.id]);

  // …ou auto-seleção por data (aba Arquivos)
  if (!selected.length && payload.data_pagamento_vendedor) {
    selected = candidates.filter(
      (f) => (f.data_pagamento_vendedor || "") === payload.data_pagamento_vendedor
    );
  }

  // …fallback: se só há 1 pendente → seleciona; senão pega a primeira pendente
  if (!selected.length) {
    const unpaid = candidates.filter((f) => (Number(f.valor_pago_vendedor) || 0) === 0);
    if (unpaid.length === 1) selected = unpaid;
    else if (unpaid.length > 0) selected = [unpaid[0]];
  }

  if (!selected.length) {
    alert("Selecione pelo menos uma parcela (ou informe a data/arquivos).");
    return;
  }

  // UPDATE por id — não pisar valor pago sem input
  const toUpdate = selected.filter((f) => !!f.id);
  if (toUpdate.length) {
    for (const f of toUpdate) {
      const { error } = await supabase
        .from("commission_flow")
        .update({
          data_pagamento_vendedor:
            payload.data_pagamento_vendedor ||
            f.data_pagamento_vendedor ||
            toDateInput(new Date()),
          valor_pago_vendedor:
            payload.valor_pago_vendedor !== undefined
              ? payload.valor_pago_vendedor
              : (f.valor_pago_vendedor ?? 0),
          recibo_vendedor_url: (reciboPath || f.recibo_vendedor_url) ?? null,
          comprovante_pagto_url: (compPath || f.comprovante_pagto_url) ?? null,
        })
        .eq("id", f.id);
      if (error) { alert("Falha ao atualizar parcela: " + error.message); return; }
    }
  }

  // INSERT (sem id) — caso excepcional
  const toInsert = selected.filter((f) => !f.id);
  if (toInsert.length) {
    const inserts = toInsert.map((f) => ({
      commission_id: f.commission_id,
      mes: f.mes,
      percentual: f.percentual ?? 0,
      valor_previsto: f.valor_previsto ?? 0,
      data_pagamento_vendedor: payload.data_pagamento_vendedor || toDateInput(new Date()),
      valor_pago_vendedor:
        payload.valor_pago_vendedor !== undefined ? payload.valor_pago_vendedor : 0,
      recibo_vendedor_url: reciboPath || null,
      comprovante_pagto_url: compPath || null,
    }));
    const { error } = await supabase.from("commission_flow").insert(inserts);
    if (error) { alert("Falha ao inserir parcela: " + error.message); return; }
  }

  // === Recalcular status da comissão
  const { data: fresh } = await supabase
    .from("commission_flow")
    .select("*")
    .eq("commission_id", payCommissionId)
    .order("mes", { ascending: true });

  const relevant = (fresh || []).filter((f) => (Number(f.percentual) || 0) > 0);
  const isAllPaid =
    relevant.length > 0 &&
    relevant.every((f) => (Number(f.valor_pago_vendedor) || 0) > 0);

  const { error: updErr } = await supabase
    .from("commissions")
    .update({
      status: isAllPaid ? "pago" : "a_pagar",
      data_pagamento: isAllPaid
        ? (payload.data_pagamento_vendedor || toDateInput(new Date()))
        : null,
    })
    .eq("id", payCommissionId);

  if (updErr) {
    console.warn("[commissions.update] falhou:", updErr.message);
    alert("A comissão foi paga, mas não consegui atualizar o status no banco (policies/RLS?). Vou ajustar a UI mesmo assim.");
  }

  // Estado/local
  const uniq = new Map<number, CommissionFlow>();
  (fresh || []).forEach((f: any) => uniq.set(f.mes, f));
  const freshArr = Array.from(uniq.values()) as CommissionFlow[];
  setPayFlow(freshArr);
  setRows((prev) =>
    prev.map((r) =>
      r.id === payCommissionId
        ? { ...r, flow: freshArr, status: isAllPaid ? "pago" : "a_pagar" }
        : r
    )
  );

  if (isAllPaid) {
    setShowPaid(true);
    setStatus("pago");
  }

  setOpenPay(false);
  fetchData();
}

function exportCSV() {
  const header = ["data_venda","vendedor","segmento","tabela","administradora","valor_venda","percent_aplicado","valor_total","status","data_pagamento"];
  const lines = rows.map((r) =>
    [
      r.data_venda ?? "",
      userLabel(r.vendedor_id),
      JSON.stringify(r.segmento || ""),
      JSON.stringify(r.tabela || ""),
      JSON.stringify(r.administradora || ""),
      r.valor_venda ?? r.base_calculo ?? 0,
      r.percent_aplicado ?? 0,
      r.valor_total ?? 0,
      r.status,
      r.data_pagamento ?? "",
    ].join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `comissoes_all.csv`; a.click(); URL.revokeObjectURL(url);
}

async function downloadReceiptPDFPorData() {
  const impostoPct = parseFloat(reciboImpostoPct.replace(",", ".")) / 100 || 0;
  const dataRecibo = reciboDate;
  const vendedorSel = reciboVendor === "all" ? null : reciboVendor;
  const { data: flows } = await supabase.from("commission_flow").select("*").eq("data_pagamento_vendedor", dataRecibo);
  if (!flows || !flows.length) return alert("Não há parcelas pagas na data selecionada.");
  const byCommission: Record<string, CommissionFlow[]> = {};
  flows.forEach((f: any) => {
    if (!byCommission[f.commission_id]) byCommission[f.commission_id] = [];
    if (!byCommission[f.commission_id].some((x) => x.mes === f.mes)) byCommission[f.commission_id].push(f);
  });
  const commIds = Object.keys(byCommission);
  const { data: comms } = await supabase.from("commissions").select("*").in("id", commIds);
  const vendaIds = Array.from(new Set((comms || []).map((c: any) => c.venda_id)));
  const { data: vendas } = await supabase
    .from("vendas")
    .select("id, valor_venda, numero_proposta, cliente_lead_id, lead_id, vendedor_id")
    .in("id", vendaIds);
  const commsFiltradas = (comms || []).filter((c: any) => !vendedorSel || c.vendedor_id === vendedorSel);
  if (!commsFiltradas.length) return alert("Sem parcelas para o vendedor selecionado nessa data.");

  const clienteIds = Array.from(new Set((vendas || []).map((v) => v.lead_id || v.cliente_lead_id).filter(Boolean) as string[]));
  const nomesCli: Record<string, string> = {};
  if (clienteIds.length) {
    const { data: cli } = await supabase.from("leads").select("id, nome").in("id", clienteIds);
    (cli || []).forEach((c: any) => { nomesCli[c.id] = c.nome || ""; });
  }

  const vendedorUsado = vendedorSel ?? commsFiltradas[0].vendedor_id;
  const vendInfo = secureById[vendedorUsado] || ({} as any);
  const totalLinhas = commsFiltradas.reduce((acc, c: any) => acc + new Map((byCommission[c.id] || []).map((p) => [p.mes, p])).size, 0);
  const numeroRecibo = `${dataRecibo.replace(/-/g, "")}-${String(totalLinhas).padStart(3, "0")}`;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("RECIBO DE COMISSÃO", 297, 40, { align: "center" });
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`Recibo Nº: ${numeroRecibo}`, 40, 60);
  doc.text(`Data: ${formatISODateBR(dataRecibo)}`, 40, 74);

  let y = 92;
  ["Nome do Pagador: Consulmax Serviços de Planejamento Estruturado e Proteção LTDA. CNPJ: 57.942.043/0001-03",
   "Endereço: Av. Menezes Filho, 3171, Casa Preta, Ji-Paraná/RO. CEP: 76907-532"].forEach((l) => { doc.text(l, 40, y); y += 14; });

  const recebedor = [
    `Nome do Recebedor: ${userLabel(vendedorUsado)}`,
    `CPF/CNPJ: ${vendInfo?.cpf || "—"}`,
    `Endereço: ${[vendInfo?.logradouro, vendInfo?.numero, vendInfo?.bairro, vendInfo?.cidade && `${vendInfo.cidade}/${vendInfo.uf}`].filter(Boolean).join(", ") || "—"}`,
  ];
  y += 10; recebedor.forEach((l) => { doc.text(l, 40, y); y += 14; });
  y += 6; doc.text("Descrição: Pagamento referente às comissões abaixo relacionadas.", 40, y); y += 16;

  const head = [["CLIENTE","PROPOSTA","PARCELA","R$ VENDA","COM. BRUTA","IMPOSTOS","COM. LÍQUIDA"]]; const body: any[] = []; let totalLiquido = 0;
  commsFiltradas.forEach((c: any) => {
    const v = (vendas || []).find((x) => x.id === c.venda_id);
    const clienteId = v?.lead_id || v?.cliente_lead_id || ""; const clienteNome = clienteId ? nomesCli[clienteId] || "—" : "—";
    const vendaValor = v?.valor_venda || 0;
    const parcelas = Array.from(new Map((byCommission[c.id] || []).map((p) => [p.mes, p])).values());
    parcelas.forEach((p) => {
      const comBruta = (c.percent_aplicado || 0) * (p.percentual || 0) * vendaValor;
      const impostos = comBruta * (parseFloat(reciboImpostoPct.replace(",", ".")) / 100 || 0);
      const liquida = comBruta - impostos; totalLiquido += liquida;
      body.push([clienteNome, v?.numero_proposta || "—", `M${p.mes}`, BRL(vendaValor), BRL(comBruta), BRL(impostos), BRL(liquida)]);
    });
  });

  autoTable(doc, { startY: y, head, body, styles: { font: "helvetica", fontSize: 10 }, headStyles: { fillColor: [30, 41, 63] } });
  const endY = (doc as any).lastAutoTable.finalY + 12;
  doc.setFont("helvetica", "bold"); doc.text(`Valor total líquido da comissão: ${BRL(totalLiquido)} (${valorPorExtenso(totalLiquido)})`, 40, endY);
  doc.setFont("helvetica", "normal"); doc.text(`Forma de Pagamento: PIX`, 40, endY + 18);
  doc.text(`Chave PIX do pagamento: ${secureById[vendedorUsado]?.pix_key || "—"}`, 40, endY + 34);
  const signY = endY + 100; doc.line(40, signY, 320, signY); doc.text(`${userLabel(vendedorUsado)}`, 40, signY + 14); doc.text(`${secureById[vendedorUsado]?.cpf || "—"}`, 40, signY + 28);
  doc.save(`recibo_${dataRecibo}_${userLabel(vendedorUsado)}.pdf`);
}

/* Listas auxiliares */
const rowsAPagar = useMemo(() => rows.filter((r) => r.status === "a_pagar"), [rows]);

const pagosFlat = useMemo(() => {
  const list: Array<{ flow: CommissionFlow; comm: Commission }> = [];
  rows.forEach((r) =>
    (r.flow || []).forEach((f) => {
      if ((f.valor_pago_vendedor ?? 0) > 0) list.push({ flow: f, comm: r });
    })
  );
  return list.sort((a, b) =>
    (b.flow.data_pagamento_vendedor || "") > (a.flow.data_pagamento_vendedor || "") ? 1 : -1
  );
}, [rows]);

const pagosFiltered = useMemo(() => {
  const q = normalize(paidSearch);
  if (!q) return pagosFlat;
  return pagosFlat.filter(({ comm }) => {
    const cliente = normalize(comm.cliente_nome || "");
    const prop = normalize(comm.numero_proposta || "");
    return cliente.includes(q) || prop.includes(q);
  });
}, [pagosFlat, paidSearch]);

const totalPages = Math.max(1, Math.ceil(pagosFiltered.length / pageSize));
const pageStart = (Math.min(Math.max(paidPage, 1), totalPages) - 1) * pageSize;
const pagosPage = pagosFiltered.slice(pageStart, pageStart + pageSize);

/* ========================= Séries de dados para gráficos (Etapa 1) ========================= */
const series5Anos = useMemo(() => {
  return projectAnnualFlows(rows).map((d) => ({
    label: String(d.ano),
    pago: d.pago,
    projetado: d.projetado,
  }));
}, [rows]);

const seriesAnoAnterior = useMemo(() => {
  const anoAnterior = now.getFullYear() - 1;
  return projectMonthlyFlows(rows)
    .filter((d) => d.ano === anoAnterior)
    .map((d) => ({
      label: `${d.mes}/${d.ano}`,
      pago: d.pago,
      projetado: d.projetado,
    }));
}, [rows, now]);

const seriesAnoCorrente = useMemo(() => {
  const anoAtual = now.getFullYear();
  return projectMonthlyFlows(rows)
    .filter((d) => d.ano === anoAtual)
    .map((d) => ({
      label: `${d.mes}/${d.ano}`,
      pago: d.pago,
      projetado: d.projetado,
    }));
}, [rows, now]);

const seriesMesCorrente = useMemo(() => {
  const anoAtual = now.getFullYear();
  const mesAtual = now.getMonth() + 1;
  return projectWeeklyFlows(rows)
    .filter((d) => d.ano === anoAtual && d.mes === mesAtual)
    .map((d, idx) => ({
      label: `Sem ${idx + 1}`,
      pago: d.pago,
      projetado: d.projetado,
    }));
}, [rows, now]);

  <div className="p-4 space-y-4">
    {/* Filtros topo */}
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <FilterIcon className="w-5 h-5" /> Filtros
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <div>
          <Label>Vendedor</Label>
          <Select value={vendedorId} onValueChange={setVendedorId}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.nome?.trim() || u.email?.trim() || u.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Segmento</Label>
          <Select value={segmento} onValueChange={setSegmento}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Array.from(new Set(simTables.map((t) => t.segmento))).filter(Boolean).map((seg) => (
                <SelectItem key={seg} value={seg}>{seg}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tabela</Label>
          <Select value={tabela} onValueChange={setTabela}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Array.from(new Set(simTables.map((t) => t.nome_tabela))).filter(Boolean).map((tab) => (
                <SelectItem key={tab} value={tab}>{tab}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="a_pagar">A pagar</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="estorno">Estorno</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-6 flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setOpenRules(true)}><Settings className="w-4 h-4 mr-1" /> Regras de Comissão</Button>
          <Button onClick={fetchData}><Loader2 className="w-4 h-4 mr-1" /> Atualizar</Button>
        </div>
      </CardContent>
    </Card>

    {/* Dashboards (Relógios com projeções – Etapa 1) */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <Card>
        <CardHeader className="pb-1"><CardTitle>Nos últimos 5 anos — {vendedorAtual}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Metric title="Total Bruto" value={BRL(range5y.totalBruta)} />
            <Metric title="Recebido Líquido" value={BRL(range5y.pagoLiquido)} />
            <Metric title="Pendente Líquido" value={BRL(range5y.pendente)} />
          </div>
          <Donut
            paid={range5y.pagoLiquido}
            pending={range5y.pendente}
            label="5 anos"
            hoverPaidText={`Pago no período: ${BRL(range5y.pagoLiquido)} — ${(range5y.pct || 0).toFixed(2).replace(".", ",")}%`}
            hoverPendText={`A pagar no período: ${BRL(range5y.pendente)} — ${range5y.totalLiquida > 0 ? ((range5y.pendente / range5y.totalLiquida) * 100).toFixed(2).replace(".", ",") : "0,00"}%`}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1"><CardTitle>No ano — {vendedorAtual}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Metric title="Total Bruto" value={BRL(rangeY.totalBruta)} />
            <Metric title="Recebido Líquido" value={BRL(rangeY.pagoLiquido)} />
            <Metric title="Pendente Líquido" value={BRL(rangeY.pendente)} />
          </div>
          <Donut
            paid={rangeY.pagoLiquido}
            pending={rangeY.pendente}
            label="Ano"
            hoverPaidText={`Pago no ano: ${BRL(rangeY.pagoLiquido)} — ${(rangeY.pct || 0).toFixed(2).replace(".", ",")}%`}
            hoverPendText={`A pagar no ano: ${BRL(rangeY.pendente)} — ${rangeY.totalLiquida > 0 ? ((rangeY.pendente / rangeY.totalLiquida) * 100).toFixed(2).replace(".", ",") : "0,00"}%`}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1"><CardTitle>No mês — {vendedorAtual}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Metric title="Total Bruto" value={BRL(rangeM.totalBruta)} />
            <Metric title="Recebido Líquido" value={BRL(rangeM.pagoLiquido)} />
            <Metric title="Pendente Líquido" value={BRL(rangeM.pendente)} />
          </div>
          <Donut
            paid={rangeM.pagoLiquido}
            pending={rangeM.pendente}
            label="Mês"
            hoverPaidText={`Pago no mês: ${BRL(rangeM.pagoLiquido)} — ${(rangeM.pct || 0).toFixed(2).replace(".", ",")}%`}
            hoverPendText={`A pagar no mês: ${BRL(rangeM.pendente)} — ${rangeM.totalLiquida > 0 ? ((rangeM.pendente / rangeM.totalLiquida) * 100).toFixed(2).replace(".", ",") : "0,00"}%`}
          />
        </CardContent>
      </Card>
    </div>

    {/* Gráficos de linhas (Etapa 1) */}
    {(() => {
      const ann = projectAnnualFlows(rows);
      const mon = projectMonthlyFlows(rows);
      const wk = projectWeeklyFlows(rows);
      return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-1"><CardTitle>5 anos — Previsto × Pago (bruto)</CardTitle></CardHeader>
            <CardContent>
              <LineChart
                labels={ann.labels}
                series={[
                  { name: "Previsto", data: ann.previstoBruto },
                  { name: "Pago", data: ann.pagoBruto },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle>Ano atual — Previsto × Pago (bruto)</CardTitle></CardHeader>
            <CardContent>
              <LineChart
                labels={mon.labels}
                series={[
                  { name: "Previsto", data: mon.previstoBruto },
                  { name: "Pago", data: mon.pagoBruto },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle>Mês atual (semanas por quinta) — Previsto × Pago (bruto)</CardTitle></CardHeader>
            <CardContent>
              <LineChart
                labels={wk.labels}
                series={[
                  { name: "Previsto", data: wk.previstoBruto },
                  { name: "Pago", data: wk.pagoBruto },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      );
    })()}

    {/* Resumo */}
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      <Card><CardHeader className="pb-1"><CardTitle>💰 Vendas</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.vendasTotal)}</CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle>🧾 Comissão Bruta</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comBruta)}</CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle>✅ Comissão Líquida</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comLiquida)}</CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle>📤 Comissão Paga (Liq.)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comPaga)}</CardContent></Card>
      <Card><CardHeader className="pb-1"><CardTitle>⏳ Pendente (Liq.)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comPendente)}</CardContent></Card>
    </div>

    {/* Vendas sem comissão (Etapa 3 mantido com ajuste já aplicado) */}
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>Vendas sem comissão (todos os registros + filtros)</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCSV}><FileText className="w-4 h-4 mr-1" /> Exportar CSV</Button>
            <Button size="sm" variant="outline" onClick={() => setShowVendasSem((v) => !v)}>{showVendasSem ? "Ocultar" : "Expandir"}</Button>
          </div>
        </CardTitle>
      </CardHeader>
      {showVendasSem && (
        <CardContent className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left">Data</th><th className="p-2 text-left">Vendedor</th><th className="p-2 text-left">Cliente</th><th className="p-2 text-left">Nº Proposta</th><th className="p-2 text-left">Administradora</th><th className="p-2 text-left">Segmento</th><th className="p-2 text-left">Tabela</th><th className="p-2 text-right">Crédito</th><th className="p-2 text-left">Ação</th>
              </tr>
            </thead>
            <tbody>
              {vendasSemCom.length === 0 && <tr><td colSpan={9} className="p-3 text-gray-500">Sem pendências 🎉</td></tr>}
              {vendasSemCom.map((v) => {
                const clienteId = v.lead_id || v.cliente_lead_id || "";
                return (
                  <tr key={v.id} className="border-b">
                    <td className="p-2">{formatISODateBR(v.data_venda)}</td>
                    <td className="p-2">{userLabel(v.vendedor_id)}</td>
                    <td className="p-2">{(clienteId && (clientesMap[clienteId]?.trim() as any)) || "—"}</td>
                    <td className="p-2">{v.numero_proposta || "—"}</td>
                    <td className="p-2">{v.administradora || "—"}</td>
                    <td className="p-2">{v.segmento || "—"}</td>
                    <td className="p-2">{v.tabela || "—"}</td>
                    <td className="p-2 text-right">{BRL(v.valor_venda)}</td>
                    <td className="p-2">
                      <Button size="sm" onClick={() => gerarComissaoDeVenda(v)} disabled={genBusy === v.id}>
                        {genBusy === v.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-1" />}
                        Gerar Comissão
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      )}
    </Card>

    {/* Detalhamento — some quando zera (cabeçalho ajustado Etapa 3) */}
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>Detalhamento de Comissões (a pagar)</span>
          <div className="flex items-center gap-3">
            <div>
              <Label>Vendedor</Label>
              <Select value={vendedorId} onValueChange={setVendedorId}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome?.trim() || u.email?.trim() || u.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowUnpaid((v) => !v)}>{showUnpaid ? "Ocultar" : "Expandir"}</Button>
            </div>
            <div className="flex items-center gap-2">
              <div><Label>Data do Recibo</Label><Input type="date" value={reciboDate} onChange={(e) => setReciboDate(e.target.value)} /></div>
              <div><Label>Imposto (%)</Label><Input value={reciboImpostoPct} onChange={(e) => setReciboImpostoPct(e.target.value)} className="w-24" /></div>
            </div>
            <Button onClick={downloadReceiptPDFPorData}><FileText className="w-4 h-4 mr-1" /> Recibo</Button>
          </div>
        </CardTitle>
      </CardHeader>
      {showUnpaid && (
        <CardContent className="overflow-x-auto">
          <table className="min-w-[1200px] w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left">Data</th><th className="p-2 text-left">Vendedor</th><th className="p-2 text-left">Cliente</th><th className="p-2 text-left">Nº Proposta</th><th className="p-2 text-left">Segmento</th><th className="p-2 text-left">Tabela</th><th className="p-2 text-right">Crédito</th><th className="p-2 text-right">% Comissão</th><th className="p-2 text-right">Valor Comissão</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Pagamento</th><th className="p-2 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={12} className="p-4"><Loader2 className="animate-spin inline mr-2" /> Carregando...</td></tr>}
              {!loading && rowsAPagar.length === 0 && <tr><td colSpan={12} className="p-4 text-gray-500">Sem registros.</td></tr>}
              {!loading && rowsAPagar.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{r.data_venda ? formatISODateBR(r.data_venda) : "—"}</td>
                  <td className="p-2">{userLabel(r.vendedor_id)}</td>
                  <td className="p-2">{r.cliente_nome || "—"}</td>
                  <td className="p-2">{r.numero_proposta || "—"}</td>
                  <td className="p-2">{r.segmento || "—"}</td>
                  <td className="p-2">{r.tabela || "—"}</td>
                  <td className="p-2 text-right">{BRL(r.valor_venda ?? r.base_calculo)}</td>
                  <td className="p-2 text-right">{pct100(r.percent_aplicado)}</td>
                  <td className="p-2 text-right">{BRL(r.valor_total)}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">{r.data_pagamento ? formatISODateBR(r.data_pagamento) : "—"}</td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openPaymentFor(r)}>
                        <DollarSign className="w-4 h-4 mr-1" />
                        {hasRegisteredButUnpaid(r.flow) ? "Confirmar Pagamento" : "Registrar pagamento"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => retornarComissao(r)}><RotateCcw className="w-4 h-4 mr-1" /> Retornar</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      )}
    </Card>

    {/* Comissões pagas (Accordion + busca + paginação) */}
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>Comissões pagas</span>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por cliente ou nº proposta"
              value={paidSearch}
              onChange={(e) => { setPaidSearch(e.target.value); setPaidPage(1); }}
              className="w-[280px]"
            />
            <Button size="sm" variant="outline" onClick={() => setShowPaid((v) => !v)}>{showPaid ? "Ocultar" : "Expandir"}</Button>
          </div>
        </CardTitle>
      </CardHeader>
      {showPaid && (
        <CardContent className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left">Data Pagto</th>
                <th className="p-2 text-left">Vendedor</th>
                <th className="p-2 text-left">Cliente</th>
                <th className="p-2 text-left">Nº Proposta</th>
                <th className="p-2 text-left">Parcela</th>
                <th className="p-2 text-right">Valor Pago (Bruto)</th>
                <th className="p-2 text-left">Arquivos</th>
                {/* Chip Estorno (Etapa 2) – handler será adicionado em bloco próprio */}
                <th className="p-2 text-left">Estorno</th>
              </tr>
            </thead>
            <tbody>
              {pagosPage.length === 0 && <tr><td colSpan={8} className="p-4 text-gray-500">Nenhum pagamento encontrado.</td></tr>}
              {pagosPage.map(({ flow, comm }) => (
                <tr key={flow.id} className="border-b">
                  <td className="p-2">{flow.data_pagamento_vendedor ? formatISODateBR(flow.data_pagamento_vendedor) : "—"}</td>
                  <td className="p-2">{userLabel(comm.vendedor_id)}</td>
                  <td className="p-2">{comm.cliente_nome || "—"}</td>
                  <td className="p-2">{comm.numero_proposta || "—"}</td>
                  <td className="p-2">M{flow.mes}</td>
                  <td className="p-2 text-right">{BRL(flow.valor_pago_vendedor)}</td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      {flow.recibo_vendedor_url && <a className="underline text-blue-700" href="#" onClick={async (e) => { e.preventDefault(); const u = await getSignedUrl(flow.recibo_vendedor_url); if (u) window.open(u, "_blank"); }}>Recibo</a>}
                      {flow.comprovante_pagto_url && <a className="underline text-blue-700" href="#" onClick={async (e) => { e.preventDefault(); const u = await getSignedUrl(flow.comprovante_pagto_url); if (u) window.open(u, "_blank"); }}>Comprovante</a>}
                    </div>
                  </td>
                  <td className="p-2">
                    {/* Botão ficará funcional quando os handlers/estado de Estorno forem adicionados */}
                    <Button size="sm" variant="outline" disabled>Estornar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-end gap-3 pt-3">
            <div className="text-sm text-gray-600">
              Mostrando {pagosPage.length ? pageStart + 1 : 0}–{Math.min(pageStart + pageSize, pagosFiltered.length)} de {pagosFiltered.length}
            </div>
            <Button size="sm" variant="outline" onClick={() => setPaidPage((p) => Math.max(1, p - 1))} disabled={paidPage <= 1}>Anterior</Button>
            <Button size="sm" variant="outline" onClick={() => setPaidPage((p) => Math.min(totalPages, p + 1))} disabled={paidPage >= totalPages}>Próxima</Button>
          </div>
        </CardContent>
      )}
    </Card>

    {/* Regras (overlay) — mantido */}
    <Dialog open={openRules} onOpenChange={setOpenRules}>
      <DialogContent className="max-w-6xl">
        <DialogHeader><DialogTitle>Regras de Comissão</DialogTitle></DialogHeader>

        {/* Cabeçalho do formulário */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div>
            <Label>Vendedor</Label>
            <Select value={ruleVendorId} onValueChange={(v) => { setRuleVendorId(v); }}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome?.trim() || u.email?.trim() || u.id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tabela (SimTables)</Label>
            <Select value={ruleSimTableId} onValueChange={setRuleSimTableId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {simTables.map((t) => <SelectItem key={t.id} value={t.id}>{t.segmento} — {t.nome_tabela}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>% Padrão (ex.: 1,20 = 1,20%)</Label>
            <Input value={rulePercent} onChange={(e) => setRulePercent(e.target.value)} placeholder="1,20" />
          </div>
          <div>
            <Label>Nº de meses do fluxo</Label>
            <Input type="number" min={1} max={36} value={ruleMeses} onChange={(e) => onChangeMeses(parseInt(e.target.value || "1"))} />
          </div>
        </div>

        <hr className="my-4" />

        {/* Fluxo */}
        <div className="space-y-2">
          <Label>Fluxo do pagamento (M1..Mn) — você pode digitar 100% no total **ou** a soma igual ao % Padrão</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 p-3 border rounded-md bg-white">
            {Array.from({ length: ruleMeses }).map((_, i) => (
              <Input
                key={i}
                value={ruleFluxoPct[i] || "0,00"}
                onChange={(e) => { const arr = [...ruleFluxoPct]; arr[i] = e.target.value; setRuleFluxoPct(arr); }}
                placeholder="0,33"
              />
            ))}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            Soma do fluxo: <b>{fluxoSoma.toFixed(2)} (aceitas: 1,00 ou % padrão {rulePercent || "0,00"})</b>
          </div>
        </div>

        <hr className="my-4" />

        {/* Observações + Ações */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-end">
          <div className="lg:col-span-2">
            <Label>Observações</Label>
            <Input value={ruleObs} onChange={(e) => setRuleObs(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="flex gap-2">
            <Button onClick={saveRule}><Save className="w-4 h-4 mr-1" /> Salvar Regra</Button>
            <Button variant="outline" onClick={() => { setRuleSimTableId(""); setRulePercent("1,20"); setRuleMeses(1); setRuleFluxoPct(["100,00"]); setRuleObs(""); }}>Limpar</Button>
          </div>
        </div>

        <hr className="my-4" />

        {/* Lista de regras */}
        <div className="border rounded-md max-h-[45vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="p-2 text-left">Segmento</th>
                <th className="p-2 text-left">Administradora</th>
                <th className="p-2 text-left">Tabela</th>
                <th className="p-2 text-right">% Padrão</th>
                <th className="p-2 text-left">Fluxo</th>
                <th className="p-2 text-left">Ação</th>
              </tr>
            </thead>
            <tbody>
              {(!ruleRows || ruleRows.length === 0) && <tr><td colSpan={6} className="p-3 text-gray-500">Nenhuma regra cadastrada para o vendedor selecionado.</td></tr>}
              {ruleRows.map((r) => (
                <tr key={`${r.vendedor_id}-${r.sim_table_id}`} className="border-t">
                  <td className="p-2">{r.segmento || "—"}</td>
                  <td className="p-2">{r.administradora || "—"}</td>
                  <td className="p-2">{r.nome_tabela}</td>
                  <td className="p-2 text-right">{pct100(r.percent_padrao)}</td>
                  <td className="p-2">{r.fluxo_meses} Pgtos</td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => loadRuleToForm(r)}><Pencil className="w-4 h-4 mr-1" /> Editar</Button>
                      <Button size="sm" variant="outline" onClick={() => deleteRule(r.vendedor_id, r.sim_table_id)}><Trash2 className="w-4 h-4 mr-1" /> Excluir</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter><Button variant="secondary" onClick={() => setOpenRules(false)}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Pagamento (overlay largo) — mantido */}
    <Dialog open={openPay} onOpenChange={setOpenPay}>
      <DialogContent className="w-[98vw] max-w-[1400px]">
        <DialogHeader><DialogTitle>Registrar pagamento ao vendedor</DialogTitle></DialogHeader>
        <Tabs defaultValue={payDefaultTab}>
          <TabsList className="mb-3"><TabsTrigger value="selecionar">Selecionar parcelas</TabsTrigger><TabsTrigger value="arquivos">Arquivos</TabsTrigger></TabsList>
          <TabsContent value="selecionar" className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div><Label>Data do pagamento</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
              <div><Label>Valor pago ao vendedor (opcional)</Label><Input placeholder="Ex.: 1.974,00" value={payValue} onChange={(e) => setPayValue(e.target.value)} /></div>
              <div className="flex items-end">
                <Button onClick={() => paySelectedParcels({
                  data_pagamento_vendedor: payDate,
                  valor_pago_vendedor: payValue ? parseFloat(payValue.replace(/\./g, "").replace(",", ".")) : undefined,
                  recibo_file: null, comprovante_file: null,
                })}><Save className="w-4 h-4 mr-1" /> Salvar</Button>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={() => {
                  const pend = Object.fromEntries(payFlow
                    .filter((f) => !f.data_pagamento_vendedor && (f.valor_pago_vendedor ?? 0) === 0)
                    .map((f) => [f.id, true]));
                  setPaySelected(pend);
                }}>Selecionar tudo pendente</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1300px] w-full text-sm">
                <thead><tr className="bg-gray-50">
                  <th className="p-2 text-left">Sel.</th><th className="p-2 text-left">Mês</th><th className="p-2 text-left">% Parcela</th>
                  <th className="p-2 text-right">Valor Previsto</th><th className="p-2 text-right">Valor Pago</th><th className="p-2 text-left">Data Pagto</th>
                </tr></thead>
                <tbody>
                  {payFlow.map((f) => {
                    const isLocked = (f.valor_pago_vendedor ?? 0) > 0 || Boolean(f.recibo_vendedor_url) || Boolean(f.comprovante_pagto_url);
                    return (
                      <tr key={f.id} className={`border-b ${isLocked ? "opacity-60 pointer-events-none" : ""}`}>
                        <td className="p-2">
                          <Checkbox checked={!!paySelected[f.id]} onCheckedChange={(v) => setPaySelected((s) => ({ ...s, [f.id]: !!v }))} disabled={isLocked} />
                        </td>
                        <td className="p-2">M{f.mes}</td>
                        <td className="p-2">{pct100(f.percentual)}</td>
                        <td className="p-2 text-right">{BRL((f as any)._valor_previsto_calc ?? f.valor_previsto)}</td>
                        <td className="p-2 text-right">{BRL(f.valor_pago_vendedor)}</td>
                        <td className="p-2">{f.data_pagamento_vendedor ? formatISODateBR(f.data_pagamento_vendedor) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="arquivos"><UploadArea onConfirm={paySelectedParcels} /></TabsContent>
        </Tabs>
        <DialogFooter><Button onClick={() => setOpenPay(false)} variant="secondary">Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Dialog Estorno (Etapa 2) — será funcional após bloco de handlers/estado */}
    {/* (adição dos estados/handlers virá em bloco próprio; não incluído aqui para não quebrar a compilação) */}
}

/* ========================= Subcomponentes ========================= */
function Metric({ title, value }: { title: string; value: string }) {
  return (<div className="p-3 rounded-xl border bg-white"><div className="text-xs text-gray-500">{title}</div><div className="text-xl font-bold">{value}</div></div>);
}

function UploadArea({
  onConfirm,
}: {
  onConfirm: (payload: {
    data_pagamento_vendedor?: string;
    valor_pago_vendedor?: number;
    recibo_file?: File | null;
    comprovante_file?: File | null;
  }) => Promise<void>;
}) {
  const [dataPg, setDataPg] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [valorPg, setValorPg] = useState<string>("");
  const [fileRecibo, setFileRecibo] = useState<File | null>(null);
  const [fileComp, setFileComp] = useState<File | null>(null);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><Label>Data do pagamento</Label><Input type="date" value={dataPg} onChange={(e) => setDataPg(e.target.value)} /></div>
        <div><Label>Valor pago ao vendedor (opcional)</Label><Input placeholder="Ex.: 1.974,00" value={valorPg} onChange={(e) => setValorPg(e.target.value)} /></div>
        <div className="flex items-end">
          <Button onClick={() => onConfirm({
            data_pagamento_vendedor: dataPg,
            valor_pago_vendedor: valorPg ? parseFloat(valorPg.replace(/\./g, "").replace(",", ".")) : undefined,
            recibo_file: fileRecibo, comprovante_file: fileComp,
          })}><Save className="w-4 h-4 mr-1" /> Confirmar pagamento</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><Label>Recibo assinado (PDF)</Label><Input type="file" accept="application/pdf" onChange={(e) => setFileRecibo(e.target.files?.[0] || null)} /></div>
        <div><Label>Comprovante de pagamento (PDF/Imagem)</Label><Input type="file" accept="application/pdf,image/*" onChange={(e) => setFileComp(e.target.files?.[0] || null)} /></div>
      </div>
      <div className="text-xs text-gray-500">
        Arquivos vão para o bucket <code>comissoes</code>. Digite o valor <b>BRUTO</b>. Se nenhuma parcela estiver marcada, a confirmação faz uma seleção segura automática (especialmente no fluxo 1×100%).
      </div>
    </div>
  );
}

/* ========================= LineChart (novo, minimalista) ========================= */
function LineChart({
  labels,
  series,
  height = 220,
  formatY = (v: number) => BRL(v),
}: {
  labels: string[];
  series: Array<{ name: string; data: number[] }>;
  height?: number;
  formatY?: (v: number) => string;
}) {
  const [hover, setHover] = useState<{ si: number; pi: number } | null>(null);

  // Cores padrão alinhadas à Consulmax
  const palette = ["#1E293F", "#A11C27", "#B5A573", "#1E40AF", "#047857"];

  const width = 760;
  const pad = { top: 12, right: 16, bottom: 28, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const maxY = useMemo(() => {
    const all = series.flatMap((s) => s.data);
    const m = Math.max(1, ...all);
    // arredonda para cima em "escala bonita"
    const pow = Math.pow(10, String(Math.floor(m)).length - 1);
    return Math.ceil(m / pow) * pow;
  }, [series]);

  const xStep = innerW / Math.max(1, labels.length - 1);
  const yScale = (v: number) => innerH - (v / maxY) * innerH;

  const pointsFor = (s: number[]) =>
    s.map((v, i) => [pad.left + i * xStep, pad.top + yScale(v)] as const);

  const nearestPoint = (mx: number) => {
    // índice X mais próximo
    const xi = Math.round((mx - pad.left) / xStep);
    return Math.min(Math.max(xi, 0), labels.length - 1);
  };

  const hovered = hover
    ? {
        label: labels[hover.pi],
        items: series.map((s) => s.data[hover.pi] ?? 0),
      }
    : null;

  return (
    <div className="relative rounded-xl border bg-white p-3">
      <svg
        width={width}
        height={height}
        className="block"
        onMouseLeave={() => setHover(null)}
      >
        {/* Eixos e grid horizontal leve */}
        <g>
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const y = pad.top + innerH * (1 - t);
            const val = (maxY * t);
            return (
              <g key={i}>
                <line
                  x1={pad.left}
                  x2={pad.left + innerW}
                  y1={y}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeDasharray="4 4"
                />
                <text
                  x={pad.left - 8}
                  y={y + 4}
                  fontSize="11"
                  textAnchor="end"
                  fill="#6b7280"
                >
                  {formatY(val)}
                </text>
              </g>
            );
          })}
          {/* eixo X (labels) */}
          <line
            x1={pad.left}
            x2={pad.left + innerW}
            y1={pad.top + innerH}
            y2={pad.top + innerH}
            stroke="#e5e7eb"
          />
          {labels.map((lb, i) => {
            const x = pad.left + i * xStep;
            return (
              <text
                key={i}
                x={x}
                y={pad.top + innerH + 18}
                fontSize="11"
                textAnchor="middle"
                fill="#6b7280"
              >
                {lb}
              </text>
            );
          })}
        </g>

        {/* Linhas */}
        {series.map((s, si) => {
          const pts = pointsFor(s.data);
          const d = pts
            .map(([x, y], i) => (i === 0 ? `M ${x},${y}` : `L ${x},${y}`))
            .join(" ");
          return (
            <g key={si}>
              <path
                d={d}
                fill="none"
                stroke={palette[si % palette.length]}
                strokeWidth={2}
              />
              {pts.map(([x, y], pi) => (
                <circle
                  key={pi}
                  cx={x}
                  cy={y}
                  r={hover && hover.si === si && hover.pi === pi ? 4 : 2.5}
                  fill="#ffffff"
                  stroke={palette[si % palette.length]}
                  strokeWidth={2}
                />
              ))}
            </g>
          );
        })}

        {/* Overlay para capturar hover por coluna X */}
        <rect
          x={pad.left}
          y={pad.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={(e) => {
            const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
            const mx = e.clientX - box.left;
            const pi = nearestPoint(mx);
            // preferir a série 0 para foco, mas manter índice da série como 0 (tooltip lista todas)
            setHover({ si: 0, pi });
          }}
        />

        {/* Guia de hover vertical */}
        {hover && (
          <line
            x1={pad.left + hover.pi * xStep}
            x2={pad.left + hover.pi * xStep}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke="#9ca3af"
            strokeDasharray="4 4"
          />
        )}
      </svg>

      {/* Legenda simples */}
      <div className="mt-2 flex flex-wrap gap-3">
        {series.map((s, si) => (
          <div className="flex items-center gap-2 text-sm" key={si}>
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: palette[si % palette.length] }}
            />
            <span className="text-gray-700">{s.name}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {hover && hovered && (
        <div
          className="pointer-events-none absolute rounded-md border bg-white px-3 py-2 text-xs shadow"
          style={{
            left: Math.min(
              width - 180,
              Math.max(8, pad.left + hover.pi * xStep - 60)
            ),
            top: 8,
          }}
        >
          <div className="mb-1 font-semibold text-gray-800">
            {hovered.label}
          </div>
          <div className="space-y-1">
            {hovered.items.map((v, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1 text-gray-600">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ background: palette[i % palette.length] }}
                  />
                  {series[i]?.name ?? `Série ${i + 1}`}
                </span>
                <span className="tabular-nums">{formatY(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================= Permissões de Acesso (Etapa 4) ========================= */
/* Estado do usuário logado e perfil de acesso */
const [authUserId, setAuthUserId] = useState<string | null>(null);
const [userRole, setUserRole] = useState<"admin" | "vendedor">("vendedor");

/* Descobrir o usuário autenticado e papel via metadados do Supabase */
useEffect(() => {
  (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const u = data?.user || null;
      setAuthUserId(u?.id ?? null);

      // Busca em metadados (preferência: app_metadata.user_role -> user_metadata.user_role)
      const metaRole =
        (u?.app_metadata as any)?.user_role ||
        (u?.user_metadata as any)?.user_role ||
        null;

      if (metaRole === "admin" || metaRole === "vendedor") {
        setUserRole(metaRole);
      } else {
        // fallback simples: se não houver role, assume vendedor
        setUserRole("vendedor");
      }
    } catch (e) {
      console.warn("[auth] getUser falhou:", e);
    }
  })();
}, []);

/* Usuário (linha em 'users') correspondente ao auth_user_id */
const currentUserId = useMemo(() => {
  if (!authUserId) return null;
  return usersByAuth[authUserId]?.id ?? null;
}, [authUserId, usersByAuth]);

/* Helpers de permissão */
function isOwnerByVenda(v: Venda) {
  const vend = canonUserId(v.vendedor_id) || v.vendedor_id || null;
  return !!currentUserId && !!vend && currentUserId === vend;
}
function isOwnerByCommission(c: Commission) {
  const vend = canonUserId(c.vendedor_id) || c.vendedor_id || null;
  return !!currentUserId && !!vend && currentUserId === vend;
}

const can = {
  viewAll: userRole === "admin",
  manageRules: userRole === "admin",
  // gerar comissão só para o próprio (vendedor) ou qualquer (admin)
  generateForVenda: (v: Venda) => userRole === "admin" || isOwnerByVenda(v),
  // registrar pagamento: somente admin
  payCommission: (c: Commission) => userRole === "admin",
  // retornar comissão: somente admin
  returnCommission: (c: Commission) => userRole === "admin",
  // visualizar listagens:
  showRowVenda: (v: Venda) => userRole === "admin" || isOwnerByVenda(v),
  showRowCommission: (c: Commission) => userRole === "admin" || isOwnerByCommission(c),
};
