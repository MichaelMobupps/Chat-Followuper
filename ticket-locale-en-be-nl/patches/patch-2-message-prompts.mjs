#!/usr/bin/env node
/**
 * Ticket locale-en-be-nl, patch 2/3: services/messagePrompts.ts
 *
 * One atomic edit: append en-BE and en-NL entries to GREETING_TABLE
 * after the existing en-US entry (last entry in the en-* tier block).
 *
 * Both use English greetings (Hi / Hello) since the body of the
 * message will be in English. The 'note' field carries the country-
 * specific context (cities, peer brands, currency, business culture,
 * tone calibration).
 *
 * Dependency: requires ticket-locale-tier3-bg-el to have landed.
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

const E1_OLD = `  "en-US": { withName: "Hi {NAME},", withoutName: "Hi there,", note: "American English, warm-direct. Default for most LLMs; explicit en-US tag mainly enforces US spelling (optimization, behavior, center) and US peer-brand references." },`;

const E1_NEW = `  "en-US": { withName: "Hi {NAME},", withoutName: "Hi there,", note: "American English, warm-direct. Default for most LLMs; explicit en-US tag mainly enforces US spelling (optimization, behavior, center) and US peer-brand references." },
  "en-BE": { withName: "Hi {NAME},", withoutName: "Hello,", note: "Belgian English. Belgium's B2B in mobile adtech and tech-enterprise contexts defaults to English as the neutral lingua franca between Flemish-speaking north (~60% of population, Antwerp / Ghent / Bruges / Leuven) and French-speaking south (~40%, Liege / Charleroi / Mons / Namur), with Brussels officially bilingual (French + Dutch) plus a small German-speaking eastern community. International B2B reads in English; if a buyer is explicitly Flemish-only, use nl; if Walloon-only, use fr-BE. 'Hi {NAME},' is the chat default; 'Hello {NAME},' or 'Dear {NAME},' for cold email. Use en-GB spelling (organisation, optimisation, behaviour, centre) — Belgian English follows European-English conventions, not American. Currency EUR (€), European separators: '€1.234.567,89' (period thousands, comma decimal). Cities: Brussels (Bruxelles / Brussel, the capital, ~1.2M; EU institutions HQ; the dominant Belgian B2B destination, especially for tech / multinationals; Avenue Louise and the European Quarter for premium business, Schuman for EU lobbying, North Quarter for finance), Antwerp (Antwerpen, ~520K; Belgium's largest port, diamond trade, second-largest Flemish business hub), Ghent (Gent, ~265K; Flemish tech hub — Universiteit Gent / UGent, biotech via VIB), Liege (Liege / Liege, ~195K; largest Walloon city, traditional industrial + emerging tech), Charleroi (Charleroi, ~200K; Walloon industrial, BSB airport), Leuven (~100K; KU Leuven, IMEC semiconductor research, biotech). Peer brands: banking (KBC Group — Belgian-listed, the largest Belgian bank by retail metric; BNP Paribas Fortis — Belgian operation of BNP Paribas France, the largest by various metrics; ING Belgium; Belfius — state-owned post-2011 nationalisation; Argenta), pharma / chemicals (UCB — biopharma BVB-listed; Janssen Pharmaceutica — part of Johnson & Johnson, Beerse HQ; Solvay — chemicals BVB-listed; Tessenderlo Group; GSK Belgium / Wavre — major vaccine production), industrial (Umicore — recycling and battery materials BVB-listed; Bekaert — steel wire; Agfa-Gevaert; Sioen Industries; Recticel), beer (AB InBev — Anheuser-Busch InBev, the largest beer company globally, Leuven HQ — Belgian B2B reflexively knows this), retail (Colruyt Group — the largest Belgian-owned retailer, Colruyt + Okay + Bio-Planet; Delhaize — now part of Ahold Delhaize; Carrefour Belgium; Lidl Belgium; Aldi Belgium), telco (Proximus — incumbent state-owned-majority, the dominant Belgian telco; Orange Belgium — formerly Mobistar; Telenet — cable + mobile, part of Liberty Global). Tech / digital: Odoo (Belgian-founded ERP / business apps, Louvain-la-Neuve HQ — the most internationally successful Belgian tech success), Showpad (sales enablement, Ghent + Chicago dual HQ), Collibra (data intelligence, US HQ now but Belgian-founded), Teamleader (CRM / project management), Tobania (IT services), Argenta (banking + investing). E-commerce: Bol.com (Dutch but huge Belgian presence), Coolblue Belgium, Amazon.com.be (recently launched). Mobility: Wolt Belgium, Deliveroo Belgium, Bolt Belgium, Uber Belgium. TONE: formal-warm. Belgian B2B sits between Dutch directness and French politeness — more polite than Netherlands, less polite-ceremonial than France. Acknowledge the linguistic / cultural complexity when relevant (e.g., explicit Flanders / Wallonia / Brussels split). Match peer tier to prospect's company sector." },
  "en-NL": { withName: "Hi {NAME},", withoutName: "Hello,", note: "Dutch B2B in English. Netherlands B2B in mobile adtech / tech-enterprise overwhelmingly uses English internally and externally; ~one in four Dutch enterprises use English as primary working language, and that share is much higher in tech / SaaS / international B2B. Use bare nl for explicitly Dutch-language requests; en-NL is the default for tech B2B. 'Hi {NAME},' is the chat default and works for almost all contexts; 'Hello {NAME},' or 'Dear {NAME},' for the most formal cold email. Use en-GB spelling (organisation, optimisation, behaviour, centre) — Dutch English follows European-English conventions, not American. Currency EUR (€), European separators: '€1.234.567,89'. Cities: Amsterdam (the commercial / political center, ~880K city + ~2.5M metro; the dominant Dutch tech hub; Zuidas business district for finance and corporate HQs — comparable to Frankfurt's banking district or London's Canary Wharf; Centrum / Jordaan for traditional business and creative; Houthavens / NDSM for tech / startup), Rotterdam (~660K, the largest European port by tonnage; manufacturing + logistics; Erasmus University), The Hague (Den Haag, ~560K; government + international institutions including ICC, Europol; growing tech), Utrecht (~360K; healthcare + retail HQs — Rabobank HQ; central transport hub), Eindhoven (~245K; THE Dutch high-tech hub — ASML, Philips, NXP Semiconductors, Brainport Eindhoven; the Dutch Silicon Valley equivalent), Groningen (~235K; northern Netherlands; energy + tech). Peer brands: tech (Booking.com — the dominant Dutch tech success, Amsterdam HQ, Nasdaq-listed BKNG; ASML — Veldhoven, the global EUV lithography monopoly, the most valuable Dutch company and a critical semiconductor supply-chain reference; Adyen — Amsterdam, payments unicorn AEX-listed; Mollie — payments unicorn; TomTom — navigation, Amsterdam; Just Eat Takeaway — Amsterdam HQ post-merger; Coolblue — e-commerce; Bol.com — e-commerce, NL+BE dominant; WeTransfer; Wetransfer; Mendix — low-code, Siemens-acquired; UiPath has large Amsterdam presence; Backbase — banking software; Mews — hospitality, expanded internationally), banking (ING Group — the largest Dutch bank, also major in Belgium / Germany / Poland; Rabobank — cooperative, food / agriculture focus; ABN AMRO — listed AEX, retail + corporate; Triodos Bank — ethical banking), industrial (Philips — Eindhoven, healthcare + lighting historically, AEX-listed; DSM-Firmenich — nutrition / specialty chemicals, merged 2023; Akzo Nobel — paints / coatings; Unilever — Anglo-Dutch headquartered split, consumer goods; Heineken — the largest Dutch brewer, AEX-listed), telco (KPN — incumbent former state, the dominant Dutch fixed + mobile; VodafoneZiggo — joint venture mobile + cable; T-Mobile Netherlands — recently acquired by Apax / Warburg Pincus, rebrand likely; Odido is the new brand combining T-Mobile NL post-2024). Retail: Albert Heijn (Ahold Delhaize, the dominant supermarket), Jumbo (second largest), Lidl Netherlands, Aldi, Plus, Dirk, HEMA (department stores). Mobility: Wolt Netherlands (Finnish), Bolt Netherlands, Uber Netherlands, Flink (groceries), Picnic (online grocery, Dutch-founded). TONE: extremely direct, low-context, Calvinist-pragmatic. Dutch B2B is famously the most direct business culture in Europe — no small talk, no hedging, get to the point in the first sentence, expect counter-questions and pushback, expect 'no' to mean 'no' (not 'maybe later'). Avoid American-style hype and salesy language ('revolutionary', 'game-changing', 'unlock value', 'best-in-class' without numbers) — these read as foreign-template and trigger immediate skepticism. Dutch B2B prefers concrete numbers, qualified claims, transparency about limitations. 'I think this could save you ~12 hours per week' beats 'this will transform your workflow'. Match peer tier to prospect's company sector: ING / Rabobank / ABN AMRO for finance, Philips / DSM / ASML for industrial / tech, Booking / Adyen / Mollie for tech / SaaS, KPN / Odido / VodafoneZiggo for telco." },`;

const E1_MARKER = `"en-BE": { withName: "Hi {NAME},"`;

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

if (!source.includes(`"en-US": { withName: "Hi {NAME},", withoutName: "Hi there,", note: "American English, warm-direct.`)) {
  console.error("[FATAL] this patch requires the en-US entry to be present in GREETING_TABLE (precondition)");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["greeting-en-be-nl-add", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  // en-BE
  enBEAdded:                source.includes(`"en-BE": { withName: "Hi {NAME},"`),
  enBELinguisticSplit:      source.includes(`Flemish-speaking north`) &&
                            source.includes(`French-speaking south`) &&
                            source.includes(`Brussels officially bilingual`),
  enBEBrussels:             source.includes(`Brussels (Bruxelles / Brussel, the capital`) &&
                            source.includes(`EU institutions HQ`),
  enBEAntwerp:              source.includes(`Antwerp (Antwerpen, ~520K`),
  enBEGhentLeuven:          source.includes(`Ghent (Gent, ~265K; Flemish tech hub`) &&
                            source.includes(`Leuven (~100K; KU Leuven, IMEC`),
  enBEBankTier:             source.includes(`KBC Group`) &&
                            source.includes(`BNP Paribas Fortis`) &&
                            source.includes(`Belfius`),
  enBEPharmaChemicals:      source.includes(`UCB`) && source.includes(`Janssen Pharmaceutica`) &&
                            source.includes(`Solvay`),
  enBEABInBev:              source.includes(`AB InBev`) && source.includes(`the largest beer company globally`),
  enBEColruyt:              source.includes(`Colruyt Group`),
  enBEProximus:             source.includes(`Proximus`),
  enBEOdoo:                 source.includes(`Odoo (Belgian-founded ERP`),
  enBEShowpad:              source.includes(`Showpad (sales enablement`),
  enBECollibra:             source.includes(`Collibra`),
  enBEEnglishSpelling:      source.includes(`Use en-GB spelling`),
  enBEEURCurrency:          source.includes(`Currency EUR (€)`),
  enBETone:                 source.includes(`between Dutch directness and French politeness`),

  // en-NL
  enNLAdded:                source.includes(`"en-NL": { withName: "Hi {NAME},"`),
  enNLEnglishWorking:       source.includes(`overwhelmingly uses English internally`) &&
                            source.includes(`one in four Dutch enterprises use English as primary working language`),
  enNLAmsterdam:            source.includes(`Amsterdam (the commercial / political center`) &&
                            source.includes(`Zuidas business district`),
  enNLRotterdam:            source.includes(`Rotterdam (~660K, the largest European port by tonnage`),
  enNLHague:                source.includes(`The Hague (Den Haag`),
  enNLEindhoven:            source.includes(`Eindhoven (~245K; THE Dutch high-tech hub`) &&
                            source.includes(`ASML, Philips, NXP Semiconductors`),
  enNLBooking:              source.includes(`Booking.com — the dominant Dutch tech success`),
  enNLASML:                 source.includes(`ASML — Veldhoven, the global EUV lithography monopoly`),
  enNLAdyen:                source.includes(`Adyen — Amsterdam, payments unicorn`),
  enNLMollie:               source.includes(`Mollie`),
  enNLTomTom:               source.includes(`TomTom — navigation, Amsterdam`),
  enNLBanking:              source.includes(`ING Group`) && source.includes(`Rabobank`) &&
                            source.includes(`ABN AMRO`),
  enNLPhilipsHeineken:      source.includes(`Philips`) && source.includes(`Heineken`) &&
                            source.includes(`DSM-Firmenich`),
  enNLTelco:                source.includes(`KPN`) && source.includes(`VodafoneZiggo`) &&
                            source.includes(`Odido`),
  enNLAlbertHeijn:          source.includes(`Albert Heijn (Ahold Delhaize, the dominant supermarket)`),
  enNLPicnic:               source.includes(`Picnic (online grocery, Dutch-founded)`),
  enNLDirectTone:           source.includes(`extremely direct, low-context, Calvinist-pragmatic`),
  enNLEURCurrency:          source.includes(`Currency EUR (€)`),
  enNLEnglishSpelling:      source.includes(`Use en-GB spelling`),

  // Untouched
  enUSUntouched:            source.includes(`"en-US": { withName: "Hi {NAME},", withoutName: "Hi there,", note: "American English, warm-direct.`),
  enGBUntouched:            source.includes(`"en-GB": { withName: "Hi {NAME},", withoutName: "Hello,", note: "British English`),
  enINUntouched:            source.includes(`"en-IN": { withName: "Hello {NAME},", withoutName: "Hello,", note: "Indian English`),
  bareNlUntouched:          source.includes(`nl: { withName: "Hallo {NAME},", withoutName: "Hallo,", note: "" },`),
  // Prior tier-3 unaffected
  elGRUntouched:            source.includes(`"el-GR": { withName: "Γεια σας, {NAME},"`),
  bgBGUntouched:            source.includes(`"bg-BG": { withName: "Здравейте, {NAME},"`),
  huHUUntouched:            source.includes(`"hu-HU": { withName: "Üdvözlöm, {NAME},"`),
  roROUntouched:            source.includes(`"ro-RO": { withName: "Bună ziua, {NAME},"`),
  csCZUntouched:            source.includes(`"cs-CZ": { withName: "Dobrý den, {NAME},"`),
  ukUAUntouched:            source.includes(`"uk-UA": { withName: "Вітаю, {NAME},"`),
  idIDUntouched:            source.includes(`"id-ID": { withName: "Selamat pagi, Bapak/Ibu {NAME},"`),
  ruRUUntouched:            source.includes(`"ru-RU": { withName: "Здравствуйте, {NAME},"`),
  itITUntouched:            source.includes(`"it-IT": { withName: "Salve {NAME},"`),
  jaJPUntouched:            source.includes(`"ja-JP": { withName: "{NAME}様、"`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
};
console.log("[message-prompts-en-be-nl] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[message-prompts-en-be-nl] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[message-prompts-en-be-nl] DONE");
