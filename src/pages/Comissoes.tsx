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

  /* NOVO: Busca e Paginação em Comissões Pagas */
  const [paidSearch, setPaidSearch] = useState<string>("");
  const [paidPage, setPaidPage] = useState<number>(1);
  const paidPerPage = 10;

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

  /* Totais/KPIs */
  const now = new Date();
  const yStart = new Date(now.getFullYear(), 0, 1);
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), 1);
  const isBetween = (iso?: string | null, s?: Date, e?: Date) =>
    iso ? new Date(iso + "T00:00:00").getTime() >= (s?.getTime() || 0) &&
      new Date(iso + "T00:00:00").getTime() <= (e?.getTime() || now.getTime()) : false;
  const impostoFrac = useMemo(() => (parseFloat(reciboImpostoPct.replace(",", ".")) || 0) / 100, [reciboImpostoPct]);
  function totalsInRange2(s: Date, e: Date) {
    const rowsPeriodo = rows.filter((r) => isBetween(r.data_venda || undefined, s, e));
    const totalBruta = sum(rowsPeriodo.map((r) => r.valor_total));
    const totalLiquida = totalBruta * (1 - impostoFrac);
    const pagoLiquido = sum(
      rowsPeriodo.flatMap((r) =>
        (r.flow || [])
          .filter((f) => isBetween(f.data_pagamento_vendedor || undefined, s, e))
          .map((f) => (f.valor_pago_vendedor ?? 0) * (1 - impostoFrac)),
      ),
    );
    const pendente = clamp0(totalLiquida - pagoLiquido);
    const pct = totalLiquida > 0 ? (pagoLiquido / totalLiquida) * 100 : 0;
    return { totalBruta, totalLiquida, pagoLiquido, pendente, pct };
  }
  const kpi = useMemo(() => {
    const comBruta = sum(rows.map((r) => r.valor_total));
    const comLiquida = comBruta * (1 - impostoFrac);
    const pagoLiquido = sum(rows.flatMap((r) => (r.flow || []).map((f) => (f.valor_pago_vendedor ?? 0) * (1 - impostoFrac))));
    const comPendente = clamp0(comLiquida - pagoLiquido);
    const vendasTotal = sum(rows.map((r) => r.valor_venda ?? r.base_calculo));
    return { vendasTotal, comBruta, comLiquida, comPaga: pagoLiquido, comPendente };
  }, [rows, impostoFrac]);
  const range5y = totalsInRange2(fiveYearsAgo, now);
  const rangeY = totalsInRange2(yStart, now);
  const rangeM = totalsInRange2(mStart, now);
  const vendedorAtual = useMemo(() => userLabel(vendedorId === "all" ? null : vendedorId), [usersById, usersByAuth, vendedorId]);
  /* Regras — utilitários */
  function onChangeMeses(n: number) {
    setRuleMeses(n);
    const arr = [...ruleFluxoPct];
    if (n > arr.length) { while (arr.length < n) arr.push("0,00"); } else arr.length = n;
    setRuleFluxoPct(arr);
  }
  const fluxoSomaPct = useMemo(() => ruleFluxoPct.reduce((a, b) => a + (parseFloat((b || "0").replace(",", ".")) || 0), 0), [ruleFluxoPct]);
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
    setRuleRows(rules.map((r) => ({
      ...(r as CommissionRule),
      segmento: bySt[r.sim_table_id]?.segmento || "-",
      nome_tabela: bySt[r.sim_table_id]?.nome_tabela || "-",
    })));
  }
  useEffect(() => { if (openRules) fetchRulesForVendor(ruleVendorId); }, [openRules, ruleVendorId]);
  async function saveRule() {
    if (!ruleVendorId || !ruleSimTableId) return alert("Selecione vendedor e tabela.");
    const padraoPctPercent = parseFloat((rulePercent || "0").replace(",", "."));
    const somaFluxo = fluxoSomaPct;
    if (Math.abs(somaFluxo - 1.0) > 1e-6)
      return alert(`Soma do fluxo (M1..Mn) deve ser 1,00 (100%). Soma atual = ${somaFluxo.toFixed(2).replace(".", ",")}`);
    const percent_padrao_frac = padraoPctPercent / 100;
    const fluxo_percentuais_frac = ruleFluxoPct.map((x) => parseFloat((x || "0").replace(",", ".")) || 0);
    const { error } = await supabase
      .from("commission_rules")
      .upsert(
        { vendedor_id: ruleVendorId, sim_table_id: ruleSimTableId, percent_padrao: percent_padrao_frac, fluxo_meses: ruleMeses, fluxo_percentuais: fluxo_percentuais_frac, obs: ruleObs || null, },
        { onConflict: "vendedor_id,sim_table_id" },
      );
    if (error) return alert(error.message);
    await fetchRulesForVendor(ruleVendorId);
    alert("Regra salva.");
  }
  async function deleteRule(vId: string, stId: string) {
    if (!confirm("Excluir esta regra?")) return;
    const { error } = await supabase.from("commission_rules").delete().eq("vendedor_id", vId).eq("sim_table_id", stId);
    if (error) return alert(error.message);
    await fetchRulesForVendor(vId);
  }
  function loadRuleToForm(r: CommissionRule & { segmento: string; nome_tabela: string }) {
    setRuleVendorId(r.vendedor_id);
    setRuleSimTableId(r.sim_table_id);
    setRulePercent(((r.percent_padrao || 0) * 100).toFixed(2).replace(".", ","));
    setRuleMeses(r.fluxo_meses);
    setRuleFluxoPct(r.fluxo_percentuais.map((p) => p.toFixed(2).replace(".", ",")));
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

    ...
  /* ========================= Funções de Pagamento ========================= */
  async function openPaymentFor(r: Commission & { flow?: CommissionFlow[] }) {
    setPayCommissionId(r.id);
    setPayFlow((r.flow || []).map((f) => ({
      ...f,
      _valor_previsto_calc: (r.valor_total || 0) * (f.percentual || 0),
    })));
    setPayDate(toDateInput(new Date()));
    setPayValue("");
    // ✅ não pré-seleciona parcelas automaticamente
    setPaySelected({});
    setPayDefaultTab("selecionar");
    setOpenPay(true);
  }

  async function paySelectedParcels(payload: {
    data_pagamento_vendedor?: string;
    valor_pago_vendedor?: number;
    recibo_file?: File | null;
    comprovante_file?: File | null;
  }) {
    const ids = Object.entries(paySelected)
      .filter(([_, v]) => v)
      .map(([id]) => id);
    if (!ids.length && !payload.recibo_file && !payload.comprovante_file)
      return alert("Selecione pelo menos uma parcela ou envie um arquivo.");

    const updates = payFlow.filter((f) => ids.includes(f.id));
    const totalValorPrevisto = sum(updates.map((f) => f._valor_previsto_calc || 0));
    const valorPago = payload.valor_pago_vendedor ?? totalValorPrevisto;

    for (const f of updates) {
      const valor = f._valor_previsto_calc || 0;
      const perc = totalValorPrevisto > 0 ? valor / totalValorPrevisto : 1;
      const vPago = valorPago * perc;

      const { error } = await supabase
        .from("commission_flow")
        .update({
          valor_pago_vendedor: vPago,
          data_pagamento_vendedor: payload.data_pagamento_vendedor || toDateInput(new Date()),
        })
        .eq("id", f.id);
      if (error) console.warn("Erro ao atualizar flow:", error.message);
    }

    // upload de arquivos, se houver
    const uploadFile = async (file: File, col: "recibo_vendedor_url" | "comprovante_pagto_url") => {
      const ext = getExt(file.name);
      const path = `comissoes/${payCommissionId}/${col}-${Date.now()}${ext}`;
      const { error: upErr } = await supabase.storage.from("docs").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { error: linkErr } = await supabase.from("commission_flow").update({ [col]: path }).in("id", ids);
      if (linkErr) console.warn(`[${col}] falhou:`, linkErr.message);
    };
    try {
      if (payload.recibo_file) await uploadFile(payload.recibo_file, "recibo_vendedor_url");
      if (payload.comprovante_file) await uploadFile(payload.comprovante_file, "comprovante_pagto_url");
    } catch (e: any) {
      alert("Erro ao enviar arquivo: " + e.message);
    }

    // atualizar estado e reconciliar
    const freshArr = payFlow.map((f) =>
      ids.includes(f.id)
        ? {
            ...f,
            valor_pago_vendedor: (f._valor_previsto_calc || 0),
            data_pagamento_vendedor: payload.data_pagamento_vendedor || toDateInput(new Date()),
          }
        : f,
    );
    const isAllPaid = isFullyPaid(freshArr);

    // ✅ PATCH A — Atualização do status com checagem de erro
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
      alert(
        "A comissão foi paga, mas não consegui atualizar o status no banco (policies/RLS?). Vou ajustar a UI mesmo assim."
      );
    }

    // Atualiza a UI local
    setRows((prev) =>
      prev.map((r) =>
        r.id === payCommissionId
          ? {
              ...r,
              flow: freshArr,
              status: isAllPaid ? "pago" : isFullyPaid(freshArr) ? "pago" : "a_pagar",
              data_pagamento: isAllPaid
                ? payload.data_pagamento_vendedor || toDateInput(new Date())
                : r.data_pagamento,
            }
          : r
      )
    );

    setOpenPay(false);
    setShowPaid(true);
    setStatus(isAllPaid ? "pago" : "a_pagar");
  }

  /* ============== Renderização ============== */
  if (loading)
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        Carregando...
      </div>
    );

  /* ========================= UI ========================= */
  return (
    <div className="space-y-6">
      {/* === KPIs === */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RadialDual
          paidPct={rangeM.pct}
          label="Mês Atual"
          paidHint={`Pago: ${BRL(rangeM.pagoLiquido)}`}
          pendHint={`Pendente: ${BRL(rangeM.pendente)}`}
        />
        <RadialDual
          paidPct={rangeY.pct}
          label="Ano Corrente"
          paidHint={`Pago: ${BRL(rangeY.pagoLiquido)}`}
          pendHint={`Pendente: ${BRL(rangeY.pendente)}`}
        />
        <RadialDual
          paidPct={range5y.pct}
          label="5 Anos"
          paidHint={`Pago: ${BRL(range5y.pagoLiquido)}`}
          pendHint={`Pendente: ${BRL(range5y.pendente)}`}
        />
      </div>
      {/* === Detalhamento de Comissões (A pagar) === */}
      {rows.filter((r) => r.status === "a_pagar" && !isFullyPaid(r.flow)).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detalhamento de Comissões (a pagar)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2 text-left">Data Venda</th>
                  <th className="p-2 text-left">Vendedor</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Proposta</th>
                  <th className="p-2 text-left">Tabela</th>
                  <th className="p-2 text-left">Administradora</th>
                  <th className="p-2 text-right">Valor Venda</th>
                  <th className="p-2 text-right">Comissão</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.status === "a_pagar" && !isFullyPaid(r.flow))
                  .map((r) => {
                    const registeredUnpaid = hasRegisteredButUnpaid(r.flow);
                    const fullyPaid = isFullyPaid(r.flow);
                    return (
                      <tr key={r.id} className="border-b hover:bg-gray-50">
                        <td className="p-2">{formatISODateBR(r.data_venda)}</td>
                        <td className="p-2">{userLabel(r.vendedor_id)}</td>
                        <td className="p-2">{r.cliente_nome || "—"}</td>
                        <td className="p-2">{r.numero_proposta || "—"}</td>
                        <td className="p-2">{r.tabela || "—"}</td>
                        <td className="p-2">{r.administradora || "—"}</td>
                        <td className="p-2 text-right">{BRL(r.valor_venda)}</td>
                        <td className="p-2 text-right">{BRL(r.valor_total)}</td>
                        <td className="p-2">
                          {fullyPaid ? (
                            <span className="text-green-600 font-semibold">Pago</span>
                          ) : registeredUnpaid ? (
                            <span className="text-yellow-600 font-semibold">Aguardando Confirmação</span>
                          ) : (
                            <span className="text-red-600 font-semibold">A pagar</span>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className={
                                hasRegisteredButUnpaid(r.flow)
                                  ? "bg-[#1E293F] hover:bg-[#111827] text-white"
                                  : "bg-[#A11C27] hover:bg-[#7F0F1D] text-white"
                              }
                              onClick={() => openPaymentFor(r)}
                            >
                              <DollarSign className="w-4 h-4 mr-1" />
                              {hasRegisteredButUnpaid(r.flow)
                                ? "Confirmar Pagamento"
                                : "Registrar Pagamento"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* === Comissões Pagas === */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Comissões Pagas</span>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Buscar por vendedor, cliente ou nº proposta..."
                value={paidSearch}
                onChange={(e) => {
                  setPaidPage(1);
                  setPaidSearch(e.target.value);
                }}
                className="w-[320px]"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowPaid((v) => !v)}
              >
                {showPaid ? "Ocultar" : "Expandir"}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>

        {showPaid && (
          <CardContent className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-2 text-left">Data Pagto</th>
                  <th className="p-2 text-left">Vendedor</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Nº Proposta</th>
                  <th className="p-2 text-left">Parcela</th>
                  <th className="p-2 text-right">Valor Pago</th>
                  <th className="p-2 text-left">Arquivos</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .flatMap((r) =>
                    (r.flow || [])
                      .filter((f) => f.valor_pago_vendedor && f.valor_pago_vendedor > 0)
                      .map((f) => ({
                        flow: f,
                        comm: r,
                      }))
                  )
                  .filter(({ flow, comm }) => {
                    const q = paidSearch.toLowerCase().trim();
                    if (!q) return true;
                    const vendedor = userLabel(comm.vendedor_id).toLowerCase();
                    const cliente = (comm.cliente_nome || "").toLowerCase();
                    const proposta = (comm.numero_proposta || "").toLowerCase();
                    return (
                      vendedor.includes(q) ||
                      cliente.includes(q) ||
                      proposta.includes(q)
                    );
                  })
                  .sort((a, b) =>
                    (b.flow.data_pagamento_vendedor || "").localeCompare(
                      a.flow.data_pagamento_vendedor || ""
                    )
                  )
                  .slice((paidPage - 1) * paidPerPage, paidPage * paidPerPage)
                  .map(({ flow, comm }) => (
                    <tr key={flow.id} className="border-b">
                      <td className="p-2">
                        {formatISODateBR(flow.data_pagamento_vendedor)}
                      </td>
                      <td className="p-2">{userLabel(comm.vendedor_id)}</td>
                      <td className="p-2">{comm.cliente_nome || "—"}</td>
                      <td className="p-2">{comm.numero_proposta || "—"}</td>
                      <td className="p-2">M{flow.mes}</td>
                      <td className="p-2 text-right">
                        {BRL(flow.valor_pago_vendedor)}
                      </td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          {flow.recibo_vendedor_url && (
                            <a
                              className="underline text-blue-700"
                              href="#"
                              onClick={async (e) => {
                                e.preventDefault();
                                const { data } = await supabase.storage
                                  .from("docs")
                                  .createSignedUrl(
                                    flow.recibo_vendedor_url,
                                    60
                                  );
                                if (data?.signedUrl)
                                  window.open(data.signedUrl, "_blank");
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
                                const { data } = await supabase.storage
                                  .from("docs")
                                  .createSignedUrl(
                                    flow.comprovante_pagto_url,
                                    60
                                  );
                                if (data?.signedUrl)
                                  window.open(data.signedUrl, "_blank");
                              }}
                            >
                              Comprovante
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {/* Paginação */}
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-gray-600">
                Página {paidPage}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={paidPage === 1}
                  onClick={() => setPaidPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPaidPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
