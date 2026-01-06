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
import { Separator } from "@/components/ui/separator";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Pencil,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
} from "lucide-react";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

import { toast } from "sonner";

/** ===================== Tipos ===================== */
type UserRow = {
  id: string; // public.users.id
  auth_user_id: string; // auth uid
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
  data_nascimento?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  lead_id?: string | null;
};

type SimAdmin = { id: string; name: string; slug?: string | null };
type SimTable = {
  id: string;
  admin_id: string;
  segmento: string;
  nome_tabela: string;
};

type TipoVenda = "Normal" | "Contemplada" | "Bolsão";
type ContemplacaoTipo = "Lance Livre" | "Primeiro Lance Fixo" | "Segundo Lance Fixo";

type Venda = {
  id: string;
  data_venda?: string | null;
  vendedor_id?: string | null; // auth_user_id (schema)
  segmento?: string | null;
  tabela?: string | null;
  administradora?: string | null;
  forma_venda?: string | null;
  numero_proposta?: string | null;
  cliente_lead_id?: string | null;
  lead_id?: string | null;

  grupo?: string | null;
  cota?: string | null;
  codigo?: string | null; // '00' ativa
  encarteirada_em?: string | null;

  tipo_venda?: TipoVenda | string | null;
  contemplada?: boolean | null;
  data_contemplacao?: string | null;
  contemplacao_tipo?: ContemplacaoTipo | string | null;
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

  descricao?: string | null;
  status_inicial?: string | null;
  status?: string | null;

  created_at?: string | null;
};

type MetaVendedor = {
  vendedor_id: string;
  auth_user_id?: string | null; // ✅ novo
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

/** ===================== Constantes / Helpers ===================== */
const NONE = "__none__";
const ALL = "__all__";

const BRAND = {
  rubi: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
  gold2: "#E0CE8C",
};

function nowISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateBR(iso?: string | null) {
  if (!iso) return "—";
  // aceita yyyy-mm-dd ou timestamptz
  const s = iso.includes("T") ? iso.slice(0, 10) : iso;
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatDateTimeBR(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dd = pad2(d.getDate());
    const mm = pad2(d.getMonth() + 1);
    const yy = d.getFullYear();
    const hh = pad2(d.getHours());
    const mi = pad2(d.getMinutes());
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

function currency(n?: number | null) {
  const v = Number(n || 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function onlyDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}

function formatCPF(v?: string | null) {
  const d = onlyDigits(v || "");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*$/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*$/, "$1.$2.$3/$4-$5");
  return v || "";
}

function validateCPFOrCNPJ(input: string) {
  const d = onlyDigits(input || "");
  return d.length === 11 || d.length === 14;
}

function normalizeSegmentLabel(s?: string | null) {
  const x = (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return x;
}

type Produto =
  | "Automóvel"
  | "Motocicletas"
  | "Imóveis"
  | "Pesados"
  | "Serviços"
  | "Imóvel Estendido";

function normalizeProdutoToSegmento(prod: Produto | string | null | undefined) {
  const p = (prod || "").toString();
  const k = normalizeSegmentLabel(p);

  // mantém compat com teu simulador
  if (k.includes("auto") || k.includes("car")) return "Automóvel";
  if (k.includes("moto")) return "Motocicletas";
  if (k.includes("pesad") || k.includes("caminh") || k.includes("maquina")) return "Pesados";
  if (k.includes("imovel est")) return "Imóvel Estendido";
  if (k.includes("imove")) return "Imóveis";
  if (k.includes("serv")) return "Serviços";

  // fallback: devolve o próprio
  return p || null;
}

function isoFromDateInput(br: string) {
  // aceita yyyy-mm-dd (input type=date)
  if (!br) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(br)) return br;
  return null;
}

function monthKey(i: number) {
  return `m${pad2(i)}` as const;
}
function getMetaMonth(m: MetaVendedor | null, month: number) {
  if (!m) return 0;
  const key = monthKey(month) as keyof MetaVendedor;
  const v = Number((m as any)[key] || 0);
  return Number.isFinite(v) ? v : 0;
}

function sumMonths(meta: MetaVendedor | null) {
  if (!meta) return 0;
  let s = 0;
  for (let i = 1; i <= 12; i++) s += getMetaMonth(meta, i);
  return s;
}

function clampPct4(v: string) {
  // aceita 41,2542 ou 41.2542
  const raw = (v || "").replace(",", ".");
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 10000;
}

/** ===================== Página ===================== */
export default function Carteira() {
  const [authReady, setAuthReady] = useState(false);
  const [authUid, setAuthUid] = useState<string | null>(null);

  const [me, setMe] = useState<UserRow | null>(null);
  const isAdmin = useMemo(() => {
    const r = (me?.role || me?.user_role || "").toLowerCase();
    return r === "admin";
  }, [me]);

  // vendedores
  const [users, setUsers] = useState<UserRow[]>([]);
  const usersByAuth = useMemo(() => {
    const m = new Map<string, UserRow>();
    users.forEach((u) => u.auth_user_id && m.set(u.auth_user_id, u));
    return m;
  }, [users]);

  // filtro (admin) por vendedor (auth_user_id); vendedor fica travado
  const [selectedSellerAuth, setSelectedSellerAuth] = useState<string>(ALL);

  // ano metas
  const currentYear = new Date().getFullYear();
  const [metaYear, setMetaYear] = useState<number>(currentYear);

  // toggle mostrar carteira (valores)
  const [showCarteiraValues, setShowCarteiraValues] = useState(true);

  // bases simuladores
  const [simAdmins, setSimAdmins] = useState<SimAdmin[]>([]);
  const [simTables, setSimTables] = useState<SimTable[]>([]);

  // dados vendas/leads/clientes
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [leadsById, setLeadsById] = useState<Record<string, Lead>>({});
  const [clientesByLeadId, setClientesByLeadId] = useState<Record<string, Cliente>>({});

  // UI
  const [q, setQ] = useState("");

  // modais
  const [newOpen, setNewOpen] = useState(false);
  const [editPendingOpen, setEditPendingOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);

  const [activeVenda, setActiveVenda] = useState<Venda | null>(null);

  // Editor de cota / contemplada / inad / transferencia (admin)
  const [editCotaOpen, setEditCotaOpen] = useState(false);
  const [editCotaMode, setEditCotaMode] = useState<"codigo" | "contemplacao" | "inad" | "transfer">("codigo");

  // Estado de meta carregada
  const [metaRow, setMetaRow] = useState<MetaVendedor | null>(null);
  const [metaAllRows, setMetaAllRows] = useState<MetaVendedor[]>([]); // quando ALL

  // form Nova Venda
  const [leadSearch, setLeadSearch] = useState("");
  const [leadSearchLoading, setLeadSearchLoading] = useState(false);
  const [leadSearchResults, setLeadSearchResults] = useState<Lead[]>([]);
  const leadSearchTimer = useRef<any>(null);

  const [form, setForm] = useState({
    vendedor_auth: "",

    lead_id: "",
    cliente_nome: "",
    cpf: "",
    data_nascimento: "",

    administradora: "",
    produto: "Automóvel" as Produto,
    tabela: "",

    valor_venda: "",
    numero_proposta: "",
    forma_venda: "",
    tipo_venda: "Normal" as TipoVenda,
    grupo: "",
    cota: "",
    codigo: "00",
    data_venda: nowISODate(),
    descricao: "",
  });

  // editar venda pendente (simples)
  const [editPending, setEditPending] = useState({
    valor_venda: "",
    numero_proposta: "",
    forma_venda: "",
    administradora: "",
    produto: "Automóvel" as Produto,
    tabela: "",
    tipo_venda: "Normal" as TipoVenda,
    grupo: "",
    cota: "",
    codigo: "00",
    data_venda: "",
    descricao: "",
  });

  // encarteirar (admin)
  const [encarteirarOpen, setEncarteirarOpen] = useState(false);
  const [encarteirar, setEncarteirar] = useState({
    grupo: "",
    cota: "",
    codigo: "00",
  });

  // editor cota (admin)
  const [cotaEdit, setCotaEdit] = useState({
    grupo: "",
    cota: "",
    codigo: "",
    cancelada_em: "",
    reativada_em: "",

    contemplada: false,
    data_contemplacao: "",
    contemplacao_tipo: "Lance Livre" as ContemplacaoTipo,
    contemplacao_pct: "",

    inad: false,
    inad_em: "",
    inad_revertida_em: "",

    transfer_to_lead_id: "",
    transfer_search: "",
    transfer_loading: false,
    transfer_results: [] as Lead[],
  });

  /** ===================== RBAC / Boot ===================== */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id || null;
      setAuthUid(uid);
      setAuthReady(true);

      if (!uid) return;

      // carrega meu user row
      const { data: meRow, error } = await supabase
        .from("users")
        .select("id, auth_user_id, nome, email, role, user_role, is_active")
        .eq("auth_user_id", uid)
        .maybeSingle();

      if (error) {
        console.error(error);
        toast.error("Erro ao carregar seu perfil (users).");
      }
      setMe((meRow as any) || null);

      // default do filtro
      setSelectedSellerAuth(uid); // se for vendedor, vai ficar travado (tratado abaixo)
    })();
  }, []);

  useEffect(() => {
    // vendedor NÃO escolhe vendedor
    if (!authReady) return;
    if (!authUid) return;
    if (!me) return;

    if (isAdmin) {
      // admin: default ALL
      setSelectedSellerAuth(ALL);
    } else {
      setSelectedSellerAuth(authUid);
    }
  }, [authReady, authUid, me, isAdmin]);

  /** ===================== Load bases ===================== */
  async function loadBases() {
    // users (vendedores ativos)
    const { data: uRows, error: uErr } = await supabase
      .from("users")
      .select("id, auth_user_id, nome, email, role, user_role, is_active")
      .eq("is_active", true)
      .order("nome", { ascending: true });

    if (uErr) {
      console.error(uErr);
      toast.error("Erro ao carregar usuários.");
    } else {
      setUsers((uRows as any) || []);
    }

    // sim_admins e sim_tables
    const [{ data: aRows, error: aErr }, { data: tRows, error: tErr }] = await Promise.all([
      supabase.from("sim_admins").select("id, name, slug").order("name", { ascending: true }),
      supabase.from("sim_tables").select("id, admin_id, segmento, nome_tabela"),
    ]);

    if (aErr) {
      console.error(aErr);
      toast.error("Erro ao carregar administradoras (sim_admins).");
    } else {
      setSimAdmins((aRows as any) || []);
    }

    if (tErr) {
      console.error(tErr);
      toast.error("Erro ao carregar tabelas (sim_tables).");
    } else {
      setSimTables((tRows as any) || []);
    }
  }

  /** ===================== Load vendas + enrich ===================== */
  const sellerAuthFilter = useMemo(() => {
    if (!authUid) return null;
    if (!isAdmin) return authUid; // vendedor sempre ele
    if (selectedSellerAuth === ALL) return null; // sem filtro
    return selectedSellerAuth || null;
  }, [authUid, isAdmin, selectedSellerAuth]);

  async function loadAll() {
    if (!authUid) return;

    setLoading(true);
    try {
      await loadBases();

      // ===== vendas (últimos 36 meses pra não estourar; dá pra aumentar se quiser)
      const dateFrom = new Date();
      dateFrom.setMonth(dateFrom.getMonth() - 36);
      const y = dateFrom.getFullYear();
      const m = String(dateFrom.getMonth() + 1).padStart(2, "0");
      const d = String(dateFrom.getDate()).padStart(2, "0");
      const fromISO = `${y}-${m}-${d}`;

      let qv = supabase
        .from("vendas")
        .select(
          `
          id, data_venda, vendedor_id, segmento, tabela, administradora, forma_venda, numero_proposta, cliente_lead_id, lead_id,
          grupo, cota, codigo, encarteirada_em, tipo_venda, contemplada, data_contemplacao, contemplacao_tipo, contemplacao_pct,
          cancelada_em, reativada_em, inad, inad_em, inad_revertida_em,
          produto, valor_venda, cpf, nascimento, telefone, email,
          descricao, status_inicial, status,
          created_at
        `
        )
        .gte("data_venda", fromISO)
        .order("created_at", { ascending: false });

      if (sellerAuthFilter) {
        qv = qv.eq("vendedor_id", sellerAuthFilter);
      }

      const { data: vRows, error: vErr } = await qv;
      if (vErr) throw vErr;

      const vendasRows: Venda[] = (vRows as any) || [];
      setVendas(vendasRows);

      // ===== leads (enriquecer nomes/contato)
      const leadIds = Array.from(
        new Set(
          vendasRows
            .map((v) => v.lead_id || v.cliente_lead_id)
            .filter(Boolean) as string[]
        )
      );
      if (leadIds.length) {
        const { data: lRows, error: lErr } = await supabase
          .from("leads")
          .select("id, nome, telefone, email, cpf, data_nascimento")
          .in("id", leadIds);

        if (lErr) {
          console.error(lErr);
        } else {
          const map: Record<string, Lead> = {};
          (lRows as any[]).forEach((l) => (map[l.id] = l));
          setLeadsById(map);
        }
      } else {
        setLeadsById({});
      }

      // ===== clientes (prefill / vínculo)
      if (leadIds.length) {
        const { data: cRows, error: cErr } = await supabase
          .from("clientes")
          .select("id, nome, data_nascimento, cpf, telefone, email, lead_id")
          .in("lead_id", leadIds);

        if (cErr) {
          console.error(cErr);
        } else {
          const map: Record<string, Cliente> = {};
          (cRows as any[]).forEach((c) => {
            if (c.lead_id) map[c.lead_id] = c;
          });
          setClientesByLeadId(map);
        }
      } else {
        setClientesByLeadId({});
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao carregar Carteira.");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    if (!authUid) return;
    setRefreshing(true);
    try {
      await loadAll();
      await loadMetas();
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!authReady) return;
    if (!authUid) return;
    if (!me) return;

    // quando muda filtro do admin, recarrega tudo
    (async () => {
      await loadAll();
      await loadMetas();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authUid, me, sellerAuthFilter, metaYear]);

  /** ===================== Metas (agora com auth_user_id) ===================== */
  async function loadMetas() {
    if (!authUid) return;

    try {
      if (!isAdmin) {
        // vendedor: sempre a própria meta
        const { data, error } = await supabase
          .from("metas_vendedores")
          .select("vendedor_id, auth_user_id, ano, m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
          .eq("ano", metaYear)
          .eq("auth_user_id", authUid)
          .maybeSingle();

        if (error) throw error;
        setMetaRow((data as any) || null);
        setMetaAllRows([]);
        return;
      }

      // admin
      if (selectedSellerAuth === ALL) {
        const { data, error } = await supabase
          .from("metas_vendedores")
          .select("vendedor_id, auth_user_id, ano, m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
          .eq("ano", metaYear);

        if (error) throw error;
        setMetaAllRows(((data as any) || []) as MetaVendedor[]);
        setMetaRow(null);
        return;
      }

      // admin filtrando um vendedor
      const { data, error } = await supabase
        .from("metas_vendedores")
        .select("vendedor_id, auth_user_id, ano, m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
        .eq("ano", metaYear)
        .eq("auth_user_id", selectedSellerAuth)
        .maybeSingle();

      if (error) throw error;
      setMetaRow((data as any) || null);
      setMetaAllRows([]);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao carregar metas.");
      setMetaRow(null);
      setMetaAllRows([]);
    }
  }

  /** ===================== Derivados (listas / métricas) ===================== */
  const vendasFiltradas = useMemo(() => {
    const qq = normalizeSegmentLabel(q);
    if (!qq) return vendas;

    return vendas.filter((v) => {
      const lead = leadsById[v.lead_id || v.cliente_lead_id || ""] as Lead | undefined;
      const nome = normalizeSegmentLabel(lead?.nome || "");
      const proposta = normalizeSegmentLabel(v.numero_proposta || "");
      const grupo = normalizeSegmentLabel(v.grupo || "");
      const cota = normalizeSegmentLabel(v.cota || "");
      const admin = normalizeSegmentLabel(v.administradora || "");
      const tab = normalizeSegmentLabel(v.tabela || "");
      return (
        nome.includes(qq) ||
        proposta.includes(qq) ||
        grupo.includes(qq) ||
        cota.includes(qq) ||
        admin.includes(qq) ||
        tab.includes(qq)
      );
    });
  }, [vendas, q, leadsById]);

  const pendentes = useMemo(() => {
    // pendente = sem encarteirada_em
    return vendasFiltradas.filter((v) => !v.encarteirada_em);
  }, [vendasFiltradas]);

  const encarteiradas = useMemo(() => {
    return vendasFiltradas.filter((v) => !!v.encarteirada_em);
  }, [vendasFiltradas]);

  // Totais chips (ativa/cancelada/contemplada/inad)
  const totals = useMemo(() => {
    const base = vendasFiltradas;
    const ativas = base.filter((v) => (v.codigo || "00") === "00");
    const canceladas = base.filter((v) => (v.codigo || "00") !== "00");
    const contempladas = base.filter((v) => !!v.contemplada);
    const inad = base.filter((v) => !!v.inad);

    const sumAtivas = ativas.reduce((s, v) => s + Number(v.valor_venda || 0), 0);

    return {
      ativas: ativas.length,
      canceladas: canceladas.length,
      contempladas: contempladas.length,
      inad: inad.length,
      carteiraValor: sumAtivas,
    };
  }, [vendasFiltradas]);

  // Meta x Realizado (por ano)
  const realizedByMonth = useMemo(() => {
    const year = metaYear;

    const arr = Array.from({ length: 12 }).map((_, i) => {
      const month = i + 1;
      return { month, realizado: 0 };
    });

    // realizado = encarteiradas ativas por encarteirada_em - canceladas por cancelada_em
    for (const v of vendas) {
      const valor = Number(v.valor_venda || 0);
      if (!Number.isFinite(valor)) continue;

      // encarteirada (ativa)
      if (v.encarteirada_em && (v.codigo || "00") === "00") {
        const d = new Date(v.encarteirada_em);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        if (y === year) {
          arr[m - 1].realizado += valor;
        }
      }

      // cancelada (subtrai)
      if (v.cancelada_em && (v.codigo || "00") !== "00") {
        const d = new Date(v.cancelada_em);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        if (y === year) {
          arr[m - 1].realizado -= valor;
        }
      }
    }

    // arredonda pra evitar ruído
    return arr.map((x) => ({ ...x, realizado: Math.round(x.realizado * 100) / 100 }));
  }, [vendas, metaYear]);

  const metaMonthly = useMemo(() => {
    // se ALL: soma metas de todos
    if (isAdmin && selectedSellerAuth === ALL) {
      const sums = Array.from({ length: 12 }).map((_, i) => ({ month: i + 1, meta: 0 }));
      for (const row of metaAllRows) {
        for (let m = 1; m <= 12; m++) {
          sums[m - 1].meta += getMetaMonth(row, m);
        }
      }
      return sums.map((x) => ({ ...x, meta: Math.round(x.meta * 100) / 100 }));
    }

    // single row (admin filtrado ou vendedor)
    const row = metaRow;
    return Array.from({ length: 12 }).map((_, i) => {
      const month = i + 1;
      return { month, meta: Math.round(getMetaMonth(row, month) * 100) / 100 };
    });
  }, [isAdmin, selectedSellerAuth, metaAllRows, metaRow]);

  const metaAnnual = useMemo(() => {
    if (isAdmin && selectedSellerAuth === ALL) {
      let s = 0;
      for (const row of metaAllRows) s += sumMonths(row);
      return Math.round(s * 100) / 100;
    }
    return Math.round(sumMonths(metaRow) * 100) / 100;
  }, [isAdmin, selectedSellerAuth, metaAllRows, metaRow]);

  const realizedAnnual = useMemo(() => {
    return Math.round(realizedByMonth.reduce((s, x) => s + x.realizado, 0) * 100) / 100;
  }, [realizedByMonth]);

  const donut = useMemo(() => {
    const meta = Math.max(0, metaAnnual);
    const real = Math.max(0, realizedAnnual);
    const restante = Math.max(0, meta - real);

    return [
      { name: "Realizado", value: real },
      { name: "Restante", value: restante },
    ];
  }, [metaAnnual, realizedAnnual]);

  const pctMeta = useMemo(() => {
    if (metaAnnual <= 0) return 0;
    return Math.max(0, Math.min(100, (realizedAnnual / metaAnnual) * 100));
  }, [metaAnnual, realizedAnnual]);

  const lineData = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => {
      const month = i + 1;
      return {
        mes: pad2(month),
        meta: metaMonthly[i]?.meta || 0,
        realizado: realizedByMonth[i]?.realizado || 0,
      };
    });
  }, [metaMonthly, realizedByMonth]);

  /** ===================== Opções Nova Venda: admin → produto → tabela (dedupe) ===================== */
  const produtoOptions: Produto[] = useMemo(
    () => ["Automóvel", "Motocicletas", "Imóveis", "Imóvel Estendido", "Pesados", "Serviços"],
    []
  );

  const tabelaOptions = useMemo(() => {
    const prod = form.produto;
    const segFromProduto = normalizeProdutoToSegmento(prod) ?? (prod as string);
    const prodNorm = normalizeSegmentLabel(segFromProduto);

    const admName = form.administradora || "";
    const admId = simAdmins.find((a) => a.name === admName)?.id;

    const filtered = simTables.filter((t) => {
      if (admId && t.admin_id !== admId) return false;
      const segNorm = normalizeSegmentLabel(t.segmento);
      return !prodNorm ? true : segNorm === normalizeSegmentLabel(segFromProduto);
    });

    // ✅ dedupe por nome_tabela (case/acento-insensível)
    const seen = new Set<string>();
    const unique: SimTable[] = [];
    for (const t of filtered) {
      const key = normalizeSegmentLabel(t.nome_tabela);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(t);
    }

    unique.sort((a, b) =>
      (a.nome_tabela || "").localeCompare(b.nome_tabela || "", "pt-BR", { sensitivity: "base" })
    );

    return unique;
  }, [form.produto, form.administradora, simAdmins, simTables]);

  /** ===================== Lead search (Nova Venda) ===================== */
  useEffect(() => {
    if (!newOpen) return;
    const term = leadSearch.trim();
    if (!term || term.length < 2) {
      setLeadSearchResults([]);
      return;
    }

    if (leadSearchTimer.current) clearTimeout(leadSearchTimer.current);
    leadSearchTimer.current = setTimeout(async () => {
      setLeadSearchLoading(true);
      try {
        // busca por nome/telefone/email
        const { data, error } = await supabase
          .from("leads")
          .select("id, nome, telefone, email, cpf, data_nascimento")
          .or(
            `nome.ilike.%${term}%,telefone.ilike.%${term}%,email.ilike.%${term}%,cpf.ilike.%${term}%`
          )
          .limit(20);

        if (error) throw error;
        setLeadSearchResults((data as any) || []);
      } catch (e: any) {
        console.error(e);
        setLeadSearchResults([]);
      } finally {
        setLeadSearchLoading(false);
      }
    }, 300);

    return () => {
      if (leadSearchTimer.current) clearTimeout(leadSearchTimer.current);
    };
  }, [leadSearch, newOpen]);

  async function onPickLead(l: Lead) {
    setForm((prev) => ({
      ...prev,
      lead_id: l.id,
      cliente_nome: l.nome || prev.cliente_nome,
      cpf: l.cpf || prev.cpf,
      data_nascimento: l.data_nascimento || prev.data_nascimento,
    }));

    // prefill via clientes (se existir)
    try {
      const { data: c, error } = await supabase
        .from("clientes")
        .select("id, nome, data_nascimento, cpf, telefone, email, lead_id")
        .eq("lead_id", l.id)
        .maybeSingle();
      if (!error && c) {
        setForm((prev) => ({
          ...prev,
          cliente_nome: (c as any).nome || prev.cliente_nome,
          cpf: (c as any).cpf || prev.cpf,
          data_nascimento: (c as any).data_nascimento || prev.data_nascimento,
        }));
        return;
      }

      // fallback: última venda encarteirada do lead
      const { data: last, error: lErr } = await supabase
        .from("vendas")
        .select("cpf, nascimento")
        .eq("lead_id", l.id)
        .not("encarteirada_em", "is", null)
        .order("encarteirada_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lErr && last) {
        setForm((prev) => ({
          ...prev,
          cpf: (last as any).cpf || prev.cpf,
          data_nascimento: (last as any).nascimento || prev.data_nascimento,
        }));
      }
    } catch (e) {
      // ignore
    }
  }

  /** ===================== Ações ===================== */
  function openNewVenda() {
    if (!authUid) return;

    const sellerDefault =
      isAdmin && selectedSellerAuth !== ALL
        ? selectedSellerAuth
        : isAdmin
        ? authUid
        : authUid;

    setForm({
      vendedor_auth: sellerDefault,

      lead_id: "",
      cliente_nome: "",
      cpf: "",
      data_nascimento: "",

      administradora: "",
      produto: "Automóvel",
      tabela: "",

      valor_venda: "",
      numero_proposta: "",
      forma_venda: "",
      tipo_venda: "Normal",
      grupo: "",
      cota: "",
      codigo: "00",
      data_venda: nowISODate(),
      descricao: "",
    });
    setLeadSearch("");
    setLeadSearchResults([]);
    setNewOpen(true);
  }

  async function createVenda() {
    // validações
    const vendedorAuth = isAdmin ? (form.vendedor_auth || authUid) : authUid;
    if (!vendedorAuth) {
      toast.error("Sem vendedor definido.");
      return;
    }

    if (!form.lead_id) {
      toast.error("Selecione um lead/cliente.");
      return;
    }

    if (form.cpf && !validateCPFOrCNPJ(form.cpf)) {
      toast.error("CPF/CNPJ inválido.");
      return;
    }

    if (!form.administradora) {
      toast.error("Selecione a administradora.");
      return;
    }

    if (!form.produto) {
      toast.error("Selecione o produto.");
      return;
    }

    if (!form.tabela) {
      toast.error("Selecione a tabela.");
      return;
    }

    if ((form.tipo_venda || "Normal") === "Bolsão" && !form.grupo.trim()) {
      toast.error("Bolsão exige informar o grupo.");
      return;
    }

    const valor = Number((form.valor_venda || "").toString().replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      toast.error("Informe o valor da venda.");
      return;
    }

    const dataVenda = isoFromDateInput(form.data_venda);
    if (!dataVenda) {
      toast.error("Informe a data da venda.");
      return;
    }

    try {
      setLoading(true);

      const payload: Partial<Venda> = {
        vendedor_id: vendedorAuth,
        lead_id: form.lead_id,

        cpf: form.cpf ? onlyDigits(form.cpf) : null,
        nascimento: form.data_nascimento || null,

        administradora: form.administradora,
        produto: form.produto,
        segmento: normalizeProdutoToSegmento(form.produto),
        tabela: form.tabela,

        valor_venda: valor,
        numero_proposta: form.numero_proposta || null,
        forma_venda: form.forma_venda || null,
        tipo_venda: form.tipo_venda || "Normal",

        grupo: form.grupo || null,
        cota: form.cota || null,
        codigo: form.codigo || "00",

        data_venda: dataVenda,
        descricao: form.descricao || null,
      };

      const { error } = await supabase.from("vendas").insert(payload as any);
      if (error) throw error;

      toast.success("Venda registrada!");
      setNewOpen(false);
      await refresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao registrar venda.");
    } finally {
      setLoading(false);
    }
  }

  function openEditPending(v: Venda) {
    setActiveVenda(v);
    setEditPending({
      valor_venda: String(v.valor_venda || ""),
      numero_proposta: v.numero_proposta || "",
      forma_venda: v.forma_venda || "",
      administradora: v.administradora || "",
      produto: (v.produto as any) || "Automóvel",
      tabela: v.tabela || "",
      tipo_venda: ((v.tipo_venda as any) || "Normal") as TipoVenda,
      grupo: v.grupo || "",
      cota: v.cota || "",
      codigo: v.codigo || "00",
      data_venda: (v.data_venda || nowISODate()) as string,
      descricao: v.descricao || "",
    });
    setEditPendingOpen(true);
  }

  async function saveEditPending() {
    if (!activeVenda) return;

    const valor = Number((editPending.valor_venda || "").toString().replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      toast.error("Informe o valor da venda.");
      return;
    }

    if (!editPending.administradora) {
      toast.error("Informe a administradora.");
      return;
    }
    if (!editPending.produto) {
      toast.error("Informe o produto.");
      return;
    }
    if (!editPending.tabela) {
      toast.error("Informe a tabela.");
      return;
    }
    if ((editPending.tipo_venda || "Normal") === "Bolsão" && !editPending.grupo.trim()) {
      toast.error("Bolsão exige informar o grupo.");
      return;
    }

    const dataVenda = isoFromDateInput(editPending.data_venda);
    if (!dataVenda) {
      toast.error("Informe a data da venda.");
      return;
    }

    try {
      setLoading(true);
      const patch: Partial<Venda> = {
        valor_venda: valor,
        numero_proposta: editPending.numero_proposta || null,
        forma_venda: editPending.forma_venda || null,
        administradora: editPending.administradora,
        produto: editPending.produto,
        segmento: normalizeProdutoToSegmento(editPending.produto),
        tabela: editPending.tabela,
        tipo_venda: editPending.tipo_venda,
        grupo: editPending.grupo || null,
        cota: editPending.cota || null,
        codigo: editPending.codigo || "00",
        data_venda: dataVenda,
        descricao: editPending.descricao || null,
      };

      const { error } = await supabase.from("vendas").update(patch as any).eq("id", activeVenda.id);
      if (error) throw error;

      toast.success("Venda atualizada!");
      setEditPendingOpen(false);
      setActiveVenda(null);
      await refresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao salvar edição.");
    } finally {
      setLoading(false);
    }
  }

  function openView(v: Venda) {
    setActiveVenda(v);
    setViewOpen(true);
  }

  /** Encarteirar (admin only) */
  function openEncarteirar(v: Venda) {
    if (!isAdmin) {
      toast.error("Somente admin pode encarteirar.");
      return;
    }
    setActiveVenda(v);
    setEncarteirar({
      grupo: v.grupo || "",
      cota: v.cota || "",
      codigo: v.codigo || "00",
    });
    setEncarteirarOpen(true);
  }

  async function doEncarteirar() {
    if (!isAdmin) {
      toast.error("Somente admin pode encarteirar.");
      return;
    }
    if (!activeVenda) return;

    const grupo = encarteirar.grupo.trim();
    const cota = encarteirar.cota.trim();
    const codigo = (encarteirar.codigo || "").trim() || "00";

    if (!grupo || !cota || !codigo) {
      toast.error("Informe Grupo, Cota e Código.");
      return;
    }

    try {
      setLoading(true);
      const patch: Partial<Venda> = {
        grupo,
        cota,
        codigo,
        encarteirada_em: new Date().toISOString(),
        segmento: normalizeProdutoToSegmento(activeVenda.produto || activeVenda.segmento || ""),
      };

      const { error } = await supabase.from("vendas").update(patch as any).eq("id", activeVenda.id);
      if (error) throw error;

      toast.success("Encarteirada com sucesso!");
      setEncarteirarOpen(false);
      setActiveVenda(null);
      await refresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao encarteirar.");
    } finally {
      setLoading(false);
    }
  }

  /** Editor cota (admin only) */
  function openEditCota(v: Venda) {
    if (!isAdmin) {
      toast.error("Somente admin pode editar cota.");
      return;
    }
    setActiveVenda(v);

    setCotaEdit({
      grupo: v.grupo || "",
      cota: v.cota || "",
      codigo: v.codigo || "00",
      cancelada_em: v.cancelada_em ? (v.cancelada_em.slice(0, 10) as any) : "",
      reativada_em: v.reativada_em ? (v.reativada_em.slice(0, 10) as any) : "",

      contemplada: !!v.contemplada,
      data_contemplacao: v.data_contemplacao || "",
      contemplacao_tipo: (v.contemplacao_tipo as any) || "Lance Livre",
      contemplacao_pct:
        v.contemplacao_pct !== null && v.contemplacao_pct !== undefined
          ? String(v.contemplacao_pct).replace(".", ",")
          : "",

      inad: !!v.inad,
      inad_em: v.inad_em ? (v.inad_em.slice(0, 10) as any) : "",
      inad_revertida_em: v.inad_revertida_em ? (v.inad_revertida_em.slice(0, 10) as any) : "",

      transfer_to_lead_id: "",
      transfer_search: "",
      transfer_loading: false,
      transfer_results: [],
    });

    setEditCotaMode("codigo");
    setEditCotaOpen(true);
  }

  async function saveEditCota() {
    if (!isAdmin) {
      toast.error("Somente admin pode editar cota.");
      return;
    }
    if (!activeVenda) return;

    const patch: Partial<Venda> = {};

    if (editCotaMode === "codigo") {
      const newCodigo = (cotaEdit.codigo || "").trim() || "00";
      const oldCodigo = (activeVenda.codigo || "00").trim() || "00";

      if (!cotaEdit.grupo.trim() || !cotaEdit.cota.trim()) {
        toast.error("Informe Grupo e Cota.");
        return;
      }

      patch.grupo = cotaEdit.grupo.trim();
      patch.cota = cotaEdit.cota.trim();
      patch.codigo = newCodigo;

      // regra: 00 -> outro exige cancelada_em
      if (oldCodigo === "00" && newCodigo !== "00") {
        const canc = isoFromDateInput(cotaEdit.cancelada_em);
        if (!canc) {
          toast.error("Ao mudar de 00 para outro código, informe a data de cancelamento.");
          return;
        }
        patch.cancelada_em = canc;
      }

      // regra: outro -> 00 exige reativada_em
      if (oldCodigo !== "00" && newCodigo === "00") {
        const reat = isoFromDateInput(cotaEdit.reativada_em);
        if (!reat) {
          toast.error("Ao voltar para 00, informe a data de reativação.");
          return;
        }
        patch.reativada_em = reat;
      }
    }

    if (editCotaMode === "contemplacao") {
      const contem = !!cotaEdit.contemplada;
      patch.contemplada = contem;

      if (contem) {
        const dt = isoFromDateInput(cotaEdit.data_contemplacao);
        if (!dt) {
          toast.error("Informe a data da contemplação.");
          return;
        }
        const pct = clampPct4(cotaEdit.contemplacao_pct);
        if (pct === null) {
          toast.error("Informe o % do lance (ex: 41,2542).");
          return;
        }
        patch.data_contemplacao = dt;
        patch.contemplacao_tipo = cotaEdit.contemplacao_tipo;
        patch.contemplacao_pct = pct;
      } else {
        patch.data_contemplacao = null;
        patch.contemplacao_tipo = null;
        patch.contemplacao_pct = null;
      }
    }

    if (editCotaMode === "inad") {
      const inad = !!cotaEdit.inad;
      patch.inad = inad;

      if (inad) {
        const dt = isoFromDateInput(cotaEdit.inad_em);
        if (!dt) {
          toast.error("Informe a data da inadimplência.");
          return;
        }
        patch.inad_em = dt;
        patch.inad_revertida_em = null;
      } else {
        const dt = isoFromDateInput(cotaEdit.inad_revertida_em);
        if (!dt) {
          toast.error("Informe a data de reversão da inadimplência.");
          return;
        }
        patch.inad_revertida_em = dt;
        patch.inad_em = null;
      }
    }

    if (editCotaMode === "transfer") {
      const toLead = cotaEdit.transfer_to_lead_id;
      if (!toLead) {
        toast.error("Selecione o lead de destino.");
        return;
      }
      patch.lead_id = toLead;

      // tenta copiar cpf/nascimento do lead destino
      try {
        const { data: l, error } = await supabase
          .from("leads")
          .select("cpf, data_nascimento")
          .eq("id", toLead)
          .maybeSingle();
        if (!error && l) {
          patch.cpf = (l as any).cpf ? onlyDigits((l as any).cpf) : null;
          patch.nascimento = (l as any).data_nascimento || null;
        }
      } catch {
        // ignore
      }
    }

    try {
      setLoading(true);
      const { error } = await supabase.from("vendas").update(patch as any).eq("id", activeVenda.id);
      if (error) throw error;

      toast.success("Atualizado!");
      setEditCotaOpen(false);
      setActiveVenda(null);
      await refresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  /** Transfer search */
  useEffect(() => {
    if (!editCotaOpen) return;
    if (editCotaMode !== "transfer") return;

    const term = cotaEdit.transfer_search.trim();
    if (!term || term.length < 2) {
      setCotaEdit((p) => ({ ...p, transfer_results: [] }));
      return;
    }

    const t = setTimeout(async () => {
      setCotaEdit((p) => ({ ...p, transfer_loading: true }));
      try {
        const { data, error } = await supabase
          .from("leads")
          .select("id, nome, telefone, email, cpf, data_nascimento")
          .or(
            `nome.ilike.%${term}%,telefone.ilike.%${term}%,email.ilike.%${term}%,cpf.ilike.%${term}%`
          )
          .limit(20);

        if (error) throw error;
        setCotaEdit((p) => ({ ...p, transfer_results: (data as any) || [] }));
      } catch {
        setCotaEdit((p) => ({ ...p, transfer_results: [] }));
      } finally {
        setCotaEdit((p) => ({ ...p, transfer_loading: false }));
      }
    }, 300);

    return () => clearTimeout(t);
  }, [editCotaOpen, editCotaMode, cotaEdit.transfer_search]);

  /** ===================== Metas: salvar (admin only) ===================== */
  const [metaEdit, setMetaEdit] = useState<Record<string, string>>({});
  useEffect(() => {
    // preenche editor ao abrir
    if (!metaOpen) return;

    if (!isAdmin) return;

    const row =
      selectedSellerAuth === ALL
        ? null
        : metaRow;

    const initial: Record<string, string> = {};
    for (let m = 1; m <= 12; m++) {
      const val = row ? getMetaMonth(row, m) : 0;
      initial[monthKey(m)] = val ? String(val).replace(".", ",") : "";
    }
    setMetaEdit(initial);
  }, [metaOpen, isAdmin, selectedSellerAuth, metaRow]);

  async function saveMeta() {
    if (!isAdmin) {
      toast.error("Somente admin pode editar metas.");
      return;
    }

    if (selectedSellerAuth === ALL) {
      toast.error("Para editar meta, selecione um vendedor específico.");
      return;
    }

    const sellerAuth = selectedSellerAuth;
    const seller = usersByAuth.get(sellerAuth);
    if (!seller) {
      toast.error("Vendedor inválido.");
      return;
    }

    const patch: Partial<MetaVendedor> = {
      vendedor_id: seller.id,
      auth_user_id: seller.auth_user_id,
      ano: metaYear,
    };

    for (let m = 1; m <= 12; m++) {
      const k = monthKey(m);
      const raw = (metaEdit[k] || "").replace(/\./g, "").replace(",", ".");
      const n = raw ? Number(raw) : 0;
      (patch as any)[k] = Number.isFinite(n) ? n : 0;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from("metas_vendedores")
        .upsert(patch as any, { onConflict: "vendedor_id,ano" });

      if (error) throw error;

      toast.success("Meta salva!");
      setMetaOpen(false);
      await loadMetas();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao salvar meta.");
    } finally {
      setLoading(false);
    }
  }

  /** ===================== UI helpers ===================== */
  function sellerLabel(authId: string | null | undefined) {
    if (!authId) return "—";
    const u = usersByAuth.get(authId);
    return u?.nome || "—";
  }

  function leadLabel(v: Venda) {
    const lid = v.lead_id || v.cliente_lead_id || "";
    const l = leadsById[lid];
    if (l?.nome) return l.nome;
    return "—";
  }

  function statusBadge(v: Venda) {
    const codigo = (v.codigo || "00").trim() || "00";
    const isAtiva = codigo === "00";

    if (v.inad) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3.5 w-3.5" />
          Inadimplente
        </Badge>
      );
    }

    if (!isAtiva) {
      return (
        <Badge variant="secondary" className="gap-1">
          <XCircle className="h-3.5 w-3.5" />
          Cancelada ({codigo})
        </Badge>
      );
    }

    if (v.contemplada) {
      return (
        <Badge className="gap-1" style={{ background: BRAND.gold, color: BRAND.navy }}>
          <BadgeCheck className="h-3.5 w-3.5" />
          Contemplada
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="gap-1">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Ativa
      </Badge>
    );
  }

  /** ===================== Render ===================== */
  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-2xl flex items-center justify-center shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.rubi} 100%)`,
            }}
          >
            <span className="text-white font-bold">C</span>
          </div>
          <div>
            <div className="text-xl font-semibold">Carteira</div>
            <div className="text-sm text-muted-foreground">
              {isAdmin ? "Admin: visão total + filtro por vendedor" : "Vendedor: sua carteira"}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          {/* Filtro vendedor (admin only) */}
          {isAdmin ? (
            <div className="min-w-[240px]">
              <Label className="text-xs">Vendedor</Label>
              <Select value={selectedSellerAuth} onValueChange={setSelectedSellerAuth}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {users
                    .filter((u) => (u.role || u.user_role || "").toLowerCase() !== "viewer")
                    .map((u) => (
                      <SelectItem key={u.auth_user_id} value={u.auth_user_id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="min-w-[240px]">
              <Label className="text-xs">Vendedor</Label>
              <div className="h-9 px-3 rounded-md border flex items-center text-sm bg-muted">
                {sellerLabel(authUid)}
              </div>
            </div>
          )}

          <div className="min-w-[160px]">
            <Label className="text-xs">Ano da Meta</Label>
            <Select value={String(metaYear)} onValueChange={(v) => setMetaYear(Number(v))}>
              <SelectTrigger className="h-9">
                <SelectValue />
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
          </div>

          <Button
            variant="outline"
            className="h-9 gap-2"
            onClick={refresh}
            disabled={loading || refreshing}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>

          <Button className="h-9 gap-2" onClick={openNewVenda} disabled={loading}>
            <Plus className="h-4 w-4" />
            Nova Venda
          </Button>
        </div>
      </div>

      {/* Search + toggles */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="w-full md:max-w-[520px]">
          <Label>Buscar cliente / proposta / grupo</Label>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ex: João, 12345, grupo 9954..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Mostrar valores da carteira</Label>
            <Switch checked={showCarteiraValues} onCheckedChange={setShowCarteiraValues} />
          </div>

          {isAdmin && (
            <Button
              variant="secondary"
              className="h-9"
              onClick={() => setMetaOpen(true)}
              disabled={selectedSellerAuth === ALL}
              title={selectedSellerAuth === ALL ? "Selecione um vendedor para editar a meta" : "Editar meta"}
            >
              Editar Meta
            </Button>
          )}
        </div>
      </div>

      {/* Chips */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">Ativas: {totals.ativas}</Badge>
        <Badge variant="secondary">Canceladas: {totals.canceladas}</Badge>
        <Badge style={{ background: BRAND.gold, color: BRAND.navy }}>
          Contempladas: {totals.contempladas}
        </Badge>
        <Badge variant="destructive">Inadimplentes: {totals.inad}</Badge>

        {showCarteiraValues && (
          <Badge className="ml-auto" style={{ background: BRAND.navy, color: "white" }}>
            Carteira (ativas): {currency(totals.carteiraValor)}
          </Badge>
        )}
      </div>

      {/* Meta cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Meta Anual x Realizado</CardTitle>
            <div className="text-xs text-muted-foreground">
              {metaYear} — {isAdmin && selectedSellerAuth === ALL ? "Somatório de todos" : "Vendedor selecionado"}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-52 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donut}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={85}
                    stroke="transparent"
                  >
                    <Cell fill={BRAND.rubi} />
                    <Cell fill="#e5e7eb" />
                  </Pie>
                  <RTooltip
                    formatter={(v: any) => currency(Number(v))}
                    labelFormatter={(l) => String(l)}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-2xl font-bold" style={{ color: BRAND.navy }}>
                  {pctMeta.toFixed(1).replace(".", ",")}%
                </div>
                <div className="text-xs text-muted-foreground">da meta realizada</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-3 rounded-lg border">
                <div className="text-xs text-muted-foreground">Meta Anual</div>
                <div className="font-semibold">{currency(metaAnnual)}</div>
              </div>
              <div className="p-3 rounded-lg border">
                <div className="text-xs text-muted-foreground">Realizado</div>
                <div className="font-semibold">{currency(realizedAnnual)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Meta x Realizado por Mês</CardTitle>
            <div className="text-xs text-muted-foreground">
              Realizado = encarteiradas ativas (por encarteirada_em) − canceladas (por cancelada_em)
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <RTooltip formatter={(v: any) => currency(Number(v))} />
                  <Legend />
                  <Line type="monotone" dataKey="meta" name="Meta" stroke={BRAND.gold} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="realizado" name="Realizado" stroke={BRAND.rubi} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Listas */}
      <Tabs defaultValue="pendentes" className="w-full">
        <TabsList>
          <TabsTrigger value="pendentes">Pendentes ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="encarteiradas">Encarteiradas ({encarteiradas.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Vendas Pendentes</CardTitle>
              <div className="text-xs text-muted-foreground">
                Pendentes = ainda sem data de encarteiramento.
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="py-10 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
                </div>
              ) : pendentes.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">Nenhuma venda pendente.</div>
              ) : (
                <div className="space-y-2">
                  {pendentes.map((v) => (
                    <div
                      key={v.id}
                      className="p-3 rounded-xl border flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-semibold truncate">{leadLabel(v)}</div>
                          {statusBadge(v)}
                          {isAdmin && (
                            <Badge variant="outline" className="text-xs">
                              {sellerLabel(v.vendedor_id)}
                            </Badge>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          <span>Admin: {v.administradora || "—"}</span>
                          <span>Produto: {v.produto || v.segmento || "—"}</span>
                          <span>Tabela: {v.tabela || "—"}</span>
                          <span>Proposta: {v.numero_proposta || "—"}</span>
                          <span>Venda: {formatDateBR(v.data_venda)}</span>
                        </div>

                        {showCarteiraValues && (
                          <div className="text-sm mt-1">
                            <span className="text-muted-foreground">Valor: </span>
                            <span className="font-semibold">{currency(v.valor_venda)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          className="h-8"
                          onClick={() => openView(v)}
                        >
                          Ver
                        </Button>

                        <Button
                          variant="secondary"
                          className="h-8 gap-2"
                          onClick={() => openEditPending(v)}
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </Button>

                        {isAdmin && (
                          <Button
                            className="h-8 gap-2"
                            onClick={() => openEncarteirar(v)}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Encarteirar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="encarteiradas" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Carteira Encarteirada</CardTitle>
              <div className="text-xs text-muted-foreground">
                Encarteiradas = já possuem data de encarteiramento. (Admin pode editar cota/transferência.)
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="py-10 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
                </div>
              ) : encarteiradas.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">Nenhuma venda encarteirada.</div>
              ) : (
                <div className="space-y-2">
                  {encarteiradas.map((v) => (
                    <div
                      key={v.id}
                      className="p-3 rounded-xl border flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-semibold truncate">{leadLabel(v)}</div>
                          {statusBadge(v)}
                          {isAdmin && (
                            <Badge variant="outline" className="text-xs">
                              {sellerLabel(v.vendedor_id)}
                            </Badge>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          <span>Grupo: {v.grupo || "—"}</span>
                          <span>Cota: {v.cota || "—"}</span>
                          <span>Código: {v.codigo || "—"}</span>
                          <span>Admin: {v.administradora || "—"}</span>
                          <span>Produto: {v.produto || v.segmento || "—"}</span>
                          <span>Tabela: {v.tabela || "—"}</span>
                          <span>Enc.: {formatDateTimeBR(v.encarteirada_em)}</span>
                        </div>

                        {showCarteiraValues && (
                          <div className="text-sm mt-1">
                            <span className="text-muted-foreground">Valor: </span>
                            <span className="font-semibold">{currency(v.valor_venda)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          className="h-8"
                          onClick={() => openView(v)}
                        >
                          Ver
                        </Button>

                        {isAdmin && (
                          <Button
                            variant="secondary"
                            className="h-8 gap-2"
                            onClick={() => openEditCota(v)}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar Cota
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===================== MODAIS ===================== */}

      {/* Nova Venda */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nova Venda</DialogTitle>
            <DialogDescription>
              Ordem: <b>Administradora → Produto → Tabela</b>. (Vendedor não encarteira e não edita meta.)
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vendedor (admin only) */}
            {isAdmin ? (
              <div className="space-y-2">
                <Label>Vendedor</Label>
                <Select
                  value={form.vendedor_auth}
                  onValueChange={(v) => setForm((p) => ({ ...p, vendedor_auth: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.auth_user_id} value={u.auth_user_id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Vendedor</Label>
                <div className="h-10 rounded-md border px-3 flex items-center bg-muted">
                  {sellerLabel(authUid)}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Data da venda</Label>
              <Input
                type="date"
                value={form.data_venda}
                onChange={(e) => setForm((p) => ({ ...p, data_venda: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label>Buscar Lead / Cliente</Label>
              <Input
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                placeholder="Digite nome/telefone/email/CPF..."
              />
              {leadSearchLoading ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> buscando...
                </div>
              ) : leadSearchResults.length ? (
                <div className="border rounded-lg max-h-48 overflow-auto">
                  {leadSearchResults.map((l) => (
                    <button
                      key={l.id}
                      className={`w-full text-left px-3 py-2 hover:bg-muted transition ${
                        form.lead_id === l.id ? "bg-muted" : ""
                      }`}
                      onClick={() => onPickLead(l)}
                      type="button"
                    >
                      <div className="font-medium">{l.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.telefone || "—"} • {l.email || "—"} • {formatCPF(l.cpf || "")}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Dica: digite pelo menos 2 caracteres.
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>CPF/CNPJ</Label>
              <Input
                value={form.cpf}
                onChange={(e) => setForm((p) => ({ ...p, cpf: e.target.value }))}
                placeholder="Somente números ou formatado"
              />
            </div>
            <div className="space-y-2">
              <Label>Nascimento</Label>
              <Input
                type="date"
                value={form.data_nascimento}
                onChange={(e) => setForm((p) => ({ ...p, data_nascimento: e.target.value }))}
              />
            </div>

            <Separator className="md:col-span-2" />

            <div className="space-y-2">
              <Label>Administradora</Label>
              <Select
                value={form.administradora}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    administradora: v,
                    tabela: "", // reset tabela ao trocar admin
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {simAdmins.map((a) => (
                    <SelectItem key={a.id} value={a.name}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Produto</Label>
              <Select
                value={form.produto}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    produto: v as Produto,
                    tabela: "", // reset tabela ao trocar produto
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {produtoOptions.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label>Tabela</Label>
              <Select
                value={form.tabela}
                onValueChange={(v) => setForm((p) => ({ ...p, tabela: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tabelaOptions.length ? "Selecione" : "Sem tabelas para este filtro"} />
                </SelectTrigger>
                <SelectContent>
                  {tabelaOptions.map((t) => (
                    <SelectItem key={t.id} value={t.nome_tabela}>
                      {t.nome_tabela}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                (Deduplicado por <b>nome_tabela</b> para evitar repetição.)
              </div>
            </div>

            <div className="space-y-2">
              <Label>Valor da venda</Label>
              <Input
                value={form.valor_venda}
                onChange={(e) => setForm((p) => ({ ...p, valor_venda: e.target.value }))}
                placeholder="Ex: 170000"
              />
            </div>

            <div className="space-y-2">
              <Label>Nº Proposta</Label>
              <Input
                value={form.numero_proposta}
                onChange={(e) => setForm((p) => ({ ...p, numero_proposta: e.target.value }))}
                placeholder="Opcional"
              />
            </div>

            <div className="space-y-2">
              <Label>Forma de Venda</Label>
              <Input
                value={form.forma_venda}
                onChange={(e) => setForm((p) => ({ ...p, forma_venda: e.target.value }))}
                placeholder="Ex: Direto / Indicação..."
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={form.tipo_venda}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    tipo_venda: v as TipoVenda,
                  }))
                }
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

            {(form.tipo_venda === "Bolsão" || form.tipo_venda === "Contemplada") && (
              <>
                <div className="space-y-2">
                  <Label>Grupo</Label>
                  <Input
                    value={form.grupo}
                    onChange={(e) => setForm((p) => ({ ...p, grupo: e.target.value }))}
                    placeholder="Obrigatório para Bolsão"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Cota</Label>
                  <Input
                    value={form.cota}
                    onChange={(e) => setForm((p) => ({ ...p, cota: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Código</Label>
              <Input
                value={form.codigo}
                onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))}
                placeholder="Default 00"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label>Descrição</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={createVenda} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar Venda Pendente */}
      <Dialog open={editPendingOpen} onOpenChange={setEditPendingOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Venda (Pendente)</DialogTitle>
            <DialogDescription>
              Ajuste os dados da venda antes do encarteiramento.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data da venda</Label>
              <Input
                type="date"
                value={editPending.data_venda}
                onChange={(e) => setEditPending((p) => ({ ...p, data_venda: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                value={editPending.valor_venda}
                onChange={(e) => setEditPending((p) => ({ ...p, valor_venda: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Administradora</Label>
              <Select
                value={editPending.administradora}
                onValueChange={(v) =>
                  setEditPending((p) => ({
                    ...p,
                    administradora: v,
                    tabela: "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {simAdmins.map((a) => (
                    <SelectItem key={a.id} value={a.name}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Produto</Label>
              <Select
                value={editPending.produto}
                onValueChange={(v) =>
                  setEditPending((p) => ({
                    ...p,
                    produto: v as Produto,
                    tabela: "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {produtoOptions.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label>Tabela</Label>
              {/* Reaproveita a lógica dedupe usando editPending */}
              <Select
                value={editPending.tabela}
                onValueChange={(v) => setEditPending((p) => ({ ...p, tabela: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const seg = normalizeProdutoToSegmento(editPending.produto);
                    const prodNorm = normalizeSegmentLabel(seg || "");
                    const admId = simAdmins.find((a) => a.name === editPending.administradora)?.id;

                    const filtered = simTables.filter((t) => {
                      if (admId && t.admin_id !== admId) return false;
                      return normalizeSegmentLabel(t.segmento) === prodNorm;
                    });

                    const seen = new Set<string>();
                    const unique: SimTable[] = [];
                    for (const t of filtered) {
                      const key = normalizeSegmentLabel(t.nome_tabela);
                      if (seen.has(key)) continue;
                      seen.add(key);
                      unique.push(t);
                    }

                    unique.sort((a, b) =>
                      (a.nome_tabela || "").localeCompare(b.nome_tabela || "", "pt-BR", { sensitivity: "base" })
                    );

                    return unique.map((t) => (
                      <SelectItem key={t.id} value={t.nome_tabela}>
                        {t.nome_tabela}
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nº Proposta</Label>
              <Input
                value={editPending.numero_proposta}
                onChange={(e) => setEditPending((p) => ({ ...p, numero_proposta: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Forma</Label>
              <Input
                value={editPending.forma_venda}
                onChange={(e) => setEditPending((p) => ({ ...p, forma_venda: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={editPending.tipo_venda}
                onValueChange={(v) => setEditPending((p) => ({ ...p, tipo_venda: v as TipoVenda }))}
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

            {(editPending.tipo_venda === "Bolsão" || editPending.tipo_venda === "Contemplada") && (
              <>
                <div className="space-y-2">
                  <Label>Grupo</Label>
                  <Input
                    value={editPending.grupo}
                    onChange={(e) => setEditPending((p) => ({ ...p, grupo: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cota</Label>
                  <Input
                    value={editPending.cota}
                    onChange={(e) => setEditPending((p) => ({ ...p, cota: e.target.value }))}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Código</Label>
              <Input
                value={editPending.codigo}
                onChange={(e) => setEditPending((p) => ({ ...p, codigo: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label>Descrição</Label>
              <Input
                value={editPending.descricao}
                onChange={(e) => setEditPending((p) => ({ ...p, descricao: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditPendingOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={saveEditPending} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ver Venda */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Venda</DialogTitle>
            <DialogDescription>Informações completas (somente leitura).</DialogDescription>
          </DialogHeader>

          {activeVenda ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-lg font-semibold">{leadLabel(activeVenda)}</div>
                <div>{statusBadge(activeVenda)}</div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {isAdmin && (
                  <div>
                    <div className="text-xs text-muted-foreground">Vendedor</div>
                    <div className="font-medium">{sellerLabel(activeVenda.vendedor_id)}</div>
                  </div>
                )}

                <div>
                  <div className="text-xs text-muted-foreground">Data da venda</div>
                  <div className="font-medium">{formatDateBR(activeVenda.data_venda)}</div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Administradora</div>
                  <div className="font-medium">{activeVenda.administradora || "—"}</div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Produto</div>
                  <div className="font-medium">{activeVenda.produto || activeVenda.segmento || "—"}</div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Tabela</div>
                  <div className="font-medium">{activeVenda.tabela || "—"}</div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Nº Proposta</div>
                  <div className="font-medium">{activeVenda.numero_proposta || "—"}</div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Grupo</div>
                  <div className="font-medium">{activeVenda.grupo || "—"}</div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Cota</div>
                  <div className="font-medium">{activeVenda.cota || "—"}</div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Código</div>
                  <div className="font-medium">{activeVenda.codigo || "—"}</div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Encarteirada em</div>
                  <div className="font-medium">{formatDateTimeBR(activeVenda.encarteirada_em)}</div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Valor</div>
                  <div className="font-medium">{currency(activeVenda.valor_venda)}</div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-muted-foreground">Descrição</div>
                  <div className="font-medium">{activeVenda.descricao || "—"}</div>
                </div>

                {activeVenda.contemplada && (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Data contemplação</div>
                      <div className="font-medium">{formatDateBR(activeVenda.data_contemplacao)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Tipo</div>
                      <div className="font-medium">{activeVenda.contemplacao_tipo || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">% lance</div>
                      <div className="font-medium">
                        {activeVenda.contemplacao_pct !== null && activeVenda.contemplacao_pct !== undefined
                          ? `${String(activeVenda.contemplacao_pct).replace(".", ",")}%`
                          : "—"}
                      </div>
                    </div>
                  </>
                )}

                {activeVenda.inad && (
                  <div>
                    <div className="text-xs text-muted-foreground">Inad desde</div>
                    <div className="font-medium">{formatDateBR(activeVenda.inad_em)}</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">—</div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Encarteirar */}
      <Dialog open={encarteirarOpen} onOpenChange={setEncarteirarOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Encarteirar Venda</DialogTitle>
            <DialogDescription>
              Somente admin. Informe <b>Grupo</b>, <b>Cota</b> e <b>Código</b>.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Grupo</Label>
              <Input
                value={encarteirar.grupo}
                onChange={(e) => setEncarteirar((p) => ({ ...p, grupo: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Cota</Label>
              <Input
                value={encarteirar.cota}
                onChange={(e) => setEncarteirar((p) => ({ ...p, cota: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Código</Label>
              <Input
                value={encarteirar.codigo}
                onChange={(e) => setEncarteirar((p) => ({ ...p, codigo: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEncarteirarOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={doEncarteirar} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Encarteirar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar Cota (admin) */}
      <Dialog open={editCotaOpen} onOpenChange={setEditCotaOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Cota</DialogTitle>
            <DialogDescription>
              Admin: altere código/cota, contemplação, inadimplência ou transfira a cota.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={editCotaMode} onValueChange={(v) => setEditCotaMode(v as any)}>
            <TabsList className="grid grid-cols-4">
              <TabsTrigger value="codigo">Código</TabsTrigger>
              <TabsTrigger value="contemplacao">Contemplada</TabsTrigger>
              <TabsTrigger value="inad">Inadimplência</TabsTrigger>
              <TabsTrigger value="transfer">Transferir</TabsTrigger>
            </TabsList>

            <TabsContent value="codigo" className="mt-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Grupo</Label>
                  <Input value={cotaEdit.grupo} onChange={(e) => setCotaEdit((p) => ({ ...p, grupo: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Cota</Label>
                  <Input value={cotaEdit.cota} onChange={(e) => setCotaEdit((p) => ({ ...p, cota: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Código</Label>
                  <Input value={cotaEdit.codigo} onChange={(e) => setCotaEdit((p) => ({ ...p, codigo: e.target.value }))} />
                </div>

                <div className="md:col-span-3 text-xs text-muted-foreground">
                  Regras:
                  <ul className="list-disc ml-5 mt-1">
                    <li><b>00 → outro</b>: exige data de cancelamento.</li>
                    <li><b>outro → 00</b>: exige data de reativação.</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <Label>Cancelada em</Label>
                  <Input type="date" value={cotaEdit.cancelada_em} onChange={(e) => setCotaEdit((p) => ({ ...p, cancelada_em: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Reativada em</Label>
                  <Input type="date" value={cotaEdit.reativada_em} onChange={(e) => setCotaEdit((p) => ({ ...p, reativada_em: e.target.value }))} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="contemplacao" className="mt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                  <div>
                    <div className="font-medium">Marcar como contemplada</div>
                    <div className="text-xs text-muted-foreground">Ative para informar tipo e % do lance.</div>
                  </div>
                  <Switch
                    checked={cotaEdit.contemplada}
                    onCheckedChange={(v) => setCotaEdit((p) => ({ ...p, contemplada: v }))}
                  />
                </div>

                {cotaEdit.contemplada && (
                  <>
                    <div className="space-y-2">
                      <Label>Data contemplação</Label>
                      <Input
                        type="date"
                        value={cotaEdit.data_contemplacao}
                        onChange={(e) => setCotaEdit((p) => ({ ...p, data_contemplacao: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select
                        value={cotaEdit.contemplacao_tipo}
                        onValueChange={(v) => setCotaEdit((p) => ({ ...p, contemplacao_tipo: v as ContemplacaoTipo }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Lance Livre">Lance Livre</SelectItem>
                          <SelectItem value="Primeiro Lance Fixo">Primeiro Lance Fixo</SelectItem>
                          <SelectItem value="Segundo Lance Fixo">Segundo Lance Fixo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>% do lance (4 casas)</Label>
                      <Input
                        value={cotaEdit.contemplacao_pct}
                        onChange={(e) => setCotaEdit((p) => ({ ...p, contemplacao_pct: e.target.value }))}
                        placeholder="Ex: 41,2542"
                      />
                      <div className="text-xs text-muted-foreground">
                        Use vírgula ou ponto. Vamos salvar como número com 4 casas.
                      </div>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="inad" className="mt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                  <div>
                    <div className="font-medium">Inadimplente</div>
                    <div className="text-xs text-muted-foreground">
                      Se marcar, exige data de inad. Se desmarcar, exige data de reversão.
                    </div>
                  </div>
                  <Switch
                    checked={cotaEdit.inad}
                    onCheckedChange={(v) => setCotaEdit((p) => ({ ...p, inad: v }))}
                  />
                </div>

                {cotaEdit.inad ? (
                  <div className="space-y-2">
                    <Label>Inad desde</Label>
                    <Input
                      type="date"
                      value={cotaEdit.inad_em}
                      onChange={(e) => setCotaEdit((p) => ({ ...p, inad_em: e.target.value }))}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Revertida em</Label>
                    <Input
                      type="date"
                      value={cotaEdit.inad_revertida_em}
                      onChange={(e) => setCotaEdit((p) => ({ ...p, inad_revertida_em: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="transfer" className="mt-3">
              <div className="space-y-2">
                <Label>Buscar lead destino</Label>
                <Input
                  value={cotaEdit.transfer_search}
                  onChange={(e) => setCotaEdit((p) => ({ ...p, transfer_search: e.target.value }))}
                  placeholder="Digite nome/telefone/email/CPF..."
                />
              </div>

              {cotaEdit.transfer_loading ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2 mt-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> buscando...
                </div>
              ) : cotaEdit.transfer_results.length ? (
                <div className="border rounded-lg max-h-48 overflow-auto mt-2">
                  {cotaEdit.transfer_results.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 hover:bg-muted transition ${
                        cotaEdit.transfer_to_lead_id === l.id ? "bg-muted" : ""
                      }`}
                      onClick={() => setCotaEdit((p) => ({ ...p, transfer_to_lead_id: l.id }))}
                    >
                      <div className="font-medium flex items-center gap-2">
                        <ArrowRightLeft className="h-4 w-4" />
                        {l.nome}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {l.telefone || "—"} • {l.email || "—"} • {formatCPF(l.cpf || "")}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mt-2">Digite ao menos 2 caracteres.</div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditCotaOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={saveEditCota} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar Meta (admin only) */}
      <Dialog open={metaOpen} onOpenChange={setMetaOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar Meta</DialogTitle>
            <DialogDescription>
              A meta fica em <b>metas_vendedores</b>. Agora com coluna <b>auth_user_id</b> (vendedor vê só a dele).
            </DialogDescription>
          </DialogHeader>

          {selectedSellerAuth === ALL ? (
            <div className="p-4 rounded-lg border bg-muted text-sm">
              Selecione um vendedor específico no filtro para editar a meta.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, i) => {
                const m = i + 1;
                const k = monthKey(m);
                return (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs">M{pad2(m)}</Label>
                    <Input
                      value={metaEdit[k] || ""}
                      onChange={(e) => setMetaEdit((p) => ({ ...p, [k]: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMetaOpen(false)} disabled={loading}>
              Fechar
            </Button>
            <Button onClick={saveMeta} disabled={loading || selectedSellerAuth === ALL}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
