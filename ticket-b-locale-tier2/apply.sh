#!/usr/bin/env bash
# Ticket B-locale-tier2
#
# Adds 8 regional locale entries to BOTH GUIDES (languageNativeness.ts)
# and GREETING_TABLE (messagePrompts.ts):
#
#   English variants:
#     en-IN  India / Pakistan / Bangladesh / Sri Lanka
#     en-GB  Britain / Ireland / Australia / New Zealand / South Africa
#     en-US  United States / English-Canada
#
#   French variants:
#     fr-FR  France / Belgium-fr / Switzerland-fr / Luxembourg / Maghreb
#     fr-CA  Canada-fr (Quebec)
#
#   German variants:
#     de-DE  Germany / Luxembourg-de
#     de-AT  Austria
#     de-CH  Switzerland-de
#
# Each guide entry mirrors tier1 shape:
#   - register / pronoun
#   - sibling-locale vocabulary differentials
#   - adtech translation rules with English-acronym whitelist
#   - city / currency / peer-brand references
#   - tone
#   - script-mixing or orthography rules where relevant
#
# What yes:
#   - GUIDES gets 8 new entries with rich content (~520 LOC inserted)
#   - GREETING_TABLE gets 8 new entries with concise notes (~10 LOC)
#   - Tags fire automatically: localeResolver already maps relevant
#     (country, language) pairs to these tags
#
# What not:
#   - No prompt-content changes outside the new entries
#   - No new types
#   - No public API changes

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket B-locale-tier2"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "artifacts/api-server/src/lib/languageNativeness.ts"
  "artifacts/api-server/src/services/messagePrompts.ts"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] both targets present ✓"
echo

echo "[apply] step 1/4 — patch lib/languageNativeness.ts (8 new GUIDES)"
node "$BUNDLE_DIR/patches/patch-1-language-nativeness.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/4 — patch services/messagePrompts.ts (8 new GREETING_TABLE)"
node "$BUNDLE_DIR/patches/patch-2-greeting-table.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/4 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || { echo "[FAIL] api-server build"; exit 3; }
echo "[apply] api-server build PASS ✓"
echo

echo "[apply] step 4/4 — pnpm --filter @workspace/dashboard run typecheck"
echo "(dashboard build skipped per Defect #11)"
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
echo
echo "Verify by sending one prospector message to a prospect with:"
echo "  - country=India,  language=en  (should resolve to en-IN)"
echo "  - country=Britain,language=en  (should resolve to en-GB)"
echo "  - country=Quebec, language=fr  (should resolve to fr-CA)"
echo "  - country=Austria,language=de  (should resolve to de-AT)"
echo "  - country=Switzerland,language=de (should resolve to de-CH)"
echo
echo "Logs should show the resolved BCP47 tag and the message body"
echo "should reflect locale-specific vocabulary, brands, and register"
echo "(e.g. en-IN messages reference Flipkart/Paytm; de-CH messages"
echo "use 'Grüsse' not 'Grüße' and never reference euros)."
