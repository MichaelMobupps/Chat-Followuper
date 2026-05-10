#!/usr/bin/env node
/**
 * Ticket 2.3-BE-B — patch 3/5: webhook arrival promotes phoneNumber → phone
 *
 * artifacts/api-server/src/services/apollo.ts
 *
 * The processPhoneRevealCallback transaction currently writes ONLY to
 * phoneNumber on the "arrived" branch. For seeder-flow prospects this
 * is fine — they already have phone set at creation time. For bulk-flow
 * pending prospects (Ticket 2.3-BE-B), phone is null at creation and
 * stays null after webhook arrival, leaving the prospect uncontactable
 * via wa.me even though Apollo found the phone.
 *
 * Two anchored edits:
 *
 *   3A. Extend the SELECT at the top of processPhoneRevealCallback to
 *       also fetch the existing phone column (needed for COALESCE).
 *
 *   3B. On the "arrived" branch's .set({}) block, add
 *       phone: prospect.phone ?? phone (where the local `phone`
 *       variable is the just-extracted webhook phone). The COALESCE
 *       leaves seeder-flow prospects untouched and promotes
 *       pending-flow prospects.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/apollo.ts",
);

// ──────────────────────────────────────────────────────────────────────
// Edit 3A — extend the SELECT to fetch existing phone
// ──────────────────────────────────────────────────────────────────────

const EDIT_3A_OLD = `    const rows = await tx
      .select({
        id: prospectsTable.id,
        userId: prospectsTable.userId,
        phoneRevealStatus: prospectsTable.phoneRevealStatus,
      })
      .from(prospectsTable)
      .where(eq(prospectsTable.phoneRevealCorrelationId, correlationId))
      .for("update")
      .limit(1);`;

const EDIT_3A_NEW = `    const rows = await tx
      .select({
        id: prospectsTable.id,
        userId: prospectsTable.userId,
        // Ticket 2.3-BE-B: fetch existing phone so the arrived branch
        // can COALESCE (promote phoneNumber → phone only when phone is
        // currently null, i.e. pending-reveal bulk-flow prospects).
        phone: prospectsTable.phone,
        phoneRevealStatus: prospectsTable.phoneRevealStatus,
      })
      .from(prospectsTable)
      .where(eq(prospectsTable.phoneRevealCorrelationId, correlationId))
      .for("update")
      .limit(1);`;

const EDIT_3A_MARKER = `Ticket 2.3-BE-B: fetch existing phone so the arrived branch`;

// ──────────────────────────────────────────────────────────────────────
// Edit 3B — promote phoneNumber → phone on arrived branch
// ──────────────────────────────────────────────────────────────────────

const EDIT_3B_OLD = `    // Allowed. Store the phone, transition to arrived.
    await tx
      .update(prospectsTable)
      .set({
        phoneRevealStatus: "arrived",
        phoneRevealCompletedAt: new Date(),
        phoneNumber: phone,
      })
      .where(eq(prospectsTable.id, prospect.id));`;

const EDIT_3B_NEW = `    // Allowed. Store the phone, transition to arrived.
    //
    // Ticket 2.3-BE-B: promote phoneNumber → phone if and only if the
    // prospect has no phone yet. Seeder-flow prospects (single-prospect
    // picker) have phone set at creation, so prospect.phone is non-null
    // and the COALESCE is a no-op. Bulk-flow pending prospects (Apollo
    // "Maybe" path) have phone=null at creation; the COALESCE here is
    // what makes them contactable via wa.me. phoneNumber is the audit/
    // diagnostic field (always set to the raw webhook value); phone is
    // the contactable field that generateLink + whatsappLink read from.
    const promotedPhone = prospect.phone ?? phone;
    await tx
      .update(prospectsTable)
      .set({
        phoneRevealStatus: "arrived",
        phoneRevealCompletedAt: new Date(),
        phoneNumber: phone,
        phone: promotedPhone,
      })
      .where(eq(prospectsTable.id, prospect.id));`;

const EDIT_3B_MARKER = `Ticket 2.3-BE-B: promote phoneNumber → phone if and only if`;

// ──────────────────────────────────────────────────────────────────────
// Apply
// ──────────────────────────────────────────────────────────────────────

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

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0 && o === 0) {
    console.log(`[${label}] SKIP — already applied`);
    return { source, ok: true };
  }
  if (m === 0 && o === 0) {
    console.log(`[${label}] NOOP — neither anchor nor marker found`);
    return { source, ok: false };
  }
  if (o > 1) {
    console.log(`[${label}] FAIL — anchor matched ${o} times`);
    return { source, ok: false };
  }
  if (m > 0 && o > 0) {
    console.log(`[${label}] FAIL — both marker and anchor present`);
    return { source, ok: false };
  }
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const r1 = applyEdit("3A select-extend", source, EDIT_3A_OLD, EDIT_3A_NEW, EDIT_3A_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("3B arrived-promote", source, EDIT_3B_OLD, EDIT_3B_NEW, EDIT_3B_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  selectFetchesPhone: countOccurrences(source, "phone: prospectsTable.phone,") >= 1,
  arrivedSetsPromotedPhone: countOccurrences(source, "const promotedPhone = prospect.phone ?? phone;") === 1,
  arrivedSetBlockHasPhone: countOccurrences(source, `phoneNumber: phone,
        phone: promotedPhone,`) === 1,
  marker3A: countOccurrences(source, EDIT_3A_MARKER) === 1,
  marker3B: countOccurrences(source, EDIT_3B_MARKER) === 1,
};
console.log("[apollo-webhook] APPLY — patches applied");
console.log("[apollo-webhook] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[apollo-webhook] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
