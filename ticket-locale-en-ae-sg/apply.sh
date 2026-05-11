#!/usr/bin/env bash
# Ticket locale-en-ae-sg
#
# Tier-3 English-variant promotion for UAE (en-AE) and Singapore
# (en-SG). Both are major B2B mobile adtech regional HQ hubs with
# English-default in business contexts but with distinct country
# context worth capturing (free-zone landscape, sovereign-wealth
# context, Islamic-cultural awareness for UAE; multicultural awareness
# and GLC / Temasek context for Singapore).
#
# Architectural note: extends the en block in LOCALE_TABLE, same
# pattern as ticket-locale-en-be-nl. No changes to resolveLocale().
# Existing zh + SG -> zh-Hans and ar + AE -> ar-SA mappings continue
# to work for Chinese-language and Arabic-language prospects.
#
# Files modified:
#   - artifacts/api-server/src/lib/localeResolver.ts        (1 edit)
#   - artifacts/api-server/src/services/messagePrompts.ts   (1 edit)
#   - artifacts/api-server/src/lib/languageNativeness.ts    (1 edit)
#
# Dependencies: requires ticket-locale-en-be-nl + ticket-locale-tier3-
# th-vi to have landed.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket locale-en-ae-sg"
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

echo "[apply] step 1/6 - patch lib/localeResolver.ts (1 edit, extend en block with AE+SG)"
node "$BUNDLE_DIR/patches/patch-1-locale-resolver.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/6 - patch services/messagePrompts.ts (1 edit, add en-AE + en-SG)"
node "$BUNDLE_DIR/patches/patch-2-message-prompts.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/6 - patch lib/languageNativeness.ts (1 edit, add en-AE + en-SG to GUIDES)"
node "$BUNDLE_DIR/patches/patch-3-language-nativeness.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 4/6 - pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || { echo "[FAIL] api-server build"; exit 3; }
echo "[apply] api-server build PASS"
echo

echo "[apply] step 5/6 - pnpm --filter @workspace/dashboard run typecheck"
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
echo "This ticket adds 2 new tier-3 en-variants: en-AE (UAE) and en-SG"
echo "(Singapore). Total fully regionalized locale count is now 42."
echo
echo "For en-AE verify (UAE prospect with country='UAE' or 'United Arab"
echo "Emirates', language='en'):"
echo "  - opens with 'Hi' or 'Hello' (NEVER 'As-salamu alaykum')"
echo "  - body uses en-GB spelling (organisation, optimisation)"
echo "  - AED amounts use Arabic-numeral comma-period format"
echo "  - peer tier matches: FAB / Emirates NBD / ADCB for finance,"
echo "    Mubadala / ADQ for sovereign-investment, Emaar / DAMAC for"
echo "    real estate, ADNOC for energy, Etisalat / e& / du for telco,"
echo "    Emirates / Etihad for aviation, Careem / Noon for tech"
echo "  - tone warm-professional with Islamic-cultural awareness"
echo "    (avoid pork / alcohol references; respect Ramadan)"
echo
echo "For en-SG verify (Singapore prospect with country='Singapore',"
echo "language='en'):"
echo "  - opens with 'Hi' or 'Hello'"
echo "  - body uses en-GB spelling, NO Singlish (NEVER 'lah' / 'lor')"
echo "  - SGD amounts use 'S\$1,234,567.89' format"
echo "  - peer tier matches: DBS / OCBC / UOB for finance, Temasek /"
echo "    GIC for sovereign, MAS / IMDA for regulator-adjacent, SingTel"
echo "    for telco, Grab / Sea / Lazada / Razer for tech, Keppel /"
echo "    Sembcorp / CapitaLand for infrastructure"
echo "  - tone efficient-formal direct-but-polite with multicultural"
echo "    awareness"
echo
echo "Existing mappings continue: Chinese-language SG prospects route to"
echo "zh-Hans (via zh block); Arabic-language AE prospects route to"
echo "ar-SA (via ar block). en-AE / en-SG only fire when language='en'."
