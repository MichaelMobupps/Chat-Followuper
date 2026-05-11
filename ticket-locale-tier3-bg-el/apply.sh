#!/usr/bin/env bash
# Ticket locale-tier3-bg-el (CEE sweep, 3 of 3 — FINAL)
#
# Closes the CEE long-tail sweep. Tier-3 regional promotion for
# Bulgarian (bg-BG) and Greek (el-GR), plus one defect fix for the
# silent fallback-to-English bug affecting Bulgarian prospects.
#
# Defect fix (patch 2, edit 1): bg was missing its bare entry in
# GREETING_TABLE; Bulgarian prospects fell back to the English default
# greeting. This ticket adds 'bg: { withName: "Здравейте, {NAME}," ... }'
# to GREETING_TABLE as a defect fix before layering the regional
# bg-BG entry on top.
#
# Files modified:
#   - artifacts/api-server/src/lib/localeResolver.ts        (1 edit)
#   - artifacts/api-server/src/services/messagePrompts.ts   (2 edits)
#   - artifacts/api-server/src/lib/languageNativeness.ts    (1 edit)
#
# Dependencies: requires ticket-locale-tier3-ro-hu to have landed.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket locale-tier3-bg-el (CEE sweep 3 of 3 — FINAL)"
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
echo "  - Edit 1: fix missing bare bg entry in GREETING_TABLE (DEFECT FIX)"
echo "  - Edit 2: add bg-BG and el-GR tier-3 regional entries"
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
echo "[apply] DONE — CEE SWEEP COMPLETE"
echo "==========================================================="
echo
echo "REQUIRED - restart api-server workflow."
echo
echo "This completes the CEE long-tail sweep (3 of 3). Combined with"
echo "the prior tier-3 sweep, all 17 tier-3 regional locales now ship:"
echo "  hi-IN, bn-BD, bn-IN, ja-JP, ko-KR, he-IL, tr-TR, it-IT, pl-PL,"
echo "  ru-RU, id-ID, uk-UA, cs-CZ, ro-RO, hu-HU, bg-BG, el-GR."
echo
echo "Combined with the pre-session tier-1 (10) and tier-2 (9), Followuper"
echo "now has 36 fully regionalized locales covering the commercial bulk"
echo "of MobUpps' markets."
echo
echo "Verify by sending one prospector message to a test Bulgaria /"
echo "Greece prospect."
echo
echo "For bg-BG verify:"
echo "  - opens with 'Здравейте' or 'Уважаеми г-н/г-жо', NEVER 'Здрасти'"
echo "  - formal Вие register (Cyrillic capitalized)"
echo "  - BGN amounts use European separators ('1 234 567,89 лв.')"
echo "  - euro-adoption context noted where relevant"
echo "  - peer tier matches: UniCredit Bulbank/DSK for finance, NEK/"
echo "    Lukoil Neftohim for state-industrial, A1/Yettel/Vivacom for"
echo "    telco, Telerik/Progress for tech success reference, Speedy/"
echo "    Econt for logistics, eMAG Bulgaria for e-commerce"
echo
echo "For el-GR verify:"
echo "  - opens with 'Γεια σας' or 'Αξιότιμε κύριε/Αξιότιμη κυρία',"
echo "    NEVER 'Γεια σου'"
echo "  - formal εσείς register (plural-formal verb agreement)"
echo "  - monotonic accent system (single acute only; not polytonic)"
echo "  - EUR amounts use European separators ('€1.234.567,89')"
echo "  - peer tier matches: four 'systemic' banks (Eurobank/NBG/Alpha/"
echo "    Piraeus) for finance, PPC for utilities, OTE/Cosmote for"
echo "    telco, Greek shipping families (Angelicoussis/Tsakos/Star Bulk)"
echo "    for maritime, Skroutz/Public for retail-tech"
echo "  - shipping context acknowledged if the prospect is shipping-"
echo "    related (Greek shipping = ~21% of global merchant tonnage)"
echo
echo "Defect fix verification: send one prospector message to a Bulgarian"
echo "prospect WITHOUT a country in the data (so bare bg fallback fires)."
echo "Confirm the message opens with 'Здравейте' (Cyrillic), NOT the"
echo "English fallback 'Hi there,' / 'Hi {NAME},'."
