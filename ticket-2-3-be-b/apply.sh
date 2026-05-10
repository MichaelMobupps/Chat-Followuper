#!/usr/bin/env bash
# Ticket 2.3-BE-B — apply.sh
#
# Applies 5 code patches + typecheck + build. Does NOT auto-mutate the
# DB. The schema change (drop NOT NULL on prospects.phone) requires a
# separate manual `pnpm --filter @workspace/db push` step — see the
# operator instructions at the end of this script and in README.md.
#
# Steps:
#   1. Apply patch 1: schema TS file (lib/db/src/schema/prospects.ts)
#   2. Apply patch 2: routes/prospects.ts validation
#   3. Apply patch 3: services/apollo.ts webhook arrival promotion
#   4. Apply patch 4: routes/whatsappLink.ts null-phone guard
#   5. Apply patch 5: dashboard FE prospects type mirror
#   6. Copy integration test
#   7. Root pnpm typecheck (refreshes lib/db composite first)
#   8. api-server build
#   9. dashboard typecheck
#  10. source-code mirror sync (best-effort, non-fatal)
#
# Exit codes:
#   0  success
#   2  patch failure (anchor mismatch or filesystem error)
#   3  typecheck failure
#   4  build failure
#
# Idempotent. Safe to re-run after a partial apply.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket 2.3-BE-B — pending-reveal prospects (phone nullable)"
echo "==========================================================="
echo "Repo root:  $REPO_ROOT"
echo "Bundle dir: $BUNDLE_DIR"
echo

cd "$REPO_ROOT"

# ─────────────────────────────────────────────────────────────────
# Pre-flight: target files
# ─────────────────────────────────────────────────────────────────
for f in \
  lib/db/src/schema/prospects.ts \
  artifacts/api-server/src/routes/prospects.ts \
  artifacts/api-server/src/services/apollo.ts \
  artifacts/api-server/src/routes/whatsappLink.ts \
  artifacts/dashboard/src/lib/api/prospects.ts; do
  if [[ ! -f "$f" ]]; then
    echo "[apply] [FAIL] missing target file: $f"
    exit 2
  fi
done
echo "[apply] [pre-flight] all 5 target files present ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Patches 1–5
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 1/10 — patch lib/db/src/schema/prospects.ts (drop NOT NULL on phone)"
node "$BUNDLE_DIR/patches/patch-1-schema-phone-nullable.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/10 — patch routes/prospects.ts (validation relaxation)"
node "$BUNDLE_DIR/patches/patch-2-prospects-route.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/10 — patch services/apollo.ts (webhook arrival promotion)"
node "$BUNDLE_DIR/patches/patch-3-apollo-webhook-promote.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 4/10 — patch routes/whatsappLink.ts (null-phone guard)"
node "$BUNDLE_DIR/patches/patch-4-whatsapp-link-null-phone.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 5/10 — patch dashboard/src/lib/api/prospects.ts (FE type mirror)"
node "$BUNDLE_DIR/patches/patch-5-fe-types.mjs" || { echo "[FAIL]"; exit 2; }
echo

# ─────────────────────────────────────────────────────────────────
# Copy integration test
# ─────────────────────────────────────────────────────────────────
TEST_DEST="artifacts/api-server/tests/integration-2-3-be-b-pending-prospect.mjs"
echo "[apply] step 6/10 — copy integration test → $TEST_DEST"
mkdir -p "$(dirname "$TEST_DEST")"
cp "$BUNDLE_DIR/tests/integration-2-3-be-b-pending-prospect.mjs" "$TEST_DEST"
echo "[apply] copied ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Typecheck + build
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 7/10 — root pnpm run typecheck (refreshes lib/db composite first)"
pnpm run typecheck || {
  echo "[apply] [FAIL] typecheck failed — see TS errors above"
  exit 3
}
echo "[apply] root typecheck PASS ✓"
echo

echo "[apply] step 8/10 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || {
  echo "[apply] [FAIL] api-server build failed"
  exit 4
}
echo "[apply] api-server build PASS ✓"
echo

echo "[apply] step 9/10 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[apply] [FAIL] dashboard typecheck failed"
  exit 3
}
echo "[apply] dashboard typecheck PASS ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Source-code mirror sync (best-effort)
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 10/10 — source-code mirror sync"
if [[ -x source-code/sync.sh ]]; then
  bash source-code/sync.sh || echo "[apply] [WARN] sync.sh failed (non-fatal)"
elif [[ -x scripts/sync-source-code.sh ]]; then
  bash scripts/sync-source-code.sh || echo "[apply] [WARN] sync-source-code.sh failed (non-fatal)"
else
  echo "[apply] no sync script found — skipping mirror"
fi
echo

echo "==========================================================="
echo "[apply] CODE PATCHES DONE — Ticket 2.3-BE-B"
echo "==========================================================="
echo
echo "REQUIRED MANUAL STEPS — apply.sh stops here on purpose."
echo "The schema migration is destructive and needs operator confirmation."
echo
echo "─── For LOCALHOST / workspace dev DB ─────────────────────────────"
echo "  1. Apply schema migration (drops NOT NULL on prospects.phone):"
echo "       cd $REPO_ROOT && pnpm --filter @workspace/db push"
echo
echo "  2. Restart the api-server workflow (so the running process picks"
echo "     up the new dist). Defect #7 reminder: code in dist alone is"
echo "     not enough, the process must reload."
echo
echo "  3. Run the integration test against localhost:"
echo "       cd $REPO_ROOT && \\"
echo "         BASE_URL=http://localhost:80 \\"
echo "         node artifacts/api-server/tests/integration-2-3-be-b-pending-prospect.mjs"
echo
echo "     Expected: Results: 12 pass / 0 fail (or fewer if T6 geo-blocks US)"
echo
echo "─── For PRODUCTION ───────────────────────────────────────────────"
echo "  1. Republish the Replit deployment (so the new code is live)."
echo
echo "  2. Apply schema migration to PROD DB. Two ways:"
echo "       a) From Replit's Deployment shell, run:"
echo "            pnpm --filter @workspace/db push"
echo "          (this uses the deployed env's DATABASE_URL automatically)"
echo "       b) Or from workspace shell with prod URL temporarily set:"
echo "            DATABASE_URL=\"\$PROD_DATABASE_URL\" pnpm --filter @workspace/db push"
echo
echo "  3. Verify the migration:"
echo "       psql \"\$PROD_DATABASE_URL\" -c \"\\d prospects\" | grep phone"
echo "     The 'phone' column should NOT have 'not null' next to it."
echo
echo "REVERSAL (if needed)"
echo "  ALTER TABLE prospects ALTER COLUMN phone SET NOT NULL;"
echo "  (only safe if no NULL phones exist — check first with:"
echo "    SELECT count(*) FROM prospects WHERE phone IS NULL;)"
