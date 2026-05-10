#!/usr/bin/env bash
# Ticket bulk-unlimited-candidates — remove 25-cap, paginate Apollo to 500
# Two patches: BE pagination + FE cap removal.
# Idempotent. Touches BOTH api-server (build required) AND dashboard.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket bulk-unlimited-candidates"
echo "  BE: per_page 25 → 100, paginate to 5 pages = 500 cap"
echo "  FE: remove SOFT_CAP, override state, override UI"
echo "==========================================================="
echo

cd "$REPO_ROOT"

for f in \
  "artifacts/api-server/src/services/apollo.ts" \
  "artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx"; do
  if [[ ! -f "$f" ]]; then
    echo "[FAIL] missing: $f"
    exit 2
  fi
done
echo "[apply] [pre-flight] both targets present ✓"
echo

echo "[apply] step 1/5 — patch BE searchPeople (pagination)"
node "$BUNDLE_DIR/patches/patch-be-paginate.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/5 — patch FE CandidateGrid (drop SOFT_CAP + override UI)"
node "$BUNDLE_DIR/patches/patch-fe-cap.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/5 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || {
  echo "[FAIL] api-server build failed"
  exit 3
}
echo "[apply] api-server build PASS ✓"
echo

echo "[apply] step 4/5 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[FAIL] dashboard typecheck failed"
  exit 3
}
echo "[apply] dashboard typecheck PASS ✓"
echo

echo "[apply] step 5/5 — source-code mirror sync"
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
echo "  (Dashboard HMR picks up FE changes automatically.)"
echo
echo "Verify:"
echo "  1. Refresh /prospect/whatsapp"
echo "  2. Run discover for a known large company (e.g. major tech firm)"
echo "  3. Should see >25 candidates returned (up to 500 if Apollo has them)"
echo "  4. CandidateGrid: select more than 25 — no 'Over soft cap' badge"
echo "  5. 'Reveal & save' button enables on any selection > 0"
echo
echo "Note: Apollo's people-search itself doesn't charge credits per call."
echo "Pagination consumes API quota (rate-limit-bound) but no credits."
