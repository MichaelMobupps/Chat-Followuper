#!/usr/bin/env node
/**
 * Ticket prospect-detail — patch ProspectsListTable to make rows clickable
 *
 * artifacts/dashboard/src/components/prospects-list/ProspectsListTable.tsx
 *
 * Two anchored edits:
 *   1. Import `useLocation` from wouter
 *   2. Wire ProspectRow's <tr> to navigate to /prospects/:id on click,
 *      EXCLUDING clicks on the action button (which has its own handler)
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/prospects-list/ProspectsListTable.tsx",
);

// ──────────────────────────────────────────────────────────────────
// Edit 1 — wouter import
// ──────────────────────────────────────────────────────────────────

const IMPORT_OLD = `import { ApiError } from "@/lib/api";`;

const IMPORT_NEW = `import { ApiError } from "@/lib/api";
import { useLocation } from "wouter";`;

const IMPORT_MARKER = `import { useLocation } from "wouter";`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — make ProspectRow's <tr> clickable
// ──────────────────────────────────────────────────────────────────

const ROW_OLD = `function ProspectRow({ prospect }: { prospect: ProspectListItem }) {
  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">`;

const ROW_NEW = `function ProspectRow({ prospect }: { prospect: ProspectListItem }) {
  const [, navigate] = useLocation();
  return (
    <tr
      className="border-b last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer"
      onClick={(e) => {
        // Don't navigate when the click originated inside the action
        // button cell — that has its own handler (open WhatsApp link
        // mutation, etc). Walk up the event target to the closest <td>
        // and check its data-action attribute.
        const cell = (e.target as HTMLElement).closest("td[data-action]");
        if (cell) return;
        navigate(\`/prospects/\${prospect.id}\`);
      }}
      data-testid={\`row-\${prospect.id}\`}
    >`;

const ROW_MARKER = `cursor-pointer"
      onClick={(e) => {`;

// ──────────────────────────────────────────────────────────────────
// Edit 3 — mark the action <td> with data-action so the row click
// handler can recognise and skip it.
// ──────────────────────────────────────────────────────────────────

const ACTION_TD_OLD = `      <td className="px-4 py-2.5 align-top text-right">
        <ActionButton prospect={prospect} />
      </td>`;

const ACTION_TD_NEW = `      <td className="px-4 py-2.5 align-top text-right" data-action="true">
        <ActionButton prospect={prospect} />
      </td>`;

const ACTION_TD_MARKER = `data-action="true"`;

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

const r1 = applyEdit("import-wouter", source, IMPORT_OLD, IMPORT_NEW, IMPORT_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("row-clickable", source, ROW_OLD, ROW_NEW, ROW_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

const r3 = applyEdit("action-td-marked", source, ACTION_TD_OLD, ACTION_TD_NEW, ACTION_TD_MARKER);
if (!r3.ok) process.exit(3);
source = r3.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  wouterImport: countOccurrences(source, IMPORT_MARKER) === 1,
  rowOnClick: countOccurrences(source, "navigate(`/prospects/${prospect.id}`)") === 1,
  actionTdMarked: countOccurrences(source, ACTION_TD_MARKER) === 1,
};
console.log("[list-clickable] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[list-clickable] FAIL — evidence check failed");
  process.exit(4);
}

console.log("[list-clickable] DONE");
process.exit(0);
