-- Endurece a função de atualização automática da Central de Marketing.
-- Mantém a resolução de objetos restrita ao schema esperado.

alter function public.marketing_set_updated_at()
  set search_path = public;

