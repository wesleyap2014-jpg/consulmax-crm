-- Sala de Guerra Semanal: revisão sem destruir os 5W2H e playbooks históricos.
alter table public.weekly_plan_items
  add column if not exists review_outcome text,
  add column if not exists review_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists carried_from_item_id uuid;

alter table public.weekly_plans
  add column if not exists review_closed_at timestamptz;

alter table public.weekly_plan_items
  drop constraint if exists weekly_plan_items_review_outcome_check;
alter table public.weekly_plan_items
  add constraint weekly_plan_items_review_outcome_check
  check (review_outcome is null or review_outcome in ('realizado', 'parcial', 'nao_realizado'));

create unique index if not exists weekly_plan_items_one_carry_per_plan_idx
  on public.weekly_plan_items(plan_id, carried_from_item_id)
  where carried_from_item_id is not null;

-- Lista restrita dos colaboradores visíveis ao usuário autenticado.
-- Matriz/admin de nível geral: todos. Gestor filial: própria unidade. Vendedor: somente ele.
create or replace function public.sala_guerra_equipe()
returns table (id uuid, nome text, email text, user_role text)
language sql stable security definer
set search_path = ''
as $function$
  select u.id, u.nome, u.email, u.user_role
  from public.users u
  join public.users me on me.auth_user_id = auth.uid()
  where
    me.id = u.id
    or (me.hierarchy_level = 'gestor_filial' and me.unit_id is not null and me.unit_id = u.unit_id)
    or (me.user_role = 'admin' and coalesce(me.hierarchy_level, '') <> 'gestor_filial')
  order by case when u.id = me.id then 0 else 1 end, u.nome;
$function$;
revoke all on function public.sala_guerra_equipe() from public;
grant execute on function public.sala_guerra_equipe() to authenticated;

-- Consulta de equipe é somente leitura; as policies existentes continuam controlando gravações.
drop policy if exists weekly_plans_team_select_sala_guerra on public.weekly_plans;
create policy weekly_plans_team_select_sala_guerra on public.weekly_plans
  for select to authenticated
  using (user_id in (select e.id from public.sala_guerra_equipe() e));

drop policy if exists weekly_plan_items_team_select_sala_guerra on public.weekly_plan_items;
create policy weekly_plan_items_team_select_sala_guerra on public.weekly_plan_items
  for select to authenticated
  using (exists (
    select 1 from public.weekly_plans w where w.id = weekly_plan_items.plan_id
  ));

comment on column public.weekly_plan_items.review_outcome is
  'Resultado da revisão semanal: realizado, parcial ou nao_realizado; null indica não revisado.';
comment on column public.weekly_plans.review_closed_at is
  'Data/hora em que o responsável encerrou a revisão da semana.';
