#!/usr/bin/env bash
# Sync project source trees into source-code/ so external repos can mirror them.
# source-code/ is treated as a read-only export target — never edit there directly.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Pairs of "src:dest" relative to ROOT_DIR.
PAIRS=(
  "artifacts/api-server/src:source-code/src"
  "lib/db/src/schema:source-code/db/schema"
)

sync_one() {
  local src="$ROOT_DIR/$1"
  local dest="$ROOT_DIR/$2"

  if [ ! -d "$src" ]; then
    echo "Source not found: $src" >&2
    return 1
  fi

  mkdir -p "$dest"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude '.DS_Store' \
      --exclude '*.log' \
      "$src/" "$dest/"
  else
    rm -rf "$dest"
    mkdir -p "$dest"
    cp -R "$src/." "$dest/"
  fi

  echo "Synced $src -> $dest"
}

for pair in "${PAIRS[@]}"; do
  IFS=":" read -r src dest <<< "$pair"
  sync_one "$src" "$dest"
done
