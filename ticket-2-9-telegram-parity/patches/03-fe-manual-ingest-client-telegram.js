#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// Patch 03: FE — allow Telegram in the dashboard's MANUAL_INGEST_CHANNELS
// constant. ManualIngestCreateInput continues to use `phone` as the
// identifier field name; for Telegram this field carries either an
// E.164 phone or an @handle, and the BE figures out which.
//
// One change to artifacts/dashboard/src/lib/api/manual-ingest.ts:
//   - Expand MANUAL_INGEST_CHANNELS to include "telegram".
//
// The type ManualIngestChannel updates automatically (derived from the
// const tuple). ManualIngestCreateInput's `phone: string` field is
// already shape-correct for both channels; only the meaning widens.
//
// Idempotent — keyed on a unique marker inside the new content.
// ──────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const FILE = path.join(
  REPO_ROOT,
  "artifacts/dashboard/src/lib/api/manual-ingest.ts",
);

const MARKER = '"whatsapp", "telegram"';

let src = fs.readFileSync(FILE, "utf8");

if (src.includes(MARKER)) {
  console.log(
    "  03-fe-manual-ingest-client-telegram: already applied, skipping",
  );
  process.exit(0);
}

const before =
  'export const MANUAL_INGEST_CHANNELS = ["whatsapp"] as const;';
const after =
  'export const MANUAL_INGEST_CHANNELS = ["whatsapp", "telegram"] as const;';

if (!src.includes(before)) {
  console.error("  03-fe-manual-ingest-client-telegram: anchor not found");
  console.error("    expected: " + JSON.stringify(before));
  process.exit(1);
}

src = src.replace(before, after);

fs.writeFileSync(FILE, src);
console.log("  03-fe-manual-ingest-client-telegram: applied");
