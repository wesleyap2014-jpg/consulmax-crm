create table if not exists public.marketing_rejected_ideas (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.marketing_content_ideas(id) on delete cascade,
  idea_snapshot jsonb not null default '{}'::jsonb,
  rejected_by uuid null,
  rejected_at timestamptz not null default now(),
  rejection_reason text null,
  reactivated_by uuid null,
  reactivated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_rejected_ideas_idea_id
  on public.marketing_rejected_ideas(idea_id);
create index if not exists idx_marketing_rejected_ideas_active
  on public.marketing_rejected_ideas(reactivated_at, rejected_at desc);

alter table public.marketing_rejected_ideas enable row level security;
revoke all on public.marketing_rejected_ideas from anon;
grant select, insert, update, delete on public.marketing_rejected_ideas to authenticated;

drop policy if exists marketing_rejected_ideas_select on public.marketing_rejected_ideas;
create policy marketing_rejected_ideas_select
  on public.marketing_rejected_ideas for select to authenticated
  using (public.marketing_is_admin());

drop policy if exists marketing_rejected_ideas_insert on public.marketing_rejected_ideas;
create policy marketing_rejected_ideas_insert
  on public.marketing_rejected_ideas for insert to authenticated
  with check (public.marketing_is_admin());

drop policy if exists marketing_rejected_ideas_update on public.marketing_rejected_ideas;
create policy marketing_rejected_ideas_update
  on public.marketing_rejected_ideas for update to authenticated
  using (public.marketing_is_admin())
  with check (public.marketing_is_admin());

drop policy if exists marketing_rejected_ideas_delete on public.marketing_rejected_ideas;
create policy marketing_rejected_ideas_delete
  on public.marketing_rejected_ideas for delete to authenticated
  using (public.marketing_is_admin());
