// src/pages/Carteira.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import {
  Loader2,
  RefreshCw,
  Plus,
  Pencil,
  Eye,
  X,
  Check,
  ArrowLeftRight,
} from "lucide-react";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

/** ============================
 * Tipos
 * ============================ */
type UserRow = {
  id: string;
  auth_user_id: string;
  nome?: string | null;
  email?: string | null;
  role?: string | null;
  user_role?: string | null;
  is_active?: boolean | null;
};

type VendaRow = {
  id: string;
  data_venda?: string | null; // date
  vendedor_id?: string | null; // no seu projeto: costuma ser auth_user_id
  segmento?: string | null;
  produto?: string | null;
  tabela?: string | null;
  administradora?: string | null;
  forma_venda?: string | null;
  numero_proposta?: string | null;

  cliente_lead_id?: string | null;
  lead_id?: string | null;

  grupo?: string | null;
  cota?: string | null;
  codigo?: string | null; // "00" = ativa
  encarteirada_em?: string | null; // timestamptz
  tipo_venda?: string | null; // Normal/Contemplada/Bolsão
  contemplada?: boolean | null;
  data_contemplacao?: string | null; // date
  contemplacao_tipo?: string | null;
  contemplacao_pct?: number | null; // numeric

  cancelada_em?: string | null; // timestamptz
  reativada_em?: string | null; // timestamptz

  inad?: boolean | null;
  inad_em?: string | null;
  inad_revertida_em?: string | null;

  valor_venda?: number | null; // numeric

  cpf?: string | null;
  nascimento?: string | null; // date
  telefone?: string | null;
  email?: string | null;
  descricao?: string | null;

  status_inicial?: string | null;
  status?: string | null;

  created_at?: string | null;
};

type LeadRow = {
  id: string;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  cpf?: string | null;
  data_nascimento?: string | null;
};

type ClienteRow = {
  id: string;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  cpf?: string | null;
  data_nascimento?: string | null;
};

type SimAdminRow = {
  id: string;
  name?: string | null;
  nome?: string | null;
  slug?: string | null;
};

type SimTableRow = Record<string, any>;

type MetaRow = {
  id: string;
  ano: number;
  vendedor_id: string; // pode ser users.id OU auth_user_id (legado)
  m01?: number | null;
  m02?: number | null;
  m03?: number | null;
  m04?: number | null;
  m05?: number | null;
  m06?: number | null;
  m07?: number | null;
  m08?: number | null;
  m09?: number | null;
  m10?: number | null;
  m11?: number | null;
  m12?: number | null;
  updated_at?: string | null;
};

/** ============================
 * Helpers
 * ============================ */
const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
function currency(v?: number | null) {
  const n = Number(v ?? 0);
  return BRL.format(Number.isFinite(n) ? n : 0);
}

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateBR(iso?: string | null) {
  if (!iso) return "-";
  // aceita "YYYY-MM-DD" ou timestamptz
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // tenta parse manual de date puro
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(iso);
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear());
  return `${dd}/${mm}/${yy}`;
}

function formatDateTimeBR(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

function stripDiacritics(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normKey(s?: string | null) {
  return stripDiacritics(String(s ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isoFromDateInput(v: string) {
  // v: "YYYY-MM-DD"
  return v;
}

function digitsOnly(s?: string | null) {
  return String(s ?? "").replace(/\D+/g, "");
}

function validateCPFOrCNPJ(value?: string | null) {
  const s = digitsOnly(value);
  if (!s) return false;
  if (s.length === 11) return true; // (mantendo simples, como no seu baseline)
  if (s.length === 14) return true;
  return false;
}

/** tenta inferir colunas comuns dentro do sim_tables */
function simTableAdminId(r: SimTableRow) {
  return (
    r.admin_id ??
    r.sim_admin_id ??
    r.administradora_id ??
    r.adminId ??
    r.admin ??
    null
  );
}
function simTableSegment(r: SimTableRow) {
  return (
    r.segmento ??
    r.produto ??
    r.segment ??
    r.segment_name ??
    r.segmentLabel ??
    null
  );
}
function simTableName(r: SimTableRow) {
  return r.nome ?? r.name ?? r.tabela ?? r.table_name ?? r.table ?? null;
}

/** ============================
 * UI mini helpers
 * ============================ */
function Hr() {
  // substitui Separator (evita erro de deploy)
  return <div className="h-px w-full bg-black/10 dark:bg-white/10" />;
}

function monthKey(i: number) {
  return String(i).padStart(2, "0");
}
function monthLabel(i: number) {
  const labels = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  return labels[i - 1] ?? `M${i}`;
}

/** ============================
 * Componente
 * ============================ */
export default function Carteira() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [me, setMe] = useState<UserRow | null>(null);
  const isAdmin = useMemo(() => {
    const r = (me?.role || me?.user_role || "").toLowerCase();
    return r === "admin";
  }, [me]);

  // Base users (para filtro admin)
  const [users, setUsers] = useState<UserRow[]>([]);

  // Filtro (admin)
  const [vendorFilter, setVendorFilter] = useState<string>("__all__"); // guarda auth_user_id quando seleciona um vendedor
  const selectedVendor = useMemo(() => {
    if (vendorFilter === "__all__") return null;
    return users.find((u) => u.auth_user_id === vendorFilter) ?? null;
  }, [vendorFilter, users]);

  // Ano da meta
  const [metaYear, setMetaYear] = useState<number>(new Date().getFullYear());

  // Metas
  const [metaRow, setMetaRow] = useState<MetaRow | null>(null);
  const [allMetas, setAllMetas] = useState<MetaRow[]>([]); // admin + Todos
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaEditorOpen, setMetaEditorOpen] = useState(false);
  const [metaDraft, setMetaDraft] = useState<Record<string, number>>({});

  // Bases de simulação (cascata admin/segmento/tabela)
  const [simAdmins, setSimAdmins] = useState<SimAdminRow[]>([]);
  const [simTables, setSimTables] = useState<SimTableRow[]>([]);

  // Vendas e cadastros
  const [vendas, setVendas] = useState<VendaRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);

  // Busca principal
  const [search, setSearch] = useState("");

  // Mostrar/ocultar carteira
  const [showCarteira, setShowCarteira] = useState(true);

  /** ============================
   * Modais
   * ============================ */
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [viewSaleOpen, setViewSaleOpen] = useState(false);
  const [editPendingOpen, setEditPendingOpen] = useState(false);

  const [activeSale, setActiveSale] = useState<VendaRow | null>(null);

  // Nova venda - campos
  const [nvLeadQuery, setNvLeadQuery] = useState("");
  const [nvLeadId, setNvLeadId] = useState<string | null>(null);

  const nvLead = useMemo(() => {
    if (!nvLeadId) return null;
    return leads.find((l) => l.id === nvLeadId) ?? null;
  }, [nvLeadId, leads]);

  const [nvDataVenda, setNvDataVenda] = useState<string>(toYMD(new Date()));
  const [nvAdminId, setNvAdminId] = useState<string | null>(null);
  const [nvSegment, setNvSegment] = useState<string | null>(null);
  const [nvTabela, setNvTabela] = useState<string | null>(null);

  const [nvValorVenda, setNvValorVenda] = useState<string>("");
  const [nvNumeroProposta, setNvNumeroProposta] = useState<string>("");
  const [nvTipoVenda, setNvTipoVenda] = useState<string>("Normal"); // Normal/Contemplada/Bolsão
  const [nvGrupo, setNvGrupo] = useState<string>("");
  const [nvCota, setNvCota] = useState<string>("");

  const [nvCPF, setNvCPF] = useState<string>("");
  const [nvNascimento, setNvNascimento] = useState<string>("");
  const [nvTelefone, setNvTelefone] = useState<string>("");
  const [nvEmail, setNvEmail] = useState<string>("");
  const [nvDescricao, setNvDescricao] = useState<string>("");

  const [nvSaving, setNvSaving] = useState(false);

  /** ============================
   * RBAC: qual vendedor aplicar
   * ============================ */
  const effectiveVendorAuthId = useMemo(() => {
    if (!authUserId) return null;
    if (!isAdmin) return authUserId;

    // admin: se filtrou vendedor, usa ele; senão null (Todos)
    if (vendorFilter !== "__all__") return vendorFilter;

    return null;
  }, [authUserId, isAdmin, vendorFilter]);

  // Importante p/ metas: às vezes metas_vendedores guarda users.id
  const effectiveVendorUsersId = useMemo(() => {
    if (!me) return null;
    if (!isAdmin) return me.id;

    if (vendorFilter === "__all__") return null;
    return selectedVendor?.id ?? null;
  }, [isAdmin, me, vendorFilter, selectedVendor]);

  /** ============================
   * Cascata Admin -> Segmento -> Tabela
   * ============================ */
  const selectedSimAdmin = useMemo(() => {
    if (!nvAdminId) return null;
    return simAdmins.find((a) => a.id === nvAdminId) ?? null;
  }, [nvAdminId, simAdmins]);

  const segmentOptions = useMemo(() => {
    if (!nvAdminId) return [];

    const rows = simTables.filter((t) => String(simTableAdminId(t)) === String(nvAdminId));
    const map = new Map<string, string>(); // key normalizada -> label original
    for (const r of rows) {
      const seg = simTableSegment(r);
      const key = normKey(seg);
      if (!key) continue;
      if (!map.has(key)) map.set(key, String(seg));
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [nvAdminId, simTables]);

  const tableOptions = useMemo(() => {
    if (!nvAdminId || !nvSegment) return [];

    const segKey = normKey(nvSegment);
    const rows = simTables.filter((t) => {
      const adminOk = String(simTableAdminId(t)) === String(nvAdminId);
      const segOk = normKey(simTableSegment(t)) === segKey;
      return adminOk && segOk;
    });

    // dedupe por nome de tabela
    const map = new Map<string, string>(); // key normalizada -> label
    for (const r of rows) {
      const name = simTableName(r);
      const key = normKey(name);
      if (!key) continue;
      if (!map.has(key)) map.set(key, String(name));
    }

    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [nvAdminId, nvSegment, simTables]);

  /** reset cascata */
  useEffect(() => {
    // quando troca a administradora, reseta segmento/tabela
    setNvSegment(null);
    setNvTabela(null);
  }, [nvAdminId]);

  useEffect(() => {
    // quando troca o segmento, reseta tabela
    setNvTabela(null);
  }, [nvSegment]);

  /** ============================
   * Cargas
   * ============================ */
  async function loadMeAndBases() {
    const { data: auth } = await supabase.auth.getUser();
    const auid = auth.user?.id ?? null;
    setAuthUserId(auid);

    if (!auid) {
      setMe(null);
      return;
    }

    // meu perfil (users)
    const { data: meRow, error: meErr } = await supabase
      .from("users")
      .select("*")
      .eq("auth_user_id", auid)
      .maybeSingle();

    if (meErr) {
      console.error("load me error", meErr);
    }
    setMe((meRow as any) ?? null);

    // lista de usuários ativos (p/ filtro admin)
    const { data: usersRows, error: usersErr } = await supabase
      .from("users")
      .select("id, auth_user_id, nome, email, role, user_role, is_active")
      .eq("is_active", true)
      .order("nome", { ascending: true });

    if (usersErr) console.error("load users error", usersErr);
    setUsers(((usersRows as any) ?? []) as UserRow[]);

    // sim_admins / sim_tables
    const [{ data: adminsData, error: adminsErr }, { data: tablesData, error: tablesErr }] =
      await Promise.all([
        supabase.from("sim_admins").select("*").order("name", { ascending: true }),
        supabase.from("sim_tables").select("*"),
      ]);

    if (adminsErr) console.error("load sim_admins error", adminsErr);
    if (tablesErr) console.error("load sim_tables error", tablesErr);

    setSimAdmins(((adminsData as any) ?? []) as SimAdminRow[]);
    setSimTables(((tablesData as any) ?? []) as SimTableRow[]);

    // leads/clientes (pra nova venda)
    const [{ data: leadsData, error: leadsErr }, { data: clientesData, error: clientesErr }] =
      await Promise.all([
        supabase.from("leads").select("id, nome, telefone, email, cpf, data_nascimento").limit(2000),
        supabase.from("clientes").select("id, nome, telefone, email, cpf, data_nascimento").limit(2000),
      ]);
    if (leadsErr) console.error("load leads error", leadsErr);
    if (clientesErr) console.error("load clientes error", clientesErr);

    setLeads(((leadsData as any) ?? []) as LeadRow[]);
    setClientes(((clientesData as any) ?? []) as ClienteRow[]);
  }

  async function loadVendas() {
    // Regra: vendedor vê só as dele (por auth_user_id). Admin pode ver tudo ou filtrar.
    let q = supabase.from("vendas").select("*").order("created_at", { ascending: false }).limit(3000);

    if (effectiveVendorAuthId) {
      q = q.eq("vendedor_id", effectiveVendorAuthId);
    }

    const { data, error } = await q;
    if (error) console.error("load vendas error", error);
    setVendas(((data as any) ?? []) as VendaRow[]);
  }

  /** Metas:
   * - admin + Todos: carrega todas do ano (pra somar)
   * - admin + vendedor: carrega a do vendedor (com fallback users.id/auth_user_id)
   * - vendedor: carrega somente a dele
   */
  async function loadMetas() {
    const ano = metaYear;

    if (isAdmin && vendorFilter === "__all__") {
      const { data, error } = await supabase
        .from("metas_vendedores")
        .select("*")
        .eq("ano", ano);

      if (error) console.error("load metas all error", error);
      const rows = (((data as any) ?? []) as MetaRow[]) ?? [];
      setAllMetas(rows);
      setMetaRow(null);
      return;
    }

    // Caso: vendedor OU admin filtrando 1 vendedor
    const vendorUsersId = effectiveVendorUsersId; // users.id
    const vendorAuth = effectiveVendorAuthId; // auth_user_id

    let found: MetaRow | null = null;

    // tenta por users.id
    if (vendorUsersId) {
      const { data, error } = await supabase
        .from("metas_vendedores")
        .select("*")
        .eq("ano", ano)
        .eq("vendedor_id", vendorUsersId)
        .maybeSingle();

      if (error) console.error("load meta by users.id error", error);
      if (data) found = data as any;
    }

    // fallback: tenta por auth_user_id
    if (!found && vendorAuth) {
      const { data, error } = await supabase
        .from("metas_vendedores")
        .select("*")
        .eq("ano", ano)
        .eq("vendedor_id", vendorAuth)
        .maybeSingle();

      if (error) console.error("load meta by auth_user_id error", error);
      if (data) found = data as any;
    }

    setAllMetas([]);
    setMetaRow(found);
  }

  async function fullReload() {
    setRefreshing(true);
    try {
      await loadMeAndBases();
      await loadVendas();
      await loadMetas();
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fullReload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recarrega vendas quando troca filtro (admin)
  useEffect(() => {
    if (!me) return;
    if (!loading) loadVendas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorFilter, me?.id]);

  // recarrega metas quando troca ano/filtro
  useEffect(() => {
    if (!me) return;
    loadMetas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaYear, vendorFilter, me?.id, isAdmin]);

  /** ============================
   * Derivações
   * ============================ */
  const vendasFiltradas = useMemo(() => {
    const q = normKey(search);
    if (!q) return vendas;

    return vendas.filter((v) => {
      const parts = [
        v.numero_proposta,
        v.administradora,
        v.segmento,
        v.produto,
        v.tabela,
        v.grupo,
        v.cota,
        v.cpf,
        v.telefone,
        v.email,
        v.descricao,
      ]
        .filter(Boolean)
        .map((x) => normKey(String(x)));

      // nome do lead (se houver)
      const leadId = v.lead_id || v.cliente_lead_id;
      const lead = leadId ? leads.find((l) => l.id === leadId) : null;
      if (lead?.nome) parts.push(normKey(lead.nome));

      return parts.some((p) => p.includes(q));
    });
  }, [search, vendas, leads]);

  const vendasPendentes = useMemo(() => {
    return vendasFiltradas.filter((v) => !v.encarteirada_em);
  }, [vendasFiltradas]);

  const vendasEncarteiradas = useMemo(() => {
    return vendasFiltradas.filter((v) => !!v.encarteirada_em);
  }, [vendasFiltradas]);

  const totals = useMemo(() => {
    const ativas = vendasFiltradas.filter((v) => (v.codigo ?? "00") === "00");
    const canceladas = vendasFiltradas.filter((v) => (v.codigo ?? "00") !== "00");
    const inadimplentes = vendasFiltradas.filter((v) => !!v.inad);
    const contempladas = vendasFiltradas.filter((v) => !!v.contemplada);

    const carteiraAtivaValor = ativas.reduce((acc, v) => acc + Number(v.valor_venda ?? 0), 0);
    const vendidoValor = vendasFiltradas.reduce((acc, v) => acc + Number(v.valor_venda ?? 0), 0);

    return {
      count: vendasFiltradas.length,
      ativas: ativas.length,
      canceladas: canceladas.length,
      inadimplentes: inadimplentes.length,
      contempladas: contempladas.length,
      carteiraAtivaValor,
      vendidoValor,
    };
  }, [vendasFiltradas]);

  // realizado mensal (encarteirada ativa no mês) - canceladas (no mês)
  const realizedByMonth = useMemo(() => {
    const year = metaYear;
    const arr = Array.from({ length: 12 }).map((_, idx) => {
      const m = idx + 1;
      return { m, label: monthLabel(m), value: 0 };
    });

    // considera encarteirada_em como data-base do realizado
    for (const v of vendas) {
      const isAtiva = (v.codigo ?? "00") === "00";
      const enc = v.encarteirada_em;
      if (isAtiva && enc) {
        const d = new Date(enc);
        if (d.getFullYear() === year) {
          const mi = d.getMonth(); // 0..11
          arr[mi].value += Number(v.valor_venda ?? 0);
        }
      }

      // cancelações: remove no mês de cancelamento (se existir)
      const isCancel = (v.codigo ?? "00") !== "00";
      const canc = v.cancelada_em;
      if (isCancel && canc) {
        const d = new Date(canc);
        if (d.getFullYear() === year) {
          const mi = d.getMonth();
          arr[mi].value -= Number(v.valor_venda ?? 0);
        }
      }
    }

    return arr;
  }, [vendas, metaYear]);

  /** ============================
   * Metas: soma e donut
   * ============================ */
  const metaByMonth = useMemo(() => {
    const base: Record<string, number> = {};
    for (let i = 1; i <= 12; i++) base[`m${monthKey(i)}`] = 0;

    if (isAdmin && vendorFilter === "__all__") {
      for (const r of allMetas) {
        for (let i = 1; i <= 12; i++) {
          const k = `m${monthKey(i)}` as keyof MetaRow;
          base[`m${monthKey(i)}`] += Number((r as any)[k] ?? 0);
        }
      }
      return base;
    }

    if (metaRow) {
      for (let i = 1; i <= 12; i++) {
        const k = `m${monthKey(i)}` as keyof MetaRow;
        base[`m${monthKey(i)}`] = Number((metaRow as any)[k] ?? 0);
      }
    }
    return base;
  }, [isAdmin, vendorFilter, allMetas, metaRow]);

  const metaAnual = useMemo(() => {
    let sum = 0;
    for (let i = 1; i <= 12; i++) sum += metaByMonth[`m${monthKey(i)}`] ?? 0;
    return sum;
  }, [metaByMonth]);

  const realizadoAnual = useMemo(() => {
    return realizedByMonth.reduce((acc, r) => acc + Number(r.value ?? 0), 0);
  }, [realizedByMonth]);

  const donutData = useMemo(() => {
    const meta = Number(metaAnual ?? 0);
    const real = Number(realizadoAnual ?? 0);
    const done = Math.max(0, Math.min(real, meta));
    const remaining = Math.max(0, meta - done);

    return [
      { name: "Realizado", value: done },
      { name: "Restante", value: remaining },
    ];
  }, [metaAnual, realizadoAnual]);

  const pctMetaRealizada = useMemo(() => {
    const meta = Number(metaAnual ?? 0);
    const real = Number(realizadoAnual ?? 0);
    if (meta <= 0) return 0;
    return (real / meta) * 100;
  }, [metaAnual, realizadoAnual]);

  /** ============================
   * Ações: Meta editor
   * ============================ */
  function openMetaEditor() {
    // admin: se Todos, edita fica desabilitado (porque seria múltiplo)
    if (isAdmin && vendorFilter === "__all__") return;

    const d: Record<string, number> = {};
    for (let i = 1; i <= 12; i++) {
      const k = `m${monthKey(i)}`;
      d[k] = Number(metaByMonth[k] ?? 0);
    }
    setMetaDraft(d);
    setMetaEditorOpen(true);
  }

  async function saveMeta() {
    if (!me) return;

    // vendedor: salva pro próprio vendedor_id (preferência users.id)
    // admin: salva pro vendedor filtrado
    const ano = metaYear;
    const vendorUsersId = effectiveVendorUsersId;
    const vendorAuth = effectiveVendorAuthId;

    if (!vendorUsersId && !vendorAuth) {
      alert("Selecione um vendedor para cadastrar/editar meta.");
      return;
    }

    setMetaSaving(true);
    try {
      // tenta atualizar por users.id; se não existir, cria.
      // Importante: você pode querer padronizar a coluna no banco depois.
      const targetId = vendorUsersId ?? vendorAuth!;
      const payload: any = {
        ano,
        vendedor_id: targetId,
      };
      for (let i = 1; i <= 12; i++) {
        const k = `m${monthKey(i)}`;
        payload[k] = Number(metaDraft[k] ?? 0);
      }

      // upsert (onConflict: ano+vendedor_id) — se tiver constraint
      const { error } = await supabase
        .from("metas_vendedores")
        .upsert(payload, { onConflict: "ano,vendedor_id" });

      if (error) {
        // fallback se não existir constraint (tenta insert/update manual)
        console.error("upsert meta error", error);

        // tenta localizar registro existente por ano+vendedor_id
        const { data: exists } = await supabase
          .from("metas_vendedores")
          .select("id")
          .eq("ano", ano)
          .eq("vendedor_id", targetId)
          .maybeSingle();

        if (exists?.id) {
          const { error: updErr } = await supabase
            .from("metas_vendedores")
            .update(payload)
            .eq("id", exists.id);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await supabase.from("metas_vendedores").insert(payload);
          if (insErr) throw insErr;
        }
      }

      setMetaEditorOpen(false);
      await loadMetas();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Erro ao salvar meta.");
    } finally {
      setMetaSaving(false);
    }
  }

  /** ============================
   * Nova venda
   * ============================ */
  const nvLeadResults = useMemo(() => {
    const q = normKey(nvLeadQuery);
    if (!q) return leads.slice(0, 30);
    const list = leads.filter((l) => {
      const parts = [l.nome, l.telefone, l.email, l.cpf].filter(Boolean).map((x) => normKey(String(x)));
      return parts.some((p) => p.includes(q));
    });
    return list.slice(0, 30);
  }, [nvLeadQuery, leads]);

  // prefill básico quando escolhe lead
  useEffect(() => {
    if (!nvLead) return;

    setNvCPF(nvLead.cpf ?? "");
    setNvTelefone(nvLead.telefone ?? "");
    setNvEmail(nvLead.email ?? "");

    // tenta achar cliente (pra nascimento)
    const cpfKey = normKey(digitsOnly(nvLead.cpf ?? ""));
    if (cpfKey) {
      const cl = clientes.find((c) => normKey(digitsOnly(c.cpf ?? "")) === cpfKey);
      if (cl?.data_nascimento) setNvNascimento(String(cl.data_nascimento));
    } else if (nvLead.data_nascimento) {
      setNvNascimento(String(nvLead.data_nascimento));
    }
  }, [nvLead, clientes]);

  function resetNovaVenda() {
    setNvLeadQuery("");
    setNvLeadId(null);
    setNvDataVenda(toYMD(new Date()));
    setNvAdminId(null);
    setNvSegment(null);
    setNvTabela(null);

    setNvValorVenda("");
    setNvNumeroProposta("");
    setNvTipoVenda("Normal");
    setNvGrupo("");
    setNvCota("");

    setNvCPF("");
    setNvNascimento("");
    setNvTelefone("");
    setNvEmail("");
    setNvDescricao("");
  }

  async function saveNovaVenda() {
    if (!authUserId) return;

    if (!nvAdminId) return alert("Selecione a Administradora.");
    if (!nvSegment) return alert("Selecione o Segmento/Produto.");
    if (!nvTabela) return alert("Selecione a Tabela.");
    if (!nvLeadId) return alert("Selecione o cliente (Lead).");

    if (nvTipoVenda === "Bolsão" && !nvGrupo.trim()) {
      return alert("Para Bolsão, o Grupo é obrigatório.");
    }

    if (nvCPF && !validateCPFOrCNPJ(nvCPF)) {
      return alert("CPF/CNPJ inválido (verifique os dígitos).");
    }

    const admin = simAdmins.find((a) => a.id === nvAdminId);
    const adminName = (admin?.name ?? admin?.nome ?? "").toString();

    // vendedor_id no seu schema costuma ser o auth_user_id
    const vendedorIdToSave =
      isAdmin && vendorFilter !== "__all__"
        ? vendorFilter
        : authUserId;

    const valor = Number(String(nvValorVenda || "0").replace(/\./g, "").replace(",", "."));

    setNvSaving(true);
    try {
      const payload: any = {
        data_venda: isoFromDateInput(nvDataVenda),
        vendedor_id: vendedorIdToSave,

        administradora: adminName || null,
        segmento: nvSegment,
        tabela: nvTabela,

        numero_proposta: nvNumeroProposta || null,
        tipo_venda: nvTipoVenda || null,
        grupo: nvGrupo || null,
        cota: nvCota || null,

        valor_venda: Number.isFinite(valor) ? valor : 0,

        lead_id: nvLeadId,
        cliente_lead_id: nvLeadId,

        cpf: nvCPF || null,
        nascimento: nvNascimento || null,
        telefone: nvTelefone || null,
        email: nvEmail || null,
        descricao: nvDescricao || null,

        codigo: "00",
      };

      const { error } = await supabase.from("vendas").insert(payload);
      if (error) throw error;

      setNewSaleOpen(false);
      resetNovaVenda();
      await loadVendas();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Erro ao salvar venda.");
    } finally {
      setNvSaving(false);
    }
  }

  /** ============================
   * Render helpers
   * ============================ */
  function leadNameForSale(v: VendaRow) {
    const id = v.lead_id || v.cliente_lead_id;
    if (!id) return "-";
    return leads.find((l) => l.id === id)?.nome ?? "-";
  }

  function roleLabel(u?: UserRow | null) {
    const r = (u?.role || u?.user_role || "").toLowerCase();
    if (r === "admin") return "Admin";
    if (r === "vendedor") return "Vendedor";
    return r || "-";
  }

  /** ============================
   * UI
   * ============================ */
  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando Carteira...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-semibold">Carteira</h1>
          <div className="text-sm text-muted-foreground">
            {isAdmin ? "Modo Admin" : "Modo Vendedor"} • {me?.nome ?? me?.email ?? "-"}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          {isAdmin && (
            <div className="min-w-[240px]">
              <Label className="text-xs">Filtrar vendedor</Label>
              <Select value={vendorFilter} onValueChange={setVendorFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.auth_user_id}>
                      {u.nome ?? u.email ?? u.auth_user_id} • {roleLabel(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            variant="secondary"
            className="h-9"
            onClick={fullReload}
            disabled={refreshing}
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Button className="h-9" onClick={() => { resetNovaVenda(); setNewSaleOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Venda
          </Button>
        </div>
      </div>

      {/* Busca */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <Label className="text-xs">Buscar</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cliente, proposta, grupo, cota, admin, segmento..."
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={showCarteira ? "default" : "secondary"}
              onClick={() => setShowCarteira((s) => !s)}
            >
              {showCarteira ? "Ocultar carteira" : "Mostrar carteira"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Carteira Ativa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-semibold">
              {showCarteira ? currency(totals.carteiraAtivaValor) : "••••"}
            </div>
            <div className="text-xs text-muted-foreground">{totals.ativas} cotas ativas</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Vendido (Total)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-semibold">
              {showCarteira ? currency(totals.vendidoValor) : "••••"}
            </div>
            <div className="text-xs text-muted-foreground">{totals.count} vendas</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Inadimplentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-semibold">{totals.inadimplentes}</div>
            <div className="text-xs text-muted-foreground">cotas marcadas como inad</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Contempladas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-semibold">{totals.contempladas}</div>
            <div className="text-xs text-muted-foreground">cotas contempladas</div>
          </CardContent>
        </Card>
      </div>

      {/* Metas */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <CardTitle className="text-base">Metas • {metaYear}</CardTitle>
              <div className="text-xs text-muted-foreground">
                {isAdmin
                  ? vendorFilter === "__all__"
                    ? "Somando metas de todos os vendedores"
                    : `Meta do vendedor: ${selectedVendor?.nome ?? selectedVendor?.email ?? vendorFilter}`
                  : "Sua meta (vinculada ao seu auth_user_id)"}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="min-w-[140px]">
                <Label className="text-xs">Ano</Label>
                <Select value={String(metaYear)} onValueChange={(v) => setMetaYear(Number(v))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }).map((_, i) => {
                      const y = new Date().getFullYear() - 2 + i;
                      return (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="secondary"
                className="h-9"
                onClick={openMetaEditor}
                disabled={isAdmin && vendorFilter === "__all__"}
                title={
                  isAdmin && vendorFilter === "__all__"
                    ? "Selecione um vendedor para editar"
                    : "Editar meta"
                }
              >
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Donut */}
          <div className="rounded-2xl border border-black/10 dark:border-white/10 p-3">
            <div className="text-sm font-medium mb-1">Meta anual x Realizado</div>
            <div className="text-xs text-muted-foreground mb-3">
              Meta: {currency(metaAnual)} • Realizado: {currency(realizadoAnual)}
            </div>

            <div className="h-[220px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    innerRadius={70}
                    outerRadius={95}
                    stroke="transparent"
                  >
                    <Cell fill="#A11C27" />
                    <Cell fill="rgba(30,41,63,0.18)" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl font-semibold">
                    {pctMetaRealizada.toFixed(2).replace(".", ",")}%
                  </div>
                  <div className="text-xs text-muted-foreground">da meta anual</div>
                </div>
              </div>
            </div>
          </div>

          {/* Linha */}
          <div className="rounded-2xl border border-black/10 dark:border-white/10 p-3 lg:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Meta x Realizado (mês a mês)</div>
                <div className="text-xs text-muted-foreground">
                  Realizado considera encarteiradas ativas (e desconta canceladas no mês).
                </div>
              </div>
              <Badge variant="secondary">
                {isAdmin ? (vendorFilter === "__all__" ? "Todos" : "Vendedor") : "Meu"}
              </Badge>
            </div>

            <div className="h-[260px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={realizedByMonth.map((r) => ({
                    label: r.label,
                    realizado: r.value,
                    meta: metaByMonth[`m${monthKey(r.m)}`] ?? 0,
                  }))}
                >
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(v) => (Number(v) / 1000).toFixed(0) + "k"} />
                  <Tooltip
                    formatter={(v: any) => currency(Number(v))}
                    labelFormatter={(l) => `Mês: ${l}`}
                  />
                  <Line type="monotone" dataKey="meta" stroke="#1E293F" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="realizado" stroke="#A11C27" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Listas (Pendentes / Encarteiradas) */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Vendas</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="encarteiradas" className="w-full">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="encarteiradas">
                Encarteiradas <Badge className="ml-2" variant="secondary">{vendasEncarteiradas.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="pendentes">
                Pendentes <Badge className="ml-2" variant="secondary">{vendasPendentes.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="encarteiradas" className="mt-3">
              <div className="overflow-auto rounded-xl border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-black/[0.03] dark:bg-white/[0.04]">
                    <tr className="text-left">
                      <th className="p-3">Cliente</th>
                      <th className="p-3">Admin</th>
                      <th className="p-3">Segmento</th>
                      <th className="p-3">Tabela</th>
                      <th className="p-3">Grupo/Cota</th>
                      <th className="p-3">Encarteir.</th>
                      <th className="p-3">Valor</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendasEncarteiradas.map((v) => (
                      <tr key={v.id} className="border-t border-black/5 dark:border-white/10">
                        <td className="p-3">
                          <div className="font-medium">{leadNameForSale(v)}</div>
                          <div className="text-xs text-muted-foreground">
                            Proposta: {v.numero_proposta ?? "-"}
                          </div>
                        </td>
                        <td className="p-3">{v.administradora ?? "-"}</td>
                        <td className="p-3">{v.segmento ?? v.produto ?? "-"}</td>
                        <td className="p-3">{v.tabela ?? "-"}</td>
                        <td className="p-3">
                          <div>G: {v.grupo ?? "-"}</div>
                          <div className="text-xs text-muted-foreground">C: {v.cota ?? "-"}</div>
                        </td>
                        <td className="p-3">{formatDateTimeBR(v.encarteirada_em)}</td>
                        <td className="p-3">{showCarteira ? currency(v.valor_venda ?? 0) : "••••"}</td>
                        <td className="p-3 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => { setActiveSale(v); setViewSaleOpen(true); }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {vendasEncarteiradas.length === 0 && (
                      <tr>
                        <td className="p-4 text-muted-foreground" colSpan={8}>
                          Nenhuma venda encarteirada encontrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="pendentes" className="mt-3">
              <div className="overflow-auto rounded-xl border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-black/[0.03] dark:bg-white/[0.04]">
                    <tr className="text-left">
                      <th className="p-3">Cliente</th>
                      <th className="p-3">Admin</th>
                      <th className="p-3">Segmento</th>
                      <th className="p-3">Tabela</th>
                      <th className="p-3">Data venda</th>
                      <th className="p-3">Valor</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendasPendentes.map((v) => (
                      <tr key={v.id} className="border-t border-black/5 dark:border-white/10">
                        <td className="p-3">
                          <div className="font-medium">{leadNameForSale(v)}</div>
                          <div className="text-xs text-muted-foreground">
                            Proposta: {v.numero_proposta ?? "-"}
                          </div>
                        </td>
                        <td className="p-3">{v.administradora ?? "-"}</td>
                        <td className="p-3">{v.segmento ?? v.produto ?? "-"}</td>
                        <td className="p-3">{v.tabela ?? "-"}</td>
                        <td className="p-3">{formatDateBR(v.data_venda)}</td>
                        <td className="p-3">{showCarteira ? currency(v.valor_venda ?? 0) : "••••"}</td>
                        <td className="p-3 text-right space-x-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => { setActiveSale(v); setViewSaleOpen(true); }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => { setActiveSale(v); setEditPendingOpen(true); }}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {vendasPendentes.length === 0 && (
                      <tr>
                        <td className="p-4 text-muted-foreground" colSpan={7}>
                          Nenhuma venda pendente encontrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ============================
          MODAL: Nova Venda
         ============================ */}
      <Dialog open={newSaleOpen} onOpenChange={(o) => { setNewSaleOpen(o); if (!o) resetNovaVenda(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nova Venda</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Cliente */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Label>Buscar Cliente (Lead)</Label>
                <Input
                  value={nvLeadQuery}
                  onChange={(e) => setNvLeadQuery(e.target.value)}
                  placeholder="Nome, telefone, e-mail, CPF..."
                />
                <div className="mt-2 max-h-40 overflow-auto rounded-xl border border-black/10 dark:border-white/10">
                  {nvLeadResults.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setNvLeadId(l.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-black/[0.04] dark:hover:bg-white/[0.06] ${
                        nvLeadId === l.id ? "bg-black/[0.05] dark:bg-white/[0.07]" : ""
                      }`}
                    >
                      <div className="font-medium">{l.nome ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.telefone ?? "-"} • {l.email ?? "-"}
                      </div>
                    </button>
                  ))}
                  {nvLeadResults.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground">Nada encontrado.</div>
                  )}
                </div>
              </div>

              <div>
                <Label>Data da venda</Label>
                <Input
                  type="date"
                  value={nvDataVenda}
                  onChange={(e) => setNvDataVenda(e.target.value)}
                />
              </div>
            </div>

            <Hr />

            {/* Regras: Admin->Segmento->Tabela */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Administradora</Label>
                <Select value={nvAdminId ?? ""} onValueChange={(v) => setNvAdminId(v || null)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {simAdmins.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {(a.name ?? a.nome ?? a.slug ?? a.id) as any}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Produto / Segmento</Label>
                <Select
                  value={nvSegment ?? ""}
                  onValueChange={(v) => setNvSegment(v || null)}
                  disabled={!nvAdminId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={nvAdminId ? "Selecione" : "Selecione a administradora"} />
                  </SelectTrigger>
                  <SelectContent>
                    {segmentOptions.map((s) => (
                      <SelectItem key={s.key} value={s.label}>
                        {s.label}
                      </SelectItem>
                    ))}
                    {nvAdminId && segmentOptions.length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground">
                        Nenhum segmento encontrado para esta administradora (verifique sim_tables).
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tabela</Label>
                <Select
                  value={nvTabela ?? ""}
                  onValueChange={(v) => setNvTabela(v || null)}
                  disabled={!nvAdminId || !nvSegment}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !nvAdminId
                          ? "Selecione a administradora"
                          : !nvSegment
                          ? "Selecione o segmento"
                          : "Selecione"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {tableOptions.map((t) => (
                      <SelectItem key={t.key} value={t.label}>
                        {t.label}
                      </SelectItem>
                    ))}
                    {nvAdminId && nvSegment && tableOptions.length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground">
                        Nenhuma tabela encontrada (verifique sim_tables para este segmento).
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dados da venda */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Valor da venda</Label>
                <Input
                  value={nvValorVenda}
                  onChange={(e) => setNvValorVenda(e.target.value)}
                  placeholder="Ex.: 170000"
                />
              </div>
              <div>
                <Label>Nº proposta</Label>
                <Input
                  value={nvNumeroProposta}
                  onChange={(e) => setNvNumeroProposta(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <div>
                <Label>Tipo de venda</Label>
                <Select value={nvTipoVenda} onValueChange={setNvTipoVenda}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Contemplada">Contemplada</SelectItem>
                    <SelectItem value="Bolsão">Bolsão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bolsão / grupo / cota */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Grupo {nvTipoVenda === "Bolsão" ? "(obrigatório)" : "(opcional)"}</Label>
                <Input value={nvGrupo} onChange={(e) => setNvGrupo(e.target.value)} placeholder="Ex.: 9954" />
              </div>
              <div>
                <Label>Cota (opcional)</Label>
                <Input value={nvCota} onChange={(e) => setNvCota(e.target.value)} placeholder="Ex.: 3798" />
              </div>
            </div>

            <Hr />

            {/* Contato / docs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <Label>CPF/CNPJ</Label>
                <Input value={nvCPF} onChange={(e) => setNvCPF(e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                <Label>Nascimento</Label>
                <Input type="date" value={nvNascimento} onChange={(e) => setNvNascimento(e.target.value)} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={nvTelefone} onChange={(e) => setNvTelefone(e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input value={nvEmail} onChange={(e) => setNvEmail(e.target.value)} placeholder="Opcional" />
              </div>
            </div>

            <div>
              <Label>Descrição</Label>
              <Input
                value={nvDescricao}
                onChange={(e) => setNvDescricao(e.target.value)}
                placeholder="Observações..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setNewSaleOpen(false)} disabled={nvSaving}>
              Cancelar
            </Button>
            <Button onClick={saveNovaVenda} disabled={nvSaving}>
              {nvSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Salvar venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================
          MODAL: Ver Venda
         ============================ */}
      <Dialog open={viewSaleOpen} onOpenChange={setViewSaleOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Venda</DialogTitle>
          </DialogHeader>

          {!activeSale ? (
            <div className="text-sm text-muted-foreground">Nenhuma venda selecionada.</div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold">{leadNameForSale(activeSale)}</div>
                  <div className="text-xs text-muted-foreground">
                    Proposta: {activeSale.numero_proposta ?? "-"}
                  </div>
                </div>
                <Badge variant="secondary">{activeSale.codigo === "00" ? "Ativa" : "Inativa"}</Badge>
              </div>

              <Hr />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div><b>Administradora:</b> {activeSale.administradora ?? "-"}</div>
                <div><b>Segmento:</b> {activeSale.segmento ?? activeSale.produto ?? "-"}</div>
                <div><b>Tabela:</b> {activeSale.tabela ?? "-"}</div>
                <div><b>Valor:</b> {showCarteira ? currency(activeSale.valor_venda ?? 0) : "••••"}</div>
                <div><b>Data venda:</b> {formatDateBR(activeSale.data_venda)}</div>
                <div><b>Encarteirada:</b> {formatDateTimeBR(activeSale.encarteirada_em)}</div>
                <div><b>Grupo:</b> {activeSale.grupo ?? "-"}</div>
                <div><b>Cota:</b> {activeSale.cota ?? "-"}</div>
                <div><b>Tipo venda:</b> {activeSale.tipo_venda ?? "-"}</div>
                <div><b>Contemplada:</b> {activeSale.contemplada ? "Sim" : "Não"}</div>
                <div><b>Tipo contemplação:</b> {activeSale.contemplacao_tipo ?? "-"}</div>
                <div><b>% contemplação:</b> {activeSale.contemplacao_pct != null ? `${Number(activeSale.contemplacao_pct).toFixed(4).replace(".", ",")}%` : "-"}</div>
                <div><b>Inad:</b> {activeSale.inad ? "Sim" : "Não"}</div>
                <div><b>Cancelada em:</b> {formatDateTimeBR(activeSale.cancelada_em)}</div>
              </div>

              {activeSale.descricao && (
                <>
                  <Hr />
                  <div>
                    <b>Descrição:</b>
                    <div className="text-muted-foreground">{activeSale.descricao}</div>
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setViewSaleOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================
          MODAL: Editar Pendente (simples)
         ============================ */}
      <Dialog open={editPendingOpen} onOpenChange={setEditPendingOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar Venda Pendente</DialogTitle>
          </DialogHeader>

          {!activeSale ? (
            <div className="text-sm text-muted-foreground">Nenhuma venda selecionada.</div>
          ) : (
            <EditPendingForm
              sale={activeSale}
              leads={leads}
              showCarteira={showCarteira}
              onCancel={() => setEditPendingOpen(false)}
              onSaved={async () => {
                setEditPendingOpen(false);
                await loadVendas();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ============================
          MODAL: Editor de Meta
         ============================ */}
      <Dialog open={metaEditorOpen} onOpenChange={setMetaEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar Meta • {metaYear}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, idx) => {
              const m = idx + 1;
              const k = `m${monthKey(m)}`;
              return (
                <div key={k}>
                  <Label className="text-xs">{monthLabel(m)}</Label>
                  <Input
                    value={String(metaDraft[k] ?? 0)}
                    onChange={(e) => {
                      const val = Number(String(e.target.value).replace(/\./g, "").replace(",", "."));
                      setMetaDraft((d) => ({ ...d, [k]: Number.isFinite(val) ? val : 0 }));
                    }}
                  />
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setMetaEditorOpen(false)} disabled={metaSaving}>
              Cancelar
            </Button>
            <Button onClick={saveMeta} disabled={metaSaving}>
              {metaSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** =========================================
 * Subcomponente: Editar Venda Pendente (simples)
 * ========================================= */
function EditPendingForm({
  sale,
  leads,
  showCarteira,
  onCancel,
  onSaved,
}: {
  sale: VendaRow;
  leads: LeadRow[];
  showCarteira: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const [numeroProposta, setNumeroProposta] = useState(sale.numero_proposta ?? "");
  const [valorVenda, setValorVenda] = useState(String(sale.valor_venda ?? ""));
  const [descricao, setDescricao] = useState(sale.descricao ?? "");

  const clienteNome = useMemo(() => {
    const id = sale.lead_id || sale.cliente_lead_id;
    return (id ? leads.find((l) => l.id === id)?.nome : null) ?? "-";
  }, [sale, leads]);

  async function save() {
    setSaving(true);
    try {
      const valor = Number(String(valorVenda || "0").replace(/\./g, "").replace(",", "."));

      const payload: any = {
        numero_proposta: numeroProposta || null,
        valor_venda: Number.isFinite(valor) ? valor : 0,
        descricao: descricao || null,
      };

      const { error } = await supabase.from("vendas").update(payload).eq("id", sale.id);
      if (error) throw error;

      onSaved();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-sm">
        <div className="font-medium">{clienteNome}</div>
        <div className="text-xs text-muted-foreground">
          Valor atual: {showCarteira ? currency(sale.valor_venda ?? 0) : "••••"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Nº proposta</Label>
          <Input value={numeroProposta} onChange={(e) => setNumeroProposta(e.target.value)} />
        </div>
        <div>
          <Label>Valor</Label>
          <Input value={valorVenda} onChange={(e) => setValorVenda(e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Descrição</Label>
        <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </div>

      <DialogFooter className="gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}
