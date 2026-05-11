#!/usr/bin/env bash
# Ticket teams-register (Phase 3)
#
# Dependency: requires ticket-telegram-register AND ticket-slack-register
# to have landed first. The patch script's pre-flight check fails loudly
# (exit 5) if the post-slack docstring anchor is missing.
#
# Populates the four TEAMS_* register constants in
# artifacts/api-server/src/lib/channelRegister.ts with full prospector
# and followuper writer/critic rule blocks, mirroring the depth of the
# WhatsApp (Phase 1), Telegram (Phase 2), and Slack (Phase 4) registers.
#
# This is the final channel content drop. After this patch, all four
# supported channels (WhatsApp, Telegram, Teams, Slack) have populated
# register rules and no placeholders remain in channelRegister.ts.
#
# Files modified:
#   - artifacts/api-server/src/lib/channelRegister.ts (3 edits)
#
# What yes:
#   - TEAMS_PROSPECTOR_WRITER_RULES fully populated
#   - TEAMS_PROSPECTOR_CRITIC_RULES fully populated
#   - TEAMS_FOLLOWUPER_WRITER_RULES fully populated
#   - TEAMS_FOLLOWUPER_CRITIC_RULES fully populated
#   - File-header docstring lists all four channels as implemented
#   - Stale "// Future channel" comment reframed as a meaningful
#     section header for the Telegram/Teams/Slack block
#
# Teams-specific register decisions (vs Slack baseline):
#   - Most formal of the four channels. Enterprise-skewed: banking,
#     insurance, government, healthcare, large enterprise tech.
#   - External access default-OFF context; messages may route to
#     approval queues at enterprise tenants.
#   - Tone closer to email than chat.
#   - 1:1 chat only, never Teams channel. Never @-mention prospect.
#   - Teams markdown subset renders inconsistently; default to plain
#     text. One **bold** acceptable. No bullets, lists, headings, or
#     blockquotes.
#   - Length: 6-9 sentences prospector (most of the four channels),
#     3-4 followuper.
#   - Greeting: "Hi {FirstName}," default; "Dear {FirstName},"
#     acceptable in conservative markets.
#   - Emojis: 0 even in established conversations unless prospect
#     used one first AND context is informal.
#   - Enterprise peer references: Workday, Salesforce, SAP, Oracle,
#     ServiceNow. NOT Notion/Linear/Figma.
#   - Vertical: explicit banking/insurance/healthcare/government
#     sector vocabulary (account-opening conversion, claims throughput,
#     AML, KYC, compliance language).
#
# What not:
#   - No changes to WhatsApp, Telegram, or Slack blocks (all untouched)
#   - No changes to the public API surface
#   - No new exports, no new types
#   - No prompt-wiring changes in messageGenerator or messagePrompts

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket teams-register (Phase 3)"
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
echo "  - artifacts/api-server/src/lib/channelRegister.ts now has ~1265 LOC"
echo "    (was 945 after slack). Look for 'TEAMS_PROSPECTOR_WRITER_RULES = \\\`'"
echo "    to confirm content is in place."
echo "  - buildWriterRegisterBlock('teams', 'prospector') now returns the full"
echo "    Teams prospector writer block instead of an empty string."
echo "  - WhatsApp, Telegram, and Slack behaviour unchanged."
echo "  - No empty placeholder consts remain in the file: grep '= \"\"; // Phase'"
echo "    should return zero hits."
echo
echo "Channel content phase work for channelRegister.ts is complete after"
echo "this ticket lands. All four channels (WhatsApp, Telegram, Teams, Slack)"
echo "have populated prospector + followuper writer + critic register rules."
