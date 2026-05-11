#!/usr/bin/env bash
# Ticket followup-stage-rotation
#
# Closes the followuper hardening gap identified in the prior turn's
# backlog review: the writer prompt instructs the LLM to rotate angles
# by stage (1 = new insight, 2 = competitor move, 3 = direct + easy out,
# 4+ = fresh angles), but the critic could not enforce it because the
# critic prompt did not surface prior followups in a stage-labeled form.
#
# This patch:
#   - Surfaces prior followups to the critic in a labeled
#     PREVIOUS FOLLOWUPS BY STAGE block (same shape as the writer's view)
#   - Adds an angle_freshness 1-5 score axis to the critic schema
#     (followuper mode only)
#   - Adds rule 12 (ANGLE FRESHNESS / STAGE ROTATION) to the critic's
#     followuper rule list, with explicit rotation strategy guidance
#   - Adds a hard rule: needs_rewrite MUST be true when
#     angle_freshness < 3 AND stage >= 2 (stage 1 exempt)
#
# Files modified:
#   - artifacts/api-server/src/services/messagePrompts.ts (5 edits)
#
# What yes:
#   - Critic schema: followuper mode now scores angle_freshness alongside
#     channel_register_match, context_grounding, followup_ack
#   - Critic system prompt: new rule 12 with explicit stage strategy
#     rotation table (stage 1 / 2 / 3 / 4+)
#   - Critic user prompt: PREVIOUS FOLLOWUPS BY STAGE block surfaces
#     ctx.previous_followups when present
#   - Hard rule wired: stage >= 2 with angle_freshness < 3 forces rewrite
#   - Stage 1 messages are explicitly exempt (no prior followups to
#     compare against, angle_freshness defaults to 5)
#
# What not:
#   - No messageGenerator changes (previous_followups already flows
#     into ctx at line 989; the gap was purely on the prompt-surfacing side)
#   - No new types or exports
#   - No changes to CriticCategory enum (the existing
#     why_structure_violation category covers stage-rotation issues)
#   - No changes to the writer prompt (its rotation guidance is unchanged)
#   - No changes to the rewriter prompt (it receives critic-flagged issues
#     and addresses them through normal channels)
#   - No changes to prospector mode behaviour
#
# Dependency: requires ticket-b-critic-categories to have landed (the
# critic system prompt structure with mode-aware rules/scores is from
# that ticket). It has, per the handoff.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket followup-stage-rotation"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "artifacts/api-server/src/services/messagePrompts.ts"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] target present"
echo

echo "[apply] step 1/4 - patch services/messagePrompts.ts (5 edits)"
node "$BUNDLE_DIR/patches/patch-1-message-prompts.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/4 - pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || { echo "[FAIL] api-server build"; exit 3; }
echo "[apply] api-server build PASS"
echo

echo "[apply] step 3/4 - pnpm --filter @workspace/dashboard run typecheck"
echo "(dashboard build skipped per Defect #11)"
pnpm --filter @workspace/dashboard run typecheck || { echo "[FAIL] dashboard typecheck"; exit 3; }
echo "[apply] dashboard typecheck PASS"
echo

echo "[apply] step 4/4 - mirror sync"
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
echo "  - Send a stage-2 followup to a test prospect who already received"
echo "    a stage-1 followup. The critic call should now see a"
echo "    PREVIOUS FOLLOWUPS BY STAGE block in its user prompt."
echo "  - Tail logs for the critic JSON output: scores object should now"
echo "    contain 'angle_freshness' alongside channel_register_match,"
echo "    context_grounding, followup_ack (followuper mode only)."
echo "  - Force a regression test: send a stage-2 draft whose value point"
echo "    matches the stage-1 angle word-for-word. Critic should flag"
echo "    angle_freshness 1-2 and set needs_rewrite=true."
echo "  - Stage-1 followups: angle_freshness should default to 5 and NOT"
echo "    trigger needs_rewrite on this axis."
