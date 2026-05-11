#!/usr/bin/env python3
"""Ticket locale-prospector-1, patch 2/2: refactor s5_write.py.

Replaces the inline body of WriteStage._build_nativeness_block with a
delegation call to the new core.nativeness_guides.build_nativeness_block
function. Adds an import for the new module at the top of the file.

After this patch:
  - The 33 inline guide entries are no longer in s5_write.py
  - The global rules text is no longer in s5_write.py
  - WriteStage._build_nativeness_block is a thin wrapper

Output of WriteStage._build_nativeness_block remains byte-identical to
the pre-patch state for all language tags (verified by Pass 7 audit).

Dependency: requires patch 1 (the new module) to have applied first.
Idempotent.
"""

import os
import sys

S5_PATH = os.path.join(os.getcwd(), "prospector", "stages", "s5_write.py")
NEW_MODULE_PATH = os.path.join(
    os.getcwd(), "prospector", "core", "nativeness_guides.py"
)

# ─── Edit 1: add import ────────────────────────────────────────────
# Insert "from core.nativeness_guides import build_nativeness_block"
# right after the existing "from core.locale_utils import ..." line.

IMPORT_OLD = "from core.locale_utils import normalize_language_code\n"
IMPORT_NEW = (
    "from core.locale_utils import normalize_language_code\n"
    "from core.nativeness_guides import build_nativeness_block\n"
)
IMPORT_MARKER = "from core.nativeness_guides import build_nativeness_block"


# ─── Edit 2: replace the method body ───────────────────────────────
# The method spans from its def line to (but not including) the next
# method. We replace the entire docstring + body with a thin wrapper.

METHOD_OLD_START = '    def _build_nativeness_block(self, language_tag: str) -> str:\n        """Build language-specific code-switching and nativeness rules.\n\n        Only emitted for non-English emails. Returns empty string for English.\n        This is the core mechanism that prevents translated-from-English output:\n        it tells the LLM exactly which terms to keep in English vs. localize,\n        based on how native adtech professionals in each language actually write.\n        """\n'
METHOD_OLD_END = '            "Do NOT leave it in English."\n        )\n'

METHOD_NEW = (
    '    def _build_nativeness_block(self, language_tag: str) -> str:\n'
    '        """Build language-specific code-switching and nativeness rules.\n'
    '\n'
    '        Only emitted for non-English emails. Returns empty string for English.\n'
    '        This is the core mechanism that prevents translated-from-English output:\n'
    '        it tells the LLM exactly which terms to keep in English vs. localize,\n'
    '        based on how native adtech professionals in each language actually write.\n'
    '\n'
    '        Implementation moved to core/nativeness_guides.py to centralize the\n'
    '        GUIDES content and enable shared use by other stages. This wrapper\n'
    '        is kept for backward compatibility with existing call sites in\n'
    '        WriteStage. Output is byte-identical to the pre-refactor inline\n'
    '        implementation as of ticket locale-prospector-1.\n'
    '        """\n'
    '        return build_nativeness_block(language_tag)\n'
)
METHOD_MARKER = "        return build_nativeness_block(language_tag)\n"


def count_occurrences(haystack: str, needle: str) -> int:
    if not needle:
        return 0
    count = 0
    idx = 0
    while True:
        idx = haystack.find(needle, idx)
        if idx == -1:
            return count
        count += 1
        idx += len(needle)


def apply_replace(source: str, old: str, new: str, label: str) -> str:
    """Anchored substring replace using indexOf+slice (NOT regex/.replace())
    to avoid JS-style backreference issues if any. Python's str.replace
    does NOT have those issues, but using indexOf+slice is still safest
    and matches the convention from the Followuper ticket fix."""
    if new in source and old not in source:
        # Already applied
        print(f"[{label}] SKIP - already applied")
        return source
    count = count_occurrences(source, old)
    if count == 0:
        raise RuntimeError(f"[{label}] NOOP - anchor not found")
    if count > 1:
        raise RuntimeError(f"[{label}] FAIL - anchor matched {count} times")
    idx = source.index(old)
    return source[:idx] + new + source[idx + len(old):]


def apply_range_delete_replace(
    source: str, start_marker: str, end_marker: str, replacement: str, label: str
) -> str:
    """Replace everything from start_marker through end_marker (inclusive
    of end_marker) with replacement. Used to delete a multi-block region
    when crafting an OLD that exactly matches the entire region would be
    fragile (e.g. ~480 lines)."""
    if replacement in source and start_marker not in source:
        print(f"[{label}] SKIP - already applied")
        return source
    start_idx = source.find(start_marker)
    if start_idx == -1:
        raise RuntimeError(f"[{label}] NOOP - start marker not found")
    if source.count(start_marker) > 1:
        raise RuntimeError(f"[{label}] FAIL - start marker matched multiple times")
    end_idx = source.find(end_marker, start_idx)
    if end_idx == -1:
        raise RuntimeError(f"[{label}] NOOP - end marker not found after start")
    end_idx += len(end_marker)
    return source[:start_idx] + replacement + source[end_idx:]


def main() -> int:
    if not os.path.exists(S5_PATH):
        print(f"[FATAL] expected {S5_PATH}", file=sys.stderr)
        return 5
    if not os.path.exists(NEW_MODULE_PATH):
        print(
            f"[FATAL] patch 1 has not applied; missing {NEW_MODULE_PATH}",
            file=sys.stderr,
        )
        return 5

    with open(S5_PATH, "r", encoding="utf-8") as fh:
        source = fh.read()

    # Pre-flight: confirm we are running against the expected base state.
    fully_already_applied = (
        IMPORT_MARKER in source
        and METHOD_MARKER in source
    )

    if fully_already_applied:
        print("[refactor-s5-write] SKIP - already fully applied")
        return 0

    # Edit 1: add import (idempotent)
    source = apply_replace(source, IMPORT_OLD, IMPORT_NEW, "add-import")

    # Edit 2: replace method body (range-delete-replace)
    source = apply_range_delete_replace(
        source, METHOD_OLD_START, METHOD_OLD_END, METHOD_NEW, "replace-method"
    )

    with open(S5_PATH, "w", encoding="utf-8") as fh:
        fh.write(source)

    # Evidence checks
    evidence = {
        "importAdded": IMPORT_MARKER in source,
        "methodDelegation": METHOD_MARKER in source,
        "oldGuidesRemoved": '        guides = {' not in source,
        "oldRuEntryRemoved": '"ru": (\n                "Russian (ru): HEAVY localization.' not in source,
        "oldJaEntryRemoved": '"ja": (\n                "Japanese (ja): HEAVY katakana' not in source,
        "oldGlobalRulesRemoved": "SCRIPT-MIXING IS FORBIDDEN (severity: critical)" not in source,
        "callSiteIntact": "{self._build_nativeness_block(brief.style.language)}" in source,
        "writeStageClassIntact": "class WriteStage:" in source,
        "generateEmailIntact": "def generate_email(" in source,
        "buildUserContentIntact": "def _build_user_content(" in source,
        "buildMasterPromptIntact": "def _build_master_prompt(" in source,
        "callOpusIntact": "llm.call_opus(" in source,
        "normalizeLanguageCodeImportIntact": (
            "from core.locale_utils import normalize_language_code" in source
        ),
        "newImportFirstAppearance": source.count(
            "from core.nativeness_guides import build_nativeness_block"
        ) == 1,
        "methodSignatureIntact": (
            "def _build_nativeness_block(self, language_tag: str) -> str:" in source
        ),
        "noStrayGuidesReferences": "lang_guide = guides.get(" not in source,
    }
    print(f"[refactor-s5-write] [evidence] {evidence}")
    failing = [k for k, v in evidence.items() if not v]
    if failing:
        print(f"[refactor-s5-write] FAIL - {failing}", file=sys.stderr)
        return 4
    print("[refactor-s5-write] DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
