-- Qualificação comercial com score objetivo e análise por IA

alter table public.opportunities
  add column if not exists qualification_breakdown jsonb,
  add column if not exists qualification_ai_analysis jsonb,
  add column if not exists qualification_analyzed_at timestamptz;
