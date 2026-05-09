#!/usr/bin/env bash
# Ticket 2.2-BE-A — Sonnet company disambiguation
# Backend bundle. Adds POST /api/prospector/resolve-company.
# Idempotent. Safe to re-run.
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_SRC="artifacts/api-server/src"
DB_SRC="lib/db/src"
API_PKG="artifacts/api-server/package.json"

if [ ! -d "$API_SRC" ]; then
  echo "[apply] FAIL: $API_SRC not found. Run from project root." >&2
  exit 2
fi

if [ ! -f "$API_SRC/services/urlResolver.ts" ]; then
  echo "[apply] FAIL: services/urlResolver.ts missing — apply 2.1-BE first." >&2
  exit 3
fi

if [ ! -f "$API_SRC/routes/prospector.ts" ]; then
  echo "[apply] FAIL: routes/prospector.ts missing — apply 2.1-BE first." >&2
  exit 3
fi

if [ ! -f "$DB_SRC/schema/action_logs.ts" ]; then
  echo "[apply] FAIL: $DB_SRC/schema/action_logs.ts missing." >&2
  exit 3
fi

echo "==[ Step 1/6 ]== Verify @anthropic-ai/sdk dependency"
if [ -f "$API_PKG" ] && grep -q '"@anthropic-ai/sdk"' "$API_PKG"; then
  echo "  [OK] @anthropic-ai/sdk already in $API_PKG"
elif [ -f "package.json" ] && grep -q '"@anthropic-ai/sdk"' "package.json"; then
  echo "  [OK] @anthropic-ai/sdk found in root package.json"
else
  echo "  [INFO] @anthropic-ai/sdk not found — adding to api-server"
  pnpm --filter @workspace/api-server add @anthropic-ai/sdk@^0.30.0 || {
    echo "[apply] FAIL: pnpm add @anthropic-ai/sdk failed." >&2
    exit 4
  }
fi

echo
echo "==[ Step 2/6 ]== Copy companyResolver service"
mkdir -p "$API_SRC/services"
cp -v "$BUNDLE_DIR/new-files/artifacts/api-server/src/services/companyResolver.ts" \
      "$API_SRC/services/companyResolver.ts"

echo
echo "==[ Step 3/6 ]== Patch action_logs.ts (add prospectorCompanyResolved key)"
node "$BUNDLE_DIR/patches/patch-action-types.mjs"

echo
echo "==[ Step 4/6 ]== Patch routes/prospector.ts (add /resolve-company endpoint)"
node "$BUNDLE_DIR/patches/patch-prospector-route.mjs"

echo
echo "==[ Step 5/6 ]== Root typecheck"
pnpm run typecheck

echo
echo "==[ Step 6/6 ]== Build api-server"
pnpm --filter @workspace/api-server run build

echo
echo "==[ Optional: sync to source-code/ mirror ]=="
if [ -f "scripts/sync-source-code.sh" ]; then
  bash scripts/sync-source-code.sh || echo "[apply] sync failed (non-fatal)"
elif [ -f "sync.sh" ]; then
  bash sync.sh || echo "[apply] sync failed (non-fatal)"
else
  echo "[apply] no sync script found, skipping"
fi

echo
echo "============================================================"
echo "  apply.sh complete."
echo
echo "  ENV CHECK — required for /resolve-company to work:"
echo "    ANTHROPIC_API_KEY (Replit Secret, both workspace & deploy)"
echo "    PROSPECTOR_SONNET_MODEL (optional override; default: claude-sonnet-4-6)"
echo
echo "  BACKEND BUNDLE — workflow restart REQUIRED:"
echo "    Click Stop then Run on the api-server workflow in the"
echo "    Replit UI. Republish alone does NOT pick up backend"
echo "    code changes (per defect #7)."
echo
echo "  AFTER RESTART, run integration test:"
echo "    cp ticket-2-2-be-a/new-files/tests/integration-2-2-be-a-resolve-company.mjs /tmp/"
echo "    node /tmp/integration-2-2-be-a-resolve-company.mjs"
echo
echo "  Then walk ticket-2-2-be-a/docs/manual-test-2-2-be-a.md for the"
echo "  real-Sonnet probes against known disambiguation cases."
echo "============================================================"
