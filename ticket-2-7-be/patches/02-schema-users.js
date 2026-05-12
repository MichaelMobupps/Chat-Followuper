#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// Patch 02: add manualIngestChannels jsonb array column to users schema.
// Idempotent.
// ──────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const FILE = path.join(REPO_ROOT, "lib/db/src/schema/users.ts");

const MARKER = 'manualIngestChannels: jsonb("manual_ingest_channels")';
const ANCHOR = '  slackBotToken: text("slack_bot_token"),';

const INSERTION = `
  /**
   * Channels with manual prospect ingest enabled (Ticket 2.7-BE-A).
   *
   * Per-user toggle for each follow-up channel. When a channel slug
   * appears in this array, the channel page UI exposes the manual
   * contact ingest controls. Empty array means manual ingest is off
   * everywhere; the page behaves as it did pre-2.7.
   *
   * Stored as a string array rather than a per-channel boolean record
   * to keep schema additions minimal as Teams/Slack land. Channel slug
   * values: "whatsapp" (scoped to whatsapp this ticket; "telegram"
   * lands in 2.9-BE once the identifier-shape decision resolves).
   */
  manualIngestChannels: jsonb("manual_ingest_channels")
    .$type<string[]>()
    .notNull()
    .default([]),`;

const src = fs.readFileSync(FILE, "utf8");

if (src.includes(MARKER)) {
  console.log("  02-schema-users: already applied, skipping");
  process.exit(0);
}

if (!src.includes(ANCHOR)) {
  console.error("  02-schema-users: anchor not found");
  console.error("    expected: " + JSON.stringify(ANCHOR));
  process.exit(1);
}

const updated = src.replace(ANCHOR, ANCHOR + INSERTION);

if (updated === src) {
  console.error("  02-schema-users: replace was a no-op (unexpected)");
  process.exit(1);
}

fs.writeFileSync(FILE, updated);
console.log("  02-schema-users: applied");
