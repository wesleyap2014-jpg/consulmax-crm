// src/pages/Relatorios.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type UserRow = {
  id: string;
  auth_user_id: string | null;
  nome: string | null;
  role?: string | null; // enum user_role (novo)
  user_role?: string | null; // legado (text)
  is_active?: boolean | null;
};

type LeadRow = {
  id: string;
  nome: string | null;
  telefone?: string | null;
  email?: string | null;
};

type VendaRow = {
  id: string;
  data_venda?: string | null; // date
  vendedor_id?: string | null; // <-- ATENÇÃO: no seu caso é AUTH USER ID (auth.users.id)
  segmento?: string | null;
  tabela?: string | null;
  administradora?: string | null;
  produto?: string | null;
  valor_venda?: number | null;

  codigo?: string | null; // '00' ativa
  encarteirada_em?: string | null; // timestamptz
  cancelada_em?: string | null; // timestamptz
  inad?: boolean | null;
  inad_em?: string | null; // timestamptz
  inad_revertida_em?: string | null;
  contemplada?: boolean | null;
  data_contemplacao?: string | null;

  lead_id?: string | null; // vínculo
  cliente_lead_id?: string | null; // se existir no seu schema
  numero_proposta?: string | null;

  status?: string | null;
};

const C = {
  rubi: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
  gold2: "#E0CE8C",
};

const ALL = "__all__";

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function brDate(iso?: string | null) {
  if (!iso) return "-";
  // suporta "YYYY-MM-DD" e timestamptz
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, day] = iso.split("-");
      return `${day}/${m}/${y}`;
    }
    return iso;
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function moneyBR(v?: number | null) {
  const n = Number(v ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pctHuman2(value01?: number | null) {
  // value01 em fração (0.1025 -> 10,25%)
  const v = Number(value01 ?? 0) * 100;
  return `${v.toFixed(2).replace(".", ",")}%`;
}

function pctHumanFrom100(value100?: number | null) {
  // value100 em 0..100
  const v = Number(value100 ?? 0);
  return `${v.toFixed(2).replace(".", ",")}%`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function monthsDiff(fromISO: string, to: Date) {
  const d = new Date(fromISO);
  if (Number.isNaN(d.getTime())) return null;
  let months = (to.getFullYear() - d.getFullYear()) * 12 + (to.getMonth() - d.getMonth());
  // ajusta se o dia do mês ainda não passou
  if (to.getDate() < d.getDate()) months -= 1;
  return months;
}

type ExportKind = "vendas" | "canceladas" | "contempladas" | "inadimplentes";
type ExportDateField = "data_venda" | "cancelada_em" | "inad_em" | "data_contemplacao";

export default function Relatorios() {
  // ========= Auth / RBAC =========
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [me, setMe] = useState<UserRow | null>(null);
  const isAdmin = useMemo(() => {
    const r = (me?.role ?? me?.user_role ?? "").toLowerCase();
    return r === "admin";
  }, [me]);

  // ========= Base data =========
  const [users, setUsers] = useState<UserRow[]>([]);
  const [vendas, setVendas] = useState<VendaRow[]>([]);
  const [leadsById, setLeadsById] = useState<Record<string, LeadRow>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ========= Filtros =========
  const now = useMemo(() => new Date(), []);
  const defaultEnd = useMemo(() => toYMD(now), [now]);
  const defaultStart = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return toYMD(d);
  }, [now]);

  const [dateStart, setDateStart] = useState<string>(defaultStart);
  const [dateEnd, setDateEnd] = useState<string>(defaultEnd);

  // Admin seleciona users.id (como você já fazia)
  const [selectedSeller, setSelectedSeller] = useState<string>(ALL);

  const [segmento, setSegmento] = useState<string>(ALL);
  const [tabela, setTabela] = useState<string>(ALL);
  const [tipo, setTipo] = useState<string>(ALL); // Normal/Contemplada/Bolsão etc (se usar)
  const [somenteAtivas, setSomenteAtivas] = useState<boolean>(false);

  // ========= Export overlay =========
  const [exportOpen, setExportOpen] = useState(false);
  const [exportKind, setExportKind] = useState<ExportKind>("vendas");
  const [exportDateField, setExportDateField] = useState<ExportDateField>("data_venda");
  const exportTableRef = useRef<HTMLTableElement | null>(null);
  const [exportRows, setExportRows] = useState<VendaRow[]>([]);
  const [exportLoading, setExportLoading] = useState(false);

  // ========= Maps IMPORTANTES =========
  const usersById = useMemo(() => {
    const m: Record<string, UserRow> = {};
    for (const u of users) m[u.id] = u;
    return m;
  }, [users]);

  // ✅ CORREÇÃO PRINCIPAL (nome do vendedor e filtros): map por AUTH USER ID
  const usersByAuthId = useMemo(() => {
    const m: Record<string, UserRow> = {};
    for (const u of users) {
      if (u.auth_user_id) m[u.auth_user_id] = u;
    }
    return m;
  }, [users]);

  // ✅ CORREÇÃO PRINCIPAL (filtro do admin): selectedSeller é users.id, mas vendas.vendedor_id é auth_user_id
  const selectedAuthUserId = useMemo(() => {
    if (!isAdmin) return authUserId;
    if (selectedSeller === ALL) return null;
    return usersById[selectedSeller]?.auth_user_id ?? null;
  }, [isAdmin, selectedSeller, usersById, authUserId]);

  const visibleSellerLabel = useMemo(() => {
    if (!isAdmin) return me?.nome ?? "Meu acesso";
    if (selectedSeller === ALL) return "Todos";
    const u = usersById[selectedSeller];
    return u?.nome ?? "Vendedor";
  }, [isAdmin, selectedSeller, usersById, me]);

  // ========= Carregamento inicial =========
  useEffect(() => {
    (async () => {
      setError(null);
      const { data: authRes, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        setError(authErr.message);
        return;
      }
      const uid = authRes.user?.id ?? null;
      setAuthUserId(uid);

      if (!uid) {
        setError("Usuário não autenticado.");
        return;
      }

      // perfil do usuário logado
      const { data: meRow, error: meErr } = await supabase
        .from("users")
        .select("id,auth_user_id,nome,role,user_role,is_active")
        .eq("auth_user_id", uid)
        .maybeSingle();

      if (meErr) {
        setError(meErr.message);
        return;
      }
      setMe(meRow ?? null);

      // lista de usuários ativos (para admin filtrar e para resolver nomes)
      const { data: usersRows, error: usersErr } = await supabase
        .from("users")
        .select("id,auth_user_id,nome,role,user_role,is_active")
        .eq("is_active", true);

      if (usersErr) {
        setError(usersErr.message);
        return;
      }
      setUsers(usersRows ?? []);
    })();
  }, []);

  // ========= Fetch principal (painel) =========
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Range
      const startISO = `${dateStart}T00:00:00.000Z`;
      const endISO = `${dateEnd}T23:59:59.999Z`;

      let q = supabase
        .from("vendas")
        .select(
          [
            "id",
            "data_venda",
            "vendedor_id",
            "segmento",
            "tabela",
            "administradora",
            "produto",
            "valor_venda",
            "codigo",
            "encarteirada_em",
            "cancelada_em",
            "inad",
            "inad_em",
            "inad_revertida_em",
            "contemplada",
            "data_contemplacao",
            "lead_id",
            "cliente_lead_id",
            "numero_proposta",
            "status",
            "tipo_venda",
          ].join(",")
        )
        // data base do relatório (principal): data_venda
        .gte("data_venda", dateStart)
        .lte("data_venda", dateEnd)
        .order("data_venda", { ascending: false });

      // RBAC
      if (selectedAuthUserId) {
        q = q.eq("vendedor_id", selectedAuthUserId);
      }

      // filtros
      if (segmento !== ALL) q = q.eq("segmento", segmento);
      if (tabela !== ALL) q = q.eq("tabela", tabela);
      if (tipo !== ALL) q = q.eq("tipo_venda", tipo);
      if (somenteAtivas) q = q.eq("codigo", "00");

      const { data, error: qErr } = await q;
      if (qErr) throw qErr;

      const rows = (data ?? []) as VendaRow[];
      setVendas(rows);

      // carregar leads vinculados para nome/telefone
      const leadIds = Array.from(
        new Set(
          rows
            .map((r) => r.lead_id || r.cliente_lead_id)
            .filter(Boolean) as string[]
        )
      );

      if (leadIds.length) {
        const { data: leads, error: lErr } = await supabase
          .from("leads")
          .select("id,nome,telefone,email")
          .in("id", leadIds);

        if (lErr) throw lErr;

        const map: Record<string, LeadRow> = {};
        for (const l of leads ?? []) map[l.id] = l;
        setLeadsById(map);
      } else {
        setLeadsById({});
      }
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar relatórios.");
    } finally {
      setLoading(false);
    }
  }, [dateStart, dateEnd, selectedAuthUserId, segmento, tabela, tipo, somenteAtivas]);

  useEffect(() => {
    if (!authUserId) return;
    fetchDashboard();
  }, [authUserId, fetchDashboard]);

  // ========= Valores únicos p/ filtros =========
  const segmentos = useMemo(() => {
    const s = new Set<string>();
    for (const v of vendas) if (v.segmento) s.add(v.segmento);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [vendas]);

  const tabelas = useMemo(() => {
    const s = new Set<string>();
    for (const v of vendas) if (v.tabela) s.add(v.tabela);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [vendas]);

  const tiposVenda = useMemo(() => {
    const s = new Set<string>();
    for (const v of vendas as any[]) if (v?.tipo_venda) s.add(String(v.tipo_venda));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [vendas]);

  // ========= KPIs =========
  const kpis = useMemo(() => {
    const totalVendido = vendas.reduce((acc, v) => acc + Number(v.valor_venda ?? 0), 0);
    const totalCarteiraAtiva = vendas
      .filter((v) => (v.codigo ?? "") === "00")
      .reduce((acc, v) => acc + Number(v.valor_venda ?? 0), 0);

    const totalCancelado = vendas
      .filter((v) => (v.codigo ?? "") !== "00")
      .reduce((acc, v) => acc + Number(v.valor_venda ?? 0), 0);

    const inadCount = vendas.filter((v) => !!v.inad).length;
    const totalCount = vendas.length || 1;
    const inadPct = inadCount / totalCount; // 0..1

    return {
      totalVendido,
      totalCarteiraAtiva,
      totalCancelado,
      inadCount,
      totalCount,
      inadPct,
    };
  }, [vendas]);

  // ========= Segmentos (donut) =========
  const bySegmento = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vendas) {
      const key = v.segmento ?? "—";
      m.set(key, (m.get(key) ?? 0) + Number(v.valor_venda ?? 0));
    }
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [vendas]);

  // ========= Tabelas (barras) =========
  const byTabela = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vendas) {
      const key = v.tabela ?? "—";
      m.set(key, (m.get(key) ?? 0) + Number(v.valor_venda ?? 0));
    }
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [vendas]);

  // ========= Concentração por cliente (Pareto TOP10) =========
  const paretoTop10 = useMemo(() => {
    const m = new Map<string, { clienteId: string; cliente: string; value: number }>();
    for (const v of vendas) {
      const cid = (v.lead_id || v.cliente_lead_id || "sem_cliente") as string;
      const lead = leadsById[cid];
      const nome = lead?.nome ?? (cid === "sem_cliente" ? "Sem Cliente" : "—");
      const cur = m.get(cid);
      const add = Number(v.valor_venda ?? 0);
      if (!cur) m.set(cid, { clienteId: cid, cliente: nome, value: add });
      else cur.value += add;
    }

    const arr = Array.from(m.values()).sort((a, b) => b.value - a.value);
    const total = arr.reduce((acc, it) => acc + it.value, 0) || 1;

    let cum = 0;
    const top = arr.slice(0, 10).map((it) => {
      const p = it.value / total; // 0..1
      cum += p;
      return {
        clienteId: it.clienteId,
        cliente: it.cliente,
        value: it.value,
        pct: p, // 0..1
        cumPct: clamp(cum, 0, 1), // 0..1
      };
    });

    return { top, total };
  }, [vendas, leadsById]);

  // ========= Curva de Lorenz (concentração) =========
  const lorenz = useMemo(() => {
    // ordena do menor p/ maior
    const values = vendas
      .map((v) => Number(v.valor_venda ?? 0))
      .filter((n) => n > 0)
      .sort((a, b) => a - b);

    const n = values.length;
    if (!n) return [];

    const total = values.reduce((acc, x) => acc + x, 0) || 1;
    let cum = 0;

    // pontos (0..1, 0..1)
    const pts: { x: number; y: number }[] = [{ x: 0, y: 0 }];
    for (let i = 0; i < n; i++) {
      cum += values[i];
      pts.push({
        x: (i + 1) / n,
        y: cum / total,
      });
    }
    return pts;
  }, [vendas]);

  // ========= Inadimplência por faixa de meses =========
  const inadBuckets = useMemo(() => {
    const today = new Date();
    const inadRows = vendas.filter((v) => !!v.inad && !!v.inad_em);

    const mk = (label: string) => ({ label, qtd: 0, valor: 0 });

    const b126 = mk("12–6 meses");
    const b82 = mk("8–2 meses");
    const bOut = mk("Outros");

    for (const v of inadRows) {
      const m = monthsDiff(v.inad_em as string, today);
      const val = Number(v.valor_venda ?? 0);
      if (m == null) continue;

      if (m >= 6 && m <= 12) {
        b126.qtd += 1;
        b126.valor += val;
      } else if (m >= 2 && m <= 8) {
        b82.qtd += 1;
        b82.valor += val;
      } else {
        bOut.qtd += 1;
        bOut.valor += val;
      }
    }

    return [b126, b82, bOut];
  }, [vendas]);

  // ========= Helpers (vendedor nome corrigido) =========
  const vendedorNome = useCallback(
    (v: VendaRow) => {
      const authId = v.vendedor_id ?? "";
      // ✅ aqui está a correção: resolve por usersByAuthId, não usersById
      return usersByAuthId[authId]?.nome ?? "-";
    },
    [usersByAuthId]
  );

  // ========= Export =========
  const buildExportQuery = useCallback(async () => {
    setExportLoading(true);
    setError(null);
    try {
      let q = supabase
        .from("vendas")
        .select(
          [
            "id",
            "data_venda",
            "vendedor_id",
            "segmento",
            "tabela",
            "administradora",
            "produto",
            "valor_venda",
            "codigo",
            "encarteirada_em",
            "cancelada_em",
            "inad",
            "inad_em",
            "inad_revertida_em",
            "contemplada",
            "data_contemplacao",
            "lead_id",
            "cliente_lead_id",
            "numero_proposta",
            "status",
            "tipo_venda",
            "grupo",
            "cota",
          ].join(",")
        )
        .order("data_venda", { ascending: false });

      // RBAC
      if (selectedAuthUserId) q = q.eq("vendedor_id", selectedAuthUserId);

      // filtros globais (segmento/tabela/tipo)
      if (segmento !== ALL) q = q.eq("segmento", segmento);
      if (tabela !== ALL) q = q.eq("tabela", tabela);
      if (tipo !== ALL) q = q.eq("tipo_venda", tipo);

      // filtro por tipo de export
      if (exportKind === "vendas") {
        q = q.gte("data_venda", dateStart).lte("data_venda", dateEnd);
      } else {
        // usa campo selecionado para data
        const field = exportDateField;
        // data_venda é date; outros são timestamptz
        if (field === "data_venda" || field === "data_contemplacao") {
          q = q.gte(field, dateStart).lte(field, dateEnd);
        } else {
          q = q
            .gte(field, `${dateStart}T00:00:00.000Z`)
            .lte(field, `${dateEnd}T23:59:59.999Z`);
        }

        if (exportKind === "canceladas") {
          q = q.neq("codigo", "00"); // canceladas/códigos != 00
        }
        if (exportKind === "contempladas") {
          q = q.eq("contemplada", true);
        }
        if (exportKind === "inadimplentes") {
          q = q.eq("inad", true);
        }
      }

      const { data, error: qErr } = await q;
      if (qErr) throw qErr;

      const rows = (data ?? []) as VendaRow[];
      setExportRows(rows);

      // carregar leads para export
      const leadIds = Array.from(
        new Set(
          rows
            .map((r) => r.lead_id || r.cliente_lead_id)
            .filter(Boolean) as string[]
        )
      );

      if (leadIds.length) {
        const { data: leads, error: lErr } = await supabase
          .from("leads")
          .select("id,nome,telefone,email")
          .in("id", leadIds);

        if (lErr) throw lErr;

        const map: Record<string, LeadRow> = {};
        for (const l of leads ?? []) map[l.id] = l;
        setLeadsById((prev) => ({ ...prev, ...map }));
      }
    } catch (e: any) {
      setError(e?.message ?? "Erro ao extrair relatório.");
    } finally {
      setExportLoading(false);
    }
  }, [
    selectedAuthUserId,
    segmento,
    tabela,
    tipo,
    exportKind,
    exportDateField,
    dateStart,
    dateEnd,
  ]);

  const downloadXLS = useCallback(() => {
    // Export “XLS” simples via HTML table
    const table = exportTableRef.current;
    if (!table) return;

    const html = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          ${table.outerHTML}
        </body>
      </html>
    `.trim();

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    const stamp = `${dateStart}_a_${dateEnd}`.replaceAll("-", "");
    a.download = `relatorio_${exportKind}_${stamp}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [exportKind, dateStart, dateEnd]);

  // ========= UI =========
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: C.navy }}>
            Relatórios
          </h1>
          <div className="text-sm text-muted-foreground">
            Visão: <b>{visibleSellerLabel}</b>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => fetchDashboard()}
            disabled={loading}
            className="border-black/10"
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </Button>

          <Button
            onClick={() => setExportOpen(true)}
            className="text-white"
            style={{ background: C.navy }}
          >
            Extrair Relatório
          </Button>
        </div>
      </div>

      {error ? (
        <div className="p-3 rounded-md border border-red-200 bg-red-50 text-red-700">
          {error}
        </div>
      ) : null}

      <Card className="border-black/10">
        <CardHeader className="pb-2">
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="space-y-1">
            <Label>De</Label>
            <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Até</Label>
            <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
          </div>

          {isAdmin ? (
            <div className="space-y-1">
              <Label>Vendedor</Label>
              <Select value={selectedSeller} onValueChange={setSelectedSeller}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {users
                    .filter((u) => (u.role ?? u.user_role ?? "").toLowerCase() !== "viewer")
                    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? ""))
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome ?? "—"}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                (Filtro usa <b>users.id</b>, mas aplica em vendas por <b>auth_user_id</b> ✅)
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Vendedor</Label>
              <div className="h-10 px-3 rounded-md border border-black/10 flex items-center text-sm">
                {me?.nome ?? "Meu acesso"}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Segmento</Label>
            <Select value={segmento} onValueChange={setSegmento}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {segmentos.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Tabela</Label>
            <Select value={tabela} onValueChange={setTabela}>
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {tabelas.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {tiposVenda.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="mt-2 flex items-center gap-2">
              <input
                id="ativas"
                type="checkbox"
                checked={somenteAtivas}
                onChange={(e) => setSomenteAtivas(e.target.checked)}
              />
              <Label htmlFor="ativas" className="cursor-pointer">
                Somente ativas (código 00)
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <Card className="border-black/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Carteira Ativa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold" style={{ color: C.navy }}>
              {moneyBR(kpis.totalCarteiraAtiva)}
            </div>
            <div className="text-xs text-muted-foreground">
              Base: vendas filtradas | código = 00
            </div>
          </CardContent>
        </Card>

        <Card className="border-black/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Vendido (período)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold" style={{ color: C.navy }}>
              {moneyBR(kpis.totalVendido)}
            </div>
            <div className="text-xs text-muted-foreground">Base: vendas filtradas</div>
          </CardContent>
        </Card>

        <Card className="border-black/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cancelado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold" style={{ color: C.navy }}>
              {moneyBR(kpis.totalCancelado)}
            </div>
            <div className="text-xs text-muted-foreground">Base: código != 00</div>
          </CardContent>
        </Card>

        <Card className="border-black/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">% Inadimplência</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold" style={{ color: C.navy }}>
              {pctHuman2(kpis.inadPct)}
            </div>
            <div className="text-xs text-muted-foreground">
              {kpis.inadCount} de {kpis.totalCount} vendas
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="segmentos" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="segmentos">Segmentos</TabsTrigger>
          <TabsTrigger value="tabelas">Tabelas</TabsTrigger>
          <TabsTrigger value="inad">Inadimplência</TabsTrigger>
          <TabsTrigger value="concentracao">Concentração</TabsTrigger>
          <TabsTrigger value="lista">Lista</TabsTrigger>
        </TabsList>

        <TabsContent value="segmentos" className="mt-3">
          <Card className="border-black/10">
            <CardHeader className="pb-2">
              <CardTitle>Distribuição por Segmento</CardTitle>
            </CardHeader>
            <CardContent className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={bySegmento}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={70}
                    outerRadius={120}
                    paddingAngle={2}
                  >
                    {bySegmento.map((_, idx) => (
                      <Cell
                        key={`c-${idx}`}
                        fill={[C.navy, C.rubi, C.gold, C.gold2, "#64748b", "#94a3b8"][idx % 6]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any, name: any) => [moneyBR(Number(val)), String(name)]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tabelas" className="mt-3">
          <Card className="border-black/10">
            <CardHeader className="pb-2">
              <CardTitle>Top Tabelas (por valor)</CardTitle>
            </CardHeader>
            <CardContent className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byTabela}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" hide />
                  <YAxis tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => moneyBR(Number(v))} />
                  <Legend />
                  <Bar dataKey="value" name="Valor" fill={C.navy} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="text-xs text-muted-foreground mt-2">
                Mostrando as 12 maiores.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inad" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="border-black/10">
              <CardHeader className="pb-2">
                <CardTitle>Inadimplência por Faixa</CardTitle>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inadBuckets}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="qtd" name="Qtde" fill={C.rubi} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-black/10">
              <CardHeader className="pb-2">
                <CardTitle>Valor (Inadimplência) por Faixa</CardTitle>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inadBuckets}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => moneyBR(Number(v))} />
                    <Legend />
                    <Bar dataKey="valor" name="Valor" fill={C.navy} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="concentracao" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="border-black/10">
              <CardHeader className="pb-2">
                <CardTitle>Pareto (Top 10 Clientes)</CardTitle>
              </CardHeader>
              <CardContent className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paretoTop10.top}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="cliente" hide />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(v) => pctHumanFrom100(Number(v) * 100)}
                    />
                    <Tooltip
                      formatter={(val: any, name: any) => {
                        if (name === "Participação") return [pctHuman2(Number(val)), name];
                        if (name === "Acumulado") return [pctHuman2(Number(val)), name];
                        return [moneyBR(Number(val)), name];
                      }}
                    />
                    <Legend />
                    <Bar
                      yAxisId="left"
                      dataKey="value"
                      name="Valor"
                      fill={C.navy}
                      radius={[8, 8, 0, 0]}
                    />
                    {/* ✅ Percentuais em “porcentagem humana”, 2 casas, vírgula */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="cumPct"
                      name="Acumulado"
                      stroke={C.rubi}
                      dot={false}
                      strokeWidth={2}
                    />
                  </BarChart>
                </ResponsiveContainer>
                <div className="text-xs text-muted-foreground mt-2">
                  Total base: <b>{moneyBR(paretoTop10.total)}</b> | “Acumulado” é % humano (2 casas).
                </div>
              </CardContent>
            </Card>

            <Card className="border-black/10">
              <CardHeader className="pb-2">
                <CardTitle>Curva de Lorenz (Concentração)</CardTitle>
              </CardHeader>
              <CardContent className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lorenz}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="x"
                      tickFormatter={(v) => pctHumanFrom100(Number(v) * 100)}
                    />
                    <YAxis
                      tickFormatter={(v) => pctHumanFrom100(Number(v) * 100)}
                    />
                    <Tooltip
                      formatter={(v: any, name: any) => [
                        pctHuman2(Number(v)),
                        name === "y" ? "Acumulado" : "População",
                      ]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="y"
                      name="Acumulado"
                      stroke={C.navy}
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="x"
                      name="Linha de igualdade"
                      stroke={C.gold}
                      dot={false}
                      strokeDasharray="6 6"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="lista" className="mt-3">
          <Card className="border-black/10">
            <CardHeader className="pb-2">
              <CardTitle>Vendas (amostra)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto rounded-md border border-black/10">
                <table className="min-w-[1100px] w-full text-sm">
                  <thead className="bg-black/5">
                    <tr>
                      <th className="text-left p-2">Data</th>
                      <th className="text-left p-2">Cliente</th>
                      <th className="text-left p-2">Vendedor</th>
                      <th className="text-left p-2">Segmento</th>
                      <th className="text-left p-2">Tabela</th>
                      <th className="text-left p-2">Proposta</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-right p-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendas.slice(0, 80).map((v) => {
                      const cid = (v.lead_id || v.cliente_lead_id || "") as string;
                      const lead = cid ? leadsById[cid] : null;
                      const clienteNome = lead?.nome ?? "—";
                      const proposta = v.numero_proposta ?? "—";
                      const st = v.codigo === "00" ? "Ativa" : (v.inad ? "Inadimplente" : "Cancelada");
                      return (
                        <tr key={v.id} className="border-t border-black/5">
                          <td className="p-2">{brDate(v.data_venda ?? null)}</td>
                          <td className="p-2">
                            <div className="font-medium">{clienteNome}</div>
                            <div className="text-xs text-muted-foreground">
                              {lead?.telefone ?? ""}
                            </div>
                          </td>
                          <td className="p-2">
                            {/* ✅ Aqui também: resolve por auth_user_id */}
                            {vendedorNome(v)}
                          </td>
                          <td className="p-2">{v.segmento ?? "—"}</td>
                          <td className="p-2">{v.tabela ?? "—"}</td>
                          <td className="p-2">{proposta}</td>
                          <td className="p-2">
                            <Badge variant="outline">{st}</Badge>
                          </td>
                          <td className="p-2 text-right">{moneyBR(v.valor_venda)}</td>
                        </tr>
                      );
                    })}
                    {!vendas.length ? (
                      <tr>
                        <td className="p-4 text-center text-muted-foreground" colSpan={8}>
                          Nenhum dado com os filtros atuais.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Mostrando até 80 linhas no painel. Use “Extrair Relatório” para exportar tudo.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ================== EXPORT OVERLAY ================== */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Extrair Relatório</DialogTitle>
            <DialogDescription>
              Exportação em .XLS via tabela HTML (compatível com Excel). Respeita RBAC e filtros.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={exportKind} onValueChange={(v) => setExportKind(v as ExportKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendas">Vendas</SelectItem>
                  <SelectItem value="canceladas">Canceladas</SelectItem>
                  <SelectItem value="contempladas">Contempladas</SelectItem>
                  <SelectItem value="inadimplentes">Inadimplentes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Data-base</Label>
              <Select
                value={exportDateField}
                onValueChange={(v) => setExportDateField(v as ExportDateField)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="data_venda">Data Venda</SelectItem>
                  <SelectItem value="cancelada_em">Cancelada em</SelectItem>
                  <SelectItem value="inad_em">Inad em</SelectItem>
                  <SelectItem value="data_contemplacao">Data Contemplação</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                Para “Canceladas/Inad/Contempladas”, use a data do status.
              </div>
            </div>

            <div className="space-y-1">
              <Label>De</Label>
              <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Até</Label>
              <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={buildExportQuery}
              disabled={exportLoading}
              className="border-black/10"
            >
              {exportLoading ? "Carregando..." : "Carregar dados"}
            </Button>

            <Button
              onClick={downloadXLS}
              disabled={!exportRows.length}
              className="text-white"
              style={{ background: C.rubi }}
            >
              Baixar .XLS
            </Button>

            <div className="text-sm text-muted-foreground flex items-center">
              Linhas: <b className="ml-1">{exportRows.length}</b>
            </div>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-md border border-black/10">
            <table ref={exportTableRef} className="w-full text-sm">
              <thead className="bg-black/5">
                <tr>
                  <th className="text-left p-2">Data Venda</th>
                  <th className="text-left p-2">Cliente</th>
                  <th className="text-left p-2">Telefone</th>
                  <th className="text-left p-2">Vendedor</th>
                  <th className="text-left p-2">Segmento</th>
                  <th className="text-left p-2">Tabela</th>
                  <th className="text-left p-2">Adm</th>
                  <th className="text-left p-2">Proposta</th>
                  <th className="text-left p-2">Código</th>
                  <th className="text-left p-2">Inad</th>
                  <th className="text-left p-2">Cancelada</th>
                  <th className="text-left p-2">Contemplada</th>
                  <th className="text-right p-2">Valor</th>
                </tr>
              </thead>
              <tbody>
                {exportRows.map((v) => {
                  const cid = (v.lead_id || v.cliente_lead_id || "") as string;
                  const lead = cid ? leadsById[cid] : null;

                  return (
                    <tr key={v.id} className="border-t border-black/5">
                      <td className="p-2">{brDate(v.data_venda ?? null)}</td>
                      <td className="p-2">{lead?.nome ?? "—"}</td>
                      <td className="p-2">{lead?.telefone ?? "—"}</td>
                      <td className="p-2">{vendedorNome(v)}</td>
                      <td className="p-2">{v.segmento ?? "—"}</td>
                      <td className="p-2">{v.tabela ?? "—"}</td>
                      <td className="p-2">{v.administradora ?? "—"}</td>
                      <td className="p-2">{v.numero_proposta ?? "—"}</td>
                      <td className="p-2">{v.codigo ?? "—"}</td>
                      <td className="p-2">{v.inad ? "SIM" : "NÃO"}</td>
                      <td className="p-2">{v.cancelada_em ? brDate(v.cancelada_em) : "—"}</td>
                      <td className="p-2">{v.contemplada ? "SIM" : "NÃO"}</td>
                      <td className="p-2 text-right">{moneyBR(v.valor_venda)}</td>
                    </tr>
                  );
                })}
                {!exportRows.length ? (
                  <tr>
                    <td className="p-4 text-center text-muted-foreground" colSpan={13}>
                      Carregue os dados para visualizar a prévia.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-muted-foreground">
            Observação: no seu banco, <b>vendas.vendedor_id</b> = <b>auth_user_id</b> ✅
            (por isso o nome e o filtro estavam quebrando quando você usava users.id).
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
