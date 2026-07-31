create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  email text not null,
  tipo text not null,
  cpf_cnpj text not null,
  data_nascimento_constituicao date not null,
  comissao_pct numeric(5, 2) not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  unit_id uuid references public.units(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint partners_nome_not_blank check (length(btrim(nome)) >= 2),
  constraint partners_telefone_digits check (regexp_replace(telefone, '\D', '', 'g') ~ '^\d{10,11}$'),
  constraint partners_email_not_blank check (position('@' in email) > 1),
  constraint partners_tipo_check check (tipo in ('amigo', 'institucional')),
  constraint partners_document_by_type check (
    (tipo = 'amigo' and cpf_cnpj ~ '^\d{11}$')
    or (tipo = 'institucional' and cpf_cnpj ~ '^\d{14}$')
  ),
  constraint partners_date_not_future check (data_nascimento_constituicao <= current_date),
  constraint partners_commission_by_type check (
    (tipo = 'amigo' and comissao_pct between 0.20 and 0.40)
    or (tipo = 'institucional' and comissao_pct between 0.50 and 1.00)
  ),
  constraint partners_owner_document_unique unique (created_by, cpf_cnpj)
);

comment on table public.partners is
  'Parceiros Amigo e Institucional cadastrados pelos usuarios do CRM.';
comment on column public.partners.comissao_pct is
  'Percentual pactuado sobre o credito vendido, armazenado em pontos percentuais (ex.: 0.20 = 0,20%).';
comment on column public.partners.cpf_cnpj is
  'CPF ou CNPJ somente com digitos; protegido por RLS conforme a hierarquia do CRM.';

create index if not exists partners_created_by_idx on public.partners (created_by);
create index if not exists partners_unit_id_idx on public.partners (unit_id);
create index if not exists partners_tipo_idx on public.partners (tipo);
create index if not exists partners_nome_idx on public.partners (lower(nome));

create or replace function public.partners_prepare_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_unit_id uuid;
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
  new.updated_at := now();

  return new;
end;
$$;

revoke all on function public.partners_prepare_row() from public;

drop trigger if exists partners_prepare_row_trigger on public.partners;
create trigger partners_prepare_row_trigger
before insert or update on public.partners
for each row execute function public.partners_prepare_row();

alter table public.partners enable row level security;

revoke all on table public.partners from anon;
grant select, insert, update, delete on table public.partners to authenticated;
grant all on table public.partners to service_role;

drop policy if exists partners_select_hierarchy on public.partners;
create policy partners_select_hierarchy
on public.partners
for select
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1
      from public.users me
      left join public.units my_unit on my_unit.id = me.unit_id
     where me.auth_user_id = (select auth.uid())
       and coalesce(me.is_active, true) = true
       and (
         lower(coalesce(my_unit.tipo, '')) = 'matriz'
         or (
           lower(coalesce(me.hierarchy_level, '')) = 'gestor_filial'
           and me.unit_id is not distinct from partners.unit_id
         )
       )
  )
);

drop policy if exists partners_insert_own_scope on public.partners;
create policy partners_insert_own_scope
on public.partners
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
      from public.users me
     where me.auth_user_id = (select auth.uid())
       and coalesce(me.is_active, true) = true
       and me.unit_id is not distinct from partners.unit_id
  )
);

drop policy if exists partners_update_hierarchy on public.partners;
create policy partners_update_hierarchy
on public.partners
for update
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1
      from public.users me
      left join public.units my_unit on my_unit.id = me.unit_id
     where me.auth_user_id = (select auth.uid())
       and coalesce(me.is_active, true) = true
       and (
         lower(coalesce(my_unit.tipo, '')) = 'matriz'
         or (
           lower(coalesce(me.hierarchy_level, '')) = 'gestor_filial'
           and me.unit_id is not distinct from partners.unit_id
         )
       )
  )
)
with check (
  created_by = (select auth.uid())
  or exists (
    select 1
      from public.users me
      left join public.units my_unit on my_unit.id = me.unit_id
     where me.auth_user_id = (select auth.uid())
       and coalesce(me.is_active, true) = true
       and (
         lower(coalesce(my_unit.tipo, '')) = 'matriz'
         or (
           lower(coalesce(me.hierarchy_level, '')) = 'gestor_filial'
           and me.unit_id is not distinct from partners.unit_id
         )
       )
  )
);

drop policy if exists partners_delete_hierarchy on public.partners;
create policy partners_delete_hierarchy
on public.partners
for delete
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1
      from public.users me
      left join public.units my_unit on my_unit.id = me.unit_id
     where me.auth_user_id = (select auth.uid())
       and coalesce(me.is_active, true) = true
       and (
         lower(coalesce(my_unit.tipo, '')) = 'matriz'
         or (
           lower(coalesce(me.hierarchy_level, '')) = 'gestor_filial'
           and me.unit_id is not distinct from partners.unit_id
         )
       )
  )
);
