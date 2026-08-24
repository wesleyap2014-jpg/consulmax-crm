begin;

create table if not exists public.insurance_sales (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  client_id uuid references public.clientes(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  seller_id uuid not null references public.users(id) on delete restrict,
  client_name text,
  client_document text,
  client_phone text,
  client_email text,
  product text not null check (product in ('Automóvel','Patrimonial','Vida')),
  product_group text not null,
  insurer text not null check (length(btrim(insurer)) >= 2),
  proposal_number text not null check (length(btrim(proposal_number)) >= 1),
  policy_number text,
  sale_date date not null default current_date,
  coverage_start date,
  coverage_end date,
  net_premium numeric(14,2) not null default 0 check (net_premium >= 0),
  iof numeric(14,2) not null default 0 check (iof >= 0),
  total_premium numeric(14,2) generated always as (net_premium + iof) stored,
  commission_pct numeric(8,4) not null default 0 check (commission_pct >= 0 and commission_pct <= 100),
  commission_amount numeric(14,2) generated always as (round((net_premium * commission_pct / 100.0)::numeric, 2)) stored,
  commission_installments integer not null default 1 check (commission_installments between 1 and 60),
  proposal_status text not null default 'registrada' check (proposal_status in (
    'registrada','em_analise','documentos_pendentes','vistoria_pendente','vistoria_agendada',
    'vistoria_realizada','pendencia_seguradora','aprovada','recusada','apolice_emitida'
  )),
  inspection_required boolean not null default false,
  inspection_status text not null default 'nao_aplicavel' check (inspection_status in (
    'nao_aplicavel','pendente','agendada','realizada','aprovada','reprovada'
  )),
  inspection_date date,
  rejection_reason text,
  policy_status text not null default 'pre_emissao' check (policy_status in (
    'pre_emissao','ativa','inadimplente','potencial_cancelamento','cancelada','vencida','em_renovacao','renovada'
  )),
  cancellation_reason text,
  cancelled_at timestamptz,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insurance_sales_product_group_check check (
    (product = 'Automóvel' and product_group in ('Auto Individual','Auto Frota')) or
    (product = 'Patrimonial' and product_group in ('Empresarial','Residencial','Multirrisco Rural')) or
    (product = 'Vida' and product_group in ('Vida Individual','Vida em Grupo'))
  ),
  constraint insurance_sales_coverage_dates_check check (
    coverage_start is null or coverage_end is null or coverage_end >= coverage_start
  )
);

alter table public.insurance_sales add column if not exists client_name text;
alter table public.insurance_sales add column if not exists client_document text;
alter table public.insurance_sales add column if not exists client_phone text;
alter table public.insurance_sales add column if not exists client_email text;

create index if not exists insurance_sales_lead_idx on public.insurance_sales(lead_id);
create index if not exists insurance_sales_client_idx on public.insurance_sales(client_id);
create index if not exists insurance_sales_seller_idx on public.insurance_sales(seller_id);
create index if not exists insurance_sales_unit_idx on public.insurance_sales(unit_id);
create index if not exists insurance_sales_policy_status_idx on public.insurance_sales(policy_status);
create index if not exists insurance_sales_proposal_status_idx on public.insurance_sales(proposal_status);
create index if not exists insurance_sales_coverage_end_idx on public.insurance_sales(coverage_end);
create index if not exists insurance_sales_client_name_idx on public.insurance_sales(client_name);

create table if not exists public.insurance_documents (
  id uuid primary key default gen_random_uuid(),
  insurance_id uuid not null references public.insurance_sales(id) on delete cascade,
  document_type text not null check (document_type in ('proposta','apolice','vistoria','endosso','boleto','comprovante','outro')),
  file_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists insurance_documents_insurance_idx on public.insurance_documents(insurance_id);

create table if not exists public.insurance_events (
  id uuid primary key default gen_random_uuid(),
  insurance_id uuid not null references public.insurance_sales(id) on delete cascade,
  event_type text not null,
  title text not null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists insurance_events_insurance_idx on public.insurance_events(insurance_id, created_at desc);

alter table public.insurance_sales enable row level security;
alter table public.insurance_documents enable row level security;
alter table public.insurance_events enable row level security;

grant select, insert, update, delete on public.insurance_sales to authenticated;
grant select, insert, delete on public.insurance_documents to authenticated;
grant select, insert on public.insurance_events to authenticated;

drop policy if exists insurance_sales_select on public.insurance_sales;
create policy insurance_sales_select on public.insurance_sales
for select to authenticated
using (
  public.is_admin_auth()
  or seller_id = (select u.id from public.users u where u.auth_user_id = (select auth.uid()) limit 1)
  or exists (
    select 1
    from public.users cu
    left join public.units un on un.id = cu.unit_id
    where cu.auth_user_id = (select auth.uid())
      and coalesce(cu.is_active, true)
      and (
        un.tipo = 'matriz'
        or (cu.hierarchy_level = 'gestor_filial' and cu.unit_id = insurance_sales.unit_id)
      )
  )
);

drop policy if exists insurance_sales_insert on public.insurance_sales;
create policy insurance_sales_insert on public.insurance_sales
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    public.is_admin_auth()
    or seller_id = (select u.id from public.users u where u.auth_user_id = (select auth.uid()) limit 1)
    or exists (
      select 1
      from public.users cu
      left join public.units un on un.id = cu.unit_id
      where cu.auth_user_id = (select auth.uid())
        and coalesce(cu.is_active, true)
        and (
          un.tipo = 'matriz'
          or (cu.hierarchy_level = 'gestor_filial' and cu.unit_id = insurance_sales.unit_id)
        )
    )
  )
);

drop policy if exists insurance_sales_update on public.insurance_sales;
create policy insurance_sales_update on public.insurance_sales
for update to authenticated
using (
  public.is_admin_auth()
  or seller_id = (select u.id from public.users u where u.auth_user_id = (select auth.uid()) limit 1)
  or exists (
    select 1
    from public.users cu
    left join public.units un on un.id = cu.unit_id
    where cu.auth_user_id = (select auth.uid())
      and coalesce(cu.is_active, true)
      and (
        un.tipo = 'matriz'
        or (cu.hierarchy_level = 'gestor_filial' and cu.unit_id = insurance_sales.unit_id)
      )
  )
)
with check (
  public.is_admin_auth()
  or seller_id = (select u.id from public.users u where u.auth_user_id = (select auth.uid()) limit 1)
  or exists (
    select 1
    from public.users cu
    left join public.units un on un.id = cu.unit_id
    where cu.auth_user_id = (select auth.uid())
      and coalesce(cu.is_active, true)
      and (
        un.tipo = 'matriz'
        or (cu.hierarchy_level = 'gestor_filial' and cu.unit_id = insurance_sales.unit_id)
      )
  )
);

drop policy if exists insurance_sales_delete on public.insurance_sales;
create policy insurance_sales_delete on public.insurance_sales
for delete to authenticated
using (public.is_admin_auth());

drop policy if exists insurance_documents_select on public.insurance_documents;
create policy insurance_documents_select on public.insurance_documents
for select to authenticated
using (exists (select 1 from public.insurance_sales s where s.id = insurance_documents.insurance_id));

drop policy if exists insurance_documents_insert on public.insurance_documents;
create policy insurance_documents_insert on public.insurance_documents
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (select 1 from public.insurance_sales s where s.id = insurance_documents.insurance_id)
);

drop policy if exists insurance_documents_delete on public.insurance_documents;
create policy insurance_documents_delete on public.insurance_documents
for delete to authenticated
using (uploaded_by = (select auth.uid()) or public.is_admin_auth());

drop policy if exists insurance_events_select on public.insurance_events;
create policy insurance_events_select on public.insurance_events
for select to authenticated
using (exists (select 1 from public.insurance_sales s where s.id = insurance_events.insurance_id));

drop policy if exists insurance_events_insert on public.insurance_events;
create policy insurance_events_insert on public.insurance_events
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (select 1 from public.insurance_sales s where s.id = insurance_events.insurance_id)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('insurance-documents', 'insurance-documents', false, 20971520, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists insurance_documents_storage_insert on storage.objects;
create policy insurance_documents_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'insurance-documents'
  and owner_id = (select auth.uid())::text
  and lower(storage.extension(name)) = 'pdf'
);

drop policy if exists insurance_documents_storage_select on storage.objects;
create policy insurance_documents_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'insurance-documents'
  and (
    owner_id = (select auth.uid())::text
    or exists (
      select 1 from public.insurance_documents d
      where d.file_path = storage.objects.name
        and exists (select 1 from public.insurance_sales s where s.id = d.insurance_id)
    )
  )
);

drop policy if exists insurance_documents_storage_update on storage.objects;
create policy insurance_documents_storage_update on storage.objects
for update to authenticated
using (bucket_id = 'insurance-documents' and (owner_id = (select auth.uid())::text or public.is_admin_auth()))
with check (bucket_id = 'insurance-documents' and (owner_id = (select auth.uid())::text or public.is_admin_auth()));

drop policy if exists insurance_documents_storage_delete on storage.objects;
create policy insurance_documents_storage_delete on storage.objects
for delete to authenticated
using (bucket_id = 'insurance-documents' and (owner_id = (select auth.uid())::text or public.is_admin_auth()));

create or replace function public.insurance_visible_sellers()
returns table(id uuid, auth_user_id uuid, nome text, email text, unit_id uuid, hierarchy_level text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select u.id, u.auth_user_id, u.unit_id, u.hierarchy_level, u.role, un.tipo as unit_type
    from public.users u
    left join public.units un on un.id = u.unit_id
    where u.auth_user_id = auth.uid() and coalesce(u.is_active, true)
    limit 1
  )
  select u.id, u.auth_user_id, u.nome, u.email, u.unit_id, u.hierarchy_level
  from public.users u
  cross join me
  where coalesce(u.is_active, true)
    and (
      public.is_admin_auth()
      or me.unit_type = 'matriz'
      or (me.hierarchy_level = 'gestor_filial' and u.unit_id = me.unit_id)
      or u.auth_user_id = auth.uid()
    )
  order by u.nome;
$$;
revoke all on function public.insurance_visible_sellers() from public, anon;
grant execute on function public.insurance_visible_sellers() to authenticated;

create or replace function public.insurance_client_candidates()
returns table(
  opportunity_id uuid,
  opportunity_created_at timestamptz,
  lead_id uuid,
  client_id uuid,
  client_name text,
  client_document text,
  client_phone text,
  client_email text,
  seller_auth_user_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select u.id, u.auth_user_id, u.unit_id, u.hierarchy_level, un.tipo as unit_type
    from public.users u
    left join public.units un on un.id = u.unit_id
    where u.auth_user_id = auth.uid() and coalesce(u.is_active, true)
    limit 1
  )
  select
    o.id as opportunity_id,
    o.created_at as opportunity_created_at,
    l.id as lead_id,
    c.id as client_id,
    coalesce(nullif(btrim(c.nome), ''), l.nome) as client_name,
    c.cpf as client_document,
    coalesce(nullif(btrim(c.telefone), ''), l.telefone) as client_phone,
    coalesce(nullif(btrim(c.email), ''), l.email) as client_email,
    o.vendedor_id as seller_auth_user_id
  from public.opportunities o
  join public.leads l on l.id = o.lead_id
  left join lateral (
    select c0.id, c0.nome, c0.cpf, c0.telefone, c0.email
    from public.clientes c0
    where c0.lead_id = l.id
    order by c0.created_at desc nulls last
    limit 1
  ) c on true
  left join public.users seller on seller.auth_user_id = o.vendedor_id
  cross join me
  where
    public.is_admin_auth()
    or me.unit_type = 'matriz'
    or (me.hierarchy_level = 'gestor_filial' and seller.unit_id = me.unit_id)
    or o.vendedor_id = auth.uid()
    or o.owner_id = auth.uid()
  order by o.created_at desc;
$$;
revoke all on function public.insurance_client_candidates() from public, anon;
grant execute on function public.insurance_client_candidates() to authenticated;

update public.access_profiles
set permissions = jsonb_set(
  coalesce(permissions, '{}'::jsonb),
  '{seguros}',
  coalesce(permissions->'seguros', permissions->'carteira', jsonb_build_object('view', true, 'information', '{}'::jsonb, 'actions', '{}'::jsonb)),
  true
)
where not (coalesce(permissions, '{}'::jsonb) ? 'seguros');

commit;
