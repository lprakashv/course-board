#!/usr/bin/env bash
set -euo pipefail

case "$SOURCE" in
  repository)
    if [[ -z "$START_COMMAND" ]]; then echo 'start-command is required for repository capture.' >&2; exit 1; fi
    if ! [[ "$READY_TIMEOUT" =~ ^[1-9][0-9]*$ ]]; then echo 'ready-timeout must be a positive integer.' >&2; exit 1; fi
    bash -e -o pipefail -c "$BUILD_COMMAND"
    bash -e -o pipefail -c "$START_COMMAND" > "$RUNNER_TEMP/screenshot-server.log" 2>&1 &
    server_pid=$!
    trap 'kill "$server_pid" 2>/dev/null || true' EXIT
    for ((attempt=0; attempt<READY_TIMEOUT; attempt++)); do
      if curl --fail --silent --output /dev/null "$BASE_URL"; then break; fi
      if ! kill -0 "$server_pid" 2>/dev/null; then cat "$RUNNER_TEMP/screenshot-server.log"; exit 1; fi
      sleep 1
    done
    if ! curl --fail --silent --output /dev/null "$BASE_URL"; then
      cat "$RUNNER_TEMP/screenshot-server.log"
      echo 'The server did not become ready.' >&2
      exit 1
    fi
    ;;
  public)
    if [[ -n "$BUILD_COMMAND" || -n "$START_COMMAND" ]]; then echo 'Omit build-command and start-command for public capture.' >&2; exit 1; fi
    ;;
  *) echo 'source must be repository or public.' >&2; exit 1 ;;
esac

node "$(dirname "$0")/capture.js" "$CONFIG" "$BASE_URL" "$RUNNER_TEMP/screenshots"
