import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Activity, BarChart3, Loader2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type HistoryResult = {
  date: string | null;
  median: number | null;
  ll_high: number | null;
  ll_low: number | null;
  ll_offers: number | null;
  ll_deliveries: number | null;
};
type Group = {
  id: string;
  codigo: string;
  administradora: string;
  segmento: string;
  modalities: { key: string; label: string }[];
};

const num = (v: unknown): number | null => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const pct = (v: number | null | undefined): string => v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
const signed = (v: number | null): string => v == null ? "—" : (v > 0 ? "+" : "") + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " p.p.";
function dateBR(value: string | null): string {
  if (!value) return "—";
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? match[3] + "/" + match[2] + "/" + match[1] : value;
}
function median(row: HistoryResult): number | null {
  const stored = num(row.median);
  if (stored != null) return stored;
  const high = num(row.ll_high), low = num(row.ll_low);
  return high == null || low == null ? null : (high + low) / 2;
}

export default function GroupMedianHistory({ group }: { group: Group }) {
  const [history, setHistory] = useState<HistoryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setHistory([]);
    setHistoryError("");
    setAiText("");
    setAiError("");
    void (async () => {
      const { data, error } = await supabase.from("assembly_results")
        .select("date,median,ll_high,ll_low,ll_offers,ll_deliveries")
        .eq("group_id", group.id).order("date", { ascending: false }).limit(12);
      if (!active) return;
      if (error) setHistoryError("Não foi possível consultar as assembleias anteriores deste grupo.");
      else setHistory((data || []).map((item: any) => ({
        date: item.date ?? null,
        median: num(item.median),
        ll_high: num(item.ll_high),
        ll_low: num(item.ll_low),
        ll_offers: num(item.ll_offers),
        ll_deliveries: num(item.ll_deliveries),
      })));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [group.id]);

  const points = useMemo(() => history
    .map((r) => ({ date: r.date, value: median(r), offers: r.ll_offers, deliveries: r.ll_deliveries }))
    .filter((r): r is { date: string | null; value: number; offers: number | null; deliveries: number | null } => r.value != null)
    .reverse(), [history]);
  const last = points.length ? points[points.length - 1] : null;
  const previous = points.length > 1 ? points[points.length - 2] : null;
  const delta = last && previous ? last.value - previous.value : null;
  const average = points.length ? points.reduce((total, row) => total + row.value, 0) / points.length : null;
  const chartRows = points.map((row, i) => ({ i, date: dateBR(row.date), median: row.value }));

  async function analyze() {
    if (!history.length || aiLoading || loading) return;
    setAiLoading(true);
    setAiError("");
    setAiText("");
    try {
      const response = await fetch("/api/max-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "livre",
          prompt: [
            "Você é MAX, analista da Consulmax. Interprete exclusivamente a evolução histórica da mediana do lance livre deste grupo.",
            "Avalie os movimentos entre assembleias, oscilações e tendências, deixando claras as limitações da amostra.",
            "Explique o que merece atenção antes da próxima assembleia, em português claro e conciso.",
            "Não invente dados, não atribua causalidade sem evidência, não preveja contemplação e não recomende lances como garantidos.",
            "Considere somente modalidades de lance habilitadas; esta leitura é informativa e não altera registros."
          ].join(" "),
          context: {
            grupo: group.codigo, administradora: group.administradora, segmento: group.segmento,
            modalidades: group.modalities.map((m) => m.label),
            medianaMaisRecente: last?.value ?? null,
            variacaoUltimasApuracoesEmPontosPercentuais: delta,
            mediaDasMedianasHistoricas: average,
            historicoCronologico: points.map((r) => ({
              data: r.date, medianaLivre: r.value, ofertasLivre: r.offers, entregasLivre: r.deliveries
            }))
          },
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.answer || typeof result.answer !== "string") throw Error("MAX indisponível");
      setAiText(result.answer.trim());
    } catch {
      setAiError("O MAX não respondeu. O histórico e o gráfico permanecem disponíveis para consulta.");
    } finally { setAiLoading(false); }
  }

  return (
    <section aria-label={"Evolução da mediana do lance livre do grupo " + group.codigo} className="rounded-xl border border-[#B5A573]/35 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 md:px-5">
        <div>
          <h5 className="flex items-center gap-2 text-sm font-extrabold text-[#1E293F]">
            <BarChart3 className="h-4 w-4 text-[#A11C27]" /> Evolução da mediana do lance livre
          </h5>
          <p className="mt-1 text-xs text-slate-500">Histórico das últimas 12 assembleias registradas. Valores reais, sem estimativa de contemplação.</p>
        </div>
        <Button type="button" variant="outline" className="inline-flex items-center gap-2 border-rose-200 text-[#A11C27] hover:bg-rose-50" onClick={analyze} disabled={loading || !points.length || aiLoading || !!historyError}>
          {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {aiLoading ? "MAX analisando" : "Interpretar com MAX"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 p-4 md:grid-cols-4 md:gap-3 md:p-5">
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-semibold text-slate-500">Última mediana</p><p className="mt-1 text-xl font-black text-[#1E293F]">{loading ? "..." : pct(last?.value)}</p><p className="mt-1 text-[11px] text-slate-500">{dateBR(last?.date || null)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-semibold text-slate-500">Variação recente</p><p className="mt-1 flex items-center gap-1 text-lg font-black text-[#1E293F]">{delta != null && (delta > 0 ? <TrendingUp className="h-4 w-4 text-amber-600" /> : delta < 0 ? <TrendingDown className="h-4 w-4 text-emerald-600" /> : <Activity className="h-4 w-4" />)} {signed(delta)}</p><p className="mt-1 text-[11px] text-slate-500">Entre as duas últimas medianas disponíveis</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-semibold text-slate-500">Média histórica</p><p className="mt-1 text-xl font-black text-[#1E293F]">{pct(average)}</p><p className="mt-1 text-[11px] text-slate-500">Das medianas disponíveis</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-semibold text-slate-500">Histórico consultado</p><p className="mt-1 text-xl font-black text-[#1E293F]">{loading ? "..." : history.length}</p><p className="mt-1 text-[11px] text-slate-500">Assembleias registradas</p></div>
      </div>

      <div className="px-4 pb-5 md:px-5">
        {historyError ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{historyError}</p> :
          loading ? <p className="py-8 text-center text-xs text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando histórico…</p> :
          !points.length ? <p className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500">Ainda não existem medianas registradas para este grupo.</p> :
          <div className="rounded-xl border border-slate-100 bg-white px-1 py-4">
            <div className="h-[225px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows} margin={{ top: 12, right: 20, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 5" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} width={43} tickFormatter={(value: number) => value.toLocaleString("pt-BR") + "%"} domain={["dataMin - 5", "dataMax + 5"]} />
                  <Tooltip formatter={(value: number) => [pct(value), "Mediana LL"]} labelFormatter={(label: string) => "Assembleia: " + label} />
                  <Line type="monotone" dataKey="median" name="Mediana LL" stroke="#A11C27" strokeWidth={3} dot={{ r: 4, fill: "#A11C27", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        }
        {points.length > 0 && !loading && <p className="mt-2 text-[11px] text-slate-500">A mediana é baseada nas apurações cadastradas. O comportamento passado não determina o resultado da próxima assembleia.</p>}
        {aiText && <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/40 p-4"><h6 className="mb-2 flex items-center gap-2 text-xs font-bold text-[#A11C27]"><Sparkles className="h-4 w-4" /> Leitura do MAX</h6><p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{aiText}</p></div>}
        {aiError && <p role="status" className="mt-3 text-xs text-rose-800">{aiError}</p>}
      </div>
    </section>
  );
}
