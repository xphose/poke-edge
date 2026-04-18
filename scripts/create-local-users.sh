#!/usr/bin/env bash
# Create (or reset) three dev accounts in the local SQLite DB — one per tier.
# Useful for testing tier-gating behavior (free gets 3 newest sets, premium +
# admin see the full catalog, admin-only endpoints 403 for premium, etc).
#
# Idempotent: existing emails are upserted in place.
#
# Usage:
#   npm run local:users
#
# Env overrides:
#   POKEGRAILS_LOCAL_PASSWORD   (default: devdev123; same for all three, must be ≥ 8 chars)
#   POKEGRAILS_LOCAL_DB         (default: apps/server/data/pokegrails.sqlite)
#
# Resulting accounts (all share the same password):
#   admin@local.dev    / role=admin
#   premium@local.dev  / role=premium
#   free@local.dev     / role=free

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PASSWORD="${POKEGRAILS_LOCAL_PASSWORD:-devdev123}"
DB="${POKEGRAILS_LOCAL_DB:-$REPO_ROOT/apps/server/data/pokegrails.sqlite}"

if [ ${#PASSWORD} -lt 8 ]; then
  echo "[create-local-users] POKEGRAILS_LOCAL_PASSWORD must be at least 8 characters."
  exit 1
fi

if [ ! -f "$DB" ]; then
  echo "[create-local-users] local DB not found at $DB"
  echo "                     Run 'npm run dev:prod-data' or 'npm run snapshot' first."
  exit 1
fi

for bin in sqlite3 node; do
  command -v "$bin" >/dev/null 2>&1 || { echo "[create-local-users] missing binary: $bin"; exit 1; }
done

if [ ! -d "$REPO_ROOT/apps/server/node_modules/bcryptjs" ] && [ ! -d "$REPO_ROOT/node_modules/bcryptjs" ]; then
  echo "[create-local-users] bcryptjs not installed — running npm install"
  (cd "$REPO_ROOT" && npm install --silent)
fi

# Hash once — all three users share the same password, so no need to pay
# the bcrypt cost three times.
PW_HASH="$(cd "$REPO_ROOT/apps/server" && PW="$PASSWORD" node -e "
  const bcrypt = require('bcryptjs')
  bcrypt.hash(process.env.PW, 12).then(h => process.stdout.write(h))
")"

esc() { printf "%s" "$1" | sed "s/'/''/g"; }
HASH_SQL="$(esc "$PW_HASH")"

upsert() {
  local username="$1" email="$2" role="$3"
  local u_sql e_sql
  u_sql="$(esc "$username")"; e_sql="$(esc "$email")"
  sqlite3 "$DB" <<SQL
INSERT INTO users (username, email, password_hash, role)
VALUES ('$u_sql', '$e_sql', '$HASH_SQL', '$role')
ON CONFLICT(email) DO UPDATE SET
  password_hash = excluded.password_hash,
  role          = excluded.role,
  username      = excluded.username,
  updated_at    = datetime('now');
SQL
}

upsert "localadmin"   "admin@local.dev"   "admin"
upsert "localpremium" "premium@local.dev" "premium"
upsert "localfree"    "free@local.dev"    "free"

echo "[create-local-users] ✓ seeded three tier accounts in $DB"
sqlite3 -column -header "$DB" \
  "SELECT id, email, username, role FROM users WHERE email IN ('admin@local.dev','premium@local.dev','free@local.dev') ORDER BY role;"
echo ""
echo "Password for all three: $PASSWORD"
echo "Log in at http://localhost:5173"
