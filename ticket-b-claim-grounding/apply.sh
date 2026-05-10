#!/usr/bin/env bash
# Ticket B-claim-grounding
# Three-layer defense against hallucinated stats in chat messages:
#   1. Critic + rewriter user prompts now include the research brief
#      so they can verify factual grounding instead of guessing.
#   2. New `claim_grounding` axis in the critic system prompt forces
#      needs_rewrite when score < 4.
#   3. Deterministic detectUngroundedClaims() runs after the LLM critic
#      and prepends issues for any percentage / large number / bounded
#      claim whose digit string is not in the brief or conversation.
#
# This applies to BOTH prospector and followuper modes. In followuper
# mode, conversation text supplies the grounding when the brief is partial.
#
# Files modified:
#   - artifacts/api-server/src/services/messagePrompts.ts (6 edits)
#   - artifacts/api-server/src/services/messageGenerator.ts (3 edits)

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket B-claim-grounding"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "artifacts/api-server/src/services/messagePrompts.ts"
  "artifacts/api-server/src/services/messageGenerator.ts"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] both targets present ✓"
echo

echo "[apply] step 1/4 — patch services/messagePrompts.ts (6 edits)"
node "$BUNDLE_DIR/patches/patch-1-message-prompts.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/4 — patch services/messageGenerator.ts (3 edits)"
node "$BUNDLE_DIR/patches/patch-2-message-generator.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/4 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || { echo "[FAIL] api-server build"; exit 3; }
echo "[apply] api-server build PASS ✓"
echo

echo "[apply] step 4/4 — pnpm --filter @workspace/dashboard run typecheck"
echo "(dashboard build intentionally skipped — Defect #11: bash-driven vite build fails on PORT env var)"
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
echo "Verify by sending one prospector message and inspecting logs:"
echo "  - The 'Critiquing draft' log line now includes claimFound + claimMatches"
echo "  - The critic prompt now contains a RESEARCH BRIEF block"
echo "  - The critique JSON includes 'claim_grounding' in scores"
echo
echo "Manual test: pass a prospect with a calibratedDailyVolume of '400 daily'"
echo "and verify that a message containing '14% first-order completion' (a"
echo "number not in the brief) gets flagged via UNGROUNDED CLAIMS DETECTED"
echo "in the iteration logs and triggers a rewrite."
