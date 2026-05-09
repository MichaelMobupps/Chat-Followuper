#!/usr/bin/env bash
# Ticket 1.7-FE-B-1 — Manual seeder flow (form → research SSE → brief → message)
# Idempotent. Safe to re-run.
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_SRC="artifacts/dashboard/src"

if [ ! -d "$DASHBOARD_SRC" ]; then
  echo "[apply] FAIL: $DASHBOARD_SRC not found. Run from project root." >&2
  exit 2
fi

echo "==[ Step 1/4 ]== Copy files"
mkdir -p "$DASHBOARD_SRC/lib/api"
mkdir -p "$DASHBOARD_SRC/hooks"
mkdir -p "$DASHBOARD_SRC/components/seeder"
mkdir -p "$DASHBOARD_SRC/pages"

# New files (lib/sse.ts is new, others are new in their dirs)
cp -v "$BUNDLE_DIR/new-files/lib/sse.ts"                              "$DASHBOARD_SRC/lib/sse.ts"
cp -v "$BUNDLE_DIR/new-files/lib/api/prospects.ts"                    "$DASHBOARD_SRC/lib/api/prospects.ts"
cp -v "$BUNDLE_DIR/new-files/lib/api/seeder.ts"                       "$DASHBOARD_SRC/lib/api/seeder.ts"
cp -v "$BUNDLE_DIR/new-files/hooks/use-prospects.ts"                  "$DASHBOARD_SRC/hooks/use-prospects.ts"
cp -v "$BUNDLE_DIR/new-files/components/seeder/CampaignSelector.tsx"  "$DASHBOARD_SRC/components/seeder/CampaignSelector.tsx"
cp -v "$BUNDLE_DIR/new-files/components/seeder/SeederForm.tsx"        "$DASHBOARD_SRC/components/seeder/SeederForm.tsx"
cp -v "$BUNDLE_DIR/new-files/components/seeder/ResearchProgress.tsx"  "$DASHBOARD_SRC/components/seeder/ResearchProgress.tsx"
cp -v "$BUNDLE_DIR/new-files/components/seeder/BriefEditor.tsx"       "$DASHBOARD_SRC/components/seeder/BriefEditor.tsx"
cp -v "$BUNDLE_DIR/new-files/components/seeder/MessageReview.tsx"     "$DASHBOARD_SRC/components/seeder/MessageReview.tsx"

# pages/seeder.tsx is OVERWRITTEN — replaces the existing PagePlaceholder
cp -v "$BUNDLE_DIR/new-files/pages/seeder.tsx"                        "$DASHBOARD_SRC/pages/seeder.tsx"

echo
echo "==[ Step 2/4 ]== Root typecheck (composite-aware)"
pnpm run typecheck

echo
echo "==[ Step 3/4 ]== Build dashboard"
export PORT="${PORT:-5173}"
export BASE_PATH="${BASE_PATH:-/}"
pnpm --filter @workspace/dashboard run build

echo
echo "==[ Step 4/4 ]== Sync to source-code/ mirror"
if [ -f "scripts/sync-source-code.sh" ]; then
  bash scripts/sync-source-code.sh || echo "[apply] sync failed (non-fatal)"
else
  echo "[apply] no scripts/sync-source-code.sh; skipping"
fi

echo
echo "============================================================"
echo "  apply.sh complete."
echo
echo "  This is a FRONTEND bundle. Vite's HMR auto-picks-up source"
echo "  changes — no api-server restart needed."
echo
echo "  NEXT STEPS:"
echo "  1. Click Republish in the Replit UI (deploys to production)."
echo "  2. Open the dashboard, navigate to /seeder."
echo "  3. Walk through ticket-1-7-fe-b-1/docs/manual-test-1-7-fe-b-1.md"
echo
echo "  Live runs cost real Anthropic spend (~\$0.10-0.30 per seeder"
echo "  cycle for research + message gen). Do a dry-run with cancel"
echo "  before the first end-to-end test if you want to spot UI issues"
echo "  for free."
echo "============================================================"
