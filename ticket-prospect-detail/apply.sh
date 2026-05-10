#!/usr/bin/env bash
# Ticket prospect-detail — apply.sh
#
# Adds a per-prospect detail page at /prospects/:id (view, regenerate
# message, delete, open WhatsApp). Wires list rows to navigate to it.
#
# Steps:
#   1. Pre-flight: target files exist
#   2. Patch App.tsx — register /prospects/:id route + import
#   3. Patch ProspectsListTable.tsx — make rows clickable
#   4. Copy new pages/prospect-detail.tsx
#   5. Dashboard typecheck (no build per Defect #11)
#   6. Source-code mirror sync (best-effort)
#
# Idempotent.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASH=artifacts/dashboard/src

echo "==========================================================="
echo "Ticket prospect-detail — /prospects/:id detail page"
echo "==========================================================="
echo

cd "$REPO_ROOT"

# ─────────────────────────────────────────────────────────────────
# Pre-flight
# ─────────────────────────────────────────────────────────────────
for f in \
  "$DASH/App.tsx" \
  "$DASH/components/prospects-list/ProspectsListTable.tsx" \
  "$DASH/lib/api/prospects.ts" \
  "$DASH/pages/prospects.tsx"; do
  if [[ ! -f "$f" ]]; then
    echo "[apply] [FAIL] missing target file: $f"
    exit 2
  fi
done
echo "[apply] [pre-flight] target files present ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Patches
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 1/4 — patch App.tsx (route + import)"
node "$BUNDLE_DIR/patches/patch-app-route.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/4 — patch ProspectsListTable.tsx (clickable rows)"
node "$BUNDLE_DIR/patches/patch-list-clickable.mjs" || { echo "[FAIL]"; exit 2; }
echo

# ─────────────────────────────────────────────────────────────────
# Copy new page
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 3/4 — copy pages/prospect-detail.tsx"
cp "$BUNDLE_DIR/new-files/pages/prospect-detail.tsx" "$DASH/pages/prospect-detail.tsx"
echo "  ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Typecheck (no build — Defect #11)
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 4/4 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || {
  echo "[apply] [FAIL] dashboard typecheck failed"
  exit 3
}
echo "[apply] dashboard typecheck PASS ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Sync
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 5/5 — source-code mirror sync (best-effort)"
if [[ -x source-code/sync.sh ]]; then
  bash source-code/sync.sh || echo "[WARN] sync.sh failed (non-fatal)"
elif [[ -x scripts/sync-source-code.sh ]]; then
  bash scripts/sync-source-code.sh || echo "[WARN] sync-source-code.sh failed (non-fatal)"
else
  echo "[apply] no sync script found — skipping mirror"
fi
echo

echo "==========================================================="
echo "[apply] DONE — Ticket prospect-detail applied"
echo "==========================================================="
echo
echo "[apply] [hint] Vite HMR picks up changes automatically. No"
echo "[apply] [hint]  workflow restart needed (Defect #11)."
echo
echo "Next:"
echo "  1. Refresh dashboard tab"
echo "  2. Click any row in /prospects → should navigate to /prospects/:id"
echo "  3. Walk through scenarios in docs/manual-test-prospect-detail.md"
echo "  4. When ready, republish prod"
