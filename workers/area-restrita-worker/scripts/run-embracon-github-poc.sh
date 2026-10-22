#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE_NAME="consulmax-embracon-poc:github-runner"
CONTAINER_NAME="consulmax-embracon-github-poc"
ARTIFACT_DIR="${GITHUB_WORKSPACE:-$(pwd)}/workers/area-restrita-worker/artifacts/embracon-remote-poc"
TUNNEL_LOG="${RUNNER_TEMP:-/tmp}/embracon-cloudflared.log"
TUNNEL_PID=""
TUNNEL_URL=""
LAST_STATE=""
FINALIZED="false"
MAX_SECONDS="${EMBRACON_GITHUB_TIMEOUT_SECONDS:-2700}"
RUNTIME_KEY="embracon"
RUNTIME_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
GITHUB_RUN_URL=""

if [[ -n "${GITHUB_SERVER_URL:-}" && -n "${GITHUB_REPOSITORY:-}" && -n "${GITHUB_RUN_ID:-}" ]]; then
  GITHUB_RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
fi

required_envs=(
  AREA_RESTRITA_VNC_PASSWORD
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  CONVERT_ROBOT_USERNAME
  CONVERT_ROBOT_PASSWORD
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
  expires_at="$(date -u -d '+1 hour' +"%Y-%m-%dT%H:%M:%SZ")"
  run_id_json="null"
  if [[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]]; then
    run_id_json="${GITHUB_RUN_ID}"
  fi

  payload="$(jq -nc     --arg key "$RUNTIME_KEY"     --arg state "$state"     --arg message "$message"     --arg remote "$remote_url"     --arg run_url "$GITHUB_RUN_URL"     --arg started "$RUNTIME_STARTED_AT"     --arg finished "$finished_at"     --arg expires "$expires_at"     --arg updated "$now"     --argjson run_id "$run_id_json"     '{
      key: $key,
      administradora: "embracon",
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

  curl --fail --silent --show-error     --request POST     --header "apikey: $SUPABASE_SERVICE_ROLE_KEY"     --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"     --header "Content-Type: application/json"     --header "Prefer: resolution=merge-duplicates,return=minimal"     --data "$payload"     "${SUPABASE_URL%/}/rest/v1/area_restrita_runtime_sessions?on_conflict=key"     >/dev/null
}

collect_artifacts() {
  set +e
  if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    docker logs "$CONTAINER_NAME" >"$ARTIFACT_DIR/worker-container.log" 2>&1 || true
    docker cp "$CONTAINER_NAME:/data/embracon-poc-status.json" "$ARTIFACT_DIR/embracon-poc-status.json" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  local exit_code=$?
  set +e

  if [[ "$FINALIZED" != "true" ]]; then
    publish_runtime       "error"       ""       "A execução do POC Embracon foi interrompida antes da conclusão."       "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"       >/dev/null 2>&1 || true
  fi

  collect_artifacts
  if [[ -n "$TUNNEL_PID" ]]; then
    kill "$TUNNEL_PID" >/dev/null 2>&1 || true
  fi
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  return "$exit_code"
}
trap cleanup EXIT INT TERM

publish_runtime "starting" "" "Preparando o GitHub Runner do POC Embracon."

echo "[embracon-github] Construindo imagem Docker."
docker build -t "$IMAGE_NAME" .

docker run   --detach   --name "$CONTAINER_NAME"   --shm-size=2g   --publish 127.0.0.1:3000:3000   -e AREA_RESTRITA_VNC_PASSWORD   -e CONVERT_ROBOT_USERNAME   -e CONVERT_ROBOT_PASSWORD   -e AREA_RESTRITA_WEEKLY_SYNC_ENABLED=false   -e AREA_RESTRITA_CHAIN_MAGGI_GROUPS=false   -e AREA_RESTRITA_RUN_ON_START=false   "$IMAGE_NAME"   bash /app/scripts/start-embracon-remote.sh   >/dev/null

echo "[embracon-github] Aguardando navegador remoto."
healthy=false
for _ in $(seq 1 120); do
  if curl --fail --silent --show-error http://127.0.0.1:3000/health >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 1
done

if [[ "$healthy" != "true" ]]; then
  echo "::error title=POC Embracon::O navegador remoto não iniciou."
  exit 3
fi

: >"$TUNNEL_LOG"
docker run --rm --network host cloudflare/cloudflared:2026.10.3   tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:3000   >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

for _ in $(seq 1 90); do
  TUNNEL_URL="$(grep -Eo 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -n 1 || true)"
  if [[ -n "$TUNNEL_URL" ]]; then break; fi
  if ! kill -0 "$TUNNEL_PID" >/dev/null 2>&1; then break; fi
  sleep 1
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "::error title=POC Embracon::Não foi possível criar o acesso remoto."
  exit 4
fi

publish_runtime   "starting"   "$TUNNEL_URL"   "Navegador remoto pronto. O robô está preenchendo o login Microsoft automaticamente."

echo "::notice title=POC Embracon::Navegador remoto pronto na área administrativa do CRM."

started_epoch="$(date +%s)"
while true; do
  now_epoch="$(date +%s)"
  elapsed="$((now_epoch - started_epoch))"
  if (( elapsed >= MAX_SECONDS )); then
    echo "::error title=POC Embracon::Tempo limite atingido."
    exit 5
  fi

  payload="$(docker exec "$CONTAINER_NAME" cat /data/embracon-poc-status.json 2>/dev/null || true)"
  if [[ -n "$payload" ]]; then
    state="$(jq -r '.state // empty' <<<"$payload" 2>/dev/null || true)"
    message="$(jq -r '.message // empty' <<<"$payload" 2>/dev/null || true)"

    if [[ -n "$state" && "$state" != "$LAST_STATE" ]]; then
      echo "[embracon-github] estado=$state mensagem=${message:-—}"
      publish_runtime "$state" "$TUNNEL_URL" "${message:-Execução em andamento.}"
      LAST_STATE="$state"
    fi

    case "$state" in
      returned_to_convert)
        FINALIZED="true"
        publish_runtime           "returned_to_convert"           ""           "${message:-A autenticação Microsoft retornou ao Convert+. POC concluído.}"           "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo "::notice title=POC Embracon::Autenticação retornou ao Convert+."
        exit 0
        ;;
      credentials_rejected|convert_access_denied|error)
        FINALIZED="true"
        publish_runtime           "$state"           ""           "${message:-O POC Embracon terminou com erro.}"           "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo "::error title=POC Embracon::${message:-Falha de autenticação.}"
        exit 6
        ;;
    esac
  fi

  sleep 5
done
