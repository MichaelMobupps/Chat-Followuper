#!/usr/bin/env node
/**
 * Ticket prospect-detail — patch App.tsx (regex-based for indent flexibility)
 *
 * artifacts/dashboard/src/App.tsx
 *
 * Two anchored edits:
 *   1. Add ProspectDetailPage import (mirrors the existing ProspectsPage
 *      import path — handles both `@/pages/...` and `./pages/...` styles)
 *   2. Add <Route path="/prospects/:id"> registration after the existing
 *      `/prospects` route, matching whatever indentation the file uses
 *      (8 / 10 / 12 spaces, tabs, doesn't matter — regex captures it)
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/App.tsx",
);

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

// ──────────────────────────────────────────────────────────────────
// Edit 1 — add ProspectDetailPage import
//
// Detect the existing ProspectsPage import line; mirror its path style
// (could be `@/pages/prospects`, `./pages/prospects`, `../pages/...`).
// ──────────────────────────────────────────────────────────────────

if (countOccurrences(source, "ProspectDetailPage from") > 0) {
  console.log("[app-import] SKIP — ProspectDetailPage import already present");
} else {
  const importRe =
    /^(import\s+ProspectsPage\s+from\s+["'])([^"']+)(["'];?\s*)$/m;
  const importMatch = source.match(importRe);
  if (!importMatch) {
    console.log(
      "[app-import] FAIL — could not find `import ProspectsPage from ...` line",
    );
    process.exit(3);
  }
  const fullExisting = importMatch[0];
  const prefix = importMatch[1];
  const existingPath = importMatch[2];
  const suffix = importMatch[3];
  const detailPath = existingPath.replace(/prospects$/, "prospect-detail");
  const detailImport = `${prefix.replace("ProspectsPage", "ProspectDetailPage")}${detailPath}${suffix}`;
  source = source.replace(fullExisting, `${fullExisting}\n${detailImport}`);
  console.log(
    `[app-import] APPLY — added \`import ProspectDetailPage from "${detailPath}"\``,
  );
}

// ──────────────────────────────────────────────────────────────────
// Edit 2 — add /prospects/:id Route registration
//
// Regex matches the existing `/prospects` Route line with ANY leading
// whitespace. Captures the whitespace and reuses it for the inserted
// line so the indentation matches whatever style the file uses.
// ──────────────────────────────────────────────────────────────────

if (countOccurrences(source, `<Route path="/prospects/:id"`) > 0) {
  console.log("[app-route] SKIP — route already registered");
} else {
  const routeRe =
    /^([ \t]*)(<Route\s+path="\/prospects"\s+component=\{ProspectsPage\}\s*\/>)\s*$/m;
  const routeMatch = source.match(routeRe);
  if (!routeMatch) {
    console.log(
      `[app-route] FAIL — could not find <Route path="/prospects" component={ProspectsPage} /> line`,
    );
    process.exit(3);
  }
  const fullLine = routeMatch[0];
  const indent = routeMatch[1];
  const routeTag = routeMatch[2];
  const newRouteLine = `${indent}<Route path="/prospects/:id" component={ProspectDetailPage} />`;
  source = source.replace(
    fullLine,
    `${indent}${routeTag}\n${newRouteLine}`,
  );
  console.log(
    `[app-route] APPLY — registered \`/prospects/:id\` (indent: ${indent.length} ${indent.includes("\t") ? "tab" : "space"} chars)`,
  );
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  importPresent: countOccurrences(source, "ProspectDetailPage from") === 1,
  routePresent:
    countOccurrences(source, `<Route path="/prospects/:id" component={ProspectDetailPage} />`) === 1,
  routePreservedExisting:
    countOccurrences(source, `<Route path="/prospects" component={ProspectsPage} />`) === 1,
};
console.log("[app-tsx] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[app-tsx] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
