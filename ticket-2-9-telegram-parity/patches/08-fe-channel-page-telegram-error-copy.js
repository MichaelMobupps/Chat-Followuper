#!/usr/bin/env node
// FE: friendly copy for Telegram identifier missing errors.
const fs = require("fs");
const path = require("path");

const FILE = path.join(process.cwd(), "artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx");
let src = fs.readFileSync(FILE, "utf8");
let changed = false;

if (!src.includes('apiCode === "no_telegram_identifier"')) {
  const before = `                    : apiCode === "no_phone"
                      ? "No phone number for this prospect."
                      : apiCode === "prospect_paused"`;
  const after = `                    : apiCode === "no_telegram_identifier" || apiCode === "no_telegram_handle"
                      ? "No Telegram handle or phone number for this prospect."
                      : apiCode === "no_phone"
                        ? "No phone number for this prospect."
                        : apiCode === "prospect_paused"`;
  if (!src.includes(before)) {
    console.error("  08-fe-channel-page-telegram-error-copy: error ladder anchor not found");
    process.exit(1);
  }
  src = src.replace(before, after);
  changed = true;
}

fs.writeFileSync(FILE, src);
console.log(`  08-fe-channel-page-telegram-error-copy: ${changed ? "applied" : "already ok"}`);
