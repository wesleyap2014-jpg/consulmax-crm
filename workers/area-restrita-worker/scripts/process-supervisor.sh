#!/usr/bin/env bash

# O processo principal deve terminar para que a Railway possa reiniciá-lo.
declare -a SUPERVISED_PIDS=()
declare -A SUPERVISED_NAMES=()

register_process() {
  SUPERVISED_PIDS+=("$1")
  SUPERVISED_NAMES["$1"]="$2"
}

cleanup_processes() {
  local code="$1" pid
  local grace="${AREA_RESTRITA_SHUTDOWN_GRACE_SECONDS:-10}"
  [[ "$grace" =~ ^[0-9]+$ ]] || grace=10
  trap - EXIT INT TERM

  if ((${#SUPERVISED_PIDS[@]})); then
    kill -TERM "${SUPERVISED_PIDS[@]}" 2>/dev/null || true
    local deadline=$((SECONDS + grace))
    local running
    while ((SECONDS < deadline)); do
      running=0
      for pid in "${SUPERVISED_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then running=1; fi
      done
      if ((running == 0)); then break; fi
      sleep 0.2
    done

    for pid in "${SUPERVISED_PIDS[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        echo "[area-restrita] forçando encerramento de ${SUPERVISED_NAMES[$pid]} (pid=$pid)." >&2
        kill -KILL "$pid" 2>/dev/null || true
      fi
    done
    # Não espera processos auxiliares, como o tee, indefinidamente.
    wait "${SUPERVISED_PIDS[@]}" 2>/dev/null || true
  fi
  exit "$code"
}

install_process_supervision() {
  trap 'cleanup_processes "$?"' EXIT
  trap 'echo "[area-restrita] supervisor recebeu SIGINT."; exit 130' INT
  trap 'echo "[area-restrita] supervisor recebeu SIGTERM."; exit 143' TERM
}

supervise_processes() {
  local stopped_pid status=0 name="desconhecido"
  wait -n -p stopped_pid "${SUPERVISED_PIDS[@]}" || status=$?
  if [[ -n "${stopped_pid:-}" ]]; then
    name="${SUPERVISED_NAMES[$stopped_pid]:-desconhecido}"
  fi
  echo "[area-restrita] processo essencial encerrou: $name (pid=${stopped_pid:-?}, código=$status); solicitando reinício." >&2
  # Até uma saída 0 é inesperada para um serviço que deve permanecer ativo.
  return 1
}
