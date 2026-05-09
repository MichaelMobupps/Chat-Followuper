#!/usr/bin/env bash
# Ticket 2.1-BE — URL resolver service + endpoint
# Backend bundle. Adds /api/prospector/resolve-urls.
# Idempotent. Safe to re-run.
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_SRC="artifacts/api-server/src"

if [ ! -d "$API_SRC" ]; then
  echo "[apply] FAIL: $API_SRC not found. Run from project root." >&2
  exit 2
fi

if [ ! -f "$API_SRC/services/apollo.ts" ]; then
  echo "[apply] FAIL: services/apollo.ts missing — repo not in expected state." >&2
  exit 3
fi

if [ ! -f "lib/db/src/schema/action_logs.ts" ]; then
  echo "[apply] FAIL: lib/db/src/schema/action_logs.ts missing." >&2
  exit 3
fi

echo "==[ Step 1/6 ]== Copy 2 new source files"
mkdir -p "$API_SRC/services"
mkdir -p "$API_SRC/routes"
cp -v "$BUNDLE_DIR/new-files/artifacts/api-server/src/services/urlResolver.ts" "$API_SRC/services/urlResolver.ts"
cp -v "$BUNDLE_DIR/new-files/artifacts/api-server/src/routes/prospector.ts"     "$API_SRC/routes/prospector.ts"

echo
echo "==[ Step 2/6 ]== Patch action_logs.ts (add prospectorUrlsResolved)"
node "$BUNDLE_DIR/patches/patch-action-types.mjs"

echo
echo "==[ Step 3/6 ]== Patch routes/index.ts (mount prospector router)"
node "$BUNDLE_DIR/patches/patch-routes-index.mjs"

echo
echo "==[ Step 4/6 ]== Root typecheck"
pnpm run typecheck

echo
echo "==[ Step 5/6 ]== Build api-server"
pnpm --filter @workspace/api-server run build

echo
echo "==[ Step 6/6 ]== Sync to source-code/ mirror"
if [ -f "scripts/sync-source-code.sh" ]; then
  bash scripts/sync-source-code.sh || echo "[apply] sync failed (non-fatal)"
fi

echo
echo "============================================================"
echo "  apply.sh complete."
echo
echo "  BACKEND BUNDLE — workflow restart REQUIRED:"
echo "    Click Stop then Run on the api-server workflow in Replit."
echo "    Republish alone does NOT pick up backend code changes"
echo "    (per cumulative defect log #7)."
echo
echo "  AFTER RESTART, run integration tests:"
echo "    cp ticket-2-1-be/new-files/tests/integration-2-1-be-resolve-urls.mjs /tmp/"
echo "    node /tmp/integration-2-1-be-resolve-urls.mjs"
echo
echo "  Then walk ticket-2-1-be/docs/manual-test-2-1-be.md for"
echo "  real-URL Play Store / App Store / website probes."
echo "============================================================"
