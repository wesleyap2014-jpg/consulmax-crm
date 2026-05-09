// src/pages/RankingVendedores.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Trophy,
  Crown,
  Sparkles,
  TrendingUp,
  Calendar as CalIcon,
  Percent,
  Building2,
  Target,
  Rocket,
  Medal,
  AlertTriangle,
  BarChart3,
  UserCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Gauge,
  Users,
} from "lucide-react";

/* ====================== CONFIG (Consulmax) ====================== */
const CONFIG = {
  RPC_RANKING: "rpc_ranking_vendedores_mes",

  // Mantido apenas para ranking por administradora e realtime
  DEALS_TABLE: "vendas",
  DEALS_DATE: "data_venda",
  DEALS_STATUS: "status",
  DEALS_TIPO: "tipo_venda",
  DEAL_VALUE_KEY: "valor_venda",
  DEAL_ADMIN: "administradora",
  STATUS_ENCARTEIRADA: ["encarteirada"],
};

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  goldLight: "#E0CE8C",
  off: "#F5F5F5",
  muted: "#64748B",
  border: "rgba(30,41,63,.12)",
};
/* =============================================================== */

/** -------- Avatar simples -------- */
type SimpleAvatarProps = {
  src?: string | null;
  alt?: string;
  fallbackText?: string;
  className?: string;
  size?: number;
};

const SimpleAvatar: React.FC<SimpleAvatarProps> = ({
  src,
  alt,
  fallbackText = "U",
  className = "",
  size = 32,
}) => {
  const [err, setErr] = useState(false);
  const showFallback = err || !src;

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full overflow-hidden bg-white/80 text-[#1E293F] ${className}`}
      style={{ width: size, height: size }}
      title={alt}
      aria-label={alt}
    >
      {showFallback ? (
        <span className="text-xs font-semibold select-none">{fallbackText}</span>
      ) : (
        <img
          src={src!}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => setErr(true)}
          loading="lazy"
        />
      )}
    </div>
  );
};

/** -------- Badge simples -------- */
type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "gold" | "navy" | "danger" | "soft";
};

const Badge: React.FC<BadgeProps> = ({
  variant = "default",
  className = "",
  ...rest
}) => {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

  const styles =
    variant === "secondary"
      ? "bg-slate-100 text-slate-800"
      : variant === "gold"
        ? "bg-[#E0CE8C]/35 text-[#1E293F] border border-[#B5A573]/30"
        : variant === "navy"
          ? "bg-[#1E293F] text-white"
          : variant === "danger"
            ? "bg-[#A11C27] text-white"
            : variant === "soft"
              ? "bg-white/70 text-[#1E293F] border border-slate-200"
              : "bg-[#A11C27] text-white";

  return <span className={`${base} ${styles} ${className}`} {...rest} />;
};

/** -------- Tipos -------- */
type RawDeal = Record<string, any>;

type RankRow = {
  posicao?: number;
  userId: string;
  vendorAuthId?: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  vendasCount: number;
  encarteiradasCount: number;
  producao: number;
  ticketMedio: number;
  metaUsuario?: number;
  pctMeta?: number;
};

type AdminRankRow = {
  admin: string;
  vendas: number;
  producao: number;
  ticketMedio: number;
  pctTotal: number;
};

type RankingMode = "producao" | "pctMeta" | "encarteiradas" | "ticket";

type PaceLevel = "vencendo" | "no_jogo" | "atencao" | "risco" | "virada" | "sem_meta";

type PaceInfo = {
  level: PaceLevel;
  label: string;
  hint: string;
  color: string;
  bg: string;
  icon: string;
};

/** -------- Utils -------- */
function getInitials(name?: string, email?: string) {
  const base = (name || email || "").trim();
  if (!base) return "U";

  const parts = base.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function firstName(name?: string) {
  return (name || "").trim().split(/\s+/)[0] || "Vendedor";
}

function formatCurrency(n: number) {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatPct(n: number) {
  return `${(Math.round(Number(n || 0) * 10) / 10).toLocaleString("pt-BR")} %`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ymStartEnd(year: number, monthIndexZero: number) {
  const start = new Date(Date.UTC(year, monthIndexZero, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndexZero + 1, 1, 0, 0, 0));

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  return { start, end, startStr, endStr };
}

function prevYearMonth(year: number, monthIndexZero: number) {
  if (monthIndexZero === 0) return { year: year - 1, month: 11 };
  return { year, month: monthIndexZero - 1 };
}

function normalizeAvatarUrl(value?: string | null) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) return raw;

  try {
    const { data } = supabase.storage.from("avatars").getPublicUrl(raw);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

function mapRpcRankingRow(row: any): RankRow {
  return {
    posicao: Number(row.posicao ?? 0) || undefined,
    userId: String(row.user_id ?? ""),
    vendorAuthId: row.vendedor_auth_id ? String(row.vendedor_auth_id) : undefined,
    name: String(row.nome ?? "—"),
    email: row.email ? String(row.email) : undefined,
    avatarUrl: normalizeAvatarUrl(row.avatar_url ?? null),
    vendasCount: Number(row.vendas_count ?? 0) || 0,
    encarteiradasCount: Number(row.encarteiradas_count ?? 0) || 0,
    producao: Number(row.producao ?? 0) || 0,
    ticketMedio: Number(row.ticket_medio ?? 0) || 0,
    metaUsuario: Number(row.meta_usuario ?? 0) || 0,
    pctMeta: Number(row.pct_meta ?? 0) || 0,
  };
}

function daysInMonth(year: number, monthIndexZero: number) {
  return new Date(Date.UTC(year, monthIndexZero + 1, 0)).getUTCDate();
}

function expectedProgressPct(year: number, monthIndexZero: number) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  if (year < currentYear || (year === currentYear && monthIndexZero < currentMonth)) return 100;
  if (year > currentYear || (year === currentYear && monthIndexZero > currentMonth)) return 0;

  const day = now.getUTCDate();
  const total = daysInMonth(year, monthIndexZero);

  return clamp((day / total) * 100, 0, 100);
}

function paceInfo(row: RankRow, expectedPct: number): PaceInfo {
  const meta = Number(row.metaUsuario || 0);
  const pct = meta > 0 ? (Number(row.producao || 0) / meta) * 100 : 0;

  if (meta <= 0) {
    return {
      level: "sem_meta",
      label: "Sem meta",
      hint: "Sem meta cadastrada para medir ritmo",
      color: "#64748B",
      bg: "rgba(100,116,139,.10)",
      icon: "—",
    };
  }

  if (pct >= 100) {
    return {
      level: "vencendo",
      label: "Meta batida",
      hint: "Já passou de 100% da meta",
      color: C.navy,
      bg: "rgba(30,41,63,.10)",
      icon: "🚀",
    };
  }

  const ratio = expectedPct > 0 ? pct / expectedPct : pct > 0 ? 2 : 0;

  if (ratio >= 1.15) {
    return {
      level: "vencendo",
      label: "Vencendo",
      hint: "Acima do ritmo esperado",
      color: C.navy,
      bg: "rgba(30,41,63,.10)",
      icon: "🔥",
    };
  }

  if (ratio >= 0.85) {
    return {
      level: "no_jogo",
      label: "No jogo",
      hint: "Próximo do ritmo esperado",
      color: "#B45309",
      bg: "rgba(180,83,9,.10)",
      icon: "🎯",
    };
  }

  if (ratio >= 0.55) {
    return {
      level: "atencao",
      label: "Atenção",
      hint: "Abaixo do ritmo, mas recuperável",
      color: "#D97706",
      bg: "rgba(217,119,6,.10)",
      icon: "⚠️",
    };
  }

  if (ratio >= 0.25) {
    return {
      level: "risco",
      label: "Risco",
      hint: "Muito abaixo do ritmo",
      color: C.ruby,
      bg: "rgba(161,28,39,.10)",
      icon: "🚨",
    };
  }

  return {
    level: "virada",
    label: "Virada necessária",
    hint: "Precisa de ação imediata",
    color: C.ruby,
    bg: "rgba(161,28,39,.13)",
    icon: "🔁",
  };
}

function rankingComparator(mode: RankingMode) {
  return (a: RankRow, b: RankRow) => {
    if (mode === "pctMeta") {
      const pa = Number(a.pctMeta ?? 0);
      const pb = Number(b.pctMeta ?? 0);
      if (pb !== pa) return pb - pa;
    }

    if (mode === "encarteiradas") {
      if (b.encarteiradasCount !== a.encarteiradasCount) {
        return b.encarteiradasCount - a.encarteiradasCount;
      }
    }

    if (mode === "ticket") {
      if (b.ticketMedio !== a.ticketMedio) return b.ticketMedio - a.ticketMedio;
    }

    if (b.producao !== a.producao) return b.producao - a.producao;
    if (b.encarteiradasCount !== a.encarteiradasCount) return b.encarteiradasCount - a.encarteiradasCount;
    if (b.vendasCount !== a.vendasCount) return b.vendasCount - a.vendasCount;

    return a.name.localeCompare(b.name, "pt-BR");
  };
}

function useAudio() {
  const cashRef = useRef<HTMLAudioElement | null>(null);
  const successRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    cashRef.current = new Audio("/sounds/cash.mp3");
    successRef.current = new Audio("/sounds/success.mp3");
  }, []);

  const playCash = useCallback(() => {
    cashRef.current?.play().catch(() => {});
  }, []);

  const playSuccess = useCallback(() => {
    successRef.current?.play().catch(() => {});
  }, []);

  return { playCash, playSuccess };
}

function MiniMetric({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card className="border-0 bg-white/70 backdrop-blur-xl shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-lg font-bold text-[#1E293F]">{value}</div>
            {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
          </div>
          <div className="rounded-2xl bg-[#1E293F]/10 p-2 text-[#1E293F]">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/** -------- Página -------- */
export default function RankingVendedores() {
  const now = new Date();

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [mode, setMode] = useState<RankingMode>("producao");

  const { startStr, endStr } = useMemo(() => ymStartEnd(year, month), [year, month]);
  const previousYM = useMemo(() => prevYearMonth(year, month), [year, month]);
  const expectedPct = useMemo(() => expectedProgressPct(year, month), [year, month]);

  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [previousRanking, setPreviousRanking] = useState<RankRow[]>([]);
  const [deals, setDeals] = useState<RawDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(false);

  const { playCash, playSuccess } = useAudio();

  const months = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];

  useEffect(() => {
    let cancel = false;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancel) setAuthUserId(data?.user?.id ?? null);
    })();

    return () => {
      cancel = true;
    };
  }, []);

  const reloadRanking = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);

      const { data, error } = await supabase.rpc(CONFIG.RPC_RANKING, {
        p_ano: year,
        p_mes: month + 1,
      });

      if (error) {
        console.error("Erro ao carregar ranking:", error);
        setRanking([]);
      } else {
        setRanking((data || []).map(mapRpcRankingRow));
      }

      if (showLoading) setLoading(false);
    },
    [year, month]
  );

  const reloadPreviousRanking = useCallback(async () => {
    const { data, error } = await supabase.rpc(CONFIG.RPC_RANKING, {
      p_ano: previousYM.year,
      p_mes: previousYM.month + 1,
    });

    if (error) {
      console.error("Erro ao carregar ranking anterior:", error);
      setPreviousRanking([]);
    } else {
      setPreviousRanking((data || []).map(mapRpcRankingRow));
    }
  }, [previousYM.year, previousYM.month]);

  const reloadDealsForAdminRanking = useCallback(async () => {
    setAdminLoading(true);

    const { data, error } = await supabase
      .from(CONFIG.DEALS_TABLE)
      .select("*")
      .gte(CONFIG.DEALS_DATE, startStr)
      .lt(CONFIG.DEALS_DATE, endStr);

    if (error) {
      console.error("Erro ao carregar ranking por administradora:", error);
      setDeals([]);
    } else {
      setDeals(data || []);
    }

    setAdminLoading(false);
  }, [startStr, endStr]);

  useEffect(() => {
    void reloadRanking(true);
    void reloadPreviousRanking();
  }, [reloadRanking, reloadPreviousRanking]);

  useEffect(() => {
    void reloadDealsForAdminRanking();
  }, [reloadDealsForAdminRanking]);

  useEffect(() => {
    const channel = supabase
      .channel("ranking-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: CONFIG.DEALS_TABLE },
        (payload) => {
          const row = payload.new as RawDeal;
          const dateStr = String(row[CONFIG.DEALS_DATE] || "");

          if (dateStr >= startStr && dateStr < endStr) {
            void reloadRanking(false);
            void reloadPreviousRanking();
            void reloadDealsForAdminRanking();
            playCash();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: CONFIG.DEALS_TABLE },
        (payload) => {
          const row = payload.new as RawDeal;
          const dateStr = String(row[CONFIG.DEALS_DATE] || "");

          if (!(dateStr >= startStr && dateStr < endStr)) return;

          void reloadRanking(false);
          void reloadPreviousRanking();
          void reloadDealsForAdminRanking();

          const status = String(row[CONFIG.DEALS_STATUS] ?? "").toLowerCase();
          if (CONFIG.STATUS_ENCARTEIRADA.includes(status)) playSuccess();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    startStr,
    endStr,
    reloadRanking,
    reloadPreviousRanking,
    reloadDealsForAdminRanking,
    playCash,
    playSuccess,
  ]);

  const avatars = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const r of ranking) {
      map[r.userId] = r.avatarUrl || null;
    }
    return map;
  }, [ranking]);

  const sortedRanking = useMemo(() => {
    return [...ranking].sort(rankingComparator(mode)).map((r, idx) => ({
      ...r,
      posicao: idx + 1,
    }));
  }, [ranking, mode]);

  const previousByUser = useMemo(() => {
    const map = new Map<string, RankRow>();
    for (const r of previousRanking) map.set(r.userId, r);
    return map;
  }, [previousRanking]);

  const metaTotalMes = useMemo(
    () => ranking.reduce((acc, r) => acc + (Number(r.metaUsuario ?? 0) || 0), 0),
    [ranking]
  );

  const producaoTotal = useMemo(
    () => ranking.reduce((acc, r) => acc + (Number(r.producao ?? 0) || 0), 0),
    [ranking]
  );

  const producaoAnterior = useMemo(
    () => previousRanking.reduce((acc, r) => acc + (Number(r.producao ?? 0) || 0), 0),
    [previousRanking]
  );

  const crescimentoPct = useMemo(() => {
    if (producaoAnterior <= 0 && producaoTotal > 0) return 100;
    if (producaoAnterior <= 0) return 0;
    return ((producaoTotal - producaoAnterior) / producaoAnterior) * 100;
  }, [producaoTotal, producaoAnterior]);

  const pctMetaTotal = useMemo(() => {
    if (!metaTotalMes || metaTotalMes <= 0) return 0;
    return (producaoTotal / metaTotalMes) * 100;
  }, [producaoTotal, metaTotalMes]);

  const podiumRanking = useMemo(
    () => ranking.filter((r) => Number(r.producao || 0) > 0).sort(rankingComparator("producao")),
    [ranking]
  );

  const top3 = podiumRanking.slice(0, 3);
  const firstValue = top3[0]?.producao ?? 0;

  const currentUserRow = useMemo(() => {
    if (!authUserId) return null;
    return sortedRanking.find((r) => r.vendorAuthId === authUserId) || null;
  }, [authUserId, sortedRanking]);

  const nextAboveMe = useMemo(() => {
    if (!currentUserRow?.posicao || currentUserRow.posicao <= 1) return null;
    return sortedRanking.find((r) => r.posicao === currentUserRow.posicao! - 1) || null;
  }, [currentUserRow, sortedRanking]);

  const adminRanking = useMemo<AdminRankRow[]>(() => {
    const map: Record<string, { admin: string; vendas: number; producao: number }> = {};

    for (const d of deals) {
      const tipo = String(d[CONFIG.DEALS_TIPO] || "").toLowerCase();
      if (tipo === "contemplada") continue;

      const admin = String(d[CONFIG.DEAL_ADMIN] || "—");
      const val = Number(d[CONFIG.DEAL_VALUE_KEY] ?? 0) || 0;

      if (!map[admin]) {
        map[admin] = { admin, vendas: 0, producao: 0 };
      }

      map[admin].vendas += 1;
      map[admin].producao += val;
    }

    return Object.values(map)
      .map((row) => ({
        ...row,
        ticketMedio: row.vendas > 0 ? row.producao / row.vendas : 0,
        pctTotal: producaoTotal > 0 ? (row.producao / producaoTotal) * 100 : 0,
      }))
      .sort((a, b) => b.producao - a.producao);
  }, [deals, producaoTotal]);

  const highlights = useMemo(() => {
    const withProduction = ranking.filter((r) => Number(r.producao || 0) > 0);
    const withMeta = ranking.filter((r) => Number(r.metaUsuario || 0) > 0);
    const withTicket = ranking.filter((r) => Number(r.ticketMedio || 0) > 0);

    const leader = withProduction[0] || null;

    const closestToMeta =
      withMeta
        .filter((r) => Number(r.pctMeta || 0) < 100)
        .sort((a, b) => Number(b.pctMeta || 0) - Number(a.pctMeta || 0))[0] ||
      withMeta.sort((a, b) => Number(b.pctMeta || 0) - Number(a.pctMeta || 0))[0] ||
      null;

    const highestTicket =
      withTicket.sort((a, b) => Number(b.ticketMedio || 0) - Number(a.ticketMedio || 0))[0] || null;

    const mostEnc =
      ranking
        .filter((r) => Number(r.encarteiradasCount || 0) > 0)
        .sort((a, b) => Number(b.encarteiradasCount || 0) - Number(a.encarteiradasCount || 0))[0] ||
      null;

    const attention =
      withMeta
        .map((r) => ({ row: r, pace: paceInfo(r, expectedPct) }))
        .filter((x) => ["risco", "virada", "atencao"].includes(x.pace.level))
        .sort((a, b) => Number(a.row.pctMeta || 0) - Number(b.row.pctMeta || 0))[0]?.row || null;

    const growth =
      ranking
        .map((r) => {
          const previous = previousByUser.get(r.userId);
          const prev = Number(previous?.producao || 0);
          const cur = Number(r.producao || 0);
          const delta = cur - prev;
          return { row: r, delta, prev, cur };
        })
        .filter((x) => x.delta > 0)
        .sort((a, b) => b.delta - a.delta)[0] || null;

    return { leader, closestToMeta, highestTicket, mostEnc, attention, growth };
  }, [ranking, previousByUser, expectedPct]);

  const teamPace = useMemo(() => {
    const withMeta = ranking.filter((r) => Number(r.metaUsuario || 0) > 0);
    if (!withMeta.length) return { label: "Sem metas", count: 0, good: 0 };

    const good = withMeta.filter((r) => {
      const p = paceInfo(r, expectedPct);
      return ["vencendo", "no_jogo"].includes(p.level);
    }).length;

    return {
      label: `${good}/${withMeta.length} no ritmo`,
      count: withMeta.length,
      good,
    };
  }, [ranking, expectedPct]);

  const modeLabel: Record<RankingMode, string> = {
    producao: "Produção",
    pctMeta: "% da Meta",
    encarteiradas: "Encarteiradas",
    ticket: "Ticket Médio",
  };

  return (
    <div className="p-4 md:p-6 animate-in fade-in slide-in-from-bottom-2">
      {/* BG liquid glass */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-16 -left-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-25 bg-[#A11C27]" />
        <div className="absolute top-10 right-10 w-[360px] h-[360px] rounded-full blur-3xl opacity-25 bg-[#1E293F]" />
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[260px] h-[260px] rounded-full blur-3xl opacity-30 bg-[#E0CE8C]" />
      </div>

      {/* Header / filtros e meta */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2 text-[#1E293F]">
            <Trophy className="h-7 w-7 text-[#B5A573]" />
            Ranking dos Vendedores
            <Badge className="ml-2" variant="danger">
              {months[month]}/{year}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Produção, metas, ritmo comercial e desempenho do time em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-end justify-end">
          <div className="flex items-center gap-2">
            <CalIcon className="h-4 w-4 text-muted-foreground" />
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[140px] bg-white/80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[110px] bg-white/80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 6 }).map((_, idx) => {
                const y = now.getUTCFullYear() - 3 + idx;
                return (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <Select value={mode} onValueChange={(v) => setMode(v as RankingMode)}>
            <SelectTrigger className="w-[170px] bg-white/80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="producao">Produção</SelectItem>
              <SelectItem value="pctMeta">% da Meta</SelectItem>
              <SelectItem value="encarteiradas">Encarteiradas</SelectItem>
              <SelectItem value="ticket">Ticket Médio</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Métricas rápidas */}
      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <MiniMetric
          icon={<Target className="h-5 w-5" />}
          label="Meta do mês"
          value={formatCurrency(metaTotalMes)}
          hint={`Ritmo esperado: ${formatPct(expectedPct)}`}
        />
        <MiniMetric
          icon={<BarChart3 className="h-5 w-5" />}
          label="Produção total"
          value={formatCurrency(producaoTotal)}
          hint={`${formatPct(pctMetaTotal)} da meta`}
        />
        <MiniMetric
          icon={
            crescimentoPct >= 0 ? (
              <ArrowUpRight className="h-5 w-5" />
            ) : (
              <ArrowDownRight className="h-5 w-5" />
            )
          }
          label={`Evolução vs ${months[previousYM.month]}/${previousYM.year}`}
          value={formatPct(crescimentoPct)}
          hint={`${formatCurrency(producaoAnterior)} no mês anterior`}
        />
        <MiniMetric
          icon={<Gauge className="h-5 w-5" />}
          label="Ritmo do time"
          value={teamPace.label}
          hint="Com base nas metas cadastradas"
        />
      </div>

      {/* Minha posição + Destaques */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
        <Card className="border-0 bg-white/75 backdrop-blur-xl shadow-xl overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[#1E293F]">
              <UserCircle2 className="h-5 w-5 text-[#A11C27]" />
              Minha posição
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!authUserId ? (
              <div className="text-sm text-muted-foreground">Identificando usuário logado…</div>
            ) : !currentUserRow ? (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                Seu usuário não apareceu no retorno da RPC deste período.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <SimpleAvatar
                    src={avatars[currentUserRow.userId] || undefined}
                    alt={currentUserRow.name}
                    fallbackText={getInitials(currentUserRow.name, currentUserRow.email)}
                    className="ring-4 ring-white shadow"
                    size={56}
                  />
                  <div>
                    <div className="text-xl font-bold text-[#1E293F]">
                      {currentUserRow.posicao || "—"}º lugar
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {firstName(currentUserRow.name)}, você vendeu{" "}
                      <b>{formatCurrency(currentUserRow.producao)}</b>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[#1E293F]/5 p-3">
                    <div className="text-xs text-muted-foreground">Para bater a meta</div>
                    <div className="font-bold text-[#1E293F]">
                      {currentUserRow.metaUsuario && currentUserRow.metaUsuario > currentUserRow.producao
                        ? formatCurrency(currentUserRow.metaUsuario - currentUserRow.producao)
                        : "Meta batida"}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[#A11C27]/5 p-3">
                    <div className="text-xs text-muted-foreground">
                      Para passar quem está acima
                    </div>
                    <div className="font-bold text-[#1E293F]">
                      {nextAboveMe
                        ? formatCurrency(Math.max(0, nextAboveMe.producao - currentUserRow.producao + 0.01))
                        : "Você está no topo"}
                    </div>
                  </div>
                </div>

                {(() => {
                  const p = paceInfo(currentUserRow, expectedPct);
                  return (
                    <div
                      className="rounded-2xl p-3 text-sm"
                      style={{ background: p.bg, color: p.color }}
                    >
                      <div className="font-bold">
                        {p.icon} {p.label}
                      </div>
                      <div className="text-xs opacity-80">{p.hint}</div>
                    </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/75 backdrop-blur-xl shadow-xl overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[#1E293F]">
              <Sparkles className="h-5 w-5 text-[#B5A573]" />
              Destaques do mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <HighlightCard
                icon={<Trophy className="h-4 w-4" />}
                label="Líder em produção"
                value={highlights.leader?.name || "—"}
                hint={highlights.leader ? formatCurrency(highlights.leader.producao) : "Sem produção"}
              />
              <HighlightCard
                icon={<Target className="h-4 w-4" />}
                label="Mais próximo da meta"
                value={highlights.closestToMeta?.name || "—"}
                hint={highlights.closestToMeta ? formatPct(highlights.closestToMeta.pctMeta || 0) : "Sem meta"}
              />
              <HighlightCard
                icon={<Rocket className="h-4 w-4" />}
                label="Maior ticket médio"
                value={highlights.highestTicket?.name || "—"}
                hint={highlights.highestTicket ? formatCurrency(highlights.highestTicket.ticketMedio) : "Sem vendas"}
              />
              <HighlightCard
                icon={<Medal className="h-4 w-4" />}
                label="Mais encarteiradas"
                value={highlights.mostEnc?.name || "—"}
                hint={highlights.mostEnc ? `${highlights.mostEnc.encarteiradasCount} encarteirada(s)` : "Sem encarteiradas"}
              />
              <HighlightCard
                icon={<Flame className="h-4 w-4" />}
                label="Maior crescimento"
                value={highlights.growth?.row.name || "—"}
                hint={highlights.growth ? `+ ${formatCurrency(highlights.growth.delta)}` : "Sem crescimento"}
              />
              <HighlightCard
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Precisa de atenção"
                value={highlights.attention?.name || "—"}
                hint={highlights.attention ? formatPct(highlights.attention.pctMeta || 0) : "Time sob controle"}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PÓDIO */}
      <Card className="mb-6 border-0 bg-white/75 backdrop-blur-xl shadow-xl">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2 text-[#1E293F]">
            <Crown className="h-5 w-5 text-[#B5A573]" />
            Pódio por produção
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-4">
          {loading ? (
            <div className="text-center p-10 text-muted-foreground">Carregando…</div>
          ) : top3.length === 0 ? (
            <div className="text-center p-10 text-muted-foreground">
              Sem produção para formar pódio neste período.
            </div>
          ) : (
            <div className="relative mx-auto max-w-5xl">
              <div className="grid grid-cols-3 gap-6 items-end mb-4">
                {top3[1] ? (
                  <PodiumPerson row={top3[1]} avatars={avatars} firstValue={firstValue} size={72} />
                ) : (
                  <div />
                )}

                <PodiumPerson row={top3[0]} avatars={avatars} firstValue={firstValue} size={92} leader />

                {top3[2] ? (
                  <PodiumPerson row={top3[2]} avatars={avatars} firstValue={firstValue} size={64} />
                ) : (
                  <div />
                )}
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div className="h-24 bg-slate-200 rounded-t-xl shadow-inner flex items-end justify-center relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-3xl opacity-30">
                    🥈
                  </div>
                  <div className="w-full h-20 bg-gradient-to-b from-slate-300 to-slate-400 rounded-t-xl border-t border-slate-300 flex items-center justify-center text-2xl font-bold text-slate-700">
                    2
                  </div>
                </div>

                <div className="h-36 bg-[#E0CE8C]/55 rounded-t-xl shadow-inner flex items-end justify-center relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-3xl opacity-40">
                    🥇
                  </div>
                  <div className="w-full h-32 bg-gradient-to-b from-[#E0CE8C] to-[#B5A573] rounded-t-xl border-t border-[#B5A573]/50 flex items-center justify-center text-3xl font-extrabold text-[#1E293F]">
                    1
                  </div>
                </div>

                <div className="h-20 bg-amber-100 rounded-t-xl shadow-inner flex items-end justify-center relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-3xl opacity-30">
                    🥉
                  </div>
                  <div className="w-full h-16 bg-gradient-to-b from-amber-200 to-amber-300 rounded-t-xl border-t border-amber-200 flex items-center justify-center text-2xl font-bold text-amber-700">
                    3
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LISTA RANKEADA */}
      <Card className="border-0 bg-white/75 backdrop-blur-xl shadow-xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-[#1E293F]">
            <span className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-[#1E293F]" />
              Ranking completo
            </span>
            <Badge variant="gold">Critério: {modeLabel[mode]}</Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-0">
          {loading ? (
            <div className="p-10 text-center text-muted-foreground">Carregando…</div>
          ) : sortedRanking.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              Sem dados neste período.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px]">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="py-3">#</th>
                    <th>Vendedor</th>
                    <th>Ritmo</th>
                    <th>Vendas</th>
                    <th>Encarteiradas</th>
                    <th>Produção</th>
                    <th>% Meta</th>
                    <th>Ticket médio</th>
                    <th>Dif. p/ 1º</th>
                    <th className="w-[280px]">Meta individual</th>
                  </tr>
                </thead>

                <tbody>
                  {sortedRanking.map((r, i) => {
                    const avatar = avatars[r.userId];
                    const metaUser = r.metaUsuario ?? 0;
                    const pct =
                      metaUser > 0
                        ? Math.min(100, Math.round((r.producao / metaUser) * 100))
                        : 0;

                    const diff =
                      firstValue > 0 && Number(r.producao || 0) > 0
                        ? Math.max(0, firstValue - r.producao)
                        : 0;

                    const pace = paceInfo(r, expectedPct);
                    const isMe = authUserId && r.vendorAuthId === authUserId;

                    return (
                      <tr
                        key={r.userId}
                        className={`border-t hover:bg-white/70 transition-colors ${
                          isMe
                            ? "bg-[#E0CE8C]/18"
                            : i < 3 && Number(r.producao || 0) > 0
                              ? "bg-gradient-to-r from-transparent via-amber-50/40 to-transparent"
                              : ""
                        }`}
                      >
                        <td className="py-3 px-2 font-semibold">
                          {r.posicao || i + 1}
                        </td>

                        <td className="py-3 px-2">
                          <div className="flex items-center gap-3">
                            <SimpleAvatar
                              src={avatar || undefined}
                              alt={r.name}
                              fallbackText={getInitials(r.name, r.email)}
                              className="ring-2 ring-white"
                              size={34}
                            />

                            <div>
                              <div className="font-medium text-[#1E293F] flex items-center gap-2">
                                {r.name}
                                {isMe ? <Badge variant="gold">Você</Badge> : null}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {r.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-2">
                          <div
                            className="inline-flex flex-col rounded-2xl px-3 py-1.5 text-xs"
                            style={{ background: pace.bg, color: pace.color }}
                            title={pace.hint}
                          >
                            <span className="font-bold">
                              {pace.icon} {pace.label}
                            </span>
                            <span className="opacity-80">{pace.hint}</span>
                          </div>
                        </td>

                        <td className="py-3 px-2">{r.vendasCount}</td>

                        <td className="py-3 px-2">
                          <Badge variant="secondary">{r.encarteiradasCount}</Badge>
                        </td>

                        <td className="py-3 px-2 font-semibold text-[#1E293F]">
                          {formatCurrency(r.producao)}
                        </td>

                        <td className="py-3 px-2">
                          {metaUser > 0 ? formatPct(r.pctMeta || 0) : "—"}
                        </td>

                        <td className="py-3 px-2">
                          {formatCurrency(r.ticketMedio || 0)}
                        </td>

                        <td className="py-3 px-2">
                          {i === 0 || firstValue <= 0 || Number(r.producao || 0) <= 0
                            ? "—"
                            : `− ${formatCurrency(diff)}`}
                        </td>

                        <td className="py-3 px-2">
                          <div className="text-xs text-muted-foreground mb-1">
                            {metaUser > 0 ? (
                              <>Meta {formatCurrency(metaUser)}</>
                            ) : (
                              <>Sem meta definida</>
                            )}
                          </div>

                          <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                background:
                                  pct >= 100
                                    ? C.navy
                                    : pct >= Math.round(expectedPct)
                                      ? C.gold
                                      : C.ruby,
                              }}
                              title={
                                metaUser > 0
                                  ? `${pct}% da meta (${formatCurrency(metaUser)})`
                                  : "Sem meta definida"
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-4 text-xs text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                O pódio considera apenas produção acima de R$ 0,00. O ranking completo mantém todos os usuários ativos retornados pela RPC.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* RANKING POR ADMINISTRADORA */}
      <Card className="mt-6 border-0 bg-white/75 backdrop-blur-xl shadow-xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-[#1E293F]">
            <Building2 className="h-5 w-5 text-[#A11C27]" />
            Ranking por Administradora
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-0">
          {adminLoading ? (
            <div className="p-6 text-center text-muted-foreground">Carregando…</div>
          ) : adminRanking.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              Sem dados para este período.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="py-3">#</th>
                    <th>Administradora</th>
                    <th>Vendas</th>
                    <th>Produção</th>
                    <th>Ticket médio</th>
                    <th>% do total</th>
                    <th className="w-[220px]">Participação</th>
                  </tr>
                </thead>

                <tbody>
                  {adminRanking.map((row, idx) => (
                    <tr
                      key={row.admin}
                      className="border-t hover:bg-white/60 transition-colors"
                    >
                      <td className="py-3 px-2 font-semibold">{idx + 1}</td>
                      <td className="py-3 px-2 font-medium text-[#1E293F]">{row.admin}</td>
                      <td className="py-3 px-2">{row.vendas}</td>
                      <td className="py-3 px-2 font-semibold">
                        {formatCurrency(row.producao)}
                      </td>
                      <td className="py-3 px-2">{formatCurrency(row.ticketMedio)}</td>
                      <td className="py-3 px-2">{formatPct(row.pctTotal)}</td>
                      <td className="py-3 px-2">
                        <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${clamp(row.pctTotal, 0, 100)}%`,
                              background: C.navy,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HighlightCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/65 p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-[#1E293F]/10 p-2 text-[#1E293F]">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="truncate font-bold text-[#1E293F]">{value}</div>
          <div className="text-xs text-muted-foreground">{hint}</div>
        </div>
      </div>
    </div>
  );
}

function PodiumPerson({
  row,
  avatars,
  firstValue,
  size,
  leader,
}: {
  row: RankRow;
  avatars: Record<string, string | null>;
  firstValue: number;
  size: number;
  leader?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <SimpleAvatar
        src={avatars[row.userId] || undefined}
        alt={row.name}
        fallbackText={getInitials(row.name, row.email)}
        className={leader ? "ring-4 ring-[#E0CE8C] shadow-xl" : "ring-4 ring-white/70 shadow-md"}
        size={size}
      />

      <div className={`mt-2 font-bold ${leader ? "text-lg" : "text-base"} text-[#1E293F] flex items-center gap-2`}>
        {row.name}
        {leader ? <Crown className="h-5 w-5 text-[#B5A573]" /> : null}
      </div>

      <div className="text-xs text-muted-foreground">
        {row.vendasCount} venda(s) · {row.encarteiradasCount} encarteirada(s)
      </div>

      <div className={leader ? "mt-1 text-2xl font-extrabold text-[#1E293F]" : "mt-1 text-lg font-extrabold text-[#1E293F]"}>
        {formatCurrency(row.producao)}
      </div>

      <Badge className="mt-1" variant={leader ? "gold" : "soft"}>
        Ticket {formatCurrency(row.ticketMedio || 0)}
      </Badge>

      {leader ? (
        <div className="mt-1 text-xs font-medium text-[#1E293F]">Líder do ranking</div>
      ) : (
        <div className="mt-1 text-xs text-slate-700">
          − {formatCurrency(Math.max(0, firstValue - row.producao))} p/ alcançar o 1º
        </div>
      )}
    </div>
  );
}
