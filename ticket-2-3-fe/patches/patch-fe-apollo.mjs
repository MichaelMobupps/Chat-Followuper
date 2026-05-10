#!/usr/bin/env node
/**
 * Ticket 2.3-FE — patch lib/api/apollo.ts and use-apollo.ts hook
 *
 * Two anchored edits:
 *   1. Append requestPhoneReveal function + type to lib/api/apollo.ts
 *   2. Append useRequestPhoneReveal hook to use-apollo.ts
 *
 * Both files exist; both anchored on the existing revealContact /
 * useRevealContact blocks (the last functions/hooks in their files).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

/**
 * Apply an anchored edit. Handles both REPLACE-style patches (anchor
 * is consumed by the replacement) and APPEND-style patches (anchor
 * remains in the file; marker is added below it).
 *
 * Rule: marker presence is the canonical "already applied" signal.
 * If marker count >= 1 → SKIP regardless of anchor count, because:
 *   - REPLACE: marker present and anchor absent (anchor was consumed) → SKIP
 *   - APPEND: marker present and anchor still there (intended) → SKIP
 *
 * Anchor checks only fire when marker is absent (not yet applied):
 *   - anchor matched 0 times → NOOP (file in unexpected state)
 *   - anchor matched 1 time → APPLY
 *   - anchor matched >1 times → FAIL (ambiguous)
 */
function applyEdit(label, file, oldStr, newStr, marker) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch (err) {
    console.error(`[${label}] FATAL — cannot read ${file}: ${err.message}`);
    process.exit(2);
  }
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) {
    console.log(`[${label}] SKIP — already applied`);
    return true;
  }
  if (o === 0) {
    console.log(`[${label}] NOOP — neither anchor nor marker found`);
    return false;
  }
  if (o > 1) {
    console.log(`[${label}] FAIL — anchor matched ${o} times`);
    return false;
  }
  writeFileSync(file, source.replace(oldStr, newStr), "utf8");
  console.log(`[${label}] APPLY — patch applied`);
  return true;
}

// ──────────────────────────────────────────────────────────────────
// Edit 1: lib/api/apollo.ts — append requestPhoneReveal
// ──────────────────────────────────────────────────────────────────

const CLIENT_FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/lib/api/apollo.ts",
);

const CLIENT_OLD = `export function revealContact(
  personId: string,
): Promise<{ contact: ApolloRevealedContact; bookkeepingWarning?: string }> {
  return apiFetch("/api/apollo/reveal", {
    method: "POST",
    body: JSON.stringify({ personId }),
  });
}`;

const CLIENT_NEW = `export function revealContact(
  personId: string,
): Promise<{ contact: ApolloRevealedContact; bookkeepingWarning?: string }> {
  return apiFetch("/api/apollo/reveal", {
    method: "POST",
    body: JSON.stringify({ personId }),
  });
}

/**
 * Async phone-reveal request (Ticket 2.3-FE, bulk WhatsApp flow).
 *
 * Mirrors src/services/apollo.ts requestPhoneReveal + the
 * /api/apollo/request-phone-reveal route. Returns 202 immediately
 * with a correlationId; the actual phone arrives later via Apollo's
 * webhook callback, which writes to prospects.phoneNumber and (per
 * Ticket 2.3-BE-B) also promotes phoneNumber → phone via COALESCE.
 *
 * Caller must have already created the prospect with the given
 * apolloPersonId; the route looks up the prospect by prospectId and
 * stamps the correlation token onto its row.
 */
export interface RequestPhoneRevealInput {
  prospectId: string;
  personId: string;
}

export interface RequestPhoneRevealResponse {
  status: "pending";
  correlationId: string;
}

export function requestPhoneReveal(
  input: RequestPhoneRevealInput,
): Promise<RequestPhoneRevealResponse> {
  return apiFetch<RequestPhoneRevealResponse>(
    "/api/apollo/request-phone-reveal",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}`;

const CLIENT_MARKER = `export function requestPhoneReveal(`;

if (!applyEdit("apollo-client", CLIENT_FILE, CLIENT_OLD, CLIENT_NEW, CLIENT_MARKER)) {
  process.exit(3);
}

// ──────────────────────────────────────────────────────────────────
// Edit 2: hooks/use-apollo.ts — append useRequestPhoneReveal
// ──────────────────────────────────────────────────────────────────

const HOOK_FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/hooks/use-apollo.ts",
);

const HOOK_OLD = `export function useRevealContact() {
  return useMutation<
    { contact: ApolloRevealedContact; bookkeepingWarning?: string },
    ApiError,
    string
  >({
    mutationFn: revealContact,
  });
}`;

const HOOK_NEW = `export function useRevealContact() {
  return useMutation<
    { contact: ApolloRevealedContact; bookkeepingWarning?: string },
    ApiError,
    string
  >({
    mutationFn: revealContact,
  });
}

/**
 * Ticket 2.3-FE: async phone-reveal hook for the bulk WhatsApp flow.
 * Treat as mutation (POST with side-effects); never auto-refetch.
 */
export function useRequestPhoneReveal() {
  return useMutation<
    RequestPhoneRevealResponse,
    ApiError,
    RequestPhoneRevealInput
  >({
    mutationFn: requestPhoneReveal,
  });
}`;

const HOOK_MARKER = `export function useRequestPhoneReveal()`;

if (!applyEdit("use-apollo-hook", HOOK_FILE, HOOK_OLD, HOOK_NEW, HOOK_MARKER)) {
  process.exit(3);
}

// ──────────────────────────────────────────────────────────────────
// Edit 3: hooks/use-apollo.ts — extend imports for the new hook
// ──────────────────────────────────────────────────────────────────

const HOOK_IMPORT_OLD = `import {
  searchOrg,
  searchPeople,
  revealContact,
  type ApolloOrgSummary,
  type ApolloPersonSummary,
  type ApolloRevealedContact,
  type SearchOrgInput,
  type SearchPeopleInput,
} from "@/lib/api/apollo";`;

const HOOK_IMPORT_NEW = `import {
  searchOrg,
  searchPeople,
  revealContact,
  requestPhoneReveal,
  type ApolloOrgSummary,
  type ApolloPersonSummary,
  type ApolloRevealedContact,
  type SearchOrgInput,
  type SearchPeopleInput,
  type RequestPhoneRevealInput,
  type RequestPhoneRevealResponse,
} from "@/lib/api/apollo";`;

const HOOK_IMPORT_MARKER = `type RequestPhoneRevealInput`;

if (!applyEdit("use-apollo-imports", HOOK_FILE, HOOK_IMPORT_OLD, HOOK_IMPORT_NEW, HOOK_IMPORT_MARKER)) {
  process.exit(3);
}

console.log("[apollo-fe] all edits applied");
process.exit(0);
