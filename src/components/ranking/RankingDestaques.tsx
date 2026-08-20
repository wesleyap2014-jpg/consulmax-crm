import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  CheckCircle2,
  RefreshCcw,
  Sparkles,
  Target,
  Trophy,
  Users,
} from "lucide-react";

type PeriodMode = "week" | "month";

type HighlightRow = {
  userId: string;
  vendorAuthId: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  salesVolume: number;
  salesCount: number;
  simulations: number;
  prospections: number;
  qualifications: number;
};

type Props = {
  year: number;
  month: number;
};

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function businessToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Porto_Velho",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day)));
}

function weekRange() {
  const today = businessToday();
  const day = today.getUTCDay();
  const sinceMonday = (day + 6) % 7;
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - sinceMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start: formatDate(start), end: formatDate(end) };
}

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  return { start: formatDate(start), end: formatDate(end) };
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function normalizeAvatarUrl(value?: string | null) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  try {
    return supabase.storage.from("avatars").getPublicUrl(raw).data?.publicUrl || null;
  } catch {
    return null;
  }
}

function initials(name?: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function periodLabel(mode: PeriodMode, year: number, month: number) {
  if (mode === "month") {
    const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(year, month, 1)),
    );
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const range = weekRange();
  const start = new Date(`${range.start}T12:00:00Z`);
  const endExclusive = new Date(`${range.end}T12:00:00Z`);
  const end = new Date(endExclusive);
  end.setUTCDate(end.getUTCDate() - 1);
  return `${start.toLocaleDateString("pt-BR", { timeZone: "UTC" })} a ${end.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`;
}

function metricLeader(rows: HighlightRow[], metric: keyof Pick<HighlightRow, "salesVolume" | "salesCount" | "simulations" | "prospections" | "qualifications">) {
  return [...rows]
    .filter((row) => Number(row[metric] || 0) > 0)
    .sort((a, b) => Number(b[metric] || 0) - Number(a[metric] || 0) || a.name.localeCompare(b.name, "pt-BR"))[0] || null;
}

function LeaderCard({
  icon,
  label,
  row,
  value,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  row: HighlightRow | null;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#A11C27]/10 text-[#A11C27]">{icon}</span>
      </div>
      {row ? (
        <>
          <div className="mt-3 flex items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#1E293F] text-xs font-black text-white">
              {row.avatarUrl ? <img src={row.avatarUrl} alt={row.name} className="h-full w-full object-cover" /> : initials(row.name)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-slate-900" title={row.name}>{row.name}</div>
              <div className="text-lg font-black text-[#1E293F]">{value}</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-500">{helper}</div>
        </>
      ) : (
        <div className="mt-5 text-sm font-semibold text-slate-400">Sem registros no período.</div>
      )}
    </div>
  );
}

export default function RankingDestaques({ year, month }: Props) {
  const [period, setPeriod] = useState<PeriodMode>("week");
  const [rows, setRows] = useState<HighlightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => (period === "week" ? weekRange() : monthRange(year, month)), [period, year, month]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc("rpc_ranking_destaques_periodo", {
        p_inicio: range.start,
        p_fim: range.end,
      });
      if (cancelled) return;
      if (error) {
        console.error("[RankingDestaques]", error);
        setRows([]);
        setError(error.message || "Não foi possível carregar os destaques.");
      } else {
        setRows(
          (data || []).map((row: any) => ({
            userId: String(row.user_id || ""),
            vendorAuthId: String(row.vendedor_auth_id || ""),
            name: String(row.nome || "—"),
            email: row.email ? String(row.email) : undefined,
            avatarUrl: normalizeAvatarUrl(row.avatar_url),
            salesVolume: Number(row.vendas_volume || 0),
            salesCount: Number(row.vendas_quantidade || 0),
            simulations: Number(row.simulacoes || 0),
            prospections: Number(row.prospeccoes || 0),
            qualifications: Number(row.qualificacoes || 0),
          })),
        );
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range.start, range.end]);

  const leaders = useMemo(() => ({
    volume: metricLeader(rows, "salesVolume"),
    quantity: metricLeader(rows, "salesCount"),
    simulations: metricLeader(rows, "simulations"),
    prospections: metricLeader(rows, "prospections"),
    qualifications: metricLeader(rows, "qualifications"),
  }), [rows]);

  const tableRows = useMemo(
    () => [...rows].sort((a, b) => b.salesVolume - a.salesVolume || b.salesCount - a.salesCount || a.name.localeCompare(b.name, "pt-BR")),
    [rows],
  );

  return (
    <Card className="mb-6 overflow-hidden border-0 bg-white/80 shadow-xl backdrop-blur-xl">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-[#1E293F]">
              <Sparkles className="h-5 w-5 text-[#B5A573]" />
              Destaques Comerciais
            </CardTitle>
            <div className="mt-1 text-xs text-slate-500">
              {period === "week" ? "Semana atual" : "Mês selecionado"} • {periodLabel(period, year, month)}
            </div>
          </div>
          <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setPeriod("week")}
              className={`rounded-lg px-4 py-2 text-xs font-black transition ${period === "week" ? "bg-[#1E293F] text-white shadow" : "text-slate-600 hover:bg-white"}`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setPeriod("month")}
              className={`rounded-lg px-4 py-2 text-xs font-black transition ${period === "month" ? "bg-[#1E293F] text-white shadow" : "text-slate-600 hover:bg-white"}`}
            >
              Mês
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm font-semibold text-slate-500">
            <RefreshCcw className="h-4 w-4 animate-spin" /> Carregando destaques…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <LeaderCard
                icon={<Trophy className="h-4 w-4" />}
                label="Vendas • Volume"
                row={leaders.volume}
                value={leaders.volume ? formatBRL(leaders.volume.salesVolume) : "—"}
                helper={leaders.volume ? `${leaders.volume.salesCount} venda(s) no período` : ""}
              />
              <LeaderCard
                icon={<BarChart3 className="h-4 w-4" />}
                label="Vendas • Quantidade"
                row={leaders.quantity}
                value={leaders.quantity ? `${leaders.quantity.salesCount} venda(s)` : "—"}
                helper={leaders.quantity ? formatBRL(leaders.quantity.salesVolume) : ""}
              />
              <LeaderCard
                icon={<Target className="h-4 w-4" />}
                label="Simulações Realizadas"
                row={leaders.simulations}
                value={leaders.simulations ? String(leaders.simulations.simulations) : "—"}
                helper="Leads distintos com pelo menos 1 simulação"
              />
              <LeaderCard
                icon={<Users className="h-4 w-4" />}
                label="Prospecções"
                row={leaders.prospections}
                value={leaders.prospections ? String(leaders.prospections.prospections) : "—"}
                helper="Novos leads + novas oportunidades"
              />
              <LeaderCard
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Qualificações"
                row={leaders.qualifications}
                value={leaders.qualifications ? String(leaders.qualifications.qualifications) : "—"}
                helper="Qualificações concluídas no período"
              />
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-black text-slate-900">Ranking consolidado do período</div>
                  <div className="text-xs text-slate-500">Os mesmos critérios dos cards, lado a lado por vendedor.</div>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Ordem por volume vendido</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Vendedor</th>
                      <th className="px-4 py-3 text-right">Volume</th>
                      <th className="px-4 py-3 text-right">Vendas</th>
                      <th className="px-4 py-3 text-right">Simulações</th>
                      <th className="px-4 py-3 text-right">Prospecções</th>
                      <th className="px-4 py-3 text-right">Qualificações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, index) => (
                      <tr key={row.userId} className="border-t border-slate-100 text-sm hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-black text-slate-400">{index + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[#1E293F] text-[10px] font-black text-white">
                              {row.avatarUrl ? <img src={row.avatarUrl} alt={row.name} className="h-full w-full object-cover" /> : initials(row.name)}
                            </div>
                            <span className="font-bold text-slate-800">{row.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-black text-[#1E293F]">{formatBRL(row.salesVolume)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">{row.salesCount}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">{row.simulations}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">{row.prospections}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">{row.qualifications}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
