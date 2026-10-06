create table if not exists public.weekly_performance_feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  auth_user_id uuid not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'attention' check (status in ('strong','attention','action')),
  discipline_score integer not null default 0 check (discipline_score between 0 and 100),
  metrics jsonb not null default '{}'::jsonb,
  alerts jsonb not null default '[]'::jsonb,
  positives jsonb not null default '[]'::jsonb,
  priorities jsonb not null default '[]'::jsonb,
  max_analysis text,
  email_status text not null default 'pending' check (email_status in ('pending','sent','failed','skipped')),
  email_sent_at timestamptz,
  email_error text,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_start, period_end)
);

create index if not exists weekly_performance_feedbacks_auth_period_idx
  on public.weekly_performance_feedbacks (auth_user_id, period_end desc);

create index if not exists weekly_performance_feedbacks_status_idx
  on public.weekly_performance_feedbacks (status, period_end desc);

alter table public.weekly_performance_feedbacks enable row level security;

drop policy if exists "weekly_feedback_select_own_or_admin" on public.weekly_performance_feedbacks;
create policy "weekly_feedback_select_own_or_admin"
on public.weekly_performance_feedbacks
for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  or exists (
    select 1
    from public.users u
    where u.auth_user_id = (select auth.uid())
      and coalesce(u.is_active, true) = true
      and u.role::text = 'admin'
  )
);

grant select on public.weekly_performance_feedbacks to authenticated;
