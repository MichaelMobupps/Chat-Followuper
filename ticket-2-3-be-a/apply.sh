#!/usr/bin/env bash
# Ticket 2.3-BE-A — apply.sh
#
# Idempotent. Safe to re-run after a partial apply.
#
# Steps:
#   1. Apply patch-apollo-service.mjs (BE: ApolloPersonSummary + mapPerson)
#   2. Apply patch-fe-apollo-types.mjs (FE: type mirror)
#   3. Drop integration test into artifacts/api-server/tests/
#   4. Root pnpm typecheck (refreshes lib/db composite first; this is the
#      fix learned from Ticket 2.2-BE-C — running `npx tsc --noEmit`
#      directly in api-server fails because the @workspace/db composite
#      isn't refreshed)
#   5. api-server build (so the deployed dist/ contains the new types)
#   6. dashboard typecheck (verifies FE type mirror compiles)
#   7. source-code/sync.sh (mirror artifacts/ → source-code/ for the
#      flattened view; NixOS container has no rsync — sync.sh handles this)
#
# What this script does NOT do:
#   - Restart the api-server (Replit Agent re-deploys after `pnpm` finishes)
#   - Run the integration test (operator runs it manually after deploy;
#      see docs/manual-test-2-3-be-a.md)
#
# Exit codes:
#   0  success (or fully idempotent re-run)
#   2  patch failure (anchor mismatch or filesystem error)
#   3  typecheck failure
#   4  build failure
#   5  sync failure

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket 2.3-BE-A — Apollo people-search phone-availability flags"
echo "==========================================================="
echo "Repo root:  $REPO_ROOT"
echo "Bundle dir: $BUNDLE_DIR"
echo

cd "$REPO_ROOT"

# ─────────────────────────────────────────────────────────────────
# Pre-flight: confirm the two target files exist
# ─────────────────────────────────────────────────────────────────
for f in \
  artifacts/api-server/src/services/apollo.ts \
  artifacts/dashboard/src/lib/api/apollo.ts; do
  if [[ ! -f "$f" ]]; then
    echo "[apply] [FAIL] missing target file: $f"
    echo "[apply] (cwd is $(pwd) — set REPO_ROOT env var if running from elsewhere)"
    exit 2
  fi
done
echo "[apply] [pre-flight] target files present ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Step 1: backend patch
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 1/7 — patch artifacts/api-server/src/services/apollo.ts"
node "$BUNDLE_DIR/patches/patch-apollo-service.mjs" || {
  echo "[apply] [FAIL] backend patch failed"
  exit 2
}
echo

# ─────────────────────────────────────────────────────────────────
# Step 2: frontend type mirror patch
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 2/7 — patch artifacts/dashboard/src/lib/api/apollo.ts"
node "$BUNDLE_DIR/patches/patch-fe-apollo-types.mjs" || {
  echo "[apply] [FAIL] frontend type mirror patch failed"
  exit 2
}
echo

# ─────────────────────────────────────────────────────────────────
# Step 3: drop the integration test into the api-server tests dir
# ─────────────────────────────────────────────────────────────────
TEST_DEST="artifacts/api-server/tests/integration-2-3-be-a-people-flags.mjs"
echo "[apply] step 3/7 — copy integration test → $TEST_DEST"
mkdir -p "$(dirname "$TEST_DEST")"
cp "$BUNDLE_DIR/tests/integration-2-3-be-a-people-flags.mjs" "$TEST_DEST"
echo "[apply] copied ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Step 4: root typecheck (refreshes lib/db composite first)
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 4/7 — root pnpm run typecheck"
echo "[apply]   (refreshes @workspace/db composite before api-server check)"
pnpm run typecheck || {
  echo "[apply] [FAIL] typecheck failed — see TS errors above"
  exit 3
}
echo "[apply] typecheck PASS ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Step 5: api-server build (so deployed dist/ has the new types)
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 5/7 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || {
  echo "[apply] [FAIL] api-server build failed"
  exit 4
}
echo "[apply] build PASS ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Step 6: dashboard typecheck (FE type mirror parity)
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 6/7 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[apply] [FAIL] dashboard typecheck failed (FE type mirror out of sync)"
  exit 3
}
echo "[apply] dashboard typecheck PASS ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Step 7: source-code mirror sync
# ─────────────────────────────────────────────────────────────────
if [[ -x source-code/sync.sh ]]; then
  echo "[apply] step 7/7 — source-code/sync.sh"
  bash source-code/sync.sh || {
    echo "[apply] [WARN] source-code sync failed; api-server is already built"
    echo "[apply]        and the deployed runtime will work. Run sync manually"
    echo "[apply]        when convenient."
    # Non-fatal: the runtime doesn't need source-code/ to function.
  }
  echo
else
  echo "[apply] step 7/7 — source-code/sync.sh not present, skipping"
  echo
fi

echo "==========================================================="
echo "[apply] DONE — Ticket 2.3-BE-A applied successfully"
echo "==========================================================="
echo
echo "Next steps for the operator:"
echo "  1. Republish the Replit deployment (Replit Agent or manual)."
echo "  2. After republish completes, run the integration test:"
echo "     cd $REPO_ROOT"
echo "     BASE_URL=https://chat-followuper.replit.app \\"
echo "       node artifacts/api-server/tests/integration-2-3-be-a-people-flags.mjs"
echo "  3. Or run against localhost first (see docs/manual-test-2-3-be-a.md)."
echo
echo "Evidence to capture in Pushover/notes:"
echo "  - patch-apollo-service.mjs: APPLY ApolloPersonSummary + mapPerson"
echo "  - patch-fe-apollo-types.mjs: APPLY"
echo "  - typecheck: PASS at root + dashboard"
echo "  - integration test: 14/14 PASS expected on first live run"
