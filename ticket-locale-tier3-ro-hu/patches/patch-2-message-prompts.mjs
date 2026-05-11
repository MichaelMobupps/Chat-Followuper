#!/usr/bin/env node
/**
 * Ticket locale-tier3-ro-hu, patch 2/3: services/messagePrompts.ts
 *
 * One atomic edit: append ro-RO and hu-HU entries to GREETING_TABLE,
 * after the existing cs-CZ entry.
 *
 * Notes on greeting forms:
 *   ro-RO: Inherits the bare-ro form ("Bună ziua, {NAME},"). The
 *          regional entry adds formal dumneavoastră register notes
 *          (Romanian polite second person, mandatory for cold),
 *          RON (lei) formatting with European separators, Bucharest /
 *          Cluj / Iasi / Timisoara city tier, Romanian diacritics
 *          enforcement (ă, â, î, ș, ț), peer brands (Banca
 *          Transilvania, BCR, BRD vs eMAG, OLX, Glovo vs Orange
 *          Romania, Vodafone, Telekom).
 *
 *   hu-HU: Inherits the bare-hu form ("Üdvözlöm, {NAME},"). The
 *          regional entry adds formal Ön register (Hungarian polite
 *          third person — distinct from Te informal), HUF (Ft)
 *          formatting with space thousands, Budapest district detail
 *          (V/VI/XIII for business), Hungarian diacritics (á, é, í,
 *          ó, ö, ő, ú, ü, ű), peer brands (OTP Bank, MOL, MVM vs
 *          Wizz Air, Magyar Telekom vs eMAG Hungary, Wolt, Bolt).
 *
 * Dependency: requires ticket-locale-tier3-uk-cs to have landed
 * (anchor expects cs-CZ as last entry in GREETING_TABLE).
 *
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

const E1_OLD = `  "cs-CZ": { withName: "Dobrý den, {NAME},", withoutName: "Dobrý den,", note: "Czech Republic / Czechia. Czech B2B uses formal Vy (capitalized in correspondence; lowercase vy acceptable on chat) register; never ty for cold outreach. 'Dobrý den, {NAME},' is the standard chat opening and works through the day. 'Vážený pane {LastName},' / 'Vážená paní {LastName},' is the most formal email-equivalent opener (gendered: pane for male, paní for female). 'Ahoj' / 'Čau' are informal-young; never for cold B2B. Currency CZK (Kč), with space thousands and comma decimal: '1 234 567,89 Kč' (European-style separators; Kč symbol after amount with space). 'mil.' (million) and 'mld.' (miliarda / billion) are common abbreviations; full numerals for formal B2B. Cities: Praha (Prague, the commercial / political center; ~1.3M city + ~2.7M metro; finance, enterprise, multinational HQs; Karlín / Smíchov / Pankrác for tech and modern offices; Old Town for traditional business), Brno (~380K, second-largest, the secondary tech hub — Red Hat, IBM Brno, AVG / Avast originally), Ostrava (~280K, industrial / mining / heavy industry, Moravian-Silesian Region), Plzeň (~170K, automotive / Škoda Transportation, Pilsner Urquell brewery), Olomouc (~100K, R&D / pharma), Liberec, České Budějovice. Peer brands - enterprise / banking tier: Česká spořitelna (Erste Group, the largest retail bank), ČSOB (KBC Bank Belgium subsidiary), Komerční banka (KB, Société Générale subsidiary), Moneta Money Bank, UniCredit Bank Czech Republic, Raiffeisenbank ČR, Air Bank (PPF), Fio banka, J&T Banka. Industrial / state: Škoda Auto (VW Group, automotive), Škoda Transportation (separate company, trains / trams), ČEZ Group (state-controlled electricity utility, the dominant Czech utility), Innogy / Net4Gas, O2 Czech Republic (telco, fixed and mobile), T-Mobile Czech Republic, Vodafone Czech Republic. Retail / FMCG: Albert (Ahold Delhaize, the largest supermarket chain), Tesco Stores ČR, Kaufland (Schwarz Group), Lidl ČR, Penny Market, Globus, dm drogerie, Rossmann. E-commerce / tech: Alza.cz (the dominant Czech e-commerce platform, comparable to Allegro / Rozetka regional dominance), Mall.cz (now part of Allegro group), Rohlík (online grocery, the dominant Czech model — also expanded to DACH and beyond), Heureka (price comparison), Slevomat (deals), Avast (security, originally Czech, now Gen Digital after NortonLifeLock merger), AVG (also Avast / Gen Digital), Productboard (US HQ Czech roots), Kiwi.com (travel meta-search), Dáme jídlo (food delivery, Delivery Hero), Wolt Czechia (Finnish but heavy CZ presence). Note: Czech B2B tone is reserved and pragmatic; over-enthusiasm or American-style hype reads as foreign-template. Match peer tier to prospect's company: enterprise / banking for finance, industrial for traditional manufacturing, e-commerce / tech for SaaS / digital." },
};`;

const E1_NEW = `  "cs-CZ": { withName: "Dobrý den, {NAME},", withoutName: "Dobrý den,", note: "Czech Republic / Czechia. Czech B2B uses formal Vy (capitalized in correspondence; lowercase vy acceptable on chat) register; never ty for cold outreach. 'Dobrý den, {NAME},' is the standard chat opening and works through the day. 'Vážený pane {LastName},' / 'Vážená paní {LastName},' is the most formal email-equivalent opener (gendered: pane for male, paní for female). 'Ahoj' / 'Čau' are informal-young; never for cold B2B. Currency CZK (Kč), with space thousands and comma decimal: '1 234 567,89 Kč' (European-style separators; Kč symbol after amount with space). 'mil.' (million) and 'mld.' (miliarda / billion) are common abbreviations; full numerals for formal B2B. Cities: Praha (Prague, the commercial / political center; ~1.3M city + ~2.7M metro; finance, enterprise, multinational HQs; Karlín / Smíchov / Pankrác for tech and modern offices; Old Town for traditional business), Brno (~380K, second-largest, the secondary tech hub — Red Hat, IBM Brno, AVG / Avast originally), Ostrava (~280K, industrial / mining / heavy industry, Moravian-Silesian Region), Plzeň (~170K, automotive / Škoda Transportation, Pilsner Urquell brewery), Olomouc (~100K, R&D / pharma), Liberec, České Budějovice. Peer brands - enterprise / banking tier: Česká spořitelna (Erste Group, the largest retail bank), ČSOB (KBC Bank Belgium subsidiary), Komerční banka (KB, Société Générale subsidiary), Moneta Money Bank, UniCredit Bank Czech Republic, Raiffeisenbank ČR, Air Bank (PPF), Fio banka, J&T Banka. Industrial / state: Škoda Auto (VW Group, automotive), Škoda Transportation (separate company, trains / trams), ČEZ Group (state-controlled electricity utility, the dominant Czech utility), Innogy / Net4Gas, O2 Czech Republic (telco, fixed and mobile), T-Mobile Czech Republic, Vodafone Czech Republic. Retail / FMCG: Albert (Ahold Delhaize, the largest supermarket chain), Tesco Stores ČR, Kaufland (Schwarz Group), Lidl ČR, Penny Market, Globus, dm drogerie, Rossmann. E-commerce / tech: Alza.cz (the dominant Czech e-commerce platform, comparable to Allegro / Rozetka regional dominance), Mall.cz (now part of Allegro group), Rohlík (online grocery, the dominant Czech model — also expanded to DACH and beyond), Heureka (price comparison), Slevomat (deals), Avast (security, originally Czech, now Gen Digital after NortonLifeLock merger), AVG (also Avast / Gen Digital), Productboard (US HQ Czech roots), Kiwi.com (travel meta-search), Dáme jídlo (food delivery, Delivery Hero), Wolt Czechia (Finnish but heavy CZ presence). Note: Czech B2B tone is reserved and pragmatic; over-enthusiasm or American-style hype reads as foreign-template. Match peer tier to prospect's company: enterprise / banking for finance, industrial for traditional manufacturing, e-commerce / tech for SaaS / digital." },
  "ro-RO": { withName: "Bună ziua, {NAME},", withoutName: "Bună ziua,", note: "Romania. Romanian B2B uses formal dumneavoastră register (Romanian polite second person, often abbreviated dvs. in writing); never tu for cold outreach. 'Bună ziua, {NAME},' is the standard chat opening; 'Stimate domnule {LastName},' / 'Stimată doamnă {LastName},' is the most formal email-equivalent opener (gendered: domnule for male, doamnă for female). 'Salut' / 'Bună' are informal-young; never for cold B2B. Currency RON (lei, plural lei; symbol L not standard so 'lei' suffix preferred): '1.234.567,89 lei' (European-style period thousands, comma decimal). 'mil.' (milioane / million) and 'mld.' (miliarde / billion) for larger amounts. Diacritics matter: ă (a-breve), â (a-circumflex), î (i-circumflex), ș (s-comma, NOT s-cedilla), ț (t-comma, NOT t-cedilla — Romanian uses the comma-below diacritic specifically, distinct from Turkish). Cities: București (Bucharest, the commercial / political center, ~2M; CBD around Calea Victoriei / Aviatorilor / Floreasca / Pipera tech park), Cluj-Napoca (Cluj, ~325K, the dominant Romanian tech hub — UBB / Universitatea Babeș-Bolyai, large UiPath / Bitdefender / Endava engineering presence), Timișoara (~320K, western Banat manufacturing + tech, Continental, Hella, Flex), Iași (~290K, eastern Moldavia academic + IT, Iași university and Amazon center), Constanța (~280K, Black Sea port and logistics), Brașov (~250K, Transylvania manufacturing + tourism), Sibiu (~150K, Saxon-heritage manufacturing). Peer brands - banking tier: Banca Transilvania (the largest Romanian bank, listed BVB), BCR (Banca Comercială Română, Erste Group), BRD (BRD-Groupe Société Générale), Raiffeisen Bank România, ING Bank România, UniCredit Bank România, CEC Bank (state). Industrial / state: OMV Petrom (the largest Romanian company by revenue, OMV Austria), Hidroelectrica (state hydropower, recently IPO'd), Romgaz (state gas), Nuclearelectrica (state nuclear), Electrica, Engie Romania, Distrigaz. Telco: Orange Romania, Vodafone Romania, Telekom Romania (Hellenic OTE then Orange acquisition), Digi / RCS&RDS (DIGI Communications). E-commerce / tech: eMAG (THE dominant Romanian e-commerce platform, Naspers / Prosus), OLX Romania (classifieds), Glovo Romania (delivery), Bolt Romania (mobility), UiPath (Romanian-founded RPA unicorn, NYSE-listed PATH — the biggest Romanian tech success), Bitdefender (security, Romanian-founded), Endava (Romanian engineering presence, NYSE-listed DAVA). Match peer tier: banking for finance, OMV Petrom/state for traditional, eMAG/UiPath/Bitdefender for tech." },
  "hu-HU": { withName: "Üdvözlöm, {NAME},", withoutName: "Üdvözlöm,", note: "Hungary. Hungarian B2B uses formal Ön register (Hungarian polite third-person, distinct from informal Te); never Te for cold outreach. Verbs conjugate to third-person singular even though addressing the recipient: 'Ön szeretne találkozni' (would you like to meet — Ön + 3rd person verb). 'Üdvözlöm, {NAME},' is the standard chat opening (formal-respectful, literally 'I greet'); 'Tisztelt {LastName} Úr,' / 'Tisztelt {LastName} Asszony,' is the most formal email-equivalent opener (Hungarian convention puts the family name BEFORE the given name in formal contexts — Tisztelt Nagy Úr for 'Mr. Nagy', with Hungarian-order family name first). 'Szia' / 'Helló' are informal-young; never for cold B2B. Currency HUF (Ft, forint): '1 234 567 Ft' (space thousands, comma decimal — though forint has effectively no fractional unit in B2B; no decimals needed). 'M Ft' (millió forint / million Ft) and 'Mrd Ft' (milliárd / billion Ft) are standard abbreviations. Diacritics: á, é, í, ó, ö, ő (with double-acute, a Hungarian-specific letter), ú, ü, ű (with double-acute). Get ő and ű right — they're Hungarian-distinct vs ó/ö and ú/ü. Cities: Budapest (the commercial / political center, ~1.7M city + ~3M metro; District V Belváros for traditional finance and government, District VI Terézváros, District XIII Újlipótváros and the Váci út corridor for modern offices and HQs, District IX Ferencváros for tech / startup, Buda hills for residential / consulting). Debrecen (~200K, eastern Hungary, second-largest, university and pharma — BMW factory under construction), Szeged (~160K, southern Hungary, pharma / chemicals), Miskolc (~150K, northern industrial), Pécs (~140K, southern university town), Győr (~130K, western Hungary, Audi factory). Peer brands - banking tier: OTP Bank (the dominant Hungarian bank, regional CEE presence, BUX-listed), MBH Bank (post-2023 merger of MKB, Budapest Bank, Takarékbank), K&H Bank (KBC Belgium subsidiary), Erste Bank Hungary, Raiffeisen Bank Hungary, UniCredit Hungary, CIB Bank (Intesa Sanpaolo). Industrial / state: MOL Group (oil and gas, BUX-listed, the largest Hungarian industrial company — also operates regionally in Slovakia, Croatia), MVM Group (state energy / nuclear / Paks), Magyar Telekom (telco, Deutsche Telekom — the dominant fixed and mobile operator), Yettel Hungary (formerly Telenor, PPF Group), Vodafone Hungary, Magyar Posta (state post). Manufacturing: Audi Hungaria Győr, Mercedes Kecskemét, BMW Debrecen (under construction), Suzuki Esztergom, Continental, Bosch Hungary. E-commerce / tech: eMAG Hungary (Romanian eMAG's Hungarian operation), Vatera (classifieds), Jófogás (classifieds), Wolt Hungary (Finnish), Bolt Hungary (Estonian), Foodpanda Hungary. Match peer tier to company sector." },
};`;

const E1_MARKER = `"ro-RO": { withName: "Bună ziua, {NAME},"`;

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

if (!source.includes(`"cs-CZ": { withName: "Dobrý den, {NAME},"`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-uk-cs to have landed first");
  console.error("[FATAL] missing expected tier-3 cs-CZ entry in GREETING_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["greeting-ro-hu-add", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  // ro-RO
  roROAdded:                source.includes(`"ro-RO": { withName: "Bună ziua, {NAME},"`),
  roROFormalRegister:       source.includes(`formal dumneavoastră register`) &&
                            source.includes(`never tu for cold outreach`),
  roROHasStimateForm:       source.includes(`'Stimate domnule {LastName},' / 'Stimată doamnă {LastName},'`),
  roRORejectsSalut:         source.includes(`'Salut' / 'Bună' are informal-young`),
  roROHasRONCurrency:       source.includes(`Currency RON (lei`) &&
                            source.includes(`'1.234.567,89 lei'`),
  roRODiacriticsNote:       source.includes(`ș (s-comma, NOT s-cedilla)`) &&
                            source.includes(`ț (t-comma, NOT t-cedilla`),
  roROHasBucharestCluj:     source.includes(`București (Bucharest`) &&
                            source.includes(`Cluj-Napoca (Cluj`) &&
                            source.includes(`the dominant Romanian tech hub`),
  roROHasTimisoaraIasi:     source.includes(`Timișoara`) && source.includes(`Iași`),
  roROHasBankTier:          source.includes(`Banca Transilvania (the largest Romanian bank`) &&
                            source.includes(`BCR (Banca Comercială Română, Erste Group)`) &&
                            source.includes(`BRD (BRD-Groupe Société Générale)`),
  roROHasOMVPetrom:         source.includes(`OMV Petrom`),
  roROHasTelco:             source.includes(`Orange Romania`) && source.includes(`Vodafone Romania`) &&
                            source.includes(`Digi / RCS&RDS`),
  roROHasEMAG:              source.includes(`eMAG (THE dominant Romanian e-commerce platform`),
  roROHasUiPath:            source.includes(`UiPath (Romanian-founded RPA unicorn`),
  roROHasBitdefender:       source.includes(`Bitdefender (security, Romanian-founded)`),
  // hu-HU
  huHUAdded:                source.includes(`"hu-HU": { withName: "Üdvözlöm, {NAME},"`),
  huHUFormalOnRegister:     source.includes(`formal Ön register`) &&
                            source.includes(`distinct from informal Te`) &&
                            source.includes(`never Te for cold outreach`),
  huHUHasTiszteltForm:      source.includes(`'Tisztelt {LastName} Úr,' / 'Tisztelt {LastName} Asszony,'`),
  huHUNameOrderNote:        source.includes(`Hungarian convention puts the family name BEFORE the given name`),
  huHURejectsSzia:          source.includes(`'Szia' / 'Helló' are informal-young`),
  huHUHasHUFCurrency:       source.includes(`Currency HUF (Ft, forint)`) &&
                            source.includes(`1 234 567 Ft`),
  huHUDiacriticsONote:      source.includes(`ő (with double-acute, a Hungarian-specific letter)`) &&
                            source.includes(`ű (with double-acute)`),
  huHUHasBudapestDistricts: source.includes(`District V Belváros`) &&
                            source.includes(`Váci út corridor`),
  huHUHasDebrecenBMW:       source.includes(`BMW factory under construction`),
  huHUHasOTPBank:           source.includes(`OTP Bank (the dominant Hungarian bank`),
  huHUHasMOLGroup:          source.includes(`MOL Group (oil and gas`),
  huHUHasMagyarTelekom:     source.includes(`Magyar Telekom (telco, Deutsche Telekom`),
  huHUHasAudiGyor:          source.includes(`Audi Hungaria Győr`),
  huHUHasMercedesKecskemet: source.includes(`Mercedes Kecskemét`),
  // Untouched
  bareRoUntouched:          source.includes(`ro: { withName: "Bună ziua, {NAME},", withoutName: "Bună ziua,", note: "" },`),
  bareHuUntouched:          source.includes(`hu: { withName: "Üdvözlöm, {NAME},", withoutName: "Üdvözlöm,", note: "" },`),
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
console.log("[message-prompts-ro-hu] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[message-prompts-ro-hu] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[message-prompts-ro-hu] DONE");
