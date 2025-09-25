// src/pages/Comissoes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, Download, Filter as FilterIcon, Settings, Save, DollarSign, Upload, FileText, PlusCircle,
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
};

type SimTable = { id: UUID; segmento: string; nome_tabela: string };

type Venda = {
  id: UUID;
  data_venda: string;          // YYYY-MM-DD ou TIMESTAMP
  vendedor_id: UUID;           // pode ser users.id ou users.auth_user_id
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
  percent_aplicado: number | null; // fração
  valor_total: number | null;
  status: "a_pagar" | "pago" | "estorno";
  data_pagamento: string | null;
  recibo_url: string | null;
  comprovante_url: string | null;
};

type CommissionFlow = {
  id: UUID;
  commission_id: UUID;
  mes: number;
  percentual: number; // fração
  valor_previsto: number | null;
  valor_recebido_admin: number | null;
  data_recebimento_admin: string | null;
  valor_pago_vendedor: number | null;
  data_pagamento_vendedor: string | null;
  recibo_vendedor_url: string | null;
  comprovante_pagto_url: string | null;
};

/** Linha agregada por mês (UI do pagamento) */
type PayRowAgg = {
  key: string;                // `${commission_id}::${mes}`
  mes: number;
  percentual: number;         // soma frações
  valor_previsto: number;     // soma
  valor_pago_vendedor: number; // soma
  data_pagamento_vendedor: string | null; // se todas iguais; senão null
  parts: Array<{
    id: string;
    percentual: number;
    valor_previsto: number;
    valor_pago_vendedor: number;
    data_pagamento_vendedor: string | null;
  }>;
};

/** Extensão para exibição na tabela de Detalhamento */
type CommissionRow = Commission & {
  flow?: CommissionFlow[];
  cliente_nome?: string | null;
  numero_proposta?: string | null;
};

/* ========================= Helpers & Constantes ========================= */
const TAX_PCT = 0.06; // % de impostos usado no recibo por data (ajuste se necessário)

const BRL = (v?: number | null) =>
  (typeof v === "number" ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct100 = (v?: number | null) =>
  `${(((typeof v === "number" ? v : 0) * 100)).toFixed(2).replace(".", ",")}%`;

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
const sum = (arr: (number | null | undefined)[]) => arr.reduce((a, b) => a + (b || 0), 0);

// DATE (YYYY-MM-DD) e TIMESTAMP sem deslocar fuso
const formatISODateBR = (iso?: string | null) => {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = d.getUTCFullYear();
  return `${dd}/${mm}/${yy}`;
};

/* ========================= Relógio radial ========================= */
function RadialClock({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex items-center gap-3 p-3 border rounded-xl">
      <svg width="120" height="120" className="-rotate-90">
        <circle cx="60" cy="60" r={radius} stroke="#e5e7eb" strokeWidth="10" fill="none" />
        <circle
          cx="60" cy="60" r={radius}
          stroke="#111827" strokeWidth="10" fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
        <text x="60" y="65" textAnchor="middle" fontSize="18" fill="#111827" className="rotate-90">
          {pct.toFixed(0)}%
        </text>
      </svg>
      <div>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="font-semibold">Progresso</div>
      </div>
    </div>
  );
}

/* ========================= Página ========================= */
export default function ComissoesPage() {
  /* ---------- Filtros ---------- */
  const [dtIni, setDtIni] = useState<string>(() => { const d = new Date(); d.setDate(1); return toDateInput(d); });
  const [dtFim, setDtFim] = useState<string>(() => toDateInput(new Date()));
  const [vendedorId, setVendedorId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "a_pagar" | "pago" | "estorno">("all");
  const [segmento, setSegmento] = useState<string>("all");
  const [tabela, setTabela] = useState<string>("all");

  /* ---------- Bases ---------- */
  const [users, setUsers] = useState<User[]>([]);
  const [simTables, setSimTables] = useState<SimTable[]>([]);
  const [clientesMap, setClientesMap] = useState<Record<string, string>>({}); // nome por id OU lead_id (usado na grade "sem comissão")

  // mapeia vendedor por users.id E por users.auth_user_id
  const usersById = useMemo(() => {
    const m: Record<string, User> = {};
    users.forEach((u) => (m[u.id] = u));
    return m;
  }, [users]);

  const usersByAuth = useMemo(() => {
    const m: Record<string, User> = {};
    users.forEach((u) => { if (u.auth_user_id) m[u.auth_user_id] = u; });
    return m;
  }, [users]);

  const userLabel = (maybeId: string | null | undefined) => {
    if (!maybeId) return "—";
    const u = usersById[maybeId] || usersByAuth[maybeId];
    return u?.nome?.trim() || u?.email?.trim() || maybeId;
  };

  /* ---------- Comissões / Vendas ---------- */
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [vendasSemCom, setVendasSemCom] = useState<Venda[]>([]);
  const [genBusy, setGenBusy] = useState<string | null>(null);

  /* ---------- Modais ---------- */
  const [openRules, setOpenRules] = useState<boolean>(false);
  const [openPay, setOpenPay] = useState<boolean>(false);

  /* ---------- Estado Regras ---------- */
  const [ruleVendorId, setRuleVendorId] = useState<string>("");
  const [ruleSimTableId, setRuleSimTableId] = useState<string>("");
  const [rulePercent, setRulePercent] = useState<string>("1,20");
  const [ruleMeses, setRuleMeses] = useState<number>(1);
  const [ruleFluxoPct, setRuleFluxoPct] = useState<string[]>(["100,00"]);
  const [ruleObs, setRuleObs] = useState<string>("");

  /* ---------- Estado Pagamento ---------- */
  const [payCommissionId, setPayCommissionId] = useState<string>("");
  const [payCommission, setPayCommission] = useState<Commission | null>(null);
  const [payRowsAgg, setPayRowsAgg] = useState<PayRowAgg[]>([]);
  const [paySelected, setPaySelected] = useState<Record<string, boolean>>({});
  const [payDate, setPayDate] = useState<string>(() => toDateInput(new Date()));

  /* ---------- Recibo por data ---------- */
  const [receiptDateAll, setReceiptDateAll] = useState<string>("");

  /* ---------- Load bases ---------- */
  useEffect(() => {
    (async () => {
      const [{ data: u }, { data: st }] = await Promise.all([
        supabase.from("users").select("id, auth_user_id, nome, email").order("nome", { ascending: true }),
        supabase.from("sim_tables").select("id, segmento, nome_tabela").order("segmento", { ascending: true }),
      ]);
      setUsers((u || []) as User[]);
      setSimTables((st || []) as SimTable[]);
    })();
  }, []);

  /* ========================= Fetch principal ========================= */
  async function fetchData() {
    setLoading(true);
    try {
      // commissions
      let qb = supabase
        .from("commissions")
        .select("*")
        .gte("data_venda", dtIni)
        .lte("data_venda", dtFim);
      if (status !== "all") qb = qb.eq("status", status);
      if (vendedorId !== "all") qb = qb.eq("vendedor_id", vendedorId);
      if (segmento !== "all") qb = qb.eq("segmento", segmento);
      if (tabela !== "all") qb = qb.eq("tabela", tabela);

      const { data: comms, error } = await qb.order("data_venda", { ascending: false });
      if (error) throw error;

      // flows
      const commissionIds = (comms || []).map((c) => c.id);
      const { data: flows } = await supabase
        .from("commission_flow")
        .select("*")
        .in("commission_id", commissionIds.length ? commissionIds : ["00000000-0000-0000-0000-000000000000"])
        .order("mes", { ascending: true });

      const flowByCommission: Record<string, CommissionFlow[]> = {};
      (flows || []).forEach((f) => {
        if (!flowByCommission[f.commission_id]) flowByCommission[f.commission_id] = [];
        flowByCommission[f.commission_id].push(f as CommissionFlow);
      });

      // vendas relacionadas às comissões (para cliente e nº proposta)
      const vendaIds = Array.from(new Set((comms || []).map((c) => c.venda_id).filter(Boolean)));
      let vendaById: Record<string, Venda> = {};
      let nomeClientePorChave: Record<string, string> = {};
      if (vendaIds.length) {
        const { data: vendasData } = await supabase
          .from("vendas")
          .select("id, valor_venda, lead_id, cliente_lead_id, numero_proposta")
          .in("id", vendaIds);

        vendaById = Object.fromEntries((vendasData || []).map((v: any) => [v.id, v as Venda]));

        const leadKeys = Array.from(new Set(
          (vendasData || []).flatMap(v => [v.lead_id, v.cliente_lead_id]).filter(Boolean) as string[]
        ));

        if (leadKeys.length) {
          const [cliById, cliByLead] = await Promise.all([
            supabase.from("clientes").select("id, nome").in("id", leadKeys),
            supabase.from("clientes").select("lead_id, nome").in("lead_id", leadKeys),
          ]);
          (cliById.data || []).forEach((c: any) => { nomeClientePorChave[c.id] = c.nome || ""; });
          (cliByLead.data || []).forEach((c: any) => { if (c.lead_id) nomeClientePorChave[c.lead_id] = c.nome || ""; });
        }
      }

      // monta rows com extras
      const rowsWithExtras: CommissionRow[] = (comms || []).map((c: any) => {
        const venda = vendaById[c.venda_id];
        const clienteNome =
          (venda?.lead_id && nomeClientePorChave[venda.lead_id]) ||
          (venda?.cliente_lead_id && nomeClientePorChave[venda.cliente_lead_id]) || null;
        return {
          ...(c as Commission),
          flow: flowByCommission[c.id] || [],
          cliente_nome: clienteNome,
          numero_proposta: venda?.numero_proposta || null,
        };
      });
      setRows(rowsWithExtras);

      // vendas no período (sem comissão)
      const { data: vendasPeriodo } = await supabase
        .from("vendas")
        .select("id, data_venda, vendedor_id, segmento, tabela, administradora, valor_venda, numero_proposta, cliente_lead_id, lead_id")
        .gte("data_venda", dtIni)
        .lte("data_venda", dtFim)
        .order("data_venda", { ascending: false });

      const { data: commVendaIds } = await supabase
        .from("commissions")
        .select("venda_id")
        .gte("data_venda", dtIni)
        .lte("data_venda", dtFim);

      const hasComm = new Set((commVendaIds || []).map((r: any) => r.venda_id));
      const vendasFiltered = (vendasPeriodo || []).filter((v) => !hasComm.has(v.id));
      const vendasFiltered2 = vendasFiltered.filter((v) =>
        (vendedorId === "all" || v.vendedor_id === vendedorId) &&
        (segmento === "all" || v.segmento === segmento) &&
        (tabela === "all" || (v.tabela || "") === tabela)
      );
      setVendasSemCom(vendasFiltered2 as Venda[]);

      // nomes de cliente para a grade "sem comissão"
      const ids = Array.from(
        new Set(
          (vendasFiltered2 || [])
            .map((v) => v.lead_id || v.cliente_lead_id)
            .filter((x): x is string => !!x)
        )
      );
      if (ids.length) {
        const [cliById2, cliByLead2] = await Promise.all([
          supabase.from("clientes").select("id, nome").in("id", ids),
          supabase.from("clientes").select("lead_id, nome").in("lead_id", ids),
        ]);
        const map: Record<string, string> = {};
        (cliById2.data || []).forEach((c: any) => { map[c.id] = c.nome || ""; });
        (cliByLead2.data || []).forEach((c: any) => { if (c.lead_id) map[c.lead_id] = c.nome || ""; });
        setClientesMap(map);
      } else {
        setClientesMap({});
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [dtIni, dtFim, vendedorId, status, segmento, tabela]);

  /* ========================= KPIs ========================= */
  const kpi = useMemo(() => {
    const vendasTotal = sum(rows.map((r) => r.valor_venda ?? r.base_calculo));
    const comBruta = sum(rows.map((r) => r.valor_total));
    const comPaga = sum(rows.filter((r) => r.status === "pago").map((r) => r.valor_total));
    const comPendente = comBruta - comPaga;
    const comLiquida = comBruta;
    return { vendasTotal, comBruta, comLiquida, comPaga, comPendente };
  }, [rows]);

  /* ========================= Dashboards ========================= */
  const vendedorAtual = useMemo(
    () => userLabel(vendedorId === "all" ? null : vendedorId),
    [usersById, usersByAuth, vendedorId]
  );

  const now = new Date();
  const yStart = new Date(now.getFullYear(), 0, 1);
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), 1);

  function isBetween(d?: string | null, start?: Date, end?: Date) {
    if (!d) return false;
    const x = new Date(d).getTime();
    return x >= (start?.getTime() || 0) && x <= (end?.getTime() || now.getTime());
  }

  function totalsInRange(start: Date, end: Date) {
    const sel = rows.filter((r) => isBetween(r.data_venda, start, end));
    const tot = sum(sel.map((r) => r.valor_total));
    const pago = sum(sel.filter((r) => r.status === "pago").map((r) => r.valor_total));
    const pend = tot - pago;
    const pct = tot > 0 ? (pago / tot) * 100 : 0;
    return { tot, pago, pend, pct };
  }

  const range5y = totalsInRange(fiveYearsAgo, now);
  const rangeY = totalsInRange(yStart, now);
  const rangeM = totalsInRange(mStart, now);

  /* ========================= Regras ========================= */
  function onChangeMeses(n: number) {
    setRuleMeses(n);
    const arr = [...ruleFluxoPct];
    if (n > arr.length) while (arr.length < n) arr.push("0,00");
    else arr.length = n;
    setRuleFluxoPct(arr);
  }
  const fluxoSomaPct = useMemo(
    () => ruleFluxoPct.reduce((a, b) => a + (parseFloat((b || "0").replace(",", ".")) || 0), 0),
    [ruleFluxoPct]
  );

  async function loadExistingRule(venId: string, stId: string) {
    if (!venId || !stId) return;
    const { data } = await supabase
      .from("commission_rules")
      .select("percent_padrao, fluxo_meses, fluxo_percentuais, obs")
      .eq("vendedor_id", venId)
      .eq("sim_table_id", stId)
      .limit(1);
    const r = data?.[0];
    if (r) {
      setRulePercent(((r.percent_padrao ?? 0) * 100).toFixed(2).replace(".", ","));
      setRuleMeses(r.fluxo_meses || 1);
      setRuleFluxoPct((r.fluxo_percentuais || []).map((x: number) => (x * 100).toFixed(2).replace(".", ",")));
      setRuleObs(r.obs || "");
    }
  }

  useEffect(() => {
    if (openRules && ruleVendorId && ruleSimTableId) {
      loadExistingRule(ruleVendorId, ruleSimTableId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRules, ruleVendorId, ruleSimTableId]);

  async function saveRule() {
    if (!ruleVendorId || !ruleSimTableId) return alert("Selecione vendedor e tabela.");

    const padraoPct = parseFloat((rulePercent || "0").replace(",", "."));
    const somaFluxoPct = fluxoSomaPct;
    const eps = 1e-6;
    if (Math.abs(somaFluxoPct - padraoPct) > eps) {
      return alert(`Soma do fluxo: ${somaFluxoPct.toFixed(2)}% (deve = ${padraoPct.toFixed(2)}%)`);
    }

    const percent_padrao_frac = padraoPct / 100;
    const fluxo_percentuais_frac = ruleFluxoPct.map((x) => (parseFloat((x || "0").replace(",", ".")) || 0) / 100);

    const { error } = await supabase.from("commission_rules").upsert({
      vendedor_id: ruleVendorId,
      sim_table_id: ruleSimTableId,
      percent_padrao: percent_padrao_frac,
      fluxo_meses: ruleMeses,
      fluxo_percentuais: fluxo_percentuais_frac,
      obs: ruleObs || null,
    }, { onConflict: "vendedor_id,sim_table_id" });

    if (error) return alert(error.message);
    setOpenRules(false);
  }

  /* ========================= Pagamento ========================= */
  function aggregateFlowsForUI(commissionId: string, flows: CommissionFlow[], commissionTotal: number): PayRowAgg[] {
    const byMes: Record<number, PayRowAgg> = {};
    flows.forEach(f => {
      const key = `${commissionId}::${f.mes}`;
      const previsto = (f.valor_previsto ?? commissionTotal * (f.percentual || 0)) || 0;
      const pago = f.valor_pago_vendedor || 0;
      if (!byMes[f.mes]) {
        byMes[f.mes] = {
          key,
          mes: f.mes,
          percentual: f.percentual || 0,
          valor_previsto: previsto,
          valor_pago_vendedor: pago,
          data_pagamento_vendedor: f.data_pagamento_vendedor || null,
          parts: [{
            id: f.id,
            percentual: f.percentual || 0,
            valor_previsto: previsto,
            valor_pago_vendedor: pago,
            data_pagamento_vendedor: f.data_pagamento_vendedor || null,
          }],
        };
      } else {
        const row = byMes[f.mes];
        row.percentual += (f.percentual || 0);
        row.valor_previsto += previsto;
        row.valor_pago_vendedor += pago;
        row.data_pagamento_vendedor =
          row.data_pagamento_vendedor === (f.data_pagamento_vendedor || null)
            ? row.data_pagamento_vendedor
            : null;
        row.parts.push({
          id: f.id,
          percentual: f.percentual || 0,
          valor_previsto: previsto,
          valor_pago_vendedor: pago,
          data_pagamento_vendedor: f.data_pagamento_vendedor || null,
        });
      }
    });
    return Object.values(byMes).sort((a, b) => a.mes - b.mes);
  }

  async function openPaymentFor(commission: Commission) {
    setPayCommissionId(commission.id);
    setPayCommission(commission);
    setPayDate(toDateInput(new Date()));
    const { data } = await supabase
      .from("commission_flow")
      .select("*")
      .eq("commission_id", commission.id)
      .order("mes", { ascending: true });

    const flows = (data || []) as CommissionFlow[];
    const agg = aggregateFlowsForUI(commission.id, flows, commission.valor_total || 0);
    setPayRowsAgg(agg);
    setPaySelected({});
    setOpenPay(true);
  }

  async function uploadToBucket(file: File): Promise<string | null> {
    const path = `${payCommissionId}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage.from("comissoes").upload(path, file, { upsert: false });
    if (error) { alert("Falha ao enviar arquivo: " + error.message); return null; }
    return data?.path || null;
  }

  async function paySelectedParcels(payload: {
    data_pagamento_vendedor?: string;
    valor_pago_vendedor?: number;
    recibo_file?: File | null;
    comprovante_file?: File | null;
  }) {
    const selectedKeys = Object.entries(paySelected).filter(([, v]) => v).map(([k]) => k);
    if (!selectedKeys.length) return alert("Selecione pelo menos uma parcela (mês).");

    let reciboPath: string | null = null;
    let compPath: string | null = null;
    if (payload.recibo_file) reciboPath = await uploadToBucket(payload.recibo_file);
    if (payload.comprovante_file) compPath = await uploadToBucket(payload.comprovante_file);

    const updates: Partial<CommissionFlow>[] = [];
    const dateToApply = payload.data_pagamento_vendedor || toDateInput(new Date());
    const sameValue = payload.valor_pago_vendedor;

    selectedKeys.forEach(k => {
      const row = payRowsAgg.find(r => r.key === k);
      if (!row) return;
      row.parts.forEach(p => {
        updates.push({
          id: p.id,
          data_pagamento_vendedor: dateToApply,
          valor_pago_vendedor: typeof sameValue === "number" ? sameValue : p.valor_previsto,
          recibo_vendedor_url: reciboPath || undefined,
          comprovante_pagto_url: compPath || undefined,
        } as any);
      });
    });

    const { error } = await supabase.from("commission_flow").upsert(updates);
    if (error) return alert(error.message);

    // Atualiza status da comissão se todas pagas
    const { data: updated } = await supabase
      .from("commission_flow")
      .select("*")
      .eq("commission_id", payCommissionId);
    const allPaid = (updated || []).every((f: any) => (f.valor_pago_vendedor ?? 0) > 0);
    if (allPaid) {
      await supabase
        .from("commissions")
        .update({ status: "pago", data_pagamento: toDateInput(new Date()) })
        .eq("id", payCommissionId);
    }

    setOpenPay(false);
    fetchData();
  }

  /* ========================= Gerar Comissão a partir da Venda ========================= */
  async function gerarComissaoDeVenda(venda: Venda) {
    try {
      setGenBusy(venda.id);

      // resolve vendedor -> users.id (id ou auth_user_id)
      const vendedorResolved =
        (usersById as any)[venda.vendedor_id]?.id ||
        (usersByAuth as any)[venda.vendedor_id]?.id ||
        null;
      if (!vendedorResolved) {
        alert("Não foi possível mapear o vendedor: verifique se o ID na venda corresponde a users.id ou users.auth_user_id.");
        return;
      }

      // sim_table_id pela tabela
      let simTableId: string | null = null;
      if (venda.tabela) {
        const { data: st, error: stErr } = await supabase
          .from("sim_tables")
          .select("id")
          .eq("nome_tabela", venda.tabela)
          .limit(1);
        if (stErr) { alert("Erro ao buscar SimTable: " + stErr.message); return; }
        simTableId = st?.[0]?.id ?? null;
      }

      // regra padrão (fração)
      let percent_aplicado: number | null = null;
      if (simTableId) {
        const { data: rule } = await supabase
          .from("commission_rules")
          .select("percent_padrao")
          .eq("vendedor_id", vendedorResolved)
          .eq("sim_table_id", simTableId)
          .limit(1);
        percent_aplicado = rule?.[0]?.percent_padrao ?? null;
      }

      const base = venda.valor_venda ?? 0;
      const insert = {
        venda_id: venda.id,
        vendedor_id: vendedorResolved,
        sim_table_id: simTableId,
        data_venda: venda.data_venda,
        segmento: venda.segmento,
        tabela: venda.tabela,
        administradora: venda.administradora,
        valor_venda: venda.valor_venda,
        base_calculo: base,
        percent_aplicado,
        valor_total: percent_aplicado ? Math.round(base * percent_aplicado * 100) / 100 : null,
        status: "a_pagar" as const,
      };

      const { error } = await supabase.from("commissions").insert(insert as any);
      if (error) {
        if (String(error.code) === "23503") alert("Não foi possível criar: verifique se o vendedor existe em 'users' e/ou se a SimTable está correta.");
        else if (String(error.message || "").toLowerCase().includes("row-level security")) alert("RLS bloqueou o INSERT. Garanta as policies de 'commissions' e 'commission_flow'.");
        else alert("Erro ao criar a comissão: " + error.message);
        return;
      }

      await fetchData();
    } finally {
      setGenBusy(null);
    }
  }

  /* ========================= CSV Export ========================= */
  function exportCSV() {
    const header = [
      "data_venda","vendedor","segmento","tabela","administradora",
      "valor_venda","percent_aplicado","valor_total","status","data_pagamento"
    ];
    const lines = rows.map(r => ([
      r.data_venda ?? "",
      userLabel(r.vendedor_id),
      JSON.stringify(r.segmento||""),
      JSON.stringify(r.tabela||""),
      JSON.stringify(r.administradora||""),
      (r.valor_venda ?? r.base_calculo ?? 0),
      (r.percent_aplicado ?? 0),
      (r.valor_total ?? 0),
      r.status,
      r.data_pagamento ?? ""
    ].join(",")));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comissoes_${dtIni}_${dtFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ========================= PDF Recibo (por comissão OU por data) ========================= */
  async function downloadReceiptPDF(comm: Commission, itens: CommissionFlow[]) {
    const vendedor = userLabel(comm.vendedor_id);
    const today = new Date();
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text("RECIBO DE COMISSÃO", 40, 40);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");

    const pagador = [
      "Nome do Pagador: Consulmax Serviços de Planejamento Estruturado e Proteção LTDA.",
      "CNPJ: 57.942.043/0001-03",
      "Endereço: Av. Menezes Filho, 3174, Casa Preta, Ji-Paraná/RO. CEP: 76907-532",
    ];
    const recebedor = [
      `Nome do Recebedor: ${vendedor}`,
      "CPF/CNPJ: —",
      "Endereço: —",
    ];
    const y1 = 65; pagador.forEach((l, i) => doc.text(l, 40, y1 + i * 14));
    const baseY = y1 + pagador.length * 14 + 10;
    recebedor.forEach((l, i) => doc.text(l, 40, baseY + i * 14));

    const tableStartY = baseY + recebedor.length * 14 + 20;
    const body = itens.map((it) => [
      comm.tabela || "—",
      it.mes,
      pct100(it.percentual),
      BRL(it.valor_previsto ?? (comm.valor_total || 0) * (it.percentual || 0)),
      it.data_pagamento_vendedor ? formatISODateBR(it.data_pagamento_vendedor) : "—",
    ]);

    autoTable(doc, {
      startY: tableStartY,
      head: [["TABELA", "MÊS", "% PARC.", "VALOR", "DATA PAGAMENTO"]],
      body,
      styles: { font: "helvetica", fontSize: 10 },
      headStyles: { fillColor: [30, 41, 63] },
    });

    const total = sum(itens.map((i) =>
      (i.valor_pago_vendedor != null ? i.valor_pago_vendedor : (comm.valor_total || 0) * (i.percentual || 0))
    ));
    const endY = (doc as any).lastAutoTable.finalY + 10;

    doc.setFont("helvetica", "bold");
    doc.text(`Valor líquido da comissão: ${BRL(total)}`, 40, endY + 12);

    doc.setFont("helvetica", "normal");
    doc.text(`Forma de pagamento: PIX`, 40, endY + 28);
    doc.text(`Data do pagamento: ${today.toLocaleDateString("pt-BR")}`, 40, endY + 44);

    const signY = endY + 110;
    doc.line(40, signY, 260, signY);
    doc.text(`${vendedor}`, 40, signY + 14);

    doc.setFontSize(9);
    doc.text("Consulmax Consórcios • consulmaxconsorcios.com.br", 40, 812);
    doc.save(`recibo_comissao_${vendedor}_${toDateInput(today)}.pdf`);
  }

  // Recibo consolidado por data
  async function downloadReceiptByDate(selectedDate: string) {
    if (!selectedDate) return alert("Informe a data do recibo.");
    const commIds = rows.map(r => r.id);
    if (!commIds.length) return alert("Não há comissões no filtro atual.");

    const { data: parcels } = await supabase
      .from("commission_flow")
      .select("*")
      .in("commission_id", commIds.length ? commIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("data_pagamento_vendedor", selectedDate)
      .order("commission_id", { ascending: true })
      .order("mes", { ascending: true });

    if (!parcels || parcels.length === 0) {
      alert("Não há parcelas com pagamento nessa data.");
      return;
    }

    const commById = new Map(rows.map(r => [r.id, r]));
    const vendaIds = Array.from(new Set(
      parcels.map(p => commById.get(p.commission_id)?.venda_id).filter(Boolean) as string[]
    ));

    const { data: vendasData } = await supabase
      .from("vendas")
      .select("id, valor_venda, lead_id, cliente_lead_id, numero_proposta")
      .in("id", vendaIds.length ? vendaIds : ["00000000-0000-0000-0000-000000000000"]);

    const leadKeys = Array.from(new Set(
      (vendasData || []).flatMap(v => [v.lead_id, v.cliente_lead_id]).filter(Boolean) as string[]
    ));

    const [cliById, cliByLead] = await Promise.all([
      supabase.from("clientes").select("id, nome").in("id", leadKeys),
      supabase.from("clientes").select("lead_id, nome").in("lead_id", leadKeys),
    ]);

    const nomeClientePorChave: Record<string, string> = {};
    (cliById.data || []).forEach((c: any) => { nomeClientePorChave[c.id] = c.nome || ""; });
    (cliByLead.data || []).forEach((c: any) => { if (c.lead_id) nomeClientePorChave[c.lead_id] = c.nome || ""; });

    const { data: allFlows } = await supabase
      .from("commission_flow")
      .select("commission_id, mes")
      .in("commission_id", Array.from(new Set(parcels.map(p => p.commission_id))));

    const totalMeses: Record<string, number> = {};
    (allFlows || []).forEach(f => {
      totalMeses[f.commission_id] = Math.max(totalMeses[f.commission_id] || 0, f.mes || 0);
    });

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text("RECIBO DE COMISSÃO — PAGAMENTOS NA DATA", 40, 40);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`Data selecionada: ${formatISODateBR(selectedDate)}`, 40, 58);

    const head = [["CLIENTE", "PARCELA", "R$ VENDA", "COMISSÃO BRUTA", "IMPOSTOS", "COMISSÃO LÍQUIDA"]];
    const body: any[] = [];
    let totalLiquido = 0;

    (parcels || []).forEach(p => {
      const comm = commById.get(p.commission_id)!;
      const venda = (vendasData || []).find(v => v.id === comm.venda_id);
      const clienteNome =
        (venda?.lead_id && nomeClientePorChave[venda.lead_id]) ||
        (venda?.cliente_lead_id && nomeClientePorChave[venda.cliente_lead_id]) || "—";

      const total = comm.valor_total || 0;
      const bruto = typeof p.valor_pago_vendedor === "number"
        ? p.valor_pago_vendedor
        : total * (p.percentual || 0);
      const impostos = bruto * TAX_PCT;
      const liquido = bruto - impostos;
      totalLiquido += liquido;

      body.push([
        clienteNome,
        `${p.mes}/${totalMeses[p.commission_id] || p.mes}`,
        BRL(venda?.valor_venda || 0),
        BRL(bruto),
        BRL(impostos),
        BRL(liquido),
      ]);
    });

    autoTable(doc, {
      startY: 80,
      head,
      body,
      styles: { font: "helvetica", fontSize: 10 },
      headStyles: { fillColor: [30, 41, 63] },
    });

    const endY = (doc as any).lastAutoTable.finalY + 14;
    doc.setFont("helvetica", "bold");
    doc.text(`Comissão Total Líquida: ${BRL(totalLiquido)}`, 40, endY);

    doc.save(`recibo_pagamentos_${selectedDate}.pdf`);
  }

  /* ========================= Render ========================= */
  return (
    <div className="p-4 space-y-4">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <FilterIcon className="w-5 h-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div><Label>De</Label><Input type="date" value={dtIni} onChange={(e) => setDtIni(e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={dtFim} onChange={(e) => setDtFim(e.target.value)} /></div>
          <div>
            <Label>Vendedor</Label>
            <Select value={vendedorId} onValueChange={setVendedorId}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
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
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Array.from(new Set(simTables.map((t) => t.segmento))).filter(Boolean).map((seg) =>
                  <SelectItem key={seg} value={seg}>{seg}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tabela</Label>
            <Select value={tabela} onValueChange={setTabela}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Array.from(new Set(simTables.map((t) => t.nome_tabela))).filter(Boolean).map((tab) =>
                  <SelectItem key={tab} value={tab}>{tab}</SelectItem>)}
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
            <Button variant="secondary" onClick={() => setOpenRules(true)}>
              <Settings className="w-4 h-4 mr-1" /> Regras de Comissão
            </Button>
            <Button onClick={fetchData}><Loader2 className="w-4 h-4 mr-1" /> Atualizar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Dashboards por recorte */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle>Nos últimos 5 anos — {vendedorAtual}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Metric title="Total" value={BRL(range5y.tot)} />
              <Metric title="Recebido" value={BRL(range5y.pago)} />
              <Metric title="A receber" value={BRL(range5y.pend)} />
            </div>
            <RadialClock value={range5y.pct} label="Recebido / Total (5 anos)" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle>No ano — {vendedorAtual}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Metric title="Total" value={BRL(rangeY.tot)} />
              <Metric title="Recebido" value={BRL(rangeY.pago)} />
              <Metric title="A receber" value={BRL(rangeY.pend)} />
            </div>
            <RadialClock value={rangeY.pct} label="Recebido / Total (ano)" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle>No mês — {vendedorAtual}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Metric title="Total" value={BRL(rangeM.tot)} />
              <Metric title="Recebido" value={BRL(rangeM.pago)} />
              <Metric title="A receber" value={BRL(rangeM.pend)} />
            </div>
            <RadialClock value={rangeM.pct} label="Recebido / Total (mês)" />
          </CardContent>
        </Card>
      </div>

      {/* Cards de Resumo gerais */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-1"><CardTitle>💰 Vendas no Período</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.vendasTotal)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle>🧾 Comissão Bruta</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comBruta)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle>✅ Comissão Líquida</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comLiquida)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle>📤 Comissão Paga</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comPaga)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle>⏳ Comissão Pendente</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comPendente)}</CardContent></Card>
      </div>

      {/* Tabela: Vendas sem comissão */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>Vendas sem comissão (período & filtros)</span>
            <Button variant="outline" onClick={exportCSV}>
              <Download className="w-4 h-4 mr-1" /> Exportar CSV
            </Button>
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
                <th className="p-2 text-left">Ação</th>
              </tr>
            </thead>
            <tbody>
              {vendasSemCom.length === 0 && (
                <tr><td colSpan={9} className="p-3 text-gray-500">Sem pendências 🎉</td></tr>
              )}
              {vendasSemCom.map(v => {
                const clienteKey = v.lead_id || v.cliente_lead_id || "";
                return (
                  <tr key={v.id} className="border-b">
                    <td className="p-2">{formatISODateBR(v.data_venda)}</td>
                    <td className="p-2">{userLabel(v.vendedor_id)}</td>
                    <td className="p-2">{(clienteKey && (clientesMap[clienteKey]?.trim())) || "—"}</td>
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
      </Card>

      {/* Tabela Detalhada de Comissões */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>Detalhamento de Comissões</span>
            <div className="flex gap-2 items-center">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Data do Recibo</Label>
                <Input type="date" value={receiptDateAll} onChange={(e) => setReceiptDateAll(e.target.value)} className="h-8 w-[160px]" />
                <Button variant="outline" size="sm" onClick={() => downloadReceiptByDate(receiptDateAll)}>
                  <FileText className="w-4 h-4 mr-1" /> Recibo (PDF) por data
                </Button>
              </div>
              <Button variant="outline" onClick={exportCSV}>
                <Download className="w-4 h-4 mr-1" /> Exportar CSV
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
                <tr><td colSpan={12} className="p-4">
                  <Loader2 className="animate-spin inline mr-2" /> Carregando...
                </td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={12} className="p-4 text-gray-500">Sem registros.</td></tr>
              )}
              {!loading && rows.map((r) => (
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
                        <DollarSign className="w-4 h-4 mr-1" /> Registrar pagamento
                      </Button>
                      <Button size="sm" variant="outline" onClick={async () => {
                        const { data } = await supabase
                          .from("commission_flow")
                          .select("*")
                          .eq("commission_id", r.id)
                          .order("mes", { ascending: true });
                        await downloadReceiptPDF(r, (data || []) as CommissionFlow[]);
                      }}>
                        <FileText className="w-4 h-4 mr-1" /> Recibo (PDF)
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Sheet: Regras de Comissão */}
      <Sheet open={openRules} onOpenChange={setOpenRules}>
        <SheetContent side="right" className="w-[520px]">
          <SheetHeader><SheetTitle>Regras de Comissão</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Vendedor</Label>
              <Select value={ruleVendorId} onValueChange={setRuleVendorId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome?.trim() || u.email?.trim() || u.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tabela (SimTables)</Label>
              <Select value={ruleSimTableId} onValueChange={setRuleSimTableId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {simTables.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.segmento} — {t.nome_tabela}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>% Padrão (ex.: 1,20 = 1,20%)</Label>
              <Input value={rulePercent} onChange={(e) => setRulePercent(e.target.value)} placeholder="1,20" />
            </div>

            <div>
              <Label>Nº de meses do fluxo</Label>
              <Input
                type="number" min={1} max={36}
                value={ruleMeses}
                onChange={(e) => onChangeMeses(parseInt(e.target.value || "1"))}
              />
            </div>

            <div className="space-y-2">
              <Label>Fluxo do pagamento — percentuais (M1..Mn)</Label>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: ruleMeses }).map((_, i) => (
                  <Input
                    key={i}
                    value={ruleFluxoPct[i] || "0,00"}
                    onChange={(e) => {
                      const arr = [...ruleFluxoPct];
                      arr[i] = e.target.value;
                      setRuleFluxoPct(arr);
                    }}
                    placeholder={`Ex.: 0,75`}
                  />
                ))}
              </div>
              <div className="text-xs text-gray-600">
                Soma do fluxo: <b>{fluxoSomaPct.toFixed(2)}%</b> (deve = {parseFloat((rulePercent || "0").replace(",", "."))?.toFixed(2)}%)
              </div>
            </div>

            <div>
              <Label>Observações</Label>
              <Input value={ruleObs} onChange={(e) => setRuleObs(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <SheetFooter className="mt-4">
            <Button onClick={saveRule}><Save className="w-4 h-4 mr-1" /> Salvar Regra</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Dialog: Registrar Pagamento */}
      <Dialog open={openPay} onOpenChange={setOpenPay}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Registrar pagamento ao vendedor</DialogTitle></DialogHeader>
          <Tabs defaultValue="selecionar">
            <TabsList className="mb-3">
              <TabsTrigger value="selecionar">Selecionar parcelas</TabsTrigger>
              <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
            </TabsList>

            <TabsContent value="selecionar" className="space-y-3">
              <div className="flex items-end gap-3">
                <div>
                  <Label>Data do pagamento</Label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-[180px]" />
                </div>
                <Button onClick={() => paySelectedParcels({ data_pagamento_vendedor: payDate })}>
                  <Save className="w-4 h-4 mr-1" /> Salvar
                </Button>
              </div>

              {payCommission && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-2 rounded border">
                    <div className="text-gray-500 text-xs">Comissão total</div>
                    <div className="font-semibold">{BRL(payCommission.valor_total)}</div>
                  </div>
                  <div className="p-2 rounded border">
                    <div className="text-gray-500 text-xs">% padrão</div>
                    <div className="font-semibold">{pct100(payCommission.percent_aplicado)}</div>
                  </div>
                  <div className="p-2 rounded border">
                    <div className="text-gray-500 text-xs">Total previsto (fluxo)</div>
                    <div className="font-semibold">
                      {BRL(sum(payRowsAgg.map(r => r.valor_previsto)))}
                    </div>
                  </div>
                  <div className="p-2 rounded border">
                    <div className="text-gray-500 text-xs">Já pago</div>
                    <div className="font-semibold">
                      {BRL(sum(payRowsAgg.map(r => r.valor_pago_vendedor)))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPaySelected(Object.fromEntries(payRowsAgg
                      .filter(f => !f.valor_pago_vendedor)
                      .map(f => [f.key, true])
                    ))
                  }
                >
                  Selecionar tudo pendente
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[800px] w-full text-sm">
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
                    {payRowsAgg.map((f) => (
                      <tr key={f.key} className="border-b">
                        <td className="p-2">
                          <Checkbox
                            checked={!!paySelected[f.key]}
                            onCheckedChange={(v) => setPaySelected((s) => ({ ...s, [f.key]: !!v }))}
                          />
                        </td>
                        <td className="p-2">M{f.mes}</td>
                        <td className="p-2">{pct100(f.percentual)}</td>
                        <td className="p-2 text-right">{BRL(f.valor_previsto)}</td>
                        <td className="p-2 text-right">{BRL(f.valor_pago_vendedor)}</td>
                        <td className="p-2">
                          {f.data_pagamento_vendedor ? formatISODateBR(f.data_pagamento_vendedor) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="arquivos">
              <UploadArea onConfirm={(payload) => paySelectedParcels({
                ...payload,
                data_pagamento_vendedor: payDate || payload.data_pagamento_vendedor,
              })} />
            </TabsContent>
          </Tabs>
          <DialogFooter><Button onClick={() => setOpenPay(false)} variant="secondary">Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ========================= Subcomponentes ========================= */
function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="p-3 rounded-xl border bg-white">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
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
            recibo_file: fileRecibo,
            comprovante_file: fileComp,
          })}><Save className="w-4 h-4 mr-1" /> Confirmar pagamento</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><Label>Recibo assinado (PDF)</Label><Input type="file" accept="application/pdf" onChange={(e) => setFileRecibo(e.target.files?.[0] || null)} /></div>
        <div><Label>Comprovante de pagamento (PDF/Imagem)</Label><Input type="file" accept="application/pdf,image/*" onChange={(e) => setFileComp(e.target.files?.[0] || null)} /></div>
      </div>
      <div className="text-xs text-gray-500">Arquivos vão para o bucket <code>comissoes</code>.</div>
    </div>
  );
}
