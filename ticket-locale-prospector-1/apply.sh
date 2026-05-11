#!/usr/bin/env bash
# Ticket locale-prospector-1
#
# Infrastructure refactor: extract the inline nativeness guides from
# stages/s5_write.py into a new core/nativeness_guides.py module.
#
# Behavior change: ZERO. Output of WriteStage._build_nativeness_block
# remains byte-identical for all language tags. This ticket is purely
# architectural — it lays the groundwork for follow-up tickets
# (locale-prospector-2, -3, -4) that add regional-tag entries (ja-JP,
# en-AE, th-TH, etc.) to the GUIDES dict and switch lookup to
# full-tag-first.
#
# Files touched:
#   - prospector/core/nativeness_guides.py  (NEW, ~566 lines)
#   - prospector/stages/s5_write.py         (refactor: -480 lines, +1 import)
#
# Dependencies: none beyond the current prospector source tree.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket locale-prospector-1 (infrastructure refactor)"
echo "==========================================================="
echo

cd "$REPO_ROOT"

TARGETS=(
  "prospector/stages/s5_write.py"
  "prospector/core/locale_utils.py"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] expected targets present"
echo

echo "[apply] step 1/3 - create core/nativeness_guides.py"
python3 "$BUNDLE_DIR/patches/patch-1-create-nativeness-guides.py" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/3 - refactor stages/s5_write.py"
python3 "$BUNDLE_DIR/patches/patch-2-refactor-s5-write.py" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/3 - syntax check both files"
python3 -c "import ast; ast.parse(open('prospector/core/nativeness_guides.py').read())" \
  || { echo "[FAIL] nativeness_guides.py syntax"; exit 3; }
echo "  nativeness_guides.py syntax: PASS"
python3 -c "import ast; ast.parse(open('prospector/stages/s5_write.py').read())" \
  || { echo "[FAIL] s5_write.py syntax"; exit 3; }
echo "  s5_write.py syntax: PASS"
echo

# Optional: run the prospector test suite if it exists
if [[ -f "prospector/tests/test_locale_resolution.py" ]]; then
  echo "[apply] running test_locale_resolution.py to verify no regression"
  cd prospector && python3 tests/test_locale_resolution.py && cd ..
  echo "  test_locale_resolution.py: PASS"
  echo
fi

echo "==========================================================="
echo "[apply] DONE"
echo "==========================================================="
echo
echo "Ticket locale-prospector-1 applied. Zero behavior change."
echo
echo "Files now contain:"
echo "  - prospector/core/nativeness_guides.py (~566 lines)"
echo "    * GUIDES dict with 33 bare-language entries"
echo "    * build_nativeness_block() with full-tag-first lookup support"
echo "    * build_critic_nativeness_block() concise variant (unused)"
echo "  - prospector/stages/s5_write.py"
echo "    * _build_nativeness_block() now delegates to the new module"
echo "    * Imports build_nativeness_block from core.nativeness_guides"
echo
echo "Next ticket (locale-prospector-2): port Followuper tier-1 +"
echo "en-variants (17 regional entries: pt-BR, es-MX, zh-Hans, ar-EG,"
echo "en-IN, en-AE, en-SG, etc.) to the new GUIDES dict."
