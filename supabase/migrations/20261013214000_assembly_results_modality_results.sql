-- Resultados de modalidades configuráveis por grupo, preservando colunas legadas
-- (LL, fixo 25% e fixed50, que representa 35% nos grupos Maggi legados).
alter table public.assembly_results
  add column if not exists modality_results jsonb not null default '{}'::jsonb;
comment on column public.assembly_results.modality_results is
  'Ofertas e entregas por chave de modalidade habilitada no grupo. Compatível com colunas históricas legadas.';
