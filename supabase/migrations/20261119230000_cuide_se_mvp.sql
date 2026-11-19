-- Cuide-se MVP: somente a própria pessoa acessa seus registros.
-- Aplicar em ambiente de testes antes de promover para produção.

create table if not exists public.cuidese_routines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 90),
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table if not exists public.cuidese_exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  target_sets smallint not null default 3 check (target_sets between 1 and 10),
  target_reps text not null default '10–12',
  rest_seconds integer not null default 60 check (rest_seconds between 0 and 600),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint cuidese_exercises_owned_routine foreign key (routine_id, owner_id)
    references public.cuidese_routines (id, owner_id) on delete cascade,
  unique (id, owner_id)
);

create table if not exists public.cuidese_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid,
  routine_title text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint cuidese_sessions_owned_routine foreign key (routine_id, owner_id)
    references public.cuidese_routines (id, owner_id)
    on delete set null (routine_id),
  unique (id, owner_id),
  constraint cuidese_sessions_finish_after_start check (completed_at is null or completed_at >= started_at)
);

create table if not exists public.cuidese_session_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null,
  exercise_id uuid not null,
  exercise_name text not null,
  set_index smallint not null check (set_index between 1 and 10),
  weight_kg numeric(8,2) check (weight_kg is null or weight_kg between 0 and 999999),
  reps integer check (reps is null or reps between 0 and 500),
  seconds integer check (seconds is null or seconds between 0 and 3600),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  constraint cuidese_sets_owned_session foreign key (session_id, owner_id)
    references public.cuidese_sessions (id, owner_id) on delete cascade,
  unique (session_id, exercise_id, set_index)
);

create index if not exists cuidese_routines_owner_order on public.cuidese_routines (owner_id, sort_order);
create index if not exists cuidese_exercises_owner_routine on public.cuidese_exercises (owner_id, routine_id, position);
create index if not exists cuidese_sessions_owner_started on public.cuidese_sessions (owner_id, started_at desc);
create index if not exists cuidese_sets_owner_session on public.cuidese_session_sets (owner_id, session_id);
create index if not exists cuidese_sets_owner_exercise on public.cuidese_session_sets (owner_id, exercise_id);

alter table public.cuidese_routines enable row level security;
alter table public.cuidese_exercises enable row level security;
alter table public.cuidese_sessions enable row level security;
alter table public.cuidese_session_sets enable row level security;

create policy cuidese_routines_self on public.cuidese_routines
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy cuidese_exercises_self on public.cuidese_exercises
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy cuidese_sessions_self on public.cuidese_sessions
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy cuidese_sets_self on public.cuidese_session_sets
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

revoke all on public.cuidese_routines, public.cuidese_exercises,
  public.cuidese_sessions, public.cuidese_session_sets from anon;
grant select, insert, update, delete on public.cuidese_routines,
  public.cuidese_exercises, public.cuidese_sessions,
  public.cuidese_session_sets to authenticated;

comment on table public.cuidese_sessions is
  'Registros pessoais do modulo Cuide-se, nunca utilizados em rankings ou metricas comerciais.';
