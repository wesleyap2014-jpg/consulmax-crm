begin;

create index if not exists insurance_documents_uploaded_by_idx on public.insurance_documents(uploaded_by);
create index if not exists insurance_events_created_by_idx on public.insurance_events(created_by);
create index if not exists insurance_sales_created_by_idx on public.insurance_sales(created_by);
create index if not exists insurance_sales_opportunity_idx on public.insurance_sales(opportunity_id);

commit;
