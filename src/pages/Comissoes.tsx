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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, Filter as FilterIcon, Settings, Save, DollarSign, Upload, FileText, PlusCircle, RotateCcw, Pencil, Trash2,
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
  cpf: string | null; // claro
  cpf_mascarado: string | null;
};

type SimTable = { id: UUID; segmento: string; nome_tabela: string };

type Venda = {
  id: UUID;
  data_venda: string;          // YYYY-MM-DD
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
  // extras
  cliente_nome?: string | null;
  numero_proposta?: string | null;
};

type CommissionFlow = {
  id: UUID;
  commission_id: UUID;
  mes: number;
  percentual: number; // fração do fluxo (ex.: 0.25) — deve somar 1.0
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
  percent_padrao: number;      // fração (ex.: 1,20% => 0.012)
  fluxo_meses: number;
  fluxo_percentuais: number[]; // frações que somam 1.0 (ex.: [0.33,0.33,0.34])
  obs: string | null;
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

function valorPorExtenso(n: number) {
  const unidades = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez","onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove"];
  const dezenas = ["","","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];
  const centenas = ["","cento","duzentos","trezentos","quatrocentos","quinhentos","seiscentos","setecentos","oitocentos","novecentos"];
  function extenso(n0: number): string {
    if (n0 < 20) return unidades[n0];
    if (n0 < 100) return dezenas[Math.floor(n0/10)] + (n0%10 ? " e " + unidades[n0%10] : "");
    if (n0 === 100) return "cem";
    return centenas[Math.floor(n0/100)] + (n0%100 ? " e " + extenso(n0%100) : "");
  }
  const inteiro = Math.floor(n);
  const cent = Math.round((n - inteiro) * 100);
  const reais = inteiro === 1 ? "real" : "reais";
  const centavos = cent === 1 ? "centavo" : "centavos";
  return `${extenso(inteiro)} ${reais}` + (cent ? ` e ${extenso(cent)} ${centavos}` : "");
}

/* ========================= Radial ========================= */
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
  const [usersSecure, setUsersSecure] = useState<UserSecure[]>([]);
  const [simTables, setSimTables] = useState<SimTable[]>([]);
  const [clientesMap, setClientesMap] = useState<Record<string, string>>({});

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

  const secureById = useMemo(() => {
    const m: Record<string, UserSecure> = {};
    usersSecure.forEach((u) => (m[u.id] = u));
    return m;
  }, [usersSecure]);

  const userLabel = (maybeId: string | null | undefined) => {
    if (!maybeId) return "—";
    const u = usersById[maybeId] || usersByAuth[maybeId];
    return u?.nome?.trim() || u?.email?.trim() || maybeId;
  };

  // Converte auth_user_id -> users.id (ou mantém se já for id)
  const canonUserId = (maybeId?: string | null) => {
    if (!maybeId) return null;
    if (usersById[maybeId]) return usersById[maybeId].id;       // já é users.id
    if (usersByAuth[maybeId]) return usersByAuth[maybeId].id;   // veio como auth_user_id
    return null; // não encontrado
  };

  /* ---------- Comissões / Vendas ---------- */
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<(Commission & { flow?: CommissionFlow[] })[]>([]);
  const [vendasSemCom, setVendasSemCom] = useState<Venda[]>([]);
  const [genBusy, setGenBusy] = useState<string | null>(null);

  /* ---------- Modais ---------- */
  const [openRules, setOpenRules] = useState<boolean>(false); // Dialog central
  const [openPay, setOpenPay] = useState<boolean>(false);

  /* ---------- Estado Regras ---------- */
  const [ruleVendorId, setRuleVendorId] = useState<string>("");
  const [ruleSimTableId, setRuleSimTableId] = useState<string>("");
  const [rulePercent, setRulePercent] = useState<string>("1,20"); // % padrão (humanizado)
  const [ruleMeses, setRuleMeses] = useState<number>(1);
  const [ruleFluxoPct, setRuleFluxoPct] = useState<string[]>(["100,00"]); // em %
  const [ruleObs, setRuleObs] = useState<string>("");

  const [ruleRows, setRuleRows] = useState<(CommissionRule & { segmento: string; nome_tabela: string })[]>([]);

  /* ---------- Estado Pagamento ---------- */
  const [payCommissionId, setPayCommissionId] = useState<string>("");
  const [payFlow, setPayFlow] = useState<CommissionFlow[]>([]);
  const [paySelected, setPaySelected] = useState<Record<string, boolean>>({});
  const [payDate, setPayDate] = useState<string>(() => toDateInput(new Date()));
  const [payValue, setPayValue] = useState<string>("");

  /* ---------- Recibo ---------- */
  const [reciboDate, setReciboDate] = useState<string>(() => toDateInput(new Date()));
  const [reciboImpostoPct, setReciboImpostoPct] = useState<string>("6,00");
  const [reciboVendor, setReciboVendor] = useState<string>("all");

  /* ---------- Load bases ---------- */
  useEffect(() => {
    (async () => {
      const [{ data: u }, { data: st }, { data: us }] = await Promise.all([
        supabase.from("users").select("id, auth_user_id, nome, email, phone, cep, logradouro, numero, bairro, cidade, uf, pix_key, pix_type").order("nome", { ascending: true }),
        supabase.from("sim_tables").select("id, segmento, nome_tabela").order("segmento", { ascending: true }),
        supabase.from("users_secure").select("id, nome, email, logradouro, numero, bairro, cidade, uf, pix_key, cpf, cpf_mascarado"),
      ]);
      setUsers((u || []) as User[]);
      setSimTables((st || []) as SimTable[]);
      setUsersSecure((us || []) as UserSecure[]);
    })();
  }, []);

  /* ========================= Fetch principal ========================= */
  async function fetchData() {
    setLoading(true);
    try {
      // commissions
      let qb = supabase.from("commissions").select("*").gte("data_venda", dtIni).lte("data_venda", dtFim);
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
        if (!flowByCommission[f.commission_id].some((x) => x.mes === f.mes)) {
          flowByCommission[f.commission_id].push(f as CommissionFlow);
        }
      });

      // enriquecer com cliente (LEADS) e proposta
      let vendasExtras: Record<string, { clienteId?: string, numero_proposta?: string | null, cliente_nome?: string | null }> = {};
      if (comms && comms.length) {
        const { data: vendas } = await supabase
          .from("vendas")
          .select("id, numero_proposta, cliente_lead_id, lead_id")
          .in("id", comms.map((c: any) => c.venda_id));
        const cliIds = Array.from(new Set((vendas || []).map(v => v.lead_id || v.cliente_lead_id).filter(Boolean) as string[]));
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

      setRows((comms || []).map((c: any) => ({
        ...(c as Commission),
        flow: flowByCommission[c.id] || [],
        cliente_nome: vendasExtras[c.venda_id]?.cliente_nome || null,
        numero_proposta: vendasExtras[c.venda_id]?.numero_proposta || null,
      })));

      // vendas sem comissão
      const { data: vendasPeriodo } = await supabase
        .from("vendas")
        .select("id, data_venda, vendedor_id, segmento, tabela, administradora, valor_venda, numero_proposta, cliente_lead_id, lead_id")
        .gte("data_venda", dtIni).lte("data_venda", dtFim)
        .order("data_venda", { ascending: false });

      const { data: commVendaIds } = await supabase
        .from("commissions").select("venda_id")
        .gte("data_venda", dtIni).lte("data_venda", dtFim);

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

      // nomes (leads)
      const clientIds = Array.from(new Set((vendasFiltered2 || []).map((v) => v.lead_id || v.cliente_lead_id).filter((x): x is string => !!x)));
      if (clientIds.length) {
        const { data: cli } = await supabase.from("leads").select("id, nome").in("id", clientIds);
        const map: Record<string, string> = {};
        (cli || []).forEach((c: any) => (map[c.id] = c.nome || ""));
        setClientesMap(map);
      } else setClientesMap({});
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
  const vendedorAtual = useMemo(() => userLabel(vendedorId === "all" ? null : vendedorId), [usersById, usersByAuth, vendedorId]);
  const now = new Date();
  const yStart = new Date(now.getFullYear(), 0, 1);
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), 1);

  function isBetween(d?: string | null, start?: Date, end?: Date) {
    if (!d) return false;
    const x = new Date(d + "T00:00:00").getTime();
    return x >= (start?.getTime() || 0) && x <= (end?.getTime() || now.getTime());
  }
  function totalsInRange(start: Date, end: Date) {
    const sel = rows.filter((r) => isBetween(r.data_venda || undefined, start, end));
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

  async function fetchRulesForVendor(vId: string) {
    if (!vId) { setRuleRows([]); return; }
    const { data: rules } = await supabase
      .from("commission_rules")
      .select("vendedor_id, sim_table_id, percent_padrao, fluxo_meses, fluxo_percentuais, obs")
      .eq("vendedor_id", vId);
    if (!rules || !rules.length) { setRuleRows([]); return; }
    const stIds = Array.from(new Set(rules.map(r => r.sim_table_id)));
    const { data: st } = await supabase.from("sim_tables").select("id, segmento, nome_tabela").in("id", stIds);
    const bySt: Record<string, SimTable> = {};
    (st || []).forEach(s => { bySt[s.id] = s as SimTable; });
    setRuleRows(
      rules.map(r => ({
        ...(r as CommissionRule),
        segmento: bySt[r.sim_table_id]?.segmento || "-",
        nome_tabela: bySt[r.sim_table_id]?.nome_tabela || "-",
      }))
    );
  }
  useEffect(() => { if (openRules) fetchRulesForVendor(ruleVendorId); }, [openRules, ruleVendorId]);

  async function saveRule() {
    if (!ruleVendorId || !ruleSimTableId) return alert("Selecione vendedor e tabela.");

    const padraoPctPercent = parseFloat((rulePercent || "0").replace(",", ".")); // ex.: 1,20
    // Fluxo representa distribuição de 100% da comissão ⇒ soma deve ser 1.00
    const somaFluxo = fluxoSomaPct; // ex.: 0.33 + 0.33 + 0.34 = 1.00
    const eps = 1e-6;
    if (Math.abs(somaFluxo - 1.0) > eps) {
      return alert(`Soma de fluxo (M1..Mn) deve ser 1,00 (100%). Soma atual = ${somaFluxo.toFixed(2).replace(".", ",")}`);
    }

    const percent_padrao_frac = padraoPctPercent / 100; // 1,20% ⇒ 0,012
    // Importante: gravar as parcelas como frações que somam 1.0 (NÃO dividir por 100 aqui)
    const fluxo_percentuais_frac = ruleFluxoPct.map((x) => (parseFloat((x || "0").replace(",", ".")) || 0));

    const { error } = await supabase.from("commission_rules").upsert({
      vendedor_id: ruleVendorId,
      sim_table_id: ruleSimTableId,
      percent_padrao: percent_padrao_frac,
      fluxo_meses: ruleMeses,
      fluxo_percentuais: fluxo_percentuais_frac,
      obs: ruleObs || null,
    }, { onConflict: "vendedor_id,sim_table_id" });

    if (error) return alert(error.message);
    await fetchRulesForVendor(ruleVendorId);
    alert("Regra salva.");
  }

  async function deleteRule(vendedor_id: string, sim_table_id: string) {
    if (!confirm("Excluir esta regra?")) return;
    const { error } = await supabase.from("commission_rules").delete().eq("vendedor_id", vendedor_id).eq("sim_table_id", sim_table_id);
    if (error) return alert(error.message);
    await fetchRulesForVendor(vendedor_id);
  }

  function loadRuleToForm(r: CommissionRule & { segmento: string; nome_tabela: string }) {
    setRuleVendorId(r.vendedor_id);
    setRuleSimTableId(r.sim_table_id);
    setRulePercent(((r.percent_padrao || 0) * 100).toFixed(2).replace(".", ",")); // volta humanizado
    setRuleMeses(r.fluxo_meses);
    setRuleFluxoPct(r.fluxo_percentuais.map(p => p.toFixed(2).replace(".", ","))); // já são frações 0.xx
    setRuleObs(r.obs || "");
  }

  /* ========================= Pagamento ========================= */
  async function openPaymentFor(commission: Commission) {
    setPayCommissionId(commission.id);
    const { data } = await supabase.from("commission_flow").select("*").eq("commission_id", commission.id).order("mes", { ascending: true });
    const unique = new Map<number, CommissionFlow>();
    (data || []).forEach((f: any) => unique.set(f.mes, f));
    const arr = Array.from(unique.values());
    setPayFlow(arr as CommissionFlow[]);
    setPaySelected({});
    setPayDate(toDateInput(new Date()));
    setPayValue("");
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
    const updates: Partial<CommissionFlow>[] = [];
    let reciboPath: string | null = null;
    let compPath: string | null = null;
    if (payload.recibo_file) reciboPath = await uploadToBucket(payload.recibo_file, payCommissionId);
    if (payload.comprovante_file) compPath = await uploadToBucket(payload.comprovante_file, payCommissionId);

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

    const { data: updated } = await supabase.from("commission_flow").select("*").eq("commission_id", payCommissionId);
    const allPaid = (updated || []).every((f: any) => (f.valor_pago_vendedor ?? 0) > 0);
    if (allPaid) {
      await supabase.from("commissions").update({ status: "pago", data_pagamento: toDateInput(new Date()) }).eq("id", payCommissionId);
    }

    setOpenPay(false);
    fetchData();
  }

  /* ========================= Gerar Comissão ========================= */
  async function gerarComissaoDeVenda(venda: Venda) {
    try {
      setGenBusy(venda.id);

      // 1) Normaliza vendedor para users.id
      const vendedorIdCanon = canonUserId(venda.vendedor_id);
      if (!vendedorIdCanon) {
        alert("Vendedor desta venda não está cadastrado em 'users' (vínculo por auth_user_id). Corrija antes de gerar a comissão.");
        return;
      }

      // 2) Descobre sim_table_id (tolerante)
      let simTableId: string | null = null;
      if (venda.tabela) {
        // exato
        const { data: st1 } = await supabase
          .from("sim_tables")
          .select("id")
          .eq("nome_tabela", venda.tabela)
          .limit(1);
        simTableId = st1?.[0]?.id ?? null;

        // ILIKE + segmento (fallback)
        if (!simTableId) {
          let qb2 = supabase
            .from("sim_tables")
            .select("id")
            .ilike("nome_tabela", `%${venda.tabela}%`)
            .limit(1);
          if (venda.segmento) qb2 = qb2.eq("segmento", venda.segmento);
          const { data: st2 } = await qb2;
          simTableId = st2?.[0]?.id ?? null;
        }
      }

      // 3) % padrão por regra (se houver)
      let percent_aplicado: number | null = null;
      if (simTableId) {
        const { data: rule } = await supabase
          .from("commission_rules")
          .select("percent_padrao")
          .eq("vendedor_id", vendedorIdCanon)
          .eq("sim_table_id", simTableId)
          .limit(1);
        percent_aplicado = rule?.[0]?.percent_padrao ?? null; // fração (ex.: 0.012)
      }

      const base = venda.valor_venda ?? null;
      const valor_total =
        percent_aplicado && base ? Math.round(base * percent_aplicado * 100) / 100 : null;

      const insert = {
        venda_id: venda.id,
        vendedor_id: vendedorIdCanon, // sempre users.id
        sim_table_id: simTableId,
        data_venda: venda.data_venda,
        segmento: venda.segmento,
        tabela: venda.tabela,
        administradora: venda.administradora,
        valor_venda: base,
        base_calculo: base,
        percent_aplicado,
        valor_total,
        status: "a_pagar" as const,
      };

      const { error } = await supabase.from("commissions").insert(insert as any);
      if (error) {
        if (String(error.message || "").includes("row-level security")) {
          alert("RLS bloqueou o INSERT. Garanta as policies de 'commissions' e 'commission_flow'.");
        } else if (String(error.code) === "23503") {
          alert("Não foi possível criar: verifique se o vendedor existe em 'users' e/ou se a SimTable está correta.");
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

  /* ========================= Retornar comissão ========================= */
  async function retornarComissao(c: Commission) {
    if (!confirm("Confirmar retorno desta comissão para 'Vendas sem comissão'?")) return;
    try {
      const { error: e1 } = await supabase.from("commission_flow").delete().eq("commission_id", c.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("commissions").delete().eq("id", c.id);
      if (e2) throw e2;

      setRows((prev) => prev.filter((r) => r.id !== c.id));
      await fetchData();
    } catch (err: any) {
      if (String(err?.message || "").includes("row-level security")) {
        alert("RLS bloqueou a exclusão. Ajuste as policies de 'commissions' e 'commission_flow' para permitir delete pelo owner/admin.");
      } else {
        alert("Falha ao retornar: " + (err?.message || err));
      }
    }
  }

  /* ========================= CSV (apenas Vendas sem comissão) ========================= */
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

  /* ========================= Recibo PDF ========================= */
  async function downloadReceiptPDFPorData() {
    const impostoPct = parseFloat(reciboImpostoPct.replace(",", ".")) / 100 || 0;
    const dataRecibo = reciboDate;
    const vendedorSel = reciboVendor === "all" ? null : reciboVendor;

    const { data: flows } = await supabase.from("commission_flow").select("*").eq("data_pagamento_vendedor", dataRecibo);
    if (!flows || flows.length === 0) return alert("Não há parcelas pagas na data selecionada.");

    const byCommission: Record<string, CommissionFlow[]> = {};
    flows.forEach((f: any) => {
      if (!byCommission[f.commission_id]) byCommission[f.commission_id] = [];
      if (!byCommission[f.commission_id].some(x => x.mes === f.mes)) byCommission[f.commission_id].push(f);
    });

    const commIds = Object.keys(byCommission);
    const { data: comms } = await supabase.from("commissions").select("*").in("id", commIds);

    const vendaIds = Array.from(new Set((comms || []).map((c: any) => c.venda_id)));
    const { data: vendas } = await supabase
      .from("vendas")
      .select("id, valor_venda, numero_proposta, cliente_lead_id, lead_id, vendedor_id")
      .in("id", vendaIds);

    const commsFiltradas = (comms || []).filter((c: any) => !vendedorSel || c.vendedor_id === vendedorSel);
    if (commsFiltradas.length === 0) return alert("Sem parcelas para o vendedor selecionado nessa data.");

    const clienteIds = Array.from(new Set((vendas || []).map(v => v.lead_id || v.cliente_lead_id).filter(Boolean) as string[]));
    const nomesCli: Record<string, string> = {};
    if (clienteIds.length) {
      const { data: cli } = await supabase.from("leads").select("id, nome").in("id", clienteIds);
      (cli || []).forEach((c: any) => { nomesCli[c.id] = c.nome || ""; });
    }

    const vendedorUsado = vendedorSel ?? commsFiltradas[0].vendedor_id;
    const vendInfo = secureById[vendedorUsado] || ({} as any);

    const totalLinhasRecibo = commsFiltradas.reduce((acc, c: any) => {
      const arr = (byCommission[c.id] || []);
      return acc + new Map(arr.map(p => [p.mes, p])).size;
    }, 0);
    const numeroRecibo = `${dataRecibo.replace(/-/g, "")}-${String(totalLinhasRecibo).padStart(3, "0")}`;

    const doc = new jsPDF({ unit: "pt", format: "a4" });

    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text("RECIBO DE COMISSÃO", 297, 40, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal");

    doc.text(`Recibo Nº: ${numeroRecibo}`, 40, 60);
    doc.text(`Data: ${formatISODateBR(dataRecibo)}`, 40, 74);

    const pagador = [
      "Nome do Pagador: Consulmax Serviços de Planejamento Estruturado e Proteção LTDA. CNPJ: 57.942.043/0001-03",
      "Endereço: Av. Menezes Filho, 3171, Casa Preta, Ji-Paraná/RO. CEP: 76907-532",
    ];
    let y = 92;
    pagador.forEach((l) => { doc.text(l, 40, y); y += 14; });

    const recebedor = [
      `Nome do Recebedor: ${userLabel(vendedorUsado)}`,
      `CPF/CNPJ: ${vendInfo?.cpf || "—"}`,
      `Endereço: ${[vendInfo?.logradouro, vendInfo?.numero, vendInfo?.bairro, vendInfo?.cidade && `${vendInfo.cidade}/${vendInfo.uf}`].filter(Boolean).join(", ") || "—"}`,
    ];
    y += 10;
    recebedor.forEach((l) => { doc.text(l, 40, y); y += 14; });

    y += 6;
    doc.text("Descrição: Pagamento referente às comissões abaixo relacionadas.", 40, y);
    y += 16;

    const head = [["CLIENTE", "PROPOSTA", "PARCELA", "R$ VENDA", "COM. BRUTA", "IMPOSTOS", "COM. LÍQUIDA"]];
    const body: any[] = [];
    let totalLiquido = 0;

    commsFiltradas.forEach((c: any) => {
      const v = (vendas || []).find(x => x.id === c.venda_id);
      const clienteId = v?.lead_id || v?.cliente_lead_id || "";
      const clienteNome = clienteId ? (nomesCli[clienteId] || "—") : "—";
      const vendaValor = v?.valor_venda || 0;
      const parcelasAll = byCommission[c.id] || [];
      const parcelas = Array.from(new Map(parcelasAll.map(p => [p.mes, p])).values());

      parcelas.forEach((p) => {
        const comBruta = (c.percent_aplicado || 0) * (p.percentual || 0) * vendaValor;
        const impostos = comBruta * (impostoPct);
        const liquida = comBruta - impostos;
        totalLiquido += liquida;

        body.push([
          clienteNome,
          v?.numero_proposta || "—",
          `${p.mes}/${parcelas.length}`,
          BRL(vendaValor),
          BRL(comBruta),
          BRL(impostos),
          BRL(liquida),
        ]);
      });
    });

    autoTable(doc, { startY: y, head, body, styles: { font: "helvetica", fontSize: 10 }, headStyles: { fillColor: [30, 41, 63] }});

    const endY = (doc as any).lastAutoTable.finalY + 12;
    doc.setFont("helvetica", "bold");
    doc.text(`Valor total líquido da comissão: ${BRL(totalLiquido)} (${valorPorExtenso(totalLiquido)})`, 40, endY);

    doc.setFont("helvetica", "normal");
    doc.text(`Forma de Pagamento: PIX`, 40, endY + 18);
    doc.text(`Chave PIX do pagamento: ${secureById[vendedorUsado]?.pix_key || "—"}`, 40, endY + 34);

    const signY = endY + 100;
    doc.line(40, signY, 320, signY);
    doc.text(`${userLabel(vendedorUsado)}`, 40, signY + 14);
    doc.text(`${secureById[vendedorUsado]?.cpf || "—"}`, 40, signY + 28);

    const rodapeY = 812 - 40;
    doc.setFontSize(9);
    doc.text("Rua Menezes Filho, 3174, Casa Preta", 40, rodapeY - 20);
    doc.text("Ji-Paraná/RO, 76907-532", 40, rodapeY - 8);
    doc.text("consulmaxconsorcios.com.br", 40, rodapeY + 4);

    try {
      const img = new Image();
      img.src = "/logo-consulmax.png";
      await new Promise((res) => { img.onload = () => res(null); img.onerror = () => res(null); });
      const maxW = 160, maxH = 40;
      const iw = (img as any).width || 160;
      const ih = (img as any).height || 40;
      const ratio = Math.min(maxW / iw, maxH / ih);
      const w = iw * ratio;
      const h = ih * ratio;
      doc.addImage(img, "PNG", 420, rodapeY - h + 8, w, h);
    } catch {}

    doc.save(`recibo_${dataRecibo}_${userLabel(vendedorUsado)}.pdf`);
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
        <CardContent className="grid grid-cols-1 md:grid-cols-7 gap-3">
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
          <div className="md:col-span-7 flex gap-2 justify-end">
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

      {/* Detalhamento */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>Detalhamento de Comissões</span>
              {/* seletor vendedor recibo */}
              <div className="flex items-center gap-2">
                <Label className="text-xs text-gray-500">Vendedor (recibo)</Label>
                <Select value={reciboVendor} onValueChange={setReciboVendor}>
                  <SelectTrigger className="h-8 w-[220px]"><SelectValue placeholder="Todos" /></SelectTrigger>
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
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div>
                  <Label>Data do Recibo</Label>
                  <Input type="date" value={reciboDate} onChange={(e) => setReciboDate(e.target.value)} />
                </div>
                <div>
                  <Label>Imposto (%)</Label>
                  <Input value={reciboImpostoPct} onChange={(e) => setReciboImpostoPct(e.target.value)} className="w-24" />
                </div>
              </div>
              <Button onClick={downloadReceiptPDFPorData}><FileText className="w-4 h-4 mr-1" /> Recibo</Button>
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
                <tr><td colSpan={12} className="p-4"><Loader2 className="animate-spin inline mr-2" /> Carregando...</td></tr>
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
                      <Button size="sm" variant="outline" onClick={() => retornarComissao(r)}>
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

      {/* Dialog central: Regras de Comissão */}
      <Dialog open={openRules} onOpenChange={setOpenRules}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>Regras de Comissão</DialogTitle></DialogHeader>

          {/* Campo superior */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-1">
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
            <div className="lg:col-span-1">
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
          </div>

          <hr className="my-3" />

          {/* Fluxo */}
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

          {/* Observações + ações */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-end">
            <div className="lg:col-span-2">
              <Label>Observações</Label>
              <Input value={ruleObs} onChange={(e) => setRuleObs(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveRule}><Save className="w-4 h-4 mr-1" /> Salvar Regra</Button>
              <Button variant="outline" onClick={() => {
                setRuleSimTableId(""); setRulePercent("1,20"); setRuleMeses(1); setRuleFluxoPct(["100,00"]); setRuleObs("");
              }}>Limpar</Button>
            </div>
          </div>

          <hr className="my-4" />

          {/* Lista por vendedor */}
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
                  <tr><td colSpan={6} className="p-3 text-gray-500">Nenhuma regra cadastrada para o vendedor selecionado.</td></tr>
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
                        <Button size="sm" variant="secondary" onClick={() => loadRuleToForm(r)}><Pencil className="w-4 h-4 mr-1" /> Editar</Button>
                        <Button size="sm" variant="outline" onClick={() => deleteRule(r.vendedor_id, r.sim_table_id)}><Trash2 className="w-4 h-4 mr-1" /> Excluir</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter><Button variant="secondary" onClick={() => setOpenRules(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

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
                <div><Label>Data do pagamento</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
                <div><Label>Valor pago ao vendedor (opcional)</Label><Input placeholder="Ex.: 1.974,00" value={payValue} onChange={(e) => setPayValue(e.target.value)} /></div>
                <div className="flex items-end">
                  <Button onClick={() => paySelectedParcels({
                    data_pagamento_vendedor: payDate,
                    valor_pago_vendedor: payValue ? parseFloat(payValue.replace(/\./g, "").replace(",", ".")) : undefined,
                    recibo_file: null,
                    comprovante_file: null,
                  })}><Save className="w-4 h-4 mr-1" /> Salvar</Button>
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={() => {
                    const pend = Object.fromEntries(payFlow.filter(f => !f.data_pagamento_vendedor).map(f => [f.id, true]));
                    setPaySelected(pend);
                  }}>Selecionar tudo pendente</Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-sm">
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
                          <Checkbox checked={!!paySelected[f.id]} onCheckedChange={(v) => setPaySelected((s) => ({ ...s, [f.id]: !!v }))} />
                        </td>
                        <td className="p-2">M{f.mes}</td>
                        <td className="p-2">{pct100(f.percentual)}</td>
                        <td className="p-2 text-right">{BRL(f.valor_previsto)}</td>
                        <td className="p-2 text-right">{BRL(f.valor_pago_vendedor)}</td>
                        <td className="p-2">{f.data_pagamento_vendedor ? formatISODateBR(f.data_pagamento_vendedor) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="arquivos">
              <UploadArea onConfirm={paySelectedParcels} />
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
