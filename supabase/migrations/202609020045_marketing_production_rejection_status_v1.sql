alter table public.marketing_production_orders
  drop constraint if exists marketing_production_orders_status_check;

alter table public.marketing_production_orders
  add constraint marketing_production_orders_status_check
  check (status in (
    'aguardando_producao','aguardando_insumos','recebendo_cortes','pronto_ia','produzindo',
    'em_revisao','pronto_aprovacao','aprovado','ajuste_solicitado','rejeitado','falhou'
  ));
