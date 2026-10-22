create table if not exists public.area_restrita_run_requests (
  key text primary key,
  requested_at timestamptz not null default now(),
  consumed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint area_restrita_run_requests_key_check check (key = 'maggi')
);

alter table public.area_restrita_run_requests enable row level security;

revoke all on table public.area_restrita_run_requests from anon, authenticated;
grant select on table public.area_restrita_run_requests to anon, authenticated;
grant select, insert, update, delete on table public.area_restrita_run_requests to service_role;

drop policy if exists area_restrita_run_requests_public_read on public.area_restrita_run_requests;
create policy area_restrita_run_requests_public_read
on public.area_restrita_run_requests
for select
to anon, authenticated
using (key = 'maggi');

comment on table public.area_restrita_run_requests is
  'Fila pública não sensível para sinalizar ao GitHub Actions que existe uma execução pendente da Área Restrita Maggi.';
