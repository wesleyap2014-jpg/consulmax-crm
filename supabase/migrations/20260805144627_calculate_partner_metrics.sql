create or replace function public.get_partner_metrics()
returns table (
  partner_id uuid,
  indications bigint,
  converted bigint,
  commission_generated numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with actor as (
    select
      me.unit_id,
      lower(coalesce(me.hierarchy_level, '')) as hierarchy_level,
      lower(coalesce(my_unit.tipo, '')) as unit_type
    from public.users me
    left join public.units my_unit on my_unit.id = me.unit_id
    where (select auth.uid()) is not null
      and me.auth_user_id = (select auth.uid())
      and coalesce(me.is_active, true) = true
    limit 1
  ),
  visible_partners as (
    select p.id, p.comissao_pct
    from public.partners p
    cross join actor
    where p.created_by = (select auth.uid())
       or actor.unit_type = 'matriz'
       or (
         actor.hierarchy_level = 'gestor_filial'
         and actor.unit_id is not distinct from p.unit_id
       )
  ),
  lead_metrics as (
    select
      l.partner_id,
      count(*) as indications,
      count(*) filter (
        where exists (
          select 1
          from public.opportunities o
          where o.lead_id = l.id
            and o.estagio = 'Fechado (Ganho)'
        )
      ) as converted
    from public.leads l
    join visible_partners p on p.id = l.partner_id
    group by l.partner_id
  ),
  commission_metrics as (
    select
      l.partner_id,
      sum(coalesce(v.valor_venda, 0) * p.comissao_pct / 100) as commission_generated
    from public.leads l
    join visible_partners p on p.id = l.partner_id
    join public.vendas v
      on coalesce(v.lead_id, v.cliente_lead_id) = l.id
    where v.status = 'encarteirada'
      and v.cancelada_em is null
      and coalesce(nullif(btrim(v.codigo), ''), '00') = '00'
    group by l.partner_id
  )
  select
    p.id as partner_id,
    coalesce(lm.indications, 0)::bigint as indications,
    coalesce(lm.converted, 0)::bigint as converted,
    coalesce(cm.commission_generated, 0)::numeric as commission_generated
  from visible_partners p
  left join lead_metrics lm on lm.partner_id = p.id
  left join commission_metrics cm on cm.partner_id = p.id;
$$;

comment on function public.get_partner_metrics() is
  'Retorna indicadores agregados dos parceiros visiveis ao usuario autenticado, respeitando a hierarquia do CRM.';

revoke all on function public.get_partner_metrics() from public, anon;
grant execute on function public.get_partner_metrics() to authenticated;
