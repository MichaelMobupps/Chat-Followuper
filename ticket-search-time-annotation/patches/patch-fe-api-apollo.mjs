#!/usr/bin/env node
/**
 * Ticket search-time-annotation — FE lib/api/apollo.ts
 *
 * Single edit: add existingProspectId to FE ApolloPersonSummary
 * mirror, matching the BE type extension.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/lib/api/apollo.ts",
);

// Anchor on existingPhone field (single occurrence in FE type).
// Insert new field immediately after.
const OLD = `  existingPhone: string | null;`;

const NEW = `  existingPhone: string | null;
  /** Prospect ID if a prospect with this Apollo person ID already
   *  exists for the requesting user. Mirrors BE ApolloPersonSummary.
   *  Bulk grid renders these candidates as not-selectable. Added in
   *  Ticket search-time-annotation. */
  existingProspectId: string | null;`;

const MARKER = `existingProspectId: string | null`;

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

const r = applyEdit("fe-type-mirror", source, OLD, NEW, MARKER);
if (!r.ok) process.exit(3);
source = r.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  fieldPresent: countOccurrences(source, "existingProspectId: string | null") === 1,
  existingPhonePreserved: countOccurrences(source, "existingPhone: string | null") === 1,
};
console.log("[fe-api-apollo] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[fe-api-apollo] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[fe-api-apollo] DONE");
process.exit(0);
