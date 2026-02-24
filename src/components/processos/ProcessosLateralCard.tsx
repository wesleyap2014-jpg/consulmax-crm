import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ChevronRight, ClipboardList, AlertTriangle } from "lucide-react";

type ProcessType = "faturamento" | "transferencia_cota";

type Phase = {
  id: string;
  sla_kind: "days" | "hours";
  sla_days: number | null;
  sla_minutes: number | null;
};

type Proc = {
  id: string;
  type: ProcessType;
  status: "open" | "closed";
  current_phase_id: string | null;
  current_phase_started_at: string | null;
};

function addSlaToDate(phase: Phase | undefined, startedAtISO: string | null) {
  if (!phase || !startedAtISO) return null;
  const base = new Date(startedAtISO);

  if (phase.sla_kind === "days") {
    const days = Number(phase.sla_days ?? 0);
    return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  }
  const minutes = Number(phase.sla_minutes ?? 0);
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export default function ProcessosLateralCard() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<ProcessType, { open: number; overdue: number }>>({
    faturamento: { open: 0, overdue: 0 },
    transferencia_cota: { open: 0, overdue: 0 },
  });

  async function loadCounts() {
    setLoading(true);
    try {
      // 1) Fases (para SLA)
      const { data: phasesData, error: pErr } = await supabase
        .from("process_phases")
        .select("id, sla_kind, sla_days, sla_minutes, is_active")
        .eq("is_active", true);

      if (pErr) throw new Error(pErr.message);

      const phasesById: Record<string, Phase> = {};
      for (const p of (phasesData || []) as any[]) {
        phasesById[p.id] = {
          id: p.id,
          sla_kind: p.sla_kind,
          sla_days: p.sla_days,
          sla_minutes: p.sla_minutes,
        };
      }

      // 2) Buscar processos abertos (de forma paginada para não estourar)
      const all: Proc[] = [];
      const pageSize = 500;
      let from = 0;

      while (true) {
        const to = from + pageSize - 1;
        const { data: procs, error: prErr } = await supabase
          .from("processes")
          .select("id, type, status, current_phase_id, current_phase_started_at")
          .eq("status", "open")
          .range(from, to);

        if (prErr) throw new Error(prErr.message);

        const batch = (procs || []) as any as Proc[];
        all.push(...batch);

        if (batch.length < pageSize) break;
        from += pageSize;

        // “cinto de segurança”: evita carregar infinito caso algum dia tenha muita coisa
        if (from > 5000) break;
      }

      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);

      const calc = (type: ProcessType) => {
        const items = all.filter((x) => x.type === type);
        let overdue = 0;

        for (const it of items) {
          const phase = it.current_phase_id ? phasesById[it.current_phase_id] : undefined;
          const deadline = addSlaToDate(phase, it.current_phase_started_at);

          if (!deadline) continue;
          if (now.getTime() > deadline.getTime()) overdue += 1;
          // (Se no futuro você quiser “No dia” aqui pro card, dá pra contar também:
          // if (deadline >= todayStart && deadline <= todayEnd) { ... }
          void todayStart; void todayEnd;
        }

        return { open: items.length, overdue };
      };

      setCounts({
        faturamento: calc("faturamento"),
        transferencia_cota: calc("transferencia_cota"),
      });
    } catch {
      // silencioso (sem toast aqui para não poluir)
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCounts();
    const t = setInterval(loadCounts, 5 * 60 * 1000); // 5 min
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(
    () => [
      {
        type: "faturamento" as const,
        title: "Faturamento",
        subtitle: "Processos em andamento",
      },
      {
        type: "transferencia_cota" as const,
        title: "Transferência de Cota",
        subtitle: "Processos em andamento",
      },
    ],
    []
  );

  return (
    <Card className="border-slate-200/60 bg-white/60 backdrop-blur-md">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Processos
          </div>

          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
          ) : null}
        </div>

        <div className="mt-3 space-y-2">
          {rows.map((r) => {
            const c = counts[r.type];
            const overdue = c?.overdue ?? 0;
            const open = c?.open ?? 0;

            return (
              <button
                key={r.type}
                type="button"
                onClick={() => nav(`/processos?tab=${r.type}`)}
                className="w-full text-left rounded-md border border-slate-200 bg-white/70 hover:bg-white transition p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{r.title}</div>
                    <div className="text-xs text-slate-600">{r.subtitle}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {overdue > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-800">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {overdue}
                      </span>
                    ) : null}

                    <span className="inline-flex items-center text-xs px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-800">
                      {open}
                    </span>

                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-2 text-[11px] text-slate-500">
          Atrasados = SLA extrapolado (fase atual).
        </div>
      </CardContent>
    </Card>
  );
}
