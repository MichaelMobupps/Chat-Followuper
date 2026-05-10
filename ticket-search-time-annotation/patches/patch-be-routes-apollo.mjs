#!/usr/bin/env node
/**
 * Ticket search-time-annotation — BE routes/apollo.ts
 *
 * Three atomic edits:
 *   1. Add eq, and, inArray to drizzle-orm import (sql already there)
 *   2. Add prospectsTable to @workspace/db import
 *   3. Insert cross-reference query after searchPeople call in the
 *      /apollo/search-people handler
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/routes/apollo.ts",
);

// ─── Edit 1 — drizzle-orm import ──────────────────────────────────
const E1_OLD = `import { sql } from "drizzle-orm";`;
const E1_NEW = `import { and, eq, inArray, sql } from "drizzle-orm";`;
const E1_MARKER = `import { and, eq, inArray, sql } from "drizzle-orm";`;

// ─── Edit 2 — @workspace/db import ────────────────────────────────
// Anchor on the multi-line block that includes actionLogsTable just
// before ACTION_TYPES. Insert prospectsTable in between.
const E2_OLD = `  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";`;

const E2_NEW = `  actionLogsTable,
  prospectsTable,
  ACTION_TYPES,
} from "@workspace/db";`;

const E2_MARKER = `  prospectsTable,
  ACTION_TYPES,`;

// ─── Edit 3 — cross-reference query ───────────────────────────────
// Anchor on the searchPeople call block (specific to this handler,
// won't collide with searchOrg / revealContact). Append cross-ref
// logic right after the closing `);`.
const E3_OLD = `      const people: ApolloPersonSummary[] = await searchPeople(
        req.body.orgId,
        req.body.titles ?? [],
      );`;

const E3_NEW = `      const people: ApolloPersonSummary[] = await searchPeople(
        req.body.orgId,
        req.body.titles ?? [],
      );

      // Cross-reference for already-prospected candidates. Apollo's
      // search response doesn't know which people are already
      // prospects in our DB; without this annotation, the FE bulk
      // flow re-attempts reveal on dupes and burns 8c per attempt
      // (the createProspect-side dedupe in routes/prospects.ts then
      // 409s, but the credit is already gone). Annotating here lets
      // the FE filter dupes out of the candidate grid before the
      // reveal call ever fires.
      const apolloIds = people
        .map((p) => p.id)
        .filter((id): id is string => id.length > 0);
      if (apolloIds.length > 0) {
        const existing = await db
          .select({
            id: prospectsTable.id,
            apolloPersonId: prospectsTable.apolloPersonId,
          })
          .from(prospectsTable)
          .where(
            and(
              eq(prospectsTable.userId, user.id),
              inArray(prospectsTable.apolloPersonId, apolloIds),
            ),
          );
        const existingMap = new Map<string, string>();
        for (const row of existing) {
          if (row.apolloPersonId)
            existingMap.set(row.apolloPersonId, row.id);
        }
        for (const p of people) {
          p.existingProspectId = existingMap.get(p.id) ?? null;
        }
      }`;

const E3_MARKER = `Cross-reference for already-prospected candidates`;

// ─── applyEdit ────────────────────────────────────────────────────

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

const r1 = applyEdit("drizzle-import", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("db-import", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

const r3 = applyEdit("cross-ref", source, E3_OLD, E3_NEW, E3_MARKER);
if (!r3.ok) process.exit(3);
source = r3.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  drizzleImport: countOccurrences(source, `import { and, eq, inArray, sql } from "drizzle-orm";`) === 1,
  dbImport: countOccurrences(source, `  prospectsTable,
  ACTION_TYPES,`) === 1,
  crossRefBlock: countOccurrences(source, `Cross-reference for already-prospected candidates`) === 1,
  inArrayUsed: countOccurrences(source, `inArray(prospectsTable.apolloPersonId, apolloIds)`) === 1,
  annotationLoop: countOccurrences(source, `p.existingProspectId = existingMap.get(p.id) ?? null;`) === 1,
};
console.log("[be-routes-apollo] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[be-routes-apollo] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[be-routes-apollo] DONE");
process.exit(0);
