// src/pages/Comissoes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Download, Filter as FilterIcon, Settings, Save, DollarSign, Upload, FileText, PlusCircle } from "lucide-react";

// PDF
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ========================= Tipos ========================= */
type UUID = string;

type User = { id: UUID; nome: string | null };
type SimTable = { id: UUID; segmento: string; nome_tabela: string };
type Venda = {
  id: UUID;
  data_venda: string; // date
  vendedor_id: UUID;
  segmento: string | null;
  tabela: string | null;
  administradora: string | null;
  numero_proposta?: string | null;   // novo
  valor_venda: number | null;
  grupo?: string | null;
  cota?: string | null;
  cliente_nome?: string | null;      // novo (se existir na tabela)
};

type CommissionRule = {
  id: UUID;
  vendedor_id: UUID;
  sim_table_id: UUID;
  percent_padrao: number | null;
  faixa_min: number | null;
  faixa_max: number | null;
  etapa_entrada_pct: number | null;
  etapa_final_pct: number | null;
  fluxo_meses: number;
  fluxo_percentuais: number[];
  obs: string | null;
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

/* ========================= Relógio radial (SVG) ========================= */
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

  /* ---------- Comissões / Vendas ---------- */
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<(Commission & { flow?: CommissionFlow[] })[]>([]);
  const [vendasSemCom, setVendasSemCom] = useState<Venda[]>([]);

  /* ---------- Modais ---------- */
  const [openRules, setOpenRules] = useState<boolean>(false);
  const [openPay, setOpenPay] = useState<boolean>(false);

  /* ---------- Estado Regras ---------- */
  const [ruleVendorId, setRuleVendorId] = useState<string>("");
  const [ruleSimTableId, setRuleSimTableId] = useState<string>("");
  const [rulePercent, setRulePercent] = useState<string>("0.0120");
  const [ruleMeses, setRuleMeses] = useState<number>(1);
  const [ruleFluxo, setRuleFluxo] = useState<string[]>(["1.0000"]);
  const [ruleObs, setRuleObs] = useState<string>("");

  /* ---------- Estado Pagamento ---------- */
  const [payCommissionId, setPayCommissionId] = useState<string>("");
  const [payFlow, setPayFlow] = useState<CommissionFlow[]>([]);
  const [paySelected, setPaySelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const [{ data: u }, { data: st }] = await Promise.all([
        supabase.from("users").select("id, nome").order("nome", { ascending: true }),
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

      setRows((comms || []).map((c) => ({ ...(c as Commission), flow: flowByCommission[c.id] || [] })));

      // --- vendas sem comissão (com fallback p/ cliente_nome) ---
      let vendasPeriodo: any[] | null = null;
      {
        const { data, error: err1 } = await supabase
          .from("vendas")
          .select("id, data_venda, vendedor_id, segmento, tabela, administradora, numero_proposta, cliente_nome, valor_venda, grupo, cota")
          .gte("data_venda", dtIni)
          .lte("data_venda", dtFim)
          .order("data_venda", { ascending: false });

        if (err1) {
          const r2 = await supabase
            .from("vendas")
            .select("id, data_venda, vendedor_id, segmento, tabela, administradora, numero_proposta, valor_venda, grupo, cota")
            .gte("data_venda", dtIni)
            .lte("data_venda", dtFim)
            .order("data_venda", { ascending: false });
          vendasPeriodo = r2.data || [];
        } else {
          vendasPeriodo = data || [];
        }
      }

      // ids de vendas já com comissão
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
    const comLiquida = comBruta; // ajuste se houver impostos/taxas
    return { vendasTotal, comBruta, comLiquida, comPaga, comPendente };
  }, [rows]);

  /* ========================= Dashboards (relógio/barras) ========================= */
  const vendedorAtual = useMemo(() => users.find((u) => u.id === vendedorId)?.nome || "Todos", [users, vendedorId]);

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
  const rangeY  = totalsInRange(yStart, now);
  const rangeM  = totalsInRange(mStart, now);

  /* ========================= Regras ========================= */
  function onChangeMeses(n: number) {
    setRuleMeses(n);
    const arr = [...ruleFluxo];
    if (n > arr.length) while (arr.length < n) arr.push("0.0000");
    else arr.length = n;
    setRuleFluxo(arr);
  }
  const fluxoSoma = useMemo(() => ruleFluxo.reduce((a, b) => a + parseFloat(b || "0"), 0), [ruleFluxo]);

  async function saveRule() {
    if (!ruleVendorId || !ruleSimTableId) return alert("Selecione vendedor e tabela.");

    // regra: soma do fluxo (em fração) precisa ser 1.0 (100%)
    if (Math.abs(fluxoSoma - 1.0) > 0.00001) {
      return alert(`Soma de fluxo_percentuais (%) deve ser 1.0; soma atual = ${fluxoSoma.toFixed(4)}`);
    }

    const { error } = await supabase.from("commission_rules").upsert({
      vendedor_id: ruleVendorId,
      sim_table_id: ruleSimTableId,
      percent_padrao: parseFloat(rulePercent || "0") || null,
      fluxo_meses: ruleMeses,
      fluxo_percentuais: ruleFluxo.map((x) => parseFloat(x || "0")),
      obs: ruleObs || null,
    }, { onConflict: "vendedor_id,sim_table_id" });

    if (error) return alert(error.message);
    setOpenRules(false);
  }

  /* ========================= Pagamento ========================= */
  async function openPaymentFor(commission: Commission) {
    setPayCommissionId(commission.id);
    const { data } = await supabase.from("commission_flow").select("*").eq("commission_id", commission.id).order("mes", { ascending: true });
    setPayFlow((data || []) as CommissionFlow[]);
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
    const updates: Partial<CommissionFlow>[] = [];
    let reciboPath: string | null = null;
    let compPath: string | null = null;
    if (payload.recibo_file) reciboPath = await uploadToBucket(payload.recibo_file);
    if (payload.comprovante_file) compPath = await uploadToBucket(payload.comprovante_file);

    payFlow.forEach((f) => {
      if (paySelected[f.id]) {
        updates.push({
          id: f.id,
          data_pagamento_vendedor: payload.data_pagamento_vendedor || toDateInput(new Date()),
          valor_pago_vendedor: payload.valor_pago_vendedor ?? f.valor_previsto ?? 0,
          recibo_vendedor_url: reciboPath || f.recibo_vendedor_url,
          comprovante_pagto_url: compPath || f.comprovante_pagto_url,
        } as any);
      }
    });

    if (!updates.length) return alert("Selecione pelo menos uma parcela.");
    const { error } = await supabase.from("commission_flow").upsert(updates);
    if (error) return alert(error.message);

    // Atualiza status da comissão se todas pagas
    const { data: updated } = await supabase.from("commission_flow").select("*").eq("commission_id", payCommissionId);
    const allPaid = (updated || []).every((f: any) => (f.valor_pago_vendedor ?? 0) > 0);
    if (allPaid) {
      await supabase.from("commissions").update({ status: "pago", data_pagamento: toDateInput(new Date()) }).eq("id", payCommissionId);
    }

    setOpenPay(false);
    fetchData();
  }

  /* ========================= Gerar Comissão a partir da Venda ========================= */
  async function gerarComissaoDeVenda(venda: Venda) {
    // 0) garante que a venda existe (evita "record 'v' is not assigned yet" no trigger)
    const check = await supabase.from("vendas").select("id").eq("id", venda.id).maybeSingle();
    if (check.error || !check.data?.id) {
      alert("Não foi possível localizar a venda no banco (ID inválido). Atualize a página e tente novamente.");
      return;
    }

    // 1) tenta resolver sim_table_id pela tabela
    let simTableId: string | null = null;
    if (venda.tabela) {
      const { data: st } = await supabase.from("sim_tables").select("id").eq("nome_tabela", venda.tabela).limit(1);
      simTableId = st?.[0]?.id ?? null;
    }

    // 2) tenta pegar percent da regra (se existir)
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

    // 3) monta o insert
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
      if (String(error.message).toLowerCase().includes(`record "v" is not assigned yet`)) {
        alert("O banco não conseguiu ler a venda ao criar a comissão. Verifique se a venda existe e se o ID está correto.");
      } else {
        alert(error.message);
      }
      return;
    }
    fetchData();
  }

  /* ========================= CSV Export ========================= */
  function exportCSV() {
    const header = [
      "data_venda","vendedor_id","segmento","tabela","administradora",
      "valor_venda","percent_aplicado","valor_total","status","data_pagamento"
    ];
    const lines = rows.map(r => ([
      r.data_venda,
      r.vendedor_id,
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

  /* ========================= PDF Recibo ========================= */
  async function downloadReceiptPDF(comm: Commission, itens: CommissionFlow[]) {
    const vendedor = users.find((u) => u.id === comm.vendedor_id)?.nome || "Vendedor";
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
      BRL(it.valor_previsto),
      it.data_pagamento_vendedor ? new Date(it.data_pagamento_vendedor).toLocaleDateString("pt-BR") : "—",
    ]);

    autoTable(doc, {
      startY: tableStartY,
      head: [["TABELA", "MÊS", "% PARC.", "VALOR", "DATA PAGAMENTO"]],
      body,
      styles: { font: "helvetica", fontSize: 10 },
      headStyles: { fillColor: [30, 41, 63] },
    });

    const total = sum(itens.map((i) => i.valor_pago_vendedor ?? i.valor_previsto ?? 0));
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
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome || u.id}</SelectItem>)}
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

      {/* Cards de Resumo gerais (período filtrado) */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-1"><CardTitle>💰 Vendas no Período</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.vendasTotal)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle>🧾 Comissão Bruta</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comBruta)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle>✅ Comissão Líquida</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comLiquida)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle>📤 Comissão Paga</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comPaga)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle>⏳ Comissão Pendente</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{BRL(kpi.comPendente)}</CardContent></Card>
      </div>

      {/* Tabela: Vendas sem comissão (Gerar Comissão) */}
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
          <table className="min-w-[1200px] w-full text-sm">
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
              {vendasSemCom.map(v => (
                <tr key={v.id} className="border-b">
                  <td className="p-2">{new Date(v.data_venda).toLocaleDateString("pt-BR")}</td>
                  <td className="p-2">{users.find(u => u.id === v.vendedor_id)?.nome || v.vendedor_id}</td>
                  <td className="p-2">{v.cliente_nome || "—"}</td>
                  <td className="p-2">{v.numero_proposta || "—"}</td>
                  <td className="p-2">{v.administradora || "—"}</td>
                  <td className="p-2">{v.segmento || "—"}</td>
                  <td className="p-2">{v.tabela || "—"}</td>
                  <td className="p-2 text-right">{BRL(v.valor_venda)}</td>
                  <td className="p-2">
                    <Button size="sm" onClick={() => gerarComissaoDeVenda(v)}>
                      <PlusCircle className="w-4 h-4 mr-1" /> Gerar Comissão
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Tabela Detalhada de Comissões */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>Detalhamento de Comissões</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportCSV}>
                <Download className="w-4 h-4 mr-1" /> Exportar CSV
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left">Data</th>
                <th className="p-2 text-left">Vendedor</th>
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
              {loading && <tr><td colSpan={10} className="p-4"><Loader2 className="animate-spin inline mr-2" /> Carregando...</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={10} className="p-4 text-gray-500">Sem registros.</td></tr>}
              {!loading && rows.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{r.data_venda ? new Date(r.data_venda).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="p-2">{users.find(u => u.id === r.vendedor_id)?.nome || r.vendedor_id}</td>
                  <td className="p-2">{r.segmento || "—"}</td>
                  <td className="p-2">{r.tabela || "—"}</td>
                  <td className="p-2 text-right">{BRL(r.valor_venda ?? r.base_calculo)}</td>
                  <td className="p-2 text-right">{pct100(r.percent_aplicado)}</td>
                  <td className="p-2 text-right">{BRL(r.valor_total)}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">{r.data_pagamento ? new Date(r.data_pagamento).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openPaymentFor(r)}>
                        <DollarSign className="w-4 h-4 mr-1" /> Registrar pagamento
                      </Button>
                      <Button size="sm" variant="outline" onClick={async () => {
                        const { data } = await supabase.from("commission_flow").select("*").eq("commission_id", r.id).order("mes", { ascending: true });
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
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome || u.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tabela (SimTables)</Label>
              <Select value={ruleSimTableId} onValueChange={setRuleSimTableId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {simTables.map((t) => <SelectItem key={t.id} value={t.id}>{t.segmento} — {t.nome_tabela}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>% Padrão (ex.: 0.0120 = 1,20%)</Label><Input value={rulePercent} onChange={(e) => setRulePercent(e.target.value)} /></div>
            <div><Label>Nº de meses do fluxo</Label><Input type="number" min={1} max={36} value={ruleMeses} onChange={(e) => onChangeMeses(parseInt(e.target.value || "1"))} /></div>
            <div className="space-y-2">
              <Label>Fluxo (% somando 1.0000)</Label>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: ruleMeses }).map((_, i) => (
                  <Input key={i} value={ruleFluxo[i] || "0.0000"} onChange={(e) => {
                    const arr = [...ruleFluxo]; arr[i] = e.target.value; setRuleFluxo(arr);
                  }} placeholder={`M${i + 1} (ex.: 0.3000)`} />
                ))}
              </div>
              <div className={`text-sm ${Math.abs(fluxoSoma - 1.0) < 0.00001 ? "text-green-700" : "text-red-600"}`}>
                Soma atual: {fluxoSoma.toFixed(4)}
              </div>
            </div>
            <div><Label>Observações</Label><Input value={ruleObs} onChange={(e) => setRuleObs(e.target.value)} /></div>
          </div>
          <SheetFooter className="mt-4"><Button onClick={saveRule}><Save className="w-4 h-4 mr-1" /> Salvar Regra</Button></SheetFooter>
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
                        <td className="p-2"><Checkbox checked={!!paySelected[f.id]} onCheckedChange={(v) => setPaySelected((s) => ({ ...s, [f.id]: !!v }))} /></td>
                        <td className="p-2">M{f.mes}</td>
                        <td className="p-2">{pct100(f.percentual)}</td>
                        <td className="p-2 text-right">{BRL(f.valor_previsto)}</td>
                        <td className="p-2 text-right">{BRL(f.valor_pago_vendedor)}</td>
                        <td className="p-2">{f.data_pagamento_vendedor ? new Date(f.data_pagamento_vendedor).toLocaleDateString("pt-BR") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="arquivos"><UploadArea onConfirm={paySelectedParcels} /></TabsContent>
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
        <div><Label>Valor pago ao vendedor (opcional)</Label><Input placeholder="Ex.: 1974,00" value={valorPg} onChange={(e) => setValorPg(e.target.value)} /></div>
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
