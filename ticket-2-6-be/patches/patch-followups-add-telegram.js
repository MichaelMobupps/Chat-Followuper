#!/usr/bin/env node
/**
 * Ticket 2.6-BE patch: enable Telegram send in routes/followups.ts.
 *
 * Four anchor edits, all idempotent:
 *   1. add import for the Telegram service's generateLink (aliased)
 *   2. add "telegram" to the SEND_IMPLEMENTED_CHANNELS set
 *   3. add a precondition for !prospect.telegramHandle when
 *      body.channel === "telegram" (mirrors the no_phone branch)
 *   4. add an else-if branch in the channel dispatch that builds the
 *      t.me link using the Telegram service
 *
 * No DB writes from this patch. The follow-up flow returns the deep
 * link only; click events flow through send-intent (currently WA-only
 * — channel-parameterizing that route is a separate ticket).
 */

const fs = require("node:fs");
const path = require("node:path");

const TARGET = path.join(
  process.cwd(),
  "artifacts",
  "api-server",
  "src",
  "routes",
  "followups.ts",
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

  // ── Edit 1: add Telegram service import right after WhatsApp's ──
  src = applyOnce(
    src,
    'import {\n  generateLink,\n  GeoGateBlockedError,\n} from "../services/channels/whatsapp";\n',
    'import {\n  generateLink,\n  GeoGateBlockedError,\n} from "../services/channels/whatsapp";\nimport { generateLink as generateTelegramLink } from "../services/channels/telegram";\n',
    "add-telegram-import",
  );

  // ── Edit 2: add "telegram" to SEND_IMPLEMENTED_CHANNELS ──
  src = applyOnce(
    src,
    'const SEND_IMPLEMENTED_CHANNELS: ReadonlySet<SupportedChannel> = new Set([\n  "whatsapp",\n]);',
    'const SEND_IMPLEMENTED_CHANNELS: ReadonlySet<SupportedChannel> = new Set([\n  "whatsapp",\n  "telegram",\n]);',
    "add-telegram-implemented",
  );

  // ── Edit 3: add no_telegram_handle precondition ──
  // Anchor on the full close of the no_phone branch (return + closing
  // brace + blank line) so the match is unique to this block.
  src = applyOnce(
    src,
    '        res.status(409).json({ error: "no_phone" });\n      }\n      return;\n    }\n\n    // Find next scheduled followup',
    '        res.status(409).json({ error: "no_phone" });\n      }\n      return;\n    }\n    if (!prospect.telegramHandle && body.channel === "telegram") {\n      // Telegram needs the @handle to build the t.me link. There is\n      // no async reveal flow for handles today; absence is always a\n      // hard "no handle" case, unlike the WhatsApp phone-reveal nuance.\n      res.status(409).json({ error: "no_telegram_handle" });\n      return;\n    }\n\n    // Find next scheduled followup',
    "add-telegram-precondition",
  );

  // ── Edit 4: add telegram branch in the channel dispatch ──
  // Anchor on the closing brace of the WhatsApp catch + the else (the
  // 501 fallback). Replace with an else-if for telegram, keeping the
  // 501 fallback after it.
  src = applyOnce(
    src,
    '        throw err;\n      }\n    } else {\n      // Defensive — should be impossible given the SEND_IMPLEMENTED guard above.\n      res.status(501).json({ error: "channel_send_not_implemented" });\n    }',
    '        throw err;\n      }\n    } else if (body.channel === "telegram") {\n      // Same model as the WhatsApp branch above: build the deep link\n      // and let the FE open it. No geo gate (Telegram is universally\n      // available), no async reveal step. sentAt stays null; the\n      // click event flows through send-intent / clickedAt when that\n      // route is channel-parameterized in a later ticket.\n      const url = generateTelegramLink(\n        prospect.telegramHandle!,\n        next.generatedMessage,\n      );\n      res.status(200).json({\n        followupId: next.id,\n        stage: next.stage,\n        deepLinkUrl: url,\n        generatedMessage: next.generatedMessage,\n      });\n    } else {\n      // Defensive — should be impossible given the SEND_IMPLEMENTED guard above.\n      res.status(501).json({ error: "channel_send_not_implemented" });\n    }',
    "add-telegram-dispatch",
  );

  fs.writeFileSync(TARGET, src);

  const evidence = {
    telegramImportAdded: src.includes(
      'import { generateLink as generateTelegramLink } from "../services/channels/telegram";',
    ),
    telegramInSendImplemented:
      /SEND_IMPLEMENTED_CHANNELS[\s\S]*?"whatsapp",\s*\n\s*"telegram",\s*\n\s*\]\);/m.test(
        src,
      ),
    noTelegramHandleBranchPresent: src.includes(
      '!prospect.telegramHandle && body.channel === "telegram"',
    ),
    noTelegramHandleErrorCodePresent: src.includes('"no_telegram_handle"'),
    telegramDispatchBranchPresent: src.includes(
      'else if (body.channel === "telegram")',
    ),
    telegramGenerateLinkCalled: src.includes(
      "generateTelegramLink(\n        prospect.telegramHandle!",
    ),
    whatsappBranchIntact: src.includes(
      'if (body.channel === "whatsapp") {\n      try {\n        const url = generateLink(prospect.phone!, next.generatedMessage);',
    ),
    fallback501StillPresent: src.includes(
      '"channel_send_not_implemented"',
    ),
    whatsappImportIntact: src.includes(
      'from "../services/channels/whatsapp";',
    ),
  };

  console.log("[followups] [evidence]", JSON.stringify(evidence));
  const failing = Object.entries(evidence)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (failing.length > 0) {
    console.error("[followups] FAIL —", failing);
    process.exit(4);
  }
  console.log("[followups] DONE");
}

main();
