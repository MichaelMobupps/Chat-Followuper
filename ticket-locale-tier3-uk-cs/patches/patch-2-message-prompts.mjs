#!/usr/bin/env node
/**
 * Ticket locale-tier3-uk-cs, patch 2/3: services/messagePrompts.ts
 *
 * One atomic edit: append uk-UA and cs-CZ entries to GREETING_TABLE,
 * after the existing id-ID entry (last tier-3 entry from prior sweep).
 *
 * Notes on greeting forms:
 *   uk-UA: Inherits the bare-uk form ("Вітаю, {NAME},"). The regional
 *          entry adds: formal вас / Ви register (Ukrainian formal
 *          second person, capitalized in correspondence; mandatory
 *          for cold B2B), UAH (₴) formatting with European separators,
 *          Kyiv tech vs Lviv IT-export vs Dnipro industrial split,
 *          peer brands (Monobank / PrivatBank / Oschadbank vs Rozetka /
 *          Nova Poshta / Ukrposhta vs Kyivstar / Vodafone Ukraine /
 *          lifecell), and explicit note on tone (Ukrainian B2B avoids
 *          Russian linguistic patterns post-2022; specific term
 *          substitutions matter).
 *
 *   cs-CZ: Inherits the bare-cs form ("Dobrý den, {NAME},"). The
 *          regional entry adds: formal Vy (capitalized in formal
 *          correspondence) register, CZK (Kč) formatting with space
 *          thousands and comma decimal, Prague vs Brno vs Ostrava
 *          split, peer brands (Česká spořitelna / ČSOB / Komerční banka
 *          vs Alza / Mall / Rohlík vs O2 / T-Mobile / Vodafone),
 *          and tone note (Czech B2B is reserved and pragmatic; over-
 *          enthusiasm reads as foreign).
 *
 * Dependency: requires ticket-locale-tier3-ru-id to have landed (anchor
 * expects id-ID as the last entry of the tier-3 GREETING_TABLE block).
 *
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

const E1_OLD = `  "id-ID": { withName: "Selamat pagi, Bapak/Ibu {NAME},", withoutName: "Selamat pagi, Bapak/Ibu,", note: "Indonesia. Indonesian B2B uses formal Bapak (Mr.) / Ibu (Ms.) honorifics for cold outreach; never use first name alone. The honorifics precede the name: 'Bapak Budi' / 'Ibu Sari'. Common Indonesian-Chinese / Indonesian-of-Chinese-descent names sometimes carry 'Pak' / 'Bu' as short forms but cold B2B should default to full 'Bapak' / 'Ibu'. Time-of-day greetings rotate: Selamat pagi (morning ~5am-11am), Selamat siang (~11am-3pm), Selamat sore (~3pm-7pm), Selamat malam (evening ~7pm onwards); use the form matching the time the prospect will read. 'Halo Pak/Bu {NAME},' is acceptable on WhatsApp / chat for less formal contexts. 'Yth. Bapak/Ibu {LastName},' (Yang terhormat / 'The respected') is the most formal email-equivalent register, less common on chat. Currency IDR (Rp), with period thousands and comma decimal: 'Rp1.234.567,89' (note: NOT comma thousands; European-style separators). For larger amounts: 'rb' (ribu / thousand) and 'jt' (juta / million) and 'M' (miliar / billion) are common in informal contexts; full numerals 'Rp1.000.000' for formal B2B. The 'IDR' three-letter code is rare in body text; use 'Rp' prefix. Cities: Jakarta (the commercial capital, ~10M city + 30M+ Jabodetabek metro; CBD around Sudirman / Kuningan / Thamrin for finance and enterprise; SCBD for tech), Surabaya (~3M, second-largest, manufacturing / port / East Java), Bandung (~2.5M, tech / textile / education / West Java), Medan (~2.4M, Sumatra commercial hub), Semarang, Makassar (eastern Indonesia gateway), Bali / Denpasar (tourism but growing tech). Peer brands - enterprise / state tier: Bank Mandiri (largest state bank), BCA (Bank Central Asia, the dominant private bank), BNI (Bank Negara Indonesia, state), BRI (Bank Rakyat Indonesia, state, microfinance focus), CIMB Niaga, Bank Danamon, Astra International (the dominant Indonesian conglomerate — automotive, agribusiness, mining, financial services, infrastructure, IT — Toyota / Daihatsu / Isuzu / Honda / BMW / Peugeot dealerships in Indonesia), Pertamina (state oil and gas), PLN (state electricity), Telkom Indonesia (state telco; includes Telkomsel which is the dominant mobile operator), Indosat Ooredoo Hutchison (telco), XL Axiata (telco), Garuda Indonesia (state airline). Tech / digital-native tier: GoTo Group (the largest Indonesian tech holding — Gojek for ride-hailing / food / payments + Tokopedia for e-commerce, post-merger), Grab Indonesia (Singapore HQ but dominant Indonesian player), Bukalapak (e-commerce), Traveloka (online travel agent, regional SEA), OVO (digital wallet, Grab-affiliated), DANA (digital wallet, Ant Group + Emtek), LinkAja (digital wallet, state-backed via Telkomsel / Pertamina / BRI / BNI / Mandiri consortium), Blibli (e-commerce, Djarum group), Tiket.com (travel), Akulaku (BNPL / fintech), Kredivo (BNPL), Ruangguru (edtech), Halodoc (healthtech), Sociolla (beauty e-commerce). Match peer tier to prospect's company: enterprise / state references for traditional banking / energy / telco, tech / digital-native for SaaS / e-commerce / fintech / mobile gaming. Note: 'Indomaret' and 'Alfamart' are the two dominant convenience-store chains and worth referencing for retail / FMCG contexts." },
};`;

const E1_NEW = `  "id-ID": { withName: "Selamat pagi, Bapak/Ibu {NAME},", withoutName: "Selamat pagi, Bapak/Ibu,", note: "Indonesia. Indonesian B2B uses formal Bapak (Mr.) / Ibu (Ms.) honorifics for cold outreach; never use first name alone. The honorifics precede the name: 'Bapak Budi' / 'Ibu Sari'. Common Indonesian-Chinese / Indonesian-of-Chinese-descent names sometimes carry 'Pak' / 'Bu' as short forms but cold B2B should default to full 'Bapak' / 'Ibu'. Time-of-day greetings rotate: Selamat pagi (morning ~5am-11am), Selamat siang (~11am-3pm), Selamat sore (~3pm-7pm), Selamat malam (evening ~7pm onwards); use the form matching the time the prospect will read. 'Halo Pak/Bu {NAME},' is acceptable on WhatsApp / chat for less formal contexts. 'Yth. Bapak/Ibu {LastName},' (Yang terhormat / 'The respected') is the most formal email-equivalent register, less common on chat. Currency IDR (Rp), with period thousands and comma decimal: 'Rp1.234.567,89' (note: NOT comma thousands; European-style separators). For larger amounts: 'rb' (ribu / thousand) and 'jt' (juta / million) and 'M' (miliar / billion) are common in informal contexts; full numerals 'Rp1.000.000' for formal B2B. The 'IDR' three-letter code is rare in body text; use 'Rp' prefix. Cities: Jakarta (the commercial capital, ~10M city + 30M+ Jabodetabek metro; CBD around Sudirman / Kuningan / Thamrin for finance and enterprise; SCBD for tech), Surabaya (~3M, second-largest, manufacturing / port / East Java), Bandung (~2.5M, tech / textile / education / West Java), Medan (~2.4M, Sumatra commercial hub), Semarang, Makassar (eastern Indonesia gateway), Bali / Denpasar (tourism but growing tech). Peer brands - enterprise / state tier: Bank Mandiri (largest state bank), BCA (Bank Central Asia, the dominant private bank), BNI (Bank Negara Indonesia, state), BRI (Bank Rakyat Indonesia, state, microfinance focus), CIMB Niaga, Bank Danamon, Astra International (the dominant Indonesian conglomerate — automotive, agribusiness, mining, financial services, infrastructure, IT — Toyota / Daihatsu / Isuzu / Honda / BMW / Peugeot dealerships in Indonesia), Pertamina (state oil and gas), PLN (state electricity), Telkom Indonesia (state telco; includes Telkomsel which is the dominant mobile operator), Indosat Ooredoo Hutchison (telco), XL Axiata (telco), Garuda Indonesia (state airline). Tech / digital-native tier: GoTo Group (the largest Indonesian tech holding — Gojek for ride-hailing / food / payments + Tokopedia for e-commerce, post-merger), Grab Indonesia (Singapore HQ but dominant Indonesian player), Bukalapak (e-commerce), Traveloka (online travel agent, regional SEA), OVO (digital wallet, Grab-affiliated), DANA (digital wallet, Ant Group + Emtek), LinkAja (digital wallet, state-backed via Telkomsel / Pertamina / BRI / BNI / Mandiri consortium), Blibli (e-commerce, Djarum group), Tiket.com (travel), Akulaku (BNPL / fintech), Kredivo (BNPL), Ruangguru (edtech), Halodoc (healthtech), Sociolla (beauty e-commerce). Match peer tier to prospect's company: enterprise / state references for traditional banking / energy / telco, tech / digital-native for SaaS / e-commerce / fintech / mobile gaming. Note: 'Indomaret' and 'Alfamart' are the two dominant convenience-store chains and worth referencing for retail / FMCG contexts." },
  "uk-UA": { withName: "Вітаю, {NAME},", withoutName: "Вітаю,", note: "Ukraine. Ukrainian B2B uses formal Ви (capitalized in formal correspondence; lowercase ви acceptable in modern chat) register; never ти for cold outreach. 'Вітаю, {NAME},' is the standard modern professional opener (literally 'I greet'); 'Доброго дня, {NAME},' is a slightly more traditional alternative. 'Шановний/Шановна {LastName}' (gendered: Шановний for male, Шановна for female) is the most formal email-equivalent opener. 'Привіт' is informal-young; never for cold B2B. Currency UAH (₴), with space thousands and comma decimal: '1 234 567,89 ₴' (European-style separators; hryvnia symbol after amount with space). For larger amounts: 'млн' (million) and 'млрд' (billion) are standard. Cities: Київ (Kyiv, the commercial / political center; ~3M; finance, enterprise, government, tech all concentrated; Podil and Pechersk for business, Solomyanka for tech), Львів (Lviv, the IT-export capital — SoftServe, EPAM Ukraine, Sigma, Globallogic; the IT-cluster face of Ukrainian B2B abroad), Дніпро (Dnipro, industrial / metals / fintech), Харків (Kharkiv, traditional industry / IT despite war-affected status), Одеса (Odesa, port / agricultural / IT), Івано-Франківськ / Ужгород (western IT-cluster satellites). Peer brands - enterprise / banking tier: Monobank (the most successful Ukrainian neobank, Universal Bank parent), PrivatBank (largest by retail customers, state-nationalized 2016), Oschadbank (state savings bank), Raiffeisen Bank Aval (Raiffeisen Austria subsidiary), UkrSibbank (BNP Paribas), Universal Bank, PUMB / FUIB. Retail / e-commerce: Rozetka (the dominant Ukrainian e-commerce platform, comparable to Allegro in PL or Wildberries in RU), Prom.ua (marketplace), Nova Poshta (THE Ukrainian parcel-delivery standard — every Ukrainian B2B uses it; private), Ukrposhta (state post). Telco: Kyivstar (largest, owned by VEON), Vodafone Ukraine (formerly MTS Ukraine), lifecell (Turkcell subsidiary). Tech / digital-native: SoftServe (largest Ukrainian software outsourcer, US HQ now), EPAM Ukraine (now NYSE-listed EPAM), Sigma Software, Globallogic (Hitachi-owned), GitLab (Ukrainian-founded, US HQ), Grammarly (Ukrainian-founded, US HQ), MacPaw (CleanMyMac), Reface (face-swap AI), Preply (edtech), Petcube. Note: Ukrainian B2B post-2022 is highly attuned to Russian linguistic influence; use Ukrainian-specific term equivalents (Київ not Киев, Львів not Львов, Харків not Харьков), and avoid mixed Russian-Ukrainian sourzhik vocabulary. Match peer tier to prospect's company: enterprise / banking for traditional finance, e-commerce-tier for retail / logistics, IT-outsourcer-tier for software services, tech-product-tier for SaaS / mobile / consumer." },
  "cs-CZ": { withName: "Dobrý den, {NAME},", withoutName: "Dobrý den,", note: "Czech Republic / Czechia. Czech B2B uses formal Vy (capitalized in correspondence; lowercase vy acceptable on chat) register; never ty for cold outreach. 'Dobrý den, {NAME},' is the standard chat opening and works through the day. 'Vážený pane {LastName},' / 'Vážená paní {LastName},' is the most formal email-equivalent opener (gendered: pane for male, paní for female). 'Ahoj' / 'Čau' are informal-young; never for cold B2B. Currency CZK (Kč), with space thousands and comma decimal: '1 234 567,89 Kč' (European-style separators; Kč symbol after amount with space). 'mil.' (million) and 'mld.' (miliarda / billion) are common abbreviations; full numerals for formal B2B. Cities: Praha (Prague, the commercial / political center; ~1.3M city + ~2.7M metro; finance, enterprise, multinational HQs; Karlín / Smíchov / Pankrác for tech and modern offices; Old Town for traditional business), Brno (~380K, second-largest, the secondary tech hub — Red Hat, IBM Brno, AVG / Avast originally), Ostrava (~280K, industrial / mining / heavy industry, Moravian-Silesian Region), Plzeň (~170K, automotive / Škoda Transportation, Pilsner Urquell brewery), Olomouc (~100K, R&D / pharma), Liberec, České Budějovice. Peer brands - enterprise / banking tier: Česká spořitelna (Erste Group, the largest retail bank), ČSOB (KBC Bank Belgium subsidiary), Komerční banka (KB, Société Générale subsidiary), Moneta Money Bank, UniCredit Bank Czech Republic, Raiffeisenbank ČR, Air Bank (PPF), Fio banka, J&T Banka. Industrial / state: Škoda Auto (VW Group, automotive), Škoda Transportation (separate company, trains / trams), ČEZ Group (state-controlled electricity utility, the dominant Czech utility), Innogy / Net4Gas, O2 Czech Republic (telco, fixed and mobile), T-Mobile Czech Republic, Vodafone Czech Republic. Retail / FMCG: Albert (Ahold Delhaize, the largest supermarket chain), Tesco Stores ČR, Kaufland (Schwarz Group), Lidl ČR, Penny Market, Globus, dm drogerie, Rossmann. E-commerce / tech: Alza.cz (the dominant Czech e-commerce platform, comparable to Allegro / Rozetka regional dominance), Mall.cz (now part of Allegro group), Rohlík (online grocery, the dominant Czech model — also expanded to DACH and beyond), Heureka (price comparison), Slevomat (deals), Avast (security, originally Czech, now Gen Digital after NortonLifeLock merger), AVG (also Avast / Gen Digital), Productboard (US HQ Czech roots), Kiwi.com (travel meta-search), Dáme jídlo (food delivery, Delivery Hero), Wolt Czechia (Finnish but heavy CZ presence). Note: Czech B2B tone is reserved and pragmatic; over-enthusiasm or American-style hype reads as foreign-template. Match peer tier to prospect's company: enterprise / banking for finance, industrial for traditional manufacturing, e-commerce / tech for SaaS / digital." },
};`;

const E1_MARKER = `"uk-UA": { withName: "Вітаю, {NAME},"`;

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

// Pre-flight: tier-3 id-ID must be present
if (!source.includes(`"id-ID": { withName: "Selamat pagi, Bapak/Ibu {NAME},"`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-ru-id to have landed first");
  console.error("[FATAL] missing expected tier-3 id-ID entry in GREETING_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["greeting-uk-cs-add", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  // uk-UA content checks
  ukUAAdded:                source.includes(`"uk-UA": { withName: "Вітаю, {NAME},"`),
  ukUAFormalRegister:       source.includes(`formal Ви (capitalized in formal correspondence`) &&
                            source.includes(`never ти for cold outreach`),
  ukUAGreetingForms:        source.includes(`'Доброго дня, {NAME},'`) &&
                            source.includes(`'Шановний/Шановна {LastName}'`),
  ukUARejectsPryvit:        source.includes(`'Привіт' is informal-young; never for cold B2B`),
  ukUAHasUAHCurrency:       source.includes(`Currency UAH (₴)`) &&
                            source.includes(`1 234 567,89 ₴`),
  ukUAHasKyivLviv:          source.includes(`Київ (Kyiv`) && source.includes(`Львів (Lviv, the IT-export capital`),
  ukUAHasDnipro:            source.includes(`Дніпро (Dnipro, industrial`),
  ukUAHasMonobank:          source.includes(`Monobank (the most successful Ukrainian neobank`),
  ukUAHasPrivatBank:        source.includes(`PrivatBank (largest by retail customers`),
  ukUAHasRozetka:           source.includes(`Rozetka (the dominant Ukrainian e-commerce platform`),
  ukUAHasNovaPoshta:        source.includes(`Nova Poshta (THE Ukrainian parcel-delivery standard`),
  ukUAHasTelcoTier:         source.includes(`Kyivstar (largest`) && source.includes(`Vodafone Ukraine`) && source.includes(`lifecell`),
  ukUAHasITOutsourcers:     source.includes(`SoftServe`) && source.includes(`EPAM Ukraine`) && source.includes(`Sigma Software`),
  ukUAHasTechProducts:      source.includes(`Grammarly (Ukrainian-founded`) && source.includes(`MacPaw`),
  ukUAHasPost2022Note:      source.includes(`Ukrainian B2B post-2022 is highly attuned to Russian linguistic influence`),
  // cs-CZ content checks
  csCZAdded:                source.includes(`"cs-CZ": { withName: "Dobrý den, {NAME},"`),
  csCZFormalRegister:       source.includes(`formal Vy (capitalized in correspondence`) &&
                            source.includes(`never ty for cold outreach`),
  csCZHasVazenyForm:        source.includes(`'Vážený pane {LastName},' / 'Vážená paní {LastName},'`),
  csCZRejectsAhoj:          source.includes(`'Ahoj' / 'Čau' are informal-young; never for cold B2B`),
  csCZHasCZKCurrency:       source.includes(`Currency CZK (Kč)`) &&
                            source.includes(`1 234 567,89 Kč`),
  csCZHasPrahaBrno:         source.includes(`Praha (Prague`) && source.includes(`Brno (~380K, second-largest`),
  csCZHasOstrava:           source.includes(`Ostrava (~280K, industrial`),
  csCZHasSkoda:             source.includes(`Škoda Auto (VW Group`),
  csCZHasBankTier:          source.includes(`Česká spořitelna (Erste Group`) &&
                            source.includes(`ČSOB`) && source.includes(`Komerční banka (KB`),
  csCZHasRetailTier:        source.includes(`Albert (Ahold Delhaize`) &&
                            source.includes(`Kaufland (Schwarz Group)`),
  csCZHasAlza:              source.includes(`Alza.cz (the dominant Czech e-commerce platform`),
  csCZHasRohlik:            source.includes(`Rohlík (online grocery, the dominant Czech model`),
  csCZHasAvast:             source.includes(`Avast (security`),
  csCZHasReservedTone:      source.includes(`Czech B2B tone is reserved and pragmatic`),
  // Untouched / regression
  bareUkUntouched:          source.includes(`uk: { withName: "Вітаю, {NAME},", withoutName: "Вітаю,", note: "" },`),
  bareCsUntouched:          source.includes(`cs: { withName: "Dobrý den, {NAME},", withoutName: "Dobrý den,", note: "" },`),
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
console.log("[message-prompts-uk-cs] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[message-prompts-uk-cs] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[message-prompts-uk-cs] DONE");
