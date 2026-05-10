#!/usr/bin/env node
/**
 * Ticket bulk-already-revealed-free — FE pages/prospect/whatsapp.tsx
 *
 * Four atomic edits in processOne:
 *   1. Initialize phoneFromReveal from c.person.existingPhone (instead
 *      of always null)
 *   2. Guard yes-path reveal with !phoneFromReveal — skip the
 *      revealContact call when the phone is already in our Apollo
 *      account
 *   3. Guard maybe-path requestPhoneReveal with !phoneFromReveal — same
 *      reasoning, no need to ask Apollo to find a phone we already have
 *   4. Simplify isReady to Boolean(phoneFromReveal) — any non-null phone
 *      means we can send WhatsApp; the previous isYes-coupling assumed
 *      phone could only come via revealContact, which existingPhone
 *      breaks
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/pages/prospect/whatsapp.tsx",
);

// ──────────────────────────────────────────────────────────────────
// Edit 3.1 — initialize phoneFromReveal from existingPhone
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `      let prospectId: string;
      let phoneFromReveal: string | null = null;
      let revealedLastName: string | null = null;
      let revealedLinkedin: string | null = null;`;

const E1_NEW = `      let prospectId: string;
      // Initialize from existingPhone — Apollo populates phone_numbers in
      // the search response only when the contact has already been
      // revealed in our account. When set, we skip both reveal paths
      // below (sync revealContact + async requestPhoneReveal) — zero
      // credit cost. Added in Ticket bulk-already-revealed-free.
      let phoneFromReveal: string | null = c.person.existingPhone ?? null;
      let revealedLastName: string | null = null;
      let revealedLinkedin: string | null = null;`;

const E1_MARKER = `Initialize from existingPhone — Apollo populates phone_numbers`;

// ──────────────────────────────────────────────────────────────────
// Edit 3.2 — guard yes-path with !phoneFromReveal
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `      // ── Step 1: reveal (yes path only) ──
      if (isYes) {
        updateProcessingSlot(idx, { stage: "revealing" });`;

const E2_NEW = `      // ── Step 1: reveal (yes path only, skip when already revealed) ──
      if (isYes && !phoneFromReveal) {
        updateProcessingSlot(idx, { stage: "revealing" });`;

const E2_MARKER = `if (isYes && !phoneFromReveal)`;

// ──────────────────────────────────────────────────────────────────
// Edit 3.3 — guard maybe-path with !phoneFromReveal
//
// Anchor includes "requesting-phone-reveal" stage string for uniqueness
// since `if (!isYes)` alone could match elsewhere.
// ──────────────────────────────────────────────────────────────────

const E3_OLD = `      if (!isYes) {
        updateProcessingSlot(idx, { stage: "requesting-phone-reveal" });`;

const E3_NEW = `      if (!isYes && !phoneFromReveal) {
        updateProcessingSlot(idx, { stage: "requesting-phone-reveal" });`;

const E3_MARKER = `if (!isYes && !phoneFromReveal)`;

// ──────────────────────────────────────────────────────────────────
// Edit 3.4 — simplify isReady
//
// Anchored on the comment block from the yes-no-phone-preserve patch
// for uniqueness.
// ──────────────────────────────────────────────────────────────────

const E4_OLD = `      // yes-no-phone reuses "ready-pending-phone" stage so BulkResults
      // groups it in the Pending bucket alongside maybe-path prospects.
      // The contextNotes set above distinguishes the two situations in
      // the detail view.
      const isReady = isYes && Boolean(phoneFromReveal);`;

const E4_NEW = `      // Any non-null phone means we can send WhatsApp immediately —
      // could be a fresh revealContact result, OR an existingPhone from
      // a previously-revealed contact (Ticket bulk-already-revealed-free).
      // The previous isYes-coupling assumed phone could only come via
      // revealContact; existingPhone breaks that assumption, so a
      // maybe-tagged prospect with existingPhone is also ready right
      // away. yes-no-phone case still falls through to "ready-pending-
      // phone" stage with contextNotes explaining the situation.
      const isReady = Boolean(phoneFromReveal);`;

const E4_MARKER = `Any non-null phone means we can send WhatsApp immediately`;

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

const r1 = applyEdit("init-from-existing", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("guard-yes-path", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

const r3 = applyEdit("guard-maybe-path", source, E3_OLD, E3_NEW, E3_MARKER);
if (!r3.ok) process.exit(3);
source = r3.source;

const r4 = applyEdit("simplify-is-ready", source, E4_OLD, E4_NEW, E4_MARKER);
if (!r4.ok) process.exit(3);
source = r4.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  initFromExisting: countOccurrences(source, "c.person.existingPhone ?? null") === 1,
  yesGuard: countOccurrences(source, "if (isYes && !phoneFromReveal)") === 1,
  maybeGuard: countOccurrences(source, "if (!isYes && !phoneFromReveal)") === 1,
  isReadySimplified: countOccurrences(source, "const isReady = Boolean(phoneFromReveal);") === 1,
  oldIsReadyGone: countOccurrences(source, "const isReady = isYes && Boolean(phoneFromReveal);") === 0,
};
console.log("[bulk-already-revealed-free-page] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[bulk-already-revealed-free-page] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[bulk-already-revealed-free-page] DONE");
process.exit(0);
