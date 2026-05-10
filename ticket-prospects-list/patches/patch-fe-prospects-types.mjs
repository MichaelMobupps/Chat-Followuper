#!/usr/bin/env node
/**
 * Ticket prospects-list — FE API client patch
 *
 * artifacts/dashboard/src/lib/api/prospects.ts
 *
 * Single APPEND-style edit: append the list-related types and function
 * to the end of the file. Anchor on the existing deleteProspect()
 * declaration; insert new content immediately after it.
 *
 * Idempotent via marker check (Defect #9 logic).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/lib/api/prospects.ts",
);

const EDIT_OLD = `export function deleteProspect(id: string): Promise<void> {
  return apiFetch<void>(\`/api/prospects/\${id}\`, { method: "DELETE" });
}`;

const EDIT_NEW = `export function deleteProspect(id: string): Promise<void> {
  return apiFetch<void>(\`/api/prospects/\${id}\`, { method: "DELETE" });
}

// ─────────────────────────────────────────────────────────────────────────
// LIST endpoint (Ticket prospects-list)
// ─────────────────────────────────────────────────────────────────────────
//
// Mirrors GET /api/prospects. Status semantics computed server-side; FE
// renders these labels but never recomputes them. The list response is
// a slim subset of the full Prospect type — fields not needed for table
// rendering are omitted server-side to keep payloads small.

export type ProspectStatus =
  | "sent"
  | "ready"
  | "draft"
  | "phone-pending"
  | "phone-blocked"
  | "phone-no-match";

export type ListChannel = "whatsapp" | "telegram" | "teams";

export type ListSortCol = "createdAt" | "updatedAt" | "prospectName";

export interface ListProspectsParams {
  page?: number;
  perPage?: number;
  status?: ProspectStatus;
  channel?: ListChannel;
  country?: string;
  search?: string;
  sortBy?: ListSortCol;
  sortDir?: "asc" | "desc";
}

export interface ProspectListItem {
  id: string;
  prospectName: string | null;
  company: string | null;
  title: string | null;
  country: string | null;
  language: string | null;
  phone: string | null;
  phoneRevealStatus: string;
  firstMessageChannel: string | null;
  firstMessageSentAt: string | null;
  apolloPersonId: string | null;
  createdAt: string;
  updatedAt: string;
  hasFirstMessage: boolean;
  status: ProspectStatus;
}

export interface ListProspectsResponse {
  prospects: ProspectListItem[];
  total: number;
  page: number;
  perPage: number;
}

export function listProspects(
  params: ListProspectsParams = {},
): Promise<ListProspectsResponse> {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.perPage !== undefined) search.set("perPage", String(params.perPage));
  if (params.status) search.set("status", params.status);
  if (params.channel) search.set("channel", params.channel);
  if (params.country) search.set("country", params.country);
  if (params.search) search.set("search", params.search);
  if (params.sortBy) search.set("sortBy", params.sortBy);
  if (params.sortDir) search.set("sortDir", params.sortDir);

  const qs = search.toString();
  const url = qs ? \`/api/prospects?\${qs}\` : "/api/prospects";
  return apiFetch<ListProspectsResponse>(url);
}`;

const EDIT_MARKER = `// LIST endpoint (Ticket prospects-list)`;

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
  console.log("[fe-prospects-list] SKIP — already applied");
  process.exit(0);
}
if (o === 0) {
  console.log("[fe-prospects-list] NOOP — anchor not found");
  process.exit(3);
}
if (o > 1) {
  console.log(`[fe-prospects-list] FAIL — anchor matched ${o} times`);
  process.exit(3);
}

writeFileSync(FILE, source.replace(EDIT_OLD, EDIT_NEW), "utf8");
const next = readFileSync(FILE, "utf8");

const evidence = {
  prospectStatusType: countOccurrences(next, "export type ProspectStatus =") === 1,
  listProspectsParams: countOccurrences(next, "export interface ListProspectsParams") === 1,
  prospectListItem: countOccurrences(next, "export interface ProspectListItem") === 1,
  listProspectsFn: countOccurrences(next, "export function listProspects(") === 1,
  marker: countOccurrences(next, EDIT_MARKER) === 1,
};
console.log("[fe-prospects-list] APPLY — patch applied");
console.log("[fe-prospects-list] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[fe-prospects-list] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
