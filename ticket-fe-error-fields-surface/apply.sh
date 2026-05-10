#!/usr/bin/env bash
# Ticket fe-error-fields-surface — surface structured BE error fields in
# ApiError.message. Single FE patch, 3 atomic edits in lib/api.ts.
# Idempotent.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=artifacts/dashboard/src/lib/api.ts

echo "==========================================================="
echo "Ticket fe-error-fields-surface"
echo "  Surface BE error 'fields' / Zod issue paths in ApiError.message"
echo "==========================================================="
echo

cd "$REPO_ROOT"

if [[ ! -f "$TARGET" ]]; then
  echo "[FAIL] missing target: $TARGET"
  exit 2
fi
echo "[apply] [pre-flight] target present ✓"
echo

echo "[apply] step 1/3 — patch lib/api.ts (type + helper + throw block)"
node "$BUNDLE_DIR/patches/patch-api-fetch.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/3 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[FAIL] dashboard typecheck failed"
  exit 3
}
echo "[apply] dashboard typecheck PASS ✓"
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
echo "Verify (FE-only — no api-server restart):"
echo "  Hard to demo intentionally without forcing an error. The change"
echo "  takes effect on the next BE rejection that includes a 'fields'"
echo "  array or Zod 'issues'. Errors will now read e.g.:"
echo
echo "    Before: 'failed: 409 missing_fields'"
echo "    After:  'failed: 409 missing_fields: country, language'"
echo
echo "  Optional manual test: temporarily point any FE form to a route"
echo "  that requires extra fields, submit empty, confirm the error"
echo "  message includes field names."
