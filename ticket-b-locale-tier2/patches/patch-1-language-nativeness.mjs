#!/usr/bin/env node
/**
 * Ticket B-locale-tier2 — patch 1/2: lib/languageNativeness.ts
 *
 * Adds 8 regional locale GUIDES entries: en-IN, en-GB, en-US, fr-FR,
 * fr-CA, de-DE, de-AT, de-CH. Each entry mirrors the tier1 shape:
 * register/pronoun, sibling-locale vocabulary differentials, adtech
 * translation rules with English-acronym whitelist, city/currency/
 * peer-brand references, tone, code-switching rules.
 *
 * English variants are deliberately lighter on code-switching (English
 * IS the source language) and emphasise spelling, regional brand
 * references, and register. French and German variants follow the
 * tier1 depth with full vocabulary and adtech blocks.
 *
 * The localeResolver already maps relevant (country, language) pairs
 * to these tags, so they fire automatically: India/Pakistan/Bangladesh/
 * SriLanka -> en-IN; UK/IE/AU/NZ/ZA -> en-GB; US/Canada-en -> en-US;
 * France/Belgium-fr/Switzerland-fr/Luxembourg/MA/DZ/TN -> fr-FR;
 * Canada-fr -> fr-CA; Germany/Luxembourg-de -> de-DE; Austria -> de-AT;
 * Switzerland-de -> de-CH.
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
// Edit 1 — Append tier2 entries after the ar-MA tier1 entry
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the closing "TONE: ..." line of ar-MA + the GUIDES closing
// brace. ar-MA's tone line is unique to that entry. Em-dash-free.

const E1_OLD = `    "TONE: Less formal than Gulf, more formal than Egypt.",
};`;

const E1_NEW = `    "TONE: Less formal than Gulf, more formal than Egypt.",

  // ── REGIONAL LOCALES (B-locale-tier2) ──────────────────────────
  // English / French / German regional variants. English variants
  // are lighter on code-switching (English IS the source language)
  // and emphasise spelling, regional brand references, and register.
  // French and German variants follow tier1 depth.

  "en-IN":
    "Indian English (en-IN; covers also Pakistan, Bangladesh, Sri Lanka B2B): Standard register is more formal than en-US, less than en-GB. B2B register: 'Mr. / Ms. {LastName}' for first contact; first names acceptable once warm. " +
    "KEY VOCABULARY DIFFERENCES from en-US: lakh / crore (NOT million for amounts under 100M INR; one crore = 10,000,000), prepone (advance / move earlier), do the needful (acceptable in formal email but DO NOT overuse on WhatsApp), revert (used as 'I will revert tomorrow' meaning 'I will reply'), out of station (= traveling), kindly (more common as polite softener than US use), sir / madam (still common in cold outreach to senior contacts). " +
    "ADTECH VOCABULARY: India keeps almost all adtech terms in English; no localization needed. Standard terms: CPI, CPA, ROAS, DSP, MMP, LTV, KPI, lookalike, retention, cohort, fraud filtering, in-app, attribution, churn, ARPU, D7. Spelling follows en-GB for ambiguous words: optimisation (NOT optimization), centre (NOT center), colour (NOT color), behaviour (NOT behavior), licence (noun) / license (verb). " +
    "CITY/MARKET REFERENCES: Mumbai, Bengaluru / Bangalore, Delhi-NCR (Delhi, Gurugram / Gurgaon, Noida), Hyderabad, Chennai, Pune, Kolkata, Ahmedabad. Currency INR (Rs / ₹); use 'lakh' (1,00,000 with Indian comma grouping) and 'crore' (1,00,00,000) for INR amounts in the lakh-to-crore range. Indian peer brands (Flipkart, Reliance Retail / JioMart, Tata Digital, Paytm, PhonePe, Zomato, Swiggy, Ola, OYO, Nykaa, Meesho, Dream11, Hotstar / Disney+ Hotstar, Jio, Airtel, ICICI Bank, HDFC Bank, SBI, Bajaj Finserv). Bangladesh: bKash, Pathao, Daraz Bangladesh. Sri Lanka: Daraz Sri Lanka, Dialog. Pakistan: Daraz Pakistan, JazzCash, Easypaisa. " +
    "TONE: B2B Indian English is more formal than American or UK B2B. Use 'Hello' or 'Hi' on WhatsApp; 'Dear Mr. {LastName}' on email. Avoid US slang (ballpark, low-hanging fruit, slam dunk) since these read as Western and slightly out of place. 'Do the needful' and 'kindly revert' are formal email register; do not use on WhatsApp.",

  "en-GB":
    "British English (en-GB; covers also Ireland, Australia, New Zealand, South Africa B2B): More formal than en-US, less idiomatic. B2B WhatsApp register: 'Hi {NAME},' is fine; cold email defaults to 'Hello {NAME},' or 'Dear {NAME},'. " +
    "SPELLING (en-GB orthography only, never en-US): optimisation, organisation, prioritise, analyse, behaviour, colour, centre, theatre, metre, defence, licence (noun) / license (verb), enquiry (more British) and inquiry (both used), travelled (double-l), towards (NOT toward), amongst (both work, amongst more British). Use 'whilst' sparingly. " +
    "ADTECH VOCABULARY: standard English terms, all kept (no localization needed). British market often refers to 'media planning' rather than 'media buying' for the strategic side; both terms understood. UK programmatic talk uses 'inventory' and 'demand' the same as US. " +
    "CITY/MARKET REFERENCES: London, Manchester, Birmingham, Edinburgh, Glasgow, Bristol, Leeds, Belfast, Cardiff; Dublin (RoI). Currency GBP (£), EUR (€) for Ireland, AUD (A$) for Australia, NZD (NZ$) for New Zealand, ZAR (R) for South Africa. UK peer brands (Tesco, Sainsbury's, Asda, Morrisons, M&S / Marks and Spencer, John Lewis, Boots, Argos, Sky, BT, Virgin Media O2, Vodafone UK, Three UK, Just Eat, Deliveroo, Ocado, ASOS, Boohoo, Burberry, Lloyds, Barclays, NatWest, HSBC UK, Nationwide, Monzo, Revolut UK, Wise). Irish brands (SuperValu, Centra, Three Ireland, Eir, AIB, Bank of Ireland). Australian brands (Woolworths, Coles, JB Hi-Fi, Telstra, Optus, Commonwealth Bank, ANZ, Westpac, NAB, Afterpay, Zip). " +
    "TONE: more reserved than en-US. Avoid Americanisms: 'reach out' is acceptable; 'circle back' is borderline; 'touch base' is borderline. Understatement is preferred over hype: 'quite useful' often means 'very useful'; 'not bad' is positive; 'interesting' can be polite for 'I disagree'. Avoid 'gotten' (use 'got'), 'I'll go ahead and...' (over-soft), 'awesome' / 'super' (too casual for B2B).",

  "en-US":
    "American English (en-US; covers also English-Canada B2B; Quebec uses fr-CA): Default English variant for most LLMs. B2B WhatsApp register: 'Hi {NAME},' direct and warm. " +
    "SPELLING (en-US orthography only): optimization, organization, prioritize, analyze, behavior, color, center, theater, meter, defense, license (both noun and verb), inquiry, traveled (single-l), toward (NOT towards), among. " +
    "ADTECH VOCABULARY: standard English terms, all kept. US market is the canonical English-language adtech vocabulary; no special considerations beyond the standard term list. Common phrasing: 'media buy', 'incrementality', 'attribution windows', 'D7 ROAS'. " +
    "CITY/MARKET REFERENCES: New York, Los Angeles, San Francisco / Bay Area, Chicago, Boston, Seattle, Austin, Atlanta, Miami, Denver, Dallas, Houston, Washington D.C. Currency USD ($). US peer brands (Amazon, Walmart, Target, Best Buy, Costco, Home Depot, Lowe's; Apple, Google / Alphabet, Meta, Microsoft, Netflix; DoorDash, Uber, Lyft, Instacart, Airbnb, Robinhood, Chime, Cash App, Venmo, PayPal; Disney+, Hulu, HBO Max, Peacock; Bank of America, JPMorgan Chase, Wells Fargo, Citi, Capital One; AT&T, Verizon, T-Mobile US). Canada-en peer brands (Loblaws, Shoppers Drug Mart, Rogers, Telus, Bell, RBC, TD Bank, Tim Hortons, Lululemon). " +
    "TONE: warm-direct. 'Reach out', 'circle back', 'touch base', 'quick chat' are all standard. Avoid over-formality ('Dear Sir/Madam' reads as outdated for tech B2B). Mild hype is acceptable ('great', 'awesome' OK in casual B2B); avoid 'amazing' / 'incredible' / 'world-class' which trend too far into marketing-speak.",

  "fr-FR":
    "Metropolitan French (fr-FR; covers also Belgium-fr, Switzerland-fr, Luxembourg-fr, French-language Maghreb B2B): Standard French register for cold B2B. Use 'vous' for ALL cold outreach. 'Tu' is not acceptable for first contact even in modern tech B2B. " +
    "KEY VOCABULARY: courriel and email both used (email more modern in tech B2B), portable / mobile (NOT cellulaire which is fr-CA), week-end (with hyphen), parking (loanword OK), shopping (loanword OK in fr-FR though purists prefer 'achats'), e-commerce (kept English). Numbers use space as thousands separator and comma as decimal: '1 234,56 €'. " +
    "ADTECH VOCABULARY: fr-FR is moderately English-tolerant. Keep in English: CPI, CPA, ROAS, DSP, MMP, LTV, KPI, A/B, SDK, OEM, lookalike, cohort, in-app, fraud filtering, ROI (sometimes RSI but ROI more common), churn (or attrition). Translate: conversion, ciblage, segmentation, audience, trafic, créatifs / créations, retargeting>reciblage (or kept English in tech B2B), retention>rétention, bid>enchère, dashboard>tableau de bord (or kept English). Use 'la' (feminine) for English borrowings as default ('la conversion', 'la performance', 'la data'); some are masculine ('le tracking', 'le ROI', 'le funnel'). " +
    "CITY/MARKET REFERENCES: Paris (Île-de-France), Lyon, Marseille, Toulouse, Bordeaux, Lille, Nantes, Strasbourg, Nice, Rennes; Bruxelles / Brussels, Anvers / Antwerpen, Liège, Luxembourg-Ville. Currency EUR (€). French peer brands (Carrefour, Leclerc, Auchan, Casino, Monoprix, Fnac, Darty, La Redoute, Cdiscount, Vinted FR, BlaBlaCar, Doctolib, Veepee / Showroomprivé, Sarenza, ManoMano, Orange France, SFR, Bouygues Telecom, Free Mobile, BNP Paribas, Société Générale, Crédit Agricole, La Banque Postale, Boursorama). Belgian brands (Colruyt, Delhaize, Carrefour Belgium, Proximus, Telenet, Orange Belgium, KBC, Belfius, ING Belgium). " +
    "TONE: courteous-formal. Standard openers: 'Bonjour {NAME},' on WhatsApp; 'Bonjour Madame / Monsieur {LastName},' for cold email. Sign-offs trend formal: 'Cordialement,' is the standard, 'Bien cordialement,' is more polite, 'Sincères salutations,' for very formal contexts. Avoid Americanisms transliterated ('Faisons cela' for 'let's do it' reads stiff; 'Rebondissons sur ce point' for 'circle back' is awkward).",

  "fr-CA":
    "Canadian / Quebec French (fr-CA): Stronger anti-anglicisme tradition than fr-FR. Quebec professionals deliberately use French equivalents where fr-FR speakers tolerate English borrowings. Use 'vous' for cold outreach (same as fr-FR). " +
    "KEY VOCABULARY DIFFERENCES from fr-FR: courriel (NOT email — Quebec defaults to courriel even in tech B2B), magasinage (NOT shopping), fin de semaine (NOT week-end), stationnement (NOT parking), arrêt (NOT stop), char (informal for car, NOT voiture in casual register), bienvenue (= 'you are welcome', the Québécois marker; 'de rien' also accepted in modern Quebec but bienvenue is the regionalism), dépanneur (= corner store, untranslatable Quebec term), traversier (NOT ferry), clavarder (= chat online, archaic-but-recognized OQLF coinage). Telephone: cellulaire (NOT mobile, NOT portable). " +
    "ADTECH VOCABULARY: more localized than fr-FR. Translate where possible: conversion (kept), ciblage, audience, trafic, créatifs, attribution, recibrage / reciblage (NOT retargeting), enchère (NOT bid), tableau de bord (NOT dashboard), apprentissage automatique (NOT machine learning, though ML acronym fine), entonnoir de conversion (NOT funnel). Keep ONLY: CPI, CPA, ROAS, DSP, LTV, MMP, KPI, A/B, SDK. The Office Québécois de la Langue Française (OQLF) actively coins French equivalents and tech B2B respects this; over-using English borrowings reads as careless. " +
    "CITY/MARKET REFERENCES: Montréal, Québec (city), Laval, Gatineau, Sherbrooke, Trois-Rivières, Saguenay; English-Canada cities (Toronto, Vancouver, Calgary, Edmonton, Ottawa) referenced in English even in fr-CA messages. Currency CAD ($ CA or simply $). Quebec peer brands (Couche-Tard, Jean Coutu, Metro QC, IGA, Provigo, Maxi, Familiprix, Uniprix, La Capitale, Desjardins, Banque Nationale, BMO Québec, RBC Québec, Vidéotron, Bell Canada, Telus Québec, Air Canada, Cirque du Soleil, BRP / Bombardier Recreational Products, Cascades). " +
    "TONE: warm-formal. 'Bonjour {NAME},' on WhatsApp; 'Bonjour Madame / Monsieur,' or simply 'Bonjour,' on email cold outreach. Sign-off: 'Cordialement,' or the more Québécois 'Salutations distinguées,'. Quebec B2B is direct but not as informal as US English; avoid hype words and avoid English-derived phrasing.",

  "de-DE":
    "Standard German (de-DE; covers German Federal Republic and Luxembourg-de B2B): Default German register. B2B uses 'Sie' (formal) for ALL cold outreach. 'Du' only after explicit invitation, never in first contact even in modern tech B2B (Berlin startup culture is the rare exception). " +
    "ORTHOGRAPHY: standard German post-1996 reform. Uses ß (eszett) for sharp s where rules require: groß, Straße, Fußball, weiß, Maß, Schloß. Note 'dass' (post-reform) replaces older 'daß'. Capitalize ALL nouns. Numbers use period as thousands separator and comma as decimal: '1.234,56 €'. " +
    "ADTECH VOCABULARY: German B2B is heavily English-tolerant. Keep in English: CPI, CPA, ROAS, DSP, MMP, LTV, KPI, lookalike, retention, cohort, in-app, fraud filtering, churn, ARPU, programmatic, attribution, A/B-Test, ROI. Mix English nouns into German sentences with German articles: 'das Targeting', 'die Performance', 'der Funnel', 'das Tracking', 'die Conversion-Rate', 'der ROAS'. Localize ONLY when there is a well-established German term: Werbeanzeige (ad), Zielgruppe (audience), Kampagne (campaign), Reichweite (reach), Datenschutz (privacy / data protection), Einwilligung (consent). " +
    "CITY/MARKET REFERENCES: Berlin, München (Munich), Hamburg, Frankfurt am Main, Köln (Cologne), Stuttgart, Düsseldorf, Leipzig, Hannover, Nürnberg, Dresden, Bremen. Currency EUR (€). German peer brands (Lidl, Aldi Süd / Aldi Nord, Edeka, Rewe, Kaufland, Penny, Netto, dm-drogerie markt, Rossmann, Otto, Zalando, MediaMarkt, Saturn, About You, Flixbus, FlixTrain, N26, Trade Republic, Comdirect, ING-DiBa, Deutsche Bank, Commerzbank, Sparkasse, Volkswagen, Mercedes-Benz, BMW, Audi, Allianz, Munich Re, Telekom Deutschland / Deutsche Telekom, Vodafone Germany, O2 / Telefónica Germany, 1&1). " +
    "TONE: formal-direct. Standard openers: 'Hallo {NAME},' on WhatsApp (softer); 'Sehr geehrte Frau / Sehr geehrter Herr {LastName},' on cold email; 'Sehr geehrte Damen und Herren,' if no name known. Sign-off: 'Mit freundlichen Grüßen,' (formal standard) or 'Viele Grüße,' / 'Beste Grüße,' (modern professional). Avoid hype; understated competence is the cultural register. Numbers and concrete deliverables matter more than narrative.",

  "de-AT":
    "Austrian German (de-AT): Mostly identical to de-DE but with Austrian-specific vocabulary and slightly softer formality. Use 'Sie' for cold outreach (same as de-DE). " +
    "KEY VOCABULARY DIFFERENCES from de-DE: Jänner (NOT Januar — Austrian word for January), Feber (older form of Februar, recognized but Februar more common in modern Austrian B2B), heuer (= 'this year', NOT 'dieses Jahr' — though both work), Sackerl (NOT Tüte, for shopping bag), Erdäpfel (NOT Kartoffeln, regional/older — Kartoffel is universal), Paradeiser (NOT Tomate, regional/older — Tomate is universal in B2B), Spital (used alongside Krankenhaus). Greetings: 'Servus' is informal Austrian (do NOT use for B2B cold); 'Grüß Gott' is traditional and used in spoken business but feels dated on WhatsApp; default to 'Hallo' or 'Guten Tag'. " +
    "ORTHOGRAPHY: same as de-DE (post-1996 reform, uses ß). " +
    "ADTECH VOCABULARY: same as de-DE. Austrian B2B is similarly English-tolerant; same article patterns ('das Targeting', 'die Performance'). No Austrian-specific adtech localization. " +
    "CITY/MARKET REFERENCES: Wien (Vienna), Graz, Linz, Salzburg, Innsbruck, Klagenfurt, Villach, Wels. Currency EUR (€). Austrian peer brands (Spar Austria, Billa, Hofer / Aldi Austria, Penny Austria, Merkur, Interspar, Müller Austria, BIPA, Libro, Thalia Austria, ÖBB / Austrian Federal Railways, A1 Telekom Austria, Magenta Telekom, Drei Austria / 3 Austria, Erste Bank, Raiffeisen, BAWAG P.S.K., Bank Austria, Wien Energie, OMV, Red Bull, Magna Steyr, voestalpine, Andritz). " +
    "TONE: slightly softer than de-DE. Standard openers: 'Hallo {NAME},' on WhatsApp; 'Sehr geehrte Frau / Sehr geehrter Herr,' on email. Sign-off: 'Mit freundlichen Grüßen,' or 'Beste Grüße,'. Austrian B2B values relationship-building more than the German direct register; allow a touch more warmth.",

  "de-CH":
    "Swiss High German (de-CH; the WRITTEN B2B register; spoken Swiss German / Schwyzerdütsch is dialectal and is NOT used in business writing). Use 'Sie' for cold outreach. Switzerland is multilingual; use de-CH only for German-speaking cantons (Zürich, Bern, Basel, Luzern, Aargau, Thurgau, etc.). " +
    "ORTHOGRAPHY: NO ß. Swiss orthography replaces ß with ss in ALL cases: gross (NOT groß), Strasse (NOT Straße), Fussball, weiss, dass, Mass, Schloss, Grüsse (NOT Grüße). This is the most visible Swiss-German marker; getting it wrong signals foreign authorship immediately. " +
    "KEY VOCABULARY DIFFERENCES from de-DE: Velo (NOT Fahrrad for bike), Trottoir (NOT Bürgersteig for sidewalk), parkieren (NOT parken), Tram (universal but Swiss prefers it over Strassenbahn), Natel (somewhat archaic for mobile phone, Handy more modern), Coiffeur (NOT Friseur), Lehrling / Lehrtochter (apprentice, gendered Swiss form), Spital (universal in CH for hospital, NOT Krankenhaus), Glace (NOT Eis for ice cream), Billett (NOT Fahrkarte / Ticket — though Ticket also used). " +
    "ADTECH VOCABULARY: same as de-DE; heavily English-tolerant. Same article patterns, same English-borrowing list. No Swiss-specific adtech localization. " +
    "CITY/MARKET REFERENCES: Zürich, Genève / Geneva (French-speaking), Basel, Bern, Lausanne (French-speaking), Winterthur, Luzern, St. Gallen, Lugano (Italian-speaking), Biel/Bienne (bilingual). Currency CHF (Swiss Franc, written 'CHF' or 'Fr.', NOT €; use the period as thousands separator and the period or comma as decimal: 'CHF 1'234.56' or 'CHF 1\\u2019234.56' with apostrophe). Swiss peer brands (Migros, Coop, Denner, Aldi Suisse, Lidl Schweiz, Manor, Globus, Volg, Spar Schweiz, Swisscom, Sunrise, Salt Mobile, UBS, Credit Suisse / now part of UBS, Raiffeisen Schweiz, ZKB / Zürcher Kantonalbank, Postfinance, Nestlé, Roche, Novartis, ABB, Holcim, SBB / Swiss Federal Railways, Swiss / Swiss International Air Lines). " +
    "TONE: most formal of the German variants. Swiss B2B values precision and understatement; avoid hype, avoid superlatives, avoid casual softeners. Standard openers: 'Guten Tag {NAME},' on WhatsApp (Hallo also acceptable but Guten Tag is the safer Swiss default); 'Sehr geehrte Damen und Herren,' or 'Sehr geehrte Frau / Sehr geehrter Herr {LastName},' on email. Sign-off: 'Freundliche Grüsse,' (NOT Grüße — ss only). Cultural note: Swiss B2B may take longer to warm up than German or Austrian counterparts; do not push pace.",
};`;

const E1_MARKER = `// ── REGIONAL LOCALES (B-locale-tier2) ──`;

// ═════════════════════════════════════════════════════════════════
// applyEdit
// ═════════════════════════════════════════════════════════════════

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) { console.log(`[${label}] SKIP — already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP — anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL — anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

for (const [label, oldStr, newStr, marker] of [
  ["tier2-guides", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  enIN: source.includes(`"en-IN":\n    "Indian English`),
  enGB: source.includes(`"en-GB":\n    "British English`),
  enUS: source.includes(`"en-US":\n    "American English`),
  frFR: source.includes(`"fr-FR":\n    "Metropolitan French`),
  frCA: source.includes(`"fr-CA":\n    "Canadian / Quebec French`),
  deDE: source.includes(`"de-DE":\n    "Standard German`),
  deAT: source.includes(`"de-AT":\n    "Austrian German`),
  deCH: source.includes(`"de-CH":\n    "Swiss High German`),
  tier2Header: source.includes("REGIONAL LOCALES (B-locale-tier2)"),
  // Spot-check distinguishing details
  enINlakhCrore: source.includes("lakh / crore"),
  enGBspelling: source.includes("optimisation, organisation, prioritise"),
  enUSspelling: source.includes("optimization, organization, prioritize"),
  frFRcourtesy: source.includes("'Cordialement,'"),
  frCAcourriel: source.includes("courriel (NOT email"),
  deDEarticleMix: source.includes("'das Targeting', 'die Performance'"),
  deATjaenner: source.includes("Jänner (NOT Januar"),
  deCHnoEszett: source.includes("Strasse (NOT Straße)"),
};
console.log("[language-nativeness-tier2] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[language-nativeness-tier2] FAIL"); process.exit(4);
}
console.log("[language-nativeness-tier2] DONE");
