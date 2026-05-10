#!/usr/bin/env bash
# Ticket bulk-no-phone-block — block selection of no-phone candidates
# Two patches: CandidateGrid (4 atomic edits) + page guard.
# Idempotent. FE only.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket bulk-no-phone-block — prevent no-phone reveal waste"
echo "==========================================================="
echo

cd "$REPO_ROOT"

for f in \
  "artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx" \
  "artifacts/dashboard/src/pages/prospect/whatsapp.tsx"; do
  if [[ ! -f "$f" ]]; then
    echo "[FAIL] missing: $f"
    exit 2
  fi
done
echo "[apply] [pre-flight] both targets present ✓"
echo

echo "[apply] step 1/4 — patch CandidateGrid.tsx (4 edits: selectable memo,"
echo "       toggleAllVisible, select-all UI, row disable)"
node "$BUNDLE_DIR/patches/patch-grid.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/4 — patch whatsapp.tsx (defensive processOne guard)"
node "$BUNDLE_DIR/patches/patch-page-guard.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/4 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[FAIL] dashboard typecheck failed"
  exit 3
}
echo "[apply] dashboard typecheck PASS ✓"
echo

echo "[apply] step 4/4 — source-code mirror sync"
if [[ -x source-code/sync.sh ]]; then
  bash source-code/sync.sh || echo "[WARN] sync.sh failed (non-fatal)"
elif [[ -x scripts/sync-source-code.sh ]]; then
  bash scripts/sync-source-code.sh || echo "[WARN] sync-source-code.sh failed (non-fatal)"
fi
echo

echo "==========================================================="
echo "[apply] DONE — no-phone candidates can no longer be selected"
echo "==========================================================="
echo
echo "Verify (FE-only, no api-server restart needed):"
echo "  1. Refresh /prospect/whatsapp, run discover"
echo "  2. Toggle 'Hide no-phone' OFF — no-phone candidates appear"
echo "     but visibly faded (opacity-60), checkbox disabled,"
echo "     row not clickable, hover tooltip explains why"
echo "  3. 'Select all' counts only selectable rows;"
echo "     if any no-phone visible, label shows '(N of M, K no-phone skipped)'"
echo "  4. Trying to click a no-phone row does nothing"
