-- CRM Consulmax - Filas configuráveis da Central WhatsApp
-- Execute no Supabase SQL Editor.

create table if not exists public.whatsapp_queues (
  key text primary key,
  label text not null,
  color text not null default '#1E293F',
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_queue_users (
  id uuid primary key default gen_random_uuid(),
  queue_key text not null references public.whatsapp_queues(key) on delete cascade,
  user_auth_id uuid not null,
  created_at timestamptz not null default now(),
  unique(queue_key, user_auth_id)
);

create index if not exists whatsapp_queue_users_user_auth_id_idx on public.whatsapp_queue_users(user_auth_id);
create index if not exists whatsapp_queue_users_queue_key_idx on public.whatsapp_queue_users(queue_key);

insert into public.whatsapp_queues (key, label, color, sort_order, is_active)
values
  ('novos_contatos', 'Novos Contatos', '#A11C27', 10, true),
  ('triagem', 'Triagem', '#B5A573', 20, true),
  ('comercial', 'Comercial', '#1E293F', 30, true),
  ('qualificacao', 'Qualificação', '#1E293F', 40, true),
  ('proposta', 'Proposta', '#1E293F', 50, true),
  ('negociacao', 'Negociação', '#1E293F', 60, true),
  ('cliente_ativo', 'Cliente Ativo', '#0f766e', 70, true),
  ('boleto', 'Boleto', '#0f766e', 80, true),
  ('contemplacao', 'Contemplação', '#0f766e', 90, true),
  ('pos_venda', 'Pós-venda', '#0f766e', 100, true),
  ('suporte', 'Suporte', '#0f766e', 110, true),
  ('financeiro', 'Financeiro', '#0f766e', 120, true),
  ('finalizado', 'Finalizado', '#64748b', 999, true)
on conflict (key) do update set
  label = excluded.label,
  color = excluded.color,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

-- Opcional, mas recomendado: vincula admins/gestores a todas as filas iniciais.
insert into public.whatsapp_queue_users (queue_key, user_auth_id)
select q.key, u.auth_user_id
from public.whatsapp_queues q
cross join public.users u
where u.auth_user_id is not null
  and coalesce(u.is_active, true) = true
  and lower(coalesce(u.role::text, u.user_role, '')) in ('admin', 'gestor')
on conflict (queue_key, user_auth_id) do nothing;

alter table public.whatsapp_queues enable row level security;
alter table public.whatsapp_queue_users enable row level security;

drop policy if exists whatsapp_queues_select_authenticated on public.whatsapp_queues;
create policy whatsapp_queues_select_authenticated
on public.whatsapp_queues
for select
to authenticated
using (true);

drop policy if exists whatsapp_queue_users_select_own_or_admin on public.whatsapp_queue_users;
create policy whatsapp_queue_users_select_own_or_admin
on public.whatsapp_queue_users
for select
to authenticated
using (
  user_auth_id = auth.uid()
  or exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and lower(coalesce(u.role::text, u.user_role, '')) in ('admin', 'gestor')
  )
);

drop policy if exists whatsapp_queues_admin_all on public.whatsapp_queues;
create policy whatsapp_queues_admin_all
on public.whatsapp_queues
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and lower(coalesce(u.role::text, u.user_role, '')) in ('admin', 'gestor')
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and lower(coalesce(u.role::text, u.user_role, '')) in ('admin', 'gestor')
  )
);

drop policy if exists whatsapp_queue_users_admin_all on public.whatsapp_queue_users;
create policy whatsapp_queue_users_admin_all
on public.whatsapp_queue_users
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and lower(coalesce(u.role::text, u.user_role, '')) in ('admin', 'gestor')
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid()
      and lower(coalesce(u.role::text, u.user_role, '')) in ('admin', 'gestor')
  )
);
