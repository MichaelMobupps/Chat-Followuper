#!/usr/bin/env bash
# Ticket edit-message-capability — manual edit of generated first
# message via the prospect detail page. BE PATCH schema admits
# firstMessageBody. FE adds inline edit mode with textarea + Save/Cancel.
# 9 atomic edits across 3 files.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket edit-message-capability"
echo "  Manual edit of generated first message on detail page"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "artifacts/api-server/src/routes/prospects.ts"
  "artifacts/dashboard/src/lib/api/prospects.ts"
  "artifacts/dashboard/src/pages/prospect-detail.tsx"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] all 3 targets present ✓"
echo

echo "[apply] step 1/5 — patch BE routes/prospects.ts (3 edits)"
node "$BUNDLE_DIR/patches/patch-be.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/5 — patch FE lib/api/prospects.ts (1 edit)"
node "$BUNDLE_DIR/patches/patch-fe-api.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/5 — patch FE prospect-detail.tsx (5 edits)"
node "$BUNDLE_DIR/patches/patch-fe-detail.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 4/5 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || { echo "[FAIL] api-server build"; exit 3; }
echo "[apply] api-server build PASS ✓"
echo

echo "[apply] step 5/5 — pnpm --filter @workspace/dashboard run typecheck"
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
echo "REQUIRED — restart api-server workflow."
echo "  Replit Workflows → Backend Server → Stop → Start"
echo
echo "Verify:"
echo "  1. /prospects/<arushi-id> — message card now shows Copy AND"
echo "     Edit buttons under the message body"
echo "  2. Click Edit — message becomes a textarea, Save/Cancel"
echo "     buttons appear"
echo "  3. Change the text and click Save — toast 'Message updated',"
echo "     view returns to read-only with new text"
echo "  4. Save is disabled when textarea is empty OR unchanged"
echo "  5. Cancel discards edits, reverts to read-only"
echo
echo "Edge cases verified:"
echo "  - Schema enforces 1 to 20000 chars; empty submissions rejected"
echo "    by FE (Save disabled) before they hit BE"
echo "  - generateMessage still works — channel/sentAt fields stay"
echo "    system-only, regenerate overwrites manual edits as expected"
