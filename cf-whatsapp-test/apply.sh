#!/usr/bin/env bash
set -euo pipefail

# Run this from ~/workspace:  bash cf-whatsapp-test/apply.sh
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

find_one() {
  # find_one <filename> <path-glob>
  local name="$1" glob="$2" hit
  hit="$(find . -type f -name "$name" -path "$glob" \
        -not -path '*/node_modules/*' -not -path '*/dist/*' 2>/dev/null | head -1)"
  if [ -z "$hit" ]; then
    echo "ERROR: could not locate $name ($glob)" >&2
    exit 1
  fi
  printf '%s\n' "$hit"
}

echo "==> Locating the dashboard and the Accounts page"
ACCOUNTS="$(find_one accounts.tsx '*/dashboard/src/pages/*')"
DASH_DIR="$(printf '%s\n' "$ACCOUNTS" | sed 's#/src/pages/accounts.tsx##')"
echo "    page: $ACCOUNTS"
echo "    dashboard: $DASH_DIR"

echo "==> Backing up the current Accounts page"
cp "$ACCOUNTS" "$ACCOUNTS.bak-$STAMP"
echo "    backup: $ACCOUNTS.bak-$STAMP"

echo "==> Installing the test-send tool"
cp "$HERE/files/accounts.tsx" "$ACCOUNTS"

echo "==> Building the dashboard (this is the gate)"
PORT=5173 BASE_PATH=/ pnpm -C "$DASH_DIR" run build

echo "==> Done. The Accounts screen now has the WhatsApp test-send tool."
echo "    Next: Restart, then Republish."
