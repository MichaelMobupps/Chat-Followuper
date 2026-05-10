#!/usr/bin/env node
/**
 * Ticket fe-error-fields-surface — surface structured detail fields in
 * ApiError.message
 *
 * artifacts/dashboard/src/lib/api.ts
 *
 * Three atomic edits:
 *   1. Add `fields?: string[]` to ServerErrorBody type
 *   2. Add `extractDetailFields` helper that handles two common error
 *      shapes:
 *        - { fields: [...] }     — our 409 missing_fields style
 *        - { issues: [{path, ...}] } — Zod's parse-issue array
 *   3. Update the `if (!res.ok)` throw block to append detail fields
 *      to the message: "missing_fields: country, language" instead of
 *      just "missing_fields".
 *
 * Why: every BE schema/precondition rejection currently surfaces in the
 * UI as just the error code (e.g. "400 invalid_body", "409 missing_
 * fields"). The actual failing field is in `body.fields` or `body.
 * issues[].path` but apiFetch drops it when constructing the Error
 * message string. Earlier today this cost us 3 round trips diagnosing
 * Arushi's failure (country wasn't ISO-2). One change here pays off on
 * every future schema mismatch.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/lib/api.ts",
);

// ──────────────────────────────────────────────────────────────────
// Edit 1 — add `fields` to ServerErrorBody
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `interface ServerErrorBody {
  error?: string;
  code?: string;
  message?: string;
}`;

const E1_NEW = `interface ServerErrorBody {
  error?: string;
  code?: string;
  message?: string;
  /** Array of field paths from a structured rejection (e.g. 409
   *  missing_fields, or surfaced from Zod issue paths). Auto-included
   *  in ApiError.message so debugging surfaces are self-explanatory. */
  fields?: string[];
}`;

const E1_MARKER = `Array of field paths from a structured rejection`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — add extractDetailFields helper after isErrorBody
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `function isErrorBody(value: unknown): value is ServerErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}`;

const E2_NEW = `function isErrorBody(value: unknown): value is ServerErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}
/**
 * Extract field paths from a server error body for inclusion in the
 * thrown error's message string. Handles two common shapes:
 *   - { fields: ["country", "language"] } — our missing_fields style
 *   - { issues: [{ path: [...], message: "..." }] } — Zod's parse issues
 * Returns null when no field information is present, in which case the
 * thrown error keeps its base message (just the error code).
 */
function extractDetailFields(
  errBody: ServerErrorBody | null,
): string[] | null {
  if (!errBody) return null;
  if (Array.isArray(errBody.fields) && errBody.fields.length > 0) {
    return errBody.fields;
  }
  const anyBody = errBody as Record<string, unknown>;
  if (Array.isArray(anyBody.issues)) {
    const paths = (anyBody.issues as Array<{ path?: unknown[] }>)
      .map((i) =>
        Array.isArray(i.path) ? i.path.map(String).join(".") : "",
      )
      .filter(Boolean);
    if (paths.length > 0) return paths;
  }
  return null;
}`;

const E2_MARKER = `function extractDetailFields(`;

// ──────────────────────────────────────────────────────────────────
// Edit 3 — update !res.ok throw block
// ──────────────────────────────────────────────────────────────────

const E3_OLD = `  if (!res.ok) {
    const errBody = isErrorBody(body) ? body : null;
    const code = errBody?.code ?? errBody?.error ?? null;
    const message =
      errBody?.message ?? errBody?.error ?? \`HTTP \${res.status}\`;
    throw new ApiError(res.status, code, message, body);
  }`;

const E3_NEW = `  if (!res.ok) {
    const errBody = isErrorBody(body) ? body : null;
    const code = errBody?.code ?? errBody?.error ?? null;
    const baseMessage =
      errBody?.message ?? errBody?.error ?? \`HTTP \${res.status}\`;
    // Surface structured field detail when present so error.message is
    // self-explanatory (e.g. "missing_fields: country" instead of just
    // "missing_fields"). Saves a network-log dive on every schema-shaped
    // error. Added in Ticket fe-error-fields-surface.
    const detailFields = extractDetailFields(errBody);
    const message =
      detailFields && detailFields.length > 0
        ? \`\${baseMessage}: \${detailFields.join(", ")}\`
        : baseMessage;
    throw new ApiError(res.status, code, message, body);
  }`;

const E3_MARKER = `Surface structured field detail when present`;

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

const r1 = applyEdit("type-fields", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("helper-extract", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

const r3 = applyEdit("throw-block", source, E3_OLD, E3_NEW, E3_MARKER);
if (!r3.ok) process.exit(3);
source = r3.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  fieldsTypeAdded: countOccurrences(source, "fields?: string[];") === 1,
  helperPresent: countOccurrences(source, "function extractDetailFields(") === 1,
  helperHandlesFields: countOccurrences(source, `Array.isArray(errBody.fields) && errBody.fields.length > 0`) === 1,
  helperHandlesIssues: source.includes("Array.isArray(anyBody.issues)"),
  throwUsesDetail: countOccurrences(source, "extractDetailFields(errBody)") === 1,
  oldSimpleMessageGone: countOccurrences(source, `const message =
      errBody?.message ?? errBody?.error ?? \`HTTP \${res.status}\`;
    throw new ApiError`) === 0,
};
console.log("[fe-error-fields-surface] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[fe-error-fields-surface] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[fe-error-fields-surface] DONE");
process.exit(0);
