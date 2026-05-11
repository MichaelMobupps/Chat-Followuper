#!/usr/bin/env node
/**
 * Ticket locale-tier3-ru-id, patch 3/3: lib/languageNativeness.ts
 *
 * One atomic edit: append ru-RU and id-ID entries to the tier-3 GUIDES
 * block, mirroring tier1/tier2/JP-KR/he-tr/it-pl depth.
 *
 * Bare-entry coexistence: the base ru guide covers HEAVY Cyrillic
 * localization with mandatory term conversions; the base id guide
 * covers VERY English-heavy with structural grammar in Indonesian.
 * Both remain untouched. Regional entries add Russia-specific /
 * Indonesia-specific city, currency, peer-brand, and register depth.
 *
 * Dependency: requires ticket-locale-tier3-it-pl to have landed (anchor
 * expects pl-PL as the last entry in the tier-3 GUIDES block).
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
// Edit 1 - Append ru-RU and id-ID to tier-3 GUIDES block
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the last pl-PL entry's closing line (uniquely mentions the
// "Po pierwsze... Po drugie... Po trzecie" Polish enumeration phrase
// and the "rewolucyjny / wiodący / jedyny w swoim rodzaju" hype word
// list — those substrings appear nowhere else in the file).

const E1_OLD = `    "TONE: formal-respectful, structured. Polish B2B values: explicit respect via Pan / Pani throughout the message, clear logical structure (Polish business writing often uses explicit 'Po pierwsze... Po drugie... Po trzecie' enumeration), and concrete deliverables with hard numbers over abstract claims. Avoid hype words ('rewolucyjny' without source, 'wiodący' without numbers, 'jedyny w swoim rodzaju') which read as advertising. Sign-offs: 'Z poważaniem' (formal standard, most common B2B), 'Z wyrazami szacunku' (most formal, very respectful — for serious correspondence), 'Pozdrawiam' (cordial, modern professional default for warm-but-respectful tone), 'Pozdrawiam serdecznie' (warmer, but still B2B-appropriate). Match sign-off to opening: 'Szanowny Panie' pairs with 'Z wyrazami szacunku'; 'Dzień dobry' pairs with 'Pozdrawiam' or 'Z poważaniem'.",
};`;

const E1_NEW = `    "TONE: formal-respectful, structured. Polish B2B values: explicit respect via Pan / Pani throughout the message, clear logical structure (Polish business writing often uses explicit 'Po pierwsze... Po drugie... Po trzecie' enumeration), and concrete deliverables with hard numbers over abstract claims. Avoid hype words ('rewolucyjny' without source, 'wiodący' without numbers, 'jedyny w swoim rodzaju') which read as advertising. Sign-offs: 'Z poważaniem' (formal standard, most common B2B), 'Z wyrazami szacunku' (most formal, very respectful — for serious correspondence), 'Pozdrawiam' (cordial, modern professional default for warm-but-respectful tone), 'Pozdrawiam serdecznie' (warmer, but still B2B-appropriate). Match sign-off to opening: 'Szanowny Panie' pairs with 'Z wyrazami szacunku'; 'Dzień dobry' pairs with 'Pozdrawiam' or 'Z poważaniem'.",

  "ru-RU":
    "Russian-Russia (ru-RU): Russia is the primary Russian B2B adtech market. The base Russian (ru) guide covers HEAVY Cyrillic localization with mandatory term conversions (retention>удержание, install>установка, conversion>конверсия, targeting>таргетинг, traffic>трафик, fraud>фрод, creatives>креативы) and the FORBIDDEN script-mixing rule; that all still applies. This regional entry adds Russia-specific city, currency, peer-brand, and register depth on top of the base ru guide. " +
    "REGISTER LAYERS: Russian B2B uses formal вы (lowercase in modern usage) for cold outreach; never ты for first contact. The capitalized Вы (as in 'sincerely Yours' style) is a dated formality, acceptable in very formal correspondence but reads as old-fashioned in modern B2B; lowercase вы is the modern default. Verbs conjugate to second-person plural: 'Хотел бы предложить Вам' / 'хотел бы предложить вам' (I would like to offer you). Cold B2B should default to вы throughout the message; transition to ты only after the prospect explicitly invites it (very rare in formal B2B). Russian business culture has clearer status / seniority hierarchy than Anglo-Saxon norms; over-familiarity in first contact reads as foreign-template. " +
    "GREETING REGISTERS: " +
    "'Здравствуйте, {NAME},' — standard formal opener, the safe default for cold chat. " +
    "'Добрый день, {NAME},' — slightly softer formal alternative ('Good day'); also fine for cold. " +
    "'Уважаемый {LastName}, / Уважаемая {LastName},' — most formal, email-equivalent register; gendered form (Уважаемый for male, Уважаемая for female). " +
    "'Привет' — informal-young register; NEVER for cold B2B regardless of channel. " +
    "ORTHOGRAPHY: Cyrillic script for all structural text. Latin acronyms (CPI, CPA, ROAS, DSP, LTV, MMP, KPI) embed inline within Cyrillic sentences and read naturally. Numbers use space as thousands separator and comma as decimal: '1 234 567,89' (European-style, NOT comma thousands NOT period thousands). Percentages use % symbol (12%); '12 процентов' spelled out is acceptable in formal contexts but '%' is universal in B2B. " +
    "CURRENCY: RUB (₽, ruble). Currency symbol follows the amount with a space: '1 234 567,89 ₽' (modern Unicode ruble glyph ₽ is universally accepted post-2014; the legacy 'руб.' suffix is also acceptable but ₽ is more modern). For larger amounts: 'млн' (million) and 'млрд' (billion) are standard ('1,5 млн ₽', '2,3 млрд ₽'). 'тыс.' (thousand) is informal-context only; full numerals for formal B2B. Some Russian B2B contexts dual-quote in USD (US dollars) or EUR; depending on whether the prospect's company is import / export-oriented this can be natural. " +
    "CITY/MARKET REFERENCES: " +
    "Москва (Moscow, the commercial / political center; ~13M; finance, enterprise, government, tech all concentrated here; Moskva-City international business district for finance towers — VTB, Sberbank, IQ-Quarter; Tverskaya / Arbat / Patriarshiye for older business HQs). " +
    "Санкт-Петербург / СПб (St. Petersburg, ~5.5M; tech / culture / federal-level companies relocated here including Gazprom HQ post-2015). " +
    "Екатеринбург (Yekaterinburg, ~1.5M; Urals industrial / metals capital). " +
    "Новосибирск (Novosibirsk, ~1.6M; Siberian tech / Akademgorodok scientific cluster). " +
    "Казань (Kazan, ~1.3M; Tatarstan capital; Innopolis tech city nearby — Russian Silicon Valley equivalent). " +
    "Нижний Новгород (Nizhny Novgorod, ~1.2M; automotive / Volga industrial). " +
    "Краснодар (Krasnodar, ~1M; growing southern tech / IT hub, fastest-growing Russian city by some metrics). " +
    "Other million-plus: Челябинск (Chelyabinsk), Самара (Samara), Уфа (Ufa), Ростов-на-Дону (Rostov-on-Don), Омск (Omsk), Волгоград (Volgograd), Воронеж (Voronezh), Пермь (Perm), Красноярск (Krasnoyarsk), Тюмень (Tyumen, oil capital). " +
    "PEER BRANDS by tier: " +
    "Enterprise / state and resource tier: Газпром (Gazprom, gas major, partially state-owned), Роснефть (Rosneft, oil, state), Лукойл (LUKOIL, private oil), Сургутнефтегаз (Surgutneftegaz), Татнефть (Tatneft), Новатэк (Novatek, LNG), Норильский никель / Норникель (Nornickel, metals — palladium, nickel), Северсталь (Severstal, steel), НЛМК (NLMK, steel), Магнитка / ММК (MMK, steel), РУСАЛ (RUSAL, aluminum), Полюс (Polyus, gold), РЖД (Russian Railways, state). " +
    "Banking / finance tier: Сбер / Сбербанк (Sberbank — the dominant bank; also the SberMarket / SberMobile / SberDevices / SberCloud / SberAuto super-app ecosystem), ВТБ (VTB, state), Газпромбанк (Gazprombank), Альфа-Банк (Alfa-Bank, private), Россельхозбанк (Rosselkhozbank, state-agricultural), Открытие (Otkritie), Совкомбанк (Sovcombank), Тинькофф / Т-Банк (T-Bank, rebranded 2024 — was Tinkoff Bank, now neobank flagship). " +
    "Retail / FMCG tier: Магнит (Magnit, the largest retailer by store count), X5 Retail Group (Pyaterochka / Перекрёсток Perekrestok / Карусель Karusel — the largest by GMV), Лента (Lenta, hypermarket), Дикси (Dixy), Светофор (Svetofor, hard-discount), М.Видео-Эльдорадо (M.Video-Eldorado, electronics), DNS (electronics), ВкусВилл (VkusVill, premium / organic), Окей (O'Key). " +
    "Telco / mobile: Билайн / VEON (Beeline), МТС (MTS, AFK Sistema-affiliated), МегаФон (MegaFon, owned by USM Holdings), Tele2 Россия (T2 Mobile, Rostelecom-affiliated), Ростелеком (Rostelecom, state, fixed-line + Tele2 mobile). " +
    "Tech / digital-native tier: Яндекс (Yandex — the dominant Russian tech ecosystem: search, Yandex Taxi / Yandex Go, Yandex Eats / Yandex Lavka quick commerce, Yandex Market e-commerce, Yandex Music / KinoPoisk streaming, Yandex Maps / Navigator, Yandex Cloud, Yandex Plus subscription — comparable in domestic dominance to Google + Amazon + Uber + Spotify combined), VK / ВКонтакте (VK Group, post-Mail.Ru merger — VK social, VK Music, VK Combo, OK.ru / Одноклассники, VK Games, Mail.ru email + cloud), Ozon (e-commerce, Nasdaq-listed via OZON), Wildberries (the largest Russian e-commerce platform by GMV, private), Авито (Avito, classifieds — Russian Craigslist + OLX equivalent), Циан / CIAN (real estate), HeadHunter / hh.ru (jobs, publicly listed), Skyeng (edtech / English language), Skypro (edtech / IT retraining), Делимобиль (Delimobil, carsharing), Самокат (Samokat, quick commerce — Sber-owned post-acquisition), Яндекс.Лавка (Yandex Lavka, quick commerce), Aviasales (flight aggregation), Booking.com replacement after exit: Островок (Ostrovok). " +
    "Aerospace / defense (less likely B2B adtech but worth noting): Аэрофлот (Aeroflot, airline), Победа (Pobeda, low-cost), S7 Airlines, Уралкалий (Uralkali, potash). " +
    "Match peer tier to prospect's company: enterprise / state / resource references for traditional sectors and natural-resource industries, banking-tier for financial-services prospects, tech / digital-native for SaaS / e-commerce / fintech / mobile gaming / classifieds. Mixing tiers (referencing Yandex when pitching Gazprom) reads as foreign-template. " +
    "TONE: formal, direct, hierarchy-aware. Russian B2B values: explicit acknowledgment of seniority in first contact, clear logical structure, concrete numbers and proofs over qualitative claims, willingness to be precise about commitments and deadlines. Russian business culture is more direct than Anglo-Saxon (less indirection, less softening) but also more formal in register (вы, full names, Уважаемый openings). Avoid hype words ('революционный' without source, 'лидер рынка' without numbers, 'уникальный') which read as advertising. Sign-offs: 'С уважением,' (formal standard, the most common B2B sign-off — literally 'With respect'), 'С наилучшими пожеланиями,' (warmer, 'Best wishes', acceptable for warm-but-formal threads). 'Всего доброго,' is casual / closing-final; avoid in cold. Match sign-off to opening: 'Уважаемый/Уважаемая' opening pairs with 'С уважением'; 'Здравствуйте' / 'Добрый день' opening also pairs with 'С уважением' as the safe default.",

  "id-ID":
    "Indonesian-Indonesia (id-ID): Indonesia is the only major Indonesian B2B adtech market. The base Indonesian (id) guide notes that Indonesian B2B is VERY English-heavy and structural grammar should be in Indonesian with adtech compound terms in English; that all still applies. This regional entry adds Indonesia-specific city, currency, peer-brand, and Bapak/Ibu register depth on top of the base id guide. " +
    "REGISTER LAYERS: Indonesian B2B uses formal Bapak (Mr.) / Ibu (Ms.) honorifics for cold outreach. These honorifics precede the FIRST name (not last), reflecting Indonesian naming conventions where many people have only one name or use first-name primarily: 'Bapak Budi' / 'Ibu Sari' is correct; 'Bapak Setiawan' (using last name) is also correct when the person uses a Western-style two-part name. The abbreviated 'Pak' / 'Bu' forms are acceptable in semi-formal chat once the relationship has warmed up but cold B2B should use full 'Bapak' / 'Ibu'. NEVER use first name alone for cold outreach; that's the equivalent of using 'du' / 'ты' / 'tu' in other formal-register languages. " +
    "GREETING REGISTERS: " +
    "Time-of-day greetings rotate by clock: " +
    "  Selamat pagi — morning (~05:00-11:00) " +
    "  Selamat siang — midday (~11:00-15:00) " +
    "  Selamat sore — late afternoon (~15:00-19:00) " +
    "  Selamat malam — evening / night (~19:00 onwards) " +
    "Use the form matching the time the prospect will read the message; on chat platforms with high probability of immediate read (WhatsApp / Telegram), this matters. If timing is uncertain, 'Selamat pagi' is the safest default for B2B (mornings start early in Indonesia and the form is broadly accepted as the standard professional opener). 'Halo Pak/Bu {NAME},' is acceptable on WhatsApp for less formal contexts. 'Yth. Bapak/Ibu {LastName},' (Yang terhormat / 'The respected') is the most formal email-equivalent register, less common on chat. " +
    "ORTHOGRAPHY: Standard Indonesian Latin script (no diacritics needed for native Indonesian words; Latin alphabet with no accents). Numbers use period as thousands separator and comma as decimal: '1.234.567,89' (European-style, NOT Anglo-American comma thousands). Percentages use % symbol (12%), never 'persen' spelled out in B2B writing. Indonesian B2B writing freely mixes English adtech vocabulary inline with Indonesian grammar; this is natural register, not a fault. " +
    "CURRENCY: IDR (Rp). Symbol prefix without space: 'Rp1.234.567,89' (note: NOT comma thousands; European-style separators). The 'IDR' three-letter code is rare in body text; use 'Rp' prefix. For larger amounts the informal abbreviations are universal: " +
    "  'rb' (ribu / thousand): 'Rp50rb' = Rp50,000 (~$3 USD) " +
    "  'jt' (juta / million): 'Rp5jt' = Rp5,000,000 (~$320 USD) " +
    "  'M' (miliar / billion): 'Rp1M' = Rp1,000,000,000 (~$64,000 USD) " +
    "Note that 'M' = miliar = 10^9 in Indonesian, NOT mega / 10^6 as in English. For formal B2B documents, use full numerals 'Rp1.000.000.000' rather than 'Rp1M' to avoid ambiguity. Indonesia has high nominal rupiah figures due to historical inflation; large numbers are expected and not impressive in themselves — dual-quoting in USD is sometimes useful for international B2B contexts. " +
    "CITY/MARKET REFERENCES: " +
    "Jakarta (the commercial capital; ~10M city + 30M+ Jabodetabek metro — Jakarta + Bogor + Depok + Tangerang + Bekasi; the Indonesian CBD: Sudirman / Kuningan / Thamrin for finance and enterprise HQs, SCBD (Sudirman Central Business District) for tech and modern offices, Mega Kuningan and Pondok Indah for foreign and embassy presence; Cikarang and Bekasi for manufacturing outskirts). " +
    "Surabaya (~3M, second-largest; East Java capital; manufacturing, port, second business center after Jakarta). " +
    "Bandung (~2.5M; West Java; tech / textile / education / Institut Teknologi Bandung / ITB the leading Indonesian tech university; 2-3 hour drive from Jakarta makes it a tech satellite). " +
    "Medan (~2.4M; North Sumatra commercial hub, palm oil, mining gateway). " +
    "Semarang (~1.6M; Central Java port and manufacturing). " +
    "Makassar (~1.5M; South Sulawesi; eastern Indonesia gateway, fish / logistics). " +
    "Bali / Denpasar (~1M; tourism economy but growing remote-work tech / digital nomad presence). " +
    "Yogyakarta / Jogja (~400K but cultural / education hub; UGM Universitas Gadjah Mada). " +
    "PEER BRANDS by tier: " +
    "Enterprise / state and finance tier: Bank Mandiri (the largest state bank by assets), BCA (Bank Central Asia, the dominant private bank — Indonesian B2B reflex is BCA for daily banking, Mandiri for state contracts), BNI (Bank Negara Indonesia, state), BRI (Bank Rakyat Indonesia, state, the microfinance / rural / Pasar champion), CIMB Niaga (Malaysian-owned), Bank Danamon, Maybank Indonesia, Bank Permata, Bank Mega, Bank BTPN (Sumitomo Mitsui-affiliated), Astra International (the dominant Indonesian conglomerate — automotive Toyota / Daihatsu / Isuzu / Honda / BMW / Peugeot dealerships, agribusiness, mining, financial services, infrastructure, IT — Astra is to Indonesia what Tata is to India), Pertamina (state oil and gas, the largest Indonesian company by revenue), PLN (state electricity utility), Telkom Indonesia (state telco; includes Telkomsel the dominant mobile operator, IndiHome fixed broadband), Indosat Ooredoo Hutchison (telco, merger of Indosat and Hutchison 3 Indonesia), XL Axiata (telco, Malaysian Axiata-owned, recently merged with Smartfren as XLSmart), Garuda Indonesia (state airline), Lion Air (private airline). " +
    "Conglomerate tier: Salim Group (Indofood — the dominant noodle / FMCG, BCA-affiliated historically), Sinar Mas (Asia Pulp & Paper, palm oil), Lippo Group (real estate, retail, healthcare), Djarum Group (Blibli e-commerce, BCA stake, tobacco), Bakrie Group, Mayora Indah (FMCG), Indofood (CBP / Sukses Makmur — Indomie maker, the dominant instant noodle globally). " +
    "Retail / FMCG (high-relevance): Indomaret (the dominant convenience-store chain, Salim Group), Alfamart (the other dominant convenience chain, PT Sumber Alfaria Trijaya), Hypermart / Foodmart (Lippo), Carrefour Transmart, Lotte Mart (Korean), Ranch Market / Farmers Market (premium). " +
    "Tech / digital-native tier: GoTo Group (the largest Indonesian tech holding, NYSE / IDX dual-listed; Gojek for ride-hailing / food / payments / GoPay digital wallet + Tokopedia for e-commerce, post-2021 merger), Grab Indonesia (Singapore HQ but dominant Indonesian player in ride-hailing / food / payments / GrabPay), Bukalapak (e-commerce, IDX-listed; smaller than Tokopedia but significant), Traveloka (online travel agent, regional SEA expansion), tiket.com (travel, Djarum / Blibli affiliated), OVO (digital wallet, Grab + Lippo + Tokopedia consortium), DANA (digital wallet, Ant Group + Emtek joint), LinkAja (digital wallet, state-backed via Telkomsel / Pertamina / BRI / BNI / Mandiri consortium), Blibli (e-commerce, Djarum), Akulaku (BNPL / fintech, Ant-affiliated), Kredivo (BNPL, FinAccel), Ajaib (investment app), Ruangguru (edtech, the dominant Indonesian edtech), Halodoc (telemedicine / healthtech), Alodokter (telemedicine competitor), Sociolla (beauty e-commerce), Tiket / Mister Aladin (travel niches), Tokopedia (subsumed into GoTo but brand persists for e-commerce). " +
    "Mobile gaming / digital content: Garena (Sea Group / Free Fire developer — Singapore HQ but massive Indonesian market presence), Moonton (Mobile Legends: Bang Bang publisher, ByteDance-owned, large Indonesian DAU). " +
    "Match peer tier to prospect's company: enterprise / state for traditional banking / energy / telco, conglomerate for diversified holdings, tech / digital-native for SaaS / e-commerce / fintech / mobile gaming. Indomaret / Alfamart are the universal Indonesian retail-density reference points; mentioning them shows Indonesia-specific market awareness. " +
    "TONE: formal-warm, relationship-aware. Indonesian B2B values: explicit honorific (Bapak / Ibu) throughout the message in first contact, slightly slower / more relational pace than Anglo-Saxon norms, acknowledgment of the prospect's seniority and company context before the pitch. Indonesian business culture rewards patience and politeness; aggressive direct outreach without honorifics reads as foreign-template. Avoid hype words ('revolusioner' without source, 'terbaik di industri' without numbers, 'satu-satunya') which read as advertising. Sign-offs: 'Terima kasih,' (Thank you — the standard B2B closing), 'Hormat saya,' (My respect — more formal), 'Salam,' (Regards — casual but acceptable in modern B2B chat), 'Salam hormat,' (Respectful regards — warmer-formal). Match sign-off to opening: 'Yth. Bapak/Ibu' pairs with 'Hormat saya'; 'Selamat pagi, Bapak/Ibu' pairs with 'Terima kasih' or 'Salam hormat'.",
};`;

const E1_MARKER = `"ru-RU":
    "Russian-Russia (ru-RU):`;

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

// Pre-flight: tier-3 pl-PL must be present (depends on prior ticket)
if (!source.includes(`"pl-PL":\n    "Polish-Poland (pl-PL):`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-it-pl to have landed first");
  console.error("[FATAL] missing expected tier-3 pl-PL entry in GUIDES");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["guides-tier3-ru-id-append", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  // ru-RU content checks
  ruRUAdded:                source.includes(`"ru-RU":\n    "Russian-Russia (ru-RU):`),
  ruRUVyRegister:           source.includes(`formal вы (lowercase in modern usage)`) && source.includes(`never ты for first contact`),
  ruRUGreetingRegisters:    source.includes(`'Здравствуйте, {NAME},'`) && source.includes(`'Уважаемый {LastName}`),
  ruRURejectsPrivet:        source.includes(`'Привет' — informal-young register; NEVER for cold B2B`),
  ruRUHasRUBCurrency:       source.includes(`CURRENCY: RUB (₽, ruble)`) && source.includes(`1 234 567,89 ₽`),
  ruRUHasMlnMlrd:           source.includes(`'млн' (million) and 'млрд' (billion)`),
  ruRUHasMoscowCity:        source.includes(`Москва (Moscow`) && source.includes(`Moskva-City`),
  ruRUHasSPbCity:           source.includes(`Санкт-Петербург / СПб (St. Petersburg`),
  ruRUHasInnopolis:         source.includes(`Innopolis tech city nearby`),
  ruRUHasStateTier:         source.includes(`Газпром (Gazprom`) && source.includes(`Роснефть (Rosneft`),
  ruRUHasSberEcosystem:     source.includes(`Сбер / Сбербанк (Sberbank`) && source.includes(`SberMarket`),
  ruRUHasTinkoffRebrand:    source.includes(`Тинькофф / Т-Банк (T-Bank, rebranded 2024`),
  ruRUHasRetailTier:        source.includes(`Магнит (Magnit`) && source.includes(`X5 Retail Group`),
  ruRUHasTelcoTier:         source.includes(`Билайн / VEON`) && source.includes(`МТС (MTS`) && source.includes(`МегаФон (MegaFon`),
  ruRUHasYandexEcosystem:   source.includes(`Яндекс (Yandex — the dominant Russian tech ecosystem`) &&
                            source.includes(`Yandex Taxi / Yandex Go`),
  ruRUHasOzonWildberries:   source.includes(`Ozon (e-commerce`) && source.includes(`Wildberries`),
  ruRUHasAvitoCian:         source.includes(`Авито (Avito`) && source.includes(`Циан / CIAN`),
  ruRUHasSignoffs:          source.includes(`'С уважением,'`) && source.includes(`'С наилучшими пожеланиями,'`),
  // id-ID content checks
  idIDAdded:                source.includes(`"id-ID":\n    "Indonesian-Indonesia (id-ID):`),
  idIDHasBapakIbu:          source.includes(`formal Bapak (Mr.) / Ibu (Ms.) honorifics`),
  idIDHasFirstNameRule:     source.includes(`honorifics precede the FIRST name`),
  idIDHasTimeOfDay:         source.includes(`Selamat pagi — morning (~05:00-11:00)`) &&
                            source.includes(`Selamat sore — late afternoon`),
  idIDHasIDRCurrency:       source.includes(`CURRENCY: IDR (Rp)`) && source.includes(`Rp1.234.567,89`),
  idIDHasRbJtM:             source.includes(`'rb' (ribu / thousand)`) &&
                            source.includes(`'jt' (juta / million)`) &&
                            source.includes(`'M' (miliar / billion)`),
  idIDHasMAmbiguityNote:    source.includes(`'M' = miliar = 10^9 in Indonesian, NOT mega / 10^6`),
  idIDHasJakartaCBD:        source.includes(`Sudirman / Kuningan / Thamrin`) &&
                            source.includes(`SCBD (Sudirman Central Business District)`),
  idIDHasJabodetabek:       source.includes(`Jabodetabek metro — Jakarta + Bogor + Depok + Tangerang + Bekasi`),
  idIDHasSurabayaBandung:   source.includes(`Surabaya (~3M`) && source.includes(`Bandung`),
  idIDHasITBnote:           source.includes(`Institut Teknologi Bandung / ITB`),
  idIDHasBankTier:          source.includes(`Bank Mandiri (the largest state bank`) &&
                            source.includes(`BCA (Bank Central Asia, the dominant private bank`) &&
                            source.includes(`BRI (Bank Rakyat Indonesia, state, the microfinance`),
  idIDHasAstraInternational: source.includes(`Astra International (the dominant Indonesian conglomerate`),
  idIDHasPertamina:         source.includes(`Pertamina (state oil and gas`),
  idIDHasTelkomsel:         source.includes(`Telkomsel the dominant mobile operator`),
  idIDHasIndomaretAlfamart: source.includes(`Indomaret (the dominant convenience-store chain`) &&
                            source.includes(`Alfamart (the other dominant convenience chain`),
  idIDHasGoToGrab:          source.includes(`GoTo Group (the largest Indonesian tech holding`) &&
                            source.includes(`Grab Indonesia`),
  idIDHasBukalapakTraveloka: source.includes(`Bukalapak (e-commerce`) && source.includes(`Traveloka`),
  idIDHasFintechTier:       source.includes(`OVO (digital wallet`) && source.includes(`DANA (digital wallet`) &&
                            source.includes(`LinkAja`) && source.includes(`Akulaku`) && source.includes(`Kredivo`),
  idIDHasGarenaMoonton:     source.includes(`Garena (Sea Group / Free Fire developer`) &&
                            source.includes(`Moonton (Mobile Legends`),
  idIDHasSignoffs:          source.includes(`'Terima kasih,'`) && source.includes(`'Hormat saya,'`),

  // Untouched / regression
  plPLUntouched:            source.includes(`"pl-PL":\n    "Polish-Poland (pl-PL):`),
  itITUntouched:            source.includes(`"it-IT":\n    "Italian-Italy (it-IT):`),
  trTRUntouched:            source.includes(`"tr-TR":\n    "Turkish-Turkey (tr-TR):`),
  heILUntouched:            source.includes(`"he-IL":\n    "Hebrew-Israel (he-IL):`),
  koKRUntouched:            source.includes(`"ko-KR":\n    "Korean-South Korea (ko-KR):`),
  jaJPUntouched:            source.includes(`"ja-JP":\n    "Japanese-Japan (ja-JP):`),
  bnINUntouched:            source.includes(`"bn-IN":\n    "Bengali-India (bn-IN):`),
  hiINUntouched:            source.includes(`"hi-IN":\n    "Hindi-India (hi-IN):`),
  bareRuUntouched:          source.includes(`Russian (ru): HEAVY localization`),
  bareIdUntouched:          source.includes(`Indonesian (id): English-heavy for adtech`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  ptBRUntouched:            source.includes(`Brazilian Portuguese (pt-BR)`),
  deCHUntouched:            source.includes(`Swiss High German (de-CH;`),
  buildNativenessUntouched: source.includes(`export function buildNativenessBlock`),
};
console.log("[language-nativeness-ru-id] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[language-nativeness-ru-id] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[language-nativeness-ru-id] DONE");
