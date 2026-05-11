#!/usr/bin/env bash
# Ticket locale-en-be-nl
#
# Tier-3 English-variant promotion for Belgium (en-BE) and Netherlands
# (en-NL). New routing pattern: Belgian / Dutch B2B prospects default
# to English in tech / mobile-adtech contexts, but with country-
# specific peer brands, currency norms, and business-culture tone notes.
#
# Architectural note: this is the first ticket adding regional en-*
# entries beyond the existing en-GB / en-US / en-IN. The routing
# happens via extending the existing en block in LOCALE_TABLE; no
# changes to resolveLocale() core function needed.
#
# Files modified:
#   - artifacts/api-server/src/lib/localeResolver.ts        (1 edit)
#   - artifacts/api-server/src/services/messagePrompts.ts   (1 edit)
#   - artifacts/api-server/src/lib/languageNativeness.ts    (1 edit)
#
# Dependencies: requires ticket-locale-tier3-bg-el to have landed.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket locale-en-be-nl"
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

echo "[apply] step 1/6 - patch lib/localeResolver.ts (1 edit, extend en block)"
node "$BUNDLE_DIR/patches/patch-1-locale-resolver.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/6 - patch services/messagePrompts.ts (1 edit, add en-BE + en-NL to GREETING_TABLE)"
node "$BUNDLE_DIR/patches/patch-2-message-prompts.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/6 - patch lib/languageNativeness.ts (1 edit, add en-BE + en-NL to GUIDES)"
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
echo "This ticket adds 2 new regional English variants for Belgium and"
echo "Netherlands. Total locale count is now 38 fully regionalized locales."
echo
echo "For en-BE verify (Belgian prospect with country='Belgium', language='en'):"
echo "  - opens with 'Hi' or 'Hello' (English)"
echo "  - body uses en-GB spelling (organisation, optimisation, behaviour)"
echo "  - EUR amounts use European separators ('€1.234.567,89')"
echo "  - peer tier matches: KBC/BNP Paribas Fortis for finance, UCB/"
echo "    Janssen/Solvay for pharma, AB InBev (Leuven), Odoo/Showpad/"
echo "    Collibra for tech"
echo "  - tone formal-warm, sits between Dutch directness and French"
echo "    politeness"
echo
echo "For en-NL verify (Dutch prospect with country='Netherlands', language='en'):"
echo "  - opens with 'Hi' (default) or 'Hello'"
echo "  - body uses en-GB spelling (organisation, optimisation, behaviour)"
echo "  - EUR amounts use European separators"
echo "  - peer tier matches: Booking/ASML/Adyen/Mollie/TomTom for tech,"
echo "    ING/Rabobank/ABN AMRO for finance, Philips/DSM/Heineken for"
echo "    industrial, Albert Heijn/Jumbo for retail"
echo "  - tone extremely direct, no small talk, no hype, concrete numbers"
echo "    with qualified claims"
echo
echo "Skipped per research decision: Nordic Scandinavian variants"
echo "(en-SE / en-NO / en-DK / en-FI) — these markets default to"
echo "English in B2B tech with no meaningful country-context"
echo "differentiation worth a regional entry. Generic en-GB serves"
echo "them adequately."
