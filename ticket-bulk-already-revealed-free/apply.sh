#!/usr/bin/env bash
# Ticket bulk-already-revealed-free
#   When Apollo's people-search response already contains the phone (= we
#   revealed this contact previously, in this account), use it directly
#   at zero credit cost. Five patches across BE + FE.
#
# Idempotent. Both api-server build + dashboard typecheck.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket bulk-already-revealed-free"
echo "  Skip reveal call when Apollo response already has the phone"
echo "==========================================================="
echo

cd "$REPO_ROOT"

for f in \
  "artifacts/api-server/src/services/apollo.ts" \
  "artifacts/dashboard/src/lib/api/apollo.ts" \
  "artifacts/dashboard/src/pages/prospect/whatsapp.tsx" \
  "artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx" \
  "artifacts/dashboard/src/components/whatsapp-bulk/RevealConfirmDialog.tsx"; do
  if [[ ! -f "$f" ]]; then
    echo "[FAIL] missing: $f"
    exit 2
  fi
done
echo "[apply] [pre-flight] all 5 targets present ✓"
echo

echo "[apply] step 1/8 — patch BE services/apollo.ts (interface + mapPerson)"
node "$BUNDLE_DIR/patches/patch-be-apollo.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/8 — patch FE lib/api/apollo.ts (type mirror)"
node "$BUNDLE_DIR/patches/patch-fe-type.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/8 — patch FE pages/prospect/whatsapp.tsx (processOne x4)"
node "$BUNDLE_DIR/patches/patch-fe-page.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 4/8 — patch FE CandidateGrid.tsx (cost + summary + badge)"
node "$BUNDLE_DIR/patches/patch-fe-grid.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 5/8 — patch FE RevealConfirmDialog.tsx (math + breakdown)"
node "$BUNDLE_DIR/patches/patch-fe-dialog.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 6/8 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || {
  echo "[FAIL] api-server build failed"
  exit 3
}
echo "[apply] api-server build PASS ✓"
echo

echo "[apply] step 7/8 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[FAIL] dashboard typecheck failed"
  exit 3
}
echo "[apply] dashboard typecheck PASS ✓"
echo

echo "[apply] step 8/8 — source-code mirror sync"
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
echo "REQUIRED — restart the api-server workflow."
echo "  Replit Workflows → Backend Server → Stop → Start"
echo
echo "Verify:"
echo "  1. Refresh /prospect/whatsapp"
echo "  2. Run discover for a company you've prospected before in Apollo"
echo "     (someone whose phone you've already revealed)"
echo "  3. Look for emerald 'ready (free)' badges on those candidates"
echo "  4. Selection summary should read e.g.:"
echo "     '5 selected · Est. 24 credits (3 × 8c, non-refundable · 2"
echo "      already revealed (free))'"
echo "  5. Click Reveal & save → confirm dialog shows 'Already revealed"
echo "     (free): 2 × 0 credits' row in green"
echo "  6. Confirm → free candidates skip reveal call entirely (no Apollo"
echo "     credit charged for them), prospect created with phone, ready"
echo "     stage immediately"
echo
echo "Edge case: maybe-tagged candidates with existingPhone now also go"
echo "  directly to 'ready' (not 'ready-pending-phone') because we have"
echo "  the phone. No async webhook needed."
