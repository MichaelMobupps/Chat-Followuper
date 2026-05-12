#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// Patch 01: add prePlatformContext column to prospects schema.
// Idempotent — checks for marker before applying.
// ──────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const FILE = path.join(REPO_ROOT, "lib/db/src/schema/prospects.ts");

const MARKER = 'prePlatformContext: text("pre_platform_context")';
const ANCHOR = '    contextNotes: text("context_notes"),';

const INSERTION = `
    /**
     * Pre-platform context (Ticket 2.7-BE-A).
     *
     * Optional free-text paste of the last message the SDR sent to this
     * prospect in their actual WhatsApp/Telegram, captured at manual
     * ingest time so the first Followuper-generated message can pick up
     * where the off-platform conversation left off. Fed into the
     * message generator's context when present.
     *
     * Null for Apollo-sourced prospects and for manual-ingest prospects
     * where the SDR skipped the optional field.
     */
    prePlatformContext: text("pre_platform_context"),`;

const src = fs.readFileSync(FILE, "utf8");

if (src.includes(MARKER)) {
  console.log("  01-schema-prospects: already applied, skipping");
  process.exit(0);
}

if (!src.includes(ANCHOR)) {
  console.error("  01-schema-prospects: anchor not found");
  console.error("    expected: " + JSON.stringify(ANCHOR));
  process.exit(1);
}

const updated = src.replace(ANCHOR, ANCHOR + INSERTION);

if (updated === src) {
  console.error("  01-schema-prospects: replace was a no-op (unexpected)");
  process.exit(1);
}

fs.writeFileSync(FILE, updated);
console.log("  01-schema-prospects: applied");
