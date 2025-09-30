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
  Download,
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
  (typeof v === "number" ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct100 = (v?: number | null) =>
  `${(((typeof v === "number" ? v : 0) * 100) as number).toFixed(2).replace(".", ",")}%`;
const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
const sum = (arr: (number | null | undefined)[]) => arr.reduce((a, b) => a + (b || 0), 0);
const clamp0 = (n: number) => (n < 0 ? 0 : n);
const formatISODateBR = (iso?: string | null) => (!iso ? "—" : iso.split("-").reverse().join("/"));
const normalize = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
const getExt = (path: string) => {
  const m = path?.match(/\.(pdf|png|jpg|jpeg|webp)$/i);
  return m ? m[0].toLowerCase() : ".bin";
};
function valorPorExtenso(n: number) {
  const u = [
    "zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez","onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove",
  ];
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
    (f) => (Number(f.percentual) || 0) > 0 && !!f.data_pagamento_vendedor && (Number(f.valor_pago_vendedor) || 0) === 0
  );
}
function isFullyPaid(flow?: CommissionFlow[]) {
  if (!flow) return false;
  const relevant = flow.filter((f) => (Number(f.percentual) || 0) > 0);
  return relevant.length > 0 && relevant.every((f) => (Number(f.valor_pago_vendedor) || 0) > 0);
}

/* ========================= Relógio Dual ========================= */
function RadialDual({
  paidPct,
  label,
  paidHint,
  pendHint,
  tagline = "Quanto já entrou × o que ainda falta",
}: {
  paidPct: number;
  label: string;
  paidHint: string;
  pendHint: string;
  tagline?: string;
}) {
  const [hover, setHover] = useState<"paid" | "pend" | null>(null);
  const pct = Math.max(0, Math.min(100, paidPct));
  const radius = 44, circumference = 2 * Math.PI * radius;
  const paidLen = (pct / 100) * circumference;
  const pendLen = circumference - paidLen;
  const azul = "#1E293F";
  const vermelho = "#A11C27";
  return (
    <div className="flex items-center gap-3 p-3 border rounded-xl">
      <svg width="120" height="120" className="-rotate-90" role="img" aria-label={label}>
        <circle cx="60" cy="60" r={radius} stroke="#e5e7eb" strokeWidth="10" fill="none" />
        <circle
          cx="60" cy="60" r={radius} stroke={azul}
          strokeWidth={hover === "paid" ? 12 : 10}
          fill="none" strokeDasharray={`${paidLen} ${circumference}`} strokeLinecap="round"
          onMouseEnter={() => setHover("paid")} onMouseLeave={() => setHover(null)}
        >
          <title>{paidHint}</title>
        </circle>
        <circle
          cx="60" cy="60" r={radius} stroke={vermelho}
          strokeWidth={hover === "pend" ? 12 : 10}
          fill="none" strokeDasharray={`${pendLen} ${circumference}`} strokeDashoffset={-paidLen} strokeLinecap="round"
          onMouseEnter={() => setHover("pend")} onMouseLeave={() => setHover(null)}
        >
          <title>{pendHint}</title>
        </circle>
        <text x="60" y="65" textAnchor="middle" fontSize="18" fill="#111827" className="rotate-90">
          {pct.toFixed(0)}%
        </text>
      </svg>
      <div>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="font-semibold">{tagline}</div>
      </div>
    </div>
  );
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
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const usersByAuth = useMemo(() => {
    const m: Record<string, User> = {};
    users.forEach((u) => { if (u.auth_user_id) m[u.auth_user_id] = u; });
    return m;
  }, [users]);
  const secureById = useMemo(() => Object.fromEntries(usersSecure.map((u) => [u.id, u])), [usersSecure]);
  const userLabel = (id?: string | null) => {
    if (!id) return "—";
    const u = usersById[id] || usersByAuth[id];
    return u?.nome?.trim() || u?.email?.trim() || id;
  };
  const canonUserId = (id?: string | null) => (id ? usersById[id]?.id || usersByAuth[id]?.id || null : null);

  /* Dados */
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<(Commission & { flow?: CommissionFlow[] })[]>([]);
  const [vendasSemCom, setVendasSemCom] = useState<Venda[]>([]);
  const [genBusy, setGenBusy] = useState<string | null>(null);

  /* Regras */
  const [openRules, setOpenRules] = useState(false);
  const [ruleVendorId, setRuleVendorId] = useState<string>("");
  const [ruleSimTableId, setRuleSimTableId] = useState<string>("");
  const [rulePercent, setRulePercent] = useState<string>("1,20");
  const [ruleMeses, setRuleMeses] = useState<number>(1);
  const [ruleFluxoPct, setRuleFluxoPct] = useState<string[]>(["100,00"]);
  const [ruleObs, setRuleObs] = useState<string>("");
  const [ruleRows, setRuleRows] = useState<(CommissionRule & { segmento: string; nome_tabela: string })[]>([]);

  /* Pagamento */
  const [openPay, setOpenPay] = useState(false);
  const [payCommissionId, setPayCommissionId] = useState<string>("");
  const [payFlow, setPayFlow] = useState<(CommissionFlow & { _valor_previsto_calc?: number })[]>([]);
  const [paySelected, setPaySelected] = useState<Record<string, boolean>>({});
  const [payDate, setPayDate] = useState<string>(() => toDateInput(new Date()));
  const [payValue, setPayValue] = useState<string>("");
  const [payDefaultTab, setPayDefaultTab] = useState<"selecionar" | "arquivos">("selecionar");

  /* Recibo */
  const [reciboDate, setReciboDate] = useState<string>(() => toDateInput(new Date()));
  const [reciboImpostoPct, setReciboImpostoPct] = useState<string>("6,00");
  const [reciboVendor, setReciboVendor] = useState<string>("all");

  /* Comissões pagas (accordion) */
  const [showPaid, setShowPaid] = useState(false);

  /* Bases */
  useEffect(() => {
    (async () => {
      const [{ data: u }, { data: st }, { data: us }] = await Promise.all([
        supabase
          .from("users")
          .select("id, auth_user_id, nome, email, phone, cep, logradouro, numero, bairro, cidade, uf, pix_key, pix_type")
          .order("nome", { ascending: true }),
        supabase.from("sim_tables").select("id, segmento, nome_tabela").order("segmento", { ascending: true }),
        supabase.from("users_secure").select("id, nome, email, logradouro, numero, bairro, cidade, uf, pix_key, cpf, cpf_mascarado"),
      ]);
      setUsers((u || []) as User[]);
      setSimTables((st || []) as SimTable[]);
      setUsersSecure((us || []) as UserSecure[]);
    })();
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

      // === PATCH B: Reconciliar status com base nas parcelas (UI + tentativa silenciosa no banco)
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
  /* ====== Registrar pagamento ====== */
  async function paySelectedParcels(payload: {
    data_pagamento_vendedor?: string;
    valor_pago_vendedor?: number;
  }) {
    if (!payCommissionId) return;
    const selectedIds = Object.entries(paySelected)
      .filter(([_, checked]) => checked)
      .map(([id]) => id);

    if (!selectedIds.length) {
      alert("Selecione ao menos uma parcela para registrar o pagamento.");
      return;
    }

    const flowSel = payFlow.filter((f) => selectedIds.includes(f.id));
    const allPaidAfter = payFlow.every((f) => {
      const prevPago = Number(f.valor_pago_vendedor) || 0;
      const novoPago =
        selectedIds.includes(f.id) && payload.valor_pago_vendedor
          ? payload.valor_pago_vendedor
          : prevPago;
      return novoPago > 0;
    });

    // Atualiza parcelas
    for (const f of flowSel) {
      const { error } = await supabase
        .from("commission_flow")
        .update({
          data_pagamento_vendedor: payload.data_pagamento_vendedor || toDateInput(new Date()),
          valor_pago_vendedor: payload.valor_pago_vendedor ?? 0,
        })
        .eq("id", f.id);
      if (error) console.warn("Erro ao atualizar parcela:", error.message);
    }

    // === PATCH A: Atualiza commission + fallback se falhar ===
    const { error: updErr } = await supabase
      .from("commissions")
      .update({
        status: allPaidAfter ? "pago" : "a_pagar",
        data_pagamento: allPaidAfter
          ? (payload.data_pagamento_vendedor || toDateInput(new Date()))
          : null,
      })
      .eq("id", payCommissionId);

    if (updErr) {
      console.warn("[commissions.update] falhou:", updErr.message);
      alert(
        "A comissão foi paga, mas não consegui atualizar o status no banco (policies/RLS?). Vou ajustar a UI mesmo assim."
      );
    }

    // Atualiza UI local
    setRows((prev) =>
      prev.map((r) =>
        r.id === payCommissionId
          ? {
              ...r,
              status: allPaidAfter ? "pago" : "a_pagar",
              data_pagamento: allPaidAfter
                ? payload.data_pagamento_vendedor || toDateInput(new Date())
                : r.data_pagamento,
              flow: r.flow?.map((f) =>
                selectedIds.includes(f.id)
                  ? {
                      ...f,
                      data_pagamento_vendedor:
                        payload.data_pagamento_vendedor || toDateInput(new Date()),
                      valor_pago_vendedor: payload.valor_pago_vendedor ?? 0,
                    }
                  : f
              ),
            }
          : r
      )
    );

    setOpenPay(false);
    setShowPaid(allPaidAfter);
    setStatus(allPaidAfter ? "pago" : "a_pagar");
    setPaySelected({});
    setPayFlow([]);
  }

  /* ====== Abrir modal pagamento ====== */
  function openPaymentFor(r: Commission & { flow?: CommissionFlow[] }) {
    setPayCommissionId(r.id);
    setPayFlow(r.flow || []);
    // Sem pré-selecionar parcelas (atende seu pedido)
    setPaySelected({});
    setPayDate(toDateInput(new Date()));
    setPayValue("");
    setOpenPay(true);
  }

  /* ====== Exportar CSV ====== */
  function exportCSV() {
    const header = [
      "Data Venda",
      "Vendedor",
      "Segmento",
      "Tabela",
      "Administradora",
      "Crédito",
      "% Comissão",
      "Valor Comissão",
      "Status",
      "Data Pagto",
      "Cliente",
      "Proposta",
    ];
    const rowsCsv = rows.map((r) => [
      r.data_venda,
      userLabel(r.vendedor_id),
      r.segmento,
      r.tabela,
      r.administradora,
      r.valor_venda,
      r.percent_aplicado,
      r.valor_total,
      r.status,
      r.data_pagamento,
      r.cliente_nome || "",
      r.numero_proposta || "",
    ]);
    const csv = [header, ...rowsCsv].map((r) => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "comissoes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ====== Filtros ====== */
  const segmentos = useMemo(() => {
    const all = Array.from(new Set(rows.map((r) => r.segmento).filter(Boolean)));
    return ["all", ...all];
  }, [rows]);
  const tabelas = useMemo(() => {
    const all = Array.from(new Set(rows.map((r) => r.tabela).filter(Boolean)));
    return ["all", ...all];
  }, [rows]);

  /* ====== Métricas ====== */
  const metricas = useMemo(() => {
    const total = sum(rows.map((r) => r.valor_total));
    const pagos = sum(rows.filter((r) => r.status === "pago").map((r) => r.valor_total));
    const pendentes = total - pagos;
    const pct = total ? (pagos / total) * 100 : 0;
    return { total, pagos, pendentes, pct };
  }, [rows]);

  const aPagar = useMemo(() => rows.filter((r) => r.status === "a_pagar"), [rows]);
  const pagas = useMemo(() => rows.filter((r) => r.status === "pago"), [rows]);

  /* ====== Render ====== */
  if (loading)
    return (
      <div className="flex justify-center items-center h-80">
        <Loader2 className="w-8 h-8 animate-spin text-[#A11C27]" />
      </div>
    );

  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Gestão de Comissões</h1>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportCSV} variant="outline" className="flex items-center gap-2">
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
          <Button onClick={fetchData} variant="outline" className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4" /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{BRL(metricas.total)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pagos</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-[#1E293F]">
            {BRL(metricas.pagos)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pendentes</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-[#A11C27]">
            {BRL(metricas.pendentes)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Progresso</CardTitle>
          </CardHeader>
          <CardContent>
            <RadialDual
              paidPct={metricas.pct}
              label="Progresso"
              paidHint={BRL(metricas.pagos)}
              pendHint={BRL(metricas.pendentes)}
            />
          </CardContent>
        </Card>
      </div>
      {/* ====== Tabelas ====== */}
      <Tabs value={status} onValueChange={(v) => setStatus(v as any)}>
        <TabsList className="mb-4">
          <TabsTrigger value="a_pagar">Detalhamento de Comissões a Pagar</TabsTrigger>
          <TabsTrigger value="pago">Comissões Pagas</TabsTrigger>
        </TabsList>

        {/* ====== A PAGAR ====== */}
        <TabsContent value="a_pagar">
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-[1100px] w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2 text-left">Vendedor</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Proposta</th>
                  <th className="p-2 text-left">Segmento</th>
                  <th className="p-2 text-left">Tabela</th>
                  <th className="p-2 text-right">Crédito</th>
                  <th className="p-2 text-right">% Comissão</th>
                  <th className="p-2 text-right">Valor Comissão</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Ações</th>
                </tr>
              </thead>
              <tbody>
                {aPagar.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-4 text-gray-500 text-center">
                      Nenhuma comissão pendente.
                    </td>
                  </tr>
                )}
                {aPagar.map((r) => {
                  const isConfirm = hasRegisteredButUnpaid(r.flow);
                  return (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">{r.data_venda ? formatISODateBR(r.data_venda) : "—"}</td>
                      <td className="p-2">{userLabel(r.vendedor_id)}</td>
                      <td className="p-2">{r.cliente_nome || "—"}</td>
                      <td className="p-2">{r.numero_proposta || "—"}</td>
                      <td className="p-2">{r.segmento || "—"}</td>
                      <td className="p-2">{r.tabela || "—"}</td>
                      <td className="p-2 text-right">{BRL(r.valor_venda ?? 0)}</td>
                      <td className="p-2 text-right">{pct100(r.percent_aplicado)}</td>
                      <td className="p-2 text-right">{BRL(r.valor_total)}</td>
                      <td className="p-2 capitalize">{r.status}</td>
                      <td className="p-2">
                        <Button
                          size="sm"
                          className={
                            isConfirm
                              ? "bg-[#1E293F] hover:bg-[#152031] text-white"
                              : "bg-[#A11C27] hover:bg-[#8e1822] text-white"
                          }
                          onClick={() => openPaymentFor(r)}
                        >
                          <DollarSign className="w-4 h-4 mr-1" />
                          {isConfirm ? "Confirmar Pagamento" : "Registrar Pagamento"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ====== PAGAS ====== */}
        <TabsContent value="pago">
          {/* Campo de pesquisa */}
          <div className="flex flex-col md:flex-row justify-between gap-2 mb-3">
            <Input
              placeholder="Buscar por nome ou número da proposta..."
              onChange={(e) => setSearch(e.target.value)}
              value={search}
              className="max-w-sm"
            />
          </div>

          {/* Paginação */}
          {paginated.length > 0 && (
            <div className="flex justify-between items-center text-sm mb-2">
              <span>
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}

          {/* Tabela */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-[1000px] w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2 text-left">Data Pagamento</th>
                  <th className="p-2 text-left">Vendedor</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Proposta</th>
                  <th className="p-2 text-left">Segmento</th>
                  <th className="p-2 text-left">Tabela</th>
                  <th className="p-2 text-right">Valor Comissão</th>
                  <th className="p-2 text-left">Recibo</th>
                  <th className="p-2 text-left">Comprovante</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-4 text-center text-gray-500">
                      Nenhuma comissão paga encontrada.
                    </td>
                  </tr>
                ) : (
                  paginated.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">{r.data_pagamento ? formatISODateBR(r.data_pagamento) : "—"}</td>
                      <td className="p-2">{userLabel(r.vendedor_id)}</td>
                      <td className="p-2">{r.cliente_nome || "—"}</td>
                      <td className="p-2">{r.numero_proposta || "—"}</td>
                      <td className="p-2">{r.segmento || "—"}</td>
                      <td className="p-2">{r.tabela || "—"}</td>
                      <td className="p-2 text-right">{BRL(r.valor_total)}</td>
                      <td className="p-2">
                        {r.recibo_url ? (
                          <a href={r.recibo_url} target="_blank" className="text-blue-600 hover:underline">
                            Abrir Recibo
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2">
                        {r.comprovante_url ? (
                          <a href={r.comprovante_url} target="_blank" className="text-blue-600 hover:underline">
                            Abrir Comprovante
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ====== MODAL PAGAMENTO ====== */}
      <Dialog open={openPay} onOpenChange={setOpenPay}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Data do Pagamento</Label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Valor Pago ao Vendedor</Label>
              <Input
                placeholder="Ex: 1.000,00"
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
                      : 0,
                  })
                }
              >
                <Save className="w-4 h-4 mr-1" /> Salvar
              </Button>
            </div>
          </div>

          <div className="text-xs text-gray-600 mt-2">
            Selecione apenas as parcelas que deseja pagar agora.
          </div>

          <div className="overflow-x-auto mt-3">
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
                {payFlow.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-3 text-center text-gray-500">
                      Nenhuma parcela encontrada.
                    </td>
                  </tr>
                )}
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

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenPay(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
