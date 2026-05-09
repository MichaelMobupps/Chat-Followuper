#!/usr/bin/env bash
# Ticket 2.0-FE — Nav restructure for Prospect / Follow up flow
# Frontend-only. Adds 4 placeholder pages + 4 routes + 4 nav items.
# Existing /seeder, /prospects, /followups, /campaigns flows untouched.
# Idempotent. Safe to re-run.
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_SRC="artifacts/dashboard/src"

if [ ! -d "$DASHBOARD_SRC" ]; then
  echo "[apply] FAIL: $DASHBOARD_SRC not found. Run from project root." >&2
  exit 2
fi

if [ ! -f "$DASHBOARD_SRC/pages/campaigns.tsx" ]; then
  echo "[apply] FAIL: 1.7-FE-A not applied (pages/campaigns.tsx missing)." >&2
  echo "       2.0-FE patches anchor on FE-A's Campaigns nav item + routes." >&2
  exit 3
fi

echo "==[ Step 1/5 ]== Copy 4 placeholder pages"
mkdir -p "$DASHBOARD_SRC/pages/prospect"
mkdir -p "$DASHBOARD_SRC/pages/followup"

cp -v "$BUNDLE_DIR/new-files/pages/prospect/whatsapp.tsx" "$DASHBOARD_SRC/pages/prospect/whatsapp.tsx"
cp -v "$BUNDLE_DIR/new-files/pages/prospect/telegram.tsx" "$DASHBOARD_SRC/pages/prospect/telegram.tsx"
cp -v "$BUNDLE_DIR/new-files/pages/followup/whatsapp.tsx" "$DASHBOARD_SRC/pages/followup/whatsapp.tsx"
cp -v "$BUNDLE_DIR/new-files/pages/followup/telegram.tsx" "$DASHBOARD_SRC/pages/followup/telegram.tsx"

echo
echo "==[ Step 2/5 ]== Patch App.tsx (add 4 imports + 4 routes)"
node "$BUNDLE_DIR/patches/patch-app-routes.mjs"

echo
echo "==[ Step 3/5 ]== Patch layout.tsx (add icons + 4 nav items)"
node "$BUNDLE_DIR/patches/patch-layout-nav.mjs"

echo
echo "==[ Step 4/5 ]== Root typecheck"
pnpm run typecheck

echo
echo "==[ Step 5/5 ]== Build dashboard + sync"
export PORT="${PORT:-5173}"
export BASE_PATH="${BASE_PATH:-/}"
pnpm --filter @workspace/dashboard run build

if [ -f "scripts/sync-source-code.sh" ]; then
  bash scripts/sync-source-code.sh || echo "[apply] sync failed (non-fatal)"
fi

echo
echo "============================================================"
echo "  apply.sh complete."
echo
echo "  Frontend-only. Vite HMR auto-picks up source changes."
echo
echo "  WHAT YOU'LL SEE:"
echo "  Sidebar gets 4 new entries below Campaigns:"
echo "    Prospect: WhatsApp     /prospect/whatsapp"
echo "    Prospect: Telegram     /prospect/telegram"
echo "    Follow-up: WhatsApp    /followup/whatsapp"
echo "    Follow-up: Telegram    /followup/telegram"
echo
echo "  All four are placeholders showing what's coming and which"
echo "  ticket builds them out (2.3, 2.5, 2.6)."
echo
echo "  KEPT INTACT FOR MIGRATION:"
echo "    /seeder       — single-prospect flow (still works)"
echo "    /prospects    — old placeholder (will retire in 2.3)"
echo "    /followups    — old placeholder (will retire in 2.5)"
echo
echo "  NEXT:"
echo "  1. Click Republish in the Replit UI."
echo "  2. Open the dashboard."
echo "  3. Walk through ticket-2-0-fe/docs/manual-test-2-0-fe.md."
echo "============================================================"
