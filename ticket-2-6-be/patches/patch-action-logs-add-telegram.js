#!/usr/bin/env node
/**
 * Ticket 2.6-BE patch: add Telegram action types to ACTION_TYPES.
 *
 * Adds two entries right after the WhatsApp pair so the linkage is
 * obvious to future readers:
 *   - telegramSendIntent: "telegram.send_intent"
 *   - telegramLinkGenerated: "telegram.link_generated"
 *
 * No DB migration: action_type is a varchar(50) column with no enum
 * constraint at the DB layer; ACTION_TYPES is an application-level enum
 * only.
 *
 * Idempotent.
 */

const fs = require("node:fs");
const path = require("node:path");

const TARGET = path.join(
  process.cwd(),
  "lib",
  "db",
  "src",
  "schema",
  "action_logs.ts",
);

function applyOnce(src, oldText, newText, label) {
  if (newText !== oldText && src.includes(newText)) {
    console.log(`[${label}] SKIP — already applied`);
    return src;
  }
  const count = src.split(oldText).length - 1;
  if (count === 0) {
    console.error(`[${label}] NOOP — anchor not found`);
    process.exit(2);
  }
  if (count > 1) {
    console.error(`[${label}] FAIL — anchor matched ${count} times`);
    process.exit(2);
  }
  return src.replace(oldText, newText);
}

function main() {
  if (!fs.existsSync(TARGET)) {
    console.error(`[FATAL] missing ${TARGET}`);
    process.exit(5);
  }
  let src = fs.readFileSync(TARGET, "utf8");

  src = applyOnce(
    src,
    '  whatsappSendIntent: "whatsapp.send_intent",\n  whatsappLinkGenerated: "whatsapp.link_generated",\n',
    '  whatsappSendIntent: "whatsapp.send_intent",\n  whatsappLinkGenerated: "whatsapp.link_generated",\n  telegramSendIntent: "telegram.send_intent",\n  telegramLinkGenerated: "telegram.link_generated",\n',
    "add-telegram-action-types",
  );

  fs.writeFileSync(TARGET, src);

  const evidence = {
    telegramSendIntentPresent: src.includes(
      'telegramSendIntent: "telegram.send_intent",',
    ),
    telegramLinkGeneratedPresent: src.includes(
      'telegramLinkGenerated: "telegram.link_generated",',
    ),
    whatsappEntriesIntact:
      src.includes('whatsappSendIntent: "whatsapp.send_intent",') &&
      src.includes('whatsappLinkGenerated: "whatsapp.link_generated",'),
    actionTypesExportIntact: src.includes(
      "export const ACTION_TYPES =",
    ),
    actionTypeTypeAliasIntact: src.includes(
      "export type ActionType = (typeof ACTION_TYPES)[keyof typeof ACTION_TYPES];",
    ),
  };

  console.log("[action-logs] [evidence]", JSON.stringify(evidence));
  const failing = Object.entries(evidence)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (failing.length > 0) {
    console.error("[action-logs] FAIL —", failing);
    process.exit(4);
  }
  console.log("[action-logs] DONE");
}

main();
