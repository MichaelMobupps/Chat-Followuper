#!/usr/bin/env node
/**
 * Ticket locale-tier3-it-pl, patch 2/3: services/messagePrompts.ts
 *
 * One atomic edit: append it-IT and pl-PL entries to GREETING_TABLE,
 * after the existing tr-TR entry.
 *
 * Notes on greeting forms:
 *   it-IT: Overrides the bare-it form ("Ciao {NAME},") for cold B2B.
 *          "Ciao" is too informal for cold; default to "Salve {NAME},"
 *          (formal-neutral, works with Lei register) or
 *          "Buongiorno {NAME}," (slightly more formal). Reserve "Ciao"
 *          for warm threads.
 *
 *   pl-PL: Overrides the bare-pl form ("Cześć {NAME},"). "Cześć" is
 *          informal-young register; cold B2B Polish uses "Dzień dobry,
 *          {NAME}" (formal, "Good day") or "Szanowny Panie/Pani {NAME},"
 *          (most formal, "Respected Sir/Madam"). For chat default to
 *          "Dzień dobry, {NAME},".
 *
 * Dependency: requires ticket-locale-tier3-he-tr to have landed (anchor
 * expects tr-TR as the last entry of the tier-3 GREETING_TABLE block).
 *
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

const E1_OLD = `  "tr-TR": { withName: "Merhaba {NAME},", withoutName: "Merhaba,", note: "Turkey. Turkish B2B uses formal Siz register for cold outreach; never Sen for first contact. 'Merhaba {NAME},' is standard chat opening; 'Sayın {NAME},' for more formal email-equivalent register. Currency TRY (₺), with 'bin' (thousand) and 'milyon' (million) for larger amounts in informal contexts; full numerals '₺1.234.567' for formal B2B (note European-style period thousands separator and comma decimal). Cities: İstanbul (the commercial center, often subdivided into Avrupa Yakası and Asya Yakası; Maslak, Levent, and Etiler for finance / enterprise tech; Beşiktaş and Şişli for media), Ankara (capital, government, defense, Turkish Aerospace), İzmir (export hub, manufacturing), Bursa (automotive), Antalya (tourism), Gaziantep (regional B2B). Peer brands - tech / digital-native tier: Trendyol (Alibaba-backed e-commerce), Hepsiburada, Getir (quick commerce), Yemeksepeti (food delivery, Delivery Hero), Migros Sanal (online grocery), Türkiye İş Bankası's BiP, Papara (fintech), İninal (prepaid). Traditional / chaebol-equivalent tier: Türkiye İş Bankası, Garanti BBVA, Akbank, Yapı Kredi, Ziraat Bankası (state), Türk Telekom, Turkcell, Vodafone Turkey, Türk Hava Yolları (Turkish Airlines, THY), Pegasus, Migros Ticaret, BİM, A101, ŞOK (discount retail), Koç Holding, Sabancı Holding, Doğuş Holding. Match peer tier to prospect's size: holding-group references for enterprise, tech-tier references for SaaS / e-commerce / fintech / mobile gaming." },
};`;

const E1_NEW = `  "tr-TR": { withName: "Merhaba {NAME},", withoutName: "Merhaba,", note: "Turkey. Turkish B2B uses formal Siz register for cold outreach; never Sen for first contact. 'Merhaba {NAME},' is standard chat opening; 'Sayın {NAME},' for more formal email-equivalent register. Currency TRY (₺), with 'bin' (thousand) and 'milyon' (million) for larger amounts in informal contexts; full numerals '₺1.234.567' for formal B2B (note European-style period thousands separator and comma decimal). Cities: İstanbul (the commercial center, often subdivided into Avrupa Yakası and Asya Yakası; Maslak, Levent, and Etiler for finance / enterprise tech; Beşiktaş and Şişli for media), Ankara (capital, government, defense, Turkish Aerospace), İzmir (export hub, manufacturing), Bursa (automotive), Antalya (tourism), Gaziantep (regional B2B). Peer brands - tech / digital-native tier: Trendyol (Alibaba-backed e-commerce), Hepsiburada, Getir (quick commerce), Yemeksepeti (food delivery, Delivery Hero), Migros Sanal (online grocery), Türkiye İş Bankası's BiP, Papara (fintech), İninal (prepaid). Traditional / chaebol-equivalent tier: Türkiye İş Bankası, Garanti BBVA, Akbank, Yapı Kredi, Ziraat Bankası (state), Türk Telekom, Turkcell, Vodafone Turkey, Türk Hava Yolları (Turkish Airlines, THY), Pegasus, Migros Ticaret, BİM, A101, ŞOK (discount retail), Koç Holding, Sabancı Holding, Doğuş Holding. Match peer tier to prospect's size: holding-group references for enterprise, tech-tier references for SaaS / e-commerce / fintech / mobile gaming." },
  "it-IT": { withName: "Salve {NAME},", withoutName: "Salve,", note: "Italy. Italian B2B uses formal Lei register for cold outreach; never tu for first contact. 'Salve {NAME},' is the formal-neutral chat opening (works for any Lei context); 'Buongiorno {NAME},' is a slightly more formal alternative. 'Ciao' is informal-young register; reserve for warm threads only. 'Gentile {NAME},' or 'Egregio {NAME},' for the most formal email-equivalent register (rare on WhatsApp / Telegram / Slack). Currency EUR (€), with European separators ('€1.234.567,89' — period thousands, comma decimal). Cities split: industrial-North (Milano for finance / fashion / tech, Torino for automotive / Fiat / Stellantis HQ, Genova for shipping / finance), bureaucratic-Center (Roma for government / state-owned, Bologna for food / packaging, Firenze for fashion / leather), South / Mezzogiorno (Napoli, Bari, Palermo, Catania — smaller B2B but growing). Peer brands - enterprise tier: Eni (energy), Enel (utilities), Generali (insurance), UniCredit, Intesa Sanpaolo, Banco BPM, Mediobanca, Poste Italiane (post + bank + insurance + telco), Telecom Italia / TIM, Mediaset, Sky Italia, RAI, Leonardo (defense). Industrial tier: Fiat / Stellantis, Ferrari, Lamborghini, Lavazza, Barilla, Ferrero, Campari, Pirelli, Luxottica (now EssilorLuxottica), Prada, Armani, Versace, Gucci (Kering). Tech / digital-native tier: Subito.it (classifieds), Immobiliare.it (real estate), Telepass (toll / mobility), Satispay (fintech), Nexi (payments), Esselunga (online grocery), DoveConviene / ShopFully (retail tech), Bending Spoons (mobile apps), Musixmatch (lyrics tech). Match peer tier to prospect's company: enterprise / industrial for traditional sectors, tech / digital-native for SaaS / e-commerce / fintech / mobile." },
  "pl-PL": { withName: "Dzień dobry, {NAME},", withoutName: "Dzień dobry,", note: "Poland. Polish B2B uses formal Pan / Pani register for cold outreach (the polite third-person address). 'Dzień dobry, {NAME},' is the standard chat opening (works through the day); 'Witam Pana {LastName},' or 'Witam Panią {LastName},' for more formal email-equivalent register. 'Cześć' is informal-young register; reserve for established warm threads only. 'Szanowny Panie / Szanowna Pani' for very formal contexts (rare on WhatsApp / Telegram / Slack). Currency PLN (zł), with space thousands and comma decimal: '1 234 567,89 zł' (space, not period or comma, as the thousands separator). Cities split: Warszawa (capital, enterprise / finance / multinational HQs), Kraków (tech-startup capital, Aleja 29 Listopada / Zabłocie tech parks), Wrocław (tech, EPAM, IBM, Capgemini), Gdańsk / Trójmiasto (Tricity: Gdańsk + Sopot + Gdynia, maritime / SaaS / shipping), Poznań (manufacturing / trade fairs), Łódź (logistics / textile), Katowice (industrial Silesia). Peer brands - enterprise tier: PKO Bank Polski (largest, state-controlled), Bank Pekao, mBank, ING Bank Śląski, Santander Bank Polska, BNP Paribas Polska, PZU (insurance, the dominant Polish insurer), Orlen (oil / petrochemical, state), KGHM (copper / mining, state), JSW (coal, state), PGE / Tauron / Enea (utilities), Orange Polska, Play (now P4 / iliad), T-Mobile Polska, Plus / Polkomtel. Retail / FMCG: Biedronka (Jeronimo Martins, the dominant discount retailer), Lidl Polska, Kaufland, Carrefour Polska, Auchan Polska, Żabka (the dominant convenience chain), Empik (books / media), CCC (footwear), LPP (Reserved, Cropp, House, Mohito, Sinsay — Polish fashion holding). Tech / digital-native tier: Allegro (the dominant Polish e-commerce platform, comparable to Amazon dominance in other markets), InPost (parcel lockers, the Polish e-commerce delivery standard), DocPlanner (znanylekarz.pl), Brainly, Booksy, Vinted (Lithuanian but heavy PL presence), Tpay / Przelewy24 (payments), DataWalk (analytics), Asseco (enterprise software, dominant in Polish public-sector IT). Match peer tier to prospect's company: enterprise / industrial for traditional sectors, tech / digital-native for SaaS / e-commerce / fintech / mobile." },
};`;

const E1_MARKER = `"it-IT": { withName: "Salve {NAME},"`;

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

// Pre-flight: tier-3 tr-TR must be present
if (!source.includes(`"tr-TR": { withName: "Merhaba {NAME},"`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-he-tr to have landed first");
  console.error("[FATAL] missing expected tier-3 tr-TR entry in GREETING_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["greeting-it-pl-add", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  // it-IT content checks
  itITAdded:                  source.includes(`"it-IT": { withName: "Salve {NAME},"`),
  itITLeiRegister:            source.includes(`formal Lei register`) && source.includes(`never tu for first contact`),
  itITCiaoWarning:            source.includes(`'Ciao' is informal-young register; reserve for warm threads only`),
  itITHasEUR:                 source.includes(`Currency EUR (€)`),
  itITHasEurSeparators:       source.includes(`€1.234.567,89`),
  itITHasNorthSouth:          source.includes(`industrial-North (Milano`) &&
                              source.includes(`South / Mezzogiorno (Napoli`),
  itITEnterpriseTier:         source.includes(`Eni (energy), Enel (utilities)`) &&
                              source.includes(`UniCredit, Intesa Sanpaolo`),
  itITIndustrialTier:         source.includes(`Fiat / Stellantis, Ferrari, Lamborghini`),
  itITTechTier:               source.includes(`Subito.it (classifieds)`) &&
                              source.includes(`Satispay (fintech)`),
  // pl-PL content checks
  plPLAdded:                  source.includes(`"pl-PL": { withName: "Dzień dobry, {NAME},"`),
  plPLPanPaniRegister:        source.includes(`formal Pan / Pani register`),
  plPLCzescWarning:           source.includes(`'Cześć' is informal-young register`),
  plPLHasPLN:                 source.includes(`Currency PLN (zł)`),
  plPLHasSpaceSeparators:     source.includes(`1 234 567,89 zł`),
  plPLHasCityList:            source.includes(`Warszawa (capital`) &&
                              source.includes(`Kraków (tech-startup capital`),
  plPLHasTricity:             source.includes(`Trójmiasto (Tricity: Gdańsk + Sopot + Gdynia`),
  plPLEnterpriseTier:         source.includes(`PKO Bank Polski (largest, state-controlled)`) &&
                              source.includes(`PZU (insurance`),
  plPLRetailTier:             source.includes(`Biedronka (Jeronimo Martins`) &&
                              source.includes(`Żabka (the dominant convenience chain)`),
  plPLTechTier:               source.includes(`Allegro (the dominant Polish e-commerce platform`) &&
                              source.includes(`InPost (parcel lockers`),
  // Untouched checks
  bareItUntouched:            source.includes(`it: { withName: "Ciao {NAME},", withoutName: "Ciao,", note: "" },`),
  barePlUntouched:            source.includes(`pl: { withName: "Cześć {NAME},", withoutName: "Dzień dobry,", note: "Soft B2B WhatsApp register." },`),
  trTRUntouched:              source.includes(`"tr-TR": { withName: "Merhaba {NAME},"`),
  heILUntouched:              source.includes(`"he-IL": { withName: "שלום {NAME},"`),
  koKRUntouched:              source.includes(`"ko-KR": { withName: "{NAME} 님,"`),
  jaJPUntouched:              source.includes(`"ja-JP": { withName: "{NAME}様、"`),
  hiINUntouched:              source.includes(`"hi-IN": { withName: "Namaste {NAME},"`),
  tier3HeaderIntact:          source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:                source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:                source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  ptBRUntouched:              source.includes(`"pt-BR": { withName: "Olá {NAME},"`),
  deCHUntouched:              source.includes(`"de-CH": { withName: "Guten Tag {NAME},"`),
};
console.log("[message-prompts-it-pl] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[message-prompts-it-pl] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[message-prompts-it-pl] DONE");
