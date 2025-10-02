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
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
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
const formatISODateBR = (iso?: string | null) => (!iso ? "—" : iso.split("-").reverse().join("/"));
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
    (f) => (Number(f.percentual) || 0) > 0 && !!f.data_pagamento_vendedor && (Number(f.valor_pago_vendedor) || 0) === 0
  );
}
function isFullyPaid(flow?: CommissionFlow[]) {
  if (!flow) return false;
  const relevant = flow.filter((f) => (Number(f.percentual) || 0) > 0);
  return relevant.length > 0 && relevant.every((f) => (Number(f.valor_pago_vendedor) || 0) > 0);
}

/* ========================= Doughnut moderno ========================= */
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

  // estilos (Consulmax)
  const navy = "#1E293F";   // pago
  const red = "#A11C27";    // pendente

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const paidLen = (paidPct / 100) * circumference;
  const pendLen = circumference - paidLen;

  return (
    <div className="flex items-center gap-3 p-3 border rounded-xl bg-white">
      <div className="relative">
        <svg width="160" height="160" className="-rotate-90" role="img" aria-label={label}>
          {/* fundo */}
          <circle cx="80" cy="80" r={radius} stroke="#e5e7eb" strokeWidth="22" fill="none" />
          {/* pago */}
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
            style={{ transition: "all .2s ease", filter: hover === "paid" ? "drop-shadow(0 2px 4px rgba(0,0,0,.25))" : "none" }}
          />
          {/* pendente (offset para começar após o pago) */}
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
            style={{ transition: "all .2s ease", filter: hover === "pend" ? "drop-shadow(0 2px 4px rgba(0,0,0,.25))" : "none" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-xl font-bold">{total === 0 ? "0%" : `${paidPct.toFixed(0)}%`}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        </div>
      </div>
      <div className="text-sm">
        <div className="mb-1">
          <span className="inline-block w-3 h-3 rounded-sm mr-2" style={{ background: navy }} />
          <span className="font-medium">Pago</span>
          <span className="ml-2 text-gray-600">{hover === "paid" ? hoverPaidText : BRL(paid)}</span>
        </div>
        <div>
          <span className="inline-block w-3 h-3 rounded-sm mr-2" style={{ background: red }} />
          <span className="font-medium">A pagar</span>
          <span className="ml-2 text-gray-600">{hover === "pend" ? hoverPendText : BRL(pending)}</span>
        </div>
      </div>
    </div>
  );
}

      <div className="text-sm">
        <div className="mb-1">
          <span className="inline-block w-3 h-3 rounded-sm mr-2" style={{ background: navy }} />
          <span className="font-medium">Pago</span>
          <span className="ml-2 text-gray-600">{hover === "paid" ? hoverPaidText : BRL(paid)}</span>
        </div>
        <div>
          <span className="inline-block w-3 h-3 rounded-sm mr-2" style={{ background: red }} />
          <span className="font-medium">A pagar</span>
          <span className="ml-2 text-gray-600">{hover === "pend" ? hoverPendText : BRL(pending)}</span>
        </div>
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
  const [ruleRows, setRuleRows] = useState<(CommissionRule & { segmento: string; nome_tabela: string; administradora?: string | null })[]>([]);
