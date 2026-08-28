-- Estados efemeros para o fluxo OAuth da Central de Contas.
-- Nunca armazena senha ou codigo 2FA das plataformas.

create table if not exists public.marketing_social_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  provider text not null check (provider in ('instagram','facebook','tiktok','linkedin','youtube','whatsapp')),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_scopes text[] not null default '{}',
  return_path text not null default '/marketing/conteudo?tab=config',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz
);

create index if not exists idx_marketing_social_oauth_states_lookup
  on public.marketing_social_oauth_states(state_hash, expires_at)
  where used_at is null;

alter table public.marketing_social_oauth_states enable row level security;
revoke all on table public.marketing_social_oauth_states from anon, authenticated;

comment on table public.marketing_social_oauth_states is
  'Estados CSRF temporarios do OAuth social; acesso exclusivo do backend/service role.';
