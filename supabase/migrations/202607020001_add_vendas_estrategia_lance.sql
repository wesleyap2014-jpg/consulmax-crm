alter table public.vendas
  add column if not exists estrategia_lance jsonb;

comment on column public.vendas.estrategia_lance is
  'Estrategia de lance definida no lancamento da venda na Carteira, com administradora, opcoes e percentuais.';

create index if not exists vendas_estrategia_lance_gin
  on public.vendas
  using gin (estrategia_lance);
