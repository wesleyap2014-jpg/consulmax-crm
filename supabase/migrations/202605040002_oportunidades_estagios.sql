-- Novos estágios da esteira comercial de oportunidades.
-- Se a coluna estagio for enum, libera os valores; se for text, este arquivo não interfere.

do $$
begin
  alter type public.estagio_oportunidade add value if not exists 'Novo Lead';
  alter type public.estagio_oportunidade add value if not exists 'Qualificando/Diagnóstico';
  alter type public.estagio_oportunidade add value if not exists 'Reunião Agendada';
  alter type public.estagio_oportunidade add value if not exists 'Proposta Apresentada/Negociação';
  alter type public.estagio_oportunidade add value if not exists 'Fechamento Programado/Aguardando Documentos';
  alter type public.estagio_oportunidade add value if not exists 'Fechado (Ganho)';
  alter type public.estagio_oportunidade add value if not exists 'Fechado (Perdido)';
exception
  when undefined_object then
    null;
end $$;
