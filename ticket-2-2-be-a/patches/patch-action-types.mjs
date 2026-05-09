#!/usr/bin/env node
/**
 * Anchored, idempotent patch for lib/db/src/schema/action_logs.ts
 * - Adds `prospectorCompanyResolved: "prospector.company_resolved",` to ACTION_TYPES.
 *
 * Anchored on the existing `prospectorUrlsResolved` line (added in 2.1-BE).
 * Inserts the new key right after it, preserving block ordering.
 */
import fs from "node:fs";

const PATH = "lib/db/src/schema/action_logs.ts";

let src = fs.readFileSync(PATH, "utf8");
const before = src;
const log = (m) => console.log(`[patch-action-types] ${m}`);

const anchor = '  prospectorUrlsResolved: "prospector.urls_resolved",';
const insert =
  '  prospectorUrlsResolved: "prospector.urls_resolved",\n' +
  '  prospectorCompanyResolved: "prospector.company_resolved",';

if (src.includes('prospectorCompanyResolved: "prospector.company_resolved"')) {
  log("[SKIP] prospectorCompanyResolved already present");
} else if (!src.includes(anchor)) {
  console.error(
    `[patch-action-types] [FAIL] anchor not found: ${anchor}`,
  );
  console.error(
    "       Apply 2.1-BE first if not done — that's what introduces the prospectorUrlsResolved line.",
  );
  process.exit(2);
} else {
  src = src.replace(anchor, insert);
  log("[APPLY] added prospectorCompanyResolved action type");
}

if (src === before) {
  log("[NOOP] no changes");
} else {
  fs.writeFileSync(PATH, src);
  log("[DONE] action_logs.ts updated");
}

const finalSrc = fs.readFileSync(PATH, "utf8");
const evidence = {
  prospectorCompanyResolved_key: (
    finalSrc.match(/prospectorCompanyResolved: "prospector\.company_resolved"/g) ||
    []
  ).length,
  prospectorUrlsResolved_still_present: (
    finalSrc.match(/prospectorUrlsResolved: "prospector\.urls_resolved"/g) || []
  ).length,
};
console.log("[patch-action-types] evidence:", JSON.stringify(evidence));
const expected = {
  prospectorCompanyResolved_key: 1,
  prospectorUrlsResolved_still_present: 1,
};
for (const [k, v] of Object.entries(expected)) {
  if (evidence[k] !== v) {
    console.error(
      `[patch-action-types] [FAIL] evidence ${k}: got ${evidence[k]}, expected ${v}`,
    );
    process.exit(3);
  }
}
console.log("[patch-action-types] all evidence checks passed");
