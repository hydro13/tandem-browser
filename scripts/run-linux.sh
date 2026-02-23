#!/usr/bin/env bash
# Tandem Browser — Linux launcher
# Handles sandbox, display server, and GPU quirks
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

ARGS=(--no-sandbox)

# Detect display server
if [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
  export ELECTRON_OZONE_PLATFORM_HINT=x11  # X11 fallback, more stable
fi

# Disable GPU if running headless or having GPU issues
if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
  ARGS+=(--disable-gpu --headless)
fi

exec npx electron . "${ARGS[@]}" "$@"
