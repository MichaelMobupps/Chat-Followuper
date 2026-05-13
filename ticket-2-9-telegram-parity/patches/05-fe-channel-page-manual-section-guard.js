#!/usr/bin/env node
// FE: render ManualContactsSection only for whatsapp/telegram, and repair
// the partial-v1 broken state where it was rendered with bare channel.
const fs = require("fs");
const path = require("path");

const FILE = path.join(process.cwd(), "artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx");
let src = fs.readFileSync(FILE, "utf8");
let changed = false;

// Ensure import exists.
if (!src.includes('import { ManualContactsSection } from "./ManualContactsSection";')) {
  const anchor = 'import { SequenceConfigPanel } from "./SequenceConfigPanel";';
  if (!src.includes(anchor)) {
    console.error("  05-fe-channel-page-manual-section-guard: import anchor not found");
    process.exit(1);
  }
  src = src.replace(anchor, `${anchor}\nimport { ManualContactsSection } from "./ManualContactsSection";`);
  changed = true;
}

const correctBlock = `      {/**
       * Manual Contacts supports whatsapp + telegram as of ticket-2-9.
       * Other channels do not have manual ingest yet.
       */}
      {(channel === "whatsapp" || channel === "telegram") && (
        <ManualContactsSection channel={channel} />
      )}`;

const hasCorrectGuard = src.includes('(channel === "whatsapp" || channel === "telegram") && (') &&
  src.includes('<ManualContactsSection channel={channel} />');

if (!hasCorrectGuard) {
  const whatsappGate = `      {channel === "whatsapp" && (
        <ManualContactsSection channel="whatsapp" />
      )}`;

  if (src.includes(whatsappGate)) {
    src = src.replace(whatsappGate, correctBlock);
    changed = true;
  } else if (src.includes('      <ManualContactsSection channel={channel} />')) {
    // Repair partial-v1: the render exists but lacks a narrowing guard, so
    // SupportedChannel (whatsapp|telegram|teams|slack) is not assignable to
    // ManualIngestChannel (whatsapp|telegram).
    src = src.replace('      <ManualContactsSection channel={channel} />', correctBlock);
    changed = true;
  } else if (!src.includes('<ManualContactsSection')) {
    const anchor = "      </header>\n\n      <Tabs";
    if (!src.includes(anchor)) {
      console.error("  05-fe-channel-page-manual-section-guard: render insertion anchor not found");
      process.exit(1);
    }
    src = src.replace(anchor, `      </header>\n\n${correctBlock}\n\n      <Tabs`);
    changed = true;
  } else {
    console.error("  05-fe-channel-page-manual-section-guard: found ManualContactsSection in an unknown shape");
    process.exit(1);
  }
}

fs.writeFileSync(FILE, src);
console.log(`  05-fe-channel-page-manual-section-guard: ${changed ? "applied" : "already ok"}`);
