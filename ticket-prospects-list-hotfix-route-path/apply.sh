#!/usr/bin/env bash
# Ticket prospects-list hotfix — fix the route path
#
# Single anchored patch + api-server typecheck + api-server build + sync.
# Idempotent.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/api-server/src/routes/prospects.ts

echo "==========================================================="
echo "Ticket prospects-list hotfix — route path fix"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then
  echo "[FAIL] target file missing: $TARGET"
  exit 2
fi
echo "[apply] [pre-flight] $TARGET present ✓"
echo

echo "[apply] step 1/4 — patch routes/prospects.ts (router.get path: / → /prospects)"
node "$BUNDLE_DIR/patches/patch-fix-list-route-path.mjs" || {
  echo "[FAIL] patch did not apply"
  exit 2
}
echo

echo "[apply] step 2/4 — root pnpm run typecheck"
pnpm run typecheck || {
  echo "[FAIL] typecheck failed"
  exit 3
}
echo "[apply] root typecheck PASS ✓"
echo

echo "[apply] step 3/4 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || {
  echo "[FAIL] api-server build failed"
  exit 4
}
echo "[apply] api-server build PASS ✓"
echo

echo "[apply] step 4/4 — source-code mirror sync (best-effort)"
if [[ -x source-code/sync.sh ]]; then
  bash source-code/sync.sh || echo "[WARN] sync.sh failed (non-fatal)"
elif [[ -x scripts/sync-source-code.sh ]]; then
  bash scripts/sync-source-code.sh || echo "[WARN] sync-source-code.sh failed (non-fatal)"
else
  echo "[apply] no sync script found — skipping mirror"
fi
echo

echo "==========================================================="
echo "[apply] DONE — list-route path fix applied"
echo "==========================================================="
echo
echo "[apply] [hint] Restart the api-server workflow so the new dist loads"
echo "[apply] [hint] (Defect #7)"
echo
echo "Verify:"
echo "  curl -i http://localhost:80/api/prospects"
echo "    expect: 401 not_authenticated (was: 404)"
echo "  curl -i http://localhost:80/api/"
echo "    expect: 404 (was: 401 — the spurious handler is gone)"
