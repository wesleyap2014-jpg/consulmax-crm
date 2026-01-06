// src/pages/Carteira.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

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
  Legend,
} from "recharts";

import {
  RefreshCcw,
  Plus,
  Search,
  Pencil,
  Eye,
  Save,
  X,
  Shield,
  User,
} from "lucide-react";

/** ===================== Tipos ===================== */

type UserRow = {
  id: string;
  auth_user_id: string;
  nome: string;
  role?: string | null; // enum user_role (admin/vendedor)
  user_role?: string | null; // legado (admin/vendedor)
  is_active?: boolean | null;
};

type MetaRow = {
  id?: string;
  vendedor_id: string; // -> public.users.id
  auth_user_id: string; // -> public.users.auth_user_id (desnormalizado)
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

type SimAdmin = { id: string; name: string; slug?: string | null };
type SimTable = { id: string; admin_id?: string | null; admin_slug?: string | null; name: string; segment?: string | null };

type LeadRow = {
  id: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  cpf?: string | null;
  data_nascimento?: string | null;
};

type ClienteRow = {
  id: string;
  nome: string;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  data_nascimento?: string | null;
};

type VendaRow = {
  id: string;
  data_venda: string; // date
  vendedor_id: string; // IMPORTANT: aqui é auth_user_id conforme baseline (public.vendas.vendedor_id = auth.users.id)
  segmento?: string | null;
  tabela?: string | null;
  administradora?: string | null;
  forma_venda?: string | null;
  numero_proposta?: string | null;

  cliente_lead_id?: string | null;
  lead_id?: string | null;

  grupo?: string | null;
  cota?: string | null;
  codigo?: string | null; // '00' ativo
  encarteirada_em?: string | null;
  tipo_venda?: string | null; // Normal/Contemplada/Bolsão
  contemplada?: boolean | null;
  data_contemplacao?: string | null;

  cancelada_em?: string | null;

  produto?: string | null;
  valor_venda?: number | null;

  cpf?: string | null;
  nascimento?: string | null;
  telefone?: string | null;
  email?: string | null;

  descricao?: string | null;
  status_inicial?: string | null;
  status?: string | null;

  inad?: boolean | null;
  inad_em?: string | null;
  inad_revertida_em?: string | null;

  reativada_em?: string | null;
  contemplacao_tipo?: string | null;
  contemplacao_pct?: number | null;
};

type YearMeta = {
  ano: number;
  m: number[]; // 12
};

const NONE = "__none__";
const ALL = "__all__";

/** ===================== Utils ===================== */

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfYearISO(year: number) {
  return `${year}-01-01`;
}
function endOfYearISO(year: number) {
  return `${year}-12-31`;
}
function startOfMonthISO(year: number, month1: number) {
  const m = String(month1).padStart(2, "0");
  return `${year}-${m}-01`;
}
function endOfMonthISO(year: number, month1: number) {
  const d = new Date(year, month1, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function formatDateBR(iso?: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function formatDateTimeBR(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatDateBR(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}
function currency(v?: number | null) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function num(v?: number | null) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function normalizeText(s?: string | null) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isoFromDateInput(v?: string) {
  if (!v) return null;
  // Aceita "YYYY-MM-DD" ou "DD/MM/YYYY"
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/** CPF/CNPJ simples (mantém compat) */
function onlyDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}
function validateCPF(cpfRaw: string) {
  const cpf = onlyDigits(cpfRaw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === Number(cpf[10]);
}
function validateCNPJ(cnpjRaw: string) {
  const cnpj = onlyDigits(cnpjRaw);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  const calc = (base: string) => {
    const weights = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += Number(base[i]) * weights[i];
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 12) + String(d1));
  return String(d1) === cnpj[12] && String(d2) === cnpj[13];
}
function validateCPFOrCNPJ(v: string) {
  const d = onlyDigits(v);
  if (d.length === 11) return validateCPF(d);
  if (d.length === 14) return validateCNPJ(d);
  return false;
}

function normalizeProdutoToSegmento(produto?: string | null) {
  const p = normalizeText(produto);
  if (!p) return null;
  if (p.includes("imovel")) return "Imóvel";
  if (p.includes("auto") || p.includes("carro") || p.includes("veic")) return "Automóveis";
  if (p.includes("moto")) return "Motocicletas";
  if (p.includes("pesad") || p.includes("caminh") || p.includes("maquina")) return "Pesados";
  if (p.includes("serv")) return "Serviços";
  return null;
}
function normalizeSegmentLabel(seg?: string | null) {
  const s = normalizeText(seg);
  if (!s) return "—";
  if (s.includes("auto")) return "Automóveis";
  if (s.includes("moto")) return "Motocicletas";
  if (s.includes("imovel")) return "Imóvel";
  if (s.includes("pesad")) return "Pesados";
  if (s.includes("serv")) return "Serviços";
  return seg || "—";
}

function roleIsAdmin(u?: UserRow | null) {
  const r = (u?.role || u?.user_role || "").toString().toLowerCase();
  return r === "admin";
}

/** ===================== Componente ===================== */

export default function Carteira() {
  const mounted = useRef(true);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Auth / Perfil
  const [authUserId, setAuthUserId] = useState<string | null>(null); // auth.users.id
  const [profile, setProfile] = useState<UserRow | null>(null);
  const isAdmin = useMemo(() => roleIsAdmin(profile), [profile]);

  // Users list (admin)
  const [users, setUsers] = useState<UserRow[]>([]);
  const usersById = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);
  const usersByAuth = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const u of users) m.set(u.auth_user_id, u);
    return m;
  }, [users]);

  // Filtros
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [selectedSellerId, setSelectedSellerId] = useState<string>(ALL); // public.users.id (admin)
  const selectedSellerAuthId = useMemo(() => {
    if (!isAdmin) return authUserId;
    if (selectedSellerId === ALL) return null;
    const u = usersById.get(selectedSellerId);
    return u?.auth_user_id || null;
  }, [isAdmin, selectedSellerId, usersById, authUserId]);

  const [query, setQuery] = useState("");

  // Bases (admins / tables)
  const [admins, setAdmins] = useState<SimAdmin[]>([]);
  const [tables, setTables] = useState<SimTable[]>([]);

  // Vendas
  const [vendas, setVendas] = useState<VendaRow[]>([]); // ano (encarteirada + canceladas) para KPIs/gráficos
  const [pendentes, setPendentes] = useState<VendaRow[]>([]);
  const [encarteiradas, setEncarteiradas] = useState<VendaRow[]>([]);

  // Metas (somada ou individual)
  const [metaYear, setMetaYear] = useState<YearMeta | null>(null);

  // UI: mostrar/esconder carteira por cliente (chip)
  const [showCarteiraValues, setShowCarteiraValues] = useState(true);

  // Modais
  const [openNovaVenda, setOpenNovaVenda] = useState(false);
  const [openVerVenda, setOpenVerVenda] = useState<null | VendaRow>(null);
  const [openEditarPendente, setOpenEditarPendente] = useState<null | VendaRow>(null);

  // Meta (admin)
  const [openMeta, setOpenMeta] = useState(false);
  const [metaEditSellerId, setMetaEditSellerId] = useState<string>(NONE);
  const [metaDraft, setMetaDraft] = useState<YearMeta>(() => ({ ano: currentYear, m: Array(12).fill(0) }));

  // Nova venda: lead search
  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<LeadRow[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);

  // Form Nova venda / Edit Pendente
  const [form, setForm] = useState<Partial<VendaRow & { cpf_cnpj?: string }>>({
    data_venda: todayISO(),
    tipo_venda: "Normal",
    codigo: "00",
    contemplada: false,
  });

  const sellerScopeLabel = useMemo(() => {
    if (!isAdmin) return "Meu painel";
    if (selectedSellerId === ALL) return "Todos os vendedores";
    return usersById.get(selectedSellerId)?.nome || "Vendedor";
  }, [isAdmin, selectedSellerId, usersById]);

  /** ===================== Load Auth + Bases ===================== */

  async function loadAuthAndProfile() {
    const { data: au } = await supabase.auth.getUser();
    const authId = au?.user?.id || null;
    setAuthUserId(authId);

    if (!authId) {
      setProfile(null);
      return;
    }

    // Perfil no public.users via auth_user_id
    const { data: p, error: pErr } = await supabase
      .from("users")
      .select("id,auth_user_id,nome,role,user_role,is_active")
      .eq("auth_user_id", authId)
      .maybeSingle();

    if (pErr) {
      console.error("Erro ao carregar profile:", pErr);
      setProfile(null);
      return;
    }

    setProfile(p || null);

    // Se vendedor, trava filtro no próprio (sem alterar o código de admin)
    if (p && !roleIsAdmin(p)) {
      setSelectedSellerId(p.id); // importante: selectedSellerId = public.users.id
    } else {
      setSelectedSellerId(ALL);
    }
  }

  async function loadUsersIfAdmin() {
    if (!authUserId) return;
    // Admin: lista ativos para filtro/meta
    const { data, error } = await supabase
      .from("users")
      .select("id,auth_user_id,nome,role,user_role,is_active")
      .eq("is_active", true)
      .order("nome", { ascending: true });

    if (error) {
      console.error("Erro ao carregar users:", error);
      return;
    }
    setUsers(data || []);
  }

  async function loadSimBases() {
    // Bases para admin/produto/tabela (mantém)
    const [{ data: a, error: aErr }, { data: t, error: tErr }] = await Promise.all([
      supabase.from("sim_admins").select("id,name,slug").order("name", { ascending: true }),
      supabase.from("sim_tables").select("id,name,admin_id,admin_slug,segment").order("name", { ascending: true }),
    ]);

    if (aErr) console.error("Erro sim_admins:", aErr);
    if (tErr) console.error("Erro sim_tables:", tErr);

    setAdmins((a as any) || []);
    setTables((t as any) || []);
  }

  /** ===================== RBAC helpers ===================== */

  function applyVendasSellerFilter(q: ReturnType<typeof supabase.from>) {
    // baseline: vendas.vendedor_id = auth_user_id
    if (!isAdmin) {
      if (authUserId) return (q as any).eq("vendedor_id", authUserId);
      return q;
    }
    if (selectedSellerId !== ALL && selectedSellerAuthId) {
      return (q as any).eq("vendedor_id", selectedSellerAuthId);
    }
    return q;
  }

  async function loadMetasForScope() {
    // Regra pedida:
    // - Admin: mantém comportamento atual (pode ver tudo e filtrar).
    // - Vendedor: deve enxergar a própria meta (metas_vendedores via auth_user_id e/ou vendedor_id) SEM depender do admin.
    const ano = year;

    if (!authUserId) {
      setMetaYear(null);
      return;
    }

    if (!isAdmin) {
      // ✅ vendedor: tenta por auth_user_id e também confere vendedor_id do profile (confronta os dois)
      const pid = profile?.id || null;
      let q = supabase
        .from("metas_vendedores")
        .select("vendedor_id,auth_user_id,ano,m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
        .eq("ano", ano);

      // usa os dois para evitar erro (pedido do Wesley)
      if (pid) {
        q = q.or(`auth_user_id.eq.${authUserId},vendedor_id.eq.${pid}`);
      } else {
        q = q.eq("auth_user_id", authUserId);
      }

      const { data, error } = await q.limit(5);
      if (error) {
        console.error("Erro metas vendedor:", error);
        setMetaYear(null);
        return;
      }
      const row = (data || [])[0] as MetaRow | undefined;
      setMetaYear(row ? metaRowToYearMeta(row) : { ano, m: Array(12).fill(0) });
      return;
    }

    // Admin
    if (selectedSellerId === ALL) {
      // soma metas de todos (ano)
      const { data, error } = await supabase
        .from("metas_vendedores")
        .select("m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12,ano")
        .eq("ano", ano);

      if (error) {
        console.error("Erro metas (all):", error);
        setMetaYear(null);
        return;
      }

      const m = Array(12).fill(0);
      for (const r of (data || []) as any[]) {
        for (let i = 0; i < 12; i++) {
          const key = `m${String(i + 1).padStart(2, "0")}` as keyof MetaRow;
          m[i] += num(r[key] as any);
        }
      }
      setMetaYear({ ano, m });
      return;
    }

    // admin filtrado por vendedor
    const u = usersById.get(selectedSellerId);
    const sellerAuth = u?.auth_user_id || null;

    let q = supabase
      .from("metas_vendedores")
      .select("vendedor_id,auth_user_id,ano,m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
      .eq("ano", ano);

    // usa os dois (vendedor_id e auth_user_id) para não falhar
    if (sellerAuth) {
      q = q.or(`vendedor_id.eq.${selectedSellerId},auth_user_id.eq.${sellerAuth}`);
    } else {
      q = q.eq("vendedor_id", selectedSellerId);
    }

    const { data, error } = await q.limit(5);
    if (error) {
      console.error("Erro metas (seller):", error);
      setMetaYear(null);
      return;
    }
    const row = (data || [])[0] as MetaRow | undefined;
    setMetaYear(row ? metaRowToYearMeta(row) : { ano, m: Array(12).fill(0) });
  }

  function metaRowToYearMeta(r: MetaRow): YearMeta {
    return {
      ano: r.ano,
      m: [
        num(r.m01), num(r.m02), num(r.m03), num(r.m04), num(r.m05), num(r.m06),
        num(r.m07), num(r.m08), num(r.m09), num(r.m10), num(r.m11), num(r.m12),
      ],
    };
  }

  /** ===================== Load Vendas ===================== */

  async function loadVendasForYear() {
    const ano = year;
    const yStart = startOfYearISO(ano);
    const yEnd = endOfYearISO(ano);

    // Para KPIs do ano: precisamos de encarteiradas + canceladas que ocorreram no ano
    // Como há dois campos de data (encarteirada_em/cancelada_em), buscamos pelo created_at não ajuda.
    // Estratégia prática:
    // 1) Buscar vendas com encarteirada_em no ano
    // 2) Buscar vendas com cancelada_em no ano
    // 3) Unir por id (dedupe)

    const base1 = applyVendasSellerFilter(
      supabase
        .from("vendas")
        .select("*")
        .not("encarteirada_em", "is", null)
        .gte("encarteirada_em", yStart)
        .lte("encarteirada_em", yEnd)
    );

    const base2 = applyVendasSellerFilter(
      supabase
        .from("vendas")
        .select("*")
        .not("cancelada_em", "is", null)
        .gte("cancelada_em", yStart)
        .lte("cancelada_em", yEnd)
    );

    const [r1, r2] = await Promise.all([base1, base2]);

    if (r1.error) console.error("Erro vendas encarteiradas ano:", r1.error);
    if (r2.error) console.error("Erro vendas canceladas ano:", r2.error);

    const map = new Map<string, VendaRow>();
    for (const v of (r1.data || []) as any[]) map.set(v.id, v as VendaRow);
    for (const v of (r2.data || []) as any[]) map.set(v.id, v as VendaRow);

    setVendas(Array.from(map.values()));
  }

  async function loadPendentes() {
    // pendentes = ainda não encarteiradas
    let q = supabase
      .from("vendas")
      .select("*")
      .is("encarteirada_em", null)
      .order("data_venda", { ascending: false })
      .limit(300);

    q = applyVendasSellerFilter(q as any) as any;

    const { data, error } = await q;
    if (error) {
      console.error("Erro pendentes:", error);
      setPendentes([]);
      return;
    }
    setPendentes((data as any) || []);
  }

  async function loadEncarteiradas() {
    // encarteiradas recentes
    let q = supabase
      .from("vendas")
      .select("*")
      .not("encarteirada_em", "is", null)
      .order("encarteirada_em", { ascending: false })
      .limit(400);

    q = applyVendasSellerFilter(q as any) as any;

    const { data, error } = await q;
    if (error) {
      console.error("Erro encarteiradas:", error);
      setEncarteiradas([]);
      return;
    }
    setEncarteiradas((data as any) || []);
  }

  /** ===================== Refresh ===================== */

  async function refreshAll(showSpinner = true) {
    if (showSpinner) setRefreshing(true);
    setLoading(true);
    try {
      await loadAuthAndProfile();
      await loadSimBases();
      if (roleIsAdmin(profile)) {
        await loadUsersIfAdmin();
      } else {
        // vendedor: ainda carregamos users só se precisar de nome (fallback)
        await loadUsersIfAdmin(); // não faz mal (mas pode ser RLS; se der erro, ok)
      }
    } finally {
      setLoading(false);
      if (showSpinner) setRefreshing(false);
    }
  }

  async function refreshDataOnly() {
    setRefreshing(true);
    setLoading(true);
    try {
      await Promise.all([
        loadMetasForScope(),
        loadVendasForYear(),
        loadPendentes(),
        loadEncarteiradas(),
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  /** ===================== Effects ===================== */

  useEffect(() => {
    mounted.current = true;
    (async () => {
      setLoading(true);
      try {
        await loadAuthAndProfile();
        await loadSimBases();
        await loadUsersIfAdmin();
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // quando troca escopo (admin muda vendedor) ou ano, recarrega dados
  useEffect(() => {
    if (!authUserId) return;
    (async () => {
      await refreshDataOnly();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, isAdmin, selectedSellerId, selectedSellerAuthId, year]);

  /** ===================== KPIs / Métricas ===================== */

  const kpis = useMemo(() => {
    // carteira ativa = vendas ativas (codigo='00') encarteiradas (independente do ano? baseline usa total atual)
    // aqui calculamos da lista encarteiradas carregada
    const ativos = encarteiradas.filter((v) => (v.codigo || "00") === "00");
    const canceladas = encarteiradas.filter((v) => (v.codigo || "00") !== "00");
    const contempladas = encarteiradas.filter((v) => !!v.contemplada);
    const inad = encarteiradas.filter((v) => !!v.inad);

    const carteiraAtivaValor = ativos.reduce((acc, v) => acc + num(v.valor_venda), 0);

    return {
      ativosCount: ativos.length,
      canceladasCount: canceladas.length,
      contempladasCount: contempladas.length,
      inadCount: inad.length,
      carteiraAtivaValor,
    };
  }, [encarteiradas]);

  const clientesComCarteira = useMemo(() => {
    // agrupamento por cliente (cpf/lead_id) para somar apenas cotas ativas codigo='00'
    const map = new Map<string, { key: string; nome: string; telefone?: string | null; email?: string | null; total: number; cotas: number }>();
    const qn = normalizeText(query);

    for (const v of encarteiradas) {
      if ((v.codigo || "00") !== "00") continue; // só ativas
      const key = v.lead_id || v.cliente_lead_id || v.cpf || v.telefone || v.email || v.id;
      const nome = v.descricao?.trim() ? v.descricao!.trim() : (v.cpf || "Cliente");
      // (nota: seu sistema já tem clientes/leads, aqui mantemos simples e não quebra)
      const curr = map.get(key) || { key, nome: nome || "Cliente", telefone: v.telefone, email: v.email, total: 0, cotas: 0 };
      curr.total += num(v.valor_venda);
      curr.cotas += 1;
      if (v.telefone) curr.telefone = v.telefone;
      if (v.email) curr.email = v.email;
      map.set(key, curr);
    }

    let arr = Array.from(map.values());
    if (qn) {
      arr = arr.filter((c) => {
        const blob = normalizeText(`${c.nome} ${c.telefone || ""} ${c.email || ""}`);
        return blob.includes(qn);
      });
    }
    arr.sort((a, b) => b.total - a.total);
    return arr;
  }, [encarteiradas, query]);

  /** ===================== Meta vs Realizado ===================== */

  const metaRealizado = useMemo(() => {
    const ano = year;
    const metaM = metaYear?.m || Array(12).fill(0);

    // Realizado mensal = encarteiradas ativas (codigo='00') por encarteirada_em
    // Menos canceladas (codigo!='00') por cancelada_em (no mesmo mês)
    const realized = Array(12).fill(0);
    const canceled = Array(12).fill(0);

    for (const v of vendas) {
      if (v.encarteirada_em && v.encarteirada_em.slice(0, 4) === String(ano)) {
        const m = Number(v.encarteirada_em.slice(5, 7));
        if (m >= 1 && m <= 12 && (v.codigo || "00") === "00") {
          realized[m - 1] += num(v.valor_venda);
        }
      }
      if (v.cancelada_em && v.cancelada_em.slice(0, 4) === String(ano)) {
        const m = Number(v.cancelada_em.slice(5, 7));
        if (m >= 1 && m <= 12 && (v.codigo || "00") !== "00") {
          canceled[m - 1] += num(v.valor_venda);
        }
      }
    }

    const net = realized.map((v, i) => v - canceled[i]);

    const totalMeta = metaM.reduce((a, b) => a + num(b), 0);
    const totalReal = net.reduce((a, b) => a + num(b), 0);
    const pct = totalMeta > 0 ? (totalReal / totalMeta) * 100 : 0;

    const chart = Array.from({ length: 12 }).map((_, i) => {
      const label = String(i + 1).padStart(2, "0");
      return {
        mes: label,
        meta: Math.max(0, num(metaM[i])),
        realizado: Math.max(0, num(net[i])),
      };
    });

    return { chart, totalMeta, totalReal, pct };
  }, [vendas, metaYear, year]);

  const donutData = useMemo(() => {
    const meta = metaRealizado.totalMeta;
    const real = metaRealizado.totalReal;
    const faltante = Math.max(0, meta - real);
    return [
      { name: "Realizado", value: Math.max(0, real) },
      { name: "Faltante", value: faltante },
    ];
  }, [metaRealizado.totalMeta, metaRealizado.totalReal]);

  /** ===================== Leads search ===================== */

  async function searchLeads(q: string) {
    const s = q.trim();
    if (!s) {
      setLeadResults([]);
      return;
    }
    // tenta em public.leads (nome/telefone/email)
    const { data, error } = await supabase
      .from("leads")
      .select("id,nome,telefone,email,cpf,data_nascimento")
      .or(`nome.ilike.%${s}%,telefone.ilike.%${s}%,email.ilike.%${s}%`)
      .limit(20);

    if (error) {
      console.error("Erro search leads:", error);
      setLeadResults([]);
      return;
    }
    setLeadResults((data as any) || []);
  }

  /** ===================== Actions: Nova venda / Editar pendente ===================== */

  function resetForm() {
    setSelectedLead(null);
    setLeadQuery("");
    setLeadResults([]);
    setForm({
      data_venda: todayISO(),
      tipo_venda: "Normal",
      codigo: "00",
      contemplada: false,
    });
  }

  function openNovaVendaModal() {
    resetForm();
    // vendedor não troca vendedor; admin usa filtro atual (se ALL, usa ele mesmo? aqui exigimos escolher quando ALL)
    setOpenNovaVenda(true);
  }

  function patchForm<K extends keyof (VendaRow & { cpf_cnpj?: string })>(k: K, v: any) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function getAdminNameFromForm() {
    const name = (form.administradora || "").trim();
    return name || null;
  }

  function filteredTablesForForm() {
    // baseline: filtra tabelas por segmento (case/acento-insensível)
    const seg = normalizeText(form.segmento || normalizeProdutoToSegmento(form.produto || null));
    const adminName = normalizeText(form.administradora || "");
    return tables.filter((t) => {
      const okSeg = seg ? normalizeText(t.segment || "").includes(seg) : true;
      const okAdmin =
        !adminName ||
        normalizeText(t.admin_slug || "").includes(adminName) ||
        normalizeText(t.name).includes(adminName);
      return okSeg && okAdmin;
    });
  }

  async function submitNovaVenda() {
    // Regras:
    // - vendedor_id (na vendas) deve ser auth_user_id (auth.users.id)
    // - admin pode lançar para vendedor filtrado; vendedor só para ele.
    const sellerAuth = !isAdmin ? authUserId : (selectedSellerId === ALL ? null : selectedSellerAuthId);

    if (isAdmin && selectedSellerId === ALL) {
      alert("Como admin, selecione um vendedor no filtro para lançar uma venda, ou filtre por um vendedor específico.");
      return;
    }
    if (!authUserId) {
      alert("Usuário não autenticado.");
      return;
    }
    if (!sellerAuth) {
      alert("Não consegui identificar o vendedor (auth_user_id).");
      return;
    }

    const data_venda = isoFromDateInput(String(form.data_venda || "")) || todayISO();
    const valor_venda = Number(form.valor_venda || 0);

    if (!getAdminNameFromForm()) {
      alert("Selecione a Administradora.");
      return;
    }
    if (!form.produto) {
      alert("Selecione o Produto.");
      return;
    }
    if (!form.tabela) {
      alert("Selecione a Tabela.");
      return;
    }
    if (!Number.isFinite(valor_venda) || valor_venda <= 0) {
      alert("Informe o valor da venda.");
      return;
    }
    const cpf_cnpj = String((form as any).cpf_cnpj || form.cpf || "").trim();
    if (cpf_cnpj && !validateCPFOrCNPJ(cpf_cnpj)) {
      alert("CPF/CNPJ inválido.");
      return;
    }

    const segmento = normalizeProdutoToSegmento(form.produto || null) || form.segmento || null;

    // Bolsão: grupo obrigatório
    const tipo_venda = (form.tipo_venda || "Normal") as string;
    if (normalizeText(tipo_venda).includes("bols") && !String(form.grupo || "").trim()) {
      alert("Para Bolsão, informe o grupo.");
      return;
    }

    const payload: Partial<VendaRow> = {
      data_venda,
      vendedor_id: sellerAuth,
      administradora: form.administradora || null,
      produto: form.produto || null,
      segmento,
      tabela: form.tabela || null,
      valor_venda,
      numero_proposta: form.numero_proposta || null,
      descricao: form.descricao || null,
      tipo_venda: form.tipo_venda || "Normal",
      forma_venda: form.forma_venda || null,
      codigo: (form.codigo as any) || "00",
      grupo: form.grupo || null,
      cota: form.cota || null,
      contemplada: !!form.contemplada,
      data_contemplacao: form.data_contemplacao || null,

      lead_id: selectedLead?.id || form.lead_id || null,
      cliente_lead_id: form.cliente_lead_id || null,

      cpf: cpf_cnpj || null,
      telefone: form.telefone || selectedLead?.telefone || null,
      email: form.email || selectedLead?.email || null,
      nascimento: form.nascimento || selectedLead?.data_nascimento || null,
      status_inicial: form.status_inicial || null,
      status: form.status || null,
    };

    setLoading(true);
    try {
      const { error } = await supabase.from("vendas").insert(payload as any);
      if (error) {
        console.error("Erro insert venda:", error);
        alert("Erro ao salvar venda. Veja o console.");
        return;
      }
      setOpenNovaVenda(false);
      resetForm();
      await refreshDataOnly();
    } finally {
      setLoading(false);
    }
  }

  async function submitEditarPendente() {
    if (!openEditarPendente) return;

    const id = openEditarPendente.id;
    const data_venda = isoFromDateInput(String(form.data_venda || "")) || openEditarPendente.data_venda;
    const valor_venda = Number(form.valor_venda ?? openEditarPendente.valor_venda ?? 0);

    if (!getAdminNameFromForm()) {
      alert("Selecione a Administradora.");
      return;
    }
    if (!form.produto) {
      alert("Selecione o Produto.");
      return;
    }
    if (!form.tabela) {
      alert("Selecione a Tabela.");
      return;
    }
    if (!Number.isFinite(valor_venda) || valor_venda <= 0) {
      alert("Informe o valor da venda.");
      return;
    }

    const cpf_cnpj = String((form as any).cpf_cnpj || form.cpf || openEditarPendente.cpf || "").trim();
    if (cpf_cnpj && !validateCPFOrCNPJ(cpf_cnpj)) {
      alert("CPF/CNPJ inválido.");
      return;
    }

    const segmento = normalizeProdutoToSegmento(form.produto || null) || form.segmento || openEditarPendente.segmento || null;

    const patch: Partial<VendaRow> = {
      data_venda,
      administradora: form.administradora || null,
      produto: form.produto || null,
      segmento,
      tabela: form.tabela || null,
      valor_venda,
      numero_proposta: form.numero_proposta || null,
      descricao: form.descricao || null,
      tipo_venda: form.tipo_venda || openEditarPendente.tipo_venda || "Normal",
      forma_venda: form.forma_venda || null,
      grupo: form.grupo || null,
      cota: form.cota || null,

      cpf: cpf_cnpj || null,
      telefone: form.telefone || null,
      email: form.email || null,
      nascimento: form.nascimento || null,
    };

    setLoading(true);
    try {
      const { error } = await supabase.from("vendas").update(patch as any).eq("id", id);
      if (error) {
        console.error("Erro update pendente:", error);
        alert("Erro ao atualizar venda. Veja o console.");
        return;
      }
      setOpenEditarPendente(null);
      resetForm();
      await refreshDataOnly();
    } finally {
      setLoading(false);
    }
  }

  /** ===================== Admin: Meta Upsert ===================== */

  function openMetaModal() {
    if (!isAdmin) return;
    setMetaEditSellerId(selectedSellerId === ALL ? NONE : selectedSellerId);
    setMetaDraft({ ano: year, m: metaYear?.m ? [...metaYear.m] : Array(12).fill(0) });
    setOpenMeta(true);
  }

  async function saveMeta() {
    if (!isAdmin) return;
    if (metaEditSellerId === NONE) {
      alert("Selecione um vendedor para cadastrar a meta.");
      return;
    }
    const u = usersById.get(metaEditSellerId);
    if (!u) {
      alert("Vendedor inválido.");
      return;
    }
    if (!authUserId) {
      alert("Usuário não autenticado.");
      return;
    }

    const payload: Partial<MetaRow & { created_by?: string; updated_at?: string; created_at?: string }> = {
      vendedor_id: u.id,
      auth_user_id: u.auth_user_id, // ✅ grava os dois para evitar erro
      ano: metaDraft.ano,
      m01: num(metaDraft.m[0]),
      m02: num(metaDraft.m[1]),
      m03: num(metaDraft.m[2]),
      m04: num(metaDraft.m[3]),
      m05: num(metaDraft.m[4]),
      m06: num(metaDraft.m[5]),
      m07: num(metaDraft.m[6]),
      m08: num(metaDraft.m[7]),
      m09: num(metaDraft.m[8]),
      m10: num(metaDraft.m[9]),
      m11: num(metaDraft.m[10]),
      m12: num(metaDraft.m[11]),
      created_by: authUserId,
      updated_at: new Date().toISOString(),
    };

    setLoading(true);
    try {
      const { error } = await supabase
        .from("metas_vendedores")
        .upsert(payload as any, { onConflict: "vendedor_id,ano" });

      if (error) {
        console.error("Erro upsert meta:", error);
        alert("Erro ao salvar meta. Veja o console.");
        return;
      }
      setOpenMeta(false);
      await loadMetasForScope();
      await refreshDataOnly();
    } finally {
      setLoading(false);
    }
  }

  /** ===================== UI datasets ===================== */

  const monthLabels = useMemo(
    () => ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
    []
  );

  const metaVsRealChart = useMemo(() => {
    return metaRealizado.chart.map((r, idx) => ({
      mes: monthLabels[idx],
      meta: r.meta,
      realizado: r.realizado,
    }));
  }, [metaRealizado.chart, monthLabels]);

  const pctMetaLabel = useMemo(() => {
    const p = metaRealizado.pct;
    if (!Number.isFinite(p)) return "0%";
    return `${p.toFixed(2).replace(".", ",")}%`;
  }, [metaRealizado.pct]);

  /** ===================== Render ===================== */

  const tablesForSelect = useMemo(() => filteredTablesForForm(), [form, tables]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#1E293F] to-[#A11C27] flex items-center justify-center text-white shadow">
            {isAdmin ? <Shield className="h-5 w-5" /> : <User className="h-5 w-5" />}
          </div>
          <div>
            <h1 className="text-xl font-semibold">Carteira</h1>
            <div className="text-sm text-muted-foreground">{sellerScopeLabel}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Ano */}
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 5 }).map((_, i) => {
                const y = currentYear - 2 + i;
                return (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Filtro vendedor (admin) */}
          {isAdmin ? (
            <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Vendedor" />
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
          ) : null}

          <Button
            variant="outline"
            onClick={() => refreshDataOnly()}
            disabled={refreshing}
            className="gap-2"
            title="Atualizar"
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Button onClick={openNovaVendaModal} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova venda
          </Button>

          {isAdmin ? (
            <Button variant="secondary" onClick={openMetaModal} className="gap-2">
              <Pencil className="h-4 w-4" />
              Cadastrar meta
            </Button>
          ) : null}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Carteira ativa</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div className="text-2xl font-semibold">
              {showCarteiraValues ? currency(kpis.carteiraAtivaValor) : "••••••"}
            </div>
            <Badge variant="secondary">{kpis.ativosCount} cotas</Badge>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Canceladas</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div className="text-2xl font-semibold">{kpis.canceladasCount}</div>
            <Badge variant="outline">cotas</Badge>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Contempladas</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div className="text-2xl font-semibold">{kpis.contempladasCount}</div>
            <Badge variant="outline">cotas</Badge>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inadimplentes</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div className="text-2xl font-semibold">{kpis.inadCount}</div>
            <Badge variant="outline">cotas</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Toggle mostrar/ocultar carteira */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={showCarteiraValues} onCheckedChange={(v) => setShowCarteiraValues(!!v)} />
          Mostrar valores da carteira
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente (nome/telefone/email)"
              className="pl-9 w-[320px]"
            />
          </div>
        </div>
      </div>

      {/* Meta mês x venda mês (donut) + linha */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Meta anual x Realizado ({year})</CardTitle>
            <div className="text-sm text-muted-foreground">
              {isAdmin && selectedSellerId === ALL
                ? "Somatório de metas do time (quando configuradas)"
                : isAdmin
                  ? "Meta do vendedor filtrado"
                  : "Sua meta"}
            </div>
          </CardHeader>
          <CardContent className="h-[280px]">
            <div className="relative h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="70%"
                    outerRadius="90%"
                    paddingAngle={2}
                    stroke="transparent"
                  >
                    <Cell />
                    <Cell />
                  </Pie>
                  <Tooltip formatter={(v: any) => currency(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-3xl font-semibold">{pctMetaLabel}</div>
                <div className="text-sm text-muted-foreground">da meta anual</div>
              </div>
            </div>
          </CardContent>
          <div className="px-6 pb-5 text-sm text-muted-foreground flex flex-wrap gap-4">
            <div>
              <span className="font-medium text-foreground">Meta:</span> {currency(metaRealizado.totalMeta)}
            </div>
            <div>
              <span className="font-medium text-foreground">Realizado:</span> {currency(metaRealizado.totalReal)}
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Meta x Realizado por mês ({year})</CardTitle>
            <div className="text-sm text-muted-foreground">Realizado líquido (encarteiradas - canceladas)</div>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metaVsRealChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip formatter={(v: any) => currency(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="meta" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="realizado" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Pendentes / Carteira (clientes) / Encarteiradas */}
      <Tabs defaultValue="clientes" className="w-full">
        <TabsList>
          <TabsTrigger value="pendentes">Vendas pendentes</TabsTrigger>
          <TabsTrigger value="clientes">Carteira por cliente</TabsTrigger>
          <TabsTrigger value="encarteiradas">Cotas encarteiradas</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Vendas pendentes</CardTitle>
              <div className="text-sm text-muted-foreground">
                Vendas lançadas e ainda não encarteiradas.
              </div>
            </CardHeader>
            <CardContent className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Administradora</th>
                    <th className="py-2 pr-3">Produto</th>
                    <th className="py-2 pr-3">Tabela</th>
                    <th className="py-2 pr-3">Proposta</th>
                    <th className="py-2 pr-3">Valor</th>
                    <th className="py-2 pr-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pendentes.map((v) => (
                    <tr key={v.id} className="border-b">
                      <td className="py-2 pr-3">{formatDateBR(v.data_venda)}</td>
                      <td className="py-2 pr-3">{v.administradora || "—"}</td>
                      <td className="py-2 pr-3">{v.produto || "—"}</td>
                      <td className="py-2 pr-3">{v.tabela || "—"}</td>
                      <td className="py-2 pr-3">{v.numero_proposta || "—"}</td>
                      <td className="py-2 pr-3">{currency(v.valor_venda)}</td>
                      <td className="py-2 pr-0">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => setOpenVerVenda(v)}
                          >
                            <Eye className="h-4 w-4" />
                            Ver
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="gap-2"
                            onClick={() => {
                              setOpenEditarPendente(v);
                              setForm({
                                ...v,
                                data_venda: v.data_venda,
                                cpf_cnpj: v.cpf || "",
                              } as any);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pendentes.length === 0 ? (
                    <tr>
                      <td className="py-6 text-muted-foreground" colSpan={7}>
                        Nenhuma venda pendente encontrada.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clientes">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Carteira por cliente</CardTitle>
              <div className="text-sm text-muted-foreground">
                Somatório por cliente considerando apenas cotas ativas (código 00).
              </div>
            </CardHeader>
            <CardContent className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Cliente</th>
                    <th className="py-2 pr-3">Contato</th>
                    <th className="py-2 pr-3">Cotas</th>
                    <th className="py-2 pr-3">Carteira</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesComCarteira.map((c) => (
                    <tr key={c.key} className="border-b">
                      <td className="py-2 pr-3 font-medium">{c.nome}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {c.telefone || c.email || "—"}
                      </td>
                      <td className="py-2 pr-3">{c.cotas}</td>
                      <td className="py-2 pr-3">
                        {showCarteiraValues ? currency(c.total) : "••••••"}
                      </td>
                    </tr>
                  ))}
                  {clientesComCarteira.length === 0 ? (
                    <tr>
                      <td className="py-6 text-muted-foreground" colSpan={4}>
                        Nenhum cliente encontrado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="encarteiradas">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Cotas encarteiradas</CardTitle>
              <div className="text-sm text-muted-foreground">
                Lista recente de cotas encarteiradas (ativas, canceladas, contempladas e inadimplentes).
              </div>
            </CardHeader>
            <CardContent className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Encarteirada</th>
                    <th className="py-2 pr-3">Grupo/Cota</th>
                    <th className="py-2 pr-3">Admin</th>
                    <th className="py-2 pr-3">Produto</th>
                    <th className="py-2 pr-3">Código</th>
                    <th className="py-2 pr-3">Valor</th>
                    <th className="py-2 pr-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {encarteiradas.map((v) => (
                    <tr key={v.id} className="border-b">
                      <td className="py-2 pr-3">{formatDateTimeBR(v.encarteirada_em)}</td>
                      <td className="py-2 pr-3">
                        {(v.grupo || "—")}/{(v.cota || "—")}
                      </td>
                      <td className="py-2 pr-3">{v.administradora || "—"}</td>
                      <td className="py-2 pr-3">
                        {normalizeSegmentLabel(v.segmento || normalizeProdutoToSegmento(v.produto || null))}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={(v.codigo || "00") === "00" ? "secondary" : "outline"}>
                          {v.codigo || "00"}
                        </Badge>
                        {v.contemplada ? <Badge className="ml-2" variant="secondary">Contemplada</Badge> : null}
                        {v.inad ? <Badge className="ml-2" variant="destructive">Inad</Badge> : null}
                      </td>
                      <td className="py-2 pr-3">{currency(v.valor_venda)}</td>
                      <td className="py-2 pr-0">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpenVerVenda(v)}>
                            <Eye className="h-4 w-4" />
                            Ver
                          </Button>
                          {/* Regras já existentes: vendedor não encarteira nem edita meta (mantido);
                              edição de cota/transferência fica em outra tela/fluxo do seu baseline completo.
                              Aqui mantemos o que não quebra e não mexe em RBAC além do pedido. */}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {encarteiradas.length === 0 ? (
                    <tr>
                      <td className="py-6 text-muted-foreground" colSpan={7}>
                        Nenhuma cota encarteirada encontrada.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===================== MODAL: Nova Venda ===================== */}
      <Dialog open={openNovaVenda} onOpenChange={(v) => setOpenNovaVenda(v)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Nova venda</DialogTitle>
            <DialogDescription>
              Lançamento rápido (Admin → Produto → Tabela). O vendedor vê/lança apenas para si.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Lead Search */}
            <div className="space-y-2">
              <Label>Buscar lead</Label>
              <div className="flex gap-2">
                <Input
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  placeholder="Nome, telefone ou e-mail"
                />
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => searchLeads(leadQuery)}
                >
                  <Search className="h-4 w-4" />
                  Buscar
                </Button>
              </div>

              <div className="border rounded-xl p-2 max-h-[220px] overflow-auto">
                {leadResults.map((l) => (
                  <button
                    key={l.id}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition ${
                      selectedLead?.id === l.id ? "bg-muted" : ""
                    }`}
                    onClick={() => {
                      setSelectedLead(l);
                      // prefill
                      patchForm("lead_id" as any, l.id);
                      patchForm("telefone" as any, l.telefone || "");
                      patchForm("email" as any, l.email || "");
                      patchForm("nascimento" as any, l.data_nascimento || "");
                      patchForm("cpf_cnpj" as any, l.cpf || "");
                    }}
                  >
                    <div className="font-medium">{l.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.telefone || "—"} • {l.email || "—"}
                    </div>
                  </button>
                ))}
                {leadResults.length === 0 ? (
                  <div className="text-sm text-muted-foreground px-3 py-4">
                    Pesquise e selecione um lead (opcional).
                  </div>
                ) : null}
              </div>
            </div>

            {/* Form */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data da venda</Label>
                  <Input
                    value={String(form.data_venda || "")}
                    onChange={(e) => patchForm("data_venda" as any, e.target.value)}
                    placeholder="YYYY-MM-DD"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input
                    value={String(form.valor_venda ?? "")}
                    onChange={(e) => patchForm("valor_venda" as any, e.target.value.replace(",", "."))}
                    placeholder="Ex.: 150000"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Administradora</Label>
                <Select
                  value={String(form.administradora || "")}
                  onValueChange={(v) => patchForm("administradora" as any, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {admins.map((a) => (
                      <SelectItem key={a.id} value={a.name}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Produto</Label>
                <Input
                  value={String(form.produto || "")}
                  onChange={(e) => {
                    const v = e.target.value;
                    patchForm("produto" as any, v);
                    const seg = normalizeProdutoToSegmento(v) || null;
                    patchForm("segmento" as any, seg);
                  }}
                  placeholder="Ex.: Automóvel / Imóvel / Pesados..."
                />
              </div>

              <div className="space-y-2">
                <Label>Tabela</Label>
                <Select
                  value={String(form.tabela || "")}
                  onValueChange={(v) => patchForm("tabela" as any, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {tablesForSelect.map((t) => (
                      <SelectItem key={t.id} value={t.name}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">
                  Filtrada automaticamente pelo segmento.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nº proposta</Label>
                  <Input
                    value={String(form.numero_proposta || "")}
                    onChange={(e) => patchForm("numero_proposta" as any, e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo venda</Label>
                  <Select
                    value={String(form.tipo_venda || "Normal")}
                    onValueChange={(v) => patchForm("tipo_venda" as any, v)}
                  >
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Grupo</Label>
                  <Input
                    value={String(form.grupo || "")}
                    onChange={(e) => patchForm("grupo" as any, e.target.value)}
                    placeholder="Obrigatório se Bolsão"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cota</Label>
                  <Input
                    value={String(form.cota || "")}
                    onChange={(e) => patchForm("cota" as any, e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>CPF/CNPJ</Label>
                  <Input
                    value={String((form as any).cpf_cnpj || "")}
                    onChange={(e) => patchForm("cpf_cnpj" as any, e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={String(form.telefone || "")}
                    onChange={(e) => patchForm("telefone" as any, e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Input
                  value={String(form.descricao || "")}
                  onChange={(e) => patchForm("descricao" as any, e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenNovaVenda(false)} className="gap-2">
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button onClick={submitNovaVenda} disabled={loading} className="gap-2">
              <Save className="h-4 w-4" />
              Salvar venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== MODAL: Editar Pendente ===================== */}
      <Dialog open={!!openEditarPendente} onOpenChange={(v) => (!v ? setOpenEditarPendente(null) : null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar venda pendente</DialogTitle>
            <DialogDescription>Altere os campos e salve. Não muda RBAC.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data da venda</Label>
              <Input
                value={String(form.data_venda || "")}
                onChange={(e) => patchForm("data_venda" as any, e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                value={String(form.valor_venda ?? "")}
                onChange={(e) => patchForm("valor_venda" as any, e.target.value.replace(",", "."))}
              />
            </div>

            <div className="space-y-2">
              <Label>Administradora</Label>
              <Select value={String(form.administradora || "")} onValueChange={(v) => patchForm("administradora" as any, v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {admins.map((a) => (
                    <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Produto</Label>
              <Input
                value={String(form.produto || "")}
                onChange={(e) => {
                  const v = e.target.value;
                  patchForm("produto" as any, v);
                  const seg = normalizeProdutoToSegmento(v) || null;
                  patchForm("segmento" as any, seg);
                }}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Tabela</Label>
              <Select value={String(form.tabela || "")} onValueChange={(v) => patchForm("tabela" as any, v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {tablesForSelect.map((t) => (
                    <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nº proposta</Label>
              <Input
                value={String(form.numero_proposta || "")}
                onChange={(e) => patchForm("numero_proposta" as any, e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>CPF/CNPJ</Label>
              <Input
                value={String((form as any).cpf_cnpj || "")}
                onChange={(e) => patchForm("cpf_cnpj" as any, e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Grupo</Label>
              <Input value={String(form.grupo || "")} onChange={(e) => patchForm("grupo" as any, e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Cota</Label>
              <Input value={String(form.cota || "")} onChange={(e) => patchForm("cota" as any, e.target.value)} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Observações</Label>
              <Input value={String(form.descricao || "")} onChange={(e) => patchForm("descricao" as any, e.target.value)} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOpenEditarPendente(null);
                resetForm();
              }}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button onClick={submitEditarPendente} disabled={loading} className="gap-2">
              <Save className="h-4 w-4" />
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== MODAL: Ver Venda ===================== */}
      <Dialog open={!!openVerVenda} onOpenChange={(v) => (!v ? setOpenVerVenda(null) : null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da venda</DialogTitle>
            <DialogDescription>Visualização completa da venda/cota.</DialogDescription>
          </DialogHeader>

          {openVerVenda ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground">Data venda</div>
                  <div className="font-medium">{formatDateBR(openVerVenda.data_venda)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Encarteirada em</div>
                  <div className="font-medium">{formatDateTimeBR(openVerVenda.encarteirada_em)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground">Administradora</div>
                  <div className="font-medium">{openVerVenda.administradora || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Tabela</div>
                  <div className="font-medium">{openVerVenda.tabela || "—"}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground">Produto</div>
                  <div className="font-medium">{openVerVenda.produto || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Segmento</div>
                  <div className="font-medium">{normalizeSegmentLabel(openVerVenda.segmento)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground">Grupo/Cota</div>
                  <div className="font-medium">
                    {(openVerVenda.grupo || "—")}/{(openVerVenda.cota || "—")}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Código</div>
                  <div className="font-medium">{openVerVenda.codigo || "00"}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground">Proposta</div>
                  <div className="font-medium">{openVerVenda.numero_proposta || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Valor venda</div>
                  <div className="font-medium">{currency(openVerVenda.valor_venda)}</div>
                </div>
              </div>

              <div>
                <div className="text-muted-foreground">Observações</div>
                <div className="font-medium">{openVerVenda.descricao || "—"}</div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenVerVenda(null)} className="gap-2">
              <X className="h-4 w-4" />
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== MODAL: Cadastrar Meta (Admin) ===================== */}
      <Dialog open={openMeta} onOpenChange={setOpenMeta}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Cadastrar meta</DialogTitle>
            <DialogDescription>
              Meta fica em <b>public.metas_vendedores</b> com <b>vendedor_id</b> e <b>auth_user_id</b> (os dois).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Ano</Label>
                <Select value={String(metaDraft.ano)} onValueChange={(v) => setMetaDraft((p) => ({ ...p, ano: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }).map((_, i) => {
                      const y = currentYear - 2 + i;
                      return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Vendedor</Label>
                <Select value={metaEditSellerId} onValueChange={setMetaEditSellerId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Selecione...</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Label>{monthLabels[i]}</Label>
                  <Input
                    value={String(metaDraft.m[i] ?? 0)}
                    onChange={(e) => {
                      const v = Number(String(e.target.value).replace(",", "."));
                      setMetaDraft((p) => {
                        const m = [...p.m];
                        m[i] = Number.isFinite(v) ? v : 0;
                        return { ...p, m };
                      });
                    }}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenMeta(false)} className="gap-2">
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button onClick={saveMeta} disabled={loading} className="gap-2">
              <Save className="h-4 w-4" />
              Salvar meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
