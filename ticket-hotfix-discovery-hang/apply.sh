#!/usr/bin/env bash
# Hotfix: discovery hang on bulk WhatsApp prospect flow
#
# Two anchored patches + dashboard typecheck + sync. Idempotent.
# Order matters: types first, then consumer.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Hotfix: discovery hang — fix FE prospector type drift"
echo "==========================================================="
echo

cd "$REPO_ROOT"

# ─────────────────────────────────────────────────────────────────
# Pre-flight
# ─────────────────────────────────────────────────────────────────
for f in \
  "artifacts/dashboard/src/lib/api/prospector.ts" \
  "artifacts/dashboard/src/pages/prospect/whatsapp.tsx"; do
  if [[ ! -f "$f" ]]; then
    echo "[apply] [FAIL] missing target file: $f"
    exit 2
  fi
done
echo "[apply] [pre-flight] target files present ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Patches — order matters: types first
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 1/4 — patch lib/api/prospector.ts (align type with BE)"
node "$BUNDLE_DIR/patches/patch-fe-prospector-types.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/4 — patch pages/prospect/whatsapp.tsx (consumer)"
node "$BUNDLE_DIR/patches/patch-fe-bulk-page.mjs" || { echo "[FAIL]"; exit 2; }
echo

# ─────────────────────────────────────────────────────────────────
# Typecheck (no build — Defect #11)
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 3/4 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[apply] [FAIL] dashboard typecheck failed"
  exit 3
}
echo "[apply] dashboard typecheck PASS ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Sync
# ─────────────────────────────────────────────────────────────────
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
echo "[apply] DONE — discovery hang hotfix applied"
echo "==========================================================="
echo
echo "[apply] [hint] Vite HMR picks up changes — refresh dashboard tab."
echo "[apply] [hint] No api-server build/restart needed (FE only)."
echo
echo "Verify:"
echo "  1. Refresh /prospect/whatsapp"
echo "  2. Paste 1 URL, click Discover"
echo "  3. Should advance from 'Resolving URL' → 'Searching org' →"
echo "     'Searching people' → candidate cards visible"
echo "  4. If still hangs: check devtools console for new errors,"
echo "     paste them; we may have a second-order bug downstream"
