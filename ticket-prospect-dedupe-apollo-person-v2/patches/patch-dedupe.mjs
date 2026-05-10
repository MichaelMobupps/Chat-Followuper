#!/usr/bin/env node
/**
 * Ticket prospect-dedupe-apollo-person v2 — anchor without em-dash.
 *
 * v1 anchor included `SQLSTATE 23505 —` and failed NOOP. Likely cause:
 * the trailing character in the actual file is not U+2014 EM DASH but
 * a similar-looking character (en-dash, figure dash, etc) or has
 * trailing whitespace.
 *
 * v2 anchors only on `// Use onConflictDoNothing instead of try/catch
 * on SQLSTATE 23505` — a substring guaranteed to be inside the actual
 * comment line regardless of what character ends the line. The
 * em-dash and rest of the comment continuation are preserved naturally
 * because they're outside the replaced range.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/routes/prospects.ts",
);

// Anchor: 4-space indent + comment-text-up-to-23505. Stops short of
// the trailing em-dash to avoid the unicode mismatch that bit v1.
const OLD = `    // Use onConflictDoNothing instead of try/catch on SQLSTATE 23505`;

// Replacement: my new pre-check block + the same anchor at the end.
// Result: the file's existing ` —\n    // drizzle wraps...` after
// the anchor stays untouched, and my new code slots in before it.
const NEW = `    // Dedupe by Apollo person ID. The existing onConflictDoNothing
    // below dedupes by (userId, phone), but pending-reveal prospects
    // have phone = NULL and PostgreSQL allows infinite NULLs in unique
    // indexes. Without this pre-check, re-running a bulk batch on the
    // same company creates a new row per attempt (the Arushi 3-row
    // case). Race condition: two concurrent inserts could both pass
    // this check; future ticket adds a partial unique index on
    // (userId, apolloPersonId) WHERE apolloPersonId IS NOT NULL.
    if (body.apolloPersonId) {
      const existing = await db
        .select({ id: prospectsTable.id })
        .from(prospectsTable)
        .where(
          and(
            eq(prospectsTable.userId, user.id),
            eq(prospectsTable.apolloPersonId, body.apolloPersonId),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        res.status(409).json({
          error: "duplicate_apollo_person",
          detail:
            "A prospect with this Apollo person ID already exists for this user.",
          existingProspectId: existing[0]!.id,
        });
        return;
      }
    }
    // Use onConflictDoNothing instead of try/catch on SQLSTATE 23505`;

const MARKER = `error: "duplicate_apollo_person"`;

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

const r = applyEdit("dedupe-pre-check", source, OLD, NEW, MARKER);
if (!r.ok) process.exit(3);
source = r.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  preCheckPresent: countOccurrences(source, "if (body.apolloPersonId) {") >= 1,
  duplicateErrorCode: countOccurrences(source, `error: "duplicate_apollo_person"`) === 1,
  existingProspectIdReturned: countOccurrences(source, "existingProspectId: existing[0]!.id") === 1,
  phoneDedupeIntact: countOccurrences(source, `error: "duplicate_phone"`) === 1,
  // Insert comment still appears exactly once after patch.
  insertCommentStillThere:
    countOccurrences(source, "// Use onConflictDoNothing instead of try/catch on SQLSTATE 23505") === 1,
};
console.log("[dedupe-apollo-person] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[dedupe-apollo-person] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[dedupe-apollo-person] DONE");
process.exit(0);
