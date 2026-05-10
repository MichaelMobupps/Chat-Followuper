#!/usr/bin/env node
/**
 * Ticket edit-message-capability — FE lib/api/prospects.ts
 *
 * Single edit: add firstMessageBody to UpdateProspectInput type.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/lib/api/prospects.ts",
);

const OLD = `  campaignId?: string | null;
};`;

const NEW = `  campaignId?: string | null;
  /** First message body — manually edited via the prospect detail
   *  page. Null clears the field. Backed by PATCH /prospects/:id.
   *  Added in Ticket edit-message-capability. */
  firstMessageBody?: string | null;
};`;

const MARKER = `Added in Ticket edit-message-capability`;

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
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

const r = applyEdit("update-input-type", source, OLD, NEW, MARKER);
if (!r.ok) process.exit(3);
writeFileSync(FILE, r.source, "utf8");

const evidence = {
  fieldAdded: countOccurrences(r.source, "firstMessageBody?: string | null;") === 1,
  ticketMarker: countOccurrences(r.source, "Added in Ticket edit-message-capability") === 1,
};
console.log("[fe-api] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[fe-api] FAIL"); process.exit(4);
}
console.log("[fe-api] DONE");
