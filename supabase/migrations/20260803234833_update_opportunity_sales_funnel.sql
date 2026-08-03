alter table public.opportunities
  add column if not exists lost_destination text;

comment on column public.opportunities.lost_destination is
  'Destino após Fechado (Perdido): descartado ou nutricao.';

-- Perdas anteriores já eram contabilizadas como descarte. Mantemos esse
-- significado histórico sem inventar motivo, resumo ou data de encerramento.
update public.opportunities
set lost_destination = 'descartado'
where estagio = 'Fechado (Perdido)'
  and lost_destination is null;

alter table public.opportunities
  drop constraint if exists opportunities_estagio_check;

update public.opportunities
set estagio = case
  when estagio in ('Novo', 'Novo Lead') then 'Novo'
  when estagio = 'Contato em Andamento' then 'Contato em Andamento'
  when estagio in (
    'Qualificando',
    'Qualificação',
    'Qualificacao',
    'Qualificando/Diagnóstico',
    'Qualificação e Diagnóstico',
    'Reunião Agendada'
  ) then 'Qualificação e Diagnóstico'
  when estagio in ('Proposta', 'Proposta Apresentada') then 'Proposta Apresentada'
  when estagio in (
    'Negociação',
    'Negociacao',
    'Proposta Apresentada/Negociação',
    'Negociação e Follow-up'
  ) then 'Negociação e Follow-up'
  when estagio in (
    'Fechamento Programado/Aguardando Documentos',
    'Fechamento e Documentação'
  ) then 'Fechamento e Documentação'
  else estagio
end
where estagio in (
  'Novo Lead',
  'Qualificando',
  'Qualificação',
  'Qualificacao',
  'Qualificando/Diagnóstico',
  'Reunião Agendada',
  'Proposta',
  'Negociação',
  'Negociacao',
  'Proposta Apresentada/Negociação',
  'Fechamento Programado/Aguardando Documentos'
);

alter table public.opportunities
  add constraint opportunities_estagio_check
  check (
    estagio in (
      'Novo',
      'Contato em Andamento',
      'Qualificação e Diagnóstico',
      'Proposta Apresentada',
      'Negociação e Follow-up',
      'Fechamento e Documentação',
      'Fechado (Ganho)',
      'Fechado (Perdido)'
    )
  );

alter table public.opportunities
  drop constraint if exists opportunities_lost_destination_check;

alter table public.opportunities
  add constraint opportunities_lost_destination_check
  check (
    (
      estagio = 'Fechado (Perdido)'
      and lost_destination in ('descartado', 'nutricao')
    )
    or (
      estagio <> 'Fechado (Perdido)'
      and lost_destination is null
    )
  );

create or replace function private.capture_opportunity_close_times()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estagio = 'Fechado (Ganho)' then
    if tg_op = 'INSERT' or old.estagio is distinct from new.estagio then
      new.won_at := now();
    end if;
    new.lost_at := null;
    new.lost_destination := null;
    new.lost_reason := null;
    new.lost_details := null;
  elsif new.estagio = 'Fechado (Perdido)' then
    if new.lost_destination is null then
      raise exception using
        errcode = '23514',
        message = 'Selecione o destino do lead: descartado ou nutrição.';
    end if;

    if new.lost_destination = 'descartado' then
      if nullif(btrim(coalesce(new.lost_reason, '')), '') is null then
        raise exception using
          errcode = '23514',
          message = 'Informe o motivo da perda.';
      end if;
      if nullif(btrim(coalesce(new.lost_details, '')), '') is null then
        raise exception using
          errcode = '23514',
          message = 'Informe um resumo do motivo da perda.';
      end if;
    else
      new.lost_reason := null;
      new.lost_details := null;
    end if;

    if tg_op = 'INSERT' or old.estagio is distinct from new.estagio then
      new.lost_at := now();
    end if;
    new.won_at := null;
  else
    new.won_at := null;
    new.lost_at := null;
    new.lost_destination := null;
    new.lost_reason := null;
    new.lost_details := null;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_opportunity_close_times()
  from public, anon, authenticated;

drop trigger if exists opportunities_capture_close_times_trigger
  on public.opportunities;

create trigger opportunities_capture_close_times_trigger
before insert or update of estagio, lost_destination, lost_reason, lost_details
on public.opportunities
for each row execute function private.capture_opportunity_close_times();

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
  v_all_opportunities_discarded boolean;
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

  select min(conversions.converted_at)
    into v_converted_at
  from (
    select opportunities.won_at as converted_at
    from public.opportunities
    where opportunities.lead_id = p_lead_id
      and opportunities.estagio = 'Fechado (Ganho)'
      and opportunities.won_at is not null

    union all

    select vendas.encarteirada_em as converted_at
    from public.vendas
    where coalesce(vendas.lead_id, vendas.cliente_lead_id) = p_lead_id
      and vendas.status = 'encarteirada'
      and vendas.encarteirada_em is not null
  ) as conversions
  where conversions.converted_at >= v_registered_at;

  select
    count(*),
    bool_and(
      opportunities.estagio = 'Fechado (Perdido)'
      and opportunities.lost_destination = 'descartado'
    ),
    max(opportunities.lost_at) filter (
      where opportunities.estagio = 'Fechado (Perdido)'
        and opportunities.lost_destination = 'descartado'
    )
  into
    v_opportunity_count,
    v_all_opportunities_discarded,
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
        and v_all_opportunities_discarded
        and v_discarded_at is not null
        then v_discarded_at
      else null
    end,
    case
      when v_converted_at is not null then 'convertido'
      when v_opportunity_count > 0
        and v_all_opportunities_discarded
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

revoke all on function private.refresh_lead_lifecycle(uuid)
  from public, anon, authenticated;

drop trigger if exists opportunities_sync_lead_lifecycle_trigger
  on public.opportunities;

create trigger opportunities_sync_lead_lifecycle_trigger
after insert or delete or update of
  estagio,
  lead_id,
  won_at,
  lost_at,
  lost_destination
on public.opportunities
for each row execute function private.sync_opportunity_lead_lifecycle();

comment on column public.opportunities.won_at is
  'Data automática de conversão ao entrar em Fechado (Ganho).';
