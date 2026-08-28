create table if not exists public.marketing_production_orders (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.marketing_content_items(id) on delete cascade,
  variant_id uuid unique references public.marketing_content_variants(id) on delete set null,
  provider text not null,
  format text not null,
  title text,
  status text not null default 'aguardando_producao' check (status in (
    'aguardando_producao','aguardando_insumos','recebendo_cortes','pronto_ia','produzindo','em_revisao','pronto_aprovacao','aprovado','ajuste_solicitado','falhou'
  )),
  brand_kit_setting_id uuid references public.marketing_content_settings(id) on delete set null,
  blueprint jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  approved_editorially_at timestamptz,
  started_at timestamptz,
  produced_at timestamptz,
  sent_for_approval_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_production_orders_content_idx on public.marketing_production_orders(content_id);
create index if not exists marketing_production_orders_status_idx on public.marketing_production_orders(status);
create index if not exists marketing_production_orders_brand_idx on public.marketing_production_orders(brand_kit_setting_id);

alter table public.marketing_production_orders enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketing_production_orders' and policyname='marketing_production_orders_admin_select') then
    create policy marketing_production_orders_admin_select on public.marketing_production_orders for select to authenticated using (marketing_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketing_production_orders' and policyname='marketing_production_orders_admin_insert') then
    create policy marketing_production_orders_admin_insert on public.marketing_production_orders for insert to authenticated with check (marketing_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketing_production_orders' and policyname='marketing_production_orders_admin_update') then
    create policy marketing_production_orders_admin_update on public.marketing_production_orders for update to authenticated using (marketing_is_admin()) with check (marketing_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketing_production_orders' and policyname='marketing_production_orders_admin_delete') then
    create policy marketing_production_orders_admin_delete on public.marketing_production_orders for delete to authenticated using (marketing_is_admin());
  end if;
end $$;

alter table public.marketing_content_assets add column if not exists production_order_id uuid references public.marketing_production_orders(id) on delete set null;
alter table public.marketing_content_assets add column if not exists asset_role text;
create index if not exists marketing_content_assets_production_order_idx on public.marketing_content_assets(production_order_id);

insert into public.marketing_production_orders (
  content_id, variant_id, provider, format, title, status, brand_kit_setting_id, blueprint, metadata, created_by, approved_editorially_at
)
select
  v.content_id,
  v.id,
  v.provider,
  v.format,
  v.title,
  case when lower(v.format) in ('reel','video','short','youtube_long') then 'aguardando_insumos' else 'aguardando_producao' end,
  (select s.id from public.marketing_content_settings s where s.setting_type='brand_kit' and s.active=true order by s.created_at asc limit 1),
  coalesce(v.ai_generation_metadata->'blueprint','{}'::jsonb),
  jsonb_build_object('source','content_engine_v2_backfill','validation',coalesce(v.ai_generation_metadata->'validation','{}'::jsonb)),
  v.created_by,
  coalesce(c.approved_at, now())
from public.marketing_content_variants v
join public.marketing_content_items c on c.id=v.content_id
where v.status='producao'
  and v.ai_generation_metadata->>'motor_version'='content_engine_v2'
  and not exists (select 1 from public.marketing_production_orders po where po.variant_id=v.id);
