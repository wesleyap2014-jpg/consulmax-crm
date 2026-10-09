import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Activity, BarChart3, BrainCircuit, CalendarDays, CircleAlert, Loader2, MessageSquareText, ShieldCheck, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MaxGroup = {
  id: string;
  administradora: string;
  segmento: string;
  codigo: string;
  participantes: number | null;
  prox_vencimento: string | null;
  prox_sorteio: string | null;
  prox_assembleia: string | null;
  modalidades: { key: string; label: string }[];
};

type AssemblyHistory = {
  date: string | null;
  fixed25_offers: number | null;
  fixed25_deliveries: number | null;
  fixed50_offers: number | null;
  fixed50_deliveries: number | null;
  ll_offers: number | null;
  ll_deliveries: number | null;
  ll_high: number | null;
  ll_low: number | null;
  median: number | null;
};

const value = (v: unknown): number | null => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const pct = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
function dateBR(v: string | null | undefined) {
  if (!v) return "—";
  const a = v.slice(0, 10).split("-");
  return a.length === 3 ? a[2] + "/" + a[1] + "/" + a[0] : v;
}
const rowMedian = (r: AssemblyHistory): number | null => {
  const m = value(r.median);
  if (m != null) return m;
  const high = value(r.ll_high), low = value(r.ll_low);
  return high == null || low == null ? null : (high + low) / 2;
};

export default function MaxGroupIntelligence({ groups, selectedId, onSelect }: {
  groups: MaxGroup[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [history, setHistory] = useState<AssemblyHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [thinking, setThinking] = useState(false);
  const [answer, setAnswer] = useState("");
  const [aiError, setAiError] = useState("");
  const selected = useMemo(() => groups.find(g => g.id === selectedId) || groups[0] || null, [groups, selectedId]);

  useEffect(() => {
    if (groups.length && !groups.some(g => g.id === selectedId)) onSelect(groups[0].id);
  }, [groups, selectedId, onSelect]);

  useEffect(() => {
    let active = true;
    setAnswer(""); setAiError(""); setHistory([]); setHistoryError(""); setLoading(false);
    if (!selected?.id || selected.id.startsWith("stub:")) return;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase.from("assembly_results")
        .select("date,fixed25_offers,fixed25_deliveries,fixed50_offers,fixed50_deliveries,ll_offers,ll_deliveries,ll_high,ll_low,median")
        .eq("group_id", selected.id).order("date", { ascending: false }).limit(12);
      if (!active) return;
      if (error) setHistoryError("Histórico indisponível para este grupo.");
      else setHistory((data || []).map((r: any) => ({
        date: r.date ?? null,
        fixed25_offers: value(r.fixed25_offers), fixed25_deliveries: value(r.fixed25_deliveries),
        fixed50_offers: value(r.fixed50_offers), fixed50_deliveries: value(r.fixed50_deliveries),
        ll_offers: value(r.ll_offers), ll_deliveries: value(r.ll_deliveries),
        ll_high: value(r.ll_high), ll_low: value(r.ll_low), median: value(r.median)
      })));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [selected?.id]);

  const medians = useMemo(() => [...history].reverse().map(r => ({ date: r.date, median: rowMedian(r) }))
    .filter((v): v is { date: string | null; median: number } => v.median != null), [history]);
  const lastMedian = history.length ? rowMedian(history[0]) : null;
  const delta = medians.length > 1 ? medians[medians.length - 1].median - medians[medians.length - 2].median : null;
  const average = medians.length ? medians.reduce((sum, v) => sum + v.median, 0) / medians.length : null;
  const isMaggi = selected?.administradora.toLowerCase().includes("maggi") || false;

  async function analyze() {
    if (!selected || thinking || loading || historyError) return;
    setThinking(true); setAnswer(""); setAiError("");
    try {
      const context = {
        grupo: selected.codigo, administradora: selected.administradora, segmento: selected.segmento,
        participantes: selected.participantes, modalidadesExibidas: selected.modalidades.map(v => v.label),
        datas: { vencimento: selected.prox_vencimento, sorteio: selected.prox_sorteio, assembleia: selected.prox_assembleia },
        regraLegada: isMaggi ? "Na Maggi os valores antigos fixed50 representam lance fixo 35%." : "fixed50 corresponde ao lance fixo 50%.",
        historico: history.map(r => ({
          data: r.date,
          livre: { ofertas: r.ll_offers, entregas: r.ll_deliveries, maior: r.ll_high, menor: r.ll_low, mediana: rowMedian(r) },
          fixo25: { ofertas: r.fixed25_offers, entregas: r.fixed25_deliveries },
          legadoFixed50: { ofertas: r.fixed50_offers, entregas: r.fixed50_deliveries }
        }))
      };
      const response = await fetch("/api/max-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "livre",
          prompt: "Você é MAX, analista técnico de assembleias da Consulmax. Analise somente os dados estruturados enviados. Responda em português com: leitura do histórico, tendência, alertas/limitações e próxima análise recomendada ao vendedor. Não invente números ou regulamentos, NÃO estime chance ou prazo de contemplação nem sugira lance garantido. Ignore modalidades não habilitadas nas recomendações. Se não houver histórico suficiente, deixe isso explícito. Os dados operacionais são somente leitura.",
          context
        })
      });
      const result = await response.json();
      if (!response.ok || typeof result?.answer !== "string" || !result.answer.trim()) throw new Error("MAX indisponível.");
      setAnswer(result.answer.trim());
    } catch {
      setAiError("O MAX está temporariamente indisponível. Os indicadores históricos continuam disponíveis abaixo.");
    } finally { setThinking(false); }
  }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="MAX — inteligência de contemplação">
    <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950 px-5 py-5 text-white md:px-7">
      <div className="absolute -right-12 -top-20 h-52 w-52 rounded-full bg-rose-600/15 blur-3xl pointer-events-none" />
      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/15 p-2.5"><BrainCircuit className="h-6 w-6 text-rose-200" /></div>
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-rose-200"><Sparkles className="h-3.5 w-3.5" /> MAX • Inteligência de contemplação</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight md:text-2xl">Entenda o comportamento do grupo</h2>
            <p className="mt-1 text-sm text-slate-300">Resultados reais, tendências e análise consultiva. Sem promessas de contemplação.</p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto xl:items-end">
          <div className="min-w-0 flex-1 xl:min-w-[230px]">
            <label className="mb-1 block text-xs text-slate-200" htmlFor="max-group-select">Grupo para análise</label>
            <select id="max-group-select" value={selected?.id || ""} onChange={e => onSelect(e.target.value)}
              disabled={!groups.length} className="h-10 w-full rounded-lg border border-white/20 bg-slate-800 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-rose-400">
              {!groups.length && <option value="">Sem grupos</option>}
              {groups.map(g => <option key={g.id} value={g.id}>{g.administradora} · {g.codigo} · {g.segmento}</option>)}
            </select>
          </div>
          <Button className="h-10 gap-2 bg-rose-600 text-white hover:bg-rose-700" disabled={!selected || loading || thinking || !!historyError} onClick={analyze}>
            {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {thinking ? "Analisando..." : "Analisar com MAX"}
          </Button>
        </div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4 md:p-5">
      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" /> Próx. assembleia</p>
        <p className="mt-1 text-lg font-bold text-slate-900">{dateBR(selected?.prox_assembleia)}</p>
        <p className="mt-1 text-xs text-slate-500">{selected ? "Grupo " + selected.codigo : "Selecione um grupo"}</p>
      </div>
      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><BarChart3 className="h-3.5 w-3.5" /> Mediana LL recente</p>
        <p className="mt-1 text-lg font-bold text-slate-900">{loading ? "..." : pct(lastMedian)}</p>
        <p className="mt-1 text-xs text-slate-500">Apuração {dateBR(history[0]?.date)}</p>
      </div>
      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><Activity className="h-3.5 w-3.5" /> Variação da mediana</p>
        <p className="mt-1 flex items-center gap-1 text-lg font-bold text-slate-900">
          {delta != null && (delta > 0 ? <TrendingUp className="h-4 w-4 text-amber-600" /> : delta < 0 ? <TrendingDown className="h-4 w-4 text-emerald-600" /> : null)}
          {delta == null ? "—" : (delta > 0 ? "+" : "") + delta.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " p.p."}
        </p>
        <p className="mt-1 text-xs text-slate-500">Entre as duas últimas medianas disponíveis</p>
      </div>
      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> Histórico consultado</p>
        <p className="mt-1 text-lg font-bold text-slate-900">{loading ? "..." : history.length} <span className="text-xs font-normal text-slate-500">assembleias</span></p>
        <p className="mt-1 text-xs text-slate-500">Até 12 últimos registros</p>
      </div>
    </div>
    <div className="grid gap-4 border-t border-slate-100 p-4 lg:grid-cols-[1fr_1.25fr] md:p-5">
      <div className="rounded-xl border border-slate-100 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Evolução da mediana do lance livre</h3>
        {historyError ? <p className="mt-3 text-xs text-rose-700" role="alert">{historyError}</p> :
         loading ? <p className="mt-3 text-xs text-slate-500">Carregando...</p> :
         medians.length === 0 ? <p className="mt-3 text-xs text-slate-500">Sem apuração suficiente para a evolução.</p> :
         <div className="mt-4 space-y-2.5">
           {medians.slice(-6).map((item, i) => <div key={String(item.date) + i} className="flex items-center gap-2.5 text-[11px]">
             <span className="w-14 shrink-0 text-slate-500">{dateBR(item.date).slice(0, 5)}</span>
             <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-rose-700 to-rose-400" style={{ width: Math.min(100, Math.max(0, item.median)) + "%" }} /></div>
             <span className="w-16 shrink-0 text-right font-semibold text-slate-800">{pct(item.median)}</span>
           </div>)}
           <p className="pt-1 text-[11px] text-slate-500">Média das medianas disponíveis: {pct(average)}. Não é limiar garantido.</p>
         </div>}
      </div>
      <div className="flex flex-col rounded-xl border border-rose-100 bg-rose-50/40 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MessageSquareText className="h-4 w-4 text-rose-700" /> Leitura do MAX</h3>
        {answer ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{answer}</p> :
         aiError ? <p className="mt-3 text-sm text-rose-700" role="alert">{aiError}</p> :
         <p className="mt-3 text-sm leading-relaxed text-slate-600">Escolha um grupo e clique em <strong>Analisar com MAX</strong> para interpretar as assembleias e receber pontos de atenção para a próxima estratégia comercial.</p>}
        <p className="mt-auto flex items-start gap-2 pt-4 text-[11px] text-slate-500"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />A análise não altera resultados, datas ou lances e não prevê contemplação.</p>
      </div>
    </div>
  </section>;
}
