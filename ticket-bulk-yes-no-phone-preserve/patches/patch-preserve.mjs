#!/usr/bin/env node
/**
 * Ticket bulk-yes-no-phone-preserve — preserve prospect record when
 * Apollo's "yes" reveal returns no phone.
 *
 * artifacts/dashboard/src/pages/prospect/whatsapp.tsx
 *
 * Three atomic edits in processOne:
 *   1. Drop the fail-and-return on empty yes-reveal — instead, fall
 *      through and create the prospect with no phone (apolloPersonId
 *      satisfies BE schema's cross-field check from 2.3-BE-B).
 *   2. Add `contextNotes` to createProspect input that explains the
 *      situation, so SDR sees the explanation in the prospect detail
 *      view ("yes-tagged reveal returned no phone — manual sourcing
 *      required").
 *   3. Replace the binary `isYes ? "ready" : "ready-pending-phone"`
 *      ending with `isReady = isYes && phoneFromReveal`. yes-no-phone
 *      now ends in "ready-pending-phone" (same UX bucket as maybe-path
 *      so BulkResults groups it in Pending; future ticket can add a
 *      dedicated state if SDR feedback indicates the misleading
 *      "pending" implies phone is coming when it isn't).
 *
 * No BE changes. No new types. Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/pages/prospect/whatsapp.tsx",
);

// ──────────────────────────────────────────────────────────────────
// Edit 1 — replace fail-return block with explanatory comment
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `        if (!phoneFromReveal) {
          // Apollo charged the credit but returned no phone. Treat as failed
          // — the prospect can't be created without phone (yes path expects
          // a real phone). The "maybe" path handles the no-phone case.
          updateProcessingSlot(idx, {
            stage: "failed",
            error: "reveal returned no phone",
          });
          return;
        }`;

const E1_NEW = `        // If phoneFromReveal is empty here, Apollo charged 8c but returned
        // nothing. We preserve the prospect record (apolloPersonId, name,
        // company, etc) so the data point isn't lost — SDR can find the
        // prospect in the list and decide whether to manually source the
        // phone via LinkedIn or delete. The createProspect call below
        // omits phone when phoneFromReveal is null; BE accepts this since
        // apolloPersonId is set (cross-field check from 2.3-BE-B). The
        // requestPhoneReveal step is skipped for yes-path even when empty
        // — async retry would just charge another 8c with same outcome.`;

const E1_MARKER = `// If phoneFromReveal is empty here, Apollo charged 8c but returned`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — add contextNotes to createProspect input
//
// Anchor on the closing of createProspect args. The field set is
// alphabetical-ish; appending contextNotes at the end before the
// closing brace.
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `        apolloPersonId: c.person.id,
        apolloOrgId: c.person.organizationId ?? c.org.id ?? undefined,
      });`;

const E2_NEW = `        apolloPersonId: c.person.id,
        apolloOrgId: c.person.organizationId ?? c.org.id ?? undefined,
        contextNotes:
          isYes && !phoneFromReveal
            ? "Yes-tagged reveal returned no phone (8c charged but Apollo gave nothing). Manual phone sourcing required for WhatsApp; the generated message can be repurposed for LinkedIn or email."
            : undefined,
      });`;

const E2_MARKER = `Yes-tagged reveal returned no phone (8c charged but Apollo gave nothing).`;

// ──────────────────────────────────────────────────────────────────
// Edit 3 — final stage uses isReady, not isYes alone
//
// Reuses "ready-pending-phone" stage for yes-no-phone (same bucket
// as maybe-path in BulkResults). Future ticket can add a dedicated
// state if needed.
// ──────────────────────────────────────────────────────────────────

const E3_OLD = `      updateProcessingSlot(idx, {
        stage: isYes ? "ready" : "ready-pending-phone",
      });`;

const E3_NEW = `      // yes-no-phone reuses "ready-pending-phone" stage so BulkResults
      // groups it in the Pending bucket alongside maybe-path prospects.
      // The contextNotes set above distinguishes the two situations in
      // the detail view.
      const isReady = isYes && Boolean(phoneFromReveal);
      updateProcessingSlot(idx, {
        stage: isReady ? "ready" : "ready-pending-phone",
      });`;

const E3_MARKER = `const isReady = isYes && Boolean(phoneFromReveal);`;

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

const r1 = applyEdit("drop-fail-return", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("context-notes", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

const r3 = applyEdit("is-ready-stage", source, E3_OLD, E3_NEW, E3_MARKER);
if (!r3.ok) process.exit(3);
source = r3.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  failReturnDropped: countOccurrences(source, E1_MARKER) === 1,
  oldFailGone: countOccurrences(source, `error: "reveal returned no phone"`) === 0,
  contextNotesAdded: countOccurrences(source, E2_MARKER) === 1,
  isReadyLogic: countOccurrences(source, E3_MARKER) === 1,
  oldStageGone: countOccurrences(source, `stage: isYes ? "ready" : "ready-pending-phone"`) === 0,
};
console.log("[bulk-yes-no-phone-preserve] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[bulk-yes-no-phone-preserve] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[bulk-yes-no-phone-preserve] DONE");
process.exit(0);
