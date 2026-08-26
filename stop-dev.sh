#!/usr/bin/env bash

set -u

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$ROOT_DIR/.dev-runtime"

stop_process() {
  local name="$1"
  local pid_file="$RUNTIME_DIR/$name.pid"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name is not running (no PID file)."
    return 0
  fi

  local pid
  pid="$(<"$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "Stopping $name (PID $pid)..."
    if kill -- -"$pid" 2>/dev/null; then
      :
    else
      kill "$pid" 2>/dev/null || true
    fi
    for _ in 1 2 3 4 5; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 -- -"$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    fi
  else
    echo "$name is not running (stale PID file)."
  fi
  rm -f "$pid_file"
}

stop_process portal
stop_process admin
stop_process backend
echo "Development services stopped."
