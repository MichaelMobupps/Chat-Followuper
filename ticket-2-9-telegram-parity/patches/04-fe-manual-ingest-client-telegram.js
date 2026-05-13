#!/usr/bin/env node
// FE: widen ManualIngestChannel to whatsapp | telegram.
const fs = require("fs");
const path = require("path");

const FILE = path.join(process.cwd(), "artifacts/dashboard/src/lib/api/manual-ingest.ts");
let src = fs.readFileSync(FILE, "utf8");

const before = 'export const MANUAL_INGEST_CHANNELS = ["whatsapp"] as const;';
const after = 'export const MANUAL_INGEST_CHANNELS = ["whatsapp", "telegram"] as const;';

if (src.includes(before)) {
  src = src.replace(before, after);
  fs.writeFileSync(FILE, src);
  console.log("  04-fe-manual-ingest-client-telegram: applied");
} else if (src.includes('export const MANUAL_INGEST_CHANNELS = ["whatsapp", "telegram"] as const;')) {
  console.log("  04-fe-manual-ingest-client-telegram: already ok");
} else {
  console.error("  04-fe-manual-ingest-client-telegram: channel constant anchor not found");
  process.exit(1);
}
