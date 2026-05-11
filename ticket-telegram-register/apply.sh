#!/usr/bin/env bash
# Ticket telegram-register (Phase 2)
#
# Populates the four TELEGRAM_* register constants in
# artifacts/api-server/src/lib/channelRegister.ts with full prospector
# and followuper writer/critic rule blocks, mirroring the depth of the
# WhatsApp register (Phase 1).
#
# Also updates the file-header docstring and the "Future channels"
# comment to reflect that Telegram is no longer a placeholder phase.
#
# Files modified:
#   - artifacts/api-server/src/lib/channelRegister.ts (3 edits)
#
# What yes:
#   - TELEGRAM_PROSPECTOR_WRITER_RULES fully populated (~80 lines)
#   - TELEGRAM_PROSPECTOR_CRITIC_RULES fully populated (~55 lines)
#   - TELEGRAM_FOLLOWUPER_WRITER_RULES fully populated (~60 lines)
#   - TELEGRAM_FOLLOWUPER_CRITIC_RULES fully populated (~45 lines)
#   - File-header docstring lists Phase 1-2 as fully implemented
#   - "Future channels" comment narrowed to Phases 3-4 (Teams, Slack)
#
# Telegram-specific register decisions (vs WhatsApp baseline):
#   - Length: 5-8 sentences prospector (vs 5-7), 3-4 followuper (vs 2-3)
#   - Markdown: forbidden on cold messages (allowed in followups only
#     when the prospect's prior reply showed they format themselves)
#   - Links: forbidden on cold messages (auto-expanded previews look
#     like campaign blasts), allowed in followups when justified
#   - Stickers: forbidden in all modes
#   - @username: never used as the greeting; bare "Hi" is the fallback
#   - Bot-suspicion: stricter human-voice rule than WhatsApp
#   - Geo peer skew acknowledged: RU/CIS/MENA/Iran/crypto-Web3
#   - Vertical: explicit nod to crypto/Web3 sub-vertical vocabulary
#
# What not:
#   - No changes to WhatsApp blocks (untouched)
#   - No changes to Teams or Slack placeholders (still empty)
#   - No changes to the public API surface (buildWriterRegisterBlock,
#     buildCriticRegisterBlock signatures unchanged; their routing for
#     Telegram already existed and simply receives populated content now)
#   - No new exports, no new types
#   - No prompt-wiring changes in messageGenerator or messagePrompts

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket telegram-register (Phase 2)"
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
echo "  - artifacts/api-server/src/lib/channelRegister.ts now has ~530 LOC"
echo "    (was ~342). Look for 'TELEGRAM_PROSPECTOR_WRITER_RULES = \\\`' to"
echo "    confirm content is in place."
echo "  - buildWriterRegisterBlock('telegram', 'prospector') now returns the"
echo "    full Telegram prospector writer block instead of an empty string."
echo "  - WhatsApp behaviour unchanged. WhatsApp blocks are untouched."
echo "  - Teams and Slack blocks remain empty (Phases 3-4)."
echo
echo "If the dashboard Telegram page is not yet wired end-to-end, this"
echo "ticket is a no-op at runtime; the rules sit ready for activation."
