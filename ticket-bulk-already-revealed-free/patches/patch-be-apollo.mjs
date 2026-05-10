#!/usr/bin/env node
/**
 * Ticket bulk-already-revealed-free — BE services/apollo.ts
 *
 * Two atomic edits:
 *   1. Add `existingPhone: string | null` field to ApolloPersonSummary
 *      interface (the canonical type definition)
 *   2. Update mapPerson to populate existingPhone via pickPhone(raw).
 *      Apollo only surfaces phone_numbers in people-search results for
 *      contacts the calling account has already revealed (= already-
 *      spent credit). For not-yet-revealed contacts, phone_numbers is
 *      empty/missing, so pickPhone returns null and the regular reveal
 *      flow runs.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/apollo.ts",
);

// ──────────────────────────────────────────────────────────────────
// Edit 1.1 — add existingPhone field to ApolloPersonSummary interface
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `  /** Obfuscated last name as returned by Apollo's people search
   *  (e.g. "Gi***l"). Full last_name only available after revealContact.
   *  Useful for the bulk multi-select grid (2.3-FE) to show enough
   *  identity for SDR recognition without bypassing the credit gate.
   *  Null when Apollo doesn't surface it. Added in Ticket 2.3-BE-A. */
  lastNameObfuscated: string | null;
}`;

const E1_NEW = `  /** Obfuscated last name as returned by Apollo's people search
   *  (e.g. "Gi***l"). Full last_name only available after revealContact.
   *  Useful for the bulk multi-select grid (2.3-FE) to show enough
   *  identity for SDR recognition without bypassing the credit gate.
   *  Null when Apollo doesn't surface it. Added in Ticket 2.3-BE-A. */
  lastNameObfuscated: string | null;
  /** Phone number when Apollo has already revealed this contact in the
   *  calling account (= phone_numbers populated in the people-search
   *  response). When non-null, no reveal call is needed — the phone is
   *  already "your data" and can be used directly at zero credit cost.
   *  Caller should check this before calling revealContact or
   *  requestPhoneReveal. Added in Ticket bulk-already-revealed-free. */
  existingPhone: string | null;
}`;

const E1_MARKER = `phone_numbers populated in the people-search`;

// ──────────────────────────────────────────────────────────────────
// Edit 1.2 — update mapPerson to surface existingPhone
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `    lastNameObfuscated:
      typeof rawSearch.last_name_obfuscated === "string"
        ? rawSearch.last_name_obfuscated
        : null,
  };
}`;

const E2_NEW = `    lastNameObfuscated:
      typeof rawSearch.last_name_obfuscated === "string"
        ? rawSearch.last_name_obfuscated
        : null,
    // pickPhone reads phone_numbers from the raw response. Apollo only
    // surfaces phone_numbers in people-search results for contacts the
    // calling account has already revealed (= already-spent credit).
    // For not-yet-revealed contacts, phone_numbers is empty/missing, so
    // this returns null and the regular reveal flow runs in processOne.
    existingPhone: pickPhone(raw),
  };
}`;

const E2_MARKER = `existingPhone: pickPhone(raw)`;

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

const r1 = applyEdit("interface-field", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("mapPerson-body", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  interfaceField: countOccurrences(source, "existingPhone: string | null;") === 1,
  mapPersonField: countOccurrences(source, "existingPhone: pickPhone(raw)") === 1,
};
console.log("[bulk-already-revealed-free-be] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[bulk-already-revealed-free-be] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[bulk-already-revealed-free-be] DONE");
process.exit(0);
