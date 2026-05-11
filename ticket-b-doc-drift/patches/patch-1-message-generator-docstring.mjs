#!/usr/bin/env node
/**
 * Ticket B-doc-drift, patch 1/1: services/messageGenerator.ts
 *
 * One atomic edit: fix the DRAFT model label in the file-header docstring.
 *
 * Current state (line 5):
 *     *   1. DRAFT     (Sonnet 4.6)  [em-dash] initial message ...
 *
 * Actual code (line 117):
 *     const DRAFT_MODEL = "claude-opus-4-7";
 *
 * The docstring drifted when the Draft model was promoted from Sonnet
 * to Opus. CRITIC (line 6, "(Opus 4.7)") and REWRITE (line 7, "(Sonnet 4.6)")
 * are already correct and match their consts. Only the DRAFT label is wrong.
 *
 * Em-dash rule: the source line 5 contains a U+2014 em-dash between the
 * model name and the description. Anchor ENDS at the closing paren plus
 * the two trailing spaces so the em-dash never touches the OLD string.
 *
 * Column alignment: the em-dashes on lines 5, 6, 7 all sit at the same
 * column. "(Sonnet 4.6)" is 12 chars, "(Opus 4.7)" is 10. To keep the
 * em-dash at its current column, replace the 2 trailing spaces in OLD
 * with 4 trailing spaces in NEW so total width is preserved.
 *
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messageGenerator.ts",
);

// =================================================================
// Edit 1 - DRAFT docstring line: Sonnet 4.6 -> Opus 4.7
// =================================================================
//
// OLD ends with two spaces (column 30 of the file: ") "), stopping
// before the em-dash. NEW substitutes "Opus 4.7" and pads with two
// additional spaces (four total) to keep the em-dash column unchanged.
//
// Uniqueness: "1. DRAFT" appears only in the pipeline docstring; the
// rest of the file uses DRAFT_MODEL, draftModel, generateDraft, etc.

const E1_OLD = ` *   1. DRAFT     (Sonnet 4.6)  `;
const E1_NEW = ` *   1. DRAFT     (Opus 4.7)    `;
const E1_MARKER = `1. DRAFT     (Opus 4.7)`;

// =================================================================
// applyEdit helper - same shape as ticket-b-critic-categories
// =================================================================

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) { console.log(`[${label}] SKIP - already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP - anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL - anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

for (const [label, oldStr, newStr, marker] of [
  ["draft-docstring-model", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

// =================================================================
// Evidence - confirm the post-state
// =================================================================

const evidence = {
  draftDocstringFixed: source.includes(`1. DRAFT     (Opus 4.7)`),
  oldDraftLabelGone: !source.includes(`1. DRAFT     (Sonnet 4.6)`),
  criticDocstringUnchanged: source.includes(`2. CRITIC    (Opus 4.7)`),
  rewriteDocstringUnchanged: source.includes(`3. REWRITE   (Sonnet 4.6)`),
  draftConstUnchanged: source.includes(`const DRAFT_MODEL = "claude-opus-4-7"`),
  criticConstUnchanged: source.includes(`const CRITIC_MODEL = "claude-opus-4-7"`),
  rewriterConstUnchanged: source.includes(`const REWRITER_MODEL = "claude-sonnet-4-6"`),
};
console.log("[message-generator-docstring] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[message-generator-docstring] FAIL"); process.exit(4);
}
console.log("[message-generator-docstring] DONE");
