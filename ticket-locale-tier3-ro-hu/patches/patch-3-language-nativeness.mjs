#!/usr/bin/env node
/**
 * Ticket locale-tier3-ro-hu, patch 3/3: lib/languageNativeness.ts
 *
 * One atomic edit: append ro-RO and hu-HU entries to the tier-3 GUIDES
 * block, after the existing cs-CZ entry.
 *
 * Dependency: requires ticket-locale-tier3-uk-cs.
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/languageNativeness.ts",
);

const E1_OLD = `    "TONE: reserved, pragmatic, understated. Czech B2B values: precise language, concrete numbers, technical accuracy, and avoiding over-enthusiasm. Czech business culture is closer to German / Austrian norms than to Mediterranean or Anglo-Saxon — directness without American-style hype, respect for expertise and titles, slight skepticism toward marketing claims. Avoid hype words ('revoluční' without source, 'jedinečný' / 'unikátní' without justification, 'lídr trhu' without numbers) which read as advertising. Czech B2B writers often signal qualifications (e.g., 'do určité míry' / 'to some extent') where Anglo-Saxon writers would use stronger claims; matching this register reads as Czech-native. Sign-offs: 'S pozdravem,' (formal standard, the most common B2B sign-off — literally 'With greeting'), 'S úctou,' (more formal, 'With respect' — for very serious correspondence), 'Pěkný den,' ('Have a nice day', warm but professional, common in modern B2B chat). Match sign-off to opening: 'Vážený pane / Vážená paní' pairs with 'S pozdravem,' or 'S úctou,'; 'Dobrý den' pairs with 'S pozdravem,' or 'Pěkný den,'.",
};`;

const E1_NEW = `    "TONE: reserved, pragmatic, understated. Czech B2B values: precise language, concrete numbers, technical accuracy, and avoiding over-enthusiasm. Czech business culture is closer to German / Austrian norms than to Mediterranean or Anglo-Saxon — directness without American-style hype, respect for expertise and titles, slight skepticism toward marketing claims. Avoid hype words ('revoluční' without source, 'jedinečný' / 'unikátní' without justification, 'lídr trhu' without numbers) which read as advertising. Czech B2B writers often signal qualifications (e.g., 'do určité míry' / 'to some extent') where Anglo-Saxon writers would use stronger claims; matching this register reads as Czech-native. Sign-offs: 'S pozdravem,' (formal standard, the most common B2B sign-off — literally 'With greeting'), 'S úctou,' (more formal, 'With respect' — for very serious correspondence), 'Pěkný den,' ('Have a nice day', warm but professional, common in modern B2B chat). Match sign-off to opening: 'Vážený pane / Vážená paní' pairs with 'S pozdravem,' or 'S úctou,'; 'Dobrý den' pairs with 'S pozdravem,' or 'Pěkný den,'.",

  "ro-RO":
    "Romanian-Romania (ro-RO): Romania is the primary Romanian B2B adtech market. The base Romanian (ro) guide covers HEAVY localization with term conversions (retention>retenție, install>instalare, conversion>conversie, targeting>direcționare/targetare, traffic>trafic, fraud>fraudă, creatives>creativuri/reclame, lookalike>publicuri similare, cohort>cohortă); that all still applies. This regional entry adds Romania-specific city, currency, peer-brand, register, and tone depth on top of the base ro guide. " +
    "REGISTER LAYERS: Romanian B2B uses formal dumneavoastră (literally 'your lordship', the Romanian polite second-person address — analogous to French vous or Spanish usted but more layered); often abbreviated dvs. in writing. Never tu for cold B2B. Verbs conjugate to second-person plural even when addressing a single person: 'aș dori să vă propun' (I would like to propose to you). The dumneata register (intermediate between dumneavoastră formal and tu informal) exists but is uncommon in modern B2B; dumneavoastră is the safe formal default. " +
    "GREETING REGISTERS: " +
    "'Bună ziua, {NAME},' — standard chat opening, 'Good day'; works through the day. " +
    "'Bună dimineața, {NAME},' — morning specifically (~05:00-11:00). " +
    "'Bună seara, {NAME},' — evening (~18:00 onwards). " +
    "'Stimate domnule {LastName},' / 'Stimată doamnă {LastName},' — most formal, email-equivalent (gendered). " +
    "'Salut' / 'Bună' — informal-young; NEVER for cold B2B. " +
    "ORTHOGRAPHY: Romanian Latin script with five diacritic letters: ă (a-breve, e.g., 'tânără'), â (a-circumflex, only in specific positions, e.g., 'român'), î (i-circumflex, e.g., 'începe'), ș (s-comma-below — NOT s-cedilla; Romanian uses the comma-below diacritic specifically, distinct from Turkish ş with cedilla), ț (t-comma-below — also NOT t-cedilla; same comma-below diacritic as ș). Get these right; using Turkish ş/ţ-cedilla instead of Romanian ș/ț-comma is a common foreign-template error. Numbers use European convention: period as thousands separator, comma as decimal: '1.234.567,89'. Percentages use % symbol (12%). " +
    "CURRENCY: RON (lei is plural; 1 leu, 2-19 lei, then 20+ de lei with prepositional 'de'; symbol is 'lei' as suffix — no widely-adopted glyph): '1.234.567,89 lei' for formal documents. 'mil. lei' (million lei) and 'mld. lei' (billion lei) for larger amounts. Some Romanian B2B contexts dual-quote in EUR due to EU integration; both are normal. " +
    "CITY/MARKET REFERENCES: " +
    "București (Bucharest, the commercial / political center; ~2M city + ~2.4M metro; finance, enterprise, multinational HQs, government. Calea Victoriei for historical finance, Aviatorilor / Charles de Gaulle area for embassies and premium offices, Floreasca for finance towers, Pipera tech park for tech / outsourcing — comparable to Brno or Krakow as a tech-cluster destination). " +
    "Cluj-Napoca (~325K, THE dominant Romanian tech hub — Universitatea Babeș-Bolyai / UBB tech transfer; large UiPath engineering presence, Bitdefender Cluj, Endava, Bosch, Emerson; the Romanian Silicon Valley equivalent). " +
    "Timișoara (~320K, western Banat; manufacturing — Continental Automotive, Hella, Flex / Flextronics; also growing IT). " +
    "Iași (~290K, eastern Moldavia region; academic — Universitatea Alexandru Ioan Cuza; large Amazon center, Continental, NTT). " +
    "Constanța (~280K, Black Sea port / logistics; Lukoil refinery historically). " +
    "Brașov (~250K, Transylvania; manufacturing — auto suppliers, IAR-Brașov aerospace, tourism). " +
    "Sibiu (~150K, Saxon-heritage manufacturing — Continental, NSG, Marquardt). " +
    "Oradea (~200K, Hungarian-adjacent western border; logistics + manufacturing). " +
    "PEER BRANDS by tier: " +
    "Banking tier: Banca Transilvania (BT, the largest Romanian bank by assets and the dominant domestic-owned bank; BVB-listed; Cluj-headquartered), BCR (Banca Comercială Română, Erste Group Austria — second-largest by assets), BRD (BRD-Groupe Société Générale, third-largest), Raiffeisen Bank România, ING Bank România, UniCredit Bank România, CEC Bank (state, traditional retail), EximBank (state, export). Most Romanian banks except BT are foreign-European-owned. " +
    "Industrial / state tier: OMV Petrom (the largest Romanian company by revenue — OMV Austria controls; integrated oil/gas), Hidroelectrica (state hydropower, IPO 2023 — second-largest BVB listing), Romgaz (state gas, BVB-listed), Nuclearelectrica (state nuclear / Cernavodă), Electrica (electricity distribution), Engie Romania (gas distribution), Transgaz, Transelectrica (state transmission). Steel: ArcelorMittal Galați (formerly Sidex), Alro (aluminum). " +
    "Telco / mobile: Orange Romania (the dominant mobile operator post-2024 Telekom Romania acquisition — Orange now controls both Orange and former Telekom infrastructure), Vodafone Romania, Digi / RCS&RDS (DIGI Communications, BVB and BVB-listed; the dominant cable + internet provider, expanded to Italy, Spain, Portugal under Digi Mobil brand). " +
    "Retail / FMCG tier: Kaufland Romania (Schwarz Group, the largest by store revenue), Lidl Romania, Carrefour Romania, Auchan Romania, Mega Image (Ahold Delhaize, mainly Bucharest), Profi (now Mid Europa-acquired then Ahold), Penny Romania. " +
    "E-commerce / tech tier: eMAG (THE dominant Romanian e-commerce platform — Naspers / Prosus owned, also operates in Hungary, Bulgaria, Poland; the Amazon-equivalent of Romania), OLX Romania (classifieds, Prosus), Cărturești (books/lifestyle retail), Glovo Romania (delivery), Bolt Romania (mobility), FAN Courier (logistics, dominant Romanian parcel-delivery). " +
    "Romanian tech success stories (the international wins): UiPath (Romanian-founded by Daniel Dines / Marius Tîrcă, NYSE-listed PATH, the RPA market leader and the most internationally successful Romanian tech company — every Romanian B2B reflexively knows this), Bitdefender (cybersecurity, Romanian-founded by Florin Talpeș, private), Endava (NYSE-listed DAVA, software engineering, large Romania presence), Druid (conversational AI), FintechOS, Typing DNA, Frisbo. " +
    "Match peer tier to prospect's company: banking for finance, OMV Petrom / state for traditional industrial, eMAG / Digi for retail / telecom, UiPath / Bitdefender / Endava for tech / SaaS. " +
    "TONE: warm-formal, slightly more relational than Czech / German but more formal than Italian. Romanian B2B values: clear professional respect via dumneavoastră throughout, explicit acknowledgment of the prospect's company / role, concrete deliverables, and avoiding both American-style hype and excessive bureaucratic formality. The Romanian language has stronger inflection than its Latin-cousin neighbors; precise grammar matters. Avoid hype words ('revoluționar' without source, 'lider de piață' without numbers, 'unic') which read as advertising. Sign-offs: 'Cu stimă,' (formal standard, the most common B2B sign-off — literally 'With esteem'), 'Cu respect,' (more formal alternative), 'Cu considerație,' (very formal — 'With consideration'), 'O zi bună,' ('Have a good day', warmer modern B2B chat). Match sign-off to opening: 'Stimate domnule / Stimată doamnă' opening pairs with 'Cu stimă,' or 'Cu considerație,'; 'Bună ziua' pairs with 'Cu stimă,' or 'O zi bună,'.",

  "hu-HU":
    "Hungarian-Hungary (hu-HU): Hungary is the only major Hungarian B2B adtech market. The base Hungarian (hu) guide covers HEAVY localization (Hungarian is a Finno-Ugric language unrelated to Indo-European neighbors, with extensive agglutination and case marking that affects how loanwords integrate); that still applies. This regional entry adds Hungary-specific city, currency, peer-brand, register, and Hungarian-name-order awareness on top of the base hu guide. " +
    "CRITICAL HUNGARIAN NAME-ORDER NOTE: Hungarian convention puts the FAMILY NAME BEFORE the given name in Hungarian-language contexts. 'Nagy János' is the Hungarian-order form of 'János Nagy' (literally 'Nagy John' in English ordering). When writing to Hungarian prospects in Hungarian, use Hungarian-order if known: 'Tisztelt Nagy Úr,' (Mr. Nagy) with Nagy as the family name. When writing in English to the same person, the convention reverses: 'Dear Mr. Nagy,'. Most CRM data stores Hungarian names in Western order; flagging the family name correctly matters. Many Hungarians use Western order externally for business cards, email signatures, and LinkedIn (e.g., 'János Nagy'), so the source of the name matters: if from a Hungarian-language source, family name is first; if from a Western context, given name is first. " +
    "REGISTER LAYERS: Hungarian B2B uses formal Ön (polite third-person singular pronoun, capitalized in correspondence). The verb conjugates to third-person singular even though Ön refers to the recipient directly: 'Ön szeretne találkozni?' (Would you [Ön] like [3rd-person verb] to meet?). This is structurally similar to Spanish usted or German Sie but with third-person agreement. NEVER use Te (informal you) for cold B2B; it's the equivalent of using 'du' or 'ты'. The Maga form (an older middle-register, lower respect than Ön but more formal than Te) is now archaic in B2B; use Ön for cold, Te only after explicit relationship-warming. " +
    "GREETING REGISTERS: " +
    "'Üdvözlöm, {NAME},' — formal-respectful, literally 'I greet (you)'; the standard B2B chat opening. " +
    "'Jó napot kívánok, {NAME},' — formal 'Good day I wish'; works through the day. " +
    "'Tisztelt {LastName} Úr, / Tisztelt {LastName} Asszony,' — most formal email-equivalent (Tisztelt = 'respected'; Úr = Mr. / Asszony = Mrs. or married woman). Hungarian convention puts family name before Úr / Asszony, in Hungarian name-order. " +
    "'Szia' / 'Helló' — informal-young; NEVER for cold B2B. " +
    "ORTHOGRAPHY: Hungarian Latin script with diacritics: á (a-acute), é (e-acute), í (i-acute), ó (o-acute), ö (o-umlaut), ő (o-double-acute — THIS IS HUNGARIAN-SPECIFIC, distinct from ö; sometimes called 'O with hungarumlaut'), ú (u-acute), ü (u-umlaut), ű (u-double-acute — also Hungarian-specific, distinct from ü). Get ő and ű right; substituting ö/ü or o/u reads as foreign-template. Hungarian uses agglutinative suffixes (ban/ben for 'in', nak/nek for dative, etc.) — these change based on vowel harmony. Numbers use space thousands separator: '1 234 567' (some sources use period like German, both seen; space is more universal in modern B2B). " +
    "CURRENCY: HUF (Ft, forint). The forint has effectively no fractional unit in B2B (filler subunit exists historically but is unused); no decimals: '1 234 567 Ft' (Ft as suffix with space). For larger amounts: 'M Ft' (millió forint / million Ft, e.g., '50 M Ft'), 'Mrd Ft' (milliárd / billion Ft, e.g., '1 Mrd Ft'). Hungarian B2B figures are nominally large due to the weak forint vs EUR (~390-400 HUF/EUR); '1 million Ft' is roughly EUR 2,500. Many Hungarian B2B contexts dual-quote in EUR (especially for multinationals and software). Hungary has not adopted the euro despite EU membership. " +
    "CITY/MARKET REFERENCES: " +
    "Budapest (the commercial / political center; ~1.7M city + ~3M metro Budapest agglomeration; the dominant Hungarian city by every B2B metric. District V Belváros / Lipótváros for traditional finance and government, District VI Terézváros for diverse business, District XIII Újlipótváros and the Váci út / Váci úti irodakorridor (Váci Road Office Corridor) for modern corporate HQs and tech offices, District IX Ferencváros for startups and creative agencies, District II / III in Buda hills for residential and consulting, Andrássy út for premium retail and embassies, MOM Park and BudaPart for newer business districts). " +
    "Debrecen (~200K, eastern Hungary, the second-largest city; Universitatea Debrecenului / DE; pharma — Richter Gedeon; BMW factory under construction with planned operations starting mid-decade, attracting suppliers; growing tech). " +
    "Szeged (~160K, southern Hungary, ELI-ALPS research / laser; pharma; Szegedi Tudományegyetem). " +
    "Miskolc (~150K, northern industrial, traditional metallurgy and machinery). " +
    "Pécs (~140K, southern Hungary; university town). " +
    "Győr (~130K, western Hungary near Austrian border; Audi Hungaria Motor Kft engine and assembly plant — the largest engine factory in the world by some measures; Suzuki Hungaria nearby in Esztergom). " +
    "Kecskemét (~110K, Bács-Kiskun; Mercedes-Benz manufacturing). " +
    "Székesfehérvár (~95K, near Budapest; ALCOA, Denso, Grundfos). " +
    "PEER BRANDS by tier: " +
    "Banking tier: OTP Bank (THE dominant Hungarian bank; the largest by assets and the most internationally expanded Hungarian financial institution — regional CEE presence in Bulgaria, Romania, Croatia, Serbia, Slovenia, Albania, Moldova; BUX-listed; founded 1949 as the savings bank monopoly), MBH Bank (post-2023 merger of MKB, Budapest Bank, and Takarékbank — now the second-largest by various metrics, state-influenced), K&H Bank (KBC Belgium subsidiary), Erste Bank Hungary, Raiffeisen Bank Hungary, UniCredit Bank Hungary, CIB Bank (Intesa Sanpaolo). " +
    "Industrial / state tier: MOL Group (oil and gas, BUX-listed — the largest Hungarian industrial company by revenue, with operations across Hungary, Slovakia (Slovnaft), Croatia (INA), Romania (MOL Romania), Italy, Czech Republic; international supply chain reach), MVM Group (state energy holding — includes Paks nuclear power plant operations, hydropower, gas trading), Magyar Telekom (telco, Deutsche Telekom-controlled — the dominant Hungarian fixed and mobile operator), Yettel Hungary (formerly Telenor Hungary, now PPF Group; second mobile operator), Vodafone Hungary (third mobile), Digi Hungary (DIGI Communications), Magyar Posta (state post / banking via Magyar Posta Bank). " +
    "Manufacturing / automotive (Hungary is heavily automotive-industrial — automotive employs ~6% of Hungarian workforce): Audi Hungaria Győr (engines + Q3 / TT model assembly), Mercedes-Benz Manufacturing Hungary Kecskemét (CLA / GLA / B-Class), BMW Debrecen (under construction, scheduled production mid-decade), Suzuki Magyarország Esztergom (Vitara / S-Cross), Stellantis Szentgotthárd (engines), Continental Hungary, Bosch Hungary (sensors, automotive electronics), Knorr-Bremse Budapest (brake systems), Schaeffler. " +
    "Pharma: Richter Gedeon (BUX-listed, the largest Hungarian pharma, gynecology focus, regional CEE), Egis (CVC-owned), TEVA Hungary, sanofi-aventis Magyarország. " +
    "E-commerce / tech: eMAG Hungary (the Romanian eMAG's Hungarian operation, large Hungarian e-commerce presence), Vatera (older Hungarian classifieds, AukciósHáz-owned), Jófogás (classifieds, Schibsted-owned), Bookline (books / culture), Edigital (electronics), GLS Hungary / Magyar Posta Logisztika (logistics). Mobility / delivery: Wolt Hungary (Finnish DoorDash-owned), Bolt Hungary (Estonian), Foodpanda Hungary (Delivery Hero). Hungarian tech: LogMeIn / GoTo (originally Hungarian-founded by Marton Anka, now US-public), Prezi (Hungarian-founded by Adam Somlai-Fischer, the presentation platform — internationally famous Hungarian tech success), Ustream (acquired by IBM), NNG (in-car navigation, AppNexus-acquired then IDG / SoftBank context), Tresorit (encrypted cloud storage, Swiss-Hungarian, Swiss Post-acquired). " +
    "Match peer tier to prospect's company: banking-tier for finance (OTP especially well-recognized for regional comparisons), MOL / MVM for traditional industrial / energy, automotive-tier (Audi / Mercedes / BMW / Suzuki) for manufacturing, eMAG / Wolt / Bolt for consumer-tech, Prezi / LogMeIn / Tresorit for Hungarian tech-product references. " +
    "TONE: formal, structured, slightly reserved in Hungarian-language B2B; warmer when English is used (Hungarian B2B often switches to English for tech / startup contexts, especially in Budapest). Hungarian business culture values: explicit respect via Ön and Tisztelt openings, clear hierarchical acknowledgment, precise language (Hungarian is precise about case and tense), and avoidance of marketing-speak. Hungarian readers are sensitive to grammatical correctness; agglutinative errors signal foreign-template immediately. Avoid hype words ('forradalmi' without source, 'piacvezető' without numbers, 'egyedülálló') which read as advertising. Sign-offs: 'Tisztelettel,' (formal standard, the most common B2B sign-off — literally 'With respect'), 'Üdvözlettel,' ('With greetings', slightly warmer-formal, the second-most-common), 'Köszönettel,' ('With thanks', for messages with a specific ask), 'Szép napot,' ('Have a nice day', casual-warm, modern Budapest tech-style). Match sign-off to opening: 'Tisztelt {LastName} Úr / Asszony' pairs with 'Tisztelettel,' or 'Üdvözlettel,'; 'Üdvözlöm' pairs with 'Üdvözlettel,' or 'Köszönettel,'.",
};`;

const E1_MARKER = `"ro-RO":\n    "Romanian-Romania (ro-RO):`;

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

if (!source.includes(`"cs-CZ":\n    "Czech-Czech Republic (cs-CZ):`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-uk-cs to have landed first");
  console.error("[FATAL] missing expected tier-3 cs-CZ entry in GUIDES");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["guides-tier3-ro-hu-append", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  // ro-RO
  roROAdded:                source.includes(`"ro-RO":\n    "Romanian-Romania (ro-RO):`),
  roROFormalRegister:       source.includes(`formal dumneavoastră`) &&
                            source.includes(`Never tu for cold B2B`),
  roROGreetingForms:        source.includes(`'Bună ziua, {NAME},'`) &&
                            source.includes(`'Stimate domnule {LastName},'`),
  roRORejectsSalut:         source.includes(`'Salut' / 'Bună' — informal-young; NEVER for cold B2B`),
  roRODiacriticsNote:       source.includes(`ș (s-comma-below — NOT s-cedilla`) &&
                            source.includes(`ț (t-comma-below — also NOT t-cedilla`),
  roROHasRONCurrency:       source.includes(`CURRENCY: RON (lei is plural`) &&
                            source.includes(`'1.234.567,89 lei'`),
  roROHasBucharestCBD:      source.includes(`Pipera tech park`),
  roROHasCluj:              source.includes(`Cluj-Napoca (~325K, THE dominant Romanian tech hub`),
  roROHasTimisoaraIasi:     source.includes(`Timișoara (~320K`) && source.includes(`Iași (~290K`),
  roROHasBankTier:          source.includes(`Banca Transilvania (BT, the largest Romanian bank`) &&
                            source.includes(`BCR (Banca Comercială Română, Erste Group`),
  roROHasOMVPetrom:         source.includes(`OMV Petrom (the largest Romanian company`),
  roROHasHidroelectricaIPO: source.includes(`Hidroelectrica (state hydropower, IPO 2023`),
  roROHasOrangePostTelekom: source.includes(`Orange Romania (the dominant mobile operator post-2024 Telekom Romania acquisition`),
  roROHasEMAG:              source.includes(`eMAG (THE dominant Romanian e-commerce platform`),
  roROHasUiPath:            source.includes(`UiPath (Romanian-founded by Daniel Dines`),
  roROHasBitdefender:       source.includes(`Bitdefender (cybersecurity, Romanian-founded by Florin Talpeș`),
  roROHasSignoffs:          source.includes(`'Cu stimă,'`) && source.includes(`'Cu respect,'`),
  // hu-HU
  huHUAdded:                source.includes(`"hu-HU":\n    "Hungarian-Hungary (hu-HU):`),
  huHUNameOrderNote:        source.includes(`CRITICAL HUNGARIAN NAME-ORDER NOTE`) &&
                            source.includes(`FAMILY NAME BEFORE the given name`),
  huHUFormalOnRegister:     source.includes(`formal Ön`) &&
                            source.includes(`NEVER use Te (informal you) for cold B2B`),
  huHUMagaArchaic:          source.includes(`The Maga form`) && source.includes(`now archaic in B2B`),
  huHUGreetingForms:        source.includes(`'Üdvözlöm, {NAME},'`) &&
                            source.includes(`'Tisztelt {LastName} Úr, / Tisztelt {LastName} Asszony,'`),
  huHUOdoubleAcuteNote:     source.includes(`ő (o-double-acute — THIS IS HUNGARIAN-SPECIFIC`),
  huHUUdoubleAcuteNote:     source.includes(`ű (u-double-acute — also Hungarian-specific`),
  huHUVowelHarmonyNote:     source.includes(`vowel harmony`),
  huHUHasHUFCurrency:       source.includes(`CURRENCY: HUF (Ft, forint)`) &&
                            source.includes(`1 234 567 Ft`),
  huHUForintWeakVsEUR:      source.includes(`weak forint vs EUR`),
  huHUBudapestDistricts:    source.includes(`District V Belváros / Lipótváros`) &&
                            source.includes(`Váci út / Váci úti irodakorridor`),
  huHUDebrecenBMW:          source.includes(`BMW factory under construction`),
  huHUGyorAudi:             source.includes(`Audi Hungaria Motor Kft engine and assembly plant`),
  huHUKecskemetMercedes:    source.includes(`Mercedes-Benz Manufacturing Hungary Kecskemét`),
  huHUOTPBank:              source.includes(`OTP Bank (THE dominant Hungarian bank`),
  huHUMOLGroup:             source.includes(`MOL Group (oil and gas, BUX-listed`),
  huHURichterPharma:        source.includes(`Richter Gedeon (BUX-listed, the largest Hungarian pharma`),
  huHUPrezi:                source.includes(`Prezi (Hungarian-founded by Adam Somlai-Fischer`),
  huHULogMeIn:              source.includes(`LogMeIn / GoTo (originally Hungarian-founded`),
  huHUSignoffs:             source.includes(`'Tisztelettel,'`) && source.includes(`'Üdvözlettel,'`),

  // Untouched
  csCZUntouched:            source.includes(`"cs-CZ":\n    "Czech-Czech Republic (cs-CZ):`),
  ukUAUntouched:            source.includes(`"uk-UA":\n    "Ukrainian-Ukraine (uk-UA):`),
  idIDUntouched:            source.includes(`"id-ID":\n    "Indonesian-Indonesia (id-ID):`),
  ruRUUntouched:            source.includes(`"ru-RU":\n    "Russian-Russia (ru-RU):`),
  plPLUntouched:            source.includes(`"pl-PL":\n    "Polish-Poland (pl-PL):`),
  itITUntouched:            source.includes(`"it-IT":\n    "Italian-Italy (it-IT):`),
  trTRUntouched:            source.includes(`"tr-TR":\n    "Turkish-Turkey (tr-TR):`),
  heILUntouched:            source.includes(`"he-IL":\n    "Hebrew-Israel (he-IL):`),
  koKRUntouched:            source.includes(`"ko-KR":\n    "Korean-South Korea (ko-KR):`),
  jaJPUntouched:            source.includes(`"ja-JP":\n    "Japanese-Japan (ja-JP):`),
  bnINUntouched:            source.includes(`"bn-IN":\n    "Bengali-India (bn-IN):`),
  hiINUntouched:            source.includes(`"hi-IN":\n    "Hindi-India (hi-IN):`),
  bareRoUntouched:          source.includes(`Romanian (ro): Heavy localization`) ||
                            source.includes(`Romanian (ro):`),
  bareHuUntouched:          source.includes(`Hungarian (hu): Heavy localization`) ||
                            source.includes(`Hungarian (hu):`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  ptBRUntouched:            source.includes(`Brazilian Portuguese (pt-BR)`),
  deCHUntouched:            source.includes(`Swiss High German (de-CH;`),
  buildNativenessUntouched: source.includes(`export function buildNativenessBlock`),
};
console.log("[language-nativeness-ro-hu] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[language-nativeness-ro-hu] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[language-nativeness-ro-hu] DONE");
