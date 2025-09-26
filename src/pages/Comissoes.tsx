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
  Loader2, Download, Filter as FilterIcon, Settings, Save, DollarSign, Upload, FileText, PlusCircle, RotateCcw,
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
  pix_key?: string | null;
  cpf_encrypted?: any;
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

/* ========================= Helpers ========================= */
const BRL = (v?: number | null) =>
  (typeof v === "number" ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct100 = (v?: number | null) =>
  `${(((typeof v === "number" ? v : 0) * 100)).toFixed(2).replace(".", ",")}%`;

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
const sum = (arr: (number | null | undefined)[]) => arr.reduce((a, b) => a + (b || 0), 0);

const formatISODateBR = (isoDate?: string | null) => {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
};

function numberToPTBR(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
  const [clientesMap, setClientesMap] = useState<Record<string, string>>({});
  const [basesLoaded, setBasesLoaded] = useState(false);

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
  const [rows, setRows] = useState<(Commission & { flow?: CommissionFlow[], clienteNome?: string, numero_proposta?: string })[]>([]);
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
  const [payFlow, setPayFlow] = useState<CommissionFlow[]>([]);
  const [paySelected, setPaySelected] = useState<Record<string, boolean>>({});
  const [payDataPg, setPayDataPg] = useState<string>(toDateInput(new Date()));
  const [payValorPg, setPayValorPg] = useState<string>("");
  const [payReciboFile, setPayReciboFile] = useState<File | null>(null);
  const [payCompFile, setPayCompFile] = useState<File | null>(null);
  const [payImpostoPct, setPayImpostoPct] = useState<number>(0);

  /* ---------- Recibo (detalhamento) ---------- */
  const [reciboDate, setReciboDate] = useState<string>(toDateInput(new Date()));
  const [reciboImpostoPct, setReciboImpostoPct] = useState<number>(6);
  const [reciboVendedorId, setReciboVendedorId] = useState<string>("all");

  /* ---------- Load bases ---------- */
  useEffect(() => {
    (async () => {
      const [{ data: u }, { data: st }] = await Promise.all([
        supabase
          .from("users")
          .select("id, auth_user_id, nome, email, phone, cep, logradouro, numero, pix_key, cpf_encrypted")
          .order("nome", { ascending: true }),
        supabase
          .from("sim_tables")
          .select("id, segmento, nome_tabela")
          .order("segmento", { ascending: true }),
      ]);
      setUsers((u || []) as User[]);
      setSimTables((st || []) as SimTable[]);
      setBasesLoaded(true);
    })();
  }, []);

  /* ========================= Fetch principal ========================= */
  async function fetchData() {
    if (!basesLoaded) return;
    setLoading(true);
    try {
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

      const commissionIds = (comms || []).map((c: any) => c.id);
      const { data: flows } = await supabase
        .from("commission_flow")
        .select("*")
        .in("commission_id", commissionIds.length ? commissionIds : ["00000000-0000-0000-0000-000000000000"])
        .order("mes", { ascending: true });

      const flowByCommission: Record<string, CommissionFlow[]> = {};
      (flows || []).forEach((f) => {
        if (!f) return;
        if (!flowByCommission[f.commission_id]) flowByCommission[f.commission_id] = [];
        const already = flowByCommission[f.commission_id].find((x) => x.id === f.id);
        if (!already) flowByCommission[f.commission_id].push(f as CommissionFlow);
      });

      // detalhes cliente / proposta
      const vendaIds = Array.from(new Set((comms || []).map((c: any) => c.venda_id).filter(Boolean)));
      const vendasMap: Record<string, Partial<Venda>> = {};
      if (vendaIds.length) {
        const { data: vendasRel } = await supabase
          .from("vendas")
          .select("id, lead_id, cliente_lead_id, numero_proposta, valor_venda, data_venda")
          .in("id", vendaIds);
        (vendasRel || []).forEach((v: any) => { vendasMap[v.id] = v; });
        const clientIds = Array.from(new Set((vendasRel || []).map((v: any) => v.lead_id || v.cliente_lead_id).filter(Boolean)));
        if (clientIds.length) {
          const { data: cli } = await supabase.from("clientes").select("id, nome").in("id", clientIds);
          const map: Record<string, string> = {};
          (cli || []).forEach((c: any) => (map[c.id] = c.nome || ""));
          setClientesMap(map);
        }
      }

      setRows((comms || []).map((c: any) => {
        const flow = flowByCommission[c.id] || [];
        const venda = vendasMap[c.venda_id] || {};
        const clienteId = (venda as any).lead_id || (venda as any).cliente_lead_id || "";
        return { ...(c as Commission), flow, clienteNome: clienteId ? (clientesMap[clienteId] || "") : undefined, numero_proposta: (venda as any).numero_proposta };
      }));

      // vendas sem comissão
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

      const clientIds = Array.from(
        new Set(
          (vendasFiltered2 || [])
            .map((v) => v.lead_id || v.cliente_lead_id)
            .filter((x): x is string => !!x)
        )
      );
      if (clientIds.length) {
        const { data: cli } = await supabase
          .from("clientes")
          .select("id, nome")
          .in("id", clientIds);
        const map: Record<string, string> = {};
        (cli || []).forEach((c: any) => (map[c.id] = c.nome || ""));
        setClientesMap((prev) => ({ ...prev, ...map }));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [dtIni, dtFim, vendedorId, status, segmento, tabela, basesLoaded]);

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

  useEffect(() => {
    (async () => {
      if (!openRules) return;
      if (!ruleVendorId || !ruleSimTableId) return;
      const { data } = await supabase
        .from("commission_rules")
        .select("*")
        .eq("vendedor_id", ruleVendorId)
        .eq("sim_table_id", ruleSimTableId)
        .limit(1);
      const rule = data?.[0];
      if (rule) {
        setRulePercent(String((rule.percent_padrao ?? 0) * 100).replace(".", ","));
        setRuleMeses(rule.fluxo_meses ?? 1);
        setRuleFluxoPct((rule.fluxo_percentuais || []).map((p: number) => String((p * 100).toFixed(2)).replace(".", ",")));
        setRuleObs(rule.obs || "");
      }
    })();
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
  async function openPaymentFor(commission: Commission) {
    setPayCommissionId(commission.id);
    const { data } = await supabase
      .from("commission_flow")
      .select("*")
      .eq("commission_id", commission.id)
      .order("mes", { ascending: true });

    const unique: CommissionFlow[] = [];
    const seen = new Set<string>();
    (data || []).forEach((f: any) => {
      const key = `${f.id}_${f.mes}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(f as CommissionFlow);
      }
    });

    setPayFlow(unique);
    setPaySelected({});
    setPayDataPg(toDateInput(new Date()));
    setPayValorPg("");
    setPayReciboFile(null);
    setPayCompFile(null);
    setOpenPay(true);
  }

  async function uploadToBucket(file: File, commissionId: string): Promise<string | null> {
    const path = `${commissionId}/${Date.now()}-${file.name}`;
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
    const updates: { id: string; fields: Partial<CommissionFlow> }[] = [];
    let reciboPath: string | null = null;
    let compPath: string | null = null;
    if (payload.recibo_file) reciboPath = await uploadToBucket(payload.recibo_file, payCommissionId);
    if (payload.comprovante_file) compPath = await uploadToBucket(payload.comprovante_file, payCommissionId);

    payFlow.forEach((f) => {
      if (paySelected[f.id]) {
        updates.push({
          id: f.id,
          fields: {
            data_pagamento_vendedor: payload.data_pagamento_vendedor || toDateInput(new Date()),
            valor_pago_vendedor: payload.valor_pago_vendedor ?? f.valor_previsto ?? 0,
            recibo_vendedor_url: reciboPath || f.recibo_vendedor_url,
            comprovante_pagto_url: compPath || f.comprovante_pagto_url,
          },
        });
      }
    });

    if (!updates.length) return alert("Selecione pelo menos uma parcela.");

    const promises = updates.map(u =>
      supabase.from("commission_flow").update(u.fields).eq("id", u.id)
    );
    const results = await Promise.all(promises);
    const error = results.find((r: any) => r.error)?.error;
    if (error) {
      alert("Erro ao registrar pagamento: " + error.message);
      return;
    }

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

  /* ========================= Retornar venda p/ 'Vendas sem comissão' ========================= */
  async function revertCommissionToSales(c: Commission) {
    const ok = confirm("Deseja realmente retornar esta venda para 'Vendas sem comissão'? Isso apagará os lançamentos de fluxo desta comissão.");
    if (!ok) return;
    try {
      // apaga flows primeiro
      const delFlows = await supabase.from("commission_flow").delete().eq("commission_id", c.id);
      if (delFlows.error) throw delFlows.error;
      // apaga a comissão
      const delComm = await supabase.from("commissions").delete().eq("id", c.id);
      if (delComm.error) throw delComm.error;
      await fetchData();
      alert("Venda retornada para 'Vendas sem comissão'.");
    } catch (err: any) {
      alert("Erro ao retornar a venda: " + (err?.message || JSON.stringify(err)));
    }
  }

  /* ========================= Gerar Comissão a partir da Venda ========================= */
  async function gerarComissaoDeVenda(venda: Venda) {
    try {
      setGenBusy(venda.id);

      let simTableId: string | null = null;
      if (venda.tabela) {
        const { data: st } = await supabase
          .from("sim_tables")
          .select("id")
          .eq("nome_tabela", venda.tabela)
          .limit(1);
        simTableId = st?.[0]?.id ?? null;
      }

      let percent_aplicado: number | null = null;
      if (simTableId) {
        const { data: rule } = await supabase
          .from("commission_rules")
          .select("percent_padrao")
          .eq("vendedor_id", venda.vendedor_id)
          .eq("sim_table_id", simTableId)
          .limit(1);
        percent_aplicado = rule?.[0]?.percent_padrao ?? null;
      }

      const insert = {
        venda_id: venda.id,
        vendedor_id: venda.vendedor_id,
        sim_table_id: simTableId,
        data_venda: venda.data_venda,
        segmento: venda.segmento,
        tabela: venda.tabela,
        administradora: venda.administradora,
        valor_venda: venda.valor_venda,
        base_calculo: venda.valor_venda,
        percent_aplicado,
        valor_total:
          percent_aplicado && venda.valor_venda
            ? Math.round(venda.valor_venda * percent_aplicado * 100) / 100
            : null,
        status: "a_pagar" as const,
      };

      const { error } = await supabase.from("commissions").insert(insert as any);
      if (error) {
        if (String(error.code) === "23503") {
          alert("Não foi possível criar: verifique se o vendedor existe em 'users' e/ou se a SimTable está correta.");
        } else if (String(error.message || "").includes("row-level security")) {
          alert("RLS bloqueou o INSERT. Garanta as policies de 'commissions' e 'commission_flow'.");
        } else {
          alert("Erro ao criar a comissão: " + error.message);
        }
        return;
      }

      await fetchData();
    } finally {
      setGenBusy(null);
    }
  }

  /* ========================= CSV Export (somente Vendas sem comissão) ========================= */
  function exportCSV() {
    const header = [
      "data_venda","vendedor","cliente","numero_proposta","segmento","tabela","administradora",
      "valor_venda","percent_aplicado","valor_total","status","data_pagamento"
    ];
    const lines = rows.map(r => ([
      r.data_venda ?? "",
      userLabel(r.vendedor_id),
      r.clienteNome || "",
      r.numero_proposta || "",
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

  /* ========================= PDF Recibo por data & vendedor ========================= */
  async function downloadReceiptPDFForDateAndVendor() {
    if (!reciboDate) return alert("Selecione a data do recibo.");
    if (!reciboVendedorId || reciboVendedorId === "all") return alert("Selecione o vendedor para gerar o recibo.");

    const { data: flows } = await supabase
      .from("commission_flow")
      .select("*")
      .eq("data_pagamento_vendedor", reciboDate);

    if (!flows || flows.length === 0) {
      return alert("Nenhuma parcela encontrada com essa data.");
    }

    const commissionIds = Array.from(new Set((flows || []).map((f: any) => f.commission_id).filter(Boolean)));
    const { data: comms } = await supabase
      .from("commissions")
      .select("*")
      .in("id", commissionIds);

    const commsFiltered = (comms || []).filter((c: any) => c.vendedor_id === reciboVendedorId);
    if (commsFiltered.length === 0) return alert("Nenhuma comissão encontrada para esse vendedor na data selecionada.");

    const vendasIds = Array.from(new Set(commsFiltered.map((c: any) => c.venda_id).filter(Boolean)));
    const { data: vendas } = await supabase
      .from("vendas")
      .select("id, lead_id, cliente_lead_id, numero_proposta, valor_venda")
      .in("id", vendasIds);

    const clientIds = Array.from(new Set((vendas || []).map((v: any) => v.lead_id || v.cliente_lead_id).filter(Boolean)));
    let clientesById: Record<string, string> = {};
    if (clientIds.length) {
      const { data: cli } = await supabase.from("clientes").select("id, nome").in("id", clientIds);
      (cli || []).forEach((c: any) => clientesById[c.id] = c.nome || "");
    }

    const flowsByCommission: Record<string, any[]> = {};
    (flows || []).forEach((f: any) => {
      if (!flowsByCommission[f.commission_id]) flowsByCommission[f.commission_id] = [];
      flowsByCommission[f.commission_id].push(f);
    });

    const items: {
      cliente: string;
      proposta: string;
      parcelaText: string;
      valor_venda: number;
      com_bruta: number;
      impostos: number;
      com_liquida: number;
    }[] = [];

    let totalLiquido = 0;
    for (const c of commsFiltered) {
      const commFlows = flowsByCommission[c.id] || [];
      for (const f of commFlows) {
        const valorBruto = (f.valor_pago_vendedor ?? f.valor_previsto ?? (c.valor_total ? (c.valor_total * (f.percentual ?? 0)) : 0));
        const impostos = (valorBruto * (reciboImpostoPct / 100));
        const liquida = valorBruto - impostos;
        const venda = (vendas || []).find((v: any) => v.id === c.venda_id);
        const clienteId = venda?.lead_id || venda?.cliente_lead_id;
        items.push({
          cliente: clienteId ? (clientesById[clienteId] || "—") : "—",
          proposta: venda?.numero_proposta || c.venda_id,
          parcelaText: `M${(f.mes ?? 0)}`,
          valor_venda: venda?.valor_venda ?? c.valor_venda ?? 0,
          com_bruta: valorBruto,
          impostos,
          com_liquida: liquida,
        });
        totalLiquido += liquida;
      }
    }

    const vendedor = usersById[reciboVendedorId] || usersByAuth[reciboVendedorId];
    const vendedorNome = vendedor?.nome || vendedor?.email || reciboVendedorId;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text("RECIBO DE COMISSÃO", 297.5, 40, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Recibo Nº: —/${new Date(reciboDate).getFullYear()}`, 40, 68);
    doc.text(`Data: ${formatISODateBR(reciboDate)}`, 400, 68);

    doc.setFont("helvetica", "bold"); doc.text("Nome do Pagador:", 40, 92);
    doc.setFont("helvetica", "normal");
    doc.text("Consulmax Serviços de Planejamento Estruturado e Proteção LTDA. CNPJ: 57.942.043/0001-03", 40, 108);
    doc.text("Endereço: Av. Menezes Filho, 3174, Casa Preta, Ji-Paraná/RO. CEP: 76907-532", 40, 124);

    doc.line(40, 136, 560, 136);

    doc.setFont("helvetica", "bold"); doc.text("Nome do Recebedor:", 40, 152);
    doc.setFont("helvetica", "normal");
    doc.text(vendedorNome || "—", 40, 168);

    doc.setFont("helvetica", "bold"); doc.text("CPF/CNPJ:", 40, 188);
    doc.setFont("helvetica", "normal");
    doc.text("—", 100, 188);

    doc.line(40, 200, 560, 200);

    doc.setFont("helvetica", "normal");
    doc.text("Descrição: Pagamento referente às comissões abaixo relacionadas.", 40, 220);

    autoTable(doc as any, {
      startY: 240,
      head: [["CLIENTE", "PROPOSTA", "PARCELA", "R$ VENDA", "COM. BRUTA", "IMPOSTOS", "COM. LÍQUIDA"]],
      body: items.map(it => [it.cliente, it.proposta, it.parcelaText, BRL(it.valor_venda), BRL(it.com_bruta), BRL(it.impostos), BRL(it.com_liquida)]),
      styles: { font: "helvetica", fontSize: 10 },
      headStyles: { fillColor: [30, 41, 63] },
      theme: "grid",
    });

    const endY = (doc as any).lastAutoTable?.finalY ?? 350;
    doc.setFont("helvetica", "bold");
    doc.text(`Valor total líquido da comissão: ${BRL(totalLiquido)} (${numberToPTBR(totalLiquido)} reais)`, 40, endY + 18);

    doc.setFont("helvetica", "normal");
    doc.text(`Forma de Pagamento: PIX`, 40, endY + 38);
    doc.text(`Chave PIX do pagamento: ${vendedor?.pix_key || "—"}`, 40, endY + 56);

    doc.setFontSize(9);
    doc.text("Declaro, para os devidos fins, que recebi de Consulmax Serviços de Planejamento Estruturado e Proteção LTDA a quantia acima descrita, referente à comissão acordada. Estou ciente de que este valor representa a totalidade da comissão devida sobre a negociação mencionada e dou plena quitação, nada mais tendo a reclamar a este título.", 40, endY + 86, { maxWidth: 520 });

    const signY = endY + 160;
    doc.line(40, signY, 260, signY);
    doc.text(vendedorNome, 40, signY + 14);
    doc.text("CPF: —", 40, signY + 30);

    doc.setFontSize(9);
    doc.text("Rua Menezes Filho, 3174, Casa Preta", 40, 780);
    doc.text("Ji-Paraná/RO, 76907-532", 40, 792);
    doc.text("consulmaxconsorcios.com.br", 40, 804);

    doc.save(`recibo_comissao_${vendedorNome.replace(/\s+/g, "_")}_${reciboDate}.pdf`);
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

      {/* Dashboards */}
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

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-1"><CardTitle>💰 Vendas no Período</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.vendasTotal)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle>🧾 Comissão Bruta</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comBruta)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle>✅ Comissão Líquida</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comLiquida)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle>📤 Comissão Paga</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comPaga)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle>⏳ Comissão Pendente</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comPendente)}</CardContent></Card>
      </div>

      {/* Vendas sem comissão */}
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
                const clienteId = v.lead_id || v.cliente_lead_id || "";
                return (
                  <tr key={v.id} className="border-b">
                    <td className="p-2">{formatISODateBR(v.data_venda)}</td>
                    <td className="p-2">{userLabel(v.vendedor_id)}</td>
                    <td className="p-2">{(clienteId && (clientesMap[clienteId]?.trim())) || "—"}</td>
                    <td className="p-2">{v.numero_proposta || "—"}</td>
                    <td className="p-2">{v.administradora || "—"}</td>
                    <td className="p-2">{v.segmento || "—"}</td>
                    <td className="p-2">{v.tabela || "—"}</td>
                    <td className="p-2 text-right">{BRL(v.valor_venda)}</td>
                    <td className="p-2">
                      <Button
                        size="sm"
                        onClick={() => gerarComissaoDeVenda(v)}
                        disabled={genBusy === v.id}
                      >
                        {genBusy === v.id ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <PlusCircle className="w-4 h-4 mr-1" />
                        )}
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

      {/* Detalhamento de Comissões */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>Detalhamento de Comissões</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label>Data do Recibo</Label>
                <Input type="date" value={reciboDate} onChange={(e) => setReciboDate(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Label>Imposto (%)</Label>
                <Input value={String(reciboImpostoPct)} onChange={(e) => setReciboImpostoPct(parseFloat(e.target.value || "0"))} />
              </div>
              <div className="flex items-center gap-2">
                <Label>Vendedor</Label>
                <Select value={reciboVendedorId} onValueChange={setReciboVendedorId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
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
              <Button className="ml-2" onClick={downloadReceiptPDFForDateAndVendor}>
                <FileText className="w-4 h-4 mr-1" /> Recibo
              </Button>
              {/* REMOVIDO o botão Exportar CSV daqui */}
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
                  <td className="p-2">{r.clienteNome || "—"}</td>
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
                      <Button size="sm" variant="destructive" onClick={() => revertCommissionToSales(r)}>
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
              <Input type="number" min={1} max={36} value={ruleMeses} onChange={(e) => onChangeMeses(parseInt(e.target.value || "1"))} />
            </div>

            <div className="space-y-2">
              <Label>Fluxo do pagamento — informe os percentuais (M1..Mn)</Label>
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div><Label>Data do pagamento</Label><Input type="date" value={payDataPg} onChange={(e) => setPayDataPg(e.target.value)} /></div>
                <div><Label>Valor pago ao vendedor (opcional)</Label><Input placeholder="Ex.: 1.974,00" value={payValorPg} onChange={(e) => setPayValorPg(e.target.value)} /></div>
                <div><Label>Imposto (%)</Label><Input value={String(payImpostoPct)} onChange={(e) => setPayImpostoPct(parseFloat(e.target.value || "0"))} /></div>
                <div className="flex items-end"><Button onClick={() => paySelectedParcels({
                  data_pagamento_vendedor: payDataPg,
                  valor_pago_vendedor: payValorPg ? parseFloat(payValorPg.replace(/\./g, "").replace(",", ".")) : undefined,
                  recibo_file: payReciboFile,
                  comprovante_file: payCompFile,
                })}><Save className="w-4 h-4 mr-1" /> Salvar</Button></div>
              </div>

              <div className="flex gap-2">
                <Button variant="destructive" onClick={() => {
                  const obj: Record<string, boolean> = {};
                  payFlow.forEach(f => { if (!(f.valor_pago_vendedor && f.valor_pago_vendedor > 0)) obj[f.id] = true; });
                  setPaySelected(obj);
                }}>Selecionar tudo pendente</Button>
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
                    {payFlow.map((f) => (
                      <tr key={f.id} className="border-b">
                        <td className="p-2">
                          <Checkbox
                            checked={!!paySelected[f.id]}
                            onCheckedChange={(v) => setPaySelected((s) => ({ ...s, [f.id]: !!v }))}
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
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><Label>Recibo assinado (PDF)</Label><Input type="file" accept="application/pdf" onChange={(e) => setPayReciboFile(e.target.files?.[0] || null)} /></div>
                  <div><Label>Comprovante de pagamento (PDF/Imagem)</Label><Input type="file" accept="application/pdf,image/*" onChange={(e) => setPayCompFile(e.target.files?.[0] || null)} /></div>
                </div>
                <div className="text-xs text-gray-500">Arquivos vão para o bucket <code>comissoes</code>.</div>
              </div>
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
