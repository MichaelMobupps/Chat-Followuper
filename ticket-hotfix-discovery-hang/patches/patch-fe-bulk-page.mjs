#!/usr/bin/env node
/**
 * Hotfix: align consumer with actual BE response field name
 *
 * artifacts/dashboard/src/pages/prospect/whatsapp.tsx
 *
 * Single anchored edit changes `r.resolutions` to `r.resolved` in the
 * runDiscovery function. This is the actual fix for the hang — without
 * it, `resolutions` is undefined at runtime, the next-line `for (const r
 * of resolutions)` throws TypeError, and because `runDiscovery` was
 * launched with `void runDiscovery(input)`, the throw becomes an
 * unhandled promise rejection. The state had already been set to
 * "resolving", so the UI is stuck there forever.
 *
 * Must be applied AFTER patch-fe-prospector-types.mjs (so TS still
 * typechecks; the lib type now has `resolved` not `resolutions`).
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/pages/prospect/whatsapp.tsx",
);

// Anchor includes the surrounding context to make the match unique
// (the whole try/catch block where resolveUrls is called).
const EDIT_OLD = `    let resolutions;
    try {
      const r = await resolveUrls({ urls: input.urls });
      resolutions = r.resolutions;
    } catch (err) {`;

const EDIT_NEW = `    let resolutions;
    try {
      const r = await resolveUrls({ urls: input.urls });
      resolutions = r.resolved;
    } catch (err) {`;

// Marker = the post-patch field access. Local variable kept as
// `resolutions` — that's just a name, no need to rename.
const EDIT_MARKER = `resolutions = r.resolved;`;

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
  console.log("[fe-bulk-page] SKIP — already applied");
  process.exit(0);
}
if (o === 0) {
  console.log("[fe-bulk-page] NOOP — anchor not found");
  process.exit(3);
}
if (o > 1) {
  console.log(`[fe-bulk-page] FAIL — anchor matched ${o} times`);
  process.exit(3);
}

writeFileSync(FILE, source.replace(EDIT_OLD, EDIT_NEW), "utf8");
const next = readFileSync(FILE, "utf8");

const evidence = {
  consumerUsesResolved: countOccurrences(next, "resolutions = r.resolved;") === 1,
  oldFieldGone: countOccurrences(next, "resolutions = r.resolutions;") === 0,
};
console.log("[fe-bulk-page] APPLY — patch applied");
console.log("[fe-bulk-page] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[fe-bulk-page] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
