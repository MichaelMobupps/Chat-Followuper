#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// Patch 02: BE — teach services/channels/telegram.ts to build deep links
// from either a Telegram @handle (existing) or an E.164 phone (new).
//
// Telegram supports phone-based deep links of the form
//     https://t.me/+972547734033
// (the leading "+" is required, unlike wa.me which strips it). So when
// the prospect record has a phone instead of a handle, we build that
// form directly. The path's "+" is a valid RFC 3986 sub-delim and does
// not need percent-encoding.
//
// The route layer that calls generateLink will start passing a phone
// when telegram_handle is null but phone is non-null, post this patch.
// (That route change rides separately when the channel send-next path
// becomes telegram-aware end-to-end. This patch is the minimum so the
// adapter handles both inputs cleanly.)
//
// Idempotent — keyed on a unique marker inside the new code.
// ──────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const FILE = path.join(
  REPO_ROOT,
  "artifacts/api-server/src/services/channels/telegram.ts",
);

const MARKER = "phone-based deep link";

let src = fs.readFileSync(FILE, "utf8");

if (src.includes(MARKER)) {
  console.log("  02-be-telegram-generatelink-phone: already applied, skipping");
  process.exit(0);
}

const before = `/**
 * Build a https://t.me/<handle>?text=<urlencoded-body> deep link for
 * the given Telegram handle and message body. Strips a leading "@"
 * when present so both stored conventions ("@user" and "user") work.
 */
export function generateLink(handle: string, body: string): string {
  const normalized = handle.startsWith("@") ? handle.slice(1) : handle;
  const encoded = encodeURIComponent(body);
  return \`https://t.me/\${normalized}?text=\${encoded}\`;
}`;

const after = `/**
 * Build a Telegram deep link for the given identifier and message body.
 *
 * Two identifier shapes are supported:
 *   - @handle (or bare handle without "@"): builds the standard
 *     https://t.me/<normalized>?text=... form.
 *   - E.164 phone starting with "+": builds the phone-based deep link
 *     https://t.me/+<digits>?text=... — the leading "+" is required by
 *     Telegram's client deep-link routing. (Contrast with wa.me which
 *     strips the "+" and accepts only digits.) The "+" is a valid
 *     RFC 3986 sub-delim in a path segment and does not need encoding.
 *
 * The handler at the route layer decides which shape is being passed
 * (typically phone if prospects.phone is set, otherwise telegram_handle).
 */
export function generateLink(identifier: string, body: string): string {
  const encoded = encodeURIComponent(body);
  if (identifier.startsWith("+")) {
    // Phone-based deep link. Keep the "+" verbatim.
    return \`https://t.me/\${identifier}?text=\${encoded}\`;
  }
  const normalized = identifier.startsWith("@")
    ? identifier.slice(1)
    : identifier;
  return \`https://t.me/\${normalized}?text=\${encoded}\`;
}`;

if (!src.includes(before)) {
  console.error("  02-be-telegram-generatelink-phone: anchor not found");
  console.error("    expected the original generateLink declaration block");
  process.exit(1);
}

src = src.replace(before, after);

fs.writeFileSync(FILE, src);
console.log("  02-be-telegram-generatelink-phone: applied");
