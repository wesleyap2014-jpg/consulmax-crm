create table if not exists public.robot_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  administradora text not null default 'bb',
  mode text not null,
  segment text,
  source text not null default 'manual',
  status text not null default 'pending',
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  current_stage text,
  current_item text,
  progress jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  github_run_id bigint,
  github_run_url text,
  constraint robot_sync_jobs_administradora_check
    check (administradora in ('bb', 'maggi')),
  constraint robot_sync_jobs_mode_check
    check (mode in ('full', 'segment', 'assemblies')),
  constraint robot_sync_jobs_source_check
    check (source in ('cron', 'manual', 'github')),
  constraint robot_sync_jobs_status_check
    check (status in ('pending', 'running', 'success', 'partial_error', 'error', 'cancelled')),
  constraint robot_sync_jobs_segment_check
    check (
      (mode = 'segment' and segment in ('auto_ipca', 'auto_fipe', 'outros_bens', 'pesados', 'motocicleta', 'imoveis'))
      or (mode <> 'segment' and segment is null)
    )
);

create index if not exists robot_sync_jobs_requested_at_idx
  on public.robot_sync_jobs (requested_at desc);

create index if not exists robot_sync_jobs_status_requested_at_idx
  on public.robot_sync_jobs (status, requested_at);

create unique index if not exists robot_sync_jobs_one_active_bb_idx
  on public.robot_sync_jobs (administradora)
  where status in ('pending', 'running');

alter table public.robot_sync_jobs enable row level security;

revoke all on table public.robot_sync_jobs from anon, authenticated;
grant select on table public.robot_sync_jobs to authenticated;
grant select, insert, update, delete on table public.robot_sync_jobs to service_role;

drop policy if exists "robot_sync_jobs_select_authenticated"
  on public.robot_sync_jobs;

create policy "robot_sync_jobs_select_authenticated"
on public.robot_sync_jobs
for select
to authenticated
using (true);

comment on table public.robot_sync_jobs is
  'Fila e acompanhamento das sincronizações executadas pelo GitHub Actions.';
