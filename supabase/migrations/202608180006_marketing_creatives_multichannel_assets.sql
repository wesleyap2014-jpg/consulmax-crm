alter table public.marketing_creatives
  add column if not exists channels text[] not null default '{}';

update public.marketing_creatives
set channels = array[channel]
where coalesce(cardinality(channels), 0) = 0
  and channel is not null
  and btrim(channel) <> '';

create index if not exists idx_marketing_creatives_channels
  on public.marketing_creatives using gin(channels);

create table if not exists public.marketing_creative_assets (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references public.marketing_creatives(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  file_path text,
  external_url text,
  mime_type text,
  file_name text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_seconds numeric(10,2) check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default now(),
  constraint marketing_creative_asset_has_source
    check (file_path is not null or external_url is not null)
);

create unique index if not exists idx_marketing_creative_assets_position
  on public.marketing_creative_assets(creative_id, position);
create index if not exists idx_marketing_creative_assets_creative
  on public.marketing_creative_assets(creative_id);

alter table public.marketing_creative_assets enable row level security;
revoke all on public.marketing_creative_assets from anon;
grant select, insert, update, delete on public.marketing_creative_assets to authenticated;

drop policy if exists "marketing_creative_assets_authenticated_read" on public.marketing_creative_assets;
create policy "marketing_creative_assets_authenticated_read"
on public.marketing_creative_assets for select to authenticated
using (
  public.marketing_is_admin()
  or exists (
    select 1 from public.marketing_creatives c
    where c.id = creative_id and c.status = 'publicado'
  )
);

drop policy if exists "marketing_creative_assets_admin_insert" on public.marketing_creative_assets;
create policy "marketing_creative_assets_admin_insert"
on public.marketing_creative_assets for insert to authenticated
with check (public.marketing_is_admin());

drop policy if exists "marketing_creative_assets_admin_update" on public.marketing_creative_assets;
create policy "marketing_creative_assets_admin_update"
on public.marketing_creative_assets for update to authenticated
using (public.marketing_is_admin()) with check (public.marketing_is_admin());

drop policy if exists "marketing_creative_assets_admin_delete" on public.marketing_creative_assets;
create policy "marketing_creative_assets_admin_delete"
on public.marketing_creative_assets for delete to authenticated
using (public.marketing_is_admin());

insert into public.marketing_creative_assets (
  creative_id, position, file_path, external_url, mime_type, file_name
)
select
  c.id,
  0,
  c.file_path,
  c.external_url,
  c.mime_type,
  case
    when c.file_path is not null then regexp_replace(c.file_path, '^.*/', '')
    else null
  end
from public.marketing_creatives c
where (c.file_path is not null or c.external_url is not null)
  and not exists (
    select 1 from public.marketing_creative_assets a where a.creative_id = c.id
  );

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
    or exists (
      select 1
      from public.marketing_creative_assets a
      join public.marketing_creatives c on c.id = a.creative_id
      where a.file_path = name
        and c.status = 'publicado'
    )
  )
);