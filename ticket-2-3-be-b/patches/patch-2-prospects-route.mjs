#!/usr/bin/env node
/**
 * Ticket 2.3-BE-B — patch 2/5: relax phone validation in createProspectBodySchema
 *
 * artifacts/api-server/src/routes/prospects.ts
 *
 * Two anchored edits:
 *
 *   2A. Make phone optional + nullable in the Zod schema. Add a
 *       superRefine that requires apolloPersonId when phone is absent
 *       (anti-orphan check — a prospect without phone AND without
 *       apolloPersonId can never become contactable).
 *
 *   2B. Change the insert call from `phone: body.phone` to
 *       `phone: body.phone ?? null` so the optional field round-trips
 *       cleanly to the DB column.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/routes/prospects.ts",
);

// ──────────────────────────────────────────────────────────────────────
// Edit 2A — Zod schema relaxation + superRefine
// ──────────────────────────────────────────────────────────────────────

const EDIT_2A_OLD = `const createProspectBodySchema = z
  .object({
    ...baseProspectFields,
    phone: z
      .string()
      .trim()
      .regex(
        PHONE_RE,
        "Phone must be E.164 format, e.g. '+919900000111'",
      ),
    sourceMode: z.enum(SOURCE_MODES),
  })
  .strict();`;

const EDIT_2A_NEW = `const createProspectBodySchema = z
  .object({
    ...baseProspectFields,
    phone: z
      .string()
      .trim()
      .regex(
        PHONE_RE,
        "Phone must be E.164 format, e.g. '+919900000111'",
      )
      .nullable()
      .optional(),
    sourceMode: z.enum(SOURCE_MODES),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Ticket 2.3-BE-B: phone is optional ONLY for pending-reveal
    // prospects (bulk WhatsApp flow). If phone is absent, apolloPersonId
    // MUST be set so the async webhook handler can later promote
    // phoneNumber → phone via the correlationId lookup. Without
    // apolloPersonId, the prospect can never become contactable
    // through any flow we support today.
    const phoneIsAbsent =
      data.phone === undefined ||
      data.phone === null ||
      data.phone.length === 0;
    if (phoneIsAbsent && !data.apolloPersonId) {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message:
          "phone is required unless apolloPersonId is set (pending-reveal prospect)",
      });
    }
  });`;

const EDIT_2A_MARKER = `Ticket 2.3-BE-B: phone is optional ONLY for pending-reveal`;

// ──────────────────────────────────────────────────────────────────────
// Edit 2B — insert allows null phone
// ──────────────────────────────────────────────────────────────────────

const EDIT_2B_OLD = `        userId: user.id,
        phone: body.phone,
        sourceMode: body.sourceMode,`;

const EDIT_2B_NEW = `        userId: user.id,
        // phone may be null for pending-reveal prospects (Ticket 2.3-BE-B).
        // The webhook handler in services/apollo.ts promotes phoneNumber →
        // phone when Apollo's bulk_match resolves the async reveal.
        phone: body.phone ?? null,
        sourceMode: body.sourceMode,`;

const EDIT_2B_MARKER = `phone may be null for pending-reveal prospects (Ticket 2.3-BE-B)`;

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
  return { source: source.replace(oldStr, newStr), ok: true, applied: true };
}

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const r1 = applyEdit("2A schema-relax", source, EDIT_2A_OLD, EDIT_2A_NEW, EDIT_2A_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("2B insert-null", source, EDIT_2B_OLD, EDIT_2B_NEW, EDIT_2B_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  superRefineAdded: countOccurrences(source, ".superRefine((data, ctx)") === 1,
  phoneNullableOptional: countOccurrences(source, ".nullable()\n      .optional(),") === 1,
  insertAllowsNull: countOccurrences(source, "phone: body.phone ?? null,") === 1,
  oldPhoneStringValidationGone: countOccurrences(source, `"Phone must be E.164 format, e.g. '+919900000111'",\n      ),\n    sourceMode:`) === 0,
};
console.log("[prospects-route] APPLY — patches applied");
console.log("[prospects-route] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[prospects-route] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
