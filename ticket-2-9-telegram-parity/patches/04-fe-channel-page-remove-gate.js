#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// Patch 04: FE — remove the WhatsApp-only gate on ManualContactsSection
// in ChannelFollowupPage.tsx. Post-patch, the section renders for any
// channel that the user has enabled in their manual_ingest_channels
// settings (the section itself shows/hides its Add button based on
// channel membership in the toggle state, so a channel without manual
// ingest enabled simply shows the off-state band).
//
// We also pass the actual `channel` prop through instead of the
// hard-coded "whatsapp" literal that 2-7-fe used while Telegram was
// gated.
//
// Idempotent — keyed on the new render shape.
// ──────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const FILE = path.join(
  REPO_ROOT,
  "artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx",
);

// Once applied, the source will contain the unguarded section render.
const MARKER = "<ManualContactsSection channel={channel} />";

let src = fs.readFileSync(FILE, "utf8");

if (src.includes(MARKER)) {
  console.log("  04-fe-channel-page-remove-gate: already applied, skipping");
  process.exit(0);
}

const before = `      {channel === "whatsapp" && (
        <ManualContactsSection channel="whatsapp" />
      )}`;

const after = `      {/*
        Manual Contacts is channel-parameterized as of ticket-2-9.
        The section's own toggle state (per-user, per-channel) governs
        whether the Add button shows; rendering here is unconditional.
      */}
      <ManualContactsSection channel={channel} />`;

if (!src.includes(before)) {
  console.error("  04-fe-channel-page-remove-gate: anchor not found");
  console.error(
    "    expected the WhatsApp-only gate around <ManualContactsSection>",
  );
  process.exit(1);
}

src = src.replace(before, after);

fs.writeFileSync(FILE, src);
console.log("  04-fe-channel-page-remove-gate: applied");
