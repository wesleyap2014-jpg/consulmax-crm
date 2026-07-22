alter table public.sim_bb_groups
  add column if not exists identity_key text;

update public.sim_bb_groups
set identity_key = case
  when grupo = '000000'
    then 'bb:' || segmento || ':provisorio:legado:' || id::text
  else 'bb:' || segmento || ':grupo:' || grupo
end
where identity_key is null or btrim(identity_key) = '';

alter table public.sim_bb_groups
  alter column identity_key set not null;

create unique index if not exists sim_bb_groups_identity_key_uidx
  on public.sim_bb_groups (identity_key);

comment on column public.sim_bb_groups.identity_key is
  'Identidade técnica estável do plano BB. Grupos 000000 usam a assinatura das regras do plano; grupos definitivos usam segmento e número.';
