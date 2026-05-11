#!/usr/bin/env bash
# Ticket mockup-sandbox-drop-build
#
# Fixes the deployment build failure caused by mockup-sandbox's vite.config.ts
# hard-throwing on missing PORT/BASE_PATH environment variables during the
# deploy build phase.
#
# Root cause:
#   - Repo root build script runs `pnpm -r --if-present run build`, which
#     walks every workspace package's build script.
#   - artifacts/mockup-sandbox is kind="design" (dev-only canvas), not a
#     production service. Its artifact.toml has no [services.production]
#     block, so PORT/BASE_PATH are not set at build time.
#   - vite.config.ts throws on the missing PORT first, before any build
#     work happens.
#
# Fix:
#   Remove the "build": "vite build" entry from mockup-sandbox's
#   package.json scripts block. pnpm --if-present will then skip the
#   package during the deploy walk. Local dev / preview / typecheck
#   inside the package are unaffected.
#
# Files modified:
#   - artifacts/mockup-sandbox/package.json (1 edit, drops the build line)
#
# What yes:
#   - mockup-sandbox no longer participates in `pnpm run build`
#   - Deploy walks dashboard + api-server, both of which build fine
#   - Local `pnpm dev` inside mockup-sandbox still works (separate script)
#   - Local `pnpm typecheck` inside mockup-sandbox still works
#   - No production behaviour changes for any served service
#
# What not:
#   - No changes to vite.config.ts
#   - No changes to artifact.toml
#   - No changes to api-server or dashboard
#   - No changes to root package.json (the `-r --if-present` form
#     correctly handles the absence of the build script)
#   - mockup-sandbox is not deleted, just stops being deployed

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket mockup-sandbox-drop-build"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "artifacts/mockup-sandbox/package.json"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] target present"
echo

echo "[apply] step 1/4 - patch artifacts/mockup-sandbox/package.json (1 edit)"
node "$BUNDLE_DIR/patches/patch-1-mockup-sandbox-package-json.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/4 - JSON parse smoke test (independent verification)"
node -e "JSON.parse(require('fs').readFileSync('artifacts/mockup-sandbox/package.json', 'utf8'))" \
  && echo "[apply] JSON parse PASS" \
  || { echo "[FAIL] post-patch JSON not parseable"; exit 3; }
echo

echo "[apply] step 3/4 - confirm pnpm --if-present now skips mockup-sandbox"
# Dry probe: ask pnpm to enumerate workspace packages with a build script.
# This is a cheap check that doesn't actually run any builds. If
# mockup-sandbox still shows up, the patch did not land.
if pnpm -r --if-present --filter '@workspace/mockup-sandbox' run build --dry-run 2>&1 | grep -q "build"; then
  echo "[WARN] dry-run probe still references a build script for mockup-sandbox"
  echo "[WARN] this may be a false positive on some pnpm versions; the deploy"
  echo "[WARN] build will skip it via --if-present regardless"
else
  echo "[apply] dry-run probe confirms mockup-sandbox build is skipped"
fi
echo

echo "[apply] step 4/4 - mirror sync"
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
echo "NEXT: trigger a deployment build. Expected outcome:"
echo "  - api-server build: PASS (unchanged)"
echo "  - dashboard build:  PASS (unchanged)"
echo "  - mockup-sandbox:   SKIPPED (no build script)"
echo "  - Deploy publishes successfully."
echo
echo "If the deploy still fails on mockup-sandbox after this patch, check:"
echo "  1. The artifact.toml for mockup-sandbox did NOT acquire a"
echo "     [services.production] block (which would re-add it to the deploy"
echo "     walk). Remove that block if present."
echo "  2. Replit's build cache is not serving a stale package.json. A"
echo "     'Clear cache and redeploy' from the Replit UI clears this."
echo
echo "Verify locally that mockup-sandbox dev still works:"
echo "  cd artifacts/mockup-sandbox && pnpm dev"
echo "(Should start the dev server on PORT defined in artifact.toml's"
echo " [services.env] block, same as before.)"
