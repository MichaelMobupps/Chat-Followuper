#!/usr/bin/env bash
# Ticket hotfix-country-iso — strip non-ISO country before sending to BE
# Single patch, 2 atomic edits in whatsapp.tsx. Idempotent. FE only.
#
# Fixes Arushi-style 400 invalid_body when Apollo returns full country
# names ("India") instead of ISO codes ("IN"). BE schema strict-rejects
# anything that doesn't match /^[A-Z]{2}$/.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/dashboard/src/pages/prospect/whatsapp.tsx

echo "==========================================================="
echo "Ticket hotfix-country-iso"
echo "  Strip non-ISO country names before BE validation"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then
  echo "[FAIL] missing target: $TARGET"
  exit 2
fi
echo "[apply] [pre-flight] target present ✓"
echo

echo "[apply] step 1/3 — patch whatsapp.tsx (helper + use)"
node "$BUNDLE_DIR/patches/patch-country.mjs" || { echo "[FAIL]"; exit 2; }
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
echo "[apply] DONE"
echo "==========================================================="
echo
echo "Verify (FE only — no api-server restart needed):"
echo "  Refresh /prospect/whatsapp and re-run the same Swiggy URL."
echo "  Arushi (or whoever has Apollo country='India') should now save"
echo "  successfully — country gets dropped to undefined, the prospect"
echo "  is created, the rest of the bulk flow runs."
echo
echo "Limitation: country signal is lost for prospects whose Apollo"
echo "  country is a full English name. Future ticket can add"
echo "  full-name → ISO-2 mapping if needed for LLM message generation."
