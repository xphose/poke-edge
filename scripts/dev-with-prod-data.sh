#!/usr/bin/env bash
# One-shot: use a sanitized prod snapshot and start the dev server.
#
# First-time setup:
#   export POKEGRAILS_SSH_HOST=your-server-host
#   export POKEGRAILS_SSH_USER=deploy
#   export POKEGRAILS_ADMIN_EMAIL=you@example.com
#
# Typical use:
#   npm run dev:prod-data           # reuse local snapshot if fresh, pull if missing/stale
#   npm run dev:prod-data -- --fresh    # force a fresh pull regardless of age
#   npm run dev:prod-data -- --no-pull  # never pull; use whatever's on disk (or fail if none)
#
# Freshness:
#   A snapshot is "fresh" if apps/server/data/pokegrails.sqlite was modified
#   within POKEGRAILS_SNAPSHOT_MAX_AGE_HOURS (default 24). Bump that env var
#   to e.g. 168 if you want to reuse the same snapshot for a whole week.
#
# Any unknown arguments are forwarded to scripts/pull-prod-snapshot.sh, so
# `--keep-secrets` etc. still work.

set -euo pipefail
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DB="$REPO_ROOT/apps/server/data/pokegrails.sqlite"
MAX_AGE_HOURS="${POKEGRAILS_SNAPSHOT_MAX_AGE_HOURS:-24}"

FORCE_FRESH=0
NO_PULL=0
PASSTHROUGH=()
for arg in "$@"; do
  case "$arg" in
    --fresh|-f|--force)   FORCE_FRESH=1 ;;
    --no-pull|--keep|--reuse) NO_PULL=1 ;;
    *)                    PASSTHROUGH+=("$arg") ;;
  esac
done

# Age helper: prints integer hours since mtime, or "missing" if file doesn't exist.
snapshot_age_hours() {
  if [ ! -f "$LOCAL_DB" ]; then
    echo "missing"
    return
  fi
  local now mtime
  now="$(date +%s)"
  mtime="$(stat -c %Y "$LOCAL_DB" 2>/dev/null || stat -f %m "$LOCAL_DB")"
  echo $(( (now - mtime) / 3600 ))
}

AGE="$(snapshot_age_hours)"

decide_pull() {
  if [ "$FORCE_FRESH" = "1" ]; then
    echo "[dev-with-prod-data] --fresh passed → forcing a new pull."
    return 0  # pull
  fi

  if [ "$AGE" = "missing" ]; then
    if [ "$NO_PULL" = "1" ]; then
      echo "[dev-with-prod-data] --no-pull passed but no local snapshot exists at:"
      echo "                     $LOCAL_DB"
      echo "                     Run without --no-pull (or run scripts/pull-prod-snapshot.sh) first."
      exit 1
    fi
    echo "[dev-with-prod-data] No local snapshot yet; pulling…"
    return 0  # pull
  fi

  if [ "$NO_PULL" = "1" ]; then
    echo "[dev-with-prod-data] --no-pull → reusing existing snapshot (age ${AGE}h, threshold ${MAX_AGE_HOURS}h)."
    return 1  # skip
  fi

  if [ "$AGE" -lt "$MAX_AGE_HOURS" ]; then
    echo "[dev-with-prod-data] Reusing existing snapshot (age ${AGE}h < ${MAX_AGE_HOURS}h threshold)."
    echo "                     To force a fresh pull:  npm run dev:prod-data -- --fresh"
    echo "                     To bump the threshold:  export POKEGRAILS_SNAPSHOT_MAX_AGE_HOURS=168"
    return 1  # skip
  fi

  echo "[dev-with-prod-data] Snapshot is stale (age ${AGE}h ≥ ${MAX_AGE_HOURS}h); re-pulling…"
  echo "                     To keep the existing one anyway: npm run dev:prod-data -- --no-pull"
  return 0  # pull
}

if decide_pull; then
  "$REPO_ROOT/scripts/pull-prod-snapshot.sh" "${PASSTHROUGH[@]}"
fi

echo ""
echo "[dev-with-prod-data] Starting dev server (web on 5173, api on 3001)…"
cd "$REPO_ROOT"
exec npm run dev
