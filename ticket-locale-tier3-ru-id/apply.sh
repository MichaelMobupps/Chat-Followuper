#!/usr/bin/env bash
# Ticket locale-tier3-ru-id
#
# Tier-3 regional promotion for Russian (ru-RU) and Indonesian (id-ID).
# Final ticket in the tier-3 sweep (3 of 3 after he-tr and it-pl).
# Same template as prior sweep tickets. Adds the regional bucket on top
# of the existing bare ru / id entries which remain untouched.
#
# What this adds that the bare entries cannot:
#   ru-RU:
#     - Formal вы register (lowercase modern; capitalized Вы as dated
#       formal); ты explicitly rejected for cold
#     - Four-level greeting register hierarchy (Здравствуйте → Добрый
#       день → Уважаемый/Уважаемая → Привет rejected)
#     - RUB (₽) with European separators ('1 234 567,89 ₽')
#     - 'млн' / 'млрд' unit notation
#     - Moscow (Moskva-City, Tverskaya/Arbat business districts), SPb
#       (Gazprom HQ post-2015 relocation), Yekaterinburg (Urals), NSK
#       (Akademgorodok), Kazan (Innopolis Russian Silicon Valley),
#       Krasnodar (fastest-growing southern tech)
#     - Peer-brand tiers by sector:
#       * Enterprise / state / resource (Gazprom, Rosneft, LUKOIL,
#         Nornickel, Severstal, RUSAL, Polyus, RZD)
#       * Banking / finance (Sber super-app ecosystem with explicit
#         SberMarket / SberDevices / SberCloud / SberAuto / SberMobile
#         enumeration; VTB, Gazprombank, Alfa-Bank, T-Bank 2024 rebrand
#         from Tinkoff)
#       * Retail / FMCG (Magnit largest by store count, X5 / Pyaterochka
#         / Perekrestok largest by GMV, Dixy, Svetofor, M.Video-Eldorado)
#       * Telco / mobile (Beeline/VEON, MTS, MegaFon, Tele2, Rostelecom)
#       * Tech / digital-native (Yandex super-ecosystem with explicit
#         Taxi / Eats / Lavka / Market / Music / Cloud enumeration;
#         VK Group post-Mail.Ru merger; Ozon Nasdaq-listed; Wildberries
#         largest by GMV; Avito; CIAN; HeadHunter)
#     - Sign-off matching ('С уважением,' / 'С наилучшими пожеланиями,')
#
#   id-ID:
#     - Formal Bapak (Mr.) / Ibu (Ms.) honorific register
#     - Honorifics precede FIRST name (not last) per Indonesian naming
#       conventions; full Bapak/Ibu cold, abbreviated Pak/Bu only warm
#     - Time-of-day greeting rotation (Selamat pagi / siang / sore /
#       malam) by clock with read-time awareness for chat
#     - IDR (Rp) with European separators ('Rp1.234.567,89')
#     - 'rb' / 'jt' / 'M' Indonesian unit abbreviations with explicit
#       warning that 'M' means miliar (10^9) NOT mega (10^6)
#     - Jakarta CBD detail (Sudirman / Kuningan / Thamrin / SCBD /
#       Mega Kuningan / Pondok Indah), Jabodetabek metro definition
#     - Surabaya, Bandung (ITB tech satellite), Medan (palm oil
#       gateway), Semarang, Makassar, Bali / Denpasar
#     - Peer-brand tiers:
#       * Enterprise / state and finance (Mandiri, BCA, BNI, BRI,
#         CIMB Niaga, Astra International — Indonesia's Tata-equivalent
#         conglomerate, Pertamina, PLN, Telkom Indonesia / Telkomsel,
#         Indosat Ooredoo Hutchison, XL Axiata, Garuda)
#       * Conglomerate (Salim Group, Sinar Mas, Lippo, Djarum, Mayora,
#         Indofood / Indomie globally dominant noodle)
#       * Retail / FMCG (Indomaret / Alfamart universal convenience-
#         store reference, Hypermart, Carrefour Transmart, Lotte Mart)
#       * Tech / digital-native (GoTo Group — Gojek + Tokopedia merger,
#         Grab Indonesia, Bukalapak, Traveloka, tiket.com, OVO, DANA,
#         LinkAja, Blibli, Akulaku, Kredivo, Ajaib, Ruangguru, Halodoc,
#         Alodokter, Sociolla)
#       * Mobile gaming (Garena / Free Fire, Moonton / Mobile Legends)
#     - Sign-off matching ('Terima kasih,' / 'Hormat saya,' / 'Salam,')
#
# Dependencies:
#   - Requires ticket-locale-tier3-it-pl to have landed first. All three
#     patches pre-flight check and exit 5 with FATAL on missing deps.
#
# Files modified:
#   - artifacts/api-server/src/lib/localeResolver.ts        (1 edit)
#   - artifacts/api-server/src/services/messagePrompts.ts   (1 edit)
#   - artifacts/api-server/src/lib/languageNativeness.ts    (1 edit)
#
# What yes:
#   - resolveLocale("Russia", "ru") -> "ru-RU"
#   - resolveLocale("Indonesia", "id") -> "id-ID"
#   - GREETING_TABLE gains ru-RU and id-ID with full notes; id-ID
#     overrides the bare-id "Halo" greeting with the formal
#     "Selamat pagi, Bapak/Ibu {NAME}," cold-B2B opener
#   - GUIDES gains ru-RU and id-ID with full register / currency /
#     city / peer-brand / tone depth
#   - Bare ru and id entries remain untouched
#
# What not:
#   - No changes to buildGreetingBlock or buildNativenessBlock lookup
#   - No changes to other locales (he-IL, tr-TR, it-IT, pl-PL, ja-JP,
#     ko-KR, hi-IN, bn-BD, bn-IN all untouched; tier-1 / tier-2 untouched)
#   - No public API changes; no new types

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket locale-tier3-ru-id"
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
echo "This completes the tier-3 sweep (3 of 3): all three sweep tickets"
echo "(he-tr, it-pl, ru-id) are now applied for the regional promotions"
echo "of he-IL, tr-TR, it-IT, pl-PL, ru-RU, id-ID. Combined with prior"
echo "tickets, tier-3 now covers: hi-IN, bn-BD, bn-IN, ja-JP, ko-KR,"
echo "he-IL, tr-TR, it-IT, pl-PL, ru-RU, id-ID (11 regional locales)."
echo
echo "Verify in source:"
echo "  - localeResolver.ts has ru: { RU: 'ru-RU' } and id: { ID: 'id-ID' }"
echo "  - messagePrompts.ts GREETING_TABLE has ru-RU and id-ID entries"
echo "    with full notes; id-ID greeting overrides bare 'Halo' with"
echo "    the formal 'Selamat pagi, Bapak/Ibu {NAME},' for cold B2B"
echo "  - languageNativeness.ts GUIDES has ru-RU and id-ID with full"
echo "    register / currency / city / peer-brand / tone depth"
echo
echo "Spot-check by sending one prospector message to a test Russia /"
echo "Indonesia prospect."
echo
echo "For ru-RU verify:"
echo "  - greeting opens with 'Здравствуйте' or 'Добрый день', NEVER 'Привет'"
echo "  - lowercase вы register throughout, NEVER ты"
echo "  - RUB amounts use European separators ('1 234 567,89 ₽')"
echo "  - 'млн' / 'млрд' unit notation for large amounts"
echo "  - Cyrillic city names (Москва not Moscow in body, though"
echo "    transliterations are acceptable in chat)"
echo "  - Yandex-tier references for tech prospects, Sber-tier for"
echo "    fintech, Gazprom-tier for traditional / state"
echo
echo "For id-ID verify:"
echo "  - greeting opens with 'Selamat pagi/siang/sore, Bapak/Ibu {NAME},'"
echo "    or 'Halo Pak/Bu {NAME},' for less formal — NEVER first name alone"
echo "  - Bapak / Ibu honorifics throughout (precede the FIRST name)"
echo "  - IDR amounts use European separators ('Rp1.234.567,89')"
echo "  - 'rb' / 'jt' / 'M' unit notation correctly distinguishes from"
echo "    English 'M' (Indonesian M = miliar = 10^9, NOT mega = 10^6)"
echo "  - Indonesian peer-brand tier matches the prospect:"
echo "    GoTo / Grab / Bukalapak for tech, Mandiri / BCA / BRI for"
echo "    banking, Astra / Pertamina / Telkom for traditional enterprise"
echo "  - Indomaret / Alfamart as universal retail-density reference"
