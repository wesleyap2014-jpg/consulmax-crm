-- Competência da meta: somente venda encarteirada, pelo dia de encarteiramento (Rondônia).
-- Cancelamentos abatem o realizado no período do cancelamento.
CREATE OR REPLACE FUNCTION public.rpc_ranking_vendedores_mes(p_ano integer, p_mes integer)
 RETURNS TABLE(posicao bigint, user_id uuid, vendedor_auth_id uuid, nome text, email text, avatar_url text, vendas_count bigint, encarteiradas_count bigint, producao numeric, ticket_medio numeric, meta_usuario numeric, pct_meta numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH usuario_logado AS (
  SELECT u.id FROM public.users u
  WHERE u.auth_user_id = auth.uid() AND coalesce(u.is_active, true) = true LIMIT 1
), periodo AS (
  SELECT make_date(p_ano, p_mes, 1)::date AS data_inicio,
         (make_date(p_ano, p_mes, 1) + interval '1 month')::date AS data_fim
), vendedores AS (
  SELECT u.id, u.auth_user_id, u.nome, u.email,
         coalesce(u.avatar_url, u.photo_url) AS avatar_url
  FROM public.users u
  WHERE coalesce(u.is_active, true) = true
    AND (lower(coalesce(u.user_role, '')) IN ('vendedor', 'admin')
      OR lower(coalesce(u.role::text, '')) IN ('vendedor', 'admin'))
    AND EXISTS (SELECT 1 FROM usuario_logado)
), base AS (
  SELECT vdr.id AS user_id, vdr.auth_user_id AS vendedor_auth_id,
         vdr.nome, vdr.email, vdr.avatar_url,
         count(v.id) FILTER (
           WHERE (v.encarteirada_em AT TIME ZONE 'America/Porto_Velho')::date >= p.data_inicio
             AND (v.encarteirada_em AT TIME ZONE 'America/Porto_Velho')::date < p.data_fim
         )::bigint AS vendas_count,
         count(v.id) FILTER (
           WHERE (v.encarteirada_em AT TIME ZONE 'America/Porto_Velho')::date >= p.data_inicio
             AND (v.encarteirada_em AT TIME ZONE 'America/Porto_Velho')::date < p.data_fim
         )::bigint AS encarteiradas_count,
         coalesce(sum(
           CASE WHEN (v.encarteirada_em AT TIME ZONE 'America/Porto_Velho')::date >= p.data_inicio
                      AND (v.encarteirada_em AT TIME ZONE 'America/Porto_Velho')::date < p.data_fim
                 THEN coalesce(v.valor_venda, 0) ELSE 0 END
         ),0)::numeric AS bruto,
         coalesce(sum(
           CASE WHEN (v.cancelada_em AT TIME ZONE 'America/Porto_Velho')::date >= p.data_inicio
                      AND (v.cancelada_em AT TIME ZONE 'America/Porto_Velho')::date < p.data_fim
                 THEN coalesce(v.valor_venda, 0) ELSE 0 END
         ),0)::numeric AS cancelado
  FROM vendedores vdr CROSS JOIN periodo p
  LEFT JOIN public.vendas v ON v.vendedor_id = vdr.auth_user_id
    AND lower(coalesce(v.status,'')) = 'encarteirada'
    AND (
      (v.encarteirada_em AT TIME ZONE 'America/Porto_Velho')::date >= p.data_inicio
      AND (v.encarteirada_em AT TIME ZONE 'America/Porto_Velho')::date < p.data_fim
      OR (v.cancelada_em AT TIME ZONE 'America/Porto_Velho')::date >= p.data_inicio
      AND (v.cancelada_em AT TIME ZONE 'America/Porto_Velho')::date < p.data_fim
    )
  GROUP BY vdr.id, vdr.auth_user_id, vdr.nome, vdr.email, vdr.avatar_url
), com_meta AS (
  SELECT b.*, (b.bruto - b.cancelado)::numeric AS producao,
    coalesce(CASE p_mes
      WHEN 1 THEN m.m01 WHEN 2 THEN m.m02 WHEN 3 THEN m.m03
      WHEN 4 THEN m.m04 WHEN 5 THEN m.m05 WHEN 6 THEN m.m06
      WHEN 7 THEN m.m07 WHEN 8 THEN m.m08 WHEN 9 THEN m.m09
      WHEN 10 THEN m.m10 WHEN 11 THEN m.m11 WHEN 12 THEN m.m12
      ELSE 0 END, 0)::numeric AS meta_usuario
  FROM base b LEFT JOIN public.metas_vendedores m
    ON m.vendedor_id = b.user_id AND m.ano = p_ano
), ranking AS (
  SELECT row_number() OVER (
           ORDER BY producao DESC, encarteiradas_count DESC, vendas_count DESC, nome ASC
         ) AS posicao,
         user_id, vendedor_auth_id, nome, email, avatar_url,
         vendas_count, encarteiradas_count, producao,
         CASE WHEN vendas_count > 0 THEN bruto / vendas_count ELSE 0 END::numeric AS ticket_medio,
         meta_usuario,
         CASE WHEN meta_usuario > 0 THEN (producao / meta_usuario) * 100 ELSE 0 END::numeric AS pct_meta
  FROM com_meta
)
SELECT * FROM ranking ORDER BY posicao ASC;
$function$
