#!/usr/bin/env node
/**
 * Ticket B-locale-plumbing — patch 1/5: install lib/localeResolver.ts
 *
 * The file is bundled at ../files/lib/localeResolver.ts. This patch
 * copies it to artifacts/api-server/src/lib/localeResolver.ts.
 *
 * Idempotent: if the destination exists with the ticket marker, SKIP.
 * If destination exists WITHOUT the marker, FAIL (would clobber an
 * unrelated file).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const SRC = resolve(
  dirname(new URL(import.meta.url).pathname),
  "../files/lib/localeResolver.ts",
);

const DST = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/localeResolver.ts",
);

const TICKET_MARKER = "TICKET: B-locale-plumbing";

function fail(msg) {
  console.log(`[install-locale-resolver] FAIL — ${msg}`);
  process.exit(1);
}

if (!existsSync(SRC)) fail(`bundle source missing: ${SRC}`);

const srcContent = readFileSync(SRC, "utf8");
if (!srcContent.includes(TICKET_MARKER)) {
  fail(`bundle source missing ticket marker; refusing to install`);
}

if (existsSync(DST)) {
  const existing = readFileSync(DST, "utf8");
  if (existing.includes(TICKET_MARKER)) {
    console.log(`[install-locale-resolver] SKIP — already installed`);
    process.exit(0);
  }
  fail(
    `${DST} exists but is NOT a B-locale-plumbing install. Refusing to clobber. ` +
    `If this is a re-attempt of a prior partial install, delete the file first.`,
  );
}

mkdirSync(dirname(DST), { recursive: true });
writeFileSync(DST, srcContent, "utf8");

const written = readFileSync(DST, "utf8");
const evidence = {
  fileWritten: written.length === srcContent.length,
  markerPresent: written.includes(TICKET_MARKER),
  hasResolveLocale: written.includes("export function resolveLocale("),
  hasPrimarySubtag: written.includes("export function primarySubtag("),
  hasNormalizeTag: written.includes("export function normalizeTag("),
  hasLocaleTable: written.includes("LOCALE_TABLE"),
  hasCountryMap: written.includes("COUNTRY_TO_ISO2"),
};
console.log("[install-locale-resolver] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  fail("post-install evidence check failed");
}
console.log("[install-locale-resolver] APPLY");
console.log("[install-locale-resolver] DONE");
