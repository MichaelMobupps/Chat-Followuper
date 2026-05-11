#!/usr/bin/env node
/**
 * Ticket locale-tier3-bg-el, patch 3/3: lib/languageNativeness.ts
 *
 * One atomic edit: append bg-BG and el-GR entries to the tier-3 GUIDES
 * block, after the existing hu-HU entry.
 *
 * Dependency: requires ticket-locale-tier3-ro-hu to have landed.
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/languageNativeness.ts",
);

const E1_OLD = `    "TONE: formal, structured, slightly reserved in Hungarian-language B2B; warmer when English is used (Hungarian B2B often switches to English for tech / startup contexts, especially in Budapest). Hungarian business culture values: explicit respect via Ön and Tisztelt openings, clear hierarchical acknowledgment, precise language (Hungarian is precise about case and tense), and avoidance of marketing-speak. Hungarian readers are sensitive to grammatical correctness; agglutinative errors signal foreign-template immediately. Avoid hype words ('forradalmi' without source, 'piacvezető' without numbers, 'egyedülálló') which read as advertising. Sign-offs: 'Tisztelettel,' (formal standard, the most common B2B sign-off — literally 'With respect'), 'Üdvözlettel,' ('With greetings', slightly warmer-formal, the second-most-common), 'Köszönettel,' ('With thanks', for messages with a specific ask), 'Szép napot,' ('Have a nice day', casual-warm, modern Budapest tech-style). Match sign-off to opening: 'Tisztelt {LastName} Úr / Asszony' pairs with 'Tisztelettel,' or 'Üdvözlettel,'; 'Üdvözlöm' pairs with 'Üdvözlettel,' or 'Köszönettel,'.",
};`;

const E1_NEW = `    "TONE: formal, structured, slightly reserved in Hungarian-language B2B; warmer when English is used (Hungarian B2B often switches to English for tech / startup contexts, especially in Budapest). Hungarian business culture values: explicit respect via Ön and Tisztelt openings, clear hierarchical acknowledgment, precise language (Hungarian is precise about case and tense), and avoidance of marketing-speak. Hungarian readers are sensitive to grammatical correctness; agglutinative errors signal foreign-template immediately. Avoid hype words ('forradalmi' without source, 'piacvezető' without numbers, 'egyedülálló') which read as advertising. Sign-offs: 'Tisztelettel,' (formal standard, the most common B2B sign-off — literally 'With respect'), 'Üdvözlettel,' ('With greetings', slightly warmer-formal, the second-most-common), 'Köszönettel,' ('With thanks', for messages with a specific ask), 'Szép napot,' ('Have a nice day', casual-warm, modern Budapest tech-style). Match sign-off to opening: 'Tisztelt {LastName} Úr / Asszony' pairs with 'Tisztelettel,' or 'Üdvözlettel,'; 'Üdvözlöm' pairs with 'Üdvözlettel,' or 'Köszönettel,'.",

  "bg-BG":
    "Bulgarian-Bulgaria (bg-BG): Bulgaria is the only major Bulgarian B2B adtech market. The base Bulgarian (bg) guide covers HEAVY Cyrillic localization with mandatory term conversions (retention>задържане, install>инсталация, conversion>конверсия, targeting>таргетиране, traffic>трафик, fraud>фрод, creatives>криейтиви, lookalike>подобна аудитория); that all still applies. This regional entry adds Bulgaria-specific city, currency, peer-brand, and register depth on top of the base bg guide. " +
    "REGISTER LAYERS: Bulgarian B2B uses formal Вие (capitalized in formal correspondence; lowercase вие acceptable on chat) for cold outreach. Вие is the polite second-person plural form used as singular-formal (like Russian вы / French vous). Never ти (singular informal) for cold B2B. Verbs conjugate to second-person plural: 'бихте искали' (would you like). The relationship-warming transition to ти is more relaxed in Bulgarian B2B than in Russian or Ukrainian; younger Bulgarian tech / startup contexts shift to ти faster, but cold outreach always opens with Вие. " +
    "GREETING REGISTERS: " +
    "'Здравейте, {NAME},' — standard chat opening, the safe default. " +
    "'Добър ден, {NAME},' — slightly more traditional alternative ('Good day'). " +
    "'Уважаеми г-н {LastName}, / Уважаема г-жо {LastName},' — most formal email-equivalent (gendered: г-н = gospodin Mr. / г-жо = gospozho vocative of Ms.). " +
    "'Здрасти' / 'Чао' — informal-young; NEVER for cold B2B. " +
    "ORTHOGRAPHY: Cyrillic script. Bulgarian uses fewer letters than Russian (no ы, no э, no ь as a soft sign with the same functions; the letter й is used). Latin acronyms (CPI, CPA, ROAS, DSP, LTV, MMP) embed inline within Cyrillic sentences and read naturally. Numbers use space as thousands separator and comma as decimal: '1 234 567,89' (European-style). Percentages use % symbol. " +
    "CURRENCY: BGN (лв., the lev / leva plural). Currency suffix follows the amount with a space: '1 234 567,89 лв.' For larger amounts: 'млн.' (million) and 'млрд.' (billion). The Bulgarian lev has been pegged to the euro at ~1.95583 BGN/EUR since 1999 (currency board arrangement), so euro-quoted figures are common in Bulgarian B2B even pre-adoption. Bulgaria is preparing for euro adoption with a target of January 2026 / 2027; some B2B contexts already dual-quote in EUR or use EUR primarily. After euro adoption the lev will be retired. " +
    "CITY/MARKET REFERENCES: " +
    "София (Sofia, capital and commercial center; ~1.2M city + ~1.7M metro; the dominant Bulgarian B2B destination by every metric. Mladost area / Tsarigradsko shose / Bulgaria Boulevard for tech parks and corporate office buildings — comparable in cluster density to Brno or Cluj as a CEE tech-cluster destination. Lozenets and Iztok for premium business addresses. Sofia Tech Park as a state-organized tech hub). " +
    "Пловдив (Plovdiv, ~340K, the second-largest city; mixed manufacturing + IT outsourcing; Trakia Economic Zone is one of the largest industrial zones in southeast Europe; growing tech sector). " +
    "Варна (Varna, ~330K, Black Sea port and tourism; growing IT and shared-services). " +
    "Бургас (Burgas, ~200K, Black Sea port and petrochemical — Lukoil Neftohim Burgas refinery is one of the largest in the Balkans). " +
    "Русе (Ruse, ~150K, Danube port, traditionally industrial). " +
    "Стара Загора (Stara Zagora, ~140K, industrial / energy / Maritsa East coal complex). " +
    "PEER BRANDS by tier: " +
    "Banking tier: UniCredit Bulbank (UniCredit Italy subsidiary, the largest Bulgarian bank by assets and the dominant corporate bank), DSK Bank (OTP Group Hungary, second-largest — Bulgarian B2B reflexively knows DSK as the leading retail bank), Postbank / Eurobank Bulgaria (Eurobank Greece-owned), Raiffeisenbank Bulgaria, KBC Bank Bulgaria (formerly CIBANK then UBB-CIBANK merger; KBC Belgium-owned), Allianz Bank Bulgaria, Investbank, ProCredit Bank Bulgaria, First Investment Bank / Fibank (one of the few Bulgarian-owned banks at scale, BSE-listed), TBI Bank. Most Bulgarian banks are foreign-European-owned; domestic ownership is rarer at scale. " +
    "Industrial / state tier: Bulgargaz (state gas trading), Bulgartransgaz (state gas transmission, IPO discussed), NEK / Natsionalna Elektricheska Kompaniya (state electricity), Kozloduy NPP (state nuclear power plant, the largest Bulgarian electricity producer), Lukoil Neftohim Burgas (Russian Lukoil-owned refinery — one of the largest in the Balkans), Aurubis Bulgaria (formerly KCM, copper, German Aurubis-owned), Solvay Sodi (chemicals, Belgian Solvay), Zlatna Panega Cement, Devnya Cement. Heavy industry remains a significant Bulgarian export sector. " +
    "Telco / mobile: A1 Bulgaria (formerly Mtel, A1 Telekom Austria-owned; the dominant Bulgarian mobile operator by subscribers), Yettel Bulgaria (formerly Telenor Bulgaria, PPF Group-owned post Telenor CEE divestment), Vivacom (Bulgaria's national telco; fixed + mobile + TV; United Group / BC Partners ownership). " +
    "Retail / FMCG tier: Lidl Bulgaria (Schwarz Group), Kaufland Bulgaria (also Schwarz Group), Billa Bulgaria (REWE Group), Fantastico (Bulgarian-owned grocery chain), T Market, Gloria, Carrefour Bulgaria (exited 2013 but brand persists in some contexts), Metro Bulgaria (Cash&Carry), Praktiker (DIY, German). " +
    "E-commerce / digital tier: eMAG Bulgaria (the Romanian eMAG's Bulgarian operation; the dominant Bulgarian e-commerce platform by margin), OLX.bg (classifieds, Prosus), Bazar.bg (older classifieds), Auto.bg (car listings), Imot.bg (real estate), eBag (online grocery, Sofia-focused), eShop (electronics). Logistics: Speedy AD (the dominant Bulgarian parcel courier, BSE-listed — every Bulgarian B2B uses Speedy for B2B and B2C delivery), Econt Express (the second dominant courier; private). " +
    "Tech / software tier: VMware Bulgaria (Sofia is a major VMware engineering center, one of the largest VMware sites globally; now part of Broadcom post-2023 acquisition), HP Bulgaria, IBM Bulgaria, SAP Labs Bulgaria, Software Group (Sofia-based fintech / banking software), Telerik / Progress (Bulgarian-founded by Svetozar Georgiev and Vassil Terziev as Telerik in 2002, acquired by Progress Software in 2014 for $262.5M — the most internationally successful Bulgarian tech company and the reference Bulgarian tech success story; the Telerik Academy training program is also widely known), Bulpros Consulting, ScaleFocus (Sofia-headquartered, expanded internationally), Modis Bulgaria (Adecco-owned), Coca-Cola HBC IT Services (Sofia), Telerik Academy. Mobility / delivery: Wolt Bulgaria (Finnish DoorDash-owned), Bolt Bulgaria (Estonian), Foodpanda Bulgaria (Delivery Hero, may be wound down regionally), Glovo Bulgaria (Spanish Delivery Hero-acquired). " +
    "Match peer tier to prospect's company: banking-tier (UniCredit Bulbank / DSK) for finance, state-industrial (NEK / Bulgargaz / Lukoil) for traditional, A1 / Yettel / Vivacom for telco, eMAG for e-commerce, Telerik / VMware / SAP Labs for tech, Speedy / Econt for logistics. " +
    "TONE: pragmatic, mid-formal. Bulgarian B2B values: clear respect via Вие throughout, concrete deliverables with numbers, slightly more directness than Greek but slightly less than Czech or German. Bulgarian business culture is broadly similar to Romanian / Hungarian / Russian in formality conventions; Sofia tech is becoming more Anglo-influenced (English-tolerant, faster pace) similar to Cluj / Krakow. Avoid hype words ('революционен' without source, 'пазарен лидер' without numbers, 'единствен в своя род') which read as advertising. Sign-offs: 'С уважение,' (formal standard, the most common B2B sign-off — literally 'With respect'), 'Поздрави,' ('Regards', casual-professional, modern B2B chat default), 'С най-добри пожелания,' ('With best wishes', warmer-formal). Match sign-off to opening: 'Уважаеми г-н / Уважаема г-жо' opening pairs with 'С уважение,'; 'Здравейте' pairs with 'Поздрави,' or 'С уважение,'.",

  "el-GR":
    "Greek-Greece (el-GR): Greece is the primary Greek B2B adtech market. The base Greek (el) guide covers HEAVY localization with term conversions (retention>διατήρηση, install>εγκατάσταση, conversion>μετατροπή, targeting>στόχευση, traffic>επισκεψιμότητα, creatives>δημιουργικά, lookalike>παρόμοιο κοινό); that all still applies. This regional entry adds Greece-specific city, currency, peer-brand, register, and unique-to-Greek-B2B shipping-industry depth on top of the base el guide. " +
    "REGISTER LAYERS: Greek B2B uses formal εσείς (esis, the plural-formal second-person, parallel to French vous or Spanish ustedes used as polite singular). Never εσύ (esy, informal singular) for cold outreach. Verbs conjugate to second-person plural even when addressing a single person: 'θα θέλατε' (would you like, plural form used as polite singular). The transition to εσύ is a meaningful relationship-warming step in Greek business culture, typically initiated by the senior party or after explicit invitation. " +
    "GREETING REGISTERS: " +
    "'Γεια σας, {NAME},' — standard chat opening, literally 'health to you (plural-formal)'; the safe default. " +
    "'Καλημέρα, {NAME},' — morning specifically (~05:00-12:00). " +
    "'Καλησπέρα, {NAME},' — afternoon / evening (~17:00 onwards). " +
    "'Αξιότιμε κύριε {LastName},' / 'Αξιότιμη κυρία {LastName},' — most formal email-equivalent (gendered: κύριε is vocative Mr. / κυρία is Mrs.; Αξιότιμε / Αξιότιμη is 'esteemed'). " +
    "'Γεια σου' (singular-informal) and bare 'Γεια!' or 'Χαίρετε' — informal or archaic; NEVER for cold B2B. " +
    "ORTHOGRAPHY: Greek alphabet for all structural text. The polytonic system (multiple accent marks) was officially replaced by monotonic (single acute accent only) in 1982; modern B2B uses monotonic exclusively. Vowels with acute accent (ά, έ, ή, ί, ό, ύ, ώ) for stressed syllables. Latin acronyms (CPI, CPA, ROAS, DSP, LTV, MMP) embed inline within Greek sentences and read naturally. Numbers use European convention: period as thousands separator, comma as decimal: '1.234.567,89'. Percentages use % symbol. " +
    "CURRENCY: EUR (€). Greece adopted the euro in 2002 (one of the original euro-zone members; the drachma was retired). Standard European separators: '€1.234.567,89'. 'εκ.' (ekatommyria / millions, abbreviation common) and 'δισ.' (disekatommyria / billions) for larger amounts. " +
    "CITY/MARKET REFERENCES: " +
    "Αθήνα (Athens, the commercial / political center; ~3.1M Attica metro; the dominant Greek city by every B2B metric and home to the headquarters of essentially all major Greek companies. Syntagma Square area for traditional finance and government, Kolonaki for premium business addresses, Vouliagmenis Avenue corridor for tech / multinational offices, Marousi for tech parks and corporate HQs — comparable to Brno or Bucharest as a tech-cluster destination, Glyfada and the southern suburbs for newer business addresses, Piraeus port area for shipping and logistics HQs). " +
    "Θεσσαλονίκη (Thessaloniki, the second-largest city; ~325K city + ~1M metro; northern Greece / Macedonia commercial hub; Aristotle University as a tech-transfer source; growing tech sector; OK Thessaloniki tech park). " +
    "Πάτρα (Patras, ~210K, western Peloponnese port; University of Patras). " +
    "Ηράκλειο (Heraklion, ~140K, Crete's capital; tourism + Foundation for Research and Technology / FORTH). " +
    "Λάρισα (Larissa, ~150K, Thessaly agricultural center). " +
    "Βόλος (Volos, ~110K, central Greek port). " +
    "PEER BRANDS by tier: " +
    "Banking tier (THE four 'systemic' Greek banks post-crisis consolidation, all Greek-listed): Eurobank Holdings (the largest by various metrics; international footprint includes Postbank Bulgaria, Eurobank Cyprus), National Bank of Greece / NBG (the most historic Greek bank, founded 1841, state-influenced via HFSF residual ownership), Alpha Bank (Greek-listed, also operates in Romania, Cyprus), Piraeus Bank / Piraeus Financial Holdings (Greek-listed, the largest by assets post some reclassifications). These four are the only Greek banks of B2B reference scale; Greek banking is highly consolidated post-2010s crisis. " +
    "Industrial / state tier: Public Power Corporation / PPC / ΔΕΗ (Dimosia Epicheirisi Ilektrismou; state-controlled electricity utility — the dominant Greek utility, also expanded to Romania, Bulgaria, Croatia via 2024 Enel Romania acquisition), DESFA (state gas transmission), Hellenic Petroleum / ELPE / HELLENiQ ENERGY (the dominant Greek refiner, Greek-listed), Motor Oil Hellas (the second Greek refiner, Vardinogiannis-family-controlled). " +
    "Mytilineos Energy & Metals (BVB-listed conglomerate; aluminum + energy + concessions + EPC contracting — one of the most internationally successful Greek industrial groups, headquartered in Athens). " +
    "GEK Terna (engineering + concessions). " +
    "Titan Cement Group (Greek-founded cement, internationally listed and operating). " +
    "Telco: OTE / Cosmote (Hellenic Telecommunications Organization; Deutsche Telekom-controlled; the dominant Greek fixed and mobile operator — Cosmote is the mobile brand, OTE is the fixed-line brand, both under OTE Group; also operates in Romania via Telekom Romania historically, now divested post-Orange 2024), Vodafone Greece (acquired Wind Hellas 2024 — Vodafone is now the second mobile operator), Nova Greece (formerly Wind, United Group / BC Partners ownership). " +
    "Shipping (UNIQUELY important for Greek B2B; the Greek-owned merchant fleet is the largest in the world by tonnage, ~21% of global tonnage; family-owned shipping companies are major Greek B2B references and represent enormous wealth concentration. Names worth knowing for Greek peer context): Angelicoussis Shipping Group (Anangel Bulk Carriers + Maran Tankers + Maran Gas Maritime — one of the largest), Tsakos Energy Navigation (NYSE-listed TNP), Star Bulk Carriers (Nasdaq-listed SBLK, Hamburg-headquartered now but Greek-founded), Diana Shipping (NYSE-listed DSX), Costamare (NYSE-listed CMRE), Navios Maritime, GasLog (LNG), Capital Maritime, Dynacom Tankers, Polembros Shipping, Restis-family, Vafias-family. The Piraeus Cluster and the Hellenic Chamber of Shipping are major B2B contexts. " +
    "Retail / FMCG: Sklavenitis Group (the largest Greek-owned supermarket chain, expanded via 2017 Marinopoulos acquisition), AB Vassilopoulos (Ahold Delhaize), Lidl Hellas (Schwarz Group), My Market (Metro AEBE), Galaxias, Masoutis. " +
    "E-commerce / tech: Skroutz (THE dominant Greek price-comparison and marketplace platform — the Amazon-equivalent reflex for Greek B2B; private but central to Greek e-commerce), e-shop.gr (electronics e-commerce, Public-group related), Public.gr (Public Group — electronics / books / lifestyle retail, MIG Telecom heritage), Plaisio (electronics), efood (food delivery, OTE-acquired then Delivery Hero context), Wolt Greece (Finnish), Box Now (parcel lockers, Greek expanding regionally). Tourism platforms: Discover Greece, Trivago Hellas. " +
    "Tourism / hospitality (~25% of Greek GDP including indirect, so worth noting for any tourism-adjacent B2B): Astir Palace, Costa Navarino, Sani Resort (Halkidiki), Grecotel, Aldemar, Mitsis Hotels, TUI Greece, Aegean Airlines (Greek-listed AEGN — the largest Greek airline), Sky Express. " +
    "Match peer tier to prospect's company: banking-tier (the four systemic banks) for finance, state-industrial (PPC / ELPE) for traditional, OTE / Vodafone for telco, shipping families for maritime, Skroutz / Public for retail-tech, tourism brands for hospitality. " +
    "TONE: warm-formal, slightly more relational than CEE; Greek B2B sits between Italian/Spanish Mediterranean warmth and Northern European formality. Greek business culture values: explicit respect via εσείς and αξιότιμε / αξιότιμη openings, personal-relationship acknowledgment (Greek B2B often references mutual contacts, past meetings, family or background context — relationship capital matters more than in Anglo-Saxon norms), and concrete numbers paired with relational warmth. Greek business is often family-owned (especially shipping, retail, tourism, traditional industrial) — acknowledging family heritage in peer references is appropriate context. Avoid hype words ('επαναστατικός' without source, 'ηγέτης της αγοράς' without numbers, 'μοναδικός') which read as advertising. Sign-offs: 'Με εκτίμηση,' (formal standard, the most common B2B sign-off — literally 'With esteem'), 'Με σεβασμό,' (more formal alternative, 'With respect'), 'Φιλικά,' ('Cordially', warmer-formal, modern), 'Καλή συνέχεια,' ('Have a good continuation', semi-formal closing-warm). Match sign-off to opening: 'Αξιότιμε κύριε / Αξιότιμη κυρία' pairs with 'Με εκτίμηση,' or 'Με σεβασμό,'; 'Γεια σας' pairs with 'Με εκτίμηση,' or 'Φιλικά,'.",
};`;

const E1_MARKER = `"bg-BG":\n    "Bulgarian-Bulgaria (bg-BG):`;

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

if (!source.includes(`"hu-HU":\n    "Hungarian-Hungary (hu-HU):`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-ro-hu to have landed first");
  console.error("[FATAL] missing expected tier-3 hu-HU entry in GUIDES");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["guides-tier3-bg-el-append", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  // bg-BG content
  bgBGAdded:                source.includes(`"bg-BG":\n    "Bulgarian-Bulgaria (bg-BG):`),
  bgBGFormalRegister:       source.includes(`formal Вие (capitalized in formal correspondence`) &&
                            source.includes(`Never ти (singular informal) for cold B2B`),
  bgBGGreetingForms:        source.includes(`'Здравейте, {NAME},'`) && source.includes(`'Уважаеми г-н {LastName}`),
  bgBGRejectsZdrasti:       source.includes(`'Здрасти' / 'Чао' — informal-young; NEVER for cold B2B`),
  bgBGHasBGNCurrency:       source.includes(`CURRENCY: BGN (лв., the lev / leva plural)`) &&
                            source.includes(`'1 234 567,89 лв.'`),
  bgBGEuroAdoption:         source.includes(`Bulgaria is preparing for euro adoption with a target of January 2026`),
  bgBGEuroPeg:              source.includes(`pegged to the euro at ~1.95583 BGN/EUR since 1999`),
  bgBGHasSofia:             source.includes(`София (Sofia, capital and commercial center`),
  bgBGHasPlovdivVarna:      source.includes(`Пловдив (Plovdiv, ~340K`) && source.includes(`Варна (Varna, ~330K`),
  bgBGHasBankTier:          source.includes(`UniCredit Bulbank (UniCredit Italy subsidiary, the largest Bulgarian bank by assets`) &&
                            source.includes(`DSK Bank (OTP Group Hungary`),
  bgBGForeignBankNote:      source.includes(`Most Bulgarian banks are foreign-European-owned`),
  bgBGHasLukoilRefinery:    source.includes(`Lukoil Neftohim Burgas (Russian Lukoil-owned refinery`),
  bgBGHasA1Yettel:          source.includes(`A1 Bulgaria (formerly Mtel`) && source.includes(`Yettel Bulgaria (formerly Telenor Bulgaria`),
  bgBGHasTelerikSuccess:    source.includes(`Telerik / Progress (Bulgarian-founded by Svetozar Georgiev and Vassil Terziev`) &&
                            source.includes(`acquired by Progress Software in 2014`),
  bgBGHasSpeedyEcont:       source.includes(`Speedy AD (the dominant Bulgarian parcel courier`) &&
                            source.includes(`Econt Express`),
  bgBGHasEMAGBulgaria:      source.includes(`eMAG Bulgaria (the Romanian eMAG's Bulgarian operation`),
  bgBGHasSignoffs:          source.includes(`'С уважение,'`) && source.includes(`'Поздрави,'`),

  // el-GR content
  elGRAdded:                source.includes(`"el-GR":\n    "Greek-Greece (el-GR):`),
  elGRFormalRegister:       source.includes(`formal εσείς (esis, the plural-formal second-person`) &&
                            source.includes(`Never εσύ (esy, informal singular) for cold outreach`),
  elGRGreetingForms:        source.includes(`'Γεια σας, {NAME},'`) &&
                            source.includes(`'Καλημέρα, {NAME},'`) &&
                            source.includes(`'Αξιότιμε κύριε {LastName},`),
  elGRPolytonicNote:        source.includes(`The polytonic system (multiple accent marks) was officially replaced by monotonic`),
  elGRHasEURCurrency:       source.includes(`CURRENCY: EUR (€)`) && source.includes(`'€1.234.567,89'`),
  elGRDrachmaRetired:       source.includes(`Greece adopted the euro in 2002`) && source.includes(`drachma was retired`),
  elGRHasAthens:            source.includes(`Αθήνα (Athens, the commercial / political center`),
  elGRHasPiraeus:           source.includes(`Piraeus port area for shipping and logistics HQs`),
  elGRHasThessaloniki:      source.includes(`Θεσσαλονίκη (Thessaloniki, the second-largest city`),
  elGRFourBanksNote:        source.includes(`THE four 'systemic' Greek banks post-crisis consolidation`),
  elGRHasEurobankInternational: source.includes(`Eurobank Holdings`) &&
                            source.includes(`Postbank Bulgaria`),
  elGRHasNBGHistoric:       source.includes(`National Bank of Greece / NBG (the most historic Greek bank, founded 1841`),
  elGRHasPPCRegional:       source.includes(`Public Power Corporation / PPC / ΔΕΗ`) &&
                            source.includes(`2024 Enel Romania acquisition`),
  elGRHasMytilineos:        source.includes(`Mytilineos Energy & Metals (BVB-listed conglomerate`),
  elGRHasOTECosmote:        source.includes(`OTE / Cosmote (Hellenic Telecommunications Organization; Deutsche Telekom-controlled`),
  elGRHasVodafoneWind:      source.includes(`Vodafone Greece (acquired Wind Hellas 2024`),
  elGRShippingSection:      source.includes(`Shipping (UNIQUELY important for Greek B2B`) &&
                            source.includes(`~21% of global tonnage`),
  elGRShippingFamilies:     source.includes(`Angelicoussis Shipping Group`) &&
                            source.includes(`Tsakos Energy Navigation`) &&
                            source.includes(`Star Bulk Carriers`),
  elGRPiraeusCluster:       source.includes(`The Piraeus Cluster and the Hellenic Chamber of Shipping`),
  elGRHasSklavenitis:       source.includes(`Sklavenitis Group (the largest Greek-owned supermarket chain`),
  elGRHasSkroutz:           source.includes(`Skroutz (THE dominant Greek price-comparison and marketplace platform`),
  elGRTourismGDP:           source.includes(`~25% of Greek GDP including indirect`),
  elGRHasAegean:            source.includes(`Aegean Airlines (Greek-listed AEGN`),
  elGRRelationalToneNote:   source.includes(`Greek B2B sits between Italian/Spanish Mediterranean warmth and Northern European formality`),
  elGRFamilyOwnedNote:      source.includes(`Greek business is often family-owned`),
  elGRHasSignoffs:          source.includes(`'Με εκτίμηση,'`) && source.includes(`'Με σεβασμό,'`),

  // Untouched
  huHUUntouched:            source.includes(`"hu-HU":\n    "Hungarian-Hungary (hu-HU):`),
  roROUntouched:            source.includes(`"ro-RO":\n    "Romanian-Romania (ro-RO):`),
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
  bareBgUntouched:          source.includes(`Bulgarian (bg): Heavy localization`),
  bareElUntouched:          source.includes(`Greek (el): Heavy localization`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  ptBRUntouched:            source.includes(`Brazilian Portuguese (pt-BR)`),
  deCHUntouched:            source.includes(`Swiss High German (de-CH;`),
  buildNativenessUntouched: source.includes(`export function buildNativenessBlock`),
};
console.log("[language-nativeness-bg-el] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[language-nativeness-bg-el] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[language-nativeness-bg-el] DONE");
