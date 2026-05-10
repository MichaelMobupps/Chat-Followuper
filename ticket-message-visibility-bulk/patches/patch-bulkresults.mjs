#!/usr/bin/env node
/**
 * Ticket message-visibility-bulk — BulkResults.tsx
 *
 * Three atomic edits:
 *   1. Import MessageSquare from lucide-react
 *   2. ReadyRow: add preview block as third line in inner div
 *   3. PendingRow: add preview block as third line in inner div
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/whatsapp-bulk/BulkResults.tsx",
);

// ─── Edit 1 — import MessageSquare ────────────────────────────────
const E1_OLD = `  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";`;

const E1_NEW = `  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  RefreshCw,
} from "lucide-react";`;

const E1_MARKER = `MessageSquare,`;

// ─── Edit 2 — ReadyRow preview block ──────────────────────────────
// Anchor on the inner div that holds displayName + title/org.
// data-testid scopes this to ReadyRow specifically (PendingRow uses
// pending-row-).
const E2_OLD = `    <Card data-testid={\`ready-row-\${prospectId}\`}>
      <CardContent className="p-3 flex items-center gap-3">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {person.title ?? "(no title)"} · {org.name}
          </div>
        </div>`;

const E2_NEW = `    <Card data-testid={\`ready-row-\${prospectId}\`}>
      <CardContent className="p-3 flex items-center gap-3">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {person.title ?? "(no title)"} · {org.name}
          </div>
          {state.firstMessageBody && (
            <div
              className="mt-1 flex items-start gap-1 text-xs text-muted-foreground/80 italic"
              title={state.firstMessageBody}
            >
              <MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <span className="truncate">{state.firstMessageBody}</span>
            </div>
          )}
        </div>`;

const E2_MARKER = `ready-row-\${prospectId}\`}>
      <CardContent className="p-3 flex items-center gap-3">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {person.title ?? "(no title)"} · {org.name}
          </div>
          {state.firstMessageBody`;

// ─── Edit 3 — PendingRow preview block ────────────────────────────
const E3_OLD = `    <Card data-testid={\`pending-row-\${state.prospectId}\`}>
      <CardContent className="p-3 flex items-center gap-3">
        <Clock className="h-4 w-4 text-amber-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {person.title ?? "(no title)"} · {org.name}
          </div>
        </div>`;

const E3_NEW = `    <Card data-testid={\`pending-row-\${state.prospectId}\`}>
      <CardContent className="p-3 flex items-center gap-3">
        <Clock className="h-4 w-4 text-amber-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {person.title ?? "(no title)"} · {org.name}
          </div>
          {state.firstMessageBody && (
            <div
              className="mt-1 flex items-start gap-1 text-xs text-muted-foreground/80 italic"
              title={state.firstMessageBody}
            >
              <MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <span className="truncate">{state.firstMessageBody}</span>
            </div>
          )}
        </div>`;

const E3_MARKER = `pending-row-\${state.prospectId}\`}>
      <CardContent className="p-3 flex items-center gap-3">
        <Clock className="h-4 w-4 text-amber-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {person.title ?? "(no title)"} · {org.name}
          </div>
          {state.firstMessageBody`;

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
  if (m > 0) { console.log(`[${label}] SKIP — already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP — anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL — anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

for (const [label, oldStr, newStr, marker] of [
  ["import", E1_OLD, E1_NEW, E1_MARKER],
  ["ready-row", E2_OLD, E2_NEW, E2_MARKER],
  ["pending-row", E3_OLD, E3_NEW, E3_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  importPresent: countOccurrences(source, "MessageSquare,") === 1,
  // Each row type has its own preview block; total occurrences = 2.
  previewBlocksCount:
    countOccurrences(source, `<MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5"`) === 2,
  conditionalRender: countOccurrences(source, "{state.firstMessageBody && (") === 2,
};
console.log("[bulkresults] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[bulkresults] FAIL"); process.exit(4);
}
console.log("[bulkresults] DONE");
