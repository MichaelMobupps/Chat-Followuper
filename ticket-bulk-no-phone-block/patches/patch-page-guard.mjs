#!/usr/bin/env node
/**
 * Ticket bulk-no-phone-block — page guard
 *
 * artifacts/dashboard/src/pages/prospect/whatsapp.tsx
 *
 * Defense-in-depth: even though the FE now prevents selecting "no" phone
 * candidates (via CandidateGrid patch), if any FE bug ever lets one slip
 * through, processOne should fail fast without spending Apollo credits.
 *
 * The existing processOne treats !isYes (i.e., "maybe" OR "no") the same
 * way — calls requestPhoneReveal which costs 8 credits. This is wrong
 * for "no" candidates: Apollo already said no phone, no point asking.
 *
 * Single anchored edit. Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/pages/prospect/whatsapp.tsx",
);

const EDIT_OLD = `  async function processOne(idx: number, c: Candidate) {
    const isYes = c.person.directPhoneStatus === "yes";`;

const EDIT_NEW = `  async function processOne(idx: number, c: Candidate) {
    // Defense in depth: the candidate grid prevents selecting "no"
    // status candidates, but if anything ever slips through, fail fast
    // here so we don't spend 8 credits asking Apollo for a phone they
    // already told us they don't have.
    if (c.person.directPhoneStatus === "no") {
      updateProcessingSlot(idx, {
        stage: "failed",
        error: "candidate has no phone available; selection should have been prevented",
      });
      return;
    }

    const isYes = c.person.directPhoneStatus === "yes";`;

const EDIT_MARKER = `Defense in depth: the candidate grid prevents selecting "no"`;

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
  console.log("[page-guard] SKIP — already applied");
  process.exit(0);
}
if (o === 0) {
  console.log("[page-guard] NOOP — anchor not found");
  process.exit(3);
}
if (o > 1) {
  console.log(`[page-guard] FAIL — anchor matched ${o} times`);
  process.exit(3);
}

writeFileSync(FILE, source.replace(EDIT_OLD, EDIT_NEW), "utf8");
const next = readFileSync(FILE, "utf8");

const evidence = {
  guardPresent: countOccurrences(next, EDIT_MARKER) === 1,
  failPathPresent: countOccurrences(next, `error: "candidate has no phone available`) === 1,
};
console.log("[page-guard] APPLY — patch applied");
console.log("[page-guard] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[page-guard] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
