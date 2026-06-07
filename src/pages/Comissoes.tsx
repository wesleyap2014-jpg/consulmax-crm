// src/pages/Comissoes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCcw, Settings, FileText, PlusCircle, DollarSign, ShieldCheck } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type UUID = string;
type AnyRow = Record<string, any>;

type User = AnyRow & {
  id: UUID;
  auth_user_id: UUID;
  nome: string;
  email?: string | null;
  role?: string | null;
  user_role?: string | null;
  scopes?: string[] | null;
  is_active?: boolean | null;
  unit_id?: UUID | null;
  hierarchy_level?: "usuario" | "gestor_filial" | string | null;
  pix_key?: string | null;
  pix_type?: string | null;
};

type Unit = AnyRow & {
  id: UUID;
  nome: string;
  tipo: "matriz" | "filial" | string;
  cidade?: string | null;
  uf?: string | null;
  is_active?: boolean | null;
  manager_user_id?: UUID | null;
};

type SimTable = AnyRow & {
  id: UUID;
  admin_id?: UUID | null;
  administradora?: string | null;
  segmento?: string | null;
  nome_tabela?: string | null;
  name?: string | null;
};

type Venda = AnyRow & {
  id: UUID;
  data_venda?: string | null;
  vendedor_id?: UUID | null;
  segmento?: string | null;
  tabela?: string | null;
  administradora?: string | null;
  valor_venda?: number | null;
  numero_proposta?: string | null;
  lead_id?: UUID | null;
  cliente_lead_id?: UUID | null;
  grupo?: string | null;
  cota?: string | null;
  codigo?: string | null;
  cancelada_em?: string | null;
  encarteirada_em?: string | null;
  status?: string | null;
};

type Lead = { id: UUID; nome?: string | null; name?: string | null };

type LegacyCommission = AnyRow & {
  id: UUID;
  venda_id: UUID;
  vendedor_id: UUID;
  sim_table_id?: UUID | null;
  data_venda?: string | null;
  segmento?: string | null;
  tabela?: string | null;
  administradora?: string | null;
  valor_venda?: number | null;
  base_calculo?: number | null;
  percent_aplicado?: number | null;
  valor_total?: number | null;
  status?: string | null;
  data_pagamento?: string | null;
  cliente_nome?: string | null;
  numero_proposta?: string | null;
};

type LegacyFlow = AnyRow & {
  id: UUID;
  commission_id: UUID;
  mes: number;
  percentual: number;
  valor_previsto?: number | null;
  valor_pago_vendedor?: number | null;
  data_pagamento_vendedor?: string | null;
};

type TableRule = AnyRow & {
  id: UUID;
  sim_table_id?: UUID | null;
  administradora?: string | null;
  segmento?: string | null;
  nome_tabela: string;
  percent_total: number;
  fluxo_meses: number;
  fluxo_percentuais: number[];
  is_active: boolean;
};

type SplitRule = AnyRow & {
  id: UUID;
  table_rule_id: UUID;
  business_unit_id?: UUID | null;
  recipient_type: "vendedor" | "unidade" | "empresa" | "gestor" | "indicador" | "outro";
  recipient_user_id?: UUID | null;
  recipient_unit_id?: UUID | null;
  split_percent: number;
  is_active: boolean;
};

type Batch = AnyRow & {
  id: UUID;
  venda_id: UUID;
  sim_table_id?: UUID | null;
  table_rule_id?: UUID | null;
  business_unit_id?: UUID | null;
  vendedor_id: UUID;
  data_venda?: string | null;
  valor_venda: number;
  percent_total: number;
  commission_total_gross: number;
  status: string;
  legacy?: boolean;
};

type Entry = AnyRow & {
  id: UUID;
  batch_id: UUID;
  venda_id: UUID;
  recipient_type: string;
  recipient_user_id?: UUID | null;
  recipient_unit_id?: UUID | null;
  business_unit_id?: UUID | null;
  split_percent: number;
  gross_amount: number;
  tax_amount: number;
  net_amount: number;
  status: string;
};

type EntryFlow = AnyRow & {
  id: UUID;
  entry_id: UUID;
  batch_id: UUID;
  mes: number;
  percentual: number;
  valor_previsto: number;
  valor_pago: number;
  data_pagamento?: string | null;
  comprovante_url?: string | null;
  demonstrativo_url?: string | null;
  status: string;
};

type Adjustment = AnyRow & {
  id: UUID;
  entry_id: UUID;
  batch_id: UUID;
  venda_id?: UUID | null;
  adjustment_type: "estorno" | "desconto" | "ajuste_manual" | "bonus" | string;
  amount: number;
  description?: string | null;
  grupo?: string | null;
  cota?: string | null;
  parcela?: string | null;
  created_at?: string | null;
};

type Kpi = {
  vendas: number;
  bruta: number;
  liquida: number;
  paga: number;
  pendente: number;
  perdida: number;
  programada: number;
};

const C = {
  red: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
};

const BRL = (v?: number | null) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct = (v?: number | null) => `${((Number(v) || 0) * 100).toFixed(2).replace(".", ",")}%`;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
const monthEnd = () => {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
};

function parsePctHuman(v: string) {
  return (parseFloat((v || "0").replace("%", "").replace(".", "").replace(",", ".")) || 0) / 100;
}

function parseMoneyBR(v: string) {
  return Number((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
}

function parseSplitList(text: string) {
  return (text || "")
    .split(/[;|,]/g)
    .map((x) => parsePctHuman(x.trim()))
    .filter((x) => x > 0);
}

function normalize(s?: string | null) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function between(iso?: string | null, start?: string, end?: string) {
  const d = (iso || "").slice(0, 10);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function StatusPill({ value }: { value?: string | null }) {
  const label = value || "a_pagar";
  const bg = label === "pago" ? "#ecfdf5" : label.includes("estorn") || label === "cancelado" ? "#fef2f2" : "#fffbeb";
  const color = label === "pago" ? "#047857" : label.includes("estorn") || label === "cancelado" ? "#b91c1c" : "#92400e";
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: bg, color }}>
      {label.replaceAll("_", " ")}
    </span>
  );
}

function KpiCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card className="border-0 shadow-sm" style={{ background: "rgba(255,255,255,.92)" }}>
      <CardContent className="p-4">
        <div className="text-xs font-medium text-slate-500">{title}</div>
        <div className="mt-1 text-xl font-bold" style={{ color: C.navy }}>{value}</div>
        {hint ? <div className="mt-1 text-[11px] text-slate-400">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export default function ComissoesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [simTables, setSimTables] = useState<SimTable[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [legacy, setLegacy] = useState<LegacyCommission[]>([]);
  const [legacyFlows, setLegacyFlows] = useState<LegacyFlow[]>([]);
  const [rules, setRules] = useState<TableRule[]>([]);
  const [splits, setSplits] = useState<SplitRule[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryFlows, setEntryFlows] = useState<EntryFlow[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);

  const [startDate, setStartDate] = useState(monthStart());
  const [endDate, setEndDate] = useState(monthEnd());
  const [unitFilter, setUnitFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [adminFilter, setAdminFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [taxPctHuman, setTaxPctHuman] = useState("6,00");

  const [ruleOpen, setRuleOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payEntryId, setPayEntryId] = useState<string | null>(null);
  const [payFlowId, setPayFlowId] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(today());
  const [payValue, setPayValue] = useState("");

  const [demoType, setDemoType] = useState<"data" | "mes">("data");
  const [demoDate, setDemoDate] = useState(today());
  const [demoMonth, setDemoMonth] = useState(today().slice(0, 7));
  const [demoRecipient, setDemoRecipient] = useState("all");

  const [formRule, setFormRule] = useState({
    sim_table_id: "",
    unit_id: "",
    percent_total: "4,00",
    fluxo: "50,00;50,00",
    vendedor: "25,00",
    unidade: "25,00",
    empresa: "50,00",
  });

  const currentUser = useMemo(() => users.find((u) => u.auth_user_id === authUserId) || null, [users, authUserId]);
  const currentUnit = useMemo(() => units.find((u) => u.id === currentUser?.unit_id) || null, [units, currentUser]);
  const matrixUnit = useMemo(() => units.find((u) => u.tipo === "matriz") || null, [units]);
  const isMatrixAdmin = !!currentUser && currentUser.role === "admin" && currentUnit?.tipo === "matriz";
  const isBranchManager = !!currentUser && currentUser.hierarchy_level === "gestor_filial";
  const canManage = isMatrixAdmin;
  const taxFrac = parsePctHuman(taxPctHuman);

  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const userByAuth = useMemo(() => Object.fromEntries(users.map((u) => [u.auth_user_id, u])), [users]);
  const unitById = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units]);
  const vendaById = useMemo(() => Object.fromEntries(vendas.map((v) => [v.id, v])), [vendas]);
  const leadById = useMemo(() => Object.fromEntries(leads.map((l) => [l.id, l])), [leads]);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      setAuthUserId(auth.user?.id || null);

      const [usersRes, unitsRes, simTablesRes, vendasRes, legacyRes, rulesRes, splitsRes, batchesRes, entriesRes, flowsRes, adjustmentsRes] = await Promise.all([
        supabase.from("users").select("*").order("nome", { ascending: true }),
        supabase.from("units").select("*").order("tipo", { ascending: true }).order("nome", { ascending: true }),
        supabase.from("sim_tables").select("*").order("nome_tabela", { ascending: true }),
        supabase
          .from("vendas")
          .select("id,data_venda,vendedor_id,segmento,tabela,administradora,valor_venda,numero_proposta,lead_id,cliente_lead_id,grupo,cota,codigo,cancelada_em,encarteirada_em,status")
          .order("data_venda", { ascending: false })
          .limit(2000),
        supabase.from("commissions").select("*").order("data_venda", { ascending: false }).limit(3000),
        supabase.from("commission_table_rules").select("*").order("created_at", { ascending: false }),
        supabase.from("commission_split_rules").select("*").order("created_at", { ascending: true }),
        supabase.from("commission_batches").select("*").order("created_at", { ascending: false }).limit(3000),
        supabase.from("commission_entries").select("*").order("created_at", { ascending: false }).limit(5000),
        supabase.from("commission_entry_flow").select("*").order("mes", { ascending: true }).limit(8000),
        supabase.from("commission_adjustments").select("*").order("created_at", { ascending: false }).limit(3000),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (unitsRes.error) throw unitsRes.error;
      if (vendasRes.error) throw vendasRes.error;

      const vendasData = safeArray<Venda>(vendasRes.data);
      setUsers(safeArray<User>(usersRes.data));
      setUnits(safeArray<Unit>(unitsRes.data));
      setSimTables(safeArray<SimTable>(simTablesRes.data));
      setVendas(vendasData);
      setLegacy(safeArray<LegacyCommission>(legacyRes.data));
      setRules(safeArray<TableRule>(rulesRes.data));
      setSplits(safeArray<SplitRule>(splitsRes.data));
      setBatches(safeArray<Batch>(batchesRes.data));
      setEntries(safeArray<Entry>(entriesRes.data));
      setEntryFlows(safeArray<EntryFlow>(flowsRes.data));
      setAdjustments(safeArray<Adjustment>(adjustmentsRes.data));

      const leadIds = uniq(vendasData.map((v) => v.lead_id || v.cliente_lead_id).filter(Boolean) as string[]);
      if (leadIds.length) {
        const { data: leadsData } = await supabase.from("leads").select("id,nome").in("id", leadIds);
        setLeads(safeArray<Lead>(leadsData));
      }

      const legacyIds = safeArray<LegacyCommission>(legacyRes.data).map((c) => c.id);
      if (legacyIds.length) {
        const { data: lf } = await supabase.from("commission_flow").select("*").in("commission_id", legacyIds).order("mes", { ascending: true });
        setLegacyFlows(safeArray<LegacyFlow>(lf));
      } else {
        setLegacyFlows([]);
      }
    } catch (err: any) {
      alert("Erro ao carregar comissões: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  function vendorFromVenda(v: Venda) {
    return (v.vendedor_id && (userByAuth[v.vendedor_id] || userById[v.vendedor_id])) || null;
  }

  function vendaCliente(v?: Venda | null) {
    if (!v) return "—";
    const lead = (v.lead_id && leadById[v.lead_id]) || (v.cliente_lead_id && leadById[v.cliente_lead_id]);
    return lead?.nome || lead?.name || "Cliente não identificado";
  }

  function canSeeUnit(unitId?: string | null) {
    if (isMatrixAdmin) return true;
    if (!currentUser) return false;
    if (isBranchManager) return !!unitId && unitId === currentUser.unit_id;
    return !!unitId && unitId === currentUser.unit_id;
  }

  function canSeeVendor(vendedorAuthOrId?: string | null) {
    if (isMatrixAdmin) return true;
    if (!currentUser) return false;
    const vendedor = vendedorAuthOrId ? userByAuth[vendedorAuthOrId] || userById[vendedorAuthOrId] : null;
    if (!vendedor) return false;
    if (isBranchManager) return vendedor.unit_id === currentUser.unit_id;
    return vendedor.id === currentUser.id || vendedor.auth_user_id === currentUser.auth_user_id;
  }

  const scopedVendors = useMemo(() => {
    if (isMatrixAdmin) return users.filter((u) => u.is_active !== false);
    if (isBranchManager) return users.filter((u) => u.unit_id === currentUser?.unit_id && u.is_active !== false);
    return currentUser ? [currentUser] : [];
  }, [users, currentUser, isMatrixAdmin, isBranchManager]);

  const scopedUnits = useMemo(() => {
    if (isMatrixAdmin) return units.filter((u) => u.is_active !== false);
    return currentUnit ? [currentUnit] : [];
  }, [units, currentUnit, isMatrixAdmin]);

  const visibleEntries = useMemo(() => {
    return entries.filter((e) => {
      const batch = batches.find((b) => b.id === e.batch_id);
      const venda = batch ? vendaById[batch.venda_id] : vendaById[e.venda_id];
      if (!canSeeUnit(e.business_unit_id || batch?.business_unit_id)) return false;
      if (unitFilter !== "all" && (e.business_unit_id || batch?.business_unit_id) !== unitFilter) return false;
      if (vendorFilter !== "all" && e.recipient_user_id !== vendorFilter && batch?.vendedor_id !== vendorFilter) return false;
      if (adminFilter !== "all" && normalize(venda?.administradora || batch?.sim_table_id || "") !== normalize(adminFilter)) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (!between(batch?.data_venda || venda?.data_venda, startDate, endDate)) return false;
      return true;
    });
  }, [entries, batches, vendaById, unitFilter, vendorFilter, adminFilter, statusFilter, startDate, endDate, currentUser, isMatrixAdmin, isBranchManager]);

  const visibleLegacy = useMemo(() => {
    return legacy.filter((c) => {
      if (!canSeeVendor(c.vendedor_id)) return false;
      const vendor = userByAuth[c.vendedor_id] || userById[c.vendedor_id];
      if (unitFilter !== "all" && vendor?.unit_id !== unitFilter) return false;
      if (vendorFilter !== "all" && vendor?.id !== vendorFilter && vendor?.auth_user_id !== vendorFilter) return false;
      if (adminFilter !== "all" && normalize(c.administradora) !== normalize(adminFilter)) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!between(c.data_venda, startDate, endDate)) return false;
      return true;
    });
  }, [legacy, userByAuth, userById, unitFilter, vendorFilter, adminFilter, statusFilter, startDate, endDate, currentUser, isMatrixAdmin, isBranchManager]);

  const vendasSemComissao = useMemo(() => {
    const legacyVendaIds = new Set(legacy.map((c) => c.venda_id));
    const batchVendaIds = new Set(batches.map((b) => b.venda_id));
    return vendas.filter((v) => {
      if (legacyVendaIds.has(v.id) || batchVendaIds.has(v.id)) return false;
      if (!canSeeVendor(v.vendedor_id)) return false;
      const vendor = vendorFromVenda(v);
      if (unitFilter !== "all" && vendor?.unit_id !== unitFilter) return false;
      if (vendorFilter !== "all" && vendor?.id !== vendorFilter && vendor?.auth_user_id !== vendorFilter) return false;
      if (adminFilter !== "all" && normalize(v.administradora) !== normalize(adminFilter)) return false;
      if (!between(v.data_venda, startDate, endDate)) return false;
      return (Number(v.valor_venda) || 0) > 0;
    });
  }, [vendas, legacy, batches, unitFilter, vendorFilter, adminFilter, startDate, endDate, currentUser, isMatrixAdmin, isBranchManager]);

  const kpis = useMemo<Kpi>(() => {
    const entryIds = new Set(visibleEntries.map((e) => e.id));
    const batchIds = new Set(visibleEntries.map((e) => e.batch_id));
    const vendaIds = new Set<string>();
    let bruta = 0;
    let paga = 0;
    let programada = 0;
    let perdida = 0;

    visibleEntries.forEach((e) => {
      vendaIds.add(e.venda_id);
      bruta += Number(e.gross_amount) || 0;
      const flows = entryFlows.filter((f) => f.entry_id === e.id);
      paga += flows.reduce((a, f) => a + (Number(f.valor_pago) || 0), 0);
      programada += flows.reduce((a, f) => a + Math.max(0, (Number(f.valor_previsto) || 0) - (Number(f.valor_pago) || 0)), 0);
    });

    adjustments.forEach((a) => {
      if (entryIds.has(a.entry_id) || batchIds.has(a.batch_id)) {
        if (a.adjustment_type === "estorno" || a.adjustment_type === "desconto") perdida += Math.abs(Number(a.amount) || 0);
      }
    });

    visibleLegacy.forEach((c) => {
      vendaIds.add(c.venda_id);
      const total = Number(c.valor_total ?? ((Number(c.base_calculo) || 0) * (Number(c.percent_aplicado) || 0))) || 0;
      bruta += total;
      const flows = legacyFlows.filter((f) => f.commission_id === c.id);
      const paid = flows.reduce((a, f) => a + (Number(f.valor_pago_vendedor) || 0), 0);
      paga += paid;
      programada += flows.reduce((a, f) => a + Math.max(0, (Number(f.valor_previsto) || 0) - (Number(f.valor_pago_vendedor) || 0)), 0);
      if (c.status === "estorno") perdida += Math.max(0, total - paid);
    });

    const liquida = bruta * (1 - taxFrac);
    return {
      vendas: vendaIds.size,
      bruta,
      liquida,
      paga,
      pendente: Math.max(0, bruta - paga - perdida),
      perdida,
      programada,
    };
  }, [visibleEntries, visibleLegacy, entryFlows, legacyFlows, adjustments, taxFrac]);

  const administradoras = useMemo(() => {
    return uniq([...vendas.map((v) => v.administradora), ...legacy.map((c) => c.administradora)].filter(Boolean) as string[]).sort();
  }, [vendas, legacy]);

  async function saveRule() {
    if (!canManage) return alert("Somente a matriz pode configurar regras de comissão.");
    const table = simTables.find((t) => t.id === formRule.sim_table_id);
    if (!table) return alert("Selecione uma tabela.");
    if (!formRule.unit_id) return alert("Selecione a unidade da partilha.");

    const percentTotal = parsePctHuman(formRule.percent_total);
    const fluxo = parseSplitList(formRule.fluxo);
    const splitVendedor = parsePctHuman(formRule.vendedor);
    const splitUnidade = parsePctHuman(formRule.unidade);
    const splitEmpresa = parsePctHuman(formRule.empresa);
    const totalSplit = splitVendedor + splitUnidade + splitEmpresa;

    if (percentTotal <= 0) return alert("Informe a comissão total da tabela.");
    if (!fluxo.length || Math.abs(fluxo.reduce((a, b) => a + b, 0) - 1) > 0.001) return alert("O fluxo precisa fechar 100%.");
    if (Math.abs(totalSplit - 1) > 0.001) return alert("A partilha precisa fechar 100%.");

    setSaving(true);
    try {
      const nomeTabela = table.nome_tabela || table.name || "Tabela";
      const { data: rule, error } = await supabase
        .from("commission_table_rules")
        .insert({
          sim_table_id: table.id,
          administradora: table.administradora || null,
          segmento: table.segmento || null,
          nome_tabela: nomeTabela,
          percent_total: percentTotal,
          fluxo_meses: fluxo.length,
          fluxo_percentuais: fluxo,
          is_active: true,
          created_by: authUserId,
        })
        .select("*")
        .single();
      if (error) throw error;

      const rows = [
        { table_rule_id: rule.id, business_unit_id: formRule.unit_id, recipient_type: "vendedor", split_percent: splitVendedor, is_active: true, created_by: authUserId },
        { table_rule_id: rule.id, business_unit_id: formRule.unit_id, recipient_type: "unidade", split_percent: splitUnidade, is_active: true, created_by: authUserId },
        { table_rule_id: rule.id, business_unit_id: formRule.unit_id, recipient_type: "empresa", split_percent: splitEmpresa, is_active: true, created_by: authUserId },
      ];

      const { error: splitErr } = await supabase.from("commission_split_rules").insert(rows as any[]);
      if (splitErr) throw splitErr;
      setRuleOpen(false);
      await loadAll();
      alert("Regra e partilha cadastradas com sucesso.");
    } catch (err: any) {
      alert("Erro ao salvar regra: " + (err?.message || err));
    } finally {
      setSaving(false);
    }
  }

  function findRuleForVenda(v: Venda) {
    const active = rules.filter((r) => r.is_active !== false);
    return (
      active.find((r) => normalize(r.nome_tabela) === normalize(v.tabela) && (!r.administradora || normalize(r.administradora) === normalize(v.administradora))) ||
      active.find((r) => normalize(r.nome_tabela) === normalize(v.tabela)) ||
      null
    );
  }

  async function gerarComissao(v: Venda) {
    if (!canManage) return alert("Somente a matriz pode gerar comissão particionada.");
    const vendor = vendorFromVenda(v);
    if (!vendor?.unit_id) return alert("Vendedor sem unidade vinculada.");
    const unit = unitById[vendor.unit_id];
    if (!unit) return alert("Unidade do vendedor não encontrada.");
    const rule = findRuleForVenda(v);
    if (!rule) return alert(`Não encontrei regra ativa para a tabela: ${v.tabela || "—"}`);
    const splitRows = splits.filter((s) => s.table_rule_id === rule.id && s.is_active !== false && s.business_unit_id === vendor.unit_id);
    if (!splitRows.length) return alert("Não existe partilha ativa para essa tabela e unidade.");

    const valorVenda = Number(v.valor_venda) || 0;
    const total = valorVenda * (Number(rule.percent_total) || 0);
    if (total <= 0) return alert("Comissão total zerada.");

    setSaving(true);
    try {
      const { data: batch, error: batchErr } = await supabase
        .from("commission_batches")
        .insert({
          venda_id: v.id,
          sim_table_id: rule.sim_table_id || null,
          table_rule_id: rule.id,
          business_unit_id: vendor.unit_id,
          vendedor_id: vendor.id,
          data_venda: v.data_venda || today(),
          valor_venda: valorVenda,
          percent_total: rule.percent_total,
          commission_total_gross: total,
          status: "a_pagar",
          legacy: false,
          created_by: authUserId,
        })
        .select("*")
        .single();
      if (batchErr) throw batchErr;

      for (const s of splitRows) {
        const isEmpresa = s.recipient_type === "empresa";
        const isUnidade = s.recipient_type === "unidade";
        const entryUnitId = isEmpresa ? matrixUnit?.id || null : vendor.unit_id;
        const managerUserId = isEmpresa ? matrixUnit?.manager_user_id || null : unit.manager_user_id || null;
        const recipientUserId = s.recipient_type === "vendedor" ? vendor.id : s.recipient_user_id || managerUserId;
        const recipientUnitId = isEmpresa ? matrixUnit?.id || null : isUnidade ? unit.id : s.recipient_unit_id || null;
        const gross = total * (Number(s.split_percent) || 0);
        const tax = gross * taxFrac;

        const { data: entry, error: entryErr } = await supabase
          .from("commission_entries")
          .insert({
            batch_id: batch.id,
            venda_id: v.id,
            recipient_type: s.recipient_type,
            recipient_user_id: recipientUserId,
            recipient_unit_id: recipientUnitId,
            business_unit_id: entryUnitId,
            split_percent: s.split_percent,
            gross_amount: gross,
            tax_amount: tax,
            net_amount: gross - tax,
            status: "a_pagar",
            created_by: authUserId,
          })
          .select("*")
          .single();
        if (entryErr) throw entryErr;

        const fluxo = safeArray<number>(rule.fluxo_percentuais).length ? safeArray<number>(rule.fluxo_percentuais) : [1];
        const flowRows = fluxo.map((p, idx) => ({
          entry_id: entry.id,
          batch_id: batch.id,
          mes: idx + 1,
          percentual: Number(p) || 0,
          valor_previsto: gross * (Number(p) || 0),
          valor_pago: 0,
          data_pagamento: null,
          status: "a_pagar",
        }));
        const { error: flowErr } = await supabase.from("commission_entry_flow").insert(flowRows as any[]);
        if (flowErr) throw flowErr;
      }

      await loadAll();
      alert("Comissão particionada gerada com sucesso.");
    } catch (err: any) {
      alert("Erro ao gerar comissão: " + (err?.message || err));
    } finally {
      setSaving(false);
    }
  }

  async function registrarPagamento() {
    if (!canManage) return alert("Somente a matriz pode registrar pagamento.");
    if (!payFlowId) return;
    const flow = entryFlows.find((f) => f.id === payFlowId);
    const value = payValue ? parseMoneyBR(payValue) : Number(flow?.valor_previsto) || 0;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("commission_entry_flow")
        .update({ valor_pago: value, data_pagamento: payDate, status: "pago" })
        .eq("id", payFlowId);
      if (error) throw error;

      if (payEntryId) {
        const freshFlows = entryFlows.filter((f) => f.entry_id === payEntryId).map((f) => (f.id === payFlowId ? { ...f, valor_pago: value } : f));
        const entry = entries.find((e) => e.id === payEntryId);
        const paid = freshFlows.reduce((a, f) => a + (Number(f.valor_pago) || 0), 0);
        const status = paid >= (Number(entry?.gross_amount) || 0) - 0.01 ? "pago" : "parcial";
        await supabase.from("commission_entries").update({ status }).eq("id", payEntryId);
      }
      setPayOpen(false);
      await loadAll();
    } catch (err: any) {
      alert("Erro ao registrar pagamento: " + (err?.message || err));
    } finally {
      setSaving(false);
    }
  }

  function openPay(entry: Entry, flow: EntryFlow) {
    setPayEntryId(entry.id);
    setPayFlowId(flow.id);
    setPayDate(today());
    setPayValue(String(Number(flow.valor_previsto || 0).toFixed(2)).replace(".", ","));
    setPayOpen(true);
  }

  async function registrarEstorno(entry: Entry) {
    if (!canManage) return alert("Somente a matriz pode registrar estorno.");
    const amountText = prompt("Valor do estorno/desconto:", String(Number(entry.gross_amount || 0).toFixed(2)).replace(".", ","));
    if (!amountText) return;
    const amount = parseMoneyBR(amountText);
    if (amount <= 0) return alert("Valor inválido.");
    const description = prompt("Descrição do estorno:", "Estorno de comissão") || "Estorno de comissão";
    setSaving(true);
    try {
      const { error } = await supabase.from("commission_adjustments").insert({
        entry_id: entry.id,
        batch_id: entry.batch_id,
        venda_id: entry.venda_id,
        adjustment_type: "estorno",
        amount,
        description,
        created_by: authUserId,
      });
      if (error) throw error;
      await supabase.from("commission_entries").update({ status: "estornado" }).eq("id", entry.id);
      await loadAll();
    } catch (err: any) {
      alert("Erro ao registrar estorno: " + (err?.message || err));
    } finally {
      setSaving(false);
    }
  }

  function demonstrativoRows() {
    const start = demoType === "data" ? demoDate : `${demoMonth}-01`;
    const end = demoType === "data" ? demoDate : new Date(Number(demoMonth.slice(0, 4)), Number(demoMonth.slice(5, 7)), 0).toISOString().slice(0, 10);
    const rows: AnyRow[] = [];

    visibleEntries.forEach((e) => {
      if (demoRecipient !== "all" && e.recipient_user_id !== demoRecipient) return;
      const batch = batches.find((b) => b.id === e.batch_id);
      const venda = vendaById[e.venda_id] || (batch ? vendaById[batch.venda_id] : null);
      const flows = entryFlows.filter((f) => f.entry_id === e.id && (between(f.data_pagamento, start, end) || (f.status !== "pago" && demoType === "mes")));
      flows.forEach((f) => {
        const gross = Number(f.valor_pago || f.valor_previsto) || 0;
        const imposto = gross * taxFrac;
        rows.push({
          tipo: "Comissão",
          proposta: venda?.numero_proposta || "—",
          cliente: vendaCliente(venda),
          descricao: `${e.recipient_type} • ${userById[e.recipient_user_id || ""]?.nome || unitById[e.recipient_unit_id || ""]?.nome || "Favorecido"}`,
          grupo: venda?.grupo || "—",
          cota: venda?.cota || "—",
          parcela: `${f.mes}`,
          venda: Number(batch?.valor_venda || venda?.valor_venda) || 0,
          bruta: gross,
          impostos: imposto,
          liquida: gross - imposto,
          status: f.status === "pago" ? "Pago" : "A pagar",
        });
      });
    });

    adjustments.forEach((a) => {
      if (!between(a.created_at, start, end)) return;
      const e = entries.find((x) => x.id === a.entry_id);
      if (!e || !visibleEntries.some((ve) => ve.id === e.id)) return;
      if (demoRecipient !== "all" && e.recipient_user_id !== demoRecipient) return;
      const venda = vendaById[a.venda_id || e.venda_id];
      const val = Math.abs(Number(a.amount) || 0) * -1;
      rows.push({
        tipo: a.adjustment_type === "estorno" ? "Estorno" : "Ajuste",
        proposta: venda?.numero_proposta || "—",
        cliente: vendaCliente(venda),
        descricao: a.description || "Estorno/desconto de comissão",
        grupo: a.grupo || venda?.grupo || "—",
        cota: a.cota || venda?.cota || "—",
        parcela: a.parcela || "—",
        venda: Number(venda?.valor_venda) || 0,
        bruta: val,
        impostos: 0,
        liquida: val,
        status: "Descontado",
      });
    });

    visibleLegacy.forEach((c) => {
      if (demoRecipient !== "all") {
        const vendor = userByAuth[c.vendedor_id] || userById[c.vendedor_id];
        if (vendor?.id !== demoRecipient) return;
      }
      legacyFlows
        .filter((f) => f.commission_id === c.id && (between(f.data_pagamento_vendedor, start, end) || (demoType === "mes" && !f.data_pagamento_vendedor)))
        .forEach((f) => {
          const gross = Number(f.valor_pago_vendedor || f.valor_previsto) || 0;
          const imposto = gross * taxFrac;
          rows.push({
            tipo: c.status === "estorno" ? "Estorno" : "Comissão",
            proposta: c.numero_proposta || "—",
            cliente: c.cliente_nome || "Cliente não identificado",
            descricao: "Comissão modelo anterior",
            grupo: "—",
            cota: "—",
            parcela: `${f.mes}`,
            venda: Number(c.valor_venda) || 0,
            bruta: c.status === "estorno" ? -Math.abs(gross) : gross,
            impostos: c.status === "estorno" ? 0 : imposto,
            liquida: c.status === "estorno" ? -Math.abs(gross) : gross - imposto,
            status: f.valor_pago_vendedor ? "Pago" : "A pagar",
          });
        });
    });

    return rows;
  }

  function gerarPDFDemonstrativo() {
    const rows = demonstrativoRows();
    if (!rows.length) return alert("Nenhum lançamento encontrado para o demonstrativo.");
    const doc = new jsPDF({ orientation: "landscape" });
    const periodo = demoType === "data" ? demoDate.split("-").reverse().join("/") : demoMonth.split("-").reverse().join("/");
    const totalBruto = rows.reduce((a, r) => a + r.bruta, 0);
    const totalImp = rows.reduce((a, r) => a + r.impostos, 0);
    const totalLiq = rows.reduce((a, r) => a + r.liquida, 0);

    doc.setFontSize(16);
    doc.text("Demonstrativo de Comissão", 14, 16);
    doc.setFontSize(9);
    doc.text(`Período: ${periodo}`, 14, 23);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 28);
    doc.text("Este documento possui caráter demonstrativo e não substitui o comprovante bancário de pagamento.", 14, 33);

    autoTable(doc, {
      startY: 39,
      head: [["Tipo", "Proposta", "Cliente", "Descrição", "Grupo", "Cota", "Parcela", "R$ da Venda", "Comissão Bruta", "Impostos", "Comissão Líquida", "Status"]],
      body: rows.map((r) => [r.tipo, r.proposta, r.cliente, r.descricao, r.grupo, r.cota, r.parcela, BRL(r.venda), BRL(r.bruta), BRL(r.impostos), BRL(r.liquida), r.status]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [30, 41, 63] },
    });

    const y = (doc as any).lastAutoTable?.finalY || 180;
    doc.setFontSize(10);
    doc.text(`Comissão Bruta: ${BRL(totalBruto)}`, 14, y + 10);
    doc.text(`Impostos: ${BRL(totalImp)}`, 85, y + 10);
    doc.text(`Comissão Líquida: ${BRL(totalLiq)}`, 145, y + 10);
    doc.save(`demonstrativo-comissao-${demoType === "data" ? demoDate : demoMonth}.pdf`);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-600">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando comissões...
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-5 p-4 md:p-6" style={{ background: "linear-gradient(135deg,#F5F5F5 0%,#ffffff 45%,#f8fafc 100%)" }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "rgba(161,28,39,.10)", color: C.red }}>
            <ShieldCheck className="h-3.5 w-3.5" /> Comissões por unidade
          </div>
          <h1 className="mt-2 text-2xl font-bold" style={{ color: C.navy }}>Comissões</h1>
          <p className="text-sm text-slate-500">
            Modelo novo particionado por vendedor, unidade e matriz. Histórico antigo preservado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadAll} disabled={saving}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
          {canManage && (
            <Button onClick={() => setRuleOpen(true)} style={{ background: C.red }}>
              <Settings className="mr-2 h-4 w-4" /> Nova regra
            </Button>
          )}
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-7">
          <div>
            <Label>Início</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>Fim</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <Label>Unidade</Label>
            <Select value={unitFilter} onValueChange={setUnitFilter} disabled={!isMatrixAdmin}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {scopedUnits.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vendedor/Favorecido</Label>
            <Select value={vendorFilter} onValueChange={setVendorFilter} disabled={!isMatrixAdmin && !isBranchManager}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {scopedVendors.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Administradora</Label>
            <Select value={adminFilter} onValueChange={setAdminFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {administradoras.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="a_pagar">A pagar</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="estornado">Estornado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Impostos %</Label>
            <Input value={taxPctHuman} onChange={(e) => setTaxPctHuman(e.target.value)} placeholder="6,00" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-7">
        <KpiCard title="Vendas" value={String(kpis.vendas)} />
        <KpiCard title="Comissão Bruta" value={BRL(kpis.bruta)} />
        <KpiCard title="Comissão Líquida" value={BRL(kpis.liquida)} />
        <KpiCard title="Comissão Paga" value={BRL(kpis.paga)} />
        <KpiCard title="Comissão Pendente" value={BRL(kpis.pendente)} />
        <KpiCard title="Comissão Perdida" value={BRL(kpis.perdida)} />
        <KpiCard title="Comissão Programada" value={BRL(kpis.programada)} />
      </div>

      <Tabs defaultValue="painel" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="painel">Painel</TabsTrigger>
          <TabsTrigger value="sem">Vendas sem comissão</TabsTrigger>
          <TabsTrigger value="geradas">Comissões geradas</TabsTrigger>
          <TabsTrigger value="demo">Demonstrativos</TabsTrigger>
          <TabsTrigger value="regras">Regras e Partilhas</TabsTrigger>
        </TabsList>

        <TabsContent value="painel">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle style={{ color: C.navy }}>Resumo operacional</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border p-4">
                <div className="text-sm text-slate-500">Perfil de acesso</div>
                <div className="mt-1 font-semibold" style={{ color: C.navy }}>{currentUser?.nome || "—"}</div>
                <div className="text-xs text-slate-500">{currentUnit?.nome || "Sem unidade"} • {currentUser?.hierarchy_level || currentUser?.role || "—"}</div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="text-sm text-slate-500">Modelo novo</div>
                <div className="mt-1 text-2xl font-bold" style={{ color: C.red }}>{visibleEntries.length}</div>
                <div className="text-xs text-slate-500">lançamentos particionados visíveis</div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="text-sm text-slate-500">Histórico preservado</div>
                <div className="mt-1 text-2xl font-bold" style={{ color: C.gold }}>{visibleLegacy.length}</div>
                <div className="text-xs text-slate-500">comissões antigas no período</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sem">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle style={{ color: C.navy }}>Vendas sem comissão</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="p-2">Data</th><th className="p-2">Cliente</th><th className="p-2">Vendedor</th><th className="p-2">Unidade</th><th className="p-2">Administradora</th><th className="p-2">Tabela</th><th className="p-2 text-right">Venda</th><th className="p-2 text-right">Ação</th></tr>
                </thead>
                <tbody>
                  {vendasSemComissao.map((v) => {
                    const vendor = vendorFromVenda(v);
                    const unit = vendor?.unit_id ? unitById[vendor.unit_id] : null;
                    return (
                      <tr key={v.id} className="border-b">
                        <td className="p-2">{v.data_venda?.split("-").reverse().join("/") || "—"}</td>
                        <td className="p-2">{vendaCliente(v)}</td>
                        <td className="p-2">{vendor?.nome || "—"}</td>
                        <td className="p-2">{unit?.nome || "—"}</td>
                        <td className="p-2">{v.administradora || "—"}</td>
                        <td className="p-2">{v.tabela || "—"}</td>
                        <td className="p-2 text-right">{BRL(v.valor_venda)}</td>
                        <td className="p-2 text-right">
                          <Button size="sm" variant="outline" onClick={() => gerarComissao(v)} disabled={!canManage || saving}>
                            <PlusCircle className="mr-1 h-3.5 w-3.5" /> Gerar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {!vendasSemComissao.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">Nenhuma venda sem comissão no filtro.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="geradas">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle style={{ color: C.navy }}>Comissões geradas</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="p-2">Tipo</th><th className="p-2">Favorecido</th><th className="p-2">Unidade</th><th className="p-2">Cliente</th><th className="p-2">Proposta</th><th className="p-2">Partilha</th><th className="p-2 text-right">Bruta</th><th className="p-2 text-right">Líquida</th><th className="p-2">Status</th><th className="p-2">Fluxo</th><th className="p-2 text-right">Ações</th></tr>
                </thead>
                <tbody>
                  {visibleEntries.map((e) => {
                    const venda = vendaById[e.venda_id];
                    const fav = userById[e.recipient_user_id || ""]?.nome || unitById[e.recipient_unit_id || ""]?.nome || "—";
                    const unit = unitById[e.business_unit_id || ""];
                    const flows = entryFlows.filter((f) => f.entry_id === e.id);
                    return (
                      <tr key={e.id} className="border-b align-top">
                        <td className="p-2 capitalize">{e.recipient_type}</td>
                        <td className="p-2 font-medium">{fav}</td>
                        <td className="p-2">{unit?.nome || "—"}</td>
                        <td className="p-2">{vendaCliente(venda)}</td>
                        <td className="p-2">{venda?.numero_proposta || "—"}</td>
                        <td className="p-2">{pct(e.split_percent)}</td>
                        <td className="p-2 text-right">{BRL(e.gross_amount)}</td>
                        <td className="p-2 text-right">{BRL(e.net_amount)}</td>
                        <td className="p-2"><StatusPill value={e.status} /></td>
                        <td className="p-2">
                          <div className="space-y-1">
                            {flows.map((f) => (
                              <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1 text-xs">
                                <span>{f.mes}ª • {BRL(f.valor_previsto)}</span>
                                <span>{f.status === "pago" ? "Pago" : "A pagar"}</span>
                                {canManage && f.status !== "pago" && <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => openPay(e, f)}>Pagar</Button>}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-2 text-right">
                          {canManage && <Button size="sm" variant="outline" onClick={() => registrarEstorno(e)}>Estornar</Button>}
                        </td>
                      </tr>
                    );
                  })}
                  {!visibleEntries.length && <tr><td colSpan={11} className="p-6 text-center text-slate-500">Nenhuma comissão particionada encontrada.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="demo">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle style={{ color: C.navy }}>Demonstrativos de comissão</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-5">
                <div>
                  <Label>Tipo</Label>
                  <Select value={demoType} onValueChange={(v: "data" | "mes") => setDemoType(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="data">Por data de pagamento</SelectItem><SelectItem value="mes">Mensal</SelectItem></SelectContent>
                  </Select>
                </div>
                {demoType === "data" ? <div><Label>Data</Label><Input type="date" value={demoDate} onChange={(e) => setDemoDate(e.target.value)} /></div> : <div><Label>Mês</Label><Input type="month" value={demoMonth} onChange={(e) => setDemoMonth(e.target.value)} /></div>}
                <div>
                  <Label>Favorecido</Label>
                  <Select value={demoRecipient} onValueChange={setDemoRecipient}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {scopedVendors.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={gerarPDFDemonstrativo} style={{ background: C.navy }}>
                    <FileText className="mr-2 h-4 w-4" /> Gerar PDF
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
                O demonstrativo substitui o recibo assinado. Ele mostra comissões, parcelas, impostos, status pago/a pagar e estornos/descontos como linhas negativas.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regras">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle style={{ color: C.navy }}>Regras e Partilhas</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr><th className="p-2">Tabela</th><th className="p-2">Administradora</th><th className="p-2">Comissão Total</th><th className="p-2">Fluxo</th><th className="p-2">Unidade</th><th className="p-2">Partilha</th></tr>
                </thead>
                <tbody>
                  {rules.map((r) => {
                    const ruleSplits = splits.filter((s) => s.table_rule_id === r.id);
                    return (
                      <tr key={r.id} className="border-b align-top">
                        <td className="p-2 font-medium">{r.nome_tabela}</td>
                        <td className="p-2">{r.administradora || "—"}</td>
                        <td className="p-2">{pct(r.percent_total)}</td>
                        <td className="p-2">{safeArray<number>(r.fluxo_percentuais).map((x) => pct(x)).join(" / ")}</td>
                        <td className="p-2">{unitById[ruleSplits[0]?.business_unit_id || ""]?.nome || "—"}</td>
                        <td className="p-2">{ruleSplits.map((s) => `${s.recipient_type}: ${pct(s.split_percent)}`).join(" • ")}</td>
                      </tr>
                    );
                  })}
                  {!rules.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">Nenhuma regra cadastrada.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nova regra de comissão e partilha</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Tabela</Label>
              <Select value={formRule.sim_table_id} onValueChange={(v) => setFormRule((f) => ({ ...f, sim_table_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {simTables.map((t) => <SelectItem key={t.id} value={t.id}>{t.administradora ? `${t.administradora} • ` : ""}{t.nome_tabela || t.name || t.id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade da partilha</Label>
              <Select value={formRule.unit_id} onValueChange={(v) => setFormRule((f) => ({ ...f, unit_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{units.filter((u) => u.tipo !== "matriz").map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Comissão total da tabela %</Label><Input value={formRule.percent_total} onChange={(e) => setFormRule((f) => ({ ...f, percent_total: e.target.value }))} /></div>
            <div className="md:col-span-2"><Label>Fluxo de pagamento %</Label><Input value={formRule.fluxo} onChange={(e) => setFormRule((f) => ({ ...f, fluxo: e.target.value }))} placeholder="50,00;50,00" /></div>
            <div><Label>Vendedor % da comissão</Label><Input value={formRule.vendedor} onChange={(e) => setFormRule((f) => ({ ...f, vendedor: e.target.value }))} /></div>
            <div><Label>Unidade/Gestor % da comissão</Label><Input value={formRule.unidade} onChange={(e) => setFormRule((f) => ({ ...f, unidade: e.target.value }))} /></div>
            <div><Label>Empresa/Matriz % da comissão</Label><Input value={formRule.empresa} onChange={(e) => setFormRule((f) => ({ ...f, empresa: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setRuleOpen(false)}>Cancelar</Button>
            <Button onClick={saveRule} disabled={saving} style={{ background: C.red }}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />} Salvar regra
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pagamento</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Data de pagamento</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
            <div><Label>Valor pago</Label><Input value={payValue} onChange={(e) => setPayValue(e.target.value)} placeholder="0,00" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancelar</Button>
            <Button onClick={registrarPagamento} disabled={saving} style={{ background: C.red }}>Salvar pagamento</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
