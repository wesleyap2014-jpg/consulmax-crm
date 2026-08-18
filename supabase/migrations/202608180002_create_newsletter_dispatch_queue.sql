-- Newsletter: fila de destinatários e controle de disparo.
-- Limites padrão respeitam a caixa Hostinger atual: 50/hora e 100/24h.

create table if not exists public.marketing_newsletter_dispatches (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references public.marketing_newsletters(id) on delete cascade,
  status text not null default 'preparando'
    check (status in ('preparando','pronta','em_envio','pausada','concluida','cancelada','erro')),
  source_types text[] not null default '{}',
  hourly_limit integer not null default 50 check (hourly_limit between 1 and 50),
  daily_limit integer not null default 100 check (daily_limit between 1 and 100),
  total_recipients integer not null default 0 check (total_recipients >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  invalid_count integer not null default 0 check (invalid_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_newsletter_recipients (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.marketing_newsletter_dispatches(id) on delete cascade,
  newsletter_id uuid not null references public.marketing_newsletters(id) on delete cascade,
  source_type text not null check (source_type in ('cliente','parceiro','lead','arquivo')),
  source_record_id uuid,
  name text,
  email text not null,
  status text not null default 'pendente'
    check (status in ('pendente','enviando','enviado','erro','ignorado')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_newsletter_dispatches_newsletter
  on public.marketing_newsletter_dispatches(newsletter_id, created_at desc);
create index if not exists idx_marketing_newsletter_dispatches_status
  on public.marketing_newsletter_dispatches(status, created_at);
create index if not exists idx_marketing_newsletter_recipients_dispatch_status
  on public.marketing_newsletter_recipients(dispatch_id, status, queued_at);
create index if not exists idx_marketing_newsletter_recipients_sent_at
  on public.marketing_newsletter_recipients(sent_at) where sent_at is not null;
create unique index if not exists idx_marketing_newsletter_recipients_unique_email
  on public.marketing_newsletter_recipients(dispatch_id, lower(btrim(email)));

drop trigger if exists trg_marketing_newsletter_dispatches_updated_at on public.marketing_newsletter_dispatches;
create trigger trg_marketing_newsletter_dispatches_updated_at
before update on public.marketing_newsletter_dispatches
for each row execute function public.marketing_set_updated_at();

drop trigger if exists trg_marketing_newsletter_recipients_updated_at on public.marketing_newsletter_recipients;
create trigger trg_marketing_newsletter_recipients_updated_at
before update on public.marketing_newsletter_recipients
for each row execute function public.marketing_set_updated_at();

alter table public.marketing_newsletter_dispatches enable row level security;
alter table public.marketing_newsletter_recipients enable row level security;

revoke all on public.marketing_newsletter_dispatches from anon;
revoke all on public.marketing_newsletter_recipients from anon;
grant select, insert, update, delete on public.marketing_newsletter_dispatches to authenticated;
grant select, insert, update, delete on public.marketing_newsletter_recipients to authenticated;

drop policy if exists marketing_newsletter_dispatches_admin_read on public.marketing_newsletter_dispatches;
create policy marketing_newsletter_dispatches_admin_read
on public.marketing_newsletter_dispatches for select to authenticated using (public.marketing_is_admin());
drop policy if exists marketing_newsletter_dispatches_admin_insert on public.marketing_newsletter_dispatches;
create policy marketing_newsletter_dispatches_admin_insert
on public.marketing_newsletter_dispatches for insert to authenticated with check (public.marketing_is_admin());
drop policy if exists marketing_newsletter_dispatches_admin_update on public.marketing_newsletter_dispatches;
create policy marketing_newsletter_dispatches_admin_update
on public.marketing_newsletter_dispatches for update to authenticated using (public.marketing_is_admin()) with check (public.marketing_is_admin());
drop policy if exists marketing_newsletter_dispatches_admin_delete on public.marketing_newsletter_dispatches;
create policy marketing_newsletter_dispatches_admin_delete
on public.marketing_newsletter_dispatches for delete to authenticated using (public.marketing_is_admin());

drop policy if exists marketing_newsletter_recipients_admin_read on public.marketing_newsletter_recipients;
create policy marketing_newsletter_recipients_admin_read
on public.marketing_newsletter_recipients for select to authenticated using (public.marketing_is_admin());
drop policy if exists marketing_newsletter_recipients_admin_insert on public.marketing_newsletter_recipients;
create policy marketing_newsletter_recipients_admin_insert
on public.marketing_newsletter_recipients for insert to authenticated with check (public.marketing_is_admin());
drop policy if exists marketing_newsletter_recipients_admin_update on public.marketing_newsletter_recipients;
create policy marketing_newsletter_recipients_admin_update
on public.marketing_newsletter_recipients for update to authenticated using (public.marketing_is_admin()) with check (public.marketing_is_admin());
drop policy if exists marketing_newsletter_recipients_admin_delete on public.marketing_newsletter_recipients;
create policy marketing_newsletter_recipients_admin_delete
on public.marketing_newsletter_recipients for delete to authenticated using (public.marketing_is_admin());
