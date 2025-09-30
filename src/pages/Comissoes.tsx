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

/* ========================= Subcomponente simples ========================= */
const Metric: React.FC<{ title: string; value: string }> = ({ title, value }) => {
  return (
    <div className="p-3 rounded-xl border bg-white">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
};

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

      // Reconciliar status conforme parcelas (silencioso)
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

      if (rule && rule[0]) {
        const soma = (rule[0].fluxo_percentuais || []).reduce((a: number, b: number) => a + (b || 0), 0);
        if (rule[0].fluxo_meses > 0 && Math.abs(soma - 1) < 1e-6) {
          meses = rule[0].fluxo_meses;
          percentuais = rule[0].fluxo_percentuais;
        }
      }
    }

    const valorTotal = c.valor_total ?? ((c.base_calculo ?? 0) * (c.percent_aplicado ?? 0));
    const inserts = percentuais.map((p, idx) => ({
      commission_id: c.id,
      mes: idx + 1,
      percentual: p,
      valor_previsto: Math.round((valorTotal * p) * 100) / 100,
      valor_recebido_admin: null,
      data_recebimento_admin: null,
      valor_pago_vendedor: 0,
      data_pagamento_vendedor: null,
      recibo_vendedor_url: null,
      comprovante_pagto_url: null,
    }));

    const { error } = await supabase.from("commission_flow").insert(inserts as any[]);
    if (error) console.warn("[ensureFlowForCommission] erro ao inserir fluxo:", error.message);

    const { data: created } = await supabase
      .from("commission_flow")
      .select("*")
      .eq("commission_id", c.id)
      .order("mes", { ascending: true });

    return (created || []) as CommissionFlow[];
  }

  /* ========================= Funções de Pagamento ========================= */
  async function openPaymentFor(c: Commission) {
    setPayCommissionId(c.id);

    // Garante fluxo
    let { data } = await supabase
      .from("commission_flow")
      .select("*")
      .eq("commission_id", c.id)
      .order("mes", { ascending: true });
    if (!data || data.length === 0) {
      const created = await ensureFlowForCommission(c);
      data = created as any;
    }

    // cálculo correto (EXIBIÇÃO)
    const arr = (data || []).map((f: any) => ({
      ...f,
      _valor_previsto_calc: (c.valor_total ?? 0) * (f.percentual ?? 0),
    }));

    const uniq = new Map<number, CommissionFlow & { _valor_previsto_calc?: number }>();
    arr.forEach((f: any) => uniq.set(f.mes, f));
    const finalArr = Array.from(uniq.values());

    setPayFlow(finalArr);

    // NÃO pré-selecionar automaticamente (evita erro em fluxo 1x100%/múltiplas)
    setPaySelected({});

    // define a aba inicial: se já há data lançada sem valor -> "Arquivos"
    const registered = hasRegisteredButUnpaid(finalArr);
    setPayDefaultTab(registered ? "arquivos" : "selecionar");

    setPayDate(toDateInput(new Date()));
    setPayValue("");
    setOpenPay(true);
  }

  async function uploadToBucket(file: File, commissionId: string) {
    const path = `${commissionId}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage.from("comissoes").upload(path, file, { upsert: false });
    if (error) { alert("Falha ao enviar arquivo: " + error.message); return null; }
    return data?.path || null;
  }
  async function getSignedUrl(path: string | null | undefined) {
    if (!path) return null;
    const { data, error } = await supabase.storage.from("comissoes").createSignedUrl(path, 60 * 10);
    if (error) { console.warn("Signed URL error:", error.message); return null; }
    return (data as any)?.signedUrl || null;
  }

  async function paySelectedParcels(payload: {
    data_pagamento_vendedor?: string;
    valor_pago_vendedor?: number;
    recibo_file?: File | null;
    comprovante_file?: File | null;
  }) {
    // uploads
    let reciboPath: string | null = null, compPath: string | null = null;
    if (payload.recibo_file) reciboPath = await uploadToBucket(payload.recibo_file, payCommissionId);
    if (payload.comprovante_file) compPath = await uploadToBucket(payload.comprovante_file, payCommissionId);

    // candidatos relevantes
    const candidates = payFlow.filter((f) => (Number(f.percentual) || 0) > 0);

    // seleção explícita
    let selected = candidates.filter((f) => paySelected[f.id]);

    // …ou auto-seleção por data (aba Arquivos)
    if (!selected.length && payload.data_pagamento_vendedor) {
      selected = candidates.filter(
        (f) => (f.data_pagamento_vendedor || "") === payload.data_pagamento_vendedor
      );
    }

    // …fallback: se só há 1 pendente → seleciona; senão pega a primeira pendente
    if (!selected.length) {
      const unpaid = candidates.filter((f) => (Number(f.valor_pago_vendedor) || 0) === 0);
      if (unpaid.length === 1) selected = unpaid;
      else if (unpaid.length > 0) selected = [unpaid[0]];
    }

    if (!selected.length) {
      alert("Selecione pelo menos uma parcela (ou informe a data/arquivos).");
      return;
    }

    // UPDATE por id — não pisar valor pago sem input
    const toUpdate = selected.filter((f) => !!f.id);
    if (toUpdate.length) {
      for (const f of toUpdate) {
        const { error } = await supabase
          .from("commission_flow")
          .update({
            data_pagamento_vendedor:
              payload.data_pagamento_vendedor ||
              f.data_pagamento_vendedor ||
              toDateInput(new Date()),
            valor_pago_vendedor:
              payload.valor_pago_vendedor !== undefined
                ? payload.valor_pago_vendedor
                : (f.valor_pago_vendedor ?? 0),
            recibo_vendedor_url: (reciboPath || f.recibo_vendedor_url) ?? null,
            comprovante_pagto_url: (compPath || f.comprovante_pagto_url) ?? null,
          })
          .eq("id", f.id);
        if (error) { alert("Falha ao atualizar parcela: " + error.message); return; }
      }
    }

    // INSERT (sem id) — caso excepcional
    const toInsert = selected.filter((f) => !f.id);
    if (toInsert.length) {
      const inserts = toInsert.map((f) => ({
        commission_id: f.commission_id,
        mes: f.mes,
        percentual: f.percentual ?? 0,
        valor_previsto: f.valor_previsto ?? 0,
        data_pagamento_vendedor: payload.data_pagamento_vendedor || toDateInput(new Date()),
        valor_pago_vendedor:
          payload.valor_pago_vendedor !== undefined ? payload.valor_pago_vendedor : 0,
        recibo_vendedor_url: reciboPath || null,
        comprovante_pagto_url: compPath || null,
      }));
      const { error } = await supabase.from("commission_flow").insert(inserts);
      if (error) { alert("Falha ao inserir parcela: " + error.message); return; }
    }

    // === Recalcular status da comissão
    const { data: fresh } = await supabase
      .from("commission_flow")
      .select("*")
      .eq("commission_id", payCommissionId)
      .order("mes", { ascending: true });

    const relevant = (fresh || []).filter((f) => (Number(f.percentual) || 0) > 0);
    const isAllPaid =
      relevant.length > 0 &&
      relevant.every((f) => (Number(f.valor_pago_vendedor) || 0) > 0);

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

    // Estado/local
    const uniq = new Map<number, CommissionFlow>();
    (fresh || []).forEach((f: any) => uniq.set(f.mes, f));
    const freshArr = Array.from(uniq.values()) as CommissionFlow[];
    setPayFlow(freshArr);
    setRows((prev) =>
      prev.map((r) =>
        r.id === payCommissionId
          ? { ...r, flow: freshArr, status: isAllPaid ? "pago" : "a_pagar" }
          : r
      )
    );

    // UX: se quitou, expande "Comissões pagas" e filtra para "Pago"
    if (isAllPaid) {
      setShowPaid(true);
      setStatus("pago");
    }

    setOpenPay(false);
    fetchData();
  }
  /* Listas auxiliares e busca/paginação de pagos */
  const rowsAPagar = useMemo(() => rows.filter((r) => r.status === "a_pagar"), [rows]);

  const pagosFlat = useMemo(() => {
    const list: Array<{ flow: CommissionFlow; comm: Commission }> = [];
    rows.forEach((r) =>
      (r.flow || []).forEach((f) => {
        if ((f.valor_pago_vendedor ?? 0) > 0) list.push({ flow: f, comm: r });
      })
    );
    // mais recentes primeiro
    return list.sort((a, b) =>
      ((b.flow.data_pagamento_vendedor || "") > (a.flow.data_pagamento_vendedor || "") ? 1 : -1)
    );
  }, [rows]);

  const [paidSearch, setPaidSearch] = useState("");
  const [paidPage, setPaidPage] = useState(1);
  const pagosFiltrados = useMemo(() => {
    const q = (paidSearch || "").trim().toLowerCase();
    if (!q) return pagosFlat;
    return pagosFlat.filter(({ comm }) => {
      const nome = (comm.cliente_nome || "").toLowerCase();
      const prop = (comm.numero_proposta || "").toLowerCase();
      return nome.includes(q) || prop.includes(q);
    });
  }, [paidSearch, pagosFlat]);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(pagosFiltrados.length / pageSize));
  const pageItems = pagosFiltrados.slice((paidPage - 1) * pageSize, paidPage * pageSize);

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
                {Array.from(new Set(simTables.map((t) => t.segmento)))
                  .filter(Boolean)
                  .map((seg) => (
                    <SelectItem key={seg} value={seg as string}>
                      {seg}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tabela</Label>
            <Select value={tabela} onValueChange={setTabela}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Array.from(new Set(simTables.map((t) => t.nome_tabela)))
                  .filter(Boolean)
                  .map((tab) => (
                    <SelectItem key={tab} value={tab as string}>
                      {tab}
                    </SelectItem>
                  ))}
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
            <Button onClick={fetchData}>
              <Loader2 className="w-4 h-4 mr-1" /> Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dashboards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle>Nos últimos 5 anos — {vendedorAtual}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Metric title="Total Bruto" value={BRL(range5y.totalBruta)} />
              <Metric title="Recebido Líquido" value={BRL(range5y.pagoLiquido)} />
              <Metric title="Pendente Líquido" value={BRL(range5y.pendente)} />
            </div>
            <RadialDual
              paidPct={range5y.pct}
              label="Recebido x A Receber (5 anos)"
              paidHint="Comissão recebida nos últimos 5 anos"
              pendHint="Comissão a receber nos próximos pagamentos"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle>No ano — {vendedorAtual}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Metric title="Total Bruto" value={BRL(rangeY.totalBruta)} />
              <Metric title="Recebido Líquido" value={BRL(rangeY.pagoLiquido)} />
              <Metric title="Pendente Líquido" value={BRL(rangeY.pendente)} />
            </div>
            <RadialDual
              paidPct={rangeY.pct}
              label="Recebido x A Receber (ano)"
              paidHint="Comissão recebida neste ano"
              pendHint="Comissão a receber neste ano"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle>No mês — {vendedorAtual}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Metric title="Total Bruto" value={BRL(rangeM.totalBruta)} />
              <Metric title="Recebido Líquido" value={BRL(rangeM.pagoLiquido)} />
              <Metric title="Pendente Líquido" value={BRL(rangeM.pendente)} />
            </div>
            <RadialDual
              paidPct={rangeM.pct}
              label="Recebido x A Receber (mês)"
              paidHint="Comissão recebida neste mês"
              pendHint="Comissão a receber neste mês"
            />
          </CardContent>
        </Card>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle>💰 Vendas</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{BRL(kpi.vendasTotal)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle>🧾 Comissão Bruta</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{BRL(kpi.comBruta)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle>✅ Comissão Líquida</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{BRL(kpi.comLiquida)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle>📤 Comissão Paga (Liq.)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{BRL(kpi.comPaga)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle>⏳ Pendente (Liq.)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{BRL(kpi.comPendente)}</CardContent>
        </Card>
      </div>

      {/* Vendas sem comissão */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>Vendas sem comissão (todos os registros + filtros)</span>
            <Button variant="outline" onClick={exportCSV}>
              <FileText className="w-4 h-4 mr-1" /> Exportar CSV
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
                    <td className="p-2">
                      <Button size="sm" onClick={() => gerarComissaoDeVenda(v)} disabled={genBusy === v.id}>
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

      {/* Detalhamento — some quando zera */}
      {rowsAPagar.length > 0 && (
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
                <div className="flex items-center gap-2">
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
                      className="w-24"
                    />
                  </div>
                </div>
                <Button onClick={downloadReceiptPDFPorData}>
                  <FileText className="w-4 h-4 mr-1" /> Recibo
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
                  rowsAPagar.map((r) => {
                    const isConfirm = hasRegisteredButUnpaid(r.flow);
                    return (
                      <tr key={r.id} className="border-b hover:bg-gray-50">
                        <td className="p-2">
                          {r.data_venda ? formatISODateBR(r.data_venda) : "—"}
                        </td>
                        <td className="p-2">{userLabel(r.vendedor_id)}</td>
                        <td className="p-2">{r.cliente_nome || "—"}</td>
                        <td className="p-2">{r.numero_proposta || "—"}</td>
                        <td className="p-2">{r.segmento || "—"}</td>
                        <td className="p-2">{r.tabela || "—"}</td>
                        <td className="p-2 text-right">{BRL(r.valor_venda ?? r.base_calculo)}</td>
                        <td className="p-2 text-right">{pct100(r.percent_aplicado)}</td>
                        <td className="p-2 text-right">{BRL(r.valor_total)}</td>
                        <td className="p-2">{r.status}</td>
                        <td className="p-2">
                          {r.data_pagamento ? formatISODateBR(r.data_pagamento) : "—"}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => openPaymentFor(r)}
                              className={
                                isConfirm
                                  ? "bg-[#1E293F] hover:bg-[#162032] text-white"
                                  : "bg-[#A11C27] hover:bg-[#8E1923] text-white"
                              }
                            >
                              <DollarSign className="w-4 h-4 mr-1" />
                              {isConfirm ? "Confirmar Pagamento" : "Registrar Pagamento"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retornarComissao(r)}
                            >
                              <RotateCcw className="w-4 h-4 mr-1" /> Retornar
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

      {/* Comissões pagas (Accordion) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>Comissões pagas</span>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Pesquisar por cliente ou nº proposta..."
                value={paidSearch}
                onChange={(e) => { setPaidSearch(e.target.value); setPaidPage(1); }}
                className="w-72"
              />
              <Button size="sm" variant="outline" onClick={() => setShowPaid((v) => !v)}>
                {showPaid ? "Ocultar" : "Expandir"}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        {showPaid && (
          <CardContent className="overflow-x-auto">
            <table className="min-w-[1000px] w-full text-sm">
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
                {pageItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-gray-500">
                      Nenhum pagamento encontrado.
                    </td>
                  </tr>
                )}
                {pageItems.map(({ flow, comm }) => (
                  <tr key={flow.id} className="border-b">
                    <td className="p-2">
                      {flow.data_pagamento_vendedor
                        ? formatISODateBR(flow.data_pagamento_vendedor)
                        : "—"}
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
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Paginação simples */}
            <div className="flex items-center justify-between mt-3">
              <div className="text-xs text-gray-600">
                Página {paidPage} de {totalPages} — {pagosFiltrados.length} registros
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPaidPage((p) => Math.max(1, p - 1))}
                  disabled={paidPage <= 1}
                >
                  ◀
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPaidPage((p) => Math.min(totalPages, p + 1))}
                  disabled={paidPage >= totalPages}
                >
                  ▶
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Regras (overlay central) */}
      <Dialog open={openRules} onOpenChange={setOpenRules}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>Regras de Comissão</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div>
              <Label>Vendedor</Label>
              <Select value={ruleVendorId} onValueChange={(v) => { setRuleVendorId(v); }}>
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
              <Input
                value={rulePercent}
                onChange={(e) => setRulePercent(e.target.value)}
                placeholder="1,20"
              />
            </div>
            <div>
              <Label>Nº de meses do fluxo</Label>
              <Input
                type="number"
                min={1}
                max={36}
                value={ruleMeses}
                onChange={(e) => onChangeMeses(parseInt(e.target.value || "1"))}
              />
            </div>
          </div>
          <hr className="my-3" />
          <div>
            <Label>Fluxo do pagamento (M1..Mn)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 p-2 border rounded-md max-h-[200px] overflow-y-auto">
              {Array.from({ length: ruleMeses }).map((_, i) => (
                <Input
                  key={i}
                  value={ruleFluxoPct[i] || "0,00"}
                  onChange={(e) => {
                    const arr = [...ruleFluxoPct];
                    arr[i] = e.target.value;
                    setRuleFluxoPct(arr);
                  }}
                  placeholder="0,33"
                />
              ))}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              Soma do fluxo: <b>{fluxoSomaPct.toFixed(2)} (100% = 1,00)</b>
            </div>
          </div>
          <hr className="my-3" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-end">
            <div className="lg:col-span-2">
              <Label>Observações</Label>
              <Input
                value={ruleObs}
                onChange={(e) => setRuleObs(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveRule}>
                <Save className="w-4 h-4 mr-1" /> Salvar Regra
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setRuleSimTableId("");
                  setRulePercent("1,20");
                  setRuleMeses(1);
                  setRuleFluxoPct(["100,00"]);
                  setRuleObs("");
                }}
              >
                Limpar
              </Button>
            </div>
          </div>
          <hr className="my-4" />
          <div className="border rounded-md max-h-[45vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Segmento</th>
                  <th className="p-2 text-left">Administradora</th>
                  <th className="p-2 text-left">Tabela</th>
                  <th className="p-2 text-right">% Padrão</th>
                  <th className="p-2 text-left">Fluxo</th>
                  <th className="p-2 text-left">Ação</th>
                </tr>
              </thead>
              <tbody>
                {(!ruleRows || ruleRows.length === 0) && (
                  <tr>
                    <td colSpan={6} className="p-3 text-gray-500">
                      Nenhuma regra cadastrada para o vendedor selecionado.
                    </td>
                  </tr>
                )}
                {ruleRows.map((r) => (
                  <tr key={`${r.vendedor_id}-${r.sim_table_id}`} className="border-t">
                    <td className="p-2">{r.segmento || "—"}</td>
                    <td className="p-2">—</td>
                    <td className="p-2">{r.nome_tabela}</td>
                    <td className="p-2 text-right">{pct100(r.percent_padrao)}</td>
                    <td className="p-2">{r.fluxo_meses} Pgtos</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => loadRuleToForm(r)}
                        >
                          <Pencil className="w-4 h-4 mr-1" /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteRule(r.vendedor_id, r.sim_table_id)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" /> Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenRules(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagamento (overlay largo) */}
      <Dialog open={openPay} onOpenChange={setOpenPay}>
        <DialogContent className="w-[98vw] max-w-[1400px]">
          <DialogHeader>
            <DialogTitle>Registrar pagamento ao vendedor</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue={payDefaultTab}>
            <TabsList className="mb-3">
              <TabsTrigger value="selecionar">Selecionar parcelas</TabsTrigger>
              <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
            </TabsList>

            <TabsContent value="selecionar" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                          : undefined,
                        recibo_file: null,
                        comprovante_file: null,
                      })
                    }
                    className="bg-[#A11C27] hover:bg-[#8E1923] text-white"
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
                          .filter(
                            (f) =>
                              !f.data_pagamento_vendedor &&
                              (f.valor_pago_vendedor ?? 0) === 0
                          )
                          .map((f) => [f.id, true])
                      );
                      setPaySelected(pend);
                    }}
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
                        <tr
                          key={f.id}
                          className={`border-b ${
                            isLocked ? "opacity-60 pointer-events-none" : ""
                          }`}
                        >
                          <td className="p-2">
                            <Checkbox
                              checked={!!paySelected[f.id]}
                              onCheckedChange={(v) =>
                                setPaySelected((s) => ({ ...s, [f.id]: !!v }))
                              }
                              disabled={isLocked}
                            />
                          </td>
                          <td className="p-2">M{f.mes}</td>
                          <td className="p-2">{pct100(f.percentual)}</td>
                          <td className="p-2 text-right">
                            {BRL((f as any)._valor_previsto_calc ?? f.valor_previsto)}
                          </td>
                          <td className="p-2 text-right">{BRL(f.valor_pago_vendedor)}</td>
                          <td className="p-2">
                            {f.data_pagamento_vendedor
                              ? formatISODateBR(f.data_pagamento_vendedor)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="arquivos">
              <UploadArea onConfirm={paySelectedParcels} />
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

/* ========================= Subcomponentes ========================= */
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
  const [dataPg, setDataPg] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [valorPg, setValorPg] = useState<string>("");
  const [fileRecibo, setFileRecibo] = useState<File | null>(null);
  const [fileComp, setFileComp] = useState<File | null>(null);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Data do pagamento</Label>
          <Input
            type="date"
            value={dataPg}
            onChange={(e) => setDataPg(e.target.value)}
          />
        </div>
        <div>
          <Label>Valor pago ao vendedor (opcional)</Label>
          <Input
            placeholder="Ex.: 1.974,00"
            value={valorPg}
            onChange={(e) => setValorPg(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            onClick={() =>
              onConfirm({
                data_pagamento_vendedor: dataPg,
                valor_pago_vendedor: valorPg
                  ? parseFloat(valorPg.replace(/\./g, "").replace(",", "."))
                  : undefined,
                recibo_file: fileRecibo,
                comprovante_file: fileComp,
              })
            }
            className="bg-[#1E293F] hover:bg-[#162032] text-white"
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
          />
        </div>
        <div>
          <Label>Comprovante de pagamento (PDF/Imagem)</Label>
          <Input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFileComp(e.target.files?.[0] || null)}
          />
        </div>
      </div>
      <div className="text-xs text-gray-500">
        Arquivos vão para o bucket <code>comissoes</code>. Digite o valor <b>BRUTO</b>.
        Se nenhuma parcela estiver marcada, a confirmação faz uma seleção segura
        automática (especialmente no fluxo 1×100%).
      </div>
    </div>
  );
}
