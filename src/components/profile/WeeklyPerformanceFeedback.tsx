import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Gauge, Sparkles, Target } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FeedbackRow = {
  id: string;
  period_start: string;
  period_end: string;
  status: "strong" | "attention" | "action";
  discipline_score: number;
  metrics: any;
  alerts: string[];
  positives: string[];
  priorities: string[];
  max_analysis?: string | null;
  email_status: string;
  email_sent_at?: string | null;
  generated_at: string;
};

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function shortDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function statusMeta(status: FeedbackRow["status"]) {
  if (status === "strong") {
    return {
      label: "Ritmo forte",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
      panel: "border-emerald-200 bg-emerald-50/60",
    };
  }
  if (status === "action") {
    return {
      label: "Ação necessária",
      badge: "border-rose-200 bg-rose-50 text-rose-700",
      panel: "border-rose-200 bg-rose-50/60",
    };
  }
  return {
    label: "Atenção",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    panel: "border-amber-200 bg-amber-50/60",
  };
}

function MiniMetric({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-black text-slate-900">{value}</div>
      {helper ? <div className="mt-0.5 text-[11px] text-slate-500">{helper}</div> : null}
    </div>
  );
}

function Progress({ actual, goal, expected }: { actual: number; goal: number; expected: number }) {
  const actualPct = goal > 0 ? Math.max(0, Math.min(100, (actual / goal) * 100)) : 0;
  const expectedPct = goal > 0 ? Math.max(0, Math.min(100, (expected / goal) * 100)) : 0;
  return (
    <div>
      <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[#A11C27]" style={{ width: `${actualPct}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
        <span>Realizado {actualPct.toFixed(0)}%</span>
        <span>Esperado até agora {expectedPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function FeedbackDetails({ row }: { row: FeedbackRow }) {
  const metrics = row.metrics || {};
  const week = metrics.week || {};
  const month = metrics.month || {};
  const year = metrics.year || {};
  const pipeline = metrics.pipeline || {};
  const components = metrics.components || {};

  return (
    <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-4 md:px-5">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MiniMetric label="Vendas" value={brl(week.salesAmount || 0)} helper={`${week.salesCount || 0} venda(s)`} />
        <MiniMetric label="Simulações" value={week.simulations || 0} />
        <MiniMetric label="Prospecções" value={week.prospections || 0} />
        <MiniMetric label="Qualificações" value={week.qualifications || 0} />
        <MiniMetric label="Reuniões" value={week.meetings || 0} />
        <MiniMetric label="Abordagens" value={week.approaches || 0} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Meta mensal</div>
              <div className="mt-1 text-lg font-black text-slate-900">
                {brl(month.actual || 0)} <span className="text-xs font-semibold text-slate-500">de {brl(month.goal || 0)}</span>
              </div>
            </div>
            <div className="text-right text-xs font-bold text-[#A11C27]">Esperado {brl(month.expected || 0)}</div>
          </div>
          <div className="mt-3">
            <Progress actual={month.actual || 0} goal={month.goal || 0} expected={month.expected || 0} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Meta anual</div>
              <div className="mt-1 text-lg font-black text-slate-900">
                {brl(year.actual || 0)} <span className="text-xs font-semibold text-slate-500">de {brl(year.goal || 0)}</span>
              </div>
            </div>
            <div className="text-right text-xs font-bold text-[#A11C27]">Esperado {brl(year.expected || 0)}</div>
          </div>
          <div className="mt-3">
            <Progress actual={year.actual || 0} goal={year.goal || 0} expected={year.expected || 0} />
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <MiniMetric label="Oportunidades reais" value={pipeline.realCount || 0} helper={brl(pipeline.realValue || 0)} />
        <MiniMetric label="Follow-ups atrasados" value={pipeline.overdueFollowups || 0} />
        <MiniMetric label="Sem próxima ação" value={pipeline.missingNextAction || 0} />
        <MiniMetric label="Paradas +7 dias" value={pipeline.staleOpen || 0} />
        <MiniMetric label="Alto potencial atrasado" value={pipeline.highPotentialOverdue || 0} />
        <MiniMetric label="Conversas paradas" value={pipeline.staleConversations || 0} />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-[10px] font-bold uppercase text-slate-500">Follow-up</div>
          <div className="mt-1 text-xl font-black text-slate-900">{Math.round(components.followup || 0)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-[10px] font-bold uppercase text-slate-500">Higiene do funil</div>
          <div className="mt-1 text-xl font-black text-slate-900">{Math.round(components.pipelineHygiene || 0)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-[10px] font-bold uppercase text-slate-500">Qualificação</div>
          <div className="mt-1 text-xl font-black text-slate-900">{Math.round(components.qualification || 0)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-[10px] font-bold uppercase text-slate-500">Atividade</div>
          <div className="mt-1 text-xl font-black text-slate-900">{Math.round(components.activityConsistency || 0)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-[10px] font-bold uppercase text-slate-500">Ritmo de resultado</div>
          <div className="mt-1 text-xl font-black text-slate-900">{Math.round(components.resultPace || 0)}</div>
        </div>
      </div>

      <div className="rounded-xl border-l-4 border-l-[#A11C27] border-y border-r border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <Sparkles className="h-4 w-4 text-[#A11C27]" /> Análise do Max
        </div>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{row.max_analysis || "Análise indisponível."}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex items-center gap-2 text-sm font-extrabold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Pontos positivos
          </div>
          <div className="mt-2 space-y-1.5 text-sm text-slate-700">
            {(row.positives || []).length ? row.positives.map((item) => <div key={item}>• {item}</div>) : <div>Nenhum destaque registrado.</div>}
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-center gap-2 text-sm font-extrabold text-amber-800">
            <AlertTriangle className="h-4 w-4" /> Sinais de atenção
          </div>
          <div className="mt-2 space-y-1.5 text-sm text-slate-700">
            {(row.alerts || []).length ? row.alerts.map((item) => <div key={item}>• {item}</div>) : <div>Nenhum alerta relevante.</div>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <Target className="h-4 w-4 text-[#A11C27]" /> Foco para a próxima semana
        </div>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
          {(row.priorities || []).map((item) => <li key={item}>{item}</li>)}
        </ol>
      </div>
    </div>
  );
}

export default function WeeklyPerformanceFeedback({ authUserId }: { authUserId?: string | null }) {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!authUserId) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("weekly_performance_feedbacks")
        .select("id,period_start,period_end,status,discipline_score,metrics,alerts,positives,priorities,max_analysis,email_status,email_sent_at,generated_at")
        .eq("auth_user_id", authUserId)
        .order("period_end", { ascending: false })
        .limit(12);

      if (!mounted) return;
      if (error) {
        console.error("[WeeklyPerformanceFeedback]", error);
        setRows([]);
      } else {
        const list = (data || []) as FeedbackRow[];
        setRows(list);
        setOpenId((current) => current || list[0]?.id || null);
      }
      setLoading(false);
    }
    load();
    return () => {
      mounted = false;
    };
  }, [authUserId]);

  const latest = rows[0];
  const latestMeta = useMemo(() => (latest ? statusMeta(latest.status) : null), [latest]);

  return (
    <Card className="overflow-hidden border-[#A11C27]/20 bg-white/95">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base font-extrabold text-slate-900">
          <span className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#A11C27]/10 text-[#A11C27]">
              <Gauge className="h-4 w-4" />
            </span>
            Feedback semanal de performance
          </span>
          {latest && latestMeta ? (
            <Badge variant="outline" className={latestMeta.badge}>
              {latestMeta.label} · {latest.discipline_score}/100
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="px-5 pb-5 text-sm text-slate-500">Carregando feedbacks...</div>
        ) : !rows.length ? (
          <div className="px-5 pb-5">
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              O primeiro feedback será gerado automaticamente na sexta-feira. Ele vai cruzar atividade comercial, oportunidades, follow-ups, qualificação e ritmo de metas.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row, index) => {
              const meta = statusMeta(row.status);
              const open = openId === row.id;
              return (
                <div key={row.id} className={index === 0 ? meta.panel : "bg-white"}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : row.id)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left md:px-5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-slate-900">
                          {shortDate(row.period_start)} a {shortDate(row.period_end)}
                        </span>
                        <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
                        {row.email_status === "sent" ? <span className="text-[11px] font-semibold text-slate-500">enviado por e-mail</span> : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Disciplina comercial <strong className="text-slate-800">{row.discipline_score}/100</strong>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" type="button" className="shrink-0">
                      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </button>
                  {open ? <FeedbackDetails row={row} /> : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
