#!/usr/bin/env node
/**
 * Hotfix: align FE prospector types with actual BE response shape
 *
 * artifacts/dashboard/src/lib/api/prospector.ts
 *
 * Single anchored edit replaces the ResolvedUrl + ResolveUrlsResponse
 * interfaces with the correct field names matching the actual BE
 * response (verified via devtools network inspection):
 *
 *   FE was wrong         →  BE actually returns
 *   ─────────────────────────────────────────────
 *   resolutions          →  resolved          ← this is the hang bug
 *   kind                 →  type
 *   appId                →  appName
 *   (missing)            →  country
 *
 * The orchestrator in pages/prospect/whatsapp.tsx only consumes
 * `.url`, `.brand`, `.error` — all present in BE response — so once
 * the wrapper field name is fixed, the rest of the pipeline runs.
 * The other field renames are hygiene to prevent future drift.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/lib/api/prospector.ts",
);

const EDIT_OLD = `export interface ResolvedUrl {
  url: string;
  kind?: "play_store" | "app_store" | "website" | "unknown" | string;
  brand?: string | null;
  domain?: string | null;
  appId?: string | null;
  error?: string | null;
}
export interface ResolveUrlsInput {
  urls: string[];
}
export interface ResolveUrlsResponse {
  resolutions: ResolvedUrl[];
}`;

const EDIT_NEW = `export interface ResolvedUrl {
  url: string;
  type?: "play_store" | "app_store" | "website" | "unknown" | string;
  brand?: string | null;
  domain?: string | null;
  appName?: string | null;
  country?: string | null;
  error?: string | null;
}
export interface ResolveUrlsInput {
  urls: string[];
}
export interface ResolveUrlsResponse {
  resolved: ResolvedUrl[];
}`;

// Marker = the post-patch wrapper field name. If present, patch already applied.
const EDIT_MARKER = `resolved: ResolvedUrl[];`;

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
  console.log("[fe-prospector-types] SKIP — already applied");
  process.exit(0);
}
if (o === 0) {
  console.log("[fe-prospector-types] NOOP — anchor not found");
  process.exit(3);
}
if (o > 1) {
  console.log(`[fe-prospector-types] FAIL — anchor matched ${o} times`);
  process.exit(3);
}

writeFileSync(FILE, source.replace(EDIT_OLD, EDIT_NEW), "utf8");
const next = readFileSync(FILE, "utf8");

const evidence = {
  resolvedFieldPresent: countOccurrences(next, "resolved: ResolvedUrl[];") === 1,
  resolutionsFieldGone: countOccurrences(next, "resolutions: ResolvedUrl[];") === 0,
  typeFieldPresent: countOccurrences(next, "type?:") === 1,
  kindFieldGone: countOccurrences(next, "kind?:") === 0,
  appNameFieldPresent: countOccurrences(next, "appName?:") === 1,
  appIdFieldGone: countOccurrences(next, "appId?:") === 0,
  countryFieldPresent: countOccurrences(next, "country?:") === 1,
};
console.log("[fe-prospector-types] APPLY — patch applied");
console.log("[fe-prospector-types] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[fe-prospector-types] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
