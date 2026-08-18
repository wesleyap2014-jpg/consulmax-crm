alter table public.marketing_newsletter_recipients
  drop constraint if exists marketing_newsletter_recipients_source_type_check;

alter table public.marketing_newsletter_recipients
  add constraint marketing_newsletter_recipients_source_type_check
  check (source_type in ('cliente','parceiro','lead','usuario','arquivo','manual'));
