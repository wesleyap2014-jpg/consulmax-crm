#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE_NAME="consulmax-area-restrita-worker:github-poc"
CONTAINER_NAME="consulmax-area-restrita-github-poc"
ARTIFACT_DIR="${GITHUB_WORKSPACE:-$(pwd)}/workers/area-restrita-worker/artifacts/github-actions-poc"
TUNNEL_LOG="${RUNNER_TEMP:-/tmp}/area-restrita-cloudflared.log"
TUNNEL_PID=""
LAST_STATE=""
ROBOT_SECRET="${AREA_RESTRITA_ROBOT_SECRET:-$(openssl rand -hex 32)}"
MAX_SECONDS="${AREA_RESTRITA_GITHUB_TIMEOUT_SECONDS:-9000}"

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

collect_artifacts() {
  set +e
  if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    docker logs "$CONTAINER_NAME" >"$ARTIFACT_DIR/worker-container.log" 2>&1 || true
    for file in       area-restrita-status.json       area-restrita-price-tables.json       area-restrita-assemblies.json       price-table-runner.log; do
      docker cp "$CONTAINER_NAME:/data/$file" "$ARTIFACT_DIR/$file" >/dev/null 2>&1 || true
    done
  fi
}

cleanup() {
  set +e
  collect_artifacts
  if [[ -n "$TUNNEL_PID" ]]; then
    kill "$TUNNEL_PID" >/dev/null 2>&1 || true
  fi
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "[area-restrita-github] Construindo a mesma imagem Docker usada pelo worker."
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

echo "[area-restrita-github] Criando acesso remoto temporário protegido por Basic Auth."
: >"$TUNNEL_LOG"
docker run --rm --network host cloudflare/cloudflared:2026.10.3   tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:3000   >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

TUNNEL_URL=""
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
  echo "::error title=Falha no acesso remoto::Não foi possível obter a URL temporária do túnel."
  sed -n '1,120p' "$TUNNEL_LOG" || true
  exit 4
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "remote_url=$TUNNEL_URL" >>"$GITHUB_OUTPUT"
fi

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## Área Restrita Maggi — acesso temporário"
    echo ""
    echo "- **URL:** $TUNNEL_URL"
    echo "- **Usuário:** `consulmax`"
    echo "- **Senha:** use o valor configurado no secret `AREA_RESTRITA_VNC_PASSWORD`."
    echo "- O endereço existe somente durante esta execução."
    echo "- Se o Cloudflare da Maggi aparecer, faça a validação nessa janela. O login será preenchido pelo worker após a validação."
  } >>"$GITHUB_STEP_SUMMARY"
fi

echo "::notice title=Validação Cloudflare Maggi::Abra $TUNNEL_URL e autentique com o usuário consulmax. A senha é o secret AREA_RESTRITA_VNC_PASSWORD."

echo "[area-restrita-github] Disparando sincronização. O runner aguardará a autenticação se o Cloudflare solicitar validação."
http_code="$(
  curl --silent --show-error     --output "${RUNNER_TEMP:-/tmp}/area-restrita-sync-response.json"     --write-out '%{http_code}'     --request POST     --header "Authorization: Bearer $ROBOT_SECRET"     http://127.0.0.1:3000/api/worker/sync
)"

if [[ "$http_code" != "202" && "$http_code" != "409" ]]; then
  echo "::error title=Falha ao iniciar sincronização::Worker retornou HTTP $http_code."
  cat "${RUNNER_TEMP:-/tmp}/area-restrita-sync-response.json" || true
  exit 5
fi

started_epoch="$(date +%s)"
while true; do
  now_epoch="$(date +%s)"
  elapsed="$((now_epoch - started_epoch))"
  if (( elapsed >= MAX_SECONDS )); then
    echo "::error title=Tempo limite::A execução não terminou dentro do limite de $MAX_SECONDS segundos."
    exit 6
  fi

  payload="$(
    curl --fail --silent --show-error       --header "Authorization: Bearer $ROBOT_SECRET"       http://127.0.0.1:3000/api/worker/status       || true
  )"

  if [[ -n "$payload" ]] && command -v jq >/dev/null 2>&1; then
    state="$(jq -r '.status.state // .state // empty' <<<"$payload" 2>/dev/null || true)"
    message="$(jq -r '.status.message // .message // empty' <<<"$payload" 2>/dev/null || true)"
    running="$(jq -r '.syncRunning // false' <<<"$payload" 2>/dev/null || echo false)"

    if [[ "$state" != "$LAST_STATE" ]]; then
      echo "[area-restrita-github] estado=${state:-desconhecido} running=$running mensagem=${message:-—}"
      LAST_STATE="$state"
    fi

    case "$state" in
      price_tables_synced)
        echo "::notice title=Área Restrita Maggi::Sincronização concluída com sucesso."
        exit 0
        ;;
      price_tables_error|error|cloudflare_rejected|login_not_confirmed)
        echo "::error title=Área Restrita Maggi::${message:-A execução terminou com erro.}"
        exit 7
        ;;
    esac
  fi

  sleep 15
done
