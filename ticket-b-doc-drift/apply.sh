#!/usr/bin/env bash
# Ticket B-doc-drift
#
# Single-line docstring fix in artifacts/api-server/src/services/messageGenerator.ts.
# The file-header docstring (line 5) labels the Draft stage as Sonnet 4.6,
# but the actual DRAFT_MODEL const (line 117) is claude-opus-4-7. The Draft
# model was promoted from Sonnet to Opus and the comment was not updated.
#
# This patch fixes the docstring only. No runtime behaviour changes.
#
# Files modified:
#   - artifacts/api-server/src/services/messageGenerator.ts (1 edit)
#
# What yes:
#   - Line 5 of the pipeline docstring now reads "1. DRAFT     (Opus 4.7)"
#   - Em-dash column alignment preserved (4 trailing spaces instead of 2)
#   - CRITIC and REWRITE docstring lines untouched (already correct)
#
# What not:
#   - No model-const changes
#   - No prompt changes
#   - No behaviour changes
#   - No public API changes

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket B-doc-drift"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "artifacts/api-server/src/services/messageGenerator.ts"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] target present"
echo

echo "[apply] step 1/4 - patch services/messageGenerator.ts (1 edit)"
node "$BUNDLE_DIR/patches/patch-1-message-generator-docstring.mjs" || { echo "[FAIL]"; exit 2; }
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
echo "Verify by opening artifacts/api-server/src/services/messageGenerator.ts:"
echo "  - Line 5 reads:  *   1. DRAFT     (Opus 4.7)    [em-dash] initial message ..."
echo "  - Lines 6-7 unchanged (CRITIC Opus 4.7, REWRITE Sonnet 4.6)"
echo "  - Const block at line 117-119 unchanged"
