#!/usr/bin/env node
/**
 * Ticket locale-tier3-bg-el, patch 2/3: services/messagePrompts.ts
 *
 * Two atomic edits in this file:
 *
 *   Edit 1 (BUG FIX): add the missing bare bg entry to GREETING_TABLE
 *     right after el. Without this, Bulgarian prospects fall back to
 *     the English default greeting — a silent fallback-to-English bug
 *     that this ticket explicitly fixes. The bg entry uses 'Здравейте,
 *     {NAME},' (Cyrillic formal greeting), matching the same
 *     register convention as the Russian/Ukrainian bare greetings.
 *
 *   Edit 2 (TIER-3 PROMOTION): append bg-BG and el-GR regional entries
 *     after the existing tier-3 hu-HU entry. Same template as prior
 *     CEE sweep tickets.
 *
 * Dependency: requires ticket-locale-tier3-ro-hu to have landed.
 * Idempotent. Anchors em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

// =================================================================
// Edit 1 - Fix the missing bare bg GREETING_TABLE entry
// =================================================================
//
// Anchor: the el line (currently the last entry in the European-
// language block, immediately before sw / Swahili). After applying,
// bg goes right between el and sw — alphabetical-ish ordering used
// in the file is loose, but bg fits naturally with el.

const E1_OLD = `  el: { withName: "Γεια σας, {NAME},", withoutName: "Γεια σας,", note: "" },`;

const E1_NEW = `  el: { withName: "Γεια σας, {NAME},", withoutName: "Γεια σας,", note: "" },
  bg: { withName: "Здравейте, {NAME},", withoutName: "Здравейте,", note: "" },`;

const E1_MARKER = `bg: { withName: "Здравейте, {NAME},"`;

// =================================================================
// Edit 2 - Append regional bg-BG and el-GR after tier-3 hu-HU
// =================================================================

const E2_OLD = `  "hu-HU": { withName: "Üdvözlöm, {NAME},", withoutName: "Üdvözlöm,", note: "Hungary. Hungarian B2B uses formal Ön register (Hungarian polite third-person, distinct from informal Te); never Te for cold outreach. Verbs conjugate to third-person singular even though addressing the recipient: 'Ön szeretne találkozni' (would you like to meet — Ön + 3rd person verb). 'Üdvözlöm, {NAME},' is the standard chat opening (formal-respectful, literally 'I greet'); 'Tisztelt {LastName} Úr,' / 'Tisztelt {LastName} Asszony,' is the most formal email-equivalent opener (Hungarian convention puts the family name BEFORE the given name in formal contexts — Tisztelt Nagy Úr for 'Mr. Nagy', with Hungarian-order family name first). 'Szia' / 'Helló' are informal-young; never for cold B2B. Currency HUF (Ft, forint): '1 234 567 Ft' (space thousands, comma decimal — though forint has effectively no fractional unit in B2B; no decimals needed). 'M Ft' (millió forint / million Ft) and 'Mrd Ft' (milliárd / billion Ft) are standard abbreviations. Diacritics: á, é, í, ó, ö, ő (with double-acute, a Hungarian-specific letter), ú, ü, ű (with double-acute). Get ő and ű right — they're Hungarian-distinct vs ó/ö and ú/ü. Cities: Budapest (the commercial / political center, ~1.7M city + ~3M metro; District V Belváros for traditional finance and government, District VI Terézváros, District XIII Újlipótváros and the Váci út corridor for modern offices and HQs, District IX Ferencváros for tech / startup, Buda hills for residential / consulting). Debrecen (~200K, eastern Hungary, second-largest, university and pharma — BMW factory under construction), Szeged (~160K, southern Hungary, pharma / chemicals), Miskolc (~150K, northern industrial), Pécs (~140K, southern university town), Győr (~130K, western Hungary, Audi factory). Peer brands - banking tier: OTP Bank (the dominant Hungarian bank, regional CEE presence, BUX-listed), MBH Bank (post-2023 merger of MKB, Budapest Bank, Takarékbank), K&H Bank (KBC Belgium subsidiary), Erste Bank Hungary, Raiffeisen Bank Hungary, UniCredit Hungary, CIB Bank (Intesa Sanpaolo). Industrial / state: MOL Group (oil and gas, BUX-listed, the largest Hungarian industrial company — also operates regionally in Slovakia, Croatia), MVM Group (state energy / nuclear / Paks), Magyar Telekom (telco, Deutsche Telekom — the dominant fixed and mobile operator), Yettel Hungary (formerly Telenor, PPF Group), Vodafone Hungary, Magyar Posta (state post). Manufacturing: Audi Hungaria Győr, Mercedes Kecskemét, BMW Debrecen (under construction), Suzuki Esztergom, Continental, Bosch Hungary. E-commerce / tech: eMAG Hungary (Romanian eMAG's Hungarian operation), Vatera (classifieds), Jófogás (classifieds), Wolt Hungary (Finnish), Bolt Hungary (Estonian), Foodpanda Hungary. Match peer tier to company sector." },
};`;

const E2_NEW = `  "hu-HU": { withName: "Üdvözlöm, {NAME},", withoutName: "Üdvözlöm,", note: "Hungary. Hungarian B2B uses formal Ön register (Hungarian polite third-person, distinct from informal Te); never Te for cold outreach. Verbs conjugate to third-person singular even though addressing the recipient: 'Ön szeretne találkozni' (would you like to meet — Ön + 3rd person verb). 'Üdvözlöm, {NAME},' is the standard chat opening (formal-respectful, literally 'I greet'); 'Tisztelt {LastName} Úr,' / 'Tisztelt {LastName} Asszony,' is the most formal email-equivalent opener (Hungarian convention puts the family name BEFORE the given name in formal contexts — Tisztelt Nagy Úr for 'Mr. Nagy', with Hungarian-order family name first). 'Szia' / 'Helló' are informal-young; never for cold B2B. Currency HUF (Ft, forint): '1 234 567 Ft' (space thousands, comma decimal — though forint has effectively no fractional unit in B2B; no decimals needed). 'M Ft' (millió forint / million Ft) and 'Mrd Ft' (milliárd / billion Ft) are standard abbreviations. Diacritics: á, é, í, ó, ö, ő (with double-acute, a Hungarian-specific letter), ú, ü, ű (with double-acute). Get ő and ű right — they're Hungarian-distinct vs ó/ö and ú/ü. Cities: Budapest (the commercial / political center, ~1.7M city + ~3M metro; District V Belváros for traditional finance and government, District VI Terézváros, District XIII Újlipótváros and the Váci út corridor for modern offices and HQs, District IX Ferencváros for tech / startup, Buda hills for residential / consulting). Debrecen (~200K, eastern Hungary, second-largest, university and pharma — BMW factory under construction), Szeged (~160K, southern Hungary, pharma / chemicals), Miskolc (~150K, northern industrial), Pécs (~140K, southern university town), Győr (~130K, western Hungary, Audi factory). Peer brands - banking tier: OTP Bank (the dominant Hungarian bank, regional CEE presence, BUX-listed), MBH Bank (post-2023 merger of MKB, Budapest Bank, Takarékbank), K&H Bank (KBC Belgium subsidiary), Erste Bank Hungary, Raiffeisen Bank Hungary, UniCredit Hungary, CIB Bank (Intesa Sanpaolo). Industrial / state: MOL Group (oil and gas, BUX-listed, the largest Hungarian industrial company — also operates regionally in Slovakia, Croatia), MVM Group (state energy / nuclear / Paks), Magyar Telekom (telco, Deutsche Telekom — the dominant fixed and mobile operator), Yettel Hungary (formerly Telenor, PPF Group), Vodafone Hungary, Magyar Posta (state post). Manufacturing: Audi Hungaria Győr, Mercedes Kecskemét, BMW Debrecen (under construction), Suzuki Esztergom, Continental, Bosch Hungary. E-commerce / tech: eMAG Hungary (Romanian eMAG's Hungarian operation), Vatera (classifieds), Jófogás (classifieds), Wolt Hungary (Finnish), Bolt Hungary (Estonian), Foodpanda Hungary. Match peer tier to company sector." },
  "bg-BG": { withName: "Здравейте, {NAME},", withoutName: "Здравейте,", note: "Bulgaria. Bulgarian B2B uses formal Вие (Cyrillic capitalized Vie, the polite second-person) register; never ти for cold outreach. 'Здравейте, {NAME},' is the standard chat opening; 'Уважаеми г-н {LastName},' / 'Уважаема г-жо {LastName},' is the most formal email-equivalent opener (gendered: г-н = gospodin Mr., г-жо = gospozho vocative form of Ms.). 'Здрасти' / 'Здрасти' / 'Чао' are informal; never for cold B2B. Currency BGN (лв., lev / leva plural): '1 234 567,89 лв.' (space thousands, comma decimal; 'лв.' suffix with space). Bulgaria is preparing for euro adoption (target 2026); some B2B contexts already dual-quote in EUR. Cities: София (Sofia, capital, ~1.2M city + ~1.7M metro; the commercial / political center; Mladost / Bulgaria Boulevard / Tsarigradsko shose for tech parks and modern offices, Lozenets / Iztok for premium business addresses), Пловдив (Plovdiv, ~340K, second-largest; manufacturing + IT outsourcing — Trakia Economic Zone), Варна (Varna, ~330K, Black Sea port and tourism + IT), Бургас (Burgas, ~200K, Black Sea port and petrochemical — Lukoil Neftohim Burgas), Русе (Ruse, ~150K, Danube port), Стара Загора (Stara Zagora, ~140K, industrial). Peer brands - banking tier: UniCredit Bulbank (UniCredit Italy subsidiary, the largest bank), DSK Bank (OTP Group Hungary, second-largest), Postbank / Eurobank Bulgaria (Eurobank Greece), Raiffeisenbank Bulgaria, KBC Bank Bulgaria (former CIBANK), Allianz Bank, Investbank, First Investment Bank / Fibank (one of few Bulgarian-owned). Industrial / state: Bulgargaz (state gas), Bulgartransgaz (state transmission), NEK (Natsionalna Elektricheska Kompaniya, state electricity), Kozloduy NPP (nuclear, state), Lukoil Neftohim Burgas (refinery, Russian Lukoil), Aurubis Bulgaria (copper, formerly KCM), Solvay Sodi (chemicals). Telco: Yettel Bulgaria (formerly Telenor BG, PPF Group), A1 Bulgaria (formerly Mtel, the dominant operator, A1 Telekom Austria), Vivacom (Bulgaria's national telco, United Group). Tech / digital-native: VMware Bulgaria (largest tech employer, multinational), HP Bulgaria, IBM Bulgaria, SAP Labs Bulgaria, Software Group, Telerik / Progress (Bulgarian-founded, US HQ as Progress Software — major Bulgarian tech success), Telerik Academy (training), Cloudpipes (formerly Loop), Bulpros, ScaleFocus, Modis Bulgaria. E-commerce: eMAG Bulgaria (Romanian eMAG's Bulgarian operation, the dominant e-commerce platform), Olx.bg (classifieds), Bazar.bg, Gloria (FMCG), Lidl Bulgaria, Kaufland Bulgaria. Match peer tier to company sector: banking for finance, state-industrial for energy/utilities, Telerik/VMware/SAP Labs for tech, eMAG for e-commerce." },
  "el-GR": { withName: "Γεια σας, {NAME},", withoutName: "Γεια σας,", note: "Greece. Greek B2B uses formal εσείς (esis, plural-formal second person) register; never εσύ (esy, informal singular) for cold outreach. 'Γεια σας, {NAME},' is the standard chat opening (literally 'health to you' plural-formal); 'Αξιότιμε κύριε {LastName},' / 'Αξιότιμη κυρία {LastName},' is the most formal email-equivalent opener (gendered: κύριε = kyrie Mr. vocative, κυρία = kyria Mrs.). 'Γεια σου' (singular informal) and 'Γεια!' / 'Χαίρετε' are informal; never for cold B2B. Currency EUR (€), with European separators: '€1.234.567,89' (period thousands, comma decimal — same as Italian/German/Spanish convention). 'εκ.' (ekatommyria / millions) or 'εκατομμύρια' spelled out, 'δισ.' (disekatommyria / billions) for larger amounts. Cities: Αθήνα (Athens, the commercial / political center; ~3.1M metro Attica region — the dominant Greek city by every B2B metric; Syntagma / Kolonaki / Vouliagmenis Avenue for traditional business, Marousi for tech / multinational HQs — comparable to a CEE tech-cluster city), Θεσσαλονίκη (Thessaloniki, the second-largest city, ~325K + ~1M metro; northern Greece commercial hub; Aristotle University; growing tech), Πάτρα (Patras, ~210K, western port), Ηράκλειο (Heraklion, ~140K, Crete tourism + university), Λάρισα (Larissa, ~150K, Thessaly agriculture). Peer brands - banking tier: Eurobank Holdings (Greek-listed, the largest by various metrics; subsidiary Postbank operates in Bulgaria), National Bank of Greece / NBG (state-influenced, Greek-listed), Alpha Bank (Greek-listed), Piraeus Bank / Piraeus Financial Holdings (Greek-listed). The four 'systemic' Greek banks are these four post-crisis consolidation. Industrial / state: Public Power Corporation / PPC / ΔΕΗ (state electricity, the dominant utility), DESFA (state gas transmission), Hellenic Petroleum / ELPE (the dominant refiner), Motor Oil Hellas (second refiner), Mytilineos Energy & Metals (BVB-listed conglomerate, energy + metals + concessions). Telco: OTE / Cosmote (Hellenic Telecommunications, Deutsche Telekom-owned — the dominant fixed and mobile), Vodafone Greece (acquired Wind Hellas 2024), Nova Greece (formerly Wind, United Group). Shipping is uniquely important for Greek B2B (Greek shipping is the largest global merchant fleet by tonnage; family-owned shipping houses are major B2B references): Angelicoussis Group, Tsakos Energy Navigation, Star Bulk, Diana Shipping, Costamare. E-commerce / tech: Skroutz (the dominant Greek price-comparison + marketplace, private), e-shop.gr (electronics e-commerce), Public.gr (retail / electronics), Plaisio (electronics), Wolt Greece (Finnish), efood (delivery, OTE-acquired then Delivery Hero context). Hotels / tourism: Astir Palace, Costa Navarino, Sani Resort (Greek tourism is a major sector, ~25% of GDP including indirect). Match peer tier to company sector: banking for finance, PPC/state-industrial for traditional, OTE/Vodafone for telco, Skroutz/Public for retail-tech, shipping families for maritime." },
};`;

const E2_MARKER = `"bg-BG": { withName: "Здравейте, {NAME},"`;

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

// Pre-flight: tier-3 hu-HU must be present
if (!source.includes(`"hu-HU": { withName: "Üdvözlöm, {NAME},"`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-ro-hu to have landed first");
  console.error("[FATAL] missing expected tier-3 hu-HU entry in GREETING_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["greeting-bare-bg-fix", E1_OLD, E1_NEW, E1_MARKER],
  ["greeting-bg-el-tier3", E2_OLD, E2_NEW, E2_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  // Edit 1: bare bg bug-fix
  bareBgAdded:              source.includes(`bg: { withName: "Здравейте, {NAME},", withoutName: "Здравейте,", note: "" },`),
  bareElUntouched:          source.includes(`el: { withName: "Γεια σας, {NAME},", withoutName: "Γεια σας,", note: "" },`),
  bareBgAfterEl:            source.includes(`el: { withName: "Γεια σας, {NAME},", withoutName: "Γεια σας,", note: "" },\n  bg: { withName: "Здравейте, {NAME},"`),

  // Edit 2: bg-BG content
  bgBGAdded:                source.includes(`"bg-BG": { withName: "Здравейте, {NAME},"`),
  bgBGFormalRegister:       source.includes(`formal Вие (Cyrillic capitalized Vie`) &&
                            source.includes(`never ти for cold outreach`),
  bgBGHasUvazaemiForm:      source.includes(`'Уважаеми г-н {LastName},' / 'Уважаема г-жо {LastName},'`),
  bgBGHasBGNCurrency:       source.includes(`Currency BGN (лв., lev / leva plural)`) &&
                            source.includes(`'1 234 567,89 лв.'`),
  bgBGEuroAdoptionNote:     source.includes(`Bulgaria is preparing for euro adoption (target 2026)`),
  bgBGHasSofia:             source.includes(`София (Sofia, capital`),
  bgBGHasPlovdivVarna:      source.includes(`Пловдив (Plovdiv`) && source.includes(`Варна (Varna`),
  bgBGHasBankTier:          source.includes(`UniCredit Bulbank (UniCredit Italy subsidiary, the largest bank)`) &&
                            source.includes(`DSK Bank (OTP Group Hungary`),
  bgBGHasTelerikSuccess:    source.includes(`Telerik / Progress (Bulgarian-founded, US HQ as Progress Software — major Bulgarian tech success)`),
  bgBGHasEMAGBulgaria:      source.includes(`eMAG Bulgaria (Romanian eMAG's Bulgarian operation`),

  // Edit 2: el-GR content
  elGRAdded:                source.includes(`"el-GR": { withName: "Γεια σας, {NAME},"`),
  elGRFormalRegister:       source.includes(`formal εσείς (esis, plural-formal second person)`) &&
                            source.includes(`never εσύ (esy, informal singular) for cold outreach`),
  elGRHasAxiotimeForm:      source.includes(`'Αξιότιμε κύριε {LastName},' / 'Αξιότιμη κυρία {LastName},'`),
  elGRHasEURCurrency:       source.includes(`Currency EUR (€)`) &&
                            source.includes(`'€1.234.567,89'`),
  elGRHasAthens:            source.includes(`Αθήνα (Athens, the commercial / political center`),
  elGRHasThessaloniki:      source.includes(`Θεσσαλονίκη (Thessaloniki, the second-largest city`),
  elGRHasFourBanks:         source.includes(`Eurobank Holdings`) &&
                            source.includes(`National Bank of Greece / NBG`) &&
                            source.includes(`Alpha Bank`) &&
                            source.includes(`Piraeus Bank / Piraeus Financial Holdings`),
  elGRSystemicNote:         source.includes(`The four 'systemic' Greek banks are these four post-crisis consolidation`),
  elGRHasPPC:               source.includes(`Public Power Corporation / PPC / ΔΕΗ`),
  elGRShippingNote:         source.includes(`Shipping is uniquely important for Greek B2B`) &&
                            source.includes(`Angelicoussis Group`) &&
                            source.includes(`Tsakos Energy Navigation`),
  elGRHasSkroutz:           source.includes(`Skroutz (the dominant Greek price-comparison + marketplace`),

  // Untouched / regression
  bareElUntouchedFinal:     source.includes(`el: { withName: "Γεια σας, {NAME},", withoutName: "Γεια σας,", note: "" },`),
  huHUUntouched:            source.includes(`"hu-HU": { withName: "Üdvözlöm, {NAME},"`),
  roROUntouched:            source.includes(`"ro-RO": { withName: "Bună ziua, {NAME},"`),
  csCZUntouched:            source.includes(`"cs-CZ": { withName: "Dobrý den, {NAME},"`),
  ukUAUntouched:            source.includes(`"uk-UA": { withName: "Вітаю, {NAME},"`),
  idIDUntouched:            source.includes(`"id-ID": { withName: "Selamat pagi, Bapak/Ibu {NAME},"`),
  ruRUUntouched:            source.includes(`"ru-RU": { withName: "Здравствуйте, {NAME},"`),
  plPLUntouched:            source.includes(`"pl-PL": { withName: "Dzień dobry, {NAME},"`),
  itITUntouched:            source.includes(`"it-IT": { withName: "Salve {NAME},"`),
  trTRUntouched:            source.includes(`"tr-TR": { withName: "Merhaba {NAME},"`),
  heILUntouched:            source.includes(`"he-IL": { withName: "שלום {NAME},"`),
  koKRUntouched:            source.includes(`"ko-KR": { withName: "{NAME} 님,"`),
  jaJPUntouched:            source.includes(`"ja-JP": { withName: "{NAME}様、"`),
  hiINUntouched:            source.includes(`"hi-IN": { withName: "Namaste {NAME},"`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  ptBRUntouched:            source.includes(`"pt-BR": { withName: "Olá {NAME},"`),
  deCHUntouched:            source.includes(`"de-CH": { withName: "Guten Tag {NAME},"`),
};
console.log("[message-prompts-bg-el] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[message-prompts-bg-el] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[message-prompts-bg-el] DONE");
