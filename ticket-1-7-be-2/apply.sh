#!/usr/bin/env bash
# Ticket 1.7-BE-2 — POST/GET/PATCH/DELETE /api/prospects
# Idempotent orchestrator. Safe to re-run.
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "artifacts/api-server" ]; then
  echo "[apply] FAIL: artifacts/api-server not found. Run from project root." >&2
  exit 2
fi

echo "==[ Step 1/6 ]== Copy new files"
cp -v "$BUNDLE_DIR/new-files/artifacts/api-server/src/routes/prospects.ts" \
      "artifacts/api-server/src/routes/prospects.ts"

echo
echo "==[ Step 2/6 ]== Patch routes/index.ts (mount prospectsRouter)"
node "$BUNDLE_DIR/patches/patch-routes-index.mjs"

echo
echo "==[ Step 3/6 ]== Patch action_logs.ts (add prospectDeleted action type)"
node "$BUNDLE_DIR/patches/patch-action-types.mjs"

echo
echo "==[ Step 4/6 ]== Root typecheck (composite-aware)"
# Lesson from 1.7-backend hotfix: leaf typecheck misses workspace dep changes.
# This bundle changes lib/db/src/schema/action_logs.ts (a workspace dep),
# so root typecheck is mandatory — the api-server's typecheck alone would
# not see the new ACTION_TYPES.prospectDeleted reference.
pnpm run typecheck

echo
echo "==[ Step 5/6 ]== Build api-server"
# Build is mandatory before Republish — the workflow runs from dist/.
pnpm --filter @workspace/api-server run build

echo
echo "==[ Step 6/6 ]== Sync to source-code/ mirror"
if [ -f "scripts/sync-source-code.sh" ]; then
  bash scripts/sync-source-code.sh
else
  echo "[apply] no scripts/sync-source-code.sh; skipping"
fi

# Stage tests at /tmp/ (idempotent — overwrite is fine; survives until next Republish)
echo
echo "==[ Post-apply ]== Stage tests at /tmp/"
cp -v "$BUNDLE_DIR/tests/integration-1-7-be-2-prospects.mjs" \
      /tmp/integration-1-7-be-2-prospects.mjs

echo
echo "============================================================"
echo "  apply.sh complete."
echo
echo "  No migration needed (action_logs.ts ACTION_TYPES is a TS-only"
echo "  enum — adding a key requires no DB schema change)."
echo
echo "  NEXT STEPS:"
echo "  1. Click Republish in the Replit UI."
echo "  2. After deploy is live, run:"
echo "     node /tmp/integration-1-7-be-2-prospects.mjs"
echo "     (defaults to BASE_URL=http://localhost:80)"
echo "============================================================"
