-- Newsletter da Central de Marketing

create table if not exists public.marketing_newsletters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  title text not null,
  subject text not null,
  preheader text,
  audience text,
  segment text,
  scheduled_for timestamptz,
  status text not null default 'rascunho'
    check (status in ('rascunho','aprovacao','programada','enviada','arquivada')),
  content text,
  cta_text text,
  cta_url text,
  banner_file_path text,
  banner_external_url text,
  notes text,
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_newsletters_status
  on public.marketing_newsletters(status);
create index if not exists idx_marketing_newsletters_schedule
  on public.marketing_newsletters(scheduled_for);
create index if not exists idx_marketing_newsletters_campaign
  on public.marketing_newsletters(campaign_id);

drop trigger if exists trg_marketing_newsletters_updated_at on public.marketing_newsletters;
create trigger trg_marketing_newsletters_updated_at
before update on public.marketing_newsletters
for each row execute function public.marketing_set_updated_at();

alter table public.marketing_newsletters enable row level security;
revoke all on public.marketing_newsletters from anon;
grant select, insert, update, delete on public.marketing_newsletters to authenticated;

drop policy if exists "marketing_newsletters_admin_read" on public.marketing_newsletters;
create policy "marketing_newsletters_admin_read"
on public.marketing_newsletters for select to authenticated
using (public.marketing_is_admin());

drop policy if exists "marketing_newsletters_admin_insert" on public.marketing_newsletters;
create policy "marketing_newsletters_admin_insert"
on public.marketing_newsletters for insert to authenticated
with check (public.marketing_is_admin());

drop policy if exists "marketing_newsletters_admin_update" on public.marketing_newsletters;
create policy "marketing_newsletters_admin_update"
on public.marketing_newsletters for update to authenticated
using (public.marketing_is_admin())
with check (public.marketing_is_admin());

drop policy if exists "marketing_newsletters_admin_delete" on public.marketing_newsletters;
create policy "marketing_newsletters_admin_delete"
on public.marketing_newsletters for delete to authenticated
using (public.marketing_is_admin());
