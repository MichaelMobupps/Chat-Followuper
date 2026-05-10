#!/usr/bin/env node
/**
 * Ticket 2.3-BE-A — anchored idempotent patch for
 *   artifacts/dashboard/src/lib/api/apollo.ts
 *
 * Single edit: extend the FE ApolloPersonSummary type mirror with the
 * three new fields added on the backend (directPhoneStatus, hasEmail,
 * lastNameObfuscated). Pure type parity — no behavior change. The bulk
 * multi-select grid in 2.3-FE will consume these fields.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/lib/api/apollo.ts",
);

const EDIT_OLD = `/**
 * Mirrors src/services/apollo.ts ApolloPersonSummary.
 */
export interface ApolloPersonSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  title: string | null;
  organizationId: string | null;
  organizationName: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedinUrl: string | null;
}`;

const EDIT_NEW = `/**
 * Mirrors src/services/apollo.ts ApolloPersonSummary.
 *
 * Updated in Ticket 2.3-BE-A: extended with directPhoneStatus, hasEmail,
 * and lastNameObfuscated to support the bulk multi-select grid in
 * Ticket 2.3-FE. The bulk grid uses these fields to:
 *   - filter people who have direct phone numbers without spending credits
 *   - estimate per-person reveal cost (1 vs 8 credits) before fan-out
 *   - show enough identity (first name + obfuscated last name) for
 *     SDR recognition pre-reveal, then full last_name post-reveal.
 */
export interface ApolloPersonSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  title: string | null;
  organizationId: string | null;
  organizationName: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedinUrl: string | null;
  /** 3-state direct phone availability:
   *  - "yes":   verified direct phone, sync reveal returns it (1 credit)
   *  - "maybe": not cached, bulk_match may find it (8 credits, async)
   *  - "no":    Apollo will not find a direct phone — skip (0 credits) */
  directPhoneStatus: "yes" | "maybe" | "no";
  /** True if Apollo has a verified email cached for this person. */
  hasEmail: boolean;
  /** Obfuscated last name from Apollo's people search (e.g. "Gi***l").
   *  Null when Apollo doesn't surface it. */
  lastNameObfuscated: string | null;
}`;

const EDIT_MARKER = `directPhoneStatus: "yes" | "maybe" | "no";`;

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

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const markerCount = countOccurrences(source, EDIT_MARKER);
const oldCount = countOccurrences(source, EDIT_OLD);

if (markerCount > 0 && oldCount === 0) {
  console.log("[fe-types] SKIP — marker present, anchor absent (already applied)");
  process.exit(0);
}
if (markerCount === 0 && oldCount === 0) {
  console.log("[fe-types] NOOP — neither anchor nor marker found; file in unexpected state");
  process.exit(3);
}
if (oldCount > 1) {
  console.log(`[fe-types] FAIL — anchor matched ${oldCount} times; expected exactly 1`);
  process.exit(3);
}
if (markerCount > 0 && oldCount > 0) {
  console.log(`[fe-types] FAIL — both marker (${markerCount}) and anchor (${oldCount}) present; manual inspection required`);
  process.exit(3);
}

const next = source.replace(EDIT_OLD, EDIT_NEW);
writeFileSync(FILE, next, "utf8");

const evidence = {
  directPhoneStatus: countOccurrences(next, `directPhoneStatus: "yes" | "maybe" | "no";`),
  hasEmail: countOccurrences(next, `hasEmail: boolean;`),
  lastNameObfuscated: countOccurrences(next, `lastNameObfuscated: string | null;`),
};
console.log("[fe-types] APPLY — anchor matched once, replacement applied");
console.log("[fe-types] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => v !== 1)) {
  console.log("[fe-types] FAIL — evidence counts not all 1 after apply");
  process.exit(4);
}
process.exit(0);
