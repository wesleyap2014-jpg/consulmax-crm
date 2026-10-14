# Robôs Embracon

Base isolada para desenvolvimento dos robôs da Embracon no CRM Consulmax.

## Portal

Área restrita utilizada pela Embracon/Convert+:

`https://www.convertmais.com.br/AdminConvertMais/ConvertMaisWeb/login/`

A URL é pública e não precisa ser armazenada como segredo.

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

## Diagnóstico GitHub Actions

O GitHub Actions reconheceu corretamente os secrets `CONVERT_ROBOT_USERNAME` e `CONVERT_ROBOT_PASSWORD`, porém a infraestrutura do GitHub recebeu `Access Denied` do Convert+ antes mesmo de carregar a tela de login.

Por isso o GitHub Actions fica apenas como laboratório/manual até definirmos a infraestrutura definitiva do navegador.

## Teste Railway

O worker está preparado para testar a Railway sem enviar credenciais ao portal.

Arquivos:

- `Dockerfile`: usa a imagem oficial do Playwright/Chromium;
- `railway.json`: executa o diagnóstico uma vez e não reinicia automaticamente;
- `scripts/run-access-check.mjs`: abre o Convert+ e classifica o resultado.

No primeiro deploy Railway não é necessário cadastrar usuário e senha. O resultado esperado no log é um JSON com um destes estados:

- `login_page_available`: Railway conseguiu chegar à tela real de login;
- `access_denied`: o Convert+ também bloqueou a origem da Railway;
- `page_loaded_but_login_not_detected`: a página abriu, mas a estrutura precisa ser analisada.

Configuração do serviço Railway para o teste:

- branch: `agent/preparar-robos-embracon`;
- root directory: `workers/embracon-worker`;
- Dockerfile: detectado automaticamente dentro do root directory;
- não criar domínio público;
- não cadastrar `CONVERT_ROBOT_USERNAME` ou `CONVERT_ROBOT_PASSWORD` nesta primeira execução.

Se a Railway retornar `login_page_available`, o próximo passo é cadastrar nela:

- `CONVERT_ROBOT_USERNAME`
- `CONVERT_ROBOT_PASSWORD`

Depois evoluímos o mesmo container para login, navegação e leitura dos grupos.

## Credenciais

Credenciais reais nunca devem ser versionadas no repositório nem enviadas ao frontend.

Secrets já cadastrados no GitHub Actions:

- `CONVERT_ROBOT_USERNAME`
- `CONVERT_ROBOT_PASSWORD`

Quando o robô começar a gravar grupos, poderá reutilizar os secrets do Supabase usados pelos demais robôs:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Próximas etapas

1. Validar se a Railway consegue carregar a tela real do Convert+.
2. Se passar, executar login autenticado na Railway.
3. Mapear a navegação até os grupos existentes.
4. Implementar leitura/paginação dos grupos.
5. Definir a tabela `sim_embracon_groups` com base nos dados reais encontrados.
6. Integrar a Embracon a `robot_sync_jobs` e à Central de Grupos após a primeira sincronização real ser validada.
7. Depois da validação, transformar o processo em execução sob demanda/cron que inicia, sincroniza e encerra.

## Desenvolvimento local

```bash
cd workers/embracon-worker
npm install
npm run build
npm run check:access
```

Use `.env.example` como referência. Nunca versione credenciais reais.
