import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

// KPI por estágio
export async function getKpiByStage() {
  const { data, error } = await supabase
    .from("vw_kpi_opportunities_by_stage")
    .select("*")
    .order("stage", { ascending: true });
  if (error) throw error;
  return data;
}

// KPI por estágio e vendedor
export async function getKpiByStageOwner() {
  const { data, error } = await supabase
    .from("vw_kpi_opportunities_by_stage_owner")
    .select("*")
    .not("owner_nome", "is", null)
    .order("owner_nome", { ascending: true })
    .order("stage", { ascending: true });
  if (error) throw error;
  return data;
}

// KPI por mês
export async function getKpiByStageMonth() {
  const { data, error } = await supabase
    .from("vw_kpi_opportunities_by_stage_month")
    .select("*")
    .order("month_start", { ascending: false })
    .order("stage", { ascending: true });
  if (error) throw error;
  return data;
}

// Snapshot mensal (materialized view)
export async function refreshAndGetMonthlySnapshot() {
  const { error: refreshErr } = await supabase.rpc("refresh_mv_kpi_stage_month", { p_concurrently: true });
  if (refreshErr) throw refreshErr;

  const { data, error } = await supabase
    .from("mv_kpi_opportunities_by_stage_month")
    .select("*")
    .order("month_start", { ascending: false })
    .order("stage", { ascending: true });
  if (error) throw error;
  return data;
}
