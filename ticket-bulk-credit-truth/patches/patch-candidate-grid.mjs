#!/usr/bin/env node
/**
 * Ticket bulk-credit-truth — CandidateGrid patches
 *
 * artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx
 *
 * Four atomic anchored edits:
 *   1. C1 — REVEAL_COST_YES: 1 → 8 (actual Apollo reveal cost is 8
 *      regardless of yes/maybe tag; 1c was wrong). Auto-fixes the
 *      "yes (1c)" badge label and live cost estimator since both
 *      use the constant.
 *   2. C1 — Cost summary text: collapse the now-redundant breakdown
 *      `{yes} × 8 + {maybe} × 8` into `{total} × 8c` and add inline
 *      "non-refundable" reminder.
 *   3. C2 — showMaybe default: true → false. Hide high-risk maybes
 *      until SDR explicitly opts in.
 *   4. C5 — hasEmail default: false → true. Filter to email-verified
 *      candidates by default; correlates with higher reveal-success rate.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx",
);

// ──────────────────────────────────────────────────────────────────
// Edit 1 — fix REVEAL_COST_YES constant
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `const REVEAL_COST_YES = 1;`;
const E1_NEW = `const REVEAL_COST_YES = 8;`;
// Marker = the new value; the old "= 1" no longer present after patch
const E1_MARKER = `const REVEAL_COST_YES = 8;`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — simplify cost summary text
//
// With both costs = 8 the breakdown formula is redundant. Collapse to
// "{total} × 8c — non-refundable" which is honest about the cost AND
// includes the warning inline.
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `                    Est. {cost.total} credits ({cost.yes} yes × {REVEAL_COST_YES} +{" "}
                    {cost.maybe} maybe × {REVEAL_COST_MAYBE})`;

const E2_NEW = `                    Est. {cost.total} credits ({cost.yes + cost.maybe}{" "}
                    × {REVEAL_COST_YES}c, non-refundable)`;

const E2_MARKER = `× {REVEAL_COST_YES}c, non-refundable`;

// ──────────────────────────────────────────────────────────────────
// Edit 3 — showMaybe default false
// ──────────────────────────────────────────────────────────────────

const E3_OLD = `    hideNoPhone: true,
    showMaybe: true,
    hasEmail: false,`;

const E3_NEW = `    hideNoPhone: true,
    showMaybe: false,
    hasEmail: true,`;

const E3_MARKER = `    showMaybe: false,
    hasEmail: true,`;

// ──────────────────────────────────────────────────────────────────
// applyEdit
// ──────────────────────────────────────────────────────────────────

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) {
    console.log(`[${label}] SKIP — already applied`);
    return { source, ok: true };
  }
  if (o === 0) {
    console.log(`[${label}] NOOP — anchor not found`);
    return { source, ok: false };
  }
  if (o > 1) {
    console.log(`[${label}] FAIL — anchor matched ${o} times`);
    return { source, ok: false };
  }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const r1 = applyEdit("c1-cost-constant", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("c1-cost-summary", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

const r3 = applyEdit("c2-c5-defaults", source, E3_OLD, E3_NEW, E3_MARKER);
if (!r3.ok) process.exit(3);
source = r3.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  costConstantFixed: countOccurrences(source, "const REVEAL_COST_YES = 8;") === 1,
  oldCostGone: countOccurrences(source, "const REVEAL_COST_YES = 1;") === 0,
  summaryUpdated: countOccurrences(source, "non-refundable") === 1,
  oldSummaryGone: countOccurrences(source, "{cost.yes} yes × {REVEAL_COST_YES}") === 0,
  showMaybeDefaultsFalse: countOccurrences(source, "showMaybe: false,") === 1,
  hasEmailDefaultsTrue: countOccurrences(source, "hasEmail: true,") === 1,
};
console.log("[bulk-credit-truth-grid] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[bulk-credit-truth-grid] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[bulk-credit-truth-grid] DONE");
process.exit(0);
