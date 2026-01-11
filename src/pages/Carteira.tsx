// src/pages/Carteira.tsx
import React, { useEffect, useMemo, useState } from "react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
} from "recharts";

import { Loader2, Plus, RefreshCw, Pencil, Eye, Save, X } from "lucide-react";

/** ===================== Tipos ===================== */
type Role = "admin" | "vendedor" | "viewer" | string;

type UserRow = {
  id: string; // public.users.id
  auth_user_id: string; // auth.users.id
  nome: string;
  role?: Role | null; // enum (pode existir)
  user_role?: string | null; // legado
  is_active?: boolean | null;
};

type LeadRow = {
  id: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
};

type SimAdminRow = { id: string; name: string; slug?: string | null };
type SimTableRow = {
  id: string;
  admin_id: string;
  segmento: string;
  nome_tabela: string;
};

type Produto =
  | "Automóvel"
  | "Imóvel"
  | "Serviço"
  | "Motocicleta"
  | "Pesados"
  | "Imóvel Estendido"
  | "Consórcio Ouro"
  | string;

type FormaVenda = "Parcela Cheia" | "Reduzida 25%" | "Reduzida 50%" | string;

type VendaRow = {
  id: string;
  lead_id: string;
  cpf?: string | null;
  data_venda?: string | null; // date
  vendedor_id?: string | null; // (na prática costuma ser auth_user_id)
  produto?: Produto | null;
  administradora?: string | null;
  tabela?: string | null;
  forma_venda?: FormaVenda | null;
  numero_proposta?: string | null;

  status?: string | null; // "nova" etc
  codigo?: string | null; // ativo = "00"
  grupo?: string | null;
  cota?: string | null;

  encarteirada_em?: string | null; // timestamptz
  cancelada_em?: string | null; // timestamptz
  reativada_em?: string | null; // timestamptz

  contemplada?: boolean | null;
  data_contemplacao?: string | null; // date

  inad?: boolean | null;
  inad_em?: string | null;
  inad_revertida_em?: string | null;

  valor_venda?: number | null;
  created_at?: string | null;
};

type MetaRow = {
  id: string;
  vendedor_id: string; // users.id
  auth_user_id: string; // auth.users.id
  ano: number;
  m01: number | null;
  m02: number | null;
  m03: number | null;
  m04: number | null;
  m05: number | null;
  m06: number | null;
  m07: number | null;
  m08: number | null;
  m09: number | null;
  m10: number | null;
  m11: number | null;
  m12: number | null;
};

/** ===================== Helpers ===================== */
const BRAND = {
  rubi: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
  muted: "#E5E7EB",
};

function moneyBR(v: number) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pctBR(v: number, decimals = 0) {
  if (!isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + "%";
}
function onlyDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}
function isoDateFromInput(v: string) {
  // input type="date" já vem yyyy-mm-dd
  return v || null;
}
function monthKey(i0: number) {
  // 0..11 -> m01..m12
  return `m${String(i0 + 1).padStart(2, "0")}` as keyof MetaRow;
}
function monthLabel(i0: number) {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return labels[i0] || `M${i0 + 1}`;
}
function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function startOfMonthYMD(year: number, m0: number) {
  return ymd(new Date(year, m0, 1));
}
function endOfMonthYMD(year: number, m0: number) {
  // último dia do mês
  return ymd(new Date(year, m0 + 1, 0));
}
function safeNum(v: any) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return isFinite(n) ? n : 0;
}
function toBRDate(iso?: string | null) {
  if (!iso) return "—";
  // aceita "YYYY-MM-DD" ou timestamptz
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    // fallback para yyyy-mm-dd
    const m = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return iso;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

/** ===================== Mini Donut ===================== */
function MiniDonut({
  title,
  meta,
  realizado,
}: {
  title: string;
  meta: number;
  realizado: number;
}) {
  const pct = meta > 0 ? (realizado / meta) * 100 : NaN;

  const isOver = meta > 0 && realizado > meta;
  const base = Math.max(meta, 0);

  const data = useMemo(() => {
    if (meta <= 0 && realizado <= 0) return [{ name: "vazio", value: 1 }];
    if (meta <= 0 && realizado > 0) return [{ name: "realizado", value: realizado }];

    if (!isOver) {
      return [
        { name: "realizado", value: Math.max(realizado, 0) },
        { name: "restante", value: Math.max(meta - realizado, 0) },
      ];
    }
    // passou da meta: mostra a meta como "realizadoBase" e o excedente como "excedente"
    return [
      { name: "meta", value: base },
      { name: "excedente", value: Math.max(realizado - base, 0) },
    ];
  }, [meta, realizado, isOver, base]);

  const colors = useMemo(() => {
    if (meta <= 0 && realizado <= 0) return [BRAND.muted];
    if (meta <= 0 && realizado > 0) return [BRAND.rubi];
    if (!isOver) return [BRAND.rubi, BRAND.muted];
    return [BRAND.rubi, BRAND.gold];
  }, [meta, realizado, isOver]);

  return (
    <div className="rounded-2xl border bg-white/60 backdrop-blur p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        <Badge variant="secondary" className="bg-slate-900/5 text-slate-700">
          {pctBR(pct, 0)}
        </Badge>
      </div>

      <div className="mt-2 h-[92px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={26}
              outerRadius={40}
              paddingAngle={2}
              stroke="transparent"
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i] || BRAND.muted} />
              ))}
            </Pie>
            <RTooltip
              formatter={(v: any, name: any) => [
                moneyBR(safeNum(v)),
                String(name).toUpperCase(),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-900/5 p-2">
          <div className="text-slate-600">Meta</div>
          <div className="font-semibold text-slate-900">{moneyBR(meta)}</div>
        </div>
        <div className="rounded-xl bg-slate-900/5 p-2">
          <div className="text-slate-600">Realizado</div>
          <div className="font-semibold text-slate-900">{moneyBR(realizado)}</div>
        </div>
      </div>
    </div>
  );
}

/** ===================== Página ===================== */
export default function Carteira() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [me, setMe] = useState<UserRow | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [admins, setAdmins] = useState<SimAdminRow[]>([]);
  const [tables, setTables] = useState<SimTableRow[]>([]);

  // filtros
  const [selectedSeller, setSelectedSeller] = useState<string>("__all__"); // users.id (admin)
  const [ano, setAno] = useState<number>(new Date().getFullYear());

  // dados vendas
  const [vendasPendentes, setVendasPendentes] = useState<VendaRow[]>([]);
  const [vendasCarteira, setVendasCarteira] = useState<VendaRow[]>([]);

  // metas
  const [metasRow, setMetasRow] = useState<MetaRow | null>(null);
  const [metaEditOpen, setMetaEditOpen] = useState(false);
  const [metaDraft, setMetaDraft] = useState<Record<string, string>>({});

  // modais venda
  const [newOpen, setNewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);

  const [editingVenda, setEditingVenda] = useState<VendaRow | null>(null);
  const [viewVenda, setViewVenda] = useState<VendaRow | null>(null);

  const isAdmin = useMemo(() => {
    const r = (me?.role || me?.user_role || "").toString().toLowerCase();
    return r === "admin";
  }, [me]);

  // resolve seller (admin: por filtro; vendedor: travado no auth_user_id)
  const sellerAuthId = useMemo(() => {
    if (!me) return null;
    if (!isAdmin) return me.auth_user_id;

    if (selectedSeller === "__all__") return null;

    const u = users.find((x) => x.id === selectedSeller);
    return u?.auth_user_id || null;
  }, [me, isAdmin, selectedSeller, users]);

  const leadsById = useMemo(() => {
    const m = new Map<string, LeadRow>();
    leads.forEach((l) => m.set(l.id, l));
    return m;
  }, [leads]);

  const usersByAuth = useMemo(() => {
    const m = new Map<string, UserRow>();
    users.forEach((u) => m.set(u.auth_user_id, u));
    return m;
  }, [users]);

  const anoOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  /** ===================== Load ===================== */
  async function loadAll() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const auid = auth?.user?.id || null;
      setAuthUserId(auid);

      // meu profile em public.users
      let myRow: UserRow | null = null;
      if (auid) {
        const { data: meData } = await supabase
          .from("users")
          .select("id,auth_user_id,nome,role,user_role,is_active")
          .eq("auth_user_id", auid)
          .maybeSingle();
        myRow = (meData as any) || null;
      }
      setMe(myRow);

      // users ativos
      const { data: usersData } = await supabase
        .from("users")
        .select("id,auth_user_id,nome,role,user_role,is_active")
        .eq("is_active", true)
        .order("nome", { ascending: true });

      setUsers((usersData as any) || []);

      // leads (simples)
      const { data: leadsData } = await supabase
        .from("leads")
        .select("id,nome,telefone,email")
        .order("nome", { ascending: true });

      setLeads((leadsData as any) || []);

      // sim_admins / sim_tables (para modal Nova Venda)
      const { data: admsData } = await supabase
        .from("sim_admins")
        .select("id,name,slug")
        .order("name", { ascending: true });

      setAdmins((admsData as any) || []);

      const { data: tablesData } = await supabase
        .from("sim_tables")
        .select("id,admin_id,segmento,nome_tabela")
        .order("nome_tabela", { ascending: true });

      setTables((tablesData as any) || []);

      // com dependência de RBAC/filtro:
      await loadVendasAndMetas(myRow, (usersData as any) || []);
    } finally {
      setLoading(false);
    }
  }

  async function loadVendasAndMetas(myRow: UserRow | null, usersList: UserRow[]) {
    // resolve sellerAuthId usando estado atual
    const myIsAdmin = ((myRow?.role || myRow?.user_role || "") + "").toLowerCase() === "admin";
    let filtroAuthId: string | null = null;

    if (!myIsAdmin) {
      filtroAuthId = myRow?.auth_user_id || null;
    } else {
      if (selectedSeller !== "__all__") {
        const u = usersList.find((x) => x.id === selectedSeller);
        filtroAuthId = u?.auth_user_id || null;
      }
    }

    // vendas pendentes (status="nova")
    {
      let q = supabase
        .from("vendas")
        .select(
          "id,lead_id,cpf,data_venda,vendedor_id,produto,administradora,tabela,forma_venda,numero_proposta,status,codigo,grupo,cota,encarteirada_em,cancelada_em,reativada_em,contemplada,data_contemplacao,inad,inad_em,inad_revertida_em,valor_venda,created_at"
        )
        .eq("status", "nova")
        .order("created_at", { ascending: false })
        .limit(500);

      if (filtroAuthId) {
        // robustez: às vezes vendedor_id pode estar como users.id (legado). Mantém OR.
        q = q.or(`vendedor_id.eq.${filtroAuthId}`);
      }

      const { data } = await q;
      setVendasPendentes((data as any) || []);
    }

    // carteira (encarteirada ou contemplada) — traz geral e filtra por métricas no front
    {
      let q = supabase
        .from("vendas")
        .select(
          "id,lead_id,cpf,data_venda,vendedor_id,produto,administradora,tabela,forma_venda,numero_proposta,status,codigo,grupo,cota,encarteirada_em,cancelada_em,reativada_em,contemplada,data_contemplacao,inad,inad_em,inad_revertida_em,valor_venda,created_at"
        )
        .not("encarteirada_em", "is", null)
        .order("encarteirada_em", { ascending: false })
        .limit(2000);

      if (filtroAuthId) q = q.or(`vendedor_id.eq.${filtroAuthId}`);

      const { data } = await q;
      setVendasCarteira((data as any) || []);
    }

    // metas do ano (usar vendedor_id e auth_user_id para evitar erro)
    {
      const year = ano;
      let meta: MetaRow | null = null;

      if (myIsAdmin) {
        if (selectedSeller !== "__all__") {
          const u = usersList.find((x) => x.id === selectedSeller);
          if (u) {
            const { data } = await supabase
              .from("metas_vendedores")
              .select("id,vendedor_id,auth_user_id,ano,m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
              .eq("ano", year)
              .or(`vendedor_id.eq.${u.id},auth_user_id.eq.${u.auth_user_id}`)
              .maybeSingle();
            meta = (data as any) || null;
          } else {
            meta = null;
          }
        } else {
          // "Todos" -> não tem meta única
          meta = null;
        }
      } else if (myRow) {
        const { data } = await supabase
          .from("metas_vendedores")
          .select("id,vendedor_id,auth_user_id,ano,m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
          .eq("ano", year)
          .or(`vendedor_id.eq.${myRow.id},auth_user_id.eq.${myRow.auth_user_id}`)
          .maybeSingle();
        meta = (data as any) || null;
      }

      setMetasRow(meta);

      // draft para edição
      if (meta) {
        const d: Record<string, string> = {};
        for (let i = 0; i < 12; i++) {
          const k = monthKey(i);
          d[k] = String((meta as any)[k] ?? "");
        }
        setMetaDraft(d);
      } else {
        setMetaDraft({});
      }
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recarrega quando filtro vendedor/ano muda
  useEffect(() => {
    if (!me) return;
    (async () => {
      setRefreshing(true);
      try {
        await loadVendasAndMetas(me, users);
      } finally {
        setRefreshing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeller, ano]);

  /** ===================== Metas + Realizado (Ano) ===================== */
  const { realizedByMonth, metaByMonth, netByMonth, realizedAnnual, metaAnnual } = useMemo(() => {
    const rbm = Array.from({ length: 12 }, () => 0);
    const cbm = Array.from({ length: 12 }, () => 0);

    // filtros já chegam pelo backend quando vendedor é travado; quando admin "Todos", vem tudo.
    // regras: realizado = encarteiradas ativas (codigo '00') por encarteirada_em
    // net = realizado - canceladas (codigo != '00') por cancelada_em
    vendasCarteira.forEach((v) => {
      const val = safeNum(v.valor_venda);
      if (v.encarteirada_em) {
        const d = new Date(v.encarteirada_em);
        if (d.getFullYear() === ano) {
          const m = d.getMonth();
          if ((v.codigo || "") === "00") rbm[m] += val;
        }
      }
      if (v.cancelada_em) {
        const d = new Date(v.cancelada_em);
        if (d.getFullYear() === ano) {
          const m = d.getMonth();
          if ((v.codigo || "") !== "00") cbm[m] += val;
        }
      }
    });

    const metaArr = Array.from({ length: 12 }, () => 0);
    if (metasRow) {
      for (let i = 0; i < 12; i++) {
        const k = monthKey(i);
        metaArr[i] = safeNum((metasRow as any)[k]);
      }
    }

    const net = rbm.map((v, i) => v - cbm[i]);
    const ra = net.reduce((a, b) => a + b, 0);
    const ma = metaArr.reduce((a, b) => a + b, 0);

    return {
      realizedByMonth: rbm,
      metaByMonth: metaArr,
      netByMonth: net,
      realizedAnnual: ra,
      metaAnnual: ma,
    };
  }, [vendasCarteira, metasRow, ano]);

  /** ===================== Ações metas ===================== */
  async function saveMetas() {
    if (!isAdmin || selectedSeller === "__all__") return;
    const u = users.find((x) => x.id === selectedSeller);
    if (!u) return;

    const payload: any = {
      vendedor_id: u.id,
      auth_user_id: u.auth_user_id,
      ano,
    };

    for (let i = 0; i < 12; i++) {
      const k = monthKey(i);
      payload[k] = safeNum(metaDraft[k]);
    }

    setRefreshing(true);
    try {
      // upsert por (vendedor_id, ano) — sua tabela tem unique(vendedor_id, ano)
      const { error } = await supabase
        .from("metas_vendedores")
        .upsert(payload, { onConflict: "vendedor_id,ano" });

      if (error) throw error;

      setMetaEditOpen(false);
      await loadVendasAndMetas(me, users);
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar metas.");
    } finally {
      setRefreshing(false);
    }
  }

  /** ===================== Modais venda ===================== */
  const [draftVenda, setDraftVenda] = useState<Partial<VendaRow>>({
    lead_id: "",
    cpf: "",
    data_venda: ymd(new Date()),
    vendedor_id: "",
    produto: "Automóvel",
    administradora: "",
    tabela: "",
    forma_venda: "Parcela Cheia",
    numero_proposta: "",
    valor_venda: 0,
    status: "nova",
  });

  const sellerSelectOptions = useMemo(() => {
    return users.filter((u) => (u.is_active ?? true) === true);
  }, [users]);

  function resetDraftVenda() {
    const defaultSellerAuth = isAdmin
      ? (selectedSeller !== "__all__"
          ? (users.find((x) => x.id === selectedSeller)?.auth_user_id || "")
          : "")
      : (me?.auth_user_id || "");

    setDraftVenda({
      lead_id: "",
      cpf: "",
      data_venda: ymd(new Date()),
      vendedor_id: defaultSellerAuth,
      produto: "Automóvel",
      administradora: "",
      tabela: "",
      forma_venda: "Parcela Cheia",
      numero_proposta: "",
      valor_venda: 0,
      status: "nova",
    });
  }

  function openNewVenda() {
    resetDraftVenda();
    setNewOpen(true);
  }

  async function createVenda() {
    const payload: any = {
      lead_id: draftVenda.lead_id,
      cpf: onlyDigits(String(draftVenda.cpf || "")),
      data_venda: isoDateFromInput(String(draftVenda.data_venda || "")),
      vendedor_id: draftVenda.vendedor_id || null,
      produto: draftVenda.produto || null,
      administradora: draftVenda.administradora || null,
      tabela: draftVenda.tabela || null,
      forma_venda: draftVenda.forma_venda || null,
      numero_proposta: (draftVenda.numero_proposta || "").trim() || null,
      valor_venda: safeNum(draftVenda.valor_venda),
      status: "nova",
    };

    if (!payload.lead_id) return alert("Selecione o cliente (Lead).");
    if (!payload.vendedor_id) return alert("Selecione o vendedor.");
    if (!payload.administradora) return alert("Selecione a administradora.");
    if (!payload.produto) return alert("Selecione o produto/segmento.");
    if (!payload.tabela) return alert("Selecione a tabela.");

    setRefreshing(true);
    try {
      const { error } = await supabase.from("vendas").insert(payload);
      if (error) throw error;
      setNewOpen(false);
      await loadVendasAndMetas(me, users);
    } catch (e: any) {
      alert(e?.message || "Erro ao criar venda.");
    } finally {
      setRefreshing(false);
    }
  }

  function openEditVenda(v: VendaRow) {
    setEditingVenda(v);
    setEditOpen(true);
  }

  async function saveEditVenda() {
    if (!editingVenda) return;

    const payload: any = {
      cpf: onlyDigits(String(editingVenda.cpf || "")),
      data_venda: editingVenda.data_venda ? isoDateFromInput(String(editingVenda.data_venda)) : null,
      produto: editingVenda.produto || null,
      administradora: editingVenda.administradora || null,
      tabela: editingVenda.tabela || null,
      forma_venda: editingVenda.forma_venda || null,
      numero_proposta: (editingVenda.numero_proposta || "").trim() || null,
      valor_venda: safeNum(editingVenda.valor_venda),
    };

    setRefreshing(true);
    try {
      const { error } = await supabase.from("vendas").update(payload).eq("id", editingVenda.id);
      if (error) throw error;
      setEditOpen(false);
      setEditingVenda(null);
      await loadVendasAndMetas(me, users);
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar venda.");
    } finally {
      setRefreshing(false);
    }
  }

  function openViewVenda(v: VendaRow) {
    setViewVenda(v);
    setViewOpen(true);
  }

  /** ===================== UI Computeds ===================== */
  const carteiraAtivaCount = useMemo(() => {
    return vendasCarteira.filter((v) => (v.codigo || "") === "00").length;
  }, [vendasCarteira]);

  const carteiraAtivaValor = useMemo(() => {
    return vendasCarteira
      .filter((v) => (v.codigo || "") === "00")
      .reduce((acc, v) => acc + safeNum(v.valor_venda), 0);
  }, [vendasCarteira]);

  const vendorName = useMemo(() => {
    if (!me) return "—";
    if (isAdmin) {
      if (selectedSeller === "__all__") return "Todos";
      const u = users.find((x) => x.id === selectedSeller);
      return u?.nome || "—";
    }
    return me.nome || "—";
  }, [me, isAdmin, selectedSeller, users]);

  /** ===================== Render ===================== */
  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      </div>
    );
  }

  const pctAnual = metaAnnual > 0 ? (realizedAnnual / metaAnnual) * 100 : NaN;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-2xl font-bold text-slate-900">Carteira</div>
          <div className="text-sm text-slate-600">
            Visualização: <span className="font-semibold text-slate-900">{vendorName}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {isAdmin && (
            <div className="min-w-[240px]">
              <Label className="text-xs text-slate-600">Vendedor</Label>
              <Select value={selectedSeller} onValueChange={setSelectedSeller}>
                <SelectTrigger className="bg-white/70">
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {sellerSelectOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="min-w-[140px]">
            <Label className="text-xs text-slate-600">Ano</Label>
            <Select value={String(ano)} onValueChange={(v) => setAno(parseInt(v, 10))}>
              <SelectTrigger className="bg-white/70">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anoOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="secondary"
            className="bg-slate-900/5 hover:bg-slate-900/10"
            onClick={async () => {
              setRefreshing(true);
              try {
                await loadVendasAndMetas(me, users);
              } finally {
                setRefreshing(false);
              }
            }}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Button
            className="bg-[#1E293F] hover:bg-[#152033] text-white"
            onClick={openNewVenda}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova venda
          </Button>
        </div>
      </div>

      {/* KPIs + Meta anual */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-white/60 backdrop-blur border shadow-sm rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Carteira ativa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-bold text-slate-900">{carteiraAtivaCount}</div>
              <Badge className="bg-[#A11C27] text-white">cotas ativas</Badge>
            </div>
            <div className="text-sm text-slate-600">
              Somatório (valor_venda): <span className="font-semibold text-slate-900">{moneyBR(carteiraAtivaValor)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur border shadow-sm rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Vendas pendentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-bold text-slate-900">{vendasPendentes.length}</div>
            <div className="text-sm text-slate-600">
              Status <span className="font-semibold text-slate-900">nova</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur border shadow-sm rounded-2xl">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Meta anual (Realizado x Meta)</CardTitle>

            {isAdmin && selectedSeller !== "__all__" && (
              <Button
                variant="secondary"
                className="bg-slate-900/5 hover:bg-slate-900/10"
                onClick={() => setMetaEditOpen(true)}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Editar metas
              </Button>
            )}
          </CardHeader>

          <CardContent className="grid grid-cols-2 gap-4 items-center">
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "realizado", value: Math.max(realizedAnnual, 0) },
                      { name: "restante", value: Math.max(metaAnnual - realizedAnnual, 0) },
                    ]}
                    dataKey="value"
                    innerRadius={42}
                    outerRadius={62}
                    paddingAngle={2}
                    stroke="transparent"
                    isAnimationActive={false}
                  >
                    <Cell fill={BRAND.rubi} />
                    <Cell fill={BRAND.muted} />
                  </Pie>
                  <RTooltip
                    formatter={(v: any, name: any) => [moneyBR(safeNum(v)), String(name).toUpperCase()]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-slate-600">Realizado (líquido)</div>
              <div className="text-xl font-bold text-slate-900">{moneyBR(realizedAnnual)}</div>

              <div className="text-sm text-slate-600 mt-2">Meta anual</div>
              <div className="text-xl font-bold text-slate-900">{moneyBR(metaAnnual)}</div>

              <div className="mt-2">
                <Badge className="bg-[#B5A573] text-slate-900">
                  {pctBR(pctAnual, 0)} da meta
                </Badge>
              </div>

              {isAdmin && selectedSeller === "__all__" && (
                <div className="text-xs text-slate-500">
                  * Em “Todos”, as metas não são somadas (meta é por vendedor).
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ✅ MINI DONUTS (12 meses) */}
      <Card className="bg-white/60 backdrop-blur border shadow-sm rounded-2xl">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Metas mensais (12 mini-donuts)</CardTitle>
          <div className="text-sm text-slate-600">
            % não trava em 100% (pode passar).
          </div>
        </CardHeader>

        <CardContent>
          {(!metasRow && selectedSeller !== "__all__") && (
            <div className="rounded-2xl border bg-white/70 p-4 text-sm text-slate-700">
              Não encontrei metas cadastradas para <span className="font-semibold">{vendorName}</span> em {ano}.
              {isAdmin && selectedSeller !== "__all__" && (
                <div className="mt-2">
                  <Button
                    variant="secondary"
                    className="bg-slate-900/5 hover:bg-slate-900/10"
                    onClick={() => setMetaEditOpen(true)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Cadastrar metas
                  </Button>
                </div>
              )}
            </div>
          )}

          {selectedSeller === "__all__" && isAdmin && (
            <div className="rounded-2xl border bg-white/70 p-4 text-sm text-slate-700">
              Em <span className="font-semibold">Todos</span>, mostramos apenas realizado (meta mensal é individual por vendedor).
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => {
              const meta = metaByMonth[i] || 0;
              const realizado = netByMonth[i] || 0; // já vem líquido (encarteiradas - canceladas)
              const title = monthLabel(i);

              return (
                <MiniDonut
                  key={i}
                  title={title}
                  meta={selectedSeller === "__all__" ? 0 : meta}
                  realizado={realizado}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Listas básicas (mantém funcionalidades essenciais: editar/ver) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-white/60 backdrop-blur border shadow-sm rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Pendentes (status = nova)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {vendasPendentes.length === 0 && (
              <div className="text-sm text-slate-600">Nenhuma venda pendente.</div>
            )}

            {vendasPendentes.slice(0, 30).map((v) => {
              const lead = leadsById.get(v.lead_id);
              const vend = v.vendedor_id ? usersByAuth.get(v.vendedor_id) : null;

              return (
                <div key={v.id} className="rounded-2xl border bg-white/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {lead?.nome || "—"}
                      </div>
                      <div className="text-xs text-slate-600">
                        Vendedor: <span className="font-medium">{vend?.nome || "—"}</span> •
                        Venda: <span className="font-medium">{toBRDate(v.data_venda)}</span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {v.administradora || "—"} • {v.produto || "—"} • {v.tabela || "—"}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        Proposta: <span className="font-medium">{v.numero_proposta || "—"}</span> •
                        Valor: <span className="font-medium">{moneyBR(safeNum(v.valor_venda))}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        className="bg-slate-900/5 hover:bg-slate-900/10"
                        onClick={() => openEditVenda(v)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="secondary"
                        className="bg-slate-900/5 hover:bg-slate-900/10"
                        onClick={() => openViewVenda(v)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {vendasPendentes.length > 30 && (
              <div className="text-xs text-slate-500">
                Mostrando 30 de {vendasPendentes.length}.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur border shadow-sm rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Carteira (encarteiradas)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {vendasCarteira.length === 0 && (
              <div className="text-sm text-slate-600">Nenhuma venda encarteirada.</div>
            )}

            {vendasCarteira.slice(0, 20).map((v) => {
              const lead = leadsById.get(v.lead_id);
              return (
                <div key={v.id} className="rounded-2xl border bg-white/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {lead?.nome || "—"}{" "}
                        {(v.codigo || "") === "00" ? (
                          <Badge className="ml-2 bg-emerald-600 text-white">Ativa</Badge>
                        ) : (
                          <Badge className="ml-2 bg-rose-600 text-white">Cancelada</Badge>
                        )}
                        {v.contemplada ? (
                          <Badge className="ml-2 bg-[#B5A573] text-slate-900">Contemplada</Badge>
                        ) : null}
                        {v.inad ? (
                          <Badge className="ml-2 bg-amber-600 text-white">Inad</Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-600">
                        Encarteirada: <span className="font-medium">{toBRDate(v.encarteirada_em)}</span> •
                        Proposta: <span className="font-medium">{v.numero_proposta || "—"}</span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {v.administradora || "—"} • {v.produto || "—"} • {v.tabela || "—"}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        Grupo/Cota: <span className="font-medium">{v.grupo || "—"}/{v.cota || "—"}</span> •
                        Valor: <span className="font-medium">{moneyBR(safeNum(v.valor_venda))}</span>
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      className="bg-slate-900/5 hover:bg-slate-900/10"
                      onClick={() => openViewVenda(v)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}

            {vendasCarteira.length > 20 && (
              <div className="text-xs text-slate-500">
                Mostrando 20 de {vendasCarteira.length}.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===================== Modal: Editar metas (admin) ===================== */}
      <Dialog open={metaEditOpen} onOpenChange={setMetaEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {metasRow ? "Editar metas" : "Cadastrar metas"} — {vendorName} ({ano})
            </DialogTitle>
          </DialogHeader>

          {selectedSeller === "__all__" ? (
            <div className="text-sm text-slate-700">
              Selecione um vendedor para editar metas.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Array.from({ length: 12 }).map((_, i) => {
                const k = monthKey(i);
                return (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs text-slate-600">{monthLabel(i)}</Label>
                    <Input
                      value={metaDraft[k] ?? ""}
                      onChange={(e) => setMetaDraft((p) => ({ ...p, [k]: e.target.value }))}
                      placeholder="0"
                      className="bg-white/70"
                    />
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setMetaEditOpen(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button
              className="bg-[#A11C27] hover:bg-[#7f1620] text-white"
              onClick={saveMetas}
              disabled={selectedSeller === "__all__"}
            >
              <Save className="h-4 w-4 mr-2" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Modal: Nova venda ===================== */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nova venda (pendente)</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente (Lead)</Label>
              <Select
                value={String(draftVenda.lead_id || "")}
                onValueChange={(v) => setDraftVenda((p) => ({ ...p, lead_id: v }))}
              >
                <SelectTrigger className="bg-white/70">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>CPF/CNPJ</Label>
                  <Input
                    value={String(draftVenda.cpf || "")}
                    onChange={(e) => setDraftVenda((p) => ({ ...p, cpf: e.target.value }))}
                    className="bg-white/70"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Data da venda</Label>
                  <Input
                    type="date"
                    value={String(draftVenda.data_venda || "")}
                    onChange={(e) => setDraftVenda((p) => ({ ...p, data_venda: e.target.value }))}
                    className="bg-white/70"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Proposta</Label>
                  <Input
                    value={String(draftVenda.numero_proposta || "")}
                    onChange={(e) => setDraftVenda((p) => ({ ...p, numero_proposta: e.target.value }))}
                    className="bg-white/70"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Valor (valor_venda)</Label>
                  <Input
                    value={String(draftVenda.valor_venda ?? 0)}
                    onChange={(e) => setDraftVenda((p) => ({ ...p, valor_venda: e.target.value as any }))}
                    className="bg-white/70"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Vendedor</Label>
                <Select
                  value={String(draftVenda.vendedor_id || "")}
                  onValueChange={(v) => setDraftVenda((p) => ({ ...p, vendedor_id: v }))}
                  disabled={!isAdmin} // vendedor não troca vendedor
                >
                  <SelectTrigger className="bg-white/70">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {sellerSelectOptions.map((u) => (
                      <SelectItem key={u.auth_user_id} value={u.auth_user_id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!isAdmin && (
                  <div className="text-xs text-slate-500">
                    Vendedor logado não altera vendedor.
                  </div>
                )}
              </div>
            </div>

            {/* Ordem: Administradora → Produto → Tabela */}
            <div className="space-y-2">
              <div className="space-y-1">
                <Label>Administradora</Label>
                <Select
                  value={String(draftVenda.administradora || "")}
                  onValueChange={(v) =>
                    setDraftVenda((p) => ({
                      ...p,
                      administradora: v,
                      tabela: "", // reseta
                    }))
                  }
                >
                  <SelectTrigger className="bg-white/70">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    {admins.map((a) => (
                      <SelectItem key={a.id} value={a.name}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Produto / Segmento</Label>
                <Select
                  value={String(draftVenda.produto || "")}
                  onValueChange={(v) => setDraftVenda((p) => ({ ...p, produto: v, tabela: "" }))}
                >
                  <SelectTrigger className="bg-white/70">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "Automóvel",
                      "Imóvel",
                      "Imóvel Estendido",
                      "Motocicleta",
                      "Pesados",
                      "Serviço",
                      "Consórcio Ouro",
                    ].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Tabela</Label>
                <Select
                  value={String(draftVenda.tabela || "")}
                  onValueChange={(v) => setDraftVenda((p) => ({ ...p, tabela: v }))}
                >
                  <SelectTrigger className="bg-white/70">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    {(() => {
                      const adminName = String(draftVenda.administradora || "");
                      const adminId = admins.find((a) => a.name === adminName)?.id || null;
                      const seg = String(draftVenda.produto || "");

                      const list = tables
                        .filter((t) => (adminId ? t.admin_id === adminId : true))
                        .filter((t) => (seg ? (t.segmento || "").toLowerCase() === seg.toLowerCase() : true))
                        .slice(0, 200);

                      if (!adminId || !seg) {
                        return (
                          <div className="px-3 py-2 text-xs text-slate-500">
                            Selecione Administradora e Produto primeiro.
                          </div>
                        );
                      }

                      if (list.length === 0) {
                        return (
                          <div className="px-3 py-2 text-xs text-slate-500">
                            Nenhuma tabela encontrada para essa combinação.
                          </div>
                        );
                      }

                      return list.map((t) => (
                        <SelectItem key={t.id} value={t.nome_tabela}>
                          {t.nome_tabela}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Forma de venda</Label>
                <Select
                  value={String(draftVenda.forma_venda || "")}
                  onValueChange={(v) => setDraftVenda((p) => ({ ...p, forma_venda: v }))}
                >
                  <SelectTrigger className="bg-white/70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Parcela Cheia">Parcela Cheia</SelectItem>
                    <SelectItem value="Reduzida 25%">Reduzida 25%</SelectItem>
                    <SelectItem value="Reduzida 50%">Reduzida 50%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setNewOpen(false);
                resetDraftVenda();
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button
              className="bg-[#A11C27] hover:bg-[#7f1620] text-white"
              onClick={createVenda}
            >
              <Save className="h-4 w-4 mr-2" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Modal: Editar venda ===================== */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar venda</DialogTitle>
          </DialogHeader>

          {!editingVenda ? (
            <div className="text-sm text-slate-600">—</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>CPF/CNPJ</Label>
                <Input
                  value={String(editingVenda.cpf || "")}
                  onChange={(e) => setEditingVenda((p) => (p ? { ...p, cpf: e.target.value } : p))}
                  className="bg-white/70"
                />
              </div>

              <div className="space-y-1">
                <Label>Data da venda</Label>
                <Input
                  type="date"
                  value={String(editingVenda.data_venda || "")}
                  onChange={(e) => setEditingVenda((p) => (p ? { ...p, data_venda: e.target.value } : p))}
                  className="bg-white/70"
                />
              </div>

              <div className="space-y-1">
                <Label>Administradora</Label>
                <Input
                  value={String(editingVenda.administradora || "")}
                  onChange={(e) => setEditingVenda((p) => (p ? { ...p, administradora: e.target.value } : p))}
                  className="bg-white/70"
                />
              </div>

              <div className="space-y-1">
                <Label>Produto</Label>
                <Input
                  value={String(editingVenda.produto || "")}
                  onChange={(e) => setEditingVenda((p) => (p ? { ...p, produto: e.target.value } : p))}
                  className="bg-white/70"
                />
              </div>

              <div className="space-y-1">
                <Label>Tabela</Label>
                <Input
                  value={String(editingVenda.tabela || "")}
                  onChange={(e) => setEditingVenda((p) => (p ? { ...p, tabela: e.target.value } : p))}
                  className="bg-white/70"
                />
              </div>

              <div className="space-y-1">
                <Label>Forma de venda</Label>
                <Input
                  value={String(editingVenda.forma_venda || "")}
                  onChange={(e) => setEditingVenda((p) => (p ? { ...p, forma_venda: e.target.value } : p))}
                  className="bg-white/70"
                />
              </div>

              <div className="space-y-1">
                <Label>Nº proposta</Label>
                <Input
                  value={String(editingVenda.numero_proposta || "")}
                  onChange={(e) => setEditingVenda((p) => (p ? { ...p, numero_proposta: e.target.value } : p))}
                  className="bg-white/70"
                />
              </div>

              <div className="space-y-1">
                <Label>Valor (valor_venda)</Label>
                <Input
                  value={String(editingVenda.valor_venda ?? 0)}
                  onChange={(e) => setEditingVenda((p) => (p ? { ...p, valor_venda: e.target.value as any } : p))}
                  className="bg-white/70"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button
              className="bg-[#A11C27] hover:bg-[#7f1620] text-white"
              onClick={saveEditVenda}
              disabled={!editingVenda}
            >
              <Save className="h-4 w-4 mr-2" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Modal: Ver venda ===================== */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da venda</DialogTitle>
          </DialogHeader>

          {!viewVenda ? (
            <div className="text-sm text-slate-600">—</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border bg-white/70 p-3">
                <div className="text-sm text-slate-600">Cliente</div>
                <div className="text-lg font-bold text-slate-900">
                  {leadsById.get(viewVenda.lead_id)?.nome || "—"}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  CPF/CNPJ: <span className="font-medium">{viewVenda.cpf || "—"}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl border bg-white/70 p-3">
                  <div className="text-xs text-slate-600">Data venda</div>
                  <div className="font-semibold text-slate-900">{toBRDate(viewVenda.data_venda)}</div>
                </div>
                <div className="rounded-2xl border bg-white/70 p-3">
                  <div className="text-xs text-slate-600">Proposta</div>
                  <div className="font-semibold text-slate-900">{viewVenda.numero_proposta || "—"}</div>
                </div>
                <div className="rounded-2xl border bg-white/70 p-3">
                  <div className="text-xs text-slate-600">Admin/Produto/Tabela</div>
                  <div className="font-semibold text-slate-900">
                    {(viewVenda.administradora || "—")} • {(viewVenda.produto || "—")} • {(viewVenda.tabela || "—")}
                  </div>
                </div>
                <div className="rounded-2xl border bg-white/70 p-3">
                  <div className="text-xs text-slate-600">Valor</div>
                  <div className="font-semibold text-slate-900">{moneyBR(safeNum(viewVenda.valor_venda))}</div>
                </div>
              </div>

              <div className="rounded-2xl border bg-white/70 p-3">
                <div className="text-xs text-slate-600">Status / Carteira</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge className="bg-slate-900 text-white">{viewVenda.status || "—"}</Badge>
                  {(viewVenda.codigo || "") === "00" ? (
                    <Badge className="bg-emerald-600 text-white">Ativa</Badge>
                  ) : (
                    <Badge className="bg-rose-600 text-white">Cancelada</Badge>
                  )}
                  {viewVenda.contemplada ? (
                    <Badge className="bg-[#B5A573] text-slate-900">Contemplada</Badge>
                  ) : null}
                  {viewVenda.inad ? (
                    <Badge className="bg-amber-600 text-white">Inadimplente</Badge>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  Encarteirada: <span className="font-medium">{toBRDate(viewVenda.encarteirada_em)}</span> •
                  Cancelada: <span className="font-medium">{toBRDate(viewVenda.cancelada_em)}</span> •
                  Contemplação: <span className="font-medium">{toBRDate(viewVenda.data_contemplacao)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  Grupo/Cota/Código:{" "}
                  <span className="font-medium">
                    {viewVenda.grupo || "—"} / {viewVenda.cota || "—"} / {viewVenda.codigo || "—"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setViewOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
