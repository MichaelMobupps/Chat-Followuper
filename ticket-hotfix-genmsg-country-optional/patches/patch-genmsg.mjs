#!/usr/bin/env node
/**
 * Ticket hotfix-genmsg-country-optional — drop country from required
 * fields in generateMessage validation.
 *
 * artifacts/api-server/src/routes/generateMessage.ts
 *
 * Single atomic edit. Removes the
 *   if (!prospect.country) missing.push("country");
 * line from the missing-fields check.
 *
 * Why: prospects.country is optional in baseProspectFields (the create
 * schema), but generateMessage was treating it as required. Inconsistent.
 * The country-iso hotfix that landed earlier today correctly strips
 * non-ISO values from Apollo's response (Apollo returns "India" instead
 * of "IN"), which means country is now legitimately null for many
 * Apollo-sourced prospects. generateMessage's prospectInput already
 * handles missing country with `prospect.country ?? ""` fallback —
 * messages are slightly less localized but generation succeeds.
 *
 * Future: a country-name → ISO-2 mapping ticket would preserve the
 * country signal for these prospects.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/routes/generateMessage.ts",
);

const EDIT_OLD = `    if (!prospect.prospectName) missing.push("prospectName");
    if (!prospect.company) missing.push("company");
    if (!prospect.country) missing.push("country");
    if (!prospect.language) missing.push("language");`;

const EDIT_NEW = `    if (!prospect.prospectName) missing.push("prospectName");
    if (!prospect.company) missing.push("company");
    if (!prospect.language) missing.push("language");
    // country intentionally not required: Apollo's people-search returns
    // inconsistent country formats (full English names vs ISO-2). The FE
    // strips non-ISO values to satisfy the strict create schema, which
    // means country is legitimately null for many Apollo prospects.
    // The downstream prospectInput uses "" as the country fallback, so
    // message generation succeeds without country (slightly less
    // localized output).`;

const EDIT_MARKER = `country intentionally not required`;

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
  console.log("[genmsg-country-optional] SKIP — already applied");
  process.exit(0);
}
if (o === 0) {
  console.log("[genmsg-country-optional] NOOP — anchor not found");
  process.exit(3);
}
if (o > 1) {
  console.log(`[genmsg-country-optional] FAIL — anchor matched ${o} times`);
  process.exit(3);
}

writeFileSync(FILE, source.replace(EDIT_OLD, EDIT_NEW), "utf8");
const next = readFileSync(FILE, "utf8");

const evidence = {
  commentPresent: countOccurrences(next, EDIT_MARKER) === 1,
  countryRequiredGone: countOccurrences(next, `if (!prospect.country) missing.push("country");`) === 0,
  otherChecksIntact:
    countOccurrences(next, `if (!prospect.prospectName) missing.push("prospectName");`) === 1 &&
    countOccurrences(next, `if (!prospect.company) missing.push("company");`) === 1 &&
    countOccurrences(next, `if (!prospect.language) missing.push("language");`) === 1,
};
console.log("[genmsg-country-optional] APPLY");
console.log("[genmsg-country-optional] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[genmsg-country-optional] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
