// src/pages/Comissoes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Filter as FilterIcon,
  Settings,
  Save,
  DollarSign,
  RotateCcw,
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
  percent_padrao: number;
  fluxo_meses: number;
  fluxo_percentuais: number[];
  obs: string | null;
};

/* ========================= Helpers ========================= */
const BRL = (v?: number | null) =>
  (typeof v === "number" ? v : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const pct100 = (v?: number | null) =>
  `${(((typeof v === "number" ? v : 0) * 100) as number)
    .toFixed(2)
    .replace(".", ",")}%`;

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);

const sum = (arr: (number | null | undefined)[]) =>
  arr.reduce((a, b) => a + (b || 0), 0);

const clamp0 = (n: number) => (n < 0 ? 0 : n);

const formatISODateBR = (iso?: string | null) =>
  !iso ? "—" : iso.split("-").reverse().join("/");

const normalize = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

function valorPorExtenso(n: number) {
  const u = [
    "zero",
    "um",
    "dois",
    "três",
    "quatro",
    "cinco",
    "seis",
    "sete",
    "oito",
    "nove",
    "dez",
    "onze",
    "doze",
    "treze",
    "quatorze",
    "quinze",
    "dezesseis",
    "dezessete",
    "dezoito",
    "dezenove",
  ];
  const d = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const c = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const ext = (n0: number): string =>
    n0 < 20
      ? u[n0]
      : n0 < 100
      ? d[Math.floor(n0 / 10)] + (n0 % 10 ? " e " + u[n0 % 10] : "")
      : n0 === 100
      ? "cem"
      : c[Math.floor(n0 / 100)] + (n0 % 100 ? " e " + ext(n0 % 100) : "");
  const i = Math.floor(n);
  const ct = Math.round((n - i) * 100);
  return `${ext(i)} ${i === 1 ? "real" : "reais"}${ct ? ` e ${ext(ct)} ${ct === 1 ? "centavo" : "centavos"}` : ""}`;
}

function hasRegisteredButUnpaid(flow?: CommissionFlow[]) {
  if (!flow) return false;
  return flow.some(
    (f) =>
      (Number(f.percentual) || 0) > 0 &&
      !!f.data_pagamento_vendedor &&
      (Number(f.valor_pago_vendedor) || 0) === 0
  );
}

/* ============== Datas & projeções auxiliares ============== */
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function getThursdaysOfMonth(year: number, month: number): Date[] {
  const lastDay = endOfMonth(new Date(year, month, 1));
  const thursdays: Date[] = [];
  let d = new Date(year, month, 1);
  while (d.getDay() !== 4) d = new Date(year, month, d.getDate() + 1);
  while (d <= lastDay) {
    thursdays.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    d = new Date(year, month, d.getDate() + 7);
  }
  return thursdays;
}
function getWeeklyIntervalsByThursdays(
  year: number,
  month: number
): Array<{ start: Date; end: Date }> {
  const thursdays = getThursdaysOfMonth(year, month);
  const eom = endOfMonth(new Date(year, month, 1));
  if (thursdays.length === 0) {
    return [{ start: new Date(year, month, 1), end: eom }];
  }
  const intervals: Array<{ start: Date; end: Date }> = [];
  for (let i = 0; i < thursdays.length; i++) {
    const start = thursdays[i];
    const end =
      i < thursdays.length - 1
        ? new Date(
            thursdays[i + 1].getFullYear(),
            thursdays[i + 1].getMonth(),
            thursdays[i + 1].getDate() - 1
          )
        : eom;
    intervals.push({
      start: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
      end: new Date(end.getFullYear(), end.getMonth(), end.getDate()),
    });
  }
  return intervals;
}
function addMonths(dateISO?: string | null, months?: number | null): Date | null {
  if (!dateISO) return null;
  const d = new Date(dateISO + "T00:00:00");
  if (!isFinite(d.getTime())) return null;
  const m = Math.max(0, months || 0);
  return new Date(d.getFullYear(), d.getMonth() + m, d.getDate());
}

/* ========================= Página ========================= */
export default function ComissoesPage() {
  /* -------- Filtros -------- */
  const [vendedorId, setVendedorId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "a_pagar" | "pago" | "estorno">("all");
  const [segmento, setSegmento] = useState<string>("all");
  const [tabela, setTabela] = useState<string>("all");

  /* -------- Base -------- */
  const [users, setUsers] = useState<User[]>([]);
  const [usersSecure, setUsersSecure] = useState<UserSecure[]>([]);
  const [simTables, setSimTables] = useState<SimTable[]>([]);
  const [clientesMap, setClientesMap] = useState<Record<string, string>>({});

  /* -------- Dados -------- */
  const [rows, setRows] = useState<(Commission & { flow?: CommissionFlow[] })[]>([]);
  const [vendasSemCom, setVendasSemCom] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(false);

  /* -------- Permissões -------- */
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<"admin" | "vendedor">("vendedor");

  /* -------- Recibo -------- */
  const [reciboDate, setReciboDate] = useState<string>(toDateInput(new Date()));
  const [reciboImpostoPct, setReciboImpostoPct] = useState<string>("5");
  const [reciboVendorId, setReciboVendorId] = useState<string>("all");

  /* -------- UI auxiliares -------- */
  const [openRules, setOpenRules] = useState(false);
  const [openPay, setOpenPay] = useState(false);
  const [payCommissionId, setPayCommissionId] = useState<string | null>(null);
  const [payFlow, setPayFlow] = useState<CommissionFlow[]>([]);
  const [paySelected, setPaySelected] = useState<Record<string, boolean>>({});
  const [payDate, setPayDate] = useState<string>(toDateInput(new Date()));
  const [payValue, setPayValue] = useState<string>("");

  /* -------- Memos & Maps -------- */
  const usersById = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u])),
    [users]
  );
  const usersByAuth = useMemo(() => {
    const m: Record<string, User> = {};
    users.forEach((u) => {
      if (u.auth_user_id) m[u.auth_user_id] = u;
    });
    return m;
  }, [users]);

  const secureById = useMemo(
    () => Object.fromEntries(usersSecure.map((u) => [u.id, u])),
    [usersSecure]
  );

  const currentUserId = useMemo(() => {
    if (!authUserId) return null;
    return usersByAuth[authUserId]?.id ?? null;
  }, [authUserId, usersByAuth]);

  const isAdmin = userRole === "admin";

  const can = {
    viewVendasSem: isAdmin,
    viewComissoesPagas: true,
    managePayments: isAdmin,
    viewDetalhamento: true,
  };

  /* -------- Utilidades UI -------- */
  const impostoFrac = useMemo(() => {
    const n = parseFloat(String(reciboImpostoPct).replace(",", ".").trim()) / 100;
    return isFinite(n) && n >= 0 ? n : 0;
  }, [reciboImpostoPct]);

  const userLabel = (id?: string | null) => {
    if (!id) return "—";
    const u = usersById[id];
    return (u?.nome || u?.email || id || "").toString();
  };

  const canonUserId = (id?: string | null) => id || null;

  /* -------- Carregar bases -------- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: usersData } = await supabase.from("users").select("*").order("nome", { ascending: true });
        setUsers(usersData || []);

        const { data: simData } = await supabase.from("sim_tables").select("*").order("nome_tabela", { ascending: true });
        setSimTables(simData || []);

        const { data: secureData } = await supabase.from("users_secure").select("*");
        setUsersSecure(secureData || []);

        const { data: auth } = await supabase.auth.getUser();
        const u = auth?.user || null;
        setAuthUserId(u?.id ?? null);
        const metaRole =
          (u?.app_metadata as any)?.user_role ||
          (u?.user_metadata as any)?.user_role ||
          null;
        setUserRole(metaRole === "admin" ? "admin" : "vendedor");

        const { data: leads } = await supabase.from("leads").select("id, nome");
        const m: Record<string, string> = {};
        (leads || []).forEach((l: any) => {
          m[l.id] = l.nome;
        });
        setClientesMap(m);
      } catch (e) {
        console.warn("[loadBases] erro:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* -------- Buscar dados principal -------- */
  const fetchData = async () => {
    setLoading(true);
    try {
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

      let vendasExtras: Record<
        string,
        { clienteId?: string; numero_proposta?: string | null; cliente_nome?: string | null }
      > = {};
      if (comms && comms.length) {
        const { data: vendas } = await supabase
          .from("vendas")
          .select("id, numero_proposta, cliente_lead_id, lead_id")
          .in("id", comms.map((c: any) => c.venda_id));
        const cliIds = Array.from(
          new Set(
            (vendas || [])
              .map((v) => v.lead_id || v.cliente_lead_id)
              .filter(Boolean) as string[]
          )
        );
        let nomes: Record<string, string> = {};
        if (cliIds.length) {
          const { data: cli } = await supabase.from("leads").select("id, nome").in("id", cliIds);
          (cli || []).forEach((c: any) => {
            nomes[c.id] = c.nome || "";
          });
        }
        (vendas || []).forEach((v) => {
          const cid = v.lead_id || v.cliente_lead_id || undefined;
          vendasExtras[v.id] = {
            clienteId: cid,
            numero_proposta: v.numero_proposta || null,
            cliente_nome: cid ? nomes[cid] || null : null,
          };
        });
      }

      setRows(
        (comms || []).map((c: any) => ({
          ...(c as Commission),
          flow: flowBy[c.id] || [],
          cliente_nome: vendasExtras[c.venda_id]?.cliente_nome || null,
          numero_proposta: vendasExtras[c.venda_id]?.numero_proposta || null,
        }))
      );

      if (isAdmin) {
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
      } else {
        setVendasSemCom([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedorId, status, segmento, tabela, userRole]);

  /* -------- Derivações por papel -------- */
  const rowsVisible = useMemo(() => {
    if (isAdmin) return rows;
    if (!currentUserId) return [];
    return rows.filter((r) => (canonUserId(r.vendedor_id) || r.vendedor_id) === currentUserId);
  }, [rows, isAdmin, currentUserId]);

  const rowsAPagar = useMemo(() => rowsVisible.filter((r) => r.status === "a_pagar"), [rowsVisible]);

  const pagosFlat = useMemo(() => {
    const list: Array<{ flow: CommissionFlow; comm: Commission }> = [];
    rowsVisible.forEach((r) =>
      (r.flow || []).forEach((f) => {
        if ((f.valor_pago_vendedor ?? 0) > 0) list.push({ flow: f, comm: r });
      })
    );
    return list.sort((a, b) =>
      (b.flow.data_pagamento_vendedor || "") > (a.flow.data_pagamento_vendedor || "") ? 1 : -1
    );
  }, [rowsVisible]);

  /* ========================= GRÁFICOS (Relógio + Linhas) ========================= */
  type ProjSeries = { labels: string[]; previstoBruto: number[]; pagoBruto: number[] };

  const projectAnnualFlows = (rs: Array<Commission & { flow?: CommissionFlow[] }>): ProjSeries => {
    const now = new Date();
    const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 4 + i);
    const labels = years.map((y) => String(y));
    const previsto: number[] = Array(years.length).fill(0);
    const pagos: number[] = Array(years.length).fill(0);
    for (const r of rs) {
      const total = r.valor_total ?? (r.base_calculo ?? 0) * (r.percent_aplicado ?? 0);
      const flows = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);
      for (const f of flows) {
        const expectedDate = addMonths(r.data_venda, (f.mes || 1) - 1);
        // ✅ corrigido: usar apenas nullish para evitar mistura com ||
        const expectedVal = (f.valor_previsto ?? (total * (f.percentual ?? 0))) ?? 0;
        if (expectedDate) {
          const yi = years.indexOf(expectedDate.getFullYear());
          if (yi >= 0) previsto[yi] += expectedVal;
        }
        if (f.data_pagamento_vendedor) {
          const pd = new Date(f.data_pagamento_vendedor + "T00:00:00");
          const yi2 = years.indexOf(pd.getFullYear());
          if (yi2 >= 0) pagos[yi2] += f.valor_pago_vendedor ?? 0;
        }
      }
    }
    return { labels, previstoBruto: previsto, pagoBruto: pagos };
  };

  const projectMonthlyFlows = (rs: Array<Commission & { flow?: CommissionFlow[] }>): ProjSeries => {
    const now = new Date();
    const year = now.getFullYear();
    const months: string[] = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const previsto: number[] = Array(12).fill(0);
    const pagos: number[] = Array(12).fill(0);

    for (const r of rs) {
      const total = r.valor_total ?? (r.base_calculo ?? 0) * (r.percent_aplicado ?? 0);
      const flows = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);
      for (const f of flows) {
        const expectedDate = addMonths(r.data_venda, (f.mes || 1) - 1);
        const expectedVal = (f.valor_previsto ?? (total * (f.percentual ?? 0))) ?? 0;

        if (expectedDate && expectedDate.getFullYear() === year) {
          previsto[expectedDate.getMonth()] += expectedVal;
        }
        if (f.data_pagamento_vendedor) {
          const pd = new Date(f.data_pagamento_vendedor + "T00:00:00");
          if (pd.getFullYear() === year) {
            pagos[pd.getMonth()] += f.valor_pago_vendedor ?? 0;
          }
        }
      }
    }
    return { labels: months, previstoBruto: previsto, pagoBruto: pagos };
  };

  const projectWeeklyFlows = (
    rs: Array<Commission & { flow?: CommissionFlow[] }>
  ): ProjSeries & { intervals: Array<{ start: Date; end: Date }> } => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const intervals = getWeeklyIntervalsByThursdays(year, month);
    const labels: string[] = intervals.map(({ start, end }, i) => {
      const s = `${String(start.getDate()).padStart(2, "0")}/${String(start.getMonth() + 1).padStart(2, "0")}`;
      const e = `${String(end.getDate()).padStart(2, "0")}/${String(end.getMonth() + 1).padStart(2, "0")}`;
      return `S${i + 1} (${s}–${e})`;
    });
    const previsto: number[] = Array(intervals.length).fill(0);
    const pagos: number[] = Array(intervals.length).fill(0);

    for (const r of rs) {
      const total = r.valor_total ?? (r.base_calculo ?? 0) * (r.percent_aplicado ?? 0);
      const flows = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);
      for (const f of flows) {
        const expectedDate = addMonths(r.data_venda, (f.mes || 1) - 1);
        const expectedVal = (f.valor_previsto ?? (total * (f.percentual ?? 0))) ?? 0;

        if (expectedDate && expectedDate.getFullYear() === year && expectedDate.getMonth() === month) {
          const idx = intervals.findIndex(
            (iv) => expectedDate.getTime() >= iv.start.getTime() && expectedDate.getTime() <= iv.end.getTime()
          );
          if (idx >= 0) previsto[idx] += expectedVal;
        }
        if (f.data_pagamento_vendedor) {
          const pd = new Date(f.data_pagamento_vendedor + "T00:00:00");
          if (pd.getFullYear() === year && pd.getMonth() === month) {
            const idx2 = intervals.findIndex(
              (iv) => pd.getTime() >= iv.start.getTime() && pd.getTime() <= iv.end.getTime()
            );
            if (idx2 >= 0) pagos[idx2] += f.valor_pago_vendedor ?? 0;
          }
        }
      }
    }
    return { labels, previstoBruto: previsto, pagoBruto: pagos, intervals };
  };

  /* ========================= KPIs (gerais) ========================= */
  const nowD = new Date();
  const fiveYearsAgo = new Date(nowD.getFullYear() - 5, 0, 1);
  const startOfPrevYear = new Date(nowD.getFullYear() - 1, 0, 1);
  const endOfPrevYear = new Date(nowD.getFullYear() - 1, 11, 31);
  const startOfYear = new Date(nowD.getFullYear(), 0, 1);
  const startOfMonth = new Date(nowD.getFullYear(), nowD.getMonth(), 1);
  const endOfMonthD = endOfMonth(startOfMonth);

  function totalsPaidAndProjectedInRange(s: Date, e: Date) {
    let totalPrevistoBruto = 0;
    let totalPagoBruto = 0;
    for (const r of rowsVisible) {
      const total = r.valor_total ?? (r.base_calculo ?? 0) * (r.percent_aplicado ?? 0);
      const flows = (r.flow || []).filter((f) => (Number(f.percentual) || 0) > 0);
      for (const f of flows) {
        const expectedDate = addMonths(r.data_venda, (f.mes || 1) - 1);
        const previstoBruto = (f.valor_previsto ?? (total * (f.percentual ?? 0))) ?? 0;
        if (expectedDate && expectedDate.getTime() >= s.getTime() && expectedDate.getTime() <= e.getTime()) {
          totalPrevistoBruto += previstoBruto;
        }
        if (f.data_pagamento_vendedor) {
          const pd = new Date(f.data_pagamento_vendedor + "T00:00:00");
          if (pd.getTime() >= s.getTime() && pd.getTime() <= e.getTime()) {
            totalPagoBruto += f.valor_pago_vendedor ?? 0;
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

  const kpi5y = totalsPaidAndProjectedInRange(fiveYearsAgo, nowD);
  const kpiPrevY = totalsPaidAndProjectedInRange(startOfPrevYear, endOfPrevYear);
  const kpiYear = totalsPaidAndProjectedInRange(startOfYear, nowD);
  const kpiMonth = totalsPaidAndProjectedInRange(startOfMonth, endOfMonthD);

  /* ========================= Donut (relógio) ========================= */
  function Donut({
    paid,
    pending,
    label,
    size = 120,
  }: {
    paid: number;
    pending: number;
    label: string;
    size?: number;
  }) {
    const total = paid + pending;
    const pct = total > 0 ? (paid / total) * 100 : 0;
    const radius = size / 2 - 10;
    const circ = 2 * Math.PI * radius;
    const paidLen = (pct / 100) * circ;

    return (
      <div className="flex items-center gap-3">
        <svg width={size} height={size}>
          <g transform={`translate(${size / 2}, ${size / 2})`}>
            <circle r={radius} cx={0} cy={0} fill="none" stroke="#e5e7eb" strokeWidth={12} />
            <circle
              r={radius}
              cx={0}
              cy={0}
              fill="none"
              stroke="#1E293F"
              strokeWidth={12}
              strokeDasharray={`${paidLen} ${circ - paidLen}`}
              transform="rotate(-90)"
            />
            <text x={0} y={2} textAnchor="middle" className="fill-gray-700" fontSize={14} fontWeight={600}>
              {Math.round(pct)}%
            </text>
          </g>
        </svg>
        <div className="text-sm">
          <div className="text-xs text-gray-500">{label}</div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#1E293F]" />
            <span className="text-gray-700">
              Pago <b>{BRL(paid)}</b>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#A11C27]" />
            <span className="text-gray-700">
              A pagar <b>{BRL(pending)}</b>
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ========================= LineChart ========================= */
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
    const palette = ["#1E293F", "#A11C27", "#B5A573", "#1E40AF", "#047857"];
    const width = 760;
    const pad = { top: 12, right: 16, bottom: 28, left: 56 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;

    const maxY = useMemo(() => {
      const all = series.flatMap((s) => s.data);
      const m = Math.max(1, ...all);
      const pow = Math.pow(10, String(Math.floor(m)).length - 1);
      return Math.ceil(m / pow) * pow;
    }, [series]);

    const xStep = innerW / Math.max(1, labels.length - 1);
    const yScale = (v: number) => innerH - (v / maxY) * innerH;

    const pointsFor = (s: number[]) => s.map((v, i) => [pad.left + i * xStep, pad.top + yScale(v)] as const);

    const nearestPoint = (mx: number) => {
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
        <svg width={width} height={height} className="block" onMouseLeave={() => setHover(null)}>
          {/* grid + eixo Y */}
          <g>
            {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
              const y = pad.top + innerH * (1 - t);
              const val = maxY * t;
              return (
                <g key={i}>
                  <line x1={pad.left} x2={pad.left + innerW} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                  <text x={pad.left - 8} y={y + 4} fontSize="11" textAnchor="end" fill="#6b7280">
                    {formatY(val)}
                  </text>
                </g>
              );
            })}
            <line x1={pad.left} x2={pad.left + innerW} y1={pad.top + innerH} y2={pad.top + innerH} stroke="#e5e7eb" />
            {labels.map((lb, i) => {
              const x = pad.left + i * xStep;
              return (
                <text key={i} x={x} y={pad.top + innerH + 18} fontSize="11" textAnchor="middle" fill="#6b7280">
                  {lb}
                </text>
              );
            })}
          </g>

          {/* linhas */}
          {series.map((s, si) => {
            const pts = pointsFor(s.data);
            const d = pts.map(([x, y], i) => (i === 0 ? `M ${x},${y}` : `L ${x},${y}`)).join(" ");
            return (
              <g key={si}>
                <path d={d} fill="none" stroke={palette[si % palette.length]} strokeWidth={2} />
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
              setHover({ si: 0, pi });
            }}
          />

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

        {/* legenda */}
        <div className="mt-2 flex flex-wrap gap-3">
          {series.map((s, si) => (
            <div className="flex items-center gap-2 text-sm" key={si}>
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: ["#1E293F", "#A11C27"][si % 2] }}
              />
              <span className="text-gray-700">{s.name}</span>
            </div>
          ))}
        </div>

        {/* tooltip */}
        {hover && hovered && (
          <div
            className="pointer-events-none absolute rounded-md border bg-white px-3 py-2 text-xs shadow"
            style={{ left: Math.min(580, Math.max(8, 56 + hover.pi * xStep - 60)), top: 8 }}
          >
            <div className="mb-1 font-semibold text-gray-800">{hovered.label}</div>
            <div className="space-y-1">
              {hovered.items.map((v, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-gray-600">{series[i]?.name ?? `Série ${i + 1}`}</span>
                  <span className="tabular-nums ml-8">{formatY(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ========================= UI: Cabeçalho de Filtros ========================= */
  const ann = projectAnnualFlows(rowsVisible);
  const mon = projectMonthlyFlows(rowsVisible);
  const wk = projectWeeklyFlows(rowsVisible);

  /* ========================= Pagamento (dialog) ========================= */
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
    const valorTotal = c.valor_total ?? (c.base_calculo ?? 0) * (c.percent_aplicado ?? 0);
    const inserts = percentuais.map((p, idx) => ({
      commission_id: c.id,
      mes: idx + 1,
      percentual: p,
      valor_previsto: Math.round(valorTotal * p * 100) / 100,
      valor_recebido_admin: null,
      data_recebimento_admin: null,
      valor_pago_vendedor: 0,
      data_pagamento_vendedor: null,
      recibo_vendedor_url: null,
      comprovante_pagto_url: null,
    }));
    await supabase.from("commission_flow").insert(inserts as any[]);
    const { data: created } = await supabase
      .from("commission_flow")
      .select("*")
      .eq("commission_id", c.id)
      .order("mes", { ascending: true });
    return (created || []) as CommissionFlow[];
  }

  async function openPaymentFor(c: Commission) {
    if (!can.managePayments) return;
    setPayCommissionId(c.id);
    let { data } = await supabase
      .from("commission_flow")
      .select("*")
      .eq("commission_id", c.id)
      .order("mes", { ascending: true });
    if (!data || data.length === 0) data = await ensureFlowForCommission(c);
    const arr = (data || []).map((f: any) => ({
      ...f,
      _valor_previsto_calc: (c.valor_total ?? 0) * (f.percentual ?? 0),
    }));
    const uniq = new Map<number, CommissionFlow & { _valor_previsto_calc?: number }>();
    arr.forEach((f: any) => uniq.set(f.mes, f));
    const finalArr = Array.from(uniq.values());
    setPayFlow(finalArr);
    const pre = Object.fromEntries(
      finalArr
        .filter((f) => (Number(f.percentual) || 0) > 0 && (Number(f.valor_pago_vendedor) || 0) === 0)
        .map((f) => [f.id, true])
    );
    setPaySelected(pre);
    setPayDate(toDateInput(new Date()));
    setPayValue("");
    setOpenPay(true);
  }

  async function getSignedUrl(path?: string | null) {
    if (!path) return null;
    const { data, error } = await supabase.from("comissoes").createSignedUrl(path, 60 * 10);
    if (error) {
      console.warn("Signed URL error:", error.message);
      return null;
    }
    return (data as any)?.signedUrl || null;
  }

  async function uploadToBucket(file: File, commissionId: string) {
    const path = `${commissionId}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage.from("comissoes").upload(path, file, { upsert: false });
    if (error) {
      alert("Falha ao enviar arquivo: " + error.message);
      return null;
    }
    return data?.path || null;
  }

  async function paySelectedParcels(payload: {
    data_pagamento_vendedor?: string;
    valor_pago_vendedor?: number;
    recibo_file?: File | null;
    comprovante_file?: File | null;
  }) {
    if (!can.managePayments) return;
    if (!payCommissionId) return;

    let reciboPath: string | null = null,
      compPath: string | null = null;
    if (payload.recibo_file) reciboPath = await uploadToBucket(payload.recibo_file, payCommissionId);
    if (payload.comprovante_file) compPath = await uploadToBucket(payload.comprovante_file, payCommissionId);

    const candidates = payFlow.filter((f) => (Number(f.percentual) || 0) > 0);
    let selected = candidates.filter((f) => !!paySelected[f.id]);
    if (!selected.length && payload.data_pagamento_vendedor) {
      selected = candidates.filter((f) => (f.data_pagamento_vendedor || "") === payload.data_pagamento_vendedor);
    }
    if (!selected.length) {
      const unpaid = candidates.filter((f) => (Number(f.valor_pago_vendedor) || 0) === 0);
      if (unpaid.length === 1) selected = unpaid;
      else if (unpaid.length > 0) selected = [unpaid[0]];
    }
    if (!selected.length) {
      alert("Selecione pelo menos uma parcela.");
      return;
    }

    for (const f of selected) {
      await supabase
        .from("commission_flow")
        .update({
          data_pagamento_vendedor: payload.data_pagamento_vendedor || f.data_pagamento_vendedor || toDateInput(new Date()),
          valor_pago_vendedor: payload.valor_pago_vendedor !== undefined ? payload.valor_pago_vendedor : f.valor_pago_vendedor ?? 0,
          recibo_vendedor_url: (reciboPath || f.recibo_vendedor_url) ?? null,
          comprovante_pagto_url: (compPath || f.comprovante_pagto_url) ?? null,
        })
        .eq("id", f.id);
    }

    const { data: fresh } = await supabase
      .from("commission_flow")
      .select("*")
      .eq("commission_id", payCommissionId)
      .order("mes", { ascending: true });

    const relevant = (fresh || []).filter((f) => (Number(f.percentual) || 0) > 0);
    const isAllPaid = relevant.length > 0 && relevant.every((f) => (Number(f.valor_pago_vendedor) || 0) > 0);

    await supabase
      .from("commissions")
      .update({
        status: isAllPaid ? "pago" : "a_pagar",
        data_pagamento: isAllPaid ? payload.data_pagamento_vendedor || toDateInput(new Date()) : null,
      })
      .eq("id", payCommissionId);

    const uniq = new Map<number, CommissionFlow>();
    (fresh || []).forEach((f: any) => uniq.set(f.mes, f));
    const freshArr = Array.from(uniq.values()) as CommissionFlow[];
    setPayFlow(freshArr);
    setRows((prev) =>
      prev.map((r) => (r.id === payCommissionId ? { ...r, flow: freshArr, status: isAllPaid ? "pago" : "a_pagar" } : r))
    );
    setOpenPay(false);
    fetchData();
  }

  /* ========================= Numeração de Recibo (NNN-AAAA ininterrupto) ========================= */
  async function getNextReceiptNumber(): Promise<string> {
    const year = new Date(reciboDate || toDateInput(new Date())).getFullYear();
    try {
      const { data: row, error } = await supabase.from("receipt_counter").select("*").eq("id", "main").single();
      if (error && (error as any)?.code !== "PGRST116") {
        console.warn("[receipt_counter] select erro:", error.message);
      }
      let last = (row?.last_number as number) ?? 0;

      if (!row) {
        const { error: insErr } = await supabase.from("receipt_counter").insert([{ id: "main", last_number: 0 }]);
        if (insErr) console.warn("[receipt_counter] init erro:", insErr.message);
        last = 0;
      }

      const next = last + 1;
      const { error: updErr } = await supabase.from("receipt_counter").update({ last_number: next }).eq("id", "main");
      if (updErr) console.warn("[receipt_counter] update erro:", updErr.message);

      const padded = String(next).padStart(3, "0");
      return `${padded}-${year}`;
    } catch (e) {
      console.warn("[receipt_counter] erro genérico:", e);
      const local = Math.floor(Math.random() * 900) + 100;
      return `${local}-${year}`;
    }
  }

  async function downloadReceiptPDFPorData() {
    const dataRecibo = reciboDate;
    const impostoPct = parseFloat(String(reciboImpostoPct).replace(",", ".")) / 100 || 0;

    const { data: flows } = await supabase.from("commission_flow").select("*").eq("data_pagamento_vendedor", dataRecibo);

    if (!flows || !flows.length) {
      alert("Não há parcelas pagas na data selecionada.");
      return;
    }

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

    const commsFiltradas = (comms || []).filter((c: any) => (reciboVendorId === "all" ? true : c.vendedor_id === reciboVendorId));
    if (!commsFiltradas.length) {
      alert("Sem parcelas para o vendedor selecionado nessa data.");
      return;
    }

    const clienteIds = Array.from(
      new Set(
        (vendas || [])
          .map((v) => v.lead_id || v.cliente_lead_id)
          .filter(Boolean) as string[]
      )
    );
    const nomesCli: Record<string, string> = {};
    if (clienteIds.length) {
      const { data: cli } = await supabase.from("leads").select("id, nome").in("id", clienteIds);
      (cli || []).forEach((c: any) => {
        nomesCli[c.id] = c.nome || "";
      });
    }

    const vendedorUsado = reciboVendorId === "all" ? commsFiltradas[0].vendedor_id : reciboVendorId;
    const vendInfo = secureById[vendedorUsado] || ({} as any);

    const numeroRecibo = await getNextReceiptNumber();

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("RECIBO DE COMISSÃO", 297, 40, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Recibo Nº: ${numeroRecibo}`, 40, 60);
    doc.text(`Data: ${formatISODateBR(dataRecibo)}`, 40, 74);

    let y = 92;
    [
      "Nome do Pagador: Consulmax Serviços de Planejamento Estruturado e Proteção LTDA. CNPJ: 57.942.043/0001-03",
      "Endereço: Av. Menezes Filho, 3171, Casa Preta, Ji-Paraná/RO. CEP: 76907-532",
    ].forEach((l) => {
      doc.text(l, 40, y);
      y += 14;
    });

    const recebedor = [
      `Nome do Recebedor: ${userLabel(vendedorUsado)}`,
      `CPF/CNPJ: ${vendInfo?.cpf || "—"}`,
      `Endereço: ${[vendInfo?.logradouro, vendInfo?.numero, vendInfo?.bairro, vendInfo?.cidade && `${vendInfo.cidade}/${vendInfo.uf}`]
        .filter(Boolean)
        .join(", ") || "—"}`,
    ];
    y += 10;
    recebedor.forEach((l) => {
      doc.text(l, 40, y);
      y += 14;
    });
    y += 6;
    doc.text("Descrição: Pagamento referente às comissões abaixo relacionadas.", 40, y);
    y += 16;

    const head = [["CLIENTE", "PROPOSTA", "PARCELA", "R$ VENDA", "COM. BRUTA", "IMPOSTOS", "COM. LÍQUIDA"]];
    const body: any[] = [];
    let totalLiquido = 0;

    commsFiltradas.forEach((c: any) => {
      const v = (vendas || []).find((x) => x.id === c.venda_id);
      const clienteId = v?.lead_id || v?.cliente_lead_id || "";
      const clienteNome = clienteId ? nomesCli[clienteId] || "—" : "—";
      const vendaValor = v?.valor_venda || 0;
      const parcelas = Array.from(new Map((byCommission[c.id] || []).map((p) => [p.mes, p])).values());
      parcelas.forEach((p) => {
        const comBruta = (c.percent_aplicado || 0) * (p.percentual || 0) * vendaValor;
        const impostos = comBruta * impostoPct;
        const liquida = comBruta - impostos;
        totalLiquido += liquida;
        body.push([clienteNome, v?.numero_proposta || "—", `M${p.mes}`, BRL(vendaValor), BRL(comBruta), BRL(impostos), BRL(liquida)]);
      });
    });

    autoTable(doc, {
      startY: y,
      head,
      body,
      styles: { font: "helvetica", fontSize: 10 },
      headStyles: { fillColor: [30, 41, 63] },
    });
    const endY = (doc as any).lastAutoTable.finalY + 12;
    doc.setFont("helvetica", "bold");
    doc.text(
      `Valor total líquido da comissão: ${BRL(totalLiquido)} (${valorPorExtenso(totalLiquido)})`,
      40,
      endY
    );
    doc.setFont("helvetica", "normal");
    doc.text(`Forma de Pagamento: PIX`, 40, endY + 18);
    doc.text(`Chave PIX do pagamento: ${secureById[vendedorUsado]?.pix_key || "—"}`, 40, endY + 34);
    const signY = endY + 100;
    doc.line(40, signY, 320, signY);
    doc.text(`${userLabel(vendedorUsado)}`, 40, signY + 14);
    doc.text(`${secureById[vendedorUsado]?.cpf || "—"}`, 40, signY + 28);
    doc.save(`recibo_${numeroRecibo}_${userLabel(vendedorUsado)}.pdf`);
  }

  /* ========================= Render ========================= */
  return (
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
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome?.trim() || u.email?.trim() || u.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Segmento</Label>
            <Select value={segmento} onValueChange={setSegmento}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Array.from(new Set(simTables.map((t) => t.segmento)))
                  .filter(Boolean)
                  .map((seg) => (
                    <SelectItem key={seg} value={seg}>
                      {seg}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tabela</Label>
            <Select value={tabela} onValueChange={setTabela}>
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Array.from(new Set(simTables.map((t) => t.nome_tabela)))
                  .filter(Boolean)
                  .map((tab) => (
                    <SelectItem key={tab} value={tab}>
                      {tab}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="a_pagar">A pagar</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="estorno">Estorno</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-6 flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setOpenRules(true)}>
              <Settings className="w-4 h-4 mr-1" /> Regras de Comissão
            </Button>
            <Button onClick={fetchData}>
              <Loader2 className="w-4 h-4 mr-1" /> Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ======== SEÇÕES: Relógio + Linhas ======== */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle>Nos últimos 5 anos — {vendedorId === "all" ? "Todos" : userLabel(vendedorId)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Donut paid={kpi5y.pagoLiquido} pending={kpi5y.pendente} label="5 anos" />
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
        <CardHeader className="pb-1">
          <CardTitle>Ano anterior — {new Date().getFullYear() - 1}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Donut paid={kpiPrevY.pagoLiquido} pending={kpiPrevY.pendente} label="Ano anterior" />
          {(() => {
            const prevMon = projectMonthlyFlows(
              rowsVisible.filter(
                (r) => new Date(r.data_venda || "").getFullYear() === new Date().getFullYear() - 1
              )
            );
            return (
              <LineChart
                labels={prevMon.labels}
                series={[
                  { name: "Previsto", data: prevMon.previstoBruto },
                  { name: "Pago", data: prevMon.pagoBruto },
                ]}
              />
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle>Ano atual — {new Date().getFullYear()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Donut paid={kpiYear.pagoLiquido} pending={kpiYear.pendente} label="Ano" />
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
        <CardHeader className="pb-1">
          <CardTitle>Mês atual (semanas por quinta) — Previsto × Pago (bruto)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Donut paid={kpiMonth.pagoLiquido} pending={kpiMonth.pendente} label="Mês" />
          <LineChart
            labels={wk.labels}
            series={[
              { name: "Previsto", data: wk.previstoBruto },
              { name: "Pago", data: wk.pagoBruto },
            ]}
          />
        </CardContent>
      </Card>

      {/* ======== KPIs ======== */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle>💰 Vendas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {BRL(
              sum(
                rowsVisible.map((r) =>
                  typeof r.valor_venda === "number" ? r.valor_venda : r.base_calculo ?? 0
                )
              )
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle>🧾 Comissão Bruta (prevista)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {BRL(
              sum(
                rowsVisible.map(
                  (r) => r.valor_total ?? (r.base_calculo ?? 0) * (r.percent_aplicado ?? 0)
                )
              )
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle>✅ Comissão Líquida (prevista)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {BRL(
              (sum(
                rowsVisible.map(
                  (r) => r.valor_total ?? (r.base_calculo ?? 0) * (r.percent_aplicado ?? 0)
                )
              ) || 0) * (1 - impostoFrac)
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle>📤 Comissão Paga (Liq.)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {BRL(
              (sum(rowsVisible.flatMap((r) => (r.flow || []).map((f) => f.valor_pago_vendedor ?? 0))) || 0) *
                (1 - impostoFrac)
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle>⏳ Pendente (Liq.)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{BRL(kpiYear.pendente)}</CardContent>
        </Card>
      </div>

      {/* ======== Vendas sem comissão ======== */}
      {can.viewVendasSem && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <span>Vendas sem comissão (de acordo com filtros)</span>
              <div className="flex items-center gap-2" />
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2 text-left">Vendedor</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Nº Proposta</th>
                  <th className="p-2 text-left">Administradora</th>
                  <th className="p-2 text-left">Segmento</th>
                  <th className="p-2 text-left">Tabela</th>
                  <th className="p-2 text-right">Crédito</th>
                </tr>
              </thead>
              <tbody>
                {vendasSemCom.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-3 text-gray-500">
                      Sem pendências 🎉
                    </td>
                  </tr>
                )}
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ======== Detalhamento de Comissões (A Pagar) ======== */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>Detalhamento de Comissões (a pagar)</span>
            <div className="flex items-center gap-3">
              <div>
                <Label>Vendedor</Label>
                <Select value={vendedorId} onValueChange={setVendedorId}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome?.trim() || u.email?.trim() || u.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data do Recibo</Label>
                <Input type="date" value={reciboDate} onChange={(e) => setReciboDate(e.target.value)} />
              </div>
              <div>
                <Label>Imposto (%) Recibo</Label>
                <Input value={reciboImpostoPct} onChange={(e) => setReciboImpostoPct(e.target.value)} className="w-24" />
              </div>
              <Button onClick={downloadReceiptPDFPorData}>
                <DollarSign className="w-4 h-4 mr-1" />
                Recibo
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-[1200px] w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left">Data</th>
                <th className="p-2 text-left">Vendedor</th>
                <th className="p-2 text-left">Cliente</th>
                <th className="p-2 text-left">Nº Proposta</th>
                <th className="p-2 text-left">Segmento</th>
                <th className="p-2 text-left">Tabela</th>
                <th className="p-2 text-right">Crédito</th>
                <th className="p-2 text-right">% Comissão</th>
                <th className="p-2 text-right">Valor Comissão</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Pagamento</th>
                <th className="p-2 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={12} className="p-4">
                    <Loader2 className="animate-spin inline mr-2" /> Carregando...
                  </td>
                </tr>
              )}
              {!loading && rowsAPagar.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-4 text-gray-500">
                    Sem registros.
                  </td>
                </tr>
              )}
              {!loading &&
                rowsAPagar.map((r) => (
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
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openPaymentFor(r)}
                          disabled={!can.managePayments}
                        >
                          <DollarSign className="w-4 h-4 mr-1" />
                          {hasRegisteredButUnpaid(r.flow) ? "Confirmar Pagamento" : "Registrar pagamento"}
                        </Button>
                        <Button size="sm" variant="outline" disabled={!can.managePayments}>
                          <RotateCcw className="w-4 h-4 mr-1" /> Retornar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ======== Comissões Pagas ======== */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>Comissões pagas</span>
          </CardTitle>
        </CardHeader>
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
                <th className="p-2 text-left">Estorno</th>
              </tr>
            </thead>
            <tbody>
              {pagosFlat.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-gray-500">
                    Nenhum pagamento encontrado.
                  </td>
                </tr>
              )}
              {pagosFlat.map(({ flow, comm }) => (
                <tr key={flow.id} className="border-b">
                  <td className="p-2">
                    {flow.data_pagamento_vendedor ? formatISODateBR(flow.data_pagamento_vendedor) : "—"}
                  </td>
                  <td className="p-2">{userLabel(comm.vendedor_id)}</td>
                  <td className="p-2">{comm.cliente_nome || "—"}</td>
                  <td className="p-2">{comm.numero_proposta || "—"}</td>
                  <td className="p-2">M{flow.mes}</td>
                  <td className="p-2 text-right">{BRL(flow.valor_pago_vendedor)}</td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      {flow.recibo_vendedor_url && (
                        <a
                          className="underline text-blue-700"
                          href="#"
                          onClick={async (e) => {
                            e.preventDefault();
                            const u = await getSignedUrl(flow.recibo_vendedor_url);
                            if (u) window.open(u, "_blank");
                          }}
                        >
                          Recibo
                        </a>
                      )}
                      {flow.comprovante_pagto_url && (
                        <a
                          className="underline text-blue-700"
                          href="#"
                          onClick={async (e) => {
                            e.preventDefault();
                            const u = await getSignedUrl(flow.comprovante_pagto_url);
                            if (u) window.open(u, "_blank");
                          }}
                        >
                          Comprovante
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="p-2">
                    <Button size="sm" variant="outline" disabled={!can.managePayments}>
                      Estornar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ======== Diálogo de Pagamento ======== */}
      <Dialog open={openPay} onOpenChange={setOpenPay}>
        <DialogContent className="w-[98vw] max-w-[1400px]">
          <DialogHeader>
            <DialogTitle>Registrar pagamento ao vendedor</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="selecionar">
            <TabsList className="mb-3">
              <TabsTrigger value="selecionar">Selecionar parcelas</TabsTrigger>
              <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
            </TabsList>
            <TabsContent value="selecionar" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label>Data do pagamento</Label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>
                <div>
                  <Label>Valor pago ao vendedor (opcional)</Label>
                  <Input
                    placeholder="Ex.: 1.974,00"
                    value={payValue}
                    onChange={(e) => setPayValue(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() =>
                      paySelectedParcels({
                        data_pagamento_vendedor: payDate,
                        valor_pago_vendedor: payValue
                          ? parseFloat(payValue.replace(/\./g, "").replace(",", "."))
                          : undefined,
                        recibo_file: null,
                        comprovante_file: null,
                      })
                    }
                    disabled={!can.managePayments}
                  >
                    <Save className="w-4 h-4 mr-1" /> Salvar
                  </Button>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const pend = Object.fromEntries(
                        payFlow
                          .filter((f) => !f.data_pagamento_vendedor && (f.valor_pago_vendedor ?? 0) === 0)
                          .map((f) => [f.id, true])
                      );
                      setPaySelected(pend);
                    }}
                    disabled={!can.managePayments}
                  >
                    Selecionar tudo pendente
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[1300px] w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="p-2 text-left">Sel.</th>
                      <th className="p-2 text-left">Mês</th>
                      <th className="p-2 text-left">% Parcela</th>
                      <th className="p-2 text-right">Valor Previsto</th>
                      <th className="p-2 text-right">Valor Pago</th>
                      <th className="p-2 text-left">Data Pagto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payFlow.map((f) => {
                      const isLocked =
                        (f.valor_pago_vendedor ?? 0) > 0 ||
                        Boolean(f.recibo_vendedor_url) ||
                        Boolean(f.comprovante_pagto_url);
                      return (
                        <tr key={f.id} className={`border-b ${isLocked ? "opacity-60 pointer-events-none" : ""}`}>
                          <td className="p-2">
                            <Checkbox
                              checked={!!paySelected[f.id]}
                              onCheckedChange={(v) =>
                                setPaySelected((s) => ({
                                  ...s,
                                  [f.id]: !!v,
                                }))
                              }
                              disabled={!can.managePayments || isLocked}
                            />
                          </td>
                          <td className="p-2">M{f.mes}</td>
                          <td className="p-2">{pct100(f.percentual)}</td>
                          <td className="p-2 text-right">
                            {BRL((f as any)._valor_previsto_calc ?? f.valor_previsto ?? 0)}
                          </td>
                          <td className="p-2 text-right">{BRL(f.valor_pago_vendedor)}</td>
                          <td className="p-2">
                            {f.data_pagamento_vendedor ? formatISODateBR(f.data_pagamento_vendedor) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TabsContent>
            <TabsContent value="arquivos">
              <UploadArea onConfirm={paySelectedParcels} disabled={!can.managePayments} />
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button onClick={() => setOpenPay(false)} variant="secondary">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ========================= Upload Area ========================= */
function UploadArea({
  onConfirm,
  disabled,
}: {
  onConfirm: (payload: {
    data_pagamento_vendedor?: string;
    valor_pago_vendedor?: number;
    recibo_file?: File | null;
    comprovante_file?: File | null;
  }) => Promise<void>;
  disabled?: boolean;
}) {
  const [dataPg, setDataPg] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [valorPg, setValorPg] = useState<string>("");
  const [fileRecibo, setFileRecibo] = useState<File | null>(null);
  const [fileComp, setFileComp] = useState<File | null>(null);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Data do pagamento</Label>
          <Input type="date" value={dataPg} onChange={(e) => setDataPg(e.target.value)} disabled={disabled} />
        </div>
        <div>
          <Label>Valor pago ao vendedor (opcional)</Label>
          <Input
            placeholder="Ex.: 1.974,00"
            value={valorPg}
            onChange={(e) => setValorPg(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="flex items-end">
          <Button
            onClick={() =>
              onConfirm({
                data_pagamento_vendedor: dataPg,
                valor_pago_vendedor: valorPg ? parseFloat(valorPg.replace(/\./g, "").replace(",", ".")) : undefined,
                recibo_file: fileRecibo,
                comprovante_file: fileComp,
              })
            }
            disabled={disabled}
          >
            <Save className="w-4 h-4 mr-1" /> Confirmar pagamento
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Recibo assinado (PDF)</Label>
          <Input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFileRecibo(e.target.files?.[0] || null)}
            disabled={disabled}
          />
        </div>
        <div>
          <Label>Comprovante de pagamento (PDF/Imagem)</Label>
          <Input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFileComp(e.target.files?.[0] || null)}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="text-xs text-gray-500">
        Os arquivos são enviados ao bucket <code>comissoes</code>. Informe o valor <b>bruto</b>. Se nenhuma parcela
        estiver marcada, a confirmação faz seleção segura automática (1×100%).
      </div>
    </div>
  );
}
