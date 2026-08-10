# Robôs Embracon

Base isolada para desenvolvimento dos robôs da Embracon no CRM Consulmax.

## Portal

Área restrita utilizada pela Embracon/Convert+:

`https://www.convertmais.com.br/AdminConvertMais/ConvertMaisWeb/login/`

A URL é pública e fica configurada no workflow. Não precisa ser armazenada como segredo.

## Primeiro robô

O primeiro robô Embracon será responsável por localizar e sincronizar os grupos existentes/disponíveis no portal. O fluxo esperado é:

1. login no Convert+;
2. navegar até a área que lista os grupos existentes;
3. identificar segmentos/modalidades e filtros necessários;
4. percorrer todas as páginas/resultados;
5. normalizar os dados encontrados;
6. gravar os grupos no Supabase;
7. somente depois integrar a Embracon à Central de Grupos.

Os campos e regras exatos só serão definidos depois da navegação real no portal, para não criar seletores ou modelo de dados por suposição.

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

## Credenciais

Como o Playwright roda no GitHub Actions, as credenciais da Embracon devem ficar em **GitHub → Settings → Secrets and variables → Actions → Secrets**, e não na Vercel:

- `EMBRACON_ROBOT_USERNAME`
- `EMBRACON_ROBOT_PASSWORD`

Quando o robô começar a gravar grupos, poderá reutilizar os secrets de Supabase já usados pelos demais robôs:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

As credenciais da Embracon não devem ser expostas em variáveis públicas nem enviadas ao frontend.

## Vercel

A Vercel continua responsável pelo CRM e pelo endpoint que aciona os workflows. Para a futura integração da Embracon à Central de Grupos, o ideal é reutilizar a infraestrutura existente (`GITHUB_ACTIONS_TOKEN`, Supabase e fila `robot_sync_jobs`) sem duplicar usuário/senha da administradora na Vercel.

## Próximas etapas

1. Executar o laboratório contra a URL real da área restrita Embracon.
2. Ler o JSON e a screenshot gerados pelo artifact `embracon-login-diagnostic`.
3. Mapear o fluxo real de login e navegação até os grupos existentes.
4. Implementar o login usando secrets do GitHub Actions.
5. Implementar leitura/paginação dos grupos.
6. Definir a tabela `sim_embracon_groups` com base nos dados reais encontrados.
7. Integrar a Embracon a `robot_sync_jobs` e à Central de Grupos após a primeira sincronização real ser validada.

## Desenvolvimento local

```bash
cd workers/embracon-worker
npm install
npm run build
npm start
```

Use `.env.example` como referência. Nunca versione credenciais reais.
