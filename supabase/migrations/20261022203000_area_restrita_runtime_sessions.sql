create table if not exists public.area_restrita_runtime_sessions (
  key text primary key,
  administradora text not null default 'maggi',
  state text not null default 'idle',
  message text,
  remote_url text,
  github_run_id bigint,
  github_run_url text,
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint area_restrita_runtime_sessions_admin_check
    check (administradora = 'maggi')
);

alter table public.area_restrita_runtime_sessions enable row level security;

revoke all on table public.area_restrita_runtime_sessions from anon, authenticated;
grant select, insert, update, delete on table public.area_restrita_runtime_sessions to service_role;

comment on table public.area_restrita_runtime_sessions is
  'Estado efêmero e privado do runner da Área Restrita Maggi. A URL remota nunca deve ser exposta diretamente pelo GitHub Actions.';
