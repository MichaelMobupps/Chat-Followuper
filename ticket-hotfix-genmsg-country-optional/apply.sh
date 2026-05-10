#!/usr/bin/env bash
# Ticket hotfix-genmsg-country-optional — drop country from required
# fields in generateMessage. BE only. api-server build + restart needed.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/api-server/src/routes/generateMessage.ts

echo "==========================================================="
echo "Ticket hotfix-genmsg-country-optional"
echo "  Drop country from generateMessage required-fields check"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then
  echo "[FAIL] missing target: $TARGET"
  exit 2
fi
echo "[apply] [pre-flight] target present ✓"
echo

echo "[apply] step 1/3 — patch generateMessage.ts (drop country requirement)"
node "$BUNDLE_DIR/patches/patch-genmsg.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/3 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || {
  echo "[FAIL] api-server build failed"
  exit 3
}
echo "[apply] api-server build PASS ✓"
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
echo "REQUIRED — restart the api-server workflow."
echo "  Replit Workflows → Backend Server → Stop → Start"
echo
echo "Verify:"
echo "  Re-run the Swiggy bulk batch. Arushi should now save through"
echo "  the full pipeline: createProspect → researchBrief → generateMessage."
echo "  The prospect appears in /prospects with country = null."
echo
echo "Limitation: messages for these prospects don't have country context"
echo "  baked in. Future ticket: country-name → ISO-2 mapping (BE-side)"
echo "  to preserve the signal."
