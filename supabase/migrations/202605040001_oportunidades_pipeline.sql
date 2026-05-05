-- Pipeline comercial avançado para Oportunidades
-- CRM Consulmax • novos campos e histórico organizado

create extension if not exists "uuid-ossp";

alter table public.opportunities
  add column if not exists credito_desejado numeric,
  add column if not exists parcela_desejada numeric,
  add column if not exists lance_disponivel numeric,
  add column if not exists prazo_contemplacao text,
  add column if not exists finalidade_recurso text,
  add column if not exists reuniao_at timestamptz,
  add column if not exists reuniao_tipo text,
  add column if not exists reuniao_link text,
  add column if not exists proposta_id uuid,
  add column if not exists fechamento_previsto_em date,
  add column if not exists documentos_pendentes text,
  add column if not exists lost_reason text,
  add column if not exists lost_details text,
  add column if not exists won_at timestamptz,
  add column if not exists lost_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_opportunities_lead_id on public.opportunities(lead_id);
create index if not exists idx_opportunities_vendedor_id on public.opportunities(vendedor_id);
create index if not exists idx_opportunities_estagio on public.opportunities(estagio);
create index if not exists idx_opportunities_expected_close_at on public.opportunities(expected_close_at);

create table if not exists public.opportunity_notes (
  id uuid primary key default uuid_generate_v4(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  user_id uuid,
  note text not null,
  kind text not null default 'manual',
  created_at timestamptz not null default now()
);

create index if not exists idx_opportunity_notes_opportunity_id on public.opportunity_notes(opportunity_id);
create index if not exists idx_opportunity_notes_lead_id on public.opportunity_notes(lead_id);
create index if not exists idx_opportunity_notes_created_at on public.opportunity_notes(created_at desc);

alter table public.agenda_eventos
  add column if not exists opportunity_id uuid references public.opportunities(id) on delete set null,
  add column if not exists meeting_link text;

create index if not exists idx_agenda_eventos_opportunity_id on public.agenda_eventos(opportunity_id);
