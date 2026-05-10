#!/usr/bin/env node
/**
 * Ticket message-visibility-list — FE ProspectsListTable.tsx
 *
 * Two atomic edits:
 *   1. Import MessageSquare from lucide-react (alongside FileText)
 *   2. Add message preview block to the Company/title cell:
 *      one extra line under title with a chat icon + truncated body
 *      and the full message in the title attribute (browser tooltip
 *      on hover)
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/prospects-list/ProspectsListTable.tsx",
);

// ─── Edit 1 — import MessageSquare ────────────────────────────────
const E1_OLD = `  FileText,
  Send as SendIcon,`;

const E1_NEW = `  FileText,
  MessageSquare,
  Send as SendIcon,`;

const E1_MARKER = `MessageSquare,`;

// ─── Edit 2 — preview block in title cell ─────────────────────────
// Anchor on the existing Company/title cell. Append preview block
// before </td>.
const E2_OLD = `      <td className="px-4 py-2.5 align-top">
        <div className="truncate max-w-xs">{prospect.company ?? "—"}</div>
        <div className="text-xs text-muted-foreground truncate max-w-xs">
          {prospect.title ?? ""}
        </div>
      </td>`;

const E2_NEW = `      <td className="px-4 py-2.5 align-top">
        <div className="truncate max-w-xs">{prospect.company ?? "—"}</div>
        <div className="text-xs text-muted-foreground truncate max-w-xs">
          {prospect.title ?? ""}
        </div>
        {prospect.firstMessageBody && (
          <div
            className="mt-1 flex items-start gap-1 text-xs text-muted-foreground/80 italic max-w-xs"
            title={prospect.firstMessageBody}
          >
            <MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span className="truncate">{prospect.firstMessageBody}</span>
          </div>
        )}
      </td>`;

const E2_MARKER = `<MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5"`;

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
  ["preview-block", E2_OLD, E2_NEW, E2_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  importPresent: countOccurrences(source, "MessageSquare,") === 1,
  previewBlockPresent: countOccurrences(source, `<MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5"`) === 1,
  conditionalRender: countOccurrences(source, "{prospect.firstMessageBody && (") === 1,
  truncateClass: countOccurrences(source, `<span className="truncate">{prospect.firstMessageBody}</span>`) === 1,
};
console.log("[fe-table] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[fe-table] FAIL"); process.exit(4);
}
console.log("[fe-table] DONE");
