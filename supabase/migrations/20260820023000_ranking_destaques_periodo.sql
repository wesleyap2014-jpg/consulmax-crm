create or replace function public.rpc_ranking_destaques_periodo(
  p_inicio date,
  p_fim date
)
returns table (
  user_id uuid,
  vendedor_auth_id uuid,
  nome text,
  email text,
  avatar_url text,
  vendas_volume numeric,
  vendas_quantidade bigint,
  simulacoes bigint,
  prospeccoes bigint,
  qualificacoes bigint
)
language sql
security definer
set search_path = public
as $$
  with usuario_logado as (
    select u.id
    from public.users u
    where u.auth_user_id = auth.uid()
      and coalesce(u.is_active, true) = true
    limit 1
  ),
  periodo as (
    select
      p_inicio as data_inicio,
      p_fim as data_fim,
      (p_inicio::timestamp at time zone 'America/Porto_Velho') as inicio_at,
      (p_fim::timestamp at time zone 'America/Porto_Velho') as fim_at
  ),
  vendedores as (
    select
      u.id,
      u.auth_user_id,
      u.nome,
      u.email,
      coalesce(u.avatar_url, u.photo_url) as avatar_url
    from public.users u
    where coalesce(u.is_active, true) = true
      and (
        lower(coalesce(u.user_role, '')) in ('vendedor', 'admin')
        or lower(coalesce(u.role::text, '')) in ('vendedor', 'admin')
      )
      and exists (select 1 from usuario_logado)
  ),
  vendas_agg as (
    select
      v.vendedor_id as vendedor_auth_id,
      coalesce(sum(coalesce(v.valor_venda, 0)), 0)::numeric as vendas_volume,
      count(v.id)::bigint as vendas_quantidade
    from public.vendas v, periodo p
    where v.data_venda >= p.data_inicio
      and v.data_venda < p.data_fim
    group by v.vendedor_id
  ),
  simulacoes_agg as (
    select
      l.owner_id as vendedor_auth_id,
      count(distinct s.lead_id)::bigint as simulacoes
    from public.sim_simulations s
    join public.leads l on l.id = s.lead_id
    cross join periodo p
    where s.created_at >= p.inicio_at
      and s.created_at < p.fim_at
      and s.lead_id is not null
    group by l.owner_id
  ),
  leads_agg as (
    select
      l.owner_id as vendedor_auth_id,
      count(l.id)::bigint as novos_leads
    from public.leads l, periodo p
    where l.created_at >= p.inicio_at
      and l.created_at < p.fim_at
    group by l.owner_id
  ),
  oportunidades_agg as (
    select
      o.vendedor_id as vendedor_auth_id,
      count(o.id) filter (
        where o.created_at >= p.inicio_at and o.created_at < p.fim_at
      )::bigint as novas_oportunidades,
      count(o.id) filter (
        where o.qualified_at >= p.inicio_at and o.qualified_at < p.fim_at
      )::bigint as qualificacoes
    from public.opportunities o
    cross join periodo p
    where (o.created_at >= p.inicio_at and o.created_at < p.fim_at)
       or (o.qualified_at >= p.inicio_at and o.qualified_at < p.fim_at)
    group by o.vendedor_id
  )
  select
    v.id as user_id,
    v.auth_user_id as vendedor_auth_id,
    v.nome,
    v.email,
    v.avatar_url,
    coalesce(va.vendas_volume, 0)::numeric as vendas_volume,
    coalesce(va.vendas_quantidade, 0)::bigint as vendas_quantidade,
    coalesce(sa.simulacoes, 0)::bigint as simulacoes,
    (coalesce(la.novos_leads, 0) + coalesce(oa.novas_oportunidades, 0))::bigint as prospeccoes,
    coalesce(oa.qualificacoes, 0)::bigint as qualificacoes
  from vendedores v
  left join vendas_agg va on va.vendedor_auth_id = v.auth_user_id
  left join simulacoes_agg sa on sa.vendedor_auth_id = v.auth_user_id
  left join leads_agg la on la.vendedor_auth_id = v.auth_user_id
  left join oportunidades_agg oa on oa.vendedor_auth_id = v.auth_user_id
  order by vendas_volume desc, vendas_quantidade desc, v.nome asc;
$$;

revoke all on function public.rpc_ranking_destaques_periodo(date, date) from public;
revoke all on function public.rpc_ranking_destaques_periodo(date, date) from anon;
grant execute on function public.rpc_ranking_destaques_periodo(date, date) to authenticated;
