-- Migração aplicada no Supabase (versão 20261105223109). IDs antigos preservados.

ALTER TABLE public.sim_tables ADD COLUMN IF NOT EXISTS faixas_credito numeric[], ADD COLUMN IF NOT EXISTS reajusta_cada_meses integer, ADD COLUMN IF NOT EXISTS permite_sorteio boolean NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS permite_troca_chaves boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS permite_fgts boolean NOT NULL DEFAULT false;

ALTER TABLE public.sim_tables DROP CONSTRAINT IF EXISTS sim_tables_reajusta_cada_meses_check;

ALTER TABLE public.sim_tables ADD CONSTRAINT sim_tables_reajusta_cada_meses_check CHECK (reajusta_cada_meses IS NULL OR reajusta_cada_meses BETWEEN 1 AND 600);

CREATE OR REPLACE FUNCTION public.embracon_salvar_tabela_unificada(p_admin_id uuid, p_segmento text, p_nome_tabela text, p_config jsonb, p_prazos jsonb, p_segmento_anterior text DEFAULT NULL::text, p_nome_anterior text DEFAULT NULL::text)
 RETURNS SETOF public.sim_tables
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_old_segmento text := nullif(btrim(p_segmento_anterior),'');
  v_old_nome text := nullif(btrim(p_nome_anterior),'');
  v_group_ids uuid[] := '{}'::uuid[];
  v_saved_ids uuid[] := '{}'::uuid[];
  v_prazos integer[] := '{}'::integer[];
  v_creditos numeric[];
  v_indices text[];
  v_reajuste integer;
  v_lim numeric;
  v_seguro numeric;
  v_min numeric;
  v_max numeric;
  v_row jsonb;
  v_id uuid;
  v_prazo integer;
  v_adm numeric;
  v_fr numeric;
  v_antecip numeric;
  v_antecip_parcelas integer;
  v_form_cheia boolean;
  v_form_25 boolean;
  v_form_50 boolean;
  v_n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_auth() THEN
    RAISE EXCEPTION 'Apenas administradores podem configurar tabelas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sim_admins WHERE id=p_admin_id AND upper(name)='EMBRACON') THEN
    RAISE EXCEPTION 'Esta operação é exclusiva da administradora Embracon';
  END IF;
  p_segmento := btrim(coalesce(p_segmento,''));
  p_nome_tabela := btrim(coalesce(p_nome_tabela,''));
  IF p_segmento='' OR p_nome_tabela='' THEN
    RAISE EXCEPTION 'Segmento e nome da tabela são obrigatórios';
  END IF;
  IF jsonb_typeof(p_prazos) IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_prazos)=0 THEN
    RAISE EXCEPTION 'Informe ao menos um prazo válido';
  END IF;
  IF jsonb_typeof(p_config) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Configuração geral inválida';
  END IF;

  IF (v_old_segmento IS NULL) <> (v_old_nome IS NULL) THEN
    RAISE EXCEPTION 'Identificação original incompleta';
  END IF;
  IF v_old_segmento IS NOT NULL THEN
    PERFORM id FROM public.sim_tables
    WHERE admin_id=p_admin_id AND segmento=v_old_segmento AND nome_tabela=v_old_nome FOR UPDATE;
    SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO v_group_ids FROM public.sim_tables
    WHERE admin_id=p_admin_id AND segmento=v_old_segmento AND nome_tabela=v_old_nome;
    IF cardinality(v_group_ids)=0 THEN
      RAISE EXCEPTION 'Tabela original não encontrada';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.sim_tables
    WHERE admin_id=p_admin_id AND segmento=p_segmento AND nome_tabela=p_nome_tabela
      AND NOT (id = ANY(v_group_ids))) THEN
    RAISE EXCEPTION 'Já existe uma tabela com esse nome nesse segmento';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sim_tables
    WHERE admin_id=p_admin_id AND segmento=p_segmento)
    AND NOT EXISTS (SELECT 1 FROM public.sim_tables
    WHERE admin_id=p_admin_id AND segmento=p_segmento AND id=ANY(v_group_ids)) THEN
    RAISE EXCEPTION 'Escolha um segmento já cadastrado para a Embracon';
  END IF;

  IF p_config ? 'faixas_credito'
    AND jsonb_typeof(p_config->'faixas_credito') = 'array' THEN
    SELECT array_agg(DISTINCT value::numeric ORDER BY value::numeric)
      INTO v_creditos
    FROM jsonb_array_elements_text(p_config->'faixas_credito') AS cr(value);
  END IF;
  IF v_creditos IS NOT NULL AND
    EXISTS (SELECT 1 FROM unnest(v_creditos) c WHERE c<=0 OR c IS NULL) THEN
    RAISE EXCEPTION 'Todos os valores de crédito devem ser positivos';
  END IF;
  IF cardinality(v_group_ids)=0 AND coalesce(cardinality(v_creditos),0)=0 THEN
    RAISE EXCEPTION 'Informe ao menos uma faixa de crédito para criar a tabela';
  END IF;
  SELECT array_agg(value) INTO v_indices
    FROM jsonb_array_elements_text(coalesce(p_config->'indices','["IPCA"]'::jsonb)) AS idx(value)
    WHERE btrim(value)<>'';
  IF coalesce(cardinality(v_indices),0)=0 THEN
    RAISE EXCEPTION 'Informe ao menos um índice de correção';
  END IF;

  v_lim := (p_config->>'limitador_parcela_pct')::numeric;
  v_seguro := (p_config->>'seguro_prest_pct')::numeric;
  IF v_lim IS NULL OR v_lim<0 OR v_lim>1 OR v_seguro IS NULL OR v_seguro<0 OR v_seguro>1 THEN
    RAISE EXCEPTION 'Percentuais gerais inválidos';
  END IF;
  v_reajuste := nullif(p_config->>'reajusta_cada_meses','')::integer;
  IF v_reajuste IS NOT NULL AND (v_reajuste<1 OR v_reajuste>600) THEN
    RAISE EXCEPTION 'Período de reajuste inválido';
  END IF;
  SELECT min(c),max(c) INTO v_min,v_max FROM unnest(v_creditos) AS c;
  IF v_min IS NULL THEN
    SELECT min(faixa_min),max(faixa_max) INTO v_min,v_max FROM public.sim_tables
     WHERE id=ANY(v_group_ids);
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_prazos) x(value)
  LOOP
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Prazo inválido';
    END IF;
    v_id := nullif(v_row->>'id','')::uuid;
    v_prazo := (v_row->>'prazo_limite')::integer;
    v_adm := (v_row->>'taxa_adm_pct')::numeric;
    v_fr := (v_row->>'fundo_reserva_pct')::numeric;
    v_antecip := (v_row->>'antecip_pct')::numeric;
    v_antecip_parcelas := (v_row->>'antecip_parcelas')::integer;
    v_form_cheia := coalesce((v_row->>'contrata_parcela_cheia')::boolean,false);
    v_form_25 := coalesce((v_row->>'contrata_reduzida_25')::boolean,false);
    v_form_50 := coalesce((v_row->>'contrata_reduzida_50')::boolean,false);
    IF v_prazo IS NULL OR v_prazo<1 OR v_prazo>600 OR v_prazo=ANY(v_prazos) THEN
      RAISE EXCEPTION 'Prazo repetido ou inválido: %',v_prazo;
    END IF;
    IF v_adm IS NULL OR v_adm<0 OR v_adm>1 OR v_fr IS NULL OR v_fr<0 OR v_fr>1
       OR v_antecip IS NULL OR v_antecip<0 OR v_antecip>1
       OR v_antecip_parcelas IS NULL OR v_antecip_parcelas<0 OR v_antecip_parcelas>60
       OR NOT(v_form_cheia OR v_form_25 OR v_form_50) THEN
      RAISE EXCEPTION 'Dados financeiros ou contratação inválidos no prazo %',v_prazo;
    END IF;
    v_prazos := array_append(v_prazos,v_prazo);
    IF v_id IS NOT NULL THEN
      IF NOT (v_id=ANY(v_group_ids)) OR v_id=ANY(v_saved_ids) THEN
        RAISE EXCEPTION 'Identificador de prazo inválido ou repetido';
      END IF;
      UPDATE public.sim_tables SET
        segmento=p_segmento, nome_tabela=p_nome_tabela, prazo_limite=v_prazo,
        taxa_adm_pct=v_adm, fundo_reserva_pct=v_fr, antecip_pct=v_antecip,
        antecip_parcelas=v_antecip_parcelas,
        contrata_parcela_cheia=v_form_cheia,
        contrata_reduzida_25=v_form_25,
        contrata_reduzida_50=v_form_50,
        faixa_min=coalesce((SELECT min(c) FROM unnest(v_creditos) c),faixa_min),
        faixa_max=coalesce((SELECT max(c) FROM unnest(v_creditos) c),faixa_max),
        faixas_credito=v_creditos,
        reajusta_cada_meses=v_reajuste,
        permite_sorteio=coalesce((p_config->>'permite_sorteio')::boolean,true),
        permite_lance_livre=coalesce((p_config->>'permite_lance_livre')::boolean,false),
        permite_lance_fixo_50=coalesce((p_config->>'permite_lance_fixo_50')::boolean,false),
        permite_lance_fixo_25=coalesce((p_config->>'permite_lance_fixo_25')::boolean,false),
        permite_lance_embutido=coalesce((p_config->>'permite_lance_embutido')::boolean,false),
        permite_troca_chaves=coalesce((p_config->>'permite_troca_chaves')::boolean,false),
        permite_fgts=coalesce((p_config->>'permite_fgts')::boolean,false),
        limitador_parcela_pct=v_lim,seguro_prest_pct=v_seguro,indice_correcao=v_indices
      WHERE id=v_id AND admin_id=p_admin_id;
      GET DIAGNOSTICS v_n=ROW_COUNT;
      IF v_n<>1 THEN RAISE EXCEPTION 'Não foi possível atualizar o prazo %',v_prazo; END IF;
    ELSE
      IF v_min IS NULL OR v_max IS NULL THEN
        RAISE EXCEPTION 'Configure primeiro os valores de crédito';
      END IF;
      INSERT INTO public.sim_tables(
        admin_id,segmento,nome_tabela,faixa_min,faixa_max,prazo_limite,
        taxa_adm_pct,fundo_reserva_pct,antecip_pct,antecip_parcelas,
        limitador_parcela_pct,seguro_prest_pct,
        permite_lance_embutido,permite_lance_fixo_25,permite_lance_fixo_50,
        permite_lance_livre,contrata_parcela_cheia,contrata_reduzida_25,
        contrata_reduzida_50,indice_correcao,faixas_credito,reajusta_cada_meses,
        permite_sorteio,permite_troca_chaves,permite_fgts
      ) VALUES (
        p_admin_id,p_segmento,p_nome_tabela,v_min,v_max,v_prazo,
        v_adm,v_fr,v_antecip,v_antecip_parcelas,v_lim,v_seguro,
        coalesce((p_config->>'permite_lance_embutido')::boolean,false),
        coalesce((p_config->>'permite_lance_fixo_25')::boolean,false),
        coalesce((p_config->>'permite_lance_fixo_50')::boolean,false),
        coalesce((p_config->>'permite_lance_livre')::boolean,false),
        v_form_cheia,v_form_25,v_form_50,v_indices,v_creditos,v_reajuste,
        coalesce((p_config->>'permite_sorteio')::boolean,true),
        coalesce((p_config->>'permite_troca_chaves')::boolean,false),
        coalesce((p_config->>'permite_fgts')::boolean,false)
      ) RETURNING id INTO v_id;
    END IF;
    v_saved_ids := array_append(v_saved_ids,v_id);
  END LOOP;

  -- Um prazo removido só é apagado se suas dependências permitirem;
  -- falha de FK cancela TODA a operação, sem exclusão parcial.
  DELETE FROM public.sim_tables WHERE id=ANY(v_group_ids)
    AND NOT(id=ANY(v_saved_ids));

  RETURN QUERY SELECT * FROM public.sim_tables
    WHERE admin_id=p_admin_id AND segmento=p_segmento AND nome_tabela=p_nome_tabela
    ORDER BY prazo_limite;
END;
$function$
;

REVOKE ALL ON FUNCTION public.embracon_salvar_tabela_unificada(uuid,text,text,jsonb,jsonb,text,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.embracon_salvar_tabela_unificada(uuid,text,text,jsonb,jsonb,text,text) TO authenticated;

