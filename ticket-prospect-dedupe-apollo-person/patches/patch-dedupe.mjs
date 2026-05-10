#!/usr/bin/env node
/**
 * Ticket prospect-dedupe-apollo-person — prevent duplicate prospect
 * rows for the same (userId, apolloPersonId) pair.
 *
 * artifacts/api-server/src/routes/prospects.ts
 *
 * Background: existing onConflictDoNothing dedupes by (userId, phone),
 * but pending-reveal prospects have phone = NULL. PostgreSQL allows
 * infinite NULLs in unique indexes, so re-running bulk on the same
 * company creates a new row per attempt (Arushi's 3-row case).
 *
 * Fix: explicit pre-check — if a prospect with this (userId,
 * apolloPersonId) already exists, return 409 duplicate_apollo_person
 * with the existing prospect ID. Insert is skipped entirely.
 *
 * Caveat: this fires AFTER revealContact in the bulk flow, so the
 * Apollo credit is still spent on the dupe attempt. Stopping the
 * reveal call requires a separate ticket: search-time annotation of
 * already-prospected candidates so the FE filters them out before
 * reveal. This ticket is the data-hygiene layer; the search-time
 * ticket is the cost-savings layer.
 *
 * Race: two concurrent inserts could both pass the pre-check; future
 * ticket adds a partial unique index (userId, apolloPersonId) WHERE
 * apolloPersonId IS NOT NULL for true DB-level safety.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/routes/prospects.ts",
);

// ──────────────────────────────────────────────────────────────────
// Edit — insert pre-check between campaign-owner validation block
// and the insert comment block.
//
// Anchor: the closing `}` of the `if (body.campaignId)` block plus
// the first line of the insert comment. This 2-line slice is unique
// to this exact handler — `// Use onConflictDoNothing` only appears
// once in the file.
// ──────────────────────────────────────────────────────────────────

const OLD = `    }
    // Use onConflictDoNothing instead of try/catch on SQLSTATE 23505 —`;

const NEW = `    }
    // Dedupe by Apollo person ID. The existing onConflictDoNothing
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
    // Use onConflictDoNothing instead of try/catch on SQLSTATE 23505 —`;

const MARKER = `error: "duplicate_apollo_person"`;

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

const r = applyEdit("dedupe-pre-check", source, OLD, NEW, MARKER);
if (!r.ok) process.exit(3);
source = r.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  preCheckPresent: countOccurrences(source, "if (body.apolloPersonId) {") >= 1,
  duplicateErrorCode: countOccurrences(source, `error: "duplicate_apollo_person"`) === 1,
  existingProspectIdReturned: countOccurrences(source, "existingProspectId: existing[0]!.id") === 1,
  // Sanity — original phone-dedupe logic still in place.
  phoneDedupeIntact: countOccurrences(source, `error: "duplicate_phone"`) === 1,
  insertCommentStillThere:
    countOccurrences(source, "// Use onConflictDoNothing instead of try/catch on SQLSTATE 23505 —") === 1,
};
console.log("[dedupe-apollo-person] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[dedupe-apollo-person] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[dedupe-apollo-person] DONE");
process.exit(0);
