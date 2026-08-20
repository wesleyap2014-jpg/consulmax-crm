import React, { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";

type ActivityItem = {
  id: string;
  at: string;
  label: string;
  helper?: string;
};

function formatDateBR(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function SectionTitle() {
  return (
    <CardTitle className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#A11C27]/10 text-[#A11C27]">
        <Activity className="h-4 w-4" />
      </span>
      Atividade do Usuário
    </CardTitle>
  );
}

async function simulationActivities(leadIds: string[]) {
  if (!leadIds.length) return [] as ActivityItem[];
  const chunks: string[][] = [];
  for (let i = 0; i < leadIds.length; i += 80) chunks.push(leadIds.slice(i, i + 80));
  const responses = await Promise.all(
    chunks.map((ids) =>
      supabase
        .from("sim_simulations")
        .select("id,created_at")
        .in("lead_id", ids)
        .order("created_at", { ascending: false })
        .limit(30),
    ),
  );
  return responses.flatMap((response) =>
    response.error
      ? []
      : (response.data || []).map((row: any) => ({
          id: `sim-${row.id}`,
          at: row.created_at,
          label: "Salvou uma simulação",
          helper: "Simuladores",
        })),
  );
}

export default function UserActivityFeed({ userId }: { userId: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: user, error: userError } = await supabase
          .from("users")
          .select("auth_user_id")
          .eq("id", userId)
          .maybeSingle();
        if (userError) throw userError;
        const authUserId = user?.auth_user_id;
        if (!authUserId) return;

        const [leadsRes, opportunitiesRes, salesRes, attendanceRes] = await Promise.all([
          supabase
            .from("leads")
            .select("id,created_at")
            .eq("owner_id", authUserId)
            .order("created_at", { ascending: false })
            .limit(60),
          supabase
            .from("opportunities")
            .select("id,created_at,qualified_at,won_at,lost_at")
            .eq("vendedor_id", authUserId)
            .order("created_at", { ascending: false })
            .limit(60),
          supabase
            .from("vendas")
            .select("id,created_at,data_venda")
            .eq("vendedor_id", authUserId)
            .order("created_at", { ascending: false })
            .limit(40),
          supabase
            .from("agenda_event_attendance")
            .select("id,event_id,attended_at")
            .eq("user_id", userId)
            .order("attended_at", { ascending: false })
            .limit(40),
        ]);

        const leadRows = leadsRes.error ? [] : (leadsRes.data || []);
        const simItems = await simulationActivities(leadRows.map((row: any) => row.id));
        const timeline: ActivityItem[] = [
          ...leadRows.map((row: any) => ({
            id: `lead-${row.id}`,
            at: row.created_at,
            label: "Cadastrou novo lead",
            helper: "Oportunidades",
          })),
          ...(opportunitiesRes.error ? [] : (opportunitiesRes.data || []).flatMap((row: any) => {
            const result: ActivityItem[] = [
              { id: `opp-${row.id}`, at: row.created_at, label: "Cadastrou nova oportunidade", helper: "Oportunidades" },
            ];
            if (row.qualified_at) result.push({ id: `qual-${row.id}`, at: row.qualified_at, label: "Realizou a qualificação de um lead", helper: "Oportunidades" });
            if (row.won_at) result.push({ id: `won-${row.id}`, at: row.won_at, label: "Finalizou um lead como ganho", helper: "Oportunidades" });
            if (row.lost_at) result.push({ id: `lost-${row.id}`, at: row.lost_at, label: "Finalizou um lead como perdido", helper: "Oportunidades" });
            return result;
          })),
          ...(salesRes.error ? [] : (salesRes.data || []).map((row: any) => ({
            id: `sale-${row.id}`,
            at: row.created_at || `${row.data_venda}T12:00:00`,
            label: "Realizou uma venda",
            helper: "Vendas",
          }))),
          ...(attendanceRes.error ? [] : (attendanceRes.data || []).map((row: any) => ({
            id: `attendance-${row.id}`,
            at: row.attended_at,
            label: "Participou de uma reunião / treinamento",
            helper: "Agenda",
          }))),
          ...simItems,
        ].filter((item) => Boolean(item.at));

        timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
        if (!cancelled) setItems(timeline.slice(0, 20));
      } catch (e) {
        console.warn("[UserActivityFeed]", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <Card className="bg-white/95 xl:col-span-4">
      <CardHeader className="pb-2"><SectionTitle /></CardHeader>
      <CardContent>
        <div className="max-h-[320px] space-y-0 overflow-auto pr-1">
          {loading ? <div className="py-8 text-center text-sm text-slate-500">Carregando atividades…</div> : null}
          {!loading && items.length ? items.map((item, index) => (
            <div key={item.id} className="relative flex gap-3 pb-4">
              {index < items.length - 1 ? <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" /> : null}
              <span className="relative mt-1 h-4 w-4 shrink-0 rounded-full border-4 border-white bg-[#A11C27] shadow" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800">{item.label}</div>
                <div className="text-xs text-slate-500">{item.helper || "CRM"} • {formatDateBR(item.at)}</div>
              </div>
            </div>
          )) : null}
          {!loading && !items.length ? <div className="py-8 text-center text-sm text-slate-500">Nenhuma atividade disponível para exibição.</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
