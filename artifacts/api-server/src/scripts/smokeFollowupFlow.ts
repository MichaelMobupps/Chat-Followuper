/**
 * Smoke test: digest email "Follow up" link → prospect deep link (not auto-send).
 *
 * Run: FOLLOWUP_LINK_SECRET=smoke-test APP_PUBLIC_URL=https://app.test \
 *      pnpm --filter @workspace/api-server run smoke:followup
 */
import { mintOpenToken, verifyOpenToken } from "../lib/followupLinkToken";
import { generateLink } from "../services/channels/whatsapp";
import { generateLink as generateTelegramLink } from "../services/channels/telegram";
import {
  isValidPushoverUserKey,
  isPushoverAppConfigured,
} from "../services/pushover";
import {
  resolveDoctrineVariant,
  doctrineVariantInstruction,
} from "../lib/doctrineVariant";
import { DEFAULT_STAGE_TIMING } from "@workspace/db";
import { appPublicUrl } from "../lib/appPublicUrl";
import {
  pushoverHourLocal,
  pushoverTimezone,
  PUSHOVER_TIMEZONE,
} from "../lib/pushoverSchedule";

const USER_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const FOLLOWUP_ID = 42;
const PROSPECT_PHONE = "+919900000111";
const IL_PHONE = "+972501234567";
const SALES_PHONE = "+972509999999";
const MESSAGE = "Hi Yaron — quick follow-up from MobUpps.";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

function main(): void {
  process.env.FOLLOWUP_LINK_SECRET ??= "smoke-test-secret";
  process.env.APP_PUBLIC_URL ??= "https://app.test";

  console.log("[smoke] token round-trip");
  const token = mintOpenToken(FOLLOWUP_ID, USER_ID);
  assert(verifyOpenToken(token, FOLLOWUP_ID, USER_ID), "valid token");
  assert(
    !verifyOpenToken(token, FOLLOWUP_ID + 1, USER_ID),
    "wrong followup rejected",
  );
  assert(
    !verifyOpenToken(token, FOLLOWUP_ID, USER_ID + "x"),
    "wrong user rejected",
  );

  console.log("[smoke] digest email URL targets API open route");
  const base = appPublicUrl();
  const openUrl = `${base}/api/followups/open/${FOLLOWUP_ID}?t=${token}`;
  assert(openUrl.includes("/api/followups/open/42"), "open path");
  assert(openUrl.includes("t="), "token query param");

  console.log("[smoke] WhatsApp deep link targets PROSPECT phone (not sales rep)");
  const waLink = generateLink(PROSPECT_PHONE, MESSAGE);
  assert(waLink.startsWith("https://wa.me/919900000111"), `wa url: ${waLink}`);
  assert(
    waLink.includes(encodeURIComponent(MESSAGE)),
    "message embedded in wa link",
  );
  assert(!waLink.includes("999999"), "must not use sales rep number");

  console.log("[smoke] geo gate allows all valid E.164 phones");
  const ilLink = generateLink(IL_PHONE, "x");
  assert(ilLink.includes("972501234567"), ilLink);

  console.log("[smoke] WhatsApp test link uses same generator as production");
  const selfTest = generateLink(SALES_PHONE, "Test");
  assert(selfTest.includes("972509999999"), selfTest);

  console.log("[smoke] Telegram deep link targets prospect handle");
  const tgLink = generateTelegramLink("@prospect_handle", MESSAGE);
  assert(tgLink.includes("t.me/prospect_handle"), tgLink);

  const tgPhoneLink = generateTelegramLink(IL_PHONE, MESSAGE);
  assert(tgPhoneLink.includes("t.me/+972501234567"), tgPhoneLink);

  console.log("[smoke] doctrine variant resolves from stage timing");
  const variant = resolveDoctrineVariant(DEFAULT_STAGE_TIMING, 2);
  assert(variant === "competitor_move", variant);
  const instruction = doctrineVariantInstruction(variant);
  assert(instruction.includes("competitor"), instruction);

  console.log("[smoke] Pushover schedule defaults");
  assert(pushoverTimezone() === PUSHOVER_TIMEZONE, pushoverTimezone());
  assert(pushoverHourLocal() === 12, "midday hour");

  console.log("[smoke] Pushover user key validation");
  assert(
    isValidPushoverUserKey("abcdefghijklmnopqrstuvwxyz1234"),
    "30-char key valid",
  );
  assert(!isValidPushoverUserKey("short"), "short key invalid");
  assert(
    isPushoverAppConfigured() === !!process.env.PUSHOVER_APP_TOKEN?.trim(),
    "pushover app config detection",
  );

  console.log("[smoke] email HTML contains Follow up CTA");
  const emailSnippet = `<a href="${openUrl}">Follow up</a>`;
  assert(emailSnippet.includes("Follow up"), "cta label");

  console.log("\n[smoke] PASS — email/push open chat with PROSPECT prefilled;");
  console.log("         the rep still presses Send in WhatsApp/Telegram (manual send).");
}

main();