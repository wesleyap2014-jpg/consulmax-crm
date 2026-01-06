// src/pages/Carteira.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

import {
  Plus,
  Pencil,
  Eye,
  RefreshCw,
  Target,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRightLeft,
} from "lucide-react";

/** ===================== Tipos (light) ===================== */
type AppUser = {
  id: string; // users.id
  auth_user_id: string; // users.auth_user_id (auth.uid())
  nome: string;
  email?: string | null;
  role?: string | null;
  user_role?: string | null;
  is_active?: boolean | null;
};

type Lead = {
  id: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  cpf?: string | null;
  data_nascimento?: string | null;
};

type Cliente = {
  id: string;
  nome: string;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  data_nascimento?: string | null;
  observacoes?: string | null;
};

type SimAdmin = { id: string; name: string; slug?: string | null };
type SimTable = {
  id: string;
  admin_id: string | null;
  administradora: string;
  segmento: string;
  nome: string;
  slug?: string | null;
};

type Venda = {
  id: string;
  data_venda?: string | null;
  vendedor_id?: string | null;
  segmento?: string | null;
  tabela?: string | null;
  administradora?: string | null;
  forma_venda?: string | null;
  numero_proposta?: string | null;
  cliente_lead_id?: string | null;
  lead_id?: string | null;

  grupo?: string | null;
  cota?: string | null;
  codigo?: string | null;
  encarteirada_em?: string | null;
  tipo_venda?: string | null;
  contemplada?: boolean | null;
  data_contemplacao?: string | null;
  contemplacao_tipo?: string | null;
  contemplacao_pct?: number | null;

  cancelada_em?: string | null;
  reativada_em?: string | null;

  inad?: boolean | null;
  inad_em?: string | null;
  inad_revertida_em?: string | null;

  produto?: string | null;
  valor_venda?: number | null;

  cpf?: string | null;
  nascimento?: string | null;
  telefone?: string | null;
  email?: string | null;

  status_inicial?: string | null;
  status?: string | null;

  created_at?: string | null;
};

type MetaRow = {
  id?: string;
  vendedor_id: string; // users.id
  auth_user_id?: string | null; // novo campo
  ano: number;
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
};

/** ===================== Consts/Helpers ===================== */
const ALL = "__all__";

function currencyBR(v: any) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isCodigoAtivo(codigo?: string | null) {
  return String(codigo || "").trim() === "00";
}

function safeNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateBR(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatDateTimeBR(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function isoFromDateInput(dateStr: string) {
  return dateStr?.trim() || null;
}

function normText(s: any) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeProdutoToSegmento(produto: any) {
  const p = normText(produto);
  if (!p) return "";
  if (p.includes("imovel")) return "Imóvel";
  if (p.includes("moto")) return "Motocicletas";
  if (p.includes("pesad")) return "Pesados";
  if (p.includes("servic")) return "Serviços";
  if (p.includes("auto") || p.includes("carro")) return "Automóvel";
  return "Automóvel";
}

function monthIndexFromISO(iso?: string | null) {
  if (!iso) return -1;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return -1;
  return d.getMonth();
}

function yearFromISO(iso?: string | null) {
  if (!iso) return -1;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return -1;
  return d.getFullYear();
}

/** ===================== Página ===================== */
export default function Carteira() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [me, setMe] = useState<AppUser | null>(null);

  const isAdmin = useMemo(() => {
    const r = (me?.role || me?.user_role || "").toLowerCase();
    return r === "admin";
  }, [me]);

  const [users, setUsers] = useState<AppUser[]>([]);
  const usersById = useMemo(() => {
    const m: Record<string, AppUser> = {};
    users.forEach((u) => (m[u.id] = u));
    return m;
  }, [users]);
  const usersByAuth = useMemo(() => {
    const m: Record<string, AppUser> = {};
    users.forEach((u) => (m[u.auth_user_id] = u));
    return m;
  }, [users]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedSeller, setSelectedSeller] = useState<string>(ALL); // users.id (admin) ou ALL

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [leadsById, setLeadsById] = useState<Record<string, Lead>>({});
  const [clientesById, setClientesById] = useState<Record<string, Cliente>>({});

  const [metaMensal, setMetaMensal] = useState<number[]>(Array(12).fill(0));

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"pendentes" | "encarteiradas">("pendentes");
  const [showCarteiraValues, setShowCarteiraValues] = useState(true);

  const [openNovaVenda, setOpenNovaVenda] = useState(false);
  const [openEditarPendente, setOpenEditarPendente] = useState(false);
  const [openVerVenda, setOpenVerVenda] = useState(false);
  const [openMeta, setOpenMeta] = useState(false);
  const [openEditorCota, setOpenEditorCota] = useState(false);
  const [openTransferencia, setOpenTransferencia] = useState(false);

  const [activeVenda, setActiveVenda] = useState<Venda | null>(null);

  const [simAdmins, setSimAdmins] = useState<SimAdmin[]>([]);
  const [simTables, setSimTables] = useState<SimTable[]>([]);

  const [nvLeadQuery, setNvLeadQuery] = useState("");
  const [nvLeadResults, setNvLeadResults] = useState<Lead[]>([]);
  const [nvLead, setNvLead] = useState<Lead | null>(null);

  const [nvDataVenda, setNvDataVenda] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  });

  const [nvAdminId, setNvAdminId] = useState<string>("");
  const [nvProduto, setNvProduto] = useState<string>("");
  const [nvSegmento, setNvSegmento] = useState<string>("");
  const [nvTabelaId, setNvTabelaId] = useState<string>("");
  const [nvNumeroProposta, setNvNumeroProposta] = useState<string>("");
  const [nvValorVenda, setNvValorVenda] = useState<string>("");

  const [nvTipoVenda, setNvTipoVenda] = useState<string>("Normal");
  const [nvGrupo, setNvGrupo] = useState<string>("");
  const [nvCota, setNvCota] = useState<string>("");
  const [nvCodigo, setNvCodigo] = useState<string>("00");

  const [metaForm, setMetaForm] = useState<number[]>(Array(12).fill(0));
  const [metaSaving, setMetaSaving] = useState(false);

  /** ========= RBAC: sellerAuthId que filtra vendas ========= */
  const sellerAuthId = useMemo(() => {
    if (!authUserId) return null;
    if (!isAdmin) return authUserId; // vendedor: trava
    if (selectedSeller === ALL) return null; // admin todos
    return usersById[selectedSeller]?.auth_user_id || null; // admin filtrado
  }, [authUserId, isAdmin, selectedSeller, usersById]);

  /** ===================== Load base (auth + users) ===================== */
  async function loadAuthAndUsers() {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id || null;
    setAuthUserId(uid);

    const { data: usersRows, error: usersErr } = await supabase
      .from("users")
      .select("id,auth_user_id,nome,email,role,user_role,is_active")
      .eq("is_active", true)
      .order("nome", { ascending: true });

    if (usersErr) console.warn("[Carteira] usersErr:", usersErr.message);

    const us = (usersRows || []) as AppUser[];
    setUsers(us);

    const my = uid ? us.find((u) => u.auth_user_id === uid) || null : null;
    setMe(my);
  }

  /** ===================== Load lookups (admins/tabelas) ===================== */
  async function loadSimLookups() {
    const [{ data: aRows }, { data: tRows }] = await Promise.all([
      supabase.from("sim_admins").select("id,name,slug").order("name", { ascending: true }),
      supabase
        .from("sim_tables")
        .select("id,admin_id,administradora,segmento,nome,slug")
        .order("administradora", { ascending: true })
        .order("segmento", { ascending: true })
        .order("nome", { ascending: true }),
    ]);

    setSimAdmins((aRows || []).map((r: any) => ({ id: r.id, name: r.name, slug: r.slug })) as SimAdmin[]);
    setSimTables((tRows || []) as any);
  }

  /** ===================== Load Meta (corrigido) ===================== */
  async function loadMetaForContext() {
    if (!authUserId) return;

    const year = Number(selectedYear);

    const metaAuthId =
      isAdmin
        ? (selectedSeller === ALL
            ? null
            : (usersById[selectedSeller]?.auth_user_id || null))
        : authUserId;

    // Admin em "Todos": soma metas do ano
    if (isAdmin && selectedSeller === ALL) {
      const { data: metasAll, error: metaAllErr } = await supabase
        .from("metas_vendedores")
        .select("m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
        .eq("ano", year);

      if (metaAllErr) {
        console.warn("[Carteira] metaAllErr:", metaAllErr.message);
      }

      const summed = Array(12).fill(0);
      (metasAll || []).forEach((r: any) => {
        const arr = [
          r.m01, r.m02, r.m03, r.m04, r.m05, r.m06,
          r.m07, r.m08, r.m09, r.m10, r.m11, r.m12,
        ].map((x: any) => Number(x || 0));
        for (let i = 0; i < 12; i++) summed[i] += arr[i];
      });

      setMetaMensal(summed);
      return;
    }

    // Vendedor (ou admin filtrado): pega 1 linha por auth_user_id + ano
    if (!metaAuthId) {
      setMetaMensal(Array(12).fill(0));
      return;
    }

    const { data: metasRow, error: metaErr } = await supabase
      .from("metas_vendedores")
      .select("id,m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
      .eq("auth_user_id", metaAuthId)
      .eq("ano", year)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (metaErr) {
      console.warn("[Carteira] metaErr:", metaErr.message, { metaAuthId, year });
    }

    const m = metasRow
      ? [
          metasRow.m01, metasRow.m02, metasRow.m03, metasRow.m04,
          metasRow.m05, metasRow.m06, metasRow.m07, metasRow.m08,
          metasRow.m09, metasRow.m10, metasRow.m11, metasRow.m12,
        ].map((x: any) => Number(x || 0))
      : Array(12).fill(0);

    setMetaMensal(m);
  }

  /** ===================== Load data (vendas + leads/clientes + meta) ===================== */
  async function loadData() {
    if (!authUserId) return;

    setRefreshing(true);
    try {
      let vendasQ = supabase
        .from("vendas")
        .select("*")
        .gte("data_venda", `${selectedYear}-01-01`)
        .lte("data_venda", `${selectedYear}-12-31`)
        .order("data_venda", { ascending: false });

      if (sellerAuthId) {
        vendasQ = vendasQ.eq("vendedor_id", sellerAuthId);
      }

      const { data: vendasRows, error: vendasErr } = await vendasQ;
      if (vendasErr) console.warn("[Carteira] vendasErr:", vendasErr.message);

      const vs = (vendasRows || []) as Venda[];
      setVendas(vs);

      const leadIds = Array.from(new Set(vs.map((v) => v.lead_id).filter(Boolean))) as string[];
      const clienteIds = Array.from(new Set(vs.map((v) => v.cliente_lead_id).filter(Boolean))) as string[];

      const [leadsRes, clientesRes] = await Promise.all([
        leadIds.length
          ? supabase
              .from("leads")
              .select("id,nome,telefone,email,cpf,data_nascimento")
              .in("id", leadIds)
          : Promise.resolve({ data: [] as any[] }),
        clienteIds.length
          ? supabase
              .from("clientes")
              .select("id,nome,cpf,telefone,email,data_nascimento,observacoes")
              .in("id", clienteIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const leadsMap: Record<string, Lead> = {};
      (leadsRes.data || []).forEach((l: any) => (leadsMap[l.id] = l));
      setLeadsById(leadsMap);

      const clientesMap: Record<string, Cliente> = {};
      (clientesRes.data || []).forEach((c: any) => (clientesMap[c.id] = c));
      setClientesById(clientesMap);

      await loadMetaForContext();
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  /** ===================== Bootstrap ===================== */
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadAuthAndUsers(), loadSimLookups()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading && authUserId && me) {
      if (!isAdmin) setSelectedSeller(ALL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, authUserId, me, isAdmin]);

  useEffect(() => {
    if (!authUserId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, selectedYear, selectedSeller, isAdmin]);

  /** ===================== Derived: listas ===================== */
  const vendasPendentes = useMemo(() => vendas.filter((v) => !v.encarteirada_em), [vendas]);
  const vendasEncarteiradas = useMemo(() => vendas.filter((v) => !!v.encarteirada_em), [vendas]);

  const filteredPendentes = useMemo(() => {
    const q = normText(query);
    if (!q) return vendasPendentes;
    return vendasPendentes.filter((v) => {
      const nome =
        (v.cliente_lead_id && clientesById[v.cliente_lead_id]?.nome) ||
        (v.lead_id && leadsById[v.lead_id]?.nome) ||
        "";
      const proposta = v.numero_proposta || "";
      return normText(nome).includes(q) || normText(proposta).includes(q);
    });
  }, [query, vendasPendentes, clientesById, leadsById]);

  const filteredEncarteiradas = useMemo(() => {
    const q = normText(query);
    if (!q) return vendasEncarteiradas;
    return vendasEncarteiradas.filter((v) => {
      const nome =
        (v.cliente_lead_id && clientesById[v.cliente_lead_id]?.nome) ||
        (v.lead_id && leadsById[v.lead_id]?.nome) ||
        "";
      const proposta = v.numero_proposta || "";
      const grupo = v.grupo || "";
      const cota = v.cota || "";
      return (
        normText(nome).includes(q) ||
        normText(proposta).includes(q) ||
        normText(grupo).includes(q) ||
        normText(cota).includes(q)
      );
    });
  }, [query, vendasEncarteiradas, clientesById, leadsById]);

  /** ===================== KPIs ===================== */
  const kpis = useMemo(() => {
    const ativas = vendasEncarteiradas.filter((v) => isCodigoAtivo(v.codigo) && !v.cancelada_em);
    const canceladas = vendasEncarteiradas.filter((v) => !isCodigoAtivo(v.codigo) || !!v.cancelada_em);
    const contempladas = vendasEncarteiradas.filter((v) => !!v.contemplada);
    const inad = vendasEncarteiradas.filter((v) => !!v.inad);

    const sumByCliente: Record<string, number> = {};
    ativas.forEach((v) => {
      const cid = v.cliente_lead_id || v.lead_id || "—";
      sumByCliente[cid] = (sumByCliente[cid] || 0) + safeNum(v.valor_venda);
    });
    const carteiraTotal = Object.values(sumByCliente).reduce((a, b) => a + b, 0);

    const realizado = Array(12).fill(0);
    const meta = metaMensal || Array(12).fill(0);

    vendasEncarteiradas.forEach((v) => {
      const y = yearFromISO(v.encarteirada_em || "");
      if (y !== selectedYear) return;
      const m = monthIndexFromISO(v.encarteirada_em || "");
      if (m < 0) return;
      if (isCodigoAtivo(v.codigo)) {
        realizado[m] += safeNum(v.valor_venda);
      }
    });

    vendasEncarteiradas.forEach((v) => {
      const y = yearFromISO(v.cancelada_em || "");
      if (y !== selectedYear) return;
      const m = monthIndexFromISO(v.cancelada_em || "");
      if (m < 0) return;
      if (!isCodigoAtivo(v.codigo) || v.cancelada_em) {
        realizado[m] -= safeNum(v.valor_venda);
      }
    });

    const metaTotal = meta.reduce((a: number, b: number) => a + safeNum(b), 0);
    const realizadoTotal = realizado.reduce((a: number, b: number) => a + safeNum(b), 0);

    return {
      ativasCount: ativas.length,
      canceladasCount: canceladas.length,
      contempladasCount: contempladas.length,
      inadCount: inad.length,
      carteiraTotal,
      realizado,
      meta,
      metaTotal,
      realizadoTotal,
      pctAno: metaTotal > 0 ? clamp01(realizadoTotal / metaTotal) : 0,
    };
  }, [vendasEncarteiradas, metaMensal, selectedYear]);

  const monthLabel = (i: number) =>
    ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][i] || `M${i+1}`;

  const chartMes = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => ({
      mes: monthLabel(i),
      meta: safeNum(kpis.meta[i]),
      realizado: safeNum(kpis.realizado[i]),
    }));
  }, [kpis]);

  const donutAnoData = useMemo(() => {
    const done = Math.max(0, kpis.realizadoTotal);
    const remaining = Math.max(0, kpis.metaTotal - done);
    return [
      { name: "Realizado", value: done },
      { name: "Restante", value: remaining },
    ];
  }, [kpis.metaTotal, kpis.realizadoTotal]);

  const donutColors = ["#A11C27", "#1E293F"];

  /** ===================== Lead search (Nova Venda) ===================== */
  async function searchLeads(q: string) {
    const qq = q.trim();
    if (qq.length < 2) {
      setNvLeadResults([]);
      return;
    }
    const { data, error } = await supabase
      .from("leads")
      .select("id,nome,telefone,email,cpf,data_nascimento")
      .or(`nome.ilike.%${qq}%,telefone.ilike.%${qq}%,email.ilike.%${qq}%`)
      .limit(12);

    if (error) console.warn("[Carteira] leadSearchErr:", error.message);
    setNvLeadResults((data || []) as any);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (openNovaVenda) searchLeads(nvLeadQuery);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nvLeadQuery, openNovaVenda]);

  async function prefillFromLead(_lead: Lead) {
    // mantendo como noop (igual antes) — você pode expandir depois
  }

  const selectedAdminName = useMemo(() => {
    return simAdmins.find((a) => a.id === nvAdminId)?.name || "";
  }, [simAdmins, nvAdminId]);

  useEffect(() => {
    if (nvProduto && !nvSegmento) setNvSegmento(normalizeProdutoToSegmento(nvProduto));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nvProduto]);

  useEffect(() => {
    setNvTabelaId("");
  }, [nvAdminId, nvSegmento]);

  const filteredTablesForNovaVenda = useMemo(() => {
    const adm = normText(selectedAdminName);
    const seg = normText(nvSegmento || "");
    return simTables.filter((t) => {
      const tAdm = normText(t.administradora);
      const tSeg = normText(t.segmento);
      const okAdm = adm ? tAdm.includes(adm) : true;
      const okSeg = seg ? tSeg.includes(seg) : true;
      return okAdm && okSeg;
    });
  }, [simTables, selectedAdminName, nvSegmento]);

  /** ===================== Actions ===================== */
  function openView(v: Venda) {
    setActiveVenda(v);
    setOpenVerVenda(true);
  }
  function openEditPendente(v: Venda) {
    setActiveVenda(v);
    setOpenEditarPendente(true);
  }
  function openEditCota(v: Venda) {
    setActiveVenda(v);
    setOpenEditorCota(true);
  }
  function openTransfer(v: Venda) {
    setActiveVenda(v);
    setOpenTransferencia(true);
  }

  function resetNovaVenda() {
    setNvLeadQuery("");
    setNvLeadResults([]);
    setNvLead(null);
    setNvDataVenda(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`);
    setNvAdminId("");
    setNvProduto("");
    setNvSegmento("");
    setNvTabelaId("");
    setNvNumeroProposta("");
    setNvValorVenda("");
    setNvTipoVenda("Normal");
    setNvGrupo("");
    setNvCota("");
    setNvCodigo("00");
  }

  async function saveNovaVenda() {
    if (!authUserId) return;

    if (!nvLead) return alert("Selecione um lead.");
    if (!nvAdminId) return alert("Selecione a Administradora.");
    if (!nvProduto.trim()) return alert("Informe o Produto.");

    const segmento = nvSegmento || normalizeProdutoToSegmento(nvProduto);
    if (!segmento) return alert("Não foi possível definir o Segmento.");

    if (!nvTabelaId) return alert("Selecione a Tabela.");
    if (!nvNumeroProposta.trim()) return alert("Informe o Nº da Proposta.");

    if (nvTipoVenda === "Bolsão" && !nvGrupo.trim()) {
      return alert("Para Bolsão, o Grupo é obrigatório.");
    }

    const table = simTables.find((t) => t.id === nvTabelaId);
    const admin = simAdmins.find((a) => a.id === nvAdminId);

    const payload: Partial<Venda> = {
      data_venda: isoFromDateInput(nvDataVenda),
      vendedor_id: authUserId,
      administradora: admin?.name || table?.administradora || "",
      produto: nvProduto.trim(),
      segmento,
      tabela: table?.nome || "",
      numero_proposta: nvNumeroProposta.trim(),
      lead_id: nvLead.id,
      cliente_lead_id: null,
      valor_venda: safeNum(nvValorVenda),
      tipo_venda: nvTipoVenda,
      grupo: nvGrupo.trim() || null,
      cota: nvCota.trim() || null,
      codigo: (nvCodigo || "00").trim() || "00",
      status_inicial: "Pendente",
      status: "Pendente",
    };

    const { error } = await supabase.from("vendas").insert(payload as any);
    if (error) {
      console.warn("[Carteira] insertVendaErr:", error.message);
      alert("Erro ao salvar a venda. Veja o console.");
      return;
    }

    setOpenNovaVenda(false);
    resetNovaVenda();
    await loadData();
  }

  async function encarteirarVenda(v: Venda) {
    if (!isAdmin) return;

    const grupo = prompt("Grupo:");
    if (!grupo) return;
    const cota = prompt("Cota:");
    if (!cota) return;
    const codigo = prompt("Código (00 ativa):", "00") || "00";

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("vendas")
      .update({
        grupo: grupo.trim(),
        cota: cota.trim(),
        codigo: codigo.trim(),
        encarteirada_em: nowIso,
        segmento: v.segmento || normalizeProdutoToSegmento(v.produto),
      })
      .eq("id", v.id);

    if (error) {
      console.warn("[Carteira] encarteirarErr:", error.message);
      alert("Erro ao encarteirar. Veja o console.");
      return;
    }

    await loadData();
  }

  async function saveMetaAdmin() {
    if (!isAdmin) return;
    if (selectedSeller === ALL) return alert("Selecione um vendedor para cadastrar meta.");

    const seller = usersById[selectedSeller];
    if (!seller?.id || !seller.auth_user_id) {
      return alert("Vendedor inválido (sem auth_user_id).");
    }

    setMetaSaving(true);
    try {
      const year = Number(selectedYear);
      const payload: MetaRow = {
        vendedor_id: seller.id,
        auth_user_id: seller.auth_user_id,
        ano: year,
        m01: safeNum(metaForm[0]),
        m02: safeNum(metaForm[1]),
        m03: safeNum(metaForm[2]),
        m04: safeNum(metaForm[3]),
        m05: safeNum(metaForm[4]),
        m06: safeNum(metaForm[5]),
        m07: safeNum(metaForm[6]),
        m08: safeNum(metaForm[7]),
        m09: safeNum(metaForm[8]),
        m10: safeNum(metaForm[9]),
        m11: safeNum(metaForm[10]),
        m12: safeNum(metaForm[11]),
      };

      const { error } = await supabase
        .from("metas_vendedores")
        .upsert(payload as any, { onConflict: "vendedor_id,ano" });

      if (error) {
        console.warn("[Carteira] metaUpsertErr:", error.message);
        alert("Erro ao salvar meta. Veja o console.");
        return;
      }

      setOpenMeta(false);
      await loadData();
    } finally {
      setMetaSaving(false);
    }
  }

  function openMetaDialog() {
    if (!isAdmin) return;
    setMetaForm([...(metaMensal || Array(12).fill(0))]);
    setOpenMeta(true);
  }

  /** ===================== Render helpers ===================== */
  const sellerLabel = useMemo(() => {
    if (!me) return "—";
    if (!isAdmin) return me.nome;
    if (selectedSeller === ALL) return "Todos";
    return usersById[selectedSeller]?.nome || "—";
  }, [me, isAdmin, selectedSeller, usersById]);

  const yearOptions = useMemo(() => {
    const ys: number[] = [];
    for (let y = currentYear - 2; y <= currentYear + 1; y++) ys.push(y);
    return ys;
  }, [currentYear]);

  /** ===================== UI ===================== */
  return (
    <div className="p-4 space-y-4">
      <Card className="border border-white/10 bg-white/5 backdrop-blur-md">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl">Carteira</CardTitle>
            <div className="text-sm text-white/70">
              {isAdmin ? "Admin" : "Vendedor"} • {sellerLabel} • {selectedYear}
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <div className="grid gap-1">
              <Label>Ano</Label>
              <Select
                value={String(selectedYear)}
                onValueChange={(v) => setSelectedYear(Number(v))}
              >
                <SelectTrigger className="w-[120px] bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isAdmin && (
              <div className="grid gap-1">
                <Label>Vendedor</Label>
                <Select value={selectedSeller} onValueChange={setSelectedSeller}>
                  <SelectTrigger className="w-[260px] bg-white/5 border-white/10">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todos</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-1">
              <Label>Buscar</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cliente, proposta, grupo, cota..."
                className="w-[280px] bg-white/5 border-white/10"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="bg-white/10 border border-white/10"
                onClick={() => loadData()}
                disabled={refreshing}
              >
                <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                <span className="ml-2">Atualizar</span>
              </Button>

              <Button
                className="bg-[#A11C27] hover:bg-[#8d1822]"
                onClick={() => {
                  resetNovaVenda();
                  setOpenNovaVenda(true);
                }}
              >
                <Plus className="h-4 w-4" />
                <span className="ml-2">Nova Venda</span>
              </Button>

              {isAdmin && (
                <Button
                  variant="secondary"
                  className="bg-white/10 border border-white/10"
                  onClick={openMetaDialog}
                  disabled={selectedSeller === ALL}
                  title={selectedSeller === ALL ? "Selecione um vendedor" : "Cadastrar/editar meta"}
                >
                  <Target className="h-4 w-4" />
                  <span className="ml-2">Meta</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <KpiCard title="Ativas" value={String(kpis.ativasCount)} icon={<CheckCircle2 className="h-4 w-4" />} />
            <KpiCard title="Canceladas" value={String(kpis.canceladasCount)} icon={<XCircle className="h-4 w-4" />} />
            <KpiCard title="Contempladas" value={String(kpis.contempladasCount)} icon={<CheckCircle2 className="h-4 w-4" />} />
            <KpiCard title="Inadimplentes" value={String(kpis.inadCount)} icon={<AlertTriangle className="h-4 w-4" />} />
            <KpiCard
              title="Carteira"
              value={showCarteiraValues ? currencyBR(kpis.carteiraTotal) : "•••••"}
              icon={
                <button
                  className="text-xs text-white/70 hover:text-white"
                  onClick={() => setShowCarteiraValues((s) => !s)}
                  title="Mostrar/ocultar valores"
                >
                  {showCarteiraValues ? "ocultar" : "mostrar"}
                </button>
              }
            />
            <KpiCard
              title="% Meta (Ano)"
              value={kpis.metaTotal > 0 ? `${(kpis.pctAno * 100).toFixed(1).replace(".", ",")}%` : "—"}
              icon={<Target className="h-4 w-4" />}
            />
          </div>

          <Separator className="bg-white/10" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border border-white/10 bg-white/5 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="text-base">Meta anual x Realizado</CardTitle>
              </CardHeader>
              <CardContent style={{ height: 210 }}>
                <div className="relative w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutAnoData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                        {donutAnoData.map((_, idx) => (
                          <Cell key={idx} fill={donutColors[idx % donutColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => currencyBR(v)} />
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <div className="text-xl font-semibold">
                        {kpis.metaTotal > 0 ? `${(kpis.pctAno * 100).toFixed(1).replace(".", ",")}%` : "—"}
                      </div>
                      <div className="text-xs text-white/60">da meta anual</div>
                    </div>
                  </div>
                </div>

                <div className="mt-2 text-xs text-white/70 flex justify-between">
                  <span>Meta: {currencyBR(kpis.metaTotal)}</span>
                  <span>Realizado: {currencyBR(kpis.realizadoTotal)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border border-white/10 bg-white/5 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="text-base">Meta x Realizado por mês</CardTitle>
              </CardHeader>
              <CardContent style={{ height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartMes}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="mes" />
                    <YAxis
                      tickFormatter={(v) =>
                        Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(v)
                      }
                    />
                    <Tooltip formatter={(v: any) => currencyBR(v)} />
                    <Line type="monotone" dataKey="meta" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="realizado" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-white/5 backdrop-blur-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Vendas</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="bg-white/5 border border-white/10">
              <TabsTrigger value="pendentes">
                Pendentes <Badge className="ml-2 bg-white/10">{filteredPendentes.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="encarteiradas">
                Encarteiradas{" "}
                <Badge className="ml-2 bg-white/10">{filteredEncarteiradas.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pendentes" className="mt-4">
              <VendaTable
                rows={filteredPendentes}
                leadsById={leadsById}
                clientesById={clientesById}
                usersByAuth={usersByAuth}
                canEncarteirar={isAdmin}
                onEncarteirar={encarteirarVenda}
                onVer={openView}
                onEditar={openEditPendente}
              />
            </TabsContent>

            <TabsContent value="encarteiradas" className="mt-4">
              <VendaTable
                rows={filteredEncarteiradas}
                leadsById={leadsById}
                clientesById={clientesById}
                usersByAuth={usersByAuth}
                canEncarteirar={false}
                onEncarteirar={() => {}}
                onVer={openView}
                onEditar={isAdmin ? openEditCota : undefined}
                extraActions={
                  isAdmin
                    ? (v) => (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="bg-white/10 border border-white/10"
                          onClick={() => openTransfer(v)}
                          title="Transferir cota"
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                        </Button>
                      )
                    : undefined
                }
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ===== Dialog: Nova Venda ===== */}
      <Dialog open={openNovaVenda} onOpenChange={setOpenNovaVenda}>
        <DialogContent className="max-w-3xl bg-[#0b1220] border border-white/10">
          <DialogHeader>
            <DialogTitle>Nova Venda</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Buscar Lead</Label>
              <Input
                value={nvLeadQuery}
                onChange={(e) => setNvLeadQuery(e.target.value)}
                placeholder="Nome, telefone ou e-mail"
                className="bg-white/5 border-white/10"
              />

              <div className="border border-white/10 rounded-md bg-white/5 max-h-44 overflow-auto">
                {nvLeadResults.length === 0 ? (
                  <div className="p-3 text-sm text-white/60">Digite para buscar…</div>
                ) : (
                  nvLeadResults.map((l) => (
                    <button
                      key={l.id}
                      className={`w-full text-left p-3 hover:bg-white/10 border-b border-white/5 ${
                        nvLead?.id === l.id ? "bg-white/10" : ""
                      }`}
                      onClick={async () => {
                        setNvLead(l);
                        await prefillFromLead(l);
                      }}
                      type="button"
                    >
                      <div className="font-medium">{l.nome}</div>
                      <div className="text-xs text-white/60">
                        {l.telefone || "—"} • {l.email || "—"}
                      </div>
                    </button>
                  ))
                )}
              </div>

              {nvLead && (
                <div className="text-sm text-white/70">
                  Selecionado: <span className="text-white">{nvLead.nome}</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="grid gap-1">
                <Label>Data da venda</Label>
                <Input
                  type="date"
                  value={nvDataVenda}
                  onChange={(e) => setNvDataVenda(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>

              <div className="grid gap-1">
                <Label>Administradora</Label>
                <Select value={nvAdminId} onValueChange={setNvAdminId}>
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {simAdmins.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1">
                <Label>Produto</Label>
                <Input
                  value={nvProduto}
                  onChange={(e) => {
                    setNvProduto(e.target.value);
                    setNvSegmento(normalizeProdutoToSegmento(e.target.value));
                  }}
                  placeholder="Ex.: Automóvel, Imóvel..."
                  className="bg-white/5 border-white/10"
                />
                <div className="text-xs text-white/60">Segmento: {nvSegmento || "—"}</div>
              </div>

              <div className="grid gap-1">
                <Label>Tabela</Label>
                <Select value={nvTabelaId} onValueChange={setNvTabelaId}>
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTablesForNovaVenda.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.administradora} • {t.segmento} • {t.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label>Nº Proposta</Label>
                  <Input
                    value={nvNumeroProposta}
                    onChange={(e) => setNvNumeroProposta(e.target.value)}
                    className="bg-white/5 border-white/10"
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Valor (R$)</Label>
                  <Input
                    value={nvValorVenda}
                    onChange={(e) => setNvValorVenda(e.target.value)}
                    placeholder="Ex.: 250000"
                    className="bg-white/5 border-white/10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1 col-span-1">
                  <Label>Tipo</Label>
                  <Select value={nvTipoVenda} onValueChange={setNvTipoVenda}>
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Normal">Normal</SelectItem>
                      <SelectItem value="Contemplada">Contemplada</SelectItem>
                      <SelectItem value="Bolsão">Bolsão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1 col-span-1">
                  <Label>Grupo {nvTipoVenda === "Bolsão" ? "(obrigatório)" : ""}</Label>
                  <Input
                    value={nvGrupo}
                    onChange={(e) => setNvGrupo(e.target.value)}
                    className="bg-white/5 border-white/10"
                  />
                </div>

                <div className="grid gap-1 col-span-1">
                  <Label>Cota</Label>
                  <Input
                    value={nvCota}
                    onChange={(e) => setNvCota(e.target.value)}
                    className="bg-white/5 border-white/10"
                  />
                </div>
              </div>

              <div className="grid gap-1">
                <Label>Código (00 ativa)</Label>
                <Input
                  value={nvCodigo}
                  onChange={(e) => setNvCodigo(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button
              variant="secondary"
              className="bg-white/10 border border-white/10"
              onClick={() => setOpenNovaVenda(false)}
            >
              Cancelar
            </Button>
            <Button className="bg-[#A11C27] hover:bg-[#8d1822]" onClick={saveNovaVenda}>
              Salvar venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog: Ver Venda ===== */}
      <Dialog open={openVerVenda} onOpenChange={setOpenVerVenda}>
        <DialogContent className="max-w-2xl bg-[#0b1220] border border-white/10">
          <DialogHeader>
            <DialogTitle>Detalhes da venda</DialogTitle>
          </DialogHeader>

          {activeVenda ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Info label="Cliente">
                  {(activeVenda.cliente_lead_id && clientesById[activeVenda.cliente_lead_id]?.nome) ||
                    (activeVenda.lead_id && leadsById[activeVenda.lead_id]?.nome) ||
                    "—"}
                </Info>
                <Info label="Proposta">{activeVenda.numero_proposta || "—"}</Info>
                <Info label="Administradora">{activeVenda.administradora || "—"}</Info>
                <Info label="Tabela">{activeVenda.tabela || "—"}</Info>
                <Info label="Produto">{activeVenda.produto || "—"}</Info>
                <Info label="Segmento">{activeVenda.segmento || "—"}</Info>
                <Info label="Valor">{currencyBR(activeVenda.valor_venda)}</Info>
                <Info label="Data venda">{formatDateBR(activeVenda.data_venda)}</Info>
                <Info label="Encarteirada em">{formatDateTimeBR(activeVenda.encarteirada_em)}</Info>
                <Info label="Grupo/Cota">
                  {(activeVenda.grupo || "—") + " / " + (activeVenda.cota || "—")}
                </Info>
                <Info label="Código">{activeVenda.codigo || "—"}</Info>
                <Info label="Cancelada em">{formatDateTimeBR(activeVenda.cancelada_em)}</Info>
                <Info label="Inadimplente">{activeVenda.inad ? "Sim" : "Não"}</Info>
              </div>
            </div>
          ) : (
            <div className="text-sm text-white/60">—</div>
          )}

          <DialogFooter>
            <Button
              variant="secondary"
              className="bg-white/10 border border-white/10"
              onClick={() => setOpenVerVenda(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog: Editar Pendente ===== */}
      <Dialog open={openEditarPendente} onOpenChange={setOpenEditarPendente}>
        <DialogContent className="max-w-2xl bg-[#0b1220] border border-white/10">
          <DialogHeader>
            <DialogTitle>Editar venda pendente</DialogTitle>
          </DialogHeader>

          {activeVenda ? (
            <EditarPendente
              venda={activeVenda}
              onCancel={() => setOpenEditarPendente(false)}
              onSaved={async () => {
                setOpenEditarPendente(false);
                await loadData();
              }}
            />
          ) : (
            <div className="text-sm text-white/60">—</div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Dialog: Editor de Cota (admin) ===== */}
      <Dialog open={openEditorCota} onOpenChange={setOpenEditorCota}>
        <DialogContent className="max-w-3xl bg-[#0b1220] border border-white/10">
          <DialogHeader>
            <DialogTitle>Editor de Cota</DialogTitle>
          </DialogHeader>

          {activeVenda ? (
            <EditorCota
              venda={activeVenda}
              isAdmin={isAdmin}
              onCancel={() => setOpenEditorCota(false)}
              onSaved={async () => {
                setOpenEditorCota(false);
                await loadData();
              }}
            />
          ) : (
            <div className="text-sm text-white/60">—</div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Dialog: Transferência (admin) ===== */}
      <Dialog open={openTransferencia} onOpenChange={setOpenTransferencia}>
        <DialogContent className="max-w-2xl bg-[#0b1220] border border-white/10">
          <DialogHeader>
            <DialogTitle>Transferência de cota</DialogTitle>
          </DialogHeader>

          {activeVenda ? (
            <TransferenciaCota
              venda={activeVenda}
              isAdmin={isAdmin}
              onCancel={() => setOpenTransferencia(false)}
              onSaved={async () => {
                setOpenTransferencia(false);
                await loadData();
              }}
            />
          ) : (
            <div className="text-sm text-white/60">—</div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Dialog: Meta (admin) ===== */}
      <Dialog open={openMeta} onOpenChange={setOpenMeta}>
        <DialogContent className="max-w-3xl bg-[#0b1220] border border-white/10">
          <DialogHeader>
            <DialogTitle>Cadastrar/Editar Meta</DialogTitle>
          </DialogHeader>

        {!isAdmin ? (
          <div className="text-sm text-white/60">Apenas admin.</div>
        ) : selectedSeller === ALL ? (
          <div className="text-sm text-white/60">
            Selecione um vendedor no filtro para cadastrar meta.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-white/70">
              Vendedor: <span className="text-white">{usersById[selectedSeller]?.nome}</span> • Ano:{" "}
              <span className="text-white">{selectedYear}</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="grid gap-1">
                  <Label>{monthLabel(i)}</Label>
                  <Input
                    value={String(metaForm[i] ?? 0)}
                    onChange={(e) => {
                      const v = e.target.value;
                      const n = Number(v.replace(",", "."));
                      setMetaForm((old) => {
                        const cp = [...old];
                        cp[i] = Number.isFinite(n) ? n : 0;
                        return cp;
                      });
                    }}
                    className="bg-white/5 border-white/10"
                  />
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button
                variant="secondary"
                className="bg-white/10 border border-white/10"
                onClick={() => setOpenMeta(false)}
                disabled={metaSaving}
              >
                Cancelar
              </Button>
              <Button
                className="bg-[#A11C27] hover:bg-[#8d1822]"
                onClick={saveMetaAdmin}
                disabled={metaSaving}
              >
                {metaSaving ? "Salvando..." : "Salvar meta"}
              </Button>
            </DialogFooter>
          </div>
        )}
        </DialogContent>
      </Dialog>

      {loading && <div className="text-sm text-white/60">Carregando…</div>}
    </div>
  );
}

/** ===================== Subcomponents ===================== */
function KpiCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/60">{title}</div>
        <div className="text-white/70">{icon}</div>
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-2">
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function VendaTable({
  rows,
  leadsById,
  clientesById,
  usersByAuth,
  canEncarteirar,
  onEncarteirar,
  onVer,
  onEditar,
  extraActions,
}: {
  rows: Venda[];
  leadsById: Record<string, Lead>;
  clientesById: Record<string, Cliente>;
  usersByAuth: Record<string, AppUser>;
  canEncarteirar: boolean;
  onEncarteirar: (v: Venda) => void;
  onVer: (v: Venda) => void;
  onEditar?: (v: Venda) => void;
  extraActions?: (v: Venda) => React.ReactNode;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead className="bg-white/5">
          <tr className="text-left">
            <th className="p-3">Cliente</th>
            <th className="p-3">Proposta</th>
            <th className="p-3">Admin</th>
            <th className="p-3">Produto</th>
            <th className="p-3">Valor</th>
            <th className="p-3">Vendedor</th>
            <th className="p-3">Status</th>
            <th className="p-3 w-[200px]">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="p-4 text-white/60" colSpan={8}>
                Sem registros.
              </td>
            </tr>
          ) : (
            rows.map((v) => {
              const nome =
                (v.cliente_lead_id && clientesById[v.cliente_lead_id]?.nome) ||
                (v.lead_id && leadsById[v.lead_id]?.nome) ||
                "—";

              const vend = v.vendedor_id ? usersByAuth[v.vendedor_id]?.nome : null;

              const status = v.encarteirada_em
                ? isCodigoAtivo(v.codigo)
                  ? v.inad
                    ? "Inadimplente"
                    : v.contemplada
                    ? "Contemplada"
                    : "Ativa"
                  : "Cancelada"
                : "Pendente";

              return (
                <tr key={v.id} className="border-t border-white/10 hover:bg-white/5">
                  <td className="p-3 font-medium">{nome}</td>
                  <td className="p-3">{v.numero_proposta || "—"}</td>
                  <td className="p-3">{v.administradora || "—"}</td>
                  <td className="p-3">{v.produto || "—"}</td>
                  <td className="p-3">{currencyBR(v.valor_venda)}</td>
                  <td className="p-3">{vend || "—"}</td>
                  <td className="p-3">
                    <Badge className="bg-white/10">{status}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-white/10 border border-white/10"
                        onClick={() => onVer(v)}
                        title="Ver"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>

                      {onEditar && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="bg-white/10 border border-white/10"
                          onClick={() => onEditar(v)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}

                      {canEncarteirar && (
                        <Button
                          size="sm"
                          className="bg-[#A11C27] hover:bg-[#8d1822]"
                          onClick={() => onEncarteirar(v)}
                          title="Encarteirar"
                        >
                          <Plus className="h-4 w-4" />
                          <span className="ml-1">Encarteirar</span>
                        </Button>
                      )}

                      {extraActions?.(v)}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/** ===== Editar Pendente ===== */
function EditarPendente({
  venda,
  onCancel,
  onSaved,
}: {
  venda: Venda;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [numeroProposta, setNumeroProposta] = useState(venda.numero_proposta || "");
  const [valor, setValor] = useState(String(venda.valor_venda ?? ""));
  const [produto, setProduto] = useState(venda.produto || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("vendas")
        .update({
          numero_proposta: numeroProposta.trim(),
          valor_venda: Number(String(valor).replace(",", ".")) || 0,
          produto: produto.trim(),
        })
        .eq("id", venda.id);

      if (error) {
        console.warn("[Carteira] updatePendenteErr:", error.message);
        alert("Erro ao salvar. Veja console.");
        return;
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="grid gap-1">
          <Label>Nº Proposta</Label>
          <Input value={numeroProposta} onChange={(e) => setNumeroProposta(e.target.value)} className="bg-white/5 border-white/10" />
        </div>
        <div className="grid gap-1">
          <Label>Valor</Label>
          <Input value={valor} onChange={(e) => setValor(e.target.value)} className="bg-white/5 border-white/10" />
        </div>
        <div className="grid gap-1">
          <Label>Produto</Label>
          <Input value={produto} onChange={(e) => setProduto(e.target.value)} className="bg-white/5 border-white/10" />
        </div>
      </div>

      <DialogFooter>
        <Button variant="secondary" className="bg-white/10 border border-white/10" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button className="bg-[#A11C27] hover:bg-[#8d1822]" onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** ===== Editor Cota (admin) ===== */
function EditorCota({
  venda,
  isAdmin,
  onCancel,
  onSaved,
}: {
  venda: Venda;
  isAdmin: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [grupo, setGrupo] = useState(venda.grupo || "");
  const [cota, setCota] = useState(venda.cota || "");
  const [codigo, setCodigo] = useState(venda.codigo || "00");

  const [canceladaEm, setCanceladaEm] = useState<string>(() => {
    if (!venda.cancelada_em) return "";
    const d = new Date(venda.cancelada_em);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const [reativadaEm, setReativadaEm] = useState<string>(() => {
    if (!venda.reativada_em) return "";
    const d = new Date(venda.reativada_em);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const [contemplada, setContemplada] = useState(!!venda.contemplada);
  const [dataCont, setDataCont] = useState(venda.data_contemplacao || "");
  const [contTipo, setContTipo] = useState(venda.contemplacao_tipo || "");
  const [contPct, setContPct] = useState(String(venda.contemplacao_pct ?? ""));

  const [inad, setInad] = useState(!!venda.inad);
  const [inadEm, setInadEm] = useState(venda.inad_em ? venda.inad_em.slice(0, 10) : "");
  const [inadRevEm, setInadRevEm] = useState(venda.inad_revertida_em ? venda.inad_revertida_em.slice(0, 10) : "");

  const [saving, setSaving] = useState(false);

  async function save() {
    if (!isAdmin) return;

    const wasAtivo = isCodigoAtivo(venda.codigo);
    const willAtivo = isCodigoAtivo(codigo);

    if (wasAtivo && !willAtivo && !canceladaEm) {
      alert("Ao mudar de 00 para outro código, informe a data de cancelamento.");
      return;
    }
    if (!wasAtivo && willAtivo && !reativadaEm) {
      alert("Ao reativar para 00, informe a data de reativação.");
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        grupo: grupo.trim() || null,
        cota: cota.trim() || null,
        codigo: (codigo || "").trim() || null,

        cancelada_em: wasAtivo && !willAtivo ? new Date(canceladaEm).toISOString() : (willAtivo ? null : venda.cancelada_em),
        reativada_em: !wasAtivo && willAtivo ? new Date(reativadaEm).toISOString() : venda.reativada_em,

        contemplada,
        data_contemplacao: contemplada ? (dataCont || null) : null,
        contemplacao_tipo: contemplada ? (contTipo || null) : null,
        contemplacao_pct: contemplada ? (Number(String(contPct).replace(",", ".")) || null) : null,

        inad,
        inad_em: inad ? (inadEm ? new Date(inadEm).toISOString() : new Date().toISOString()) : null,
        inad_revertida_em: !inad && venda.inad ? (inadRevEm ? new Date(inadRevEm).toISOString() : null) : venda.inad_revertida_em,
      };

      const { error } = await supabase.from("vendas").update(payload).eq("id", venda.id);
      if (error) {
        console.warn("[Carteira] editorCotaErr:", error.message);
        alert("Erro ao salvar. Veja console.");
        return;
      }

      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {!isAdmin && <div className="text-sm text-white/60">Somente admin pode editar cota.</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="grid gap-1">
          <Label>Grupo</Label>
          <Input value={grupo} onChange={(e) => setGrupo(e.target.value)} className="bg-white/5 border-white/10" />
        </div>
        <div className="grid gap-1">
          <Label>Cota</Label>
          <Input value={cota} onChange={(e) => setCota(e.target.value)} className="bg-white/5 border-white/10" />
        </div>
        <div className="grid gap-1">
          <Label>Código</Label>
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="bg-white/5 border-white/10" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label>Cancelada em</Label>
          <Input type="date" value={canceladaEm} onChange={(e) => setCanceladaEm(e.target.value)} className="bg-white/5 border-white/10" />
          <div className="text-xs text-white/60">Obrigatório se sair do código 00.</div>
        </div>
        <div className="grid gap-1">
          <Label>Reativada em</Label>
          <Input type="date" value={reativadaEm} onChange={(e) => setReativadaEm(e.target.value)} className="bg-white/5 border-white/10" />
          <div className="text-xs text-white/60">Obrigatório se voltar para 00.</div>
        </div>
      </div>

      <Separator className="bg-white/10" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <Label className="flex items-center gap-2">
            <input type="checkbox" checked={contemplada} onChange={(e) => setContemplada(e.target.checked)} />
            Contemplada
          </Label>
          <div className="mt-2 grid gap-2">
            <Input type="date" value={dataCont} onChange={(e) => setDataCont(e.target.value)} disabled={!contemplada} className="bg-white/5 border-white/10" />
            <Input value={contTipo} onChange={(e) => setContTipo(e.target.value)} disabled={!contemplada} className="bg-white/5 border-white/10" placeholder="Tipo (ex.: Lance / Sorteio)" />
            <Input value={contPct} onChange={(e) => setContPct(e.target.value)} disabled={!contemplada} className="bg-white/5 border-white/10" placeholder="% (ex.: 25,0000)" />
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <Label className="flex items-center gap-2">
            <input type="checkbox" checked={inad} onChange={(e) => setInad(e.target.checked)} />
            Inadimplente
          </Label>
          <div className="mt-2 grid gap-2">
            <Input type="date" value={inadEm} onChange={(e) => setInadEm(e.target.value)} disabled={!inad} className="bg-white/5 border-white/10" />
            <Input type="date" value={inadRevEm} onChange={(e) => setInadRevEm(e.target.value)} disabled={inad} className="bg-white/5 border-white/10" />
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs text-white/60 mb-2">Observação</div>
          <div className="text-sm text-white/80">
            Alterações aqui impactam status (ativa/cancelada/inad/cont.) e os KPIs.
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="secondary" className="bg-white/10 border border-white/10" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button className="bg-[#A11C27] hover:bg-[#8d1822]" onClick={save} disabled={saving || !isAdmin}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** ===== Transferência de cota (admin) ===== */
function TransferenciaCota({
  venda,
  isAdmin,
  onCancel,
  onSaved,
}: {
  venda: Venda;
  isAdmin: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [novoLeadId, setNovoLeadId] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!isAdmin) return;
    if (!novoLeadId.trim()) return alert("Informe o lead_id de destino (uuid).");

    setSaving(true);
    try {
      const { error } = await supabase
        .from("vendas")
        .update({
          lead_id: novoLeadId.trim(),
          cliente_lead_id: null,
        })
        .eq("id", venda.id);

      if (error) {
        console.warn("[Carteira] transferErr:", error.message);
        alert("Erro ao transferir. Veja console.");
        return;
      }

      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {!isAdmin && <div className="text-sm text-white/60">Somente admin pode transferir.</div>}

      <div className="grid gap-1">
        <Label>Novo lead_id (uuid)</Label>
        <Input
          value={novoLeadId}
          onChange={(e) => setNovoLeadId(e.target.value)}
          className="bg-white/5 border-white/10"
          placeholder="Cole o uuid do lead de destino"
        />
        <div className="text-xs text-white/60">
          Essa ação altera o vínculo da venda/cota para o novo lead.
        </div>
      </div>

      <DialogFooter>
        <Button variant="secondary" className="bg-white/10 border border-white/10" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button className="bg-[#A11C27] hover:bg-[#8d1822]" onClick={save} disabled={saving || !isAdmin}>
          {saving ? "Transferindo..." : "Confirmar transferência"}
        </Button>
      </DialogFooter>
    </div>
  );
}
