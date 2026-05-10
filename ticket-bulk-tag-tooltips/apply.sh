#!/usr/bin/env bash
# Ticket bulk-tag-tooltips — clarify yes/maybe/no badges in CandidateGrid
# Single patch, 4 atomic edits. Idempotent. FE only.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx

echo "==========================================================="
echo "Ticket bulk-tag-tooltips — clarify yes/maybe semantics"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then
  echo "[FAIL] missing target: $TARGET"
  exit 2
fi
echo "[apply] [pre-flight] target present ✓"
echo

echo "[apply] step 1/3 — patch CandidateGrid.tsx (3 tooltips + 1 explainer line)"
node "$BUNDLE_DIR/patches/patch-tag-tooltips.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/3 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[FAIL] dashboard typecheck failed"
  exit 3
}
echo "[apply] dashboard typecheck PASS ✓"
echo

echo "[apply] step 3/3 — source-code mirror sync"
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
echo "Verify:"
echo "  1. Refresh /prospect/whatsapp, run discover"
echo "  2. Hover any 'yes' badge — tooltip: 'Apollo has this phone…'"
echo "  3. Hover any 'maybe' badge — tooltip: 'Apollo doesn't have…'"
echo "  4. Below filter card, see explainer line:"
echo "     'yes = Apollo has this phone (high success). maybe = ..."
echo "     ... Both non-refundable. Hover badges for detail.'"
