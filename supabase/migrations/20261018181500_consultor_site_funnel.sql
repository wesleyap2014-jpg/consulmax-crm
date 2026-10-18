create table if not exists public.consultor_site_visits (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 visitor_token text not null,
 visited_on date not null default current_date,
 created_at timestamptz not null default now(),
 unique(user_id,visitor_token,visited_on)
);
create index if not exists consultor_site_visits_owner on public.consultor_site_visits(user_id,visited_on);
alter table public.consultor_site_visits enable row level security;
revoke all on public.consultor_site_visits from anon, authenticated;
alter table public.consultor_site_submissions add column if not exists opportunity_id uuid references public.opportunities(id);
