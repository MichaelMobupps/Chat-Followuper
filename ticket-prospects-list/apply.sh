#!/usr/bin/env bash
# Ticket prospects-list — apply.sh
#
# Adds GET /api/prospects backend endpoint + replaces the /prospects
# placeholder page with a real list view (filters, sort, pagination,
# action buttons). Also re-adds the "Prospects" sidebar entry that
# the sidebar-cleanup ticket removed.
#
# Steps:
#   1. Pre-flight: target files exist
#   2. Patch routes/prospects.ts (BE) — drizzle imports + GET / endpoint
#   3. Patch lib/api/prospects.ts (FE) — types + listProspects function
#   4. Patch layout.tsx — re-add Prospects nav entry (idempotent)
#   5. Copy new hook (use-prospects-list.ts)
#   6. Copy new components (ProspectsListFilters, ProspectsListTable)
#   7. Replace pages/prospects.tsx (was placeholder, now real list)
#   8. api-server typecheck
#   9. api-server build
#  10. Dashboard typecheck (no build per Defect #11)
#  11. Source-code mirror sync (best-effort)
#
# Idempotent.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API=artifacts/api-server/src
DASH=artifacts/dashboard/src

echo "==========================================================="
echo "Ticket prospects-list — list page + GET /api/prospects"
echo "==========================================================="
echo

cd "$REPO_ROOT"

# ─────────────────────────────────────────────────────────────────
# Pre-flight
# ─────────────────────────────────────────────────────────────────
for f in \
  "$API/routes/prospects.ts" \
  "$DASH/lib/api/prospects.ts" \
  "$DASH/components/layout.tsx" \
  "$DASH/pages/prospects.tsx"; do
  if [[ ! -f "$f" ]]; then
    echo "[apply] [FAIL] missing target file: $f"
    exit 2
  fi
done
echo "[apply] [pre-flight] all 4 target files present ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Patches
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 1/9 — patch BE routes/prospects.ts (drizzle imports + GET / endpoint)"
node "$BUNDLE_DIR/patches/patch-be-prospects-list.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/9 — patch FE lib/api/prospects.ts (list types + function)"
node "$BUNDLE_DIR/patches/patch-fe-prospects-types.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/9 — patch layout.tsx (re-add Prospects nav entry)"
node "$BUNDLE_DIR/patches/patch-sidebar-readd-prospects.mjs" || { echo "[FAIL]"; exit 2; }
echo

# ─────────────────────────────────────────────────────────────────
# Copy new files
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 4/9 — copy hooks/use-prospects-list.ts"
cp "$BUNDLE_DIR/new-files/hooks/use-prospects-list.ts" "$DASH/hooks/use-prospects-list.ts"
echo "  ✓"
echo

echo "[apply] step 5/9 — copy prospects-list components"
mkdir -p "$DASH/components/prospects-list"
cp "$BUNDLE_DIR/new-files/components/prospects-list/ProspectsListFilters.tsx" \
   "$DASH/components/prospects-list/ProspectsListFilters.tsx"
cp "$BUNDLE_DIR/new-files/components/prospects-list/ProspectsListTable.tsx" \
   "$DASH/components/prospects-list/ProspectsListTable.tsx"
echo "  ProspectsListFilters.tsx ✓"
echo "  ProspectsListTable.tsx ✓"
echo

echo "[apply] step 6/9 — replace pages/prospects.tsx (was placeholder)"
cp "$BUNDLE_DIR/new-files/pages/prospects.tsx" "$DASH/pages/prospects.tsx"
echo "  ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Typecheck + build
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 7/9 — root pnpm run typecheck (api-server + dashboard via composite)"
pnpm run typecheck || {
  echo "[apply] [FAIL] typecheck failed — see TS errors above"
  exit 3
}
echo "[apply] root typecheck PASS ✓"
echo

echo "[apply] step 8/9 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || {
  echo "[apply] [FAIL] api-server build failed"
  exit 4
}
echo "[apply] api-server build PASS ✓"
echo
echo "[apply] [note] dashboard build NOT run (Defect #11: vite.config requires"
echo "[apply]        workflow-only env vars; HMR picks up changes automatically)"
echo

# ─────────────────────────────────────────────────────────────────
# Sync
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 9/9 — source-code mirror sync (best-effort)"
if [[ -x source-code/sync.sh ]]; then
  bash source-code/sync.sh || echo "[apply] [WARN] sync.sh failed (non-fatal)"
elif [[ -x scripts/sync-source-code.sh ]]; then
  bash scripts/sync-source-code.sh || echo "[apply] [WARN] sync-source-code.sh failed (non-fatal)"
else
  echo "[apply] no sync script found — skipping mirror"
fi
echo

echo "==========================================================="
echo "[apply] DONE — Ticket prospects-list applied"
echo "==========================================================="
echo
echo "[apply] [hint] Restart the api-server workflow so the new dist is loaded"
echo "[apply] [hint] (Defect #7: code in dist alone is not enough)"
echo "[apply] [hint] Vite HMR picks up the dashboard changes automatically;"
echo "[apply] [hint]  no dashboard workflow restart needed."
echo
echo "Next:"
echo "  1. Restart api-server workflow"
echo "  2. Refresh dashboard tab in browser"
echo "  3. Click 'Prospects' in sidebar — should show real list view"
echo "  4. Walk through scenarios in docs/manual-test-prospects-list.md"
