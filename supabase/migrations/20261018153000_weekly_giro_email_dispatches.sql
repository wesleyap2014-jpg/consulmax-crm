create table if not exists public.weekly_giro_email_dispatches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  week_start date not null,
  status text not null default 'processing' check (status in ('processing','sent','failed')),
  pending_count integer not null default 0,
  sent_at timestamptz,
  error text,
  updated_at timestamptz not null default now(),
  unique(user_id,week_start)
);
alter table public.weekly_giro_email_dispatches enable row level security;
revoke all on public.weekly_giro_email_dispatches from anon,authenticated;
