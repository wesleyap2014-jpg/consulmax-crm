# Gestão de Grupos — evolução por administradora

## Estado da implementação
- Navegação por administradora na relação de grupos, com total consolidado e contagem por administradora.
- Filtro exato após normalização do nome, mantendo os filtros atuais de pesquisa.
- Nenhuma modificação de tabelas, resultados, datas, referência da Loteria Federal, oferta de lance ou disparos WhatsApp nesta etapa.
- Implementação em branch isolada para revisão.

## Contratos de dados atuais (não alterar sem adaptação e testes)
- `groups`: `administradora`, `codigo`, `participantes`, `prox_vencimento`, `prox_sorteio`, `prox_assembleia`, `prazo_encerramento_meses`.
- `assemblies`: `date`, `next_due_date`, `next_draw_date`, `next_assembly_date`.
- `assembly_results`: `group_id`, `assembly_id`, `date`, `fixed25_offers`, `fixed25_deliveries`, `fixed50_offers`, `fixed50_deliveries`, `ll_offers`, `ll_deliveries`, `ll_high`, `ll_low`, `median`, `reference_number`.

## Consumidores já identificados
- `src/pages/Inicio.tsx`: agenda operacional e alertas por data.
- `src/pages/Relatorios.tsx`: leitura de resultados de assembleias.
- `api/gestao-grupos/nao-contemplada-whatsapp.ts`: mensagem de não contemplação e prevenção de duplicidades.
- `workers/area-restrita-worker/src/assembly-result-sync.mjs`: sincronização de resultados.
- `src/pages/GestaoDeGrupos.tsx`: lançamentos, histórico, sorteio, referências, exportação.

## Etapa seguinte (não implementada nesta mudança)
1. Inventariar todas as dependências de escrita e leitura, inclusive jobs, RPCs e views do Supabase.
2. Criar tabelas **aditivas** de modalidades por administradora, plano e grupo, sem descartar as colunas legadas.
3. Construir tradutor de compatibilidade entre resultados por modalidade e o formato consumido atualmente.
4. Manter layout de lançamento único e alterar dinamicamente apenas as modalidades autorizadas para cada grupo.
5. Fazer testes com resultados históricos reais homologados de Embracon, HS, Maggi e BB.
6. Validar vencimento, sorteio, assembleia, alertas, Loteria Federal, oferta de lance e WhatsApp em ambiente de testes.
7. Ativar por administradora mediante configuração e rollback, nunca por substituição imediata do schema legado.

## Critérios de aprovação
- Nenhuma alteração regressiva de datas e regras de referência.
- Dados históricos intactos.
- Nenhum envio duplicado ou acidental de WhatsApp.
- Todos os consumidores e sincronizações continuam operando.
- Quando não houver regra específica homologada, interface e persistência continuam no modelo atual.
