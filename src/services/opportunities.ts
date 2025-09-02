import { supabase } from "@/lib/supabaseClient";

export type Stage =
  | "novo"
  | "qualificando"
  | "proposta"
  | "negociacao"
  | "fechado_ganho"
  | "fechado_perdido";

export async function updateOpportunityStage(id: string, newStage: Stage) {
  const { data, error } = await supabase.rpc("update_opportunity_stage", {
    p_id: id,
    p_new_stage: newStage,
  });
  if (error) throw error;
  return data?.[0]; // a função retorna uma linha
}

export const stageLabels: Record<Stage, string> = {
  novo: "Novo",
  qualificando: "Qualificação",
  proposta: "Proposta",
  negociacao: "Negociação",
  fechado_ganho: "Convertido",
  fechado_perdido: "Perdido",
};

export const stages: Stage[] = [
  "novo",
  "qualificando",
  "proposta",
  "negociacao",
  "fechado_ganho",
  "fechado_perdido",
];
