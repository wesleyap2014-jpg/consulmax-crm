create table if not exists public.agenda_attendance_links (
  event_id uuid primary key references public.agenda_eventos(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_by uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agenda_event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.agenda_eventos(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  auth_user_id uuid not null,
  attended_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.agenda_attendance_links enable row level security;
alter table public.agenda_event_attendance enable row level security;

grant select, insert, update on public.agenda_attendance_links to authenticated;
grant select on public.agenda_event_attendance to authenticated;

create policy "attendance_links_select_creator_or_admin"
on public.agenda_attendance_links
for select
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.users u
    where u.auth_user_id = (select auth.uid())
      and u.role = 'admin'
      and coalesce(u.is_active, true) = true
  )
);

create policy "attendance_links_insert_authenticated"
on public.agenda_attendance_links
for insert
to authenticated
with check (created_by = (select auth.uid()));

create policy "attendance_links_update_creator_or_admin"
on public.agenda_attendance_links
for update
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.users u
    where u.auth_user_id = (select auth.uid())
      and u.role = 'admin'
      and coalesce(u.is_active, true) = true
  )
)
with check (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.users u
    where u.auth_user_id = (select auth.uid())
      and u.role = 'admin'
      and coalesce(u.is_active, true) = true
  )
);

create policy "attendance_select_self_or_admin"
on public.agenda_event_attendance
for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  or exists (
    select 1 from public.users u
    where u.auth_user_id = (select auth.uid())
      and u.role = 'admin'
      and coalesce(u.is_active, true) = true
  )
);

create or replace function public.register_agenda_attendance(p_token uuid)
returns table (
  event_id uuid,
  event_title text,
  event_start timestamptz,
  attendee_name text,
  attended_at timestamptz,
  already_registered boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_user_id uuid;
  v_user_id uuid;
  v_user_name text;
  v_event_id uuid;
  v_event_title text;
  v_event_start timestamptz;
  v_attended_at timestamptz;
  v_existing boolean := false;
begin
  v_auth_user_id := auth.uid();
  if v_auth_user_id is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  select u.id, u.nome
    into v_user_id, v_user_name
  from public.users u
  where u.auth_user_id = v_auth_user_id
    and coalesce(u.is_active, true) = true
  limit 1;

  if v_user_id is null then
    raise exception 'Usuário ativo do CRM não encontrado.';
  end if;

  select l.event_id, e.titulo, e.inicio_at
    into v_event_id, v_event_title, v_event_start
  from public.agenda_attendance_links l
  join public.agenda_eventos e on e.id = l.event_id
  where l.token = p_token
    and l.is_active = true
  limit 1;

  if v_event_id is null then
    raise exception 'Link de presença inválido ou inativo.';
  end if;

  select a.attended_at
    into v_attended_at
  from public.agenda_event_attendance a
  where a.event_id = v_event_id
    and a.user_id = v_user_id
  limit 1;

  if v_attended_at is not null then
    v_existing := true;
  else
    insert into public.agenda_event_attendance (event_id, user_id, auth_user_id)
    values (v_event_id, v_user_id, v_auth_user_id)
    returning agenda_event_attendance.attended_at into v_attended_at;
  end if;

  return query
  select v_event_id, coalesce(v_event_title, 'Reunião / treinamento'), v_event_start,
         coalesce(v_user_name, 'Usuário'), v_attended_at, v_existing;
end;
$$;

revoke all on function public.register_agenda_attendance(uuid) from public;
revoke all on function public.register_agenda_attendance(uuid) from anon;
grant execute on function public.register_agenda_attendance(uuid) to authenticated;

create index if not exists idx_agenda_event_attendance_user_date
  on public.agenda_event_attendance (user_id, attended_at desc);
create index if not exists idx_agenda_event_attendance_auth_date
  on public.agenda_event_attendance (auth_user_id, attended_at desc);
