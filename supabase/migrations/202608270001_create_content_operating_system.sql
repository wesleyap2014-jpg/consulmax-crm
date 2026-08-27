-- Central de Conteudo / Content OS Consulmax
-- Evolui a Central de Marketing existente sem quebrar tabelas ou fluxos legados.
-- Nenhuma senha ou codigo de 2FA de redes sociais e armazenado neste schema.

create extension if not exists "pgcrypto";

-- =========================================================
-- 1) Central de Contas
-- =========================================================
create table if not exists public.marketing_social_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('instagram','facebook','tiktok','linkedin','youtube','whatsapp')),
  provider_account_id text,
  username text,
  display_name text,
  account_type text,
  avatar_url text,
  editorial_role text,
  is_default boolean not null default false,
  status text not null default 'connected'
    check (status in ('connected','expired','attention','disconnected','pending')),
  scopes text[] not null default '{}',
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_account_id)
);

create index if not exists idx_marketing_social_accounts_provider_status
  on public.marketing_social_accounts(provider, status);

-- Credenciais OAuth ficam isoladas do cliente web. Tokens devem chegar aqui
-- somente pelo backend e cifrados com chave mantida fora do banco.
create table if not exists public.marketing_social_credentials (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid not null unique references public.marketing_social_accounts(id) on delete cascade,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  encryption_version integer not null default 1,
  provider_payload_ciphertext text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- 2) Ideias e Conteudo-Mae
-- =========================================================
create table if not exists public.marketing_content_ideas (
  id uuid primary key default gen_random_uuid(),
  title text,
  raw_input text not null,
  source_type text not null default 'manual'
    check (source_type in ('manual','audio','video','link','comment','meeting','radar','ai','customer','news','other')),
  source_url text,
  source_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'inbox'
    check (status in ('inbox','selected','converted','discarded','archived')),
  converted_content_id uuid references public.marketing_content_items(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketing_content_items
  add column if not exists thesis text,
  add column if not exists content_pillar text,
  add column if not exists source_type text,
  add column if not exists source_idea_id uuid references public.marketing_content_ideas(id) on delete set null,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb,
  add column if not exists primary_account_id uuid references public.marketing_social_accounts(id) on delete set null,
  add column if not exists head_recommendation text,
  add column if not exists ai_context jsonb not null default '{}'::jsonb;

create index if not exists idx_marketing_content_source_idea
  on public.marketing_content_items(source_idea_id);
create index if not exists idx_marketing_content_primary_account
  on public.marketing_content_items(primary_account_id);

create table if not exists public.marketing_content_variants (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.marketing_content_items(id) on delete cascade,
  social_account_id uuid references public.marketing_social_accounts(id) on delete set null,
  provider text not null check (provider in ('instagram','facebook','tiktok','linkedin','youtube','whatsapp','email','blog')),
  format text not null,
  title text,
  hook text,
  body text,
  caption text,
  script text,
  cta text,
  hashtags text[] not null default '{}',
  creative_brief text,
  duration_seconds integer,
  aspect_ratio text,
  status text not null default 'rascunho'
    check (status in ('rascunho','producao','aprovacao','aprovado','agendado','publicado','rejeitado','arquivado')),
  planned_at timestamptz,
  published_at timestamptz,
  provider_post_id text,
  provider_post_url text,
  ai_generation_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_content_variants_content
  on public.marketing_content_variants(content_id);
create index if not exists idx_marketing_content_variants_schedule
  on public.marketing_content_variants(status, planned_at);
create index if not exists idx_marketing_content_variants_provider
  on public.marketing_content_variants(provider, format);

-- =========================================================
-- 3) Assets e Estudio de Video
-- =========================================================
create table if not exists public.marketing_content_assets (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references public.marketing_content_items(id) on delete cascade,
  variant_id uuid references public.marketing_content_variants(id) on delete cascade,
  kind text not null check (kind in ('image','video','audio','document','thumbnail','subtitle','other')),
  file_path text not null,
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  duration_seconds numeric(10,3),
  width integer,
  height integer,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_content_assets_content
  on public.marketing_content_assets(content_id);

create table if not exists public.marketing_video_projects (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references public.marketing_content_items(id) on delete set null,
  title text not null,
  objective text,
  target_duration_seconds integer,
  target_format text,
  instructions text,
  transcript text,
  edit_plan jsonb not null default '{}'::jsonb,
  render_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'upload'
    check (status in ('upload','analyzing','edit_plan','editing','rendering','review','approved','failed','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_video_clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.marketing_video_projects(id) on delete cascade,
  asset_id uuid references public.marketing_content_assets(id) on delete set null,
  sort_order integer,
  source_order integer,
  transcript text,
  start_seconds numeric(10,3),
  end_seconds numeric(10,3),
  selected boolean not null default true,
  quality_score numeric(5,2),
  narrative_role text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_video_clips_project
  on public.marketing_video_clips(project_id, sort_order);

-- =========================================================
-- 4) Aprovacao, agenda e publicacao
-- =========================================================
create table if not exists public.marketing_content_approvals (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references public.marketing_content_items(id) on delete cascade,
  variant_id uuid references public.marketing_content_variants(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','approved','changes_requested','rejected')),
  requested_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint marketing_approval_target check (content_id is not null or variant_id is not null)
);

create table if not exists public.marketing_publications (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.marketing_content_variants(id) on delete cascade,
  social_account_id uuid references public.marketing_social_accounts(id) on delete set null,
  scheduled_at timestamptz,
  started_at timestamptz,
  published_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','scheduled','publishing','published','failed','cancelled')),
  provider_post_id text,
  provider_post_url text,
  error_code text,
  error_message text,
  retry_count integer not null default 0,
  provider_response jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_publications_schedule
  on public.marketing_publications(status, scheduled_at);

-- =========================================================
-- 5) Radar de Mercado e Pulso do Algoritmo
-- =========================================================
create table if not exists public.marketing_market_profiles (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('instagram','facebook','tiktok','linkedin','youtube','other')),
  handle text not null,
  display_name text,
  profile_url text,
  profile_type text not null default 'competitor'
    check (profile_type in ('competitor','reference','administrator','creator','other')),
  segment text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, handle)
);

create table if not exists public.marketing_market_observations (
  id uuid primary key default gen_random_uuid(),
  market_profile_id uuid not null references public.marketing_market_profiles(id) on delete cascade,
  provider_post_id text,
  post_url text,
  published_at timestamptz,
  observed_at timestamptz not null default now(),
  format text,
  topic text,
  hook text,
  cta text,
  transcript text,
  duration_seconds numeric(10,3),
  followers_snapshot bigint,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  performance_index numeric(10,4),
  analysis jsonb not null default '{}'::jsonb,
  raw_public_metrics jsonb not null default '{}'::jsonb,
  unique(market_profile_id, provider_post_id, observed_at)
);

create index if not exists idx_marketing_market_observations_recent
  on public.marketing_market_observations(observed_at desc);
create index if not exists idx_marketing_market_observations_topic
  on public.marketing_market_observations(topic, format);

create table if not exists public.marketing_algorithm_pulses (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('instagram','facebook','tiktok','linkedin','youtube')),
  dimension_type text not null check (dimension_type in ('general','topic','format','hook','duration','structure')),
  dimension_value text not null,
  score numeric(5,2) not null check (score between 0 and 100),
  confidence numeric(5,2) not null check (confidence between 0 and 100),
  stage text not null check (stage in ('emergente','aquecendo','quente','saturando','esfriando','estavel')),
  sample_size integer not null default 0,
  period_start timestamptz not null,
  period_end timestamptz not null,
  evidence jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

create index if not exists idx_marketing_algorithm_pulses_provider_generated
  on public.marketing_algorithm_pulses(provider, generated_at desc);

-- =========================================================
-- 6) Analytics e atribuicao CRM
-- =========================================================
create table if not exists public.marketing_content_metrics (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.marketing_content_variants(id) on delete cascade,
  captured_at timestamptz not null default now(),
  views bigint,
  reach bigint,
  impressions bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  clicks bigint,
  watch_time_seconds numeric(16,3),
  avg_watch_time_seconds numeric(12,3),
  completion_rate numeric(8,4),
  non_follower_reach bigint,
  followers_delta bigint,
  raw_metrics jsonb not null default '{}'::jsonb
);

create index if not exists idx_marketing_content_metrics_variant_time
  on public.marketing_content_metrics(variant_id, captured_at desc);

create table if not exists public.marketing_content_attributions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references public.marketing_content_items(id) on delete set null,
  variant_id uuid references public.marketing_content_variants(id) on delete set null,
  entity_type text not null check (entity_type in ('lead','opportunity','proposal','sale')),
  entity_id uuid not null,
  attribution_type text not null default 'last_touch'
    check (attribution_type in ('first_touch','last_touch','assisted','manual')),
  value numeric(16,2),
  metadata jsonb not null default '{}'::jsonb,
  attributed_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_marketing_content_attributions_content
  on public.marketing_content_attributions(content_id, entity_type);
create index if not exists idx_marketing_content_attributions_entity
  on public.marketing_content_attributions(entity_type, entity_id);

-- =========================================================
-- 7) Configuracoes: Brand Kit, personas, linha editorial, IA, automacoes
-- =========================================================
create table if not exists public.marketing_content_settings (
  id uuid primary key default gen_random_uuid(),
  setting_type text not null check (setting_type in ('brand_kit','persona','editorial_line','ai_rule','automation','channel_rule')),
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(setting_type, name)
);

-- =========================================================
-- 8) Triggers de updated_at
-- =========================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'marketing_social_accounts',
    'marketing_social_credentials',
    'marketing_content_ideas',
    'marketing_content_variants',
    'marketing_video_projects',
    'marketing_video_clips',
    'marketing_publications',
    'marketing_market_profiles',
    'marketing_content_settings'
  ]
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.marketing_set_updated_at()', t, t);
  end loop;
end $$;

-- =========================================================
-- 9) RLS
-- A Central de Conteudo segue o modelo atual do Marketing: admins gerenciam.
-- A tabela de credenciais nao possui grants/policies para authenticated.
-- =========================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'marketing_social_accounts',
    'marketing_social_credentials',
    'marketing_content_ideas',
    'marketing_content_variants',
    'marketing_content_assets',
    'marketing_video_projects',
    'marketing_video_clips',
    'marketing_content_approvals',
    'marketing_publications',
    'marketing_market_profiles',
    'marketing_market_observations',
    'marketing_algorithm_pulses',
    'marketing_content_metrics',
    'marketing_content_attributions',
    'marketing_content_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Credenciais: somente service_role/backend. Nenhum grant ao authenticated.
revoke all on public.marketing_social_credentials from authenticated;

-- Demais tabelas: leitura e gestao apenas por admins via RLS.
do $$
declare
  t text;
  pfx text;
begin
  foreach t in array array[
    'marketing_social_accounts',
    'marketing_content_ideas',
    'marketing_content_variants',
    'marketing_content_assets',
    'marketing_video_projects',
    'marketing_video_clips',
    'marketing_content_approvals',
    'marketing_publications',
    'marketing_market_profiles',
    'marketing_market_observations',
    'marketing_algorithm_pulses',
    'marketing_content_metrics',
    'marketing_content_attributions',
    'marketing_content_settings'
  ]
  loop
    pfx := t || '_admin';
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', pfx || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.marketing_is_admin())', pfx || '_select', t);
    execute format('drop policy if exists %I on public.%I', pfx || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.marketing_is_admin())', pfx || '_insert', t);
    execute format('drop policy if exists %I on public.%I', pfx || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.marketing_is_admin()) with check (public.marketing_is_admin())', pfx || '_update', t);
    execute format('drop policy if exists %I on public.%I', pfx || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.marketing_is_admin())', pfx || '_delete', t);
  end loop;
end $$;

-- =========================================================
-- 10) Storage privado para fotos, videos brutos, audios e renders
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('marketing-content-assets', 'marketing-content-assets', false, 524288000)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "marketing_content_assets_storage_read" on storage.objects;
create policy "marketing_content_assets_storage_read"
on storage.objects for select to authenticated
using (bucket_id = 'marketing-content-assets' and public.marketing_is_admin());

drop policy if exists "marketing_content_assets_storage_insert" on storage.objects;
create policy "marketing_content_assets_storage_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'marketing-content-assets' and public.marketing_is_admin());

drop policy if exists "marketing_content_assets_storage_update" on storage.objects;
create policy "marketing_content_assets_storage_update"
on storage.objects for update to authenticated
using (bucket_id = 'marketing-content-assets' and public.marketing_is_admin())
with check (bucket_id = 'marketing-content-assets' and public.marketing_is_admin());

drop policy if exists "marketing_content_assets_storage_delete" on storage.objects;
create policy "marketing_content_assets_storage_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'marketing-content-assets' and public.marketing_is_admin());
