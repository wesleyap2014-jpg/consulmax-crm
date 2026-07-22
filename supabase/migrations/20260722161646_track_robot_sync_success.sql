create table if not exists public.robot_sync_status (
  key text primary key,
  administradora text not null,
  process text not null,
  source text not null default 'cron',
  last_success_at timestamptz not null,
  summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint robot_sync_status_source_check
    check (source in ('cron', 'manual'))
);

alter table public.robot_sync_status enable row level security;

revoke all on table public.robot_sync_status from anon, authenticated;
grant select on table public.robot_sync_status to authenticated;
grant select, insert, update, delete on table public.robot_sync_status to service_role;

drop policy if exists "robot_sync_status_select_authenticated"
  on public.robot_sync_status;

create policy "robot_sync_status_select_authenticated"
on public.robot_sync_status
for select
to authenticated
using (true);

comment on table public.robot_sync_status is
  'Última execução bem-sucedida dos processos automáticos de sincronização.';
