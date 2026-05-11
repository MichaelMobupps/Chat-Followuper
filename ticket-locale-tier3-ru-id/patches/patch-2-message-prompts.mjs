#!/usr/bin/env node
/**
 * Ticket locale-tier3-ru-id, patch 2/3: services/messagePrompts.ts
 *
 * One atomic edit: append ru-RU and id-ID entries to GREETING_TABLE,
 * after the existing pl-PL entry.
 *
 * Notes on greeting forms:
 *   ru-RU: Inherits the bare-ru form ("Здравствуйте, {NAME},"). The
 *          regional entry adds: RUB (₽) currency formatting, formal вы
 *          register (mandatory for cold; never ты), Yandex / Sber-anchored
 *          ecosystem context, Moscow / SPb / Yekaterinburg city tiers,
 *          enterprise (Gazprom, Sberbank, Yandex) vs tech (Tinkoff,
 *          Wildberries, Ozon, Avito) vs telco (MTS, Beeline, MegaFon)
 *          peer-brand tiering.
 *
 *   id-ID: Overrides the bare-id form ("Halo {NAME},") for cold B2B.
 *          "Halo" is acceptable but the formal Indonesian B2B greeting
 *          uses Bapak / Ibu honorifics: "Selamat pagi/siang/sore Bapak
 *          {NAME}," or "Yth. Bapak/Ibu {NAME},". For chat default to
 *          "Selamat pagi, Bapak/Ibu {NAME},". The bare "Halo" form is
 *          retained as fallback for unknown gender / less formal threads.
 *
 * Dependency: requires ticket-locale-tier3-it-pl to have landed (anchor
 * expects pl-PL as the last entry of the tier-3 GREETING_TABLE block).
 *
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

const E1_OLD = `  "pl-PL": { withName: "Dzień dobry, {NAME},", withoutName: "Dzień dobry,", note: "Poland. Polish B2B uses formal Pan / Pani register for cold outreach (the polite third-person address). 'Dzień dobry, {NAME},' is the standard chat opening (works through the day); 'Witam Pana {LastName},' or 'Witam Panią {LastName},' for more formal email-equivalent register. 'Cześć' is informal-young register; reserve for established warm threads only. 'Szanowny Panie / Szanowna Pani' for very formal contexts (rare on WhatsApp / Telegram / Slack). Currency PLN (zł), with space thousands and comma decimal: '1 234 567,89 zł' (space, not period or comma, as the thousands separator). Cities split: Warszawa (capital, enterprise / finance / multinational HQs), Kraków (tech-startup capital, Aleja 29 Listopada / Zabłocie tech parks), Wrocław (tech, EPAM, IBM, Capgemini), Gdańsk / Trójmiasto (Tricity: Gdańsk + Sopot + Gdynia, maritime / SaaS / shipping), Poznań (manufacturing / trade fairs), Łódź (logistics / textile), Katowice (industrial Silesia). Peer brands - enterprise tier: PKO Bank Polski (largest, state-controlled), Bank Pekao, mBank, ING Bank Śląski, Santander Bank Polska, BNP Paribas Polska, PZU (insurance, the dominant Polish insurer), Orlen (oil / petrochemical, state), KGHM (copper / mining, state), JSW (coal, state), PGE / Tauron / Enea (utilities), Orange Polska, Play (now P4 / iliad), T-Mobile Polska, Plus / Polkomtel. Retail / FMCG: Biedronka (Jeronimo Martins, the dominant discount retailer), Lidl Polska, Kaufland, Carrefour Polska, Auchan Polska, Żabka (the dominant convenience chain), Empik (books / media), CCC (footwear), LPP (Reserved, Cropp, House, Mohito, Sinsay — Polish fashion holding). Tech / digital-native tier: Allegro (the dominant Polish e-commerce platform, comparable to Amazon dominance in other markets), InPost (parcel lockers, the Polish e-commerce delivery standard), DocPlanner (znanylekarz.pl), Brainly, Booksy, Vinted (Lithuanian but heavy PL presence), Tpay / Przelewy24 (payments), DataWalk (analytics), Asseco (enterprise software, dominant in Polish public-sector IT). Match peer tier to prospect's company: enterprise / industrial for traditional sectors, tech / digital-native for SaaS / e-commerce / fintech / mobile." },
};`;

const E1_NEW = `  "pl-PL": { withName: "Dzień dobry, {NAME},", withoutName: "Dzień dobry,", note: "Poland. Polish B2B uses formal Pan / Pani register for cold outreach (the polite third-person address). 'Dzień dobry, {NAME},' is the standard chat opening (works through the day); 'Witam Pana {LastName},' or 'Witam Panią {LastName},' for more formal email-equivalent register. 'Cześć' is informal-young register; reserve for established warm threads only. 'Szanowny Panie / Szanowna Pani' for very formal contexts (rare on WhatsApp / Telegram / Slack). Currency PLN (zł), with space thousands and comma decimal: '1 234 567,89 zł' (space, not period or comma, as the thousands separator). Cities split: Warszawa (capital, enterprise / finance / multinational HQs), Kraków (tech-startup capital, Aleja 29 Listopada / Zabłocie tech parks), Wrocław (tech, EPAM, IBM, Capgemini), Gdańsk / Trójmiasto (Tricity: Gdańsk + Sopot + Gdynia, maritime / SaaS / shipping), Poznań (manufacturing / trade fairs), Łódź (logistics / textile), Katowice (industrial Silesia). Peer brands - enterprise tier: PKO Bank Polski (largest, state-controlled), Bank Pekao, mBank, ING Bank Śląski, Santander Bank Polska, BNP Paribas Polska, PZU (insurance, the dominant Polish insurer), Orlen (oil / petrochemical, state), KGHM (copper / mining, state), JSW (coal, state), PGE / Tauron / Enea (utilities), Orange Polska, Play (now P4 / iliad), T-Mobile Polska, Plus / Polkomtel. Retail / FMCG: Biedronka (Jeronimo Martins, the dominant discount retailer), Lidl Polska, Kaufland, Carrefour Polska, Auchan Polska, Żabka (the dominant convenience chain), Empik (books / media), CCC (footwear), LPP (Reserved, Cropp, House, Mohito, Sinsay — Polish fashion holding). Tech / digital-native tier: Allegro (the dominant Polish e-commerce platform, comparable to Amazon dominance in other markets), InPost (parcel lockers, the Polish e-commerce delivery standard), DocPlanner (znanylekarz.pl), Brainly, Booksy, Vinted (Lithuanian but heavy PL presence), Tpay / Przelewy24 (payments), DataWalk (analytics), Asseco (enterprise software, dominant in Polish public-sector IT). Match peer tier to prospect's company: enterprise / industrial for traditional sectors, tech / digital-native for SaaS / e-commerce / fintech / mobile." },
  "ru-RU": { withName: "Здравствуйте, {NAME},", withoutName: "Здравствуйте,", note: "Russia. Russian B2B uses formal вы register (capitalized Вы in formal correspondence is dated but still acceptable in very formal contexts; modern B2B uses lowercase вы); never ты for cold outreach. 'Здравствуйте, {NAME},' is the standard chat opening; 'Добрый день, {NAME},' is a slightly softer alternative that also works. 'Привет' is informal-young register; never for cold B2B. 'Уважаемый/Уважаемая {LastName}' is the most formal email-equivalent opener (gendered: Уважаемый for male, Уважаемая for female). Currency RUB (₽), with space thousands and comma decimal: '1 234 567,89 ₽' (European-style separators; ruble symbol after amount with space). For larger amounts: 'млн' (million) and 'млрд' (billion) are standard ('1,5 млн ₽'). Cities: Москва (Moscow, the commercial center; ~13M; finance, enterprise, government concentrated in central Moscow and Moskva-City for business towers), Санкт-Петербург (St. Petersburg, ~5.5M; tech, culture, oil/gas Gazprom HQ post-relocation), Екатеринбург (Yekaterinburg, ~1.5M; industrial Urals capital), Новосибирск (Novosibirsk, ~1.6M; Siberian tech / Akademgorodok), Казань (Kazan, ~1.3M; IT cluster Innopolis nearby), Нижний Новгород, Краснодар (~1M, growing southern tech). Peer brands - enterprise / state tier: Газпром (Gazprom, gas / energy), Роснефть (Rosneft, oil), Лукойл (LUKOIL, oil), Сбер / Сбербанк (Sberbank, the dominant bank; also includes SberDevices, SberMarket, SberAuto, SberCloud, SberMobile super-app ecosystem), ВТБ (VTB, banking), Альфа-Банк (Alfa-Bank), Газпромбанк (Gazprombank), Россельхозбанк (Rosselkhozbank), Норильский никель (Nornickel, metals), Северсталь (Severstal, steel), Магнит (Magnit, retail), Х5 Retail Group (X5: Pyaterochka, Perekrestok, Karusel chains), Билайн (Beeline / VEON), МТС (MTS), МегаФон (MegaFon, Tele2 subsidiary), Аэрофлот (Aeroflot). Tech / digital-native tier: Яндекс (Yandex — search, taxi, food delivery, e-commerce, music, navigation, the dominant Russian tech ecosystem), VK / ВКонтакте (VK Group — social, mail, music, classifieds, gaming Mail.Ru), Тинькофф / Т-Банк (T-Bank, neobank), Ozon (e-commerce, publicly listed Nasdaq), Wildberries (e-commerce, the largest by GMV), Авито (Avito, classifieds), HeadHunter / hh.ru (jobs), Skyeng / Skypro (edtech), Делимобиль (Delimobil, carsharing), Самокат / Лавка (Samokat / Yandex Lavka, quick commerce), Kaspi.kz (Kazakhstan-based but heavy ru-RU presence in adjacent markets). Match peer tier to prospect's company: enterprise / state references for traditional sectors and resource industries, tech / digital-native for SaaS / e-commerce / fintech / mobile gaming." },
  "id-ID": { withName: "Selamat pagi, Bapak/Ibu {NAME},", withoutName: "Selamat pagi, Bapak/Ibu,", note: "Indonesia. Indonesian B2B uses formal Bapak (Mr.) / Ibu (Ms.) honorifics for cold outreach; never use first name alone. The honorifics precede the name: 'Bapak Budi' / 'Ibu Sari'. Common Indonesian-Chinese / Indonesian-of-Chinese-descent names sometimes carry 'Pak' / 'Bu' as short forms but cold B2B should default to full 'Bapak' / 'Ibu'. Time-of-day greetings rotate: Selamat pagi (morning ~5am-11am), Selamat siang (~11am-3pm), Selamat sore (~3pm-7pm), Selamat malam (evening ~7pm onwards); use the form matching the time the prospect will read. 'Halo Pak/Bu {NAME},' is acceptable on WhatsApp / chat for less formal contexts. 'Yth. Bapak/Ibu {LastName},' (Yang terhormat / 'The respected') is the most formal email-equivalent register, less common on chat. Currency IDR (Rp), with period thousands and comma decimal: 'Rp1.234.567,89' (note: NOT comma thousands; European-style separators). For larger amounts: 'rb' (ribu / thousand) and 'jt' (juta / million) and 'M' (miliar / billion) are common in informal contexts; full numerals 'Rp1.000.000' for formal B2B. The 'IDR' three-letter code is rare in body text; use 'Rp' prefix. Cities: Jakarta (the commercial capital, ~10M city + 30M+ Jabodetabek metro; CBD around Sudirman / Kuningan / Thamrin for finance and enterprise; SCBD for tech), Surabaya (~3M, second-largest, manufacturing / port / East Java), Bandung (~2.5M, tech / textile / education / West Java), Medan (~2.4M, Sumatra commercial hub), Semarang, Makassar (eastern Indonesia gateway), Bali / Denpasar (tourism but growing tech). Peer brands - enterprise / state tier: Bank Mandiri (largest state bank), BCA (Bank Central Asia, the dominant private bank), BNI (Bank Negara Indonesia, state), BRI (Bank Rakyat Indonesia, state, microfinance focus), CIMB Niaga, Bank Danamon, Astra International (the dominant Indonesian conglomerate — automotive, agribusiness, mining, financial services, infrastructure, IT — Toyota / Daihatsu / Isuzu / Honda / BMW / Peugeot dealerships in Indonesia), Pertamina (state oil and gas), PLN (state electricity), Telkom Indonesia (state telco; includes Telkomsel which is the dominant mobile operator), Indosat Ooredoo Hutchison (telco), XL Axiata (telco), Garuda Indonesia (state airline). Tech / digital-native tier: GoTo Group (the largest Indonesian tech holding — Gojek for ride-hailing / food / payments + Tokopedia for e-commerce, post-merger), Grab Indonesia (Singapore HQ but dominant Indonesian player), Bukalapak (e-commerce), Traveloka (online travel agent, regional SEA), OVO (digital wallet, Grab-affiliated), DANA (digital wallet, Ant Group + Emtek), LinkAja (digital wallet, state-backed via Telkomsel / Pertamina / BRI / BNI / Mandiri consortium), Blibli (e-commerce, Djarum group), Tiket.com (travel), Akulaku (BNPL / fintech), Kredivo (BNPL), Ruangguru (edtech), Halodoc (healthtech), Sociolla (beauty e-commerce). Match peer tier to prospect's company: enterprise / state references for traditional banking / energy / telco, tech / digital-native for SaaS / e-commerce / fintech / mobile gaming. Note: 'Indomaret' and 'Alfamart' are the two dominant convenience-store chains and worth referencing for retail / FMCG contexts." },
};`;

const E1_MARKER = `"ru-RU": { withName: "Здравствуйте, {NAME},"`;

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

// Pre-flight: tier-3 pl-PL must be present
if (!source.includes(`"pl-PL": { withName: "Dzień dobry, {NAME},"`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-it-pl to have landed first");
  console.error("[FATAL] missing expected tier-3 pl-PL entry in GREETING_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["greeting-ru-id-add", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  // ru-RU content checks
  ruRUAdded:                  source.includes(`"ru-RU": { withName: "Здравствуйте, {NAME},"`),
  ruRUFormalRegister:         source.includes(`formal вы register`) && source.includes(`never ты for cold outreach`),
  ruRURejectsPrivet:          source.includes(`'Привет' is informal-young register; never for cold B2B`),
  ruRUHasRUB:                 source.includes(`Currency RUB (₽)`) && source.includes(`1 234 567,89 ₽`),
  ruRUHasMlnMlrd:             source.includes(`'млн' (million) and 'млрд' (billion)`),
  ruRUHasMoscowSPb:           source.includes(`Москва (Moscow`) && source.includes(`Санкт-Петербург (St. Petersburg`),
  ruRUHasEkbNskKazan:         source.includes(`Екатеринбург (Yekaterinburg`) && source.includes(`Новосибирск (Novosibirsk`) && source.includes(`Казань (Kazan`),
  ruRUHasStateTier:           source.includes(`Газпром (Gazprom`) && source.includes(`Роснефть (Rosneft`) && source.includes(`Сбер / Сбербанк (Sberbank`),
  ruRUHasTelcoList:           source.includes(`Билайн (Beeline / VEON)`) && source.includes(`МТС (MTS)`) && source.includes(`МегаФон (MegaFon`),
  ruRUHasTechTier:            source.includes(`Яндекс (Yandex`) && source.includes(`Тинькофф / Т-Банк`) && source.includes(`Ozon`) && source.includes(`Wildberries`),
  // id-ID content checks
  idIDAdded:                  source.includes(`"id-ID": { withName: "Selamat pagi, Bapak/Ibu {NAME},"`),
  idIDHasBapakIbu:            source.includes(`formal Bapak (Mr.) / Ibu (Ms.) honorifics`),
  idIDHasTimeOfDay:           source.includes(`Selamat pagi (morning`) && source.includes(`Selamat siang`) && source.includes(`Selamat sore`),
  idIDHasYTH:                 source.includes(`'Yth. Bapak/Ibu {LastName},'`),
  idIDHasIDR:                 source.includes(`Currency IDR (Rp)`) && source.includes(`Rp1.234.567,89`),
  idIDHasRbJtM:               source.includes(`'rb' (ribu / thousand)`) && source.includes(`'jt' (juta / million)`) && source.includes(`'M' (miliar / billion)`),
  idIDHasJakartaCBD:          source.includes(`Sudirman / Kuningan / Thamrin`),
  idIDHasCityList:            source.includes(`Surabaya`) && source.includes(`Bandung`) && source.includes(`Medan`),
  idIDHasBankTier:            source.includes(`Bank Mandiri (largest state bank)`) && source.includes(`BCA (Bank Central Asia`) && source.includes(`BRI (Bank Rakyat Indonesia`),
  idIDHasAstra:               source.includes(`Astra International (the dominant Indonesian conglomerate`),
  idIDHasGoToGrab:            source.includes(`GoTo Group`) && source.includes(`Grab Indonesia`),
  idIDHasFintechTier:         source.includes(`OVO (digital wallet`) && source.includes(`DANA (digital wallet`) && source.includes(`Akulaku`) && source.includes(`Kredivo`),
  idIDHasConvenienceChains:   source.includes(`'Indomaret' and 'Alfamart'`),
  // Untouched / regression
  bareRuUntouched:            source.includes(`ru: { withName: "Здравствуйте, {NAME},", withoutName: "Здравствуйте,", note: "Keep formal — Russian B2B does not soften on WhatsApp." },`),
  bareIdUntouched:            source.includes(`id: { withName: "Halo {NAME},", withoutName: "Halo,", note: "" },`),
  plPLUntouched:              source.includes(`"pl-PL": { withName: "Dzień dobry, {NAME},"`),
  itITUntouched:              source.includes(`"it-IT": { withName: "Salve {NAME},"`),
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
console.log("[message-prompts-ru-id] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[message-prompts-ru-id] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[message-prompts-ru-id] DONE");
