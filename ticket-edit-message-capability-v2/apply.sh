#!/usr/bin/env bash
# Ticket edit-message-capability v2 — completes the partial v1 apply.
# Re-runs all patches; idempotent skips for already-applied edits.
# Critical: this run completes the api-server build + restart that v1
# never reached.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket edit-message-capability v2"
echo "  Completes v1's partial apply; new card-body anchor without"
echo "  em-dashes (the unicode char that bit v1)"
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

echo "[apply] step 1/5 — patch BE routes/prospects.ts (skips if v1 applied)"
node "$BUNDLE_DIR/patches/patch-be.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/5 — patch FE lib/api/prospects.ts (skips if v1 applied)"
node "$BUNDLE_DIR/patches/patch-fe-api.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/5 — patch FE prospect-detail.tsx (v2 — em-dash-safe)"
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
echo "v1 left the source tree partially patched but never built or"
echo "restarted. This v2 run completes both. After restart, the"
echo "running BE will accept firstMessageBody on PATCH and the FE"
echo "will render the Edit button + textarea/Save/Cancel."
echo
echo "Verify:"
echo "  1. /prospects/<arushi-id> — message card shows Copy AND"
echo "     Edit buttons in a flex row"
echo "  2. Click Edit → textarea + Save/Cancel"
echo "  3. Save updates the message; toast confirms; refresh"
echo "     persists the change"
