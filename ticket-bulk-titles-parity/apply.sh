#!/usr/bin/env bash
# Ticket bulk-titles-parity — expand DEFAULT_TITLES to email prospector parity
#
# Single anchored patch + dashboard typecheck + sync. Idempotent.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/dashboard/src/components/whatsapp-bulk/UrlInput.tsx

echo "==========================================================="
echo "Ticket bulk-titles-parity — expand bulk WA title list"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then
  echo "[apply] [FAIL] missing target: $TARGET"
  exit 2
fi
echo "[apply] [pre-flight] target present ✓"
echo

echo "[apply] step 1/3 — patch UrlInput.tsx (DEFAULT_TITLES)"
node "$BUNDLE_DIR/patches/patch-bulk-titles.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/3 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[apply] [FAIL] dashboard typecheck failed"
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
  echo "[apply] no sync script found"
fi
echo

echo "==========================================================="
echo "[apply] DONE — bulk WA titles now match email prospector"
echo "==========================================================="
echo
echo "[apply] [hint] Vite HMR — refresh dashboard tab. No api-server"
echo "[apply] [hint] restart needed (FE only)."
echo
echo "Verify:"
echo "  1. Open /prospect/whatsapp"
echo "  2. The titles textarea should now show ~28 lowercase terms"
echo "     starting with 'user acquisition, ua, growth, performance"
echo "     marketing, ...'"
echo "  3. Run discover on the same Swiggy URL — expect MORE candidates"
echo "     (likely 30+ vs the prior 25, capturing UA-titled folks)"
