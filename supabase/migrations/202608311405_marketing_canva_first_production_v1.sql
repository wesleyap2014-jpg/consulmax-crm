-- Canva-first production layer for Central de Conteudo
-- Tokens remain encrypted server-side and are never exposed to the browser.

create table if not exists public.marketing_design_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('canva')),
  provider_user_id text,
  provider_team_id text,
  display_name text,
  status text not null default 'pending' check (status in ('connected','expired','attention','disconnected','pending')),
  scopes text[] not null default '{}',
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_user_id, provider_team_id)
);

create table if not exists public.marketing_design_credentials (
  id uuid primary key default gen_random_uuid(),
  design_connection_id uuid not null unique references public.marketing_design_connections(id) on delete cascade,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  encryption_version integer not null default 1,
  provider_payload_ciphertext text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_design_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  provider text not null check (provider in ('canva')),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_verifier_ciphertext text not null,
  requested_scopes text[] not null default '{}',
  return_path text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_design_oauth_states_active
  on public.marketing_design_oauth_states(provider, expires_at)
  where used_at is null;

create table if not exists public.marketing_canva_template_mappings (
  id uuid primary key default gen_random_uuid(),
  brand_kit_setting_id uuid not null references public.marketing_content_settings(id) on delete cascade,
  format text not null,
  template_family text not null,
  canva_brand_template_id text,
  canva_source_design_id text,
  dataset_schema jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brand_kit_setting_id, format, template_family)
);

create index if not exists idx_marketing_canva_template_mappings_brand
  on public.marketing_canva_template_mappings(brand_kit_setting_id, format, enabled);

drop trigger if exists trg_marketing_design_connections_updated_at on public.marketing_design_connections;
create trigger trg_marketing_design_connections_updated_at
before update on public.marketing_design_connections
for each row execute function public.marketing_set_updated_at();

drop trigger if exists trg_marketing_design_credentials_updated_at on public.marketing_design_credentials;
create trigger trg_marketing_design_credentials_updated_at
before update on public.marketing_design_credentials
for each row execute function public.marketing_set_updated_at();

drop trigger if exists trg_marketing_canva_template_mappings_updated_at on public.marketing_canva_template_mappings;
create trigger trg_marketing_canva_template_mappings_updated_at
before update on public.marketing_canva_template_mappings
for each row execute function public.marketing_set_updated_at();

alter table public.marketing_design_connections enable row level security;
alter table public.marketing_design_credentials enable row level security;
alter table public.marketing_design_oauth_states enable row level security;
alter table public.marketing_canva_template_mappings enable row level security;

revoke all on public.marketing_design_credentials from anon, authenticated;
revoke all on public.marketing_design_oauth_states from anon, authenticated;
revoke all on public.marketing_design_connections from anon;
revoke all on public.marketing_canva_template_mappings from anon;

grant select on public.marketing_design_connections to authenticated;
grant select on public.marketing_canva_template_mappings to authenticated;

drop policy if exists marketing_design_connections_admin_read on public.marketing_design_connections;
create policy marketing_design_connections_admin_read
on public.marketing_design_connections
for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.auth_user_id = (select auth.uid())
      and u.role = 'admin'
  )
);

drop policy if exists marketing_canva_template_mappings_admin_read on public.marketing_canva_template_mappings;
create policy marketing_canva_template_mappings_admin_read
on public.marketing_canva_template_mappings
for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.auth_user_id = (select auth.uid())
      and u.role = 'admin'
  )
);

insert into public.marketing_canva_template_mappings (brand_kit_setting_id, format, template_family, metadata)
select s.id, seed.format, seed.template_family, seed.metadata
from public.marketing_content_settings s
cross join (
  values
    ('carrossel','educativo_premium','{"label":"Carrossel — Educativo Premium","purpose":"Educação, autoridade e salvamento"}'::jsonb),
    ('carrossel','comparacao','{"label":"Carrossel — Comparação","purpose":"Comparar cenários, estratégias ou alternativas"}'::jsonb),
    ('carrossel','storytelling','{"label":"Carrossel — Storytelling","purpose":"Narrativa, caso, história ou jornada"}'::jsonb),
    ('stories','educativo','{"label":"Stories — Educativo","purpose":"Explicação curta em sequência"}'::jsonb),
    ('stories','conversa','{"label":"Stories — Conversa/Enquete","purpose":"Interação, enquete, pergunta e CTA"}'::jsonb),
    ('post','autoridade','{"label":"Post — Autoridade","purpose":"Uma ideia forte com acabamento editorial"}'::jsonb),
    ('reel','thumbnail','{"label":"Reel — Thumbnail","purpose":"Capa de vídeo curta e legível"}'::jsonb),
    ('short','thumbnail','{"label":"Short — Thumbnail","purpose":"Capa vertical de descoberta"}'::jsonb),
    ('youtube_long','thumbnail','{"label":"YouTube — Thumbnail","purpose":"Thumbnail 16:9 de alta clareza"}'::jsonb)
) as seed(format, template_family, metadata)
where s.setting_type = 'brand_kit' and s.name = 'Consulmax Oficial'
on conflict (brand_kit_setting_id, format, template_family) do nothing;
