-- MAX Contempladas: histórico privado de busca por usuário autenticado.
create table if not exists public.stock_max_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_mode text not null check (source_mode in ('externo','crm')),
  segmento text not null check (segmento in ('Automóvel','Imóvel','Pesados','Motocicletas')),
  credito_solicitado numeric(15,2) not null check (credito_solicitado > 0),
  resultados jsonb not null default '[]'::jsonb,
  observacao text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists stock_max_searches_user_recent_idx
  on public.stock_max_searches (user_id, created_at desc);

alter table public.stock_max_searches enable row level security;
revoke all on table public.stock_max_searches from anon;
grant select, insert, delete on public.stock_max_searches to authenticated;

drop policy if exists stock_max_searches_select_own on public.stock_max_searches;
create policy stock_max_searches_select_own on public.stock_max_searches
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists stock_max_searches_insert_own on public.stock_max_searches;
create policy stock_max_searches_insert_own on public.stock_max_searches
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists stock_max_searches_delete_own on public.stock_max_searches;
create policy stock_max_searches_delete_own on public.stock_max_searches
  for delete to authenticated using (user_id = (select auth.uid()));
