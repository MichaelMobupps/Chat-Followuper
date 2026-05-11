#!/usr/bin/env node
/**
 * Ticket locale-en-ae-sg, patch 3/3: lib/languageNativeness.ts
 *
 * One atomic edit: append en-AE and en-SG entries to the en-* GUIDES
 * block, after the existing en-NL entry.
 *
 * Dependency: requires ticket-locale-en-be-nl + th-vi to have landed.
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/languageNativeness.ts",
);

// Anchor: the unique closing line of the en-NL GUIDES entry.
const ANCHOR_LINE = `    "Match peer tier to prospect's company sector: ING / Rabobank / ABN AMRO for finance, Philips / DSM / ASML for industrial / deep-tech, Booking / Adyen / Mollie / TomTom for tech / SaaS, KPN / Odido / VodafoneZiggo for telco, Albert Heijn / Jumbo / HEMA for retail, Action / Picnic / Coolblue for value-tech-retail.",`;

const NEW_ENTRIES = `

  "en-AE":
    "UAE English (en-AE; covers United Arab Emirates B2B in mobile adtech, tech, finance, and most international-enterprise contexts): UAE B2B in mobile adtech and tech-enterprise contexts defaults to English. The UAE has an ~85%+ expat workforce (South Asian, European, North American, Filipino, Arab non-Emirati) and English is the de facto business language across DIFC / ADGM / free zones / multinationals despite Arabic being the official state language. Emirati nationals are the minority demographic but hold senior government and family-business positions; B2B outreach should respect this hierarchy. For explicitly Arabic-speaking prospects (especially Emirati nationals in government / family-business contexts), use ar-SA via the ar block (existing AE -> ar-SA mapping). " +
    "B2B WhatsApp register: 'Hi {NAME},' direct-warm chat default; 'Hello {NAME},' or 'Dear {NAME},' for cold email; 'Dear Mr / Ms / Dr / Sheikh {LastName},' for the most formal contexts addressing seniors or Emiratis. " +
    "GREETINGS NOTE: NEVER use 'As-salamu alaykum' (السلام عليكم) unprompted from LLM-generated English outreach — this is the standard Arabic-Islamic greeting but reads presumptuous from non-Arabic-speaking automated outreach. It is appropriate FROM Arabic speakers TO Arabic speakers in ar-SA / ar-EG / ar-MA contexts, not in en-AE generic-English outreach. Default to neutral 'Hi / Hello'. " +
    "SPELLING: Use en-GB spelling (organisation, optimisation, behaviour, centre, prioritise, analyse, defence, licence/license, travelled). UAE follows British conventions historically (education / curriculum traditionally UK-aligned, though American-curriculum schools exist) and en-GB is the appropriate B2B register. Avoid Americanisms ('gotten', 'awesome', 'super', 'y'all'). " +
    "ADTECH VOCABULARY: standard English terms; UAE B2B aligns with European-English / international mobile adtech conventions. No localisation needed. " +
    "CURRENCY: AED (UAE Dirham, د.إ written in Arabic / AED in English): '1,234,567.89 AED' or 'AED 1,234,567.89' (Arabic numerals, comma thousands, period decimal — same convention as US/UK). 1 USD ~ 3.67 AED, pegged to the US dollar since 1997. USD reference quotes are common in cross-border B2B given the currency peg. For larger amounts: 'M' (million) and 'B' (billion) abbreviations used; 'مليون' (million) and 'مليار' (billion) Arabic spellings only when text is Arabic-mixed. " +
    "CITY / FREE-ZONE REFERENCES: " +
    "Dubai (the dominant business hub of the UAE for tech / multinational / commerce, ~3.7M population; major B2B free zones each with distinct positioning): " +
    "  - DIFC / Dubai International Financial Centre (the major financial cluster; operates under independent common law jurisdiction with English contract law and an independent DIFC Courts system; home to most regional banks, asset managers, hedge funds, fintech; the financial-services reference). " +
    "  - Dubai Internet City / DIC (the dominant tech free zone; Microsoft, Oracle, Google, Meta, Amazon, IBM, SAP, Cisco, and most major regional tech HQs are located in DIC or adjacent free zones). " +
    "  - Dubai Media City / DMC (advertising, media, broadcasting — adjacent to DIC). " +
    "  - DMCC / Dubai Multi Commodities Centre (the largest UAE free zone by registered companies, ~25,000+ companies; commodities + crypto + tech + general business). " +
    "  - JAFZA / Jebel Ali Free Zone (the oldest UAE free zone; logistics, industrial, manufacturing — adjacent to Jebel Ali Port). " +
    "  - Downtown Dubai / Business Bay (traditional onshore corporate offices, including Burj Khalifa, Emirates Tower). " +
    "Abu Dhabi (the capital, government and sovereign wealth concentration, ~1.5M; more conservative / Emirati-traditional than Dubai; oil and gas wealth via ADNOC; the second major financial free zone is ADGM / Abu Dhabi Global Market (also independent common law); Saadiyat Island for culture / Louvre Abu Dhabi / NYU Abu Dhabi; major sovereign wealth funds based here — ADIA, Mubadala, ADQ, ICD). " +
    "Sharjah (the third emirate, ~1.8M, more conservative than Dubai/Abu Dhabi — alcohol-free, dress code stricter; manufacturing, education, cultural heritage). " +
    "Ras Al Khaimah / RAK (~330K, northern emirate, manufacturing + tourism; RAK Investment Authority / RAKIA free zone). " +
    "Ajman, Umm Al Quwain, Fujairah (smaller northern emirates). " +
    "PEER BRANDS by tier: " +
    "Banking tier (UAE banking is government-influenced and highly consolidated): First Abu Dhabi Bank / FAB (the largest UAE bank by assets, Abu Dhabi government majority via Mubadala / IPIC, ADX-listed; formed from 2017 NBAD + FGB merger — Belgium-equivalent KBC scale for UAE), Emirates NBD (Dubai government majority via ICD, DFM-listed; the largest by branches in UAE; international expansion via DenizBank Turkey acquisition 2019), Abu Dhabi Commercial Bank / ADCB (Abu Dhabi government via ADIC, ADX-listed), Dubai Islamic Bank / DIB (the world's first commercial Islamic bank founded 1975, DFM-listed; the Islamic banking reference in UAE), Mashreq Bank (one of the oldest UAE private banks, Al Ghurair family historical, DFM-listed), Commercial Bank of Dubai / CBD (Dubai government), Sharjah Islamic Bank (the third Islamic bank by metrics), RAKBank (Ras Al Khaimah), HSBC Middle East (UAE HQ for HSBC MENA), Standard Chartered Middle East, Citibank Middle East, BNP Paribas Middle East. " +
    "Sovereign wealth / state-investment tier (essential UAE B2B context — sovereign-affiliated entities are the largest B2B players in Abu Dhabi specifically): Mubadala Investment Company (Abu Dhabi sovereign wealth; portfolio includes GlobalFoundries semiconductors, AMD historical, EMAAR partially, Cleveland Clinic Abu Dhabi, Mubadala Health, Yahsat satellites; Mubadala-affiliated is meaningful B2B credibility marker). ADQ (Abu Dhabi sovereign holding, newer entity founded 2018; agriculture / utilities / industry / logistics — including Etihad Rail, ADNOC Refining stake, Abu Dhabi Ports). ADIA / Abu Dhabi Investment Authority (the largest UAE sovereign fund, internationally focused; private and discretionary). Investment Corporation of Dubai / ICD (Dubai sovereign holding company; Emirates Group + Emirates NBD + dnata + Emaar partially + Dubai Holding). Dubai Holding (Dubai sovereign-affiliated, real estate + hospitality + telecom + business parks). " +
    "Real estate tier: Emaar Properties (the largest UAE developer, DFM-listed EMAAR — Burj Khalifa + Downtown Dubai + Dubai Mall + The Dubai Fountain; Mohamed Alabbar founder), DAMAC Properties (the second-largest developer, was DFM-listed, taken private 2022 by Hussain Sajwani — luxury residential), Aldar Properties (Abu Dhabi developer, ADX-listed; Yas Island + Saadiyat developments), Meraas (Dubai government developer, City Walk + Bluewaters), Nakheel (Dubai government developer, Palm Jumeirah + The World islands), Dubai Properties (Dubai Holding). " +
    "Energy / industrial: ADNOC / Abu Dhabi National Oil Company (state oil major, the largest UAE corporate by revenue, multiple ADX-listed subsidiaries — ADNOC Distribution / ADNOC Drilling / ADNOC Gas / ADNOC Logistics & Services / ADNOC L&S), TAQA / Abu Dhabi National Energy Company (Abu Dhabi power and water utility, ADX-listed). " +
    "Telco: Etisalat / e& (the dominant UAE telco, Abu Dhabi government majority via Mubadala, ADX-listed; rebranded e& in 2022 from Etisalat Group; international presence in Egypt via Etisalat Misr + Saudi via Mobily stake + 2022 acquisition of PPF Telecom CEE operations from Czech PPF Group for ~$2.3B), du / EITC / Emirates Integrated Telecommunications Company (the second UAE telco, Dubai government majority via Emirates Investment Authority, DFM-listed), Virgin Mobile UAE (small MVNO). " +
    "Aviation: Emirates Group (Emirates airline + dnata ground services, Dubai government-owned via ICD; the most internationally recognizable UAE brand; one of the world's largest international airlines by revenue), Etihad Airways (Abu Dhabi government-owned flag carrier), flydubai (Dubai government low-cost subsidiary), Air Arabia (Sharjah low-cost). " +
    "Tech / digital tier (the UAE tech ecosystem is younger than Asia's but growing rapidly, with significant sovereign investment in tech): Careem (Dubai-founded super-app, ride-hailing + delivery + payments; Uber-acquired 2020 for $3.1B; operates as separate brand across MENA; the Dubai tech reference success story). Noon (Mohamed Alabbar + PIF Saudi-backed e-commerce platform launched 2017, the local Amazon competitor for MENA), Amazon.ae (the former Souq.com which Amazon acquired for $580M in 2017 and rebranded). Talabat (food delivery, originally Kuwaiti but UAE major market, Delivery Hero-owned since 2015). Property Finder (Dubai-founded property portal, the regional property search reference). Dubizzle (classifieds, OLX MENA portfolio) / Bayut (Dubai-founded property classifieds). Anghami (Dubai-headquartered music streaming, the Arabic Spotify, formerly Nasdaq-listed). Swvl (Cairo + Dubai mobility, was Nasdaq-listed post-SPAC but struggled; transit / bus). Kitopi (Dubai-founded cloud kitchen unicorn). Mawdoo3 (Arabic content platform). " +
    "TONE: warm-professional, slightly more formal than US/UK but less ceremonial than mainland Arabic B2B. UAE business culture values: " +
    "- Relationship and trust (Gulf B2B is slower than Anglo-Saxon, faster than Saudi proper; relationship-building matters even in expat-heavy English contexts; first meetings often coffee or meal, hard decisions take time). " +
    "- Respect for hierarchy and Emirati leadership (Emiratis in management positions and especially Sheikh titles expect deference and time for decisions; never pressure or push). " +
    "- Multicultural awareness (workforce is South Asian / European / Arab non-Emirati / Filipino / North American; written communication should be neutral-international). " +
    "- Islamic-cultural awareness (UAE moved to Friday + Saturday weekend in 2022, aligning closer to global Mon-Fri workweek; Friday remains the holy day with shorter hours; respect Islamic practices — avoid pork / alcohol / religious-insensitive references in B2B; respect Ramadan with shifted hours and lighter expectations during the month). " +
    "- Formal address layer (use Mr / Ms / Dr / Sheikh titles when known; first-name-only is more casual than UK / US norms in cold B2B; Emirati names: family-name often preceded by 'Al' (e.g., Al Maktoum, Al Nahyan) — these are family names not titles; Mohamed bin Rashid is a patronymic). " +
    "Avoid: hard-sell pressure (Gulf B2B respects time and relationship — limited-time offers feel pushy), too-casual American slang ('gotten', 'awesome', 'no-brainer', 'y'all', 'super'), religious-insensitive references (pork, alcohol, gambling), assuming Western political norms. " +
    "Match peer tier to prospect's company sector: FAB / Emirates NBD / ADCB for finance, Mubadala / ADQ for sovereign-investment, Emaar / DAMAC / Aldar for real estate, ADNOC for energy, Etisalat / e& / du for telco, Emirates / Etihad for aviation, Careem / Noon / Anghami for tech.",

  "en-SG":
    "Singapore English (en-SG; covers Singapore B2B in mobile adtech, tech, SaaS, finance, and most international-enterprise contexts): Singapore is Asia's primary regional B2B / tech hub. English is THE official business language and the working lingua franca across all sectors; English is the lingua franca of the racially diverse Singaporean population (Chinese ~75%, Malay ~14%, Indian ~9%, other ~3%). Singaporean B2B in mobile adtech and tech-enterprise overwhelmingly uses English. For explicitly Chinese-language prospects, use zh-Hans via the zh block (existing SG -> zh-Hans mapping). For Tamil or Malay prospects (rare in tech B2B but possible in government / heritage contexts), bare ta or ms respectively. The default for Singapore tech B2B is en-SG. " +
    "B2B WhatsApp register: 'Hi {NAME},' direct-warm chat default; 'Hello {NAME},' or 'Dear {NAME},' for cold email; 'Dear Mr / Ms / Dr {LastName},' for the most formal contexts. Singaporean B2B is comfortable with first-name basis quickly compared to mainland Asian B2B. " +
    "SINGLISH NOTE: Singlish (Singapore colloquial English, also called Singaporean Vernacular English) is a creole blending English structural grammar with Hokkien / Cantonese / Malay / Tamil loan words and particles ('lah', 'lor', 'leh', 'meh', 'sia', 'can or not', 'sian'). Singlish is culturally cherished and informally used everywhere but NEVER appropriate for B2B written outreach. Write standard English exclusively. Singaporeans can switch instantly between Singlish (casual / in-group) and Standard English (professional / outsider) — they expect Standard English from outsiders. " +
    "SPELLING: Use en-GB spelling (organisation, optimisation, behaviour, centre, prioritise, analyse, defence, licence/license, travelled). Singapore follows British conventions in education and government. Avoid Americanisms ('gotten', 'awesome', 'super', 'y'all'). " +
    "ADTECH VOCABULARY: standard English terms; Singaporean B2B aligns with international mobile adtech conventions and is highly current with global terminology. No localisation needed. " +
    "CURRENCY: SGD (Singapore Dollar, S$ or SGD; sometimes 'SG$'): 'S$1,234,567.89' or '1,234,567.89 SGD' (Arabic numerals, comma thousands, period decimal — same convention as US/UK). 1 USD ~ 1.35 SGD. The Monetary Authority of Singapore / MAS manages a managed-float currency policy. USD reference quotes are extremely common in cross-border B2B given Singapore's status as a global financial hub. " +
    "SINGAPORE IS A CITY-STATE: rather than cities, key business / industrial districts: " +
    "  - Raffles Place / Marina Bay / Shenton Way (the CBD; traditional finance, corporate HQs, the Singapore equivalent of London's City or New York's Wall Street; DBS HQ at Marina Bay Financial Centre, OCBC Centre, UOB Plaza, Marina Bay Sands integrated resort). " +
    "  - Tanjong Pagar (CBD extension; tech, creative agencies, design firms). " +
    "  - One-North / Buona Vista (the tech R&D hub; Google APAC HQ historically, biomedical research cluster A*STAR, Fusionopolis + Biopolis; the Singapore Silicon-Valley-equivalent for deep tech and R&D). " +
    "  - Changi Business Park (technology + offshore-banking + electronics; near Changi Airport). " +
    "  - Jurong East / Jurong Industrial Estate (heavy industry + manufacturing + petrochemical; the western industrial belt). " +
    "  - Punggol Digital District (newer tech / digital cluster, opened 2024; JTC Corporation-developed; AI / cybersecurity / SMU campus). " +
    "  - Orchard Road (retail flagship district; not B2B-relevant but a Singapore reference). " +
    "  - Changi Airport (Asia's premier connecting hub; SATS ground services + Changi Airport Group). " +
    "PEER BRANDS by tier: " +
    "Banking tier (Singapore is dominated by three local banks plus major international branches): DBS Bank / Development Bank of Singapore (the largest by market cap and assets; SGX-listed D05; Temasek-controlled; consistently rated 'World's Best Bank' by Euromoney and other ratings; the Singapore banking reference and a major regional / Asia-Pacific player), OCBC Bank / Oversea-Chinese Banking Corporation (the second largest; SGX-listed O39; Lee family historical heritage from Chinese immigrant founding; Bank of Singapore is its private banking subsidiary), UOB / United Overseas Bank (the third local; SGX-listed U11; Wee Cho Yaw family heritage; regional through UOB Malaysia / UOB Indonesia / UOB Thailand). Major international branches with Singapore HQs for regional operations: HSBC Singapore (Asia HQ-relevant), Standard Chartered (also London-listed but with significant Singapore operations and listed regional credentials), Citibank Singapore, JP Morgan Singapore, Goldman Sachs Singapore, Morgan Stanley Singapore. " +
    "Sovereign wealth / GLCs / 'Singapore Inc.' (essential Singapore B2B context — government-linked corporations are a distinctive feature of the Singapore economy): " +
    "  - Temasek Holdings (the commercial sovereign wealth fund, controller of SingTel / DBS / Singapore Airlines / CapitaLand / Keppel / Sembcorp / Mapletree / ST Engineering; Temasek-affiliated stake is a meaningful B2B credibility / scale marker). " +
    "  - GIC / Government of Singapore Investment Corporation (the larger sovereign fund by assets, internationally-focused private equity / public market investor). " +
    "  - MAS / Monetary Authority of Singapore (central bank + integrated financial regulator + sovereign exchange-rate manager — distinctively powerful regulator that is also the central bank; the regulatory reference for any fintech B2B in Singapore). " +
    "  - IMDA / Infocomm Media Development Authority (the tech / media regulator; sets regulation for telecoms, broadcasting, fintech-adjacent tech). " +
    "  - GovTech Singapore (digital government agency; Singpass / FormSG / TraceTogether references; world-class digital-government reputation). " +
    "  - JTC Corporation (industrial land + parks operator; controls Singapore industrial real estate). " +
    "  - HDB / Housing Development Board (public housing — ~80% of Singaporeans live in HDB flats). " +
    "Telco: Singtel / Singapore Telecommunications (Temasek-controlled, SGX-listed Z74, the dominant Singapore telco — regional through Optus Australia + ~31% stake in Bharti Airtel India + AIS Thailand stake + Globe Philippines stake + Telkomsel Indonesia stake; one of Asia's largest telcos by various metrics), StarHub (SGX-listed CC3, second by various metrics, Asia Mobile Holdings + ST Telemedia parent), M1 (Keppel-controlled + Konnectivity / SPH Media, third), Simba Telecom / TPG Telecom Singapore (a newer entrant, ASX-listed parent). " +
    "Conglomerates (Singapore's GLC-driven conglomerates dominate infrastructure / industrial / real estate): " +
    "  - Keppel Corporation (Temasek-affiliated infrastructure + marine + real estate + asset management, SGX-listed BN4; offshore marine business spun off to Sembcorp Marine merger). " +
    "  - Sembcorp Industries (Temasek-affiliated energy + water + urban development + offshore marine, SGX-listed U96). " +
    "  - CapitaLand Investment / CLI (Temasek-affiliated real estate giant — one of Asia's largest real estate investment managers, SGX-listed 9CI; CapitaLand Mall Trust REITs). " +
    "  - Mapletree Investments (Temasek-affiliated real estate, multiple REIT vehicles). " +
    "  - City Developments Limited / CDL (Kwek family, SGX-listed C09; non-GLC, the major private real estate). " +
    "  - Singapore Airlines / SIA (Temasek-controlled flag carrier + Scoot low-cost subsidiary, SGX-listed C6L). " +
    "  - PSA International (Temasek-controlled port operator; the largest container port operator globally measured by container traffic — operates Singapore + Antwerp + global terminals). " +
    "  - Wilmar International (Robert Kuok family, SGX-listed F34, the largest agribusiness in Asia by some metrics — palm oil + grains + sugar). " +
    "  - ST Engineering / Singapore Technologies Engineering (Temasek-affiliated, SGX-listed S63 — defence / aerospace / electronics / public security). " +
    "  - Singapore Post / SingPost (SGX-listed S08 — postal + e-commerce logistics). " +
    "Tech (Singapore is the dominant SEA tech HQ and the most internationally tech-successful Asian country per capita): " +
    "  - Grab Holdings (Singapore-HQ super-app; ride-hailing + delivery + GrabPay payments + GrabBank digital banking; Nasdaq-listed GRAB; the most internationally recognizable Singapore tech and the SEA reference story; operates across SEA — Singapore + Malaysia + Indonesia + Thailand + Vietnam + Philippines + Cambodia + Myanmar). " +
    "  - Sea Limited / Sea Group (Singapore-HQ; Garena gaming including Free Fire / Shopee e-commerce / SeaMoney digital financial services; NYSE-listed SE; the largest Southeast Asian tech company by various metrics — competes with Grab in fintech; Shopee dominates SEA e-commerce). " +
    "  - Lazada (Alibaba subsidiary, Singapore-HQ for SEA operations, the regional e-commerce platform competing with Shopee). " +
    "  - Razer (Singapore-founded gaming hardware + peripherals + RazerStore; was HKEX-listed then privatized 2022 by founder Min-Liang Tan; the global Singaporean gaming reference). " +
    "  - Carousell (Singapore-founded classifieds marketplace, regional presence). " +
    "  - Trax (image recognition retail technology, Singapore-founded, US-grown). " +
    "  - Carro (used cars marketplace, regional). " +
    "  - Ninja Van (logistics, Singapore-founded Series E unicorn — SEA last-mile delivery). " +
    "  - GoTo Singapore presence (Indonesian Gojek+Tokopedia regional footprint). " +
    "  - Property Singapore / PropertyGuru (Singapore-HQ regional property portal, NYSE-listed PGRU). " +
    "  - 99co (Singapore property tech). " +
    "  - Glints (Singapore-HQ regional recruitment platform). " +
    "TONE: efficient-formal, direct-but-polite, multiculturally-aware, kiasu-but-professional. Singaporean B2B values: " +
    "- Clear communication and efficiency — get to the point quickly; Singaporeans famously dislike time-wasting (Singapore is the most efficiency-oriented Asian business culture). " +
    "- Respect for hierarchy (kiasu / face-saving lower than mainland Asian but still relevant; never embarrass a senior in writing). " +
    "- English fluency is universal — write at native level; no need for simplified language or over-explanation. " +
    "- Multicultural sensitivity — Chinese New Year (Lunar New Year, 2-day public holiday) + Hari Raya Puasa / Eid al-Fitr (Muslim holiday) + Deepavali / Diwali (Hindu festival of lights) + Christmas + Good Friday are all major public holidays; respect all when scheduling. Singapore has 11 public holidays reflecting all four major religions. " +
    "- Singapore B2B is fast — outreach can be more direct than mainland China / India / Indonesia / Vietnam. Decisions are typically faster than rest of SEA, but slower than US / UK due to consensus-building in larger organisations and GLC bureaucracy. " +
    "- Government and regulatory awareness — Singapore is a small, highly-regulated state; B2B contexts often reference MAS, IMDA, PDPA (data protection), etc; if relevant to the prospect's sector, demonstrating regulatory familiarity is a credibility marker. " +
    "Avoid: Singlish in writing ('lah' / 'lor' / 'can or not' / 'sian' — these read as overfamiliar and unprofessional in B2B). Avoid overly hyped American salesy language ('revolutionary', 'unlock value', 'no-brainer', 'best-in-class') — these read as foreign-template. Avoid assuming Anglo-Saxon corporate cultural references. " +
    "Match peer tier to prospect's company sector: DBS / OCBC / UOB for finance, MAS / IMDA for regulator-adjacent, SingTel / StarHub for telco, Grab / Sea / Lazada / Razer for tech, Keppel / Sembcorp / CapitaLand for infrastructure / real estate, Singapore Airlines for aviation, Wilmar for agribusiness, PSA for logistics / ports, ST Engineering for defence / electronics.",`;

const E1_OLD = ANCHOR_LINE;
const E1_NEW = ANCHOR_LINE + NEW_ENTRIES;
const E1_MARKER = `"en-AE":\n    "UAE English (en-AE;`;

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

if (!source.includes(`"en-NL":\n    "Dutch B2B in English`) ||
    !source.includes(`"en-BE":\n    "Belgian English`)) {
  console.error("[FATAL] missing en-BE / en-NL entries (precondition: ticket-locale-en-be-nl)");
  process.exit(5);
}
if (!source.includes(`"th-TH":\n    "Thai-Thailand`) ||
    !source.includes(`"vi-VN":\n    "Vietnamese-Vietnam`)) {
  console.error("[FATAL] missing th-TH / vi-VN entries (precondition: ticket-locale-tier3-th-vi)");
  process.exit(5);
}

const r = applyEdit("guides-en-ae-sg-append", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r.ok) process.exit(3);
source = r.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  // en-AE
  enAEAdded:                source.includes(`"en-AE":\n    "UAE English (en-AE;`),
  enAEExpatNote:            source.includes(`~85%+ expat workforce`) &&
                            source.includes(`English is the de facto business language`),
  enAERoutesArSA:           source.includes(`use ar-SA via the ar block (existing AE -> ar-SA mapping)`),
  enAEAsSalamuRule:         source.includes(`NEVER use 'As-salamu alaykum' (السلام عليكم) unprompted`),
  enAEEnGBSpelling:         source.includes(`UAE follows British conventions historically`),
  enAEAEDPegged:            source.includes(`AED (UAE Dirham`) &&
                            source.includes(`1 USD ~ 3.67 AED, pegged to the US dollar since 1997`),
  enAEDubaiHub:             source.includes(`Dubai (the dominant business hub of the UAE`),
  enAEDIFC:                 source.includes(`DIFC / Dubai International Financial Centre`) &&
                            source.includes(`English contract law`),
  enAEDubaiInternetCity:    source.includes(`Dubai Internet City / DIC (the dominant tech free zone`),
  enAEDMCC:                 source.includes(`DMCC / Dubai Multi Commodities Centre (the largest UAE free zone`),
  enAEJAFZA:                source.includes(`JAFZA / Jebel Ali Free Zone (the oldest UAE free zone`),
  enAEAbuDhabiADGM:         source.includes(`Abu Dhabi (the capital`) &&
                            source.includes(`ADGM / Abu Dhabi Global Market`),
  enAESharjahConservative:  source.includes(`Sharjah (the third emirate`) &&
                            source.includes(`alcohol-free`),
  enAEFABLargest:           source.includes(`First Abu Dhabi Bank / FAB (the largest UAE bank by assets`),
  enAEEmiratesNBD:          source.includes(`Emirates NBD (Dubai government majority`),
  enAEDIBIslamicReference:  source.includes(`Dubai Islamic Bank / DIB (the world's first commercial Islamic bank founded 1975`),
  enAEMubadalaSovereign:    source.includes(`Mubadala Investment Company (Abu Dhabi sovereign wealth`),
  enAEADIA:                 source.includes(`ADIA / Abu Dhabi Investment Authority (the largest UAE sovereign fund`),
  enAEEmaarBurjKhalifa:     source.includes(`Emaar Properties (the largest UAE developer`) &&
                            source.includes(`Burj Khalifa`),
  enAEADNOC:                source.includes(`ADNOC / Abu Dhabi National Oil Company`),
  enAEEtisalatRebrand:      source.includes(`Etisalat / e& (the dominant UAE telco`) &&
                            source.includes(`rebranded e& in 2022`),
  enAEEtisalatPPF:          source.includes(`2022 acquisition of PPF Telecom CEE operations`),
  enAEEmiratesGroup:        source.includes(`Emirates Group (Emirates airline + dnata`),
  enAECareemUberAcq:        source.includes(`Careem (Dubai-founded super-app`) &&
                            source.includes(`Uber-acquired 2020 for $3.1B`),
  enAENoonMENA:             source.includes(`Noon (Mohamed Alabbar + PIF Saudi-backed e-commerce`),
  enAEAnghamiArabicSpotify: source.includes(`Anghami (Dubai-headquartered music streaming, the Arabic Spotify`),
  enAEFridaySaturdayWE:     source.includes(`UAE moved to Friday + Saturday weekend in 2022`),
  enAEIslamicRespect:       source.includes(`avoid pork / alcohol / religious-insensitive references in B2B`),
  enAERamadanNote:          source.includes(`respect Ramadan with shifted hours`),

  // en-SG
  enSGAdded:                source.includes(`"en-SG":\n    "Singapore English (en-SG;`),
  enSGRacialMix:            source.includes(`Chinese ~75%, Malay ~14%, Indian ~9%`),
  enSGEnglishLingua:        source.includes(`English is THE official business language`),
  enSGRoutesZhHans:         source.includes(`use zh-Hans via the zh block (existing SG -> zh-Hans mapping)`),
  enSGSinglishRule:         source.includes(`Singlish (Singapore colloquial English, also called Singaporean Vernacular English)`) &&
                            source.includes(`NEVER appropriate for B2B written outreach`),
  enSGSGDCurrency:          source.includes(`CURRENCY: SGD (Singapore Dollar`) &&
                            source.includes(`1 USD ~ 1.35 SGD`),
  enSGMASManagedFloat:      source.includes(`The Monetary Authority of Singapore / MAS manages a managed-float currency policy`),
  enSGRafflesCBD:           source.includes(`Raffles Place / Marina Bay / Shenton Way (the CBD`),
  enSGOneNorthBiotech:      source.includes(`One-North / Buona Vista (the tech R&D hub`) &&
                            source.includes(`A*STAR`),
  enSGPunggol2024:          source.includes(`Punggol Digital District (newer tech / digital cluster, opened 2024`),
  enSGDBSWorldsBestBank:    source.includes(`DBS Bank / Development Bank of Singapore`) &&
                            source.includes(`'World's Best Bank'`),
  enSGOCBCLee:              source.includes(`OCBC Bank / Oversea-Chinese Banking Corporation`) &&
                            source.includes(`Lee family historical heritage`),
  enSGUOBWeeCheonYaw:       source.includes(`UOB / United Overseas Bank`) &&
                            source.includes(`Wee Cho Yaw family heritage`),
  enSGTemasekControl:       source.includes(`Temasek Holdings (the commercial sovereign wealth fund, controller`),
  enSGGICLarger:            source.includes(`GIC / Government of Singapore Investment Corporation`) &&
                            source.includes(`larger sovereign fund by assets`),
  enSGMASRegulator:         source.includes(`MAS / Monetary Authority of Singapore (central bank + integrated financial regulator`),
  enSGIMDA:                 source.includes(`IMDA / Infocomm Media Development Authority`),
  enSGGovTech:              source.includes(`GovTech Singapore (digital government agency`) &&
                            source.includes(`Singpass`),
  enSGSingtelRegional:      source.includes(`Singtel / Singapore Telecommunications (Temasek-controlled`) &&
                            source.includes(`Optus Australia`) &&
                            source.includes(`Bharti Airtel India`),
  enSGKeppelSembcorp:       source.includes(`Keppel Corporation (Temasek-affiliated`) &&
                            source.includes(`Sembcorp Industries (Temasek-affiliated`),
  enSGCapitaLand:           source.includes(`CapitaLand Investment / CLI`),
  enSGPSAGlobalPort:        source.includes(`PSA International (Temasek-controlled port operator; the largest container port operator globally`),
  enSGWilmarKuok:           source.includes(`Wilmar International (Robert Kuok family`),
  enSGGrabSuperApp:         source.includes(`Grab Holdings (Singapore-HQ super-app`),
  enSGSeaLimited:           source.includes(`Sea Limited / Sea Group (Singapore-HQ; Garena gaming including Free Fire`),
  enSGRazer:                source.includes(`Razer (Singapore-founded gaming hardware`),
  enSGNinjaVan:             source.includes(`Ninja Van (logistics, Singapore-founded`),
  enSG11PublicHolidays:     source.includes(`Singapore has 11 public holidays reflecting all four major religions`),
  enSGFastB2B:              source.includes(`Singapore B2B is fast`),
  enSGPDPARegulatory:       source.includes(`MAS, IMDA, PDPA (data protection)`),

  // Untouched
  enBEUntouched:            source.includes(`"en-BE":\n    "Belgian English`),
  enNLUntouched:            source.includes(`"en-NL":\n    "Dutch B2B in English`),
  enUSUntouched:            source.includes(`"en-US":\n    "American English (en-US;`),
  enGBUntouched:            source.includes(`"en-GB":\n    "British English (en-GB;`),
  enINUntouched:            source.includes(`"en-IN":\n    "Indian English`),
  // Prior tier-3 unaffected
  thTHUntouched:            source.includes(`"th-TH":\n    "Thai-Thailand`),
  viVNUntouched:            source.includes(`"vi-VN":\n    "Vietnamese-Vietnam`),
  elGRUntouched:            source.includes(`"el-GR":\n    "Greek-Greece`),
  bgBGUntouched:            source.includes(`"bg-BG":\n    "Bulgarian-Bulgaria`),
  huHUUntouched:            source.includes(`"hu-HU":\n    "Hungarian-Hungary`),
  ruRUUntouched:            source.includes(`"ru-RU":\n    "Russian-Russia`),
  jaJPUntouched:            source.includes(`"ja-JP":\n    "Japanese-Japan`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  buildNativenessUntouched: source.includes(`export function buildNativenessBlock`),
};
console.log("[language-nativeness-en-ae-sg] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[language-nativeness-en-ae-sg] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[language-nativeness-en-ae-sg] DONE");
