#!/usr/bin/env node
/**
 * Ticket message-visibility-list — BE routes/prospects.ts
 *
 * Single edit: add firstMessageBody to the list response mapping.
 * The select clause already pulls it from the DB; only the response
 * shape was hiding it behind hasFirstMessage: boolean.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/routes/prospects.ts",
);

// Anchor on the consecutive 2-line block in the rows.map() response
// builder. phoneRevealStatus → firstMessageChannel sequence is unique
// to this mapping (the SELECT clause uses prospectsTable.* refs).
const OLD = `      phoneRevealStatus: r.phoneRevealStatus,
      firstMessageChannel: r.firstMessageChannel,`;

const NEW = `      phoneRevealStatus: r.phoneRevealStatus,
      firstMessageBody: r.firstMessageBody,
      firstMessageChannel: r.firstMessageChannel,`;

const MARKER = `firstMessageBody: r.firstMessageBody,`;

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

const r = applyEdit("expose-body", source, OLD, NEW, MARKER);
if (!r.ok) process.exit(3);
writeFileSync(FILE, r.source, "utf8");

const evidence = {
  bodyExposed: countOccurrences(r.source, "firstMessageBody: r.firstMessageBody,") === 1,
  hasFirstMessageStillThere:
    countOccurrences(r.source, "hasFirstMessage: r.firstMessageBody !== null") === 1,
};
console.log("[be-list-body] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[be-list-body] FAIL"); process.exit(4);
}
console.log("[be-list-body] DONE");
