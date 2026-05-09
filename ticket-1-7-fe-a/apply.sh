#!/usr/bin/env bash
# Ticket 1.7-FE-A — Campaigns CRUD frontend
# Idempotent orchestrator. Safe to re-run on success or partial failure.
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_SRC="artifacts/dashboard/src"

if [ ! -d "$DASHBOARD_SRC" ]; then
  echo "[apply] FAIL: $DASHBOARD_SRC not found. Run from project root." >&2
  exit 2
fi

echo "==[ Step 1/6 ]== Copy new files"
mkdir -p "$DASHBOARD_SRC/lib/api"
mkdir -p "$DASHBOARD_SRC/hooks"
mkdir -p "$DASHBOARD_SRC/components/campaigns"
mkdir -p "$DASHBOARD_SRC/pages"

cp -v "$BUNDLE_DIR/new-files/lib/api.ts"                          "$DASHBOARD_SRC/lib/api.ts"
cp -v "$BUNDLE_DIR/new-files/lib/api/campaigns.ts"                "$DASHBOARD_SRC/lib/api/campaigns.ts"
cp -v "$BUNDLE_DIR/new-files/hooks/use-campaigns.ts"              "$DASHBOARD_SRC/hooks/use-campaigns.ts"
cp -v "$BUNDLE_DIR/new-files/components/campaigns/CampaignCard.tsx" "$DASHBOARD_SRC/components/campaigns/CampaignCard.tsx"
cp -v "$BUNDLE_DIR/new-files/components/campaigns/CampaignForm.tsx" "$DASHBOARD_SRC/components/campaigns/CampaignForm.tsx"
cp -v "$BUNDLE_DIR/new-files/pages/campaigns.tsx"                 "$DASHBOARD_SRC/pages/campaigns.tsx"
cp -v "$BUNDLE_DIR/new-files/pages/campaign-detail.tsx"           "$DASHBOARD_SRC/pages/campaign-detail.tsx"

echo
echo "==[ Step 2/6 ]== Patch App.tsx (add routes)"
node "$BUNDLE_DIR/patches/patch-app-tsx.mjs"

echo
echo "==[ Step 3/6 ]== Patch layout.tsx (add nav item)"
node "$BUNDLE_DIR/patches/patch-layout-tsx.mjs"

echo
echo "==[ Step 4/6 ]== Root typecheck (composite-aware, builds libs first)"
# Lesson from 1.7-backend hotfix: leaf typecheck misses workspace dep changes.
# Use root typecheck which does tsc --build of composite libs first.
pnpm run typecheck

echo
echo "==[ Step 5/6 ]== Build dashboard"
# vite.config.ts requires PORT and BASE_PATH at config eval time.
# These are normally provided by the workflow; default sensibly for build.
export PORT="${PORT:-5173}"
export BASE_PATH="${BASE_PATH:-/}"
pnpm --filter @workspace/dashboard run build

echo
echo "==[ Step 6/6 ]== Sync to source-code/ mirror (best-effort)"
if [ -f "scripts/sync-source-code.sh" ]; then
  bash scripts/sync-source-code.sh || echo "[apply] sync-source-code.sh failed (non-fatal — only mirrors api-server in current setup)"
else
  echo "[apply] no scripts/sync-source-code.sh; skipping"
fi

echo
echo "============================================================"
echo "  apply.sh complete."
echo "  NEXT STEPS:"
echo "  1. Click Republish in the Replit UI."
echo "  2. After deploy is live, open the dashboard in a browser:"
echo "     - Navigate to /campaigns"
echo "     - Run through docs/manual-test-1-7-fe-a.md"
echo "============================================================"
