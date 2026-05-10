#!/usr/bin/env node
/**
 * Ticket sidebar-cleanup — drop the 4 legacy menu entries
 *
 * artifacts/dashboard/src/components/layout.tsx
 *
 * Removes 4 menu items from the sidebar:
 *   - Seeder        → /seeder        (old single-prospect prospector)
 *   - Campaigns     → /campaigns     (placeholder)
 *   - Prospects     → /prospects     (placeholder, 240-byte stub)
 *   - Followups     → /followups     (placeholder)
 *
 * The route registrations (in App.tsx or wherever) are NOT touched.
 * Direct URLs to these paths still resolve to whatever component is
 * registered. This keeps any "Open Seeder (legacy)" buttons working
 * and protects against any deep-linked workflows we don't know about.
 *
 * Two anchored edits, both REPLACE-style:
 *   1. lucide-react imports — drop unused icons (Sprout, Users,
 *      ListChecks, Megaphone)
 *   2. NAV_ITEMS array — drop the 4 nav entries
 *
 * Idempotent. Markers are substrings unique to the new (post-patch)
 * version of each block — re-running on a patched file SKIPs cleanly.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/layout.tsx",
);

// ──────────────────────────────────────────────────────────────────
// Edit 1: lucide-react imports — drop unused icons
// ──────────────────────────────────────────────────────────────────

const IMPORTS_OLD = `import {
  CalendarClock,
  Sprout,
  Users,
  ListChecks,
  Activity,
  Megaphone,
  Settings,
  MessageCircle,
  Send,
} from "lucide-react";`;

const IMPORTS_NEW = `import {
  CalendarClock,
  Activity,
  Settings,
  MessageCircle,
  Send,
} from "lucide-react";`;

// Marker = a substring that exists ONLY in the new version. In the
// old version, CalendarClock is followed by Sprout (not Activity);
// so this 2-line sequence is unique to the patched state.
const IMPORTS_MARKER = `CalendarClock,
  Activity,`;

// ──────────────────────────────────────────────────────────────────
// Edit 2: NAV_ITEMS array — drop 4 entries
// ──────────────────────────────────────────────────────────────────

const NAV_OLD = `const NAV_ITEMS: NavItem[] = [
  { label: "Today", href: "/", icon: CalendarClock },
  { label: "Seeder", href: "/seeder", icon: Sprout },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  { label: "Prospect: WhatsApp", href: "/prospect/whatsapp", icon: MessageCircle },
  { label: "Prospect: Telegram", href: "/prospect/telegram", icon: Send },
  { label: "Follow-up: WhatsApp", href: "/followup/whatsapp", icon: MessageCircle },
  { label: "Follow-up: Telegram", href: "/followup/telegram", icon: Send },
  { label: "Prospects", href: "/prospects", icon: Users },
  { label: "Followups", href: "/followups", icon: ListChecks },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Accounts", href: "/accounts", icon: Settings },
];`;

const NAV_NEW = `const NAV_ITEMS: NavItem[] = [
  { label: "Today", href: "/", icon: CalendarClock },
  { label: "Prospect: WhatsApp", href: "/prospect/whatsapp", icon: MessageCircle },
  { label: "Prospect: Telegram", href: "/prospect/telegram", icon: Send },
  { label: "Follow-up: WhatsApp", href: "/followup/whatsapp", icon: MessageCircle },
  { label: "Follow-up: Telegram", href: "/followup/telegram", icon: Send },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Accounts", href: "/accounts", icon: Settings },
];`;

// Marker = the sequence "Today, then Prospect: WhatsApp directly".
// In the old version, Today is followed by Seeder; in the new, by
// Prospect: WhatsApp.
const NAV_MARKER = `icon: CalendarClock },
  { label: "Prospect: WhatsApp"`;

// ──────────────────────────────────────────────────────────────────
// applyEdit (APPEND-aware idempotency from Defect #9)
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

// ──────────────────────────────────────────────────────────────────
// Run
// ──────────────────────────────────────────────────────────────────

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const r1 = applyEdit("imports", source, IMPORTS_OLD, IMPORTS_NEW, IMPORTS_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("nav-items", source, NAV_OLD, NAV_NEW, NAV_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  sproutImportGone: countOccurrences(source, "  Sprout,") === 0,
  usersImportGone: countOccurrences(source, "  Users,") === 0,
  listChecksImportGone: countOccurrences(source, "  ListChecks,") === 0,
  megaphoneImportGone: countOccurrences(source, "  Megaphone,") === 0,
  seederNavGone: countOccurrences(source, `label: "Seeder"`) === 0,
  campaignsNavGone: countOccurrences(source, `label: "Campaigns"`) === 0,
  prospectsNavGone: countOccurrences(source, `label: "Prospects"`) === 0,
  followupsNavGone: countOccurrences(source, `label: "Followups"`) === 0,
  retainedItemsPresent:
    countOccurrences(source, `label: "Today"`) === 1 &&
    countOccurrences(source, `label: "Prospect: WhatsApp"`) === 1 &&
    countOccurrences(source, `label: "Prospect: Telegram"`) === 1 &&
    countOccurrences(source, `label: "Follow-up: WhatsApp"`) === 1 &&
    countOccurrences(source, `label: "Follow-up: Telegram"`) === 1 &&
    countOccurrences(source, `label: "Activity"`) === 1 &&
    countOccurrences(source, `label: "Accounts"`) === 1,
  importsMarker: countOccurrences(source, IMPORTS_MARKER) === 1,
  navMarker: countOccurrences(source, NAV_MARKER) === 1,
};
console.log("[layout-cleanup] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[layout-cleanup] FAIL — evidence check failed");
  process.exit(4);
}

console.log("[layout-cleanup] DONE — sidebar trimmed to 7 items (was 11)");
process.exit(0);
