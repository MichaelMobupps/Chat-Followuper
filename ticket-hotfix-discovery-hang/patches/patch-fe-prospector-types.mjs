#!/usr/bin/env node
/**
 * Hotfix v2: align FE prospector types with actual BE response shape
 *
 * artifacts/dashboard/src/lib/api/prospector.ts
 *
 * Three small atomic anchored edits — each has a tight anchor that
 * doesn't depend on the layout between interfaces (blank lines, etc).
 *
 *   Edit 1: rename inner field `kind` → `type` (cosmetic)
 *   Edit 2: rename inner field `appId` → `appName` + add `country`
 *           (anchor on the appId+error lines, replace with appName+country+error)
 *   Edit 3: rename wrapper field `resolutions` → `resolved`
 *           (THIS IS THE OPERATIONAL FIX — fixes the hang)
 *
 * Idempotent. Each edit has its own marker.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/lib/api/prospector.ts",
);

// ──────────────────────────────────────────────────────────────────
// Edit 1 — rename `kind` to `type` in ResolvedUrl
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `  kind?: "play_store" | "app_store" | "website" | "unknown" | string;`;
const E1_NEW = `  type?: "play_store" | "app_store" | "website" | "unknown" | string;`;
const E1_MARKER = `  type?: "play_store" | "app_store" | "website" | "unknown" | string;`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — replace `appId` line with `appName` + add `country`
//
// Anchor on two consecutive lines (appId + error) so the insertion of
// country is unambiguously between them.
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `  appId?: string | null;
  error?: string | null;`;

const E2_NEW = `  appName?: string | null;
  country?: string | null;
  error?: string | null;`;

const E2_MARKER = `  appName?: string | null;
  country?: string | null;`;

// ──────────────────────────────────────────────────────────────────
// Edit 3 — rename wrapper field `resolutions` → `resolved`
//
// THIS IS THE OPERATIONAL FIX. Without this, FE reads `r.resolutions`
// which is undefined at runtime, the next-line iteration throws
// TypeError, and because runDiscovery was launched with `void`, it
// becomes an unhandled rejection — UI stuck on "Resolving URL".
//
// Tight 2-line anchor: only the field declaration inside the response
// interface. Layout between interfaces (blank lines, comments) doesn't
// affect this match.
// ──────────────────────────────────────────────────────────────────

const E3_OLD = `export interface ResolveUrlsResponse {
  resolutions: ResolvedUrl[];
}`;

const E3_NEW = `export interface ResolveUrlsResponse {
  resolved: ResolvedUrl[];
}`;

const E3_MARKER = `  resolved: ResolvedUrl[];`;

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

const r1 = applyEdit("kind→type", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("appId→appName+country", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

const r3 = applyEdit("resolutions→resolved", source, E3_OLD, E3_NEW, E3_MARKER);
if (!r3.ok) process.exit(3);
source = r3.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  typeFieldPresent: countOccurrences(source, "type?: ") === 1,
  kindFieldGone: countOccurrences(source, "kind?:") === 0,
  appNameFieldPresent: countOccurrences(source, "appName?: string | null;") === 1,
  appIdFieldGone: countOccurrences(source, "appId?:") === 0,
  countryFieldPresent: countOccurrences(source, "country?: string | null;") === 1,
  resolvedFieldPresent: countOccurrences(source, "resolved: ResolvedUrl[];") === 1,
  resolutionsFieldGone: countOccurrences(source, "resolutions: ResolvedUrl[];") === 0,
};
console.log("[fe-prospector-types] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[fe-prospector-types] FAIL — evidence check failed");
  process.exit(4);
}

console.log("[fe-prospector-types] DONE");
process.exit(0);
