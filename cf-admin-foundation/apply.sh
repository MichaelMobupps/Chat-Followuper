#!/usr/bin/env bash
set -euo pipefail

# Chat Followuper - Admin foundation (api-server only)
#
# Adds the admin gate (ADMIN_EMAILS allowlist), a whoami check the UI uses to
# learn who is admin, and the cross-user manager activity+cost feed. No new
# dependencies, no database migration.
#
# RUN FROM YOUR MONOREPO ROOT:  bash cf-admin-foundation/apply.sh
#
# Order: locate -> validate -> backup -> apply -> copy -> typecheck -> build.
# The esbuild build is the deploy artifact. The typecheck halts only if a file
# this bundle touches has an error; pre-existing errors elsewhere do not block.

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"

echo "== admin foundation apply =="

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

APOLLO_SVC="$(find_one apollo.ts '*/services/*')"
SERVICES_DIR="$(dirname "$APOLLO_SVC")"
SRC_DIR="$(dirname "$SERVICES_DIR")"
API_PKG="$(dirname "$SRC_DIR")"
LIB_DIR="$SRC_DIR/lib"
ROUTES_DIR="$SRC_DIR/routes"
AUTH="$SRC_DIR/middlewares/auth.ts"
IDX="$ROUTES_DIR/index.ts"
for f in "$AUTH" "$IDX"; do
  [ -f "$f" ] || { echo "ERROR: expected file not found: $f" >&2; exit 1; }
done
echo "api-server pkg : $API_PKG"

ARGS=(--auth "$AUTH" --index "$IDX")
python3 "$BUNDLE_DIR/patch.py" validate "${ARGS[@]}"

for f in "$AUTH" "$IDX"; do cp "$f" "$f.bak.$TS"; done
echo "backups written with suffix .bak.$TS"

python3 "$BUNDLE_DIR/patch.py" apply "${ARGS[@]}"

copy_new() {
  local src="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if [ -f "$dest" ]; then
    cmp -s "$src" "$dest" && echo "unchanged: $dest" \
      || echo "EXISTS and differs, skipping (remove to re-add): $dest"
  else
    cp "$src" "$dest"; echo "added: $dest"
  fi
}
copy_new "$BUNDLE_DIR/files/lib/admin.ts"     "$LIB_DIR/admin.ts"
copy_new "$BUNDLE_DIR/files/routes/admin.ts"  "$ROUTES_DIR/admin.ts"

echo "== typecheck (gate scoped to this bundle's files) =="
set +e
TC_OUT="$(pnpm -C "$API_PKG" run typecheck 2>&1)"
TC_CODE=$?
set -e
printf '%s\n' "$TC_OUT" | tail -25
if printf '%s\n' "$TC_OUT" | grep -Eq "routes/admin\.ts|middlewares/auth\.ts|routes/index\.ts|lib/admin\.ts"; then
  echo "ERROR: a file this bundle touches has type errors (above). Halting before build."
  exit 1
fi
if [ "$TC_CODE" -ne 0 ]; then
  echo "NOTE: typecheck reported pre-existing errors elsewhere, none in this bundle's files. Proceeding."
fi

echo "== build (esbuild) =="
pnpm -C "$API_PKG" run build

echo "== admin foundation applied and built =="
echo "Set ADMIN_EMAILS=michael@mobupps.com in Secrets, then Restart and Republish."
