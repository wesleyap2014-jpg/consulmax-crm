#!/usr/bin/env bash
set -Eeuo pipefail

: "${AREA_RESTRITA_PORTAL_URL:?Variável AREA_RESTRITA_PORTAL_URL ausente}"
: "${AREA_RESTRITA_USERNAME:?Variável AREA_RESTRITA_USERNAME ausente}"
: "${AREA_RESTRITA_PASSWORD:?Variável AREA_RESTRITA_PASSWORD ausente}"
: "${AREA_RESTRITA_VNC_PASSWORD:?Variável AREA_RESTRITA_VNC_PASSWORD ausente}"

export DISPLAY="${DISPLAY:-:99}"
export PORT="${PORT:-3000}"
export AREA_RESTRITA_DATA_DIR="${AREA_RESTRITA_DATA_DIR:-/data}"

PROFILE_DIR="${AREA_RESTRITA_DATA_DIR}/chrome-profile"
mkdir -p "${PROFILE_DIR}" /run/area-restrita /var/log/nginx

# Locks podem permanecer no volume quando o contêiner anterior é interrompido.
rm -f "${PROFILE_DIR}/SingletonLock" "${PROFILE_DIR}/SingletonSocket" "${PROFILE_DIR}/SingletonCookie"

cleanup() {
  local code=$?
  kill "${NGINX_PID:-}" "${BROWSER_PID:-}" "${WEBSOCKIFY_PID:-}" "${VNC_PID:-}" "${FLUXBOX_PID:-}" "${XVFB_PID:-}" 2>/dev/null || true
  wait 2>/dev/null || true
  exit "$code"
}
trap cleanup EXIT INT TERM

htpasswd -bcB /run/area-restrita/htpasswd consulmax "${AREA_RESTRITA_VNC_PASSWORD}" >/dev/null

envsubst '${PORT}' < /app/config/nginx.conf.template > /etc/nginx/nginx.conf

Xvfb "${DISPLAY}" -screen 0 1440x1000x24 -ac +extension GLX +render -noreset >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!

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

fluxbox -display "${DISPLAY}" >/tmp/fluxbox.log 2>&1 &
FLUXBOX_PID=$!

x11vnc \
  -display "${DISPLAY}" \
  -localhost \
  -rfbport 5900 \
  -forever \
  -shared \
  -nopw \
  -noxdamage \
  -quiet >/tmp/x11vnc.log 2>&1 &
VNC_PID=$!

websockify 127.0.0.1:6080 127.0.0.1:5900 >/tmp/websockify.log 2>&1 &
WEBSOCKIFY_PID=$!

node /app/src/remote-browser.mjs &
BROWSER_PID=$!

nginx -g 'daemon off;' &
NGINX_PID=$!

sleep 2
for pid in "${XVFB_PID}" "${VNC_PID}" "${WEBSOCKIFY_PID}" "${BROWSER_PID}" "${NGINX_PID}"; do
  if ! kill -0 "${pid}" 2>/dev/null; then
    echo "[area-restrita] um processo essencial encerrou durante a inicialização."
    exit 1
  fi
done

echo "[area-restrita] navegador remoto protegido iniciado."
echo "[area-restrita] usuário do acesso remoto: consulmax"

# Reinicia o serviço se qualquer processo essencial encerrar.
wait -n "${XVFB_PID}" "${VNC_PID}" "${WEBSOCKIFY_PID}" "${BROWSER_PID}" "${NGINX_PID}"
exit $?
