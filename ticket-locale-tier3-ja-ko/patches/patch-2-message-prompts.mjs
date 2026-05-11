#!/usr/bin/env node
/**
 * Ticket locale-tier3-ja-ko, patch 2/3: services/messagePrompts.ts
 *
 * One atomic edit: append ja-JP and ko-KR entries to GREETING_TABLE,
 * after the existing tier-3 hi-IN/bn-BD/bn-IN block.
 *
 * Notes on greeting forms:
 *   ja-JP: Inherits the bare-ja form ("{NAME}様、" / "ご担当者様、")
 *          which is already correct for Japan B2B. The regional entry
 *          adds: JPY currency formatting (no decimals, comma thousands),
 *          Tokyo / Osaka / Nagoya city references, sonkeigo / kenjougo /
 *          teineigo register cues beyond the bare "FORMAL" tag, and
 *          enterprise peer-brand context (Rakuten, LINE, Mercari, SoftBank,
 *          NTT, KDDI, DoCoMo, Mitsui, Mitsubishi UFJ, Sony, Nintendo).
 *
 *   ko-KR: Inherits the bare-ko form ("{NAME} 님," / "담당자님,") which is
 *          correct for South Korea B2B. The regional entry adds: KRW
 *          currency formatting (1,000원, 만원 amounts), Seoul / Busan /
 *          Daegu / Incheon city references, chaebol-tier (Samsung, Hyundai,
 *          LG, SK, Lotte) vs Korean tech-startup tier (Coupang, Kakao,
 *          Naver, Toss, Karrot) peer-brand distinction, and 합쇼체 vs
 *          해요체 register cues.
 *
 * Dependency: requires ticket-locale-tier3-hindi-bengali to have landed
 * (Edit anchor expects bn-IN to be the last entry of the tier-3 block).
 *
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

const E1_OLD = `  "bn-IN": { withName: "নমস্কার {NAME},", withoutName: "নমস্কার,", note: "India Bengali (primarily West Bengal). Heavier English code-mixing than bn-BD; structural sentences regularly switch between Bengali and English in B2B contexts. INR currency with lakh / crore. Peer brands: India-wide (Flipkart, Paytm, Jio, Swiggy, Zomato) plus Kolkata-regional where relevant (Bandhan Bank, Spencer's). Avoid Bangladesh peer references. Use আপনি (formal) form." },
};`;

const E1_NEW = `  "bn-IN": { withName: "নমস্কার {NAME},", withoutName: "নমস্কার,", note: "India Bengali (primarily West Bengal). Heavier English code-mixing than bn-BD; structural sentences regularly switch between Bengali and English in B2B contexts. INR currency with lakh / crore. Peer brands: India-wide (Flipkart, Paytm, Jio, Swiggy, Zomato) plus Kolkata-regional where relevant (Bandhan Bank, Spencer's). Avoid Bangladesh peer references. Use আপনি (formal) form." },
  "ja-JP": { withName: "{NAME}様、", withoutName: "ご担当者様、", note: "Japan. FORMAL even on WhatsApp. Japanese B2B does not soften greetings. Do NOT use こんにちは or ハロー for cold outreach. Default register is teineigo (です/ます forms); escalate to sonkeigo (尊敬語) when referring to the prospect's company actions and kenjougo (謙譲語) when referring to MobUpps' actions. Currency JPY (¥, no decimals, comma thousands: ¥1,234,567). Cities: 東京 (Tokyo), 大阪 (Osaka), 名古屋 (Nagoya), 福岡 (Fukuoka), 横浜 (Yokohama), 札幌 (Sapporo). Peer brands: Rakuten, LINE Yahoo (post-merger), Mercari, ZOZO, SoftBank, NTT DoCoMo, KDDI au, Sony, Nintendo, Sega, Bandai Namco, JTB, Recruit, CyberAgent, GREE, DeNA. Mitsui / Mitsubishi UFJ / Mizuho for finance. Enterprise tier prefers the trading-house and chaebol-equivalent context." },
  "ko-KR": { withName: "{NAME} 님,", withoutName: "담당자님,", note: "South Korea. FORMAL. Do NOT use 안녕 alone for cold outreach. Default register is 합쇼체 (formal -ㅂ니다 forms) for cold B2B; 해요체 (semi-formal -아요/어요) acceptable once warm. Currency KRW (원), with 만 (10K) and 억 (100M) for larger amounts; '1,000원' for small, '5천만원' or '50,000,000원' for mid, '1억원' for 100M. Cities: 서울 (Seoul), 부산 (Busan), 인천 (Incheon), 대구 (Daegu), 광주 (Gwangju), 대전 (Daejeon), 수원 (Suwon), 성남 (Seongnam, includes Pangyo tech cluster). Peer brands - chaebol tier: Samsung, Hyundai, LG, SK, Lotte, Hanwha, Posco, KT, Shinhan Bank, KB Kookmin, Woori Bank. Korean tech-startup tier: Coupang, Kakao (KakaoTalk / KakaoPay / KakaoBank), Naver, Toss, Karrot Market (당근마켓), Yanolja, Baemin / Woowa Brothers, Market Kurly, Musinsa, Krafton, NCSoft, Netmarble, Nexon, Smilegate. Match peer reference to prospect's company size: chaebol references for enterprise, tech-startup references for SaaS / mobile gaming / fintech." },
};`;

const E1_MARKER = `"ja-JP": { withName: "{NAME}様、"`;

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

// Pre-flight: tier-3 bn-IN must be present (depends on prior ticket)
if (!source.includes(`"bn-IN": { withName: "নমস্কার {NAME},"`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-hindi-bengali to have landed first");
  console.error("[FATAL] missing expected tier-3 bn-IN entry in GREETING_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["greeting-ja-ko-add", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  jaJPAdded:              source.includes(`"ja-JP": { withName: "{NAME}様、"`),
  koKRAdded:              source.includes(`"ko-KR": { withName: "{NAME} 님,"`),
  jaJPHasTeineigo:        source.includes(`teineigo (です/ます forms)`),
  jaJPHasSonkeigo:        source.includes(`sonkeigo (尊敬語)`),
  jaJPHasKenjougo:        source.includes(`kenjougo (謙譲語)`),
  jaJPHasJPY:             source.includes(`Currency JPY (¥, no decimals`),
  jaJPHasTokyo:           source.includes(`東京 (Tokyo)`),
  jaJPHasRakuten:         source.includes(`Rakuten, LINE Yahoo`),
  koKRHasHapsoche:        source.includes(`합쇼체`),
  koKRHasHaeyoche:        source.includes(`해요체`),
  koKRHasKRW:             source.includes(`Currency KRW (원)`),
  koKRHasSeoul:           source.includes(`서울 (Seoul)`),
  koKRHasChaebol:         source.includes(`Peer brands - chaebol tier: Samsung, Hyundai, LG`),
  koKRHasStartupTier:     source.includes(`Korean tech-startup tier: Coupang, Kakao`),
  bareJaUntouched:        source.includes(`ja: { withName: "{NAME}様、", withoutName: "ご担当者様、",`),
  bareKoUntouched:        source.includes(`ko: { withName: "{NAME} 님,", withoutName: "담당자님,",`),
  bnINUntouched:          source.includes(`"bn-IN": { withName: "নমস্কার {NAME},"`),
  hiINUntouched:          source.includes(`"hi-IN": { withName: "Namaste {NAME},"`),
  tier3HeaderIntact:      source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:            source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:            source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  ptBRUntouched:          source.includes(`"pt-BR": { withName: "Olá {NAME},"`),
  deCHUntouched:          source.includes(`"de-CH": { withName: "Guten Tag {NAME},"`),
};
console.log("[message-prompts-ja-ko] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[message-prompts-ja-ko] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[message-prompts-ja-ko] DONE");
