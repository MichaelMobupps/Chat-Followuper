#!/usr/bin/env node
/**
 * Ticket Beacon-1-foundation — patch 1/2: index.html
 *
 * Two atomic edits:
 *   1a. Force dark mode by adding class="dark" to <html>. Beacon is
 *       a dark-only design system; the existing light/dark toggle
 *       remains in the CSS but the page renders dark permanently.
 *   1b. Replace Inter font link with Beacon's font triple:
 *       Bricolage Grotesque (display) + Manrope (body) + JetBrains
 *       Mono (timestamps / code / uppercase tags).
 *
 * Idempotent. Anchors em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(process.cwd(), "artifacts/dashboard/index.html");

// ─── Edit 1a — dark mode permanent ───────────────────────────────
const E1A_OLD = `<html lang="en">`;
const E1A_NEW = `<html lang="en" class="dark">`;
const E1A_MARKER = `<html lang="en" class="dark">`;

// ─── Edit 1b — Beacon font triple ────────────────────────────────
const E1B_OLD = `    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

const E1B_NEW = `    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <!-- Beacon-1: Bricolage Grotesque (display) + Manrope (body) + JetBrains Mono -->
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Manrope:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">`;

const E1B_MARKER = `<!-- Beacon-1: Bricolage Grotesque`;

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
  ["dark-mode-permanent", E1A_OLD, E1A_NEW, E1A_MARKER],
  ["beacon-fonts", E1B_OLD, E1B_NEW, E1B_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  htmlDark: countOccurrences(source, `<html lang="en" class="dark">`) === 1,
  bricolage: source.includes("Bricolage+Grotesque"),
  manrope: source.includes("Manrope"),
  jetbrains: source.includes("JetBrains+Mono"),
  interGone: !source.includes("Inter:wght"),
  oldHtmlGone: !source.includes(`<html lang="en">\n`),
};
console.log("[index-html] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[index-html] FAIL"); process.exit(4);
}
console.log("[index-html] DONE");
