-- CRM Consulmax - Seed dos modelos Kanban da Central WhatsApp
-- Execute no Supabase SQL Editor depois de rodar whatsapp_kanban_models.sql.

create extension if not exists pgcrypto;

-- Desativa as filas padrão que vieram no primeiro SQL, mantendo ativas as filas que você criou manualmente.
-- Se alguma dessas for uma fila que você quer usar, reative no editor depois.
update public.whatsapp_queues
set is_active = false, updated_at = now()
where key in (
  'novos_contatos', 'triagem', 'comercial', 'qualificacao', 'proposta', 'negociacao',
  'cliente_ativo', 'boleto', 'contemplacao', 'pos_venda', 'suporte', 'financeiro', 'finalizado'
);

-- MODELO COMERCIAL
with m as (
  insert into public.whatsapp_kanban_models (name, description, created_by)
  values ('MODELO COMERCIAL', 'Fluxo comercial de atendimento, diagnóstico, proposta e fechamento.', auth.uid())
  returning id
)
insert into public.whatsapp_kanban_columns (model_id, key, label, color, sort_order, is_final)
select id, 'novo', 'NOVO', '#A11C27', 10, false from m union all
select id, 'qualificando_diagnostico', 'QUALIFICANDO/DIAGNÓSTICO', '#B5A573', 20, false from m union all
select id, 'reuniao_agendada', 'REUNIÃO AGENDADA', '#1E293F', 30, false from m union all
select id, 'proposta_apresentada_negociacao', 'PROPOSTA APRESENTADA/NEGOCIAÇÃO', '#1E293F', 40, false from m union all
select id, 'fechamento_programado_aguardando_documentacao', 'FECHAMENTO PROGRAMADO/AGUARDANDO DOCUMENTAÇÃO', '#B5A573', 50, false from m union all
select id, 'fechado_ganho', 'FECHADO GANHO', '#0f766e', 60, true from m union all
select id, 'fechado_perdido', 'FECHADO PERDIDO', '#64748b', 70, true from m;

-- MODELO FATURAMENTO
with m as (
  insert into public.whatsapp_kanban_models (name, description, created_by)
  values ('MODELO FATURAMENTO', 'Fluxo de faturamento, análise documental, aprovação e pagamento.', auth.uid())
  returning id
)
insert into public.whatsapp_kanban_columns (model_id, key, label, color, sort_order, is_final)
select id, 'novo', 'NOVO', '#A11C27', 10, false from m union all
select id, 'cliente_aguardando_doc', 'CLIENTE - AGUARDANDO DOC', '#B5A573', 20, false from m union all
select id, 'analise_doc_interna', 'ANÁLISE DOC. INTERNA', '#1E293F', 30, false from m union all
select id, 'enviado_para_administradora', 'ENVIADO PARA ADMINISTRADORA', '#1E293F', 40, false from m union all
select id, 'credito_aprovado_aguardando_cliente', 'CRÉDITO APROVADO - AGUARDANDO CLIENTE', '#B5A573', 50, false from m union all
select id, 'vistoria_avaliacao', 'VISTORIA/AVALIAÇÃO', '#1E293F', 60, false from m union all
select id, 'assinatura_de_contrato', 'ASSINATURA DE CONTRATO', '#1E293F', 70, false from m union all
select id, 'pagamento_agendado', 'PAGAMENTO AGENDADO', '#0f766e', 80, false from m union all
select id, 'pago', 'PAGO', '#0f766e', 90, true from m;

-- MODELO SOLICITAÇÃO
with m as (
  insert into public.whatsapp_kanban_models (name, description, created_by)
  values ('MODELO SOLICITAÇÃO', 'Fluxo simples para solicitações internas, suporte e demandas rápidas.', auth.uid())
  returning id
)
insert into public.whatsapp_kanban_columns (model_id, key, label, color, sort_order, is_final)
select id, 'novo', 'NOVO', '#A11C27', 10, false from m union all
select id, 'em_atendimento', 'EM ATENDIMENTO', '#1E293F', 20, false from m union all
select id, 'solicitacao_atendida', 'SOLICITAÇÃO ATENDIDA', '#0f766e', 30, true from m;
