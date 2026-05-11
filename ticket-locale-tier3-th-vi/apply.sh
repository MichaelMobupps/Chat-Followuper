#!/usr/bin/env bash
# Ticket locale-tier3-th-vi
#
# Tier-3 regional promotion for Thai (th-TH) and Vietnamese (vi-VN).
# Both languages have genuinely heavy register / pronoun systems that
# the existing bare th / vi entries did not capture; this ticket adds
# country-specific city, currency, peer-brand, and tone depth.
#
# Both languages keep adtech vocabulary in English (CPI, ROAS, DSP,
# retention, install, conversion, etc.) per the bare guides; the tier-3
# additions are about register (Thai particles ครับ/ค่ะ + คุณ + first
# name; Vietnamese kinship pronouns anh/chị/em), city context, peer
# brands, currency norms, and culture-specific tone.
#
# Files modified:
#   - artifacts/api-server/src/lib/localeResolver.ts        (1 edit)
#   - artifacts/api-server/src/services/messagePrompts.ts   (1 edit)
#   - artifacts/api-server/src/lib/languageNativeness.ts    (1 edit)
#
# Dependencies: requires ticket-locale-en-be-nl to have landed.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket locale-tier3-th-vi"
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

echo "[apply] step 1/6 - patch lib/localeResolver.ts (1 edit, add th and vi blocks)"
node "$BUNDLE_DIR/patches/patch-1-locale-resolver.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/6 - patch services/messagePrompts.ts (1 edit, add th-TH and vi-VN to GREETING_TABLE)"
node "$BUNDLE_DIR/patches/patch-2-message-prompts.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/6 - patch lib/languageNativeness.ts (1 edit, add th-TH and vi-VN to GUIDES)"
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
echo "This ticket adds 2 new tier-3 regional locales for Thailand and"
echo "Vietnam. Total fully regionalized locale count is now 40."
echo
echo "For th-TH verify (Thai prospect with country='Thailand', language='th'):"
echo "  - opens with 'เรียน' or 'สวัสดีครับ/ค่ะ คุณ', NEVER 'หวัดดี'"
echo "  - polite particles ครับ (male) or ค่ะ (female) present at sentence"
echo "    ends throughout the body (NEVER dropped)"
echo "  - speaker pronoun ผม or ดิฉัน (not กู)"
echo "  - recipient addressed as คุณ + first name"
echo "  - adtech vocabulary stays in English (CPI / ROAS / DSP / etc)"
echo "  - THB amounts use '฿1,234,567.89' format (Arabic numerals)"
echo "  - peer tier matches: Bangkok Bank / KBank / SCB for finance,"
echo "    CP / ThaiBev / SCG / Central for conglomerate, AIS / True for"
echo "    telco, Shopee / Lazada for e-commerce"
echo "  - tone hierarchical-respectful with kreng jai awareness"
echo
echo "For vi-VN verify (Vietnamese prospect with country='Vietnam', language='vi'):"
echo "  - opens with 'Kính gửi anh/chị' or 'Chào anh/chị', NEVER 'Chào bạn'"
echo "  - speaker self-references as 'em' (not 'tôi') throughout body"
echo "  - recipient addressed as 'anh' (male) or 'chị' (female)"
echo "  - adtech vocabulary stays in English (CPI / ROAS / DSP / etc)"
echo "  - VND amounts scaled via 'triệu' (M) or 'tỷ' (B), e.g."
echo "    '500 triệu đồng' or '5 tỷ đồng'"
echo "  - peer tier matches: Vietcombank / Techcombank for finance,"
echo "    Vingroup / Masan / FPT for conglomerate, Viettel for telco,"
echo "    Shopee / Tiki / TikTok Shop for e-commerce, VNG / MoMo for tech"
echo "  - signoff 'Trân trọng,' (the standard Vietnamese B2B email close)"
echo "  - tone warm-respectful with face-saving (giữ thể diện) awareness"
echo "  - relationship-first ordering, no hard sell"
