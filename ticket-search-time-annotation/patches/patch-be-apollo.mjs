#!/usr/bin/env node
/**
 * Ticket search-time-annotation — BE services/apollo.ts
 *
 * Two atomic edits:
 *   1. Add existingProspectId field to ApolloPersonSummary interface
 *      (next to existingPhone — both are "skip reveal" markers)
 *   2. mapPerson initializes existingProspectId to null (route handler
 *      annotates with actual values via DB cross-reference)
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/apollo.ts",
);

// ─── Edit 1 — interface field ─────────────────────────────────────
// Anchor on the existingPhone field declaration (single occurrence
// in the type). Insert new field immediately after.
const E1_OLD = `  existingPhone: string | null;`;

const E1_NEW = `  existingPhone: string | null;
  /** Prospect ID if a prospect with this Apollo person ID already
   *  exists for the requesting user. Set by routes/apollo.ts after
   *  searchPeople returns; mapPerson initializes to null. The FE
   *  bulk grid renders these candidates as not-selectable so the
   *  reveal call never fires (would burn 8c on a dupe). Added in
   *  Ticket search-time-annotation. */
  existingProspectId: string | null;`;

const E1_MARKER = `existingProspectId: string | null`;

// ─── Edit 2 — mapPerson default ───────────────────────────────────
// Anchor on the existingPhone assignment in mapPerson's return.
// Insert existingProspectId: null immediately after.
const E2_OLD = `    existingPhone: pickPhone(raw),`;

const E2_NEW = `    existingPhone: pickPhone(raw),
    existingProspectId: null,`;

const E2_MARKER = `existingProspectId: null,`;

// ─── applyEdit ────────────────────────────────────────────────────

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

const r1 = applyEdit("be-interface", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("be-mapperson", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  interfaceField: countOccurrences(source, "existingProspectId: string | null") === 1,
  mappersonDefault: countOccurrences(source, "existingProspectId: null,") === 1,
  existingPhonePreserved: countOccurrences(source, "existingPhone: string | null") === 1,
};
console.log("[be-apollo] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[be-apollo] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[be-apollo] DONE");
process.exit(0);
