-- Corrige constraint de estágios da tabela opportunities
-- Necessário após implantação do novo pipeline comercial.

alter table public.opportunities
  drop constraint if exists opportunities_estagio_check;

alter table public.opportunities
  add constraint opportunities_estagio_check
  check (
    estagio in (
      -- Estágios antigos preservados
      'Novo',
      'Qualificando',
      'Qualificação',
      'Qualificacao',
      'Proposta',
      'Negociação',
      'Negociacao',
      'Fechado (Ganho)',
      'Fechado (Perdido)',

      -- Estágios novos do pipeline
      'Novo Lead',
      'Qualificando/Diagnóstico',
      'Reunião Agendada',
      'Proposta Apresentada/Negociação',
      'Fechamento Programado/Aguardando Documentos'
    )
  );
