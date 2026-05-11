#!/usr/bin/env bash
# Ticket locale-tier3-uk-cs (CEE sweep, 1 of 3)
#
# Tier-3 regional promotion for Ukrainian (uk-UA) and Czech (cs-CZ).
# Builds on existing bare uk and cs entries in both GREETING_TABLE and
# GUIDES. Same template as the prior tier-3 sweep (he-tr, it-pl, ru-id).
#
# What this adds on top of the bare entries:
#   uk-UA:
#     - Formal Ви register (capitalized in correspondence); ти rejected
#     - Greeting register hierarchy (Вітаю → Доброго дня → Шановний/
#       Шановна → Привіт rejected)
#     - CRITICAL post-2022 language-sensitivity note: Ukrainian-specific
#       term equivalents enforced (Київ NOT Киев, Львів NOT Львов, etc.)
#     - Ukrainian-specific orthography (і NOT и for Ukrainian і)
#     - UAH (₴) with European separators
#     - Kyiv tech + Lviv IT-export-capital + Dnipro industrial / fintech +
#       Kharkiv war-affected note + Odesa port + western IT cluster
#     - Post-2022 distributed-teams note (Lviv + Polish cities + US/EU)
#     - Five peer-brand tiers:
#       * Banking: Monobank, PrivatBank, Oschadbank, Raiffeisen Aval,
#         UkrSibbank, PUMB, Ukreximbank
#       * Industrial/state: Metinvest, DTEK, Ferrexpo, Kernel, MHP,
#         Roshen, Naftogaz, Ukrenergo, Ukrzaliznytsia, Antonov
#       * Retail/logistics: Rozetka, Nova Poshta (THE Ukrainian parcel
#         standard), Ukrposhta, Comfy, Eldorado/Foxtrot
#       * Telco: Kyivstar/VEON, Vodafone Ukraine, lifecell
#       * IT outsourcing: SoftServe, EPAM Ukraine, Sigma, GlobalLogic,
#         Ciklum, Luxoft, Eleks, Infopulse
#       * Tech product: GitLab, Grammarly, MacPaw, Reface, Preply,
#         Ajax Systems, Genesis, Restream, People.ai
#     - Sign-offs (З повагою, З найкращими побажаннями, Дякую)
#
#   cs-CZ:
#     - Formal Vy register (capitalized in correspondence); ty rejected
#     - Tykáme si / vykáme si cultural relationship-warming distinction
#     - Greeting register hierarchy (Dobrý den → Vážený pane/paní →
#       Vážený pane inženýre/doktore academic title acknowledgment →
#       Ahoj/Čau rejected)
#     - Czech diacritics enforcement (á, č, ď, é, ě, í, ň, ó, ř, š,
#       ť, ú, ů, ý, ž — 15+ diacritic letters)
#     - CZK (Kč) with European separators; explicit "NOT EUR" note
#     - Praha (Karlín/Smíchov/Pankrác tech districts) + Brno (Red Hat
#       largest office globally) + Ostrava industrial + Plzeň Škoda
#       Transportation/Pilsner + Olomouc R&D
#     - Five peer-brand tiers:
#       * Banking (Czech banks predominantly Western-European-owned):
#         Česká spořitelna/Erste, ČSOB/KBC, Komerční banka/SG,
#         Moneta, UniCredit ČR+SK, Raiffeisenbank ČR, Air Bank/PPF
#         (Czech), Fio banka (Czech), J&T
#       * Industrial: Škoda Auto/VW, Škoda Transportation, ČEZ Group,
#         Innogy, O2 ČR, T-Mobile ČR, Vodafone ČR, Tatra Trucks
#       * Retail: Albert, Tesco ČR, Kaufland, Lidl, Penny, Globus,
#         Billa, Coop, dm drogerie, Rossmann
#       * E-commerce: Alza.cz (THE Czech dominant), Mall.cz/Allegro,
#         Rohlík.cz (international expansion to DACH/Italy/Hungary),
#         Heureka.cz (regional CEE leader), Slevomat, AAA Auto
#       * Tech/software: Avast/Gen Digital (security), Kiwi.com (most
#         internationally successful Czech tech), Productboard, Mews,
#         Memsource/Phrase, GoodData, Y Soft
#     - Tone note: reserved, pragmatic, understated; closer to German/
#       Austrian norms than Anglo-Saxon
#     - Sign-offs (S pozdravem, S úctou, Pěkný den)
#
# Files modified:
#   - artifacts/api-server/src/lib/localeResolver.ts        (1 edit)
#   - artifacts/api-server/src/services/messagePrompts.ts   (1 edit)
#   - artifacts/api-server/src/lib/languageNativeness.ts    (1 edit)
#
# Dependencies:
#   - Requires ticket-locale-tier3-ru-id to have landed first
#
# What yes:
#   - resolveLocale("Ukraine", "uk") -> "uk-UA"
#   - resolveLocale("Czechia"|"Czech Republic", "cs") -> "cs-CZ"
#   - GREETING_TABLE / GUIDES gain uk-UA + cs-CZ with full notes
#
# What not:
#   - Bare uk and cs entries unchanged (both still serve as fallback
#     when country is unknown)
#   - No changes to any other locale, lookup logic, or public API

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket locale-tier3-uk-cs (CEE sweep 1 of 3)"
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
echo "Verify by sending one prospector message to a test Ukraine /"
echo "Czech Republic prospect."
echo
echo "For uk-UA verify:"
echo "  - opens with 'Вітаю' or 'Доброго дня', NEVER 'Привіт'"
echo "  - formal Ви register throughout (NOT ти)"
echo "  - Ukrainian-specific city names (Київ not Киев, Львів not Львов)"
echo "  - UAH amounts use European separators ('1 234 567,89 ₴')"
echo "  - peer tier matches: Monobank/PrivatBank for finance, Rozetka/"
echo "    Nova Poshta for retail/logistics, SoftServe/EPAM for IT outsourcing,"
echo "    GitLab/Grammarly/MacPaw for tech product"
echo
echo "For cs-CZ verify:"
echo "  - opens with 'Dobrý den' or 'Vážený pane/paní', NEVER 'Ahoj'"
echo "  - formal Vy register throughout (NOT ty)"
echo "  - Czech diacritics correct (č, š, ž, ř, ů, etc.)"
echo "  - CZK amounts use European separators ('1 234 567,89 Kč'),"
echo "    NOT EUR by default"
echo "  - peer tier matches: Česká spořitelna/ČSOB/Komerční banka for"
echo "    finance, Škoda Auto/ČEZ for industrial, Alza/Mall/Rohlík for"
echo "    e-commerce, Avast/Kiwi for tech"
echo "  - tone reserved/pragmatic; avoid American hype words"
