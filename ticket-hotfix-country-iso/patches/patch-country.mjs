#!/usr/bin/env node
/**
 * Ticket hotfix-country-iso — strip non-ISO country before sending to BE
 *
 * artifacts/dashboard/src/pages/prospect/whatsapp.tsx
 *
 * Two atomic edits:
 *   1. Add extractIso2Country helper near top of file
 *   2. Update the `country:` line in processOne's createProspect call
 *      to use the helper
 *
 * Why: BE schema (routes/prospects.ts:280) enforces ISO 3166-1 alpha-2
 * via regex /^[A-Z]{2}$/. Apollo's people-search and org-search responses
 * sometimes return full English country names ("India", "United States")
 * and sometimes ISO codes — inconsistent. The bulk flow was sending the
 * raw value, hitting 400 invalid_body when Apollo gave full names.
 *
 * Defensive: keep ISO codes, drop everything else. Country is not
 * critical for prospect creation; SDR can fill it in via detail page.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/pages/prospect/whatsapp.tsx",
);

// ──────────────────────────────────────────────────────────────────
// Edit 1 — add helper near top of file (after imports, before the
// component). Anchor on the first export line which is unique.
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `export default function ProspectWhatsAppPage() {`;

const E1_NEW = `/**
 * Apollo's people/org search returns country as either a full English
 * name ("India", "United States") or an ISO 3166-1 alpha-2 code ("IN",
 * "US"), inconsistently. The BE schema (routes/prospects.ts) enforces
 * ISO-2 via /^[A-Z]{2}$/. Strip anything that isn't already ISO-2 — we
 * lose the signal for those prospects but don't crash the batch with a
 * 400 invalid_body. Future ticket can add a name → ISO mapping if this
 * loss becomes painful.
 */
function extractIso2Country(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  return undefined;
}

export default function ProspectWhatsAppPage() {`;

const E1_MARKER = `function extractIso2Country(`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — replace the country line in createProspect call
//
// Anchor includes neighboring lines for uniqueness (createProspect is
// only called once in this file, but country: appears as a substring
// elsewhere potentially).
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `        title: c.person.title ?? undefined,
        country: c.person.country ?? c.org.country ?? undefined,
        language: "en",`;

const E2_NEW = `        title: c.person.title ?? undefined,
        country: extractIso2Country(c.person.country ?? c.org.country),
        language: "en",`;

const E2_MARKER = `country: extractIso2Country(`;

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

const r1 = applyEdit("add-helper", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("use-helper", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  helperPresent: countOccurrences(source, "function extractIso2Country(") === 1,
  helperUsed: countOccurrences(source, "country: extractIso2Country(") === 1,
  rawCountryGone: countOccurrences(source, "country: c.person.country ?? c.org.country ?? undefined,") === 0,
};
console.log("[hotfix-country-iso] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[hotfix-country-iso] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[hotfix-country-iso] DONE");
process.exit(0);
