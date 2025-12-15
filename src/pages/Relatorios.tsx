// src/pages/Relatorios.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";

import { Loader2, RefreshCcw, AlertTriangle } from "lucide-react";

type UUID = string;

type VendaRow = {
  id: UUID;
  data_venda: string | null; // date
  vendedor_id: UUID | null;

  segmento: string | null;
  tabela: string | null;
  administradora: string | null;
  forma_venda: string | null;
  numero_proposta: string | null;

  lead_id: UUID | null;

  valor_venda: number | null;

  grupo: string | null;
  cota: string | null;
  codigo: string | null;

  encarteirada_em: string | null; // timestamptz
  tipo_venda: string | null; // Normal/Contemplada/Bolsão
  contemplada: boolean | null;
  data_contemplacao: string | null; // date
  cancelada_em: string | null; // timestamptz

  inad: boolean | null;

  created_at: string | null; // timestamptz
};

type UserRow = {
  auth_user_id: UUID;
  name?: string | null;
  nome?: string | null;
  email?: string | null;
  phone?: string | null;
  telefone?: string | null;
  user_role?: string | null; // admin|vendedor
  is_active?: boolean | null;
};

type LeadRow = {
  id: UUID;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  origem: string | null;
};

const C = {
  rubi: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
  muted: "rgba(30,41,63,.70)",
  border: "rgba(255,255,255,.35)",
  glass: "rgba(255,255,255,.60)",
};

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseISODateOnly(isoOrDate: string | null | undefined): Date | null {
  if (!isoOrDate) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) {
    const [y, m, d] = isoOrDate.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
  }
  const dt = new Date(isoOrDate);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toYYYYMM(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function todayStrLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function dateToLocalStartISO(yyyyMMdd: string) {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  return dt.toISOString();
}
function dateToLocalEndISO(yyyyMMdd: string) {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
  return dt.toISOString();
}

function percentile(arr: number[], p: number) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? 0;
  const w = idx - lo;
  return (sorted[lo] ?? 0) * (1 - w) + (sorted[hi] ?? 0) * w;
}

function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function semesterKey(d: Date) {
  const y = d.getFullYear();
  const h = d.getMonth() < 6 ? "H1" : "H2";
  return `${y}-${h}`;
}
function semesterRange(key: string) {
  const [yy, hh] = key.split("-");
  const y = Number(yy);
  const isH1 = hh === "H1";
  const start = new Date(y, isH1 ? 0 : 6, 1, 0, 0, 0, 0);
  const end = new Date(y, isH1 ? 5 : 11, isH1 ? 30 : 31, 23, 59, 59, 999);
  return { start, end };
}
function prevSemesterKey(key: string) {
  const [yy, hh] = key.split("-");
  const y = Number(yy);
  if (hh === "H1") return `${y - 1}-H2`;
  return `${y}-H1`;
}

function isActive(v: VendaRow) {
  const codeOk = (v.codigo ?? "").trim() === "00";
  const cancelled = !!v.cancelada_em || ((v.codigo ?? "").trim() !== "" && (v.codigo ?? "").trim() !== "00");
  return codeOk && !cancelled;
}
function isCancelled(v: VendaRow) {
  const code = (v.codigo ?? "").trim();
  return !!v.cancelada_em || (code !== "" && code !== "00");
}
function encarteiraDate(v: VendaRow): Date | null {
  return parseISODateOnly(v.encarteirada_em) ?? parseISODateOnly(v.data_venda) ?? null;
}
function cancelDate(v: VendaRow): Date | null {
  return parseISODateOnly(v.cancelada_em) ?? null;
}

const GlassCard: React.FC<React.ComponentProps<typeof Card>> = ({ className, ...props }) => (
  <Card
    className={[
      "border",
      "shadow-sm",
      "backdrop-blur-md",
      "bg-white/60",
      "border-white/40",
      "text-[#1E293F]",
      className ?? "",
    ].join(" ")}
    {...props}
  />
);

const Badge: React.FC<{ variant?: "danger" | "ok" | "warn" | "info"; children: React.ReactNode }> = ({
  variant = "info",
  children,
}) => {
  const map: Record<string, string> = {
    danger: "bg-[#A11C27] text-white",
    ok: "bg-[#1E293F] text-white",
    warn: "bg-[#B5A573] text-[#1E293F]",
    info: "bg-white/70 text-[#1E293F] border border-white/40",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs ${map[variant]}`}>{children}</span>;
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border px-3 py-2 text-sm shadow-sm"
      style={{ background: C.glass, borderColor: C.border, color: C.navy }}
    >
      {label != null && <div className="text-xs mb-1" style={{ color: C.muted }}>{String(label)}</div>}
      {payload.map((p: any, idx: number) => (
        <div key={idx} className="flex items-center justify-between gap-3">
          <span className="text-xs" style={{ color: C.muted }}>{p.name ?? p.dataKey}</span>
          <span className="font-medium">
            {typeof p.value === "number" ? p.value.toLocaleString("pt-BR") : String(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Relatorios() {
  // ====== auth / perfil ======
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [profileLoading, setProfileLoading] = useState<boolean>(true);

  // ====== filtros ======
  const [dateStart, setDateStart] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  });
  const [dateEnd, setDateEnd] = useState<string>(() => todayStrLocal());

  const [vendorId, setVendorId] = useState<string>("all"); // admin controla; vendedor fica travado no authUserId
  const [administradora, setAdministradora] = useState<string>("all");
  const [segmento, setSegmento] = useState<string>("all");
  const [tabela, setTabela] = useState<string>("all");
  const [tipoVenda, setTipoVenda] = useState<string>("all");
  const [contemplada, setContemplada] = useState<string>("all"); // all/sim/nao

  // ====== dados ======
  const [loading, setLoading] = useState(false);
  const [vendas, setVendas] = useState<VendaRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // lead names (para Concentração)
  const [leadNameById, setLeadNameById] = useState<Map<string, LeadRow>>(new Map());
  const [leadsLoading, setLeadsLoading] = useState(false);

  // dialog (concentração)
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leadDialogLead, setLeadDialogLead] = useState<LeadRow | null>(null);
  const [leadDialogVendas, setLeadDialogVendas] = useState<VendaRow[]>([]);
  const [leadDialogLoading, setLeadDialogLoading] = useState(false);

  // paginação simples (10/pg)
  const [pageNewInad, setPageNewInad] = useState(1);
  const [pageRisk, setPageRisk] = useState(1);
  const [pageTopClients, setPageTopClients] = useState(1);
  const PAGE = 10;

  // ====== carregar auth + perfil (admin/vendedor) ======
  useEffect(() => {
    let alive = true;
    (async () => {
      setProfileLoading(true);
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!alive) return;

        const uid = error ? null : data?.user?.id ?? null;
        setAuthUserId(uid);

        // por segurança: default não-admin até provar que é admin
        let admin = false;

        if (uid) {
          const { data: prof, error: profErr } = await supabase
            .from("users")
            .select("auth_user_id,user_role,is_active,name,nome")
            .eq("auth_user_id", uid)
            .maybeSingle();

          if (!profErr && prof) {
            admin = String(prof.user_role ?? "").toLowerCase() === "admin";
          }
        }

        if (!alive) return;
        setIsAdmin(admin);

        // trava o filtro de vendedor para quem não é admin
        if (uid && !admin) {
          setVendorId(uid);
        } else {
          setVendorId("all");
        }
      } catch (e) {
        if (!alive) return;
        console.error("Erro ao carregar perfil:", e);
        setIsAdmin(false);
      } finally {
        if (alive) setProfileLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // ====== load users (para nomes) ======
  useEffect(() => {
    let alive = true;
    (async () => {
      setUsersLoading(true);
      try {
        const { data, error } = await supabase
          .from("users")
          .select("auth_user_id,name,nome,email,phone,telefone,user_role,is_active");

        if (!alive) return;
        if (error) {
          console.error("Erro ao carregar users:", error.message);
          setUsers([]);
          return;
        }

        const list = (data ?? []) as UserRow[];
        // regra já combinada: não listar inativos
        const activeOnly = list.filter((u) => u.is_active !== false);
        setUsers(activeOnly);
      } catch (e) {
        if (!alive) return;
        console.error("Erro inesperado ao carregar users:", e);
        setUsers([]);
      } finally {
        if (alive) setUsersLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const userNameByAuthId = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) {
      const nm = (u.name ?? u.nome ?? "").trim();
      if (u.auth_user_id) m.set(u.auth_user_id, nm || u.email || u.auth_user_id);
    }
    return m;
  }, [users]);

  // ====== load vendas (com trava por perfil) ======
  async function loadVendas() {
    // se ainda estamos carregando perfil, evita queries duplicadas
    if (profileLoading) return;

    setLoading(true);
    try {
      let q = supabase
        .from("vendas")
        .select(
          "id,data_venda,vendedor_id,segmento,tabela,administradora,forma_venda,numero_proposta,lead_id,valor_venda,grupo,cota,codigo,encarteirada_em,tipo_venda,contemplada,data_contemplacao,cancelada_em,inad,created_at"
        )
        .order("encarteirada_em", { ascending: false })
        .limit(5000);

      // período por encarteirada_em
      if (dateStart) q = q.gte("encarteirada_em", dateToLocalStartISO(dateStart));
      if (dateEnd) q = q.lte("encarteirada_em", dateToLocalEndISO(dateEnd));

      // TRAVA por perfil:
      // - vendedor: sempre filtra por vendedor_id == authUserId
      // - admin: aplica filtro normal do select (se não for "all")
      if (!isAdmin) {
        if (authUserId) q = q.eq("vendedor_id", authUserId);
      } else {
        if (vendorId !== "all") q = q.eq("vendedor_id", vendorId);
      }

      if (administradora !== "all") q = q.eq("administradora", administradora);
      if (segmento !== "all") q = q.eq("segmento", segmento);
      if (tabela !== "all") q = q.eq("tabela", tabela);
      if (tipoVenda !== "all") q = q.eq("tipo_venda", tipoVenda);
      if (contemplada === "sim") q = q.eq("contemplada", true);
      if (contemplada === "nao") q = q.eq("contemplada", false);

      const { data, error } = await q;
      if (error) {
        console.error("Erro ao carregar vendas:", error.message);
        setVendas([]);
        return;
      }
      setVendas((data ?? []) as VendaRow[]);

      // reset paginação
      setPageNewInad(1);
      setPageRisk(1);
      setPageTopClients(1);
    } catch (e) {
      console.error("Erro inesperado ao carregar vendas:", e);
      setVendas([]);
    } finally {
      setLoading(false);
    }
  }

  // ====== auto-aplicar filtros (debounce leve) ======
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (profileLoading) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(() => {
      loadVendas();
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profileLoading,
    isAdmin,
    authUserId,
    dateStart,
    dateEnd,
    vendorId,
    administradora,
    segmento,
    tabela,
    tipoVenda,
    contemplada,
  ]);

  // carregamento inicial (quando perfil terminar)
  useEffect(() => {
    if (!profileLoading) loadVendas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoading]);

  // ====== opções de filtros (derivadas das vendas carregadas) ======
  const filterOptions = useMemo(() => {
    const admins = new Set<string>();
    const segs = new Set<string>();
    const tabs = new Set<string>();
    const tipos = new Set<string>();

    for (const v of vendas) {
      if (v.administradora) admins.add(v.administradora);
      if (v.segmento) segs.add(v.segmento);
      if (v.tabela) tabs.add(v.tabela);
      if (v.tipo_venda) tipos.add(v.tipo_venda);
    }

    const sort = (a: string, b: string) => a.localeCompare(b, "pt-BR");
    return {
      administradoras: Array.from(admins).sort(sort),
      segmentos: Array.from(segs).sort(sort),
      tabelas: Array.from(tabs).sort(sort),
      tipos: Array.from(tipos).sort(sort),
    };
  }, [vendas]);

  // ====== agregações principais ======
  const vendasAtivas = useMemo(() => vendas.filter(isActive), [vendas]);
  const vendasCanceladas = useMemo(() => vendas.filter(isCancelled), [vendas]);

  const totalsCarteira = useMemo(() => {
    const totalVendido = vendas.reduce((s, v) => s + safeNum(v.valor_venda), 0);
    const totalCancelado = vendasCanceladas.reduce((s, v) => s + safeNum(v.valor_venda), 0);
    const totalLiquido = totalVendido - totalCancelado;

    const ativoValue = vendasAtivas.reduce((s, v) => s + safeNum(v.valor_venda), 0);
    const inadValue = vendasAtivas.filter((v) => !!v.inad).reduce((s, v) => s + safeNum(v.valor_venda), 0);

    const inadPct = ativoValue > 0 ? inadValue / ativoValue : 0;

    return {
      totalVendido,
      totalCancelado,
      totalLiquido,
      ativoValue,
      inadValue,
      inadPct,
      countAtivas: vendasAtivas.length,
      countInad: vendasAtivas.filter((v) => !!v.inad).length,
    };
  }, [vendas, vendasAtivas, vendasCanceladas]);

  // ====== A) Inadimplência 12-6 ======
  const inad126 = useMemo(() => {
    const now = new Date();
    const curSem = semesterKey(now);
    const cohortAtual = prevSemesterKey(curSem);
    const obsAtual = curSem;

    const cohortAnterior = prevSemesterKey(cohortAtual);
    const obsAnterior = cohortAtual;

    const build = (cohortKey: string, obsKey: string) => {
      const { start: cStart, end: cEnd } = semesterRange(cohortKey);
      const { start: oStart, end: oEnd } = semesterRange(obsKey);

      const cohort = vendas.filter((v) => {
        const d = encarteiraDate(v);
        return d && d >= cStart && d <= cEnd;
      });

      const sold = cohort.length;

      const cancelledInObs = cohort.filter((v) => {
        const cd = cancelDate(v);
        if (!cd) return false;
        return cd >= oStart && cd <= oEnd;
      }).length;

      const pct = sold > 0 ? cancelledInObs / sold : 0;

      return {
        cohortKey,
        obsKey,
        sold,
        cancelled: cancelledInObs,
        pct,
        alarm: pct > 0.3,
      };
    };

    return {
      atual: build(cohortAtual, obsAtual),
      anterior: build(cohortAnterior, obsAnterior),
    };
  }, [vendas]);

  // ====== C) Prazo médio ======
  const prazoStats = useMemo(() => {
    const samples: number[] = [];
    const bySeg: Record<string, number[]> = {};
    const byAdm: Record<string, number[]> = {};

    for (const v of vendas) {
      if (!v.encarteirada_em || !v.data_contemplacao) continue;
      const e = parseISODateOnly(v.encarteirada_em);
      const c = parseISODateOnly(v.data_contemplacao);
      if (!e || !c) continue;

      const days = Math.max(0, Math.round((c.getTime() - e.getTime()) / (1000 * 60 * 60 * 24)));
      samples.push(days);

      const seg = (v.segmento ?? "—").trim() || "—";
      const adm = (v.administradora ?? "—").trim() || "—";
      bySeg[seg] = bySeg[seg] ?? [];
      byAdm[adm] = byAdm[adm] ?? [];
      bySeg[seg].push(days);
      byAdm[adm].push(days);
    }

    const meanDays = mean(samples);
    const p50 = percentile(samples, 0.5);
    const p75 = percentile(samples, 0.75);

    const segChart = Object.entries(bySeg)
      .map(([k, arr]) => ({ name: k, dias: Math.round(mean(arr)) }))
      .sort((a, b) => b.dias - a.dias);

    const admChart = Object.entries(byAdm)
      .map(([k, arr]) => ({ name: k, dias: Math.round(mean(arr)) }))
      .sort((a, b) => b.dias - a.dias);

    return { meanDays, p50, p75, segChart, admChart, n: samples.length };
  }, [vendas]);

  // ====== D) Clientes (via lead_id) ======
  const clientesStats = useMemo(() => {
    const leadIdsAll = new Set<string>();
    const leadIdsActive = new Set<string>();

    for (const v of vendas) {
      if (!v.lead_id) continue;
      leadIdsAll.add(v.lead_id);
      if (isActive(v)) leadIdsActive.add(v.lead_id);
    }

    const total = leadIdsAll.size;
    const ativos = leadIdsActive.size;
    const inativos = Math.max(0, total - ativos);
    const pctAtivo = total > 0 ? ativos / total : 0;

    return { total, ativos, inativos, pctAtivo };
  }, [vendas]);

  // ====== E) Série mensal (12 meses) ======
  const serieMensal = useMemo(() => {
    const now = new Date();
    const months: string[] = [];
    const cursor = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
    cursor.setMonth(cursor.getMonth() - 11);
    for (let i = 0; i < 12; i++) {
      months.push(toYYYYMM(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const soldBy: Record<string, number> = {};
    const canceledBy: Record<string, number> = {};

    for (const v of vendas) {
      const e = encarteiraDate(v);
      if (e) {
        const k = toYYYYMM(new Date(e.getFullYear(), e.getMonth(), 1, 12, 0, 0, 0));
        soldBy[k] = (soldBy[k] ?? 0) + safeNum(v.valor_venda);
      }
      const c = cancelDate(v);
      if (c) {
        const k = toYYYYMM(new Date(c.getFullYear(), c.getMonth(), 1, 12, 0, 0, 0));
        canceledBy[k] = (canceledBy[k] ?? 0) + safeNum(v.valor_venda);
      }
    }

    return months.map((m) => {
      const vendido = soldBy[m] ?? 0;
      const cancelado = canceledBy[m] ?? 0;
      return {
        mes: m,
        vendido: Math.round(vendido),
        cancelado: Math.round(cancelado),
        liquido: Math.round(vendido - cancelado),
      };
    });
  }, [vendas]);

  // ====== F) Distribuição por segmento (carteira ativa) ======
  const distSegmento = useMemo(() => {
    const map: Record<string, number> = {};
    const total = vendasAtivas.reduce((s, v) => s + safeNum(v.valor_venda), 0);
    for (const v of vendasAtivas) {
      const k = (v.segmento ?? "—").trim() || "—";
      map[k] = (map[k] ?? 0) + safeNum(v.valor_venda);
    }

    const arr = Object.entries(map)
      .map(([name, value]) => ({
        name,
        value: Math.round(value),
        pct: total > 0 ? value / total : 0,
      }))
      .sort((a, b) => b.value - a.value);

    return { total, data: arr };
  }, [vendasAtivas]);

  // ====== B) Inadimplência 8-2 ======
  const inad82 = useMemo(() => {
    const inad = vendasAtivas.filter((v) => !!v.inad);

    const recent = [...inad].sort((a, b) => {
      const da = parseISODateOnly(a.created_at) ?? new Date(0);
      const db = parseISODateOnly(b.created_at) ?? new Date(0);
      return db.getTime() - da.getTime();
    });

    const risk = [...inad].sort((a, b) => safeNum(b.valor_venda) - safeNum(a.valor_venda));

    const aging = [
      { faixa: "0–7", qtd: 0 },
      { faixa: "8–15", qtd: 0 },
      { faixa: "16–30", qtd: 0 },
      { faixa: "31–60", qtd: 0 },
      { faixa: "61–90", qtd: 0 },
      { faixa: "90+", qtd: 0 },
    ];

    return { recent, risk, aging };
  }, [vendasAtivas]);

  const slicePage = (arr: any[], page: number) => arr.slice((page - 1) * PAGE, page * PAGE);
  const pagesCount = (arr: any[]) => Math.max(1, Math.ceil(arr.length / PAGE));

  // ====== G) Concentração ======
  const topLeads = useMemo(() => {
    const byLead: Record<string, { lead_id: string; value: number; count: number; sellers: Set<string> }> = {};
    for (const v of vendasAtivas) {
      if (!v.lead_id) continue;
      const k = v.lead_id;
      byLead[k] = byLead[k] ?? { lead_id: k, value: 0, count: 0, sellers: new Set() };
      byLead[k].value += safeNum(v.valor_venda);
      byLead[k].count += 1;
      if (v.vendedor_id) byLead[k].sellers.add(v.vendedor_id);
    }

    return Object.values(byLead)
      .sort((a, b) => b.value - a.value)
      .slice(0, 50);
  }, [vendasAtivas]);

  // carregar nomes dos leads do ranking (para não mostrar UUID)
  useEffect(() => {
    let alive = true;

    const ids = topLeads.map((x) => x.lead_id).filter(Boolean);
    if (!ids.length) {
      setLeadNameById(new Map());
      return;
    }

    (async () => {
      setLeadsLoading(true);
      try {
        // supabase "in" costuma aceitar até uma quantidade razoável; aqui 50 está ok
        const { data, error } = await supabase
          .from("leads")
          .select("id,nome,telefone,email,origem")
          .in("id", ids);

        if (!alive) return;

        if (error) {
          console.error("Erro ao carregar leads (ranking):", error.message);
          return;
        }

        const map = new Map<string, LeadRow>();
        for (const row of (data ?? []) as any[]) {
          map.set(row.id, row as LeadRow);
        }
        setLeadNameById(map);
      } catch (e) {
        if (!alive) return;
        console.error("Erro inesperado ao carregar leads (ranking):", e);
      } finally {
        if (alive) setLeadsLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [topLeads]);

  async function openLeadDialog(leadId: string) {
    setLeadDialogOpen(true);
    setLeadDialogLoading(true);
    setLeadDialogLead(null);
    setLeadDialogVendas([]);

    try {
      const { data: leadData, error: leadErr } = await supabase
        .from("leads")
        .select("id,nome,telefone,email,origem")
        .eq("id", leadId)
        .maybeSingle();

      if (leadErr) console.error("Erro ao carregar lead:", leadErr.message);
      setLeadDialogLead((leadData ?? null) as LeadRow | null);

      const vendasLead = vendas
        .filter((v) => v.lead_id === leadId)
        .sort((a, b) => safeNum(b.valor_venda) - safeNum(a.valor_venda));

      setLeadDialogVendas(vendasLead);
    } catch (e) {
      console.error("Erro inesperado ao abrir dialog do lead:", e);
    } finally {
      setLeadDialogLoading(false);
    }
  }

  const lockedVendorName = useMemo(() => {
    if (!authUserId) return "Meu usuário";
    return userNameByAuthId.get(authUserId) ?? "Meu usuário";
  }, [authUserId, userNameByAuthId]);

  // ====== UI ======
  return (
    <div className="p-4 md:p-6 space-y-4" style={{ color: C.navy }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.navy }}>Relatórios</h1>
          <p className="text-sm" style={{ color: C.muted }}>
            Indicadores e análises da operação (base: <span className="font-medium">public.vendas</span> + users + leads).
          </p>
        </div>

        <Button
          variant="outline"
          onClick={loadVendas}
          disabled={loading || profileLoading}
          className="border-white/40 bg-white/60 hover:bg-white/70"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
          Atualizar
        </Button>
      </div>

      {/* Filtros globais (AUTO aplica) */}
      <GlassCard>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filtros globais</CardTitle>
          <div className="text-xs" style={{ color: C.muted }}>
            Ajustou qualquer filtro? Já aplica automaticamente.
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-1 md:grid-cols-7 gap-3">
          <div className="space-y-1">
            <Label>Início</Label>
            <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Fim</Label>
            <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Vendedor</Label>
            <Select
              value={isAdmin ? vendorId : (authUserId ?? "all")}
              onValueChange={(v) => isAdmin && setVendorId(v)}
              disabled={!isAdmin}
            >
              <SelectTrigger className="bg-white/70 border-white/40">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                {isAdmin ? (
                  <>
                    <SelectItem value="all">Todos</SelectItem>
                    {usersLoading ? (
                      <div className="px-3 py-2 text-xs" style={{ color: C.muted }}>Carregando…</div>
                    ) : (
                      users
                        .slice()
                        .sort((a, b) => (a.name ?? a.nome ?? "").localeCompare((b.name ?? b.nome ?? ""), "pt-BR"))
                        .map((u) => (
                          <SelectItem key={u.auth_user_id} value={u.auth_user_id}>
                            {(u.name ?? u.nome ?? u.email ?? u.auth_user_id) as string}
                          </SelectItem>
                        ))
                    )}
                  </>
                ) : (
                  <SelectItem value={authUserId ?? "all"}>{lockedVendorName}</SelectItem>
                )}
              </SelectContent>
            </Select>
            {!isAdmin && (
              <div className="text-[11px]" style={{ color: C.muted }}>
                Perfil vendedor: filtrado automaticamente nas suas vendas.
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Administradora</Label>
            <Select value={administradora} onValueChange={setAdministradora}>
              <SelectTrigger className="bg-white/70 border-white/40">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {filterOptions.administradoras.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Segmento</Label>
            <Select value={segmento} onValueChange={setSegmento}>
              <SelectTrigger className="bg-white/70 border-white/40">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filterOptions.segmentos.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Tabela</Label>
            <Select value={tabela} onValueChange={setTabela}>
              <SelectTrigger className="bg-white/70 border-white/40">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {filterOptions.tabelas.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Tipo de venda</Label>
            <Select value={tipoVenda} onValueChange={setTipoVenda}>
              <SelectTrigger className="bg-white/70 border-white/40">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filterOptions.tipos.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>Contemplada</Label>
            <Select value={contemplada} onValueChange={setContemplada}>
              <SelectTrigger className="bg-white/70 border-white/40">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-7 flex gap-2 flex-wrap pt-1">
            <Button
              variant="outline"
              className="border-white/40 bg-white/60 hover:bg-white/70"
              onClick={() => {
                setAdministradora("all");
                setSegmento("all");
                setTabela("all");
                setTipoVenda("all");
                setContemplada("all");
                if (isAdmin) setVendorId("all");
                // vendedor permanece travado no authUserId
              }}
            >
              Limpar filtros
            </Button>

            <div className="ml-auto text-xs flex items-center gap-2" style={{ color: C.muted }}>
              <span>Registros:</span>
              <span className="font-semibold" style={{ color: C.navy }}>{vendas.length}</span>
              {(loading || profileLoading) && (
                <span className="inline-flex items-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> carregando…
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </GlassCard>

      <Tabs defaultValue="geral" className="space-y-3">
        <TabsList className="bg-white/60 border border-white/40">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="inad126">Inadimplência 12-6</TabsTrigger>
          <TabsTrigger value="inad82">Inadimplência 8-2</TabsTrigger>
          <TabsTrigger value="prazo">Prazo</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="carteira">Carteira</TabsTrigger>
          <TabsTrigger value="segmentos">Segmentos</TabsTrigger>
          <TabsTrigger value="concentracao">Concentração</TabsTrigger>
        </TabsList>

        {/* Geral */}
        <TabsContent value="geral" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Total vendido</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">{fmtBRL(totalsCarteira.totalVendido)}</CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Total cancelado</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">{fmtBRL(totalsCarteira.totalCancelado)}</CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Total líquido</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">{fmtBRL(totalsCarteira.totalLiquido)}</CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Carteira inadimplente</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-xl font-bold">
                  {(totalsCarteira.inadPct * 100).toFixed(1)}%
                </div>
                <Badge variant={totalsCarteira.inadPct > 0.08 ? "warn" : "info"}>
                  {fmtBRL(totalsCarteira.inadValue)}
                </Badge>
              </CardContent>
            </GlassCard>
          </div>

          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Série mensal (últimos 12 meses)</CardTitle>
              <div className="text-xs" style={{ color: C.muted }}>
                Vendido / Cancelado / Líquido
              </div>
            </CardHeader>
            <CardContent style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serieMensal}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="vendido" name="Vendido" stroke={C.navy} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="cancelado" name="Cancelado" stroke={C.rubi} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="liquido" name="Líquido" stroke={C.gold} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </GlassCard>
        </TabsContent>

        {/* Inadimplência 12-6 */}
        <TabsContent value="inad126" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["anterior", "atual"] as const).map((k) => {
              const item = inad126[k];
              const sold = item.sold;
              const cancelled = item.cancelled;
              const pct = item.pct;

              const donutData = [
                { name: "Vendido", value: sold - cancelled },
                { name: "Cancelado", value: cancelled },
              ];

              const title = k === "atual" ? "Semestre atual" : "Semestre anterior";
              const subtitle = `Coorte ${item.cohortKey} → cancelamentos em ${item.obsKey}`;

              return (
                <GlassCard key={k}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{title}</CardTitle>
                        <div className="text-xs" style={{ color: C.muted }}>{subtitle}</div>
                      </div>
                      {item.alarm ? (
                        <Badge variant="danger" title="Acima de 30%">
                          <span className="inline-flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            ALARMANTE
                          </span>
                        </Badge>
                      ) : (
                        <Badge variant="ok">{(pct * 100).toFixed(1)}%</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                    <div style={{ height: 220 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <RechartsTooltip content={<CustomTooltip />} />
                          <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={85} paddingAngle={2}>
                            <Cell fill={C.navy} />
                            <Cell fill={C.rubi} />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm" style={{ color: C.muted }}>% Cancelado</div>
                      <div className="text-2xl font-bold" style={{ color: C.navy }}>
                        {(pct * 100).toFixed(1)}%
                      </div>
                      <div className="text-sm" style={{ color: C.muted }}>
                        Vendido: <span className="font-semibold" style={{ color: C.navy }}>{sold}</span>
                      </div>
                      <div className="text-sm" style={{ color: C.muted }}>
                        Cancelado: <span className="font-semibold" style={{ color: C.navy }}>{cancelled}</span>
                      </div>
                      <div className="text-xs" style={{ color: C.muted }}>
                        Regra: coorte por semestre de encarteiramento e cancelamento no semestre seguinte.
                      </div>
                    </div>
                  </CardContent>
                </GlassCard>
              );
            })}
          </div>
        </TabsContent>

        {/* Inadimplência 8-2 */}
        <TabsContent value="inad82" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <GlassCard className="md:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">KPI</CardTitle>
                <div className="text-xs" style={{ color: C.muted }}>
                  % da carteira ativa (por valor) que está inadimplente
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-3xl font-bold" style={{ color: C.navy }}>
                  {(totalsCarteira.inadPct * 100).toFixed(1)}%
                </div>
                <div className="text-sm" style={{ color: C.muted }}>
                  Inadimplente: <span className="font-semibold" style={{ color: C.navy }}>{fmtBRL(totalsCarteira.inadValue)}</span>
                </div>
                <div className="text-sm" style={{ color: C.muted }}>
                  Carteira ativa: <span className="font-semibold" style={{ color: C.navy }}>{fmtBRL(totalsCarteira.ativoValue)}</span>
                </div>
                <div className="text-xs" style={{ color: C.muted }}>
                  Fonte: vendas.inad (bool). Aging por dias em atraso: pronto para plugar.
                </div>
              </CardContent>
            </GlassCard>

            <GlassCard className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Aging da inadimplência</CardTitle>
                <div className="text-xs" style={{ color: C.muted }}>
                  0–7 / 8–15 / 16–30 / 31–60 / 61–90 / 90+ dias
                </div>
              </CardHeader>
              <CardContent style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inad82.aging}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="faixa" />
                    <YAxis />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="qtd" name="Cotas" fill={C.gold} radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-2 text-xs" style={{ color: C.muted }}>
                  <span className="font-medium">TODO:</span> precisamos de um campo/tabela com “dias em atraso” (ex.: inad_desde / dias_atraso).
                </div>
              </CardContent>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cotas recém-inadimplentes</CardTitle>
                <div className="text-xs" style={{ color: C.muted }}>Ordenado por created_at (proxy)</div>
              </CardHeader>
              <CardContent className="space-y-2">
                {slicePage(inad82.recent, pageNewInad).map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-xl border px-3 py-2"
                    style={{ background: "rgba(255,255,255,.55)", borderColor: C.border }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: C.navy }}>
                        {v.administradora ?? "—"} • {v.segmento ?? "—"}
                      </div>
                      <div className="text-xs truncate" style={{ color: C.muted }}>
                        Grupo {v.grupo ?? "—"} • Cota {v.cota ?? "—"} • Proposta {v.numero_proposta ?? "—"}
                      </div>
                      <div className="text-xs" style={{ color: C.muted }}>
                        Vendedor:{" "}
                        <span className="font-medium" style={{ color: C.navy }}>
                          {v.vendedor_id ? (userNameByAuthId.get(v.vendedor_id) ?? "—") : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm font-semibold whitespace-nowrap">{fmtBRL(safeNum(v.valor_venda))}</div>
                  </div>
                ))}

                <div className="flex items-center justify-between pt-1">
                  <Button
                    variant="outline"
                    className="border-white/40 bg-white/60 hover:bg-white/70"
                    onClick={() => setPageNewInad((p) => Math.max(1, p - 1))}
                    disabled={pageNewInad <= 1}
                  >
                    Anterior
                  </Button>
                  <div className="text-xs" style={{ color: C.muted }}>
                    Página {pageNewInad} de {pagesCount(inad82.recent)}
                  </div>
                  <Button
                    variant="outline"
                    className="border-white/40 bg-white/60 hover:bg-white/70"
                    onClick={() => setPageNewInad((p) => Math.min(pagesCount(inad82.recent), p + 1))}
                    disabled={pageNewInad >= pagesCount(inad82.recent)}
                  >
                    Próxima
                  </Button>
                </div>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top cotas em risco</CardTitle>
                <div className="text-xs" style={{ color: C.muted }}>Proxy: maior valor (sem dias em atraso)</div>
              </CardHeader>
              <CardContent className="space-y-2">
                {slicePage(inad82.risk, pageRisk).map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-xl border px-3 py-2"
                    style={{ background: "rgba(255,255,255,.55)", borderColor: C.border }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: C.navy }}>
                        {v.administradora ?? "—"} • {v.segmento ?? "—"}
                      </div>
                      <div className="text-xs truncate" style={{ color: C.muted }}>
                        Grupo {v.grupo ?? "—"} • Cota {v.cota ?? "—"} • Proposta {v.numero_proposta ?? "—"}
                      </div>
                    </div>
                    <div className="text-sm font-semibold whitespace-nowrap">{fmtBRL(safeNum(v.valor_venda))}</div>
                  </div>
                ))}

                <div className="flex items-center justify-between pt-1">
                  <Button
                    variant="outline"
                    className="border-white/40 bg-white/60 hover:bg-white/70"
                    onClick={() => setPageRisk((p) => Math.max(1, p - 1))}
                    disabled={pageRisk <= 1}
                  >
                    Anterior
                  </Button>
                  <div className="text-xs" style={{ color: C.muted }}>
                    Página {pageRisk} de {pagesCount(inad82.risk)}
                  </div>
                  <Button
                    variant="outline"
                    className="border-white/40 bg-white/60 hover:bg-white/70"
                    onClick={() => setPageRisk((p) => Math.min(pagesCount(inad82.risk), p + 1))}
                    disabled={pageRisk >= pagesCount(inad82.risk)}
                  >
                    Próxima
                  </Button>
                </div>
              </CardContent>
            </GlassCard>
          </div>
        </TabsContent>

        {/* Prazo */}
        <TabsContent value="prazo" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Média (dias)</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-bold">{Math.round(prazoStats.meanDays)}</CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Mediana P50</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-bold">{Math.round(prazoStats.p50)}</CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>P75</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-bold">{Math.round(prazoStats.p75)}</CardContent>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Prazo médio por segmento</CardTitle>
              </CardHeader>
              <CardContent style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prazoStats.segChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="dias" name="Dias" fill={C.navy} radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Prazo médio por administradora</CardTitle>
              </CardHeader>
              <CardContent style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prazoStats.admChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="dias" name="Dias" fill={C.gold} radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </GlassCard>
          </div>

          <div className="text-xs" style={{ color: C.muted }}>
            Base: diferença em dias entre <span className="font-medium">encarteirada_em</span> e{" "}
            <span className="font-medium">data_contemplacao</span>. Amostra:{" "}
            <span className="font-semibold" style={{ color: C.navy }}>{prazoStats.n}</span>.
          </div>
        </TabsContent>

        {/* Clientes */}
        <TabsContent value="clientes" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Total de clientes (leads)</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-bold">{clientesStats.total}</CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Clientes ativos</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-bold">{clientesStats.ativos}</CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Clientes inativos</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-bold">{clientesStats.inativos}</CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>% que permanecem ativos</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-bold">{(clientesStats.pctAtivo * 100).toFixed(1)}%</CardContent>
            </GlassCard>
          </div>
        </TabsContent>

        {/* Carteira */}
        <TabsContent value="carteira" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Carteira ativa (valor)</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">{fmtBRL(totalsCarteira.ativoValue)}</CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Inadimplente (valor)</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">{fmtBRL(totalsCarteira.inadValue)}</CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Cotas ativas</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">{totalsCarteira.countAtivas}</CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: C.muted }}>Cotas inadimplentes</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">{totalsCarteira.countInad}</CardContent>
            </GlassCard>
          </div>
        </TabsContent>

        {/* Segmentos */}
        <TabsContent value="segmentos" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Participação por segmento (carteira ativa)</CardTitle>
                <div className="text-xs" style={{ color: C.muted }}>
                  Total: <span className="font-semibold" style={{ color: C.navy }}>{fmtBRL(distSegmento.total)}</span>
                </div>
              </CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Pie data={distSegmento.data} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2}>
                      {distSegmento.data.map((_, i) => (
                        <Cell
                          key={i}
                          fill={[C.navy, C.rubi, C.gold, "#6b7280", "#9ca3af", "#374151"][i % 6]}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Ranking por segmento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {distSegmento.data.slice(0, 12).map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-xl border px-3 py-2"
                       style={{ background: "rgba(255,255,255,.55)", borderColor: C.border }}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: C.navy }}>{s.name}</div>
                      <div className="text-xs" style={{ color: C.muted }}>{(s.pct * 100).toFixed(1)}%</div>
                    </div>
                    <div className="text-sm font-semibold whitespace-nowrap">{fmtBRL(s.value)}</div>
                  </div>
                ))}
              </CardContent>
            </GlassCard>
          </div>
        </TabsContent>

        {/* Concentração */}
        <TabsContent value="concentracao" className="space-y-3">
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Concentração de carteira por cliente</CardTitle>
              <div className="text-xs" style={{ color: C.muted }}>
                Base: soma de <span className="font-medium">valor_venda</span> das cotas ativas por lead_id
              </div>
            </CardHeader>

            <CardContent className="space-y-2">
              {leadsLoading && (
                <div className="text-xs flex items-center gap-2" style={{ color: C.muted }}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> carregando nomes dos clientes…
                </div>
              )}

              {slicePage(topLeads, pageTopClients).map((row) => {
                const lead = leadNameById.get(row.lead_id);
                const leadLabel =
                  (lead?.nome ?? "").trim() ||
                  `Lead ${row.lead_id.slice(0, 8)}…`;

                // como vendedor já está travado, mas no admin pode ter mais de um vendedor por lead
                const sellerNames = Array.from(row.sellers)
                  .map((id) => userNameByAuthId.get(id) ?? id)
                  .filter(Boolean)
                  .slice(0, 3);

                return (
                  <div
                    key={row.lead_id}
                    className="flex items-center justify-between rounded-xl border px-3 py-2"
                    style={{ background: "rgba(255,255,255,.55)", borderColor: C.border }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: C.navy }}>
                        {leadLabel}
                      </div>

                      <div className="text-xs truncate" style={{ color: C.muted }}>
                        {lead?.telefone ? `📞 ${lead.telefone}` : ""}{" "}
                        {lead?.email ? `• ✉️ ${lead.email}` : ""}
                      </div>

                      <div className="text-xs" style={{ color: C.muted }}>
                        Vendedor:{" "}
                        <span className="font-medium" style={{ color: C.navy }}>
                          {!sellerNames.length ? "—" : sellerNames.join(", ")}
                        </span>
                        {row.sellers.size > 3 ? (
                          <span className="ml-1" style={{ color: C.muted }}>+{row.sellers.size - 3}</span>
                        ) : null}
                        {"  "}• Cotas ativas:{" "}
                        <span className="font-semibold" style={{ color: C.navy }}>{row.count}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold whitespace-nowrap">{fmtBRL(row.value)}</div>
                      <Button
                        variant="outline"
                        className="border-white/40 bg-white/60 hover:bg-white/70"
                        onClick={() => openLeadDialog(row.lead_id)}
                      >
                        Ver detalhes
                      </Button>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="outline"
                  className="border-white/40 bg-white/60 hover:bg-white/70"
                  onClick={() => setPageTopClients((p) => Math.max(1, p - 1))}
                  disabled={pageTopClients <= 1}
                >
                  Anterior
                </Button>
                <div className="text-xs" style={{ color: C.muted }}>
                  Página {pageTopClients} de {pagesCount(topLeads)}
                </div>
                <Button
                  variant="outline"
                  className="border-white/40 bg-white/60 hover:bg-white/70"
                  onClick={() => setPageTopClients((p) => Math.min(pagesCount(topLeads), p + 1))}
                  disabled={pageTopClients >= pagesCount(topLeads)}
                >
                  Próxima
                </Button>
              </div>
            </CardContent>
          </GlassCard>
        </TabsContent>
      </Tabs>

      {/* Dialog detalhes do lead */}
      <Dialog open={leadDialogOpen} onOpenChange={setLeadDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle style={{ color: C.navy }}>Detalhes do cliente (lead)</DialogTitle>
            <DialogDescription style={{ color: C.muted }}>
              Cotas, status e composição da carteira.
            </DialogDescription>
          </DialogHeader>

          {leadDialogLoading ? (
            <div className="py-10 flex items-center justify-center gap-2" style={{ color: C.muted }}>
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando…
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border p-3" style={{ background: "rgba(255,255,255,.60)", borderColor: C.border }}>
                <div className="text-sm font-semibold" style={{ color: C.navy }}>
                  {leadDialogLead?.nome ?? "Lead não encontrado"}
                </div>
                <div className="text-xs mt-1" style={{ color: C.muted }}>
                  Telefone: <span className="font-medium" style={{ color: C.navy }}>{leadDialogLead?.telefone ?? "—"}</span>{" "}
                  • Email: <span className="font-medium" style={{ color: C.navy }}>{leadDialogLead?.email ?? "—"}</span>{" "}
                  • Origem: <span className="font-medium" style={{ color: C.navy }}>{leadDialogLead?.origem ?? "—"}</span>
                </div>
              </div>

              <div className="text-sm font-semibold" style={{ color: C.navy }}>Cotas</div>

              <div className="max-h-[360px] overflow-auto space-y-2 pr-1">
                {leadDialogVendas.map((v) => {
                  const status = isActive(v) ? "Ativa" : isCancelled(v) ? "Cancelada" : "—";
                  const statusBadge = isActive(v) ? "ok" : isCancelled(v) ? "danger" : "info";

                  return (
                    <div key={v.id} className="rounded-xl border px-3 py-2"
                         style={{ background: "rgba(255,255,255,.55)", borderColor: C.border }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: C.navy }}>
                            {v.administradora ?? "—"} • {v.segmento ?? "—"} • {v.tabela ?? "—"}
                          </div>
                          <div className="text-xs truncate" style={{ color: C.muted }}>
                            Grupo {v.grupo ?? "—"} • Cota {v.cota ?? "—"} • Proposta {v.numero_proposta ?? "—"} • Tipo {v.tipo_venda ?? "—"}
                          </div>
                          <div className="text-xs" style={{ color: C.muted }}>
                            Vendedor:{" "}
                            <span className="font-medium" style={{ color: C.navy }}>
                              {v.vendedor_id ? (userNameByAuthId.get(v.vendedor_id) ?? "—") : "—"}
                            </span>
                            {v.inad ? <span className="ml-2 font-semibold" style={{ color: C.rubi }}>• Inadimplente</span> : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant={statusBadge as any}>{status}</Badge>
                          <div className="text-sm font-semibold whitespace-nowrap">{fmtBRL(safeNum(v.valor_venda))}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!leadDialogVendas.length && (
                  <div className="text-sm" style={{ color: C.muted }}>Nenhuma venda vinculada a este lead no recorte.</div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
