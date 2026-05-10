#!/usr/bin/env bash
# Ticket search-time-annotation — annotate searchPeople results with
# existingProspectId so FE filters dupes out before reveal fires.
# 4 patches across 4 files (BE: 2 files, FE: 2 files). Idempotent.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket search-time-annotation"
echo "  Cross-reference Apollo search results vs prospects DB"
echo "  → FE skips already-prospected candidates before reveal"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "artifacts/api-server/src/services/apollo.ts"
  "artifacts/api-server/src/routes/apollo.ts"
  "artifacts/dashboard/src/lib/api/apollo.ts"
  "artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then
    echo "[FAIL] missing target: $t"
    exit 2
  fi
done
echo "[apply] [pre-flight] all 4 targets present ✓"
echo

echo "[apply] step 1/6 — patch BE services/apollo.ts (type + mapPerson)"
node "$BUNDLE_DIR/patches/patch-be-apollo.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/6 — patch BE routes/apollo.ts (imports + cross-ref)"
node "$BUNDLE_DIR/patches/patch-be-routes-apollo.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/6 — patch FE lib/api/apollo.ts (type mirror)"
node "$BUNDLE_DIR/patches/patch-fe-api-apollo.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 4/6 — patch FE CandidateGrid.tsx (4 edits)"
node "$BUNDLE_DIR/patches/patch-fe-grid.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 5/6 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || {
  echo "[FAIL] api-server build failed"
  echo "[hint] common cause: prospectsTable not exported from @workspace/db"
  echo "       check artifacts/api-server/src/db (or wherever the db package"
  echo "       index lives) for: export { prospectsTable } from './schema';"
  exit 3
}
echo "[apply] api-server build PASS ✓"
echo

echo "[apply] step 6/6 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[FAIL] dashboard typecheck failed"
  exit 3
}
echo "[apply] dashboard typecheck PASS ✓"
echo

echo "[apply] mirror sync"
if [[ -x source-code/sync.sh ]]; then
  bash source-code/sync.sh || echo "[WARN] sync.sh failed (non-fatal)"
elif [[ -x scripts/sync-source-code.sh ]]; then
  bash scripts/sync-source-code.sh || echo "[WARN] sync-source-code.sh failed (non-fatal)"
fi
echo

echo "==========================================================="
echo "[apply] DONE"
echo "==========================================================="
echo
echo "REQUIRED — restart api-server workflow."
echo "  Replit Workflows → Backend Server → Stop → Start"
echo
echo "Verify:"
echo "  1. /prospects → confirm Arushi is in your list (1 row)"
echo "  2. /prospect/whatsapp → discover Swiggy"
echo "  3. In the candidate grid, Arushi's row should now:"
echo "     - Show an amber 'Already a prospect' badge instead of"
echo "       her phone status"
echo "     - Be visually disabled (opacity-60, cursor-not-allowed)"
echo "     - Tooltip on hover: 'Already a prospect — already in"
echo "       your list'"
echo "     - Checkbox unchecked and disabled"
echo "  4. Try to reveal her — UI should not let you select"
echo "  5. The reveal call never fires → no 8c spent"
echo
echo "Net result: re-prospecting on the same company no longer"
echo "burns credits on dupes. Combined with the dedupe-at-create"
echo "ticket from earlier, the dedupe story is complete:"
echo "  - Search: shows existing prospects as not-selectable"
echo "  - Create: rejects 409 if somehow a dupe gets through"
