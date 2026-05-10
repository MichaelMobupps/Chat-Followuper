#!/usr/bin/env node
/**
 * Ticket 2.3-BE-A — anchored idempotent patch for
 *   artifacts/api-server/src/services/apollo.ts
 *
 * Two surgical edits:
 *
 *   1. Extend the ApolloPersonSummary interface with three new fields:
 *      directPhoneStatus, hasEmail, lastNameObfuscated.
 *
 *   2. Insert a mapDirectPhoneStatus helper directly above mapPerson, and
 *      update mapPerson to populate the three new fields via a defensive
 *      cast on raw (avoids touching RawApolloPerson, since the new fields
 *      only appear on /mixed_people/api_search responses).
 *
 * Idempotency:
 *   Each edit checks for the NEW marker before applying. If the marker
 *   is already present the edit emits SKIP and returns. This makes the
 *   patch safe to re-run after a partial apply or after a manual edit
 *   that already added one of the two changes.
 *
 * Output contract (per edit):
 *   APPLY → edit applied
 *   SKIP  → already applied (new marker present, old anchor absent)
 *   NOOP  → no anchor and no marker — file is in an unexpected state;
 *           operator must inspect manually
 *   FAIL  → anchor matched zero or multiple times; operator inspect
 *
 * Exit code: 0 on success (APPLY/SKIP/NOOP all considered safe completion),
 *            non-zero on FAIL (anchor mismatch).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/apollo.ts",
);

// ──────────────────────────────────────────────────────────────────────
// Edit 1: ApolloPersonSummary interface extension
// ──────────────────────────────────────────────────────────────────────

const EDIT1_OLD = `export interface ApolloPersonSummary {
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

const EDIT1_NEW = `export interface ApolloPersonSummary {
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
  /** 3-state direct phone availability indicator from Apollo's people
   *  search. Added in Ticket 2.3-BE-A.
   *  - "yes":   Apollo has a verified direct phone — sync revealContact
   *             returns it (1 credit).
   *  - "maybe": not cached; bulk_match may find it via the async
   *             requestPhoneReveal webhook flow (8 credits).
   *  - "no":    Apollo will not find a direct phone — skip (0 credits).
   *  Derived from raw.has_direct_phone in the search response. */
  directPhoneStatus: "yes" | "maybe" | "no";
  /** True if Apollo has a verified email cached for this person.
   *  Derived from raw.has_email. Added in Ticket 2.3-BE-A. */
  hasEmail: boolean;
  /** Obfuscated last name as returned by Apollo's people search
   *  (e.g. "Gi***l"). Full last_name only available after revealContact.
   *  Useful for the bulk multi-select grid (2.3-FE) to show enough
   *  identity for SDR recognition without bypassing the credit gate.
   *  Null when Apollo doesn't surface it. Added in Ticket 2.3-BE-A. */
  lastNameObfuscated: string | null;
}`;

// Marker used to detect an already-applied edit (any one of the new
// fields is fine; pick the most distinctive).
const EDIT1_MARKER = `directPhoneStatus: "yes" | "maybe" | "no";`;

// ──────────────────────────────────────────────────────────────────────
// Edit 2: insert mapDirectPhoneStatus + extend mapPerson
// ──────────────────────────────────────────────────────────────────────

const EDIT2_OLD = `function mapPerson(raw: RawApolloPerson): ApolloPersonSummary {
  return {
    id: raw.id ?? "",
    firstName: raw.first_name ?? null,
    lastName: raw.last_name ?? null,
    name: raw.name ?? null,
    title: raw.title ?? null,
    organizationId: raw.organization_id ?? raw.organization?.id ?? null,
    organizationName: raw.organization?.name ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    country: raw.country ?? null,
    linkedinUrl: raw.linkedin_url ?? null,
  };
}`;

const EDIT2_NEW = `/**
 * Map Apollo's free-form has_direct_phone string into our 3-state enum.
 * Observed values from /api/v1/mixed_people/api_search:
 *   - "Yes" — Apollo has a cached direct phone
 *             (revealContact returns it for 1 credit)
 *   - "Maybe: please request direct dial via people/bulk_match" —
 *             async only, 8 credits via requestPhoneReveal webhook
 *   - absent or anything else — treat as no phone (fail-closed)
 *
 * Defensive: any value we don't explicitly recognize maps to "no" so a
 * future Apollo wording change doesn't accidentally route SDRs to a paid
 * reveal endpoint that won't return a phone. Added in Ticket 2.3-BE-A.
 */
function mapDirectPhoneStatus(raw: string | undefined): "yes" | "maybe" | "no" {
  if (!raw) return "no";
  if (raw === "Yes") return "yes";
  if (raw.startsWith("Maybe")) return "maybe";
  return "no";
}

function mapPerson(raw: RawApolloPerson): ApolloPersonSummary {
  // Defensive cast for fields that only appear on
  // /mixed_people/api_search responses (not on /people/match enrich).
  // Avoids forcing every caller of RawApolloPerson to also be updated.
  const rawSearch = raw as RawApolloPerson & {
    last_name_obfuscated?: string;
    has_direct_phone?: string;
    has_email?: boolean;
  };
  return {
    id: raw.id ?? "",
    firstName: raw.first_name ?? null,
    lastName: raw.last_name ?? null,
    name: raw.name ?? null,
    title: raw.title ?? null,
    organizationId: raw.organization_id ?? raw.organization?.id ?? null,
    organizationName: raw.organization?.name ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    country: raw.country ?? null,
    linkedinUrl: raw.linkedin_url ?? null,
    directPhoneStatus: mapDirectPhoneStatus(rawSearch.has_direct_phone),
    hasEmail: rawSearch.has_email === true,
    lastNameObfuscated:
      typeof rawSearch.last_name_obfuscated === "string"
        ? rawSearch.last_name_obfuscated
        : null,
  };
}`;

const EDIT2_MARKER = `function mapDirectPhoneStatus(raw: string | undefined):`;

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
  const markerCount = countOccurrences(source, marker);
  const oldCount = countOccurrences(source, oldStr);

  if (markerCount > 0 && oldCount === 0) {
    console.log(`[${label}] SKIP — marker present, anchor absent (already applied)`);
    return { source, applied: false, ok: true };
  }
  if (markerCount === 0 && oldCount === 0) {
    console.log(`[${label}] NOOP — neither anchor nor marker found; file in unexpected state`);
    return { source, applied: false, ok: false };
  }
  if (oldCount > 1) {
    console.log(`[${label}] FAIL — anchor matched ${oldCount} times; expected exactly 1`);
    return { source, applied: false, ok: false };
  }
  if (markerCount > 0 && oldCount > 0) {
    console.log(`[${label}] FAIL — both marker (${markerCount}) and anchor (${oldCount}) present; manual inspection required`);
    return { source, applied: false, ok: false };
  }
  // markerCount === 0 && oldCount === 1 → safe APPLY
  const next = source.replace(oldStr, newStr);
  console.log(`[${label}] APPLY — anchor matched once, replacement applied`);
  return { source: next, applied: true, ok: true };
}

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const before = source;

const e1 = applyEdit("EDIT1 ApolloPersonSummary", source, EDIT1_OLD, EDIT1_NEW, EDIT1_MARKER);
if (!e1.ok) process.exit(3);
source = e1.source;

const e2 = applyEdit("EDIT2 mapPerson + mapDirectPhoneStatus", source, EDIT2_OLD, EDIT2_NEW, EDIT2_MARKER);
if (!e2.ok) process.exit(3);
source = e2.source;

if (source === before) {
  console.log("[result] no changes written (idempotent re-run)");
  process.exit(0);
}

writeFileSync(FILE, source, "utf8");
console.log(`[result] wrote ${FILE}`);

// Evidence: count the new field references for caller-side verification
const evidence = {
  directPhoneStatusInInterface: countOccurrences(source, `directPhoneStatus: "yes" | "maybe" | "no";`),
  mapDirectPhoneStatusFn: countOccurrences(source, `function mapDirectPhoneStatus(raw: string | undefined):`),
  mapPersonPopulatesNewFields: countOccurrences(source, `directPhoneStatus: mapDirectPhoneStatus(rawSearch.has_direct_phone),`),
  hasEmailInInterface: countOccurrences(source, `hasEmail: boolean;`),
  lastNameObfuscatedInInterface: countOccurrences(source, `lastNameObfuscated: string | null;`),
};
console.log("[evidence]", JSON.stringify(evidence));

// All five evidence counts should be exactly 1 after a clean apply.
const allOne = Object.values(evidence).every((v) => v === 1);
if (!allOne) {
  console.log("[result] FAIL — evidence counts not all 1 after apply");
  process.exit(4);
}
process.exit(0);
