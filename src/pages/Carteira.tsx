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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import {
  Loader2,
  Plus,
  RefreshCw,
  Pencil,
  Eye,
  ShieldCheck,
  UserRound,
  Save,
  X,
  ArrowRightLeft,
} from "lucide-react";

/** ===================== Tipos ===================== */
type UserRole = "admin" | "vendedor" | string;

type UserRow = {
  id: string; // public.users.id
  auth_user_id: string; // supabase auth uid
  nome?: string | null;
  email?: string | null;
  role?: UserRole | null;
  user_role?: UserRole | null; // legado
  is_active?: boolean | null;
};

type MetaRow = {
  id: string;
  vendedor_id: string; // public.users.id
  auth_user_id: string | null; // novo campo (pode ter null em registros antigos)
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

type VendaRow = {
  id: string;
  data_venda?: string | null; // date
  vendedor_id?: string | null; // IMPORTANT: aqui é auth_user_id (pelo teu schema/memória)
  segmento?: string | null;
  produto?: string | null;
  administradora?: string | null;
  tabela?: string | null;
  forma_venda?: string | null;
  numero_proposta?: string | null;

  lead_id?: string | null;
  cliente_lead_id?: string | null;

  nome?: string | null; // (se você já enriquece no backend/view, senão fica vazio)
  telefone?: string | null;
  email?: string | null;

  valor_venda?: number | null;

  // encarteiramento / status
  encarteirada_em?: string | null; // timestamptz
  grupo?: string | null;
  cota?: string | null;
  codigo?: string | null; // '00' ativa
  cancelada_em?: string | null;

  contemplada?: boolean | null;
  data_contemplacao?: string | null;

  inad?: boolean | null;
  inad_em?: string | null;
  inad_revertida_em?: string | null;

  descricao?: string | null;
  status?: string | null;
  status_inicial?: string | null;

  // campos novos (se existirem)
  reativada_em?: string | null;
  contemplacao_tipo?: string | null;
  contemplacao_pct?: number | null;
};

type VendaForm = {
  data_venda: string; // YYYY-MM-DD
  vendedor_auth_id: string; // auth uid
  segmento: string;
  produto: string;
  administradora: string;
  tabela: string;
  forma_venda: string;
  numero_proposta: string;
  valor_venda: string; // texto moeda
  telefone: string;
  email: string;
  descricao: string;
  // encarteiramento
  grupo: string;
  cota: string;
  codigo: string; // default '00'
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function currency(n?: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return BRL.format(n);
}

function toISODateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateBR(iso?: string | null) {
  if (!iso) return "—";
  // aceita date "YYYY-MM-DD" ou timestamptz
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // se for exatamente YYYY-MM-DD
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return iso;
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function parseMoneyBR(value: string): number {
  // "1.234.567,89" -> 1234567.89
  const clean = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(clean.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function pctHuman(num: number) {
  // 0.1234 -> "12,34%"
  const p = num * 100;
  return `${p.toFixed(2).replace(".", ",")}%`;
}

function monthKey(i1: number) {
  return String(i1).padStart(2, "0"); // 1..12
}

/** ===================== Donut Meta ===================== */
function DonutMeta({
  title,
  realizado,
  meta,
}: {
  title: string;
  realizado: number;
  meta: number;
}) {
  const safeMeta = meta > 0 ? meta : 0;
  const pct = safeMeta > 0 ? Math.min(1, Math.max(0, realizado / safeMeta)) : 0;

  const data = useMemo(
    () => [
      { name: "Realizado", value: pct },
      { name: "Falta", value: 1 - pct },
    ],
    [pct]
  );

  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-44">
        <div className="h-full w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="70%"
                outerRadius="95%"
                startAngle={90}
                endAngle={-270}
                stroke="transparent"
              >
                <Cell />
                <Cell />
              </Pie>
              <Tooltip
                formatter={(v: any, name: any) => [
                  name === "Realizado" ? pctHuman(Number(v)) : pctHuman(Number(v)),
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-xl font-bold">{pctHuman(pct)}</div>
            <div className="text-xs text-muted-foreground">
              {currency(realizado)} / {currency(meta)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** ===================== Página ===================== */
export default function Carteira() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [me, setMe] = useState<UserRow | null>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const usersById = useMemo(() => {
    const m = new Map<string, UserRow>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  const usersByAuth = useMemo(() => {
    const m = new Map<string, UserRow>();
    users.forEach((u) => m.set(u.auth_user_id, u));
    return m;
  }, [users]);

  const role: UserRole | null = (me?.role ?? me?.user_role ?? null) as any;
  const isAdmin = role === "admin";

  // filtro vendedor (admin)
  const [selectedSellerId, setSelectedSellerId] = useState<string>("__all__");

  // ano
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());

  // busca
  const [search, setSearch] = useState("");

  // dados
  const [metasRows, setMetasRows] = useState<MetaRow[]>([]);
  const [vendas, setVendas] = useState<VendaRow[]>([]);

  // dialogs
  const [openNovaVenda, setOpenNovaVenda] = useState(false);
  const [openEditarVenda, setOpenEditarVenda] = useState<null | VendaRow>(null);
  const [openVerVenda, setOpenVerVenda] = useState<null | VendaRow>(null);
  const [openMetaEditor, setOpenMetaEditor] = useState(false);

  /** ========= RBAC: filtros efetivos ========= */
  const effectiveAuthFilter = useMemo(() => {
    // auth_user_id para filtrar vendas/meta quando necessário
    if (!authUserId) return null;

    if (!isAdmin) return authUserId;

    if (selectedSellerId === "__all__") return null;

    const u = usersById.get(selectedSellerId);
    return u?.auth_user_id ?? null;
  }, [authUserId, isAdmin, selectedSellerId, usersById]);

  /** ========= Meta agregada (m01..m12) conforme RBAC ========= */
  const metaTotals = useMemo(() => {
    // normaliza auth_user_id ausente em metas antigas usando usersById
    const rowsNormalized = metasRows.map((r) => {
      const auth =
        r.auth_user_id ??
        usersById.get(r.vendedor_id)?.auth_user_id ??
        null;
      return { ...r, auth_user_id: auth };
    });

    const rowsFiltered = (() => {
      if (!authUserId) return [];
      if (!isAdmin) {
        return rowsNormalized.filter((r) => r.auth_user_id === authUserId);
      }
      if (selectedSellerId === "__all__") return rowsNormalized;
      const auth = usersById.get(selectedSellerId)?.auth_user_id ?? null;
      if (!auth) return [];
      return rowsNormalized.filter((r) => r.auth_user_id === auth);
    })();

    const sum = (key: keyof MetaRow) =>
      rowsFiltered.reduce((acc, r) => acc + (Number(r[key] ?? 0) || 0), 0);

    return {
      m01: sum("m01"),
      m02: sum("m02"),
      m03: sum("m03"),
      m04: sum("m04"),
      m05: sum("m05"),
      m06: sum("m06"),
      m07: sum("m07"),
      m08: sum("m08"),
      m09: sum("m09"),
      m10: sum("m10"),
      m11: sum("m11"),
      m12: sum("m12"),
    };
  }, [metasRows, authUserId, isAdmin, selectedSellerId, usersById]);

  const monthIndex = now.getMonth() + 1; // 1..12
  const metaMes = (metaTotals as any)[`m${monthKey(monthIndex)}`] ?? 0;
  const metaAno = Object.values(metaTotals).reduce((a, b) => a + (b || 0), 0);

  /** ========= Realizado por mês (encarteiradas/canceladas) ========= */
  const realizadoByMonth = useMemo(() => {
    const map = new Map<number, number>();
    for (let m = 1; m <= 12; m++) map.set(m, 0);

    // regra (conforme teu baseline/memória):
    // realizado mensal = vendas encarteiradas ativas (codigo='00' por encarteirada_em)
    // menos canceladas (codigo!='00' por cancelada_em)
    vendas.forEach((v) => {
      const codigo = (v.codigo ?? "00").trim();
      const enc = v.encarteirada_em ? new Date(v.encarteirada_em) : null;
      const canc = v.cancelada_em ? new Date(v.cancelada_em) : null;
      const val = Number(v.valor_venda ?? 0) || 0;

      if (enc && enc.getFullYear() === year) {
        const m = enc.getMonth() + 1;
        if (codigo === "00") map.set(m, (map.get(m) || 0) + val);
      }

      if (canc && canc.getFullYear() === year) {
        const m = canc.getMonth() + 1;
        if (codigo !== "00") map.set(m, (map.get(m) || 0) - val);
      }
    });

    return map;
  }, [vendas, year]);

  const realizadoMes = realizadoByMonth.get(monthIndex) || 0;
  const realizadoAno = Array.from(realizadoByMonth.values()).reduce((a, b) => a + b, 0);

  /** ========= Carteira ativa total ========= */
  const carteiraAtiva = useMemo(() => {
    // somatório apenas cotas ativas codigo='00' (valor_venda)
    return vendas.reduce((acc, v) => {
      const codigo = (v.codigo ?? "00").trim();
      if (codigo !== "00") return acc;
      const val = Number(v.valor_venda ?? 0) || 0;
      return acc + val;
    }, 0);
  }, [vendas]);

  /** ========= Dataset chart ========= */
  const chartData = useMemo(() => {
    const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return labels.map((name, idx) => {
      const m = idx + 1;
      const realizado = realizadoByMonth.get(m) || 0;
      const meta = (metaTotals as any)[`m${monthKey(m)}`] ?? 0;
      return { name, meta, realizado };
    });
  }, [realizadoByMonth, metaTotals]);

  /** ===================== Fetch ===================== */
  async function loadAll() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const auid = auth?.user?.id ?? null;
      setAuthUserId(auid);

      // users ativos
      const { data: usersData, error: usersErr } = await supabase
        .from("users")
        .select("id, auth_user_id, nome, email, role, user_role, is_active")
        .eq("is_active", true)
        .order("nome", { ascending: true });

      if (usersErr) throw usersErr;
      const usersList = (usersData ?? []) as UserRow[];
      setUsers(usersList);

      const meRow = auid ? usersList.find((u) => u.auth_user_id === auid) ?? null : null;
      setMe(meRow);

      // metas do ano
      const { data: metasData, error: metasErr } = await supabase
        .from("metas_vendedores")
        .select("id, vendedor_id, auth_user_id, ano, m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
        .eq("ano", year);

      if (metasErr) throw metasErr;
      setMetasRows((metasData ?? []) as MetaRow[]);

      // vendas (trazemos um range maior pra carteira + cálculo)
      // IMPORTANT: vendedor filtra por vendas.vendedor_id (auth_user_id)
      let vendasQuery = supabase
        .from("vendas")
        .select(
          "id,data_venda,vendedor_id,segmento,produto,administradora,tabela,forma_venda,numero_proposta,lead_id,cliente_lead_id,nome,telefone,email,valor_venda,encarteirada_em,grupo,cota,codigo,cancelada_em,contemplada,data_contemplacao,inad,inad_em,inad_revertida_em,descricao,status,status_inicial,reativada_em,contemplacao_tipo,contemplacao_pct"
        );

      if (effectiveAuthFilter) {
        vendasQuery = vendasQuery.eq("vendedor_id", effectiveAuthFilter);
      }

      // opcional: limita por período (ano corrente +- 1)
      const start = `${year - 1}-01-01`;
      const end = `${year + 1}-12-31`;
      vendasQuery = vendasQuery.gte("data_venda", start).lte("data_venda", end);

      const { data: vendasData, error: vendasErr } = await vendasQuery.order("created_at", { ascending: false });

      // se created_at não existe no select acima, ignora: fallback
      if (vendasErr) {
        // fallback sem order created_at
        const { data: vd2, error: ve2 } = await (effectiveAuthFilter
          ? supabase
              .from("vendas")
              .select(
                "id,data_venda,vendedor_id,segmento,produto,administradora,tabela,forma_venda,numero_proposta,lead_id,cliente_lead_id,nome,telefone,email,valor_venda,encarteirada_em,grupo,cota,codigo,cancelada_em,contemplada,data_contemplacao,inad,inad_em,inad_revertida_em,descricao,status,status_inicial,reativada_em,contemplacao_tipo,contemplacao_pct"
              )
              .eq("vendedor_id", effectiveAuthFilter)
              .gte("data_venda", start)
              .lte("data_venda", end)
          : supabase
              .from("vendas")
              .select(
                "id,data_venda,vendedor_id,segmento,produto,administradora,tabela,forma_venda,numero_proposta,lead_id,cliente_lead_id,nome,telefone,email,valor_venda,encarteirada_em,grupo,cota,codigo,cancelada_em,contemplada,data_contemplacao,inad,inad_em,inad_revertida_em,descricao,status,status_inicial,reativada_em,contemplacao_tipo,contemplacao_pct"
              )
              .gte("data_venda", start)
              .lte("data_venda", end));
        if (ve2) throw ve2;
        setVendas((vd2 ?? []) as VendaRow[]);
      } else {
        setVendas((vendasData ?? []) as VendaRow[]);
      }
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Erro ao carregar Carteira.");
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    loadAll();
    // year muda -> recarrega
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, selectedSellerId]);

  /** ===================== Listas / Filtros ===================== */
  const vendasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendas;

    return vendas.filter((v) => {
      const nome = (v.nome ?? "").toLowerCase();
      const proposta = (v.numero_proposta ?? "").toLowerCase();
      const admin = (v.administradora ?? "").toLowerCase();
      const tabela = (v.tabela ?? "").toLowerCase();
      const grupo = (v.grupo ?? "").toLowerCase();
      const cota = (v.cota ?? "").toLowerCase();
      return (
        nome.includes(q) ||
        proposta.includes(q) ||
        admin.includes(q) ||
        tabela.includes(q) ||
        grupo.includes(q) ||
        cota.includes(q)
      );
    });
  }, [vendas, search]);

  const pendentes = useMemo(() => vendasFiltradas.filter((v) => !v.encarteirada_em), [vendasFiltradas]);
  const encarteiradas = useMemo(() => vendasFiltradas.filter((v) => !!v.encarteirada_em), [vendasFiltradas]);

  /** ===================== Ações (CRUD básico) ===================== */
  function buildEmptyForm(): VendaForm {
    return {
      data_venda: toISODateInput(new Date()),
      vendedor_auth_id: effectiveAuthFilter ?? authUserId ?? "",
      segmento: "",
      produto: "",
      administradora: "",
      tabela: "",
      forma_venda: "",
      numero_proposta: "",
      valor_venda: "",
      telefone: "",
      email: "",
      descricao: "",
      grupo: "",
      cota: "",
      codigo: "00",
    };
  }

  const [form, setForm] = useState<VendaForm>(buildEmptyForm());
  useEffect(() => {
    setForm(buildEmptyForm());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNovaVenda]);

  function canEditMeta() {
    return isAdmin;
  }

  function canEncarteirar() {
    return isAdmin;
  }

  async function saveNovaVenda() {
    if (!authUserId) return;
    const vendedorAuth = form.vendedor_auth_id || authUserId;

    if (!form.administradora.trim() || !form.produto.trim() || !form.tabela.trim()) {
      alert("Informe Administradora, Produto e Tabela.");
      return;
    }

    const payload: any = {
      data_venda: form.data_venda,
      vendedor_id: vendedorAuth, // auth_user_id no vendas
      segmento: form.segmento || null,
      produto: form.produto || null,
      administradora: form.administradora || null,
      tabela: form.tabela || null,
      forma_venda: form.forma_venda || null,
      numero_proposta: form.numero_proposta || null,
      valor_venda: parseMoneyBR(form.valor_venda || "0") || 0,
      telefone: form.telefone || null,
      email: form.email || null,
      descricao: form.descricao || null,
      codigo: "00",
    };

    const { error } = await supabase.from("vendas").insert(payload);
    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }
    setOpenNovaVenda(false);
    await refresh();
  }

  async function saveEditarVenda(v: VendaRow, patch: Partial<VendaForm>) {
    const payload: any = {};

    if (patch.data_venda != null) payload.data_venda = patch.data_venda;
    if (patch.segmento != null) payload.segmento = patch.segmento || null;
    if (patch.produto != null) payload.produto = patch.produto || null;
    if (patch.administradora != null) payload.administradora = patch.administradora || null;
    if (patch.tabela != null) payload.tabela = patch.tabela || null;
    if (patch.forma_venda != null) payload.forma_venda = patch.forma_venda || null;
    if (patch.numero_proposta != null) payload.numero_proposta = patch.numero_proposta || null;
    if (patch.valor_venda != null) payload.valor_venda = parseMoneyBR(patch.valor_venda || "0") || 0;
    if (patch.telefone != null) payload.telefone = patch.telefone || null;
    if (patch.email != null) payload.email = patch.email || null;
    if (patch.descricao != null) payload.descricao = patch.descricao || null;

    const { error } = await supabase.from("vendas").update(payload).eq("id", v.id);
    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }
    setOpenEditarVenda(null);
    await refresh();
  }

  async function encarteirarVenda(v: VendaRow, grupo: string, cota: string, codigo: string) {
    if (!canEncarteirar()) {
      alert("Somente admin pode encarteirar.");
      return;
    }
    if (!grupo.trim() || !cota.trim() || !codigo.trim()) {
      alert("Informe Grupo, Cota e Código.");
      return;
    }

    const payload: any = {
      grupo: grupo.trim(),
      cota: cota.trim(),
      codigo: codigo.trim(),
      encarteirada_em: new Date().toISOString(),
    };

    const { error } = await supabase.from("vendas").update(payload).eq("id", v.id);
    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }
    await refresh();
  }

  /** ===================== Metas: editor (admin) ===================== */
  const [metaEdit, setMetaEdit] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!openMetaEditor) return;
    const toText = (n: number) => String(n || 0);
    setMetaEdit({
      m01: toText(metaTotals.m01 || 0),
      m02: toText(metaTotals.m02 || 0),
      m03: toText(metaTotals.m03 || 0),
      m04: toText(metaTotals.m04 || 0),
      m05: toText(metaTotals.m05 || 0),
      m06: toText(metaTotals.m06 || 0),
      m07: toText(metaTotals.m07 || 0),
      m08: toText(metaTotals.m08 || 0),
      m09: toText(metaTotals.m09 || 0),
      m10: toText(metaTotals.m10 || 0),
      m11: toText(metaTotals.m11 || 0),
      m12: toText(metaTotals.m12 || 0),
    });
  }, [openMetaEditor, metaTotals]);

  function getMetaOwnerForUpsert(): { vendedor_id: string; auth_user_id: string } | null {
    if (!isAdmin) return null;
    if (selectedSellerId === "__all__") return null; // não faz sentido cadastrar meta agregada
    const u = usersById.get(selectedSellerId);
    if (!u) return null;
    return { vendedor_id: u.id, auth_user_id: u.auth_user_id };
  }

  async function saveMeta() {
    if (!canEditMeta()) return;
    const owner = getMetaOwnerForUpsert();
    if (!owner) {
      alert("Selecione um vendedor específico (não 'Todos') para cadastrar/editar meta.");
      return;
    }

    const payload: any = {
      vendedor_id: owner.vendedor_id,
      auth_user_id: owner.auth_user_id,
      ano: year,
      m01: parseMoneyBR(metaEdit.m01 || "0"),
      m02: parseMoneyBR(metaEdit.m02 || "0"),
      m03: parseMoneyBR(metaEdit.m03 || "0"),
      m04: parseMoneyBR(metaEdit.m04 || "0"),
      m05: parseMoneyBR(metaEdit.m05 || "0"),
      m06: parseMoneyBR(metaEdit.m06 || "0"),
      m07: parseMoneyBR(metaEdit.m07 || "0"),
      m08: parseMoneyBR(metaEdit.m08 || "0"),
      m09: parseMoneyBR(metaEdit.m09 || "0"),
      m10: parseMoneyBR(metaEdit.m10 || "0"),
      m11: parseMoneyBR(metaEdit.m11 || "0"),
      m12: parseMoneyBR(metaEdit.m12 || "0"),
    };

    // upsert por (vendedor_id, ano) — se você tiver unique nisso
    const { error } = await supabase
      .from("metas_vendedores")
      .upsert(payload, { onConflict: "vendedor_id,ano" });

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setOpenMetaEditor(false);
    await refresh();
  }

  /** ===================== UI ===================== */
  const sellerName = useMemo(() => {
    if (!isAdmin) return me?.nome ?? "Meu Painel";
    if (selectedSellerId === "__all__") return "Todos";
    return usersById.get(selectedSellerId)?.nome ?? "Vendedor";
  }, [isAdmin, me?.nome, selectedSellerId, usersById]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando Carteira...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Carteira</h1>
            {isAdmin ? (
              <Badge className="bg-white/10 border-white/10 text-white">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                Admin
              </Badge>
            ) : (
              <Badge className="bg-white/10 border-white/10 text-white">
                <UserRound className="h-3.5 w-3.5 mr-1" />
                Vendedor
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            Visão: <span className="font-medium">{sellerName}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          {isAdmin && (
            <div className="min-w-[260px]">
              <Label className="text-xs">Vendedor</Label>
              <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome ?? u.email ?? u.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="min-w-[140px]">
            <Label className="text-xs">Ano</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }).map((_, i) => {
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

          <Button
            variant="secondary"
            className="bg-white/10 border border-white/10"
            onClick={refresh}
            disabled={refreshing}
            title="Atualizar"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>

          <Button onClick={() => setOpenNovaVenda(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova venda
          </Button>

          {canEditMeta() && (
            <Button
              variant="secondary"
              className="bg-white/10 border border-white/10"
              onClick={() => setOpenMetaEditor(true)}
              disabled={selectedSellerId === "__all__"}
              title={selectedSellerId === "__all__" ? "Selecione um vendedor para editar meta" : "Editar meta"}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Meta
            </Button>
          )}
        </div>
      </div>

      {/* KPIs + Donuts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <DonutMeta title="Meta do mês x Realizado" realizado={realizadoMes} meta={metaMes} />
        <DonutMeta title="Meta do ano x Realizado" realizado={realizadoAno} meta={metaAno} />
        <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Carteira ativa (código 00)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold">{currency(carteiraAtiva)}</div>
            <div className="text-xs text-muted-foreground">
              Base: soma de <span className="font-medium">valor_venda</span> nas cotas ativas.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Linha Meta vs Realizado */}
      <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Meta vs Realizado (mês a mês)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(v: any) => currency(Number(v) || 0)} />
              <Line type="monotone" dataKey="meta" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="realizado" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Busca */}
      <div className="flex flex-col md:flex-row gap-2 md:items-end md:justify-between">
        <div className="w-full md:max-w-md">
          <Label className="text-xs">Buscar</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cliente, proposta, administradora, tabela, grupo, cota..."
            className="bg-white/5 border-white/10"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          Pendentes: <span className="font-semibold">{pendentes.length}</span> • Encarteiradas:{" "}
          <span className="font-semibold">{encarteiradas.length}</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="encarteiradas" className="w-full">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="encarteiradas">Encarteiradas</TabsTrigger>
          <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
        </TabsList>

        <TabsContent value="encarteiradas" className="mt-3">
          <VendasTable
            items={encarteiradas}
            usersByAuth={usersByAuth}
            onView={(v) => setOpenVerVenda(v)}
            onEdit={(v) => setOpenEditarVenda(v)}
            canEdit={true}
            canEncarteirar={false}
            onEncarteirar={async () => {}}
          />
        </TabsContent>

        <TabsContent value="pendentes" className="mt-3">
          <VendasTable
            items={pendentes}
            usersByAuth={usersByAuth}
            onView={(v) => setOpenVerVenda(v)}
            onEdit={(v) => setOpenEditarVenda(v)}
            canEdit={true}
            canEncarteirar={canEncarteirar()}
            onEncarteirar={async (v) => {
              const g = prompt("Grupo:");
              if (g == null) return;
              const c = prompt("Cota:");
              if (c == null) return;
              const cod = prompt("Código (00 ativo):", "00");
              if (cod == null) return;
              await encarteirarVenda(v, g, c, cod);
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog Nova Venda */}
      <Dialog open={openNovaVenda} onOpenChange={setOpenNovaVenda}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova venda (pendente)</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Data da venda</Label>
              <Input
                type="date"
                value={form.data_venda}
                onChange={(e) => setForm((s) => ({ ...s, data_venda: e.target.value }))}
              />
            </div>

            <div>
              <Label>Vendedor</Label>
              <div className="text-sm bg-white/5 border border-white/10 rounded-md px-3 py-2">
                {!isAdmin ? (me?.nome ?? "Você") : selectedSellerId === "__all__" ? "Selecione um vendedor no topo" : sellerName}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Regra: vendedor sempre grava em <span className="font-medium">vendas.vendedor_id = auth_user_id</span>.
              </div>
            </div>

            <div>
              <Label>Administradora *</Label>
              <Input value={form.administradora} onChange={(e) => setForm((s) => ({ ...s, administradora: e.target.value }))} />
            </div>
            <div>
              <Label>Produto *</Label>
              <Input value={form.produto} onChange={(e) => setForm((s) => ({ ...s, produto: e.target.value }))} />
            </div>
            <div>
              <Label>Tabela *</Label>
              <Input value={form.tabela} onChange={(e) => setForm((s) => ({ ...s, tabela: e.target.value }))} />
            </div>
            <div>
              <Label>Segmento</Label>
              <Input value={form.segmento} onChange={(e) => setForm((s) => ({ ...s, segmento: e.target.value }))} />
            </div>
            <div>
              <Label>Nº Proposta</Label>
              <Input value={form.numero_proposta} onChange={(e) => setForm((s) => ({ ...s, numero_proposta: e.target.value }))} />
            </div>
            <div>
              <Label>Valor venda</Label>
              <Input value={form.valor_venda} onChange={(e) => setForm((s) => ({ ...s, valor_venda: e.target.value }))} placeholder="Ex: 1300000,00" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => setForm((s) => ({ ...s, telefone: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setOpenNovaVenda(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveNovaVenda}
              disabled={
                (!isAdmin && !authUserId) ||
                (isAdmin && selectedSellerId === "__all__") ||
                !form.administradora.trim() ||
                !form.produto.trim() ||
                !form.tabela.trim()
              }
            >
              <Save className="h-4 w-4 mr-2" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Venda */}
      <EditarVendaDialog
        openVenda={openEditarVenda}
        onClose={() => setOpenEditarVenda(null)}
        onSave={saveEditarVenda}
      />

      {/* Dialog Ver Venda */}
      <VerVendaDialog openVenda={openVerVenda} onClose={() => setOpenVerVenda(null)} usersByAuth={usersByAuth} />

      {/* Dialog Meta Editor */}
      <Dialog open={openMetaEditor} onOpenChange={setOpenMetaEditor}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Meta anual ({year}) — {sellerName}</DialogTitle>
          </DialogHeader>

          {selectedSellerId === "__all__" ? (
            <div className="text-sm text-muted-foreground">
              Selecione um vendedor específico no topo para editar/cadastrar a meta.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 12 }).map((_, idx) => {
                  const m = idx + 1;
                  const key = `m${monthKey(m)}`;
                  return (
                    <div key={key}>
                      <Label>{key.toUpperCase()}</Label>
                      <Input
                        value={metaEdit[key] ?? "0"}
                        onChange={(e) => setMetaEdit((s) => ({ ...s, [key]: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="text-[11px] text-muted-foreground mt-2">
                ✅ Salva em <span className="font-medium">metas_vendedores</span> com <span className="font-medium">vendedor_id (users.id)</span> e <span className="font-medium">auth_user_id</span> para RBAC.
              </div>

              <DialogFooter className="gap-2 mt-4">
                <Button variant="secondary" onClick={() => setOpenMetaEditor(false)}>
                  <X className="h-4 w-4 mr-2" />
                  Fechar
                </Button>
                <Button onClick={saveMeta}>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar meta
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** ===================== Tabela ===================== */
function VendasTable({
  items,
  usersByAuth,
  onView,
  onEdit,
  canEdit,
  canEncarteirar,
  onEncarteirar,
}: {
  items: VendaRow[];
  usersByAuth: Map<string, UserRow>;
  onView: (v: VendaRow) => void;
  onEdit: (v: VendaRow) => void;
  canEdit: boolean;
  canEncarteirar: boolean;
  onEncarteirar: (v: VendaRow) => Promise<void> | void;
}) {
  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
      <CardContent className="p-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-black/20 backdrop-blur border-b border-white/10">
            <tr className="text-left">
              <th className="p-3">Cliente</th>
              <th className="p-3">Proposta</th>
              <th className="p-3">Adm/Tabela</th>
              <th className="p-3">Valor</th>
              <th className="p-3">Status</th>
              <th className="p-3">Vendedor</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((v) => {
              const vendedorNome = v.vendedor_id ? usersByAuth.get(v.vendedor_id)?.nome ?? "—" : "—";
              const codigo = (v.codigo ?? "00").trim();
              const status =
                v.encarteirada_em
                  ? codigo === "00"
                    ? "Ativa"
                    : v.inad
                    ? "Inadimplente"
                    : "Cancelada"
                  : "Pendente";

              return (
                <tr key={v.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-3">
                    <div className="font-medium">{v.nome ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{v.telefone ?? ""}</div>
                  </td>
                  <td className="p-3">{v.numero_proposta ?? "—"}</td>
                  <td className="p-3">
                    <div>{v.administradora ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{v.tabela ?? ""}</div>
                  </td>
                  <td className="p-3">{currency(v.valor_venda)}</td>
                  <td className="p-3">
                    <Badge className="bg-white/10 border-white/10 text-white">{status}</Badge>
                    {v.encarteirada_em && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Encarteirada: {formatDateBR(v.encarteirada_em)}
                      </div>
                    )}
                  </td>
                  <td className="p-3">{vendedorNome}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="secondary" className="bg-white/10 border border-white/10" onClick={() => onView(v)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canEdit && (
                        <Button variant="secondary" className="bg-white/10 border border-white/10" onClick={() => onEdit(v)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canEncarteirar && (
                        <Button className="gap-2" onClick={() => onEncarteirar(v)}>
                          <ArrowRightLeft className="h-4 w-4" />
                          Encarteirar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** ===================== Dialog Editar ===================== */
function EditarVendaDialog({
  openVenda,
  onClose,
  onSave,
}: {
  openVenda: VendaRow | null;
  onClose: () => void;
  onSave: (v: VendaRow, patch: Partial<VendaForm>) => Promise<void>;
}) {
  const [local, setLocal] = useState<Partial<VendaForm>>({});

  useEffect(() => {
    if (!openVenda) return;
    setLocal({
      data_venda: openVenda.data_venda ?? "",
      segmento: openVenda.segmento ?? "",
      produto: openVenda.produto ?? "",
      administradora: openVenda.administradora ?? "",
      tabela: openVenda.tabela ?? "",
      forma_venda: openVenda.forma_venda ?? "",
      numero_proposta: openVenda.numero_proposta ?? "",
      valor_venda: openVenda.valor_venda != null ? String(openVenda.valor_venda).replace(".", ",") : "",
      telefone: openVenda.telefone ?? "",
      email: openVenda.email ?? "",
      descricao: openVenda.descricao ?? "",
    });
  }, [openVenda]);

  if (!openVenda) return null;

  return (
    <Dialog open={!!openVenda} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar venda</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Data</Label>
            <Input
              type="date"
              value={local.data_venda ?? ""}
              onChange={(e) => setLocal((s) => ({ ...s, data_venda: e.target.value }))}
            />
          </div>
          <div>
            <Label>Nº Proposta</Label>
            <Input
              value={local.numero_proposta ?? ""}
              onChange={(e) => setLocal((s) => ({ ...s, numero_proposta: e.target.value }))}
            />
          </div>
          <div>
            <Label>Administradora</Label>
            <Input
              value={local.administradora ?? ""}
              onChange={(e) => setLocal((s) => ({ ...s, administradora: e.target.value }))}
            />
          </div>
          <div>
            <Label>Tabela</Label>
            <Input value={local.tabela ?? ""} onChange={(e) => setLocal((s) => ({ ...s, tabela: e.target.value }))} />
          </div>
          <div>
            <Label>Produto</Label>
            <Input value={local.produto ?? ""} onChange={(e) => setLocal((s) => ({ ...s, produto: e.target.value }))} />
          </div>
          <div>
            <Label>Segmento</Label>
            <Input value={local.segmento ?? ""} onChange={(e) => setLocal((s) => ({ ...s, segmento: e.target.value }))} />
          </div>
          <div>
            <Label>Forma de venda</Label>
            <Input
              value={local.forma_venda ?? ""}
              onChange={(e) => setLocal((s) => ({ ...s, forma_venda: e.target.value }))}
            />
          </div>
          <div>
            <Label>Valor venda</Label>
            <Input
              value={local.valor_venda ?? ""}
              onChange={(e) => setLocal((s) => ({ ...s, valor_venda: e.target.value }))}
              placeholder="Ex: 1300000,00"
            />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={local.telefone ?? ""} onChange={(e) => setLocal((s) => ({ ...s, telefone: e.target.value }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={local.email ?? ""} onChange={(e) => setLocal((s) => ({ ...s, email: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Label>Descrição</Label>
            <Input value={local.descricao ?? ""} onChange={(e) => setLocal((s) => ({ ...s, descricao: e.target.value }))} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={async () => {
              await onSave(openVenda, local);
            }}
          >
            <Save className="h-4 w-4 mr-2" />
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** ===================== Dialog Ver ===================== */
function VerVendaDialog({
  openVenda,
  onClose,
  usersByAuth,
}: {
  openVenda: VendaRow | null;
  onClose: () => void;
  usersByAuth: Map<string, UserRow>;
}) {
  if (!openVenda) return null;

  const vendedorNome = openVenda.vendedor_id ? usersByAuth.get(openVenda.vendedor_id)?.nome ?? "—" : "—";

  return (
    <Dialog open={!!openVenda} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalhes da venda</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Info label="Cliente" value={openVenda.nome ?? "—"} />
          <Info label="Telefone" value={openVenda.telefone ?? "—"} />
          <Info label="Email" value={openVenda.email ?? "—"} />
          <Info label="Vendedor" value={vendedorNome} />

          <Info label="Data venda" value={formatDateBR(openVenda.data_venda)} />
          <Info label="Proposta" value={openVenda.numero_proposta ?? "—"} />

          <Info label="Administradora" value={openVenda.administradora ?? "—"} />
          <Info label="Produto" value={openVenda.produto ?? "—"} />
          <Info label="Tabela" value={openVenda.tabela ?? "—"} />
          <Info label="Segmento" value={openVenda.segmento ?? "—"} />

          <Info label="Valor" value={currency(openVenda.valor_venda)} />
          <Info label="Status" value={openVenda.encarteirada_em ? "Encarteirada" : "Pendente"} />

          <Info label="Encarteirada em" value={formatDateBR(openVenda.encarteirada_em)} />
          <Info label="Grupo / Cota" value={`${openVenda.grupo ?? "—"} / ${openVenda.cota ?? "—"}`} />

          <Info label="Código" value={openVenda.codigo ?? "—"} />
          <Info label="Cancelada em" value={formatDateBR(openVenda.cancelada_em)} />

          <Info label="Contemplada" value={openVenda.contemplada ? "Sim" : "Não"} />
          <Info label="Data contemplação" value={formatDateBR(openVenda.data_contemplacao)} />

          <Info label="Inadimplente" value={openVenda.inad ? "Sim" : "Não"} />
          <Info label="Inad em" value={formatDateBR(openVenda.inad_em)} />

          <div className="md:col-span-2">
            <Info label="Descrição" value={openVenda.descricao ?? "—"} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
