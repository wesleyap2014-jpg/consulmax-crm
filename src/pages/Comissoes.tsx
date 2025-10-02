// src/pages/Comissoes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ===== shadcn/ui ===== */
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

/* ===== Icons (lucide-react) ===== */
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
  Trash,
  Search,
  X,
} from "lucide-react";

/* ===== PDF ===== */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ========================= Tipos ========================= */
type UUID = string;

type Vendor = { id: UUID; nome: string };
type Sale = {
  id: UUID;
  proposta: string | null;
  cliente: string | null;
  vendedor_id: UUID | null;
  data_venda: string | null; // ISO date
  parcela: number | null;
  parcelas_total: number | null;
  valor_comissao: number | null;
  status: "a_pagar" | "pago" | "cancelado" | string;
  data_pagamento: string | null; // ISO date
  segmento?: string | null;
};

type CommissionPayment = {
  id: UUID;
  sale_id: UUID;
  parcela: number;
  valor_bruto: number;
  imposto_percent: number;
  valor_liquido: number;
  recibo: string;
  created_at: string;
};

type CommissionRule = {
  id?: UUID;
  vendor_id: UUID | null; // null -> regra geral
  segmento: string | null;
  percentual: number; // 0..100
  base_calculo: "bruto" | "liquido";
  vigente_de: string; // ISO date
  valor_min: number | null;
  valor_max: number | null;
  created_at?: string;
};

/* ========================= Helpers ========================= */
const asMoney = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const toISO = (d: Date) => d.toISOString().slice(0, 10);

const startOfYear = (date = new Date()) => new Date(date.getFullYear(), 0, 1);
const startOfMonth = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), 1);

const lastNDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const dateInRange = (iso: string | null, from: Date, to: Date) => {
  if (!iso) return false;
  const d = new Date(iso);
  return d >= from && d <= to;
};

async function getNextReceiptNumber(): Promise<string> {
  // Tenta usar RPC (se existir)
  try {
    const { data, error } = await supabase.rpc("next_receipt_number");
    if (!error && data) {
      return String(data);
    }
  } catch {}
  // Fallback simples: AAAA-000001 (sequencial por dia) -> somente em memória
  const today = new Date();
  const key = `recibo-seq-${toISO(today)}`;
  const stored = Number(localStorage.getItem(key) || "0") + 1;
  localStorage.setItem(key, String(stored));
  return `${today.getFullYear()}-${String(stored).padStart(6, "0")}`;
}

/* ========================= Componente ========================= */
export default function Comissoes() {
  /* --------- Estados globais / filtros --------- */
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [salesToPay, setSalesToPay] = useState<Sale[]>([]);
  const [salesPaid, setSalesPaid] = useState<Sale[]>([]);
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [searchPaid, setSearchPaid] = useState<string>("");

  /* --------- KPIs --------- */
  const [kpiFiveYears, setKpiFiveYears] = useState<number>(0);
  const [kpiPrevYear, setKpiPrevYear] = useState<number>(0);
  const [kpiThisYear, setKpiThisYear] = useState<number>(0);
  const [kpiThisMonth, setKpiThisMonth] = useState<number>(0);

  /* --------- Diálogos --------- */
  const [openRules, setOpenRules] = useState(false);
  const [openPay, setOpenPay] = useState(false);
  const [openRefund, setOpenRefund] = useState(false);

  /* --------- Pagamento --------- */
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedInstallments, setSelectedInstallments] = useState<number[]>([]);
  const [impostoPercent, setImpostoPercent] = useState<number>(0);
  const [receiptNumber, setReceiptNumber] = useState<string>("");

  /* --------- Estorno --------- */
  const [refundProposalQuery, setRefundProposalQuery] = useState<string>("");
  const [refundTargetSale, setRefundTargetSale] = useState<Sale | null>(null);
  const [refundGross, setRefundGross] = useState<number>(0);
  const [refundTax, setRefundTax] = useState<number>(0);

  /* --------- Regras (form) --------- */
  const [ruleIdEditing, setRuleIdEditing] = useState<UUID | null>(null);
  const [ruleVendorId, setRuleVendorId] = useState<UUID | null>(null);
  const [ruleSegmento, setRuleSegmento] = useState<string>("");
  const [rulePercentual, setRulePercentual] = useState<number>(10);
  const [ruleBaseCalculo, setRuleBaseCalculo] = useState<"bruto" | "liquido">("bruto");
  const [ruleVigenteDe, setRuleVigenteDe] = useState<string>(toISO(new Date()));
  const [ruleValMin, setRuleValMin] = useState<number | null>(null);
  const [ruleValMax, setRuleValMax] = useState<number | null>(null);
  const [savingRule, setSavingRule] = useState(false);
  const [deletingRule, setDeletingRule] = useState<UUID | null>(null);

  /* ========================= Effects (load) ========================= */
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadVendors(), loadRules(), loadSales()]);
      await computeKPIs();
      setLoading(false);
    })();
  }, []);

  /* ========================= Loads ========================= */
  async function loadVendors() {
    const { data, error } = await supabase
      .from("vendors")
      .select("id, nome")
      .order("nome");
    if (!error && data) setVendors(data as Vendor[]);
  }

  async function loadRules() {
    const { data, error } = await supabase
      .from("commission_rules")
      .select("*")
      .order("vigente_de", { ascending: false });
    if (!error && data) setRules(data as CommissionRule[]);
  }

  async function loadSales() {
    // A pagar
    const { data: toPay, error: e1 } = await supabase
      .from("sales")
      .select("*")
      .in("status", ["a_pagar"])
      .order("data_venda", { ascending: false });
    if (!e1 && toPay) setSalesToPay(toPay as Sale[]);

    // Pagas
    const { data: paid, error: e2 } = await supabase
      .from("sales")
      .select("*")
      .in("status", ["pago"])
      .order("data_pagamento", { ascending: false });
    if (!e2 && paid) setSalesPaid(paid as Sale[]);
  }

  async function computeKPIs() {
    // Busca pagamentos já efetuados (commission_payments) e calcula somas pelos períodos
    const { data, error } = await supabase
      .from("commission_payments")
      .select("valor_liquido, created_at, valor_bruto");
    if (error || !data) return;

    const now = new Date();
    const fiveYearsAgo = new Date(now);
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const prevYear = now.getFullYear() - 1;
    const prevYearFrom = new Date(prevYear, 0, 1);
    const prevYearTo = new Date(prevYear, 11, 31, 23, 59, 59);

    const thisYearFrom = startOfYear(now);
    const thisMonthFrom = startOfMonth(now);

    let sum5y = 0;
    let sumPrev = 0;
    let sumYear = 0;
    let sumMonth = 0;

    for (const row of data as { valor_liquido: number; valor_bruto: number; created_at: string }[]) {
      const vPago = Number(row.valor_liquido ?? 0); // KPI usa pagos
      const created = new Date(row.created_at);

      if (created >= fiveYearsAgo && created <= now) sum5y += vPago;
      if (created >= prevYearFrom && created <= prevYearTo) sumPrev += vPago;
      if (created >= thisYearFrom && created <= now) sumYear += vPago;
      if (created >= thisMonthFrom && created <= now) sumMonth += vPago;
    }

    setKpiFiveYears(sum5y);
    setKpiPrevYear(sumPrev);
    setKpiThisYear(sumYear);
    setKpiThisMonth(sumMonth);
  }

  /* ========================= Pagamentos ========================= */
  function openPaymentDialog(sale: Sale) {
    setSelectedSale(sale);
    setSelectedInstallments([]); // não marcar tudo automaticamente
    setImpostoPercent(0);
    setOpenPay(true);
    getNextReceiptNumber().then(setReceiptNumber);
  }

  function toggleInstallment(n: number) {
    setSelectedInstallments((prev) =>
      prev.includes(n) ? prev.filter((i) => i !== n) : [...prev, n]
    );
  }

  const totalBrutoSelecionado = useMemo(() => {
    if (!selectedSale) return 0;
    const unit = Number(selectedSale.valor_comissao ?? 0);
    return selectedInstallments.reduce((acc) => acc + unit, 0);
  }, [selectedInstallments, selectedSale]);

  const totalLiquidoSelecionado = useMemo(() => {
    const imposto = Number(impostoPercent || 0) / 100;
    return totalBrutoSelecionado * (1 - imposto);
  }, [totalBrutoSelecionado, impostoPercent]);

  async function confirmarPagamento() {
    if (!selectedSale || selectedInstallments.length === 0) return;

    const imposto = Number(impostoPercent || 0);
    const recibo = receiptNumber || (await getNextReceiptNumber());

    const inserts = selectedInstallments.map((parc) => ({
      sale_id: selectedSale.id,
      parcela: parc,
      valor_bruto: Number(selectedSale.valor_comissao ?? 0),
      imposto_percent: imposto,
      valor_liquido: Number(selectedSale.valor_comissao ?? 0) * (1 - imposto / 100),
      recibo,
    }));

    const { error: e1 } = await supabase.from("commission_payments").insert(inserts);
    if (e1) return;

    // Atualiza status da venda para "pago" se todas as parcelas pagas (simplificado)
    // TODO: Você pode checar qtd de payments x parcelas_total para decidir se fecha a venda
    await supabase
      .from("sales")
      .update({ status: "pago", data_pagamento: new Date().toISOString() })
      .eq("id", selectedSale.id);

    setOpenPay(false);
    setSelectedSale(null);
    await Promise.all([loadSales(), computeKPIs()]);
  }

  /* ========================= Estorno ========================= */
  async function buscarPropostaParaEstorno() {
    if (!refundProposalQuery.trim()) return;
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .ilike("proposta", refundProposalQuery.trim());
    if (!error && data && data.length > 0) {
      setRefundTargetSale(data[0] as Sale);
    } else {
      setRefundTargetSale(null);
    }
  }

  const refundNet = useMemo(() => {
    const tax = Number(refundTax || 0) / 100;
    return Number(refundGross || 0) * (1 - tax);
  }, [refundGross, refundTax]);

  async function confirmarEstorno() {
    if (!refundTargetSale || !refundGross) return;
    const payload = {
      sale_id: refundTargetSale.id,
      valor_estorno_bruto: Number(refundGross),
      imposto_percent: Number(refundTax || 0),
      valor_estorno_liquido: refundNet,
    };
    const { error } = await supabase.from("commission_refunds").insert(payload);
    if (!error) {
      setOpenRefund(false);
      setRefundTargetSale(null);
      setRefundGross(0);
      setRefundTax(0);
      await computeKPIs();
    }
  }

  /* ========================= Regras (CRUD) ========================= */
  function resetRuleForm() {
    setRuleIdEditing(null);
    setRuleVendorId(null);
    setRuleSegmento("");
    setRulePercentual(10);
    setRuleBaseCalculo("bruto");
    setRuleVigenteDe(toISO(new Date()));
    setRuleValMin(null);
    setRuleValMax(null);
  }

  function editRule(r: CommissionRule) {
    setRuleIdEditing(r.id ?? null);
    setRuleVendorId(r.vendor_id);
    setRuleSegmento(r.segmento ?? "");
    setRulePercentual(Number(r.percentual));
    setRuleBaseCalculo(r.base_calculo);
    setRuleVigenteDe(r.vigente_de);
    setRuleValMin(r.valor_min ?? null);
    setRuleValMax(r.valor_max ?? null);
    setOpenRules(true);
  }

  async function saveRule() {
    // validações básicas
    if (isNaN(rulePercentual) || rulePercentual < 0 || rulePercentual > 100) {
      alert("Informe um percentual entre 0 e 100.");
      return;
    }
    if (!ruleVigenteDe) {
      alert("Informe a data de vigência.");
      return;
    }
    setSavingRule(true);
    const payload: CommissionRule = {
      vendor_id: ruleVendorId,
      segmento: ruleSegmento ? ruleSegmento : null,
      percentual: Number(rulePercentual),
      base_calculo: ruleBaseCalculo,
      vigente_de: ruleVigenteDe,
      valor_min: ruleValMin === null || ruleValMin === undefined ? null : Number(ruleValMin),
      valor_max: ruleValMax === null || ruleValMax === undefined ? null : Number(ruleValMax),
    };

    if (ruleIdEditing) {
      const { error } = await supabase
        .from("commission_rules")
        .update(payload)
        .eq("id", ruleIdEditing);
      if (error) {
        alert("Erro ao atualizar regra.");
      } else {
        await loadRules();
        resetRuleForm();
        setOpenRules(false);
      }
    } else {
      const { error } = await supabase.from("commission_rules").insert(payload);
      if (error) {
        alert("Erro ao criar regra.");
      } else {
        await loadRules();
        resetRuleForm();
        setOpenRules(false);
      }
    }
    setSavingRule(false);
  }

  async function deleteRule(id: UUID) {
    setDeletingRule(id);
    const { error } = await supabase.from("commission_rules").delete().eq("id", id);
    if (error) {
      alert("Erro ao excluir regra.");
    } else {
      await loadRules();
    }
    setDeletingRule(null);
  }

  /* ========================= Filtros / buscas ========================= */
  const salesToPayFiltered = useMemo(() => {
    return salesToPay.filter((s) =>
      vendorFilter === "all" ? true : s.vendedor_id === vendorFilter
    );
  }, [salesToPay, vendorFilter]);

  const salesPaidFiltered = useMemo(() => {
    const q = searchPaid.trim().toLowerCase();
    let list = vendorFilter === "all"
      ? salesPaid
      : salesPaid.filter((s) => s.vendedor_id === vendorFilter);
    if (!q) return list;
    return list.filter((s) => {
      const p = (s.proposta ?? "").toLowerCase();
      const c = (s.cliente ?? "").toLowerCase();
      return p.includes(q) || c.includes(q);
    });
  }, [salesPaid, vendorFilter, searchPaid]);

  /* ========================= PDF Recibo ========================= */
  function gerarReciboPDF(pagamentos: CommissionPayment[], sale: Sale) {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Recibo de Comissões", 14, 18);
    doc.setFontSize(10);

    const tabela = pagamentos.map((p) => [
      sale.proposta ?? "-",
      String(p.parcela),
      asMoney(p.valor_bruto),
      `${p.imposto_percent}%`,
      asMoney(p.valor_liquido),
      p.recibo,
      new Date(p.created_at).toLocaleDateString("pt-BR"),
    ]);

    autoTable(doc, {
      head: [["Proposta", "Parcela", "Valor Bruto", "Imposto", "Valor Líquido", "Recibo", "Data"]],
      body: tabela,
      startY: 24,
      styles: { fontSize: 9 },
    });

    const nomeArquivo = `recibo_${pagamentos[0]?.recibo || "comissoes"}.pdf`;
    doc.save(nomeArquivo);
  }

  /* ========================= Render ========================= */
  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando Comissões...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ===== Título + Ações ===== */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Comissões</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setOpenRefund(true)}>
            Estorno
          </Button>
          <Button variant="outline" onClick={() => setOpenRules(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Regras
          </Button>
        </div>
      </div>

      {/* ===== KPIs / Relógios ===== */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Últimos 5 anos</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl">{asMoney(kpiFiveYears)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ano anterior</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl">{asMoney(kpiPrevYear)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ano atual</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl">{asMoney(kpiThisYear)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Este mês</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl">{asMoney(kpiThisMonth)}</CardContent>
        </Card>
      </div>

      {/* ===== Filtros ===== */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Filtro do Vendedor</Label>
            <Select
              value={vendorFilter}
              onValueChange={setVendorFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 flex items-end gap-2">
            <div className="flex-1">
              <Label>Pesquisar em “Comissões pagas” (nome ou proposta)</Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Ex.: João, PROP-1234..."
                  value={searchPaid}
                  onChange={(e) => setSearchPaid(e.target.value)}
                />
                <Button variant="outline">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== Abas ===== */}
      <Tabs defaultValue="a_pagar" className="w-full">
        <TabsList>
          <TabsTrigger value="a_pagar">Detalhamento de Comissões (a pagar)</TabsTrigger>
          <TabsTrigger value="pagas">Comissões pagas</TabsTrigger>
        </TabsList>

        {/* ---- A Pagar ---- */}
        <TabsContent value="a_pagar" className="space-y-4">
          {salesToPayFiltered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nenhum item a pagar para o filtro atual.
              </CardContent>
            </Card>
          ) : (
            salesToPayFiltered.map((s) => (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {s.proposta ?? "-"} · {s.cliente ?? "-"}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button onClick={() => openPaymentDialog(s)}>
                        <DollarSign className="h-4 w-4 mr-2" />
                        Registrar Pagamento
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm grid grid-cols-2 md:grid-cols-5 gap-2">
                  <div>
                    <span className="text-muted-foreground block">Parcela</span>
                    <span>
                      {s.parcela ?? 1}/{s.parcelas_total ?? 1}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Valor Comissão</span>
                    <span>{asMoney(Number(s.valor_comissao ?? 0))}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Data Venda</span>
                    <span>
                      {s.data_venda
                        ? new Date(s.data_venda).toLocaleDateString("pt-BR")
                        : "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Segmento</span>
                    <span>{s.segmento ?? "-"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Status</span>
                    <span className="uppercase">{s.status}</span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ---- Pagas ---- */}
        <TabsContent value="pagas" className="space-y-4">
          {salesPaidFiltered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nenhuma comissão paga para os filtros/pesquisa atuais.
              </CardContent>
            </Card>
          ) : (
            salesPaidFiltered.map((s) => (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {s.proposta ?? "-"} · {s.cliente ?? "-"}
                    </CardTitle>
                    {/* Links de arquivos removidos — manter apenas texto/ações (conforme seu pedido) */}
                  </div>
                </CardHeader>
                <CardContent className="text-sm grid grid-cols-2 md:grid-cols-5 gap-2">
                  <div>
                    <span className="text-muted-foreground block">Parcelas</span>
                    <span>
                      {s.parcela ?? 1}/{s.parcelas_total ?? 1}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Comissão (parcela)</span>
                    <span>{asMoney(Number(s.valor_comissao ?? 0))}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Data Pagamento</span>
                    <span>
                      {s.data_pagamento
                        ? new Date(s.data_pagamento).toLocaleDateString("pt-BR")
                        : "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Segmento</span>
                    <span>{s.segmento ?? "-"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Status</span>
                    <span className="uppercase">{s.status}</span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
          {/* TODO: paginação 10 por página — se quiser, conecto com server-side num próximo patch */}
        </TabsContent>
      </Tabs>

      {/* ======== Registrar Pagamento ======== */}
      <Dialog open={openPay} onOpenChange={setOpenPay}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
          </DialogHeader>

          {selectedSale ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Proposta</Label>
                  <Input value={selectedSale.proposta ?? "-"} readOnly />
                </div>
                <div>
                  <Label>Cliente</Label>
                  <Input value={selectedSale.cliente ?? "-"} readOnly />
                </div>
                <div>
                  <Label>Parcelas</Label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({
                      length: Number(selectedSale.parcelas_total ?? 1),
                    }).map((_, idx) => {
                      const n = idx + 1;
                      const checked = selectedInstallments.includes(n);
                      return (
                        <div key={n} className="flex items-center gap-2">
                          <Checkbox
                            id={`parc-${n}`}
                            checked={checked}
                            onCheckedChange={() => toggleInstallment(n)}
                          />
                          <Label htmlFor={`parc-${n}`}>{n}</Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label>Imposto (%)</Label>
                  <Input
                    type="number"
                    value={String(impostoPercent)}
                    onChange={(e) => setImpostoPercent(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Nº Recibo</Label>
                  <Input
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Valor Comissão por parcela</Label>
                  <Input
                    value={asMoney(Number(selectedSale.valor_comissao ?? 0))}
                    readOnly
                  />
                </div>
                <div>
                  <Label>Total Selecionado (Bruto)</Label>
                  <Input value={asMoney(totalBrutoSelecionado)} readOnly />
                </div>
                <div>
                  <Label>Total Selecionado (Líquido)</Label>
                  <Input value={asMoney(totalLiquidoSelecionado)} readOnly />
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenPay(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarPagamento}>
              <DollarSign className="h-4 w-4 mr-2" />
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======== Estorno ======== */}
      <Dialog open={openRefund} onOpenChange={setOpenRefund}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Estorno de Comissão</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <Label>Nº da Proposta</Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Ex.: PROP-12345"
                  value={refundProposalQuery}
                  onChange={(e) => setRefundProposalQuery(e.target.value)}
                />
                <Button variant="outline" onClick={buscarPropostaParaEstorno}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Resumo da Proposta</Label>
              <Input
                readOnly
                value={
                  refundTargetSale
                    ? `${refundTargetSale.proposta ?? "-"} · ${
                        refundTargetSale.cliente ?? "-"
                      } · ${asMoney(Number(refundTargetSale.valor_comissao ?? 0))}/parc`
                    : "-"
                }
              />
            </div>
            <div>
              <Label>Estorno (Bruto)</Label>
              <Input
                type="number"
                step="0.01"
                value={String(refundGross)}
                onChange={(e) => setRefundGross(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Imposto (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={String(refundTax)}
                onChange={(e) => setRefundTax(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Estorno (Líquido)</Label>
              <Input readOnly value={asMoney(refundNet)} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenRefund(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarEstorno} disabled={!refundTargetSale || !refundGross}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Confirmar Estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======== Regras ======== */}
      <Dialog open={openRules} onOpenChange={setOpenRules}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Regras de Comissão</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div>
              <Label>Vendedor</Label>
              <Select
                value={ruleVendorId ?? ""}
                onValueChange={(v) => setRuleVendorId(v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Regra geral (todos)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Regra geral (todos)</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Segmento (opcional)</Label>
              <Input
                placeholder="imóveis, autos, pesados..."
                value={ruleSegmento}
                onChange={(e) => setRuleSegmento(e.target.value)}
              />
            </div>

            <div>
              <Label>Percentual (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={String(rulePercentual)}
                onChange={(e) => setRulePercentual(Number(e.target.value))}
              />
            </div>

            <div>
              <Label>Base de Cálculo</Label>
              <Select
                value={ruleBaseCalculo}
                onValueChange={(v: "bruto" | "liquido") => setRuleBaseCalculo(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bruto">Bruto</SelectItem>
                  <SelectItem value="liquido">Líquido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Vigente de</Label>
              <Input
                type="date"
                value={ruleVigenteDe}
                onChange={(e) => setRuleVigenteDe(e.target.value)}
              />
            </div>

            <div>
              <Label>Valor mínimo (opcional)</Label>
              <Input
                type="number"
                step="0.01"
                value={ruleValMin === null ? "" : String(ruleValMin)}
                onChange={(e) =>
                  setRuleValMin(e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>

            <div>
              <Label>Valor máximo (opcional)</Label>
              <Input
                type="number"
                step="0.01"
                value={ruleValMax === null ? "" : String(ruleValMax)}
                onChange={(e) =>
                  setRuleValMax(e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>

            <div className="flex items-end">
              <Button onClick={saveRule} disabled={savingRule} className="w-full">
                {savingRule ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />{" "}
                    {ruleIdEditing ? "Atualizar" : "Salvar"}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Lista de Regras */}
          <div className="mt-6">
            <Label className="mb-2 block">Regras cadastradas</Label>
            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Vendedor</th>
                    <th className="text-left p-2">Segmento</th>
                    <th className="text-left p-2">Percentual</th>
                    <th className="text-left p-2">Base</th>
                    <th className="text-left p-2">Vigente de</th>
                    <th className="text-left p-2">Mín.</th>
                    <th className="text-left p-2">Máx.</th>
                    <th className="text-right p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.length === 0 ? (
                    <tr>
                      <td className="p-4 text-muted-foreground" colSpan={8}>
                        Nenhuma regra cadastrada.
                      </td>
                    </tr>
                  ) : (
                    rules.map((r) => {
                      const vend = vendors.find((v) => v.id === r.vendor_id)?.nome ?? "Geral";
                      return (
                        <tr key={r.id}>
                          <td className="p-2">{vend}</td>
                          <td className="p-2">{r.segmento ?? "-"}</td>
                          <td className="p-2">{Number(r.percentual).toFixed(2)}%</td>
                          <td className="p-2 uppercase">{r.base_calculo}</td>
                          <td className="p-2">
                            {new Date(r.vigente_de).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="p-2">{r.valor_min != null ? asMoney(r.valor_min) : "-"}</td>
                          <td className="p-2">{r.valor_max != null ? asMoney(r.valor_max) : "-"}</td>
                          <td className="p-2">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => editRule(r)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteRule(r.id as UUID)}
                                disabled={deletingRule === r.id}
                              >
                                {deletingRule === r.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
