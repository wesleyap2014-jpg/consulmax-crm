alter table public.whatsapp_campaigns
  add column if not exists template_category text;

notify pgrst, 'reload schema';
