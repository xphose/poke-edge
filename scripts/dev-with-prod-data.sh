#!/usr/bin/env bash
# One-shot: pull a sanitized prod snapshot and start the dev server.
#
# First run:
#   export POKEGRAILS_SSH_HOST=your-server-host
#   export POKEGRAILS_SSH_USER=deploy
#   export POKEGRAILS_ADMIN_EMAIL=you@example.com
#   scripts/dev-with-prod-data.sh
#
# Subsequent runs: just `npm run dev:prod-data`. If the local snapshot is
# newer than 24h we reuse it; otherwise we re-pull.

set -euo pipefail
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DB="$REPO_ROOT/apps/server/data/pokegrails.sqlite"
MAX_AGE_HOURS="${POKEGRAILS_SNAPSHOT_MAX_AGE_HOURS:-24}"

if [ -f "$LOCAL_DB" ]; then
  if [ "$(find "$LOCAL_DB" -mmin -$((MAX_AGE_HOURS * 60)) 2>/dev/null | wc -l)" -gt 0 ]; then
    echo "[dev-with-prod-data] Using existing snapshot (age < ${MAX_AGE_HOURS}h). Delete it or run scripts/pull-prod-snapshot.sh to force re-pull."
  else
    echo "[dev-with-prod-data] Snapshot is stale; re-pulling…"
    "$REPO_ROOT/scripts/pull-prod-snapshot.sh"
  fi
else
  echo "[dev-with-prod-data] No local snapshot yet; pulling…"
  "$REPO_ROOT/scripts/pull-prod-snapshot.sh"
fi

echo ""
echo "[dev-with-prod-data] Starting dev server (web on 5173, api on 3001)…"
cd "$REPO_ROOT"
exec npm run dev
