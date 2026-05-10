#!/usr/bin/env node
/**
 * Ticket bulk-titles-parity — expand DEFAULT_TITLES to match email
 * prospector's coverage.
 *
 * artifacts/dashboard/src/components/whatsapp-bulk/UrlInput.tsx
 *
 * Replaces the 7 specific Capitalized titles with 28 lowercase fuzzy-
 * match terms drawn from the email prospector's PRIMARY_TITLES +
 * SECONDARY_TITLES + EXEC_FALLBACK_TITLES (see prospector/stages/
 * s3_enrich.py:237-252 in the email prospector source).
 *
 * Why lowercase fuzzy terms beat specific Capitalized titles:
 * Apollo's `person_titles` parameter does partial/contains matching.
 * "growth" matches "Head of Growth", "VP Growth", "Growth PM",
 * "Senior Growth Marketing Manager", etc. 28 broad terms in one call
 * yields more candidates than 30 specific titles. This is what the
 * email prospector has been using successfully.
 *
 * The string is the initial value of an editable textarea — user can
 * still customize per-search.
 *
 * Single anchored edit. Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/whatsapp-bulk/UrlInput.tsx",
);

const EDIT_OLD = `const DEFAULT_TITLES =
  "Head of Growth, VP Marketing, Marketing Director, UA Manager, User Acquisition Manager, Performance Marketing Manager, CMO";`;

const EDIT_NEW = `const DEFAULT_TITLES =
  // Mirrors the email prospector's title strategy (PRIMARY + SECONDARY
  // + EXEC_FALLBACK from prospector/stages/s3_enrich.py:237-252).
  // Lowercase fuzzy-match terms — Apollo's person_titles does partial
  // matching, so "growth" catches "Head of Growth", "VP Growth", etc.
  // The textarea remains editable; user can override per-search.
  "user acquisition, ua, growth, performance marketing, paid acquisition, paid media, digital marketing, media buying, customer acquisition, marketing manager, growth marketing, business development, partnerships, strategic partnerships, growth partnerships, marketing director, marketing lead, ceo, chief executive, founder, co-founder, cmo, chief marketing, vp marketing, head of marketing, director of marketing, vp growth, head of growth";`;

// Marker = lowercase phrase unique to the new content. The OLD content
// has "User Acquisition Manager" (capitalized) but never the lowercase
// "user acquisition, ua, growth," sequence.
const EDIT_MARKER = `"user acquisition, ua, growth, performance marketing,`;

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const m = countOccurrences(source, EDIT_MARKER);
const o = countOccurrences(source, EDIT_OLD);

if (m > 0) {
  console.log("[bulk-titles-parity] SKIP — already applied");
  process.exit(0);
}
if (o === 0) {
  console.log("[bulk-titles-parity] NOOP — anchor not found");
  process.exit(3);
}
if (o > 1) {
  console.log(`[bulk-titles-parity] FAIL — anchor matched ${o} times`);
  process.exit(3);
}

writeFileSync(FILE, source.replace(EDIT_OLD, EDIT_NEW), "utf8");
const next = readFileSync(FILE, "utf8");

const evidence = {
  newDefaultPresent: countOccurrences(next, EDIT_MARKER) === 1,
  oldDefaultGone: countOccurrences(next, "Head of Growth, VP Marketing, Marketing Director, UA Manager") === 0,
  hasGrowthMarketing: countOccurrences(next, "growth marketing") >= 1,
  hasFounder: countOccurrences(next, "founder, co-founder") === 1,
  hasMediaBuying: countOccurrences(next, "media buying") === 1,
};
console.log("[bulk-titles-parity] APPLY — patch applied");
console.log("[bulk-titles-parity] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[bulk-titles-parity] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
