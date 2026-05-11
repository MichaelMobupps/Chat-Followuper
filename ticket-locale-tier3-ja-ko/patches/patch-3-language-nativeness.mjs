#!/usr/bin/env node
/**
 * Ticket locale-tier3-ja-ko, patch 3/3: lib/languageNativeness.ts
 *
 * One atomic edit: append ja-JP and ko-KR entries to the existing
 * tier-3 GUIDES block, mirroring the tier1/tier2 depth structure
 * (SCRIPT / ADTECH VOCABULARY / CITY-MARKET / PEER BRANDS / TONE).
 *
 * Lookup logic untouched. The existing buildNativenessBlock falls
 * back from full tag (ja-JP) to primary subtag (ja) at line 627; so
 * adding ja-JP does NOT replace bare ja. Both coexist. Bare ja still
 * fires when language=ja with no country, or country!=JP.
 *
 * Content philosophy: the bare ja entry already covers HEAVY katakana
 * code-switching, mandatory term conversions, and FORBIDDEN script-
 * mixing rules. The ja-JP entry does NOT repeat those rules; it adds
 * what the bare entry could not have without becoming Japan-specific:
 * city/market references, JPY formatting, sonkeigo/kenjougo register
 * cues beyond "FORMAL", and Japanese enterprise peer-brand depth.
 *
 * Same pattern for ko-KR: bare ko covers code-switching; ko-KR adds
 * city/market references, KRW formatting, 합쇼체/해요체 register cues,
 * and chaebol vs tech-startup peer-brand tiering.
 *
 * Dependency: requires ticket-locale-tier3-hindi-bengali to have landed
 * (anchor expects bn-IN as the last entry in the tier-3 GUIDES block).
 *
 * Idempotent. Anchor em-dash-free. Box-drawing chars in NEW are safe.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/languageNativeness.ts",
);

// ═════════════════════════════════════════════════════════════════
// Edit 1 - Append ja-JP and ko-KR to tier-3 GUIDES block
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the last bn-IN entry's closing line. Unique to that entry
// (mentions Bangladesh peer references in an AVOID-style note).

const E1_OLD = `    "TONE: warm-formal. Indian Bengali B2B respects intellectual references and a slightly more literary register than other Indian markets; addressing Kolkata professionals with respect to their reading and writing tradition lands well. Avoid US slang. Sign-offs: 'ধন্যবাদ' or 'Thanks and regards,' both acceptable.",
};`;

const E1_NEW = `    "TONE: warm-formal. Indian Bengali B2B respects intellectual references and a slightly more literary register than other Indian markets; addressing Kolkata professionals with respect to their reading and writing tradition lands well. Avoid US slang. Sign-offs: 'ধন্যবাদ' or 'Thanks and regards,' both acceptable.",

  "ja-JP":
    "Japanese-Japan (ja-JP): Japan is the only major Japanese B2B adtech market. The base Japanese (ja) guide covers HEAVY katakana / Japanese localization with mandatory term conversions and the FORBIDDEN script-mixing rule; that all still applies. This regional entry adds Japan-specific city, currency, peer-brand, and register depth on top of the base ja guide. " +
    "REGISTER LAYERS: Japanese B2B uses three register layers. Default is teineigo (丁寧語, the です/ます forms): polite-neutral, the working register for cold B2B chat. Escalate to sonkeigo (尊敬語, exalting language) when referring to the prospect's company actions, executives, or decisions — e.g. 御社 (your company), ご検討いただく (your kind consideration). Use kenjougo (謙譲語, humbling language) when referring to MobUpps' actions toward the prospect — e.g. 弊社 (our humble company), 申し上げる (humbly say), ご提案させていただく (humbly propose). Mixing these incorrectly is a register fault that Japanese B2B readers notice immediately. Cold outreach should default teineigo throughout, with sonkeigo for the prospect's actions and kenjougo for MobUpps' actions in any sentence where both appear. NEVER use plain form (だ/である) in B2B cold contact. " +
    "ORTHOGRAPHY: Mixed kanji + hiragana + katakana is standard. Adtech loanwords in katakana per the base ja guide (リテンション, インストール, etc.). Numbers in half-width Arabic digits with commas for thousands: 1,000 / 10,000 / 1,000,000. Percentages use the half-width % symbol (12%), never the full-width ％ for B2B body. " +
    "CURRENCY: JPY (¥). No decimal points (the yen has no fractional unit in practice). Comma thousands: ¥1,234,567. For larger amounts the unit 万 (10,000) is standard in spoken / written business contexts: 100万円 (1 million yen), 1,000万円 (10 million yen), 1億円 (100 million yen). Both '¥1,000,000' and '100万円' are correct; Japanese B2B documents tend to use 万 / 億 for amounts above 1M for readability. Match the convention the prospect's company uses in its own materials when known. " +
    "CITY/MARKET REFERENCES: 東京 (Tokyo, prefer the kanji), 大阪 (Osaka), 名古屋 (Nagoya), 福岡 (Fukuoka), 横浜 (Yokohama), 札幌 (Sapporo), 神戸 (Kobe), 京都 (Kyoto), 仙台 (Sendai), 広島 (Hiroshima). For Tokyo region, sub-areas matter: 渋谷 (Shibuya, tech / startup), 六本木 (Roppongi, foreign / finance / enterprise tech), 大手町 (Otemachi, major Japanese enterprise HQ), 新宿 (Shinjuku, mixed enterprise), 品川 (Shinagawa, gateway). Latin transliterations (Tokyo, Osaka) are acceptable on WhatsApp / Telegram / Slack / Teams when the rest of the message reads naturally, but kanji is more professional. " +
    "PEER BRANDS by tier: " +
    "Enterprise / shosha (general trading) tier: 三井 (Mitsui), 三菱 (Mitsubishi UFJ / Mitsubishi Corporation), 住友 (Sumitomo), 伊藤忠 (Itochu), 丸紅 (Marubeni), 双日 (Sojitz). " +
    "Mega-cap consumer / tech: Sony, Nintendo, Panasonic, Sharp, Toyota, Honda, SoftBank, NTT DoCoMo, KDDI au, 楽天 (Rakuten), LINE Yahoo (post-2024 merger of LINE and Yahoo Japan), Mercari, ZOZO, Recruit. " +
    "Mobile gaming / digital: Bandai Namco, Sega, Square Enix, Capcom, Konami, GREE, DeNA, CyberAgent, mixi (operates Monster Strike), Colopl, Cygames. " +
    "Finance: 三菱UFJ銀行 (MUFG), 三井住友銀行 (SMBC), みずほ銀行 (Mizuho), りそな銀行 (Resona), 楽天銀行 (Rakuten Bank), 住信SBIネット銀行 (SBI Sumishin), Japan Post Bank (ゆうちょ). " +
    "Travel / hospitality: JTB, HIS, Rakuten Travel, 一休 (Ikyu), じゃらん (Jalan), 楽天トラベル. " +
    "Match peer references to prospect's tier: enterprise prospects expect shosha / mega-cap references; mobile gaming prospects expect the gaming-tier list; SaaS prospects expect tech-tier and finance-tech references. " +
    "TONE: most formal of the major B2B markets. Japanese B2B chat values: clarity, brevity, precise commitments (avoid wishy-washy modifiers), and acknowledgment of the prospect's perspective before asserting a claim. Avoid hype words and avoid superlatives ('best', 'leading', 'top-tier' all read as foreign-template). 'お忙しいところ恐れ入りますが' is appropriate as a one-time softener in a cold message; do not overuse softeners. Sign-offs: 'よろしくお願いいたします' (standard) or 'ご検討のほど何卒よろしくお願い申し上げます' (formal). Match seasonal greetings only in email contexts, not in chat.",

  "ko-KR":
    "Korean-South Korea (ko-KR): South Korea is the only major Korean B2B adtech market. The base Korean (ko) guide covers moderate adaptation with established adtech terms (리텐션, 설치, 전환, 트래픽, 크리에이티브, 타겟팅, 오디언스) and retained English compound terms (lookalike modeling, A/B test); that all still applies. This regional entry adds South Korea-specific city, currency, peer-brand, and register depth on top of the base ko guide. " +
    "REGISTER LAYERS: Korean B2B uses two main formal registers. Default for cold B2B is 합쇼체 (the -ㅂ니다/-습니다 forms): formal, the standard register for first contact, presentations, and any context where rank-deference matters. Escalate from 합쇼체 to honorific forms (높임말) when referring to the prospect's company actions: 귀사 (your company), 검토해 주시기 바랍니다 (we kindly ask that you review). Use 해요체 (the -아요/-어요 forms) only after the relationship has warmed up; never in cold outreach. NEVER use 해체 (-아/-어 plain forms) or 해라체 (-다 plain forms) in B2B — those are casual / declarative registers used only with close colleagues or subordinates. Korean B2B readers register-tag the message in the first sentence; opening in 해요체 cold is a signal of unfamiliarity with Korean B2B norms. " +
    "ORTHOGRAPHY: Hangul throughout for structural text. English loanwords (CPI, ROAS, A/B test) stay in Latin script; Korean adtech terms in Hangul per the base ko guide. Numbers in half-width Arabic digits with commas: 1,000 / 10,000. Percentages use % (12%), no Korean equivalent symbol needed. " +
    "CURRENCY: KRW (원). The won has no fractional unit in practice; no decimals. For larger amounts the units 만 (10,000) and 억 (100,000,000) are essential: '1,000원' for small, '5만원' for 50K, '500만원' for 5M, '5천만원' for 50M, '1억원' for 100M, '10억원' for 1B. Korean B2B documents almost always use 만 / 억 above 1M for readability; writing '50,000,000원' instead of '5천만원' reads as foreign-template. The Korean unit 천 (1,000) is used in spoken context but rare in formal written B2B (use Arabic '5,000' instead of '오천'). " +
    "CITY/MARKET REFERENCES: 서울 (Seoul, often subdivided by district for B2B context), 부산 (Busan), 인천 (Incheon, port + tech), 대구 (Daegu), 광주 (Gwangju), 대전 (Daejeon, R&D / Daedeok), 수원 (Suwon, Samsung HQ region), 성남 (Seongnam, includes 판교 (Pangyo) tech cluster — the Korean Silicon Valley equivalent), 용인 (Yongin), 고양 (Goyang). Seoul districts that matter for B2B: 강남 (Gangnam, finance / enterprise / luxury retail), 여의도 (Yeouido, finance / broadcasting / National Assembly), 마포 (Mapo, media / startups), 종로 (Jongno, traditional enterprise / government). Latin transliterations (Seoul, Pangyo, Gangnam) are acceptable on chat channels. " +
    "PEER BRANDS by tier: " +
    "Chaebol / mega-enterprise tier: Samsung (삼성), Hyundai (현대 — Hyundai Motor / Hyundai Department Store / Hyundai E&C are different group companies), LG (엘지), SK (에스케이), Lotte (롯데), Hanwha (한화), POSCO (포스코), KT (케이티), Doosan (두산), CJ (씨제이 — CJ ENM / CJ CheilJedang for FMCG and entertainment), Hyosung (효성), Kumho (금호), Shinsegae (신세계). " +
    "Korean tech / digital-native tier: Coupang (쿠팡, e-commerce + fintech + delivery), Kakao (카카오 — KakaoTalk for messaging, KakaoPay for payments, KakaoBank for banking, KakaoMobility for ride / nav, KakaoGames for gaming), Naver (네이버 — search + Webtoon + Naver Pay + Line as subsidiary), Toss (토스, fintech super-app), Karrot Market (당근마켓, hyperlocal commerce), Yanolja (야놀자, travel super-app), Baemin / Woowa Brothers (배달의민족, food delivery), Market Kurly (마켓컬리, premium e-commerce), Musinsa (무신사, fashion). " +
    "Gaming tier: Krafton (크래프톤, PUBG), NCSoft (엔씨소프트, Lineage), Netmarble (넷마블), Nexon (넥슨), Smilegate (스마일게이트, Crossfire / Lost Ark), Pearl Abyss (펄어비스, Black Desert), Com2uS (컴투스). " +
    "Finance: 신한 (Shinhan), KB 국민 (KB Kookmin), 우리 (Woori), 하나 (Hana), 농협 (NongHyup), IBK 기업, KEB 외환. Insurance: 삼성생명, 한화생명, 교보생명. " +
    "Match peer references to prospect's tier: chaebol references for enterprise / industrial / finance prospects; tech-tier references for SaaS / mobile gaming / fintech / e-commerce prospects. Mixing tiers incorrectly (referencing Samsung when pitching a fintech startup) reads as foreign-template. " +
    "TONE: formal, structured, hierarchy-aware. Korean B2B values: explicit acknowledgment of the prospect's company / role before any pitch content, clear logical structure (first / second / third), and concrete numbers over qualitative claims. Avoid hype words (최고, 최상, 1위 without source — these read as advertising rather than B2B). 'Bali / quickly / soon (빨리, 신속히, 조속히)' suggests urgency; use only when contextually justified. Sign-offs: '감사합니다' (standard) or '잘 부탁드립니다' (more formal, kindly-asking register). 'OO 님께' as a written-address form is for letters, not chat.",
};`;

const E1_MARKER = `"ja-JP":
    "Japanese-Japan (ja-JP):`;

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

// Pre-flight: tier-3 bn-IN must be present
if (!source.includes(`"bn-IN":\n    "Bengali-India (bn-IN):`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-hindi-bengali to have landed first");
  console.error("[FATAL] missing expected tier-3 bn-IN entry in GUIDES");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["guides-tier3-ja-ko-append", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  jaJPAdded:                source.includes(`"ja-JP":\n    "Japanese-Japan (ja-JP):`),
  koKRAdded:                source.includes(`"ko-KR":\n    "Korean-South Korea (ko-KR):`),
  jaJPHasRegisterLayers:    source.includes(`teineigo (丁寧語`) &&
                            source.includes(`sonkeigo (尊敬語`) &&
                            source.includes(`kenjougo (謙譲語`),
  jaJPHasJPYFormat:         source.includes(`CURRENCY: JPY (¥)`) && source.includes(`100万円`),
  jaJPHasTokyoSubareas:     source.includes(`渋谷 (Shibuya`) && source.includes(`大手町 (Otemachi`),
  jaJPHasShoshaTier:        source.includes(`shosha (general trading) tier`) &&
                            source.includes(`三菱 (Mitsubishi UFJ`),
  jaJPHasMobileGamingTier:  source.includes(`Bandai Namco, Sega, Square Enix`),
  jaJPHasSignoffs:          source.includes(`よろしくお願いいたします`),
  koKRHasHapsoche:          source.includes(`합쇼체 (the -ㅂ니다/-습니다 forms)`),
  koKRHasHaeyoche:          source.includes(`해요체`),
  koKRHasKRWFormat:         source.includes(`CURRENCY: KRW (원)`) && source.includes(`1억원`),
  koKRHasSeoulDistricts:    source.includes(`판교 (Pangyo)`) && source.includes(`강남 (Gangnam`),
  koKRHasChaebolTier:       source.includes(`Chaebol / mega-enterprise tier: Samsung (삼성)`),
  koKRHasTechTier:          source.includes(`Coupang (쿠팡`) && source.includes(`Kakao (카카오`),
  koKRHasGamingTier:        source.includes(`Krafton (크래프톤, PUBG)`),
  koKRHasFinanceTier:       source.includes(`신한 (Shinhan), KB 국민`),
  koKRHasSignoffs:          source.includes(`감사합니다`),

  // Untouched checks
  bnINUntouched:            source.includes(`"bn-IN":\n    "Bengali-India (bn-IN):`),
  hiINUntouched:            source.includes(`"hi-IN":\n    "Hindi-India (hi-IN):`),
  bnBDUntouched:            source.includes(`"bn-BD":\n    "Bengali-Bangladesh (bn-BD):`),
  bareJaUntouched:          source.includes(`Japanese (ja): HEAVY katakana/Japanese localization`),
  bareKoUntouched:          source.includes(`Korean (ko): Moderate adaptation`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  ptBRUntouched:            source.includes(`Brazilian Portuguese (pt-BR)`),
  deCHUntouched:            source.includes(`Swiss High German (de-CH;`),
  buildNativenessUntouched: source.includes(`export function buildNativenessBlock`),
};
console.log("[language-nativeness-ja-ko] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[language-nativeness-ja-ko] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[language-nativeness-ja-ko] DONE");
