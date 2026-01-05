// src/pages/Carteira.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import {
  Loader2,
  RefreshCw,
  Plus,
  Pencil,
  Eye,
  CheckCircle2,
  ArrowRightLeft,
  AlertTriangle,
} from "lucide-react";

/** ===================== Tipos ===================== */
type AppUser = {
  id: string; // users.id (uuid)
  auth_user_id?: string | null; // users.auth_user_id (uuid)
  nome?: string | null;
  email?: string | null;
  role?: string | null; // enum ou legado
  user_role?: string | null; // legado
  is_active?: boolean | null;
};

type SimAdmin = { id: string; name: string; slug?: string | null };
type SimTable = {
  id: string;
  admin_id: string;
  nome_tabela: string;
  segmento: string; // "Automóvel" | "Imóvel" | ...
};

type MetaRow = {
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

type VendaStatus = "nova" | "encarteirada";
type TipoVenda = "Normal" | "Contemplada" | "Bolsão";

type ContemplacaoTipo = "Lance Livre" | "Primeiro Lance Fixo" | "Segundo Lance Fixo";

type Venda = {
  id: string;
  data_venda?: string | null; // date
  vendedor_id?: string | null; // geralmente auth_user_id
  segmento?: string | null; // pode vir legado
  produto?: string | null; // texto
  tabela?: string | null;
  administradora?: string | null;
  forma_venda?: string | null;
  numero_proposta?: string | null;

  lead_id?: string | null;
  cliente_lead_id?: string | null;

  nome?: string | null; // quando enriquecido via join/lookup
  telefone?: string | null;
  email?: string | null;

  valor_venda?: number | null;

  status?: string | null; // "nova" | "encarteirada"
  status_inicial?: string | null;

  // carteira
  grupo?: string | null;
  cota?: string | null;
  codigo?: string | null; // "00" ativo

  encarteirada_em?: string | null; // timestamptz
  cancelada_em?: string | null; // timestamptz
  reativada_em?: string | null; // timestamptz

  // contemplação
  contemplada?: boolean | null;
  data_contemplacao?: string | null; // date
  contemplacao_tipo?: ContemplacaoTipo | string | null;
  contemplacao_pct?: number | null; // numeric(9,4) -> 0.412542 (ou 41.2542?) (mantém como vem)

  // inad
  inad?: boolean | null;
  inad_em?: string | null; // timestamptz
  inad_revertida_em?: string | null; // timestamptz
};

/** ===================== Helpers ===================== */
function stripAccents(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
function normKey(s: string) {
  return stripAccents(s).toLowerCase();
}
function currency(v: any) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDateBR(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}
function formatDateTimeBR(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}
function isoFromDateInput(v: string) {
  // yyyy-mm-dd -> yyyy-mm-dd
  return v?.trim() ? v.trim() : null;
}
function validateCPFOrCNPJ(raw: string) {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14;
}
function formatCPFOrCNPJ(raw: string) {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return raw;
}

// Seu baseline usa “normalizeProdutoToSegmento” e “normalizeSegmentLabel”.
// Aqui mantemos comportamento: padroniza para segmentos conhecidos.
const SEGMENTOS = [
  "Automóvel",
  "Motocicletas",
  "Imóvel",
  "Imóvel Estendido",
  "Pesados",
  "Serviços",
] as const;
type Produto = (typeof SEGMENTOS)[number];

function normalizeSegmentLabel(s?: string | null) {
  const k = normKey(s || "");
  if (!k) return "";
  // mapeamentos comuns
  if (k.includes("auto")) return "automovel";
  if (k.includes("moto")) return "motocicletas";
  if (k.includes("imovel est")) return "imovel estendido";
  if (k.includes("imovel")) return "imovel";
  if (k.includes("pesad")) return "pesados";
  if (k.includes("serv")) return "servicos";
  return k;
}
function normalizeProdutoToSegmento(prod?: string | null) {
  const k = normalizeSegmentLabel(prod || "");
  if (!k) return null;
  if (k === "automovel") return "Automóvel";
  if (k === "motocicletas") return "Motocicletas";
  if (k === "imovel") return "Imóvel";
  if (k === "imovel estendido") return "Imóvel Estendido";
  if (k === "pesados") return "Pesados";
  if (k === "servicos") return "Serviços";
  // fallback: tenta capitalizar
  return prod || null;
}

/** ===================== Componente ===================== */
export default function Carteira() {
  const mounted = useRef(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [authUserId, setAuthUserId] = useState<string>("");
  const [authEmail, setAuthEmail] = useState<string>("");

  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<string>(""); // users.id (admin pode "" = Todos)

  const [simAdmins, setSimAdmins] = useState<SimAdmin[]>([]);
  const [simTables, setSimTables] = useState<SimTable[]>([]);

  // vendas
  const [pendentes, setPendentes] = useState<Venda[]>([]);
  const [encarteiradas, setEncarteiradas] = useState<Venda[]>([]);
  const [searchNome, setSearchNome] = useState("");
  const [showCarteira, setShowCarteira] = useState(true);

  // metas
  const now = new Date();
  const [metaAno, setMetaAno] = useState<number>(now.getFullYear());
  const [metaMensal, setMetaMensal] = useState<number[]>(Array(12).fill(0));
  const [realizadoMensal, setRealizadoMensal] = useState<number[]>(Array(12).fill(0));

  // modals
  const [openNovaVenda, setOpenNovaVenda] = useState(false);
  const [openEditarPendente, setOpenEditarPendente] = useState(false);
  const [openVerVenda, setOpenVerVenda] = useState(false);
  const [openEncarteirar, setOpenEncarteirar] = useState(false);

  const [openEditarCota, setOpenEditarCota] = useState(false);
  const [openTransferencia, setOpenTransferencia] = useState(false);

  const [activeVenda, setActiveVenda] = useState<Venda | null>(null);

  /** ===================== Form Nova Venda ===================== */
  type NovaVendaForm = {
    lead_id: string;
    nome: string;
    telefone: string;
    email: string;

    cpf: string;
    data_nascimento: string;

    administradora: string;
    produto: Produto;
    tabela: string;

    forma_venda: string;
    numero_proposta: string;
    valor_venda: string;

    tipo_venda: TipoVenda;
    grupo: string; // obrigatório se Bolsão
    cota: string; // opcional na pendente
    codigo: string; // default "00"
    descricao: string;
  };

  const [form, setForm] = useState<NovaVendaForm>({
    lead_id: "",
    nome: "",
    telefone: "",
    email: "",
    cpf: "",
    data_nascimento: "",
    administradora: "",
    produto: "Automóvel",
    tabela: "",
    forma_venda: "",
    numero_proposta: "",
    valor_venda: "",
    tipo_venda: "Normal",
    grupo: "",
    cota: "",
    codigo: "00",
    descricao: "",
  });

  function resetForm() {
    setForm({
      lead_id: "",
      nome: "",
      telefone: "",
      email: "",
      cpf: "",
      data_nascimento: "",
      administradora: "",
      produto: "Automóvel",
      tabela: "",
      forma_venda: "",
      numero_proposta: "",
      valor_venda: "",
      tipo_venda: "Normal",
      grupo: "",
      cota: "",
      codigo: "00",
      descricao: "",
    });
  }

  /** ===================== RBAC + Boot ===================== */
  useEffect(() => {
    mounted.current = true;
    void boot();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function boot() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || "";
      const uemail = auth?.user?.email || "";

      setAuthUserId(uid);
      setAuthEmail(uemail);

      // users (ativos)
      const { data: us } = await supabase
        .from("users")
        .select("id, auth_user_id, nome, email, role, user_role, is_active")
        .eq("is_active", true);

      const usersArr = ((us ?? []) as AppUser[]).filter(Boolean);
      setUsers(usersArr);

      // determina admin pelo próprio registro
      let myUserRow =
        usersArr.find((u) => (u.auth_user_id || "").trim() === uid) ||
        usersArr.find((u) => (u.email || "").trim().toLowerCase() === uemail.trim().toLowerCase());

      if (!myUserRow && uid) {
        // fallback (compat)
        const { data: me } = await supabase
          .from("users")
          .select("id,nome,email,role,user_role,auth_user_id,is_active")
          .eq("auth_user_id", uid)
          .maybeSingle();
        if (me) myUserRow = me as AppUser;
      }

      const role = (myUserRow?.role || myUserRow?.user_role || "").toLowerCase();
      const adminFlag = role === "admin";
      setIsAdmin(adminFlag);

      // ✅ Problema 1: vendedor precisa ver só o que pertence ao seu auth user id,
      // mas metas são salvas por users.id (padrão). Então:
      // - admin começa em "" (Todos)
      // - vendedor trava no próprio users.id (fallback: uid)
      setSelectedSeller(adminFlag ? "" : (myUserRow?.id ?? uid));

      // carrega tabelas e admins do simulador
      const [{ data: admins }, { data: tables }] = await Promise.all([
        supabase.from("sim_admins").select("id,name,slug").order("name", { ascending: true }),
        supabase.from("sim_tables").select("id,admin_id,nome_tabela,segmento").order("nome_tabela", { ascending: true }),
      ]);

      setSimAdmins((admins ?? []) as SimAdmin[]);
      setSimTables((tables ?? []) as SimTable[]);

      await reloadAll({
        sellerId: adminFlag ? "" : (myUserRow?.id ?? uid),
        year: now.getFullYear(),
        usersArr,
        adminFlag,
        uid,
      });
    } catch (e) {
      console.error("boot error", e);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  /** ===================== Helpers de filtro vendedor ===================== */
  const usersById = useMemo(() => {
    const m = new Map<string, AppUser>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  function getAuthIdByUserId(userId_: string) {
    const u = usersById.get(userId_);
    return (u?.auth_user_id || "").trim();
  }

  function effectiveSellerForRBAC(sellerId: string) {
    // vendedor sempre fica preso no selectedSeller (users.id) ou no authUserId (fallback)
    if (!isAdmin) return selectedSeller || authUserId;
    return sellerId;
  }

  function authIdToFilterForVendas(sellerId: string) {
    // vendas.vendedor_id é auth_user_id (padrão)
    const eff = effectiveSellerForRBAC(sellerId);
    if (!eff) return "";
    const byUserId = getAuthIdByUserId(eff);
    // se eff já for auth_user_id (fallback), fica ele mesmo
    return (byUserId || eff).trim();
  }

  /** ===================== Carregamento principal ===================== */
  async function reloadAll(opts?: {
    sellerId?: string;
    year?: number;
    usersArr?: AppUser[];
    adminFlag?: boolean;
    uid?: string;
  }) {
    const sellerId = opts?.sellerId ?? selectedSeller;
    const year = opts?.year ?? metaAno;

    setRefreshing(true);
    try {
      await Promise.all([loadVendas(sellerId), loadMetasAndRealizado(sellerId, year)]);
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!loading) void reloadAll({ sellerId: selectedSeller, year: metaAno });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeller, metaAno]);

  /** ===================== Problema 1: Metas + realizado com compat ===================== */
  async function loadMetasAndRealizado(sellerId: string, year: number) {
    const effectiveSellerId = effectiveSellerForRBAC(sellerId);
    const authIdToFilter = authIdToFilterForVendas(sellerId);

    // ===== Metas (metas_vendedores) =====
    if (effectiveSellerId) {
      // 1) tenta por users.id (padrão atual)
      let { data: metasRow } = await supabase
        .from("metas_vendedores")
        .select("m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
        .eq("vendedor_id", effectiveSellerId)
        .eq("ano", year)
        .maybeSingle();

      // 2) fallback por auth_user_id (compat com metas antigas salvas errado)
      if (!metasRow) {
        const authFallback = isAdmin ? getAuthIdByUserId(effectiveSellerId) : authUserId;
        if (authFallback && authFallback !== effectiveSellerId) {
          const { data: metasRow2 } = await supabase
            .from("metas_vendedores")
            .select("m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
            .eq("vendedor_id", authFallback)
            .eq("ano", year)
            .maybeSingle();
          metasRow = metasRow2 as any;
        }
      }

      const r = (metasRow || {}) as MetaRow;
      const m = [
        r.m01, r.m02, r.m03, r.m04,
        r.m05, r.m06, r.m07, r.m08,
        r.m09, r.m10, r.m11, r.m12,
      ].map((x: any) => Number(x || 0));

      setMetaMensal(m);
    } else {
      // Admin em "Todos": soma metas do ano inteiro
      const { data: metasAll } = await supabase
        .from("metas_vendedores")
        .select("m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
        .eq("ano", year);

      const sum = Array(12).fill(0);
      (metasAll ?? []).forEach((row: any) => {
        const arr = [
          row.m01, row.m02, row.m03, row.m04,
          row.m05, row.m06, row.m07, row.m08,
          row.m09, row.m10, row.m11, row.m12,
        ].map((x: any) => Number(x || 0));
        for (let i = 0; i < 12; i++) sum[i] += arr[i];
      });

      setMetaMensal(sum);
    }

    // ===== Realizado (encarteiradas ativas - canceladas) =====
    const ativasBase = supabase
      .from("vendas")
      .select("valor_venda, encarteirada_em, vendedor_id, codigo, status")
      .eq("status", "encarteirada")
      .eq("codigo", "00")
      .gte("encarteirada_em", `${year}-01-01`)
      .lte("encarteirada_em", `${year}-12-31T23:59:59`);

    const cancBase = supabase
      .from("vendas")
      .select("valor_venda, cancelada_em, vendedor_id, codigo, status")
      .eq("status", "encarteirada")
      .neq("codigo", "00")
      .gte("cancelada_em", `${year}-01-01`)
      .lte("cancelada_em", `${year}-12-31T23:59:59`);

    const applySellerFilter = (q: any) => {
      if (!authIdToFilter) return q;
      // compat: alguns ambientes podem ter vendedor_id guardando users.id (legado)
      if (isAdmin && effectiveSellerId && authIdToFilter !== effectiveSellerId) {
        return q.or(`vendedor_id.eq.${authIdToFilter},vendedor_id.eq.${effectiveSellerId}`);
      }
      return q.eq("vendedor_id", authIdToFilter);
    };

    const [{ data: vendasAtivas }, { data: vendasCanc }] = await Promise.all([
      applySellerFilter(ativasBase),
      applySellerFilter(cancBase),
    ]);

    const vendido = Array(12).fill(0);
    (vendasAtivas ?? []).forEach((v: any) => {
      const d = v.encarteirada_em ? new Date(v.encarteirada_em) : null;
      if (!d || Number.isNaN(d.getTime())) return;
      vendido[d.getMonth()] += Number(v.valor_venda || 0);
    });

    const cancelado = Array(12).fill(0);
    (vendasCanc ?? []).forEach((v: any) => {
      const d = v.cancelada_em ? new Date(v.cancelada_em) : null;
      if (!d || Number.isNaN(d.getTime())) return;
      cancelado[d.getMonth()] += Number(v.valor_venda || 0);
    });

    setRealizadoMensal(vendido.map((v: number, i: number) => v - cancelado[i]));
  }

  /** ===================== Load vendas (pendentes + encarteiradas) ===================== */
  async function loadVendas(sellerId: string) {
    const authFilter = authIdToFilterForVendas(sellerId);
    const effSellerId = effectiveSellerForRBAC(sellerId);

    const applySeller = (q: any) => {
      if (!authFilter) return q;
      if (isAdmin && effSellerId && authFilter !== effSellerId) {
        // compat OR
        return q.or(`vendedor_id.eq.${authFilter},vendedor_id.eq.${effSellerId}`);
      }
      return q.eq("vendedor_id", authFilter);
    };

    // pendentes
    let q1 = supabase
      .from("vendas")
      .select(
        "id,data_venda,vendedor_id,produto,segmento,tabela,administradora,forma_venda,numero_proposta,lead_id,cliente_lead_id,valor_venda,status,descricao,telefone,email,nome,cpf,nascimento,tipo_venda,grupo,cota,codigo,encarteirada_em,cancelada_em,contemplada,data_contemplacao,contemplacao_tipo,contemplacao_pct,inad,inad_em,inad_revertida_em,reativada_em"
      )
      .eq("status", "nova")
      .order("created_at", { ascending: false })
      .limit(400);

    q1 = applySeller(q1);
    const { data: pend } = await q1;
    setPendentes((pend ?? []) as Venda[]);

    // encarteiradas (carteira)
    let q2 = supabase
      .from("vendas")
      .select(
        "id,data_venda,vendedor_id,produto,segmento,tabela,administradora,forma_venda,numero_proposta,lead_id,cliente_lead_id,valor_venda,status,descricao,telefone,email,nome,cpf,nascimento,tipo_venda,grupo,cota,codigo,encarteirada_em,cancelada_em,contemplada,data_contemplacao,contemplacao_tipo,contemplacao_pct,inad,inad_em,inad_revertida_em,reativada_em"
      )
      .eq("status", "encarteirada")
      .order("encarteirada_em", { ascending: false })
      .limit(1000);

    q2 = applySeller(q2);
    const { data: enc } = await q2;
    setEncarteiradas((enc ?? []) as Venda[]);
  }

  /** ===================== KPIs / filtros ===================== */
  const encarteiradasFiltradas = useMemo(() => {
    const k = normKey(searchNome);
    if (!k) return encarteiradas;
    return encarteiradas.filter((v) => normKey(v.nome || "").includes(k));
  }, [encarteiradas, searchNome]);

  const pendentesFiltradas = useMemo(() => {
    const k = normKey(searchNome);
    if (!k) return pendentes;
    return pendentes.filter((v) => normKey(v.nome || "").includes(k));
  }, [pendentes, searchNome]);

  const kpis = useMemo(() => {
    const base = encarteiradasFiltradas;

    const ativas = base.filter((v) => (v.codigo || "00") === "00");
    const canceladas = base.filter((v) => (v.codigo || "00") !== "00");
    const contempladas = base.filter((v) => !!v.contemplada);
    const inadimplentes = base.filter((v) => !!v.inad);

    const carteiraAtiva = ativas.reduce((sum, v) => sum + Number(v.valor_venda || 0), 0);

    return {
      total: base.length,
      ativas: ativas.length,
      canceladas: canceladas.length,
      contempladas: contempladas.length,
      inadimplentes: inadimplentes.length,
      carteiraAtiva,
    };
  }, [encarteiradasFiltradas]);

  /** ===================== Charts ===================== */
  const anualMeta = useMemo(() => metaMensal.reduce((a, b) => a + Number(b || 0), 0), [metaMensal]);
  const anualRealizado = useMemo(
    () => realizadoMensal.reduce((a, b) => a + Number(b || 0), 0),
    [realizadoMensal]
  );
  const pctAnual = useMemo(() => {
    if (!anualMeta) return 0;
    return Math.max(0, Math.min(1, anualRealizado / anualMeta));
  }, [anualMeta, anualRealizado]);

  const donutData = useMemo(() => {
    const realizado = Math.max(0, anualRealizado);
    const falta = Math.max(0, anualMeta - realizado);
    return [
      { name: "Realizado", value: realizado },
      { name: "Falta", value: falta },
    ];
  }, [anualMeta, anualRealizado]);

  const lineData = useMemo(() => {
    const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return labels.map((m, i) => ({
      mes: m,
      meta: Number(metaMensal[i] || 0),
      realizado: Number(realizadoMensal[i] || 0),
    }));
  }, [metaMensal, realizadoMensal]);

  /** ===================== Problema 2: opções dependentes e dedupe ===================== */
  const adminOptions = useMemo(() => simAdmins.map((a) => a.name), [simAdmins]);

  // Produto/segmento permitido pela administradora selecionada
  const produtoOptions = useMemo(() => {
    const admName = (form.administradora || "").trim();
    const admId = simAdmins.find((a) => a.name === admName)?.id;
    if (!admId) return [] as Produto[];

    const segs = new Set<string>();
    simTables
      .filter((t) => t.admin_id === admId)
      .forEach((t) => {
        const seg = normalizeProdutoToSegmento(t.segmento) || t.segmento;
        if (seg) segs.add(seg);
      });

    // converte para lista de Produto conhecida (mantém só os que casam)
    const out: Produto[] = [];
    SEGMENTOS.forEach((s) => {
      if (segs.has(s)) out.push(s);
    });

    // se admin tiver um segmento que não está na lista, não quebra — ignora
    return out;
  }, [form.administradora, simAdmins, simTables]);

  // ✅ tabelas filtradas por Admin + Segmento e DEDUPE por nome
  const tabelaOptions = useMemo(() => {
    const admName = (form.administradora || "").trim();
    const admId = simAdmins.find((a) => a.name === admName)?.id;

    const prod = form.produto as Produto;
    const segFromProduto = normalizeProdutoToSegmento(prod) ?? prod;
    const prodNorm = normalizeSegmentLabel(segFromProduto);

    const filtered = simTables.filter((t) => {
      if (admId && t.admin_id !== admId) return false;
      if (!prodNorm) return true;
      const segNorm = normalizeSegmentLabel(t.segmento);
      return segNorm === prodNorm;
    });

    // ✅ DEDUPE: nome_tabela case/acento-insensível
    const seen = new Set<string>();
    const unique = filtered.filter((t) => {
      const key = normalizeSegmentLabel(t.nome_tabela);
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) =>
      (a.nome_tabela || "").localeCompare(b.nome_tabela || "", "pt-BR", { sensitivity: "base" })
    );

    return unique;
  }, [form.produto, form.administradora, simTables, simAdmins]);

  // Quando muda admin, reset produto/tabela se não existir
  useEffect(() => {
    if (!form.administradora) {
      if (form.tabela) setForm((p) => ({ ...p, tabela: "" }));
      return;
    }

    // garante produto válido dentro da admin
    if (produtoOptions.length > 0 && !produtoOptions.includes(form.produto)) {
      setForm((p) => ({ ...p, produto: produtoOptions[0], tabela: "" }));
      return;
    }

    // reseta tabela se não for válida
    if (form.tabela) {
      const ok = tabelaOptions.some((t) => t.nome_tabela === form.tabela);
      if (!ok) setForm((p) => ({ ...p, tabela: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.administradora, produtoOptions.length]);

  useEffect(() => {
    // ao mudar produto, valida tabela
    if (form.tabela) {
      const ok = tabelaOptions.some((t) => t.nome_tabela === form.tabela);
      if (!ok) setForm((p) => ({ ...p, tabela: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.produto]);

  /** ===================== Ações ===================== */
  async function onClickRefresh() {
    await reloadAll({ sellerId: selectedSeller, year: metaAno });
  }

  function openVer(v: Venda) {
    setActiveVenda(v);
    setOpenVerVenda(true);
  }

  function openEditPendente(v: Venda) {
    setActiveVenda(v);
    setOpenEditarPendente(true);
  }

  function openEncarteirarModal(v: Venda) {
    setActiveVenda(v);
    setOpenEncarteirar(true);
  }

  function openEditarCotaModal(v: Venda) {
    setActiveVenda(v);
    setOpenEditarCota(true);
  }

  function openTransferenciaModal(v: Venda) {
    setActiveVenda(v);
    setOpenTransferencia(true);
  }

  async function salvarNovaVenda() {
    // validações
    if (!form.nome.trim()) return alert("Informe o nome do cliente.");
    if (form.cpf && !validateCPFOrCNPJ(form.cpf)) return alert("CPF/CNPJ inválido.");
    if (!form.administradora) return alert("Selecione a Administradora.");
    if (!form.produto) return alert("Selecione o Produto/Segmento.");
    if (!form.tabela) return alert("Selecione a Tabela.");
    if (form.tipo_venda === "Bolsão" && !form.grupo.trim()) return alert("Bolsão exige Grupo.");

    const valor = Number(String(form.valor_venda || "").replace(/\./g, "").replace(",", ".") || 0);
    if (!valor || valor <= 0) return alert("Informe um valor de venda válido.");

    const vendedor_id = authIdToFilterForVendas(selectedSeller); // sempre auth_user_id

    const payload: any = {
      status: "nova",
      data_venda: isoFromDateInput(form.data_nascimento) ? undefined : undefined, // não força
      vendedor_id,
      nome: form.nome.trim(),
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      cpf: form.cpf ? formatCPFOrCNPJ(form.cpf) : null,
      nascimento: isoFromDateInput(form.data_nascimento),
      administradora: form.administradora,
      produto: form.produto,
      segmento: normalizeProdutoToSegmento(form.produto) || form.produto,
      tabela: form.tabela,
      forma_venda: form.forma_venda.trim() || null,
      numero_proposta: form.numero_proposta.trim() || null,
      valor_venda: valor,
      tipo_venda: form.tipo_venda,
      grupo: form.grupo.trim() || null,
      cota: form.cota.trim() || null,
      codigo: (form.codigo || "00").trim() || "00",
      descricao: form.descricao.trim() || null,
      lead_id: form.lead_id || null,
    };

    const { error } = await supabase.from("vendas").insert(payload);
    if (error) {
      console.error(error);
      alert("Erro ao salvar a venda.");
      return;
    }

    setOpenNovaVenda(false);
    resetForm();
    await reloadAll({ sellerId: selectedSeller, year: metaAno });
  }

  /** ===================== Encarteirar (admin) ===================== */
  const [encGrupo, setEncGrupo] = useState("");
  const [encCota, setEncCota] = useState("");
  const [encCodigo, setEncCodigo] = useState("00");

  useEffect(() => {
    if (openEncarteirar && activeVenda) {
      setEncGrupo(activeVenda.grupo || "");
      setEncCota(activeVenda.cota || "");
      setEncCodigo(activeVenda.codigo || "00");
    }
  }, [openEncarteirar, activeVenda]);

  async function confirmarEncarteirar() {
    if (!activeVenda) return;
    if (!isAdmin) return;

    if (!encGrupo.trim()) return alert("Informe o Grupo.");
    if (!encCota.trim()) return alert("Informe a Cota.");
    if (!encCodigo.trim()) return alert("Informe o Código.");

    const patch: any = {
      status: "encarteirada",
      grupo: encGrupo.trim(),
      cota: encCota.trim(),
      codigo: encCodigo.trim(),
      encarteirada_em: new Date().toISOString(),
      segmento: normalizeProdutoToSegmento(activeVenda.produto || activeVenda.segmento || "") || activeVenda.segmento,
    };

    const { error } = await supabase.from("vendas").update(patch).eq("id", activeVenda.id);
    if (error) {
      console.error(error);
      alert("Erro ao encarteirar.");
      return;
    }

    setOpenEncarteirar(false);
    await reloadAll({ sellerId: selectedSeller, year: metaAno });
  }

  /** ===================== Editor de Cota (admin) ===================== */
  type EditMode = "alterar_codigo" | "contemplacao" | "inadimplencia" | "transferencia";
  const [editMode, setEditMode] = useState<EditMode>("alterar_codigo");

  // alterar código/cota/grupo
  const [edGrupo, setEdGrupo] = useState("");
  const [edCota, setEdCota] = useState("");
  const [edCodigo, setEdCodigo] = useState("00");
  const [edCanceladaEm, setEdCanceladaEm] = useState("");
  const [edReativadaEm, setEdReativadaEm] = useState("");

  // contemplação
  const [edContemplada, setEdContemplada] = useState(false);
  const [edDataCont, setEdDataCont] = useState("");
  const [edTipoCont, setEdTipoCont] = useState<ContemplacaoTipo>("Lance Livre");
  const [edPctCont, setEdPctCont] = useState("0,0000");

  // inad
  const [edInad, setEdInad] = useState(false);
  const [edInadEm, setEdInadEm] = useState("");
  const [edInadRevEm, setEdInadRevEm] = useState("");

  useEffect(() => {
    if (openEditarCota && activeVenda) {
      setEditMode("alterar_codigo");

      setEdGrupo(activeVenda.grupo || "");
      setEdCota(activeVenda.cota || "");
      setEdCodigo(activeVenda.codigo || "00");
      setEdCanceladaEm(activeVenda.cancelada_em ? activeVenda.cancelada_em.slice(0, 10) : "");
      setEdReativadaEm(activeVenda.reativada_em ? activeVenda.reativada_em.slice(0, 10) : "");

      setEdContemplada(!!activeVenda.contemplada);
      setEdDataCont(activeVenda.data_contemplacao || "");
      setEdTipoCont((activeVenda.contemplacao_tipo as any) || "Lance Livre");
      setEdPctCont(
        activeVenda.contemplacao_pct != null
          ? String(activeVenda.contemplacao_pct).replace(".", ",")
          : "0,0000"
      );

      setEdInad(!!activeVenda.inad);
      setEdInadEm(activeVenda.inad_em ? activeVenda.inad_em.slice(0, 10) : "");
      setEdInadRevEm(activeVenda.inad_revertida_em ? activeVenda.inad_revertida_em.slice(0, 10) : "");
    }
  }, [openEditarCota, activeVenda]);

  function parsePct4(s: string) {
    // aceita "41,2542" ou "0,412542" — mantém número como digitado (numeric)
    const n = Number((s || "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  async function salvarEditorCota() {
    if (!activeVenda) return;
    if (!isAdmin) return;

    const patch: any = {};

    if (editMode === "alterar_codigo") {
      if (!edGrupo.trim()) return alert("Grupo é obrigatório.");
      if (!edCota.trim()) return alert("Cota é obrigatória.");
      if (!edCodigo.trim()) return alert("Código é obrigatório.");

      const prev = (activeVenda.codigo || "00").trim();
      const next = edCodigo.trim();

      patch.grupo = edGrupo.trim();
      patch.cota = edCota.trim();
      patch.codigo = next;

      // regra: 00 -> outro exige data cancelamento; outro -> 00 exige reativação
      if (prev === "00" && next !== "00") {
        if (!edCanceladaEm) return alert("Informe a data de cancelamento (00 → outro).");
        patch.cancelada_em = `${edCanceladaEm}T00:00:00.000Z`;
      }
      if (prev !== "00" && next === "00") {
        if (!edReativadaEm) return alert("Informe a data de reativação (outro → 00).");
        patch.reativada_em = `${edReativadaEm}T00:00:00.000Z`;
      }
    }

    if (editMode === "contemplacao") {
      patch.contemplada = edContemplada;
      patch.data_contemplacao = edContemplada ? (edDataCont || null) : null;
      patch.contemplacao_tipo = edContemplada ? edTipoCont : null;
      patch.contemplacao_pct = edContemplada ? parsePct4(edPctCont) : null;
    }

    if (editMode === "inadimplencia") {
      patch.inad = edInad;
      if (edInad) {
        if (!edInadEm) return alert("Informe a data da inadimplência.");
        patch.inad_em = `${edInadEm}T00:00:00.000Z`;
      } else {
        if (!edInadRevEm) return alert("Informe a data da reversão da inadimplência.");
        patch.inad_revertida_em = `${edInadRevEm}T00:00:00.000Z`;
      }
    }

    const { error } = await supabase.from("vendas").update(patch).eq("id", activeVenda.id);
    if (error) {
      console.error(error);
      alert("Erro ao salvar edição.");
      return;
    }

    setOpenEditarCota(false);
    await reloadAll({ sellerId: selectedSeller, year: metaAno });
  }

  /** ===================== Transferência (admin) ===================== */
  const [trNome, setTrNome] = useState("");
  const [trCPF, setTrCPF] = useState("");
  const [trNasc, setTrNasc] = useState("");

  useEffect(() => {
    if (openTransferencia && activeVenda) {
      setTrNome(activeVenda.nome || "");
      setTrCPF(activeVenda.cpf || "");
      setTrNasc(activeVenda.nascimento || "");
    }
  }, [openTransferencia, activeVenda]);

  async function salvarTransferencia() {
    if (!activeVenda) return;
    if (!isAdmin) return;

    if (!trNome.trim()) return alert("Informe o nome do novo titular.");
    if (trCPF && !validateCPFOrCNPJ(trCPF)) return alert("CPF/CNPJ inválido.");
    if (!trNasc) return alert("Informe a data de nascimento.");

    const patch: any = {
      nome: trNome.trim(),
      cpf: trCPF ? formatCPFOrCNPJ(trCPF) : null,
      nascimento: trNasc || null,
      // aqui você pode também ajustar lead_id/cliente_lead_id se sua regra exigir
    };

    const { error } = await supabase.from("vendas").update(patch).eq("id", activeVenda.id);
    if (error) {
      console.error(error);
      alert("Erro ao transferir.");
      return;
    }

    setOpenTransferencia(false);
    await reloadAll({ sellerId: selectedSeller, year: metaAno });
  }

  /** ===================== UI ===================== */
  const sellerOptions = useMemo(() => {
    const active = users.filter((u) => u.is_active !== false);
    active.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR", { sensitivity: "base" }));
    return active;
  }, [users]);

  const selectedSellerName = useMemo(() => {
    if (!selectedSeller) return "Todos";
    const u = usersById.get(selectedSeller);
    return u?.nome || "—";
  }, [selectedSeller, usersById]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-2xl font-semibold">Carteira</div>
          <div className="text-sm text-muted-foreground">
            Gestão de vendas pendentes e encarteiradas • Metas e realizado
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <div className="min-w-[220px]">
              <Label className="text-xs">Vendedor</Label>
              <Select value={selectedSeller} onValueChange={(v) => setSelectedSeller(v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  {sellerOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome || u.email || u.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="min-w-[140px]">
            <Label className="text-xs">Ano</Label>
            <Select value={String(metaAno)} onValueChange={(v) => setMetaAno(Number(v))}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 6 }).map((_, i) => {
                  const y = now.getFullYear() - 2 + i;
                  return (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <Button variant="secondary" className="h-9" onClick={() => setOpenNovaVenda(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova venda
          </Button>

          <Button variant="outline" className="h-9" onClick={onClickRefresh} disabled={refreshing || loading}>
            <RefreshCw className={refreshing ? "h-4 w-4 mr-2 animate-spin" : "h-4 w-4 mr-2"} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Carteira ativa</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-xl font-semibold">{currency(kpis.carteiraAtiva)}</div>
            <div className="text-xs text-muted-foreground">Somatório (código 00)</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Ativas</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-xl font-semibold">{kpis.ativas}</div>
            <div className="text-xs text-muted-foreground">Cotas ativas (00)</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Canceladas</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-xl font-semibold">{kpis.canceladas}</div>
            <div className="text-xs text-muted-foreground">Código ≠ 00</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Contempladas</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-xl font-semibold">{kpis.contempladas}</div>
            <div className="text-xs text-muted-foreground">Flag contemplada</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Inadimplentes</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-xl font-semibold">{kpis.inadimplentes}</div>
            <div className="text-xs text-muted-foreground">Flag inad</div>
          </CardContent>
        </Card>
      </div>

      {/* Metas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">
              Meta anual x Realizado anual{" "}
              <span className="text-muted-foreground">• {isAdmin ? selectedSellerName : "Meu painel"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" />
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between mt-2">
              <div className="text-sm">
                <div className="text-muted-foreground">Meta (ano)</div>
                <div className="font-semibold">{currency(anualMeta)}</div>
              </div>
              <div className="text-sm text-right">
                <div className="text-muted-foreground">Realizado (ano)</div>
                <div className="font-semibold">{currency(anualRealizado)}</div>
              </div>
              <div className="text-sm text-right">
                <div className="text-muted-foreground">% atingido</div>
                <div className="font-semibold">{(pctAnual * 100).toFixed(2).replace(".", ",")}%</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Meta x Realizado por mês</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="meta" />
                  <Line type="monotone" dataKey="realizado" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="min-w-[260px]">
              <Label className="text-xs">Buscar por nome do cliente</Label>
              <Input value={searchNome} onChange={(e) => setSearchNome(e.target.value)} placeholder="Ex.: João..." />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox checked={showCarteira} onCheckedChange={(v) => setShowCarteira(!!v)} />
              <span className="text-sm">Mostrar carteira (encarteiradas)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Listas */}
      <Tabs defaultValue="pendentes" className="w-full">
        <TabsList>
          <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
          <TabsTrigger value="carteira" disabled={!showCarteira}>
            Carteira
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="mt-3">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Vendas pendentes</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando...
                </div>
              ) : pendentesFiltradas.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhuma venda pendente.</div>
              ) : (
                <div className="space-y-2">
                  {pendentesFiltradas.map((v) => (
                    <div key={v.id} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="font-semibold">{v.nome || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {v.administradora || "—"} • {v.produto || v.segmento || "—"} • {v.tabela || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Proposta: {v.numero_proposta || "—"} • Valor:{" "}
                            <span className="font-medium">{currency(v.valor_venda)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => openVer(v)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => openEditPendente(v)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </Button>
                          {isAdmin && (
                            <Button size="sm" onClick={() => openEncarteirarModal(v)}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Encarteirar
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="carteira" className="mt-3">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Carteira (encarteiradas)</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {!showCarteira ? (
                <div className="text-sm text-muted-foreground">Carteira oculta.</div>
              ) : encarteiradasFiltradas.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhuma venda encarteirada.</div>
              ) : (
                <div className="space-y-2">
                  {encarteiradasFiltradas.map((v) => (
                    <div key={v.id} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-semibold">{v.nome || "—"}</div>
                            {(v.codigo || "00") === "00" ? (
                              <Badge variant="secondary">Ativa</Badge>
                            ) : (
                              <Badge variant="destructive">Cancelada</Badge>
                            )}
                            {v.contemplada ? <Badge>Contemplada</Badge> : null}
                            {v.inad ? <Badge variant="outline">Inad</Badge> : null}
                          </div>

                          <div className="text-xs text-muted-foreground">
                            {v.administradora || "—"} • {v.produto || v.segmento || "—"} • {v.tabela || "—"}
                          </div>

                          <div className="text-xs text-muted-foreground">
                            Grupo/Cota: {v.grupo || "—"} / {v.cota || "—"} • Código: {v.codigo || "—"}
                          </div>

                          <div className="text-xs text-muted-foreground">
                            Encarteirada em: {formatDateTimeBR(v.encarteirada_em)} • Valor:{" "}
                            <span className="font-medium">{currency(v.valor_venda)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => openVer(v)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver
                          </Button>

                          {isAdmin && (
                            <>
                              <Button variant="secondary" size="sm" onClick={() => openEditarCotaModal(v)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Editar
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => openTransferenciaModal(v)}>
                                <ArrowRightLeft className="h-4 w-4 mr-2" />
                                Transferir
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===================== MODALS ===================== */}

      {/* Nova venda */}
      <Dialog open={openNovaVenda} onOpenChange={(v) => setOpenNovaVenda(v)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nova venda</DialogTitle>
            <DialogDescription>
              Ordem: <b>Administradora → Produto/Segmento → Tabela</b>. (Sem duplicar tabelas iguais)
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={form.telefone}
                onChange={(e) => setForm((p) => ({ ...p, telefone: e.target.value }))}
                placeholder="(xx) xxxxx-xxxx"
              />
            </div>

            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>CPF/CNPJ</Label>
              <Input value={form.cpf} onChange={(e) => setForm((p) => ({ ...p, cpf: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Nascimento</Label>
              <Input
                type="date"
                value={form.data_nascimento}
                onChange={(e) => setForm((p) => ({ ...p, data_nascimento: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Administradora</Label>
              <Select
                value={form.administradora}
                onValueChange={(v) => setForm((p) => ({ ...p, administradora: v, tabela: "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {adminOptions.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Produto / Segmento</Label>
              <Select
                value={form.produto}
                onValueChange={(v) => setForm((p) => ({ ...p, produto: v as Produto, tabela: "" }))}
                disabled={!form.administradora || produtoOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!form.administradora ? "Selecione a administradora primeiro" : "Selecione..."} />
                </SelectTrigger>
                <SelectContent>
                  {produtoOptions.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!form.administradora ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Selecione a administradora para liberar os segmentos disponíveis.
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Tabela</Label>
              <Select
                value={form.tabela}
                onValueChange={(v) => setForm((p) => ({ ...p, tabela: v }))}
                disabled={!form.administradora || !form.produto}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
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
                {tabelaOptions.length > 0 ? "Tabelas deduplicadas por nome." : "Nenhuma tabela encontrada para esse filtro."}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Forma de venda</Label>
              <Input value={form.forma_venda} onChange={(e) => setForm((p) => ({ ...p, forma_venda: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Número da proposta</Label>
              <Input
                value={form.numero_proposta}
                onChange={(e) => setForm((p) => ({ ...p, numero_proposta: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Valor de venda</Label>
              <Input
                value={form.valor_venda}
                onChange={(e) => setForm((p) => ({ ...p, valor_venda: e.target.value }))}
                placeholder="Ex.: 150000"
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de venda</Label>
              <Select
                value={form.tipo_venda}
                onValueChange={(v) => setForm((p) => ({ ...p, tipo_venda: v as TipoVenda }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="Contemplada">Contemplada</SelectItem>
                  <SelectItem value="Bolsão">Bolsão</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Grupo (obrigatório se Bolsão)</Label>
              <Input value={form.grupo} onChange={(e) => setForm((p) => ({ ...p, grupo: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Cota (opcional na pendente)</Label>
              <Input value={form.cota} onChange={(e) => setForm((p) => ({ ...p, cota: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Código</Label>
              <Input value={form.codigo} onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Descrição</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Observações..."
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpenNovaVenda(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarNovaVenda}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Encarteirar */}
      <Dialog open={openEncarteirar} onOpenChange={(v) => setOpenEncarteirar(v)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Encarteirar venda</DialogTitle>
            <DialogDescription>Admin: informe Grupo/Cota/Código para encarteirar.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm">
              <div className="font-semibold">{activeVenda?.nome || "—"}</div>
              <div className="text-muted-foreground">
                {activeVenda?.administradora || "—"} • {activeVenda?.produto || activeVenda?.segmento || "—"} •{" "}
                {activeVenda?.tabela || "—"}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Grupo</Label>
                <Input value={encGrupo} onChange={(e) => setEncGrupo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Cota</Label>
                <Input value={encCota} onChange={(e) => setEncCota(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Código</Label>
                <Input value={encCodigo} onChange={(e) => setEncCodigo(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpenEncarteirar(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarEncarteirar}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ver venda */}
      <Dialog open={openVerVenda} onOpenChange={(v) => setOpenVerVenda(v)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da venda</DialogTitle>
          </DialogHeader>

          {activeVenda ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold text-lg">{activeVenda.nome || "—"}</div>
                  <div className="text-sm text-muted-foreground">
                    {activeVenda.administradora || "—"} • {activeVenda.produto || activeVenda.segmento || "—"} •{" "}
                    {activeVenda.tabela || "—"}
                  </div>
                </div>
                <div className="text-sm">
                  <div className="text-muted-foreground">Valor</div>
                  <div className="font-semibold">{currency(activeVenda.valor_venda)}</div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground">Telefone</div>
                  <div>{activeVenda.telefone || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">E-mail</div>
                  <div>{activeVenda.email || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">CPF</div>
                  <div>{activeVenda.cpf || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Nascimento</div>
                  <div>{activeVenda.nascimento ? formatDateBR(activeVenda.nascimento) : "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Proposta</div>
                  <div>{activeVenda.numero_proposta || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <div>{activeVenda.status || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Encarteirada em</div>
                  <div>{formatDateTimeBR(activeVenda.encarteirada_em)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Cancelada em</div>
                  <div>{formatDateTimeBR(activeVenda.cancelada_em)}</div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground">Grupo / Cota</div>
                  <div>
                    {activeVenda.grupo || "—"} / {activeVenda.cota || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Código</div>
                  <div>{activeVenda.codigo || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Contemplada</div>
                  <div>
                    {activeVenda.contemplada ? "Sim" : "Não"}{" "}
                    {activeVenda.contemplada ? `• ${formatDateBR(activeVenda.data_contemplacao)}` : ""}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Tipo / %</div>
                  <div>
                    {activeVenda.contemplacao_tipo || "—"} •{" "}
                    {activeVenda.contemplacao_pct != null ? String(activeVenda.contemplacao_pct).replace(".", ",") : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Inadimplência</div>
                  <div>
                    {activeVenda.inad ? "Sim" : "Não"}{" "}
                    {activeVenda.inad ? `• ${formatDateTimeBR(activeVenda.inad_em)}` : ""}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Reversão inad</div>
                  <div>{formatDateTimeBR(activeVenda.inad_revertida_em)}</div>
                </div>
              </div>

              {activeVenda.descricao ? (
                <>
                  <Separator />
                  <div className="text-sm">
                    <div className="text-muted-foreground">Descrição</div>
                    <div>{activeVenda.descricao}</div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpenVerVenda(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editor de cota (admin) */}
      <Dialog open={openEditarCota} onOpenChange={(v) => setOpenEditarCota(v)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar cota</DialogTitle>
            <DialogDescription>Admin: escolha o tipo de edição.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <div className="font-semibold">{activeVenda?.nome || "—"}</div>
                <div className="text-muted-foreground">
                  {activeVenda?.administradora || "—"} • {activeVenda?.produto || activeVenda?.segmento || "—"} •{" "}
                  {activeVenda?.tabela || "—"}
                </div>
              </div>

              <Select value={editMode} onValueChange={(v) => setEditMode(v as EditMode)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Modo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alterar_codigo">Alterar grupo/cota/código</SelectItem>
                  <SelectItem value="contemplacao">Contemplação</SelectItem>
                  <SelectItem value="inadimplencia">Inadimplência</SelectItem>
                  <SelectItem value="transferencia">Ir para Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {editMode === "alterar_codigo" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Grupo</Label>
                    <Input value={edGrupo} onChange={(e) => setEdGrupo(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cota</Label>
                    <Input value={edCota} onChange={(e) => setEdCota(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Código</Label>
                    <Input value={edCodigo} onChange={(e) => setEdCodigo(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Data cancelamento (se 00 → outro)</Label>
                    <Input type="date" value={edCanceladaEm} onChange={(e) => setEdCanceladaEm(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data reativação (se outro → 00)</Label>
                    <Input type="date" value={edReativadaEm} onChange={(e) => setEdReativadaEm(e.target.value)} />
                  </div>
                </div>
              </div>
            ) : null}

            {editMode === "contemplacao" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox checked={edContemplada} onCheckedChange={(v) => setEdContemplada(!!v)} />
                  <span className="text-sm">Marcar como contemplada</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Data contemplação</Label>
                    <Input
                      type="date"
                      value={edDataCont}
                      onChange={(e) => setEdDataCont(e.target.value)}
                      disabled={!edContemplada}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      value={edTipoCont}
                      onValueChange={(v) => setEdTipoCont(v as ContemplacaoTipo)}
                      disabled={!edContemplada}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Lance Livre">Lance Livre</SelectItem>
                        <SelectItem value="Primeiro Lance Fixo">Primeiro Lance Fixo</SelectItem>
                        <SelectItem value="Segundo Lance Fixo">Segundo Lance Fixo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>% (4 casas) Ex.: 41,2542</Label>
                    <Input value={edPctCont} onChange={(e) => setEdPctCont(e.target.value)} disabled={!edContemplada} />
                  </div>
                </div>
              </div>
            ) : null}

            {editMode === "inadimplencia" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox checked={edInad} onCheckedChange={(v) => setEdInad(!!v)} />
                  <span className="text-sm">Marcar como inadimplente</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Data inad (se marcar)</Label>
                    <Input type="date" value={edInadEm} onChange={(e) => setEdInadEm(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data reversão (se desmarcar)</Label>
                    <Input type="date" value={edInadRevEm} onChange={(e) => setEdInadRevEm(e.target.value)} />
                  </div>
                </div>
              </div>
            ) : null}

            {editMode === "transferencia" ? (
              <div className="rounded-xl border p-3 text-sm flex items-center justify-between">
                <div>
                  <div className="font-semibold">Transferência</div>
                  <div className="text-muted-foreground">Abre o overlay de transferência mantendo os dados.</div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOpenEditarCota(false);
                    setOpenTransferencia(true);
                  }}
                >
                  Abrir
                </Button>
              </div>
            ) : null}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpenEditarCota(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarEditorCota}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transferência */}
      <Dialog open={openTransferencia} onOpenChange={(v) => setOpenTransferencia(v)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Transferência de cota</DialogTitle>
            <DialogDescription>Admin: altera dados do titular.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nome do novo titular</Label>
              <Input value={trNome} onChange={(e) => setTrNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CPF/CNPJ</Label>
              <Input value={trCPF} onChange={(e) => setTrCPF(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nascimento</Label>
              <Input type="date" value={trNasc} onChange={(e) => setTrNasc(e.target.value)} />
            </div>

            <div className="rounded-xl border p-3 text-sm text-muted-foreground">
              Se você quiser amarrar a transferência a um novo <b>lead_id</b>, dá pra estender aqui (eu mantive como
              alteração do titular, igual seu baseline).
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpenTransferencia(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarTransferencia}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar Pendente (mantido simples) */}
      <Dialog open={openEditarPendente} onOpenChange={(v) => setOpenEditarPendente(v)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar venda pendente</DialogTitle>
            <DialogDescription>Edite campos básicos sem encarteirar.</DialogDescription>
          </DialogHeader>

          {activeVenda ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={activeVenda.nome || ""}
                  onChange={(e) => setActiveVenda((p) => (p ? { ...p, nome: e.target.value } : p))}
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={activeVenda.telefone || ""}
                  onChange={(e) => setActiveVenda((p) => (p ? { ...p, telefone: e.target.value } : p))}
                />
              </div>
              <div className="space-y-2">
                <Label>Número da proposta</Label>
                <Input
                  value={activeVenda.numero_proposta || ""}
                  onChange={(e) => setActiveVenda((p) => (p ? { ...p, numero_proposta: e.target.value } : p))}
                />
              </div>
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input
                  value={String(activeVenda.valor_venda ?? "")}
                  onChange={(e) =>
                    setActiveVenda((p) => (p ? { ...p, valor_venda: Number(e.target.value || 0) } : p))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={activeVenda.descricao || ""}
                  onChange={(e) => setActiveVenda((p) => (p ? { ...p, descricao: e.target.value } : p))}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpenEditarPendente(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!activeVenda) return;
                const { error } = await supabase
                  .from("vendas")
                  .update({
                    nome: activeVenda.nome || null,
                    telefone: activeVenda.telefone || null,
                    numero_proposta: activeVenda.numero_proposta || null,
                    valor_venda: activeVenda.valor_venda ?? null,
                    descricao: activeVenda.descricao || null,
                  })
                  .eq("id", activeVenda.id);
                if (error) {
                  console.error(error);
                  alert("Erro ao salvar.");
                  return;
                }
                setOpenEditarPendente(false);
                await reloadAll({ sellerId: selectedSeller, year: metaAno });
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
