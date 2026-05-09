#!/usr/bin/env node
/**
 * Anchored, idempotent patch for lib/db/src/schema/action_logs.ts
 * - Adds `prospectDeleted: "prospect.deleted",` to ACTION_TYPES, kept
 *   together with the other prospect.* entries.
 *
 * Anchored on the existing `prospectSkipped: "prospect.skipped",` line.
 */
import fs from "node:fs";

const PATH = "lib/db/src/schema/action_logs.ts";

let src = fs.readFileSync(PATH, "utf8");
const before = src;
const log = (m) => console.log(`[patch-action-types] ${m}`);

const anchor = '  prospectSkipped: "prospect.skipped",';
const insert =
  '  prospectSkipped: "prospect.skipped",\n' +
  '  prospectDeleted: "prospect.deleted",';

if (src.includes('prospectDeleted: "prospect.deleted"')) {
  log("[SKIP] prospectDeleted already present");
} else if (!src.includes(anchor)) {
  console.error(
    `[patch-action-types] [FAIL] anchor not found: ${anchor}`,
  );
  process.exit(2);
} else {
  src = src.replace(anchor, insert);
  log("[APPLY] added prospectDeleted action type");
}

// === Write ===
if (src === before) {
  log("[NOOP] no changes");
} else {
  fs.writeFileSync(PATH, src);
  log("[DONE] action_logs.ts updated");
}

// === Evidence ===
const finalSrc = fs.readFileSync(PATH, "utf8");
const evidence = {
  prospectDeleted_key: (
    finalSrc.match(/prospectDeleted: "prospect\.deleted"/g) || []
  ).length,
};
console.log("[patch-action-types] evidence:", JSON.stringify(evidence));
if (evidence.prospectDeleted_key !== 1) {
  console.error(
    `[patch-action-types] [FAIL] expected 1 occurrence, got ${evidence.prospectDeleted_key}`,
  );
  process.exit(3);
}
console.log("[patch-action-types] all evidence checks passed");
