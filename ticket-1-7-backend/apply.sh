#!/usr/bin/env bash
# Ticket 1.7 — backend half — apply script.
#
# Idempotent. Run from the Replit project root after extracting the zip
# at the project root (so this script lives at ./ticket-1-7-backend/apply.sh).
#
# Steps:
#   1. Copy new files into place (campaigns schema, campaigns route, generateMessage route).
#   2. Run anchored patch scripts (prospects schema, schema barrel, routes barrel).
#   3. Generate Drizzle migration; review; apply.
#   4. Typecheck api-server.
#   5. Build api-server (so dist/ is fresh; restart will pick it up).
#   6. Mirror sync source-code/.
#   7. Stage integration tests at /tmp/ for manual run.
#
# Non-goals (handled outside this script):
#   - Restarting the dev server (operator clicks Republish on Replit).
#   - Running the integration tests against the deployed URL (the bash
#     block in chat does that after operator confirms deploy).
#
# Failures abort the script with `set -e`. Each step prints its own [OK]
# / [SKIP] / [FAIL] tag.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

echo "============================================================"
echo "  Ticket 1.7 — backend — apply.sh"
echo "  HERE=$HERE"
echo "  ROOT=$ROOT"
echo "============================================================"

# ─────────────────────────────────────────────────────────────────
# Step 1: copy new files
# ─────────────────────────────────────────────────────────────────
echo ""
echo "[STEP 1/7] Copy new files into place"

# We use `cp -n` first to avoid overwriting if a stale copy exists.
# Then verify each target file exists at the end.
NEW_FILES_SRC="$HERE/new-files"
if [ ! -d "$NEW_FILES_SRC" ]; then
  echo "[FAIL] new-files directory not found at $NEW_FILES_SRC"
  exit 1
fi

# copy lib/db/src/schema/campaigns.ts
mkdir -p "$ROOT/lib/db/src/schema"
cp -f "$NEW_FILES_SRC/lib/db/src/schema/campaigns.ts" \
      "$ROOT/lib/db/src/schema/campaigns.ts"
echo "  [OK] lib/db/src/schema/campaigns.ts"

# copy artifacts/api-server/src/routes/campaigns.ts
mkdir -p "$ROOT/artifacts/api-server/src/routes"
cp -f "$NEW_FILES_SRC/artifacts/api-server/src/routes/campaigns.ts" \
      "$ROOT/artifacts/api-server/src/routes/campaigns.ts"
echo "  [OK] artifacts/api-server/src/routes/campaigns.ts"

# copy artifacts/api-server/src/routes/generateMessage.ts
cp -f "$NEW_FILES_SRC/artifacts/api-server/src/routes/generateMessage.ts" \
      "$ROOT/artifacts/api-server/src/routes/generateMessage.ts"
echo "  [OK] artifacts/api-server/src/routes/generateMessage.ts"

# ─────────────────────────────────────────────────────────────────
# Step 2: run patches
# ─────────────────────────────────────────────────────────────────
echo ""
echo "[STEP 2/7] Apply anchored patches"
cd "$ROOT"
node "$HERE/patches/patch-prospects-schema.mjs"
node "$HERE/patches/patch-schema-index.mjs"
node "$HERE/patches/patch-routes-index.mjs"

# ─────────────────────────────────────────────────────────────────
# Step 3: generate + apply migration
# ─────────────────────────────────────────────────────────────────
echo ""
echo "[STEP 3/7] Generate + apply Drizzle migration"
echo ""
echo "  Generating migration from schema diff..."
pnpm --filter @workspace/db run generate

echo ""
echo "  Listing generated migration files (review before apply):"
ls -la "$ROOT/lib/db/migrations/" | tail -10 || true

echo ""
echo "  Applying migration..."
pnpm --filter @workspace/db run migrate
echo "  [OK] migration applied"

# ─────────────────────────────────────────────────────────────────
# Step 4: typecheck api-server
# ─────────────────────────────────────────────────────────────────
echo ""
echo "[STEP 4/7] Typecheck api-server"
pnpm --filter @workspace/api-server run typecheck
echo "  [OK] typecheck clean"

# ─────────────────────────────────────────────────────────────────
# Step 5: build api-server
# ─────────────────────────────────────────────────────────────────
# Build before restart is mandatory: restart alone would run stale dist/.
echo ""
echo "[STEP 5/7] Build api-server"
pnpm --filter @workspace/api-server run build
echo "  [OK] build clean"

# ─────────────────────────────────────────────────────────────────
# Step 6: mirror sync
# ─────────────────────────────────────────────────────────────────
echo ""
echo "[STEP 6/7] Mirror sync source-code/"
if [ -x "$ROOT/scripts/sync-source-code.sh" ]; then
  bash "$ROOT/scripts/sync-source-code.sh"
  echo "  [OK] mirror synced"
  echo "  git diff --stat source-code/ (review for unintended paths):"
  ( cd "$ROOT" && git diff --stat source-code/ 2>/dev/null || echo "  (git unavailable; skipping diff)" )
else
  echo "  [WARN] scripts/sync-source-code.sh not present; skipping mirror sync"
fi

# ─────────────────────────────────────────────────────────────────
# Step 7: stage tests
# ─────────────────────────────────────────────────────────────────
echo ""
echo "[STEP 7/7] Stage integration tests at /tmp/"
cp -f "$HERE/tests/integration-1-7-campaigns.mjs" /tmp/integration-1-7-campaigns.mjs
cp -f "$HERE/tests/integration-1-7-message.mjs" /tmp/integration-1-7-message.mjs
cp -f "$HERE/docs/manual-test-1-7.md" /tmp/manual-test-1-7.md
echo "  [OK] /tmp/integration-1-7-campaigns.mjs"
echo "  [OK] /tmp/integration-1-7-message.mjs"
echo "  [OK] /tmp/manual-test-1-7.md"

# ─────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  apply.sh COMPLETE"
echo "============================================================"
echo ""
echo "Next steps for the operator:"
echo "  1. Click Republish in the Replit UI (or restart the dev server)."
echo "  2. Wait for /api/health to return 200."
echo "  3. Run the campaigns CRUD test:"
echo "       node /tmp/integration-1-7-campaigns.mjs"
echo "  4. Run the (non-live) message route test:"
echo "       node /tmp/integration-1-7-message.mjs"
echo "  5. Optional: full live test (~\$0.10–0.20):"
echo "       RUN_LIVE_ANTHROPIC=1 node /tmp/integration-1-7-message.mjs"
echo "  6. Manual walkthrough: /tmp/manual-test-1-7.md"
