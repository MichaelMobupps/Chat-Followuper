#!/usr/bin/env bash
set -euo pipefail

# Chat Followuper - Pending-reveal expiry feature (backend + dashboard) v2
#
# RUN FROM YOUR MONOREPO ROOT (the dir that contains BOTH artifacts/ and the
# @workspace/db package), not from inside artifacts/:
#
#   bash cf-reveal-expiry/apply.sh
#
# Edits (anchor-guarded, validated before any write):
#   api-server : prospects route status machine, apollo callback resurrection,
#                build.mjs sweep entry
#   db package : apollo.phone_reveal_expired action type, schema doc
#   dashboard  : ProspectStatus union, list StatusBadge config + filter option,
#                prospect-detail computeStatus + StatusBadge config
# New files (api-server): services/phoneRevealSweep.ts, scripts/sweepReveals.ts
#
# Order: locate -> validate -> backup -> apply -> copy -> typecheck -> build.
# Halts on any failure. Each edited file is backed up as <file>.bak.<timestamp>.
# Set SKIP_BUILD=1 to apply and typecheck without running the package builds.

SKIP_BUILD="${SKIP_BUILD:-0}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"

echo "== reveal-expiry apply (v2) =="

find_one() {
  local name="$1" frag="${2:-*}" matches count
  matches=$(find . \
    \( -path '*/node_modules/*' -o -path '*/source-code/*' -o -path '*/dist/*' -o -path '*/.git/*' \) -prune \
    -o -name "$name" -path "$frag" -print 2>/dev/null | grep . || true)
  count=$(printf '%s\n' "$matches" | grep -c . || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: expected exactly 1 match for $name ($frag); found $count:" >&2
    printf '%s\n' "$matches" >&2
    echo "Run this from the monorepo root, or set the path by hand." >&2
    exit 1
  fi
  printf '%s' "$matches"
}

pkg_root_of() {
  local d; d="$(cd "$(dirname "$1")" && pwd)"
  while [ "$d" != "/" ]; do
    [ -f "$d/package.json" ] && { printf '%s' "$d"; return 0; }
    d="$(dirname "$d")"
  done
  return 1
}

PROSPECTS_ROUTE="$(find_one prospects.ts '*/routes/*')"
APOLLO_SVC="$(find_one apollo.ts '*/services/*')"
ACTION_LOGS="$(find_one action_logs.ts '*/schema/*')"
PROSPECTS_SCHEMA="$(find_one prospects.ts '*/schema/*')"
FE_PROSPECTS="$(find_one prospects.ts '*/lib/api/*')"
FE_TABLE="$(find_one ProspectsListTable.tsx)"
FE_FILTERS="$(find_one ProspectsListFilters.tsx)"
PROSPECT_DETAIL="$(find_one prospect-detail.tsx)"

SERVICES_DIR="$(dirname "$APOLLO_SVC")"
SRC_DIR="$(dirname "$SERVICES_DIR")"
SCRIPTS_DIR="$SRC_DIR/scripts"
API_PKG="$(pkg_root_of "$APOLLO_SVC")"
DASH_PKG="$(pkg_root_of "$FE_TABLE")"
BUILD_MJS="$API_PKG/build.mjs"
[ -f "$BUILD_MJS" ] || { echo "ERROR: build.mjs not found at $BUILD_MJS" >&2; exit 1; }

echo "api-server pkg : $API_PKG"
echo "dashboard pkg  : $DASH_PKG"

ARGS=(--prospects-route "$PROSPECTS_ROUTE" --apollo "$APOLLO_SVC" \
      --action-logs "$ACTION_LOGS" --prospects-schema "$PROSPECTS_SCHEMA" \
      --build-mjs "$BUILD_MJS" \
      --fe-prospect-status "$FE_PROSPECTS" --fe-status-badge "$FE_TABLE" \
      --fe-filters "$FE_FILTERS" --prospect-detail "$PROSPECT_DETAIL")

python3 "$BUNDLE_DIR/patch.py" validate "${ARGS[@]}"

for f in "$PROSPECTS_ROUTE" "$APOLLO_SVC" "$ACTION_LOGS" "$PROSPECTS_SCHEMA" \
         "$BUILD_MJS" "$FE_PROSPECTS" "$FE_TABLE" "$FE_FILTERS" "$PROSPECT_DETAIL"; do
  cp "$f" "$f.bak.$TS"
done
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
copy_new "$BUNDLE_DIR/files/services/phoneRevealSweep.ts" "$SERVICES_DIR/phoneRevealSweep.ts"
copy_new "$BUNDLE_DIR/files/scripts/sweepReveals.ts"      "$SCRIPTS_DIR/sweepReveals.ts"

gate_typecheck() {
  local pkg="$1" name="$2"
  echo "== typecheck ($name) =="
  if grep -q '"typecheck"[[:space:]]*:' "$pkg/package.json"; then
    pnpm -C "$pkg" run typecheck
  else
    pnpm -C "$pkg" exec tsc -p tsconfig.json --noEmit
  fi
}
gate_build() {
  local pkg="$1" name="$2"
  [ "$SKIP_BUILD" = "1" ] && { echo "== build ($name) skipped (SKIP_BUILD=1) =="; return 0; }
  echo "== build ($name) =="
  if grep -q '"build"[[:space:]]*:' "$pkg/package.json"; then
    pnpm -C "$pkg" run build
  else
    echo "no build script; skipping"
  fi
}

gate_typecheck "$API_PKG" api-server
gate_typecheck "$DASH_PKG" dashboard
gate_build "$API_PKG" api-server
gate_build "$DASH_PKG" dashboard

echo "== reveal-expiry v2 applied and gated OK =="
echo "If api-server typecheck reports apolloPhoneRevealExpired missing, the"
echo "@workspace/db package needs a rebuild so its new action type is visible."
echo "Sweep entry now builds to dist/scripts/sweepReveals.mjs."
echo "Separately: point a Scheduled Deployment at: node dist/scripts/sweepReveals.mjs,"
echo "then Restart, then Republish."
