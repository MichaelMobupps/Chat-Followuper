#!/usr/bin/env bash
# Ticket slack-register (Phase 4 by file-numbering, priority #2 by handoff)
#
# Dependency: requires ticket-telegram-register to have landed first.
# The patch script's pre-flight check fails loudly (exit 5) if the
# post-telegram docstring anchor is missing.
#
# Populates the four SLACK_* register constants in
# artifacts/api-server/src/lib/channelRegister.ts with full prospector
# and followuper writer/critic rule blocks, mirroring the depth of the
# WhatsApp (Phase 1) and Telegram (Phase 2) registers.
#
# Also updates the file-header docstring and the "Future channels"
# comment to reflect that Slack is no longer a placeholder and Teams
# (Phase 3) is the only remaining placeholder phase.
#
# Files modified:
#   - artifacts/api-server/src/lib/channelRegister.ts (3 edits)
#
# What yes:
#   - SLACK_PROSPECTOR_WRITER_RULES fully populated
#   - SLACK_PROSPECTOR_CRITIC_RULES fully populated
#   - SLACK_FOLLOWUPER_WRITER_RULES fully populated
#   - SLACK_FOLLOWUPER_CRITIC_RULES fully populated
#   - File-header docstring lists Phases 1, 2, 4 as implemented
#   - "Future channel" comment narrowed to Phase 3 (Teams only)
#
# Slack-specific register decisions (vs WhatsApp baseline):
#   - Workplace context, not consumer. Prospect is at a SaaS/tech/marketing
#     company in nearly every case.
#   - Slack Connect delivery: external messages may be blocked or routed
#     to approval queues.
#   - 1:1 DM only, never channel. Never @-mention prospect in cold message.
#   - Light Slack-native markdown ALLOWED (and expected): *bold* sparing,
#     `inline code` for product/metric names. Heavy markdown still
#     forbidden (no headings, no bullets, no blockquotes). This differs
#     from Telegram which forbade markdown on cold.
#   - No links in first cold message (Slack auto-expands previews).
#   - Length: 5-8 sentences prospector, 3-4 followuper (matches Telegram).
#   - Tone: more formal than WhatsApp, slightly less than email.
#   - Spam phrases list adds "just checking in".
#   - Vertical: explicit SaaS sub-vertical vocabulary (trial-to-paid,
#     activation, MQL/SQL, PQL, ARR/MRR, PLG vs sales-led).
#
# What not:
#   - No changes to WhatsApp blocks (untouched)
#   - No changes to Telegram blocks (untouched)
#   - No changes to Teams placeholders (still empty)
#   - No changes to the public API surface
#   - No new exports, no new types
#   - No prompt-wiring changes in messageGenerator or messagePrompts

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket slack-register"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "artifacts/api-server/src/lib/channelRegister.ts"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] target present"
echo

echo "[apply] step 1/4 - patch lib/channelRegister.ts (3 edits)"
node "$BUNDLE_DIR/patches/patch-1-channel-register.mjs" || { echo "[FAIL]"; exit 2; }
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
echo "  - artifacts/api-server/src/lib/channelRegister.ts now has ~915 LOC"
echo "    (was 633 after telegram). Look for 'SLACK_PROSPECTOR_WRITER_RULES = \\\`'"
echo "    to confirm content is in place."
echo "  - buildWriterRegisterBlock('slack', 'prospector') now returns the full"
echo "    Slack prospector writer block instead of an empty string."
echo "  - WhatsApp and Telegram behaviour unchanged."
echo "  - Teams blocks remain empty (Phase 3, last remaining placeholder)."
echo
echo "If the dashboard Slack page is not yet wired end-to-end, this ticket"
echo "is a no-op at runtime; the rules sit ready for activation."
