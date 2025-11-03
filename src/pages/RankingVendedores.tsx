// src/pages/RankingVendedores.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
// import { Badge } from "@/components/ui/badge"; // ❌ não existe no seu projeto
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Crown, Sparkles, TrendingUp, Calendar as CalIcon } from "lucide-react";
import clsx from "clsx";

/** -------- Badge simples (fallback) -------- */
type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary";
};
const Badge: React.FC<BadgeProps> = ({ variant = "default", className = "", ...rest }) => {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";
  const styles =
    variant === "secondary"
      ? "bg-slate-100 text-slate-800"
      : "bg-[#A11C27] text-white";
  return <span className={`${base} ${styles} ${className}`} {...rest} />;
};

/* ====================== CONFIG ====================== */
const CONFIG = {
  DEALS_TABLE: "propostas",
  DEALS_USER_KEY: "vendedor_id",
  DEALS_CREATED_AT: "created_at",
  DEALS_STATUS: "status",
  STATUS_ENCARTEIRADA: ["encarteirada", "vendida", "fechada"],
  DEAL_VALUE_CANDIDATES: ["valor", "valor_credito", "credito"],
  USERS_TABLE: "users",
  USER_ID: "id",
  USER_NAME: "name",
  USER_EMAIL: "email",
  USER_AVATAR_PATH_CANDIDATES: ["avatarPath", "avatar_url", "avatar"],
  AVATARS_BUCKET: "avatars",
};
/* ==================================================== */

type RawUser = { id: string; name?: string | null; email?: string | null; [k: string]: any };
type RawDeal = Record<string, any>;

type RankRow = {
  userId: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  vendasCount: number;
  encarteiradasCount: number;
  producao: number;
  ticketMedio: number;
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
function monthStartEnd(year: number, monthIndexZeroBased: number) {
  const start = new Date(Date.UTC(year, monthIndexZeroBased, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndexZeroBased + 1, 1, 0, 0, 0));
  return { start, end };
}
function pickFirstExisting(obj: any, keys: string[]): any {
  for (const k of keys) if (k in obj && obj[k] != null) return obj[k];
  return undefined;
}
async function resolveAvatarUrl(user: RawUser): Promise<string | null> {
  const path = pickFirstExisting(user, CONFIG.USER_AVATAR_PATH_CANDIDATES);
  if (!path) return null;
  if (typeof path === "string" && (path.startsWith("http://") || path.startsWith("https://"))) {
    return path;
  }
  try {
    const { data } = supabase.storage.from(CONFIG.AVATARS_BUCKET).getPublicUrl(path);
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

export default function RankingVendedores() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [meta, setMeta] = useState<number>(100000);
  const { start, end } = useMemo(() => monthStartEnd(year, month), [year, month]);

  const [users, setUsers] = useState<RawUser[]>([]);
  const [deals, setDeals] = useState<RawDeal[]>([]);
  const [loading, setLoading] = useState(true);

  const { playCash, playSuccess } = useAudio();

  useEffect(() => {
    let isCancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from(CONFIG.USERS_TABLE)
        .select("*")
        .order(CONFIG.USER_NAME, { ascending: true });
      if (error) console.error(error);
      if (!isCancelled) setUsers(data || []);
    })();
    return () => { isCancelled = true; };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from(CONFIG.DEALS_TABLE)
        .select("*")
        .gte(CONFIG.DEALS_CREATED_AT, start.toISOString())
        .lt(CONFIG.DEALS_CREATED_AT, end.toISOString());
      if (error) console.error(error);
      if (!isCancelled) setDeals(data || []);
      setLoading(false);
    })();
    return () => { isCancelled = true; };
  }, [start.toISOString(), end.toISOString()]);

  useEffect(() => {
    const channel = supabase
      .channel("ranking-realtime")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: CONFIG.DEALS_TABLE },
        (payload) => {
          const row = payload.new as RawDeal;
          const createdAt = new Date(row[CONFIG.DEALS_CREATED_AT]);
          if (createdAt >= start && createdAt < end) {
            setDeals((prev) => [row, ...prev]);
            playCash();
          }
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: CONFIG.DEALS_TABLE },
        (payload) => {
          const row = payload.new as RawDeal;
          const createdAt = new Date(row[CONFIG.DEALS_CREATED_AT]);
          if (!(createdAt >= start && createdAt < end)) return;
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
  }, [start.getTime(), end.getTime(), playCash, playSuccess]);

  const ranking: RankRow[] = useMemo(() => {
    const byUser: Record<string, RankRow> = {};
    const valueKey = deals.length
      ? CONFIG.DEAL_VALUE_CANDIDATES.find((k) => k in deals[0]) || CONFIG.DEAL_VALUE_CANDIDATES[0]
      : CONFIG.DEAL_VALUE_CANDIDATES[0];

    for (const d of deals) {
      const uid = d[CONFIG.DEALS_USER_KEY];
      if (!uid) continue;
      const u = users.find((x) => x[CONFIG.USER_ID] === uid);
      const name = (u?.[CONFIG.USER_NAME] as string) || "—";
      const email = (u?.[CONFIG.USER_EMAIL] as string) || undefined;

      if (!byUser[uid]) {
        byUser[uid] = {
          userId: uid, name, email, avatarUrl: undefined,
          vendasCount: 0, encarteiradasCount: 0, producao: 0, ticketMedio: 0,
        };
      }
      const status = String(d[CONFIG.DEALS_STATUS] ?? "").toLowerCase();
      const val = Number(d[valueKey] ?? 0) || 0;

      byUser[uid].vendasCount += 1;
      byUser[uid].producao += val;
      if (CONFIG.STATUS_ENCARTEIRADA.includes(status)) byUser[uid].encarteiradasCount += 1;
    }

    const rows = Object.values(byUser);
    for (const r of rows) r.ticketMedio = r.vendasCount ? r.producao / r.vendasCount : 0;

    rows.sort((a, b) => {
      if (b.producao !== a.producao) return b.producao - a.producao;
      if (b.encarteiradasCount !== a.encarteiradasCount) return b.encarteiradasCount - a.encarteiradasCount;
      return b.vendasCount - a.vendasCount;
    });
    return rows;
  }, [deals, users]);

  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let isCancelled = false;
    (async () => {
      const map: Record<string, string | null> = {};
      for (const u of users) {
        const url = await resolveAvatarUrl(u);
        map[u.id] = url || null;
      }
      if (!isCancelled) setAvatars(map);
    })();
    return () => { isCancelled = true; };
  }, [users]);

  const top3 = ranking.slice(0, 3);
  const others = ranking.slice(3);
  const maxProducao = Math.max(1, ...ranking.map((r) => r.producao));
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  return (
    <div className="p-4 md:p-6 animate-in fade-in slide-in-from-bottom-2">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-16 -left-24 size-[420px] rounded-full blur-3xl opacity-25 bg-[#A11C27]" />
        <div className="absolute top-10 right-10 size-[360px] rounded-full blur-3xl opacity-25 bg-[#1E293F]" />
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 size-[260px] rounded-full blur-3xl opacity-30 bg-[#E0CE8C]" />
      </div>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-7 w-7 text-yellow-400" />
            Ranking dos Vendedores
            <Badge className="ml-2"> {months[month]}/{year} </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Produção mensal, encarteiradas e ticket médio — com pódio e tempo real.
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-2">
            <CalIcon className="h-4 w-4 text-muted-foreground" />
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m, i) => (
                  <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                ))}
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

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Meta R$</span>
            <Input
              className="w-[140px]"
              value={meta}
              onChange={(e) => setMeta(Number(e.target.value || 0))}
              type="number"
              min={0}
              step={1000}
            />
          </div>
        </div>
      </div>

      {/* PÓDIO */}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {top3.map((r, idx) => {
                const height = Math.max(35, Math.round((r.producao / maxProducao) * 100));
                const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
                const bg =
                  idx === 0 ? "from-yellow-400/70 to-amber-600/70"
                  : idx === 1 ? "from-slate-300/80 to-slate-500/70"
                  : "from-amber-900/40 to-amber-600/30";
                const avatar = avatars[r.userId];

                return (
                  <div
                    key={r.userId}
                    className={clsx(
                      "relative rounded-2xl p-4 pb-6 text-center border",
                      "bg-gradient-to-br", bg, "shadow-lg overflow-hidden"
                    )}
                  >
                    <div className="absolute -right-6 -top-6 text-5xl opacity-40 rotate-12 select-none">
                      {medal}
                    </div>

                    <div className="flex flex-col items-center gap-3">
                      <Avatar className="size-16 ring-4 ring-white/70 shadow-md">
                        <AvatarImage src={avatar || undefined} />
                        <AvatarFallback className="bg-white/80 text-[#1E293F] font-semibold">
                          {getInitials(r.name, r.email)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="font-semibold">{r.name}</div>
                      <div className="text-sm text-muted-foreground -mt-2">
                        {r.vendasCount} vendas · {r.encarteiradasCount} encarteiradas
                      </div>

                      <div className="w-full h-24 flex items-end justify-center">
                        <div
                          className="w-16 rounded-t-2xl bg-white/90 border shadow-inner transition-all duration-700"
                          style={{ height: `${height}%` }}
                          title={formatCurrency(r.producao)}
                        />
                      </div>

                      <div className="mt-2 text-lg font-bold tracking-tight">
                        {formatCurrency(r.producao)}
                      </div>

                      <Badge>Ticket {formatCurrency(r.ticketMedio || 0)}</Badge>
                    </div>
                  </div>
                );
              })}
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
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="py-3">#</th>
                    <th>Vendedor</th>
                    <th>Vendas</th>
                    <th>Encarteiradas</th>
                    <th>Produção</th>
                    <th>Ticket médio</th>
                    <th className="w-[260px]">Barra (meta)</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => {
                    const avatar = avatars[r.userId];
                    const pct = meta > 0 ? Math.min(100, Math.round((r.producao / meta) * 100)) : 0;

                    return (
                      <tr
                        key={r.userId}
                        className={clsx(
                          "border-t hover:bg-white/60 transition-colors",
                          i < 3 && "bg-gradient-to-r from-transparent via-amber-50/40 to-transparent"
                        )}
                      >
                        <td className="py-3 px-2 font-semibold">{i + 1}</td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-8 ring-2 ring-white">
                              <AvatarImage src={avatar || undefined} />
                              <AvatarFallback className="bg-white/80 text-[#1E293F]">
                                {getInitials(r.name, r.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{r.name}</div>
                              <div className="text-xs text-muted-foreground">{r.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2">{r.vendasCount}</td>
                        <td className="py-3 px-2">
                          <Badge variant="secondary">{r.encarteiradasCount}</Badge>
                        </td>
                        <td className="py-3 px-2 font-semibold">{formatCurrency(r.producao)}</td>
                        <td className="py-3 px-2">{formatCurrency(r.ticketMedio || 0)}</td>
                        <td className="py-3 px-2">
                          <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={clsx(
                                "h-full rounded-full transition-all",
                                pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-rose-500"
                              )}
                              style={{ width: `${pct}%` }}
                              title={`${pct}% da meta`}
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
                  Dica: compare períodos trocando o mês/ano acima.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
