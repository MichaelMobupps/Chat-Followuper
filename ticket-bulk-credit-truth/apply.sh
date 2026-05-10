#!/usr/bin/env bash
# Ticket bulk-credit-truth — credit cost honesty + safer defaults
#
# Two patches × multiple atomic edits + dashboard typecheck + sync.
# Idempotent. FE only.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket bulk-credit-truth — fix 1c lie, default safer toggles"
echo "==========================================================="
echo

cd "$REPO_ROOT"

# ─────────────────────────────────────────────────────────────────
# Pre-flight
# ─────────────────────────────────────────────────────────────────
for f in \
  "artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx" \
  "artifacts/dashboard/src/components/whatsapp-bulk/RevealConfirmDialog.tsx"; do
  if [[ ! -f "$f" ]]; then
    echo "[apply] [FAIL] missing: $f"
    exit 2
  fi
done
echo "[apply] [pre-flight] both targets present ✓"
echo

# ─────────────────────────────────────────────────────────────────
# Patches
# ─────────────────────────────────────────────────────────────────
echo "[apply] step 1/4 — patch CandidateGrid.tsx"
echo "       (REVEAL_COST_YES 1→8, summary text, showMaybe→false, hasEmail→true)"
node "$BUNDLE_DIR/patches/patch-candidate-grid.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/4 — patch RevealConfirmDialog.tsx"
echo "       (totalCredits math, breakdown numbers, prominent warning)"
node "$BUNDLE_DIR/patches/patch-reveal-dialog.mjs" || { echo "[FAIL]"; exit 2; }
echo

# ─────────────────────────────────────────────────────────────────
# Typecheck
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
  echo "[apply] no sync script found"
fi
echo

echo "==========================================================="
echo "[apply] DONE — credit-truth + safer defaults applied"
echo "==========================================================="
echo
echo "[apply] [hint] Vite HMR — refresh dashboard tab. FE only."
echo
echo "Verify:"
echo "  1. Open /prospect/whatsapp, run discover on any URL"
echo "  2. On candidate grid:"
echo "     - 'yes' badges should now show '(8c)' not '(1c)'"
echo "     - 'Show maybe' toggle defaults OFF (you'll see fewer candidates)"
echo "     - 'Has email' toggle defaults ON (filters to email-verified)"
echo "     - Cost summary: '{N} × 8c, non-refundable' instead of yes/maybe split"
echo "  3. Click Reveal & save → confirm dialog:"
echo "     - Prominent ⚠ warning about 8c per reveal + non-refundable"
echo "     - Yes-line shows '× 8' not '× 1'"
echo "     - Total math correct"
echo "  4. Cancel — do NOT actually reveal in verification"
