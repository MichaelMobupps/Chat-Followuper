#!/usr/bin/env bash
# Ticket bulk-yes-no-phone-preserve — preserve prospect record on yes-empty
# Single patch, 3 atomic edits in whatsapp.tsx. Idempotent. FE only.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/dashboard/src/pages/prospect/whatsapp.tsx

echo "==========================================================="
echo "Ticket bulk-yes-no-phone-preserve"
echo "  Preserve prospect record when Apollo's yes-reveal returns empty"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then
  echo "[FAIL] missing target: $TARGET"
  exit 2
fi
echo "[apply] [pre-flight] target present ✓"
echo

echo "[apply] step 1/3 — patch whatsapp.tsx (3 atomic edits in processOne)"
node "$BUNDLE_DIR/patches/patch-preserve.mjs" || { echo "[FAIL]"; exit 2; }
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
echo "[apply] DONE — yes-empty reveals now preserve prospect records"
echo "==========================================================="
echo
echo "Behavioral change:"
echo "  Before: Pramod-style failure (yes-tagged, reveal returned empty)"
echo "          would mark stage='failed' and drop the prospect entirely."
echo "          8c gone, no record."
echo
echo "  After:  Same 8c spent, BUT prospect is created with no phone +"
echo "          contextNotes explaining situation. SDR can find them in"
echo "          the prospects list, see the explanation in detail view,"
echo "          decide whether to manually source phone or delete."
echo
echo "  Stage:  Goes to 'ready-pending-phone' bucket in BulkResults,"
echo "          alongside maybe-path prospects. The contextNotes"
echo "          distinguish the two in the detail view."
echo
echo "Verify (FE only — no api-server restart needed):"
echo "  Hard to reproduce on demand (requires Apollo yes-reveal to fail)."
echo "  Easier verification path:"
echo "  1. After applying, run a normal bulk batch — should work as before"
echo "  2. If/when next yes-empty failure occurs in production, check"
echo "     /prospects list — the prospect should appear (status:"
echo "     phone-pending) instead of being silently lost"
echo "  3. Click into detail page — contextNotes shows: 'Yes-tagged"
echo "     reveal returned no phone (8c charged...)'"
