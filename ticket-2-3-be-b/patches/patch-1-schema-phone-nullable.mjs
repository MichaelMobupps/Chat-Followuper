#!/usr/bin/env node
/**
 * Ticket 2.3-BE-B — patch 1/5: drop NOT NULL on prospects.phone
 *
 * lib/db/src/schema/prospects.ts
 *
 * Required for the bulk WhatsApp flow's "maybe" path: prospects
 * created from Apollo's "Maybe: please request direct dial" path have
 * no phone until the async webhook lands. The webhook handler (patch 3)
 * then promotes phoneNumber → phone via COALESCE.
 *
 * Companion DB migration: ALTER TABLE prospects ALTER COLUMN phone
 * DROP NOT NULL — applied separately via `pnpm --filter @workspace/db
 * push`. apply.sh does NOT auto-mutate the DB.
 *
 * (userId, phone) unique constraint stays as-is. PostgreSQL permits
 * multiple NULLs in a UNIQUE index by default, so pending prospects
 * don't collide with each other on phone=NULL.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(process.cwd(), "lib/db/src/schema/prospects.ts");

const EDIT_OLD = `    phone: text("phone").notNull(),`;

const EDIT_NEW = `    /**
     * Phone (E.164). Nullable since Ticket 2.3-BE-B to support
     * pending-reveal prospects in the bulk WhatsApp flow: Apollo's
     * "Maybe: please request direct dial" path returns no phone, so
     * we create the prospect with phone=null and apolloPersonId set,
     * then the webhook handler promotes phoneNumber → phone via the
     * correlationId lookup once Apollo's bulk_match resolves.
     *
     * The (userId, phone) unique constraint still applies once phone
     * is non-null; PostgreSQL permits multiple NULLs in a UNIQUE index.
     *
     * Routes that build wa.me deep links MUST null-check phone before
     * calling generateLink (see routes/whatsappLink.ts → 409
     * phone_reveal_pending).
     */
    phone: text("phone"),`;

const EDIT_MARKER = `Nullable since Ticket 2.3-BE-B`;

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

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const markerCount = countOccurrences(source, EDIT_MARKER);
const oldCount = countOccurrences(source, EDIT_OLD);

if (markerCount > 0 && oldCount === 0) {
  console.log("[schema] SKIP — already applied");
  process.exit(0);
}
if (markerCount === 0 && oldCount === 0) {
  console.log("[schema] NOOP — neither anchor nor marker found; file in unexpected state");
  process.exit(3);
}
if (oldCount > 1) {
  console.log(`[schema] FAIL — anchor matched ${oldCount} times; expected 1`);
  process.exit(3);
}
if (markerCount > 0 && oldCount > 0) {
  console.log("[schema] FAIL — both marker and anchor present; partial state");
  process.exit(3);
}

const next = source.replace(EDIT_OLD, EDIT_NEW);
writeFileSync(FILE, next, "utf8");

const evidence = {
  phoneNotNullRemoved: countOccurrences(next, `phone: text("phone").notNull()`) === 0,
  phoneNullableNew: countOccurrences(next, `phone: text("phone"),`) === 1,
  marker: countOccurrences(next, EDIT_MARKER) === 1,
};
console.log("[schema] APPLY — patch applied");
console.log("[schema] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[schema] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
