#!/usr/bin/env node
/**
 * Ticket locale-tier3-hindi-bengali, patch 2/3: services/messagePrompts.ts
 *
 * Two atomic edits to GREETING_TABLE:
 *
 *   E1. Update the bare `bn` entry to use the Bengali-script greeting
 *       (নমস্কার) instead of the English-fallback "Hello {NAME},".
 *       This was the specific gap called out in the handoff: "currently
 *       using English greeting fallback per GREETING_TABLE". The
 *       Bengali-script greeting works for both Bangladesh and India
 *       B2B contexts as a no-country-known default.
 *
 *   E2. Append the tier-3 regional block: hi-IN, bn-BD, bn-IN. Each
 *       entry follows the tier1/tier2 shape (withName / withoutName /
 *       note). bn-BD and bn-IN share the same greeting but carry
 *       different notes covering peer-brand and currency context.
 *
 * Idempotent. All anchors em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

// ═════════════════════════════════════════════════════════════════
// Edit 1 - Update bare `bn` entry (remove English fallback)
// ═════════════════════════════════════════════════════════════════

const E1_OLD = `  bn: { withName: "Hello {NAME},", withoutName: "Hello,", note: "WhatsApp B2B in Bengali markets defaults to English greeting." },`;

const E1_NEW = `  bn: { withName: "নমস্কার {NAME},", withoutName: "নমস্কার,", note: "Standard Bengali formal greeting; works for both Bangladesh and India / West Bengal B2B contexts. English code-mixing is heavy throughout the message body in adtech contexts; the greeting stays Bengali." },`;

const E1_MARKER = `Standard Bengali formal greeting; works for both Bangladesh and India`;

// ═════════════════════════════════════════════════════════════════
// Edit 2 - Append tier-3 regional block (hi-IN, bn-BD, bn-IN)
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the last tier-2 entry (de-CH) which is unique. The de-CH
// content contains unicode (ß, €) but no em-dashes; safe to anchor on.

const E2_OLD = `  "de-CH": { withName: "Guten Tag {NAME},", withoutName: "Guten Tag,", note: "Swiss High German, NO ß (use ss: Grüsse, Strasse, gross, weiss, dass, Mass). Most formal German variant; Sie-form throughout. Sign-off: 'Freundliche Grüsse,' (NOT Grüße). Currency CHF (NOT €)." },
};`;

const E2_NEW = `  "de-CH": { withName: "Guten Tag {NAME},", withoutName: "Guten Tag,", note: "Swiss High German, NO ß (use ss: Grüsse, Strasse, gross, weiss, dass, Mass). Most formal German variant; Sie-form throughout. Sign-off: 'Freundliche Grüsse,' (NOT Grüße). Currency CHF (NOT €)." },

  // ── REGIONAL LOCALES (B-locale-tier3) ──────────────────────────
  // Hindi and Bengali script-aware entries. Hindi has one region
  // (hi-IN; India is the only Hindi B2B adtech market). Bengali
  // has two regions because Bangladesh (bn-BD) and India / West
  // Bengal (bn-IN) differ materially in peer brands, currency,
  // and English code-mixing intensity.

  "hi-IN": { withName: "Namaste {NAME},", withoutName: "Namaste,", note: "India Hindi. Latin transliteration default for WhatsApp / Telegram / Slack; Devanagari नमस्ते acceptable. Adtech body is English-heavy; structural sentences in Hindi. INR currency with lakh / crore formatting. Use आप (formal) form throughout for cold B2B." },
  "bn-BD": { withName: "নমস্কার {NAME},", withoutName: "নমস্কার,", note: "Bangladesh Bengali. Structural sentences in Bengali script, adtech terms in English. Currency BDT (Taka, ৳) with lakh / crore. Peer brands: bKash, Pathao, Daraz Bangladesh, Foodpanda Bangladesh, Robi, Grameenphone. Cities: Dhaka, Chittagong, Sylhet. Avoid Indian peers (Flipkart, Paytm, Jio) which signal wrong market. Use আপনি (formal) form." },
  "bn-IN": { withName: "নমস্কার {NAME},", withoutName: "নমস্কার,", note: "India Bengali (primarily West Bengal). Heavier English code-mixing than bn-BD; structural sentences regularly switch between Bengali and English in B2B contexts. INR currency with lakh / crore. Peer brands: India-wide (Flipkart, Paytm, Jio, Swiggy, Zomato) plus Kolkata-regional where relevant (Bandhan Bank, Spencer's). Avoid Bangladesh peer references. Use আপনি (formal) form." },
};`;

const E2_MARKER = `"hi-IN": { withName: "Namaste {NAME},"`;

// ═════════════════════════════════════════════════════════════════
// applyEdit helper
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
  if (m > 0) { console.log(`[${label}] SKIP - already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP - anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL - anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

for (const [label, oldStr, newStr, marker] of [
  ["greeting-bn-update",  E1_OLD, E1_NEW, E1_MARKER],
  ["greeting-tier3-add",  E2_OLD, E2_NEW, E2_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  bareBnUpdated:           source.includes(`bn: { withName: "নমস্কার {NAME},"`),
  oldBnEnglishGone:       !source.includes(`note: "WhatsApp B2B in Bengali markets defaults to English greeting."`),
  hiINAdded:               source.includes(`"hi-IN": { withName: "Namaste {NAME},"`),
  bnBDAdded:               source.includes(`"bn-BD": { withName: "নমস্কার {NAME},"`),
  bnINAdded:               source.includes(`"bn-IN": { withName: "নমস্কার {NAME},"`),
  tier3HeaderAdded:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Untouched:          source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Untouched:          source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  ptBRUntouched:           source.includes(`"pt-BR": { withName: "Olá {NAME},"`),
  zhHansUntouched:         source.includes(`"zh-Hans": { withName: "您好，{NAME}："`),
  enINUntouched:           source.includes(`"en-IN": { withName: "Hello {NAME},"`),
  deCHUntouched:           source.includes(`"de-CH": { withName: "Guten Tag {NAME},"`),
  bareHiUntouched:         source.includes(`hi: { withName: "Namaste {NAME},", withoutName: "Hello,",`),
  bnPeerBrandsPresent:     source.includes(`bKash, Pathao, Daraz Bangladesh`),
  bnAvoidIndianPeers:      source.includes(`Avoid Indian peers`),
  bnINAvoidBangladesh:     source.includes(`Avoid Bangladesh peer references`),
  hiINInrLakhCrore:        source.includes(`INR currency with lakh / crore`),
};
console.log("[message-prompts-tier3] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[message-prompts-tier3] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[message-prompts-tier3] DONE");
