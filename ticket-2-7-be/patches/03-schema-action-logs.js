#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// Patch 03: add two new ACTION_TYPES entries for manual ingest.
// Idempotent.
// ──────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const FILE = path.join(REPO_ROOT, "lib/db/src/schema/action_logs.ts");

const MARKER = 'manualIngestSingle: "prospect.manual_ingest.single"';
const ANCHOR = '  prospectDeleted: "prospect.deleted",';

const INSERTION = `
  // Ticket 2.7-BE-A — manual prospect ingest.
  //
  // manualIngestSingle: SDR submitted a one-off manual prospect via the
  // manual ingest form (4 fields plus optional context). Source mode on
  // the resulting prospect is "manual"; metadata records channel/ticker
  // and whether prePlatformContext was provided.
  //
  // manualIngestToggle: SDR flipped the manual-ingest toggle for a given
  // channel. metadata.channel records the channel slug; metadata.enabled
  // records the new boolean state.
  manualIngestSingle: "prospect.manual_ingest.single",
  manualIngestToggle: "user.manual_ingest_toggle",`;

const src = fs.readFileSync(FILE, "utf8");

if (src.includes(MARKER)) {
  console.log("  03-schema-action-logs: already applied, skipping");
  process.exit(0);
}

if (!src.includes(ANCHOR)) {
  console.error("  03-schema-action-logs: anchor not found");
  console.error("    expected: " + JSON.stringify(ANCHOR));
  process.exit(1);
}

const updated = src.replace(ANCHOR, ANCHOR + INSERTION);

if (updated === src) {
  console.error("  03-schema-action-logs: replace was a no-op (unexpected)");
  process.exit(1);
}

fs.writeFileSync(FILE, updated);
console.log("  03-schema-action-logs: applied");
