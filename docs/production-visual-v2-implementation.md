# Implementação

A implementação está concentrada em:

- `api/marketing/production-visual.ts` — cérebro visual por formato e refinamento por IA.
- `src/components/marketing/productionVisualRenderer.ts` — renderização determinística brand-safe.
- `src/components/marketing/ProductionWorkspaceV2.tsx` — produção, prévia, ajustes, versões, download e aprovação.
- `src/components/marketing/ProductionWorkspace.tsx` — entrada compatível que aponta para o V2.

Não foi necessária mudança de schema: especificações e histórico usam os campos JSONB `metadata` já existentes nas ordens e nos assets.
