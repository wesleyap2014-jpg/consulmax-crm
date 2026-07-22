# Robô BB Consórcios

O robô BB é executado pelo workflow `.github/workflows/sync-bb-consorcios.yml`, sem serviço HTTP público permanente.

## GitHub Actions secrets obrigatórios

Cadastre em **Settings → Secrets and variables → Actions → Secrets**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BB_ROBOT_PORTAL_URL`
- `BB_ROBOT_USERNAME`
- `BB_ROBOT_PASSWORD`

Seletores customizados de login podem ser cadastrados em **Variables** quando o portal exigir:

- `BB_LOGIN_USERNAME_SELECTOR`
- `BB_LOGIN_PASSWORD_SELECTOR`
- `BB_LOGIN_SUBMIT_SELECTOR`

Sem os cinco secrets obrigatórios, o workflow termina sem executar o robô e informa que a configuração está pendente.

## Execuções

- A Central de Grupos cria um registro em `public.robot_sync_jobs`; o GitHub verifica a fila a cada cinco minutos.
- O cron completo roda a cada quatro horas, no minuto 17, para reduzir atrasos do GitHub no início da hora.
- Também é possível executar manualmente o workflow pelo GitHub, escolhendo `full`, `segment` ou `assemblies`.
- A data de `public.robot_sync_status` só é atualizada quando o cron completo termina sem erros.
