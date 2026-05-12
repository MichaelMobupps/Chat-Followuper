#!/usr/bin/env bash
# Ticket 2.5-FE — WhatsApp follow-up page
#
# WHAT THIS TICKET DOES
#   1. Adds two new API client modules:
#        artifacts/dashboard/src/lib/api/followups.ts
#        artifacts/dashboard/src/lib/api/sequence-config.ts
#   2. Adds two new tanstack-query hook modules:
#        artifacts/dashboard/src/hooks/use-followups.ts
#        artifacts/dashboard/src/hooks/use-sequence-config.ts
#   3. Adds five components under artifacts/dashboard/src/components/followup/:
#        ChannelFollowupPage.tsx   — generic page (channel prop)
#        StatusBadge.tsx           — colored badge per uiStatus
#        EditFollowupDialog.tsx    — body / scheduledAt / status edit
#        BulkToolbar.tsx           — pause / resume / archive (selected | filter)
#        SequenceConfigPanel.tsx   — side sheet for /api/users/me/sequence-config
#   4. Replaces artifacts/dashboard/src/pages/followup/whatsapp.tsx scaffold
#      with a thin wrapper rendering <ChannelFollowupPage channel="whatsapp" />.
#
# WHAT THIS TICKET DOES *NOT* DO (out of scope, separate tickets)
#   - Telegram / Teams / Slack follow-up pages. The generic component is
#     ready; ticket-2-6-fe will be a near-identical wrapper passing
#     channel="telegram", once ticket-2-6-be wires the Telegram send path.
#   - OpenAPI spec / api-client-react codegen updates. The new endpoints
#     are consumed via hand-written wrappers, matching the existing
#     @/lib/api/<resource>.ts pattern. If a future ticket adds the
#     endpoints to lib/api-spec/openapi.yaml, the hooks here can be
#     swapped to the generated versions.
#   - Variant-aware critic. doctrineVariant is selectable in the side
#     panel and stored on the user row, but the LLM generator does not
#     yet consume it (handoff §5.6).
#
# CONVENTIONS PRESERVED
#   - scripts/sync-source-code.sh  (NOT source-code/sync.sh — that's the Doctrine repo)
#   - localhost:80                 (NOT :3000 — Replit workflow proxy)
#   - Skip @workspace/db build     (no build script there)
#   - No --name passed to a pnpm-wrapped drizzle-kit (no migration here anyway)
#   - Verify with `typecheck`, NOT `build`. Per pnpm-workspace skill:
#     `build` needs workflow-provided PORT and BASE_PATH and fails from
#     bash even when the code is correct. Vite HMR picks up the changes
#     once the dashboard workflow restarts.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket 2.5-FE — WhatsApp follow-up page"
echo "==========================================================="
echo
echo "[apply] repo root: $REPO_ROOT"
echo "[apply] bundle dir: $BUNDLE_DIR"
echo

cd "$REPO_ROOT"

# ── Pre-flight ─────────────────────────────────────────────────────
echo "[apply] pre-flight"

REQUIRED_FILES=(
  "artifacts/dashboard/src/App.tsx"
  "artifacts/dashboard/src/components/layout.tsx"
  "artifacts/dashboard/src/pages/followup/whatsapp.tsx"
  "artifacts/dashboard/package.json"
)
for f in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "[FAIL] pre-flight: missing expected file: $f"
    echo "       (are we in the chat-followuper repo root?)"
    exit 2
  fi
done

REQUIRED_DIRS=(
  "artifacts/dashboard/src/lib/api"
  "artifacts/dashboard/src/hooks"
  "artifacts/dashboard/src/components/ui"
)
for d in "${REQUIRED_DIRS[@]}"; do
  if [[ ! -d "$d" ]]; then
    echo "[FAIL] pre-flight: missing expected dir: $d"
    exit 2
  fi
done

# Spot-check shadcn primitives the new components import.
SHADCN_PRIMITIVES=(
  "alert-dialog.tsx"
  "badge.tsx"
  "button.tsx"
  "card.tsx"
  "checkbox.tsx"
  "dialog.tsx"
  "input.tsx"
  "label.tsx"
  "select.tsx"
  "sheet.tsx"
  "skeleton.tsx"
  "switch.tsx"
  "table.tsx"
  "tabs.tsx"
  "textarea.tsx"
)
for p in "${SHADCN_PRIMITIVES[@]}"; do
  if [[ ! -f "artifacts/dashboard/src/components/ui/$p" ]]; then
    echo "[FAIL] pre-flight: missing shadcn primitive: components/ui/$p"
    exit 2
  fi
done

echo "  ok"
echo

# ── Step 1: ensure the new components dir exists ──────────────────
echo "[apply] step 1/4 — ensure components/followup/ exists"
mkdir -p artifacts/dashboard/src/components/followup
echo "  ok"
echo

# ── Step 2: copy new files (and replace the scaffold) ─────────────
echo "[apply] step 2/4 — copy files into place"

NEW_FILES=(
  "artifacts/dashboard/src/lib/api/followups.ts"
  "artifacts/dashboard/src/lib/api/sequence-config.ts"
  "artifacts/dashboard/src/hooks/use-followups.ts"
  "artifacts/dashboard/src/hooks/use-sequence-config.ts"
  "artifacts/dashboard/src/components/followup/StatusBadge.tsx"
  "artifacts/dashboard/src/components/followup/EditFollowupDialog.tsx"
  "artifacts/dashboard/src/components/followup/BulkToolbar.tsx"
  "artifacts/dashboard/src/components/followup/SequenceConfigPanel.tsx"
  "artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx"
  "artifacts/dashboard/src/pages/followup/whatsapp.tsx"
)

for f in "${NEW_FILES[@]}"; do
  src="$BUNDLE_DIR/files/$f"
  if [[ ! -f "$src" ]]; then
    echo "[FAIL] bundle is missing source file: $src"
    exit 2
  fi
  mkdir -p "$(dirname "$f")"
  cp "$src" "$f"
  echo "  + $f"
done
echo

# ── Step 3: typecheck the dashboard ───────────────────────────────
# Verification command per pnpm-workspace skill. `build` is NOT used
# here because vite.config.ts reads PORT from the workflow env and
# fails when invoked from bash. Vite HMR will pick up new files when
# the dashboard workflow is restarted.
echo "[apply] step 3/4 — typecheck @workspace/dashboard"
pnpm --filter @workspace/dashboard run typecheck
echo

# ── Step 4: mirror sync ───────────────────────────────────────────
echo "[apply] step 4/4 — mirror sync to source-code/"
if [[ -f "scripts/sync-source-code.sh" ]]; then
  bash scripts/sync-source-code.sh
else
  echo "  (scripts/sync-source-code.sh not found — skipping)"
fi
echo

# ── Optional smoke tests against the running api-server ───────────
echo "[apply] smoke tests (best-effort; require running api-server)"
if command -v curl >/dev/null 2>&1; then
  echo "  GET http://localhost:80/api/followups?channel=whatsapp (no auth) → expect 401"
  curl -sS -o /dev/null -w "  HTTP %{http_code}\n" \
    "http://localhost:80/api/followups?channel=whatsapp" 2>/dev/null || \
    echo "  (api-server not reachable from apply.sh — that's fine; restart it from the Agent)"
  echo "  GET http://localhost:80/api/users/me/sequence-config (no auth) → expect 401"
  curl -sS -o /dev/null -w "  HTTP %{http_code}\n" \
    "http://localhost:80/api/users/me/sequence-config" 2>/dev/null || true
fi
echo

echo "==========================================================="
echo "[apply] DONE"
echo "==========================================================="
echo
echo "Files now in place:"
echo "  + lib/api/followups.ts             (7 endpoint wrappers)"
echo "  + lib/api/sequence-config.ts       (GET + PATCH)"
echo "  + hooks/use-followups.ts           (1 query + 6 mutation hooks)"
echo "  + hooks/use-sequence-config.ts     (1 query + 1 mutation hook)"
echo "  + components/followup/             (5 components)"
echo "  ~ pages/followup/whatsapp.tsx      (scaffold replaced)"
echo
echo "Next steps for the Agent:"
echo "  1. Restart the dashboard workflow (Vite picks up the new files)."
echo "  2. Open /followup/whatsapp in the in-workspace preview."
echo "  3. Confirm: tabs render, table renders (or empty-state if no data),"
echo "     'Sequence config' button opens the side sheet, 'Refresh' works."
echo "  4. With at least one test prospect + scheduled follow-up, click"
echo "     'Send next' on a row → a wa.me link should open in a new tab."
echo
echo "Next ticket: ticket-2-6-be (Telegram send mechanism), then"
echo "ticket-2-6-fe (thin wrapper over ChannelFollowupPage with"
echo "channel=\"telegram\")."
