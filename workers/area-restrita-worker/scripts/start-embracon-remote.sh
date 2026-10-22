#!/usr/bin/env bash
set -Eeuo pipefail

: "${AREA_RESTRITA_VNC_PASSWORD:?Variável AREA_RESTRITA_VNC_PASSWORD ausente}"

export DISPLAY="${DISPLAY:-:99}"
export PORT="${PORT:-3000}"
export AREA_RESTRITA_CONTROL_PORT="${AREA_RESTRITA_CONTROL_PORT:-3100}"
export AREA_RESTRITA_DATA_DIR="${AREA_RESTRITA_DATA_DIR:-/data}"
export AREA_RESTRITA_WEEKLY_SYNC_ENABLED=false
export AREA_RESTRITA_CHAIN_MAGGI_GROUPS=false
export AREA_RESTRITA_RUN_ON_START=false

PROFILE_DIR="${AREA_RESTRITA_DATA_DIR}/embracon-chrome-profile"
mkdir -p "${PROFILE_DIR}" /run/area-restrita /var/log/nginx
rm -f "${PROFILE_DIR}/SingletonLock" "${PROFILE_DIR}/SingletonSocket" "${PROFILE_DIR}/SingletonCookie"

source "$(dirname "${BASH_SOURCE[0]}")/process-supervisor.sh"
install_process_supervision

htpasswd -bcB /run/area-restrita/htpasswd consulmax "${AREA_RESTRITA_VNC_PASSWORD}" >/dev/null
envsubst '${PORT}' < /app/config/nginx.conf.template > /etc/nginx/nginx.conf

Xvfb "${DISPLAY}" -screen 0 1440x1000x24 -ac +extension GLX +render -noreset >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!
register_process "$XVFB_PID" Xvfb

for _ in $(seq 1 30); do
  if xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then break; fi
  sleep 1
done
xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1 || { echo "[embracon-poc] Xvfb não iniciou."; exit 1; }

setxkbmap -display "${DISPLAY}" -layout br -variant abnt2 >/tmp/setxkbmap.log 2>&1 || true

fluxbox -display "${DISPLAY}" >/tmp/fluxbox.log 2>&1 &
FLUXBOX_PID=$!
register_process "$FLUXBOX_PID" fluxbox

x11vnc   -display "${DISPLAY}"   -localhost   -rfbport 5900   -forever   -shared   -nopw   -noxdamage   -xkb   -quiet >/tmp/x11vnc.log 2>&1 &
VNC_PID=$!
register_process "$VNC_PID" x11vnc

websockify 127.0.0.1:6080 127.0.0.1:5900 >/tmp/websockify.log 2>&1 &
WEBSOCKIFY_PID=$!
register_process "$WEBSOCKIFY_PID" websockify

node /app/src/embracon-remote-browser.mjs &
BROWSER_PID=$!
register_process "$BROWSER_PID" embracon-browser

node /app/src/server.mjs > >(tee -a /tmp/embracon-control.log) 2>&1 &
CONTROL_PID=$!
register_process "$CONTROL_PID" control-api

nginx -g 'daemon off;' &
NGINX_PID=$!
register_process "$NGINX_PID" nginx

sleep 2
for pid in "${SUPERVISED_PIDS[@]}"; do
  if ! kill -0 "${pid}" 2>/dev/null; then
    echo "[embracon-poc] ${SUPERVISED_NAMES[$pid]} encerrou durante a inicialização."
    exit 1
  fi
done

echo "[embracon-poc] navegador remoto protegido iniciado."
supervise_processes
