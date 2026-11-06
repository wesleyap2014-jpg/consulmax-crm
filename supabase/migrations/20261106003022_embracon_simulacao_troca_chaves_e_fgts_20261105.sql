-- Colunas aditivas para registrar modalidades especiais nas simulações da Embracon.
-- Migração aplicada previamente no Supabase; mantém o histórico existente.
ALTER TABLE public.sim_simulations
  ADD COLUMN IF NOT EXISTS troca_chaves_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS troca_chaves_valor_avaliacao numeric(18,2),
  ADD COLUMN IF NOT EXISTS fgts_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fgts_valor numeric(18,2);

ALTER TABLE public.sim_simulations
  DROP CONSTRAINT IF EXISTS sim_simulations_formas_lance_valores_validos;

ALTER TABLE public.sim_simulations
  ADD CONSTRAINT sim_simulations_formas_lance_valores_validos
  CHECK (
    NOT (troca_chaves_ativo AND fgts_ativo)
    AND (
      NOT troca_chaves_ativo OR (
        troca_chaves_valor_avaliacao IS NOT NULL
        AND troca_chaves_valor_avaliacao > 0
        AND troca_chaves_valor_avaliacao <= credito * 0.50
        AND lance_embutido_valor = 0
      )
    )
    AND (
      NOT fgts_ativo OR (fgts_valor IS NOT NULL AND fgts_valor > 0)
    )
  );
