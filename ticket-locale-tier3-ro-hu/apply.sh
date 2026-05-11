#!/usr/bin/env bash
# Ticket locale-tier3-ro-hu (CEE sweep, 2 of 3)
#
# Tier-3 regional promotion for Romanian (ro-RO) and Hungarian (hu-HU).
# Same template as prior tier-3 sweep tickets. Builds on existing bare
# ro and hu entries in both GREETING_TABLE and GUIDES.
#
# Files modified:
#   - artifacts/api-server/src/lib/localeResolver.ts        (1 edit)
#   - artifacts/api-server/src/services/messagePrompts.ts   (1 edit)
#   - artifacts/api-server/src/lib/languageNativeness.ts    (1 edit)
#
# Dependencies: requires ticket-locale-tier3-uk-cs to have landed.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket locale-tier3-ro-hu (CEE sweep 2 of 3)"
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

echo "[apply] step 2/6 - patch services/messagePrompts.ts (1 edit)"
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
echo "Verify by sending one prospector message to a test Romania /"
echo "Hungary prospect."
echo
echo "For ro-RO verify:"
echo "  - opens with 'Bună ziua' or 'Stimate domnule/doamnă', NEVER 'Salut'"
echo "  - formal dumneavoastră register throughout (NEVER tu)"
echo "  - Romanian diacritics correct (ș and ț are comma-below, NOT cedilla)"
echo "  - RON amounts use European separators ('1.234.567,89 lei')"
echo "  - peer tier matches: Banca Transilvania/BCR/BRD for finance,"
echo "    OMV Petrom/Hidroelectrica for state-industrial, eMAG/UiPath/"
echo "    Bitdefender for tech"
echo
echo "For hu-HU verify:"
echo "  - opens with 'Üdvözlöm' or 'Tisztelt {LastName} Úr/Asszony', NEVER 'Szia'"
echo "  - formal Ön register throughout (3rd-person verb conjugation)"
echo "  - Hungarian diacritics correct (ő and ű are double-acute,"
echo "    distinct from ö / ü)"
echo "  - HUF amounts use space thousands, no decimal ('1 234 567 Ft')"
echo "  - Hungarian name-order if Hungarian-language context (family"
echo "    name before given name in Tisztelt openings)"
echo "  - peer tier matches: OTP Bank for finance (regional CEE leader),"
echo "    MOL Group/MVM for energy, Audi Győr/Mercedes Kecskemét/BMW"
echo "    Debrecen for automotive, eMAG Hungary/Prezi/Wolt for tech"
