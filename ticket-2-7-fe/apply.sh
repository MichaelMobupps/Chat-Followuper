#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# ticket-2-7-fe — Manual prospect ingest (FE) + small BE supplement
# ──────────────────────────────────────────────────────────────────────────
#
# Ships the dashboard side of manual prospect ingest (Manual Contacts
# section with Beacon Ignite toggle + Add Contact dialog) and a small
# BE supplement (GET /users/me/manual-ingest-settings) that the FE
# needs to read the toggle state on page load.
#
# Idempotent — re-running after success is cheap and lossless.
#
# Pipeline:
#   1. Pre-flight: required files exist; patch anchors present.
#   2. Copy new FE files into place.
#   3. Apply patches (BE route x1, FE wire x1).
#   4. Typecheck @workspace/api-server (BE supplement touched it).
#   5. Typecheck @workspace/dashboard (FE files added + wired).
#   6. Sync artifacts/api-server/src → source-code/ via repo script.
#
# Exits 0 on full success.
#
# No schema changes this batch, so tsc -b lib/db is NOT needed.
# No drizzle migration this batch.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

export TICKET_DIR="$SCRIPT_DIR"

# ─── 1/6 Pre-flight ───────────────────────────────────────────────────────

echo "[1/6] Pre-flight checks..."

REQUIRED_FILES=(
  "artifacts/api-server/src/routes/prospects.ts"
  "artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx"
  "artifacts/dashboard/src/lib/api.ts"
  "artifacts/dashboard/src/lib/api/sequence-config.ts"
  "scripts/sync-source-code.sh"
)

# shadcn UI primitives the new dialog imports. If absent, the dashboard
# typecheck step (5/6) would surface a "Cannot find module" error after
# the patches landed — checking here lets us halt before any state change.
REQUIRED_SHADCN=(
  "artifacts/dashboard/src/components/ui/dialog.tsx"
  "artifacts/dashboard/src/components/ui/textarea.tsx"
  "artifacts/dashboard/src/components/ui/switch.tsx"
  "artifacts/dashboard/src/components/ui/button.tsx"
  "artifacts/dashboard/src/components/ui/input.tsx"
  "artifacts/dashboard/src/components/ui/label.tsx"
)

for f in "${REQUIRED_SHADCN[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  MISSING shadcn UI component: $f" >&2
    echo "  This bundle imports it. Generate via 'npx shadcn-ui@latest add <name>' or" >&2
    echo "  remove the dependency from AddManualContactDialog.tsx / ManualContactsSection.tsx" >&2
    echo "  before retrying." >&2
    exit 1
  fi
done

for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  MISSING required file: $f" >&2
    exit 1
  fi
done

# Bundle files we'll copy into the repo
BUNDLE_FILES=(
  "$SCRIPT_DIR/files/artifacts/dashboard/src/lib/api/manual-ingest.ts"
  "$SCRIPT_DIR/files/artifacts/dashboard/src/hooks/use-manual-ingest.ts"
  "$SCRIPT_DIR/files/artifacts/dashboard/src/components/followup/ManualContactsSection.tsx"
  "$SCRIPT_DIR/files/artifacts/dashboard/src/components/followup/AddManualContactDialog.tsx"
)
for f in "${BUNDLE_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  MISSING bundle file: $f" >&2
    exit 1
  fi
done

# Anchor presence checks — each patch verifies its own anchor too, but
# failing fast here keeps the error close to the cause.
declare -a ANCHOR_FILES=(
  "artifacts/api-server/src/routes/prospects.ts"
  "artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx"
  "artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx"
)
declare -a ANCHOR_STRINGS=(
  ' * PATCH /api/users/me/manual-ingest-settings'
  'import { SequenceConfigPanel } from "./SequenceConfigPanel";'
  '      </header>'
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

# Confirm 2-7-be is deployed (its PATCH handler must exist or patch 01
# has nothing to anchor against). This is also covered by the anchor
# check above but the message is more useful when explicit.
if ! grep -qF '/users/me/manual-ingest-settings' artifacts/api-server/src/routes/prospects.ts; then
  echo "  2-7-be does NOT appear to be deployed in this workspace." >&2
  echo "  The PATCH handler at /users/me/manual-ingest-settings is missing." >&2
  echo "  Deploy 2-7-be first, then re-run this." >&2
  exit 1
fi

echo "  ok"

# ─── 2/6 Copy new FE files ────────────────────────────────────────────────

echo "[2/6] Copying new FE files..."

cp -v \
  "$SCRIPT_DIR/files/artifacts/dashboard/src/lib/api/manual-ingest.ts" \
  artifacts/dashboard/src/lib/api/manual-ingest.ts

cp -v \
  "$SCRIPT_DIR/files/artifacts/dashboard/src/hooks/use-manual-ingest.ts" \
  artifacts/dashboard/src/hooks/use-manual-ingest.ts

cp -v \
  "$SCRIPT_DIR/files/artifacts/dashboard/src/components/followup/ManualContactsSection.tsx" \
  artifacts/dashboard/src/components/followup/ManualContactsSection.tsx

cp -v \
  "$SCRIPT_DIR/files/artifacts/dashboard/src/components/followup/AddManualContactDialog.tsx" \
  artifacts/dashboard/src/components/followup/AddManualContactDialog.tsx

echo "  ok"

# ─── 3/6 Patches ──────────────────────────────────────────────────────────

echo "[3/6] Applying patches..."

# Parse-check each patch before running (Beautiful-Squidward Pass 6).
for p in \
  "$SCRIPT_DIR/patches/01-route-get-manual-ingest-settings.js" \
  "$SCRIPT_DIR/patches/02-wire-channel-followup-page.js"; do
  node --check "$p"
done

node "$SCRIPT_DIR/patches/01-route-get-manual-ingest-settings.js"
node "$SCRIPT_DIR/patches/02-wire-channel-followup-page.js"

echo "  ok"

# ─── 4/6 Typecheck api-server ────────────────────────────────────────────

echo "[4/6] Typechecking @workspace/api-server..."

# The BE supplement touched routes/prospects.ts. No schema change so
# tsc -b lib/db is not needed.
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
echo "ticket-2-7-fe: apply.sh completed successfully"
echo ""
echo "Next steps (run separately):"
echo "  1. restart_workflow to pick up the new GET endpoint and the dashboard rebuild"
echo "  2. paste the workflow startup log here for verification"
echo "  3. visual smoke from your logged-in dashboard:"
echo "       - navigate to /followup/whatsapp"
echo "       - 'Manual contacts' section should render above the tabs"
echo "       - toggle on → ignite-colored glow + Add contact button appears"
echo "       - click Add contact → dialog opens with 4 fields + collapsed context"
echo "       - submit with a fake number (+15555550199) → toast confirms"
echo "       - prospect should appear in the follow-ups table after the BE pipeline picks it up"

exit 0
