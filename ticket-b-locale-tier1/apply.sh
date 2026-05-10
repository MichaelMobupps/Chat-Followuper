#!/usr/bin/env bash
# Ticket B-locale-tier1 — content for 11 regional locales
#
# Adds region-aware nativeness guides and greeting forms for the four
# critical language splits:
#   - Portuguese: pt-BR, pt-PT
#   - Spanish:    es-MX, es-AR, es-CO, es-ES
#   - Chinese:    zh-Hans, zh-Hant
#   - Arabic:     ar-EG, ar-SA, ar-MA
#
# Prerequisite: ticket-b-locale-plumbing must have been applied. This
# ticket adds CONTENT only; it relies on the lookup fall-through wired
# in plumbing.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================================="
echo "Ticket B-locale-tier1"
echo "==========================================================="
echo

cd "$REPO_ROOT"

# Pre-flight: verify plumbing landed.
if ! grep -q 'B-locale-plumbing' artifacts/api-server/src/lib/languageNativeness.ts; then
  echo "[FAIL] B-locale-plumbing has not been applied to languageNativeness.ts."
  echo "       Apply ticket-b-locale-plumbing first; tier1 depends on the"
  echo "       full-tag-first lookup added by plumbing."
  exit 2
fi
if ! grep -q 'B-locale-plumbing' artifacts/api-server/src/services/messagePrompts.ts; then
  echo "[FAIL] B-locale-plumbing has not been applied to messagePrompts.ts."
  exit 2
fi
if ! [[ -f artifacts/api-server/src/lib/localeResolver.ts ]]; then
  echo "[FAIL] lib/localeResolver.ts does not exist. Apply B-locale-plumbing first."
  exit 2
fi
echo "[apply] [pre-flight] B-locale-plumbing detected ✓"
echo

TARGETS=(
  "artifacts/api-server/src/lib/languageNativeness.ts"
  "artifacts/api-server/src/services/messagePrompts.ts"
)
for t in "${TARGETS[@]}"; do
  if [[ ! -f "$t" ]]; then echo "[FAIL] missing target: $t"; exit 2; fi
done
echo "[apply] [pre-flight] both targets present ✓"
echo

echo "[apply] step 1/4 — patch lib/languageNativeness.ts (11 GUIDES entries)"
node "$BUNDLE_DIR/patches/patch-1-language-nativeness-tier1.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 2/4 — patch services/messagePrompts.ts (11 GREETING_TABLE entries)"
node "$BUNDLE_DIR/patches/patch-2-greeting-tier1.mjs" || { echo "[FAIL]"; exit 2; }
echo

echo "[apply] step 3/4 — pnpm --filter @workspace/api-server run build"
pnpm --filter @workspace/api-server run build || { echo "[FAIL] api-server build"; exit 3; }
echo "[apply] api-server build PASS ✓"
echo

echo "[apply] step 4/4 — pnpm --filter @workspace/dashboard run typecheck"
pnpm --filter @workspace/dashboard run typecheck || { echo "[FAIL] dashboard typecheck"; exit 3; }
echo "[apply] dashboard typecheck PASS ✓"
echo

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
echo "REQUIRED — restart api-server workflow."
echo "  Replit Workflows → Backend Server → Stop → Start"
echo
echo "Verify by sending one prospect per region through generate-message"
echo "and inspecting the generated message:"
echo
echo "  Brazilian gaming prospect (country=Brazil, language=pt):"
echo "    - Greeting: 'Olá {NAME},' with note about voce register"
echo "    - Body: BR vocab (celular not telemovel, tela not ecra, etc.)"
echo "    - Adtech: keeps English compound terms (CPI, lookalike, etc.)"
echo
echo "  Mainland China prospect (country=China, language=zh):"
echo "    - Greeting: '您好，{NAME}：' (Simplified script throughout)"
echo "    - Body: 简体字 only — never Traditional 繁體 chars"
echo "    - Vocab: 软件 (not 軟體), 网络 (not 網絡), etc."
echo
echo "  Mexican prospect (country=Mexico, language=es):"
echo "    - Greeting: 'Hola {NAME},' with usted register"
echo "    - Vocab: computadora, celular, carro (not Iberian forms)"
echo
echo "  Saudi prospect (country=Saudi Arabia, language=ar):"
echo "    - Greeting: 'السلام عليكم {NAME}،' (Gulf-formal opener)"
echo "    - Body: full MSA, no dialect"
echo
echo "Country-region lookups verified by ticket-b-locale-plumbing's tests"
echo "(32/32 cases pass). Dispatch is correct; this ticket adds the"
echo "content the dispatcher routes to."
