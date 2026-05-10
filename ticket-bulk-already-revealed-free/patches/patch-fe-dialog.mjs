#!/usr/bin/env node
/**
 * Ticket bulk-already-revealed-free — FE RevealConfirmDialog.tsx
 *
 * Two atomic edits:
 *   1. yes/maybe filters exclude existingPhone candidates; track free
 *      count separately. This makes the dialog's totalCredits match
 *      processOne's actual Apollo charges (existingPhone candidates
 *      skip both reveal paths).
 *   2. Add "Already revealed (free)" row in the cost breakdown JSX
 *      between async and total rows; only renders when free > 0.
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
// Edit 5.1 — yes/maybe filters exclude existingPhone, add free count
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `  const yes = selected.filter((c) => c.person.directPhoneStatus === "yes").length;
  const maybe = selected.filter((c) => c.person.directPhoneStatus === "maybe").length;
  const totalCredits = (yes + maybe) * 8;`;

const E1_NEW = `  // existingPhone candidates skip both reveal paths in processOne — they
  // contribute zero to credit cost. Filter them out of yes/maybe so the
  // breakdown matches actual Apollo charges. Added in Ticket
  // bulk-already-revealed-free.
  const yes = selected.filter(
    (c) => c.person.directPhoneStatus === "yes" && !c.person.existingPhone,
  ).length;
  const maybe = selected.filter(
    (c) => c.person.directPhoneStatus === "maybe" && !c.person.existingPhone,
  ).length;
  const free = selected.filter((c) => Boolean(c.person.existingPhone)).length;
  const totalCredits = (yes + maybe) * 8;`;

const E1_MARKER = `existingPhone candidates skip both reveal paths in processOne`;

// ──────────────────────────────────────────────────────────────────
// Edit 5.2 — add "Already revealed (free)" row in cost breakdown
//
// Anchor includes the async row + total row to ensure unique placement
// (insert between).
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `                <div className="flex justify-between">
                  <span>Async reveals (bulk_match):</span>
                  <span className="font-mono">
                    {maybe} × 8 = {maybe * 8} credits
                  </span>
                </div>
                <div className="flex justify-between border-t pt-1 mt-1 font-medium">`;

const E2_NEW = `                <div className="flex justify-between">
                  <span>Async reveals (bulk_match):</span>
                  <span className="font-mono">
                    {maybe} × 8 = {maybe * 8} credits
                  </span>
                </div>
                {free > 0 && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                    <span>Already revealed (free):</span>
                    <span className="font-mono">{free} × 0 credits</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 mt-1 font-medium">`;

const E2_MARKER = `<span>Already revealed (free):</span>`;

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

const r1 = applyEdit("dialog-math", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("dialog-breakdown", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  freeCountComputed: countOccurrences(source, "Boolean(c.person.existingPhone)") === 1,
  yesExcludesExistingPhone: countOccurrences(source, `directPhoneStatus === "yes" && !c.person.existingPhone`) === 1,
  maybeExcludesExistingPhone: countOccurrences(source, `directPhoneStatus === "maybe" && !c.person.existingPhone`) === 1,
  freeRowJsx: countOccurrences(source, "Already revealed (free):") === 1,
  oldYesFilterGone: countOccurrences(source, `const yes = selected.filter((c) => c.person.directPhoneStatus === "yes").length;`) === 0,
};
console.log("[bulk-already-revealed-free-dialog] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[bulk-already-revealed-free-dialog] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[bulk-already-revealed-free-dialog] DONE");
process.exit(0);
