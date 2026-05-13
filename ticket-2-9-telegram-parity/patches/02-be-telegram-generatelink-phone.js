#!/usr/bin/env node
// BE: make Telegram generateLink accept @handle/bare handle and E.164 phone.
const fs = require("fs");
const path = require("path");

const FILE = path.join(process.cwd(), "artifacts/api-server/src/services/channels/telegram.ts");
let src = fs.readFileSync(FILE, "utf8");

if (src.includes("Phone-based deep link") || src.includes('identifier.startsWith("+")')) {
  console.log("  02-be-telegram-generatelink-phone: already ok");
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
 *     https://t.me/+<digits>?text=... . Telegram only resolves this path
 *     when the recipient's privacy settings allow phone-number discovery.
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
  console.error("  02-be-telegram-generatelink-phone: original generateLink block not found");
  process.exit(1);
}

src = src.replace(before, after);
fs.writeFileSync(FILE, src);
console.log("  02-be-telegram-generatelink-phone: applied");
