#!/usr/bin/env bash
# Ticket detail-page-cleanup — sales-facing detail view + downloadable
# technical log. Single-file, 6 atomic edits. FE-only.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/dashboard/src/pages/prospect-detail.tsx

echo "==========================================================="
echo "Ticket detail-page-cleanup"
echo "  Sales-facing detail page + Technical log download"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then echo "[FAIL] missing target: $TARGET"; exit 2; fi
echo "[apply] [pre-flight] target present ✓"
echo

echo "[apply] step 1/2 — patch prospect-detail.tsx (6 atomic edits)"
node "$BUNDLE_DIR/patches/patch-detail.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/2 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || { echo "[FAIL] dashboard typecheck"; exit 3; }
echo "[apply] dashboard typecheck PASS ✓"
echo

echo "[apply] mirror sync"
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
echo "FE-only — no api-server build, no api-server restart needed."
echo
echo "Verify on /prospects/<any-id>:"
echo "  - Prospect data card no longer shows Source / Apollo person"
echo "    ID / Updated"
echo "  - Phone reveal card no longer shows phoneNumber audit field"
echo "  - For stub-brief prospects (bulk flow), Research brief card"
echo "    shows an explanation instead of the 0/unknown/-/\$0.0000"
echo "    debug values"
echo "  - For seeder-flow prospects with real briefs, the Research"
echo "    brief card shows meaningful research fields (no longer"
echo "    Generator model / Generator cost — those go in the log)"
echo "  - New 'Technical log' button in the action row downloads"
echo "    JSON with all the moved fields"
echo
echo "Next: A2 — Edit message capability."
