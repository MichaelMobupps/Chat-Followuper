#!/usr/bin/env bash
# Ticket locale-tier3-it-pl
#
# Tier-3 regional promotion for Italian (it-IT) and Polish (pl-PL).
# Same template as ticket-locale-tier3-he-tr. Adds the regional bucket
# on top of the existing bare it / pl entries (which are byte-identical
# to the Email Prospector guides and remain untouched).
#
# What this adds that the bare entries cannot:
#   it-IT:
#     - North / Center / South cultural split (Milano-Torino-Genova
#       industrial; Roma bureaucratic; Mezzogiorno relationship-driven)
#     - Formal Lei register enforcement (never tu for cold)
#     - Greeting override: "Salve {NAME}," for cold chat (the bare it
#       form "Ciao {NAME}," is informal-young, wrong for cold B2B)
#     - EUR with European separators (€1.234.567,89)
#     - Italian apostrophe / accent orthography rules
#     - Enterprise tier (Eni, Enel, Generali, UniCredit, Intesa,
#       Poste Italiane, TIM, Mediaset, Sky, RAI, Leonardo)
#     - Industrial tier (Fiat / Stellantis, Ferrari, Lavazza, Barilla,
#       Ferrero, Campari, Pirelli, Luxottica, fashion houses)
#     - Tech / digital-native (Subito.it, Immobiliare.it, Satispay,
#       Nexi, Bending Spoons, Musixmatch)
#     - Sign-off matching ('Cordiali saluti' / 'Distinti saluti')
#
#   pl-PL:
#     - Formal Pan / Pani register (Polish polite third-person)
#     - Greeting override: "Dzień dobry, {NAME}," for cold chat (bare
#       pl form "Cześć {NAME}," is informal-young, wrong for cold B2B)
#     - Polish diacritics enforcement (ą, ć, ę, ł, ń, ó, ś, ź, ż)
#     - PLN (zł) with space thousands separator + comma decimal
#       ('1 234 567,89 zł')
#     - Cities: Warszawa (capital / enterprise), Kraków (tech),
#       Wrocław (R&D), Trójmiasto (Tricity), Poznań, Łódź, Katowice,
#       Rzeszów (Aviation Valley)
#     - Enterprise tier (PKO BP, Pekao, mBank, ING Śląski, Santander
#       Polska, BNP Paribas Polska, PZU, Orlen, KGHM, JSW, PGE,
#       Tauron, Enea, Orange Polska, Play, T-Mobile Polska, Plus)
#     - Retail / FMCG tier (Biedronka, Lidl, Kaufland, Carrefour,
#       Auchan, Żabka, Empik, CCC, LPP)
#     - Tech / digital-native (Allegro, InPost, DocPlanner, Brainly,
#       Booksy, Tpay / Przelewy24, DataWalk, Asseco, CD Projekt)
#     - Sign-off matching ('Z poważaniem' / 'Pozdrawiam')
#
# Dependencies:
#   - Requires ticket-locale-tier3-he-tr to have landed first. All three
#     patches pre-flight check the he-tr entries and exit 5 with a clear
#     FATAL message if missing.
#
# Files modified:
#   - artifacts/api-server/src/lib/localeResolver.ts        (1 edit)
#   - artifacts/api-server/src/services/messagePrompts.ts   (1 edit)
#   - artifacts/api-server/src/lib/languageNativeness.ts    (1 edit)
#
# What yes:
#   - resolveLocale("Italy", "it") -> "it-IT"
#   - resolveLocale("Poland", "pl") -> "pl-PL"
#   - GREETING_TABLE gains it-IT and pl-PL with full notes and the
#     register-correct greeting overrides ("Salve" / "Dzień dobry")
#   - GUIDES gains it-IT and pl-PL with full cultural-split / register /
#     currency / city / peer-brand / tone depth
#   - Bare it and pl entries remain untouched; both serve as fallback
#     when country is unknown or non-IT/non-PL
#
# What not:
#   - No changes to buildGreetingBlock or buildNativenessBlock lookup
#     logic (full-tag-then-primary-subtag fallback unchanged)
#   - No changes to other locales (all prior tier-3, tier-2, tier-1
#     entries untouched)
#   - No public API changes; no new types, no new exports

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket locale-tier3-it-pl"
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
echo "Verify:"
echo "  - localeResolver.ts has it: { IT: 'it-IT' } and pl: { PL: 'pl-PL' }"
echo "  - messagePrompts.ts GREETING_TABLE has it-IT ('Salve {NAME},')"
echo "    and pl-PL ('Dzień dobry, {NAME},') overriding the informal"
echo "    bare-it / bare-pl forms"
echo "  - languageNativeness.ts GUIDES has it-IT and pl-PL with full"
echo "    sector-split / register / currency / city / peer-brand /"
echo "    tone depth"
echo
echo "Spot-check by sending one prospector message to a test Italy /"
echo "Poland prospect."
echo
echo "For it-IT verify:"
echo "  - greeting opens with 'Salve' (or 'Buongiorno'), NOT 'Ciao'"
echo "  - Lei register throughout (NOT tu)"
echo "  - EUR amounts use European separators (€1.234.567,89)"
echo "  - Italian peer-brand tier matches the prospect's company:"
echo "    enterprise (Eni/Enel/Generali/UniCredit/Intesa) for traditional,"
echo "    industrial (Fiat/Ferrari/Lavazza/Barilla) for manufacturing,"
echo "    tech (Subito.it/Satispay/Nexi/Bending Spoons) for SaaS"
echo
echo "For pl-PL verify:"
echo "  - greeting opens with 'Dzień dobry, {NAME},', NOT 'Cześć'"
echo "  - Pan / Pani register throughout"
echo "  - Polish diacritics are correct (Dzień not Dzien)"
echo "  - PLN amounts use space thousands + comma decimal"
echo "    ('1 234 567,89 zł' NOT '1,234,567.89')"
echo "  - Polish peer-brand tier matches: enterprise / state-finance"
echo "    (PKO BP/Pekao/PZU/Orlen) for traditional, retail (Biedronka/"
echo "    Żabka/CCC/LPP) for FMCG, tech (Allegro/InPost/DocPlanner)"
echo "    for SaaS / e-commerce"
