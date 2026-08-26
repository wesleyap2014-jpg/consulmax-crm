alter table public.agenda_eventos
  add column if not exists waiting_room_enabled boolean not null default true,
  add column if not exists ai_enabled boolean not null default false,
  add column if not exists ai_mode text not null default 'sales',
  add column if not exists recording_preference text not null default 'manual',
  add column if not exists ai_report_status text not null default 'idle';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_eventos_ai_mode_check') then
    alter table public.agenda_eventos add constraint agenda_eventos_ai_mode_check check (ai_mode in ('sales','service','success','internal','minutes'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agenda_eventos_recording_preference_check') then
    alter table public.agenda_eventos add constraint agenda_eventos_recording_preference_check check (recording_preference in ('manual','auto','off'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agenda_eventos_ai_report_status_check') then
    alter table public.agenda_eventos add constraint agenda_eventos_ai_report_status_check check (ai_report_status in ('idle','collecting','processing','completed','failed'));
  end if;
end $$;

create table if not exists public.meeting_lobby_requests (
  id uuid primary key default gen_random_uuid(),
  agenda_evento_id uuid not null references public.agenda_eventos(id) on delete cascade,
  request_token uuid not null default gen_random_uuid() unique,
  guest_id uuid null references public.agenda_event_guests(id) on delete set null,
  user_auth_id uuid null,
  display_name text not null,
  email text null,
  status text not null default 'pending' check (status in ('pending','admitted','denied','left','expired')),
  recording_consent boolean not null default false,
  ai_consent boolean not null default false,
  requested_at timestamptz not null default now(),
  decided_at timestamptz null,
  decided_by uuid null,
  admitted_at timestamptz null,
  joined_at timestamptz null,
  expires_at timestamptz not null default (now() + interval '6 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meeting_lobby_event_status_idx on public.meeting_lobby_requests(agenda_evento_id,status,requested_at);
create index if not exists meeting_lobby_user_idx on public.meeting_lobby_requests(user_auth_id) where user_auth_id is not null;

create table if not exists public.meeting_transcripts (
  id uuid primary key default gen_random_uuid(),
  agenda_evento_id uuid not null references public.agenda_eventos(id) on delete cascade,
  segment_index bigint not null,
  participant_identity text not null,
  participant_name text null,
  participant_role text not null default 'participant' check (participant_role in ('host','participant','guest')),
  transcript_text text not null,
  started_at_ms bigint null,
  ended_at_ms bigint null,
  source text not null default 'live_track',
  model text null,
  created_at timestamptz not null default now(),
  unique(agenda_evento_id,participant_identity,segment_index)
);
create index if not exists meeting_transcripts_event_created_idx on public.meeting_transcripts(agenda_evento_id,created_at);

create table if not exists public.meeting_ai_insights (
  id uuid primary key default gen_random_uuid(),
  agenda_evento_id uuid not null references public.agenda_eventos(id) on delete cascade,
  insight_type text not null default 'coach',
  meeting_stage text null,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  title text not null,
  insight text not null,
  suggested_phrase text null,
  context_excerpt text null,
  dedupe_key text null,
  model text null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz null
);
create index if not exists meeting_ai_insights_event_created_idx on public.meeting_ai_insights(agenda_evento_id,created_at desc);
drop index if exists public.meeting_ai_insights_dedupe_idx;
create unique index meeting_ai_insights_dedupe_idx on public.meeting_ai_insights(agenda_evento_id,dedupe_key);

create table if not exists public.meeting_ai_reports (
  id uuid primary key default gen_random_uuid(),
  agenda_evento_id uuid not null unique references public.agenda_eventos(id) on delete cascade,
  meeting_type text not null,
  executive_summary text null,
  minutes_text text null,
  report jsonb not null default '{}'::jsonb,
  model text null,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  error text null,
  generated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meeting_lobby_requests enable row level security;
alter table public.meeting_transcripts enable row level security;
alter table public.meeting_ai_insights enable row level security;
alter table public.meeting_ai_reports enable row level security;

grant select,update on public.meeting_lobby_requests to authenticated;
grant select on public.meeting_transcripts to authenticated;
grant select,update on public.meeting_ai_insights to authenticated;
grant select on public.meeting_ai_reports to authenticated;
grant all on public.meeting_lobby_requests,public.meeting_transcripts,public.meeting_ai_insights,public.meeting_ai_reports to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='meeting_lobby_requests' and policyname='meeting lobby organizer read') then
    create policy "meeting lobby organizer read" on public.meeting_lobby_requests for select to authenticated using (exists(select 1 from public.agenda_eventos e where e.id=meeting_lobby_requests.agenda_evento_id and e.user_id=(select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='meeting_lobby_requests' and policyname='meeting lobby organizer update') then
    create policy "meeting lobby organizer update" on public.meeting_lobby_requests for update to authenticated using (exists(select 1 from public.agenda_eventos e where e.id=meeting_lobby_requests.agenda_evento_id and e.user_id=(select auth.uid()))) with check (exists(select 1 from public.agenda_eventos e where e.id=meeting_lobby_requests.agenda_evento_id and e.user_id=(select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='meeting_transcripts' and policyname='meeting transcript organizer read') then
    create policy "meeting transcript organizer read" on public.meeting_transcripts for select to authenticated using (exists(select 1 from public.agenda_eventos e where e.id=meeting_transcripts.agenda_evento_id and e.user_id=(select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='meeting_ai_insights' and policyname='meeting insight organizer read') then
    create policy "meeting insight organizer read" on public.meeting_ai_insights for select to authenticated using (exists(select 1 from public.agenda_eventos e where e.id=meeting_ai_insights.agenda_evento_id and e.user_id=(select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='meeting_ai_insights' and policyname='meeting insight organizer update') then
    create policy "meeting insight organizer update" on public.meeting_ai_insights for update to authenticated using (exists(select 1 from public.agenda_eventos e where e.id=meeting_ai_insights.agenda_evento_id and e.user_id=(select auth.uid()))) with check (exists(select 1 from public.agenda_eventos e where e.id=meeting_ai_insights.agenda_evento_id and e.user_id=(select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='meeting_ai_reports' and policyname='meeting report organizer read') then
    create policy "meeting report organizer read" on public.meeting_ai_reports for select to authenticated using (exists(select 1 from public.agenda_eventos e where e.id=meeting_ai_reports.agenda_evento_id and e.user_id=(select auth.uid())));
  end if;
end $$;
