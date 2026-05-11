#!/usr/bin/env node
/**
 * Ticket locale-tier3-he-tr, patch 2/3: services/messagePrompts.ts
 *
 * One atomic edit: append he-IL and tr-TR entries to GREETING_TABLE,
 * after the existing ko-KR entry.
 *
 * Notes on greeting forms:
 *   he-IL: Inherits the bare-he form ("שלום {NAME},"). The regional entry
 *          adds: NIS (₪) currency formatting, Tel Aviv tech cluster vs
 *          Jerusalem / Haifa traditional sector context, heavy English
 *          code-mixing in tech B2B and more Hebrew register in traditional
 *          sectors, peer brands (Wix, Monday, Lemonade vs Bank Hapoalim,
 *          Bezeq, Cellcom).
 *
 *   tr-TR: Inherits the bare-tr form ("Merhaba {NAME},"). The regional
 *          entry adds: Turkish lira (₺) formatting, Istanbul tech vs
 *          Anatolian-conservative cultural split, Siz (formal) vs Sen
 *          (informal) register cue, peer brands (Trendyol, Hepsiburada,
 *          Getir, Yemeksepeti, Garanti BBVA, İş Bankası).
 *
 * Dependency: requires ticket-locale-tier3-ja-ko to have landed (anchor
 * expects ko-KR as the last entry of the tier-3 GREETING_TABLE block).
 *
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

const E1_OLD = `  "ko-KR": { withName: "{NAME} 님,", withoutName: "담당자님,", note: "South Korea. FORMAL. Do NOT use 안녕 alone for cold outreach. Default register is 합쇼체 (formal -ㅂ니다 forms) for cold B2B; 해요체 (semi-formal -아요/어요) acceptable once warm. Currency KRW (원), with 만 (10K) and 억 (100M) for larger amounts; '1,000원' for small, '5천만원' or '50,000,000원' for mid, '1억원' for 100M. Cities: 서울 (Seoul), 부산 (Busan), 인천 (Incheon), 대구 (Daegu), 광주 (Gwangju), 대전 (Daejeon), 수원 (Suwon), 성남 (Seongnam, includes Pangyo tech cluster). Peer brands - chaebol tier: Samsung, Hyundai, LG, SK, Lotte, Hanwha, Posco, KT, Shinhan Bank, KB Kookmin, Woori Bank. Korean tech-startup tier: Coupang, Kakao (KakaoTalk / KakaoPay / KakaoBank), Naver, Toss, Karrot Market (당근마켓), Yanolja, Baemin / Woowa Brothers, Market Kurly, Musinsa, Krafton, NCSoft, Netmarble, Nexon, Smilegate. Match peer reference to prospect's company size: chaebol references for enterprise, tech-startup references for SaaS / mobile gaming / fintech." },
};`;

const E1_NEW = `  "ko-KR": { withName: "{NAME} 님,", withoutName: "담당자님,", note: "South Korea. FORMAL. Do NOT use 안녕 alone for cold outreach. Default register is 합쇼체 (formal -ㅂ니다 forms) for cold B2B; 해요체 (semi-formal -아요/어요) acceptable once warm. Currency KRW (원), with 만 (10K) and 억 (100M) for larger amounts; '1,000원' for small, '5천만원' or '50,000,000원' for mid, '1억원' for 100M. Cities: 서울 (Seoul), 부산 (Busan), 인천 (Incheon), 대구 (Daegu), 광주 (Gwangju), 대전 (Daejeon), 수원 (Suwon), 성남 (Seongnam, includes Pangyo tech cluster). Peer brands - chaebol tier: Samsung, Hyundai, LG, SK, Lotte, Hanwha, Posco, KT, Shinhan Bank, KB Kookmin, Woori Bank. Korean tech-startup tier: Coupang, Kakao (KakaoTalk / KakaoPay / KakaoBank), Naver, Toss, Karrot Market (당근마켓), Yanolja, Baemin / Woowa Brothers, Market Kurly, Musinsa, Krafton, NCSoft, Netmarble, Nexon, Smilegate. Match peer reference to prospect's company size: chaebol references for enterprise, tech-startup references for SaaS / mobile gaming / fintech." },
  "he-IL": { withName: "שלום {NAME},", withoutName: "שלום,", note: "Israel. Hebrew B2B mixes Hebrew structural grammar with English adtech terminology; English code-mixing is heaviest in Tel Aviv tech and lightest in traditional sectors (banking, insurance, telco). Default register is informal-but-respectful: שלום (Shalom) opens the message; do NOT use לכבוד (Lichvod) which reads as official-letter register, too stiff for chat. Currency NIS / ILS (₪), no decimals for B2B amounts: ₪1,234,567 or '1.2 מיליון ₪' for 1M+. Cities: תל אביב (Tel Aviv, tech cluster), הרצליה (Herzliya, fintech and enterprise), רעננה (Raanana, tech HQs), פתח תקווה (Petah Tikva, multinational HQs), ירושלים (Jerusalem, government / academic / Mobileye), חיפה (Haifa, traditional industry / Technion / Intel), באר שבע (Beer Sheva, defense / cyber / Ben-Gurion University). Peer brands - tech tier: Wix, Monday.com, Lemonade, Riskified, JFrog, ironSource (now Unity), Playtika, Fiverr, Lightricks, Outbrain, Taboola, Gett, Via, Mobileye, Check Point, CyberArk, SolarEdge. Traditional sector: Bank Hapoalim, Bank Leumi, Bank Discount, Mizrahi Tefahot, Israel Discount Bank, Bezeq, Cellcom, Partner, Pelephone, Strauss Group, Tnuva, Osem, Super-Sol, Shufersal, Rami Levy. Match peer tier to prospect's company; mixing reads as foreign-template." },
  "tr-TR": { withName: "Merhaba {NAME},", withoutName: "Merhaba,", note: "Turkey. Turkish B2B uses formal Siz register for cold outreach; never Sen for first contact. 'Merhaba {NAME},' is standard chat opening; 'Sayın {NAME},' for more formal email-equivalent register. Currency TRY (₺), with 'bin' (thousand) and 'milyon' (million) for larger amounts in informal contexts; full numerals '₺1.234.567' for formal B2B (note European-style period thousands separator and comma decimal). Cities: İstanbul (the commercial center, often subdivided into Avrupa Yakası and Asya Yakası; Maslak, Levent, and Etiler for finance / enterprise tech; Beşiktaş and Şişli for media), Ankara (capital, government, defense, Turkish Aerospace), İzmir (export hub, manufacturing), Bursa (automotive), Antalya (tourism), Gaziantep (regional B2B). Peer brands - tech / digital-native tier: Trendyol (Alibaba-backed e-commerce), Hepsiburada, Getir (quick commerce), Yemeksepeti (food delivery, Delivery Hero), Migros Sanal (online grocery), Türkiye İş Bankası's BiP, Papara (fintech), İninal (prepaid). Traditional / chaebol-equivalent tier: Türkiye İş Bankası, Garanti BBVA, Akbank, Yapı Kredi, Ziraat Bankası (state), Türk Telekom, Turkcell, Vodafone Turkey, Türk Hava Yolları (Turkish Airlines, THY), Pegasus, Migros Ticaret, BİM, A101, ŞOK (discount retail), Koç Holding, Sabancı Holding, Doğuş Holding. Match peer tier to prospect's size: holding-group references for enterprise, tech-tier references for SaaS / e-commerce / fintech / mobile gaming." },
};`;

const E1_MARKER = `"he-IL": { withName: "שלום {NAME},"`;

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

// Pre-flight: tier-3 ko-KR must be present
if (!source.includes(`"ko-KR": { withName: "{NAME} 님,"`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-ja-ko to have landed first");
  console.error("[FATAL] missing expected tier-3 ko-KR entry in GREETING_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["greeting-he-tr-add", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  heILAdded:              source.includes(`"he-IL": { withName: "שלום {NAME},"`),
  trTRAdded:              source.includes(`"tr-TR": { withName: "Merhaba {NAME},"`),
  heILHasShalom:          source.includes(`שלום (Shalom)`),
  heILHasILS:             source.includes(`Currency NIS / ILS (₪)`),
  heILHasTelAviv:         source.includes(`תל אביב (Tel Aviv`),
  heILHasTechTier:        source.includes(`Wix, Monday.com, Lemonade`),
  heILHasTraditionalTier: source.includes(`Bank Hapoalim, Bank Leumi`),
  heILRejectsLichvod:     source.includes(`do NOT use לכבוד (Lichvod)`),
  trTRHasSizRegister:     source.includes(`formal Siz register`) && source.includes(`never Sen for first contact`),
  trTRHasTRY:             source.includes(`Currency TRY (₺)`),
  trTRHasIstanbul:        source.includes(`İstanbul (the commercial center`),
  trTRHasIstanbulSplit:   source.includes(`Avrupa Yakası and Asya Yakası`),
  trTRHasTechTier:        source.includes(`Trendyol (Alibaba-backed`) && source.includes(`Getir (quick commerce)`),
  trTRHasHoldingTier:     source.includes(`Koç Holding, Sabancı Holding`),
  bareHeUntouched:        source.includes(`he: { withName: "שלום {NAME},", withoutName: "שלום,", note: "" },`),
  bareTrUntouched:        source.includes(`tr: { withName: "Merhaba {NAME},", withoutName: "Merhaba,", note: "" },`),
  koKRUntouched:          source.includes(`"ko-KR": { withName: "{NAME} 님,"`),
  jaJPUntouched:          source.includes(`"ja-JP": { withName: "{NAME}様、"`),
  hiINUntouched:          source.includes(`"hi-IN": { withName: "Namaste {NAME},"`),
  bnBDUntouched:          source.includes(`"bn-BD": { withName: "নমস্কার {NAME},"`),
  tier3HeaderIntact:      source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:            source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:            source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  ptBRUntouched:          source.includes(`"pt-BR": { withName: "Olá {NAME},"`),
  deCHUntouched:          source.includes(`"de-CH": { withName: "Guten Tag {NAME},"`),
};
console.log("[message-prompts-he-tr] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[message-prompts-he-tr] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[message-prompts-he-tr] DONE");
