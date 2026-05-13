#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# ticket-2-9-telegram-parity — Telegram channel parity for manual ingest
# ──────────────────────────────────────────────────────────────────────────
#
# Ships three related changes in one bundle:
#
#   2-6-fe: replaces the "Coming in ticket 2.6" placeholder at
#           /followup/telegram with the live ChannelFollowupPage wrapper.
#
#   2-9-be: extends MANUAL_INGEST_CHANNELS to include "telegram",
#           teaches the POST /api/prospects/manual-ingest handler to
#           accept either an E.164 phone or a Telegram @handle for the
#           Telegram path (storing in the right column accordingly),
#           and teaches services/channels/telegram.ts generateLink to
#           build phone-based t.me deep links.
#
#   2-9-fe: removes the WhatsApp-only gate around <ManualContactsSection>
#           in ChannelFollowupPage so the section renders on the
#           Telegram page too; extends the dashboard's MANUAL_INGEST_-
#           CHANNELS constant; makes AddManualContactDialog channel-aware
#           (description, label, placeholder, validation hint, error
#           handler covers duplicate_telegram_handle).
#
# No schema changes. prospects.telegram_handle is a pre-existing column
# (nullable text). No new ACTION_TYPES needed — the existing
# manualIngestSingle entry carries channel in its metadata, and this
# bundle adds identifierKind ("phone" | "telegram_handle") so audit
# queries can distinguish the two Telegram storage paths.
#
# Idempotent — re-running after success is cheap and lossless.
#
# Pipeline:
#   1. Pre-flight: required files exist; patch anchors present.
#   2. Copy new FE file (pages/followup/telegram.tsx) into place.
#   3. Apply patches (BE x2, FE x3).
#   4. Typecheck @workspace/api-server.
#   5. Typecheck @workspace/dashboard.
#   6. Sync artifacts/api-server/src → source-code/ via repo script.
#
# Exits 0 on full success.
#
# No schema changes this batch, so `pnpm exec tsc -b lib/db` and
# `drizzle-kit generate` are NOT needed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

export TICKET_DIR="$SCRIPT_DIR"

# ─── 1/6 Pre-flight ───────────────────────────────────────────────────────

echo "[1/6] Pre-flight checks..."

REQUIRED_FILES=(
  "artifacts/api-server/src/routes/prospects.ts"
  "artifacts/api-server/src/services/channels/telegram.ts"
  "artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx"
  "artifacts/dashboard/src/components/followup/AddManualContactDialog.tsx"
  "artifacts/dashboard/src/components/followup/ManualContactsSection.tsx"
  "artifacts/dashboard/src/lib/api/manual-ingest.ts"
  "artifacts/dashboard/src/pages/followup/telegram.tsx"
  "artifacts/dashboard/src/pages/followup/whatsapp.tsx"
  "scripts/sync-source-code.sh"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  MISSING required file: $f" >&2
    exit 1
  fi
done

# Confirm 2-7-be and 2-7-fe are deployed: this bundle anchors against
# their handlers, components, and the constant they introduced.
if ! grep -qF '/users/me/manual-ingest-settings' artifacts/api-server/src/routes/prospects.ts; then
  echo "  2-7-be does NOT appear to be deployed (missing manual-ingest-settings route)" >&2
  exit 1
fi
if ! grep -qF 'POST /api/prospects/manual-ingest' artifacts/api-server/src/routes/prospects.ts; then
  echo "  2-7-be does NOT appear to be deployed (missing manual-ingest route)" >&2
  exit 1
fi
if ! grep -qF 'ManualContactsSection' artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx; then
  echo "  2-7-fe does NOT appear to be deployed (no ManualContactsSection import in ChannelFollowupPage)" >&2
  exit 1
fi

# Anchor presence checks — each patch verifies its own anchors too, but
# failing fast here keeps the error close to the cause.
declare -a ANCHOR_FILES=(
  "artifacts/api-server/src/routes/prospects.ts"
  "artifacts/api-server/src/routes/prospects.ts"
  "artifacts/api-server/src/services/channels/telegram.ts"
  "artifacts/dashboard/src/lib/api/manual-ingest.ts"
  "artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx"
  "artifacts/dashboard/src/components/followup/AddManualContactDialog.tsx"
)
declare -a ANCHOR_STRINGS=(
  'const MANUAL_INGEST_CHANNELS = ["whatsapp"] as const;'
  '"Phone must be E.164 format, e.g.'
  'export function generateLink(handle: string, body: string): string {'
  'export const MANUAL_INGEST_CHANNELS = ["whatsapp"] as const;'
  '{channel === "whatsapp" && ('
  'const PHONE_RE = /^\+[1-9]\d{6,14}$/;'
)

for i in "${!ANCHOR_FILES[@]}"; do
  file="${ANCHOR_FILES[$i]}"
  needle="${ANCHOR_STRINGS[$i]}"
  if ! grep -qF "$needle" "$file"; then
    echo "  MISSING anchor in $file" >&2
    echo "    expected: $needle" >&2
    exit 1
  fi
done

# Bundle files we'll copy into the repo
BUNDLE_FILES=(
  "$SCRIPT_DIR/files/artifacts/dashboard/src/pages/followup/telegram.tsx"
)
for f in "${BUNDLE_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  MISSING bundle file: $f" >&2
    exit 1
  fi
done

echo "  ok"

# ─── 2/6 Copy new FE file ─────────────────────────────────────────────────

echo "[2/6] Copying new FE file..."

cp -v \
  "$SCRIPT_DIR/files/artifacts/dashboard/src/pages/followup/telegram.tsx" \
  artifacts/dashboard/src/pages/followup/telegram.tsx

echo "  ok"

# ─── 3/6 Patches ──────────────────────────────────────────────────────────

echo "[3/6] Applying patches..."

# Parse-check each patch before running (Beautiful-Squidward Pass 6).
for p in \
  "$SCRIPT_DIR/patches/01-be-prospects-route-telegram.js" \
  "$SCRIPT_DIR/patches/02-be-telegram-generatelink-phone.js" \
  "$SCRIPT_DIR/patches/03-fe-manual-ingest-client-telegram.js" \
  "$SCRIPT_DIR/patches/04-fe-channel-page-remove-gate.js" \
  "$SCRIPT_DIR/patches/05-fe-dialog-channel-aware.js"; do
  node --check "$p"
done

node "$SCRIPT_DIR/patches/01-be-prospects-route-telegram.js"
node "$SCRIPT_DIR/patches/02-be-telegram-generatelink-phone.js"
node "$SCRIPT_DIR/patches/03-fe-manual-ingest-client-telegram.js"
node "$SCRIPT_DIR/patches/04-fe-channel-page-remove-gate.js"
node "$SCRIPT_DIR/patches/05-fe-dialog-channel-aware.js"

echo "  ok"

# ─── 4/6 Typecheck api-server ────────────────────────────────────────────

echo "[4/6] Typechecking @workspace/api-server..."

# No schema changes so `pnpm exec tsc -b lib/db` is not needed.
pnpm --filter @workspace/api-server run typecheck

echo "  ok"

# ─── 5/6 Typecheck dashboard ─────────────────────────────────────────────

echo "[5/6] Typechecking @workspace/dashboard..."

# typecheck only — Vite build needs workflow-provided env (PORT,
# BASE_PATH) and fails from bash even when code is correct (G3).
pnpm --filter @workspace/dashboard run typecheck

echo "  ok"

# ─── 6/6 Sync source-code/ ───────────────────────────────────────────────

echo "[6/6] Syncing source-code/..."

bash scripts/sync-source-code.sh

echo "  ok"

echo ""
echo "ticket-2-9-telegram-parity: apply.sh completed successfully"
echo ""
echo "Next steps (run separately):"
echo "  1. restart_workflow to pick up the BE route change and dashboard rebuild"
echo "  2. paste the workflow startup log here for verification"
echo "  3. auth-free mount probe:"
echo "       curl -sS -w '\\nHTTP %{http_code}\\n' \\"
echo "         -X POST http://localhost:80/api/prospects/manual-ingest \\"
echo "         -H 'Content-Type: application/json' -d '{\"channel\":\"telegram\"}'"
echo "       expected: HTTP 401 not_authenticated (route mounted + auth gated)"
echo "  4. visual smoke from your logged-in dashboard:"
echo "       - navigate to /followup/telegram"
echo "       - placeholder should be gone; you see the same shape as /followup/whatsapp"
echo "       - 'Manual contacts' section renders above the tabs"
echo "       - toggle on → Add contact button appears"
echo "       - click Add contact → dialog opens, says 'Telegram' in the description"
echo "       - identifier field accepts BOTH '+972547734033' AND '@yaronk' formats"
echo "       - submit with '+15555550199' → toast confirms; prospect appears"
echo "       - submit again with '@some_test_handle' → also works; second prospect appears"
echo "  5. deployment: click Redeploy in Replit; no schema migration needed"
echo "     (telegram_handle column already exists from prior work)"

exit 0
