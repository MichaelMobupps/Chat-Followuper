#!/usr/bin/env node
/**
 * Ticket edit-message-capability — BE routes/prospects.ts
 *
 * Three atomic edits:
 *   1. Update the "System-only fields" comment to reflect that
 *      firstMessageBody is now editable on PATCH
 *   2. Add firstMessageBody to baseProspectFields Zod schema
 *   3. Add firstMessageBody to the handler's updates destructure
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/routes/prospects.ts",
);

// ─── Edit 1 — update the "System-only fields" comment ─────────────
const E1_OLD = `// System-only fields (firstMessage*, replied, followupPaused, phoneReveal*,
// id, userId, createdAt, updatedAt) are rejected automatically by the
// schema's .strict() — any key not declared in baseProspectFields raises
// "unrecognized_keys". No separate allowlist is needed.`;

const E1_NEW = `// System-only fields (replied, followupPaused, phoneReveal*, id, userId,
// createdAt, updatedAt, firstMessageChannel, firstMessageSentAt) are
// rejected automatically by the schema's .strict() — any key not
// declared in baseProspectFields raises "unrecognized_keys". No separate
// allowlist is needed.
//
// firstMessageBody is admitted (added in Ticket edit-message-capability)
// to support manual edits from the detail page. Channel and SentAt
// remain system-only — they are set by generateMessage and the send
// pipeline respectively.`;

const E1_MARKER = `firstMessageBody is admitted (added in Ticket edit-message-capability)`;

// ─── Edit 2 — add firstMessageBody to baseProspectFields ──────────
// Insert at the top of the object literal, right after the opening
// brace + first field (prospectName). Order doesn't matter for Zod;
// keeping it at top makes it visible in code reviews.
const E2_OLD = `const baseProspectFields = {
  prospectName: z.string().trim().min(1).max(200).nullable().optional(),`;

const E2_NEW = `const baseProspectFields = {
  /** First message body — manually editable on PATCH, system-set
   *  on initial generation by generateMessage. Trimmed non-empty
   *  string up to 20k chars, or null to clear. Added in Ticket
   *  edit-message-capability. */
  firstMessageBody: z.string().trim().min(1).max(20000).nullable().optional(),
  prospectName: z.string().trim().min(1).max(200).nullable().optional(),`;

const E2_MARKER = `firstMessageBody: z.string().trim().min(1).max(20000)`;

// ─── Edit 3 — add firstMessageBody to handler updates ─────────────
// Anchor on the first destructure assignment so my new line lands
// right above it.
const E3_OLD = `    if (body.prospectName !== undefined) updates.prospectName = body.prospectName;`;

const E3_NEW = `    if (body.firstMessageBody !== undefined) updates.firstMessageBody = body.firstMessageBody;
    if (body.prospectName !== undefined) updates.prospectName = body.prospectName;`;

const E3_MARKER = `if (body.firstMessageBody !== undefined) updates.firstMessageBody = body.firstMessageBody;`;

// ─── applyEdit ────────────────────────────────────────────────────

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
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

for (const [label, oldStr, newStr, marker] of [
  ["comment", E1_OLD, E1_NEW, E1_MARKER],
  ["schema", E2_OLD, E2_NEW, E2_MARKER],
  ["handler", E3_OLD, E3_NEW, E3_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  commentUpdated:
    countOccurrences(source, "firstMessageBody is admitted (added in Ticket edit-message-capability)") === 1,
  schemaFieldPresent:
    countOccurrences(source, "firstMessageBody: z.string().trim().min(1).max(20000)") === 1,
  handlerUpdate:
    countOccurrences(source, "if (body.firstMessageBody !== undefined) updates.firstMessageBody = body.firstMessageBody;") === 1,
  // Old comment text gone.
  oldCommentGone:
    countOccurrences(source, "System-only fields (firstMessage*,") === 0,
};
console.log("[edit-message-be] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[edit-message-be] FAIL"); process.exit(4);
}
console.log("[edit-message-be] DONE");
