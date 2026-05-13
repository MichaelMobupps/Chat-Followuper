#!/usr/bin/env node
// FE: make ManualContactsSection helper copy channel-specific.
const fs = require("fs");
const path = require("path");

const FILE = path.join(process.cwd(), "artifacts/dashboard/src/components/followup/ManualContactsSection.tsx");
let src = fs.readFileSync(FILE, "utf8");
let changed = false;

if (!src.includes("const CHANNEL_NAME: Record<ManualIngestChannel, string>")) {
  const anchor = `const IGNITE = {
  base: "#00F5D4",
  bright: "#4FFFE3",
  aura: "rgba(0, 245, 212, 0.35)",
  dim: "rgba(0, 245, 212, 0.12)",
  glowSoft: "0 0 0 1px rgba(0,245,212,.18), 0 0 20px rgba(0,245,212,.18)",
  glowMedium: "0 0 0 1px rgba(0,245,212,.35), 0 0 28px rgba(0,245,212,.32)",
} as const;`;
  const insertion = `${anchor}

const CHANNEL_NAME: Record<ManualIngestChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};`;
  if (!src.includes(anchor)) {
    console.error("  07-fe-manual-section-channel-copy: IGNITE anchor not found");
    process.exit(1);
  }
  src = src.replace(anchor, insertion);
  changed = true;
}

const oldCopy = `              {enabled
                ? "Add people you're already in touch with. They flow into the queue with the rest."
                : "Off. Flip on to add contacts who aren't from Apollo."}`;
const newCopy = `              {enabled
                ? \`Add people you're already in touch with on \${CHANNEL_NAME[channel]}. They flow into the queue with the rest.\`
                : \`Off. Flip on to add \${CHANNEL_NAME[channel]} contacts who aren't from Apollo.\`}`;

if (src.includes(oldCopy)) {
  src = src.replace(oldCopy, newCopy);
  changed = true;
} else if (src.includes("CHANNEL_NAME[channel]") && src.includes("They flow into the queue")) {
  // already patched
} else {
  console.error("  07-fe-manual-section-channel-copy: copy anchor not found");
  process.exit(1);
}

fs.writeFileSync(FILE, src);
console.log(`  07-fe-manual-section-channel-copy: ${changed ? "applied" : "already ok"}`);
