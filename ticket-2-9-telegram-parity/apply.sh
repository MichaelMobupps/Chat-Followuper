#!/usr/bin/env bash
# ticket-2-9-telegram-parity rescue build
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
export TICKET_DIR="$SCRIPT_DIR"

echo "[1/6] Pre-flight checks..."

REQUIRED_FILES=(
  "artifacts/api-server/src/routes/prospects.ts"
  "artifacts/api-server/src/routes/followups.ts"
  "artifacts/api-server/src/services/channels/telegram.ts"
  "artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx"
  "artifacts/dashboard/src/components/followup/AddManualContactDialog.tsx"
  "artifacts/dashboard/src/components/followup/ManualContactsSection.tsx"
  "artifacts/dashboard/src/lib/api/manual-ingest.ts"
  "artifacts/dashboard/src/pages/followup/whatsapp.tsx"
  "scripts/sync-source-code.sh"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  MISSING required file: $f" >&2
    exit 1
  fi
done

if ! grep -qF '/users/me/manual-ingest-settings' artifacts/api-server/src/routes/prospects.ts; then
  echo "  2-7-be does NOT appear to be deployed (missing manual-ingest-settings route)" >&2
  exit 1
fi
if ! grep -qF 'POST /api/prospects/manual-ingest' artifacts/api-server/src/routes/prospects.ts; then
  echo "  2-7-be does NOT appear to be deployed (missing manual-ingest route)" >&2
  exit 1
fi
if ! grep -qF 'ManualContactsSection' artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx; then
  echo "  2-7-fe does NOT appear to be deployed (no ManualContactsSection import/render in ChannelFollowupPage)" >&2
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/files/artifacts/dashboard/src/pages/followup/telegram.tsx" ]; then
  echo "  MISSING bundle file: files/artifacts/dashboard/src/pages/followup/telegram.tsx" >&2
  exit 1
fi

echo "  ok"

echo "[2/6] Copying Telegram FE wrapper..."
mkdir -p artifacts/dashboard/src/pages/followup
cp -v "$SCRIPT_DIR/files/artifacts/dashboard/src/pages/followup/telegram.tsx" \
  artifacts/dashboard/src/pages/followup/telegram.tsx

echo "  ok"

echo "[3/6] Applying rescue-safe patches..."
for p in \
  "$SCRIPT_DIR/patches/01-be-prospects-route-telegram.js" \
  "$SCRIPT_DIR/patches/02-be-telegram-generatelink-phone.js" \
  "$SCRIPT_DIR/patches/03-be-followups-telegram-phone-fallback.js" \
  "$SCRIPT_DIR/patches/04-fe-manual-ingest-client-telegram.js" \
  "$SCRIPT_DIR/patches/05-fe-channel-page-manual-section-guard.js" \
  "$SCRIPT_DIR/patches/06-fe-dialog-channel-aware.js" \
  "$SCRIPT_DIR/patches/07-fe-manual-section-channel-copy.js" \
  "$SCRIPT_DIR/patches/08-fe-channel-page-telegram-error-copy.js"; do
  node --check "$p"
done

node "$SCRIPT_DIR/patches/01-be-prospects-route-telegram.js"
node "$SCRIPT_DIR/patches/02-be-telegram-generatelink-phone.js"
node "$SCRIPT_DIR/patches/03-be-followups-telegram-phone-fallback.js"
node "$SCRIPT_DIR/patches/04-fe-manual-ingest-client-telegram.js"
node "$SCRIPT_DIR/patches/05-fe-channel-page-manual-section-guard.js"
node "$SCRIPT_DIR/patches/06-fe-dialog-channel-aware.js"
node "$SCRIPT_DIR/patches/07-fe-manual-section-channel-copy.js"
node "$SCRIPT_DIR/patches/08-fe-channel-page-telegram-error-copy.js"

echo "  ok"

echo "[4/6] Typechecking @workspace/api-server..."
pnpm --filter @workspace/api-server run typecheck

echo "  ok"

echo "[5/6] Typechecking @workspace/dashboard..."
pnpm --filter @workspace/dashboard run typecheck

echo "  ok"

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
echo "       curl -sS -w '\\nHTTP %{http_code}\\n' \\\" 
echo "         -X POST http://localhost:80/api/prospects/manual-ingest \\\" 
echo "         -H 'Content-Type: application/json' -d '{\"channel\":\"telegram\"}'"
echo "       expected: HTTP 401 not_authenticated (route mounted + auth gated)"
echo "  4. visual smoke from your logged-in dashboard:"
echo "       - navigate to /followup/telegram"
echo "       - placeholder should be gone; Manual contacts renders above the tabs"
echo "       - toggle on -> Add contact button appears"
echo "       - Add contact dialog says Telegram and accepts +E.164 or @handle"
echo "       - Submit one test contact, then verify it appears in the Telegram queue"
echo "  5. deployment: click Redeploy in Replit; no schema migration needed"
exit 0
