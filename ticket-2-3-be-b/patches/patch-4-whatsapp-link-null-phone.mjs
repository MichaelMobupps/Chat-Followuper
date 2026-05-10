#!/usr/bin/env node
/**
 * Ticket 2.3-BE-B — patch 4/5: whatsappLink route handles null phone
 *
 * artifacts/api-server/src/routes/whatsappLink.ts
 *
 * The whatsappLink route currently calls generateLink(prospect.phone, …)
 * unconditionally. When 2.3-BE-B makes the phone column nullable,
 * pending-reveal prospects can have phone=null and generateLink would
 * crash. Add a null-check that returns a distinct 409 error code so
 * the FE can render "still waiting on Apollo" rather than a generic
 * 404 or 500.
 *
 * One anchored edit: insert the null check between the existing
 * firstMessageBody check and the generateLink try/catch.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/routes/whatsappLink.ts",
);

const EDIT_OLD = `    if (!prospect.firstMessageBody || prospect.firstMessageBody.length === 0) {
      res.status(409).json({ error: "no_message_generated" });
      return;
    }

    try {
      const url = generateLink(prospect.phone, prospect.firstMessageBody);`;

const EDIT_NEW = `    if (!prospect.firstMessageBody || prospect.firstMessageBody.length === 0) {
      res.status(409).json({ error: "no_message_generated" });
      return;
    }

    if (!prospect.phone) {
      // Ticket 2.3-BE-B: pending-reveal prospects (bulk WhatsApp flow)
      // have no phone until Apollo's webhook lands and promotes
      // phoneNumber → phone via the correlationId lookup. Surface a
      // distinct error code so the FE can render "still waiting on
      // Apollo" rather than the generic no_message_generated path.
      res.status(409).json({ error: "phone_reveal_pending" });
      return;
    }

    try {
      const url = generateLink(prospect.phone, prospect.firstMessageBody);`;

const EDIT_MARKER = `Ticket 2.3-BE-B: pending-reveal prospects (bulk WhatsApp flow)`;

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

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const m = countOccurrences(source, EDIT_MARKER);
const o = countOccurrences(source, EDIT_OLD);
if (m > 0 && o === 0) {
  console.log("[whatsapp-link] SKIP — already applied");
  process.exit(0);
}
if (m === 0 && o === 0) {
  console.log("[whatsapp-link] NOOP — neither anchor nor marker found");
  process.exit(3);
}
if (o > 1) {
  console.log(`[whatsapp-link] FAIL — anchor matched ${o} times`);
  process.exit(3);
}
if (m > 0 && o > 0) {
  console.log("[whatsapp-link] FAIL — both marker and anchor present");
  process.exit(3);
}

const next = source.replace(EDIT_OLD, EDIT_NEW);
writeFileSync(FILE, next, "utf8");

const evidence = {
  nullPhoneGuardPresent: countOccurrences(next, `if (!prospect.phone) {`) === 1,
  pendingErrorCode: countOccurrences(next, `error: "phone_reveal_pending"`) === 1,
  marker: countOccurrences(next, EDIT_MARKER) === 1,
};
console.log("[whatsapp-link] APPLY — patch applied");
console.log("[whatsapp-link] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[whatsapp-link] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
