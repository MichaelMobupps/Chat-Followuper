#!/usr/bin/env bash
# Ticket prospect-dedupe-apollo-person — prevent duplicate prospect rows
# for the same (userId, apolloPersonId). Single edit in routes/prospects.ts.
# Idempotent. BE only — api-server build + restart required.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/api-server/src/routes/prospects.ts

echo "==========================================================="
echo "Ticket prospect-dedupe-apollo-person"
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
node "$BUNDLE_DIR/patches/patch-dedupe.mjs" || { echo "[FAIL]"; exit 2; }
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
echo "  1. Refresh /prospects"
echo "  2. Manually delete two of the three Arushi rows (open detail"
echo "     page → delete button — keep the most-recent one with"
echo "     country=IN and channel=WhatsApp)"
echo "  3. Now go to /prospect/whatsapp, run discover for Swiggy again,"
echo "     try to reveal & save Arushi again"
echo "  4. The reveal will fire (8c spent — see ticket caveat below)"
echo "  5. The createProspect will return 409 duplicate_apollo_person"
echo "  6. BulkResults will show her in the Failed bucket with the"
echo "     'duplicate_apollo_person' code visible (thanks to the"
echo "     fe-error-fields-surface ticket from earlier today)"
echo "  7. /prospects shows still ONE Arushi (no new row created)"
echo
echo "Caveat reminder:"
echo "  This stops new dupe rows but does NOT stop the wasted reveal"
echo "  call. The reveal fires before createProspect in the bulk flow."
echo "  Next ticket: search-time annotation of already-prospected"
echo "  candidates to skip the reveal entirely."
