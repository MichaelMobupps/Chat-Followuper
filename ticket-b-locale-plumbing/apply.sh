#!/usr/bin/env bash
# Ticket B-locale-plumbing
# Adds locale resolution (country + language → BCP 47 tag) as the
# foundation for region-aware nativeness/greeting lookups.
#
# Behavior change today: log lines and prompt headers will show
# "language: pt-BR" instead of "language: pt" for Brazilian
# prospects. Output content is unchanged because no per-region
# guides exist yet — that's tier1's job (next ticket).
#
# Files touched:
#   1. NEW lib/localeResolver.ts
#   2. lib/languageNativeness.ts          (full-tag fall-through)
#   3. services/messagePrompts.ts         (greeting fall-through)
#   4. services/messageGenerator.ts       (resolve at ctx construction)
#   5. services/prospectResearch.ts       (resolve at research entry)

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket B-locale-plumbing"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "artifacts/api-server/src/lib/languageNativeness.ts"
  "artifacts/api-server/src/services/messagePrompts.ts"
  "artifacts/api-server/src/services/messageGenerator.ts"
  "artifacts/api-server/src/services/prospectResearch.ts"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] all 4 modify-targets present ✓"
echo

echo "[apply] step 1/7 — install lib/localeResolver.ts"
node "$BUNDLE_DIR/patches/patch-1-install-locale-resolver.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/7 — patch lib/languageNativeness.ts"
node "$BUNDLE_DIR/patches/patch-2-language-nativeness.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/7 — patch services/messagePrompts.ts"
node "$BUNDLE_DIR/patches/patch-3-message-prompts.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 4/7 — patch services/messageGenerator.ts"
node "$BUNDLE_DIR/patches/patch-4-message-generator.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 5/7 — patch services/prospectResearch.ts"
node "$BUNDLE_DIR/patches/patch-5-prospect-research.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 6/7 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || { echo "[FAIL] api-server build"; exit 3; }
echo "[apply] api-server build PASS ✓"
echo

echo "[apply] step 7/7 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || { echo "[FAIL] dashboard typecheck"; exit 3; }
echo "[apply] dashboard typecheck PASS ✓"
echo

echo "[apply] mirror sync"
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
echo "REQUIRED — restart api-server workflow."
echo "  Replit Workflows → Backend Server → Stop → Start"
echo
echo "Verify by sending one prospect through generate-message and"
echo "checking the api-server log for the 'Stage 1: Generating"
echo "initial draft' log line. The 'language:' field should now"
echo "show:"
echo "  - Brazilian prospect (country=Brazil, language=pt) → 'pt-BR'"
echo "  - Mainland China  (country=China, language=zh)     → 'zh-Hans'"
echo "  - Indian English  (country=India, language=en)     → 'en-IN'"
echo "  - Spanish prospect in Spain (country=Spain, language=es) → 'es-ES'"
echo "  - Anything without country mapping              → bare language"
echo
echo "Output content is unchanged because tier1 hasn't shipped yet."
echo "This ticket is the plumbing only."
