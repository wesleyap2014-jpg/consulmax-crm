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

const ALL = "__all__";

type UserRow = {
  id: string; // public.users.id
  auth_user_id: string; // auth.users.id
  nome: string | null;
  email?: string | null;
  user_role?: string | null;
  role?: string | null;
  is_active?: boolean | null;
};

type MetaRow = {
  ano: number;
  vendedor_id?: string | null;
  auth_user_id?: string | null;
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
  vendedor_id?: string | null; // (no seu CRM: costuma ser auth_user_id)
  segmento?: string | null;
  tabela?: string | null;
  administradora?: string | null;

  produto?: string | null;
  valor_venda?: number | null;

  codigo?: string | null; // '00' ativo
  encarteirada_em?: string | null; // timestamptz
  cancelada_em?: string | null; // timestamptz
  reativada_em?: string | null; // timestamptz
  contemplada?: boolean | null;
  data_contemplacao?: string | null;

  inad?: boolean | null;
  inad_em?: string | null;
  inad_revertida_em?: string | null;

  grupo?: string | null;
  cota?: string | null;

  cliente_lead_id?: string | null;
  lead_id?: string | null;
  cpf?: string | null;
  email?: string | null;
  telefone?: string | null;
  descricao?: string | null;
  status?: string | null;
};

function nowISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatDateBR(iso?: string | null) {
  if (!iso) return "-";
  // aceita "YYYY-MM-DD" ou timestamptz
  const s = String(iso);
  const datePart = s.includes("T") ? s.split("T")[0] : s;
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

function monthIndexFromISO(iso?: string | null) {
  if (!iso) return null;
  const s = String(iso);
  const datePart = s.includes("T") ? s.split("T")[0] : s;
  const parts = datePart.split("-");
  if (parts.length < 2) return null;
  const m = Number(parts[1]);
  if (!m || m < 1 || m > 12) return null;
  return m - 1;
}

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ⚠️ NÃO use "currency" pra não colidir com algo já declarado no seu projeto
function brl(v: any) {
  const n = safeNum(v);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pctHuman(v: number) {
  if (!Number.isFinite(v)) return "0%";
  return `${(v * 100).toFixed(2).replace(".", ",")}%`;
}

function isCodigoAtivo(codigo?: string | null) {
  return String(codigo || "").trim() === "00";
}

function sumArr(a: number[]) {
  return a.reduce((acc, x) => acc + safeNum(x), 0);
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export default function Carteira() {
  const today = nowISODate();
  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [authUserId, setAuthUserId] = useState<string>("");
  const [meUserRow, setMeUserRow] = useState<UserRow | null>(null);
  const isAdmin = useMemo(() => {
    const r = String(meUserRow?.role || meUserRow?.user_role || "").toLowerCase();
    return r === "admin";
  }, [meUserRow]);

  const [users, setUsers] = useState<UserRow[]>([]);
  const usersById = useMemo(() => {
    const m = new Map<string, UserRow>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  // filtro do admin
  const [selectedUserId, setSelectedUserId] = useState<string>(ALL);

  // ano das metas/gráficos
  const [year, setYear] = useState<number>(currentYear);

  // metas
  const [metaMensal, setMetaMensal] = useState<number[]>(Array(12).fill(0));

  // vendas base
  const [vendas, setVendas] = useState<VendaRow[]>([]);

  // UI: modal simples para debug
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLines, setDebugLines] = useState<string[]>([]);

  function addDebug(line: string) {
    setDebugLines((p) => [...p.slice(-80), line]);
  }

  // ---------------- LOADERS ----------------

  async function loadMe() {
    const { data: auth } = await supabase.auth.getUser();
    const auid = auth?.user?.id || "";
    setAuthUserId(auid);

    if (!auid) return;

    const { data: me, error } = await supabase
      .from("users")
      .select("id, auth_user_id, nome, email, role, user_role, is_active")
      .eq("auth_user_id", auid)
      .maybeSingle();

    if (error) {
      console.warn("[Carteira] loadMe error:", error.message);
      addDebug(`[loadMe] error: ${error.message}`);
      return;
    }
    setMeUserRow((me as any) || null);
    addDebug(`[loadMe] auth_user_id=${auid} | users.id=${(me as any)?.id || "-"}`);
  }

  async function loadUsersIfAdmin() {
    if (!isAdmin) {
      setUsers([]);
      return;
    }
    const { data, error } = await supabase
      .from("users")
      .select("id, auth_user_id, nome, email, role, user_role, is_active")
      .eq("is_active", true)
      .order("nome", { ascending: true });

    if (error) {
      console.warn("[Carteira] loadUsers error:", error.message);
      addDebug(`[loadUsers] error: ${error.message}`);
      return;
    }
    setUsers((data as any) || []);
    addDebug(`[loadUsers] ok: ${data?.length || 0} usuários`);
  }

  /**
   * ✅ AQUI é o ponto que estava te ferrando:
   * - vendedor: meta por auth_user_id = authUser.id
   * - admin: se filtrar vendedor, pega o auth_user_id dele e busca por auth_user_id também
   * - admin em "Todos": soma metas do ano inteiro (todas as linhas)
   */
  async function loadMetas() {
    if (!authUserId) return;

    // VENDEDOR (não-admin) -> SEMPRE pega a própria meta por auth_user_id
    if (!isAdmin) {
      const { data: metasRow, error: metaErr } = await supabase
        .from("metas_vendedores")
        .select("ano,m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12,auth_user_id")
        .eq("auth_user_id", authUserId)
        .eq("ano", year)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (metaErr) {
        console.warn("[Carteira] metaErr vendedor:", metaErr.message);
        addDebug(`[loadMetas vendedor] error: ${metaErr.message}`);
      } else {
        addDebug(
          `[loadMetas vendedor] ok: ano=${metasRow?.ano || year} auth_user_id=${metasRow?.auth_user_id || "-"}`
        );
      }

      const m = metasRow
        ? [
            metasRow.m01,
            metasRow.m02,
            metasRow.m03,
            metasRow.m04,
            metasRow.m05,
            metasRow.m06,
            metasRow.m07,
            metasRow.m08,
            metasRow.m09,
            metasRow.m10,
            metasRow.m11,
            metasRow.m12,
          ].map((x: any) => safeNum(x || 0))
        : Array(12).fill(0);

      setMetaMensal(m);
      return;
    }

    // ADMIN
    if (selectedUserId === ALL) {
      // soma de todas as metas do ano (admin)
      const { data, error } = await supabase
        .from("metas_vendedores")
        .select("m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12")
        .eq("ano", year);

      if (error) {
        console.warn("[Carteira] metas ALL error:", error.message);
        addDebug(`[loadMetas admin ALL] error: ${error.message}`);
        setMetaMensal(Array(12).fill(0));
        return;
      }

      const summed = Array(12).fill(0);
      (data || []).forEach((r: any) => {
        summed[0] += safeNum(r.m01);
        summed[1] += safeNum(r.m02);
        summed[2] += safeNum(r.m03);
        summed[3] += safeNum(r.m04);
        summed[4] += safeNum(r.m05);
        summed[5] += safeNum(r.m06);
        summed[6] += safeNum(r.m07);
        summed[7] += safeNum(r.m08);
        summed[8] += safeNum(r.m09);
        summed[9] += safeNum(r.m10);
        summed[10] += safeNum(r.m11);
        summed[11] += safeNum(r.m12);
      });

      setMetaMensal(summed);
      addDebug(`[loadMetas admin ALL] ok: linhas=${data?.length || 0}`);
      return;
    }

    // admin filtrando vendedor -> busca por auth_user_id do public.users selecionado
    const u = usersById.get(selectedUserId);
    const targetAuth = u?.auth_user_id;

    if (!targetAuth) {
      addDebug(`[loadMetas admin seller] sem auth_user_id para users.id=${selectedUserId}`);
      setMetaMensal(Array(12).fill(0));
      return;
    }

    const { data: metasRow, error } = await supabase
      .from("metas_vendedores")
      .select("ano,m01,m02,m03,m04,m05,m06,m07,m08,m09,m10,m11,m12,auth_user_id")
      .eq("auth_user_id", targetAuth)
      .eq("ano", year)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[Carteira] metas seller error:", error.message);
      addDebug(`[loadMetas admin seller] error: ${error.message}`);
      setMetaMensal(Array(12).fill(0));
      return;
    }

    const m = metasRow
      ? [
          metasRow.m01,
          metasRow.m02,
          metasRow.m03,
          metasRow.m04,
          metasRow.m05,
          metasRow.m06,
          metasRow.m07,
          metasRow.m08,
          metasRow.m09,
          metasRow.m10,
          metasRow.m11,
          metasRow.m12,
        ].map((x: any) => safeNum(x || 0))
      : Array(12).fill(0);

    setMetaMensal(m);
    addDebug(`[loadMetas admin seller] ok: targetAuth=${targetAuth}`);
  }

  /**
   * Vendas do ANO (pra meta mensal / realizado)
   * - Admin "Todos": pega todas
   * - Admin filtrando: filtra por auth_user_id do vendedor (vendas.vendedor_id)
   * - Vendedor: filtra por authUserId
   */
  async function loadVendasAno() {
    if (!authUserId) return;

    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    let targetVendorAuth = authUserId;
    if (isAdmin) {
      if (selectedUserId === ALL) targetVendorAuth = "";
      else targetVendorAuth = usersById.get(selectedUserId)?.auth_user_id || "";
    }

    // query base
    let q = supabase
      .from("vendas")
      .select(
        "id,data_venda,vendedor_id,segmento,tabela,administradora,produto,valor_venda,codigo,encarteirada_em,cancelada_em,reativada_em,contemplada,data_contemplacao,inad,inad_em,inad_revertida_em,grupo,cota,cliente_lead_id,lead_id,cpf,email,telefone,descricao,status"
      )
      // pega pelo menos as que impactam o ano (encarteiramento / cancelamento / venda)
      .or(
        `data_venda.gte.${start},encarteirada_em.gte.${start},cancelada_em.gte.${start}`
      )
      .or(
        `data_venda.lte.${end},encarteirada_em.lte.${end},cancelada_em.lte.${end}`
      );

    if (!isAdmin) {
      q = q.eq("vendedor_id", authUserId);
    } else if (selectedUserId !== ALL && targetVendorAuth) {
      q = q.eq("vendedor_id", targetVendorAuth);
    }

    const { data, error } = await q.order("data_venda", { ascending: false });

    if (error) {
      console.warn("[Carteira] loadVendasAno error:", error.message);
      addDebug(`[loadVendasAno] error: ${error.message}`);
      setVendas([]);
      return;
    }

    setVendas((data as any) || []);
    addDebug(
      `[loadVendasAno] ok: ${data?.length || 0} vendas (ano=${year}) filtro=${
        isAdmin ? (selectedUserId === ALL ? "ALL" : targetVendorAuth || "sem auth") : authUserId
      }`
    );
  }

  async function bootstrap() {
    setLoading(true);
    setDebugLines([]);

    await loadMe();
    // aguarda role/row
    setLoading(false);
  }

  async function reloadAll() {
    setRefreshing(true);
    try {
      await loadUsersIfAdmin();
      await loadMetas();
      await loadVendasAno();
    } finally {
      setRefreshing(false);
    }
  }

  // boot inicial
  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // quando role/admin carrega, carrega usuários e dados
  useEffect(() => {
    if (!authUserId) return;
    (async () => {
      await loadUsersIfAdmin();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, isAdmin]);

  // recarregar quando filtros mudam
  useEffect(() => {
    if (!authUserId) return;
    (async () => {
      await loadMetas();
      await loadVendasAno();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, isAdmin, selectedUserId, year, users.length]);

  // ---------------- KPIs / CÁLCULOS ----------------

  // realizado mensal (mesma regra que você descreveu: encarteirada ativa por encarteirada_em, menos canceladas por cancelada_em)
  const realizadoMensal = useMemo(() => {
    const arr = Array(12).fill(0);

    // 1) soma encarteiradas ativas no mês do encarteirada_em
    vendas.forEach((v) => {
      const mi = monthIndexFromISO(v.encarteirada_em);
      if (mi == null) return;
      if (isCodigoAtivo(v.codigo)) arr[mi] += safeNum(v.valor_venda);
    });

    // 2) subtrai canceladas (codigo != '00') no mês do cancelada_em
    vendas.forEach((v) => {
      const mi = monthIndexFromISO(v.cancelada_em);
      if (mi == null) return;
      // se tem cancelada_em e código já não é 00, considera cancelamento
      if (!isCodigoAtivo(v.codigo)) arr[mi] -= safeNum(v.valor_venda);
    });

    return arr.map((x) => Math.max(0, x)); // não deixa negativo visualmente
  }, [vendas]);

  const metaAnual = useMemo(() => sumArr(metaMensal), [metaMensal]);
  const realizadoAnual = useMemo(() => sumArr(realizadoMensal), [realizadoMensal]);

  const currentMonthIdx = new Date().getMonth();
  const metaMes = useMemo(() => safeNum(metaMensal[currentMonthIdx] || 0), [metaMensal, currentMonthIdx]);
  const realizadoMes = useMemo(() => safeNum(realizadoMensal[currentMonthIdx] || 0), [realizadoMensal, currentMonthIdx]);

  const pctMetaMes = useMemo(() => {
    if (metaMes <= 0) return 0;
    return clamp01(realizadoMes / metaMes);
  }, [metaMes, realizadoMes]);

  const pctMetaAnual = useMemo(() => {
    if (metaAnual <= 0) return 0;
    return clamp01(realizadoAnual / metaAnual);
  }, [metaAnual, realizadoAnual]);

  // carteira ativa (somatório das cotas ativas codigo='00')
  const carteiraAtiva = useMemo(() => {
    return vendas
      .filter((v) => isCodigoAtivo(v.codigo))
      .reduce((acc, v) => acc + safeNum(v.valor_venda), 0);
  }, [vendas]);

  const totalAtivas = useMemo(
    () => vendas.filter((v) => isCodigoAtivo(v.codigo)).length,
    [vendas]
  );
  const totalCanceladas = useMemo(
    () => vendas.filter((v) => !isCodigoAtivo(v.codigo) && !!v.cancelada_em).length,
    [vendas]
  );
  const totalContempladas = useMemo(
    () => vendas.filter((v) => !!v.contemplada).length,
    [vendas]
  );
  const totalInad = useMemo(() => vendas.filter((v) => !!v.inad).length, [vendas]);

  const chartMetaMes = useMemo(() => {
    const done = safeNum(realizadoMes);
    const rest = Math.max(0, safeNum(metaMes) - done);
    return [
      { name: "Realizado", value: done },
      { name: "Falta", value: rest },
    ];
  }, [metaMes, realizadoMes]);

  const chartMetaAnual = useMemo(() => {
    const done = safeNum(realizadoAnual);
    const rest = Math.max(0, safeNum(metaAnual) - done);
    return [
      { name: "Realizado", value: done },
      { name: "Falta", value: rest },
    ];
  }, [metaAnual, realizadoAnual]);

  const chartLinha = useMemo(() => {
    const labels = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return labels.map((lab, i) => ({
      mes: lab,
      meta: safeNum(metaMensal[i]),
      realizado: safeNum(realizadoMensal[i]),
    }));
  }, [metaMensal, realizadoMensal]);

  // ---------------- RENDER ----------------

  const headerTitle = useMemo(() => {
    if (!isAdmin) return "Carteira";
    if (selectedUserId === ALL) return "Carteira • Todos";
    const u = usersById.get(selectedUserId);
    return `Carteira • ${u?.nome || "Vendedor"}`;
  }, [isAdmin, selectedUserId, usersById]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-white">{headerTitle}</h1>
          <p className="text-sm text-white/60">
            Ano: <span className="text-white/80 font-medium">{year}</span> • Hoje:{" "}
            <span className="text-white/80 font-medium">{formatDateBR(today)}</span>
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          {isAdmin && (
            <div className="min-w-[220px]">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome || u.email || u.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="min-w-[140px]">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={reloadAll}
            className="bg-white/10 hover:bg-white/15 text-white"
            disabled={refreshing || loading}
            title="Atualizar"
          >
            {refreshing ? "Atualizando..." : "Atualizar"}
          </Button>

          <Button
            onClick={() => setDebugOpen(true)}
            variant="outline"
            className="border-white/15 text-white/80 hover:text-white hover:bg-white/10"
            title="Debug"
          >
            Debug
          </Button>
        </div>
      </div>

      {/* Linha separadora SEM componente Separator */}
      <div className="h-px w-full bg-white/10" />

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white/80 text-sm">Carteira ativa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold text-white">{brl(carteiraAtiva)}</div>
            <div className="text-xs text-white/60 mt-1">
              Ativas: <span className="text-white/80">{totalAtivas}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white/80 text-sm">Canceladas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold text-white">{totalCanceladas}</div>
            <div className="text-xs text-white/60 mt-1">No ano selecionado</div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white/80 text-sm">Contempladas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold text-white">{totalContempladas}</div>
            <div className="text-xs text-white/60 mt-1">Flag contemplada</div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white/80 text-sm">Inadimplentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold text-white">{totalInad}</div>
            <div className="text-xs text-white/60 mt-1">Flag inad</div>
          </CardContent>
        </Card>
      </div>

      {/* Metas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white/80 text-sm">Meta do mês</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs text-white/60">Meta</div>
                <div className="text-lg font-semibold text-white">{brl(metaMes)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/60">Realizado</div>
                <div className="text-lg font-semibold text-white">{brl(realizadoMes)}</div>
              </div>
            </div>

            <div className="h-44 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartMetaMes}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="70%"
                    outerRadius="90%"
                    paddingAngle={2}
                  >
                    <Cell />
                    <Cell />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-xs text-white/60">Meta realizada</div>
                <div className="text-2xl font-bold text-white">{pctHuman(pctMetaMes)}</div>
              </div>
            </div>

            <div className="text-xs text-white/60">
              Se a meta está 0, então não tem como calcular % — nesse caso, cadastre/ajuste a meta.
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white/80 text-sm">Meta anual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs text-white/60">Meta</div>
                <div className="text-lg font-semibold text-white">{brl(metaAnual)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/60">Realizado</div>
                <div className="text-lg font-semibold text-white">{brl(realizadoAnual)}</div>
              </div>
            </div>

            <div className="h-44 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartMetaAnual}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="70%"
                    outerRadius="90%"
                    paddingAngle={2}
                  >
                    <Cell />
                    <Cell />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-xs text-white/60">Meta realizada</div>
                <div className="text-2xl font-bold text-white">{pctHuman(pctMetaAnual)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white/80 text-sm">Meta x Realizado (mês a mês)</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartLinha}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="mes" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }} />
                <Tooltip
                  formatter={(val: any, name: any) => [brl(val), name]}
                  contentStyle={{
                    background: "rgba(15,23,42,0.95)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10,
                    color: "white",
                  }}
                />
                <Line type="monotone" dataKey="meta" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="realizado" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Lista resumida de vendas do ano (pra você validar rápido) */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-white/80 text-sm">
            Vendas do ano (amostra) • {vendas.length} registros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/60">
                  <th className="text-left py-2 pr-3">Data</th>
                  <th className="text-left py-2 pr-3">Admin</th>
                  <th className="text-left py-2 pr-3">Tabela</th>
                  <th className="text-left py-2 pr-3">Valor</th>
                  <th className="text-left py-2 pr-3">Código</th>
                  <th className="text-left py-2 pr-3">Encarteirada</th>
                  <th className="text-left py-2 pr-3">Cancelada</th>
                </tr>
              </thead>
              <tbody className="text-white/80">
                {vendas.slice(0, 12).map((v) => (
                  <tr key={v.id} className="border-t border-white/10">
                    <td className="py-2 pr-3">{formatDateBR(v.data_venda)}</td>
                    <td className="py-2 pr-3">{v.administradora || "-"}</td>
                    <td className="py-2 pr-3">{v.tabela || "-"}</td>
                    <td className="py-2 pr-3">{brl(v.valor_venda)}</td>
                    <td className="py-2 pr-3">
                      {isCodigoAtivo(v.codigo) ? (
                        <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-500/20">
                          00 (ativa)
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-500/15 text-rose-200 border-rose-500/20">
                          {String(v.codigo || "-")}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3">{formatDateBR(v.encarteirada_em)}</td>
                    <td className="py-2 pr-3">{formatDateBR(v.cancelada_em)}</td>
                  </tr>
                ))}
                {vendas.length === 0 && (
                  <tr>
                    <td className="py-3 text-white/60" colSpan={7}>
                      Nenhuma venda carregada (ver Debug).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* CTA simples */}
          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-white/60">
              Se o vendedor estiver vendo meta 0, abra o Debug e veja a linha do <b>loadMetas</b>.
            </div>
            <Button
              onClick={reloadAll}
              className="bg-white/10 hover:bg-white/15 text-white"
              disabled={refreshing || loading}
            >
              Recarregar dados
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* DEBUG */}
      <Dialog open={debugOpen} onOpenChange={setDebugOpen}>
        <DialogContent className="max-w-3xl bg-slate-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Debug • Carteira</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <div className="text-xs text-white/70">
              <div>
                <b>authUserId:</b> {authUserId || "-"} • <b>isAdmin:</b>{" "}
                {String(isAdmin)} • <b>selectedUserId:</b> {selectedUserId}
              </div>
              <div>
                <b>metaMensal:</b> {metaMensal.map((x) => safeNum(x).toFixed(0)).join(" | ")}
              </div>
            </div>

            <div className="h-[360px] overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
              {debugLines.length === 0 ? (
                <div className="text-white/60">Sem logs ainda.</div>
              ) : (
                <div className="space-y-1">
                  {debugLines.map((l, i) => (
                    <div key={i} className="text-white/80">
                      {l}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="border-white/15 text-white hover:bg-white/10"
              onClick={() => {
                setDebugLines([]);
              }}
            >
              Limpar
            </Button>
            <Button
              className="bg-white/10 hover:bg-white/15 text-white"
              onClick={() => setDebugOpen(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
