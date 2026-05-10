#!/usr/bin/env bash
# Ticket 2.3-FE — apply.sh
#
# Bulk WhatsApp prospect page. Adds 7 new files (4 components, 2 hooks,
# 2 API clients, 1 page), patches 2 existing files (apollo client + use-apollo
# hook). Idempotent.
#
# Steps:
#   1. Pre-flight: target paths exist
#   2. Apply patches to lib/api/apollo.ts and use-apollo.ts (adds
#      requestPhoneReveal client + hook)
#   3. Copy new API clients (prospector.ts, whatsapp.ts)
#   4. Copy new hooks (use-prospector.ts, use-whatsapp.ts)
#   5. Copy 6 components into components/whatsapp-bulk/
#   6. Replace pages/prospect/whatsapp.tsx (was placeholder, now bulk page)
#   7. Dashboard typecheck
#   8. Dashboard build
#   9. Source-code mirror sync (best-effort)
#
# Hint at end: restart dashboard / api-server workflow to reload (Defect #7)

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASH=artifacts/dashboard/src

echo "==========================================================="
echo "Ticket 2.3-FE — bulk WhatsApp prospect page"
echo "==========================================================="
echo "Repo root:  $REPO_ROOT"
echo "Bundle dir: $BUNDLE_DIR"
echo

cd "$REPO_ROOT"

# ─────────────────────────────────────────────────────────────────
# Pre-flight
# ─────────────────────────────────────────────────────────────────
for f in \
  "$DASH/lib/api/apollo.ts" \
  "$DASH/hooks/use-apollo.ts" \
  "$DASH/pages/prospect/whatsapp.tsx" \
  "$DASH/lib/api.ts"; do
  if [[ ! -f "$f" ]]; then
    echo "[apply] [FAIL] missing target file: $f"
    exit 2
  fi
done
echo "[apply] [pre-flight] target files present ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Step 1: patches (apollo client + use-apollo hook)
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 1/9 — patch FE apollo client + hook"
node "$BUNDLE_DIR/patches/patch-fe-apollo.mjs" || {
  echo "[apply] [FAIL] FE apollo patch failed"
  exit 2
}
echo

# ─────────────────────────────────────────────────────────────────
# Step 2-6: copy new files
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 2/9 — copy new API clients"
mkdir -p "$DASH/lib/api"
cp "$BUNDLE_DIR/new-files/lib/api/prospector.ts" "$DASH/lib/api/prospector.ts"
cp "$BUNDLE_DIR/new-files/lib/api/whatsapp.ts" "$DASH/lib/api/whatsapp.ts"
echo "  prospector.ts ✓"
echo "  whatsapp.ts ✓"
echo

echo "[apply] step 3/9 — copy new hooks"
mkdir -p "$DASH/hooks"
cp "$BUNDLE_DIR/new-files/hooks/use-prospector.ts" "$DASH/hooks/use-prospector.ts"
cp "$BUNDLE_DIR/new-files/hooks/use-whatsapp.ts" "$DASH/hooks/use-whatsapp.ts"
echo "  use-prospector.ts ✓"
echo "  use-whatsapp.ts ✓"
echo

echo "[apply] step 4/9 — copy bulk components"
mkdir -p "$DASH/components/whatsapp-bulk"
for c in UrlInput DiscoveryProgress CandidateGrid RevealConfirmDialog BulkSavingProgress BulkResults; do
  cp "$BUNDLE_DIR/new-files/components/whatsapp-bulk/$c.tsx" "$DASH/components/whatsapp-bulk/$c.tsx"
  echo "  $c.tsx ✓"
done
echo

echo "[apply] step 5/9 — replace pages/prospect/whatsapp.tsx (was placeholder)"
cp "$BUNDLE_DIR/new-files/pages/prospect/whatsapp.tsx" "$DASH/pages/prospect/whatsapp.tsx"
echo "  whatsapp.tsx ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Step 7: dashboard typecheck
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 6/9 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[apply] [FAIL] dashboard typecheck failed"
  exit 3
}
echo "[apply] dashboard typecheck PASS ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Step 8: dashboard build
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 7/9 — pnpm --filter @workspace/dashboard run build"
pnpm --filter @workspace/dashboard run build || {
  echo "[apply] [FAIL] dashboard build failed"
  exit 4
}
echo "[apply] dashboard build PASS ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Step 9: source-code mirror sync (best-effort)
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 8/9 — source-code mirror sync"
if [[ -x source-code/sync.sh ]]; then
  bash source-code/sync.sh || echo "[apply] [WARN] sync.sh failed (non-fatal)"
elif [[ -x scripts/sync-source-code.sh ]]; then
  bash scripts/sync-source-code.sh || echo "[apply] [WARN] sync-source-code.sh failed (non-fatal)"
else
  echo "[apply] no sync script found — skipping mirror"
fi
echo

echo "==========================================================="
echo "[apply] DONE — Ticket 2.3-FE applied successfully"
echo "==========================================================="
echo
echo "[apply] [hint] restart the dashboard workflow to reload the new bundle"
echo "[apply] [hint] (Defect #7 reminder: dist alone is not enough; the"
echo "[apply] [hint]  serving process must reload to pick up new code)"
echo
echo "Next steps for the operator:"
echo "  1. Restart the dashboard workflow."
echo "  2. Open https://chat-followuper.replit.app/prospect/whatsapp (or"
echo "     localhost equivalent) and walk through the manual test scenarios"
echo "     in docs/manual-test-2-3-fe.md."
echo "  3. If all scenarios green, republish the deployment for prod."
