#!/usr/bin/env bash

set -u

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$ROOT_DIR/.dev-runtime"
mkdir -p "$RUNTIME_DIR"

start_process() {
  local name="$1"
  local directory="$2"
  shift 2
  local pid_file="$RUNTIME_DIR/$name.pid"
  local log_file="$RUNTIME_DIR/$name.log"

  if [[ -f "$pid_file" ]]; then
    local old_pid
    old_pid="$(<"$pid_file")"
    if kill -0 "$old_pid" 2>/dev/null; then
      echo "$name is already running (PID $old_pid)."
      return 0
    fi
    rm -f "$pid_file"
  fi

  echo "Starting $name..."
  if command -v setsid >/dev/null 2>&1; then
    setsid bash -c 'cd "$1" && exec "${@:2}"' _ "$directory" "$@" >"$log_file" 2>&1 &
  else
    nohup bash -c 'cd "$1" && exec "${@:2}"' _ "$directory" "$@" >"$log_file" 2>&1 &
  fi
  echo $! >"$pid_file"
  echo "  PID: $!  Log: $log_file"
}

start_process backend "$ROOT_DIR/business-central-backend" go run ./cmd/server
start_process admin "$ROOT_DIR/business-central-admin" npm run dev
start_process portal "$ROOT_DIR/business-central-portal" npm run dev

echo "Development services started."
