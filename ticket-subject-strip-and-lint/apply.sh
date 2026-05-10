#!/usr/bin/env bash
# Ticket subject-strip-and-lint
#
# Two new sanitizers ported from email Prospector + integrated into
# the existing chat-followuper finalizeMessage pipeline:
#
#   - stripSubjectFromBody (Sanitizer 7): catches "Subject:" / "Re:"
#     lines that LLMs sometimes re-inject into the message body.
#
#   - runChatLint (Sanitizer 8): telemetry-only quality scorer that
#     runs after all other sanitizers. Logs surviving violations as
#     warnings; does NOT change what ships to the user. Useful for
#     debugging sanitizer regressions in production.
#
# What yes:
#   - stripSubjectFromBody runs first in finalizeMessage.
#   - runChatLint runs last, after humanize.
#   - Lint covers: em-dash, bold markdown, snake_case, placeholders,
#     spelled-out percent (14 langs), subject leak, length (30-1000
#     chars), self-referential opener.
#   - Logs as logger.warn with score, violations, and a 200-char preview.
#
# What not:
#   - No prompt changes.
#   - No public API changes.
#   - No new LLM calls.
#   - Lint is OBSERVATIONAL ONLY; it does not block messages.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket subject-strip-and-lint"
echo "==========================================================="
echo

cd "$REPO_ROOT"

# Pre-flight
if [[ ! -f artifacts/api-server/src/services/messageGenerator.ts ]]; then
  echo "[FAIL] missing target: artifacts/api-server/src/services/messageGenerator.ts"
  exit 2
fi
echo "[apply] [pre-flight] target present ✓"
echo

echo "[apply] step 1/3 — patch services/messageGenerator.ts (2 edits)"
node "$BUNDLE_DIR/patches/patch-1-message-generator.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/3 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || { echo "[FAIL] api-server build"; exit 3; }
echo "[apply] api-server build PASS ✓"
echo

# Defect #11: dashboard apply ends at typecheck only, never vite build.
echo "[apply] step 3/3 — pnpm --filter @workspace/dashboard run typecheck"
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
echo "Verify by sending one prospector message and tailing logs:"
echo "  - If the final message is clean, no [chat-lint] warning fires"
echo "  - If a sanitizer regression slips a violation through, you'll"
echo "    see a logger.warn line: '[chat-lint] message shipped with N"
echo "    surviving violation(s); score=X' with the rule names listed"
echo
echo "Manual probe: pass a context that produces a draft starting with"
echo "'Subject: Foo' or 'Re: Bar' (rare but possible); the subject"
echo "strip should remove it from the body before the message ships."
