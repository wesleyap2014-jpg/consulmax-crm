-- Qualificação estruturada das oportunidades
-- CRM Consulmax • respostas do roteiro comercial e campos preparados para scoring

alter table public.opportunities
  add column if not exists qualification_data jsonb,
  add column if not exists qualification_score integer,
  add column if not exists qualification_status text,
  add column if not exists qualified_at timestamptz;

comment on column public.opportunities.qualification_data is 'Respostas estruturadas da qualificação comercial do lead.';
comment on column public.opportunities.qualification_score is 'Pontuação de qualificação de 0 a 25, quando a regra de scoring estiver ativa.';
comment on column public.opportunities.qualification_status is 'Classificação derivada da qualificação, como frio, morno ou quente.';
comment on column public.opportunities.qualified_at is 'Data e hora da última qualificação concluída.';
