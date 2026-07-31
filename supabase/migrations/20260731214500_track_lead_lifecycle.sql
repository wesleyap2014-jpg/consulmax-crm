-- Registra o ciclo de vida dos leads para medir o tempo entre entrada e finalização.

alter table public.leads
  alter column created_at set default now(),
  alter column created_at set not null;

create table if not exists public.lead_lifecycle (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  registered_at timestamptz not null,
  finalized_at timestamptz,
  outcome text,
  updated_at timestamptz not null default now(),
  constraint lead_lifecycle_outcome_check
    check (outcome is null or outcome in ('convertido', 'descartado')),
  constraint lead_lifecycle_finalization_check
    check (
      (outcome is null and finalized_at is null)
      or (outcome is not null and finalized_at is not null)
    ),
  constraint lead_lifecycle_dates_check
    check (finalized_at is null or finalized_at >= registered_at)
);

create index if not exists lead_lifecycle_finalized_idx
  on public.lead_lifecycle (outcome, finalized_at)
  where finalized_at is not null;

alter table public.lead_lifecycle enable row level security;

revoke all on table public.lead_lifecycle from public, anon, authenticated;
grant select on table public.lead_lifecycle to authenticated;
grant all on table public.lead_lifecycle to service_role;

drop policy if exists lead_lifecycle_select_visible on public.lead_lifecycle;
create policy lead_lifecycle_select_visible
on public.lead_lifecycle
for select
to authenticated
using (
  exists (
    select 1
    from public.leads
    where leads.id = lead_lifecycle.lead_id
  )
);

create or replace function private.capture_lead_registered_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_lead_registered_at() from public, anon, authenticated;

drop trigger if exists leads_capture_registered_at_trigger on public.leads;
create trigger leads_capture_registered_at_trigger
before insert or update of created_at on public.leads
for each row execute function private.capture_lead_registered_at();

create or replace function private.seed_lead_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lead_lifecycle (
    lead_id,
    registered_at,
    finalized_at,
    outcome,
    updated_at
  )
  values (
    new.id,
    new.created_at,
    null,
    null,
    now()
  )
  on conflict (lead_id) do nothing;

  return new;
end;
$$;

revoke all on function private.seed_lead_lifecycle() from public, anon, authenticated;

drop trigger if exists leads_seed_lifecycle_trigger on public.leads;
create trigger leads_seed_lifecycle_trigger
after insert on public.leads
for each row execute function private.seed_lead_lifecycle();

create or replace function private.capture_opportunity_close_times()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estagio = 'Fechado (Ganho)' then
    if tg_op = 'INSERT' then
      new.won_at := now();
    elsif old.estagio is distinct from new.estagio then
      new.won_at := now();
    end if;
    new.lost_at := null;
  elsif new.estagio = 'Fechado (Perdido)' then
    if tg_op = 'INSERT' then
      new.lost_at := now();
    elsif old.estagio is distinct from new.estagio then
      new.lost_at := now();
    end if;
    new.won_at := null;
  else
    new.won_at := null;
    new.lost_at := null;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_opportunity_close_times() from public, anon, authenticated;

drop trigger if exists opportunities_capture_close_times_trigger on public.opportunities;
create trigger opportunities_capture_close_times_trigger
before insert or update of estagio on public.opportunities
for each row execute function private.capture_opportunity_close_times();

create or replace function private.prepare_sale_conversion_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'encarteirada' then
    if new.encarteirada_em is null then
      new.encarteirada_em := now();
    end if;
  else
    new.encarteirada_em := null;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_sale_conversion_time() from public, anon, authenticated;

drop trigger if exists vendas_prepare_conversion_time_trigger on public.vendas;
create trigger vendas_prepare_conversion_time_trigger
before insert or update of status, encarteirada_em on public.vendas
for each row execute function private.prepare_sale_conversion_time();

create or replace function private.refresh_lead_lifecycle(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registered_at timestamptz;
  v_converted_at timestamptz;
  v_discarded_at timestamptz;
  v_opportunity_count bigint;
  v_all_opportunities_lost boolean;
begin
  if p_lead_id is null then
    return;
  end if;

  select leads.created_at
    into v_registered_at
  from public.leads
  where leads.id = p_lead_id;

  if not found then
    return;
  end if;

  select min(vendas.encarteirada_em)
    into v_converted_at
  from public.vendas
  where coalesce(vendas.lead_id, vendas.cliente_lead_id) = p_lead_id
    and vendas.status = 'encarteirada'
    and vendas.encarteirada_em is not null
    and vendas.encarteirada_em >= v_registered_at;

  select
    count(*),
    bool_and(opportunities.estagio = 'Fechado (Perdido)'),
    max(opportunities.lost_at)
  into
    v_opportunity_count,
    v_all_opportunities_lost,
    v_discarded_at
  from public.opportunities
  where opportunities.lead_id = p_lead_id;

  insert into public.lead_lifecycle (
    lead_id,
    registered_at,
    finalized_at,
    outcome,
    updated_at
  )
  values (
    p_lead_id,
    v_registered_at,
    case
      when v_converted_at is not null then v_converted_at
      when v_opportunity_count > 0
        and v_all_opportunities_lost
        and v_discarded_at is not null
        then v_discarded_at
      else null
    end,
    case
      when v_converted_at is not null then 'convertido'
      when v_opportunity_count > 0
        and v_all_opportunities_lost
        and v_discarded_at is not null
        then 'descartado'
      else null
    end,
    now()
  )
  on conflict (lead_id) do update
  set registered_at = excluded.registered_at,
      finalized_at = excluded.finalized_at,
      outcome = excluded.outcome,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function private.refresh_lead_lifecycle(uuid) from public, anon, authenticated;

create or replace function private.sync_opportunity_lead_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_lead_lifecycle(old.lead_id);
  elsif tg_op = 'INSERT' then
    perform private.refresh_lead_lifecycle(new.lead_id);
  else
    perform private.refresh_lead_lifecycle(old.lead_id);
    if new.lead_id is distinct from old.lead_id then
      perform private.refresh_lead_lifecycle(new.lead_id);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function private.sync_opportunity_lead_lifecycle() from public, anon, authenticated;

drop trigger if exists opportunities_sync_lead_lifecycle_trigger on public.opportunities;
create trigger opportunities_sync_lead_lifecycle_trigger
after insert or delete or update of estagio, lead_id, won_at, lost_at
on public.opportunities
for each row execute function private.sync_opportunity_lead_lifecycle();

create or replace function private.sync_sale_lead_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_lead_id uuid;
  v_new_lead_id uuid;
begin
  if tg_op = 'DELETE' then
    v_old_lead_id := coalesce(old.lead_id, old.cliente_lead_id);
    perform private.refresh_lead_lifecycle(v_old_lead_id);
  elsif tg_op = 'INSERT' then
    v_new_lead_id := coalesce(new.lead_id, new.cliente_lead_id);
    perform private.refresh_lead_lifecycle(v_new_lead_id);
  else
    v_old_lead_id := coalesce(old.lead_id, old.cliente_lead_id);
    v_new_lead_id := coalesce(new.lead_id, new.cliente_lead_id);
    perform private.refresh_lead_lifecycle(v_old_lead_id);
    if v_new_lead_id is distinct from v_old_lead_id then
      perform private.refresh_lead_lifecycle(v_new_lead_id);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function private.sync_sale_lead_lifecycle() from public, anon, authenticated;

drop trigger if exists vendas_sync_lead_lifecycle_trigger on public.vendas;
create trigger vendas_sync_lead_lifecycle_trigger
after insert or delete or update of status, encarteirada_em, lead_id, cliente_lead_id
on public.vendas
for each row execute function private.sync_sale_lead_lifecycle();

insert into public.lead_lifecycle (
  lead_id,
  registered_at,
  finalized_at,
  outcome,
  updated_at
)
select
  leads.id,
  leads.created_at,
  null,
  null,
  now()
from public.leads
on conflict (lead_id) do nothing;

comment on table public.lead_lifecycle is
  'Marcos automáticos usados para medir o tempo entre o cadastro e a finalização de cada lead.';

comment on column public.lead_lifecycle.registered_at is
  'Data imutável de entrada do lead no CRM.';

comment on column public.lead_lifecycle.finalized_at is
  'Data em que o lead foi convertido ou descartado; nula enquanto estiver em andamento.';

comment on column public.lead_lifecycle.outcome is
  'Resultado atual da finalização: convertido ou descartado.';
