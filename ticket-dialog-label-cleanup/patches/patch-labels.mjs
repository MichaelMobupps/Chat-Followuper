#!/usr/bin/env node
/**
 * Ticket dialog-label-cleanup — fix misleading reveal-breakdown labels
 *
 * artifacts/dashboard/src/components/whatsapp-bulk/RevealConfirmDialog.tsx
 *
 * Two atomic edits:
 *   1. "Sync reveals (phone cached):" → "Sync reveals (yes-tagged):"
 *   2. "Async reveals (bulk_match):" → "Async reveals (maybe-tagged):"
 *
 * Why: after the bulk-already-revealed-free ticket, the dialog has
 * three rows: yes-tagged sync reveals, maybe-tagged async reveals,
 * and "Already revealed (free)". The original "(phone cached)"
 * parenthetical for sync reveals is now actively misleading — phone
 * cached actually means existingPhone (the free row), not yes-tagged.
 * The "(bulk_match)" parenthetical is a low-level Apollo API name
 * which doesn't carry meaning for SDRs.
 *
 * New labels align with the badge text ("yes (8c)" / "maybe (8c)" /
 * "ready (free)") so the dialog and grid speak the same language.
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
// Edit 1 — "Sync reveals (phone cached)" → "Sync reveals (yes-tagged)"
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `<span>Sync reveals (phone cached):</span>`;
const E1_NEW = `<span>Sync reveals (yes-tagged):</span>`;
const E1_MARKER = `Sync reveals (yes-tagged):`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — "Async reveals (bulk_match)" → "Async reveals (maybe-tagged)"
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `<span>Async reveals (bulk_match):</span>`;
const E2_NEW = `<span>Async reveals (maybe-tagged):</span>`;
const E2_MARKER = `Async reveals (maybe-tagged):`;

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

const r1 = applyEdit("sync-label", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("async-label", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  syncLabel: countOccurrences(source, "Sync reveals (yes-tagged):") === 1,
  asyncLabel: countOccurrences(source, "Async reveals (maybe-tagged):") === 1,
  oldSyncGone: countOccurrences(source, "Sync reveals (phone cached)") === 0,
  oldAsyncGone: countOccurrences(source, "Async reveals (bulk_match)") === 0,
};
console.log("[dialog-label-cleanup] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[dialog-label-cleanup] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[dialog-label-cleanup] DONE");
process.exit(0);
