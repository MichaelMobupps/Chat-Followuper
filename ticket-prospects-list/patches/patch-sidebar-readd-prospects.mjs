#!/usr/bin/env node
/**
 * Ticket prospects-list — re-add Prospects to sidebar
 *
 * artifacts/dashboard/src/components/layout.tsx
 *
 * Two anchored edits, both idempotent regardless of whether the
 * sidebar-cleanup ticket was previously applied:
 *   1. Re-add `Users` to lucide-react import (if missing)
 *   2. Re-add `{ label: "Prospects", ... }` to NAV_ITEMS (if missing)
 *
 * Marker = the literal post-patch text. If marker present → SKIP. This
 * means: if cleanup was NOT applied (the entries are still there from
 * the original file), this patch is a complete no-op.
 *
 * Insert position: between "Follow-up: Telegram" and "Activity" in the
 * NAV_ITEMS array (the natural spot between channel-specific actions
 * and the cross-cutting Activity/Accounts section).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/layout.tsx",
);

// ──────────────────────────────────────────────────────────────────
// Edit 1 — re-add Users to imports
// ──────────────────────────────────────────────────────────────────
//
// Only matches when sidebar-cleanup HAS been applied (Users is missing).
// Anchor: the cleaned-up import block ending with `Send,\n} from
// "lucide-react";`. Insert `Users,` between Send and the closing brace.

const IMPORTS_OLD = `  Send,
} from "lucide-react";`;

const IMPORTS_NEW = `  Send,
  Users,
} from "lucide-react";`;

// Marker = `Users,` indented as it would appear inside the import block.
const IMPORTS_MARKER = `  Users,`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — re-add Prospects nav entry
// ──────────────────────────────────────────────────────────────────
//
// Anchor on the post-cleanup state (Follow-up: Telegram directly
// followed by Activity). Insert Prospects between them.

const NAV_OLD = `  { label: "Follow-up: Telegram", href: "/followup/telegram", icon: Send },
  { label: "Activity", href: "/activity", icon: Activity },`;

const NAV_NEW = `  { label: "Follow-up: Telegram", href: "/followup/telegram", icon: Send },
  { label: "Prospects", href: "/prospects", icon: Users },
  { label: "Activity", href: "/activity", icon: Activity },`;

const NAV_MARKER = `{ label: "Prospects", href: "/prospects", icon: Users }`;

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
    console.log(`[${label}] NOOP — neither anchor nor marker found`);
    return { source, ok: false };
  }
  if (o > 1) {
    console.log(`[${label}] FAIL — anchor matched ${o} times`);
    return { source, ok: false };
  }
  console.log(`[${label}] APPLY — patch applied`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const r1 = applyEdit("imports-users", source, IMPORTS_OLD, IMPORTS_NEW, IMPORTS_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("nav-prospects", source, NAV_OLD, NAV_NEW, NAV_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  usersImportPresent: countOccurrences(source, IMPORTS_MARKER) >= 1,
  prospectsNavPresent: countOccurrences(source, NAV_MARKER) === 1,
};
console.log("[sidebar-readd] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[sidebar-readd] FAIL — evidence check failed");
  process.exit(4);
}

console.log("[sidebar-readd] DONE");
process.exit(0);
