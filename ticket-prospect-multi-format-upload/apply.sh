#!/usr/bin/env bash
# Ticket prospect-multi-format-upload
#
# Adds CSV / TSV / XLSX / XLS support to the WhatsApp prospect intake
# upload (and, by extension, every page that imports the same
# whatsapp-bulk/UrlInput component when those pages ship).
#
# What yes:
#   - Accepts .txt, .csv, .tsv, .xlsx, .xls
#   - Extracts URLs from any cell or line via regex (no column
#     selection UI; the file structure does not matter)
#   - Dedupes, preserves first-seen order
#   - Strips trailing punctuation from URLs in prose
#   - Surfaces "no URLs found" or "could not read file" via toast
#   - Resets the file input so the same file can be re-selected
#
# What not:
#   - Does NOT change the existing classification or backend pipeline.
#     URLs land in the same textarea; downstream stages are untouched.
#   - Does NOT support .ods, .numbers, .pdf, or other formats.
#   - Does NOT validate URLs at parse time (the existing classify()
#     function in UrlInput continues to do that downstream).
#
# Files modified:
#   - artifacts/dashboard/package.json (xlsx added as dependency)
#   - artifacts/dashboard/src/components/whatsapp-bulk/UrlInput.tsx
#
# Files created:
#   - artifacts/dashboard/src/lib/parse-uploaded-urls.ts

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket prospect-multi-format-upload"
echo "==========================================================="
echo

cd "$REPO_ROOT"

# Pre-flight
if [[ ! -f artifacts/dashboard/src/components/whatsapp-bulk/UrlInput.tsx ]]; then
  echo "[FAIL] missing target: artifacts/dashboard/src/components/whatsapp-bulk/UrlInput.tsx"
  exit 2
fi
if [[ ! -f artifacts/dashboard/package.json ]]; then
  echo "[FAIL] missing target: artifacts/dashboard/package.json"
  exit 2
fi
echo "[apply] [pre-flight] all targets present ✓"
echo

# Step 1: install xlsx (SheetJS) into the dashboard workspace.
echo "[apply] step 1/4 — install xlsx (SheetJS) into @workspace/dashboard"
if grep -q '"xlsx"' artifacts/dashboard/package.json; then
  echo "[apply] xlsx already in package.json, skipping pnpm add"
else
  pnpm add xlsx@^0.18.5 --filter @workspace/dashboard || {
    echo "[FAIL] pnpm add xlsx failed"
    exit 3
  }
fi
echo

# Step 2: create parser helper
echo "[apply] step 2/4 — create lib/parse-uploaded-urls.ts"
node "$BUNDLE_DIR/patches/patch-1-create-parser.mjs" || { echo "[FAIL]"; exit 2; }
echo

# Step 3: update UrlInput
echo "[apply] step 3/4 — patch UrlInput.tsx (4 edits)"
node "$BUNDLE_DIR/patches/patch-2-update-url-input.mjs" || { echo "[FAIL]"; exit 2; }
echo

# Step 4: typecheck only — Defect #11 rule, no vite build under bash.
echo "[apply] step 4/4 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || { echo "[FAIL] dashboard typecheck"; exit 3; }
echo "[apply] dashboard typecheck PASS ✓"
echo

# Mirror sync
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
echo "REQUIRED — restart dashboard (or hard-refresh browser) so the"
echo "new bundle picks up xlsx and the updated UrlInput component."
echo
echo "Verify by visiting /prospect/whatsapp:"
echo "  - The button is labeled 'Upload file' (was 'Upload .txt')"
echo "  - The native file picker accepts .txt/.csv/.tsv/.xlsx/.xls"
echo "  - Uploading a CSV with URLs in any column extracts them all"
echo "  - Uploading a multi-sheet XLSX extracts URLs from every sheet"
echo "  - Uploading a file with no URLs shows a destructive toast"
echo "  - Uploading the same file twice in a row works (input is reset)"
echo
echo "Manual test fixture: create a CSV with three columns"
echo "(name, url, country) and three rows. The 'url' column has"
echo "https URLs. After upload, the textarea should contain three"
echo "URLs, one per line, in original order."
