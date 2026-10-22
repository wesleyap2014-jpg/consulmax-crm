alter table public.area_restrita_runtime_sessions
  drop constraint if exists area_restrita_runtime_sessions_admin_check;

alter table public.area_restrita_runtime_sessions
  add constraint area_restrita_runtime_sessions_admin_check
  check (administradora in ('maggi','embracon'));
