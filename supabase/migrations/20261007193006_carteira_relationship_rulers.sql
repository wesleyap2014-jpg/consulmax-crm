create table if not exists public.carteira_relationship_messages (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  lead_id uuid null,
  vendedor_id uuid null,
  ruler text not null check (ruler in ('inadimplencia','recuperacao')),
  stage text not null,
  milestone integer not null check (milestone >= 0),
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  email text null,
  subject text null,
  cta_type text null check (cta_type is null or cta_type in ('regularizar','reparcelamento','ajuda','retomar_projeto')),
  click_token uuid not null default gen_random_uuid(),
  click_count integer not null default 0 check (click_count >= 0),
  first_clicked_at timestamptz null,
  last_clicked_at timestamptz null,
  seller_attention_at timestamptz null,
  max_reason text null,
  meta jsonb not null default '{}'::jsonb,
  error text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venda_id, ruler, milestone),
  unique (click_token)
);

create index if not exists carteira_relationship_messages_venda_created_idx
  on public.carteira_relationship_messages (venda_id, created_at desc);

create index if not exists carteira_relationship_messages_vendedor_created_idx
  on public.carteira_relationship_messages (vendedor_id, created_at desc);

create index if not exists carteira_relationship_messages_ruler_stage_idx
  on public.carteira_relationship_messages (ruler, stage, created_at desc);

create index if not exists carteira_relationship_messages_clicked_idx
  on public.carteira_relationship_messages (last_clicked_at desc)
  where last_clicked_at is not null;

alter table public.carteira_relationship_messages enable row level security;

revoke all on table public.carteira_relationship_messages from anon;
revoke insert, update, delete on table public.carteira_relationship_messages from authenticated;
grant select on table public.carteira_relationship_messages to authenticated;
grant select, insert, update, delete on table public.carteira_relationship_messages to service_role;

drop policy if exists carteira_relationship_messages_internal_read on public.carteira_relationship_messages;
create policy carteira_relationship_messages_internal_read
on public.carteira_relationship_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.auth_user_id = (select auth.uid())
      and coalesce(u.is_active, true) = true
  )
);
