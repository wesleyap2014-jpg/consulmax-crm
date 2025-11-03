// src/pages/RankingVendedores.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Crown, Sparkles, TrendingUp, Calendar as CalIcon, Percent, Building2 } from "lucide-react";

/* ====================== CONFIG (Consulmax) ====================== */
const CONFIG = {
  // Vendas
  DEALS_TABLE: "vendas",
  DEALS_DATE: "data_venda",                   // date
  DEALS_USER_KEY: "vendedor_id",              // costuma ser auth_user_id
  DEALS_STATUS: "status",
  DEALS_TIPO: "tipo_venda",                   // usado no ranking por administradora
  STATUS_ENCARTEIRADA: ["encarteirada"],
  DEAL_VALUE_KEY: "valor_venda",
  DEAL_ADMIN: "administradora",

  // Usuários
  USERS_TABLE: "users",
  USER_ID: "id",
  USER_AUTH_ID: "auth_user_id",               // importante para casar com vendas.vendedor_id
  USER_NAME: "nome",
  USER_EMAIL: "email",
  USER_AVATAR_KEYS: ["avatar_url", "photo_url"],

  // Metas
  GOALS_TABLE: "metas_vendedores",            // vendedor_id (provavelmente users.id), ano, m01..m12
  GOALS_USER_KEY: "vendedor_id",
  GOALS_YEAR: "ano",
};
/* =============================================================== */

/** -------- Avatar simples -------- */
type SimpleAvatarProps = {
  src?: string | null;
  alt?: string;
  fallbackText?: string;
  className?: string;
  size?: number; // px
};
const SimpleAvatar: React.FC<SimpleAvatarProps> = ({ src, alt, fallbackText = "U", className = "", size = 32 }) => {
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
type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "secondary" };
const Badge: React.FC<BadgeProps> = ({ variant = "default", className = "", ...rest }) => {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";
  const styles = variant === "secondary" ? "bg-slate-100 text-slate-800" : "bg-[#A11C27] text-white";
  return <span className={`${base} ${styles} ${className}`} {...rest} />;
};

/** -------- Utils -------- */
type RawUser = Record<string, any>;
type RawDeal = Record<string, any>;
type GoalsRow = Record<string, any>;

type RankRow = {
  // padronizamos a chave pelo users.id (não pelo auth_id) para cruzar com metas
  userId: string;             // users.id
  vendorAuthId?: string;      // users.auth_user_id (apenas informação)
  name: string;
  email?: string;
  avatarUrl?: string | null;
  vendasCount: number;
  encarteiradasCount: number;
  producao: number;
  ticketMedio: number;
  metaUsuario?: number;       // meta individual do mês
};

function getInitials(name?: string, email?: string) {
  const base = (name || email || "").trim();
  if (!base) return "U";
  const parts = base.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function formatCurrency(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function ymStartEnd(year: number, monthIndexZero: number) {
  const start = new Date(Date.UTC(year, monthIndexZero, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndexZero + 1, 1, 0, 0, 0));
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  return { start, end, startStr, endStr };
}
function monthCol(mZero: number) {
  return `m${String(mZero + 1).padStart(2, "0")}`;
}
function formatPct(n: number) {
  return `${(Math.round(n * 10) / 10).toLocaleString("pt-BR")} %`;
}
function pickFirstExisting(obj: any, keys: string[]): any {
  for (const k of keys) if (k in obj && obj[k] != null) return obj[k];
  return undefined;
}
async function resolveAvatarUrl(user: RawUser): Promise<string | null> {
  const path = pickFirstExisting(user, CONFIG.USER_AVATAR_KEYS);
  if (!path) return null;
  if (typeof path === "string" && (/^https?:\/\//i).test(path)) return path; // já é público
  try {
    const { data } = supabase.storage.from("avatars").getPublicUrl(String(path));
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}
function useAudio() {
  const cashRef = useRef<HTMLAudioElement | null>(null);
  const successRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    cashRef.current = new Audio("/sounds/cash.mp3");
    successRef.current = new Audio("/sounds/success.mp3");
  }, []);
  return {
    playCash: () => cashRef.current?.play().catch(() => {}),
    playSuccess: () => successRef.current?.play().catch(() => {}),
  };
}

/** -------- Página -------- */
export default function RankingVendedores() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const { startStr, endStr } = useMemo(() => ymStartEnd(year, month), [year, month]);
  const goalsMonthCol = useMemo(() => monthCol(month), [month]);

  const [users, setUsers] = useState<RawUser[]>([]);
  const [deals, setDeals] = useState<RawDeal[]>([]);
  const [goals, setGoals] = useState<GoalsRow[]>([]);
  const [loading, setLoading] = useState(true);

  const { playCash, playSuccess } = useAudio();

  // Carregar usuários
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data, error } = await supabase
        .from(CONFIG.USERS_TABLE)
        .select("*")
        .order(CONFIG.USER_NAME, { ascending: true });
      if (error) console.error(error);
      if (!cancel) setUsers(data || []);
    })();
    return () => { cancel = true; };
  }, []);

  // Carregar vendas do período
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from(CONFIG.DEALS_TABLE)
        .select("*")
        .gte(CONFIG.DEALS_DATE, startStr)
        .lt(CONFIG.DEALS_DATE, endStr);
      if (error) console.error(error);
      if (!cancel) setDeals(data || []);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [startStr, endStr]);

  // Carregar metas do ano inteiro
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data, error } = await supabase
        .from(CONFIG.GOALS_TABLE)
        .select("*")
        .eq(CONFIG.GOALS_YEAR, year);
      if (error) console.error(error);
      if (!cancel) setGoals(data || []);
    })();
    return () => { cancel = true; };
  }, [year]);

  // Realtime (insert/update no mês selecionado)
  useEffect(() => {
    const channel = supabase
      .channel("ranking-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: CONFIG.DEALS_TABLE }, (payload) => {
        const row = payload.new as RawDeal;
        const dateStr = String(row[CONFIG.DEALS_DATE] || "");
        if (dateStr >= startStr && dateStr < endStr) {
          setDeals((prev) => [row, ...prev]);
          playCash();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: CONFIG.DEALS_TABLE }, (payload) => {
        const row = payload.new as RawDeal;
        const dateStr = String(row[CONFIG.DEALS_DATE] || "");
        if (!(dateStr >= startStr && dateStr < endStr)) return;
        setDeals((prev) => {
          const idx = prev.findIndex((d) => d.id === row.id);
          const next = [...prev];
          if (idx >= 0) next[idx] = row;
          return next;
        });
        const status = String(row[CONFIG.DEALS_STATUS] ?? "").toLowerCase();
        if (CONFIG.STATUS_ENCARTEIRADA.includes(status)) playSuccess();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [startStr, endStr, playCash, playSuccess]);

  // Mapas auxiliares de usuários
  const userById = useMemo(() => {
    const m = new Map<string, RawUser>();
    for (const u of users) m.set(String(u[CONFIG.USER_ID]), u);
    return m;
  }, [users]);
  const userByAuthId = useMemo(() => {
    const m = new Map<string, RawUser>();
    for (const u of users) if (u[CONFIG.USER_AUTH_ID]) m.set(String(u[CONFIG.USER_AUTH_ID]), u);
    return m;
  }, [users]);

  // Metas por vendedor (chaveadas por users.id)
  const metaPorVendedor = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of goals) {
      const uid = String(g[CONFIG.GOALS_USER_KEY]);
      const v = Number(g[goalsMonthCol] ?? 0) || 0;
      m.set(uid, v);
    }
    return m;
  }, [goals, goalsMonthCol]);

  const metaTotalMes = useMemo(
    () => Array.from(metaPorVendedor.values()).reduce((acc, n) => acc + n, 0),
    [metaPorVendedor]
  );

  // Ranking por vendedor
  const ranking: RankRow[] = useMemo(() => {
    const byUser: Record<string, RankRow> = {};

    for (const d of deals) {
      const vendedorKey = String(d[CONFIG.DEALS_USER_KEY] ?? "");
      if (!vendedorKey) continue;

      // Encontrar user por id ou por auth_id (vendas costuma trazer auth_user_id)
      const u = userById.get(vendedorKey) || userByAuthId.get(vendedorKey);
      if (!u) continue; // sem usuário não monta (evita linha sem nome/foto)

      const id = String(u[CONFIG.USER_ID]); // padroniza para users.id
      const name = (u?.[CONFIG.USER_NAME] as string) || "—";
      const email = (u?.[CONFIG.USER_EMAIL] as string) || undefined;

      if (!byUser[id]) {
        byUser[id] = {
          userId: id,
          vendorAuthId: String(u[CONFIG.USER_AUTH_ID] || ""),
          name,
          email,
          avatarUrl: undefined, // preenchemos depois
          vendasCount: 0,
          encarteiradasCount: 0,
          producao: 0,
          ticketMedio: 0,
          metaUsuario: metaPorVendedor.get(id) ?? 0, // metas são por users.id
        };
      }

      const status = String(d[CONFIG.DEALS_STATUS] ?? "").toLowerCase();
      const val = Number(d[CONFIG.DEAL_VALUE_KEY] ?? 0) || 0;

      byUser[id].vendasCount += 1;
      byUser[id].producao += val;
      if (CONFIG.STATUS_ENCARTEIRADA.includes(status)) byUser[id].encarteiradasCount += 1;
    }

    const rows = Object.values(byUser);
    for (const r of rows) r.ticketMedio = r.vendasCount ? r.producao / r.vendasCount : 0;

    rows.sort((a, b) => {
      if (b.producao !== a.producao) return b.producao - a.producao;
      if (b.encarteiradasCount !== a.encarteiradasCount) return b.encarteiradasCount - a.encarteiradasCount;
      return b.vendasCount - a.vendasCount;
    });

    return rows;
  }, [deals, userById, userByAuthId, metaPorVendedor]);

  // Avatares (por users.id)
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let cancel = false;
    (async () => {
      const map: Record<string, string | null> = {};
      for (const u of users) {
        const url = await resolveAvatarUrl(u);
        map[String(u[CONFIG.USER_ID])] = url || null;
      }
      if (!cancel) setAvatars(map);
    })();
    return () => { cancel = true; };
  }, [users]);

  // Totais + % da Meta
  const producaoTotal = useMemo(
    () => ranking.reduce((acc, r) => acc + r.producao, 0),
    [ranking]
  );
  const pctMetaTotal = useMemo(() => {
    if (!metaTotalMes || metaTotalMes <= 0) return 0;
    return (producaoTotal / metaTotalMes) * 100;
  }, [producaoTotal, metaTotalMes]);

  // Ranking por administradora (exclui tipo_venda = 'Contemplada' apenas aqui)
  const adminRanking = useMemo(() => {
    const map: Record<string, { admin: string; vendas: number; producao: number }> = {};
    for (const d of deals) {
      const tipo = String(d[CONFIG.DEALS_TIPO] || "").toLowerCase();
      if (tipo === "contemplada") continue; // regra solicitada

      const admin = (d[CONFIG.DEAL_ADMIN] as string) || "—";
      const val = Number(d[CONFIG.DEAL_VALUE_KEY] ?? 0) || 0;

      if (!map[admin]) map[admin] = { admin, vendas: 0, producao: 0 };
      map[admin].vendas += 1;
      map[admin].producao += val;
    }
    return Object.values(map).sort((a, b) => b.producao - a.producao);
  }, [deals]);

  const top3 = ranking.slice(0, 3);
  const others = ranking.slice(3);
  const firstValue = top3[0]?.producao ?? 0;
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

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
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-7 w-7 text-yellow-400" />
            Ranking dos Vendedores
            <Badge className="ml-2">{months[month]}/{year}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Produção mensal, encarteiradas e ticket médio — com pódio e tempo real.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-end justify-end">
          <div className="flex items-center gap-2">
            <CalIcon className="h-4 w-4 text-muted-foreground" />
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m, i) => (<SelectItem key={i} value={String(i)}>{m}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 6 }).map((_, idx) => {
                const y = now.getUTCFullYear() - 3 + idx;
                return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
              })}
            </SelectContent>
          </Select>

          {/* Meta total e atingimento */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-0 bg-white/70 backdrop-blur-xl shadow">
              <CardContent className="py-2 px-3">
                <div className="text-xs text-muted-foreground">Meta do mês (soma)</div>
                <div className="text-base font-semibold">{formatCurrency(metaTotalMes || 0)}</div>
              </CardContent>
            </Card>
            <Card className="border-0 bg-white/70 backdrop-blur-xl shadow">
              <CardContent className="py-2 px-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  Atingido <Percent className="h-3 w-3" />
                </div>
                <div className="text-base font-semibold">{formatPct(pctMetaTotal)}</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* PÓDIO – plataforma 1-2-3 */}
      <Card className="mb-6 border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-400" />
            Pódio do mês
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {top3.length === 0 && (
            <div className="text-center p-10 text-muted-foreground">Sem dados neste período.</div>
          )}
          {top3.length > 0 && (
            <div className="relative mx-auto max-w-5xl">
              {/* Avatares e infos acima das bases */}
              <div className="grid grid-cols-3 gap-6 items-end mb-4">
                {/* 2º */}
                {top3[1] ? (
                  <div className="flex flex-col items-center">
                    <SimpleAvatar
                      src={avatars[top3[1].userId] || undefined}
                      alt={top3[1].name}
                      fallbackText={getInitials(top3[1].name, top3[1].email)}
                      className="ring-4 ring-white/70 shadow-md"
                      size={72}
                    />
                    <div className="mt-2 font-semibold">{top3[1].name}</div>
                    <div className="text-xs text-muted-foreground">{top3[1].vendasCount} venda(s) · {top3[1].encarteiradasCount} encarteiradas</div>
                    <div className="mt-1 text-lg font-extrabold">{formatCurrency(top3[1].producao)}</div>
                    <Badge className="mt-1">Ticket {formatCurrency(top3[1].ticketMedio || 0)}</Badge>
                    <div className="mt-1 text-xs text-slate-700">− {formatCurrency(Math.max(0, firstValue - top3[1].producao))} p/ alcançar o 1º</div>
                  </div>
                ) : <div />}

                {/* 1º */}
                <div className="flex flex-col items-center">
                  <SimpleAvatar
                    src={avatars[top3[0].userId] || undefined}
                    alt={top3[0].name}
                    fallbackText={getInitials(top3[0].name, top3[0].email)}
                    className="ring-4 ring-yellow-300 shadow-xl"
                    size={92}
                  />
                  <div className="mt-2 font-bold text-lg flex items-center gap-2">
                    {top3[0].name}
                    <Crown className="h-5 w-5 text-yellow-500" />
                  </div>
                  <div className="text-xs text-muted-foreground">{top3[0].vendasCount} venda(s) · {top3[0].encarteiradasCount} encarteiradas</div>
                  <div className="mt-1 text-2xl font-extrabold">{formatCurrency(top3[0].producao)}</div>
                  <Badge className="mt-1">Ticket {formatCurrency(top3[0].ticketMedio || 0)}</Badge>
                  <div className="mt-1 text-xs text-emerald-700 font-medium">Você é o líder!</div>
                </div>

                {/* 3º */}
                {top3[2] ? (
                  <div className="flex flex-col items-center">
                    <SimpleAvatar
                      src={avatars[top3[2].userId] || undefined}
                      alt={top3[2].name}
                      fallbackText={getInitials(top3[2].name, top3[2].email)}
                      className="ring-4 ring-white/70 shadow-md"
                      size={64}
                    />
                    <div className="mt-2 font-semibold">{top3[2].name}</div>
                    <div className="text-xs text-muted-foreground">{top3[2].vendasCount} venda(s) · {top3[2].encarteiradasCount} encarteiradas</div>
                    <div className="mt-1 text-lg font-extrabold">{formatCurrency(top3[2].producao)}</div>
                    <Badge className="mt-1">Ticket {formatCurrency(top3[2].ticketMedio || 0)}</Badge>
                    <div className="mt-1 text-xs text-slate-700">− {formatCurrency(Math.max(0, firstValue - top3[2].producao))} p/ alcançar o 1º</div>
                  </div>
                ) : <div />}
              </div>

              {/* Base 1-2-3 */}
              <div className="grid grid-cols-3 gap-6">
                <div className="h-24 bg-slate-200 rounded-t-xl shadow-inner flex items-end justify-center relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-3xl opacity-30">🥈</div>
                  <div className="w-full h-20 bg-gradient-to-b from-slate-300 to-slate-400 rounded-t-xl border-t border-slate-300 flex items-center justify-center text-2xl font-bold text-slate-700">2</div>
                </div>
                <div className="h-36 bg-amber-200 rounded-t-xl shadow-inner flex items-end justify-center relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-3xl opacity-40">🥇</div>
                  <div className="w-full h-32 bg-gradient-to-b from-yellow-300 to-amber-400 rounded-t-xl border-t border-amber-300 flex items-center justify-center text-3xl font-extrabold text-amber-800">1</div>
                </div>
                <div className="h-20 bg-amber-100 rounded-t-xl shadow-inner flex items-end justify-center relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-3xl opacity-30">🥉</div>
                  <div className="w-full h-16 bg-gradient-to-b from-amber-200 to-amber-300 rounded-t-xl border-t border-amber-200 flex items-center justify-center text-2xl font-bold text-amber-700">3</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LISTA RANKEADA */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Ranking completo
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="p-10 text-center text-muted-foreground">Carregando…</div>
          ) : ranking.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">Sem dados neste período.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px]">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="py-3">#</th>
                    <th>Vendedor</th>
                    <th>Vendas</th>
                    <th>Encarteiradas</th>
                    <th>Produção</th>
                    <th>Ticket médio</th>
                    <th>Dif. p/ 1º</th>
                    <th className="w-[300px]">Barra (meta individual)</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => {
                    const avatar = avatars[r.userId];
                    const metaUser = r.metaUsuario ?? 0;
                    const pct = metaUser > 0 ? Math.min(100, Math.round((r.producao / metaUser) * 100)) : 0;
                    const diff = i === 0 ? 0 : Math.max(0, firstValue - r.producao);

                    return (
                      <tr
                        key={r.userId}
                        className={`border-t hover:bg-white/60 transition-colors ${i < 3 ? "bg-gradient-to-r from-transparent via-amber-50/40 to-transparent" : ""}`}
                      >
                        <td className="py-3 px-2 font-semibold">{i + 1}</td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-3">
                            <SimpleAvatar
                              src={avatar || undefined}
                              alt={r.name}
                              fallbackText={getInitials(r.name, r.email)}
                              className="ring-2 ring-white"
                              size={32}
                            />
                            <div>
                              <div className="font-medium">{r.name}</div>
                              <div className="text-xs text-muted-foreground">{r.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2">{r.vendasCount}</td>
                        <td className="py-3 px-2"><Badge variant="secondary">{r.encarteiradasCount}</Badge></td>
                        <td className="py-3 px-2 font-semibold">{formatCurrency(r.producao)}</td>
                        <td className="py-3 px-2">{formatCurrency(r.ticketMedio || 0)}</td>
                        <td className="py-3 px-2">{i === 0 ? "—" : `− ${formatCurrency(diff)}`}</td>
                        <td className="py-3 px-2">
                          <div className="text-xs text-muted-foreground mb-1">
                            {metaUser > 0 ? <>Meta {formatCurrency(metaUser)}</> : <>Sem meta definida</>}
                          </div>
                          <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-rose-500"}`}
                              style={{ width: `${pct}%` }}
                              title={metaUser > 0 ? `${pct}% da meta (${formatCurrency(metaUser)})` : "Sem meta definida"}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {others.length > 0 && (
                <div className="mt-4 text-xs text-muted-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Dica: metas individuais alimentam a barra de cada vendedor. A caixa “Meta do mês” soma as metas do cadastro.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* RANKING POR ADMINISTRADORA (exclui 'Contemplada') */}
      <Card className="mt-6 border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-500" />
            Ranking por Administradora (sem “Contemplada”)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {adminRanking.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">Sem dados para este período.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="py-3">#</th>
                    <th>Administradora</th>
                    <th>Vendas</th>
                    <th>Produção</th>
                  </tr>
                </thead>
                <tbody>
                  {adminRanking.map((row, idx) => (
                    <tr key={row.admin} className="border-t hover:bg-white/60 transition-colors">
                      <td className="py-3 px-2 font-semibold">{idx + 1}</td>
                      <td className="py-3 px-2">{row.admin}</td>
                      <td className="py-3 px-2">{row.vendas}</td>
                      <td className="py-3 px-2 font-semibold">{formatCurrency(row.producao)}</td>
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
