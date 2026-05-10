#!/usr/bin/env bash
# Ticket prospect-dedupe-apollo-person v2 — anchor without em-dash.
# Single edit in routes/prospects.ts. Idempotent. BE only.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/api-server/src/routes/prospects.ts

echo "==========================================================="
echo "Ticket prospect-dedupe-apollo-person v2"
echo "  Reject createProspect when (userId, apolloPersonId) exists"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then
  echo "[FAIL] missing target: $TARGET"
  exit 2
fi
echo "[apply] [pre-flight] target present ✓"
echo

echo "[apply] step 1/3 — patch routes/prospects.ts (apolloPersonId pre-check)"
node "$BUNDLE_DIR/patches/patch-dedupe.mjs" || {
  EXIT=$?
  echo
  echo "[FAIL] patch exit=$EXIT"
  if [[ "$EXIT" == "3" ]]; then
    echo
    echo "[diagnostic] anchor still not matching. Run this and send back:"
    echo
    echo '  grep -n "Use onConflictDoNothing" '"$TARGET"
    echo '  grep -n "23505" '"$TARGET"
    echo
    echo "If those return nothing, the comment text has drifted further"
    echo "than expected. If they return a line, paste the line back via"
    echo "  sed -n '"'"'<LINE>p'"'"' '"$TARGET"' | od -c | head -3"
    echo "and I will rebuild the patch with byte-exact anchoring."
  fi
  exit 2
}
echo

echo "[apply] step 2/3 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || {
  echo "[FAIL] api-server build failed"
  echo "[hint] common cause: missing 'eq' or 'and' import from drizzle-orm"
  echo "       check imports in artifacts/api-server/src/routes/prospects.ts"
  echo "       expected: import { and, eq, ... } from 'drizzle-orm';"
  exit 3
}
echo "[apply] api-server build PASS ✓"
echo

echo "[apply] step 3/3 — source-code mirror sync"
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
echo "REQUIRED — restart api-server workflow."
echo "  Replit Workflows → Backend Server → Stop → Start"
echo
echo "Verify:"
echo "  1. /prospects → manually delete two of the three Arushi rows"
echo "     (keep the most-recent: country=IN, channel=WhatsApp)"
echo "  2. /prospect/whatsapp → discover Swiggy → try to reveal+save"
echo "     Arushi again"
echo "  3. Reveal will fire (8c spent, known caveat)"
echo "  4. createProspect returns 409 duplicate_apollo_person"
echo "  5. BulkResults shows her in Failed bucket with the code"
echo "  6. /prospects still shows ONE Arushi (no new row)"
