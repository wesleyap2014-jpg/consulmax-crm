#!/usr/bin/env bash
set -Eeuo pipefail

: "${AREA_RESTRITA_PORTAL_URL:?Variável AREA_RESTRITA_PORTAL_URL ausente}"
: "${AREA_RESTRITA_USERNAME:?Variável AREA_RESTRITA_USERNAME ausente}"
: "${AREA_RESTRITA_PASSWORD:?Variável AREA_RESTRITA_PASSWORD ausente}"
: "${AREA_RESTRITA_VNC_PASSWORD:?Variável AREA_RESTRITA_VNC_PASSWORD ausente}"

export DISPLAY="${DISPLAY:-:99}"
export PORT="${PORT:-3000}"
export AREA_RESTRITA_CONTROL_PORT="${AREA_RESTRITA_CONTROL_PORT:-3100}"
export AREA_RESTRITA_DATA_DIR="${AREA_RESTRITA_DATA_DIR:-/data}"

PROFILE_DIR="${AREA_RESTRITA_DATA_DIR}/chrome-profile"
mkdir -p "${PROFILE_DIR}" "${AREA_RESTRITA_DATA_DIR}/downloads" /run/area-restrita /var/log/nginx

# Locks podem permanecer no volume quando o contêiner anterior é interrompido.
rm -f "${PROFILE_DIR}/SingletonLock" "${PROFILE_DIR}/SingletonSocket" "${PROFILE_DIR}/SingletonCookie"

source "$(dirname "${BASH_SOURCE[0]}")/process-supervisor.sh"
install_process_supervision

htpasswd -bcB /run/area-restrita/htpasswd consulmax "${AREA_RESTRITA_VNC_PASSWORD}" >/dev/null

envsubst '${PORT}' < /app/config/nginx.conf.template > /etc/nginx/nginx.conf

Xvfb "${DISPLAY}" -screen 0 1440x1000x24 -ac +extension GLX +render -noreset >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!
register_process "$XVFB_PID" Xvfb

for _ in $(seq 1 30); do
  if xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then
  echo "[area-restrita] Xvfb não iniciou corretamente."
  exit 1
fi

# Mantém o teclado remoto em Português (Brasil) ABNT2. O login automático
# continua sendo usado para preservar caracteres exatamente como cadastrados.
setxkbmap -display "${DISPLAY}" -layout br -variant abnt2 >/tmp/setxkbmap.log 2>&1 || true

fluxbox -display "${DISPLAY}" >/tmp/fluxbox.log 2>&1 &
FLUXBOX_PID=$!
register_process "$FLUXBOX_PID" fluxbox

x11vnc \
  -display "${DISPLAY}" \
  -localhost \
  -rfbport 5900 \
  -forever \
  -shared \
  -nopw \
  -noxdamage \
  -xkb \
  -quiet >/tmp/x11vnc.log 2>&1 &
VNC_PID=$!
register_process "$VNC_PID" x11vnc

websockify 127.0.0.1:6080 127.0.0.1:5900 >/tmp/websockify.log 2>&1 &
WEBSOCKIFY_PID=$!
register_process "$WEBSOCKIFY_PID" websockify

node /app/src/remote-browser.mjs &
BROWSER_PID=$!
register_process "$BROWSER_PID" remote-browser

# A API de controle dispara a sincronização inicial, os comandos manuais do CRM
# e a rotina semanal de sexta-feira. Ela também consolida o status do worker.
# Espelha os logs no Railway e mantém a cópia local para diagnóstico.
node /app/src/server.mjs > >(tee -a /tmp/area-restrita-control.log) 2>&1 &
CONTROL_PID=$!
register_process "$CONTROL_PID" control-api

nginx -g 'daemon off;' &
NGINX_PID=$!
register_process "$NGINX_PID" nginx

sleep 2
for pid in "${SUPERVISED_PIDS[@]}"; do
  if ! kill -0 "${pid}" 2>/dev/null; then
    echo "[area-restrita] ${SUPERVISED_NAMES[$pid]} encerrou durante a inicialização."
    exit 1
  fi
done

echo "[area-restrita] navegador remoto protegido iniciado."
echo "[area-restrita] usuário do acesso remoto: consulmax"
echo "[area-restrita] API de controle disponível internamente na porta ${AREA_RESTRITA_CONTROL_PORT}."

# Reinicia o serviço se qualquer processo essencial encerrar.
supervise_processes
