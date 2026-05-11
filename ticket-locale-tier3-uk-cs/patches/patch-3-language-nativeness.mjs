#!/usr/bin/env node
/**
 * Ticket locale-tier3-uk-cs, patch 3/3: lib/languageNativeness.ts
 *
 * One atomic edit: append uk-UA and cs-CZ entries to the tier-3 GUIDES
 * block, mirroring depth from prior tier-3 entries.
 *
 * Dependency: requires ticket-locale-tier3-ru-id to have landed.
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/languageNativeness.ts",
);

const E1_OLD = `    "TONE: formal-warm, relationship-aware. Indonesian B2B values: explicit honorific (Bapak / Ibu) throughout the message in first contact, slightly slower / more relational pace than Anglo-Saxon norms, acknowledgment of the prospect's seniority and company context before the pitch. Indonesian business culture rewards patience and politeness; aggressive direct outreach without honorifics reads as foreign-template. Avoid hype words ('revolusioner' without source, 'terbaik di industri' without numbers, 'satu-satunya') which read as advertising. Sign-offs: 'Terima kasih,' (Thank you — the standard B2B closing), 'Hormat saya,' (My respect — more formal), 'Salam,' (Regards — casual but acceptable in modern B2B chat), 'Salam hormat,' (Respectful regards — warmer-formal). Match sign-off to opening: 'Yth. Bapak/Ibu' pairs with 'Hormat saya'; 'Selamat pagi, Bapak/Ibu' pairs with 'Terima kasih' or 'Salam hormat'.",
};`;

const E1_NEW = `    "TONE: formal-warm, relationship-aware. Indonesian B2B values: explicit honorific (Bapak / Ibu) throughout the message in first contact, slightly slower / more relational pace than Anglo-Saxon norms, acknowledgment of the prospect's seniority and company context before the pitch. Indonesian business culture rewards patience and politeness; aggressive direct outreach without honorifics reads as foreign-template. Avoid hype words ('revolusioner' without source, 'terbaik di industri' without numbers, 'satu-satunya') which read as advertising. Sign-offs: 'Terima kasih,' (Thank you — the standard B2B closing), 'Hormat saya,' (My respect — more formal), 'Salam,' (Regards — casual but acceptable in modern B2B chat), 'Salam hormat,' (Respectful regards — warmer-formal). Match sign-off to opening: 'Yth. Bapak/Ibu' pairs with 'Hormat saya'; 'Selamat pagi, Bapak/Ibu' pairs with 'Terima kasih' or 'Salam hormat'.",

  "uk-UA":
    "Ukrainian-Ukraine (uk-UA): Ukraine is the only major Ukrainian B2B adtech market. The base Ukrainian (uk) guide covers HEAVY Cyrillic localization with mandatory term conversions (retention>утримання, install>встановлення, conversion>конверсія, targeting>таргетинг, traffic>трафік, fraud>фрод, creatives>креативи, bid>ставка, publisher>видавець/паблішер, lookalike>схожі аудиторії); that all still applies. This regional entry adds Ukraine-specific city, currency, peer-brand, register, and post-2022 linguistic-sensitivity depth on top of the base uk guide. " +
    "CRITICAL POST-2022 LANGUAGE NOTE: Ukrainian B2B writing post-2022 is highly attuned to Russian linguistic influence. Use Ukrainian-specific term equivalents throughout: Київ (NOT Киев), Львів (NOT Львов), Харків (NOT Харьков), Дніпро (NOT Днепр), Одеса (NOT Одесса). Avoid surzhik (mixed Russian-Ukrainian vocabulary common in older / eastern speakers); modern Ukrainian B2B uses purified Ukrainian. Term-level: use 'будь ласка' (please) not Russian-loan 'пожалуйста'; 'дякую' (thank you) not 'спасибі'; 'добре' (good / fine) not 'хорошо'. Recognizing Ukrainian-distinct vocabulary signals market awareness; using Russian-loan equivalents signals foreign-template. " +
    "REGISTER LAYERS: Ukrainian B2B uses formal Ви (capitalized in formal correspondence; lowercase ви acceptable in modern chat) for cold outreach; never ти for first contact. Verbs conjugate to second-person plural: 'хотів би / хотіла би запропонувати Вам' (I would like to offer you — verb gendered based on writer). The capitalized Ви is the more formal / respectful form, common in written correspondence; lowercase ви is acceptable in WhatsApp / Telegram / Slack chat contexts. " +
    "GREETING REGISTERS: " +
    "'Вітаю, {NAME},' — modern professional opener (literally 'I greet'); the standard chat default. " +
    "'Доброго дня, {NAME},' — slightly more traditional alternative ('Good day'); also fine for cold. " +
    "'Шановний {LastName}, / Шановна {LastName},' — most formal, email-equivalent register; gendered (Шановний for male, Шановна for female). " +
    "'Привіт' — informal-young register; NEVER for cold B2B regardless of channel. " +
    "ORTHOGRAPHY: Cyrillic script with Ukrainian-specific letters: і (Ukrainian і, NOT Russian и), ї (yi), є (ye), ґ (g — historical letter, used in some words). Get these right; using Russian и where Ukrainian і belongs signals foreign-template. Latin acronyms (CPI, CPA, ROAS, DSP, LTV, MMP) embed inline within Ukrainian sentences and read naturally. Numbers use space as thousands separator and comma as decimal: '1 234 567,89' (European-style). Percentages use % symbol. " +
    "CURRENCY: UAH (₴, hryvnia). Currency symbol follows the amount with a space: '1 234 567,89 ₴'. For larger amounts: 'млн' (million) and 'млрд' (billion) are standard. Ukrainian B2B contexts also frequently dual-quote in USD or EUR due to export orientation and inflation context; this is normal, not a fault. " +
    "CITY/MARKET REFERENCES: " +
    "Київ (Kyiv, the commercial / political center; ~3M; finance, enterprise, government, tech all concentrated; Podil for traditional business and creative agencies, Pechersk for finance and embassies, Solomyanka and Lukianivska for tech offices). " +
    "Львів (Lviv, ~720K; THE Ukrainian IT-export capital — home to SoftServe, EPAM Ukraine major office, Sigma Software, GlobalLogic Ukraine, Eleks; the cultural and IT-cluster face of Ukrainian B2B abroad; closer to Polish / EU labor markets). " +
    "Дніпро (Dnipro, ~960K; industrial / metals / steel; PrivatBank originated here; growing fintech / IT). " +
    "Харків (Kharkiv, ~1.4M pre-2022; traditional industrial / aviation / IT — Kharkiv was a major IT-outsourcing hub; war-affected post-2022 with many companies relocated to Lviv or abroad, but the talent base remains). " +
    "Одеса (Odesa, ~1M; port / agricultural / IT; trading hub). " +
    "Івано-Франківськ (~230K) and Ужгород (Uzhhorod, western IT-cluster satellites near Polish / Slovak borders). " +
    "Many Ukrainian IT companies post-2022 operate distributed teams across Lviv, Warsaw, Krakow, Wrocław (Polish cities), and US / EU offices. " +
    "PEER BRANDS by tier: " +
    "Banking tier: Monobank (the most successful Ukrainian neobank, branchless, Universal Bank parent — comparable in domestic disruption to Revolut elsewhere or T-Bank in Russia; THE reference for fintech in Ukraine), PrivatBank (largest by retail customers, state-nationalized in 2016 from Kolomoisky), Oschadbank (state savings bank, traditional), Raiffeisen Bank Aval (Raiffeisen Austria subsidiary, second-largest by retail metric), UkrSibbank (BNP Paribas), Universal Bank, PUMB (First Ukrainian International Bank / FUIB, owned by Akhmetov's SCM), Ukreximbank (state, export-import). " +
    "Industrial / state tier: Metinvest (Akhmetov's metals, Mariupol's Azovstal pre-war), DTEK (Akhmetov's energy), Ferrexpo (UK-listed iron ore, Kostyantyn Zhevago — though the owner is post-2022 contested), Kernel (agribusiness, Andriy Verevskyi), MHP (poultry, Yuriy Kosyuk), Roshen (confectionery, Poroshenko-related), Naftogaz (state gas), Ukrenergo (state grid), Ukrzaliznytsia / UZ (state railways), Antonov (state aerospace). " +
    "Retail / e-commerce tier: Rozetka (THE dominant Ukrainian e-commerce platform, comparable in domestic dominance to Allegro in PL or Wildberries in RU; private), Prom.ua (marketplace, EVO group), Comfy (electronics retail), Eldorado / Foxtrot (electronics retail). Logistics: Nova Poshta (THE Ukrainian parcel-delivery standard — every Ukrainian B2B and consumer uses it; private, founded by Hryhorov / Klymov; the brand is universally recognized and a strong peer reference), Ukrposhta (state post), Meest (international logistics). " +
    "Telco / mobile: Kyivstar (largest mobile, owned by VEON — same group as Beeline in RU; the dominant Ukrainian telco), Vodafone Ukraine (formerly MTS Ukraine, rebranded post-2017), lifecell (Turkcell subsidiary). " +
    "Tech / outsourcing tier: SoftServe (the largest Ukrainian software outsourcer, US HQ now Austin TX, large engineering presence in Lviv and other Ukrainian cities), EPAM Ukraine (NYSE-listed EPAM, originally Belarusian-Ukrainian roots, large Ukraine presence pre and post-2022), Sigma Software, GlobalLogic (Hitachi-owned), Ciklum, Luxoft (DXC-owned), Eleks, Infopulse. " +
    "Tech / product tier: GitLab (Ukrainian-founded by Dmitriy Zaporozhets, now US-public on Nasdaq), Grammarly (Ukrainian-founded by Lytvyn / Shevchenko / Maximenko, US HQ, $13B valuation pre-IPO context), MacPaw (CleanMyMac X, Setapp), Reface (face-swap AI, viral 2020), Preply (edtech / language tutoring), Petcube (smart pet products), Ajax Systems (security alarms, has emerged as a security-product B2B reference), Genesis (mobile apps, Headway / Promova / Obrio brands), Allset, Restream (live streaming), People.ai. " +
    "Match peer references to prospect's company: banking-tier for finance, e-commerce / logistics for retail / D2C, IT-outsourcer for software services, tech-product-tier for SaaS / mobile / consumer. " +
    "TONE: pragmatic, direct, increasingly Western-oriented in B2B. Ukrainian B2B post-2022 has accelerated toward EU / US business norms (faster pace, more direct, more English-tolerant in tech). Ukrainian business culture values clarity, getting to the point quickly, and concrete deliverables. Avoid hype words ('революційний' without source, 'лідер ринку' without numbers, 'унікальний') which read as advertising. Sign-offs: 'З повагою,' (formal standard, 'With respect' — the most common B2B sign-off), 'З найкращими побажаннями,' ('Best wishes', warmer-formal), 'Дякую,' ('Thank you', casual-professional, very common). Match sign-off to opening: 'Шановний / Шановна' opening pairs with 'З повагою,'; 'Вітаю' or 'Доброго дня' pairs with 'З повагою,' or 'Дякую,'.",

  "cs-CZ":
    "Czech-Czech Republic (cs-CZ): The Czech Republic / Czechia is the only major Czech B2B adtech market. The base Czech (cs) guide covers HEAVY localization with mandatory term conversions (retention>retence, install>instalace, conversion>konverze, targeting>cílení, traffic>provoz/návštěvnost, creatives>kreativy, lookalike>podobná publika); that all still applies. This regional entry adds Czech Republic-specific city, currency, peer-brand, register, and pragmatic-tone depth on top of the base cs guide. " +
    "REGISTER LAYERS: Czech B2B uses formal Vy (capitalized in correspondence; lowercase vy acceptable on chat) for cold outreach; never ty for first contact. Verbs conjugate to second-person plural: 'rád bych Vám / rád bych vám nabídl' (I would like to offer you — verb gendered based on writer: rád for male, ráda for female). The capitalized Vy is the more formal / respectful form, common in written correspondence; lowercase vy is acceptable on WhatsApp / Telegram / Slack chat. The plural-formal 'tykáme si' / 'vykáme si' (using ty / vy reciprocally) is a culturally important distinction — proposing 'tykáme si' (let's use ty / informal) is a meaningful relationship-warming step in Czech business culture, typically initiated by the senior party. " +
    "GREETING REGISTERS: " +
    "'Dobrý den, {NAME},' — standard chat opening, the safe default; works through the day. " +
    "'Vážený pane {LastName},' / 'Vážená paní {LastName},' — most formal, email-equivalent (gendered: pane for male, paní for female). " +
    "'Vážený pane inženýre / Vážený pane doktore' — using academic titles is more common in Czech B2B than in Anglo-Saxon norms; if the prospect's title is known (Ing., Mgr., Dr., Ph.D., MUDr. for doctors), Czech B2B convention is to acknowledge it in the opening. " +
    "'Ahoj' / 'Čau' — informal-young register; NEVER for cold B2B regardless of channel. " +
    "ORTHOGRAPHY: Czech Latin script with diacritics: á, č, ď, é, ě, í, ň, ó, ř, š, ť, ú, ů, ý, ž (15+ diacritic letters, plus uppercase variants). Get these right; missing or wrong diacritics read as foreign-template. The ř is uniquely Czech (rolled-fricative-r); ů (u with kroužek / ring) vs ú (u with čárka / acute) is meaningful (different etymology). Numbers use space as thousands separator and comma as decimal: '1 234 567,89' (European-style; non-breaking space ideally, regular space acceptable). Percentages use % symbol (12%); never spell out 'procent' in B2B. " +
    "CURRENCY: CZK (Kč, koruna česká). Currency symbol follows the amount with a space: '1 234 567,89 Kč'. Common abbreviations: 'mil.' (milion / million) and 'mld.' (miliarda / billion); 'tis.' (tisíc / thousand) in informal contexts only. The Czech Republic uses CZK, NOT EUR — this is meaningful (resisted euro adoption); avoid quoting in EUR alone unless the prospect's company is multinational. " +
    "CITY/MARKET REFERENCES: " +
    "Praha (Prague, the commercial / political center; ~1.3M city + ~2.7M metro; finance, enterprise, multinational HQs, government, tech all concentrated. Karlín for tech and modern offices, Smíchov for new business HQs, Pankrác for finance towers, Holešovice for creative / co-working. Old Town and Vinohrady for traditional business addresses. Prague's office market is the dominant CEE multinational HQ destination after Warsaw). " +
    "Brno (~380K, second-largest; the secondary tech / R&D hub — Red Hat Brno is the largest Red Hat office globally, IBM Brno, Avast / AVG originated here / Gen Digital now, Honeywell, NXP, Masaryk University tech transfer; Brno is to Prague what Krakow is to Warsaw or Lyon to Paris). " +
    "Ostrava (~280K, third-largest; industrial / mining / heavy industry; Moravian-Silesian Region, historical coal / steel center; Tieto, Tatra Trucks, OKD historically). " +
    "Plzeň (~170K, automotive / Škoda Transportation HQ — separate from Škoda Auto — and the Pilsner Urquell brewery — global beer reference). " +
    "Olomouc (~100K, R&D / pharma / Palacký University — second-oldest Czech university). " +
    "Liberec (~100K, traditional textile, now automotive supplier base for VW group). " +
    "České Budějovice (~94K, Budweiser Budvar brewery, food and beverage). " +
    "PEER BRANDS by tier: " +
    "Banking tier: Česká spořitelna (the largest retail bank by branches, Erste Group Austria subsidiary), ČSOB (KBC Bank Belgium subsidiary, second-largest), Komerční banka / KB (Société Générale subsidiary), Moneta Money Bank, UniCredit Bank Czech Republic and Slovakia, Raiffeisenbank ČR (Raiffeisen Austria), Air Bank (PPF group neobank), Fio banka (Czech-owned), J&T Banka (private banking). Note: most major Czech banks are owned by Western European banking groups (Erste, KBC, Société Générale, Raiffeisen, UniCredit); domestic ownership is rarer at scale (Air Bank / PPF and Fio are exceptions). " +
    "Industrial / state tier: Škoda Auto (VW Group, automotive — the largest Czech industrial company by revenue and a national-pride brand), Škoda Transportation (separate company, trains / trams / public transport vehicles), ČEZ Group (state-controlled electricity utility, the dominant Czech utility, regional player), Innogy / Net4Gas (gas distribution), O2 Czech Republic (telco, fixed and mobile — formerly state Český Telecom), T-Mobile Czech Republic (Deutsche Telekom), Vodafone Czech Republic, Tatra Trucks (heavy vehicles, Kopřivnice), Doosan Škoda Power (turbines, Korean ownership). " +
    "Retail / FMCG tier: Albert (Ahold Delhaize, the largest supermarket chain), Tesco Stores ČR, Kaufland (Schwarz Group), Lidl ČR (also Schwarz Group), Penny Market (REWE Group), Globus (German), Billa (REWE), Coop (Czech cooperative), dm drogerie (Austrian drugstore), Rossmann. " +
    "E-commerce / digital tier: Alza.cz (THE dominant Czech e-commerce platform, comparable to Allegro in PL or Rozetka in UA; private; expanded to Slovakia, Hungary, Austria, Germany, UK), Mall.cz (acquired by Allegro group 2022, integrating), Rohlík.cz (THE dominant Czech online grocery — Rohlík is a Czech tech success story, expanded to DACH / Italy / Hungary as Rohlík Group; reference for Czech tech founders), Heureka.cz (price comparison, regional CEE leader), Slevomat (deals / experiences), AAA Auto (used car platform). " +
    "Tech / software tier: Avast (security, originally Czech, merged with NortonLifeLock as Gen Digital — Nasdaq-listed, founded in Prague), AVG (now Avast / Gen Digital), Kiwi.com (travel meta-search, Brno-founded by Oliver Dlouhý, the most internationally successful Czech tech startup), Productboard (US HQ but Czech roots), Mews (hospitality software, Prague-founded), Memsource / Phrase (translation tech, now Phrase brand), GoodData (analytics, Roman Stanek), Y Soft (print management, Brno). Food delivery: Dáme jídlo (the dominant Czech food-delivery, Delivery Hero), Wolt Czechia (Finnish but heavy CZ presence), Bolt Food. " +
    "Match peer tier to prospect's company: banking-tier (Erste / KBC subsidiaries) for finance, industrial / Škoda for traditional manufacturing, Alza / Mall / Rohlík for e-commerce, Avast / Kiwi for tech-product / SaaS. " +
    "TONE: reserved, pragmatic, understated. Czech B2B values: precise language, concrete numbers, technical accuracy, and avoiding over-enthusiasm. Czech business culture is closer to German / Austrian norms than to Mediterranean or Anglo-Saxon — directness without American-style hype, respect for expertise and titles, slight skepticism toward marketing claims. Avoid hype words ('revoluční' without source, 'jedinečný' / 'unikátní' without justification, 'lídr trhu' without numbers) which read as advertising. Czech B2B writers often signal qualifications (e.g., 'do určité míry' / 'to some extent') where Anglo-Saxon writers would use stronger claims; matching this register reads as Czech-native. Sign-offs: 'S pozdravem,' (formal standard, the most common B2B sign-off — literally 'With greeting'), 'S úctou,' (more formal, 'With respect' — for very serious correspondence), 'Pěkný den,' ('Have a nice day', warm but professional, common in modern B2B chat). Match sign-off to opening: 'Vážený pane / Vážená paní' pairs with 'S pozdravem,' or 'S úctou,'; 'Dobrý den' pairs with 'S pozdravem,' or 'Pěkný den,'.",
};`;

const E1_MARKER = `"uk-UA":\n    "Ukrainian-Ukraine (uk-UA):`;

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

if (!source.includes(`"id-ID":\n    "Indonesian-Indonesia (id-ID):`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-ru-id to have landed first");
  console.error("[FATAL] missing expected tier-3 id-ID entry in GUIDES");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["guides-tier3-uk-cs-append", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  ukUAAdded:                source.includes(`"uk-UA":\n    "Ukrainian-Ukraine (uk-UA):`),
  ukUAPost2022Note:         source.includes(`CRITICAL POST-2022 LANGUAGE NOTE`),
  ukUARussianAvoidance:     source.includes(`Київ (NOT Киев)`) && source.includes(`Львів (NOT Львов)`),
  ukUASurzhikWarning:       source.includes(`Avoid surzhik`),
  ukUAFormalRegister:       source.includes(`formal Ви (capitalized in formal correspondence`) &&
                            source.includes(`never ти for first contact`),
  ukUAGreetingHierarchy:    source.includes(`'Вітаю, {NAME},'`) && source.includes(`'Доброго дня, {NAME},'`) &&
                            source.includes(`'Шановний {LastName},`),
  ukUARejectsPryvit:        source.includes(`'Привіт' — informal-young register; NEVER for cold B2B`),
  ukUAOrthographyNote:      source.includes(`і (Ukrainian і, NOT Russian и)`),
  ukUAHasUAHCurrency:       source.includes(`CURRENCY: UAH (₴, hryvnia)`) && source.includes(`1 234 567,89 ₴`),
  ukUAHasKyiv:              source.includes(`Київ (Kyiv, the commercial / political center`),
  ukUAHasLvivITExport:      source.includes(`Львів (Lviv, ~720K; THE Ukrainian IT-export capital`),
  ukUAHasDnipro:            source.includes(`Дніпро (Dnipro`),
  ukUAHasKharkivWarNote:    source.includes(`war-affected post-2022`),
  ukUAHasDistributedTeams:  source.includes(`distributed teams across Lviv, Warsaw, Krakow, Wrocław`),
  ukUAHasMonobankRef:       source.includes(`Monobank (the most successful Ukrainian neobank`),
  ukUAHasPrivatBankRef:     source.includes(`PrivatBank (largest by retail customers, state-nationalized in 2016`),
  ukUAHasIndustrialTier:    source.includes(`Metinvest`) && source.includes(`DTEK`) && source.includes(`Naftogaz`),
  ukUAHasRozetka:           source.includes(`Rozetka (THE dominant Ukrainian e-commerce platform`),
  ukUAHasNovaPoshta:        source.includes(`Nova Poshta (THE Ukrainian parcel-delivery standard`),
  ukUAHasTelco:             source.includes(`Kyivstar (largest mobile`) && source.includes(`Vodafone Ukraine`) && source.includes(`lifecell`),
  ukUAHasITOutsourcers:     source.includes(`SoftServe`) && source.includes(`EPAM Ukraine`) && source.includes(`Sigma Software`),
  ukUAHasTechProducts:      source.includes(`GitLab (Ukrainian-founded`) && source.includes(`Grammarly (Ukrainian-founded`) &&
                            source.includes(`MacPaw`) && source.includes(`Ajax Systems`),
  ukUAHasSignoffs:          source.includes(`'З повагою,'`) && source.includes(`'З найкращими побажаннями,'`),
  csCZAdded:                source.includes(`"cs-CZ":\n    "Czech-Czech Republic (cs-CZ):`),
  csCZFormalRegister:       source.includes(`formal Vy (capitalized in correspondence`) &&
                            source.includes(`never ty for first contact`),
  csCZTykameNote:           source.includes(`'tykáme si'`) && source.includes(`'vykáme si'`),
  csCZGreetingHierarchy:    source.includes(`'Dobrý den, {NAME},'`) && source.includes(`'Vážený pane {LastName},`),
  csCZAcademicTitleNote:    source.includes(`Czech B2B convention is to acknowledge it in the opening`),
  csCZRejectsAhoj:          source.includes(`'Ahoj' / 'Čau' — informal-young register; NEVER for cold B2B`),
  csCZDiacritics:           source.includes(`á, č, ď, é, ě, í, ň, ó, ř, š, ť, ú, ů, ý, ž`),
  csCZRzNote:               source.includes(`The ř is uniquely Czech`),
  csCZHasCZKCurrency:       source.includes(`CURRENCY: CZK (Kč, koruna česká)`) &&
                            source.includes(`1 234 567,89 Kč`),
  csCZNotEur:               source.includes(`The Czech Republic uses CZK, NOT EUR`),
  csCZHasPraha:             source.includes(`Praha (Prague, the commercial / political center`),
  csCZHasBrnoRedHat:        source.includes(`Red Hat Brno is the largest Red Hat office globally`),
  csCZHasOstrava:           source.includes(`Ostrava (~280K, third-largest`),
  csCZHasPlzenSkoda:        source.includes(`Plzeň (~170K, automotive / Škoda Transportation HQ`),
  csCZHasOlomoucPalacky:    source.includes(`Palacký University — second-oldest Czech university`),
  csCZHasBankTier:          source.includes(`Česká spořitelna`) && source.includes(`ČSOB`) &&
                            source.includes(`Komerční banka / KB`),
  csCZBanksWesternOwned:    source.includes(`most major Czech banks are owned by Western European banking groups`),
  csCZHasSkodaAuto:         source.includes(`Škoda Auto (VW Group`),
  csCZHasCEZ:               source.includes(`ČEZ Group (state-controlled electricity utility`),
  csCZHasRetailTier:        source.includes(`Albert (Ahold Delhaize`) && source.includes(`Kaufland (Schwarz Group)`),
  csCZHasAlza:              source.includes(`Alza.cz (THE dominant Czech e-commerce platform`),
  csCZHasRohlikInternational: source.includes(`Rohlík.cz`) && source.includes(`Rohlík is a Czech tech success story, expanded to DACH / Italy / Hungary`),
  csCZHasAvastGenDigital:   source.includes(`Avast (security`) && source.includes(`merged with NortonLifeLock as Gen Digital`),
  csCZHasKiwiCom:           source.includes(`Kiwi.com (travel meta-search, Brno-founded`),
  csCZHasReservedTone:      source.includes(`reserved, pragmatic, understated`),
  csCZGermanicAffinity:     source.includes(`Czech business culture is closer to German / Austrian norms`),
  csCZHasSignoffs:          source.includes(`'S pozdravem,'`) && source.includes(`'S úctou,'`),
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
  bareUkUntouched:          source.includes(`Ukrainian (uk): Heavy localization`),
  bareCsUntouched:          source.includes(`Czech (cs): Heavy localization`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  ptBRUntouched:            source.includes(`Brazilian Portuguese (pt-BR)`),
  deCHUntouched:            source.includes(`Swiss High German (de-CH;`),
  buildNativenessUntouched: source.includes(`export function buildNativenessBlock`),
};
console.log("[language-nativeness-uk-cs] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[language-nativeness-uk-cs] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[language-nativeness-uk-cs] DONE");
