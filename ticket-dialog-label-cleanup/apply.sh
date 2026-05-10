#!/usr/bin/env bash
# Ticket dialog-label-cleanup — fix misleading reveal-breakdown labels
# Single patch, 2 atomic edits in RevealConfirmDialog.tsx.
# Idempotent. FE only.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/dashboard/src/components/whatsapp-bulk/RevealConfirmDialog.tsx

echo "==========================================================="
echo "Ticket dialog-label-cleanup"
echo "  Fix 'phone cached' label collision with 'Already revealed (free)'"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then
  echo "[FAIL] missing target: $TARGET"
  exit 2
fi
echo "[apply] [pre-flight] target present ✓"
echo

echo "[apply] step 1/3 — patch RevealConfirmDialog.tsx (2 label edits)"
node "$BUNDLE_DIR/patches/patch-labels.mjs" || { echo "[FAIL]"; exit 2; }
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
echo "  Refresh /prospect/whatsapp, run discover, select candidates,"
echo "  click 'Reveal & save' to open the confirm dialog. Cost"
echo "  breakdown rows should now read:"
echo "    Sync reveals (yes-tagged):  N × 8 = ... credits"
echo "    Async reveals (maybe-tagged):  N × 8 = ... credits"
echo "    Already revealed (free):  N × 0 credits  [if any]"
echo "    Total:  N credits"
echo
echo "Cancel — no need to actually reveal for verification."
