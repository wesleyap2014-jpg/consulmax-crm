-- Modalidades de lance: configuração aditiva, sem alterar groups/assembly_results.
create table if not exists public.group_bid_modality_rules (
  id uuid primary key default gen_random_uuid(),
  administradora text not null,
  scope text not null check (scope in ('administradora','segmento','grupo')),
  segmento text not null default '',
  group_id uuid references public.groups(id) on delete cascade,
  modalities jsonb not null default '[]'::jsonb check (jsonb_typeof(modalities) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_bid_scope_check check (
    (scope = 'administradora' and segmento = '' and group_id is null) or
    (scope = 'segmento' and segmento <> '' and group_id is null) or
    (scope = 'grupo' and group_id is not null)
  )
);
create unique index if not exists group_bid_rule_admin_key on public.group_bid_modality_rules (lower(administradora)) where scope = 'administradora';
create unique index if not exists group_bid_rule_segment_key on public.group_bid_modality_rules (lower(administradora), lower(segmento)) where scope = 'segmento';
create unique index if not exists group_bid_rule_group_key on public.group_bid_modality_rules (group_id) where scope = 'grupo';
create index if not exists group_bid_rules_admin_idx on public.group_bid_modality_rules (administradora, scope);
alter table public.group_bid_modality_rules enable row level security;
-- Regras são consultáveis pela equipe autenticada; gravação apenas usuários com acesso aprovado
-- Ajustar política de escrita ao permissionamento de backend antes da ativação em produção.
create policy "group_bid_modality_rules_select" on public.group_bid_modality_rules
  for select to authenticated using (true);
create policy "group_bid_modality_rules_insert" on public.group_bid_modality_rules
  for insert to authenticated with check (true);
create policy "group_bid_modality_rules_update" on public.group_bid_modality_rules
  for update to authenticated using (true) with check (true);
create policy "group_bid_modality_rules_delete" on public.group_bid_modality_rules
  for delete to authenticated using (true);
