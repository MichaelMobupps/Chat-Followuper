#!/usr/bin/env node
/**
 * Ticket bulk-already-revealed-free — FE lib/api/apollo.ts
 *
 * Single edit: mirror the BE ApolloPersonSummary by adding the
 * existingPhone field. Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/lib/api/apollo.ts",
);

const EDIT_OLD = `  /** Obfuscated last name from Apollo's people search (e.g. "Gi***l").
   *  Null when Apollo doesn't surface it. */
  lastNameObfuscated: string | null;
}`;

const EDIT_NEW = `  /** Obfuscated last name from Apollo's people search (e.g. "Gi***l").
   *  Null when Apollo doesn't surface it. */
  lastNameObfuscated: string | null;
  /** Phone number when Apollo has already revealed this contact in
   *  your Apollo account. When non-null, no reveal call is needed —
   *  use directly, zero credit cost. Mirrors BE ApolloPersonSummary.
   *  Added in Ticket bulk-already-revealed-free. */
  existingPhone: string | null;
}`;

const EDIT_MARKER = `Mirrors BE ApolloPersonSummary`;

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
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

if (m > 0) {
  console.log("[fe-type-mirror] SKIP — already applied");
  process.exit(0);
}
if (o === 0) {
  console.log("[fe-type-mirror] NOOP — anchor not found");
  process.exit(3);
}
if (o > 1) {
  console.log(`[fe-type-mirror] FAIL — anchor matched ${o} times`);
  process.exit(3);
}

writeFileSync(FILE, source.replace(EDIT_OLD, EDIT_NEW), "utf8");
console.log("[fe-type-mirror] APPLY");
process.exit(0);
