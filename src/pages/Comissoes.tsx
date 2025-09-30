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

      // Reconciliar status com base nas parcelas (UI + tentativa silenciosa no banco)
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
  /* ========================= Funções ========================= */
  useEffect(() => {
    fetchData();
  }, [status, vendedorId, segmento, tabela]);

  async function paySelectedParcels(payload: {
    data_pagamento_vendedor?: string;
    valor_pago_vendedor?: number;
  }) {
    if (!payCommissionId) return;
    const selectedIds = Object.entries(paySelected)
      .filter(([_, v]) => v)
      .map(([id]) => id);
    if (!selectedIds.length) return alert("Selecione ao menos uma parcela para pagar.");

    // Atualizar as parcelas selecionadas
    const { error } = await supabase
      .from("commission_flow")
      .update({
        data_pagamento_vendedor: payload.data_pagamento_vendedor || toDateInput(new Date()),
        valor_pago_vendedor: payload.valor_pago_vendedor || 0,
      })
      .in("id", selectedIds);

    if (error) {
      console.error("[commission_flow.update] erro:", error);
      alert("Erro ao atualizar parcelas: " + error.message);
      return;
    }

    // Buscar as parcelas restantes dessa comissão
    const { data: allFlow } = await supabase
      .from("commission_flow")
      .select("*")
      .eq("commission_id", payCommissionId);

    const isAllPaid = (allFlow || []).every(
      (f) => (Number(f.percentual) || 0) === 0 || (Number(f.valor_pago_vendedor) || 0) > 0
    );

    // PATCH A — checa erro e fallback
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

    // Atualiza UI
    setRows((prev) =>
      prev.map((r) =>
        r.id === payCommissionId
          ? {
              ...r,
              status: isAllPaid ? "pago" : "a_pagar",
              data_pagamento: isAllPaid ? (payload.data_pagamento_vendedor || toDateInput(new Date())) : null,
              flow: (allFlow || []).map((f) =>
                selectedIds.includes(f.id)
                  ? {
                      ...f,
                      valor_pago_vendedor: payload.valor_pago_vendedor || 0,
                      data_pagamento_vendedor: payload.data_pagamento_vendedor || toDateInput(new Date()),
                    }
                  : f
              ),
            }
          : r
      )
    );

    setShowPaid(true);
    setStatus(isAllPaid ? "pago" : "a_pagar");
  }

  /* =============== Exportar CSV =============== */
  function exportCSV() {
    const header = [
      "data_venda",
      "vendedor",
      "segmento",
      "tabela",
      "administradora",
      "valor_venda",
      "percent_aplicado",
      "valor_total",
      "status",
      "data_pagamento",
    ];

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
      ].join(",")
    );

    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "comissoes_all.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* =============== Abrir modal pagamento =============== */
  async function openPaymentFor(r: Commission & { flow?: CommissionFlow[] }) {
    setPayCommissionId(r.id);
    setPayFlow(r.flow || []);
    // Desmarcado por padrão
    const initSel: Record<string, boolean> = {};
    (r.flow || []).forEach((f) => (initSel[f.id] = false));
    setPaySelected(initSel);
    setPayDate(toDateInput(new Date()));
    setPayValue("");
    setOpenPay(true);
  }

  /* =============== Renderização =============== */
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchStatus = status === "all" || r.status === status;
      const matchVend = vendedorId === "all" || r.vendedor_id === vendedorId;
      const matchSeg = segmento === "all" || r.segmento === segmento;
      const matchTab = tabela === "all" || (r.tabela || "") === tabela;
      return matchStatus && matchVend && matchSeg && matchTab;
    });
  }, [rows, status, vendedorId, segmento, tabela]);

  const aPagar = filteredRows.filter((r) => r.status === "a_pagar");
  const pagas = filteredRows.filter((r) => r.status === "pago");
  const somaPagar = sum(aPagar.map((r) => r.valor_total || 0));
  const somaPagas = sum(pagas.map((r) => r.valor_total || 0));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Comissões</h1>
        <div className="flex gap-2">
          <Button onClick={fetchData} variant="outline">
            <RotateCcw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
          <Button onClick={exportCSV} variant="outline">
            <FileText className="w-4 h-4 mr-1" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* ====== MÉTRICAS ====== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <RadialDual
          paidPct={(somaPagas / (somaPagar + somaPagas)) * 100 || 0}
          label="Status Geral"
          paidHint={BRL(somaPagas)}
          pendHint={BRL(somaPagar)}
          tagline="Pago × A Pagar"
        />
        <div className="p-3 border rounded-xl">
          <div className="text-sm text-gray-500">Pagas</div>
          <div className="text-xl font-bold">{BRL(somaPagas)}</div>
        </div>
        <div className="p-3 border rounded-xl">
          <div className="text-sm text-gray-500">A pagar</div>
          <div className="text-xl font-bold">{BRL(somaPagar)}</div>
        </div>
      </div>

      {/* ====== ABA PRINCIPAL ====== */}
      <Tabs defaultValue="a_pagar">
        <TabsList>
          <TabsTrigger value="a_pagar">Detalhamento de Comissões a Pagar</TabsTrigger>
          <TabsTrigger value="pago" onClick={() => setShowPaid(true)}>Comissões Pagas</TabsTrigger>
        </TabsList>
        <TabsContent value="a_pagar">
          <div className="overflow-x-auto rounded-lg border">
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
                {aPagar.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-4 text-gray-500">
                      Sem registros.
                    </td>
                  </tr>
                )}
                {aPagar.map((r) => {
                  const registeredButUnpaid = (r.flow || []).some(
                    (f) =>
                      (Number(f.percentual) || 0) > 0 &&
                      !!f.data_pagamento_vendedor &&
                      (Number(f.valor_pago_vendedor) || 0) === 0
                  );
                  const isConfirm = registeredButUnpaid;
                  return (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">{r.data_venda ? formatISODateBR(r.data_venda) : "—"}</td>
                      <td className="p-2">{userLabel(r.vendedor_id)}</td>
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
                            className={
                              // Azul escuro (Consulmax) para "Confirmar", Vermelho atual para "Registrar"
                              isConfirm
                                ? "bg-[#1E293F] hover:bg-[#152031] text-white"
                                : "bg-[#A11C27] hover:bg-[#8e1822] text-white"
                            }
                            onClick={() => openPaymentFor(r)}
                          >
                            <DollarSign className="w-4 h-4 mr-1" />
                            {isConfirm ? "Confirmar Pagamento" : "Registrar Pagamento"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="pago">
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-[900px] w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2 text-left">Data Pagto</th>
                  <th className="p-2 text-left">Vendedor</th>
                  <th className="p-2 text-left">Segmento</th>
                  <th className="p-2 text-left">Tabela</th>
                  <th className="p-2 text-right">Valor Comissão</th>
                </tr>
              </thead>
              <tbody>
                {pagas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-gray-500">
                      Nenhum pagamento encontrado.
                    </td>
                  </tr>
                )}
                {pagas.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="p-2">{r.data_pagamento ? formatISODateBR(r.data_pagamento) : "—"}</td>
                    <td className="p-2">{userLabel(r.vendedor_id)}</td>
                    <td className="p-2">{r.segmento || "—"}</td>
                    <td className="p-2">{r.tabela || "—"}</td>
                    <td className="p-2 text-right">{BRL(r.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ====== MODAL PAGAMENTO ====== */}
      <Dialog open={openPay} onOpenChange={setOpenPay}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Registrar pagamento ao vendedor</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Data do pagamento</Label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
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
                      : 0,
                  })
                }
              >
                <Save className="w-4 h-4 mr-1" />
                Salvar
              </Button>
            </div>
          </div>

          <div className="text-xs text-gray-600 mt-2">
            Dica: selecione somente a(s) parcela(s) que deseja pagar agora. Nada vem marcado por padrão.
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
                    <td colSpan={6} className="p-3 text-gray-500">
                      Nenhuma parcela para esta comissão.
                    </td>
                  </tr>
                )}
                {payFlow.map((f) => (
                  <tr key={f.id} className="border-b">
                    <td className="p-2">
                      <Checkbox
                        checked={!!paySelected[f.id]}
                        onCheckedChange={(v) =>
                          setPaySelected((s) => ({ ...s, [f.id]: !!v }))
                        }
                      />
                    </td>
                    <td className="p-2">M{f.mes}</td>
                    <td className="p-2">{pct100(f.percentual)}</td>
                    <td className="p-2 text-right">{BRL(f.valor_previsto)}</td>
                    <td className="p-2 text-right">{BRL(f.valor_pago_vendedor)}</td>
                    <td className="p-2">
                      {f.data_pagamento_vendedor
                        ? formatISODateBR(f.data_pagamento_vendedor)
                        : "—"}
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
