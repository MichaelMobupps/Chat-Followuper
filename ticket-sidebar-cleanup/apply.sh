#!/usr/bin/env bash
# Ticket sidebar-cleanup — drop legacy menu entries from layout.tsx
#
# Single anchored patch (2 edits) + dashboard typecheck + sync.
# NO `pnpm run build` step (Defect #11: dashboard build needs
# workflow-only env vars; HMR picks up the change automatically).
#
# Idempotent.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/dashboard/src/components/layout.tsx

echo "==========================================================="
echo "Ticket sidebar-cleanup — drop 4 legacy nav items"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then
  echo "[FAIL] target file missing: $TARGET"
  exit 2
fi
echo "[apply] [pre-flight] $TARGET present ✓"
echo

echo "[apply] step 1/3 — patch layout.tsx (drop 4 imports + 4 nav items)"
node "$BUNDLE_DIR/patches/patch-layout-nav.mjs" || {
  echo "[FAIL] patch did not apply"
  exit 2
}
echo

echo "[apply] step 2/3 — dashboard typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[FAIL] dashboard typecheck failed"
  exit 3
}
echo "[apply] dashboard typecheck PASS ✓"
echo

echo "[apply] step 3/3 — source-code mirror sync (best-effort)"
if [[ -x source-code/sync.sh ]]; then
  bash source-code/sync.sh || echo "[WARN] sync.sh failed (non-fatal)"
elif [[ -x scripts/sync-source-code.sh ]]; then
  bash scripts/sync-source-code.sh || echo "[WARN] sync-source-code.sh failed (non-fatal)"
else
  echo "[apply] no sync script found — skipping mirror"
fi
echo

echo "==========================================================="
echo "[apply] DONE — sidebar-cleanup applied"
echo "==========================================================="
echo
echo "[apply] [hint] Vite HMR picks this up automatically; no workflow"
echo "[apply] [hint]  restart needed for the dashboard. Refresh the"
echo "[apply] [hint]  browser tab to see the trimmed sidebar."
echo
echo "Next:"
echo "  1. Refresh https://chat-followuper.replit.app/ (or workspace URL)"
echo "  2. Confirm sidebar shows 7 items: Today, Prospect: WhatsApp,"
echo "     Prospect: Telegram, Follow-up: WhatsApp, Follow-up: Telegram,"
echo "     Activity, Accounts"
echo "  3. When ready, republish the deployment for the prod sidebar"
echo "     to update."
