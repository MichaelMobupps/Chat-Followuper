#!/usr/bin/env node
/**
 * Anchored, idempotent patch for lib/db/src/schema/action_logs.ts
 * - Adds `prospectorUrlsResolved: "prospector.urls_resolved",` to ACTION_TYPES.
 *
 * Anchored on the existing `apolloPhoneRevealBlocked` line — the last entry
 * in the const block. Inserts the new key right after it, before the closing
 * `} as const;`.
 */
import fs from "node:fs";

const PATH = "lib/db/src/schema/action_logs.ts";

let src = fs.readFileSync(PATH, "utf8");
const before = src;
const log = (m) => console.log(`[patch-action-types] ${m}`);

const anchor = '  apolloPhoneRevealBlocked: "apollo.phone_reveal_blocked",';
const insert =
  '  apolloPhoneRevealBlocked: "apollo.phone_reveal_blocked",\n' +
  '  prospectorUrlsResolved: "prospector.urls_resolved",';

if (src.includes('prospectorUrlsResolved: "prospector.urls_resolved"')) {
  log("[SKIP] prospectorUrlsResolved already present");
} else if (!src.includes(anchor)) {
  console.error(
    `[patch-action-types] [FAIL] anchor not found: ${anchor}`,
  );
  console.error(
    "       The action_logs.ts ACTION_TYPES block may have been modified.",
  );
  process.exit(2);
} else {
  src = src.replace(anchor, insert);
  log("[APPLY] added prospectorUrlsResolved action type");
}

if (src === before) {
  log("[NOOP] no changes");
} else {
  fs.writeFileSync(PATH, src);
  log("[DONE] action_logs.ts updated");
}

const finalSrc = fs.readFileSync(PATH, "utf8");
const evidence = {
  prospectorUrlsResolved_key: (
    finalSrc.match(/prospectorUrlsResolved: "prospector\.urls_resolved"/g) || []
  ).length,
};
console.log("[patch-action-types] evidence:", JSON.stringify(evidence));
if (evidence.prospectorUrlsResolved_key !== 1) {
  console.error(
    `[patch-action-types] [FAIL] expected 1 occurrence, got ${evidence.prospectorUrlsResolved_key}`,
  );
  process.exit(3);
}
console.log("[patch-action-types] all evidence checks passed");
