#!/usr/bin/env bash
# Sync the api-server source tree into source-code/ so external repos can mirror it.
# source-code/ is treated as a read-only export target — never edit there directly.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT_DIR/artifacts/api-server/src"
DEST="$ROOT_DIR/source-code/src"

if [ ! -d "$SRC" ]; then
  echo "Source not found: $SRC" >&2
  exit 1
fi

mkdir -p "$DEST"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude '.DS_Store' \
    --exclude '*.log' \
    "$SRC/" "$DEST/"
else
  rm -rf "$DEST"
  mkdir -p "$DEST"
  cp -R "$SRC/." "$DEST/"
fi

echo "Synced $SRC -> $DEST"
