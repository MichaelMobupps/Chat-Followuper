#!/usr/bin/env node
/**
 * Ticket B-locale-plumbing — patch 4/5: services/messageGenerator.ts
 *
 * Two atomic edits:
 *   4a. Add `import { resolveLocale } from "../lib/localeResolver"`.
 *   4b. At MessageContext construction, set `language` to the resolved
 *       BCP 47 locale (e.g. "pt-BR") rather than the bare ISO 639-1.
 *
 * No em-dashes in any anchor.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messageGenerator.ts",
);

// ─── Edit 4a — import resolveLocale ──────────────────────────────
const E4A_OLD = `import { applyFirewall } from "../lib/doctrine/firewall";
import type { ProspectBrief } from "./prospectResearch";`;

const E4A_NEW = `import { applyFirewall } from "../lib/doctrine/firewall";
import { resolveLocale } from "../lib/localeResolver";
import type { ProspectBrief } from "./prospectResearch";`;

const E4A_MARKER = `import { resolveLocale } from "../lib/localeResolver";`;

// ─── Edit 4b — resolve at ctx construction ───────────────────────
const E4B_OLD = `    country: opts.prospect.country || "",
    language: opts.prospect.language || "en",`;

const E4B_NEW = `    country: opts.prospect.country || "",
    // B-locale-plumbing: resolve to BCP 47 locale (e.g. "pt-BR") when
    // both country and language are present. Falls back to bare language.
    language: resolveLocale(opts.prospect.country, opts.prospect.language) || opts.prospect.language || "en",`;

const E4B_MARKER = `language: resolveLocale(opts.prospect.country, opts.prospect.language)`;

// ─── applyEdit ───────────────────────────────────────────────────

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) { console.log(`[${label}] SKIP — already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP — anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL — anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

for (const [label, oldStr, newStr, marker] of [
  ["import-resolveLocale", E4A_OLD, E4A_NEW, E4A_MARKER],
  ["ctx-construction", E4B_OLD, E4B_NEW, E4B_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  importPresent: countOccurrences(source, `import { resolveLocale } from "../lib/localeResolver";`) === 1,
  ctxResolves: countOccurrences(source, `language: resolveLocale(opts.prospect.country, opts.prospect.language)`) === 1,
  oldCtxGone: !source.includes(`country: opts.prospect.country || "",\n    language: opts.prospect.language || "en",`),
};
console.log("[message-generator] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[message-generator] FAIL"); process.exit(4);
}
console.log("[message-generator] DONE");
