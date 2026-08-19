create table if not exists public.access_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text null,
  permissions jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null unique,
  description text null,
  sort_order integer not null default 0,
  requirements jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_access_assignments (
  user_id uuid primary key references public.users(id) on delete cascade,
  access_profile_id uuid null references public.access_profiles(id) on delete set null,
  partner_category_id uuid null references public.partner_categories(id) on delete set null,
  partner_category_since date null,
  updated_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_access_assignments_profile
  on public.user_access_assignments(access_profile_id);
create index if not exists idx_user_access_assignments_partner_category
  on public.user_access_assignments(partner_category_id);

alter table public.access_profiles enable row level security;
alter table public.partner_categories enable row level security;
alter table public.user_access_assignments enable row level security;

grant select, insert, update, delete on public.access_profiles to authenticated;
grant select, insert, update, delete on public.partner_categories to authenticated;
grant select, insert, update, delete on public.user_access_assignments to authenticated;

drop policy if exists access_profiles_select_authenticated on public.access_profiles;
create policy access_profiles_select_authenticated on public.access_profiles
for select to authenticated using (true);

drop policy if exists access_profiles_insert_admin on public.access_profiles;
create policy access_profiles_insert_admin on public.access_profiles
for insert to authenticated with check (is_admin(auth.uid()));

drop policy if exists access_profiles_update_admin on public.access_profiles;
create policy access_profiles_update_admin on public.access_profiles
for update to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists access_profiles_delete_admin on public.access_profiles;
create policy access_profiles_delete_admin on public.access_profiles
for delete to authenticated using (is_admin(auth.uid()));

drop policy if exists partner_categories_select_authenticated on public.partner_categories;
create policy partner_categories_select_authenticated on public.partner_categories
for select to authenticated using (true);

drop policy if exists partner_categories_insert_admin on public.partner_categories;
create policy partner_categories_insert_admin on public.partner_categories
for insert to authenticated with check (is_admin(auth.uid()));

drop policy if exists partner_categories_update_admin on public.partner_categories;
create policy partner_categories_update_admin on public.partner_categories
for update to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists partner_categories_delete_admin on public.partner_categories;
create policy partner_categories_delete_admin on public.partner_categories
for delete to authenticated using (is_admin(auth.uid()));

drop policy if exists user_access_assignments_select_self_or_admin on public.user_access_assignments;
create policy user_access_assignments_select_self_or_admin on public.user_access_assignments
for select to authenticated using (
  is_admin(auth.uid())
  or user_id in (select id from public.users where auth_user_id = auth.uid())
);

drop policy if exists user_access_assignments_insert_admin on public.user_access_assignments;
create policy user_access_assignments_insert_admin on public.user_access_assignments
for insert to authenticated with check (is_admin(auth.uid()));

drop policy if exists user_access_assignments_update_admin on public.user_access_assignments;
create policy user_access_assignments_update_admin on public.user_access_assignments
for update to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists user_access_assignments_delete_admin on public.user_access_assignments;
create policy user_access_assignments_delete_admin on public.user_access_assignments
for delete to authenticated using (is_admin(auth.uid()));

insert into public.partner_categories(key, name, description, sort_order, requirements)
values
  ('vendedor_interno', 'Vendedor Interno', 'Colaborador comercial interno da Consulmax.', 10, '{}'::jsonb),
  ('associado', 'Associado', 'Primeiro nível do Programa de Parceiros Vendedores.', 20, '{"reunioes_treinamentos_mes":3,"prospeccoes_mes":20,"qualificacoes_mes":15,"simulacoes_mes":7,"vendas_mes":1,"compromisso_semanal_abordagens":5}'::jsonb),
  ('partner', 'Partner', 'Parceiro com maior nível de produção e compromisso comercial.', 30, '{"reunioes_treinamentos_mes":3,"prospeccoes_mes":30,"qualificacoes_mes":20,"simulacoes_mes":10,"vendas_mes":2,"compromisso_semanal_abordagens":8}'::jsonb),
  ('partner_estrategico', 'Partner Estratégico', 'Nível estratégico do Programa de Parceiros Vendedores.', 40, '{}'::jsonb),
  ('unidade_parceira', 'Unidade Parceira', 'Estrutura parceira com operação própria vinculada à Consulmax.', 50, '{}'::jsonb)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.access_profiles(name, description, permissions, is_system, is_active)
values
  ('Administrador Total', 'Perfil sistêmico com acesso integral ao CRM.', '{"*":{"view":true,"information":{"*":true},"actions":{"*":true}}}'::jsonb, true, true),
  ('Somente Leitura', 'Perfil sistêmico que permite consultar as guias, sem ações de alteração.', '{"*":{"view":true,"information":{"*":true},"actions":{}}}'::jsonb, true, true)
on conflict (name) do nothing;

drop trigger if exists trg_access_profiles_updated_at on public.access_profiles;
create trigger trg_access_profiles_updated_at before update on public.access_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_partner_categories_updated_at on public.partner_categories;
create trigger trg_partner_categories_updated_at before update on public.partner_categories
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_access_assignments_updated_at on public.user_access_assignments;
create trigger trg_user_access_assignments_updated_at before update on public.user_access_assignments
for each row execute function public.set_updated_at();
