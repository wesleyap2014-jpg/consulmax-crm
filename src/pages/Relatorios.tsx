// src/pages/Relatorios.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Eye } from "lucide-react";

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
  ComposedChart,
  Line,
} from "recharts";

/* =========================
   Paleta Consulmax
========================= */
const C = {
  rubi: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
  muted: "rgba(30,41,63,.70)",
  border: "rgba(255,255,255,.35)",
  glass: "rgba(255,255,255,.55)",
};

const CONCENTRACAO_ALERTA = 0.10; // 10%

/* =========================
   Tipos (baseados nos prints)
========================= */
type UUID = string;

type VendaRow = {
  id: UUID;
  vendedor_id: UUID | null;

  administradora: string | null;
  segmento: string | null;
  tabela: string | null;

  tipo_venda: "Normal" | "Contemplada" | "Bolsão" | string | null; // tipo_venda
  contemplada: boolean | null;

  encarteirada_em: string | null; // timestamptz
  cancelada_em: string | null; // timestamptz
  codigo: string | null; // '00' ativa

  data_contemplacao: string | null; // date
  valor_venda: number | null;

  lead_id: UUID | null; // uuid (link para public.leads.id)
  cliente_lead_id?: UUID | null; // existe no schema, mas parece não estar usando

  grupo?: string | null;
  cota?: string | null;

  inad?: boolean | null; // bool
};

type LeadRow = {
  id: UUID;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  origem: string | null;
};

type UserRow = {
  auth_user_id: UUID;
  name: string | null;
  user_role?: string | null; // admin/vendedor
  role?: string | null; // alias
  is_active?: boolean | null;
};

/* =========================
   Helpers
========================= */
function safeNum(n: any): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function fmtBRL(v: number) {
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${v}`;
  }
}

function fmtPct(p: number, digits = 1) {
  const v = Number.isFinite(p) ? p : 0;
  return `${(v * 100).toFixed(digits)}%`;
}

function isoLocalStart(dateStr: string) {
  // dateStr = YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  return dt.toISOString();
}
function isoLocalEnd(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
  return dt.toISOString();
}

function monthKeyFromISO(iso: string | null) {
  if (!iso) return null;
  // pega YYYY-MM
  const m = iso.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function diffDays(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function getSemesterRange(date: Date) {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-11
  const isH1 = m <= 5;
  const start = new Date(y, isH1 ? 0 : 6, 1, 0, 0, 0, 0);
  const end = new Date(y, isH1 ? 5 : 11, isH1 ? 30 : 31, 23, 59, 59, 999);
  return { start, end, label: isH1 ? `Jan–Jun ${y}` : `Jul–Dez ${y}` };
}

function addMonths(d: Date, months: number) {
  const dt = new Date(d);
  dt.setMonth(dt.getMonth() + months);
  return dt;
}

/* =========================
   UI helpers
========================= */
function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={`border ${className}`}
      style={{
        background: C.glass,
        borderColor: C.border,
        backdropFilter: "saturate(160%) blur(10px)",
        WebkitBackdropFilter: "saturate(160%) blur(10px)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.20), 0 10px 30px rgba(30,41,63,.08)",
        borderRadius: 18,
      }}
    >
      {children}
    </Card>
  );
}

function Badge({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "danger" | "ok" | "muted";
}) {
  const styles: Record<string, React.CSSProperties> = {
    info: {
      background: "rgba(30,41,63,.10)",
      color: C.navy,
      border: "1px solid rgba(30,41,63,.18)",
    },
    danger: {
      background: "rgba(161,28,39,.12)",
      color: C.rubi,
      border: "1px solid rgba(161,28,39,.22)",
    },
    ok: {
      background: "rgba(181,165,115,.18)",
      color: C.navy,
      border: "1px solid rgba(181,165,115,.35)",
    },
    muted: {
      background: "rgba(255,255,255,.55)",
      color: C.muted,
      border: "1px solid rgba(255,255,255,.45)",
    },
  };

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={styles[tone]}
    >
      {children}
    </span>
  );
}

/* =========================
   Página
========================= */
export default function Relatorios() {
  // filtros globais (auto-aplicáveis)
  const [dateStart, setDateStart] = useState<string>(""); // YYYY-MM-DD
  const [dateEnd, setDateEnd] = useState<string>("");

  const [fVendedor, setFVendedor] = useState<string>("all");
  const [fAdmin, setFAdmin] = useState<string>("all");
  const [fSeg, setFSeg] = useState<string>("all");
  const [fTabela, setFTabela] = useState<string>("all");
  const [fTipoVenda, setFTipoVenda] = useState<string>("all");
  const [fContemplada, setFContemplada] = useState<string>("all"); // all|sim|nao

  // dados
  const [loading, setLoading] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [vendas, setVendas] = useState<VendaRow[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, UserRow>>({});
  const [leadsMap, setLeadsMap] = useState<Record<string, LeadRow>>({});

  // dialog concentração
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leadDialogId, setLeadDialogId] = useState<string | null>(null);

  // paginação concentração
  const [concPage, setConcPage] = useState(1);
  const concPageSize = 10;

  /* =========================
     Carrega auth + role
  ========================= */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!alive) return;
        if (error || !data?.user) {
          setAuthUserId(null);
          setIsAdmin(false);
          return;
        }
        const uid = data.user.id;
        setAuthUserId(uid);

        // identifica se é admin via public.users
        const { data: urow, error: uerr } = await supabase
          .from("users")
          .select("auth_user_id, name, user_role, role, is_active")
          .eq("auth_user_id", uid)
          .maybeSingle();

        if (!alive) return;

        if (uerr) {
          console.error("Erro ao carregar role do usuário:", uerr.message);
          setIsAdmin(false);
          return;
        }

        const role = (urow?.user_role || urow?.role || "").toString().toLowerCase();
        setIsAdmin(role === "admin");
      } catch (e) {
        console.error("Erro ao identificar usuário:", e);
        if (!alive) return;
        setAuthUserId(null);
        setIsAdmin(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* =========================
     Fetch principal (vendas)
     - Admin vê tudo
     - Não-admin vê apenas suas vendas (vendedor_id = auth.user.id)
  ========================= */
  async function fetchAll() {
    setLoading(true);
    try {
      // 1) carrega users para map (nome do vendedor)
      const { data: usersData, error: usersErr } = await supabase
        .from("users")
        .select("auth_user_id, name, user_role, role, is_active")
        .order("name", { ascending: true });

      if (usersErr) {
        console.error("Erro users:", usersErr.message);
      } else {
        const map: Record<string, UserRow> = {};
        (usersData || []).forEach((u: any) => {
          if (u?.auth_user_id) map[u.auth_user_id] = u as UserRow;
        });
        setUsersMap(map);
      }

      // 2) carrega vendas (base)
      // performance: se não tiver período, carrega últimos 24 meses
      const now = new Date();
      const defaultMin = addMonths(now, -24).toISOString();

      let q = supabase
        .from("vendas")
        .select(
          [
            "id",
            "vendedor_id",
            "administradora",
            "segmento",
            "tabela",
            "tipo_venda",
            "contemplada",
            "encarteirada_em",
            "cancelada_em",
            "codigo",
            "data_contemplacao",
            "valor_venda",
            "lead_id",
            "cliente_lead_id",
            "grupo",
            "cota",
            "inad",
          ].join(",")
        )
        .order("encarteirada_em", { ascending: false });

      // trava por perfil (admin vê tudo; outros apenas as suas)
      if (!isAdmin && authUserId) {
        q = q.eq("vendedor_id", authUserId);
      }

      // aplica um mínimo de data por performance (se não informarem período)
      q = q.gte("encarteirada_em", defaultMin);

      const { data: vendasData, error: vendasErr } = await q;
      if (vendasErr) {
        console.error("Erro vendas:", vendasErr.message);
        setVendas([]);
        setLeadsMap({});
        return;
      }

      const list = (vendasData || []) as VendaRow[];
      setVendas(list);

      // 3) carrega leads usados nas vendas
      const leadIds = Array.from(
        new Set(list.map((v) => v.lead_id).filter(Boolean) as string[])
      );

      if (leadIds.length) {
        const chunkSize = 200;
        const map: Record<string, LeadRow> = {};
        for (let i = 0; i < leadIds.length; i += chunkSize) {
          const chunk = leadIds.slice(i, i + chunkSize);
          const { data: leadsData, error: leadsErr } = await supabase
            .from("leads")
            .select("id, nome, telefone, email, origem")
            .in("id", chunk);

          if (leadsErr) {
            console.error("Erro leads:", leadsErr.message);
            continue;
          }
          (leadsData || []).forEach((l: any) => {
            if (l?.id) map[l.id] = l as LeadRow;
          });
        }
        setLeadsMap(map);
      } else {
        setLeadsMap({});
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // só busca quando já sabemos o auth/role
    if (authUserId === null && !isAdmin) return;
    // authUserId pode ser null (caso de erro) -> ainda assim tenta? melhor não.
    if (!authUserId) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, isAdmin]);

  /* =========================
     Filtros (em memória)
  ========================= */
  const filtered = useMemo(() => {
    let rows = vendas.slice();

    // período (encarteirada_em)
    if (dateStart) {
      const s = isoLocalStart(dateStart);
      rows = rows.filter((v) => (v.encarteirada_em ? v.encarteirada_em >= s : false));
    }
    if (dateEnd) {
      const e = isoLocalEnd(dateEnd);
      rows = rows.filter((v) => (v.encarteirada_em ? v.encarteirada_em <= e : false));
    }

    if (fVendedor !== "all") rows = rows.filter((v) => (v.vendedor_id || "") === fVendedor);
    if (fAdmin !== "all") rows = rows.filter((v) => (v.administradora || "") === fAdmin);
    if (fSeg !== "all") rows = rows.filter((v) => (v.segmento || "") === fSeg);
    if (fTabela !== "all") rows = rows.filter((v) => (v.tabela || "") === fTabela);
    if (fTipoVenda !== "all") rows = rows.filter((v) => (v.tipo_venda || "") === fTipoVenda);
    if (fContemplada !== "all") {
      const want = fContemplada === "sim";
      rows = rows.filter((v) => Boolean(v.contemplada) === want);
    }

    return rows;
  }, [
    vendas,
    dateStart,
    dateEnd,
    fVendedor,
    fAdmin,
    fSeg,
    fTabela,
    fTipoVenda,
    fContemplada,
  ]);

  // reset paginação concentração quando filtros mudam
  useEffect(() => {
    setConcPage(1);
  }, [dateStart, dateEnd, fVendedor, fAdmin, fSeg, fTabela, fTipoVenda, fContemplada]);

  /* =========================
     Distintos para selects
  ========================= */
  const distincts = useMemo(() => {
    const admins = new Set<string>();
    const segs = new Set<string>();
    const tabs = new Set<string>();
    const tipos = new Set<string>();
    const vends = new Set<string>();

    for (const v of vendas) {
      if (v.administradora) admins.add(v.administradora);
      if (v.segmento) segs.add(v.segmento);
      if (v.tabela) tabs.add(v.tabela);
      if (v.tipo_venda) tipos.add(v.tipo_venda);
      if (v.vendedor_id) vends.add(v.vendedor_id);
    }

    return {
      admins: Array.from(admins).sort(),
      segs: Array.from(segs).sort(),
      tabs: Array.from(tabs).sort(),
      tipos: Array.from(tipos).sort(),
      vends: Array.from(vends).sort(),
    };
  }, [vendas]);

  /* =========================
     Status: ativo/cancelado
  ========================= */
  const isActive = (v: VendaRow) => v.codigo === "00" && !v.cancelada_em;
  const isCanceled = (v: VendaRow) => Boolean(v.cancelada_em) || (v.codigo !== null && v.codigo !== "00");

  /* =========================
     Carteira - totais base
  ========================= */
  const totalsCarteira = useMemo(() => {
    const vendido = filtered.reduce((s, v) => s + safeNum(v.valor_venda), 0);
    const cancelado = filtered
      .filter(isCanceled)
      .reduce((s, v) => s + safeNum(v.valor_venda), 0);
    const ativoValue = filtered.filter(isActive).reduce((s, v) => s + safeNum(v.valor_venda), 0);
    const inadValue = filtered
      .filter((v) => isActive(v) && Boolean(v.inad))
      .reduce((s, v) => s + safeNum(v.valor_venda), 0);

    return {
      vendido,
      cancelado,
      liquido: vendido - cancelado,
      ativoValue,
      inadValue,
      inadPct: ativoValue > 0 ? inadValue / ativoValue : 0,
    };
  }, [filtered]);

  /* =========================
     Inadimplência 12-6 (jan-jun / jul-dez)
     Implementação: janela de cancelamento
     - "Semestre atual"  = cancelamentos neste semestre / vendas do semestre anterior
     - "Semestre anterior" = cancelamentos no semestre anterior / vendas do semestre anterior ao anterior
  ========================= */
  const inad126 = useMemo(() => {
    const now = new Date();
    const semNow = getSemesterRange(now);
    const semPrev = getSemesterRange(addMonths(semNow.start, -6));
    const semPrevPrev = getSemesterRange(addMonths(semNow.start, -12));

    const inRange = (iso: string | null, start: Date, end: Date) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= start.getTime() && t <= end.getTime();
    };

    // cohort (vendidos) = encarteiradas no semestre anterior
    const soldPrev = filtered.filter((v) => inRange(v.encarteirada_em, semPrev.start, semPrev.end));
    const canceledInNowFromPrev = soldPrev.filter((v) =>
      inRange(v.cancelada_em, semNow.start, semNow.end)
    );

    // cohort (vendidos) = encarteiradas no semestre anterior ao anterior
    const soldPrevPrev = filtered.filter((v) =>
      inRange(v.encarteirada_em, semPrevPrev.start, semPrevPrev.end)
    );
    const canceledInPrevFromPrevPrev = soldPrevPrev.filter((v) =>
      inRange(v.cancelada_em, semPrev.start, semPrev.end)
    );

    const mk = (sold: VendaRow[], canceled: VendaRow[]) => {
      const soldCount = sold.length;
      const cancelCount = canceled.length;
      const pct = soldCount > 0 ? cancelCount / soldCount : 0;
      return { soldCount, cancelCount, pct };
    };

    return {
      nowLabel: semNow.label,
      prevLabel: semPrev.label,
      prevPrevLabel: semPrevPrev.label,

      // "Semestre atual" (janela atual, coorte anterior)
      currentWindow: mk(soldPrev, canceledInNowFromPrev),

      // "Semestre anterior" (janela anterior, coorte anterior ao anterior)
      previousWindow: mk(soldPrevPrev, canceledInPrevFromPrevPrev),
    };
  }, [filtered]);

  /* =========================
     Prazo de contemplação
  ========================= */
  const prazo = useMemo(() => {
    const rows = filtered.filter((v) => v.encarteirada_em && v.data_contemplacao);
    const days = rows
      .map((v) => {
        // data_contemplacao é date => converte pra ISO local (meia-noite)
        const dc = v.data_contemplacao ? `${v.data_contemplacao}T00:00:00.000Z` : null;
        if (!dc || !v.encarteirada_em) return 0;
        return diffDays(v.encarteirada_em, dc);
      })
      .filter((d) => d > 0)
      .sort((a, b) => a - b);

    const mean = days.length ? days.reduce((s, x) => s + x, 0) / days.length : 0;
    const p50 = percentile(days, 0.5);
    const p75 = percentile(days, 0.75);

    const bySeg: Record<string, number[]> = {};
    const byAdm: Record<string, number[]> = {};
    rows.forEach((v) => {
      const dc = v.data_contemplacao ? `${v.data_contemplacao}T00:00:00.000Z` : null;
      if (!dc || !v.encarteirada_em) return;
      const d = diffDays(v.encarteirada_em, dc);
      if (d <= 0) return;

      const s = v.segmento || "—";
      const a = v.administradora || "—";

      bySeg[s] = bySeg[s] || [];
      bySeg[s].push(d);

      byAdm[a] = byAdm[a] || [];
      byAdm[a].push(d);
    });

    const avgOf = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);

    const segChart = Object.entries(bySeg)
      .map(([k, arr]) => ({ name: k, media: avgOf(arr) }))
      .sort((a, b) => b.media - a.media)
      .slice(0, 10);

    const admChart = Object.entries(byAdm)
      .map(([k, arr]) => ({ name: k, media: avgOf(arr) }))
      .sort((a, b) => b.media - a.media)
      .slice(0, 10);

    return { mean, p50, p75, segChart, admChart };
  }, [filtered]);

  /* =========================
     Clientes (via lead_id em vendas)
  ========================= */
  const clientes = useMemo(() => {
    const byLead: Record<string, { hasActive: boolean; hasCanceled: boolean }> = {};

    for (const v of filtered) {
      if (!v.lead_id) continue;
      const k = v.lead_id;
      byLead[k] = byLead[k] || { hasActive: false, hasCanceled: false };
      if (isActive(v)) byLead[k].hasActive = true;
      if (isCanceled(v)) byLead[k].hasCanceled = true;
    }

    const total = Object.keys(byLead).length;
    const ativos = Object.values(byLead).filter((x) => x.hasActive).length;
    const inativos = total - ativos;
    const pctAtivos = total > 0 ? ativos / total : 0;

    return { total, ativos, inativos, pctAtivos };
  }, [filtered]);

  /* =========================
     Carteira série mensal (12 meses)
     vendido: encarteirada_em
     cancelado: cancelada_em
  ========================= */
  const carteiraSerie = useMemo(() => {
    // últimos 12 meses a partir de agora (chaves YYYY-MM)
    const now = new Date();
    const keys: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = addMonths(now, -i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      keys.push(`${y}-${m}`);
    }

    const map: Record<string, { vendido: number; cancelado: number }> = {};
    keys.forEach((k) => (map[k] = { vendido: 0, cancelado: 0 }));

    filtered.forEach((v) => {
      const mk = monthKeyFromISO(v.encarteirada_em);
      if (mk && map[mk]) map[mk].vendido += safeNum(v.valor_venda);

      const ck = monthKeyFromISO(v.cancelada_em);
      if (ck && map[ck]) map[ck].cancelado += safeNum(v.valor_venda);
    });

    return keys.map((k) => {
      const vendido = map[k]?.vendido || 0;
      const cancelado = map[k]?.cancelado || 0;
      return {
        mes: k,
        vendido,
        cancelado,
        liquido: vendido - cancelado,
      };
    });
  }, [filtered]);

  /* =========================
     Distribuição por segmento (carteira ativa)
  ========================= */
  const distSegmento = useMemo(() => {
    const by: Record<string, number> = {};
    filtered.filter(isActive).forEach((v) => {
      const s = v.segmento || "—";
      by[s] = (by[s] || 0) + safeNum(v.valor_venda);
    });

    const total = Object.values(by).reduce((s, x) => s + x, 0);
    const rows = Object.entries(by)
      .map(([name, value]) => ({
        name,
        value,
        pct: total > 0 ? value / total : 0,
      }))
      .sort((a, b) => b.value - a.value);

    return { rows, total };
  }, [filtered]);

  /* =========================
     CONCENTRAÇÃO (o que você pediu)
     - base: carteira ativa
     - share por cliente: soma(valor_venda ativa do lead) / total carteira ativa
     - alerta >= 10%
     - Pareto Top10 vs Resto
  ========================= */
  const concRows = useMemo(() => {
    const byLead: Record<
      string,
      { lead_id: string; value: number; count: number; sellers: Set<string> }
    > = {};

    const ativos = filtered.filter(isActive);
    for (const v of ativos) {
      if (!v.lead_id) continue;
      const k = v.lead_id;
      byLead[k] = byLead[k] || { lead_id: k, value: 0, count: 0, sellers: new Set() };
      byLead[k].value += safeNum(v.valor_venda);
      byLead[k].count += 1;
      if (v.vendedor_id) byLead[k].sellers.add(v.vendedor_id);
    }

    const ativoTotal = totalsCarteira.ativoValue || 0;

    return Object.values(byLead)
      .map((x) => {
        const pct = ativoTotal > 0 ? x.value / ativoTotal : 0;
        return {
          ...x,
          pct,
          alerta: pct >= CONCENTRACAO_ALERTA,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [filtered, totalsCarteira.ativoValue]);

  const concKpis = useMemo(() => {
    const acima = concRows.filter((x) => x.alerta);
    const acimaPct = acima.reduce((s, x) => s + x.pct, 0);
    const top1 = concRows[0]?.pct || 0;
    return {
      acimaCount: acima.length,
      acimaPct,
      top1,
    };
  }, [concRows]);

  const paretoData = useMemo(() => {
    const top10 = concRows.slice(0, 10);
    const sumTop10 = top10.reduce((s, x) => s + x.pct, 0);
    const restoPct = Math.max(0, 1 - sumTop10);

    let cum = 0;
    const rows = top10.map((r) => {
      cum += r.pct;
      const lead = leadsMap[r.lead_id];
      const label =
        (lead?.nome || "Cliente").toString().slice(0, 18) + ((lead?.nome || "").length > 18 ? "…" : "");
      return {
        name: label,
        pct: r.pct,
        pct100: r.pct * 100,
        cum: cum,
        cum100: cum * 100,
      };
    });

    // adiciona "Resto"
    const cumFinal = Math.min(1, cum + restoPct);
    rows.push({
      name: "Resto",
      pct: restoPct,
      pct100: restoPct * 100,
      cum: cumFinal,
      cum100: cumFinal * 100,
    });

    return { rows, sumTop10, restoPct };
  }, [concRows, leadsMap]);

  /* =========================
     Dialog concentração (detalhes do cliente)
  ========================= */
  const leadDialogVendas = useMemo(() => {
    if (!leadDialogId) return [];
    return filtered.filter((v) => v.lead_id === leadDialogId);
  }, [filtered, leadDialogId]);

  const leadDialogAtivoTotal = useMemo(() => {
    return leadDialogVendas.filter(isActive).reduce((s, v) => s + safeNum(v.valor_venda), 0);
  }, [leadDialogVendas]);

  const leadDialogPct = useMemo(() => {
    const total = totalsCarteira.ativoValue || 0;
    return total > 0 ? leadDialogAtivoTotal / total : 0;
  }, [leadDialogAtivoTotal, totalsCarteira.ativoValue]);

  /* =========================
     UI
  ========================= */
  const vendorName = (authId: string | null) => {
    if (!authId) return "—";
    return usersMap[authId]?.name || "—";
  };

  const leadName = (lid: string | null) => {
    if (!lid) return "—";
    return leadsMap[lid]?.nome || lid;
  };

  const vendedorSelectDisabled = !isAdmin; // vendedor não pode ver outros
  useEffect(() => {
    if (!isAdmin && authUserId) {
      setFVendedor(authUserId);
    }
  }, [isAdmin, authUserId]);

  const concTotalPages = Math.max(1, Math.ceil(concRows.length / concPageSize));
  const concSlice = concRows.slice((concPage - 1) * concPageSize, concPage * concPageSize);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: C.navy }}>
            Relatórios
          </h1>
          <p className="text-sm" style={{ color: C.muted }}>
            Indicadores e análises da Consulmax (filtros auto-aplicáveis).
          </p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {isAdmin ? <Badge tone="ok">Perfil: Admin (vê tudo)</Badge> : <Badge tone="info">Perfil: Vendedor (somente suas vendas)</Badge>}
            <Badge tone="muted">Concentração: alerta ≥ {fmtPct(CONCENTRACAO_ALERTA, 0)}</Badge>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={fetchAll}
          disabled={loading || !authUserId}
          className="rounded-xl"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Atualizar
        </Button>
      </div>

      {/* Filtros globais */}
      <GlassCard>
        <CardHeader className="pb-2">
          <CardTitle className="text-base" style={{ color: C.navy }}>
            Filtros globais
          </CardTitle>
          <div className="text-xs" style={{ color: C.muted }}>
            Ao alterar qualquer filtro, os relatórios atualizam automaticamente.
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>Início</div>
              <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>Fim</div>
              <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>Vendedor</div>
              <Select
                value={fVendedor}
                onValueChange={setFVendedor}
                disabled={vendedorSelectDisabled}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {distincts.vends.map((id) => (
                    <SelectItem key={id} value={id}>
                      {vendorName(id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isAdmin && (
                <div className="text-[11px]" style={{ color: C.muted }}>
                  (Vendedor vê apenas as próprias vendas)
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>Administradora</div>
              <Select value={fAdmin} onValueChange={setFAdmin}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {distincts.admins.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>Segmento</div>
              <Select value={fSeg} onValueChange={setFSeg}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {distincts.segs.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>Tabela</div>
              <Select value={fTabela} onValueChange={setFTabela}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {distincts.tabs.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>Tipo de venda</div>
              <Select value={fTipoVenda} onValueChange={setFTipoVenda}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {distincts.tipos.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <div className="text-xs font-semibold" style={{ color: C.muted }}>Contemplada</div>
              <Select value={fContemplada} onValueChange={setFContemplada}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 flex items-end">
              <Button
                variant="outline"
                className="rounded-xl w-full"
                onClick={() => {
                  setDateStart("");
                  setDateEnd("");
                  setFAdmin("all");
                  setFSeg("all");
                  setFTabela("all");
                  setFTipoVenda("all");
                  setFContemplada("all");
                  if (isAdmin) setFVendedor("all");
                  else if (authUserId) setFVendedor(authUserId);
                }}
              >
                Limpar filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </GlassCard>

      {/* KPIs gerais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: C.muted }}>Carteira ativa</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-extrabold" style={{ color: C.navy }}>
            {fmtBRL(totalsCarteira.ativoValue)}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: C.muted }}>Total vendido (filtro)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-extrabold" style={{ color: C.navy }}>
            {fmtBRL(totalsCarteira.vendido)}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: C.muted }}>Total cancelado (filtro)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-extrabold" style={{ color: C.navy }}>
            {fmtBRL(totalsCarteira.cancelado)}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: C.muted }}>Carteira inadimplente</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-extrabold" style={{ color: C.navy }}>
            {fmtPct(totalsCarteira.inadPct, 1)}
          </CardContent>
          <div className="px-6 pb-4 text-xs" style={{ color: C.muted }}>
            Base: vendas ativas com <b>inad = true</b>
          </div>
        </GlassCard>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="concentracao" className="space-y-3">
        <TabsList className="rounded-2xl">
          <TabsTrigger value="inad126">Inadimplência 12-6</TabsTrigger>
          <TabsTrigger value="inad82">Inadimplência 8-2</TabsTrigger>
          <TabsTrigger value="prazo">Prazo</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="carteira">Carteira</TabsTrigger>
          <TabsTrigger value="segmentos">Segmentos</TabsTrigger>
          <TabsTrigger value="concentracao">Concentração</TabsTrigger>
        </TabsList>

        {/* 12-6 */}
        <TabsContent value="inad126" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                title: `Semestre anterior (${inad126.prevLabel})`,
                sold: inad126.previousWindow.soldCount,
                canceled: inad126.previousWindow.cancelCount,
                pct: inad126.previousWindow.pct,
              },
              {
                title: `Semestre atual (${inad126.nowLabel})`,
                sold: inad126.currentWindow.soldCount,
                canceled: inad126.currentWindow.cancelCount,
                pct: inad126.currentWindow.pct,
              },
            ].map((x) => {
              const alarm = x.pct > 0.30;
              const pieData = [
                { name: "Vendido", value: Math.max(0, x.sold - x.canceled) },
                { name: "Cancelado", value: x.canceled },
              ];

              return (
                <GlassCard key={x.title}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between" style={{ color: C.navy }}>
                      <span>{x.title}</span>
                      {alarm ? (
                        <Badge tone="danger">
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                          Alarmante (&gt; 30%)
                        </Badge>
                      ) : (
                        <Badge tone="ok">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          OK
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="text-xs" style={{ color: C.muted }}>
                      Cancelamento por coorte: vendas do semestre anterior observadas no semestre seguinte.
                    </div>
                  </CardHeader>
                  <CardContent className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={60}
                          outerRadius={85}
                          paddingAngle={2}
                        >
                          <Cell fill={C.navy} />
                          <Cell fill={C.rubi} />
                        </Pie>
                        <Tooltip formatter={(v: any) => v?.toLocaleString?.("pt-BR") ?? v} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-3 flex items-center justify-between text-sm" style={{ color: C.navy }}>
                      <span>Vendido: <b>{x.sold}</b></span>
                      <span>Cancelado: <b>{x.canceled}</b></span>
                      <span>%: <b>{fmtPct(x.pct, 1)}</b></span>
                    </div>
                  </CardContent>
                </GlassCard>
              );
            })}
          </div>
        </TabsContent>

        {/* 8-2 */}
        <TabsContent value="inad82" className="space-y-3">
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" style={{ color: C.navy }}>
                Inadimplência 8-2 (carteira atual)
              </CardTitle>
              <div className="text-xs" style={{ color: C.muted }}>
                Percentual da carteira ativa com <b>inad = true</b>. Aging por dias depende de uma fonte de “dias em atraso”.
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border" style={{ borderColor: C.border, background: "rgba(255,255,255,.45)" }}>
                <div className="text-xs font-semibold" style={{ color: C.muted }}>KPI % carteira inadimplente</div>
                <div className="text-3xl font-extrabold mt-1" style={{ color: C.navy }}>
                  {fmtPct(totalsCarteira.inadPct, 1)}
                </div>
                <div className="text-xs mt-1" style={{ color: C.muted }}>
                  Inadimplente: {fmtBRL(totalsCarteira.inadValue)} / Ativo: {fmtBRL(totalsCarteira.ativoValue)}
                </div>
              </div>

              <div className="p-3 rounded-xl border" style={{ borderColor: C.border, background: "rgba(255,255,255,.45)" }}>
                <div className="text-xs font-semibold" style={{ color: C.muted }}>Aging (placeholder)</div>
                <div className="text-xs mt-2" style={{ color: C.muted }}>
                  TODO: criar/ligar uma fonte com “dias em atraso” (ex.: primeira parcela em atraso / data_ultimo_pagamento / tabela específica).
                </div>
                <div className="h-[180px] mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { faixa: "0–7", qtd: 0 },
                        { faixa: "8–15", qtd: 0 },
                        { faixa: "16–30", qtd: 0 },
                        { faixa: "31–60", qtd: 0 },
                        { faixa: "61–90", qtd: 0 },
                        { faixa: "90+", qtd: 0 },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="faixa" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="qtd" fill={C.rubi} radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* Prazo */}
        <TabsContent value="prazo" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Média (dias)</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {Math.round(prazo.mean || 0)}
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Mediana P50 (dias)</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {Math.round(prazo.p50 || 0)}
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>P75 (dias)</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {Math.round(prazo.p75 || 0)}
              </CardContent>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>Prazo por segmento (média)</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prazo.segChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" hide />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="media" fill={C.navy} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>Prazo por administradora (média)</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prazo.admChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" hide />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="media" fill={C.gold} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </GlassCard>
          </div>
        </TabsContent>

        {/* Clientes */}
        <TabsContent value="clientes" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <GlassCard>
              <CardHeader className="pb-2"><CardTitle className="text-sm" style={{ color: C.muted }}>Total de clientes</CardTitle></CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>{clientes.total}</CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2"><CardTitle className="text-sm" style={{ color: C.muted }}>Clientes ativos</CardTitle></CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>{clientes.ativos}</CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2"><CardTitle className="text-sm" style={{ color: C.muted }}>Clientes inativos</CardTitle></CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>{clientes.inativos}</CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2"><CardTitle className="text-sm" style={{ color: C.muted }}>% que permanecem ativos</CardTitle></CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>{fmtPct(clientes.pctAtivos, 1)}</CardContent>
            </GlassCard>
          </div>

          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" style={{ color: C.navy }}>Resumo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: C.muted }}>
                      <th className="text-left py-2">Indicador</th>
                      <th className="text-right py-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody style={{ color: C.navy }}>
                    <tr className="border-t" style={{ borderColor: C.border }}>
                      <td className="py-2">Total de clientes (distinct lead_id)</td>
                      <td className="py-2 text-right font-bold">{clientes.total}</td>
                    </tr>
                    <tr className="border-t" style={{ borderColor: C.border }}>
                      <td className="py-2">Ativos (possuem cota ativa)</td>
                      <td className="py-2 text-right font-bold">{clientes.ativos}</td>
                    </tr>
                    <tr className="border-t" style={{ borderColor: C.border }}>
                      <td className="py-2">Inativos</td>
                      <td className="py-2 text-right font-bold">{clientes.inativos}</td>
                    </tr>
                    <tr className="border-t" style={{ borderColor: C.border }}>
                      <td className="py-2">% ativos</td>
                      <td className="py-2 text-right font-bold">{fmtPct(clientes.pctAtivos, 1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* Carteira */}
        <TabsContent value="carteira" className="space-y-3">
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" style={{ color: C.navy }}>Série mensal (últimos 12 meses)</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={carteiraSerie}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => fmtBRL(safeNum(v))} />
                  <Legend />
                  <Bar dataKey="vendido" name="Vendido" fill={C.navy} radius={[8, 8, 0, 0]} />
                  <Bar dataKey="cancelado" name="Cancelado" fill={C.rubi} radius={[8, 8, 0, 0]} />
                  <Line dataKey="liquido" name="Líquido" stroke={C.gold} strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* Segmentos */}
        <TabsContent value="segmentos" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>Distribuição da carteira ativa por segmento</CardTitle>
                <div className="text-xs" style={{ color: C.muted }}>Base: vendas ativas (codigo='00' e não cancelada)</div>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distSegmento.rows}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={2}
                    >
                      {distSegmento.rows.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={[C.navy, C.rubi, C.gold, "#2B3A55", "#8E7A3B", "#4D0E16"][idx % 6]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmtBRL(safeNum(v))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base" style={{ color: C.navy }}>Ranking por segmento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {distSegmento.rows.slice(0, 10).map((r) => (
                    <div key={r.name} className="flex items-center justify-between gap-3">
                      <div className="font-semibold truncate" style={{ color: C.navy }}>{r.name}</div>
                      <div className="flex items-center gap-2">
                        <Badge tone="info">{fmtPct(r.pct, 1)}</Badge>
                        <div className="font-bold" style={{ color: C.navy }}>{fmtBRL(r.value)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </GlassCard>
          </div>
        </TabsContent>

        {/* CONCENTRAÇÃO */}
        <TabsContent value="concentracao" className="space-y-3">
          {/* KPIs concentração */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Corte (alerta)</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {fmtPct(CONCENTRACAO_ALERTA, 0)}
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Clientes concentrados</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {concKpis.acimaCount}
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>% da carteira em concentrados</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {fmtPct(concKpis.acimaPct, 1)}
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Maior concentração (Top 1)</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-extrabold" style={{ color: C.navy }}>
                {fmtPct(concKpis.top1, 1)}
              </CardContent>
            </GlassCard>
          </div>

          {/* Pareto Top10 vs Resto */}
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between" style={{ color: C.navy }}>
                <span>Pareto de Concentração (Top 10 vs Resto)</span>
                <div className="flex items-center gap-2">
                  <Badge tone="info">Top 10: {fmtPct(paretoData.sumTop10, 1)}</Badge>
                  <Badge tone="muted">Resto: {fmtPct(paretoData.restoPct, 1)}</Badge>
                </div>
              </CardTitle>
              <div className="text-xs" style={{ color: C.muted }}>
                Barras = participação (%) • Linha = acumulado (%)
              </div>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={paretoData.rows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" interval={0} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tickFormatter={(v) => `${v}%`} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip
                    formatter={(v: any, k: any) => {
                      if (k === "pct100") return [`${Number(v).toFixed(1)}%`, "Participação"];
                      if (k === "cum100") return [`${Number(v).toFixed(1)}%`, "Acumulado"];
                      return [v, k];
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="pct100" name="Participação" fill={C.navy} radius={[8, 8, 0, 0]} />
                  <Line yAxisId="right" dataKey="cum100" name="Acumulado" stroke={C.gold} strokeWidth={3} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </GlassCard>

          {/* Lista Top clientes */}
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" style={{ color: C.navy }}>
                Concentração por cliente (carteira ativa)
              </CardTitle>
              <div className="text-xs" style={{ color: C.muted }}>
                Cada linha mostra quanto do total da carteira ativa está concentrado naquele cliente.
              </div>
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: C.muted }}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
              ) : concRows.length === 0 ? (
                <div className="text-sm" style={{ color: C.muted }}>
                  Sem dados de carteira ativa para exibir.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ color: C.muted }}>
                          <th className="text-left py-2">Cliente</th>
                          <th className="text-left py-2">Vendedor(es)</th>
                          <th className="text-right py-2">Valor (ativo)</th>
                          <th className="text-right py-2">% Concentração</th>
                          <th className="text-left py-2">Status</th>
                          <th className="text-right py-2">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {concSlice.map((row, idx) => {
                          const lead = leadsMap[row.lead_id];
                          const nome = lead?.nome || row.lead_id;
                          const sellers = Array.from(row.sellers)
                            .map((sid) => vendorName(sid))
                            .filter(Boolean)
                            .join(", ");

                          return (
                            <tr
                              key={row.lead_id}
                              className="border-t"
                              style={{ borderColor: C.border, color: C.navy }}
                            >
                              <td className="py-2">
                                <div className="font-bold truncate max-w-[260px]">{nome}</div>
                                <div className="text-xs truncate max-w-[260px]" style={{ color: C.muted }}>
                                  {lead?.telefone || "—"} • {lead?.email || "—"} • {lead?.origem || "—"}
                                </div>

                                {/* barra visual de concentração */}
                                <div className="mt-2 h-2 w-full rounded-full bg-white/60 border border-white/40 overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${Math.min(100, row.pct * 100)}%`,
                                      background: row.alerta ? C.rubi : C.navy,
                                    }}
                                  />
                                </div>
                              </td>

                              <td className="py-2">
                                <div className="text-sm">{sellers || "—"}</div>
                              </td>

                              <td className="py-2 text-right font-extrabold">{fmtBRL(row.value)}</td>

                              <td className="py-2 text-right">
                                <Badge tone={row.alerta ? "danger" : "info"}>
                                  {fmtPct(row.pct, 1)}
                                </Badge>
                              </td>

                              <td className="py-2">
                                {row.alerta ? (
                                  <Badge tone="danger">
                                    <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                                    Cliente concentrado
                                  </Badge>
                                ) : (
                                  <Badge tone="ok">
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                    OK
                                  </Badge>
                                )}
                              </td>

                              <td className="py-2 text-right">
                                <Button
                                  variant="outline"
                                  className="rounded-xl"
                                  onClick={() => {
                                    setLeadDialogId(row.lead_id);
                                    setLeadDialogOpen(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  Ver
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginação */}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs" style={{ color: C.muted }}>
                      Página {concPage} / {concTotalPages} • {concRows.length} clientes
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => setConcPage((p) => Math.max(1, p - 1))}
                        disabled={concPage <= 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => setConcPage((p) => Math.min(concTotalPages, p + 1))}
                        disabled={concPage >= concTotalPages}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </GlassCard>

          {/* Dialog detalhes */}
          <Dialog open={leadDialogOpen} onOpenChange={setLeadDialogOpen}>
            <DialogContent className="sm:max-w-[900px] rounded-2xl">
              <DialogHeader>
                <DialogTitle style={{ color: C.navy }}>
                  Detalhes do cliente (Concentração)
                </DialogTitle>
              </DialogHeader>

              {leadDialogId && (
                <div className="space-y-3">
                  <div className="rounded-xl border p-3" style={{ borderColor: C.border, background: "rgba(255,255,255,.45)" }}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-lg font-extrabold" style={{ color: C.navy }}>
                          {leadName(leadDialogId)}
                        </div>
                        <div className="text-xs mt-1" style={{ color: C.muted }}>
                          {leadsMap[leadDialogId]?.telefone || "—"} • {leadsMap[leadDialogId]?.email || "—"} • {leadsMap[leadDialogId]?.origem || "—"}
                        </div>

                        <div className="text-xs mt-2 flex items-center gap-2 flex-wrap" style={{ color: C.muted }}>
                          <span>Carteira ativa do cliente:</span>
                          <span className="font-bold" style={{ color: C.navy }}>{fmtBRL(leadDialogAtivoTotal)}</span>
                          <Badge tone={leadDialogPct >= CONCENTRACAO_ALERTA ? "danger" : "info"}>
                            {fmtPct(leadDialogPct, 1)} da carteira
                          </Badge>
                          {leadDialogPct >= CONCENTRACAO_ALERTA ? (
                            <Badge tone="danger">Cliente concentrado (≥ 10%)</Badge>
                          ) : (
                            <Badge tone="ok">OK</Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-semibold" style={{ color: C.muted }}>
                          Total cotas (filtro)
                        </div>
                        <div className="text-2xl font-extrabold" style={{ color: C.navy }}>
                          {leadDialogVendas.length}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ color: C.muted }}>
                          <th className="text-left py-2">Grupo/Cota</th>
                          <th className="text-left py-2">Administradora</th>
                          <th className="text-left py-2">Segmento</th>
                          <th className="text-left py-2">Tabela</th>
                          <th className="text-left py-2">Vendedor</th>
                          <th className="text-left py-2">Status</th>
                          <th className="text-right py-2">Valor</th>
                        </tr>
                      </thead>
                      <tbody style={{ color: C.navy }}>
                        {leadDialogVendas.slice(0, 50).map((v) => (
                          <tr key={v.id} className="border-t" style={{ borderColor: C.border }}>
                            <td className="py-2">{`${v.grupo || "—"} / ${v.cota || "—"}`}</td>
                            <td className="py-2">{v.administradora || "—"}</td>
                            <td className="py-2">{v.segmento || "—"}</td>
                            <td className="py-2">{v.tabela || "—"}</td>
                            <td className="py-2">{vendorName(v.vendedor_id)}</td>
                            <td className="py-2">
                              {isActive(v) ? <Badge tone="ok">Ativa</Badge> : isCanceled(v) ? <Badge tone="danger">Cancelada</Badge> : <Badge tone="muted">—</Badge>}
                              {Boolean(v.inad) && isActive(v) && <span className="ml-2"><Badge tone="danger">Inad</Badge></span>}
                            </td>
                            <td className="py-2 text-right font-bold">{fmtBRL(safeNum(v.valor_venda))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {leadDialogVendas.length > 50 && (
                    <div className="text-xs" style={{ color: C.muted }}>
                      Mostrando 50 de {leadDialogVendas.length} registros.
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
