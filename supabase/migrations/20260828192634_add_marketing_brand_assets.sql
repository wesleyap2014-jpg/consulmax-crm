-- Ativos oficiais do Brand Kit: logos e fontes privadas vinculadas às configurações editoriais.
create table if not exists public.marketing_brand_assets (
  id uuid primary key default gen_random_uuid(),
  setting_id uuid not null references public.marketing_content_settings(id) on delete cascade,
  asset_type text not null check (asset_type in ('logo','font','reference')),
  role text not null default 'variacao',
  file_path text not null unique,
  file_name text not null,
  mime_type text,
  file_size_bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketing_brand_assets enable row level security;
grant select, insert, update, delete on public.marketing_brand_assets to authenticated;

create policy marketing_brand_assets_admin_select
on public.marketing_brand_assets for select
to authenticated
using (public.marketing_is_admin());

create policy marketing_brand_assets_admin_insert
on public.marketing_brand_assets for insert
to authenticated
with check (public.marketing_is_admin());

create policy marketing_brand_assets_admin_update
on public.marketing_brand_assets for update
to authenticated
using (public.marketing_is_admin())
with check (public.marketing_is_admin());

create policy marketing_brand_assets_admin_delete
on public.marketing_brand_assets for delete
to authenticated
using (public.marketing_is_admin());

insert into storage.buckets (id, name, public, file_size_limit)
values ('marketing-brand-assets', 'marketing-brand-assets', false, 26214400)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy marketing_brand_assets_storage_select
on storage.objects for select
to authenticated
using (bucket_id = 'marketing-brand-assets' and public.marketing_is_admin());

create policy marketing_brand_assets_storage_insert
on storage.objects for insert
to authenticated
with check (bucket_id = 'marketing-brand-assets' and public.marketing_is_admin());

create policy marketing_brand_assets_storage_update
on storage.objects for update
to authenticated
using (bucket_id = 'marketing-brand-assets' and public.marketing_is_admin())
with check (bucket_id = 'marketing-brand-assets' and public.marketing_is_admin());

create policy marketing_brand_assets_storage_delete
on storage.objects for delete
to authenticated
using (bucket_id = 'marketing-brand-assets' and public.marketing_is_admin());
