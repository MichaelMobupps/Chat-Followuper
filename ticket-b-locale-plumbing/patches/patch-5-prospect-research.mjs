#!/usr/bin/env node
/**
 * Ticket B-locale-plumbing — patch 5/5: services/prospectResearch.ts
 *
 * Three atomic edits:
 *   5a. Add `import { resolveLocale, primarySubtag } from "../lib/localeResolver"`.
 *   5b. Compute `resolvedLocale` from (country, language); derive
 *       `isNonEnglish` from the primary subtag of the resolved tag.
 *       This also fixes a pre-existing bug where `language="en-US"`
 *       would have flagged isNonEnglish=true.
 *   5c. Pass `resolvedLocale` into `promptInput.language` so research
 *       prompts receive the BCP 47 tag.
 *
 * No em-dashes in any anchor.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/prospectResearch.ts",
);

// ─── Edit 5a — import resolveLocale + primarySubtag ──────────────
const E5A_OLD = `import {
  getResearchSystemPrompt,
  getResearchUserPrompt,
  type ResearchPromptInput,
} from "../lib/doctrine/researchPrompts";`;

const E5A_NEW = `import {
  getResearchSystemPrompt,
  getResearchUserPrompt,
  type ResearchPromptInput,
} from "../lib/doctrine/researchPrompts";
import { resolveLocale, primarySubtag } from "../lib/localeResolver";`;

const E5A_MARKER = `import { resolveLocale, primarySubtag } from "../lib/localeResolver";`;

// ─── Edit 5b — derive resolvedLocale + isNonEnglish ─────────────
const E5B_OLD = `  const isNonEnglish = input.language.toLowerCase() !== "en";

  // ── Substage 1: Build prompt (deterministic) ──`;

const E5B_NEW = `  // B-locale-plumbing: resolve to BCP 47 locale (e.g. "pt-BR") when
  // both country and language are present. Falls back to bare language.
  const resolvedLocale = resolveLocale(input.country, input.language) || input.language;
  const isNonEnglish = primarySubtag(resolvedLocale) !== "en";

  // ── Substage 1: Build prompt (deterministic) ──`;

const E5B_MARKER = `const resolvedLocale = resolveLocale(input.country, input.language) || input.language;`;

// ─── Edit 5c — pass resolvedLocale into promptInput ─────────────
const E5C_OLD = `  const promptInput: ResearchPromptInput = {
    brand: sanitizeBrandName(input.brand),
    country: input.country,
    language: input.language,`;

const E5C_NEW = `  const promptInput: ResearchPromptInput = {
    brand: sanitizeBrandName(input.brand),
    country: input.country,
    // B-locale-plumbing: pass resolved BCP 47 locale tag, not bare language.
    language: resolvedLocale,`;

const E5C_MARKER = `// B-locale-plumbing: pass resolved BCP 47 locale tag, not bare language.
    language: resolvedLocale,`;

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
  ["import-resolveLocale", E5A_OLD, E5A_NEW, E5A_MARKER],
  ["resolved-locale", E5B_OLD, E5B_NEW, E5B_MARKER],
  ["promptInput-locale", E5C_OLD, E5C_NEW, E5C_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  importPresent: countOccurrences(source, `import { resolveLocale, primarySubtag } from "../lib/localeResolver";`) === 1,
  resolvedComputed: countOccurrences(source, `const resolvedLocale = resolveLocale(input.country, input.language)`) === 1,
  isNonEnglishUpdated: countOccurrences(source, `primarySubtag(resolvedLocale) !== "en"`) === 1,
  promptUsesLocale: countOccurrences(source, `language: resolvedLocale,`) === 1,
  oldIsNonEnglishGone: !source.includes(`const isNonEnglish = input.language.toLowerCase() !== "en";`),
  oldPromptLangGone: !source.includes(`country: input.country,\n    language: input.language,`),
};
console.log("[prospect-research] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[prospect-research] FAIL"); process.exit(4);
}
console.log("[prospect-research] DONE");
