#!/usr/bin/env bash
# Ticket message-visibility-bulk — show generated message inline in
# BulkResults Ready and Pending rows. Capture generateMessage's return
# value during processOne, store on CandidateProcessing state, render
# in BulkResults.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket message-visibility-bulk"
echo "  Show generated message inline in BulkResults rows"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "artifacts/dashboard/src/components/whatsapp-bulk/BulkSavingProgress.tsx"
  "artifacts/dashboard/src/pages/prospect/whatsapp.tsx"
  "artifacts/dashboard/src/components/whatsapp-bulk/BulkResults.tsx"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] all 3 targets present ✓"
echo

echo "[apply] step 1/4 — patch CandidateProcessing type"
node "$BUNDLE_DIR/patches/patch-type.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/4 — patch processOne (capture + pass to slot)"
node "$BUNDLE_DIR/patches/patch-processOne.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/4 — patch BulkResults (import + 2 row blocks)"
node "$BUNDLE_DIR/patches/patch-bulkresults.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 4/4 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || { echo "[FAIL] dashboard typecheck"; exit 3; }
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
echo "FE-only ticket — no api-server build, no api-server restart needed."
echo "Vite HMR picks up the changes automatically."
echo
echo "Verify:"
echo "  1. /prospect/whatsapp — run a small batch (1-3 candidates)"
echo "  2. After processing finishes, BulkResults shows:"
echo "     - Ready rows: chat icon + truncated message preview"
echo "       under the title line"
echo "     - Pending rows: same preview if message generation"
echo "       completed (yes-empty case has phone null but message"
echo "       generated)"
echo "     - Failed rows: no preview (message gen didn't run)"
echo "  3. Hover any preview → browser tooltip shows full message"
echo
echo "Combined with ticket-message-visibility-list (already applied):"
echo "  - List: scan-level visibility across all prospects"
echo "  - Bulk results: review messages right after generation"
echo "  - Detail page: full message + copy button (already there)"
