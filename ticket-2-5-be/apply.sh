#!/usr/bin/env bash
# Ticket 2.5-BE — follow-up management backend
#
# WHAT THIS TICKET DOES
#   1. Extends users.stage_timing jsonb to carry per-stage doctrineVariant
#      (Option B; chosen explicitly). Drizzle migration auto-generated at
#      apply time from the schema TS change.
#   2. Adds two new ACTION_TYPES (followup.edited, sequence_config.updated).
#   3. Creates routes/followups.ts with 4 endpoints (list channel-
#      parameterized, send-next-followup, edit, bulk-archive).
#   4. Creates routes/sequenceConfig.ts with 2 endpoints (read + patch).
#   5. Extends routes/prospects.ts with 3 endpoints (mark-replied, archive,
#      bulk pause).
#   6. Registers the two new routers in routes/index.ts.
#
# WHAT THIS TICKET DOES *NOT* DO (out of scope, separate tickets)
#   - Frontend (ticket 2.5-FE) — page implementation comes next.
#   - Variant-aware message generation. doctrineVariant is stored, validated,
#     read/written, but the critic prompt still uses its hard-coded
#     per-stage rotation. Wiring variants into the LLM pipeline is its
#     own ticket.
#   - Telegram/Teams/Slack send mechanisms. The list/edit/bulk routes are
#     channel-agnostic and accept those channels; send-next-followup
#     returns 501 channel_send_not_implemented for non-WhatsApp until
#     each channel's ticket lands.
#
# CONVENTIONS PRESERVED
#   - Beautiful-Squidward audit (see audit.sh)
#   - $ADDON_API_KEY env var for smoke tests
#   - source-code/sync.sh for mirror sync (no rsync; NixOS container)
#   - @workspace/db has no build step
#   - Verbatim Replit Agent prompt + restart_workflow flow after this script

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket 2.5-BE — follow-up management backend"
echo "==========================================================="
echo

cd "$REPO_ROOT"

# ── Pre-flight ────────────────────────────────────────────────────
TARGETS=(
  "lib/db/src/schema/users.ts"
  "lib/db/src/schema/action_logs.ts"
  "artifacts/api-server/src/routes/prospects.ts"
  "artifacts/api-server/src/routes/index.ts"
  "lib/db/drizzle.config.ts"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then
    echo "[FAIL] missing target: $t"
    exit 2
  fi
done
echo "[apply] [pre-flight] expected targets present"
echo

# ── Step 1: replace schema files ──────────────────────────────────
echo "[apply] step 1/7 — replace lib/db/src/schema/users.ts"
cp "$BUNDLE_DIR/files/lib/db/src/schema/users.ts" lib/db/src/schema/users.ts
echo "  done"

echo "[apply] step 2/7 — replace lib/db/src/schema/action_logs.ts"
cp "$BUNDLE_DIR/files/lib/db/src/schema/action_logs.ts" lib/db/src/schema/action_logs.ts
echo "  done"

# ── Step 2: drop in new route files ───────────────────────────────
echo "[apply] step 3/7 — create artifacts/api-server/src/routes/followups.ts"
cp "$BUNDLE_DIR/files/artifacts/api-server/src/routes/followups.ts" artifacts/api-server/src/routes/followups.ts
echo "  done"

echo "[apply] step 4/7 — create artifacts/api-server/src/routes/sequenceConfig.ts"
cp "$BUNDLE_DIR/files/artifacts/api-server/src/routes/sequenceConfig.ts" artifacts/api-server/src/routes/sequenceConfig.ts
echo "  done"

# ── Step 3: patch existing routes ─────────────────────────────────
echo "[apply] step 5/7 — patch artifacts/api-server/src/routes/prospects.ts"
node "$BUNDLE_DIR/patches/patch-prospects-additions.js" || { echo "[FAIL]"; exit 2; }

echo "[apply] step 6/7 — patch artifacts/api-server/src/routes/index.ts"
node "$BUNDLE_DIR/patches/patch-routes-index.js" || { echo "[FAIL]"; exit 2; }

# ── Step 4: generate + apply the Drizzle migration ────────────────
echo "[apply] step 7/7 — drizzle migration (generate + apply)"
echo "  generating migration from schema change…"
# drizzle-kit generate auto-infers the SQL diff from the schema TS files.
# Use the project's defined script. --name flag is passed through.
pnpm --filter @workspace/db run generate -- --name extend_stage_timing_with_doctrine_variant
echo
echo "  applying pending migrations…"
pnpm --filter @workspace/db run migrate
echo

# ── Build + typecheck ─────────────────────────────────────────────
echo "[apply] build & typecheck (excluding @workspace/db per project convention)"
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/dashboard run build || echo "  (dashboard build is best-effort here — no FE changes in this ticket)"
pnpm run typecheck
echo

# ── Mirror sync to source-code/ ───────────────────────────────────
if [[ -f "source-code/sync.sh" ]]; then
  echo "[apply] mirror sync via source-code/sync.sh"
  bash source-code/sync.sh
  echo
fi

# ── Smoke tests ───────────────────────────────────────────────────
if [[ -n "${ADDON_API_KEY:-}" ]]; then
  echo "[apply] smoke tests — requireAuth means we expect 401 without a session cookie"
  echo "  GET /api/followups?channel=whatsapp (no auth) → expect 401"
  curl -sS -o /dev/null -w "  HTTP %{http_code}\n" \
    -H "X-API-Key: $ADDON_API_KEY" \
    "http://localhost:3000/api/followups?channel=whatsapp" || true
  echo "  GET /api/users/me/sequence-config (no auth) → expect 401"
  curl -sS -o /dev/null -w "  HTTP %{http_code}\n" \
    -H "X-API-Key: $ADDON_API_KEY" \
    "http://localhost:3000/api/users/me/sequence-config" || true
  echo
else
  echo "[apply] (skipping curl smoke — \$ADDON_API_KEY not set)"
  echo
fi

echo "==========================================================="
echo "[apply] DONE"
echo "==========================================================="
echo
echo "Files now in place:"
echo "  - lib/db/src/schema/users.ts (extended StageTiming + DOCTRINE_VARIANTS)"
echo "  - lib/db/src/schema/action_logs.ts (+2 new ACTION_TYPES)"
echo "  - lib/db/drizzle/000X_extend_stage_timing_with_doctrine_variant.sql (generated)"
echo "  - artifacts/api-server/src/routes/followups.ts (4 endpoints)"
echo "  - artifacts/api-server/src/routes/sequenceConfig.ts (2 endpoints)"
echo "  - artifacts/api-server/src/routes/prospects.ts (+3 endpoints)"
echo "  - artifacts/api-server/src/routes/index.ts (registered 2 new routers)"
echo
echo "Next: restart the api-server workflow, then verify the 9 new endpoints"
echo "respond (auth-protected, so curl without a session → 401)."
echo
echo "Sequel: ticket-2-5-fe will build the WhatsApp follow-up page against"
echo "these endpoints. The other follow-up channel pages (Telegram in 2.6,"
echo "Teams + Slack later) consume the same endpoints with a different"
echo "channel query param."
