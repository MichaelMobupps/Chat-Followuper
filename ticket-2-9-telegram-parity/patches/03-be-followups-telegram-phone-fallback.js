#!/usr/bin/env node
// BE: Telegram send-next should use telegramHandle when present, otherwise
// phone. This completes the phone-based manual-ingest path.
const fs = require("fs");
const path = require("path");

const FILE = path.join(process.cwd(), "artifacts/api-server/src/routes/followups.ts");
let src = fs.readFileSync(FILE, "utf8");
let changed = false;

if (!src.includes("const telegramIdentifier = prospect.telegramHandle ?? prospect.phone;")) {
  const beforeGuard = `    if (!prospect.telegramHandle && body.channel === "telegram") {
      // Telegram needs the @handle to build the t.me link. There is
      // no async reveal flow for handles today; absence is always a
      // hard "no handle" case, unlike the WhatsApp phone-reveal nuance.
      res.status(409).json({ error: "no_telegram_handle" });
      return;
    }`;

  const afterGuard = `    if (body.channel === "telegram" && !prospect.telegramHandle && !prospect.phone) {
      // Telegram can deep-link by @handle or by E.164 phone. If neither
      // identifier is stored, there is no link to open.
      res.status(409).json({ error: "no_telegram_identifier" });
      return;
    }`;

  if (src.includes(beforeGuard)) {
    src = src.replace(beforeGuard, afterGuard);
    changed = true;
  } else if (src.includes('error: "no_telegram_identifier"')) {
    // Guard already patched by another run.
  } else {
    console.error("  03-be-followups-telegram-phone-fallback: Telegram guard anchor not found");
    process.exit(1);
  }

  const beforeLink = `      const url = generateTelegramLink(
        prospect.telegramHandle!,
        next.generatedMessage,
      );`;

  const afterLink = `      const telegramIdentifier = prospect.telegramHandle ?? prospect.phone;
      if (!telegramIdentifier) {
        res.status(409).json({ error: "no_telegram_identifier" });
        return;
      }
      const url = generateTelegramLink(
        telegramIdentifier,
        next.generatedMessage,
      );`;

  if (src.includes(beforeLink)) {
    src = src.replace(beforeLink, afterLink);
    changed = true;
  } else if (src.includes("const telegramIdentifier = prospect.telegramHandle ?? prospect.phone;")) {
    // Link already patched.
  } else {
    console.error("  03-be-followups-telegram-phone-fallback: Telegram link anchor not found");
    process.exit(1);
  }
}

fs.writeFileSync(FILE, src);
console.log(`  03-be-followups-telegram-phone-fallback: ${changed ? "applied" : "already ok"}`);
