#!/usr/bin/env bash
# Ticket locale-tier3-he-tr
#
# Tier-3 regional promotion for Hebrew (he-IL) and Turkish (tr-TR).
# Same template as ticket-locale-tier3-ja-ko. Adds the regional bucket
# on top of the existing bare he / tr entries (which are byte-identical
# to the Email Prospector guides and remain untouched).
#
# What this adds that the bare entries cannot:
#   he-IL:
#     - Tel Aviv tech vs traditional sector split (the most important
#       Israeli B2B distinction); register and code-mixing differ between
#       the two sectors materially
#     - NIS (₪) formatting with no decimals; USD dual-quoting context
#     - City references: Tel Aviv (Rothschild Boulevard), Herzliya
#       (Pituach), Petah Tikva, Jerusalem, Haifa (Matam), Beer Sheva
#       (Cyber Spark)
#     - Tech tier (Wix, Monday, Lemonade, Riskified, JFrog, Playtika,
#       Fiverr, Outbrain, Taboola, AppsFlyer, Mobileye)
#     - Cyber tier (Check Point, CyberArk, Imperva, Varonis, Wiz, Snyk,
#       SentinelOne)
#     - Traditional sector tier (Bank Hapoalim, Leumi, Discount, Mizrahi
#       Tefahot; Bezeq, Cellcom, Partner; Strauss, Tnuva, Shufersal)
#     - Israeli B2B tone (direct, brief; reject לכבוד / לכבוד אדוני stiff
#       openings; reject hype words)
#
#   tr-TR:
#     - Istanbul-tech vs Anatolian-conservative cultural split (the most
#       important Turkish B2B distinction)
#     - Formal Siz vs informal Sen register; Bey / Hanım honorifics rule
#       (after the FIRST name, not the last name)
#     - Turkish lira (₺) formatting with European separators
#       (period thousands, comma decimal); inflation / dual-USD context
#     - Diacritics enforcement: ç ğ ı İ ö ş ü
#     - Istanbul sub-districts (Maslak, Levent, Etiler, Şişli for finance /
#       enterprise; Cihangir, Beyoğlu for media / startups)
#     - Ankara defense / aerospace context (TUSAŞ, Aselsan, Roketsan)
#     - Tech tier (Trendyol, Hepsiburada, Getir, Yemeksepeti, Papara,
#       BiP, Sahibinden, N11)
#     - Holding-group tier (Koç, Sabancı, Doğuş, Eczacıbaşı, Anadolu)
#     - Bank list (İş Bankası, Garanti BBVA, Akbank, Yapı Kredi, state
#       banks Ziraat / VakıfBank / Halkbank)
#     - Three sign-off variants matched to register
#
# Dependencies:
#   - Requires ticket-locale-tier3-ja-ko to have landed first. All three
#     patches pre-flight check the JP/KR entries and exit 5 with a clear
#     FATAL message if missing.
#
# Files modified:
#   - artifacts/api-server/src/lib/localeResolver.ts        (1 edit)
#   - artifacts/api-server/src/services/messagePrompts.ts   (1 edit)
#   - artifacts/api-server/src/lib/languageNativeness.ts    (1 edit)
#
# What yes:
#   - resolveLocale("Israel", "he") -> "he-IL"
#   - resolveLocale("Turkey", "tr") -> "tr-TR"
#   - GREETING_TABLE gains he-IL and tr-TR with full notes
#   - GUIDES gains he-IL and tr-TR with full sector-split / register /
#     currency / city / peer-brand / tone depth
#   - Bare he and tr entries remain untouched; both serve as fallback
#     when country is unknown or non-IL/non-TR
#
# What not:
#   - No changes to buildGreetingBlock or buildNativenessBlock lookup
#     logic (full-tag-then-primary-subtag fallback handles tier-3
#     uniformly)
#   - No changes to other locales (ja-JP, ko-KR, hi-IN, bn-BD, bn-IN
#     all untouched; tier-1 and tier-2 entries untouched)
#   - No public API changes
#   - No new types, no new exports

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket locale-tier3-he-tr"
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
echo "  - localeResolver.ts has he: { IL: 'he-IL' } and tr: { TR: 'tr-TR' }"
echo "  - messagePrompts.ts GREETING_TABLE has he-IL / tr-TR entries"
echo "    with full notes"
echo "  - languageNativeness.ts GUIDES has he-IL / tr-TR with full"
echo "    sector-split / REGISTER / CURRENCY / CITY / PEER BRANDS / TONE"
echo "    depth"
echo
echo "Spot-check by sending one prospector message to a test Israel /"
echo "Turkey prospect. For he-IL: check that NIS (₪) is used not USD,"
echo "that Tel Aviv tech vs traditional sector tone matches the company,"
echo "and that the message doesn't open with stiff לכבוד. For tr-TR:"
echo "check that Bey / Hanım honorifics follow the first name, that"
echo "diacritics are correct (İstanbul not Istanbul), that lira amounts"
echo "use European separators, and that the holding-group vs tech tier"
echo "peer-brand match the prospect's company."
