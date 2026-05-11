#!/usr/bin/env node
/**
 * Ticket locale-tier3-it-pl, patch 3/3: lib/languageNativeness.ts
 *
 * One atomic edit: append it-IT and pl-PL entries to the tier-3 GUIDES
 * block, mirroring tier1/tier2/JP-KR/he-tr depth.
 *
 * Bare-entry coexistence: the base it and pl GUIDES are byte-identical
 * to the Email Prospector guides and remain untouched. Regional entries
 * add Italy-specific / Poland-specific city, currency, peer-brand, and
 * register depth that the bare entries could not have without becoming
 * region-bound.
 *
 * Dependency: requires ticket-locale-tier3-he-tr to have landed (anchor
 * expects tr-TR as the last entry in the tier-3 GUIDES block).
 *
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/languageNativeness.ts",
);

// ═════════════════════════════════════════════════════════════════
// Edit 1 - Append it-IT and pl-PL to tier-3 GUIDES block
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the last tr-TR entry's closing line (contains the unique
// 'İyi çalışmalar' Turkish sign-off discussion).

const E1_OLD = `    "TONE: respectful-but-direct. Turkish B2B values: explicit recognition of seniority and titles in first contact (using Bey / Hanım), clear logical structure, and tangible business outcomes over abstract claims. Anatolian / conservative prospects expect more relationship-building preamble before the pitch; Istanbul tech / startup prospects expect faster, more direct outreach. Avoid hype words ('benzersiz', 'sektör lideri' without source, 'devrim') which read as advertising. Sign-offs: 'Saygılarımla' (most formal, traditional / Anatolian appropriate), 'İyi çalışmalar' (cordial, the standard B2B sign-off — literally 'good work'), 'Teşekkürler' (more casual, Istanbul tech appropriate). Choose sign-off to match the opening register and the prospect's sector.",
};`;

const E1_NEW = `    "TONE: respectful-but-direct. Turkish B2B values: explicit recognition of seniority and titles in first contact (using Bey / Hanım), clear logical structure, and tangible business outcomes over abstract claims. Anatolian / conservative prospects expect more relationship-building preamble before the pitch; Istanbul tech / startup prospects expect faster, more direct outreach. Avoid hype words ('benzersiz', 'sektör lideri' without source, 'devrim') which read as advertising. Sign-offs: 'Saygılarımla' (most formal, traditional / Anatolian appropriate), 'İyi çalışmalar' (cordial, the standard B2B sign-off — literally 'good work'), 'Teşekkürler' (more casual, Istanbul tech appropriate). Choose sign-off to match the opening register and the prospect's sector.",

  "it-IT":
    "Italian-Italy (it-IT): Italy is the primary Italian B2B adtech market. The base Italian (it) guide covers moderate localization with established adtech terms (conversione, targeting [kept], installazione, retention or fidelizzazione, traffico, creatività, audience [kept], pre-bid [kept, standard], lookalike [or 'pubblico simile'], cohort, geo-targeting); that all still applies. This regional entry adds Italy-specific city, currency, peer-brand, and register depth on top of the base it guide. " +
    "REGIONAL CULTURAL SPLIT: Italian B2B has a meaningful North vs Center vs South split. Industrial-North (Milano, Torino, Genova, Bologna, Brescia, Verona) is the commercial / industrial / financial heart; faster-paced, more international, English-tolerant in tech contexts. Bureaucratic-Center (Roma) is government / state-owned-enterprise / institutional; slower, more formal, prefers Italian over English borrowings. South / Mezzogiorno (Napoli, Bari, Palermo, Catania, Salerno) has smaller but growing B2B; values relationship-building, family / personal connections. Identify the prospect's HQ city and adjust pace and register accordingly. " +
    "REGISTER LAYERS: Italian B2B uses formal Lei register for cold outreach; never tu for first contact. 'Lei' is the third-person singular polite form (analogous to Spanish usted or German Sie). Verbs conjugate to third-person singular even though the recipient is being addressed directly: 'Vorrei proporLe una collaborazione' (I would like to propose a collaboration TO YOU, using the Le clitic). The plural polite form 'Loro' (third-person plural) is archaic and not used in modern B2B; use Lei for single recipients, voi for plural informal contexts only. The polite imperative uses the subjunctive: 'Mi faccia sapere' (Let me know), not 'Fammi sapere' (which would be tu register). " +
    "ORTHOGRAPHY: Standard Italian orthography. Apostrophes for elision (l'azienda, dell'industria, un'opportunità — feminine un' with apostrophe, masculine un without). Accented vowels matter: è (is, with grave) vs e (and, no accent); è / é distinction (perché has acute, caffè has grave). Numbers use European convention: period as thousands separator, comma as decimal — '€1.234.567,89'. Percentages use % symbol (12%), never 'per cento' spelled out in B2B writing. " +
    "CURRENCY: EUR (€). Standard European separators: period thousands, comma decimal. '€1.234.567,89' for formal documents; '€1,2 milioni' or '1,2 milioni di euro' for amounts above 1M in body text. For very large figures: 'miliardo' (billion) — '€1 miliardo'. Italian writes the currency symbol after the amount in formal contexts ('1.500,00 €') but the prefix form '€1.500,00' is universally accepted on chat and modern B2B. " +
    "CITY/MARKET REFERENCES: " +
    "Milano (Milan, the commercial and financial capital; Borsa Italiana / FTSE MIB stock exchange; Porta Nuova for finance HQs; Brera and Quadrilatero della Moda for fashion; Bicocca / Lambrate for tech / startup; Linate / Malpensa airports). " +
    "Torino (Turin, the industrial capital; Stellantis / Fiat headquarters; aerospace / Leonardo). " +
    "Roma (the capital; government, state-owned enterprises — Eni, Enel, Leonardo, Poste Italiane, RAI). " +
    "Bologna (food / packaging / mechanical engineering — Ducati nearby). " +
    "Genova (shipping / Banca Carige / port — the largest Italian port). " +
    "Firenze (Florence; fashion, leather, banking — Gucci, Salvatore Ferragamo, Monte dei Paschi historically). " +
    "Venezia / Padova / Verona (Veneto industrial corridor; fashion, mechanical, glass). " +
    "Napoli (Naples; growing SME hub, food / Mezzogiorno tech). " +
    "Bari / Palermo / Catania (Southern hubs; smaller B2B but expanding). " +
    "PEER BRANDS by tier: " +
    "Enterprise / state and finance tier: Eni (energy major), Enel (utilities), Generali (insurance, the largest Italian insurer), UniCredit (banking, the largest Italian bank), Intesa Sanpaolo (banking), Banco BPM, Mediobanca (investment banking), Poste Italiane (post + bank + insurance + telco), Telecom Italia / TIM (telco), Mediaset (private broadcaster), Sky Italia, RAI (public broadcaster), Leonardo (defense / aerospace). " +
    "Industrial tier: Fiat / Stellantis (automotive, multinational after PSA merger), Ferrari (luxury automotive), Lamborghini (luxury automotive, VW Group), Lavazza (coffee), illy (coffee, Trieste), Barilla (pasta), Ferrero (Nutella, Kinder, Tic Tac), Campari Group (Aperol, Negroni vermouth), Pirelli (tyres), Luxottica (now EssilorLuxottica, eyewear), Prada, Armani, Versace, Gucci (Kering), Bottega Veneta, Salvatore Ferragamo, Moncler, Brunello Cucinelli. " +
    "Tech / digital-native tier: Subito.it (classifieds), Immobiliare.it (real estate), Telepass (electronic tolling / mobility), Satispay (fintech / payments), Nexi (the dominant Italian payments group, includes Nets and SIA), Esselunga (online grocery), DoveConviene / ShopFully (retail tech), Bending Spoons (mobile apps, IPO 2024), Musixmatch (lyrics tech), Octo Telematics (telematics / insurance tech), Tinaba (mobile banking). " +
    "Match peer references to prospect's company tier: enterprise / industrial references for traditional sectors, tech-tier references for SaaS / e-commerce / fintech / mobile. " +
    "TONE: formal-warm, structured. Italian B2B values: explicit professional respect in opening, clear logical progression, concrete examples, and avoiding direct sales-y hype. Avoid hype words ('rivoluzionario' without source, 'unico nel suo genere', 'leader di settore' without numbers) which read as advertising. Sign-offs: 'Cordiali saluti' (formal standard, most common B2B), 'Distinti saluti' (most formal, very respectful), 'Un cordiale saluto' (slightly warmer, modern B2B), 'A presto' (casual / warm thread, NOT cold). Choose sign-off to match opening: 'Salve' / 'Buongiorno' opening pairs with 'Cordiali saluti' close; 'Gentile' opening pairs with 'Distinti saluti' close.",

  "pl-PL":
    "Polish-Poland (pl-PL): Poland is the only major Polish B2B adtech market. The base Polish (pl) guide covers heavy localization with established adtech terms (retencja, instalacja, konwersja, targetowanie, atrybucja, lookalike or 'podobni użytkownicy', cohort or 'kohorta', publisher or 'wydawca'); that all still applies. This regional entry adds Poland-specific city, currency, peer-brand, and Pan/Pani register depth on top of the base pl guide. " +
    "REGISTER LAYERS: Polish B2B uses the formal Pan (Mr.) / Pani (Ms.) register for cold outreach. The polite address pattern is third-person singular with Pan / Pani: 'czy mógłby Pan zarezerwować czas' (would you Mr. reserve time) — the verb conjugates to third-person (mógłby) and Pan / Pani functions as the formal pronoun. NEVER use second-person ty (you-informal) for cold B2B; it's the equivalent of using 'du' in a German first contact, immediately tags the writer as unfamiliar with Polish business norms. Once warm, ty is acceptable but only after the prospect signals it (mutual transition signals: 'Mówmy sobie po imieniu' — let's call each other by first names). " +
    "GREETING REGISTERS: " +
    "'Dzień dobry, {NAME},' — standard chat opening, works through the day. " +
    "'Witam Pana {LastName},' / 'Witam Panią {LastName},' — slightly more formal, email-equivalent. " +
    "'Szanowny Panie {LastName},' / 'Szanowna Pani {LastName},' — most formal, used in serious business letters; rare on WhatsApp / Telegram / Slack. " +
    "'Cześć' — informal / young-tech register, NEVER for cold B2B regardless of channel. " +
    "ORTHOGRAPHY: Polish Latin script with diacritics: ą, ć, ę, ł, ń, ó, ś, ź, ż. Get these right; missing diacritics read as foreign-template (e.g., 'Dzień dobry' not 'Dzien dobry'). Numbers use space as thousands separator and comma as decimal: '1 234 567,89' (NOT period, NOT comma for thousands). Percentages use % symbol (12%), never 'procent' spelled out in B2B. " +
    "CURRENCY: PLN (złoty, symbol zł). Currency follows the amount with a space: '1 234 567,89 zł'. The abbreviation 'tys.' (tysięcy / thousands) is informal-context: '5 tys. zł' means 5,000 PLN. 'mln' (milionów) is widely used: '1,2 mln zł' means 1.2 million PLN. For formal B2B, use full numerals with space separators. Some Polish B2B contexts also quote in EUR (€) for multinational dealings; both are normal. " +
    "CITY/MARKET REFERENCES: " +
    "Warszawa (Warsaw, the capital and enterprise / finance / multinational HQ hub — banking, insurance, big tech offices; Mokotów, Wola, Śródmieście for office districts; Warsaw Stock Exchange / GPW). " +
    "Kraków (Cracow, the tech-startup capital — Aleja 29 Listopada / Zabłocie / Kazimierz tech parks; large international engineering hubs from EPAM, Akamai, Cisco, IBM, Capgemini, ABB). " +
    "Wrocław (Breslau, major tech / R&D — IBM Wrocław, Volvo IT, Nokia, Capgemini, large student population from Wrocław University and Wrocław University of Science and Technology). " +
    "Trójmiasto (Tricity: Gdańsk + Sopot + Gdynia; maritime / shipping / SaaS — Gdańsk has Allegro engineering, IHS Markit, Lufthansa Systems). " +
    "Poznań (manufacturing / trade fairs — Międzynarodowe Targi Poznańskie / Poznań International Fair; Volkswagen, GlaxoSmithKline). " +
    "Łódź (logistics / BPO / textile; cheap office space, large outsourcing centers). " +
    "Katowice (industrial Silesia / Górnośląski Okręg Przemysłowy; mining, energy, ArcelorMittal Poland). " +
    "Rzeszów (south-east, Aviation Valley / Dolina Lotnicza — aerospace cluster including Pratt & Whitney Rzeszów, Lockheed Martin). " +
    "PEER BRANDS by tier: " +
    "Enterprise / state and finance tier: PKO Bank Polski (largest, state-controlled), Bank Pekao, mBank, ING Bank Śląski, Santander Bank Polska, BNP Paribas Polska, Alior Bank, PZU (insurance, the dominant Polish insurer with state ownership), Orlen (oil / petrochemical / convenience retail after Lotos merger, state-controlled), KGHM (copper / mining, state), JSW (coking coal, state), PGE / Tauron / Enea / Energa (utilities — first three state-controlled, Energa absorbed into Orlen), Orange Polska (telco, formerly TP S.A.), Play (now P4, part of iliad), T-Mobile Polska, Plus / Polkomtel. " +
    "Retail / FMCG tier: Biedronka (the dominant discount retailer, owned by Portuguese Jerónimo Martins — typically considered the largest food retailer by revenue in Poland), Lidl Polska, Kaufland, Carrefour Polska, Auchan Polska, Netto, Żabka (the dominant convenience chain, formerly Czech CVC), Empik (books / media / e-commerce), CCC (footwear, also operates eobuwie.pl), LPP (Polish fashion holding — Reserved, Cropp, House, Mohito, Sinsay), Pepco (discount). " +
    "Tech / digital-native tier: Allegro (the dominant Polish e-commerce platform — has roughly the market position Amazon holds in the US; publicly listed), InPost (parcel lockers / Paczkomaty — the Polish e-commerce delivery standard, internationally expanding), DocPlanner (znanylekarz.pl — Polish doctor-booking platform that expanded internationally), Brainly (Q&A / education), Booksy (beauty bookings, international expansion), Vinted (Lithuanian-founded but heavy PL presence), Tpay / Przelewy24 (payments; Przelewy24 acquired by PayPro), DataWalk (analytics / law-enforcement tools, publicly listed), Asseco Poland (enterprise software, dominant in Polish public-sector IT — banking, government, healthcare), Comarch (enterprise software, ERP), Ten Square Games (mobile gaming), CD Projekt (gaming, Witcher / Cyberpunk 2077 — Warsaw HQ). " +
    "Match peer references to prospect's company tier: enterprise / state-finance references for traditional sectors, tech / digital-native references for SaaS / e-commerce / fintech / mobile gaming. Mixing tiers (referencing CD Projekt when pitching PKO BP) reads as foreign-template. " +
    "TONE: formal-respectful, structured. Polish B2B values: explicit respect via Pan / Pani throughout the message, clear logical structure (Polish business writing often uses explicit 'Po pierwsze... Po drugie... Po trzecie' enumeration), and concrete deliverables with hard numbers over abstract claims. Avoid hype words ('rewolucyjny' without source, 'wiodący' without numbers, 'jedyny w swoim rodzaju') which read as advertising. Sign-offs: 'Z poważaniem' (formal standard, most common B2B), 'Z wyrazami szacunku' (most formal, very respectful — for serious correspondence), 'Pozdrawiam' (cordial, modern professional default for warm-but-respectful tone), 'Pozdrawiam serdecznie' (warmer, but still B2B-appropriate). Match sign-off to opening: 'Szanowny Panie' pairs with 'Z wyrazami szacunku'; 'Dzień dobry' pairs with 'Pozdrawiam' or 'Z poważaniem'.",
};`;

const E1_MARKER = `"it-IT":
    "Italian-Italy (it-IT):`;

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

// Pre-flight: tier-3 tr-TR must be present (depends on prior ticket)
if (!source.includes(`"tr-TR":\n    "Turkish-Turkey (tr-TR):`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-he-tr to have landed first");
  console.error("[FATAL] missing expected tier-3 tr-TR entry in GUIDES");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["guides-tier3-it-pl-append", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  // it-IT content checks
  itITAdded:                source.includes(`"it-IT":\n    "Italian-Italy (it-IT):`),
  itITHasCulturalSplit:     source.includes(`REGIONAL CULTURAL SPLIT`),
  itITHasLeiRegister:       source.includes(`formal Lei register`) && source.includes(`never tu for first contact`),
  itITHasOrthography:       source.includes(`Apostrophes for elision`),
  itITHasEURCurrency:       source.includes(`CURRENCY: EUR (€)`) && source.includes(`€1.234.567,89`),
  itITHasMilanFinance:      source.includes(`Milano (Milan, the commercial and financial capital`),
  itITHasTurinIndustry:     source.includes(`Torino (Turin, the industrial capital`),
  itITHasRomaState:         source.includes(`Roma (the capital; government, state-owned enterprises`),
  itITHasEnterpriseTier:    source.includes(`Eni (energy major)`) && source.includes(`Generali (insurance`),
  itITHasIndustrialTier:    source.includes(`Fiat / Stellantis`) && source.includes(`Ferrari`),
  itITHasTechTier:          source.includes(`Subito.it`) && source.includes(`Satispay`),
  itITHasSignoffs:          source.includes(`'Cordiali saluti'`) && source.includes(`'Distinti saluti'`),
  // pl-PL content checks
  plPLAdded:                source.includes(`"pl-PL":\n    "Polish-Poland (pl-PL):`),
  plPLHasPanPaniRegister:   source.includes(`formal Pan (Mr.) / Pani (Ms.) register`),
  plPLRejectsTy:            source.includes(`NEVER use second-person ty (you-informal) for cold B2B`),
  plPLHasGreetingRegisters: source.includes(`'Dzień dobry, {NAME},'`) && source.includes(`'Szanowny Panie {LastName},'`),
  plPLRejectsCzesc:         source.includes(`'Cześć' — informal / young-tech register, NEVER for cold B2B`),
  plPLHasDiacritics:        source.includes(`Polish Latin script with diacritics: ą, ć, ę, ł, ń, ó, ś, ź, ż`),
  plPLHasPLNCurrency:       source.includes(`CURRENCY: PLN (złoty`) && source.includes(`1 234 567,89 zł`),
  plPLHasWarszawa:          source.includes(`Warszawa (Warsaw, the capital`),
  plPLHasKrakow:            source.includes(`Kraków (Cracow, the tech-startup capital`),
  plPLHasTricity:           source.includes(`Trójmiasto (Tricity: Gdańsk + Sopot + Gdynia`),
  plPLHasRzeszowAviation:   source.includes(`Aviation Valley / Dolina Lotnicza`),
  plPLHasEnterpriseTier:    source.includes(`PKO Bank Polski`) && source.includes(`PZU (insurance`),
  plPLHasRetailTier:        source.includes(`Biedronka (the dominant discount retailer`) && source.includes(`Żabka (the dominant convenience chain`),
  plPLHasTechTier:          source.includes(`Allegro (the dominant Polish e-commerce platform`) && source.includes(`InPost (parcel lockers`),
  plPLHasGamingTier:        source.includes(`CD Projekt`),
  plPLHasSignoffs:          source.includes(`'Z poważaniem'`) && source.includes(`'Pozdrawiam'`),

  // Untouched / regression checks
  trTRUntouched:            source.includes(`"tr-TR":\n    "Turkish-Turkey (tr-TR):`),
  heILUntouched:            source.includes(`"he-IL":\n    "Hebrew-Israel (he-IL):`),
  koKRUntouched:            source.includes(`"ko-KR":\n    "Korean-South Korea (ko-KR):`),
  jaJPUntouched:            source.includes(`"ja-JP":\n    "Japanese-Japan (ja-JP):`),
  bnINUntouched:            source.includes(`"bn-IN":\n    "Bengali-India (bn-IN):`),
  hiINUntouched:            source.includes(`"hi-IN":\n    "Hindi-India (hi-IN):`),
  bnBDUntouched:            source.includes(`"bn-BD":\n    "Bengali-Bangladesh (bn-BD):`),
  bareItUntouched:          source.includes(`Italian (it): Moderate localization`),
  barePlUntouched:          source.includes(`Polish (pl): Heavy localization`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  ptBRUntouched:            source.includes(`Brazilian Portuguese (pt-BR)`),
  deCHUntouched:            source.includes(`Swiss High German (de-CH;`),
  buildNativenessUntouched: source.includes(`export function buildNativenessBlock`),
};
console.log("[language-nativeness-it-pl] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[language-nativeness-it-pl] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[language-nativeness-it-pl] DONE");
