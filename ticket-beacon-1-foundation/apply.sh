#!/usr/bin/env bash
# Ticket Beacon-1-foundation
# Installs the Beacon design framework foundation:
#   - Beacon font triple in index.html (Bricolage + Manrope + JetBrains Mono)
#   - class="dark" permanent on <html>
#   - .dark CSS block remapped to Beacon Ignite palette (HSL)
#   - Beacon raw tokens in :root (--bcn-ignite-*, --bcn-glow-*, motion)
#   - Body radial gradient atmosphere
#   - Tailwind utilities for ignite/glow/ease (bg-ignite, shadow-glow-medium...)
#
# What this DOES change visually:
#   Every page rendering today via shadcn vars (--background, --card,
#   --primary, --muted) will switch to the Beacon palette. The page
#   becomes dark with mint Ignite accents on primary buttons, focus rings,
#   active states. Headings can opt into Bricolage Grotesque via the new
#   .font-display class.
#
# What this does NOT change:
#   No component files are modified. Per-component Beacon polish
#   (chat-list rails, message bubbles, send button) ships as separate
#   tickets (Beacon-2, Beacon-3, Beacon-4).

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket Beacon-1-foundation"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "artifacts/dashboard/index.html"
  "artifacts/dashboard/src/index.css"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] both targets present ✓"
echo

echo "[apply] step 1/4 — patch index.html (fonts + class=\"dark\")"
node "$BUNDLE_DIR/patches/patch-1-index-html.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/4 — patch src/index.css (4 edits: tokens + .dark + body + theme)"
node "$BUNDLE_DIR/patches/patch-2-index-css.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/4 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || { echo "[FAIL] dashboard typecheck"; exit 3; }
echo "[apply] dashboard typecheck PASS ✓"
echo

echo "[apply] step 4/4 — pnpm --filter @workspace/dashboard run build"
pnpm --filter @workspace/dashboard run build || { echo "[FAIL] dashboard build"; exit 3; }
echo "[apply] dashboard build PASS ✓"
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
echo "REQUIRED — restart dashboard (or hard-refresh browser to pick up"
echo "new CSS variables and font links)."
echo
echo "What you should see:"
echo "  • Page background: dark blue-tinted (#0B1018 region) instead of"
echo "    the previous slate-darkness"
echo "  • Primary buttons: electric mint (#00F5D4) instead of off-white"
echo "  • Focus rings on inputs: ignite color"
echo "  • Body text: Manrope instead of Inter"
echo "  • Subtle radial gradient on the body (TG blue top-right,"
echo "    ignite mint bottom-left)"
echo
echo "If the fonts do not load: the Bricolage Grotesque family includes"
echo "an opsz axis (variable optical size); make sure no Content Security"
echo "Policy blocks fonts.googleapis.com or fonts.gstatic.com."
echo
echo "Next: Beacon-2 (prospect list) — Ignite states for list rows."
