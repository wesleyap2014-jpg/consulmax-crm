-- Adiciona campo de descrição/contexto em agenda_eventos
-- Necessário para criação de reunião a partir de oportunidades.

alter table public.agenda_eventos
  add column if not exists descricao text;
