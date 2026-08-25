create table if not exists public.agenda_event_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.agenda_eventos(id) on delete cascade,
  guest_type text not null default 'external' check (guest_type in ('internal','external')),
  user_auth_id uuid null,
  name text null,
  email text not null,
  rsvp_token uuid not null default gen_random_uuid() unique,
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending','accepted','declined')),
  responded_at timestamptz null,
  email_sent_at timestamptz null,
  email_error text null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, email)
);

create index if not exists agenda_event_guests_event_idx on public.agenda_event_guests(event_id);
create index if not exists agenda_event_guests_user_idx on public.agenda_event_guests(user_auth_id);
create index if not exists agenda_event_guests_rsvp_idx on public.agenda_event_guests(rsvp_token);

alter table public.agenda_event_guests enable row level security;

drop policy if exists agenda_event_guests_select on public.agenda_event_guests;
create policy agenda_event_guests_select on public.agenda_event_guests
for select to authenticated
using (
  user_auth_id = auth.uid()
  or exists (
    select 1 from public.agenda_eventos e
    where e.id = agenda_event_guests.event_id and e.user_id = auth.uid()
  )
  or exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid() and u.role = 'admin'::user_role and coalesce(u.is_active,true)=true
  )
);

drop policy if exists agenda_event_guests_insert on public.agenda_event_guests;
create policy agenda_event_guests_insert on public.agenda_event_guests
for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    exists (
      select 1 from public.agenda_eventos e
      where e.id = agenda_event_guests.event_id and e.user_id = auth.uid()
    )
    or exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid() and u.role = 'admin'::user_role and coalesce(u.is_active,true)=true
    )
  )
);

drop policy if exists agenda_event_guests_update on public.agenda_event_guests;
create policy agenda_event_guests_update on public.agenda_event_guests
for update to authenticated
using (
  exists (select 1 from public.agenda_eventos e where e.id = agenda_event_guests.event_id and e.user_id = auth.uid())
  or exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.role = 'admin'::user_role and coalesce(u.is_active,true)=true)
)
with check (
  exists (select 1 from public.agenda_eventos e where e.id = agenda_event_guests.event_id and e.user_id = auth.uid())
  or exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.role = 'admin'::user_role and coalesce(u.is_active,true)=true)
);

drop policy if exists agenda_event_guests_delete on public.agenda_event_guests;
create policy agenda_event_guests_delete on public.agenda_event_guests
for delete to authenticated
using (
  exists (select 1 from public.agenda_eventos e where e.id = agenda_event_guests.event_id and e.user_id = auth.uid())
  or exists (select 1 from public.users u where u.auth_user_id = auth.uid() and u.role = 'admin'::user_role and coalesce(u.is_active,true)=true)
);

grant select,insert,update,delete on public.agenda_event_guests to authenticated;
