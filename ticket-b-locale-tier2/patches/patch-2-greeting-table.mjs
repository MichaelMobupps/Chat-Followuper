#!/usr/bin/env node
/**
 * Ticket B-locale-tier2 — patch 2/2: services/messagePrompts.ts
 *
 * Adds 8 regional locale GREETING_TABLE entries matching the GUIDES
 * tier2 set: en-IN, en-GB, en-US, fr-FR, fr-CA, de-DE, de-AT, de-CH.
 *
 * Each entry follows the existing { withName, withoutName, note }
 * shape. Notes are concise and concrete: register, key vocabulary
 * markers, sign-off conventions, regional pitfalls.
 *
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

// ═════════════════════════════════════════════════════════════════
// Edit 1 — Append tier2 entries after the ar-MA tier1 entry
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the full ar-MA entry line (unique) plus the closing brace
// of GREETING_TABLE. The ar-MA line contains 'MA, DZ, TN where French'
// which is unique. Em-dash-free.

const E1_OLD = `  "ar-MA": { withName: "مرحبا {NAME}،", withoutName: "مرحبا،", note: "Maghrebi Arabic, French loanwords are standard in B2B. 'Bonjour {NAME},' as French opener is also acceptable in MA, DZ, TN where French is the working language." },
};`;

const E1_NEW = `  "ar-MA": { withName: "مرحبا {NAME}،", withoutName: "مرحبا،", note: "Maghrebi Arabic, French loanwords are standard in B2B. 'Bonjour {NAME},' as French opener is also acceptable in MA, DZ, TN where French is the working language." },

  // ── REGIONAL LOCALES (B-locale-tier2) ──────────────────────────
  // English / French / German regional variants. English variants
  // emphasise spelling, regional brand references, and register.
  // French and German variants follow tier1 depth.

  "en-IN": { withName: "Hello {NAME},", withoutName: "Hello,", note: "Indian English B2B, more formal than US/UK. 'Hi' acceptable on WhatsApp once warm; 'Dear Mr./Ms. {LastName},' for cold email. Avoid US slang (ballpark, low-hanging fruit). Spelling follows en-GB (optimisation, behaviour, centre). Currency INR (lakh / crore for amounts under 100M)." },
  "en-GB": { withName: "Hi {NAME},", withoutName: "Hello,", note: "British English, slightly more reserved than en-US. 'Hello {NAME},' for cold email; 'Hi {NAME},' for WhatsApp. Use en-GB spelling (optimisation, organisation, behaviour, centre, licence/license). Avoid Americanisms (gotten, awesome, super)." },
  "en-US": { withName: "Hi {NAME},", withoutName: "Hi there,", note: "American English, warm-direct. Default for most LLMs; explicit en-US tag mainly enforces US spelling (optimization, behavior, center) and US peer-brand references." },
  "fr-FR": { withName: "Bonjour {NAME},", withoutName: "Bonjour,", note: "Metropolitan French, vous-form for cold outreach (never tu). Sign-off: 'Cordialement,'. Numbers: '1 234,56 €' (space thousands separator, comma decimal)." },
  "fr-CA": { withName: "Bonjour {NAME},", withoutName: "Bonjour,", note: "Quebec French, stronger anti-anglicisme than fr-FR. Use courriel (NOT email), magasinage (NOT shopping), fin de semaine (NOT week-end), cellulaire (NOT mobile/portable). Vous-form for cold outreach. Sign-off: 'Cordialement,' or 'Salutations distinguées,'." },
  "de-DE": { withName: "Hallo {NAME},", withoutName: "Hallo,", note: "Standard German, Sie-form for cold outreach (never du for first contact). Cold-email opener: 'Sehr geehrte Frau / Sehr geehrter Herr {LastName},'. Sign-off: 'Mit freundlichen Grüßen,'. Numbers: '1.234,56 €' (period thousands separator, comma decimal)." },
  "de-AT": { withName: "Hallo {NAME},", withoutName: "Hallo,", note: "Austrian German, Sie-form for cold; slightly softer than de-DE. Avoid 'Servus' (too informal) and 'Grüß Gott' (traditional, not modern B2B WhatsApp). Use Jänner (NOT Januar) for January. Same orthography as de-DE (uses ß)." },
  "de-CH": { withName: "Guten Tag {NAME},", withoutName: "Guten Tag,", note: "Swiss High German, NO ß (use ss: Grüsse, Strasse, gross, weiss, dass, Mass). Most formal German variant; Sie-form throughout. Sign-off: 'Freundliche Grüsse,' (NOT Grüße). Currency CHF (NOT €)." },
};`;

const E1_MARKER = `// ── REGIONAL LOCALES (B-locale-tier2) ──`;

// ═════════════════════════════════════════════════════════════════
// applyEdit
// ═════════════════════════════════════════════════════════════════

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
  ["tier2-greetings", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  enIN: source.includes(`"en-IN": {`),
  enGB: source.includes(`"en-GB": {`),
  enUS: source.includes(`"en-US": {`),
  frFR: source.includes(`"fr-FR": {`),
  frCA: source.includes(`"fr-CA": {`),
  deDE: source.includes(`"de-DE": {`),
  deAT: source.includes(`"de-AT": {`),
  deCH: source.includes(`"de-CH": {`),
  tier2Header: source.includes("REGIONAL LOCALES (B-locale-tier2)"),
  // Spot-check key markers
  enINcurrency: source.includes("Currency INR (lakh / crore"),
  frCAcourriel: source.includes("courriel (NOT email"),
  deCHnoEszett: source.includes("NO ß (use ss"),
};
console.log("[message-prompts-greetings-tier2] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[message-prompts-greetings-tier2] FAIL"); process.exit(4);
}
console.log("[message-prompts-greetings-tier2] DONE");
