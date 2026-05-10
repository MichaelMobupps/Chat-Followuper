#!/usr/bin/env node
/**
 * Ticket B-locale-plumbing — patch 3/5: services/messagePrompts.ts
 *
 * One atomic edit:
 *   3a. buildGreetingBlock — try full tag (e.g. "pt-BR") in
 *       GREETING_TABLE first, fall back to primary subtag ("pt").
 *
 * Anchor stops at the `const entry =` line. The `if (!entry)` branch
 * with its em-dash comment is preserved untouched.
 *
 * buildNativeVoiceBlock is intentionally NOT modified in this ticket —
 * its behavior is preserved as-is. Tier1 will revisit when en-IN /
 * en-GB / en-US-specific native-voice rules are added.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

// ─── Edit 3a — buildGreetingBlock fall-through ───────────────────
const E3A_OLD = `function buildGreetingBlock(language: string, hasName: boolean): string {
  const lang = (language || "").trim().split(/[-_]/)[0].toLowerCase();
  const entry = GREETING_TABLE[lang];`;

const E3A_NEW = `function buildGreetingBlock(language: string, hasName: boolean): string {
  // B-locale-plumbing: full tag first, fall back to primary subtag.
  const tag = (language || "").trim();
  const lang = tag.split(/[-_]/)[0].toLowerCase();
  const entry = GREETING_TABLE[tag] || GREETING_TABLE[lang];`;

const E3A_MARKER = `const entry = GREETING_TABLE[tag] || GREETING_TABLE[lang];`;

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
  ["greeting-fallthrough", E3A_OLD, E3A_NEW, E3A_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  fallthroughPresent: countOccurrences(source, "GREETING_TABLE[tag] || GREETING_TABLE[lang]") === 1,
  oldAccessGone: !source.includes(`const entry = GREETING_TABLE[lang];`),
};
console.log("[message-prompts] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[message-prompts] FAIL"); process.exit(4);
}
console.log("[message-prompts] DONE");
