-- Central de Marketing Consulmax
-- Plano de mídia, estúdio de conteúdo, campanhas e biblioteca de criativos.

create extension if not exists "pgcrypto";

create or replace function public.marketing_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.marketing_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.role = 'admin'
  );
$$;

revoke all on function public.marketing_is_admin() from public;
revoke all on function public.marketing_is_admin() from anon;
grant execute on function public.marketing_is_admin() to authenticated;

-- =========================================================
-- 1) Planos de mídia
-- =========================================================
create table if not exists public.marketing_media_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reference_month date not null,
  objective text,
  audience text,
  channels text[] not null default '{}',
  content_pillars text[] not null default '{}',
  budget numeric(14,2),
  status text not null default 'rascunho'
    check (status in ('rascunho','ativo','concluido','arquivado')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_marketing_media_plans_month_name
  on public.marketing_media_plans(reference_month, lower(name));
create index if not exists idx_marketing_media_plans_status
  on public.marketing_media_plans(status);

drop trigger if exists trg_marketing_media_plans_updated_at on public.marketing_media_plans;
create trigger trg_marketing_media_plans_updated_at
before update on public.marketing_media_plans
for each row execute function public.marketing_set_updated_at();

-- =========================================================
-- 2) Campanhas
-- =========================================================
create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  objective text,
  audience text,
  segment text,
  start_date date,
  end_date date,
  status text not null default 'planejamento'
    check (status in ('planejamento','ativa','pausada','concluida','arquivada')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaign_dates_valid
    check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists idx_marketing_campaigns_status
  on public.marketing_campaigns(status);
create index if not exists idx_marketing_campaigns_dates
  on public.marketing_campaigns(start_date, end_date);

drop trigger if exists trg_marketing_campaigns_updated_at on public.marketing_campaigns;
create trigger trg_marketing_campaigns_updated_at
before update on public.marketing_campaigns
for each row execute function public.marketing_set_updated_at();

-- =========================================================
-- 3) Conteúdos do calendário editorial e do estúdio
-- =========================================================
create table if not exists public.marketing_content_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.marketing_media_plans(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  title text not null,
  theme text,
  objective text,
  audience text,
  segment text,
  channel text,
  format text,
  status text not null default 'ideia'
    check (status in ('ideia','producao','aprovacao','aprovado','programado','publicado','arquivado')),
  scheduled_for date,
  scheduled_time time,
  art_text text,
  caption text,
  whatsapp_copy text,
  video_script text,
  visual_brief text,
  cta text,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_content_plan_date
  on public.marketing_content_items(plan_id, scheduled_for);
create index if not exists idx_marketing_content_campaign
  on public.marketing_content_items(campaign_id);
create index if not exists idx_marketing_content_status
  on public.marketing_content_items(status);

drop trigger if exists trg_marketing_content_items_updated_at on public.marketing_content_items;
create trigger trg_marketing_content_items_updated_at
before update on public.marketing_content_items
for each row execute function public.marketing_set_updated_at();

-- =========================================================
-- 4) Biblioteca de criativos
-- =========================================================
create table if not exists public.marketing_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  content_id uuid references public.marketing_content_items(id) on delete set null,
  title text not null,
  description text,
  segment text,
  channel text,
  format text,
  caption text,
  usage_instructions text,
  file_path text,
  external_url text,
  mime_type text,
  visibility text not null default 'todos'
    check (visibility in ('todos','parceiros','colaboradores')),
  status text not null default 'rascunho'
    check (status in ('rascunho','aprovacao','publicado','arquivado')),
  valid_until date,
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_creative_has_source
    check (file_path is not null or external_url is not null)
);

create index if not exists idx_marketing_creatives_campaign
  on public.marketing_creatives(campaign_id);
create index if not exists idx_marketing_creatives_status
  on public.marketing_creatives(status);
create index if not exists idx_marketing_creatives_filters
  on public.marketing_creatives(segment, channel, format);

drop trigger if exists trg_marketing_creatives_updated_at on public.marketing_creatives;
create trigger trg_marketing_creatives_updated_at
before update on public.marketing_creatives
for each row execute function public.marketing_set_updated_at();

-- =========================================================
-- 5) RLS
-- Todos os usuários autenticados podem consultar. Somente
-- administradores gerenciam planejamento e materiais oficiais.
-- =========================================================
alter table public.marketing_media_plans enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_content_items enable row level security;
alter table public.marketing_creatives enable row level security;

revoke all on public.marketing_media_plans from anon;
revoke all on public.marketing_campaigns from anon;
revoke all on public.marketing_content_items from anon;
revoke all on public.marketing_creatives from anon;

grant select, insert, update, delete on public.marketing_media_plans to authenticated;
grant select, insert, update, delete on public.marketing_campaigns to authenticated;
grant select, insert, update, delete on public.marketing_content_items to authenticated;
grant select, insert, update, delete on public.marketing_creatives to authenticated;

drop policy if exists "marketing_plans_admin_read" on public.marketing_media_plans;
create policy "marketing_plans_admin_read"
on public.marketing_media_plans for select to authenticated using (public.marketing_is_admin());
drop policy if exists "marketing_plans_admin_insert" on public.marketing_media_plans;
create policy "marketing_plans_admin_insert"
on public.marketing_media_plans for insert to authenticated with check (public.marketing_is_admin());
drop policy if exists "marketing_plans_admin_update" on public.marketing_media_plans;
create policy "marketing_plans_admin_update"
on public.marketing_media_plans for update to authenticated using (public.marketing_is_admin()) with check (public.marketing_is_admin());
drop policy if exists "marketing_plans_admin_delete" on public.marketing_media_plans;
create policy "marketing_plans_admin_delete"
on public.marketing_media_plans for delete to authenticated using (public.marketing_is_admin());

drop policy if exists "marketing_campaigns_admin_read" on public.marketing_campaigns;
create policy "marketing_campaigns_admin_read"
on public.marketing_campaigns for select to authenticated using (public.marketing_is_admin());
drop policy if exists "marketing_campaigns_admin_insert" on public.marketing_campaigns;
create policy "marketing_campaigns_admin_insert"
on public.marketing_campaigns for insert to authenticated with check (public.marketing_is_admin());
drop policy if exists "marketing_campaigns_admin_update" on public.marketing_campaigns;
create policy "marketing_campaigns_admin_update"
on public.marketing_campaigns for update to authenticated using (public.marketing_is_admin()) with check (public.marketing_is_admin());
drop policy if exists "marketing_campaigns_admin_delete" on public.marketing_campaigns;
create policy "marketing_campaigns_admin_delete"
on public.marketing_campaigns for delete to authenticated using (public.marketing_is_admin());

drop policy if exists "marketing_content_admin_read" on public.marketing_content_items;
create policy "marketing_content_admin_read"
on public.marketing_content_items for select to authenticated using (public.marketing_is_admin());
drop policy if exists "marketing_content_admin_insert" on public.marketing_content_items;
create policy "marketing_content_admin_insert"
on public.marketing_content_items for insert to authenticated with check (public.marketing_is_admin());
drop policy if exists "marketing_content_admin_update" on public.marketing_content_items;
create policy "marketing_content_admin_update"
on public.marketing_content_items for update to authenticated using (public.marketing_is_admin()) with check (public.marketing_is_admin());
drop policy if exists "marketing_content_admin_delete" on public.marketing_content_items;
create policy "marketing_content_admin_delete"
on public.marketing_content_items for delete to authenticated using (public.marketing_is_admin());

drop policy if exists "marketing_creatives_authenticated_read" on public.marketing_creatives;
create policy "marketing_creatives_authenticated_read"
on public.marketing_creatives for select to authenticated
using (status = 'publicado' or public.marketing_is_admin());
drop policy if exists "marketing_creatives_admin_insert" on public.marketing_creatives;
create policy "marketing_creatives_admin_insert"
on public.marketing_creatives for insert to authenticated with check (public.marketing_is_admin());
drop policy if exists "marketing_creatives_admin_update" on public.marketing_creatives;
create policy "marketing_creatives_admin_update"
on public.marketing_creatives for update to authenticated using (public.marketing_is_admin()) with check (public.marketing_is_admin());
drop policy if exists "marketing_creatives_admin_delete" on public.marketing_creatives;
create policy "marketing_creatives_admin_delete"
on public.marketing_creatives for delete to authenticated using (public.marketing_is_admin());

-- =========================================================
-- 6) Storage privado de criativos
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('marketing-creatives', 'marketing-creatives', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "marketing_creatives_storage_read" on storage.objects;
create policy "marketing_creatives_storage_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'marketing-creatives'
  and (
    public.marketing_is_admin()
    or exists (
      select 1
      from public.marketing_creatives c
      where c.file_path = name
        and c.status = 'publicado'
    )
  )
);

drop policy if exists "marketing_creatives_storage_admin_insert" on storage.objects;
create policy "marketing_creatives_storage_admin_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'marketing-creatives' and public.marketing_is_admin());

drop policy if exists "marketing_creatives_storage_admin_update" on storage.objects;
create policy "marketing_creatives_storage_admin_update"
on storage.objects for update to authenticated
using (bucket_id = 'marketing-creatives' and public.marketing_is_admin())
with check (bucket_id = 'marketing-creatives' and public.marketing_is_admin());

drop policy if exists "marketing_creatives_storage_admin_delete" on storage.objects;
create policy "marketing_creatives_storage_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'marketing-creatives' and public.marketing_is_admin());
