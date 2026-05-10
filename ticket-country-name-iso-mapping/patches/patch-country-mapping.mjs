#!/usr/bin/env node
/**
 * Ticket country-name-iso-mapping — normalize Apollo's country field
 * to ISO 3166-1 alpha-2 codes at the BE source.
 *
 * artifacts/api-server/src/services/apollo.ts
 *
 * Three atomic edits:
 *   1. Add COUNTRY_NAME_TO_ISO2 lookup table + normalizeCountryCode
 *      helper (placed right after pickPhone for locality with other
 *      mapping helpers)
 *   2. mapOrg: country: raw.country ?? null → country: normalizeCountryCode(raw.country)
 *   3. mapPerson: same change
 *
 * Why: earlier today's country-iso hotfix on the FE strips full names
 * to satisfy the strict /^[A-Z]{2}$/ schema, but loses the country
 * signal entirely. Normalizing at the BE preserves it for LLM message
 * generation. ~55 entries cover top UA-prospecting countries.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/apollo.ts",
);

// ──────────────────────────────────────────────────────────────────
// Edit 1 — append COUNTRY_NAME_TO_ISO2 + normalizeCountryCode helper
// after pickPhone
//
// Anchor: full pickPhone function ending. The 4-line return tail is
// almost certainly unique in the file.
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `  if (anySanitized?.sanitized_number) return anySanitized.sanitized_number;
  const anyRaw = numbers.find((n) => n.raw_number);
  return anyRaw?.raw_number ?? null;
}`;

const E1_NEW = `  if (anySanitized?.sanitized_number) return anySanitized.sanitized_number;
  const anyRaw = numbers.find((n) => n.raw_number);
  return anyRaw?.raw_number ?? null;
}

/**
 * Apollo's people-search and org-search responses inconsistently return
 * country as either a full English name ("India", "United States") or
 * an ISO 3166-1 alpha-2 code ("IN", "US"). Downstream prospect schema
 * (routes/prospects.ts) strict-validates ISO-2 via /^[A-Z]{2}$/, so a
 * full-name response would 400 createProspect. Normalize at the BE
 * source so all consumers see a consistent shape.
 *
 * Coverage: ~55 entries covering top UA-prospecting countries. Edge
 * cases (typos, less-common countries, ISO-3 codes) fall through to
 * null — caller drops the country field rather than failing schema.
 *
 * Added in Ticket country-name-iso-mapping.
 */
const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  argentina: "AR",
  australia: "AU",
  austria: "AT",
  bangladesh: "BD",
  belgium: "BE",
  brazil: "BR",
  canada: "CA",
  chile: "CL",
  china: "CN",
  colombia: "CO",
  "czech republic": "CZ",
  czechia: "CZ",
  denmark: "DK",
  egypt: "EG",
  finland: "FI",
  france: "FR",
  germany: "DE",
  greece: "GR",
  "hong kong": "HK",
  hungary: "HU",
  india: "IN",
  indonesia: "ID",
  ireland: "IE",
  israel: "IL",
  italy: "IT",
  japan: "JP",
  kenya: "KE",
  "korea, republic of": "KR",
  "south korea": "KR",
  malaysia: "MY",
  mexico: "MX",
  netherlands: "NL",
  "new zealand": "NZ",
  nigeria: "NG",
  norway: "NO",
  pakistan: "PK",
  peru: "PE",
  philippines: "PH",
  poland: "PL",
  portugal: "PT",
  romania: "RO",
  russia: "RU",
  "russian federation": "RU",
  "saudi arabia": "SA",
  singapore: "SG",
  "south africa": "ZA",
  spain: "ES",
  sweden: "SE",
  switzerland: "CH",
  taiwan: "TW",
  thailand: "TH",
  turkey: "TR",
  ukraine: "UA",
  "united arab emirates": "AE",
  uae: "AE",
  "u.a.e.": "AE",
  "united kingdom": "GB",
  uk: "GB",
  britain: "GB",
  "great britain": "GB",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  america: "US",
  vietnam: "VN",
};

function normalizeCountryCode(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Lookup first — catches "UK" → "GB", "USA" → "US", and full names.
  // Lowercase + collapse internal whitespace for keying.
  const key = trimmed.toLowerCase().replace(/\\s+/g, " ");
  if (key in COUNTRY_NAME_TO_ISO2) return COUNTRY_NAME_TO_ISO2[key];
  // Unknown 2-letter — pass through (uppercased). Best-effort for
  // ISO-2 codes not in the lookup table; valid codes survive intact.
  if (/^[a-zA-Z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}`;

const E1_MARKER = `const COUNTRY_NAME_TO_ISO2`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — mapOrg uses normalizeCountryCode
//
// Anchor: 3-line slice unique to mapOrg's body.
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `    estimatedNumEmployees: raw.estimated_num_employees ?? null,
    country: raw.country ?? null,
    city: raw.city ?? null,`;

const E2_NEW = `    estimatedNumEmployees: raw.estimated_num_employees ?? null,
    country: normalizeCountryCode(raw.country),
    city: raw.city ?? null,`;

const E2_MARKER = `estimatedNumEmployees: raw.estimated_num_employees ?? null,
    country: normalizeCountryCode(raw.country),`;

// ──────────────────────────────────────────────────────────────────
// Edit 3 — mapPerson uses normalizeCountryCode
//
// Anchor: 3-line slice unique to mapPerson's body (state field is the
// distinguishing context — mapOrg has no state field).
// ──────────────────────────────────────────────────────────────────

const E3_OLD = `    state: raw.state ?? null,
    country: raw.country ?? null,
    linkedinUrl: raw.linkedin_url ?? null,`;

const E3_NEW = `    state: raw.state ?? null,
    country: normalizeCountryCode(raw.country),
    linkedinUrl: raw.linkedin_url ?? null,`;

const E3_MARKER = `state: raw.state ?? null,
    country: normalizeCountryCode(raw.country),`;

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

const r1 = applyEdit("helper", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("map-org", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

const r3 = applyEdit("map-person", source, E3_OLD, E3_NEW, E3_MARKER);
if (!r3.ok) process.exit(3);
source = r3.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  helperPresent: countOccurrences(source, "function normalizeCountryCode(") === 1,
  lookupTablePresent: countOccurrences(source, "const COUNTRY_NAME_TO_ISO2") === 1,
  hasIndia: countOccurrences(source, `india: "IN",`) === 1,
  hasUS: countOccurrences(source, `"united states": "US",`) === 1,
  mapOrgUses: countOccurrences(source, `estimatedNumEmployees: raw.estimated_num_employees ?? null,
    country: normalizeCountryCode(raw.country),`) === 1,
  mapPersonUses: countOccurrences(source, `state: raw.state ?? null,
    country: normalizeCountryCode(raw.country),`) === 1,
  // No more raw.country fallthrough (`raw.country ?? null`) anywhere.
  oldRawCountryGone: countOccurrences(source, "country: raw.country ?? null,") === 0,
};
console.log("[country-name-iso-mapping] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[country-name-iso-mapping] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[country-name-iso-mapping] DONE");
process.exit(0);
