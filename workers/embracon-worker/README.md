# Robôs Embracon

Base isolada para desenvolvimento dos robôs da Embracon no CRM Consulmax.

## Objetivo desta etapa

Preparar um ambiente separado do worker BB/Maggi para que a navegação, seletores e regras da Embracon possam ser desenvolvidos sem risco de regressão nos robôs existentes.

Neste momento o worker possui:

- endpoint `/health`;
- diagnóstico seguro da página inicial em `POST /diagnostics/embracon/login-page`;
- captura opcional de screenshot para inspeção;
- endpoint reservado `POST /sync/embracon/groups`, que responde `501 not_implemented` até o robô real ser mapeado;
- workflow manual `.github/workflows/embracon-robot-lab.yml`.

## Segurança do diagnóstico

O diagnóstico não envia usuário/senha, não lê valores digitados e não serializa conteúdo de campos. Ele registra apenas metadados estruturais úteis para seleção de elementos: `tag`, `type`, `id`, `name`, `placeholder`, `autocomplete`, `aria-label`, visibilidade, formulários e botões.

## Secret inicial no GitHub Actions

Para executar o primeiro diagnóstico, cadastrar:

- `EMBRACON_ROBOT_PORTAL_URL`

As credenciais serão adicionadas somente quando o fluxo de login for mapeado:

- `EMBRACON_ROBOT_USERNAME`
- `EMBRACON_ROBOT_PASSWORD`

## Próximas etapas

1. Executar o laboratório contra a URL real da área restrita Embracon.
2. Ler o JSON e a screenshot gerados pelo artifact `embracon-login-diagnostic`.
3. Mapear o fluxo real de login e navegação.
4. Definir os robôs necessários e as fontes de dados de cada um.
5. Criar tabela(s) e integração com `robot_sync_jobs` somente com o modelo de dados confirmado.
6. Integrar a Embracon à Central de Grupos após a primeira sincronização real ser validada.

## Desenvolvimento local

```bash
cd workers/embracon-worker
npm install
npm run build
npm start
```

Use `.env.example` como referência. Nunca versione credenciais reais.
