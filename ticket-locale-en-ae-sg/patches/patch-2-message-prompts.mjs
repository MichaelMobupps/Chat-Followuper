#!/usr/bin/env node
/**
 * Ticket locale-en-ae-sg, patch 2/3: services/messagePrompts.ts
 *
 * One atomic edit: append en-AE and en-SG entries to GREETING_TABLE
 * after the existing en-NL entry (last en-* tier-3 entry before this
 * ticket).
 *
 * Dependency: requires ticket-locale-en-be-nl + th-vi to have landed.
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

// Anchor: the closing of the en-NL entry. We use a unique substring
// from the last line of en-NL's note field.
const ANCHOR_LINE = `KPN / Odido / VodafoneZiggo for telco." },`;

const NEW_ENTRIES = `
  "en-AE": { withName: "Hi {NAME},", withoutName: "Hello,", note: "UAE / English. UAE B2B in mobile adtech and tech-enterprise contexts defaults to English (~85%+ expat workforce; English is the de facto business language though Arabic is official). For explicitly Arabic-speaking prospects (especially Emirati nationals in government / family-business contexts), use ar-SA via the ar block. Use en-GB spelling (UAE follows British conventions historically and educationally: organisation, optimisation, behaviour, centre). 'Hi {NAME},' for chat; 'Hello {NAME},' or 'Dear {NAME},' for cold email. NEVER use 'As-salamu alaykum' unless prompted (LLM-generated greetings should stay neutral-English; Arabic religious greetings work from Arabic speakers themselves but read presumptuous from non-Arabic-speaking outreach). Currency AED (UAE Dirham, د.إ or AED): '1,234,567.89 AED' or 'AED 1,234,567.89' (Arabic numerals, comma thousands, period decimal). 1 USD ~ 3.67 AED (pegged since 1997). USD reference quotes are common in cross-border B2B. Cities and free zones: Dubai (~3.7M, the dominant business hub for tech / multinational / commerce — DIFC / Dubai International Financial Centre is the major financial cluster operating under common law jurisdiction with English contract law; Dubai Internet City / DIC is the dominant tech free zone with most regional tech HQs — Microsoft / Oracle / Google / Meta / Amazon all have DIC offices; Dubai Media City for advertising / media; DMCC / Dubai Multi Commodities Centre is the largest free zone by registered companies; JAFZA / Jebel Ali Free Zone for logistics / industrial; Downtown Dubai / Business Bay for traditional offices), Abu Dhabi (~1.5M, the capital, government and sovereign wealth concentration — ADGM / Abu Dhabi Global Market is the second major financial free zone; oil and gas via ADNOC; Saadiyat Island for culture; Mubadala / ADQ / ADIA sovereign wealth funds based here), Sharjah (~1.8M, the third emirate, more conservative, manufacturing + education), Ras Al Khaimah / RAK and the other northern emirates (manufacturing + tourism). Peer brands: banking tier (UAE banking is government-influenced and consolidated): First Abu Dhabi Bank / FAB (the largest UAE bank by assets, Abu Dhabi government majority via Mubadala, ADX-listed; formed from 2017 NBAD + FGB merger), Emirates NBD (Dubai government majority via ICD, DFM-listed; the largest by branches in UAE), Abu Dhabi Commercial Bank / ADCB (Abu Dhabi government via ADIC, ADX-listed), Dubai Islamic Bank / DIB (the world's first commercial Islamic bank, DFM-listed), Mashreq Bank (one of the oldest private UAE banks, DFM-listed), Commercial Bank of Dubai / CBD (Dubai government), Sharjah Islamic Bank, RAKBank (Ras Al Khaimah). Sovereign / state-owned holding: Mubadala Investment Company (Abu Dhabi sovereign wealth, the dominant Abu Dhabi state-investment arm; portfolio includes GlobalFoundries, AMD historical, EMAAR partially, healthcare via Mubadala Health), ADQ (Abu Dhabi sovereign holding, newer entity, agriculture / utilities / industry), ADIA / Abu Dhabi Investment Authority (the largest UAE sovereign fund, internationally focused), Investment Corporation of Dubai / ICD (Dubai sovereign, the holding company for Dubai government assets including Emirates Group, Emirates NBD, dnata, Emaar partially). Real estate: Emaar Properties (the largest UAE developer, Burj Khalifa + Downtown Dubai + Dubai Mall, DFM-listed EMAAR), DAMAC (the second largest developer, DFM-listed DAMAC and Dubai Pearl), Aldar Properties (Abu Dhabi developer, ADX-listed), Meraas (Dubai government developer). Energy: ADNOC / Abu Dhabi National Oil Company (state oil major, the largest UAE corporate, ADX-listed for several subsidiaries — ADNOC Distribution / ADNOC Drilling / ADNOC Gas / ADNOC Logistics & Services), TAQA (Abu Dhabi power and water, ADX-listed). Telco: Etisalat / e& (the dominant UAE telco, Abu Dhabi government, ADX-listed; rebranded e& in 2022; regional presence in Egypt / Saudi via etc; international acquisition of PPF Telecom CEE in 2022), du / EITC (the second telco, Dubai government via EIC, DFM-listed). Conglomerates / Tech: Emirates Group (Emirates airline + dnata ground services, Dubai government via ICD; the most internationally recognizable UAE brand), Etihad Airways (Abu Dhabi government), Careem (Dubai-founded super-app, ride-hailing + delivery + payments; Uber-acquired 2020 for $3.1B but operates as separate brand in MENA — the Dubai tech reference story), Noon (Mohamed Alabbar-backed e-commerce platform, the local Amazon competitor for MENA), Souq.com (acquired by Amazon 2017, became Amazon.ae 2019), Talabat (food delivery, originally Kuwait but UAE major market, Delivery Hero-owned), Property Finder (Dubai-founded property portal), Dubizzle / Bayut (classifieds), Anghami (Dubai-founded music streaming, the Arabic Spotify), Swvl (Cairo+Dubai mobility, Nasdaq-listed but troubled post-SPAC), Kitopi (cloud kitchen). TONE: warm-professional, slightly more formal than US/UK but less ceremonial than mainland Arabic B2B. UAE business culture values: relationship and trust (Gulf B2B is slower than Anglo-Saxon, faster than Saudi; relationship-building matters even in expat-heavy English contexts), respect for hierarchy and Emirati leadership (Emiratis in management positions expect deference and time for decisions), multicultural awareness (workforce is South Asian / European / Arabic / Filipino — written communication should be neutral-international), Islamic-cultural awareness (UAE moved to Friday + Saturday weekend in 2022, distinct from most Gulf which is Friday + Saturday now too post-2022 alignment; respect Islamic practices — avoid pork / alcohol references in B2B; respect Ramadan with shifted hours and lighter expectations). Avoid: hard-sell pressure (Gulf B2B respects time and relationship), too-casual American slang ('gotten', 'awesome', 'no-brainer', 'y'all'), religious-insensitive references. Match peer tier to prospect's company sector." },
  "en-SG": { withName: "Hi {NAME},", withoutName: "Hello,", note: "Singapore / English. Singapore is Asia's primary regional B2B / tech HQ hub; English is THE official business language and the working lingua franca across all sectors. Singaporean B2B in mobile adtech and tech-enterprise overwhelmingly uses English; for explicitly Chinese-language prospects, use zh-Hans via the zh block (existing SG -> zh-Hans mapping). For Tamil or Malay prospects (rare in tech B2B), bare ta or ms. Use en-GB spelling (Singapore follows British conventions: organisation, optimisation, behaviour, centre). 'Hi {NAME},' for chat; 'Hello {NAME},' or 'Dear {NAME},' for cold email. Singlish (Singapore colloquial English with lah / lor / leh particles and Hokkien-Malay-Tamil loan words) is informal-cultural and NEVER appropriate for B2B written outreach — write standard English. Currency SGD (Singapore Dollar, S$ or SGD): 'S$1,234,567.89' or '1,234,567.89 SGD' (Arabic numerals, comma thousands, period decimal — same convention as US/UK). 1 USD ~ 1.35 SGD. USD reference quotes are common in cross-border B2B. Cities and regions (Singapore is a city-state, so 'cities' is a misnomer; key business districts instead): Raffles Place / Marina Bay / Shenton Way (CBD, traditional finance and corporate HQs — the Singapore equivalent of London's City or New York's Wall Street; DBS HQ / OCBC Centre / UOB Plaza), Tanjong Pagar (extension of CBD, tech and creative offices), One-North / Buona Vista (tech hub — Google APAC HQ historically, growing biotech / AI / R&D cluster), Changi Business Park (technology + offshore-banking + electronics), Jurong East (industrial + manufacturing), Punggol Digital District (newer tech / digital cluster), Orchard Road (retail flagship district). Peer brands: banking tier (Singapore is dominated by three local banks plus international): DBS Bank / Development Bank of Singapore (the largest by market cap; SGX-listed D05; Temasek-controlled; consistently rated 'World's Best Bank' by Euromoney; the Singapore banking reference), OCBC Bank / Oversea-Chinese Banking Corporation (the second largest; SGX-listed O39; Lee family heritage; Bank of Singapore is its private banking arm), UOB / United Overseas Bank (the third local; SGX-listed U11; Wee Cho Yaw family heritage); plus major international branches HSBC Singapore, Standard Chartered Singapore (UK-listed but Singapore has major operations), Citibank Singapore. Sovereign wealth / GLCs (Government-Linked Corporations — Singapore's distinctive 'Singapore Inc.' model): Temasek Holdings (Singapore's commercial sovereign wealth fund, the controller of SingTel / DBS / Singapore Airlines / CapitaLand / Keppel — Temasek-affiliated stake is a major Singapore B2B context), GIC (Government of Singapore Investment Corporation, the larger sovereign fund, internationally focused). Telco: Singtel / Singapore Telecommunications (Temasek-controlled, SGX-listed Z74, the dominant Singapore telco; regional through Optus Australia + Bharti Airtel India stake + AIS Thailand stake + Globe Philippines + Telkomsel Indonesia stake), StarHub (SGX-listed CC3, second), M1 (Keppel-controlled, third), Simba Telecom / TPG Telecom Singapore (newer entrant). Conglomerates: Keppel Corporation (Temasek-affiliated infrastructure / marine / real estate, SGX-listed BN4), Sembcorp Industries (Temasek-affiliated energy + water + urban development, SGX-listed U96), CapitaLand Investment / CLI (Temasek-affiliated real estate giant, SGX-listed 9CI), City Developments Limited / CDL (Kwek family, SGX-listed C09), Singapore Airlines / SIA (Temasek-controlled flag carrier, SGX-listed C6L), PSA International (Temasek-controlled port operator, the largest container port operator globally measured by container traffic), Wilmar International (Robert Kuok family, SGX-listed F34, the largest agribusiness in Asia), Singapore Post / SingPost (postal + e-commerce logistics). Tech (Singapore is the most internationally tech-successful Asian country per capita and the dominant SEA tech HQ): Grab Holdings (Singapore-HQ super-app — ride-hailing + delivery + payments + financial services; Nasdaq-listed GRAB; the most internationally recognizable Singapore tech and the SEA reference story; operates across SEA), Sea Limited / Sea Group (Singapore-HQ; Garena gaming including Free Fire / Shopee e-commerce / SeaMoney; NYSE-listed SE; the largest Southeast Asian tech company by various metrics; competes with Grab in fintech), Lazada (Alibaba subsidiary, Singapore-HQ for SEA operations, the regional e-commerce platform), Razer (Singapore-founded gaming hardware, the global Singaporean gaming reference, was HKEX-listed then privatized 2022), Carousell (Singapore-founded classifieds marketplace, regional presence), Trax (image recognition retail tech, Singapore-founded), Carro (used cars marketplace, regional), Ninja Van (logistics, Singapore-founded, Series E unicorn), GoTo Singapore presence (Indonesian Gojek+Tokopedia, regional). Public sector / digital: GovTech Singapore (digital government, the Singpass mobile ID and FormSG references), MAS / Monetary Authority of Singapore (central bank + regulator, the financial sector reference for fintech B2B), IMDA (Infocomm Media Development Authority, the tech regulator). TONE: efficient-formal, direct-but-polite, multiculturally-aware. Singaporean B2B values: clear communication, efficiency (no time-wasting, get to the point), respect for hierarchy (kiasu / face-saving lower than mainland Asian but still relevant — never embarrass a senior in writing), English fluency is universal (write at native level; no need for simplified language), multicultural sensitivity (Chinese New Year + Hari Raya Puasa / Eid + Deepavali + Christmas are all major public holidays; respect all). Singapore B2B is fast — outreach can be more direct than India / China / Indonesia. Avoid Singlish in writing ('lah' / 'lor' / 'can or not' read as overfamiliar / unprofessional). Avoid: overly hyped American salesy language ('revolutionary', 'unlock value', 'no-brainer'); these read as foreign-template. Match peer tier to prospect's company sector: DBS / OCBC / UOB for finance, SingTel for telco, Grab / Sea / Lazada for tech / SaaS, Keppel / Sembcorp / CapitaLand for infrastructure / real estate, Singapore Airlines for aviation." },`;

const E1_OLD = ANCHOR_LINE;
const E1_NEW = ANCHOR_LINE + NEW_ENTRIES;
const E1_MARKER = `"en-AE": { withName: "Hi {NAME},"`;

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
  const idx = source.indexOf(oldStr);
  const newSource = source.substring(0, idx) + newStr + source.substring(idx + oldStr.length);
  return { source: newSource, ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

if (!source.includes(`"en-NL": { withName: "Hi {NAME},"`) ||
    !source.includes(`"en-BE": { withName: "Hi {NAME},"`)) {
  console.error("[FATAL] missing en-BE / en-NL entries (precondition: ticket-locale-en-be-nl)");
  process.exit(5);
}
if (!source.includes(`"th-TH": { withName: "เรียน {NAME},"`) ||
    !source.includes(`"vi-VN": { withName: "Kính gửi anh/chị {NAME},"`)) {
  console.error("[FATAL] missing th-TH / vi-VN entries (precondition: ticket-locale-tier3-th-vi)");
  process.exit(5);
}

const r = applyEdit("greeting-en-ae-sg-add", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r.ok) process.exit(3);
source = r.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  // en-AE
  enAEAdded:                source.includes(`"en-AE": { withName: "Hi {NAME},"`),
  enAEExpatNote:            source.includes(`~85%+ expat workforce; English is the de facto business language`),
  enAERoutesArSA:           source.includes(`use ar-SA via the ar block`),
  enAEEnGBSpelling:         source.includes(`UAE follows British conventions historically`),
  enAEAEDCurrency:          source.includes(`Currency AED (UAE Dirham`) &&
                            source.includes(`1 USD ~ 3.67 AED (pegged since 1997)`),
  enAEDubai:                source.includes(`Dubai (~3.7M, the dominant business hub`),
  enAEDIFC:                 source.includes(`DIFC / Dubai International Financial Centre`),
  enAEDubaiInternetCity:    source.includes(`Dubai Internet City / DIC is the dominant tech free zone`),
  enAEDMCC:                 source.includes(`DMCC / Dubai Multi Commodities Centre is the largest free zone`),
  enAEAbuDhabiADGM:         source.includes(`Abu Dhabi (~1.5M, the capital`) &&
                            source.includes(`ADGM / Abu Dhabi Global Market`),
  enAEFABLargest:           source.includes(`First Abu Dhabi Bank / FAB (the largest UAE bank by assets`),
  enAEEmiratesNBD:          source.includes(`Emirates NBD (Dubai government majority`),
  enAEMubadala:             source.includes(`Mubadala Investment Company (Abu Dhabi sovereign wealth`),
  enAEADNOC:                source.includes(`ADNOC / Abu Dhabi National Oil Company`),
  enAEEtisalatE_and:        source.includes(`Etisalat / e& (the dominant UAE telco`),
  enAECareemUberAcq:        source.includes(`Careem (Dubai-founded super-app`) &&
                            source.includes(`Uber-acquired 2020 for $3.1B`),
  enAENoon:                 source.includes(`Noon (Mohamed Alabbar-backed e-commerce`),
  enAEFridaySaturdayWE:     source.includes(`UAE moved to Friday + Saturday weekend in 2022`),
  enAEIslamicRespect:       source.includes(`respect Islamic practices — avoid pork / alcohol references in B2B`),

  // en-SG
  enSGAdded:                source.includes(`"en-SG": { withName: "Hi {NAME},"`),
  enSGEnglishOfficial:      source.includes(`English is THE official business language`),
  enSGRoutesZhHans:         source.includes(`use zh-Hans via the zh block (existing SG -> zh-Hans mapping)`),
  enSGEnGBSpelling:         source.includes(`Singapore follows British conventions`),
  enSGSingNotAppropriate:   source.includes(`Singlish (Singapore colloquial English with lah / lor / leh particles`) &&
                            source.includes(`NEVER appropriate for B2B written outreach`),
  enSGSGDCurrency:          source.includes(`Currency SGD (Singapore Dollar, S$ or SGD)`) &&
                            source.includes(`1 USD ~ 1.35 SGD`),
  enSGRafflesMarinaBay:     source.includes(`Raffles Place / Marina Bay / Shenton Way (CBD`),
  enSGOneNorth:             source.includes(`One-North / Buona Vista (tech hub`),
  enSGDBSLargest:           source.includes(`DBS Bank / Development Bank of Singapore (the largest by market cap`),
  enSGOCBCUOB:              source.includes(`OCBC Bank / Oversea-Chinese Banking Corporation`) &&
                            source.includes(`UOB / United Overseas Bank`),
  enSGTemasekGIC:           source.includes(`Temasek Holdings`) && source.includes(`GIC`),
  enSGSingtel:              source.includes(`Singtel / Singapore Telecommunications (Temasek-controlled`),
  enSGKeppelSembcorp:       source.includes(`Keppel Corporation`) && source.includes(`Sembcorp Industries`),
  enSGGrabSEA:              source.includes(`Grab Holdings (Singapore-HQ super-app`),
  enSGSeaGroup:             source.includes(`Sea Limited / Sea Group (Singapore-HQ; Garena gaming including Free Fire / Shopee e-commerce`),
  enSGRazer:                source.includes(`Razer (Singapore-founded gaming hardware`),
  enSGMASGovTech:           source.includes(`MAS / Monetary Authority of Singapore`) &&
                            source.includes(`GovTech Singapore`),
  enSGCultureSensitive:     source.includes(`Chinese New Year + Hari Raya Puasa / Eid + Deepavali + Christmas`),
  enSGDirectTone:           source.includes(`Singapore B2B is fast`),

  // Untouched
  enBEUntouched:            source.includes(`"en-BE": { withName: "Hi {NAME},"`),
  enNLUntouched:            source.includes(`"en-NL": { withName: "Hi {NAME},"`),
  enUSUntouched:            source.includes(`"en-US": { withName: "Hi {NAME},", withoutName: "Hi there,", note: "American English`),
  enGBUntouched:            source.includes(`"en-GB": { withName: "Hi {NAME},", withoutName: "Hello,", note: "British English`),
  enINUntouched:            source.includes(`"en-IN": { withName: "Hello {NAME},", withoutName: "Hello,", note: "Indian English`),
  // Prior tier-3 unaffected
  thTHUntouched:            source.includes(`"th-TH": { withName: "เรียน {NAME},"`),
  viVNUntouched:            source.includes(`"vi-VN": { withName: "Kính gửi anh/chị {NAME},"`),
  elGRUntouched:            source.includes(`"el-GR": { withName: "Γεια σας, {NAME},"`),
  bgBGUntouched:            source.includes(`"bg-BG": { withName: "Здравейте, {NAME},"`),
  huHUUntouched:            source.includes(`"hu-HU": { withName: "Üdvözlöm, {NAME},"`),
  jaJPUntouched:            source.includes(`"ja-JP": { withName: "{NAME}様、"`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
};
console.log("[message-prompts-en-ae-sg] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[message-prompts-en-ae-sg] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[message-prompts-en-ae-sg] DONE");
