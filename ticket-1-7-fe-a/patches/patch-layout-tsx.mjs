#!/usr/bin/env node
/**
 * Anchored, idempotent patch for artifacts/dashboard/src/components/layout.tsx
 * - Adds Megaphone icon to lucide-react imports
 * - Inserts Campaigns nav item between Seeder and Prospects
 *
 * Re-runs are safe.
 */
import fs from "node:fs";

const PATH = "artifacts/dashboard/src/components/layout.tsx";

let src = fs.readFileSync(PATH, "utf8");
const before = src;
const log = (msg) => console.log(`[patch-layout-tsx] ${msg}`);

// === 1. Add Megaphone to lucide-react imports ===
// Anchor on "  Settings,\n} from \"lucide-react\";"
const iconAnchor = '  Settings,\n} from "lucide-react";';
const iconInsert =
  '  Megaphone,\n  Settings,\n} from "lucide-react";';

if (/\bMegaphone,\s*$/m.test(src) || src.includes("  Megaphone,\n")) {
  log("[SKIP] Megaphone import already present");
} else if (!src.includes(iconAnchor)) {
  console.error(
    `[patch-layout-tsx] [FAIL] could not locate icon import anchor`,
  );
  process.exit(2);
} else {
  src = src.replace(iconAnchor, iconInsert);
  log("[APPLY] added Megaphone import");
}

// === 2. Insert Campaigns nav item between Seeder and Prospects ===
const navAnchor =
  '  { label: "Seeder", href: "/seeder", icon: Sprout },\n' +
  '  { label: "Prospects", href: "/prospects", icon: Users },';
const navInsert =
  '  { label: "Seeder", href: "/seeder", icon: Sprout },\n' +
  '  { label: "Campaigns", href: "/campaigns", icon: Megaphone },\n' +
  '  { label: "Prospects", href: "/prospects", icon: Users },';

if (src.includes('label: "Campaigns", href: "/campaigns"')) {
  log("[SKIP] Campaigns nav item already present");
} else if (!src.includes(navAnchor)) {
  console.error(
    `[patch-layout-tsx] [FAIL] could not locate nav anchor`,
  );
  process.exit(2);
} else {
  src = src.replace(navAnchor, navInsert);
  log("[APPLY] inserted Campaigns nav item");
}

// === Write back ===
if (src === before) {
  log("[NOOP] no changes");
} else {
  fs.writeFileSync(PATH, src);
  log("[DONE] layout.tsx updated");
}

// === Evidence ===
const finalSrc = fs.readFileSync(PATH, "utf8");
const evidence = {
  Megaphone_import: (finalSrc.match(/^\s+Megaphone,$/gm) || []).length,
  Campaigns_nav: (
    finalSrc.match(/label: "Campaigns", href: "\/campaigns"/g) || []
  ).length,
};
console.log("[patch-layout-tsx] evidence:", JSON.stringify(evidence));

const expected = { Megaphone_import: 1, Campaigns_nav: 1 };
for (const [k, v] of Object.entries(expected)) {
  if (evidence[k] !== v) {
    console.error(
      `[patch-layout-tsx] [FAIL] evidence mismatch for ${k}: got ${evidence[k]}, expected ${v}`,
    );
    process.exit(3);
  }
}
console.log("[patch-layout-tsx] all evidence checks passed");
