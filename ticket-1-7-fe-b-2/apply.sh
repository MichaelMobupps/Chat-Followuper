#!/usr/bin/env bash
# Ticket 1.7-FE-B-2 — Apollo discovery overlay for the seeder
# Adds the 3-stage Apollo picker + Dialog integration on top of FE-B-1.
# Idempotent. Safe to re-run.
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_SRC="artifacts/dashboard/src"

if [ ! -d "$DASHBOARD_SRC" ]; then
  echo "[apply] FAIL: $DASHBOARD_SRC not found. Run from project root." >&2
  exit 2
fi

if [ ! -f "$DASHBOARD_SRC/components/seeder/SeederForm.tsx" ]; then
  echo "[apply] FAIL: SeederForm.tsx missing — apply 1.7-FE-B-1 first." >&2
  exit 3
fi

echo "==[ Step 1/4 ]== Copy files (3 new + 1 overwrite)"
mkdir -p "$DASHBOARD_SRC/lib/api"
mkdir -p "$DASHBOARD_SRC/hooks"
mkdir -p "$DASHBOARD_SRC/components/seeder"

# New files
cp -v "$BUNDLE_DIR/new-files/lib/api/apollo.ts"                  "$DASHBOARD_SRC/lib/api/apollo.ts"
cp -v "$BUNDLE_DIR/new-files/hooks/use-apollo.ts"                "$DASHBOARD_SRC/hooks/use-apollo.ts"
cp -v "$BUNDLE_DIR/new-files/components/seeder/ApolloPicker.tsx" "$DASHBOARD_SRC/components/seeder/ApolloPicker.tsx"

# Overwrite — adds Dialog + ApolloPicker integration to the FE-B-1 page
cp -v "$BUNDLE_DIR/new-files/pages/seeder.tsx"                   "$DASHBOARD_SRC/pages/seeder.tsx"

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
echo "  Frontend bundle. Vite HMR auto-picks-up source changes."
echo "  No api-server restart needed."
echo
echo "  REQUIRED secrets check (api-server side):"
echo "    APOLLO_API_KEY must be set, or all picker calls return 503."
echo
echo "  NEXT STEPS:"
echo "  1. Click Republish in the Replit UI."
echo "  2. Open the dashboard, navigate to /seeder."
echo "  3. Walk through ticket-1-7-fe-b-2/docs/manual-test-1-7-fe-b-2.md."
echo "     The free dry-run paths are at the top — start there."
echo "============================================================"
