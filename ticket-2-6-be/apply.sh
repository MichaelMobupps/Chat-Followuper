#!/usr/bin/env bash
# Ticket 2.6-BE — Telegram send mechanism
#
# WHAT THIS TICKET DOES
#   1. Replaces the artifacts/api-server/src/services/channels/telegram.ts
#      stub with a full impl: generateLink + recordSendIntent + a typed
#      RecordSendIntentInput. Mirrors services/channels/whatsapp.ts in
#      structure so the route layer's channel surface stays uniform.
#   2. Patches artifacts/api-server/src/routes/followups.ts (4 anchor
#      edits): import alias, SEND_IMPLEMENTED_CHANNELS membership,
#      no_telegram_handle precondition, channel-dispatch branch.
#   3. Patches lib/db/src/schema/action_logs.ts (1 anchor edit) adding
#      telegramSendIntent + telegramLinkGenerated to ACTION_TYPES. No
#      DB migration because action_type is varchar(50), not an enum.
#
# WHAT THIS TICKET DOES *NOT* DO
#   - Channel-parameterize routes/whatsappLink.ts POST /send-intent.
#     The Telegram recordSendIntent function ships but is not yet
#     called from any route. Calling it requires either a new
#     /prospects/:id/telegram-link route or expanding send-intent's
#     body schema to accept channel. Separate ticket.
#   - Wire the Telegram FE page. The ChannelFollowupPage component
#     shipped in ticket-2-5-fe already accepts channel="telegram";
#     ticket-2-6-fe is a 3-line wrapper page.
#   - Geo gate. Telegram is universally available; no GeoGateBlockedError.
#
# CONVENTIONS PRESERVED
#   - scripts/sync-source-code.sh (NOT source-code/sync.sh)
#   - Verify with typecheck, NOT build (per pnpm-workspace skill)
#   - Patches use the applyOnce + evidence-block pattern from
#     ticket-2-5-be/patches/

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket 2.6-BE — Telegram send mechanism"
echo "==========================================================="
echo
echo "[apply] repo root: $REPO_ROOT"
echo "[apply] bundle dir: $BUNDLE_DIR"
echo

cd "$REPO_ROOT"

# ── Pre-flight ─────────────────────────────────────────────────────
echo "[apply] pre-flight"

REQUIRED_FILES=(
  "artifacts/api-server/src/services/channels/whatsapp.ts"
  "artifacts/api-server/src/services/channels/telegram.ts"
  "artifacts/api-server/src/routes/followups.ts"
  "artifacts/api-server/src/routes/whatsappLink.ts"
  "lib/db/src/schema/action_logs.ts"
  "artifacts/api-server/package.json"
)
for f in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "[FAIL] pre-flight: missing expected file: $f"
    echo "       (are we in the chat-followuper repo root?)"
    exit 2
  fi
done

# Quick anchor sanity checks before running the patch scripts so a
# pre-existing divergence surfaces here, not deep inside node.
if ! grep -q 'SEND_IMPLEMENTED_CHANNELS' artifacts/api-server/src/routes/followups.ts; then
  echo "[FAIL] pre-flight: SEND_IMPLEMENTED_CHANNELS anchor missing in routes/followups.ts"
  echo "       ticket-2-5-be may not have shipped, or the file has drifted."
  exit 2
fi
if ! grep -q 'whatsappSendIntent' lib/db/src/schema/action_logs.ts; then
  echo "[FAIL] pre-flight: whatsappSendIntent anchor missing in action_logs.ts"
  exit 2
fi

echo "  ok"
echo

# ── Step 1: replace the telegram.ts stub ──────────────────────────
echo "[apply] step 1/4 — replace services/channels/telegram.ts"
NEW_FILE="artifacts/api-server/src/services/channels/telegram.ts"
SRC_FILE="$BUNDLE_DIR/files/$NEW_FILE"
if [[ ! -f "$SRC_FILE" ]]; then
  echo "[FAIL] bundle missing source file: $SRC_FILE"
  exit 2
fi
cp "$SRC_FILE" "$NEW_FILE"
echo "  ~ $NEW_FILE"
echo

# ── Step 2: apply the two patches ─────────────────────────────────
echo "[apply] step 2/4 — apply patches"

node "$BUNDLE_DIR/patches/patch-followups-add-telegram.js"
node "$BUNDLE_DIR/patches/patch-action-logs-add-telegram.js"
echo

# ── Step 3: typecheck api-server ──────────────────────────────────
echo "[apply] step 3/4 — typecheck @workspace/api-server"
pnpm --filter @workspace/api-server run typecheck
echo

# ── Step 4: mirror sync ───────────────────────────────────────────
echo "[apply] step 4/4 — mirror sync to source-code/"
if [[ -f "scripts/sync-source-code.sh" ]]; then
  bash scripts/sync-source-code.sh
else
  echo "  (scripts/sync-source-code.sh not found — skipping)"
fi
echo

# ── Optional smoke tests ──────────────────────────────────────────
echo "[apply] smoke tests (best-effort; require running api-server)"
if command -v curl >/dev/null 2>&1; then
  echo "  POST http://localhost:80/api/prospects/00000000-0000-0000-0000-000000000000/send-next-followup (no auth) → expect 401"
  curl -sS -o /dev/null -w "  HTTP %{http_code}\n" \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"channel":"telegram"}' \
    "http://localhost:80/api/prospects/00000000-0000-0000-0000-000000000000/send-next-followup" 2>/dev/null || \
    echo "  (api-server not reachable from apply.sh — that's fine; restart it from the Agent)"
fi
echo

echo "==========================================================="
echo "[apply] DONE"
echo "==========================================================="
echo
echo "Changes:"
echo "  ~ services/channels/telegram.ts   (stub replaced with full impl)"
echo "  ~ routes/followups.ts              (4 anchor edits)"
echo "  ~ lib/db/src/schema/action_logs.ts (1 anchor edit, +2 action_types)"
echo
echo "Next steps for the Agent:"
echo "  1. Restart the api-server workflow so the new code loads."
echo "  2. Smoke test from an authenticated session: POST /api/prospects/:id/send-next-followup"
echo "     with body {\"channel\":\"telegram\"} on a prospect that has telegramHandle set."
echo "     Expect 200 with deepLinkUrl starting with https://t.me/."
echo "  3. On a prospect WITHOUT telegramHandle, the same call should return"
echo "     409 no_telegram_handle (vs the 501 channel_send_not_implemented that"
echo "     it returned before this ticket)."
echo
echo "Next ticket: ticket-2-6-fe — a thin wrapper at pages/followup/telegram.tsx"
echo "rendering <ChannelFollowupPage channel=\"telegram\" />. The component"
echo "shipped in ticket-2-5-fe already handles this channel; the FE wrapper"
echo "is ~3 lines."
