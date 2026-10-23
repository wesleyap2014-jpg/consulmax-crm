-- Campanha Acelera Consulmax, 26/10/2026 a 31/12/2026.
-- Aplica-se no Supabase antes da publicacao do painel.
-- A tabela guarda a comprovacao administrativa da 1a parcela.
-- Vendas, cancelamentos, alocacao e inadimplencia permanecem em public.vendas.
create table if not exists public.acelera_consulmax_validacoes (
  venda_id uuid primary key references public.vendas(id) on delete cascade,
  primeira_parcela_paga boolean not null default false,
  data_confirmacao date,
  validado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now(),
  constraint acelera_confirmacao_consistente check (
    (primeira_parcela_paga and data_confirmacao is not null)
    or (not primeira_parcela_paga and data_confirmacao is null)
  )
);
alter table public.acelera_consulmax_validacoes enable row level security;
create policy acelera_validacoes_ler on public.acelera_consulmax_validacoes
  for select to authenticated using (
    (select public.is_admin_auth())
    or exists (
      select 1 from public.vendas v
      where v.id = venda_id and v.vendedor_id = (select auth.uid())
    )
  );
create policy acelera_validacoes_admin_inserir on public.acelera_consulmax_validacoes
  for insert to authenticated with check (
    (select public.is_admin_auth()) and validado_por = (select auth.uid())
  );
create policy acelera_validacoes_admin_atualizar on public.acelera_consulmax_validacoes
  for update to authenticated using ((select public.is_admin_auth()))
  with check ((select public.is_admin_auth()) and validado_por = (select auth.uid()));
grant select, insert, update on public.acelera_consulmax_validacoes to authenticated;
