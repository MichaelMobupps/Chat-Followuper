#!/usr/bin/env node
/**
 * Ticket locale-en-be-nl, patch 3/3: lib/languageNativeness.ts
 *
 * One atomic edit: append en-BE and en-NL entries to the en-* GUIDES
 * block after the existing en-US entry.
 *
 * Dependency: requires ticket-locale-tier3-bg-el to have landed.
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/languageNativeness.ts",
);

// Anchor: the unique en-US closing sentence (last line of the en-US value).
const ANCHOR_LINE = `    "TONE: warm-direct. 'Reach out', 'circle back', 'touch base', 'quick chat' are all standard. Avoid over-formality ('Dear Sir/Madam' reads as outdated for tech B2B). Mild hype is acceptable ('great', 'awesome' OK in casual B2B); avoid 'amazing' / 'incredible' / 'world-class' which trend too far into marketing-speak.",`;

const NEW_ENTRIES = `

  "en-BE":
    "Belgian English (en-BE; covers Belgium B2B in mobile adtech, tech, and most international-enterprise contexts): Belgian B2B in mobile adtech and tech-enterprise contexts defaults to English as the neutral lingua franca between Flemish-speaking north (~60% of population, including Antwerp / Ghent / Bruges / Leuven and the Flanders region) and French-speaking south (~40%, Liege / Charleroi / Mons / Namur and the Wallonia region), with Brussels officially bilingual (French + Dutch) plus a small German-speaking eastern community. International firms operating in Belgium and the EU institutions in Brussels overwhelmingly default to English. If a buyer is explicitly Flemish-only (e.g., domestic SME in West Flanders, Brugge), use nl; if Walloon-only, use fr or fr-BE. The default for cross-Belgium B2B is en-BE. " +
    "B2B WhatsApp register: 'Hi {NAME},' direct and warm; 'Hello {NAME},' for cold email; 'Dear {NAME},' for the most formal contexts. " +
    "SPELLING: Use en-GB spelling (organisation, optimisation, behaviour, centre, prioritise, analyse, defence, licence/license, travelled). Belgian English follows European-English conventions, NOT American. Avoid Americanisms ('gotten', 'awesome', 'super'). " +
    "ADTECH VOCABULARY: standard English terms; Belgian B2B vocabulary aligns with European-English mobile adtech conventions. No localisation needed. " +
    "CURRENCY: EUR (€), European separators: '€1.234.567,89' (period thousands, comma decimal). 'mln' (million) and 'mld' (miljard / billion) abbreviations are sometimes used; full numerals safer for formal B2B. " +
    "CITY/MARKET REFERENCES: " +
    "Brussels (Bruxelles / Brussel, the capital region, ~1.2M; the political and EU institutions HQ — European Commission, European Parliament, European Council, NATO HQ; the dominant Belgian B2B destination especially for tech / multinationals / consultancies / EU-adjacent business; Avenue Louise / Louizalaan and the European Quarter / Schuman for premium and EU-lobbying business, North Quarter for finance and corporate HQs, Etterbeek / Ixelles for tech and creative). " +
    "Antwerp (Antwerpen, ~520K; Belgium's largest port and one of Europe's largest by tonnage; diamond trade global hub; second-largest Flemish business hub; logistics, chemicals, fashion). " +
    "Ghent (Gent, ~265K; the secondary Flemish tech and life-sciences hub — Universiteit Gent / UGent, VIB biotech cluster, Showpad HQ, growing IT). " +
    "Liege (Liege, ~195K; the largest Walloon city; traditional industrial / steel heritage transitioning to logistics + emerging tech; Universite de Liege). " +
    "Charleroi (~200K; Walloon industrial city; BSCA airport — major Ryanair hub). " +
    "Leuven (Louvain, ~100K; KU Leuven — one of the oldest European universities; IMEC — world-leading semiconductor research institute, major tech-transfer source; biotech cluster). " +
    "Bruges (Brugge, ~120K; West Flanders tourism + traditional industry). " +
    "Mons (~95K; Walloon city; SHAPE NATO HQ). " +
    "PEER BRANDS by tier: " +
    "Banking tier (Belgian banking is now largely consolidated and partly foreign-owned): KBC Group (Belgian-listed BVB, the largest Belgian bank by retail metric, KBC Bank Belgium + ČSOB Czech / KBC Slovakia / K&H Hungary regional reach — KBC is a regionally significant Central European bank; Belgian B2B reflexively knows KBC), BNP Paribas Fortis (Belgian operation of BNP Paribas France, the largest by various corporate metrics — formed from the 2008 Fortis Bank breakup), ING Belgium (Dutch ING Group, third-largest), Belfius (state-owned post-2011 nationalisation of Dexia Belgium, retail + corporate), Argenta (Belgian-owned cooperative, retail focus), Crelan, Beobank, Deutsche Bank Belgium. " +
    "Pharma / Chemicals tier (Belgium is a European pharma manufacturing hub): UCB (Union Chimique Belge, biopharma BVB-listed, epilepsy and immunology focus), Janssen Pharmaceutica (part of Johnson & Johnson, Beerse Belgium HQ — one of the largest J&J global research centers; HIV antiretrovirals + schizophrenia + oncology), Solvay (chemicals BVB-listed, recently split into Solvay + Syensqo 2023), Tessenderlo Group (specialty chemicals BVB-listed), GSK Belgium / Wavre (the largest vaccine production site in the world by some metrics — GSK Vaccines), Pfizer Belgium / Puurs (mRNA COVID vaccine production site). " +
    "Industrial tier: Umicore (recycling, battery materials, catalysts; BVB-listed, the most internationally referenced Belgian industrial), Bekaert (steel wire, BVB-listed), Agfa-Gevaert (imaging, BVB-listed), Sioen Industries (technical textiles), Recticel (foams), Etex (building materials), Aliaxis (plastic piping). " +
    "Beer / FMCG: AB InBev (Anheuser-Busch InBev, the largest beer company globally by volume, Leuven HQ Belgium — Belgian B2B reflexively knows AB InBev; brands include Budweiser, Stella Artois, Corona, Hoegaarden, Leffe — Stella Artois and Leffe are Belgian-heritage), Lotus Bakeries (Biscoff cookies, BVB-listed), Spadel (water, owns Spa brand). " +
    "Retail / FMCG: Colruyt Group (the largest Belgian-owned retail group — Colruyt + Okay + Bio-Planet + Dreamland; the Belgian retail-cost-leader reference), Delhaize (Belgian heritage, now part of Ahold Delhaize global), Carrefour Belgium, Lidl Belgium, Aldi Belgium, Spar Belgium. " +
    "Telco: Proximus (the incumbent telco, state-owned-majority via Belgian Federal Holding, BVB-listed; the dominant Belgian fixed + mobile), Orange Belgium (formerly Mobistar, Orange France subsidiary), Telenet (cable + mobile, part of Liberty Global's BASE / Telenet operations — recently delisted post-Liberty Global private offer). " +
    "Tech / digital tier: Odoo (Belgian-founded ERP / business apps, Louvain-la-Neuve HQ; open-source + commercial; the most internationally successful Belgian tech company, Belgian B2B reflexively cites it as the local tech success story), Showpad (sales enablement, Ghent + Chicago dual HQ; one of the most internationally visible Belgian SaaS), Collibra (data intelligence / data governance, US HQ now but Belgian-founded, Brussels major office), Teamleader (CRM / project management / quoting), Tobania (IT services), Ontoforce (life-sciences data search), iText (PDF library, Ghent + US). " +
    "E-commerce: Bol.com (Dutch but huge Belgian presence — the dominant Benelux marketplace), Coolblue Belgium, Amazon.com.be (recently launched Belgian Amazon operation), Wehkamp Belgium, Vente-Exclusive (private sales). " +
    "Mobility / delivery: Wolt Belgium (Finnish DoorDash-owned), Deliveroo Belgium, Bolt Belgium, Uber Belgium. " +
    "TONE: formal-warm. Belgian business culture sits between Dutch directness and French politeness — more polite than Netherlands (no abrupt openers), less ceremonial than France (get to the point within 2-3 sentences). Belgian B2B values: clear professional respect, explicit acknowledgment of the prospect's context, concrete deliverables, and a slightly slower / more consensus-oriented pace than Anglo-Saxon norms. Where relevant (e.g., partnership across Flanders / Wallonia / Brussels), acknowledging the linguistic-region complexity reads as Belgian-aware. Avoid hype words ('revolutionary', 'best-in-class', 'unique' without justification) which read as foreign-template. Brussels EU-adjacent business has its own register — more formal, more regulatory-aware. Match peer tier to prospect's company sector: banking for finance, UCB / Janssen / Solvay for pharma / chemicals, AB InBev / Colruyt for FMCG / retail, Proximus / Orange / Telenet for telco, Odoo / Showpad / Collibra for tech / SaaS.",

  "en-NL":
    "Dutch B2B in English (en-NL; covers Netherlands B2B in mobile adtech, tech, SaaS, and most international-enterprise contexts): Netherlands B2B in mobile adtech and tech-enterprise overwhelmingly uses English internally and externally. Approximately one in four Dutch enterprises uses English as the primary working language, and the share is much higher in tech / SaaS / international B2B / startup contexts. Use bare nl for explicitly Dutch-language requests; en-NL is the default for Dutch tech B2B. Amsterdam tech / Eindhoven semiconductor / Rotterdam logistics-tech all operate primarily in English. " +
    "B2B WhatsApp register: 'Hi {NAME},' is the chat default; 'Hello {NAME},' for cold email; 'Dear {NAME},' for the most formal contexts. " +
    "SPELLING: Use en-GB spelling (organisation, optimisation, behaviour, centre, prioritise, analyse, defence, licence/license, travelled). Dutch English follows European-English conventions, NOT American. Avoid Americanisms ('gotten', 'awesome', 'super'). " +
    "ADTECH VOCABULARY: standard English terms; Dutch B2B aligns with European-English mobile adtech conventions. No localisation needed. " +
    "CURRENCY: EUR (€), European separators: '€1.234.567,89' (period thousands, comma decimal). 'mln' (million) and 'mld' (miljard / billion) abbreviations are common; full numerals for formal B2B contexts. " +
    "CITY/MARKET REFERENCES: " +
    "Amsterdam (the commercial / political center; ~880K city + ~2.5M Amsterdam Metropolitan Area; THE dominant Dutch tech hub by every B2B metric. Zuidas business district for finance, corporate HQs, and law firms — comparable to Frankfurt's banking district or London's Canary Wharf; Centrum / Jordaan / De Pijp for traditional business, agencies, and creative; Houthavens / NDSM / Amsterdam Noord for tech / startup; Schiphol airport area for logistics + tech offices). " +
    "Rotterdam (~660K; the largest European port by tonnage and the second-largest Dutch city; manufacturing + logistics + maritime tech; Erasmus University Rotterdam; recent tech and architecture growth). " +
    "The Hague (Den Haag, ~560K; government + international institutions including the International Court of Justice / ICJ, International Criminal Court / ICC, OPCW, Europol, Eurojust; growing tech and impact-investing scene). " +
    "Utrecht (~360K; central transport hub; healthcare and retail HQs — Rabobank HQ; Utrecht University; central Netherlands science park). " +
    "Eindhoven (~245K; THE Dutch high-tech / deep-tech hub — ASML in nearby Veldhoven, Philips global HQ, NXP Semiconductors, Brainport Eindhoven region; TU/e Eindhoven University of Technology; the Dutch Silicon Valley equivalent and a critical European semiconductor cluster). " +
    "Groningen (~235K; northern Netherlands; energy historically — Groningen gas field, now winding down — and growing tech). " +
    "Tilburg (~225K, southern Netherlands; logistics + manufacturing). " +
    "Breda (~185K, southern Netherlands; food + logistics). " +
    "PEER BRANDS by tier: " +
    "Tech / digital tier (Netherlands is one of the most internationally tech-successful European countries per capita): Booking.com (the dominant Dutch tech success — Amsterdam HQ, Nasdaq-listed BKNG, owned by Booking Holdings; Dutch B2B reflexively knows Booking as the local tech reference), ASML (Veldhoven HQ near Eindhoven; the global EUV lithography monopoly — produces the only machines capable of advanced semiconductor production; the most valuable Dutch company by market cap; a critical reference for any deep-tech or semiconductor-adjacent B2B), Adyen (Amsterdam HQ, payments unicorn, AEX-listed — the Dutch Stripe; serves Uber, Spotify, Netflix, Microsoft, McDonald's globally), Mollie (Amsterdam HQ, payments unicorn — SMB-focused vs Adyen's enterprise), TomTom (Amsterdam HQ, navigation / mapping / automotive software, AEX-listed), Just Eat Takeaway.com (Amsterdam HQ post-merger; food delivery), Coolblue (e-commerce + electronics retail; Rotterdam HQ), Bol.com (Benelux marketplace dominant; private), WeTransfer (Amsterdam, file sharing — recently sold to Bending Spoons Italy), Mendix (Rotterdam, low-code platform — Siemens-acquired 2018), Backbase (Amsterdam, banking software platform), Mews (originally Czech but Amsterdam HQ now, hospitality software), Picnic (Dutch online grocery, founded Amsterdam, expanded to Germany / France), Channable (Utrecht, e-commerce feed management), Bynder (Amsterdam, digital asset management), Messagebird / Bird (Amsterdam, CPaaS — communications platform). " +
    "Banking tier: ING Group (the largest Dutch bank, AEX-listed; also major in Belgium / Germany / Poland — ING Group is regionally significant in Western Europe), Rabobank (cooperative; food / agriculture global focus — the dominant agri-finance bank globally), ABN AMRO (AEX-listed; retail + corporate; partially state-owned post-2008 bailout), Triodos Bank (ethical / sustainable banking, Dutch-founded). " +
    "Industrial tier (Netherlands has a strong industrial / chemicals / consumer goods base): Philips (Eindhoven HQ; healthcare technology focus post-divestment of consumer electronics and lighting; AEX-listed PHIA), DSM-Firmenich (nutrition / health / specialty chemicals; merged 2023 with Swiss Firmenich; AEX-listed), Akzo Nobel (paints / coatings; AEX-listed), Unilever (Anglo-Dutch consumer goods historically; the Dutch part of the dual HQ unified to UK in 2020 but Dutch heritage references remain valid), Heineken (the largest Dutch brewer and second-largest globally; AEX-listed HEIA — the global Dutch beer reference), Shell (formerly Dutch HQ; moved primary listing to London 2021 but Dutch industrial heritage still cited). " +
    "Telco: KPN (incumbent former state, AEX-listed; the dominant Dutch fixed + mobile), VodafoneZiggo (joint venture between Vodafone UK and Liberty Global's Ziggo cable; mobile + cable bundled), Odido (the new brand combining T-Mobile Netherlands post-2024 acquisition by Apax Partners and Warburg Pincus from Deutsche Telekom — replacing the T-Mobile brand for Dutch operations), Tele2 Netherlands (smaller). " +
    "Retail / FMCG: Albert Heijn (Ahold Delhaize; the dominant Dutch supermarket chain, ~35% market share — the Dutch retail reference), Jumbo (second-largest Dutch supermarket, family-owned), Lidl Netherlands, Aldi Netherlands, Plus (cooperative), Dirk (discount), HEMA (department stores, Dutch heritage retail brand), Bijenkorf (premium department store), Action (discount retail — Dutch-founded, expanded internationally to ~15 European countries; private). " +
    "Mobility / delivery: Wolt Netherlands (Finnish DoorDash-owned), Bolt Netherlands (Estonian), Uber Netherlands, Flink (Dutch quick-commerce groceries), Picnic (Dutch online grocery — both retail and tech reference), Thuisbezorgd (Just Eat Takeaway Dutch operation). " +
    "TONE: extremely direct, low-context, Calvinist-pragmatic. Dutch business culture is famously THE most direct in Europe. Specific Dutch B2B norms worth respecting: " +
    "1. No small talk — get to the point in the first sentence; American-style 'Hope you're having a great week!' reads as foreign-template. " +
    "2. No hedging — Dutch readers expect concrete claims with concrete numbers. 'Should improve' beats 'will transform'; '12 hours saved per week' beats 'productivity unlocked'. " +
    "3. No hype — avoid 'revolutionary', 'best-in-class', 'unique', 'unlock value', 'game-changing', 'no-brainer', 'cutting-edge'. These trigger immediate skepticism and read as American-template. Concrete numbers + qualified claims beat hype every time. " +
    "4. Counter-questions are normal — expect pushback on claims; Dutch buyers will challenge data, ask for proof, ask for failure cases. This is engagement, not hostility. " +
    "5. 'No' means 'no' — Dutch buyers don't soften rejections with 'let's circle back' or 'not at this time'. A 'no' is final; respect it and move on. " +
    "6. Transparency about limitations is a positive signal — admitting 'our product doesn't yet support X' builds more trust than glossing over gaps. " +
    "7. The Dutch B2B reader generally has a high degree of skepticism toward outbound sales contact; messages that lead with 'I noticed' or 'I researched' often read as scripted. Lead with concrete and relevant context (a recent company event, a specific job-spec match, a measurable outcome). " +
    "Match peer tier to prospect's company sector: ING / Rabobank / ABN AMRO for finance, Philips / DSM / ASML for industrial / deep-tech, Booking / Adyen / Mollie / TomTom for tech / SaaS, KPN / Odido / VodafoneZiggo for telco, Albert Heijn / Jumbo / HEMA for retail, Action / Picnic / Coolblue for value-tech-retail.",`;

const E1_OLD = ANCHOR_LINE;
const E1_NEW = ANCHOR_LINE + NEW_ENTRIES;
const E1_MARKER = `"en-BE":\n    "Belgian English (en-BE;`;

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

if (!source.includes(`"en-US":\n    "American English (en-US;`)) {
  console.error("[FATAL] missing en-US entry in GUIDES (precondition)");
  process.exit(5);
}
if (!source.includes(`"el-GR":\n    "Greek-Greece (el-GR):`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-bg-el to have landed first");
  process.exit(5);
}

const r = applyEdit("guides-en-be-nl-append", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r.ok) process.exit(3);
source = r.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  // en-BE
  enBEAdded:                source.includes(`"en-BE":\n    "Belgian English (en-BE;`),
  enBELinguisticSplit:      source.includes(`Flemish-speaking north`) &&
                            source.includes(`French-speaking south`) &&
                            source.includes(`Brussels officially bilingual`),
  enBEFlemishUseNl:         source.includes(`If a buyer is explicitly Flemish-only`) &&
                            source.includes(`Walloon-only, use fr or fr-BE`),
  enBEEnGBSpelling:         source.includes(`Belgian English follows European-English conventions, NOT American`),
  enBEEURCurrency:          source.includes(`CURRENCY: EUR (€)`),
  enBEBrussels:             source.includes(`Brussels (Bruxelles / Brussel, the capital region`) &&
                            source.includes(`EU institutions HQ`),
  enBEAntwerp:              source.includes(`Antwerp (Antwerpen, ~520K`),
  enBEGhentTech:            source.includes(`Ghent (Gent, ~265K; the secondary Flemish tech and life-sciences hub`),
  enBELeuvenIMEC:           source.includes(`Leuven (Louvain, ~100K; KU Leuven`) && source.includes(`IMEC`),
  enBEBankTier:             source.includes(`KBC Group`) &&
                            source.includes(`BNP Paribas Fortis`) &&
                            source.includes(`Belfius`),
  enBEPharmaTier:           source.includes(`UCB (Union Chimique Belge, biopharma`) &&
                            source.includes(`Janssen Pharmaceutica (part of Johnson & Johnson, Beerse Belgium HQ`),
  enBEABInBev:              source.includes(`AB InBev (Anheuser-Busch InBev, the largest beer company globally by volume, Leuven HQ`),
  enBEColruyt:              source.includes(`Colruyt Group (the largest Belgian-owned retail group`),
  enBEProximus:             source.includes(`Proximus (the incumbent telco`),
  enBEOdoo:                 source.includes(`Odoo (Belgian-founded ERP / business apps`),
  enBEShowpad:              source.includes(`Showpad (sales enablement, Ghent + Chicago dual HQ`),
  enBECollibra:             source.includes(`Collibra (data intelligence`),
  enBEToneNote:             source.includes(`between Dutch directness and French politeness`),

  // en-NL
  enNLAdded:                source.includes(`"en-NL":\n    "Dutch B2B in English (en-NL;`),
  enNLEnglishWorking:       source.includes(`overwhelmingly uses English internally`) &&
                            source.includes(`one in four Dutch enterprises uses English`),
  enNLEnGBSpelling:         source.includes(`Dutch English follows European-English conventions, NOT American`),
  enNLEURCurrency:          source.includes(`CURRENCY: EUR (€)`),
  enNLAmsterdamZuidas:      source.includes(`Zuidas business district`),
  enNLRotterdamPort:        source.includes(`Rotterdam (~660K; the largest European port by tonnage`),
  enNLHagueICJ:             source.includes(`The Hague (Den Haag`) &&
                            source.includes(`International Court of Justice / ICJ`),
  enNLEindhovenDeepTech:    source.includes(`Eindhoven (~245K; THE Dutch high-tech / deep-tech hub`) &&
                            source.includes(`ASML in nearby Veldhoven, Philips global HQ, NXP Semiconductors`),
  enNLBookingDominant:      source.includes(`Booking.com (the dominant Dutch tech success`),
  enNLASMLMonopoly:         source.includes(`ASML (Veldhoven HQ near Eindhoven; the global EUV lithography monopoly`),
  enNLAdyenStripe:          source.includes(`Adyen (Amsterdam HQ, payments unicorn, AEX-listed — the Dutch Stripe`),
  enNLMollie:               source.includes(`Mollie (Amsterdam HQ, payments unicorn`),
  enNLTomTom:               source.includes(`TomTom (Amsterdam HQ, navigation / mapping / automotive software`),
  enNLINGRegional:          source.includes(`ING Group (the largest Dutch bank`) &&
                            source.includes(`also major in Belgium / Germany / Poland`),
  enNLRabobankAgri:         source.includes(`Rabobank (cooperative; food / agriculture global focus`),
  enNLABNAMRO:              source.includes(`ABN AMRO (AEX-listed`),
  enNLPhilipsHeineken:      source.includes(`Philips (Eindhoven HQ`) &&
                            source.includes(`Heineken (the largest Dutch brewer`),
  enNLDSMFirmenich:         source.includes(`DSM-Firmenich (nutrition / health / specialty chemicals; merged 2023`),
  enNLKPNDominantTelco:     source.includes(`KPN (incumbent former state, AEX-listed`),
  enNLOdidoBrand:           source.includes(`Odido (the new brand combining T-Mobile Netherlands post-2024 acquisition`),
  enNLAlbertHeijnRetail:    source.includes(`Albert Heijn (Ahold Delhaize; the dominant Dutch supermarket chain`),
  enNLActionRetail:         source.includes(`Action (discount retail — Dutch-founded, expanded internationally`),
  enNLPicnicGrocery:        source.includes(`Picnic (Dutch online grocery — both retail and tech reference)`),
  enNLDirectTone:           source.includes(`extremely direct, low-context, Calvinist-pragmatic`),
  enNLNoSmallTalk:          source.includes(`No small talk — get to the point in the first sentence`),
  enNLNoHype:               source.includes(`avoid 'revolutionary', 'best-in-class', 'unique', 'unlock value'`),
  enNLNoMeansNo:            source.includes(`'No' means 'no'`),
  enNLTransparencyTrust:    source.includes(`Transparency about limitations is a positive signal`),
  enNLCounterQuestionsNorm: source.includes(`Counter-questions are normal`),

  // Untouched
  enUSUntouched:            source.includes(`"en-US":\n    "American English (en-US;`),
  enGBUntouched:            source.includes(`"en-GB":\n    "British English (en-GB;`),
  enINUntouched:            source.includes(`"en-IN":\n    "Indian English`),
  // Prior tier-3 unaffected
  elGRUntouched:            source.includes(`"el-GR":\n    "Greek-Greece (el-GR):`),
  bgBGUntouched:            source.includes(`"bg-BG":\n    "Bulgarian-Bulgaria (bg-BG):`),
  huHUUntouched:            source.includes(`"hu-HU":\n    "Hungarian-Hungary (hu-HU):`),
  roROUntouched:            source.includes(`"ro-RO":\n    "Romanian-Romania (ro-RO):`),
  csCZUntouched:            source.includes(`"cs-CZ":\n    "Czech-Czech Republic (cs-CZ):`),
  ukUAUntouched:            source.includes(`"uk-UA":\n    "Ukrainian-Ukraine (uk-UA):`),
  idIDUntouched:            source.includes(`"id-ID":\n    "Indonesian-Indonesia (id-ID):`),
  ruRUUntouched:            source.includes(`"ru-RU":\n    "Russian-Russia (ru-RU):`),
  itITUntouched:            source.includes(`"it-IT":\n    "Italian-Italy (it-IT):`),
  jaJPUntouched:            source.includes(`"ja-JP":\n    "Japanese-Japan (ja-JP):`),
  bareNlUntouched:          source.includes(`Dutch (nl): Similar to German`),
  tier3HeaderIntact:        source.includes(`// ── REGIONAL LOCALES (B-locale-tier3)`),
  tier1Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier1)`),
  tier2Intact:              source.includes(`// ── REGIONAL LOCALES (B-locale-tier2)`),
  buildNativenessUntouched: source.includes(`export function buildNativenessBlock`),
};
console.log("[language-nativeness-en-be-nl] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[language-nativeness-en-be-nl] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[language-nativeness-en-be-nl] DONE");
