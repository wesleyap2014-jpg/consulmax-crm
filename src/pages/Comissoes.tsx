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
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
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
  Undo2,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

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

/* Valor por extenso */
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
  const d = [
    "",
    "",
    "vinte",
    "trinta",
    "quarenta",
    "cinquenta",
    "sessenta",
    "setenta",
    "oitenta",
    "noventa",
  ];
  const c = [
    "",
    "cento",
    "duzentos",
    "trezentos",
    "quatrocentos",
    "quinhentos",
    "seiscentos",
    "setecentos",
    "oitocentos",
    "novecentos",
  ];
  const ext = (n0: number): string =>
    n0 < 20
      ? u[n0]
      : n0 < 100
      ? d[Math.floor(n0 / 10)] +
        (n0 % 10 ? " e " + u[n0 % 10] : "")
      : n0 === 100
      ? "cem"
      : c[Math.floor(n0 / 100)] +
        (n0 % 100 ? " e " + ext(n0 % 100) : "");
  const i = Math.floor(n);
  const ct = Math.round((n - i) * 100);
  return `${ext(i)} ${i === 1 ? "real" : "reais"}${
    ct ? ` e ${ext(ct)} ${ct === 1 ? "centavo" : "centavos"}` : ""
  }`;
}

/* ========================= Donut ========================= */
function Donut({
  paid,
  pending,
  label,
  hoverPaidText,
  hoverPendText,
}: {
  paid: number;
  pending: number;
  label: string;
  hoverPaidText: string;
  hoverPendText: string;
}) {
  const total = Math.max(0, paid + pending);
  const paidPct = total > 0 ? (paid / total) * 100 : 0;
  const [hover, setHover] = useState<"paid" | "pend" | null>(null);
  const navy = "#1E293F";
  const red = "#A11C27";
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const paidLen = (paidPct / 100) * circumference;
  const pendLen = circumference - paidLen;

  return (
    <div className="flex items-center gap-3 p-3 border rounded-xl bg-white">
      <div className="relative">
        <svg
          width="160"
          height="160"
          className="-rotate-90"
          role="img"
          aria-label={label}
        >
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="#e5e7eb"
            strokeWidth="22"
            fill="none"
          />
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke={navy}
            strokeWidth={hover === "paid" ? 26 : 22}
            fill="none"
            strokeDasharray={`${paidLen} ${circumference}`}
            strokeLinecap="butt"
            onMouseEnter={() => setHover("paid")}
            onMouseLeave={() => setHover(null)}
            style={{
              transition: "all .2s ease",
              filter:
                hover === "paid"
                  ? "drop-shadow(0 2px 4px rgba(0,0,0,.25))"
                  : "none",
            }}
          />
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke={red}
            strokeWidth={hover === "pend" ? 26 : 22}
            fill="none"
            strokeDasharray={`${pendLen} ${circumference}`}
            strokeDashoffset={-paidLen}
            strokeLinecap="butt"
            onMouseEnter={() => setHover("pend")}
            onMouseLeave={() => setHover(null)}
            style={{
              transition: "all .2s ease",
              filter:
                hover === "pend"
                  ? "drop-shadow(0 2px 4px rgba(0,0,0,.25))"
                  : "none",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-xl font-bold">
              {total === 0 ? "0%" : `${paidPct.toFixed(0)}%`}
            </div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        </div>
      </div>
      <div className="text-sm">
        <div className="mb-1">
          <span
            className="inline-block w-3 h-3 rounded-sm mr-2"
            style={{ background: navy }}
          />
          <span className="font-medium">Pago</span>
          <span className="ml-2 text-gray-600">
            {hover === "paid" ? hoverPaidText : BRL(paid)}
          </span>
        </div>
        <div>
          <span
            className="inline-block w-3 h-3 rounded-sm mr-2"
            style={{ background: red }}
          />
          <span className="font-medium">A pagar</span>
          <span className="ml-2 text-gray-600">
            {hover === "pend" ? hoverPendText : BRL(pending)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ========================= Página ========================= */
export default function ComissoesPage() {
  /* Controle de permissões */
  const [role, setRole] = useState<"admin" | "vendedor">("admin"); // ← depois substitui pelo valor real vindo do supabase.auth

  /* Filtros */
  const [vendedorId, setVendedorId] = useState<string>("all");
  const [status, setStatus] = useState<
    "all" | "a_pagar" | "pago" | "estorno"
  >("all");
  const [segmento, setSegmento] = useState<string>("all");
  const [tabela, setTabela] = useState<string>("all");

  /* Bases */
  const [users, setUsers] = useState<User[]>([]);
  const [usersSecure, setUsersSecure] = useState<UserSecure[]>([]);
  const [simTables, setSimTables] = useState<SimTable[]>([]);
  const [clientesMap, setClientesMap] = useState<Record<string, string>>({});
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
  const userLabel = (id?: string | null) => {
    if (!id) return "—";
    const u = usersById[id] || usersByAuth[id];
    return u?.nome?.trim() || u?.email?.trim() || id;
  };
  const canonUserId = (id?: string | null) =>
    id ? usersById[id]?.id || usersByAuth[id]?.id || null : null;

  /* Dados */
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<(Commission & { flow?: CommissionFlow[] })[]>(
    []
  );
  const [vendasSemCom, setVendasSemCom] = useState<Venda[]>([]);
  const [genBusy, setGenBusy] = useState<string | null>(null);

  /* Pagamento */
  const [openPay, setOpenPay] = useState(false);
  const [payCommissionId, setPayCommissionId] = useState<string>("");
  const [payFlow, setPayFlow] = useState<
    (CommissionFlow & { _valor_previsto_calc?: number })[]
  >([]);
  const [paySelected, setPaySelected] = useState<Record<string, boolean>>({});
  const [payDate, setPayDate] = useState<string>(() => toDateInput(new Date()));
  const [payValue, setPayValue] = useState<string>("");
  const [payDefaultTab, setPayDefaultTab] = useState<
    "selecionar" | "arquivos"
  >("selecionar");

  /* Recibo */
  const [reciboDate, setReciboDate] = useState<string>(() =>
    toDateInput(new Date())
  );
  const [reciboImpostoPct, setReciboImpostoPct] = useState<string>("6,00");
  const [reciboVendor, setReciboVendor] = useState<string>("all");

  /* Expand/Collapse */
  const [showPaid, setShowPaid] = useState(false);
  const [showUnpaid, setShowUnpaid] = useState(true);
  const [showVendasSem, setShowVendasSem] = useState(true);

  /* Busca/Paginação */
  const [paidSearch, setPaidSearch] = useState("");
  const [paidPage, setPaidPage] = useState(1);
  const pageSize = 15;

  /* Fetch principal */
  async function fetchData() {
    setLoading(true);
    try {
      let qb = supabase.from("commissions").select("*");
      if (status !== "all") qb = qb.eq("status", status);
      if (vendedorId !== "all") qb = qb.eq("vendedor_id", vendedorId);
      if (segmento !== "all") qb = qb.eq("segmento", segmento);
      if (tabela !== "all") qb = qb.eq("tabela", tabela);
      const { data: comms } = await qb.order("data_venda", {
        ascending: false,
      });

      const ids = (comms || []).map((c) => c.id);
      const { data: flows } = await supabase
        .from("commission_flow")
        .select("*")
        .in(
          "commission_id",
          ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]
        )
        .order("mes", { ascending: true });

      const flowBy: Record<string, CommissionFlow[]> = {};
      (flows || []).forEach((f) => {
        if (!flowBy[f.commission_id]) flowBy[f.commission_id] = [];
        flowBy[f.commission_id].push(f as CommissionFlow);
      });

      setRows(
        (comms || []).map((c: any) => ({
          ...(c as Commission),
          flow: flowBy[c.id] || [],
        }))
      );

      const { data: vendasPeriodo } = await supabase
        .from("vendas")
        .select(
          "id, data_venda, vendedor_id, segmento, tabela, administradora, valor_venda, numero_proposta, cliente_lead_id, lead_id"
        )
        .order("data_venda", { ascending: false });

      const { data: commVendaIds } = await supabase
        .from("commissions")
        .select("venda_id");
      const hasComm = new Set((commVendaIds || []).map((r: any) => r.venda_id));
      const vendasFiltered = (vendasPeriodo || []).filter(
        (v) => !hasComm.has(v.id)
      );

      setVendasSemCom(vendasFiltered as Venda[]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line
  }, [vendedorId, status, segmento, tabela]);

  /* Totais/KPIs */
  const now = new Date();
  const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), 1);
  const yStart = new Date(now.getFullYear(), 0, 1);
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const isBetween = (iso?: string | null, s?: Date, e?: Date) =>
    iso
      ? new Date(iso + "T00:00:00").getTime() >= (s?.getTime() || 0) &&
        new Date(iso + "T00:00:00").getTime() <=
          (e?.getTime() || now.getTime())
      : false;

  function totalsInRange(s: Date, e: Date) {
    const rowsPeriodo = rows.filter((r) => isBetween(r.data_venda || "", s, e));
    const totalBruta = sum(rowsPeriodo.map((r) => r.valor_total));
    const pagoLiquido = sum(
      rowsPeriodo.flatMap((r) =>
        (r.flow || []).map((f) => f.valor_pago_vendedor ?? 0)
      )
    );
    const pendente = clamp0(totalBruta - pagoLiquido);
    return { totalBruta, pagoLiquido, pendente };
  }

  const range5y = totalsInRange(fiveYearsAgo, now);
  const rangeY = totalsInRange(yStart, now);
  const rangeM = totalsInRange(mStart, now);

  /* ============== Render ================== */
  return (
    <div className="p-4 space-y-4">
      {/* KPIs / Relógios */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle>Nos últimos 5 anos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Metric title="Total Pago" value={BRL(range5y.pagoLiquido)} />
            <Donut
              paid={range5y.pagoLiquido}
              pending={0}
              label="5 anos"
              hoverPaidText={`Pago: ${BRL(range5y.pagoLiquido)}`}
              hoverPendText={`—`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle>No ano anterior</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Metric title="Total Pago" value={BRL(rangeY.pagoLiquido)} />
            <Donut
              paid={rangeY.pagoLiquido}
              pending={0}
              label="Ano anterior"
              hoverPaidText={`Pago: ${BRL(rangeY.pagoLiquido)}`}
              hoverPendText={`—`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle>No mês</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Metric title="Pago" value={BRL(rangeM.pagoLiquido)} />
            <Metric title="A pagar" value={BRL(rangeM.pendente)} />
            <Donut
              paid={rangeM.pagoLiquido}
              pending={rangeM.pendente}
              label="Mês"
              hoverPaidText={`Pago: ${BRL(rangeM.pagoLiquido)}`}
              hoverPendText={`A pagar: ${BRL(rangeM.pendente)}`}
            />
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Linhas */}
      <Card>
        <CardHeader>
          <CardTitle>Evolução de Recebimentos</CardTitle>
        </CardHeader>
        <CardContent style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <LineChart
              data={[
                { name: "Jan", recebido: 4000, aproj: 2400 },
                { name: "Fev", recebido: 3000, aproj: 1398 },
                { name: "Mar", recebido: 2000, aproj: 9800 },
              ]}
            >
              <CartesianGrid stroke="#ccc" />
              <XAxis dataKey="name" />
              <YAxis />
              <ReTooltip />
              <Legend />
              <Line type="monotone" dataKey="recebido" stroke="#1E293F" />
              <Line
                type="monotone"
                dataKey="aproj"
                stroke="#A11C27"
                strokeDasharray="5 5"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detalhamento de Comissões (a pagar) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Detalhamento de Comissões (a pagar)</span>
            <div className="flex gap-2 items-center">
              <Label>Vendedor</Label>
              <Select
                value={vendedorId}
                onValueChange={setVendedorId}
                disabled={role === "vendedor"}
              >
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
              <div>
                <Label>Data do Recibo</Label>
                <Input
                  type="date"
                  value={reciboDate}
                  onChange={(e) => setReciboDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Imposto (%)</Label>
                <Input
                  value={reciboImpostoPct}
                  onChange={(e) => setReciboImpostoPct(e.target.value)}
                  className="w-20"
                />
              </div>
              <Button onClick={() => setShowUnpaid((v) => !v)}>
                {showUnpaid ? "Ocultar" : "Expandir"}
              </Button>
              <Button
                onClick={() => {
                  downloadReceiptPDFPorData();
                }}
              >
                <FileText className="w-4 h-4 mr-1" />
                Recibo
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        {showUnpaid && (
          <CardContent className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2">Data</th>
                  <th className="p-2">Vendedor</th>
                  <th className="p-2">Cliente</th>
                  <th className="p-2">Nº Proposta</th>
                  <th className="p-2">Tabela</th>
                  <th className="p-2 text-right">Valor Comissão</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Pagamento</th>
                  {role === "admin" && <th className="p-2">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.status === "a_pagar")
                  .map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2">
                        {r.data_venda ? formatISODateBR(r.data_venda) : "—"}
                      </td>
                      <td className="p-2">{userLabel(r.vendedor_id)}</td>
                      <td className="p-2">{r.cliente_nome || "—"}</td>
                      <td className="p-2">{r.numero_proposta || "—"}</td>
                      <td className="p-2">{r.tabela || "—"}</td>
                      <td className="p-2 text-right">{BRL(r.valor_total)}</td>
                      <td className="p-2">{r.status}</td>
                      <td className="p-2">
                        {r.data_pagamento
                          ? formatISODateBR(r.data_pagamento)
                          : "—"}
                      </td>
                      {role === "admin" && (
                        <td className="p-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openPaymentFor(r)}
                            >
                              <DollarSign className="w-4 h-4 mr-1" />
                              Registrar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retornarComissao(r)}
                            >
                              <RotateCcw className="w-4 h-4 mr-1" />
                              Retornar
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>

      {/* Comissões Pagas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>Comissões Pagas</span>
            <div className="flex gap-2">
              <Input
                placeholder="Buscar nº proposta"
                value={paidSearch}
                onChange={(e) => {
                  setPaidSearch(e.target.value);
                  setPaidPage(1);
                }}
                className="w-[250px]"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowPaid((v) => !v)}
              >
                {showPaid ? "Ocultar" : "Expandir"}
              </Button>
              {role === "admin" && (
                <Button size="sm" variant="secondary" onClick={() => setOpenEstorno(true)}>
                  <Undo2 className="w-4 h-4 mr-1" /> Estorno
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        {showPaid && (
          <CardContent>
            <table className="min-w-[1000px] text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2">Data</th>
                  <th className="p-2">Vendedor</th>
                  <th className="p-2">Proposta</th>
                  <th className="p-2">Valor Pago</th>
                  <th className="p-2">Arquivos</th>
                </tr>
              </thead>
              <tbody>
                {pagosFiltered
                  .slice((paidPage - 1) * pageSize, paidPage * pageSize)
                  .map(({ comm, flow }) => (
                    <tr key={flow.id} className="border-b">
                      <td className="p-2">
                        {flow.data_pagamento_vendedor
                          ? formatISODateBR(flow.data_pagamento_vendedor)
                          : "—"}
                      </td>
                      <td className="p-2">{userLabel(comm.vendedor_id)}</td>
                      <td className="p-2">{comm.numero_proposta || "—"}</td>
                      <td className="p-2 text-right">
                        {BRL(flow.valor_pago_vendedor)}
                      </td>
                      <td className="p-2">
                        {flow.recibo_vendedor_url && (
                          <a
                            className="text-blue-600 underline"
                            href="#"
                            onClick={async (e) => {
                              e.preventDefault();
                              const u = await getSignedUrl(
                                flow.recibo_vendedor_url
                              );
                              if (u) window.open(u, "_blank");
                            }}
                          >
                            Recibo
                          </a>
                        )}
                        {flow.comprovante_pagto_url && (
                          <a
                            className="text-blue-600 underline ml-2"
                            href="#"
                            onClick={async (e) => {
                              e.preventDefault();
                              const u = await getSignedUrl(
                                flow.comprovante_pagto_url
                              );
                              if (u) window.open(u, "_blank");
                            }}
                          >
                            Comprovante
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>

      {/* Estorno Overlay */}
      <Dialog open={openEstorno} onOpenChange={setOpenEstorno}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Estorno</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Número da proposta"
              value={estornoProp}
              onChange={(e) => setEstornoProp(e.target.value)}
            />
            {estornoData && (
              <div className="text-sm space-y-2">
                <div>Proposta: {estornoData.numero_proposta}</div>
                <div>Total Pago: {BRL(estornoData.totalPago)}</div>
                <div>Imposto: {BRL(estornoData.imposto)}</div>
                <div>
                  Pago Líquido:{" "}
                  {BRL(estornoData.totalPago - estornoData.imposto)}
                </div>
                <div>
                  Valor Estorno:{" "}
                  <Input
                    value={valorEstorno}
                    onChange={(e) => setValorEstorno(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={confirmarEstorno} disabled={!valorEstorno}>
              <Save className="w-4 h-4 mr-1" /> Confirmar Estorno
            </Button>
          </DialogFooter>
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
