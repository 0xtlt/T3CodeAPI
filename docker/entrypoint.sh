#!/bin/sh
set -eu

if [ -z "${OPENROUTER_API_KEY:-}" ] && [ -n "${OPENROUTER_API_KEY_FILE:-}" ]; then
  if [ ! -r "$OPENROUTER_API_KEY_FILE" ]; then
    echo "OpenRouter secret file is not readable." >&2
    exit 1
  fi
  OPENROUTER_API_KEY="$(tr -d '\r\n' < "$OPENROUTER_API_KEY_FILE")"
  export OPENROUTER_API_KEY
fi

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "Set OPENROUTER_API_KEY_FILE to a mounted secret file." >&2
  exit 1
fi

mkdir -p "$HOME/.config/opencode" "$T3CODE_HOME"

if [ ! -r /workspace ] || [ ! -w /workspace ]; then
  echo "Workspace must be readable and writable by container user $(id -u):$(id -g)." >&2
  exit 1
fi

node /opt/t3code/configure-opencode.mjs
exec t3 serve /workspace "$@"
