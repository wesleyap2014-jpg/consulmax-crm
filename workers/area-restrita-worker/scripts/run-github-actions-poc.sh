#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE_NAME="consulmax-area-restrita-worker:github-runner"
CONTAINER_NAME="consulmax-area-restrita-github-runner"
ARTIFACT_DIR="${GITHUB_WORKSPACE:-$(pwd)}/workers/area-restrita-worker/artifacts/github-actions-poc"
TUNNEL_LOG="${RUNNER_TEMP:-/tmp}/area-restrita-cloudflared.log"
TUNNEL_PID=""
TUNNEL_URL=""
LAST_STATE=""
FINALIZED="false"
ROBOT_SECRET="${AREA_RESTRITA_ROBOT_SECRET:-$(openssl rand -hex 32)}"
MAX_SECONDS="${AREA_RESTRITA_GITHUB_TIMEOUT_SECONDS:-9000}"
RUNTIME_KEY="maggi"
RUNTIME_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
GITHUB_RUN_URL=""
if [[ -n "${GITHUB_SERVER_URL:-}" && -n "${GITHUB_REPOSITORY:-}" && -n "${GITHUB_RUN_ID:-}" ]]; then
  GITHUB_RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
fi

required_envs=(
  AREA_RESTRITA_PORTAL_URL
  AREA_RESTRITA_USERNAME
  AREA_RESTRITA_PASSWORD
  AREA_RESTRITA_VNC_PASSWORD
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
)

for name in "${required_envs[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "::error title=Configuração ausente::A variável/secreto ${name} não está configurado."
    exit 2
  fi
done

mkdir -p "$ARTIFACT_DIR"

publish_runtime() {
  local state="$1"
  local remote_url="${2:-}"
  local message="${3:-}"
  local finished_at="${4:-}"
  local now expires_at run_id_json payload

  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  expires_at="$(date -u -d '+3 hours' +"%Y-%m-%dT%H:%M:%SZ")"
  run_id_json="null"
  if [[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]]; then
    run_id_json="${GITHUB_RUN_ID}"
  fi

  payload="$(jq -nc \
    --arg key "$RUNTIME_KEY" \
    --arg state "$state" \
    --arg message "$message" \
    --arg remote "$remote_url" \
    --arg run_url "$GITHUB_RUN_URL" \
    --arg started "$RUNTIME_STARTED_AT" \
    --arg finished "$finished_at" \
    --arg expires "$expires_at" \
    --arg updated "$now" \
    --argjson run_id "$run_id_json" \
    '{
      key: $key,
      administradora: "maggi",
      state: $state,
      message: (if $message == "" then null else $message end),
      remote_url: (if $remote == "" then null else $remote end),
      github_run_id: $run_id,
      github_run_url: (if $run_url == "" then null else $run_url end),
      started_at: $started,
      finished_at: (if $finished == "" then null else $finished end),
      expires_at: $expires,
      updated_at: $updated
    }'
  )"

  curl --fail --silent --show-error \
    --request POST \
    --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    --header "Content-Type: application/json" \
    --header "Prefer: resolution=merge-duplicates,return=minimal" \
    --data "$payload" \
    "${SUPABASE_URL%/}/rest/v1/area_restrita_runtime_sessions?on_conflict=key" \
    >/dev/null
}

collect_artifacts() {
  set +e
  if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    docker logs "$CONTAINER_NAME" >"$ARTIFACT_DIR/worker-container.log" 2>&1 || true
    for file in \
      area-restrita-status.json \
      area-restrita-price-tables.json \
      area-restrita-assemblies.json \
      price-table-runner.log; do
      docker cp "$CONTAINER_NAME:/data/$file" "$ARTIFACT_DIR/$file" >/dev/null 2>&1 || true
    done
  fi
}

cleanup() {
  local exit_code=$?
  set +e

  if [[ "$FINALIZED" != "true" ]]; then
    publish_runtime       "error"       ""       "A execução do GitHub Runner foi interrompida antes da conclusão."       "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"       >/dev/null 2>&1 || true
  fi

  collect_artifacts
  if [[ -n "$TUNNEL_PID" ]]; then
    kill "$TUNNEL_PID" >/dev/null 2>&1 || true
  fi
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

  return "$exit_code"
}
trap cleanup EXIT INT TERM

publish_runtime "starting" "" "Preparando o GitHub Runner da Área Restrita Maggi."

echo "[area-restrita-github] Construindo a imagem Docker do worker."
docker build -t "$IMAGE_NAME" .

docker_args=(
  --detach
  --name "$CONTAINER_NAME"
  --shm-size=2g
  --publish 127.0.0.1:3000:3000
  -e AREA_RESTRITA_PORTAL_URL
  -e AREA_RESTRITA_USERNAME
  -e AREA_RESTRITA_PASSWORD
  -e AREA_RESTRITA_VNC_PASSWORD
  -e SUPABASE_URL
  -e SUPABASE_SERVICE_ROLE_KEY
  -e AREA_RESTRITA_ROBOT_SECRET="$ROBOT_SECRET"
  -e AREA_RESTRITA_WEEKLY_SYNC_ENABLED=false
  -e AREA_RESTRITA_CHAIN_MAGGI_GROUPS=false
  -e AREA_RESTRITA_RUN_ON_START=false
  -e AREA_RESTRITA_PRICE_LIST_TIMEOUT_MS=2700000
  -e AREA_RESTRITA_TIME_ZONE=America/Porto_Velho
)

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  docker_args+=(-e OPENAI_API_KEY)
fi
if [[ -n "${AREA_RESTRITA_AI_MODEL:-}" ]]; then
  docker_args+=(-e AREA_RESTRITA_AI_MODEL)
fi

docker run "${docker_args[@]}" "$IMAGE_NAME" >/dev/null

echo "[area-restrita-github] Aguardando API local do worker."
healthy=false
for _ in $(seq 1 120); do
  if curl --fail --silent --show-error http://127.0.0.1:3000/health >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 1
done

if [[ "$healthy" != "true" ]]; then
  echo "::error title=Worker não iniciou::A API local não respondeu em até 120 segundos."
  exit 3
fi

echo "[area-restrita-github] Criando acesso remoto temporário protegido."
: >"$TUNNEL_LOG"
docker run --rm --network host cloudflare/cloudflared:2026.10.3 \
  tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:3000 \
  >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

for _ in $(seq 1 90); do
  TUNNEL_URL="$(grep -Eo 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -n 1 || true)"
  if [[ -n "$TUNNEL_URL" ]]; then
    break
  fi
  if ! kill -0 "$TUNNEL_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "::error title=Falha no acesso remoto::Não foi possível criar o navegador remoto temporário."
  exit 4
fi

publish_runtime   "starting"   "$TUNNEL_URL"   "Navegador remoto pronto. Abra a Área Restrita Maggi no CRM para continuar."

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    printf '%s\n' "## Área Restrita Maggi"
    printf '%s\n' ""
    printf '%s\n' "- O navegador remoto foi publicado somente na área administrativa do CRM."
    printf '%s\n' "- A URL temporária não é exibida nos logs deste workflow."
    printf '%s\n' "- Se houver Cloudflare, use o botão **Validar Cloudflare** dentro do CRM."
  } >>"$GITHUB_STEP_SUMMARY"
fi

echo "::notice title=Área Restrita Maggi::Navegador remoto pronto. A validação do Cloudflare deve ser feita dentro do CRM."

echo "[area-restrita-github] Disparando sincronização."
http_code="$(
  curl --silent --show-error \
    --output "${RUNNER_TEMP:-/tmp}/area-restrita-sync-response.json" \
    --write-out '%{http_code}' \
    --request POST \
    --header "Authorization: Bearer $ROBOT_SECRET" \
    http://127.0.0.1:3000/api/worker/sync
)"

if [[ "$http_code" != "202" && "$http_code" != "409" ]]; then
  echo "::error title=Falha ao iniciar sincronização::Worker retornou HTTP $http_code."
  exit 5
fi

started_epoch="$(date +%s)"
while true; do
  now_epoch="$(date +%s)"
  elapsed="$((now_epoch - started_epoch))"
  if (( elapsed >= MAX_SECONDS )); then
    echo "::error title=Tempo limite::A execução não terminou dentro do limite configurado."
    exit 6
  fi

  payload="$(
    curl --fail --silent --show-error \
      --header "Authorization: Bearer $ROBOT_SECRET" \
      http://127.0.0.1:3000/api/worker/status \
      || true
  )"

  if [[ -n "$payload" ]] && command -v jq >/dev/null 2>&1; then
    state="$(jq -r '.status.state // .state // empty' <<<"$payload" 2>/dev/null || true)"
    message="$(jq -r '.status.message // .message // empty' <<<"$payload" 2>/dev/null || true)"
    running="$(jq -r '.syncRunning // false' <<<"$payload" 2>/dev/null || echo false)"

    if [[ "$state" != "$LAST_STATE" ]]; then
      echo "[area-restrita-github] estado=${state:-desconhecido} running=$running mensagem=${message:-—}"
      publish_runtime "${state:-starting}" "$TUNNEL_URL" "${message:-Execução em andamento.}"
      LAST_STATE="$state"
    fi

    case "$state" in
      price_tables_synced)
        FINALIZED="true"
        publish_runtime           "price_tables_synced"           ""           "${message:-Sincronização concluída com sucesso.}"           "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo "::notice title=Área Restrita Maggi::Sincronização concluída com sucesso."
        exit 0
        ;;
      price_tables_error|error|cloudflare_rejected|login_not_confirmed)
        FINALIZED="true"
        publish_runtime           "$state"           ""           "${message:-A execução terminou com erro.}"           "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo "::error title=Área Restrita Maggi::${message:-A execução terminou com erro.}"
        exit 7
        ;;
    esac
  fi

  sleep 15
done
