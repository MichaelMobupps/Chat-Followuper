#!/usr/bin/env bash
# Ticket message-visibility-list — surface firstMessageBody on /prospects
# 3 patches across 3 files. BE exposes the body (already SELECTed).
# FE type mirrors. Table cell adds a preview line under title.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket message-visibility-list"
echo "  Show firstMessageBody preview on /prospects table rows"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "artifacts/api-server/src/routes/prospects.ts"
  "artifacts/dashboard/src/lib/api/prospects.ts"
  "artifacts/dashboard/src/components/prospects-list/ProspectsListTable.tsx"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] all 3 targets present ✓"
echo

echo "[apply] step 1/5 — patch BE list response (expose firstMessageBody)"
node "$BUNDLE_DIR/patches/patch-be.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/5 — patch FE list type (mirror firstMessageBody)"
node "$BUNDLE_DIR/patches/patch-fe-type.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/5 — patch FE table (import + preview block)"
node "$BUNDLE_DIR/patches/patch-fe-table.mjs" || { echo "[FAIL]"; exit 2; }
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
echo "  1. Refresh /prospects"
echo "  2. Each row with a generated message now shows a third small"
echo "     line under the title: chat icon + truncated message preview"
echo "     (italic, dimmed)"
echo "  3. Hover the preview — browser tooltip shows the full message"
echo "  4. Rows without messages (firstMessageBody=null) show no"
echo "     preview line — layout collapses naturally"
echo
echo "Next ticket (b): bulk results inline message — show the same"
echo "preview in BulkResults Success bucket so you can review without"
echo "navigating away."
