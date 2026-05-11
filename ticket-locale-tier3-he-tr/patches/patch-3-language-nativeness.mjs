#!/usr/bin/env node
/**
 * Ticket locale-tier3-he-tr, patch 3/3: lib/languageNativeness.ts
 *
 * One atomic edit: append he-IL and tr-TR entries to the tier-3 GUIDES
 * block, mirroring the tier1/tier2/JP-KR depth structure.
 *
 * Bare-entry coexistence: the base he and tr GUIDES are byte-identical
 * to the Email Prospector guides and remain untouched. The regional
 * entries add Israel-specific / Turkey-specific city, currency, peer-
 * brand, and register depth that the bare entries could not have
 * without becoming region-bound.
 *
 * Dependency: requires ticket-locale-tier3-ja-ko to have landed (anchor
 * expects ko-KR as the last entry in the tier-3 GUIDES block).
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
// Edit 1 - Append he-IL and tr-TR to tier-3 GUIDES block
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the last ko-KR entry's closing line, which mentions the
// unique phrase "OO 님께" + the chat-vs-letter distinction. Unique
// in the file, em-dash-free.

const E1_OLD = `    "TONE: formal, structured, hierarchy-aware. Korean B2B values: explicit acknowledgment of the prospect's company / role before any pitch content, clear logical structure (first / second / third), and concrete numbers over qualitative claims. Avoid hype words (최고, 최상, 1위 without source — these read as advertising rather than B2B). 'Bali / quickly / soon (빨리, 신속히, 조속히)' suggests urgency; use only when contextually justified. Sign-offs: '감사합니다' (standard) or '잘 부탁드립니다' (more formal, kindly-asking register). 'OO 님께' as a written-address form is for letters, not chat.",
};`;

const E1_NEW = `    "TONE: formal, structured, hierarchy-aware. Korean B2B values: explicit acknowledgment of the prospect's company / role before any pitch content, clear logical structure (first / second / third), and concrete numbers over qualitative claims. Avoid hype words (최고, 최상, 1위 without source — these read as advertising rather than B2B). 'Bali / quickly / soon (빨리, 신속히, 조속히)' suggests urgency; use only when contextually justified. Sign-offs: '감사합니다' (standard) or '잘 부탁드립니다' (more formal, kindly-asking register). 'OO 님께' as a written-address form is for letters, not chat.",

  "he-IL":
    "Hebrew-Israel (he-IL): Israel is the only major Hebrew B2B adtech market. The base Hebrew (he) guide covers moderate adaptation with established Hebrew adtech terms (שימור, התקנה, המרה) and many transliterated English terms (טירגוט, טראפיק, קריאייטיבים, פאבלישר, פרה-ביד); that all still applies. This regional entry adds Israel-specific city, currency, peer-brand, and tech-vs-traditional register depth on top of the base he guide. " +
    "SECTOR SPLIT (CRITICAL): Israeli B2B has two distinct sectors with different register and code-mixing norms. Tech sector (Tel Aviv / Herzliya / Raanana startups and scaleups) is heavily English-code-mixed; messages often contain entire English sentences embedded in Hebrew structure, and product / metric names stay in English without transliteration. Traditional sector (banking, insurance, telco, retail, defense / government) uses more Hebrew, transliterates English terms into Hebrew script (טירגוט, ניהול קמפיינים), and prefers a more formal register. Identify the prospect's sector from their company and adjust register accordingly. " +
    "SCRIPT: Hebrew script (RTL) for all structural text. English acronyms (CPI, CPA, ROAS, DSP, LTV, MMP, KPI) stay in Latin script and are embedded inline; Hebrew sentence flow accommodates them naturally. For tech-sector prospects, product names, company names, and many compound adtech terms remain in English (e.g., 'lookalike modeling', 'A/B test', 'attribution window'). For traditional-sector prospects, transliterate more aggressively (לוקאלייק במקום lookalike, אטריביושן במקום attribution). " +
    "ORTHOGRAPHY: Standard Hebrew script. Use modern academic orthography (כתיב מלא): include ו and י as vowel markers (אינטליגנציה not אנטליגנציה). Numbers in half-width Arabic digits left-to-right within RTL flow: 12% / ₪1,500 / 24 שעות. Percentages use % symbol. Mixed Hebrew-English sentences are natural for tech-sector and should not be flagged. " +
    "REGISTER LAYERS: Cold B2B default is informal-but-respectful: שלום to open, second-person addressing with the prospect's first name (Hebrew has no T/V distinction like Sie/du or vous/tu; everyone uses אתה / את). Do NOT use לכבוד (Lichvod) for chat — it is the official-letter opening, reads as stiff and over-formal. אדוני / גברתי (Adoni / Gveret) are also too formal for B2B chat in Israeli norms. Modern Israeli B2B is direct; getting to the point quickly is respected. " +
    "CURRENCY: NIS / ILS (₪, also Shekel / שקל). No decimals for B2B amounts: ₪1,234,567. For amounts above 1M, '1.2 מיליון ₪' or 'מיליון ₪' (million NIS) is standard. For amounts above 1B, 'מיליארד ₪' (billion NIS). USD is also referenced often in Israeli tech contexts (especially for export revenue, fundraising); '$5M ARR' is natural Israeli-tech vocabulary, not a foreign-template error. " +
    "CITY/MARKET REFERENCES: " +
    "Tel Aviv (תל אביב, the commercial center; Rothschild Boulevard for startups, Sarona Tower for enterprise tech, Levinstein Tower for finance) — the heart of Israeli tech. " +
    "Herzliya (הרצליה, Pituach area; major fintech and enterprise tech HQs: Microsoft IL, Apple IL, Amazon IL, Google IL, eBay IL, PayPal IL). " +
    "Raanana (רעננה, mid-size tech HQs and engineering centers). " +
    "Petah Tikva (פתח תקווה, traditional manufacturing turned multinational tech and pharma — Teva, Intel, IBM Israel HQ). " +
    "Jerusalem (ירושלים, government, academic, defense — Mobileye originated there). " +
    "Haifa (חיפה, traditional industry, Intel's first non-US fab, Technion University, Matam tech park). " +
    "Beer Sheva (באר שבע, defense / cyber cluster — Cyber Spark, IDF C4I, Ben-Gurion University). " +
    "Caesarea / Yokneam (קיסריה / יוקנעם, smaller tech parks for hardware / semiconductor companies). " +
    "PEER BRANDS by sector: " +
    "Tech tier (Israeli tech / startup / scaleup): Wix, Monday.com, Lemonade, Riskified, JFrog, ironSource (now part of Unity), Playtika, Fiverr, Lightricks (Facetune), Outbrain, Taboola, AppsFlyer, Vungle (now Liftoff), Gett, Via, SimilarWeb, Sisense, WalkMe, BigPanda. " +
    "Cyber-security tier: Check Point, CyberArk, Imperva, Varonis, Wiz, Snyk, Cybereason, Armis, Claroty, SentinelOne (founded in Israel). " +
    "Mobility / autonomous: Mobileye (Intel), Innoviz, Otonomo, Argus Cyber Security (Continental). " +
    "Energy / cleantech: SolarEdge, Tigo, ZOOZ Power. " +
    "Traditional / sector tier (for non-tech B2B prospects): Bank Hapoalim (בנק הפועלים), Bank Leumi (בנק לאומי), Bank Discount (בנק דיסקונט), Mizrahi Tefahot (מזרחי טפחות), First International (הבנק הבינלאומי), Bank Yahav. Insurance: Migdal, Clal, Phoenix, Harel, Menorah Mivtachim. Telco: Bezeq (בזק), Cellcom (סלקום), Partner Communications (פרטנר, formerly Orange), Pelephone (פלאפון), Hot (הוט). Retail / FMCG: Strauss Group, Tnuva, Osem (Nestle), Super-Sol (שופרסל / Shufersal), Rami Levy (רמי לוי), Tiv Taam, Hetzi Hinam. " +
    "Match peer references to prospect's sector: tech-tier references for SaaS / mobile / fintech prospects; traditional / sector-tier references for banking / insurance / telco / retail prospects. Mixing tiers (referencing Wix when pitching Bank Hapoalim) reads as foreign-template. " +
    "TONE: direct, informal, get-to-the-point. Israeli B2B values: efficiency over politeness rituals, technical accuracy, willingness to challenge assumptions in a debate, and concrete numbers over qualitative claims. Avoid over-formal Hebrew (לכבוד, אדוני, התרשמתי לטובה) which reads as foreign or AI-generated. Avoid hype words (מהפכני, פורץ דרך, מהשורה הראשונה without source) which read as marketing rather than B2B. Sign-offs: 'תודה' (Toda — standard, casual-professional), 'בברכה' (Be'vracha — more formal, traditional sector). 'תודה רבה' is over-effusive for B2B sign-off. The Israeli B2B norm is brevity; long polite preambles read as time-wasting.",

  "tr-TR":
    "Turkish-Turkey (tr-TR): Turkey is the primary Turkish B2B adtech market. The base Turkish (tr) guide covers moderate adaptation with localized adtech terms (hedefleme, dönüşüm, kreatifler); that all still applies. This regional entry adds Turkey-specific city, currency, peer-brand, and Istanbul-tech-vs-Anatolian-conservative cultural depth on top of the base tr guide. " +
    "REGIONAL CULTURAL SPLIT: Turkish B2B has a meaningful Istanbul-tech vs Anatolian-conservative split. Istanbul (especially Levent / Maslak / Etiler finance districts, and Cihangir / Beyoğlu media / startup districts) is internationalized, English-tolerant, faster-paced, and uses more English code-mixing. Ankara is government / defense, more formal, less English-tolerant. Bursa / Konya / Gaziantep / Kayseri (Anatolian manufacturing centers) are more conservative, prefer fully-Turkish content, and value relationship-building before business. Identify the prospect's city / company HQ and adjust register accordingly. " +
    "REGISTER LAYERS: Turkish has formal Siz vs informal Sen distinction (analogous to Spanish usted/tu or French vous/tu). Cold B2B always uses Siz; never Sen for first contact, regardless of channel. 'Sayın {LastName} Bey / Hanım' is the formal email-equivalent register; 'Merhaba {FirstName} Bey / Hanım' is the standard chat opening for cold B2B; 'Merhaba {FirstName},' (first-name-only, no honorific) is acceptable on WhatsApp / Telegram once the relationship has warmed up but reads as too informal for cold. The honorifics 'Bey' (Mr.) and 'Hanım' (Ms.) follow the first name, not the last name (so 'Ahmet Bey' not 'Bey Ahmet'). " +
    "ORTHOGRAPHY: Turkish uses Latin script with diacritics: ç, ğ, ı (dotless i), İ (dotted capital I), ö, ş, ü. Get these right; missing diacritics read as foreign-template. Note the dotted/dotless i distinction: 'İstanbul' starts with dotted İ (uppercase form), not 'Istanbul'. Numbers use European convention: period as thousands separator, comma as decimal: '₺1.234.567,89'. Percentages use % symbol (12%); never spell out 'yüzde'. " +
    "CURRENCY: TRY (₺, Turkish lira). Significant inflation context: the lira has experienced rapid devaluation, so amounts in lira require care — large lira figures (₺100.000.000) may sound impressive but represent moderate USD value. Many Turkish B2B contexts dual-quote in USD or EUR alongside lira, especially for software / SaaS pricing. 'bin' (thousand) and 'milyon' (million) are informal-context units; '₺5 milyon' is natural in business chat. For formal B2B documents, full numerals with European separators. " +
    "CITY/MARKET REFERENCES: " +
    "İstanbul (the commercial center; ~16M population; finance and enterprise tech concentrated on Avrupa Yakası (European side) — Maslak (banking and corporate HQs), Levent (finance and consulting), Etiler (premium retail and tech), Şişli (mixed enterprise). Media and startups concentrate around Cihangir / Beyoğlu / Karaköy. Asya Yakası (Asian side) is more residential with some manufacturing). " +
    "Ankara (the capital; ~5.7M; government, defense industry — TUSAŞ / Turkish Aerospace, Aselsan, Roketsan, HAVELSAN; ODTÜ / METU university tech transfer). " +
    "İzmir (~4.4M, port and export hub, manufacturing). " +
    "Bursa (~3M, automotive manufacturing — Renault, Tofaş, Karsan). " +
    "Antalya (~2.5M, tourism economy). " +
    "Gaziantep (~2M, food / textile / regional B2B; the largest Turkish city near the Syrian border). " +
    "Kayseri / Konya / Adana (~1-2M each, Anatolian manufacturing). " +
    "PEER BRANDS by tier: " +
    "Tech / digital-native tier: Trendyol (Alibaba-backed, the dominant Turkish e-commerce platform), Hepsiburada (publicly listed e-commerce, founded in Turkey), Getir (quick-commerce pioneer, founded in Istanbul, expanded internationally then retrenched), Yemeksepeti (food delivery, owned by Delivery Hero), Migros Sanal (online grocery, part of Migros Ticaret), Papara (fintech / prepaid cards), İninal (prepaid), BiP (Türkcell's messaging app, the Turkish-internal WhatsApp alternative), Akakçe (price comparison), Sahibinden.com (classifieds, the dominant Turkish marketplace), N11 (e-commerce), Çiçeksepeti (flowers / gifts). " +
    "Traditional / holding-group tier: Koç Holding (the largest Turkish conglomerate — Arçelik, Tofaş, Tüpraş, Yapı Kredi Bank), Sabancı Holding (Akbank, Brisa, Carrefoursa, Enerjisa), Doğuş Holding (Garanti BBVA, Doğuş Otomotiv), Eczacıbaşı Holding (Vitra, İpek Kağıt), Anadolu Group (Anadolu Efes, McDonald's Turkey, Migros). Banking: Türkiye İş Bankası (the largest private bank, often called just 'İş Bankası'), Garanti BBVA, Akbank, Yapı Kredi, Ziraat Bankası (state-owned, largest by assets), VakıfBank (state), Halkbank (state), DenizBank (Emirates NBD), QNB Finansbank, TEB. Telco: Turkcell (largest), Vodafone Turkey (Vodafone TR), Türk Telekom (state). Aviation: Türk Hava Yolları / THY (Turkish Airlines), Pegasus Airlines (low-cost). Retail: Migros, BİM (discount), A101 (discount), ŞOK (discount). Industrial: Arçelik (white goods, Koç), Vestel (electronics), Tüpraş (refining, Koç), Ford Otosan (automotive, Koç). " +
    "Match peer references to prospect's tier: holding-group references for enterprise / banking / industrial; tech-tier references for SaaS / e-commerce / fintech / mobile gaming. Mixing tiers (referencing Trendyol when pitching İş Bankası) reads as foreign-template. " +
    "TONE: respectful-but-direct. Turkish B2B values: explicit recognition of seniority and titles in first contact (using Bey / Hanım), clear logical structure, and tangible business outcomes over abstract claims. Anatolian / conservative prospects expect more relationship-building preamble before the pitch; Istanbul tech / startup prospects expect faster, more direct outreach. Avoid hype words ('benzersiz', 'sektör lideri' without source, 'devrim') which read as advertising. Sign-offs: 'Saygılarımla' (most formal, traditional / Anatolian appropriate), 'İyi çalışmalar' (cordial, the standard B2B sign-off — literally 'good work'), 'Teşekkürler' (more casual, Istanbul tech appropriate). Choose sign-off to match the opening register and the prospect's sector.",
};`;

const E1_MARKER = `"he-IL":
    "Hebrew-Israel (he-IL):`;

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

// Pre-flight: tier-3 ko-KR must be present (depends on prior ticket)
if (!source.includes(`"ko-KR":\n    "Korean-South Korea (ko-KR):`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-ja-ko to have landed first");
  console.error("[FATAL] missing expected tier-3 ko-KR entry in GUIDES");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["guides-tier3-he-tr-append", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  // he-IL content checks
  heILAdded:                source.includes(`"he-IL":\n    "Hebrew-Israel (he-IL):`),
  heILHasSectorSplit:       source.includes(`SECTOR SPLIT (CRITICAL)`),
  heILHasTelAvivTechCluster: source.includes(`Tel Aviv (תל אביב, the commercial center`),
  heILHasHerzliyaPituach:   source.includes(`Herzliya (הרצליה, Pituach area`),
  heILHasBeerShevaCyber:    source.includes(`Beer Sheva (באר שבע, defense / cyber cluster`),
  heILHasILSCurrency:       source.includes(`CURRENCY: NIS / ILS (₪`),
  heILHasTechTier:          source.includes(`Wix, Monday.com, Lemonade`) &&
                            source.includes(`Riskified, JFrog`),
  heILHasCyberTier:         source.includes(`Check Point, CyberArk, Imperva`),
  heILHasTraditionalTier:   source.includes(`Bank Hapoalim (בנק הפועלים)`) &&
                            source.includes(`Bezeq (בזק)`),
  heILRejectsLichvod:       source.includes(`Do NOT use לכבוד (Lichvod)`),
  heILHasSignoffs:          source.includes(`'תודה' (Toda`) &&
                            source.includes(`'בברכה' (Be'vracha`),
  // tr-TR content checks
  trTRAdded:                source.includes(`"tr-TR":\n    "Turkish-Turkey (tr-TR):`),
  trTRHasCulturalSplit:     source.includes(`REGIONAL CULTURAL SPLIT`),
  trTRHasSizSenRegister:    source.includes(`Turkish has formal Siz vs informal Sen distinction`),
  trTRHasBeyHanim:          source.includes(`'Bey' (Mr.) and 'Hanım' (Ms.)`),
  trTRHasDiacritics:        source.includes(`ç, ğ, ı (dotless i), İ (dotted capital I)`),
  trTRHasTRYCurrency:       source.includes(`CURRENCY: TRY (₺, Turkish lira)`),
  trTRHasInflationContext:  source.includes(`the lira has experienced rapid devaluation`),
  trTRHasIstanbulSplit:     source.includes(`Avrupa Yakası (European side)`),
  trTRHasMaslakLevent:      source.includes(`Maslak (banking and corporate HQs)`),
  trTRHasAnkaraDefense:     source.includes(`TUSAŞ / Turkish Aerospace, Aselsan`),
  trTRHasTechTier:          source.includes(`Trendyol (Alibaba-backed`) &&
                            source.includes(`Hepsiburada (publicly listed`),
  trTRHasHoldingTier:       source.includes(`Koç Holding (the largest Turkish conglomerate`) &&
                            source.includes(`Sabancı Holding`),
  trTRHasBankList:          source.includes(`Türkiye İş Bankası (the largest private bank`),
  trTRHasSignoffs:          source.includes(`'Saygılarımla'`) &&
                            source.includes(`'İyi çalışmalar'`),

  // Untouched / regression checks
  koKRUntouched:            source.includes(`"ko-KR":\n    "Korean-South Korea (ko-KR):`),
  jaJPUntouched:            source.includes(`"ja-JP":\n    "Japanese-Japan (ja-JP):`),
  bnINUntouched:            source.includes(`"bn-IN":\n    "Bengali-India (bn-IN):`),
  hiINUntouched:            source.includes(`"hi-IN":\n    "Hindi-India (hi-IN):`),
  bnBDUntouched:            source.includes(`"bn-BD":\n    "Bengali-Bangladesh (bn-BD):`),
  bareHeUntouched:          source.includes(`Hebrew (he): Moderate localization`),
  bareTrUntouched:          source.includes(`Turkish (tr): Moderate localization`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  ptBRUntouched:            source.includes(`Brazilian Portuguese (pt-BR)`),
  deCHUntouched:            source.includes(`Swiss High German (de-CH;`),
  buildNativenessUntouched: source.includes(`export function buildNativenessBlock`),
};
console.log("[language-nativeness-he-tr] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[language-nativeness-he-tr] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[language-nativeness-he-tr] DONE");
