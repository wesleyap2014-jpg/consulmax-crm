-- Código público e sequencial para facilitar a identificação das oportunidades no histórico.

create sequence if not exists public.opportunity_code_seq
  start with 1
  increment by 1;

alter table public.opportunities
  add column if not exists codigo text;

alter table public.opportunities
  alter column codigo set default (
    'OP-' || lpad(nextval('public.opportunity_code_seq')::text, 6, '0')
  );

update public.opportunities
set codigo = 'OP-' || lpad(nextval('public.opportunity_code_seq')::text, 6, '0')
where codigo is null;

alter table public.opportunities
  alter column codigo set not null;

create unique index if not exists opportunities_codigo_uidx
  on public.opportunities (codigo);

comment on column public.opportunities.codigo is
  'Código público e sequencial da oportunidade, no formato OP-000001.';
