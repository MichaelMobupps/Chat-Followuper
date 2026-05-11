#!/usr/bin/env node
/**
 * Ticket locale-tier3-hindi-bengali, patch 3/3: lib/languageNativeness.ts
 *
 * One atomic edit: append tier-3 regional block to GUIDES.
 *
 * Three entries: hi-IN, bn-BD, bn-IN. Each entry mirrors the depth of
 * tier1/tier2 entries (ORTHOGRAPHY, ADTECH VOCABULARY, CITY/MARKET
 * REFERENCES, PEER BRANDS, TONE sub-sections).
 *
 * The lookup pattern in buildNativenessBlock is full-tag-first with
 * primary-subtag fallback (line ~627: GUIDES[tag] || GUIDES[lang]).
 * So adding hi-IN does NOT replace bare hi; both coexist. bare hi
 * still fires when language=hi with no country, or when country is
 * non-IN (rare).
 *
 * Anchor: the closing of the de-CH entry (last existing tier-2 entry)
 * plus the closing brace of GUIDES. de-CH ends with the unique string
 * `do not push pace.",` which appears only in that final entry.
 *
 * Idempotent. Anchor em-dash-free; box-drawing chars in NEW are safe.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/languageNativeness.ts",
);

// ═════════════════════════════════════════════════════════════════
// Edit 1 - Append tier-3 block (hi-IN, bn-BD, bn-IN) to GUIDES
// ═════════════════════════════════════════════════════════════════

const E1_OLD = `do not push pace.",
};`;

const E1_NEW = `do not push pace.",

  // ── REGIONAL LOCALES (B-locale-tier3) ──────────────────────────
  // Hindi (hi-IN) and Bengali (bn-BD, bn-IN) script-aware entries.
  // Hindi has one regional bucket because India is the only major
  // Hindi B2B adtech market. Bengali has two regional buckets
  // because Bangladesh and India / West Bengal differ materially
  // in vocabulary, peer brands, currency, and English code-mixing
  // intensity. All three share the formal verb form for cold B2B:
  // आप for Hindi, আপনি for Bengali.

  "hi-IN":
    "Hindi-India (hi-IN): Indian adtech is conducted primarily in English even when writing in Hindi. Keep ALL technical vocabulary in English; structural and connective sentences in Hindi. Use आप (formal) form throughout for cold B2B outreach; never tu / तू. " +
    "SCRIPT: Devanagari script is acceptable; Latin-script transliteration of Hindi structural words (Namaste, dhanyavaad) is also normal on WhatsApp / Telegram / Slack between professionals exchanging messages on phones. For Teams (enterprise context) prefer Devanagari for greeting words. Hinglish (Hindi in Latin script with English code-mixing) is the actual working register for most Indian B2B chat. " +
    "ADTECH VOCABULARY: keep in English: retention, install, conversion, targeting, traffic, creatives, publisher, pre-bid, post-attribution, lookalike, in-app, cohort, geo-targeting, fraud filtering, CPI, CPA, ROAS, DSP, MMP, LTV, ARPU, D7, KPI, A/B test, SDK, attribution, churn, funnel, programmatic, retargeting. Localize ONLY: अभियान (campaign) when natural; ग्राहक (customer) for non-technical references; भुगतान (payment); उपयोगकर्ता (user) only when emphasizing the human side. " +
    "CITY/MARKET REFERENCES: Bengaluru (NOT Bangalore; current official name), Mumbai (NOT Bombay), Delhi NCR, Hyderabad, Pune, Chennai, Kolkata, Ahmedabad, Gurugram (NOT Gurgaon for official register), Noida. Currency INR (₹ or Rs.), with lakh (1,00,000) and crore (1,00,00,000) for amounts under 100M. Indian numbering uses '2,00,000' (lakh notation) not '200,000'. " +
    "PEER BRANDS: Flipkart, Myntra, Meesho, Reliance JioMart, Tata Neu, Amazon India, Nykaa, BigBasket, Blinkit, Zepto, Swiggy, Zomato, Ola, Uber India, Rapido, RedBus, MakeMyTrip, EaseMyTrip, BookMyShow, Hotstar / Disney+ Hotstar, JioCinema, Sony LIV, ZEE5, Paytm, PhonePe, Google Pay India, BharatPe, CRED, Razorpay, Cashfree, RuPay (NOT just Visa / Mastercard), HDFC Bank, ICICI Bank, SBI, Kotak Mahindra, Axis Bank, IndusInd, Bandhan Bank, Bajaj Finserv, LIC. Avoid US-only brand references (Amazon US, Walmart, Target) which read as a mismatched template. " +
    "TONE: formal-warm. Indian B2B chat register is more polite than en-US but allows direct asks. Sign-offs: 'धन्यवाद' or 'Thanks and regards,' both acceptable. Avoid US slang (ballpark, low-hanging fruit, deep dive, circle back). Use INR amounts always with lakh / crore convention.",

  "bn-BD":
    "Bengali-Bangladesh (bn-BD): Bangladesh adtech mixes Bengali grammar with English technical terminology. Use আপনি (formal) form for cold B2B outreach; never তুই / তুমি in first contact. Bangladesh Bengali differs from India Bengali in vocabulary, peer brands, and English-code-mixing intensity; they are distinct B2B markets and references should not cross over. " +
    "SCRIPT: Bengali script (Bangla script) is standard for greeting and structural words. Latin-script transliteration is acceptable on WhatsApp / Telegram / Slack but Bengali script reads as more professional. For Teams (enterprise) prefer Bengali script throughout. " +
    "ADTECH VOCABULARY: keep in English: retention, install, conversion, targeting, traffic, creatives, publisher, pre-bid, post-attribution, lookalike, in-app, cohort, geo-targeting, fraud filtering, CPI, CPA, ROAS, DSP, MMP, LTV, ARPU, D7, KPI, A/B test, SDK, attribution, churn, funnel, retargeting. Localize ONLY: ক্যাম্পেইন (campaign) when natural; গ্রাহক (customer) for non-technical references; পেমেন্ট is fine in either script. " +
    "CITY/MARKET REFERENCES: Dhaka (capital), Chittagong / Chattogram (current official spelling), Sylhet, Khulna, Rajshahi, Barisal / Barishal, Rangpur, Mymensingh. Currency BDT (Bangladeshi Taka, ৳ or Tk.), with lakh (1,00,000) and crore (1,00,00,000) for amounts under 100M; Bangladesh uses Indian-style numbering '2,00,000 টাকা'. " +
    "PEER BRANDS: bKash (dominant mobile money), Nagad (state-backed mobile money), Rocket (DBBL mobile), Pathao (ride / delivery), Uber Bangladesh, Foodpanda Bangladesh, HungryNaki, Daraz Bangladesh (Alibaba), Chaldal (groceries), Shohoz (transport / payments), Robi, Grameenphone (GP), Banglalink, Teletalk (state operator), Brac Bank, Eastern Bank, Dhaka Bank, City Bank, IFIC Bank, Pran-RFL Group, Walton (electronics), Akij Group, Square Group. AVOID Indian peer references (Flipkart, Paytm, Jio, Swiggy, Zomato) which signal wrong market; Bangladesh has its own adtech ecosystem and Bangladeshi operators read Indian references as a foreign-template mistake. " +
    "TONE: formal-warm. Bangladesh B2B is relationship-oriented; polite phrasing matters. Sign-offs: 'ধন্যবাদ' (dhonnobad) standard; 'Thanks and regards,' acceptable in English-heavy messages. Religious greetings: 'আসসালামু আলাইকুম' is appropriate when prospect's name is visibly Muslim-coded and context is more formal; default to neutral 'নমস্কার' or English 'Hello' otherwise. Avoid US slang.",

  "bn-IN":
    "Bengali-India (bn-IN): India Bengali, primarily West Bengal (Kolkata and diaspora). Heavier English code-mixing than bn-BD; in B2B chat, structural sentences regularly switch between Bengali and English mid-paragraph, which is natural register and not a fault. Use আপনি (formal) form for cold B2B outreach. " +
    "SCRIPT: Bengali script for greeting and structural words; Latin-script transliteration also normal in fast-typed chat. Adtech terms in English (Latin script). " +
    "ADTECH VOCABULARY: keep in English: retention, install, conversion, targeting, traffic, creatives, publisher, pre-bid, post-attribution, lookalike, in-app, cohort, geo-targeting, fraud filtering, CPI, CPA, ROAS, DSP, MMP, LTV, ARPU, D7, KPI, A/B test, SDK, attribution, churn, funnel, retargeting. Localize ONLY: ক্যাম্পেইন (campaign) when natural; গ্রাহক (customer) for non-technical references. " +
    "CITY/MARKET REFERENCES: Kolkata (NOT Calcutta; current official name), Howrah, Durgapur, Asansol, Siliguri, Darjeeling, Kharagpur, Bardhaman / Burdwan. Currency INR (₹), with lakh / crore for amounts under 100M; same Indian numbering convention as hi-IN ('2,00,000'). " +
    "PEER BRANDS: India-wide brands dominate (Flipkart, Myntra, Amazon India, Reliance JioMart, Tata Neu, Swiggy, Zomato, Ola, Paytm, PhonePe, HDFC Bank, ICICI Bank, SBI). Kolkata-regional brands where relevant: Spencer's Retail, Bandhan Bank (headquartered in Kolkata), UCO Bank (headquartered in Kolkata), Tata Steel (Jamshedpur, regional anchor), CESC (Kolkata electricity). AVOID Bangladesh peer references (bKash, Pathao, Daraz Bangladesh) which signal wrong market. " +
    "TONE: warm-formal. Indian Bengali B2B respects intellectual references and a slightly more literary register than other Indian markets; addressing Kolkata professionals with respect to their reading and writing tradition lands well. Avoid US slang. Sign-offs: 'ধন্যবাদ' or 'Thanks and regards,' both acceptable.",
};`;

const E1_MARKER = `// ── REGIONAL LOCALES (B-locale-tier3)`;

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
  ["guides-tier3-append", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  tier3HeaderAdded:           source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  hiINAdded:                  source.includes(`"hi-IN":\n    "Hindi-India (hi-IN):`),
  bnBDAdded:                  source.includes(`"bn-BD":\n    "Bengali-Bangladesh (bn-BD):`),
  bnINAdded:                  source.includes(`"bn-IN":\n    "Bengali-India (bn-IN):`),
  hiINHasOrthography:         source.includes(`SCRIPT: Devanagari script`),
  hiINHasAdtechVocab:         source.includes(`अभियान (campaign)`),
  hiINHasCityRefs:            source.includes(`Bengaluru (NOT Bangalore`),
  hiINHasPeerBrands:          source.includes(`Flipkart, Myntra, Meesho`),
  hiINHasTone:                source.includes(`Avoid US slang (ballpark`),
  bnBDHasScript:              source.includes(`Bengali script (Bangla script)`),
  bnBDHasAdtechVocab:         source.includes(`ক্যাম্পেইন (campaign)`),
  bnBDHasCityRefs:            source.includes(`Dhaka (capital)`),
  bnBDHasPeerBrands:          source.includes(`bKash (dominant mobile money)`),
  bnBDAvoidIndianPeers:       source.includes(`AVOID Indian peer references`),
  bnBDReligiousGreetingNote:  source.includes(`আসসালামু আলাইকুম`),
  bnINHasScript:              source.includes(`Bengali script for greeting`),
  bnINHasCityRefs:            source.includes(`Kolkata (NOT Calcutta`),
  bnINHasKolkataPeers:        source.includes(`Bandhan Bank (headquartered in Kolkata)`),
  bnINAvoidBangladeshPeers:   source.includes(`AVOID Bangladesh peer references`),
  tier1Untouched:             source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Untouched:             source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  bareHiUntouched:            source.includes(`Hindi (hi): English-heavy. Indian adtech`),
  bareBnUntouched:            source.includes(`Bengali (bn): Similar to Hindi`),
  deCHUntouched:              source.includes(`Swiss High German (de-CH;`),
  ptBRUntouched:              source.includes(`Brazilian Portuguese (pt-BR)`),
  buildNativenessUntouched:   source.includes(`export function buildNativenessBlock`),
};
console.log("[language-nativeness-tier3] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[language-nativeness-tier3] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[language-nativeness-tier3] DONE");
