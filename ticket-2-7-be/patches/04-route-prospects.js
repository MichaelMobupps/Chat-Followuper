#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// Patch 04: add manual ingest endpoints to prospects router.
//
// Three insertions in artifacts/api-server/src/routes/prospects.ts:
//   A. Add usersTable to the @workspace/db named import block.
//   B. Add `import { detectCountry } from "../lib/geoGate"`.
//   C. Insert the two new route handlers immediately before
//      `export default router;`.
//
// Idempotent — the marker check on the route content covers all three.
// ──────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const FILE = path.join(
  REPO_ROOT,
  "artifacts/api-server/src/routes/prospects.ts",
);

const MARKER = "Ticket 2.7-BE-A — manual prospect ingest";

let src = fs.readFileSync(FILE, "utf8");

if (src.includes(MARKER)) {
  console.log("  04-route-prospects: already applied, skipping");
  process.exit(0);
}

// ── Step A: extend the @workspace/db named import to include usersTable.
{
  const anchorA = "  followupsTable,\n  type Prospect,";
  if (!src.includes(anchorA)) {
    console.error("  04-route-prospects: anchor A not found");
    console.error("    expected the line `  followupsTable,` immediately followed by `  type Prospect,`");
    process.exit(1);
  }
  src = src.replace(anchorA, "  followupsTable,\n  usersTable,\n  type Prospect,");
}

// ── Step B: add detectCountry import line right after the requireAuth import.
{
  const anchorB = 'import { requireAuth } from "../middlewares/auth";';
  if (!src.includes(anchorB)) {
    console.error("  04-route-prospects: anchor B not found");
    console.error("    expected: " + JSON.stringify(anchorB));
    process.exit(1);
  }
  src = src.replace(
    anchorB,
    anchorB + '\nimport { detectCountry } from "../lib/geoGate";',
  );
}

// ── Step C: insert new route handlers immediately before the export line.
{
  const anchorC = "export default router;";
  if (!src.includes(anchorC)) {
    console.error("  04-route-prospects: anchor C not found");
    console.error("    expected: " + JSON.stringify(anchorC));
    process.exit(1);
  }

  const contentPath = path.join(
    process.env.TICKET_DIR || path.join(__dirname, ".."),
    "content",
    "prospects-route-additions.ts.txt",
  );
  if (!fs.existsSync(contentPath)) {
    console.error("  04-route-prospects: content file missing");
    console.error("    expected: " + contentPath);
    process.exit(1);
  }
  const additions = fs.readFileSync(contentPath, "utf8");

  // Insert with a blank line buffer so the new block is visually
  // separated from the existing export.
  src = src.replace(anchorC, additions.trimEnd() + "\n\n" + anchorC);
}

fs.writeFileSync(FILE, src);
console.log("  04-route-prospects: applied");
