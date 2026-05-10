#!/usr/bin/env bash
# Ticket B-critic-categories
#
# Restores the 8-category critic-issue typing from email Prospector,
# replacing the prior free-text string list. Each issue now carries:
#   - excerpt:      exact problematic text
#   - reason:       what is wrong
#   - category:     one of 8 (machine_artifact, term_leakage, ...)
#   - severity:     "block" | "warn"
#   - suggested_fix: optional replacement
#
# This makes critic output structurally inspectable for telemetry
# (which categories fire most often) and lets the rewriter target
# block-severity issues with priority.
#
# Files modified:
#   - artifacts/api-server/src/services/messagePrompts.ts (4 edits)
#   - artifacts/api-server/src/services/messageGenerator.ts (6 edits)
#
# What yes:
#   - CriticIssue + CriticCategory exported types
#   - Critic system prompt OUTPUT FORMAT updated with structured
#     issue shape, CATEGORY DEFINITIONS, SEVERITY rules
#   - Defensive parsing accepts both new (object) and legacy (string)
#     formats so a temporary LLM regression won't crash the pipeline
#   - Meta-language and claim-grounding injections now produce typed
#     CriticIssue objects (machine_artifact / block severity)
#   - Rewriter user prompt formats issues in numbered multi-line blocks
#     matching email Prospector's idx. [SEVERITY] / Problem / Reason /
#     Suggested layout
#
# What not:
#   - No new LLM calls
#   - No prompt-content changes beyond OUTPUT FORMAT and rewriter body
#     formatting
#   - No public API changes (CriticResult is internal to messageGenerator)

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket B-critic-categories"
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

echo "[apply] step 1/4 — patch services/messagePrompts.ts (4 edits)"
node "$BUNDLE_DIR/patches/patch-1-message-prompts.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/4 — patch services/messageGenerator.ts (6 edits)"
node "$BUNDLE_DIR/patches/patch-2-message-generator.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/4 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || { echo "[FAIL] api-server build"; exit 3; }
echo "[apply] api-server build PASS ✓"
echo

echo "[apply] step 4/4 — pnpm --filter @workspace/dashboard run typecheck"
echo "(dashboard build skipped per Defect #11)"
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
echo
echo "Verify by sending one prospector message and tailing logs:"
echo "  - The Critic JSON output now contains structured issues:"
echo "      { excerpt, reason, category, severity, suggested_fix }"
echo "  - Iteration logs show 'issues: critique.issues.slice(0, 3)'"
echo "    with full objects (not bare strings)"
echo "  - The rewriter prompt body shows numbered blocks per issue:"
echo "      1. [BLOCK] machine_artifact"
echo "         Problem: \"funded_account\""
echo "         Reason: ..."
echo "         Suggested: ..."
echo
echo "Telemetry: search logs for 'category' to count category"
echo "frequencies over a few days. The 8 buckets give you actionable"
echo "data on which sanitizers (or which prompt rules) deserve work."
