#!/usr/bin/env bash
# Ticket yes-empty-distinct-bucket — split BulkResults pending into
# async (maybe-tagged, real webhook) and manual (yes-tagged, Apollo
# returned nothing). Different copy per bucket. Single file, 3 edits.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/dashboard/src/components/whatsapp-bulk/BulkResults.tsx

echo "==========================================================="
echo "Ticket yes-empty-distinct-bucket"
echo "  Split pending bucket — async (maybe) vs manual (yes-empty)"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then echo "[FAIL] missing target: $TARGET"; exit 2; fi
echo "[apply] [pre-flight] target present ✓"
echo

echo "[apply] step 1/2 — patch BulkResults.tsx (3 atomic edits)"
node "$BUNDLE_DIR/patches/patch-bulkresults.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/2 — pnpm --filter @workspace/dashboard run typecheck"
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
echo "FE-only — no api-server build, no api-server restart needed."
echo "Vite HMR picks up the changes."
echo
echo "Verify (next batch you run):"
echo "  - Maybe-tagged candidates with no phone returned →"
echo "    'Phone reveal pending — async' bucket. Existing copy kept."
echo "  - Yes-tagged candidates with no phone returned (Arushi-style) →"
echo "    'Manual phone sourcing needed' bucket. New copy explains"
echo "    no webhook will fire and to source manually."
echo "  - Header line shows both counts separately."
echo
echo "If you don't have any current yes-empty case to test, force one:"
echo "  - Find any prospect via Apollo where directPhoneStatus is 'yes'"
echo "    but Apollo's coverage is bad (Indian SaaS, smaller orgs)."
echo "  - Reveal them and watch the bucket they land in."
