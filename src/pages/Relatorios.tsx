// src/pages/Relatorios.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Loader2, RefreshCcw, BarChart3, AlertTriangle } from "lucide-react";

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

/* =========================
   Paleta Consulmax (não alterar)
   ========================= */
const CONSULMAX = {
  rubi: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
  goldLight: "#E0CE8C",
  green: "#008000", // definido por você como "Saldo/OK"
};

type UUID = string;

type VendaRow = Record<string, any> & {
  id: UUID;
  encarteirada_em?: string | null;
  cancelada_em?: string | null;
  contemplada?: boolean | null;
  data_contemplacao?: string | null;

  valor_venda?: number | string | null;

  segmento?: string | null;
  administradora?: string | null;
  tabela?: string | null;
  vendedor_id?: UUID | null;

  tipo_venda?: string | null; // Normal/Contemplada/Bolsão
  codigo?: string | null;     // '00' ativo
  grupo?: string | null;
  cota?: string | null;
  numero_proposta?: string | null;

  // possíveis campos de inadimplência (se existirem no seu schema)
  inad?: boolean | null;
  inad_since?: string | null;
  inad_dias?: number | null;
  inad_days?: number | null;
};

type UserRow = {
  auth_user_id: UUID;
  nome: string | null;
  is_active?: boolean | null;
};

type Option = { value: string; label: string };

function safeNum(v: any): number {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseISODate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISODate(d: Date): string {
  // yyyy-mm-dd
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clampStr(x: any): string {
  return (x ?? "").toString().trim();
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, months: number): Date {
  const nd = new Date(d);
  nd.setMonth(nd.getMonth() + months);
  return nd;
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isBetweenISO(iso?: string | null, start?: string, end?: string): boolean {
  if (!iso) return false;
  const d = parseISODate(iso);
  if (!d) return false;
  const t = d.getTime();
  if (start) {
    const s = parseISODate(start);
    if (s && t < s.getTime()) return false;
  }
  if (end) {
    const e = parseISODate(end);
    if (e && t > e.getTime()) return false;
  }
  return true;
}

/** Semestre: 1 = Jan-Jun, 2 = Jul-Dez */
function semesterOf(d: Date): 1 | 2 {
  return d.getMonth() < 6 ? 1 : 2;
}
function semesterLabel(year: number, sem: 1 | 2): string {
  return sem === 1 ? `Jan–Jun ${year}` : `Jul–Dez ${year}`;
}
function semesterRange(year: number, sem: 1 | 2): { start: Date; end: Date } {
  if (sem === 1) {
    return { start: new Date(year, 0, 1), end: new Date(year, 5, 30, 23, 59, 59, 999) };
  }
  return { start: new Date(year, 6, 1), end: new Date(year, 11, 31, 23, 59, 59, 999) };
}
function previousSemester(year: number, sem: 1 | 2): { year: number; sem: 1 | 2 } {
  if (sem === 2) return { year, sem: 1 };
  return { year: year - 1, sem: 2 };
}

function percentile(sorted: number[], p: number): number {
  // p em [0..1]
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
function formatDays(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(n)} dias`;
}

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/* =========================
   UI Helpers
   ========================= */

function GlassCard(props: React.PropsWithChildren<{ className?: string }>) {
  return (
    <Card
      className={cx(
        "border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.25)]",
        props.className
      )}
    >
      {props.children}
    </Card>
  );
}

function KPI({
  title,
  value,
  sub,
  right,
}: {
  title: string;
  value: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <GlassCard>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-white/80 flex items-center justify-between gap-3">
          <span>{title}</span>
          {right}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-white">{value}</div>
        {sub ? <div className="text-xs text-white/60 mt-1">{sub}</div> : null}
      </CardContent>
    </GlassCard>
  );
}

function SimplePaginator({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;
  return (
    <div className="flex items-center justify-between gap-3 mt-3">
      <div className="text-xs text-white/60">
        Página {page} de {totalPages} • {total} itens
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="bg-white/10 hover:bg-white/15 text-white"
          disabled={!canPrev}
          onClick={() => onChange(Math.max(1, page - 1))}
        >
          Anterior
        </Button>
        <Button
          variant="secondary"
          className="bg-white/10 hover:bg-white/15 text-white"
          disabled={!canNext}
          onClick={() => onChange(Math.min(totalPages, page + 1))}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}

function Donut({
  data,
  colors,
}: {
  data: Array<{ name: string; value: number }>;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={65}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map((_, idx) => (
            <Cell key={idx} fill={colors[idx % colors.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* =========================
   Página
   ========================= */

export default function Relatorios() {
  // Filtros globais
  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");

  const [sellerId, setSellerId] = useState<string>("all");
  const [admin, setAdmin] = useState<string>("all");
  const [segmento, setSegmento] = useState<string>("all");
  const [tabela, setTabela] = useState<string>("all");

  const [tipoVenda, setTipoVenda] = useState<string>("all"); // Normal/Contemplada/Bolsão
  const [contemplada, setContemplada] = useState<string>("all"); // sim/nao

  // Dados
  const [loading, setLoading] = useState(false);
  const [vendas, setVendas] = useState<VendaRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string>("");

  // Dialog “Contração”
  const [openCliente, setOpenCliente] = useState(false);
  const [clienteKey, setClienteKey] = useState<string>("");
  const [clienteTitle, setClienteTitle] = useState<string>("");

  // Paginação das listas do 8-2
  const [pageRecente, setPageRecente] = useState(1);
  const [pageRisco, setPageRisco] = useState(1);

  // Período âncora para semestres e séries (usa fim do período se informado)
  const anchorDate = useMemo(() => {
    const d = dateEnd ? parseISODate(dateEnd) : new Date();
    return d ?? new Date();
  }, [dateEnd]);

  // Window de fetch para não puxar tudo (24 meses para trás é suficiente p/ maioria dos relatórios)
  const fetchWindowStartISO = useMemo(() => {
    const d = addMonths(anchorDate, -24);
    return toISODate(d);
  }, [anchorDate]);

  // Carregar vendedores ativos
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("users")
        .select("auth_user_id,nome,is_active")
        .eq("is_active", true)
        .order("nome", { ascending: true });

      if (error) return;
      setUsers((data as UserRow[]) || []);
    })();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      let q = supabase
        .from("vendas")
        // * para permitir plugar campos futuros (inad etc.) sem quebrar o build
        .select("*")
        .gte("encarteirada_em", fetchWindowStartISO);

      // filtros globais (exceto período, que aplicamos nas agregações específicas)
      if (sellerId !== "all") q = q.eq("vendedor_id", sellerId);
      if (admin !== "all") q = q.eq("administradora", admin);
      if (segmento !== "all") q = q.eq("segmento", segmento);
      if (tabela !== "all") q = q.eq("tabela", tabela);

      if (tipoVenda !== "all") q = q.eq("tipo_venda", tipoVenda);

      if (contemplada === "sim") q = q.eq("contemplada", true);
      if (contemplada === "nao") q = q.eq("contemplada", false);

      // limite de segurança
      q = q.limit(10000);

      const { data, error } = await q;
      if (error) throw error;

      setVendas((data as VendaRow[]) || []);
      setPageRecente(1);
      setPageRisco(1);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar relatórios.");
    } finally {
      setLoading(false);
    }
  }

  // auto-load inicial
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchWindowStartISO, sellerId, admin, segmento, tabela, tipoVenda, contemplada]);

  // Options dinâmicas baseadas nos dados carregados
  const options = useMemo(() => {
    const admins = new Set<string>();
    const segs = new Set<string>();
    const tabs = new Set<string>();
    const tipos = new Set<string>();

    for (const r of vendas) {
      if (r.administradora) admins.add(clampStr(r.administradora));
      if (r.segmento) segs.add(clampStr(r.segmento));
      if (r.tabela) tabs.add(clampStr(r.tabela));
      if (r.tipo_venda) tipos.add(clampStr(r.tipo_venda));
    }

    const toSorted = (s: Set<string>) =>
      Array.from(s).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));

    return {
      admins: toSorted(admins),
      segmentos: toSorted(segs),
      tabelas: toSorted(tabs),
      tiposVenda: toSorted(tipos),
    };
  }, [vendas]);

  /* =========================
     Regras Base
     ========================= */
  const isAtiva = (r: VendaRow) => (r.codigo ?? "") === "00" && !r.cancelada_em;
  const isCancelada = (r: VendaRow) => Boolean(r.cancelada_em) || ((r.codigo ?? "") !== "00");

  const inPeriodoEncarte = (r: VendaRow) =>
    !dateStart && !dateEnd ? true : isBetweenISO(r.encarteirada_em, dateStart || undefined, dateEnd || undefined);

  const inPeriodoCancel = (r: VendaRow) =>
    !dateStart && !dateEnd ? true : isBetweenISO(r.cancelada_em, dateStart || undefined, dateEnd || undefined);

  const vendasPeriodo = useMemo(() => vendas.filter(inPeriodoEncarte), [vendas, dateStart, dateEnd]);
  const cancelPeriodo = useMemo(() => vendas.filter(inPeriodoCancel), [vendas, dateStart, dateEnd]);

  const ativas = useMemo(() => vendas.filter(isAtiva), [vendas]);
  const canceladas = useMemo(() => vendas.filter(isCancelada), [vendas]);

  /* =========================
     A) Inadimplência 12-6 (cancelamento por coorte semestral)
     Lógica:
       - Semestre de observação S = semestre do anchorDate
       - Coorte C = semestre anterior a S
       - Vendido = encarteiradas na coorte C
       - Cancelado = dessas vendidas, as canceladas em S
     UI:
       - Donut "Semestre atual" => Observação S (coorte anterior)
       - Donut "Semestre anterior" => Observação S-1 (coorte anterior a S-1)
     ========================= */

  const inad126 = useMemo(() => {
    const obsYear = anchorDate.getFullYear();
    const obsSem = semesterOf(anchorDate);

    const obsPrev = previousSemester(obsYear, obsSem); // semestre de observação anterior
    const cohortCurr = previousSemester(obsYear, obsSem); // coorte do semestre atual de observação
    const cohortPrev = previousSemester(obsPrev.year, obsPrev.sem); // coorte do semestre anterior de observação

    const obsCurrRange = semesterRange(obsYear, obsSem);
    const obsPrevRange = semesterRange(obsPrev.year, obsPrev.sem);

    const cohortCurrRange = semesterRange(cohortCurr.year, cohortCurr.sem);
    const cohortPrevRange = semesterRange(cohortPrev.year, cohortPrev.sem);

    // helpers
    const inRange = (iso: string | null | undefined, rg: { start: Date; end: Date }) => {
      const d = parseISODate(iso ?? null);
      if (!d) return false;
      return d.getTime() >= rg.start.getTime() && d.getTime() <= rg.end.getTime();
    };

    // coortes
    const soldCohortCurr = vendas.filter((r) => inRange(r.encarteirada_em, cohortCurrRange));
    const soldCohortPrev = vendas.filter((r) => inRange(r.encarteirada_em, cohortPrevRange));

    // cancelamentos no semestre de observação
    const cancInObsCurr = soldCohortCurr.filter((r) => inRange(r.cancelada_em, obsCurrRange));
    const cancInObsPrev = soldCohortPrev.filter((r) => inRange(r.cancelada_em, obsPrevRange));

    const pctCurr = soldCohortCurr.length ? cancInObsCurr.length / soldCohortCurr.length : 0;
    const pctPrev = soldCohortPrev.length ? cancInObsPrev.length / soldCohortPrev.length : 0;

    return {
      labels: {
        obsCurr: semesterLabel(obsYear, obsSem),
        obsPrev: semesterLabel(obsPrev.year, obsPrev.sem),
        cohortCurr: semesterLabel(cohortCurr.year, cohortCurr.sem),
        cohortPrev: semesterLabel(cohortPrev.year, cohortPrev.sem),
      },
      curr: {
        vendido: soldCohortCurr.length,
        cancelado: cancInObsCurr.length,
        pctCancel: pctCurr,
        alarmante: pctCurr > 0.3,
      },
      prev: {
        vendido: soldCohortPrev.length,
        cancelado: cancInObsPrev.length,
        pctCancel: pctPrev,
        alarmante: pctPrev > 0.3,
      },
    };
  }, [vendas, anchorDate]);

  /* =========================
     B) Inadimplência 8-2 (inadimplência atual)
     TODO: plugar fonte oficial (ex.: coluna vendas.inad, tabela carteira, etc.)
     Fallback:
       - considera inadimplente se:
         r.inad === true OU status contém "inad"
       - dias em atraso:
         r.inad_dias | r.inad_days | (hoje - inad_since)
     ========================= */

  const inad82 = useMemo(() => {
    const now = new Date();

    const isInad = (r: VendaRow) => {
      const st = (r.status ?? "").toString().toLowerCase();
      return Boolean(r.inad === true) || st.includes("inad");
    };

    const daysLate = (r: VendaRow): number => {
      const n1 = (r.inad_dias ?? null) as any;
      const n2 = (r.inad_days ?? null) as any;
      if (Number.isFinite(Number(n1))) return Number(n1);
      if (Number.isFinite(Number(n2))) return Number(n2);

      const since = parseISODate(r.inad_since ?? null);
      if (since) {
        const diff = Math.floor((now.getTime() - since.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(0, diff);
      }
      return 0;
    };

    const carteiraAtiva = ativas; // base: cota ativa (codigo='00' e não cancelada)
    const inadRows = carteiraAtiva.filter(isInad).map((r) => ({
      r,
      dias: daysLate(r),
      valor: safeNum(r.valor_venda),
    }));

    const totalAtivo = carteiraAtiva.reduce((acc, r) => acc + safeNum(r.valor_venda), 0);
    const totalInad = inadRows.reduce((acc, x) => acc + x.valor, 0);
    const pct = totalAtivo ? totalInad / totalAtivo : 0;

    const bucket = (d: number) => {
      if (d <= 7) return "0–7";
      if (d <= 15) return "8–15";
      if (d <= 30) return "16–30";
      if (d <= 60) return "31–60";
      if (d <= 90) return "61–90";
      return "90+";
    };

    const buckets: Record<string, number> = {
      "0–7": 0,
      "8–15": 0,
      "16–30": 0,
      "31–60": 0,
      "61–90": 0,
      "90+": 0,
    };
    for (const x of inadRows) buckets[bucket(x.dias)] += x.valor;

    const agingData = Object.keys(buckets).map((k) => ({ faixa: k, valor: buckets[k] }));

    // listas acionáveis (se não houver inad implícito, ficam vazias e UI mostra TODO)
    const recem = [...inadRows]
      .sort((a, b) => (b.r.inad_since ? b.r.inad_since.localeCompare(a.r.inad_since ?? "") : b.dias - a.dias))
      .map((x) => ({
        key: x.r.id,
        proposta: x.r.numero_proposta ?? "-",
        grupo: x.r.grupo ?? "-",
        cota: x.r.cota ?? "-",
        admin: x.r.administradora ?? "-",
        segmento: x.r.segmento ?? "-",
        dias: x.dias,
        valor: x.valor,
      }));

    const risco = [...inadRows]
      .sort((a, b) => b.dias - a.dias)
      .map((x) => ({
        key: x.r.id,
        proposta: x.r.numero_proposta ?? "-",
        grupo: x.r.grupo ?? "-",
        cota: x.r.cota ?? "-",
        admin: x.r.administradora ?? "-",
        segmento: x.r.segmento ?? "-",
        dias: x.dias,
        valor: x.valor,
      }));

    return {
      pct,
      totalAtivo,
      totalInad,
      agingData,
      recem,
      risco,
      // TODO: aqui é onde você vai plugar a regra real
      hasData: inadRows.length > 0,
    };
  }, [ativas]);

  /* =========================
     C) Prazo médio de contemplação
     média, mediana (P50), P75
     ========================= */

  const prazoContemplacao = useMemo(() => {
    const rows = vendas.filter((r) => r.encarteirada_em && r.data_contemplacao);
    const diffs: number[] = [];

    const diffsBySeg: Record<string, number[]> = {};
    const diffsByAdm: Record<string, number[]> = {};

    for (const r of rows) {
      const e = parseISODate(r.encarteirada_em);
      const c = parseISODate(r.data_contemplacao);
      if (!e || !c) continue;
      const d = Math.floor((c.getTime() - e.getTime()) / (1000 * 60 * 60 * 24));
      if (!Number.isFinite(d) || d < 0) continue;

      diffs.push(d);

      const seg = clampStr(r.segmento) || "—";
      const adm = clampStr(r.administradora) || "—";
      (diffsBySeg[seg] ||= []).push(d);
      (diffsByAdm[adm] ||= []).push(d);
    }

    diffs.sort((a, b) => a - b);

    const avg = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    const p50 = diffs.length ? percentile(diffs, 0.5) : 0;
    const p75 = diffs.length ? percentile(diffs, 0.75) : 0;

    const barFrom = (obj: Record<string, number[]>) =>
      Object.entries(obj)
        .map(([k, arr]) => {
          const s = [...arr].sort((a, b) => a - b);
          const aavg = s.reduce((x, y) => x + y, 0) / s.length;
          return { name: k, dias: Math.round(aavg), n: s.length };
        })
        .sort((a, b) => b.dias - a.dias)
        .slice(0, 12);

    return {
      count: diffs.length,
      avg,
      p50,
      p75,
      bySeg: barFrom(diffsBySeg),
      byAdm: barFrom(diffsByAdm),
    };
  }, [vendas]);

  /* =========================
     D) Clientes
     - total
     - ativos vs inativos
     ========================= */

  const clientes = useMemo(() => {
    // chave robusta (depende do que você tiver preenchido)
    const keyOf = (r: VendaRow) =>
      clampStr(r.cliente_lead_id) ||
      clampStr(r.lead_id) ||
      clampStr(r.cpf) ||
      clampStr(r.telefone) ||
      clampStr(r.email) ||
      clampStr(r.id);

    const map: Record<string, { key: string; hasActive: boolean; hasCanceled: boolean; n: number }> = {};

    for (const r of vendas) {
      const k = keyOf(r);
      if (!k) continue;
      const item = (map[k] ||= { key: k, hasActive: false, hasCanceled: false, n: 0 });
      item.n += 1;
      if (isAtiva(r)) item.hasActive = true;
      if (isCancelada(r)) item.hasCanceled = true;
    }

    const all = Object.values(map);
    const total = all.length;
    const ativosCli = all.filter((x) => x.hasActive).length;
    const inativosCli = all.filter((x) => !x.hasActive && x.hasCanceled).length;
    const pctAtivos = total ? ativosCli / total : 0;

    return {
      total,
      ativos: ativosCli,
      inativos: inativosCli,
      pctAtivos,
    };
  }, [vendas]);

  /* =========================
     E) Carteira
     - Vendido / Cancelado / Líquido
     - Inadimplente (placeholder)
     - Série mensal últimos 12 meses
     ========================= */

  const carteira = useMemo(() => {
    const totalVendido = vendasPeriodo.reduce((acc, r) => acc + safeNum(r.valor_venda), 0);
    const totalCancelado = cancelPeriodo.reduce((acc, r) => acc + safeNum(r.valor_venda), 0);
    const totalLiquido = totalVendido - totalCancelado;

    // inadimplente: usa a mesma heurística do inad82 (se não tiver dados, fica 0)
    const totalInad = inad82.totalInad;

    // série últimos 12 meses (a partir do anchorDate)
    const months: string[] = [];
    const start = startOfMonth(addMonths(anchorDate, -11));
    for (let i = 0; i < 12; i++) months.push(monthKey(addMonths(start, i)));

    const soldByMonth: Record<string, number> = {};
    const cancByMonth: Record<string, number> = {};
    months.forEach((k) => {
      soldByMonth[k] = 0;
      cancByMonth[k] = 0;
    });

    for (const r of vendas) {
      const e = parseISODate(r.encarteirada_em);
      if (e) {
        const k = monthKey(e);
        if (k in soldByMonth) soldByMonth[k] += safeNum(r.valor_venda);
      }
      const c = parseISODate(r.cancelada_em);
      if (c) {
        const k = monthKey(c);
        if (k in cancByMonth) cancByMonth[k] += safeNum(r.valor_venda);
      }
    }

    const serie = months.map((k) => ({
      mes: k,
      vendido: soldByMonth[k],
      cancelado: cancByMonth[k],
      liquido: soldByMonth[k] - cancByMonth[k],
    }));

    return {
      totalVendido,
      totalCancelado,
      totalLiquido,
      totalInad,
      serie,
    };
  }, [vendas, vendasPeriodo, cancelPeriodo, anchorDate, inad82.totalInad]);

  /* =========================
     F) Distribuição por segmento
     (participação por segmento, valor e %)
     ========================= */

  const distSegmento = useMemo(() => {
    const base = vendasPeriodo; // base no período por encarteiramento
    const total = base.reduce((acc, r) => acc + safeNum(r.valor_venda), 0);
    const map: Record<string, number> = {};

    for (const r of base) {
      const seg = clampStr(r.segmento) || "—";
      map[seg] = (map[seg] || 0) + safeNum(r.valor_venda);
    }

    const arr = Object.entries(map)
      .map(([seg, val]) => ({ seg, val, pct: total ? val / total : 0 }))
      .sort((a, b) => b.val - a.val);

    return { total, arr: arr.slice(0, 12) };
  }, [vendasPeriodo]);

  /* =========================
     G) Contração da carteira
     - Top 10 maiores clientes (soma do valor_venda em cotas ativas)
     - Dialog com detalhes (cotas, status, segmentos, administradora)
     ========================= */

  const contracao = useMemo(() => {
    const keyOf = (r: VendaRow) =>
      clampStr(r.cliente_lead_id) ||
      clampStr(r.lead_id) ||
      clampStr(r.cpf) ||
      clampStr(r.telefone) ||
      clampStr(r.email) ||
      clampStr(r.id);

    const nameOf = (r: VendaRow) =>
      clampStr(r.nome) || clampStr(r.cliente_nome) || clampStr(r.email) || clampStr(r.telefone) || "Cliente";

    const map: Record<string, { key: string; title: string; valor: number; rows: VendaRow[] }> = {};

    for (const r of vendas) {
      if (!isAtiva(r)) continue;
      const k = keyOf(r);
      if (!k) continue;
      const item = (map[k] ||= { key: k, title: nameOf(r), valor: 0, rows: [] });
      item.valor += safeNum(r.valor_venda);
      item.rows.push(r);
    }

    const top = Object.values(map)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    return { top, map };
  }, [vendas]);

  const clienteDetalhe = useMemo(() => {
    if (!clienteKey) return null;
    return contracao.map[clienteKey] || null;
  }, [clienteKey, contracao.map]);

  const sellerOptions: Option[] = useMemo(() => {
    const arr = users.map((u) => ({
      value: u.auth_user_id,
      label: u.nome || "(sem nome)",
    }));
    return arr;
  }, [users]);

  /* =========================
     Render
     ========================= */

  const donutColors = [CONSULMAX.navy, CONSULMAX.rubi, CONSULMAX.gold, CONSULMAX.green];

  // 8-2 paging
  const pageSize = 10;
  const recemPaged = useMemo(() => {
    const start = (pageRecente - 1) * pageSize;
    return inad82.recem.slice(start, start + pageSize);
  }, [inad82.recem, pageRecente]);
  const riscoPaged = useMemo(() => {
    const start = (pageRisco - 1) * pageSize;
    return inad82.risco.slice(start, start + pageSize);
  }, [inad82.risco, pageRisco]);

  return (
    <div className="p-4 md:p-6 space-y-4 text-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-white/80" />
            <h1 className="text-xl md:text-2xl font-semibold">Relatórios</h1>
          </div>
          <p className="text-sm text-white/60 mt-1">
            Indicadores e análises com padrão “liquid glass”.
          </p>
        </div>
        <Button
          variant="secondary"
          className="bg-white/10 hover:bg-white/15 text-white"
          onClick={loadData}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
          Atualizar
        </Button>
      </div>

      {/* Filtros globais */}
      <GlassCard>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/80">Filtros globais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-white/70">Data início</Label>
              <Input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-white/70">Data fim</Label>
              <Input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-white/70">Vendedor</Label>
              <Select value={sellerId} onValueChange={setSellerId}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="bg-[#0B1220] border-white/10 text-white">
                  <SelectItem value="all">Todos</SelectItem>
                  {sellerOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-white/70">Administradora</Label>
              <Select value={admin} onValueChange={setAdmin}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent className="bg-[#0B1220] border-white/10 text-white">
                  <SelectItem value="all">Todas</SelectItem>
                  {options.admins.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-white/70">Segmento</Label>
              <Select value={segmento} onValueChange={setSegmento}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="bg-[#0B1220] border-white/10 text-white">
                  <SelectItem value="all">Todos</SelectItem>
                  {options.segmentos.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-white/70">Tabela</Label>
              <Select value={tabela} onValueChange={setTabela}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent className="bg-[#0B1220] border-white/10 text-white">
                  <SelectItem value="all">Todas</SelectItem>
                  {options.tabelas.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-white/70">Tipo de venda</Label>
              <Select value={tipoVenda} onValueChange={setTipoVenda}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="bg-[#0B1220] border-white/10 text-white">
                  <SelectItem value="all">Todos</SelectItem>
                  {/* se seu banco tiver exatamente esses 3, vai casar perfeito */}
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="Contemplada">Contemplada</SelectItem>
                  <SelectItem value="Bolsão">Bolsão</SelectItem>
                  {/* e também lista detectada */}
                  {options.tiposVenda
                    .filter((x) => !["Normal", "Contemplada", "Bolsão"].includes(x))
                    .map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-white/70">Contemplada</Label>
              <Select value={contemplada} onValueChange={setContemplada}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="bg-[#0B1220] border-white/10 text-white">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error ? (
            <div className="text-sm text-red-300 mt-2">{error}</div>
          ) : null}

          <div className="text-xs text-white/50">
            * A maioria dos relatórios usa janela de 24 meses para performance. Ajuste depois para views/aggregates se necessário.
          </div>
        </CardContent>
      </GlassCard>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KPI title="Total vendido (período)" value={formatBRL(carteira.totalVendido)} sub="Base: encarteirada_em no período" />
        <KPI title="Total cancelado (período)" value={formatBRL(carteira.totalCancelado)} sub="Base: cancelada_em no período" />
        <KPI title="Total líquido (período)" value={formatBRL(carteira.totalLiquido)} sub="Vendido - Cancelado" />
        <KPI
          title="Carteira inadimplente (8-2)"
          value={formatPct(inad82.pct)}
          sub={inad82.hasData ? `Inadimplente: ${formatBRL(inad82.totalInad)}` : "TODO: plugar fonte oficial de inadimplência"}
          right={!inad82.hasData ? <AlertTriangle className="h-4 w-4 text-yellow-300" /> : null}
        />
      </div>

      <Tabs defaultValue="inad126" className="w-full">
        <TabsList className="bg-white/10 border border-white/10">
          <TabsTrigger value="inad126">Inadimplência 12-6</TabsTrigger>
          <TabsTrigger value="inad82">Inadimplência 8-2</TabsTrigger>
          <TabsTrigger value="prazo">Prazo contemplação</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="carteira">Carteira</TabsTrigger>
          <TabsTrigger value="segmentos">Segmentos</TabsTrigger>
          <TabsTrigger value="contracao">Contração</TabsTrigger>
        </TabsList>

        {/* A) 12-6 */}
        <TabsContent value="inad126" className="mt-4 space-y-3">
          <div className="text-sm text-white/70">
            Conceito 12-6: coorte semestral (encarteiradas) observada no semestre seguinte (cancelamentos).
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* semestre anterior */}
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/80 flex items-center justify-between">
                  <span>Semestre anterior</span>
                  <span className="text-xs text-white/60">
                    Obs: {inad126.labels.obsPrev} • Coorte: {inad126.labels.cohortPrev}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm">
                    % Cancelado: <span className="font-semibold">{formatPct(inad126.prev.pctCancel)}</span>
                  </div>
                  {inad126.prev.alarmante ? (
                    <span className="px-2 py-1 rounded-full text-xs bg-[rgba(161,28,39,0.25)] border border-[rgba(161,28,39,0.45)] text-red-200">
                      ALARMANTE (&gt; 30%)
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-full text-xs bg-white/10 border border-white/10 text-white/70">
                      OK
                    </span>
                  )}
                </div>

                <Donut
                  data={[
                    { name: "Vendido", value: inad126.prev.vendido },
                    { name: "Cancelado", value: inad126.prev.cancelado },
                  ]}
                  colors={[CONSULMAX.navy, CONSULMAX.rubi]}
                />

                <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-2">
                    <div className="text-xs text-white/60">Vendido</div>
                    <div className="font-semibold">{inad126.prev.vendido}</div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-2">
                    <div className="text-xs text-white/60">Cancelado</div>
                    <div className="font-semibold">{inad126.prev.cancelado}</div>
                  </div>
                </div>
              </CardContent>
            </GlassCard>

            {/* semestre atual */}
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/80 flex items-center justify-between">
                  <span>Semestre atual</span>
                  <span className="text-xs text-white/60">
                    Obs: {inad126.labels.obsCurr} • Coorte: {inad126.labels.cohortCurr}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm">
                    % Cancelado: <span className="font-semibold">{formatPct(inad126.curr.pctCancel)}</span>
                  </div>
                  {inad126.curr.alarmante ? (
                    <span className="px-2 py-1 rounded-full text-xs bg-[rgba(161,28,39,0.25)] border border-[rgba(161,28,39,0.45)] text-red-200">
                      ALARMANTE (&gt; 30%)
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-full text-xs bg-white/10 border border-white/10 text-white/70">
                      OK
                    </span>
                  )}
                </div>

                <Donut
                  data={[
                    { name: "Vendido", value: inad126.curr.vendido },
                    { name: "Cancelado", value: inad126.curr.cancelado },
                  ]}
                  colors={[CONSULMAX.navy, CONSULMAX.rubi]}
                />

                <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-2">
                    <div className="text-xs text-white/60">Vendido</div>
                    <div className="font-semibold">{inad126.curr.vendido}</div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-2">
                    <div className="text-xs text-white/60">Cancelado</div>
                    <div className="font-semibold">{inad126.curr.cancelado}</div>
                  </div>
                </div>
              </CardContent>
            </GlassCard>
          </div>
        </TabsContent>

        {/* B) 8-2 */}
        <TabsContent value="inad82" className="mt-4 space-y-3">
          <div className="text-sm text-white/70">
            Conceito 8-2: percentual da carteira ativa que está inadimplente (entre 1º atraso e baixa/reversão).
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KPI
              title="% carteira inadimplente"
              value={formatPct(inad82.pct)}
              sub={inad82.hasData ? `Inadimplente: ${formatBRL(inad82.totalInad)}` : "TODO: plugar fonte oficial"}
            />
            <KPI title="Total ativo (base)" value={formatBRL(inad82.totalAtivo)} sub="Base: cotas ativas" />
            <KPI title="Total inadimplente" value={formatBRL(inad82.totalInad)} sub="Heurística: inad/status (fallback)" />
          </div>

          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/80">Aging da inadimplência</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inad82.agingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="faixa" stroke="rgba(255,255,255,0.6)" />
                    <YAxis stroke="rgba(255,255,255,0.6)" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="valor" name="Valor (R$)" fill={CONSULMAX.gold} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {!inad82.hasData ? (
                <div className="text-xs text-white/55 mt-2">
                  TODO: não foi encontrado sinal de inadimplência no dataset atual. Quando você plugar a fonte real (ex.: coluna `vendas.inad`/`inad_since` ou tabela carteira),
                  estas listas e aging passam a refletir automaticamente.
                </div>
              ) : null}
            </CardContent>
          </GlassCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* recém inadimplentes */}
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/80">Cotas recém-inadimplentes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto border border-white/10 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5">
                      <tr className="text-left">
                        <th className="p-2">Proposta</th>
                        <th className="p-2">Admin</th>
                        <th className="p-2">Dias</th>
                        <th className="p-2 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recemPaged.length ? (
                        recemPaged.map((x) => (
                          <tr key={x.key} className="border-t border-white/10">
                            <td className="p-2">{x.proposta}</td>
                            <td className="p-2">{x.admin}</td>
                            <td className="p-2">{x.dias}</td>
                            <td className="p-2 text-right">{formatBRL(x.valor)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="p-3 text-white/60" colSpan={4}>
                            Sem dados (TODO: plugar inadimplência real).
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <SimplePaginator
                  page={pageRecente}
                  pageSize={pageSize}
                  total={inad82.recem.length}
                  onChange={setPageRecente}
                />
              </CardContent>
            </GlassCard>

            {/* top risco */}
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/80">Top cotas em risco (maior atraso)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto border border-white/10 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5">
                      <tr className="text-left">
                        <th className="p-2">Proposta</th>
                        <th className="p-2">Admin</th>
                        <th className="p-2">Dias</th>
                        <th className="p-2 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riscoPaged.length ? (
                        riscoPaged.map((x) => (
                          <tr key={x.key} className="border-t border-white/10">
                            <td className="p-2">{x.proposta}</td>
                            <td className="p-2">{x.admin}</td>
                            <td className="p-2">{x.dias}</td>
                            <td className="p-2 text-right">{formatBRL(x.valor)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="p-3 text-white/60" colSpan={4}>
                            Sem dados (TODO: plugar inadimplência real).
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <SimplePaginator
                  page={pageRisco}
                  pageSize={pageSize}
                  total={inad82.risco.length}
                  onChange={setPageRisco}
                />
              </CardContent>
            </GlassCard>
          </div>
        </TabsContent>

        {/* C) Prazo contemplação */}
        <TabsContent value="prazo" className="mt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KPI title="Média" value={formatDays(prazoContemplacao.avg)} sub={`Base: ${prazoContemplacao.count} contemplações`} />
            <KPI title="Mediana (P50)" value={formatDays(prazoContemplacao.p50)} />
            <KPI title="P75" value={formatDays(prazoContemplacao.p75)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/80">Por segmento (média em dias)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={prazoContemplacao.bySeg}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" />
                      <YAxis stroke="rgba(255,255,255,0.6)" />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="dias" name="Dias" fill={CONSULMAX.navy} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/80">Por administradora (média em dias)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={prazoContemplacao.byAdm}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" />
                      <YAxis stroke="rgba(255,255,255,0.6)" />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="dias" name="Dias" fill={CONSULMAX.gold} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </GlassCard>
          </div>
        </TabsContent>

        {/* D) Clientes */}
        <TabsContent value="clientes" className="mt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <KPI title="Total de clientes" value={`${clientes.total}`} />
            <KPI title="Clientes ativos" value={`${clientes.ativos}`} sub="Possuem cota ativa" />
            <KPI title="Clientes inativos" value={`${clientes.inativos}`} sub="Já tiveram e cancelaram" />
            <KPI title="% que permanecem ativos" value={formatPct(clientes.pctAtivos)} />
          </div>

          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/80">Resumo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto border border-white/10 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-white/5">
                    <tr className="text-left">
                      <th className="p-2">Indicador</th>
                      <th className="p-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-white/10">
                      <td className="p-2">Total de clientes</td>
                      <td className="p-2 text-right">{clientes.total}</td>
                    </tr>
                    <tr className="border-t border-white/10">
                      <td className="p-2">Clientes ativos</td>
                      <td className="p-2 text-right">{clientes.ativos}</td>
                    </tr>
                    <tr className="border-t border-white/10">
                      <td className="p-2">Clientes inativos</td>
                      <td className="p-2 text-right">{clientes.inativos}</td>
                    </tr>
                    <tr className="border-t border-white/10">
                      <td className="p-2">% ativos</td>
                      <td className="p-2 text-right">{formatPct(clientes.pctAtivos)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* E) Carteira */}
        <TabsContent value="carteira" className="mt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <KPI title="Total vendido" value={formatBRL(carteira.totalVendido)} />
            <KPI title="Total cancelado" value={formatBRL(carteira.totalCancelado)} />
            <KPI title="Total líquido" value={formatBRL(carteira.totalLiquido)} />
            <KPI title="Total inadimplente" value={formatBRL(carteira.totalInad)} sub="TODO: fonte oficial" />
          </div>

          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/80">
                Série mensal (últimos 12 meses) • vendido/cancelado/líquido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={carteira.serie}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="mes" stroke="rgba(255,255,255,0.6)" />
                    <YAxis stroke="rgba(255,255,255,0.6)" />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="vendido" name="Vendido" stroke={CONSULMAX.navy} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cancelado" name="Cancelado" stroke={CONSULMAX.rubi} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="liquido" name="Líquido" stroke={CONSULMAX.green} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* F) Segmentos */}
        <TabsContent value="segmentos" className="mt-4 space-y-3">
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/80">
                Distribuição por segmento (período) • valor e %
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Donut
                  data={distSegmento.arr.map((x) => ({ name: x.seg, value: x.val }))}
                  colors={donutColors}
                />
              </div>

              <div className="overflow-auto border border-white/10 rounded-lg h-[240px]">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 sticky top-0">
                    <tr className="text-left">
                      <th className="p-2">Segmento</th>
                      <th className="p-2 text-right">Valor</th>
                      <th className="p-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distSegmento.arr.map((x) => (
                      <tr key={x.seg} className="border-t border-white/10">
                        <td className="p-2">{x.seg}</td>
                        <td className="p-2 text-right">{formatBRL(x.val)}</td>
                        <td className="p-2 text-right">{formatPct(x.pct)}</td>
                      </tr>
                    ))}
                    {!distSegmento.arr.length ? (
                      <tr>
                        <td className="p-3 text-white/60" colSpan={3}>
                          Sem dados no período.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* G) Contração */}
        <TabsContent value="contracao" className="mt-4 space-y-3">
          <div className="text-sm text-white/70">
            Top 10 maiores clientes por valor de crédito em <b>cotas ativas</b>.
          </div>

          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/80">Top 10 clientes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto border border-white/10 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-white/5">
                    <tr className="text-left">
                      <th className="p-2">Cliente</th>
                      <th className="p-2 text-right">Valor</th>
                      <th className="p-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracao.top.length ? (
                      contracao.top.map((c) => (
                        <tr key={c.key} className="border-t border-white/10">
                          <td className="p-2">{c.title}</td>
                          <td className="p-2 text-right">{formatBRL(c.valor)}</td>
                          <td className="p-2 text-right">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="bg-white/10 hover:bg-white/15 text-white"
                              onClick={() => {
                                setClienteKey(c.key);
                                setClienteTitle(c.title);
                                setOpenCliente(true);
                              }}
                            >
                              Ver detalhes
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="p-3 text-white/60" colSpan={3}>
                          Sem dados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </GlassCard>

          <Dialog open={openCliente} onOpenChange={setOpenCliente}>
            <DialogContent className="bg-[#0B1220] border-white/10 text-white max-w-3xl">
              <DialogHeader>
                <DialogTitle>Detalhes — {clienteTitle}</DialogTitle>
              </DialogHeader>

              {!clienteDetalhe ? (
                <div className="text-white/70">Sem dados.</div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <KPI title="Valor ativo" value={formatBRL(clienteDetalhe.valor)} />
                    <KPI title="Qtd. cotas" value={`${clienteDetalhe.rows.length}`} />
                    <KPI title="Key" value={clienteDetalhe.key.slice(0, 10) + "..."} />
                  </div>

                  <div className="overflow-auto border border-white/10 rounded-lg max-h-[360px]">
                    <table className="w-full text-sm">
                      <thead className="bg-white/5 sticky top-0">
                        <tr className="text-left">
                          <th className="p-2">Proposta</th>
                          <th className="p-2">Admin</th>
                          <th className="p-2">Segmento</th>
                          <th className="p-2">Grupo/Cota</th>
                          <th className="p-2 text-right">Valor</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clienteDetalhe.rows.map((r) => (
                          <tr key={r.id} className="border-t border-white/10">
                            <td className="p-2">{r.numero_proposta ?? "-"}</td>
                            <td className="p-2">{r.administradora ?? "-"}</td>
                            <td className="p-2">{r.segmento ?? "-"}</td>
                            <td className="p-2">
                              {r.grupo ?? "-"} / {r.cota ?? "-"}
                            </td>
                            <td className="p-2 text-right">{formatBRL(safeNum(r.valor_venda))}</td>
                            <td className="p-2">
                              {isAtiva(r) ? (
                                <span className="px-2 py-1 rounded-full text-xs bg-[rgba(0,128,0,0.18)] border border-[rgba(0,128,0,0.35)] text-green-200">
                                  Ativa
                                </span>
                              ) : isCancelada(r) ? (
                                <span className="px-2 py-1 rounded-full text-xs bg-[rgba(161,28,39,0.22)] border border-[rgba(161,28,39,0.4)] text-red-200">
                                  Cancelada
                                </span>
                              ) : (
                                <span className="px-2 py-1 rounded-full text-xs bg-white/10 border border-white/10 text-white/70">
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="text-xs text-white/55">
                    Regras usadas: <b>Ativo</b> = codigo='00' e não cancelada • <b>Cancelado</b> = cancelada_em preenchido e/ou codigo != '00'
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      {/* Loading overlay */}
      {loading ? (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando relatórios...
          </div>
        </div>
      ) : null}
    </div>
  );
}
