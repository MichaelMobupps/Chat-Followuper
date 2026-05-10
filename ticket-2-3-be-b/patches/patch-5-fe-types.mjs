#!/usr/bin/env node
/**
 * Ticket 2.3-BE-B — patch 5/5: FE type mirror for nullable phone
 *
 * artifacts/dashboard/src/lib/api/prospects.ts
 *
 * Two anchored edits:
 *
 *   5A. Prospect.phone: string  →  Prospect.phone: string | null
 *       (the response shape after the schema change)
 *
 *   5B. CreateProspectInput.phone: string  →  phone?: string
 *       (the bulk WhatsApp flow can omit phone when apolloPersonId is
 *       set; the server's superRefine enforces this)
 *
 * No behavior change in the FE today — these are pure type-parity
 * updates so that 2.3-FE can consume the new shape without `as any`
 * casts. The existing seeder flow continues to pass a non-null phone
 * unchanged; TypeScript's nullable narrowing handles the `string |
 * null` access pattern correctly via the existing if-guards.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/lib/api/prospects.ts",
);

// ──────────────────────────────────────────────────────────────────────
// Edit 5A — Prospect.phone nullable
// ──────────────────────────────────────────────────────────────────────

const EDIT_5A_OLD = `  phone: string;
  telegramHandle: string | null;`;

const EDIT_5A_NEW = `  /** Phone (E.164). Null while waiting on async Apollo phone reveal
   *  (bulk WhatsApp flow, Ticket 2.3-BE-B). The webhook handler in
   *  services/apollo.ts promotes phoneNumber → phone via the
   *  correlationId lookup once Apollo's bulk_match resolves. Routes
   *  building wa.me deep links return 409 phone_reveal_pending when
   *  this is null. */
  phone: string | null;
  telegramHandle: string | null;`;

const EDIT_5A_MARKER = `Null while waiting on async Apollo phone reveal`;

// ──────────────────────────────────────────────────────────────────────
// Edit 5B — CreateProspectInput.phone optional
// ──────────────────────────────────────────────────────────────────────

const EDIT_5B_OLD = `export interface CreateProspectInput {
  phone: string;
  sourceMode: SourceMode;`;

const EDIT_5B_NEW = `export interface CreateProspectInput {
  /** Phone (E.164). Optional starting with Ticket 2.3-BE-B: the bulk
   *  WhatsApp flow may create a prospect from Apollo's "Maybe" path
   *  where the phone is unknown until the async webhook lands. When
   *  omitted, apolloPersonId MUST be set (server-side superRefine
   *  cross-field check). */
  phone?: string;
  sourceMode: SourceMode;`;

const EDIT_5B_MARKER = `Optional starting with Ticket 2.3-BE-B`;

// ──────────────────────────────────────────────────────────────────────
// Apply
// ──────────────────────────────────────────────────────────────────────

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0 && o === 0) {
    console.log(`[${label}] SKIP — already applied`);
    return { source, ok: true };
  }
  if (m === 0 && o === 0) {
    console.log(`[${label}] NOOP — neither anchor nor marker found`);
    return { source, ok: false };
  }
  if (o > 1) {
    console.log(`[${label}] FAIL — anchor matched ${o} times`);
    return { source, ok: false };
  }
  if (m > 0 && o > 0) {
    console.log(`[${label}] FAIL — both marker and anchor present`);
    return { source, ok: false };
  }
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const r1 = applyEdit("5A prospect-nullable", source, EDIT_5A_OLD, EDIT_5A_NEW, EDIT_5A_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("5B input-optional", source, EDIT_5B_OLD, EDIT_5B_NEW, EDIT_5B_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  prospectPhoneNullable: countOccurrences(source, "phone: string | null;") >= 1,
  inputPhoneOptional: countOccurrences(source, "phone?: string;") === 1,
  marker5A: countOccurrences(source, EDIT_5A_MARKER) === 1,
  marker5B: countOccurrences(source, EDIT_5B_MARKER) === 1,
};
console.log("[fe-prospects] APPLY — patches applied");
console.log("[fe-prospects] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[fe-prospects] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
