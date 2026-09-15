create or replace function private.prepare_lead_phone_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  raw_phone text := btrim(coalesce(new.telefone, ''));
  phone_digits text;
  phone_key text;
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
    phone_key := phone_digits;
  elsif phone_digits ~ '^55\d{10,11}$' then
    phone_key := phone_digits;
  elsif phone_digits ~ '^\d{10,11}$' then
    phone_key := '55' || phone_digits;
  else
    phone_key := null;
  end if;

  if phone_key is null
     or phone_key !~ '^[1-9]\d{6,14}$' then
    raise exception using
      errcode = '22023',
      message = 'Telefone inválido. Informe o país, DDD e número corretamente.';
  end if;

  -- A chave única existe para impedir NOVOS leads duplicados. Em uma edição
  -- de lead já existente, pode haver telefone legitimamente compartilhado por
  -- cadastros históricos. Preservamos o registro que já detém a chave e
  -- deixamos o lead editado sem telefone_unique_key, como no saneamento
  -- original das duplicidades pré-existentes.
  if tg_op = 'UPDATE' and exists (
    select 1
      from public.leads as other_lead
     where other_lead.id <> new.id
       and other_lead.telefone_unique_key = phone_key
  ) then
    new.telefone_unique_key := null;
  else
    new.telefone_unique_key := phone_key;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_lead_phone_key() from public, anon, authenticated;
