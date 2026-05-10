#!/usr/bin/env node
/**
 * Ticket bulk-credit-truth — RevealConfirmDialog patches
 *
 * artifacts/dashboard/src/components/whatsapp-bulk/RevealConfirmDialog.tsx
 *
 * Three atomic anchored edits:
 *   1. C1 — totalCredits math: `yes * 1 + maybe * 8` → `(yes + maybe) * 8`
 *      Both cost 8 credits per reveal; the old asymmetric math was wrong.
 *   2. C1 — breakdown numbers in the cost table: yes line was `{yes} × 1`,
 *      should be `{yes} × 8`.
 *   3. C1 — replace the wishy-washy "credits not refunded if a reveal
 *      fails" sentence with a prominent warning that includes the actual
 *      Apollo behavior (yes-tagged reveals can also return empty).
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/whatsapp-bulk/RevealConfirmDialog.tsx",
);

// ──────────────────────────────────────────────────────────────────
// Edit 1 — fix totalCredits math
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `  const totalCredits = yes * 1 + maybe * 8;`;
const E1_NEW = `  const totalCredits = (yes + maybe) * 8;`;
const E1_MARKER = `const totalCredits = (yes + maybe) * 8;`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — fix yes-line breakdown numbers
//
// Was: {yes} × 1 = {yes} credits
// New: {yes} × 8 = {yes * 8} credits
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `                <div className="flex justify-between">
                  <span>Sync reveals (phone cached):</span>
                  <span className="font-mono">
                    {yes} × 1 = {yes} credits
                  </span>
                </div>`;

const E2_NEW = `                <div className="flex justify-between">
                  <span>Sync reveals (phone cached):</span>
                  <span className="font-mono">
                    {yes} × 8 = {yes * 8} credits
                  </span>
                </div>`;

const E2_MARKER = `{yes} × 8 = {yes * 8} credits`;

// ──────────────────────────────────────────────────────────────────
// Edit 3 — replace warning sentence with prominent block
//
// The original sentence "Apollo credits are not refunded if a reveal
// fails" buried the warning in a paragraph. Replace with explicit
// language about Apollo's real behavior — "yes" reveals can return
// empty too, and it costs the same 8 credits either way.
// ──────────────────────────────────────────────────────────────────

const E3_OLD = `              <p>
                This will spend Apollo credits and create prospect records.
                Apollo credits are not refunded if a reveal fails.
              </p>`;

const E3_NEW = `              <p>
                This will spend Apollo credits and create prospect records.
              </p>
              <p className="text-amber-700 dark:text-amber-400 font-medium">
                ⚠ Each reveal costs 8 credits regardless of "yes" or "maybe"
                tag. Credits are NOT refunded when Apollo returns no phone —
                this happens occasionally even on "yes" reveals.
              </p>`;

const E3_MARKER = `⚠ Each reveal costs 8 credits regardless`;

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

const r1 = applyEdit("c1-math", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("c1-breakdown", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

const r3 = applyEdit("c1-warning", source, E3_OLD, E3_NEW, E3_MARKER);
if (!r3.ok) process.exit(3);
source = r3.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  mathFixed: countOccurrences(source, "(yes + maybe) * 8") === 1,
  oldMathGone: countOccurrences(source, "yes * 1 + maybe * 8") === 0,
  breakdownFixed: countOccurrences(source, "{yes} × 8 = {yes * 8} credits") === 1,
  oldBreakdownGone: countOccurrences(source, "{yes} × 1 = {yes} credits") === 0,
  warningPresent: countOccurrences(source, "⚠ Each reveal costs 8 credits regardless") === 1,
  oldWarningGone: countOccurrences(source, "Apollo credits are not refunded if a reveal fails") === 0,
};
console.log("[bulk-credit-truth-dialog] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[bulk-credit-truth-dialog] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[bulk-credit-truth-dialog] DONE");
process.exit(0);
