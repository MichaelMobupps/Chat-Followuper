#!/usr/bin/env bash
# Ticket locale-tier3-hindi-bengali
#
# Closes the handoff-flagged gap: "Hindi/Bengali script depth (currently
# using English greeting fallback per GREETING_TABLE)". Adds region-aware
# locale variants:
#   - hi-IN  (India Hindi)
#   - bn-BD  (Bangladesh Bengali)
#   - bn-IN  (India Bengali / West Bengal)
#
# Files modified:
#   - artifacts/api-server/src/lib/localeResolver.ts        (1 edit)
#   - artifacts/api-server/src/services/messagePrompts.ts   (2 edits)
#   - artifacts/api-server/src/lib/languageNativeness.ts    (1 edit)
#
# What yes:
#   - localeResolver routes (India, hi) -> hi-IN,
#                          (Bangladesh, bn) -> bn-BD,
#                          (India, bn) -> bn-IN
#   - GREETING_TABLE bare `bn` entry no longer falls back to English;
#     now uses Bengali-script "নমস্কার {NAME},"
#   - GREETING_TABLE gains hi-IN, bn-BD, bn-IN entries with
#     peer-brand, currency, and verb-form notes
#   - GUIDES gains hi-IN, bn-BD, bn-IN entries mirroring tier1/tier2
#     depth (SCRIPT / ADTECH VOCABULARY / CITY-MARKET / PEER BRANDS /
#     TONE sub-sections)
#   - bn-BD and bn-IN each carry explicit AVOID lists for the other
#     market's peers (Bangladesh prospects should not see Flipkart;
#     India Bengali prospects should not see bKash)
#
# What not:
#   - No changes to buildGreetingBlock or buildNativenessBlock logic
#     (the existing full-tag-then-primary-subtag fallback already
#     handles tier-3 the same way it handles tier-1 and tier-2)
#   - No changes to bare `hi` entry (already uses Latin-transliterated
#     "Namaste"; not a fallback gap)
#   - No changes to bare `bn` GUIDES entry (depth retained as a fallback
#     for cases where country is unknown)
#   - No changes to Urdu, Tamil, Telugu, or other South Asian locales
#     (out of scope; tier-3 part 2 if needed)
#   - No public API changes

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket locale-tier3-hindi-bengali"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "artifacts/api-server/src/lib/localeResolver.ts"
  "artifacts/api-server/src/services/messagePrompts.ts"
  "artifacts/api-server/src/lib/languageNativeness.ts"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] all three targets present"
echo

echo "[apply] step 1/6 - patch lib/localeResolver.ts (1 edit)"
node "$BUNDLE_DIR/patches/patch-1-locale-resolver.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/6 - patch services/messagePrompts.ts (2 edits)"
node "$BUNDLE_DIR/patches/patch-2-message-prompts.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/6 - patch lib/languageNativeness.ts (1 edit)"
node "$BUNDLE_DIR/patches/patch-3-language-nativeness.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 4/6 - pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || { echo "[FAIL] api-server build"; exit 3; }
echo "[apply] api-server build PASS"
echo

echo "[apply] step 5/6 - pnpm --filter @workspace/dashboard run typecheck"
echo "(dashboard build skipped per Defect #11)"
pnpm --filter @workspace/dashboard run typecheck || { echo "[FAIL] dashboard typecheck"; exit 3; }
echo "[apply] dashboard typecheck PASS"
echo

echo "[apply] step 6/6 - mirror sync"
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
echo "REQUIRED - restart api-server workflow."
echo
echo "Verify:"
echo "  - localeResolver.ts now has hi: { IN: 'hi-IN' } and"
echo "    bn: { BD: 'bn-BD', IN: 'bn-IN' } in LOCALE_TABLE"
echo "  - messagePrompts.ts GREETING_TABLE bare bn entry uses"
echo "    নমস্কার (Bengali script) instead of 'Hello,'"
echo "  - messagePrompts.ts GREETING_TABLE has hi-IN, bn-BD, bn-IN"
echo "    entries under a tier-3 section header"
echo "  - languageNativeness.ts GUIDES has hi-IN, bn-BD, bn-IN entries"
echo "    matching tier1/tier2 depth"
echo
echo "Send one prospector message to a test India Hindi / Bangladesh"
echo "Bengali / India Bengali prospect to confirm the right greeting"
echo "and nativeness block fire end-to-end."
