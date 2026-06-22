#!/usr/bin/env bash
set -euo pipefail

# Chat Followuper - Follow-up reminder digest (api-server only)
#
# Sends one daily email per rep listing their due follow-ups. Each item links
# to a token-authenticated open route that resolves the wa.me or t.me deep
# link and 302-redirects the rep into the chat to press send. No automation,
# no bulk send, the rep is always the sender.
#
# RUN FROM YOUR MONOREPO ROOT:  bash cf-followup-digest/apply.sh
#
# Prerequisite: apply the reveal-expiry bundle first (this adds the digest
# script next to sweepReveals.ts in build.mjs).
#
# Order: locate -> validate -> backup -> apply -> copy -> add dep -> typecheck -> build.
# Halts on any failure. Edited files are backed up as <file>.bak.<timestamp>.
# Set SKIP_BUILD=1 to apply and typecheck without building.

SKIP_BUILD="${SKIP_BUILD:-0}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"

echo "== follow-up digest apply =="

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
SCRIPTS_DIR="$SRC_DIR/scripts"
ROUTES_INDEX="$ROUTES_DIR/index.ts"
BUILD_MJS="$API_PKG/build.mjs"
for f in "$ROUTES_INDEX" "$BUILD_MJS"; do
  [ -f "$f" ] || { echo "ERROR: expected file not found: $f" >&2; exit 1; }
done

echo "api-server pkg : $API_PKG"

ARGS=(--routes-index "$ROUTES_INDEX" --build-mjs "$BUILD_MJS")

python3 "$BUNDLE_DIR/patch.py" validate "${ARGS[@]}"

for f in "$ROUTES_INDEX" "$BUILD_MJS"; do cp "$f" "$f.bak.$TS"; done
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
copy_new "$BUNDLE_DIR/files/lib/followupLinkToken.ts"        "$LIB_DIR/followupLinkToken.ts"
copy_new "$BUNDLE_DIR/files/services/mailer.ts"             "$SERVICES_DIR/mailer.ts"
copy_new "$BUNDLE_DIR/files/services/followupDigest.ts"     "$SERVICES_DIR/followupDigest.ts"
copy_new "$BUNDLE_DIR/files/routes/followupOpen.ts"         "$ROUTES_DIR/followupOpen.ts"
copy_new "$BUNDLE_DIR/files/scripts/sendFollowupDigests.ts" "$SCRIPTS_DIR/sendFollowupDigests.ts"

echo "== add nodemailer (already in esbuild external list) =="
pnpm -C "$API_PKG" add nodemailer
pnpm -C "$API_PKG" add -D @types/nodemailer

echo "== typecheck (api-server) =="
if grep -q '"typecheck"[[:space:]]*:' "$API_PKG/package.json"; then
  pnpm -C "$API_PKG" run typecheck
else
  pnpm -C "$API_PKG" exec tsc -p tsconfig.json --noEmit
fi

if [ "$SKIP_BUILD" = "1" ]; then
  echo "== build skipped (SKIP_BUILD=1) =="
else
  echo "== build (api-server) =="
  pnpm -C "$API_PKG" run build
fi

echo "== follow-up digest applied and gated OK =="
echo "Digest entry builds to dist/scripts/sendFollowupDigests.mjs."
echo "Set the env (SMTP_USER, SMTP_PASS, FOLLOWUP_FROM, FOLLOWUP_LINK_SECRET,"
echo "APP_PUBLIC_URL), then Scheduled Deployment at:"
echo "  node dist/scripts/sendFollowupDigests.mjs"
echo "then Restart, then Republish."
