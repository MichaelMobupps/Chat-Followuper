#!/usr/bin/env bash
# Ticket 2.3-FE hotfix — fix TS2339 in BulkResults.tsx
#
# Single anchored patch + dashboard typecheck + dashboard build + sync.
# Idempotent.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/dashboard/src/components/whatsapp-bulk/BulkResults.tsx

echo "==========================================================="
echo "Ticket 2.3-FE hotfix — TS2339 narrowing in BulkResults"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then
  echo "[FAIL] target file missing: $TARGET"
  echo "       (did 2.3-FE apply.sh complete steps 1-5 first?)"
  exit 2
fi
echo "[apply] [pre-flight] $TARGET present ✓"
echo

echo "[apply] step 1/4 — patch BulkResults.tsx"
node "$BUNDLE_DIR/patches/patch-bulk-results-narrowing.mjs" || {
  echo "[FAIL] patch did not apply"
  exit 2
}
echo

echo "[apply] step 2/4 — dashboard typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[FAIL] dashboard typecheck still failing"
  exit 3
}
echo "[apply] dashboard typecheck PASS ✓"
echo

echo "[apply] step 3/4 — dashboard build"
pnpm --filter @workspace/dashboard run build || {
  echo "[FAIL] dashboard build failed"
  exit 4
}
echo "[apply] dashboard build PASS ✓"
echo

echo "[apply] step 4/4 — source-code mirror sync"
if [[ -x source-code/sync.sh ]]; then
  bash source-code/sync.sh || echo "[WARN] sync.sh failed (non-fatal)"
elif [[ -x scripts/sync-source-code.sh ]]; then
  bash scripts/sync-source-code.sh || echo "[WARN] sync-source-code.sh failed (non-fatal)"
else
  echo "[apply] no sync script found — skipping mirror"
fi
echo

echo "==========================================================="
echo "[apply] DONE — Ticket 2.3-FE hotfix applied"
echo "==========================================================="
echo
echo "[apply] [hint] restart the dashboard workflow to load new bundle"
echo "[apply] [hint] (Defect #7: dist alone is not enough)"
echo
echo "Now resume the localhost manual-test scenarios from the main 2.3-FE"
echo "ticket (docs/manual-test-2-3-fe.md, scenarios 1-7 first)."
