#!/usr/bin/env bash
# Ticket 2.3-BE-A HOTFIX — apply.sh
#
# Replaces ONLY the integration test file with the corrected version.
# Source code patches from the original 2.3-BE-A apply.sh are unchanged
# and remain in production; do NOT re-run the original apply.sh.
#
# What this fixes:
#   - mintSessionCookie now mirrors the deployed verifier
#     (base64url(JSON.stringify({userId, email, exp})) + base64url(HMAC sig)).
#   - Email-pattern + DB helpers match the working 2.2-BE-C convention.
#
# Idempotency: the destination file is fully replaced. Re-running this
# script is safe — it just rewrites the same bytes.
#
# Steps:
#   1. Pre-flight: confirm target test directory exists.
#   2. Overwrite artifacts/api-server/tests/integration-2-3-be-a-people-flags.mjs.
#   3. Confirm new file passes node --check.
#
# Exit codes:
#   0  success
#   2  pre-flight failure (target dir missing — should never happen if 2.3-BE-A
#      was applied)
#   3  syntax check failure on the new file (should never happen if the
#      bundle wasn't tampered with mid-transit)
#
# Does NOT:
#   - Touch any source files (apollo.ts on BE or FE — already correct).
#   - Run typecheck / build (test files don't ship in the runtime bundle).
#   - Sync source-code/ (test changes don't need to mirror).
#   - Restart or republish the deployment (production code is unchanged).

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DEST_REL="artifacts/api-server/tests/integration-2-3-be-a-people-flags.mjs"
TEST_DEST_ABS="$REPO_ROOT/$TEST_DEST_REL"
TEST_SRC="$BUNDLE_DIR/tests/integration-2-3-be-a-people-flags.mjs"

echo "==========================================================="
echo "Ticket 2.3-BE-A HOTFIX — corrected mintSessionCookie helper"
echo "==========================================================="
echo "Repo root:  $REPO_ROOT"
echo "Bundle dir: $BUNDLE_DIR"
echo "Target:     $TEST_DEST_REL"
echo

cd "$REPO_ROOT"

# ─────────────────────────────────────────────────────────────────
# Step 1: pre-flight
# ─────────────────────────────────────────────────────────────────
TEST_DEST_DIR="$(dirname "$TEST_DEST_ABS")"
if [[ ! -d "$TEST_DEST_DIR" ]]; then
  echo "[hotfix] [FAIL] target directory missing: $TEST_DEST_DIR"
  echo "[hotfix] (This should never happen if 2.3-BE-A apply.sh ran successfully."
  echo "[hotfix]  The apply.sh creates this dir and copies the test in.)"
  exit 2
fi
if [[ ! -f "$TEST_SRC" ]]; then
  echo "[hotfix] [FAIL] bundle test source missing: $TEST_SRC"
  exit 2
fi
echo "[hotfix] [pre-flight] target dir exists ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Step 2: replace test file
# ─────────────────────────────────────────────────────────────────
echo "[hotfix] step 1/2 — replace integration test"
cp "$TEST_SRC" "$TEST_DEST_ABS"
echo "[hotfix] copied ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Step 3: syntax check on the new file
# ─────────────────────────────────────────────────────────────────
echo "[hotfix] step 2/2 — node --check on replaced file"
node --check "$TEST_DEST_ABS" || {
  echo "[hotfix] [FAIL] node --check failed on $TEST_DEST_ABS"
  exit 3
}
echo "[hotfix] syntax check PASS ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Evidence
# ─────────────────────────────────────────────────────────────────
echo "[hotfix] [evidence]"
echo "  mintSessionCookie present:    $(grep -c 'function mintSessionCookie' "$TEST_DEST_ABS")"
echo "  base64UrlEncode present:      $(grep -c 'function base64UrlEncode' "$TEST_DEST_ABS")"
echo "  signSession (old) absent:     $(grep -c 'function signSession' "$TEST_DEST_ABS")"
echo "  payload {userId, email, exp}: $(grep -c 'JSON.stringify({ userId, email, exp })' "$TEST_DEST_ABS")"
echo "  HMAC over payloadB64:         $(grep -c '.update(payloadB64)' "$TEST_DEST_ABS")"
echo

echo "==========================================================="
echo "[hotfix] DONE — corrected test file in place"
echo "==========================================================="
echo
echo "Next steps for the operator:"
echo
echo "  1. Run the test against localhost first (fast feedback, no prod hit):"
echo
echo "     cd $REPO_ROOT && \\"
echo "       BASE_URL=http://localhost:80 \\"
echo "       node $TEST_DEST_REL"
echo
echo "  2. If localhost shows '14 pass / 0 fail', run against production:"
echo
echo "     cd $REPO_ROOT && \\"
echo "       BASE_URL=https://chat-followuper.replit.app \\"
echo "       node $TEST_DEST_REL"
echo
echo "  3. NO REPUBLISH NEEDED — production code from the original 2.3-BE-A"
echo "     apply.sh is unchanged and already correct. This hotfix only"
echo "     touches the test runner."
