#!/usr/bin/env bash
# Railway startup: import the Jupiter CLI signing key from env (so REAL perps can
# execute), then launch the long-running server (Express API + UI + trading daemons).
set -uo pipefail
export NODE_ENV=production

KEY_NAME="${JUP_KEY_NAME:-main}"
SIGNING_KEY="${JUP_PRIVATE_KEY:-${PRIVATE_KEY:-}}"

# The `jup` binary comes from the @jup-ag/cli dependency; npm puts node_modules/.bin
# on PATH for this script, and the server (exec'd below) inherits it for execFile("jup").
if [ -n "$SIGNING_KEY" ]; then
  echo "[railway-start] Importing Jupiter CLI key '$KEY_NAME' (idempotent)..."
  jup keys delete "$KEY_NAME" >/dev/null 2>&1 || true
  if jup keys add "$KEY_NAME" --private-key "$SIGNING_KEY" >/dev/null 2>&1; then
    jup keys use "$KEY_NAME" >/dev/null 2>&1 || true
    echo "[railway-start] Jupiter CLI key '$KEY_NAME' ready — REAL execution enabled."
  else
    echo "[railway-start] WARNING: jup key import failed — REAL trades will roll back; PAPER still works."
  fi
else
  echo "[railway-start] No JUP_PRIVATE_KEY/PRIVATE_KEY set — PAPER mode only (no real execution)."
fi

echo "[railway-start] Launching server (permanent runtime)..."
exec node dist/server.cjs
