-- 🔧 Ajustes Carteira: admin + coluna 'tabela' + 'Bolsão' + índice único
create extension if not exists pgcrypto;

-- 1) Colunas novas/garantias
alter table public.vendas
  add column if not exists contemplada boolean default false,
  add column if not exists data_contemplacao date,
  add column if not exists tabela text;

-- 2) tipo_venda agora aceita 'Bolsão'
do $$
begin
  if exists (select 1 from pg_constraint where conname='vendas_tipo_venda_chk' and conrelid='public.vendas'::regclass) then
    alter table public.vendas drop constraint vendas_tipo_venda_chk;
  end if;
  alter table public.vendas
    add constraint vendas_tipo_venda_chk
    check (tipo_venda in ('Normal','Contemplada','Bolsão'));
end$$;

-- 3) Remover duplicatas (mantém a mais antiga) e criar índice único
with dups as (
  select numero_proposta, min(ctid) as keep_ctid
  from public.vendas
  group by numero_proposta
), to_del as (
  select v.ctid
  from public.vendas v
  join dups d on v.numero_proposta = d.numero_proposta
  where v.ctid <> d.keep_ctid
)
delete from public.vendas v
using to_del t
where v.ctid = t.ctid;

do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and tablename='vendas' and indexname='vendas_numero_proposta_unq'
  ) then
    execute 'create unique index vendas_numero_proposta_unq on public.vendas (numero_proposta)';
  end if;
end$$;

-- 4) Tabela 'admins' (opcional) e RLS
create table if not exists public.admins (
  email text primary key
);

alter table public.vendas enable row level security;
alter table public.admins enable row level security;

-- Quem pode ler 'admins' (app precisa checar)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='admins' and policyname='admins_select_auth'
  ) then
    create policy admins_select_auth on public.admins for select to authenticated using (true);
  end if;
end$$;

-- 5) Função que reconhece admin por 'admins' OU pela tabela 'usuarios' se existir (perfil/role = admin)
create or replace function public.is_admin_email(e text)
returns boolean
language plpgsql
stable
as $$
declare
  v boolean := false;
  has_usuarios boolean;
  has_email boolean;
  has_login boolean;
  has_perfil boolean;
  has_role boolean;
  q text;
  r boolean;
begin
  if e is null or length(e)=0 then
    return false;
  end if;

  -- admins.email
  select exists(select 1 from public.admins a where lower(a.email)=lower(e)) into v;
  if v then
    return true;
  end if;

  -- existe tabela usuarios?
  select to_regclass('public.usuarios') is not null into has_usuarios;
  if not has_usuarios then
    return false;
  end if;

  -- checa colunas dinamicamente
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='usuarios' and column_name='email') into has_email;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='usuarios' and column_name='login') into has_login;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='usuarios' and column_name='perfil') into has_perfil;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='usuarios' and column_name='role') into has_role;

  q := 'select exists (select 1 from public.usuarios where 1=1 ';
  if has_email then
    q := q || ' and lower(email) = lower($1) ';
  elsif has_login then
    q := q || ' and lower(login) = lower($1) ';
  else
    q := q || ' and false '; -- sem coluna para comparar email/login
  end if;

  if has_perfil and has_role then
    q := q || ' and (lower(perfil) in (''admin'',''administrador'',''adm'') or lower(role) in (''admin'',''administrador'',''adm'')) ';
  elsif has_perfil then
    q := q || ' and lower(perfil) in (''admin'',''administrador'',''adm'') ';
  elsif has_role then
    q := q || ' and lower(role) in (''admin'',''administrador'',''adm'') ';
  else
    q := q || ' and false '; -- sem coluna de perfil/role
  end if;

  q := q || ' limit 1)';

  execute q using e into r;

  return coalesce(r,false);
end
$$;

grant execute on function public.is_admin_email(text) to authenticated;

-- 6) Policies de VENDAS
do $$
begin
  -- select
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vendas' and policyname='vendas_select_auth') then
    create policy vendas_select_auth on public.vendas for select to authenticated using (true);
  end if;

  -- insert
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vendas' and policyname='vendas_insert_auth') then
    create policy vendas_insert_auth on public.vendas for insert to authenticated with check (true);
  end if;

  -- update: ADMIN pode tudo
  if exists (select 1 from pg_policies where schemaname='public' and tablename='vendas' and policyname='vendas_update_admin') then
    drop policy vendas_update_admin on public.vendas;
  end if;
  create policy vendas_update_admin on public.vendas
    for update to authenticated
    using ( public.is_admin_email(auth.jwt()->>'email') )
    with check ( public.is_admin_email(auth.jwt()->>'email') );

  -- update para não-admin APENAS em registros pendentes (status <> 'encarteirada')
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vendas' and policyname='vendas_update_nonadmin_pendentes') then
    create policy vendas_update_nonadmin_pendentes on public.vendas
      for update to authenticated
      using ( status <> 'encarteirada' )
      with check ( status <> 'encarteirada' );
  end if;

  -- delete: admin pode qualquer; vendedor pode deletar as próprias PENDENTES
  if exists (select 1 from pg_policies where schemaname='public' and tablename='vendas' and policyname='vendas_delete_admin') then
    drop policy vendas_delete_admin on public.vendas;
  end if;
  create policy vendas_delete_admin on public.vendas
    for delete to authenticated
    using ( public.is_admin_email(auth.jwt()->>'email') );

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vendas' and policyname='vendas_delete_owner_pendente') then
    create policy vendas_delete_owner_pendente on public.vendas
      for delete to authenticated
      using ( status = 'nova' and vendedor_id = auth.uid() );
  end if;
end
$$;

-- (Opcional) inserir seu e-mail em admins também, se quiser força dupla:
-- insert into public.admins(email) values ('seu-email@consulmax.com.br') on conflict do nothing;
