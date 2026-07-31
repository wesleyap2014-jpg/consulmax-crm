alter table public.leads
  add column if not exists partner_id uuid,
  add column if not exists telefone_unique_key text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'leads_partner_id_fkey'
       and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_partner_id_fkey
      foreign key (partner_id)
      references public.partners(id)
      on delete set null
      not valid;
  end if;
end
$$;

alter table public.leads validate constraint leads_partner_id_fkey;

create index if not exists leads_partner_id_idx
  on public.leads (partner_id);

comment on column public.leads.partner_id is
  'Parceiro Amigo ou Institucional responsável pela indicação do lead.';

comment on column public.leads.telefone_unique_key is
  'Telefone canônico em padrão E.164, sem o sinal de mais, usado exclusivamente para impedir novos cadastros duplicados.';

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.lead_phone_key(p_phone text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  raw_phone text := btrim(coalesce(p_phone, ''));
  phone_digits text;
  phone_key text;
begin
  if raw_phone = '' then
    return null;
  end if;

  phone_digits := regexp_replace(raw_phone, '\D', '', 'g');

  if raw_phone like '+%' then
    phone_key := phone_digits;
  elsif phone_digits ~ '^55\d{10,11}$' then
    phone_key := phone_digits;
  elsif phone_digits ~ '^\d{10,11}$' then
    phone_key := '55' || phone_digits;
  else
    return null;
  end if;

  if phone_key !~ '^[1-9]\d{6,14}$' then
    return null;
  end if;

  return phone_key;
end;
$$;

revoke all on function private.lead_phone_key(text) from public, anon, authenticated;

with ranked_phones as (
  select
    id,
    private.lead_phone_key(telefone) as phone_key,
    row_number() over (
      partition by private.lead_phone_key(telefone)
      order by created_at nulls last, id
    ) as phone_rank
  from public.leads
)
update public.leads as lead
   set telefone_unique_key = case
     when ranked.phone_key is not null and ranked.phone_rank = 1 then ranked.phone_key
     else null
   end
  from ranked_phones as ranked
 where ranked.id = lead.id;

create unique index if not exists leads_telefone_unique_key_idx
  on public.leads (telefone_unique_key)
  where telefone_unique_key is not null;

create or replace function private.prepare_lead_phone_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  raw_phone text := btrim(coalesce(new.telefone, ''));
  phone_digits text;
begin
  if tg_op = 'UPDATE' and new.telefone is not distinct from old.telefone then
    return new;
  end if;

  if raw_phone = '' then
    raise exception using
      errcode = '23502',
      message = 'Telefone é obrigatório para novos leads.';
  end if;

  phone_digits := regexp_replace(raw_phone, '\D', '', 'g');

  if raw_phone like '+%' then
    new.telefone_unique_key := phone_digits;
  elsif phone_digits ~ '^55\d{10,11}$' then
    new.telefone_unique_key := phone_digits;
  elsif phone_digits ~ '^\d{10,11}$' then
    new.telefone_unique_key := '55' || phone_digits;
  else
    new.telefone_unique_key := null;
  end if;

  if new.telefone_unique_key is null
     or new.telefone_unique_key !~ '^[1-9]\d{6,14}$' then
    raise exception using
      errcode = '22023',
      message = 'Telefone inválido. Informe o país, DDD e número corretamente.';
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_lead_phone_key() from public, anon, authenticated;

drop trigger if exists leads_prepare_phone_key_trigger on public.leads;
create trigger leads_prepare_phone_key_trigger
before insert or update of telefone on public.leads
for each row execute function private.prepare_lead_phone_key();

create or replace function public.public_create_opportunity_v2(
  p_lead_id uuid,
  p_nome text,
  p_email text,
  p_telefone text,
  p_segmento text,
  p_vendedor_auth_id uuid,
  p_owner_auth_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id uuid;
  v_opportunity_id uuid;
  v_phone_key text;
  v_obs text;
begin
  if not exists (
    select 1 from public.users where auth_user_id = p_owner_auth_id
  ) then
    raise exception 'Owner com auth_user_id % não encontrado em public.users', p_owner_auth_id;
  end if;

  if not exists (
    select 1 from public.users where auth_user_id = p_vendedor_auth_id
  ) then
    raise exception 'Vendedor com auth_user_id % não encontrado em public.users', p_vendedor_auth_id;
  end if;

  if p_lead_id is not null then
    v_lead_id := p_lead_id;
  else
    v_phone_key := private.lead_phone_key(p_telefone);
    if v_phone_key is null then
      raise exception using
        errcode = '22023',
        message = 'Telefone inválido.';
    end if;

    select lead.id
      into v_lead_id
      from public.leads as lead
     where lead.telefone_unique_key = v_phone_key
     order by lead.created_at nulls last, lead.id
     limit 1;

    if v_lead_id is null then
      insert into public.leads (
        nome,
        email,
        telefone,
        origem,
        owner_id,
        created_at,
        updated_at
      )
      values (
        p_nome,
        nullif(lower(btrim(p_email)), ''),
        p_telefone,
        'site_public_simulator',
        p_owner_auth_id,
        now(),
        now()
      )
      returning id into v_lead_id;
    end if;
  end if;

  v_obs := format(
    '[%s] Pré-cadastro via site público',
    to_char(now(), 'DD/MM/YYYY, HH24:MI:SS')
  );

  insert into public.opportunities (
    lead_id,
    vendedor_id,
    owner_id,
    segmento,
    estagio,
    stage,
    score,
    observacao,
    created_at,
    updated_at,
    stage_changed_at
  )
  values (
    v_lead_id,
    p_vendedor_auth_id,
    p_owner_auth_id,
    p_segmento,
    'Novo',
    'novo',
    1,
    v_obs,
    now(),
    now(),
    now()
  )
  returning id into v_opportunity_id;

  return v_opportunity_id;
end;
$$;

revoke all on function public.public_create_opportunity_v2(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  uuid
) from public;

grant execute on function public.public_create_opportunity_v2(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  uuid
) to anon, authenticated, service_role;
