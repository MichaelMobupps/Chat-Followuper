#!/usr/bin/env node
/**
 * Ticket B-locale-plumbing — patch 2/5: lib/languageNativeness.ts
 *
 * Two atomic edits. Anchor strategy: BOTH anchors stop at the
 * `const guide = GUIDES[lang]` line and do NOT include any text after
 * it. The default-fallback string literal (which contains an em-dash)
 * is preserved untouched.
 *
 *   2a. buildNativenessBlock — try full tag first, fall back to primary.
 *   2b. buildCriticNativenessBlock — same fall-through.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/languageNativeness.ts",
);

// ─── Edit 2a — buildNativenessBlock ──────────────────────────────
const E2A_OLD = `export function buildNativenessBlock(languageTag: string | null | undefined): string {
  const lang = normalizeLanguageCode(languageTag);
  if (!lang || lang === "en") return "";

  const guide = GUIDES[lang] ||`;

const E2A_NEW = `export function buildNativenessBlock(languageTag: string | null | undefined): string {
  // B-locale-plumbing: full tag first, fall back to primary subtag.
  const tag = (languageTag ?? "").trim();
  if (!tag) return "";
  const lang = normalizeLanguageCode(tag);
  if (!lang) return "";

  const fullTagGuide = GUIDES[tag];
  if (fullTagGuide === undefined && lang === "en") return "";

  const guide = fullTagGuide || GUIDES[lang] ||`;

const E2A_MARKER = `const guide = fullTagGuide || GUIDES[lang] ||`;

// ─── Edit 2b — buildCriticNativenessBlock ───────────────────────
const E2B_OLD = `export function buildCriticNativenessBlock(languageTag: string | null | undefined): string {
  const lang = normalizeLanguageCode(languageTag);
  if (!lang || lang === "en") return "";

  const guide = GUIDES[lang];
  if (!guide) {`;

const E2B_NEW = `export function buildCriticNativenessBlock(languageTag: string | null | undefined): string {
  // B-locale-plumbing: full tag first, fall back to primary subtag.
  const tag = (languageTag ?? "").trim();
  if (!tag) return "";
  const lang = normalizeLanguageCode(tag);
  if (!lang) return "";

  const fullTagGuide = GUIDES[tag];
  if (fullTagGuide === undefined && lang === "en") return "";

  const guide = fullTagGuide || GUIDES[lang];
  if (!guide) {`;

const E2B_MARKER = `const guide = fullTagGuide || GUIDES[lang];
  if (!guide) {`;

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
  ["builder-fallthrough", E2A_OLD, E2A_NEW, E2A_MARKER],
  ["critic-fallthrough", E2B_OLD, E2B_NEW, E2B_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  builderUpdated: countOccurrences(source, "const fullTagGuide = GUIDES[tag];") === 2,
  builderFallback: countOccurrences(source, "fullTagGuide || GUIDES[lang] ||") === 1,
  criticFallback: countOccurrences(source, "fullTagGuide || GUIDES[lang];") === 1,
  oldBuilderGone: !source.includes(`if (!lang || lang === "en") return "";\n\n  const guide = GUIDES[lang] ||`),
  oldCriticGone: !source.includes(`if (!lang || lang === "en") return "";\n\n  const guide = GUIDES[lang];`),
};
console.log("[language-nativeness] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[language-nativeness] FAIL"); process.exit(4);
}
console.log("[language-nativeness] DONE");
