#!/usr/bin/env bash
# Ticket locale-tier3-ja-ko
#
# Tier-3 regional promotion for Japanese (ja-JP) and Korean (ko-KR).
# Same template as ticket-locale-tier3-hindi-bengali. Adds the regional
# bucket on top of the existing bare ja / ko entries (which are
# byte-identical to the Email Prospector guides and remain untouched).
#
# What this adds that the bare entries cannot:
#   - JPY / KRW currency formatting with proper unit notation
#     (¥ + 万 / 億 for Japan; 원 + 만 / 억 for Korea)
#   - City and market references (Tokyo / Osaka / Pangyo / Gangnam etc.)
#   - Register layer cues beyond bare "FORMAL":
#     ja-JP: teineigo (default) / sonkeigo (prospect actions) /
#            kenjougo (MobUpps actions)
#     ko-KR: 합쇼체 (default cold) / 해요체 (warm only) / NEVER 해체
#   - Peer-brand tier mapping:
#     ja-JP: shosha / mega-cap / gaming / finance / travel
#     ko-KR: chaebol / tech-startup / gaming / finance
#     With explicit guidance to match peer tier to prospect tier
#
# Dependencies:
#   - Requires ticket-locale-tier3-hindi-bengali to have landed first
#     (all three patches pre-flight check the tier-3 hi/bn entries
#     and exit 5 with a clear FATAL message if missing).
#
# Files modified:
#   - artifacts/api-server/src/lib/localeResolver.ts        (1 edit)
#   - artifacts/api-server/src/services/messagePrompts.ts   (1 edit)
#   - artifacts/api-server/src/lib/languageNativeness.ts    (1 edit)
#
# What yes:
#   - resolveLocale("Japan", "ja") -> "ja-JP"
#   - resolveLocale("South Korea", "ko") -> "ko-KR"
#   - GREETING_TABLE gains ja-JP and ko-KR with full notes
#   - GUIDES gains ja-JP and ko-KR with SCRIPT / REGISTER / CURRENCY /
#     CITY / PEER BRANDS / TONE sub-sections at tier1/tier2 depth
#   - Bare ja and ko entries remain untouched (byte-identical to
#     Email Prospector); both serve as fallback when country is unknown
#     or non-JP/non-KR (rare)
#
# What not:
#   - No changes to buildGreetingBlock or buildNativenessBlock lookup
#     logic (existing full-tag-then-primary-subtag fallback handles
#     tier-3 the same way it handles tier-1 and tier-2)
#   - No changes to other South Asian or East Asian locales (zh-Hans,
#     zh-Hant, vi, th, id, ms, tl, hi-IN, bn-BD, bn-IN)
#   - No public API changes
#   - No new types, no new exports

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket locale-tier3-ja-ko"
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
echo "  - localeResolver.ts has ja: { JP: 'ja-JP' } and ko: { KR: 'ko-KR' }"
echo "  - messagePrompts.ts GREETING_TABLE has ja-JP / ko-KR entries with"
echo "    full notes (register layers, currency, peer brands)"
echo "  - languageNativeness.ts GUIDES has ja-JP / ko-KR with full"
echo "    SCRIPT / REGISTER / CURRENCY / CITY / PEER BRANDS / TONE depth"
echo
echo "Send one prospector message to a test Japan / South Korea prospect"
echo "to confirm the regional block fires end-to-end. Check that JPY"
echo "amounts use 万 / 億 notation, that Tokyo / Pangyo references"
echo "are localized to kanji / hangul, and that chaebol vs tech-startup"
echo "peer-brand tiering is applied correctly to the prospect's company."
