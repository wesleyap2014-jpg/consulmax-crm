create index if not exists idx_marketing_media_plans_created_by
  on public.marketing_media_plans (created_by);

create index if not exists idx_marketing_campaigns_created_by
  on public.marketing_campaigns (created_by);

create index if not exists idx_marketing_content_items_created_by
  on public.marketing_content_items (created_by);

create index if not exists idx_marketing_content_items_approved_by
  on public.marketing_content_items (approved_by);

create index if not exists idx_marketing_creatives_content_id
  on public.marketing_creatives (content_id);

create index if not exists idx_marketing_creatives_created_by
  on public.marketing_creatives (created_by);
