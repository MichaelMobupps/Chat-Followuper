#!/usr/bin/env bash
# Ticket country-name-iso-mapping — normalize Apollo's country to ISO-2
# at the BE source. Single patch, 3 atomic edits.
# Idempotent. BE only — api-server build + restart required.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/api-server/src/services/apollo.ts

echo "==========================================================="
echo "Ticket country-name-iso-mapping"
echo "  Normalize Apollo's full-name countries to ISO-2 codes at BE"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then
  echo "[FAIL] missing target: $TARGET"
  exit 2
fi
echo "[apply] [pre-flight] target present ✓"
echo

echo "[apply] step 1/3 — patch services/apollo.ts (helper + mapOrg + mapPerson)"
node "$BUNDLE_DIR/patches/patch-country-mapping.mjs" || { echo "[FAIL]"; exit 2; }
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
echo "REQUIRED — restart api-server workflow."
echo "  Replit Workflows → Backend Server → Stop → Start"
echo
echo "Verify:"
echo "  1. Refresh /prospect/whatsapp"
echo "  2. Run discover for an Indian/US/UK company"
echo "  3. Reveal & save a candidate"
echo "  4. Open the prospect detail page — country should now show 'IN'"
echo "     (or 'US', 'GB', etc) instead of being null"
echo "  5. The FE country-iso hotfix is now redundant (BE already"
echo "     returns ISO-2) but stays as defensive layer for unknown"
echo "     countries that fall through to null"
echo
echo "Coverage: ~55 countries by UA-prospecting volume. Less common"
echo "countries fall through to null and the FE drops the field."
