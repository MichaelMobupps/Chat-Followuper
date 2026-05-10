#!/usr/bin/env node
/**
 * Ticket message-visibility-bulk — whatsapp.tsx processOne update
 *
 * Single multi-line edit on Step 5 block:
 *   - Capture generateMessage return value (was discarded)
 *   - Pass firstMessageBody on the stage-transition updateProcessingSlot
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/pages/prospect/whatsapp.tsx",
);

// Anchor on the entire Step 5 block — the comment block is unique
// (mentions Ticket bulk-already-revealed-free), so the anchor is
// definitively scoped to this exact location.
const OLD = `      // ── Step 5: generate message ──
      updateProcessingSlot(idx, { stage: "generating-message" });
      await generateMessage(created.id);

      // Any non-null phone means we can send WhatsApp immediately —
      // could be a fresh revealContact result, OR an existingPhone from
      // a previously-revealed contact (Ticket bulk-already-revealed-free).
      // The previous isYes-coupling assumed phone could only come via
      // revealContact; existingPhone breaks that assumption, so a
      // maybe-tagged prospect with existingPhone is also ready right
      // away. yes-no-phone case still falls through to "ready-pending-
      // phone" stage with contextNotes explaining the situation.
      const isReady = Boolean(phoneFromReveal);
      updateProcessingSlot(idx, {
        stage: isReady ? "ready" : "ready-pending-phone",
      });`;

const NEW = `      // ── Step 5: generate message ──
      updateProcessingSlot(idx, { stage: "generating-message" });
      const generated = await generateMessage(created.id);

      // Any non-null phone means we can send WhatsApp immediately —
      // could be a fresh revealContact result, OR an existingPhone from
      // a previously-revealed contact (Ticket bulk-already-revealed-free).
      // The previous isYes-coupling assumed phone could only come via
      // revealContact; existingPhone breaks that assumption, so a
      // maybe-tagged prospect with existingPhone is also ready right
      // away. yes-no-phone case still falls through to "ready-pending-
      // phone" stage with contextNotes explaining the situation.
      const isReady = Boolean(phoneFromReveal);
      updateProcessingSlot(idx, {
        stage: isReady ? "ready" : "ready-pending-phone",
        firstMessageBody: generated.message,
      });`;

const MARKER = `firstMessageBody: generated.message`;

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
  if (m > 0) { console.log(`[${label}] SKIP — already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP — anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL — anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

const r = applyEdit("processOne-capture", source, OLD, NEW, MARKER);
if (!r.ok) process.exit(3);
writeFileSync(FILE, r.source, "utf8");

const evidence = {
  captured: countOccurrences(r.source, "const generated = await generateMessage(created.id);") === 1,
  passedToSlot: countOccurrences(r.source, "firstMessageBody: generated.message,") === 1,
  // Sanity — the original bare call is no longer present.
  oldCallGone: countOccurrences(r.source, "      await generateMessage(created.id);") === 0,
};
console.log("[processOne-capture] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[processOne-capture] FAIL"); process.exit(4);
}
console.log("[processOne-capture] DONE");
