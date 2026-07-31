set local lock_timeout = '5s';

alter table public.partners
  add column pix_tipo text,
  add column pix_chave text,
  add constraint partners_pix_tipo_check
    check (pix_tipo in ('cpf_cnpj', 'email', 'telefone', 'aleatoria')),
  add constraint partners_pix_chave_by_type_check
    check (
      (pix_tipo is null and pix_chave is null)
      or (pix_tipo = 'cpf_cnpj' and pix_chave = cpf_cnpj)
      or (
        pix_tipo = 'email'
        and length(pix_chave) <= 320
        and pix_chave ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      )
      or (pix_tipo = 'telefone' and pix_chave ~ '^\+55\d{10,11}$')
      or (
        pix_tipo = 'aleatoria'
        and pix_chave ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
    ),
  add constraint partners_owner_pix_unique unique (created_by, pix_chave);

comment on column public.partners.pix_tipo is
  'Tipo da chave PIX: CPF/CNPJ, e-mail, telefone ou chave aleatoria.';
comment on column public.partners.pix_chave is
  'Chave PIX normalizada para pagamento de comissoes; protegida pela RLS da tabela.';

create or replace function public.partners_prepare_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_unit_id uuid;
  pix_phone_digits text;
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is null then
      raise exception 'Usuario nao autenticado.';
    end if;

    select u.unit_id
      into actor_unit_id
      from public.users u
     where u.auth_user_id = (select auth.uid())
       and coalesce(u.is_active, true) = true
     limit 1;

    if not found then
      raise exception 'Usuario ativo do CRM nao encontrado.';
    end if;

    new.created_by := (select auth.uid());
    new.unit_id := actor_unit_id;
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.unit_id := old.unit_id;
    new.created_at := old.created_at;
  end if;

  new.nome := btrim(new.nome);
  new.telefone := regexp_replace(new.telefone, '\D', '', 'g');
  new.email := lower(btrim(new.email));
  new.cpf_cnpj := regexp_replace(new.cpf_cnpj, '\D', '', 'g');

  if new.pix_tipo is null
    or nullif(btrim(new.pix_tipo), '') is null
    or new.pix_chave is null
    or nullif(btrim(new.pix_chave), '') is null
  then
    raise exception 'Chave PIX obrigatoria.';
  end if;

  new.pix_tipo := lower(btrim(new.pix_tipo));

  if new.pix_tipo = 'cpf_cnpj' then
    new.pix_chave := new.cpf_cnpj;
  elsif new.pix_tipo = 'email' then
    new.pix_chave := lower(btrim(new.pix_chave));
  elsif new.pix_tipo = 'telefone' then
    pix_phone_digits := regexp_replace(new.pix_chave, '\D', '', 'g');
    if length(pix_phone_digits) in (10, 11) then
      pix_phone_digits := '55' || pix_phone_digits;
    end if;
    new.pix_chave := '+' || pix_phone_digits;
  elsif new.pix_tipo = 'aleatoria' then
    new.pix_chave := lower(btrim(new.pix_chave));
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.partners_prepare_row() from public;
