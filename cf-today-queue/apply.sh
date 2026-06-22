#!/usr/bin/env bash
set -euo pipefail

# Chat Followuper - Today daily queue (dashboard only)
#
# Replaces the empty "Today" placeholder with the real daily queue of
# WhatsApp follow-ups due now, each with an edit and a one-click open in
# WhatsApp. Reuses existing hooks and the edit dialog. No new dependencies.
#
# RUN FROM YOUR MONOREPO ROOT:  bash cf-today-queue/apply.sh
#
# Order: locate -> backup -> replace -> typecheck (scoped) -> vite build.
# The vite build is the deploy artifact. The typecheck halts only if the new
# today.tsx itself has an error; pre-existing errors elsewhere do not block.

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"

echo "== today queue apply =="

find_one() {
  local name="$1" frag="${2:-*}" matches count
  matches=$(find . \
    \( -path '*/node_modules/*' -o -path '*/source-code/*' -o -path '*/dist/*' -o -path '*/.git/*' \) -prune \
    -o -name "$name" -path "$frag" -print 2>/dev/null | grep . || true)
  count=$(printf '%s\n' "$matches" | grep -c . || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: expected exactly 1 match for $name ($frag); found $count:" >&2
    printf '%s\n' "$matches" >&2
    echo "Run from the monorepo root." >&2
    exit 1
  fi
  printf '%s' "$matches"
}

TODAY="$(find_one today.tsx '*/pages/*')"
PAGES_DIR="$(dirname "$TODAY")"
SRC_DIR="$(dirname "$PAGES_DIR")"
DASH_PKG="$(dirname "$SRC_DIR")"
echo "dashboard pkg : $DASH_PKG"

cp "$TODAY" "$TODAY.bak.$TS"
echo "backed up: $TODAY.bak.$TS"
cp "$BUNDLE_DIR/files/today.tsx" "$TODAY"
echo "replaced: $TODAY"

echo "== typecheck (gate scoped to today.tsx) =="
set +e
TC_OUT="$(PORT=5173 BASE_PATH=/ pnpm -C "$DASH_PKG" run typecheck 2>&1)"
TC_CODE=$?
set -e
printf '%s\n' "$TC_OUT" | tail -25
if printf '%s\n' "$TC_OUT" | grep -q "pages/today.tsx"; then
  echo "ERROR: the new today.tsx has type errors (shown above). Halting before build."
  exit 1
fi
if [ "$TC_CODE" -ne 0 ]; then
  echo "NOTE: typecheck reported pre-existing errors elsewhere, none in today.tsx. Proceeding."
fi

echo "== build (vite) =="
PORT=5173 BASE_PATH=/ pnpm -C "$DASH_PKG" run build

echo "== Today queue applied and built =="
echo "Restart, then Republish to put the new screen on your live URL."
