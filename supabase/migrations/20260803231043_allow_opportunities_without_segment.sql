set local lock_timeout = '5s';

alter table public.opportunities
  alter column segmento drop not null;

comment on column public.opportunities.segmento is
  'Segmento definido durante a qualificacao; pode permanecer nulo na criacao do lead e da oportunidade.';
