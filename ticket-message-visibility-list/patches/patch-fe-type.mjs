#!/usr/bin/env node
/**
 * Ticket message-visibility-list — FE lib/api/prospects.ts
 *
 * Single edit: add firstMessageBody to ProspectListItem type, mirroring
 * the BE addition. Inserted between phoneRevealStatus and firstMessageChannel
 * to match the BE ordering.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/lib/api/prospects.ts",
);

// Anchor on the 2-line block specific to ProspectListItem. The full
// Prospect type orders fields differently (firstMessageBody comes
// BEFORE firstMessageChannel), so this exact phoneRevealStatus →
// firstMessageChannel adjacency is unique to ProspectListItem.
const OLD = `  phoneRevealStatus: string;
  firstMessageChannel: string | null;`;

const NEW = `  phoneRevealStatus: string;
  /** Full message body. Null if generation hasn't run yet (e.g., for
   *  phone-pending prospects) or it failed. Used by the prospects-list
   *  table to render a preview snippet. Mirrors BE list response.
   *  Added in Ticket message-visibility-list. */
  firstMessageBody: string | null;
  firstMessageChannel: string | null;`;

// Marker uses the unique ticket name suffix (single-line substring,
// avoids the JSDoc line-break trap). The BE has its own copy of
// firstMessageBody in the full Prospect type at line 61, so the bare
// `firstMessageBody: string | null;` line alone isn't unique.
const MARKER = `message-visibility-list`;

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
  if (m > 0) { console.log(`[${label}] SKIP — already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP — anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL — anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

const r = applyEdit("fe-list-type", source, OLD, NEW, MARKER);
if (!r.ok) process.exit(3);
writeFileSync(FILE, r.source, "utf8");

const evidence = {
  ticketMarkerPresent:
    countOccurrences(r.source, "message-visibility-list") === 1,
  // The full Prospect type's firstMessageBody is preserved (still 1 occurrence
  // of its specific neighbor, firstMessageBody followed by firstMessageChannel).
  // After patch ProspectListItem also has firstMessageBody, so total count is 2.
  bothTypesHaveBody:
    countOccurrences(r.source, "firstMessageBody: string | null;") === 2,
};
console.log("[fe-list-type] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[fe-list-type] FAIL"); process.exit(4);
}
console.log("[fe-list-type] DONE");
