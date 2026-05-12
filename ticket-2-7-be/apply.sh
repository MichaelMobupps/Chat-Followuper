#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# ticket-2-7-be — Manual prospect ingest (WhatsApp, BE)
# ──────────────────────────────────────────────────────────────────────────
#
# Idempotent. Re-running after a successful run is a no-op on the patches
# (each detects its own marker) and re-runs the drizzle/tsc/typecheck/sync
# steps cheaply.
#
# Pipeline:
#   1. Pre-flight: required files exist; patch anchors present.
#   2. Apply four patches (schema x3, route x1).
#   3. Generate drizzle migration for the new columns.
#   4. Rebuild lib/db composite project so consumers see new types.
#   5. Typecheck @workspace/api-server.
#   6. Sync artifacts/api-server/src → source-code/ via repo script.
#
# Exits 0 on full success, non-zero on any failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

export TICKET_DIR="$SCRIPT_DIR"

# ─── 1/6 Pre-flight ───────────────────────────────────────────────────────

echo "[1/6] Pre-flight checks..."

REQUIRED_FILES=(
  "lib/db/src/schema/prospects.ts"
  "lib/db/src/schema/users.ts"
  "lib/db/src/schema/action_logs.ts"
  "artifacts/api-server/src/routes/prospects.ts"
  "lib/db/drizzle.config.ts"
  "scripts/sync-source-code.sh"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  MISSING required file: $f" >&2
    exit 1
  fi
done

# Anchor presence checks. Each patch verifies its own anchor at apply
# time too; failing fast here keeps the error message close to the cause.
declare -a ANCHOR_FILES=(
  "lib/db/src/schema/prospects.ts"
  "lib/db/src/schema/users.ts"
  "lib/db/src/schema/action_logs.ts"
  "artifacts/api-server/src/routes/prospects.ts"
)
declare -a ANCHOR_STRINGS=(
  'contextNotes: text("context_notes"),'
  'slackBotToken: text("slack_bot_token"),'
  'prospectDeleted: "prospect.deleted",'
  'export default router;'
)

for i in "${!ANCHOR_FILES[@]}"; do
  file="${ANCHOR_FILES[$i]}"
  needle="${ANCHOR_STRINGS[$i]}"
  if ! grep -qF "$needle" "$file"; then
    echo "  MISSING anchor in $file" >&2
    echo "    expected: $needle" >&2
    exit 1
  fi
done

echo "  ok"

# ─── 2/6 Patches ──────────────────────────────────────────────────────────

echo "[2/6] Applying patches..."

# Parse-check each patch before running. node --check catches syntax errors
# without executing — the Beautiful-Squidward Pass 6 protection.
for p in \
  "$SCRIPT_DIR/patches/01-schema-prospects.js" \
  "$SCRIPT_DIR/patches/02-schema-users.js" \
  "$SCRIPT_DIR/patches/03-schema-action-logs.js" \
  "$SCRIPT_DIR/patches/04-route-prospects.js"; do
  node --check "$p"
done

node "$SCRIPT_DIR/patches/01-schema-prospects.js"
node "$SCRIPT_DIR/patches/02-schema-users.js"
node "$SCRIPT_DIR/patches/03-schema-action-logs.js"
node "$SCRIPT_DIR/patches/04-route-prospects.js"

echo "  ok"

# ─── 3/6 Drizzle migration ────────────────────────────────────────────────

echo "[3/6] Generating drizzle migration..."

(
  cd lib/db
  pnpm exec drizzle-kit generate \
    --name manual_ingest_columns \
    --config ./drizzle.config.ts
)

echo "  ok"

# ─── 4/6 Composite rebuild ────────────────────────────────────────────────

echo "[4/6] Rebuilding lib/db composite project..."

# Required between schema edits and consumer typecheck. Composite
# project consumers (api-server, dashboard) resolve @workspace/db
# imports through lib/db/dist/*.d.ts, not the source. Per gotcha G2 in
# the post-2.6 handoff: do NOT delete lib/db/dist/ or tsbuildinfo;
# rebuild instead.
pnpm exec tsc -b lib/db

echo "  ok"

# ─── 5/6 Consumer typecheck ───────────────────────────────────────────────

echo "[5/6] Typechecking @workspace/api-server..."

# typecheck only, never build — per gotcha G3, Vite build requires
# workflow-provided env (PORT, BASE_PATH) and fails when invoked from
# bash even when code is correct.
pnpm --filter @workspace/api-server run typecheck

echo "  ok"

# ─── 6/6 Sync source-code/ ────────────────────────────────────────────────

echo "[6/6] Syncing source-code/..."

bash scripts/sync-source-code.sh

echo "  ok"

echo ""
echo "ticket-2-7-be: apply.sh completed successfully"
echo ""
echo "Next steps (run separately):"
echo "  1. restart_workflow to pick up the new endpoints"
echo "  2. paste the workflow startup log here for verification"
echo "  3. smoke test:"
echo "       curl -X POST http://localhost:80/api/prospects/manual-ingest \\"
echo "         -H \"Authorization: Bearer \$ADDON_API_KEY\" \\"
echo "         -H \"Content-Type: application/json\" \\"
echo "         -d '{\"channel\":\"whatsapp\",\"firstName\":\"Yaron\",\"phone\":\"+972501234567\",\"company\":\"MobUpps\",\"ticker\":\"mobile\"}'"

exit 0
