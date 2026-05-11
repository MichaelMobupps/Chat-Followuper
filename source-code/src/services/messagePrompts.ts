/**
 * Prompts for the chat message generator.
 *
 * Two distinct modes share the same prompt machinery:
 *
 *   PROSPECTOR — first cold message to a prospect on a channel. Carries the
 *     full doctrine compressed for chat (5-7 sentences, all five doctrine
 *     sections compressed). No prior conversation; built from prospect
 *     metadata + SDR's context notes.
 *
 *   FOLLOWUPER — every subsequent message in an ongoing thread. 2-3 sentences,
 *     must reference prior contact, must ground every claim in the prior
 *     conversation. Throws upstream if conversation context is missing.
 *
 * The prompts graft Prospector-grade doctrine (from email_tool/prospector/
 * stages/s5_write.py) onto chat-shaped output via the channel register block.
 *
 * Architecture:
 *   System prompt = doctrine + form rules + channel register + nativeness +
 *     native voice (non-English) + chat-softer greeting table
 *   User prompt   = prospect context + (mode-specific) conversation or notes
 *   Critic        = scores against per-mode criteria; can demand rewrite
 *   Rewriter      = receives critic feedback, fixes flagged portions only
 */

import { buildNativenessBlock, buildCriticNativenessBlock } from "../lib/languageNativeness";
import {
  buildWriterRegisterBlock,
  buildCriticRegisterBlock,
  type ChannelCode,
  type GenerationMode,
} from "../lib/channelRegister";
import { buildVocabularyBlock } from "../lib/doctrine/eventCatalog";
import { isValidSubVertical } from "../lib/doctrine/taxonomy";
import type { ProspectBrief } from "./prospectResearch";

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

export interface ConversationRow {
  direction: "outbound" | "inbound";
  body: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  channel: ChannelCode;
}

export interface PreviousFollowup {
  stage: number;
  body: string;
}

/**
 * The eight critic-issue categories. Ported from email Prospector's
 * s6_critic.py taxonomy. Every issue the critic emits MUST fall into
 * one of these eight buckets.
 */
export type CriticCategory =
  | "machine_artifact"
  | "term_leakage"
  | "event_mismatch"
  | "unnatural_phrasing"
  | "translation_artifact"
  | "vertical_incoherence"
  | "formatting_leak"
  | "why_structure_violation";

/**
 * A single critic finding. Replaces the prior free-text string in
 * CriticResult.issues so the rewriter (and downstream telemetry) can
 * prioritise by severity and category.
 */
export interface CriticIssue {
  /** Exact problematic text from the message, or a short description. */
  excerpt: string;
  /** What is wrong with this text. */
  reason: string;
  /** Which of the eight categories this falls into. */
  category: CriticCategory;
  /** "block" forces needs_rewrite=true; "warn" is nice-to-fix. */
  severity: "block" | "warn";
  /** Optional replacement text or rephrasing. */
  suggested_fix?: string;
}

export interface MessageContext {
  // Prospect identity
  prospect_name: string;          // First name or full name; may be empty
  company: string;                // Company name; may be empty
  vertical: string;               // Top-level vertical
  sub_vertical: string | null;    // Sub-vertical code or null
  product: string;                // What MobUpps offers (e.g. "Mobile UA")
  country: string;                // Prospect country
  language: string;               // ISO 639-1 language code

  // Sender identity (pulled from users table at call time)
  sender_name: string;            // SDR's first name

  // Channel & mode
  channel: ChannelCode;
  mode: GenerationMode;

  // Prospector-specific (used when mode === "prospector")
  context_notes?: string;

  // Followuper-specific (used when mode === "followuper")
  stage?: number;
  days_since_first?: number;
  prior_summary?: string;
  conversation?: ConversationRow[];
  previous_followups?: PreviousFollowup[];
  research_brief?: ProspectBrief;
}

// ─────────────────────────────────────────────────────────────────
// Native voice identity block (non-English only)
// ─────────────────────────────────────────────────────────────────

function buildNativeVoiceBlock(language: string): string {
  const lang = (language || "").trim().split(/[-_]/)[0].toLowerCase();
  if (!lang || lang === "en") return "";
  return `\nYou are a NATIVE SPEAKER of the language identified by tag ${language}. You think, reason, and compose in this language natively. You do not translate from English. You conceive arguments directly in the target language using the rhetorical patterns, sentence structures, and professional register that a native business professional in this language would use. The doctrine structure is fixed, but HOW you express each part must sound like a human who thinks in this language wrote it.\n`;
}

// ─────────────────────────────────────────────────────────────────
// Chat-softer greeting table per language
// ─────────────────────────────────────────────────────────────────
//
// WhatsApp greetings are softer than email. "Hi {Name}," works in English /
// Spanish / Hebrew / Russian / Portuguese / French / German / Italian /
// Dutch / Nordic / etc. Formal forms only where culturally required:
// Japanese / Korean / Chinese / Vietnamese / Thai. The table below tells the
// LLM the exact greeting form to use; it is injected into the user prompt.

const GREETING_TABLE: Record<string, { withName: string; withoutName: string; note: string }> = {
  en: { withName: "Hi {NAME},", withoutName: "Hi there,", note: "" },
  es: { withName: "Hola {NAME},", withoutName: "Hola,", note: "" },
  pt: { withName: "Olá {NAME},", withoutName: "Olá,", note: "" },
  fr: { withName: "Bonjour {NAME},", withoutName: "Bonjour,", note: "" },
  de: { withName: "Hallo {NAME},", withoutName: "Hallo,", note: "WhatsApp-soft, not the email's 'Guten Tag'." },
  it: { withName: "Ciao {NAME},", withoutName: "Ciao,", note: "" },
  nl: { withName: "Hallo {NAME},", withoutName: "Hallo,", note: "" },
  pl: { withName: "Cześć {NAME},", withoutName: "Dzień dobry,", note: "Soft B2B WhatsApp register." },
  ru: { withName: "Здравствуйте, {NAME},", withoutName: "Здравствуйте,", note: "Keep formal — Russian B2B does not soften on WhatsApp." },
  uk: { withName: "Вітаю, {NAME},", withoutName: "Вітаю,", note: "" },
  he: { withName: "שלום {NAME},", withoutName: "שלום,", note: "" },
  ar: { withName: "مرحبا {NAME},", withoutName: "مرحبا,", note: "Acceptable for B2B WhatsApp; formal السلام عليكم also OK in Gulf markets." },
  fa: { withName: "سلام {NAME},", withoutName: "سلام,", note: "" },
  tr: { withName: "Merhaba {NAME},", withoutName: "Merhaba,", note: "" },
  hi: { withName: "Namaste {NAME},", withoutName: "Hello,", note: "Latin-script transliteration is fine on WhatsApp; Devanagari नमस्ते is also acceptable." },
  bn: { withName: "নমস্কার {NAME},", withoutName: "নমস্কার,", note: "Standard Bengali formal greeting; works for both Bangladesh and India / West Bengal B2B contexts. English code-mixing is heavy throughout the message body in adtech contexts; the greeting stays Bengali." },
  ur: { withName: "السلام علیکم {NAME},", withoutName: "السلام علیکم,", note: "" },
  th: { withName: "เรียน {NAME},", withoutName: "เรียน คุณ,", note: "Keep formal เรียน even on WhatsApp; Thai B2B expects this." },
  vi: { withName: "Chào {NAME},", withoutName: "Chào anh/chị,", note: "Soft WhatsApp variant of the email's 'Kính gửi anh/chị'." },
  id: { withName: "Halo {NAME},", withoutName: "Halo,", note: "" },
  ms: { withName: "Salam {NAME},", withoutName: "Salam,", note: "" },
  fil: { withName: "Hi {NAME},", withoutName: "Hi,", note: "Filipino B2B uses English greeting on WhatsApp." },
  tl: { withName: "Hi {NAME},", withoutName: "Hi,", note: "Same as Filipino." },
  ja: { withName: "{NAME}様、", withoutName: "ご担当者様、", note: "FORMAL even on WhatsApp. Japanese B2B does not soften greetings. Do NOT use こんにちは or ハロー." },
  ko: { withName: "{NAME} 님,", withoutName: "담당자님,", note: "FORMAL. Do NOT use 안녕 alone." },
  zh: { withName: "您好，{NAME}：", withoutName: "您好，", note: "FORMAL. Mainland Chinese B2B WhatsApp uses 您好. Do NOT use 你好 alone for cold outreach." },
  sv: { withName: "Hej {NAME},", withoutName: "Hej,", note: "" },
  no: { withName: "Hei {NAME},", withoutName: "Hei,", note: "" },
  nb: { withName: "Hei {NAME},", withoutName: "Hei,", note: "" },
  da: { withName: "Hej {NAME},", withoutName: "Hej,", note: "" },
  fi: { withName: "Hei {NAME},", withoutName: "Hei,", note: "" },
  cs: { withName: "Dobrý den, {NAME},", withoutName: "Dobrý den,", note: "" },
  ro: { withName: "Bună ziua, {NAME},", withoutName: "Bună ziua,", note: "" },
  hu: { withName: "Üdvözlöm, {NAME},", withoutName: "Üdvözlöm,", note: "" },
  el: { withName: "Γεια σας, {NAME},", withoutName: "Γεια σας,", note: "" },
  bg: { withName: "Здравейте, {NAME},", withoutName: "Здравейте,", note: "" },
  sw: { withName: "Habari {NAME},", withoutName: "Habari,", note: "" },
  am: { withName: "ሰላም {NAME},", withoutName: "ሰላም,", note: "" },

  // ── REGIONAL LOCALES (B-locale-tier1) ──────────────────────────
  // Region-aware overrides for languages that vary materially across
  // markets. The lookup at buildGreetingBlock tries the full tag first
  // (e.g. "pt-BR") and falls back to the primary subtag ("pt").

  "pt-BR": { withName: "Olá {NAME},", withoutName: "Olá,", note: "Brazilian Portuguese, casual-professional B2B WhatsApp register; use 'voce' verb forms throughout. Avoid Iberian formality ('Prezado'). BR-localized vocabulary only (celular, tela, arquivo, mouse, onibus)." },
  "pt-PT": { withName: "Olá {NAME},", withoutName: "Olá,", note: "European Portuguese, more formal than BR; use 'voce' or 'o senhor / a senhora' verb forms. PT-localized vocabulary only (telemovel, ecra, ficheiro, rato, autocarro)." },
  "es-MX": { withName: "Hola {NAME},", withoutName: "Hola,", note: "Mexican Spanish, 'usted' for cold outreach; 'Buen dia' / 'Buenos dias' also acceptable. Use computadora, celular, carro." },
  "es-AR": { withName: "Hola {NAME},", withoutName: "Hola,", note: "Argentinian / Southern Cone Spanish, 'usted' for cold; voseo (vos) is informal, fine once warm. Avoid 'che' for B2B. Use computadora, celular, auto." },
  "es-CO": { withName: "Hola {NAME},", withoutName: "Cordial saludo,", note: "Colombian / Northern LATAM Spanish, high politeness register; 'usted' throughout. 'Cordial saludo {NAME},' also acceptable as opener. Use computador (masculine), celular." },
  "es-ES": { withName: "Hola {NAME},", withoutName: "Hola,", note: "Iberian Spanish, 'usted' (formal) or 'tu' (modern tech B2B). Use ordenador, movil, coche. 'Vosotros' for plural informal (Spain only)." },
  "zh-Hans": { withName: "您好，{NAME}：", withoutName: "您好，", note: "Simplified Chinese (Mainland China + Singapore). EVERY character must be Simplified, never mix Traditional. 您 register only, never 你 alone." },
  "zh-Hant": { withName: "您好，{NAME}：", withoutName: "您好，", note: "Traditional Chinese (Taiwan, Hong Kong, Macau). EVERY character must be Traditional, never mix Simplified. 您 register only." },
  "ar-EG": { withName: "مرحبا {NAME}،", withoutName: "مرحبا،", note: "Egyptian Arabic, write body in MSA (not عامية). 'السلام عليكم' acceptable for visibly Muslim contexts; 'مرحبا' is the secular default for unknown recipients." },
  "ar-SA": { withName: "السلام عليكم {NAME}،", withoutName: "السلام عليكم،", note: "Gulf Arabic, most formal MSA register. 'السلام عليكم' is the standard cold-B2B opener across SA, AE, QA, KW, BH, OM." },
  "ar-MA": { withName: "مرحبا {NAME}،", withoutName: "مرحبا،", note: "Maghrebi Arabic, French loanwords are standard in B2B. 'Bonjour {NAME},' as French opener is also acceptable in MA, DZ, TN where French is the working language." },

  // ── REGIONAL LOCALES (B-locale-tier2) ──────────────────────────
  // English / French / German regional variants. English variants
  // emphasise spelling, regional brand references, and register.
  // French and German variants follow tier1 depth.

  "en-IN": { withName: "Hello {NAME},", withoutName: "Hello,", note: "Indian English B2B, more formal than US/UK. 'Hi' acceptable on WhatsApp once warm; 'Dear Mr./Ms. {LastName},' for cold email. Avoid US slang (ballpark, low-hanging fruit). Spelling follows en-GB (optimisation, behaviour, centre). Currency INR (lakh / crore for amounts under 100M)." },
  "en-GB": { withName: "Hi {NAME},", withoutName: "Hello,", note: "British English, slightly more reserved than en-US. 'Hello {NAME},' for cold email; 'Hi {NAME},' for WhatsApp. Use en-GB spelling (optimisation, organisation, behaviour, centre, licence/license). Avoid Americanisms (gotten, awesome, super)." },
  "en-US": { withName: "Hi {NAME},", withoutName: "Hi there,", note: "American English, warm-direct. Default for most LLMs; explicit en-US tag mainly enforces US spelling (optimization, behavior, center) and US peer-brand references." },
  "en-BE": { withName: "Hi {NAME},", withoutName: "Hello,", note: "Belgian English. Belgium's B2B in mobile adtech and tech-enterprise contexts defaults to English as the neutral lingua franca between Flemish-speaking north (~60% of population, Antwerp / Ghent / Bruges / Leuven) and French-speaking south (~40%, Liege / Charleroi / Mons / Namur), with Brussels officially bilingual (French + Dutch) plus a small German-speaking eastern community. International B2B reads in English; if a buyer is explicitly Flemish-only, use nl; if Walloon-only, use fr-BE. 'Hi {NAME},' is the chat default; 'Hello {NAME},' or 'Dear {NAME},' for cold email. Use en-GB spelling (organisation, optimisation, behaviour, centre) — Belgian English follows European-English conventions, not American. Currency EUR (€), European separators: '€1.234.567,89' (period thousands, comma decimal). Cities: Brussels (Bruxelles / Brussel, the capital, ~1.2M; EU institutions HQ; the dominant Belgian B2B destination, especially for tech / multinationals; Avenue Louise and the European Quarter for premium business, Schuman for EU lobbying, North Quarter for finance), Antwerp (Antwerpen, ~520K; Belgium's largest port, diamond trade, second-largest Flemish business hub), Ghent (Gent, ~265K; Flemish tech hub — Universiteit Gent / UGent, biotech via VIB), Liege (Liege / Liege, ~195K; largest Walloon city, traditional industrial + emerging tech), Charleroi (Charleroi, ~200K; Walloon industrial, BSB airport), Leuven (~100K; KU Leuven, IMEC semiconductor research, biotech). Peer brands: banking (KBC Group — Belgian-listed, the largest Belgian bank by retail metric; BNP Paribas Fortis — Belgian operation of BNP Paribas France, the largest by various metrics; ING Belgium; Belfius — state-owned post-2011 nationalisation; Argenta), pharma / chemicals (UCB — biopharma BVB-listed; Janssen Pharmaceutica — part of Johnson & Johnson, Beerse HQ; Solvay — chemicals BVB-listed; Tessenderlo Group; GSK Belgium / Wavre — major vaccine production), industrial (Umicore — recycling and battery materials BVB-listed; Bekaert — steel wire; Agfa-Gevaert; Sioen Industries; Recticel), beer (AB InBev — Anheuser-Busch InBev, the largest beer company globally, Leuven HQ — Belgian B2B reflexively knows this), retail (Colruyt Group — the largest Belgian-owned retailer, Colruyt + Okay + Bio-Planet; Delhaize — now part of Ahold Delhaize; Carrefour Belgium; Lidl Belgium; Aldi Belgium), telco (Proximus — incumbent state-owned-majority, the dominant Belgian telco; Orange Belgium — formerly Mobistar; Telenet — cable + mobile, part of Liberty Global). Tech / digital: Odoo (Belgian-founded ERP / business apps, Louvain-la-Neuve HQ — the most internationally successful Belgian tech success), Showpad (sales enablement, Ghent + Chicago dual HQ), Collibra (data intelligence, US HQ now but Belgian-founded), Teamleader (CRM / project management), Tobania (IT services), Argenta (banking + investing). E-commerce: Bol.com (Dutch but huge Belgian presence), Coolblue Belgium, Amazon.com.be (recently launched). Mobility: Wolt Belgium, Deliveroo Belgium, Bolt Belgium, Uber Belgium. TONE: formal-warm. Belgian B2B sits between Dutch directness and French politeness — more polite than Netherlands, less polite-ceremonial than France. Acknowledge the linguistic / cultural complexity when relevant (e.g., explicit Flanders / Wallonia / Brussels split). Match peer tier to prospect's company sector." },
  "en-NL": { withName: "Hi {NAME},", withoutName: "Hello,", note: "Dutch B2B in English. Netherlands B2B in mobile adtech / tech-enterprise overwhelmingly uses English internally and externally; ~one in four Dutch enterprises use English as primary working language, and that share is much higher in tech / SaaS / international B2B. Use bare nl for explicitly Dutch-language requests; en-NL is the default for tech B2B. 'Hi {NAME},' is the chat default and works for almost all contexts; 'Hello {NAME},' or 'Dear {NAME},' for the most formal cold email. Use en-GB spelling (organisation, optimisation, behaviour, centre) — Dutch English follows European-English conventions, not American. Currency EUR (€), European separators: '€1.234.567,89'. Cities: Amsterdam (the commercial / political center, ~880K city + ~2.5M metro; the dominant Dutch tech hub; Zuidas business district for finance and corporate HQs — comparable to Frankfurt's banking district or London's Canary Wharf; Centrum / Jordaan for traditional business and creative; Houthavens / NDSM for tech / startup), Rotterdam (~660K, the largest European port by tonnage; manufacturing + logistics; Erasmus University), The Hague (Den Haag, ~560K; government + international institutions including ICC, Europol; growing tech), Utrecht (~360K; healthcare + retail HQs — Rabobank HQ; central transport hub), Eindhoven (~245K; THE Dutch high-tech hub — ASML, Philips, NXP Semiconductors, Brainport Eindhoven; the Dutch Silicon Valley equivalent), Groningen (~235K; northern Netherlands; energy + tech). Peer brands: tech (Booking.com — the dominant Dutch tech success, Amsterdam HQ, Nasdaq-listed BKNG; ASML — Veldhoven, the global EUV lithography monopoly, the most valuable Dutch company and a critical semiconductor supply-chain reference; Adyen — Amsterdam, payments unicorn AEX-listed; Mollie — payments unicorn; TomTom — navigation, Amsterdam; Just Eat Takeaway — Amsterdam HQ post-merger; Coolblue — e-commerce; Bol.com — e-commerce, NL+BE dominant; WeTransfer; Wetransfer; Mendix — low-code, Siemens-acquired; UiPath has large Amsterdam presence; Backbase — banking software; Mews — hospitality, expanded internationally), banking (ING Group — the largest Dutch bank, also major in Belgium / Germany / Poland; Rabobank — cooperative, food / agriculture focus; ABN AMRO — listed AEX, retail + corporate; Triodos Bank — ethical banking), industrial (Philips — Eindhoven, healthcare + lighting historically, AEX-listed; DSM-Firmenich — nutrition / specialty chemicals, merged 2023; Akzo Nobel — paints / coatings; Unilever — Anglo-Dutch headquartered split, consumer goods; Heineken — the largest Dutch brewer, AEX-listed), telco (KPN — incumbent former state, the dominant Dutch fixed + mobile; VodafoneZiggo — joint venture mobile + cable; T-Mobile Netherlands — recently acquired by Apax / Warburg Pincus, rebrand likely; Odido is the new brand combining T-Mobile NL post-2024). Retail: Albert Heijn (Ahold Delhaize, the dominant supermarket), Jumbo (second largest), Lidl Netherlands, Aldi, Plus, Dirk, HEMA (department stores). Mobility: Wolt Netherlands (Finnish), Bolt Netherlands, Uber Netherlands, Flink (groceries), Picnic (online grocery, Dutch-founded). TONE: extremely direct, low-context, Calvinist-pragmatic. Dutch B2B is famously the most direct business culture in Europe — no small talk, no hedging, get to the point in the first sentence, expect counter-questions and pushback, expect 'no' to mean 'no' (not 'maybe later'). Avoid American-style hype and salesy language ('revolutionary', 'game-changing', 'unlock value', 'best-in-class' without numbers) — these read as foreign-template and trigger immediate skepticism. Dutch B2B prefers concrete numbers, qualified claims, transparency about limitations. 'I think this could save you ~12 hours per week' beats 'this will transform your workflow'. Match peer tier to prospect's company sector: ING / Rabobank / ABN AMRO for finance, Philips / DSM / ASML for industrial / tech, Booking / Adyen / Mollie for tech / SaaS, KPN / Odido / VodafoneZiggo for telco." },
  "fr-FR": { withName: "Bonjour {NAME},", withoutName: "Bonjour,", note: "Metropolitan French, vous-form for cold outreach (never tu). Sign-off: 'Cordialement,'. Numbers: '1 234,56 €' (space thousands separator, comma decimal)." },
  "fr-CA": { withName: "Bonjour {NAME},", withoutName: "Bonjour,", note: "Quebec French, stronger anti-anglicisme than fr-FR. Use courriel (NOT email), magasinage (NOT shopping), fin de semaine (NOT week-end), cellulaire (NOT mobile/portable). Vous-form for cold outreach. Sign-off: 'Cordialement,' or 'Salutations distinguées,'." },
  "de-DE": { withName: "Hallo {NAME},", withoutName: "Hallo,", note: "Standard German, Sie-form for cold outreach (never du for first contact). Cold-email opener: 'Sehr geehrte Frau / Sehr geehrter Herr {LastName},'. Sign-off: 'Mit freundlichen Grüßen,'. Numbers: '1.234,56 €' (period thousands separator, comma decimal)." },
  "de-AT": { withName: "Hallo {NAME},", withoutName: "Hallo,", note: "Austrian German, Sie-form for cold; slightly softer than de-DE. Avoid 'Servus' (too informal) and 'Grüß Gott' (traditional, not modern B2B WhatsApp). Use Jänner (NOT Januar) for January. Same orthography as de-DE (uses ß)." },
  "de-CH": { withName: "Guten Tag {NAME},", withoutName: "Guten Tag,", note: "Swiss High German, NO ß (use ss: Grüsse, Strasse, gross, weiss, dass, Mass). Most formal German variant; Sie-form throughout. Sign-off: 'Freundliche Grüsse,' (NOT Grüße). Currency CHF (NOT €)." },

  // ── REGIONAL LOCALES (B-locale-tier3) ──────────────────────────
  // Hindi and Bengali script-aware entries. Hindi has one region
  // (hi-IN; India is the only Hindi B2B adtech market). Bengali
  // has two regions because Bangladesh (bn-BD) and India / West
  // Bengal (bn-IN) differ materially in peer brands, currency,
  // and English code-mixing intensity.

  "hi-IN": { withName: "Namaste {NAME},", withoutName: "Namaste,", note: "India Hindi. Latin transliteration default for WhatsApp / Telegram / Slack; Devanagari नमस्ते acceptable. Adtech body is English-heavy; structural sentences in Hindi. INR currency with lakh / crore formatting. Use आप (formal) form throughout for cold B2B." },
  "bn-BD": { withName: "নমস্কার {NAME},", withoutName: "নমস্কার,", note: "Bangladesh Bengali. Structural sentences in Bengali script, adtech terms in English. Currency BDT (Taka, ৳) with lakh / crore. Peer brands: bKash, Pathao, Daraz Bangladesh, Foodpanda Bangladesh, Robi, Grameenphone. Cities: Dhaka, Chittagong, Sylhet. Avoid Indian peers (Flipkart, Paytm, Jio) which signal wrong market. Use আপনি (formal) form." },
  "bn-IN": { withName: "নমস্কার {NAME},", withoutName: "নমস্কার,", note: "India Bengali (primarily West Bengal). Heavier English code-mixing than bn-BD; structural sentences regularly switch between Bengali and English in B2B contexts. INR currency with lakh / crore. Peer brands: India-wide (Flipkart, Paytm, Jio, Swiggy, Zomato) plus Kolkata-regional where relevant (Bandhan Bank, Spencer's). Avoid Bangladesh peer references. Use আপনি (formal) form." },
  "ja-JP": { withName: "{NAME}様、", withoutName: "ご担当者様、", note: "Japan. FORMAL even on WhatsApp. Japanese B2B does not soften greetings. Do NOT use こんにちは or ハロー for cold outreach. Default register is teineigo (です/ます forms); escalate to sonkeigo (尊敬語) when referring to the prospect's company actions and kenjougo (謙譲語) when referring to MobUpps' actions. Currency JPY (¥, no decimals, comma thousands: ¥1,234,567). Cities: 東京 (Tokyo), 大阪 (Osaka), 名古屋 (Nagoya), 福岡 (Fukuoka), 横浜 (Yokohama), 札幌 (Sapporo). Peer brands: Rakuten, LINE Yahoo (post-merger), Mercari, ZOZO, SoftBank, NTT DoCoMo, KDDI au, Sony, Nintendo, Sega, Bandai Namco, JTB, Recruit, CyberAgent, GREE, DeNA. Mitsui / Mitsubishi UFJ / Mizuho for finance. Enterprise tier prefers the trading-house and chaebol-equivalent context." },
  "ko-KR": { withName: "{NAME} 님,", withoutName: "담당자님,", note: "South Korea. FORMAL. Do NOT use 안녕 alone for cold outreach. Default register is 합쇼체 (formal -ㅂ니다 forms) for cold B2B; 해요체 (semi-formal -아요/어요) acceptable once warm. Currency KRW (원), with 만 (10K) and 억 (100M) for larger amounts; '1,000원' for small, '5천만원' or '50,000,000원' for mid, '1억원' for 100M. Cities: 서울 (Seoul), 부산 (Busan), 인천 (Incheon), 대구 (Daegu), 광주 (Gwangju), 대전 (Daejeon), 수원 (Suwon), 성남 (Seongnam, includes Pangyo tech cluster). Peer brands - chaebol tier: Samsung, Hyundai, LG, SK, Lotte, Hanwha, Posco, KT, Shinhan Bank, KB Kookmin, Woori Bank. Korean tech-startup tier: Coupang, Kakao (KakaoTalk / KakaoPay / KakaoBank), Naver, Toss, Karrot Market (당근마켓), Yanolja, Baemin / Woowa Brothers, Market Kurly, Musinsa, Krafton, NCSoft, Netmarble, Nexon, Smilegate. Match peer reference to prospect's company size: chaebol references for enterprise, tech-startup references for SaaS / mobile gaming / fintech." },
  "he-IL": { withName: "שלום {NAME},", withoutName: "שלום,", note: "Israel. Hebrew B2B mixes Hebrew structural grammar with English adtech terminology; English code-mixing is heaviest in Tel Aviv tech and lightest in traditional sectors (banking, insurance, telco). Default register is informal-but-respectful: שלום (Shalom) opens the message; do NOT use לכבוד (Lichvod) which reads as official-letter register, too stiff for chat. Currency NIS / ILS (₪), no decimals for B2B amounts: ₪1,234,567 or '1.2 מיליון ₪' for 1M+. Cities: תל אביב (Tel Aviv, tech cluster), הרצליה (Herzliya, fintech and enterprise), רעננה (Raanana, tech HQs), פתח תקווה (Petah Tikva, multinational HQs), ירושלים (Jerusalem, government / academic / Mobileye), חיפה (Haifa, traditional industry / Technion / Intel), באר שבע (Beer Sheva, defense / cyber / Ben-Gurion University). Peer brands - tech tier: Wix, Monday.com, Lemonade, Riskified, JFrog, ironSource (now Unity), Playtika, Fiverr, Lightricks, Outbrain, Taboola, Gett, Via, Mobileye, Check Point, CyberArk, SolarEdge. Traditional sector: Bank Hapoalim, Bank Leumi, Bank Discount, Mizrahi Tefahot, Israel Discount Bank, Bezeq, Cellcom, Partner, Pelephone, Strauss Group, Tnuva, Osem, Super-Sol, Shufersal, Rami Levy. Match peer tier to prospect's company; mixing reads as foreign-template." },
  "tr-TR": { withName: "Merhaba {NAME},", withoutName: "Merhaba,", note: "Turkey. Turkish B2B uses formal Siz register for cold outreach; never Sen for first contact. 'Merhaba {NAME},' is standard chat opening; 'Sayın {NAME},' for more formal email-equivalent register. Currency TRY (₺), with 'bin' (thousand) and 'milyon' (million) for larger amounts in informal contexts; full numerals '₺1.234.567' for formal B2B (note European-style period thousands separator and comma decimal). Cities: İstanbul (the commercial center, often subdivided into Avrupa Yakası and Asya Yakası; Maslak, Levent, and Etiler for finance / enterprise tech; Beşiktaş and Şişli for media), Ankara (capital, government, defense, Turkish Aerospace), İzmir (export hub, manufacturing), Bursa (automotive), Antalya (tourism), Gaziantep (regional B2B). Peer brands - tech / digital-native tier: Trendyol (Alibaba-backed e-commerce), Hepsiburada, Getir (quick commerce), Yemeksepeti (food delivery, Delivery Hero), Migros Sanal (online grocery), Türkiye İş Bankası's BiP, Papara (fintech), İninal (prepaid). Traditional / chaebol-equivalent tier: Türkiye İş Bankası, Garanti BBVA, Akbank, Yapı Kredi, Ziraat Bankası (state), Türk Telekom, Turkcell, Vodafone Turkey, Türk Hava Yolları (Turkish Airlines, THY), Pegasus, Migros Ticaret, BİM, A101, ŞOK (discount retail), Koç Holding, Sabancı Holding, Doğuş Holding. Match peer tier to prospect's size: holding-group references for enterprise, tech-tier references for SaaS / e-commerce / fintech / mobile gaming." },
  "it-IT": { withName: "Salve {NAME},", withoutName: "Salve,", note: "Italy. Italian B2B uses formal Lei register for cold outreach; never tu for first contact. 'Salve {NAME},' is the formal-neutral chat opening (works for any Lei context); 'Buongiorno {NAME},' is a slightly more formal alternative. 'Ciao' is informal-young register; reserve for warm threads only. 'Gentile {NAME},' or 'Egregio {NAME},' for the most formal email-equivalent register (rare on WhatsApp / Telegram / Slack). Currency EUR (€), with European separators ('€1.234.567,89' — period thousands, comma decimal). Cities split: industrial-North (Milano for finance / fashion / tech, Torino for automotive / Fiat / Stellantis HQ, Genova for shipping / finance), bureaucratic-Center (Roma for government / state-owned, Bologna for food / packaging, Firenze for fashion / leather), South / Mezzogiorno (Napoli, Bari, Palermo, Catania — smaller B2B but growing). Peer brands - enterprise tier: Eni (energy), Enel (utilities), Generali (insurance), UniCredit, Intesa Sanpaolo, Banco BPM, Mediobanca, Poste Italiane (post + bank + insurance + telco), Telecom Italia / TIM, Mediaset, Sky Italia, RAI, Leonardo (defense). Industrial tier: Fiat / Stellantis, Ferrari, Lamborghini, Lavazza, Barilla, Ferrero, Campari, Pirelli, Luxottica (now EssilorLuxottica), Prada, Armani, Versace, Gucci (Kering). Tech / digital-native tier: Subito.it (classifieds), Immobiliare.it (real estate), Telepass (toll / mobility), Satispay (fintech), Nexi (payments), Esselunga (online grocery), DoveConviene / ShopFully (retail tech), Bending Spoons (mobile apps), Musixmatch (lyrics tech). Match peer tier to prospect's company: enterprise / industrial for traditional sectors, tech / digital-native for SaaS / e-commerce / fintech / mobile." },
  "pl-PL": { withName: "Dzień dobry, {NAME},", withoutName: "Dzień dobry,", note: "Poland. Polish B2B uses formal Pan / Pani register for cold outreach (the polite third-person address). 'Dzień dobry, {NAME},' is the standard chat opening (works through the day); 'Witam Pana {LastName},' or 'Witam Panią {LastName},' for more formal email-equivalent register. 'Cześć' is informal-young register; reserve for established warm threads only. 'Szanowny Panie / Szanowna Pani' for very formal contexts (rare on WhatsApp / Telegram / Slack). Currency PLN (zł), with space thousands and comma decimal: '1 234 567,89 zł' (space, not period or comma, as the thousands separator). Cities split: Warszawa (capital, enterprise / finance / multinational HQs), Kraków (tech-startup capital, Aleja 29 Listopada / Zabłocie tech parks), Wrocław (tech, EPAM, IBM, Capgemini), Gdańsk / Trójmiasto (Tricity: Gdańsk + Sopot + Gdynia, maritime / SaaS / shipping), Poznań (manufacturing / trade fairs), Łódź (logistics / textile), Katowice (industrial Silesia). Peer brands - enterprise tier: PKO Bank Polski (largest, state-controlled), Bank Pekao, mBank, ING Bank Śląski, Santander Bank Polska, BNP Paribas Polska, PZU (insurance, the dominant Polish insurer), Orlen (oil / petrochemical, state), KGHM (copper / mining, state), JSW (coal, state), PGE / Tauron / Enea (utilities), Orange Polska, Play (now P4 / iliad), T-Mobile Polska, Plus / Polkomtel. Retail / FMCG: Biedronka (Jeronimo Martins, the dominant discount retailer), Lidl Polska, Kaufland, Carrefour Polska, Auchan Polska, Żabka (the dominant convenience chain), Empik (books / media), CCC (footwear), LPP (Reserved, Cropp, House, Mohito, Sinsay — Polish fashion holding). Tech / digital-native tier: Allegro (the dominant Polish e-commerce platform, comparable to Amazon dominance in other markets), InPost (parcel lockers, the Polish e-commerce delivery standard), DocPlanner (znanylekarz.pl), Brainly, Booksy, Vinted (Lithuanian but heavy PL presence), Tpay / Przelewy24 (payments), DataWalk (analytics), Asseco (enterprise software, dominant in Polish public-sector IT). Match peer tier to prospect's company: enterprise / industrial for traditional sectors, tech / digital-native for SaaS / e-commerce / fintech / mobile." },
  "ru-RU": { withName: "Здравствуйте, {NAME},", withoutName: "Здравствуйте,", note: "Russia. Russian B2B uses formal вы register (capitalized Вы in formal correspondence is dated but still acceptable in very formal contexts; modern B2B uses lowercase вы); never ты for cold outreach. 'Здравствуйте, {NAME},' is the standard chat opening; 'Добрый день, {NAME},' is a slightly softer alternative that also works. 'Привет' is informal-young register; never for cold B2B. 'Уважаемый/Уважаемая {LastName}' is the most formal email-equivalent opener (gendered: Уважаемый for male, Уважаемая for female). Currency RUB (₽), with space thousands and comma decimal: '1 234 567,89 ₽' (European-style separators; ruble symbol after amount with space). For larger amounts: 'млн' (million) and 'млрд' (billion) are standard ('1,5 млн ₽'). Cities: Москва (Moscow, the commercial center; ~13M; finance, enterprise, government concentrated in central Moscow and Moskva-City for business towers), Санкт-Петербург (St. Petersburg, ~5.5M; tech, culture, oil/gas Gazprom HQ post-relocation), Екатеринбург (Yekaterinburg, ~1.5M; industrial Urals capital), Новосибирск (Novosibirsk, ~1.6M; Siberian tech / Akademgorodok), Казань (Kazan, ~1.3M; IT cluster Innopolis nearby), Нижний Новгород, Краснодар (~1M, growing southern tech). Peer brands - enterprise / state tier: Газпром (Gazprom, gas / energy), Роснефть (Rosneft, oil), Лукойл (LUKOIL, oil), Сбер / Сбербанк (Sberbank, the dominant bank; also includes SberDevices, SberMarket, SberAuto, SberCloud, SberMobile super-app ecosystem), ВТБ (VTB, banking), Альфа-Банк (Alfa-Bank), Газпромбанк (Gazprombank), Россельхозбанк (Rosselkhozbank), Норильский никель (Nornickel, metals), Северсталь (Severstal, steel), Магнит (Magnit, retail), Х5 Retail Group (X5: Pyaterochka, Perekrestok, Karusel chains), Билайн (Beeline / VEON), МТС (MTS), МегаФон (MegaFon, Tele2 subsidiary), Аэрофлот (Aeroflot). Tech / digital-native tier: Яндекс (Yandex — search, taxi, food delivery, e-commerce, music, navigation, the dominant Russian tech ecosystem), VK / ВКонтакте (VK Group — social, mail, music, classifieds, gaming Mail.Ru), Тинькофф / Т-Банк (T-Bank, neobank), Ozon (e-commerce, publicly listed Nasdaq), Wildberries (e-commerce, the largest by GMV), Авито (Avito, classifieds), HeadHunter / hh.ru (jobs), Skyeng / Skypro (edtech), Делимобиль (Delimobil, carsharing), Самокат / Лавка (Samokat / Yandex Lavka, quick commerce), Kaspi.kz (Kazakhstan-based but heavy ru-RU presence in adjacent markets). Match peer tier to prospect's company: enterprise / state references for traditional sectors and resource industries, tech / digital-native for SaaS / e-commerce / fintech / mobile gaming." },
  "id-ID": { withName: "Selamat pagi, Bapak/Ibu {NAME},", withoutName: "Selamat pagi, Bapak/Ibu,", note: "Indonesia. Indonesian B2B uses formal Bapak (Mr.) / Ibu (Ms.) honorifics for cold outreach; never use first name alone. The honorifics precede the name: 'Bapak Budi' / 'Ibu Sari'. Common Indonesian-Chinese / Indonesian-of-Chinese-descent names sometimes carry 'Pak' / 'Bu' as short forms but cold B2B should default to full 'Bapak' / 'Ibu'. Time-of-day greetings rotate: Selamat pagi (morning ~5am-11am), Selamat siang (~11am-3pm), Selamat sore (~3pm-7pm), Selamat malam (evening ~7pm onwards); use the form matching the time the prospect will read. 'Halo Pak/Bu {NAME},' is acceptable on WhatsApp / chat for less formal contexts. 'Yth. Bapak/Ibu {LastName},' (Yang terhormat / 'The respected') is the most formal email-equivalent register, less common on chat. Currency IDR (Rp), with period thousands and comma decimal: 'Rp1.234.567,89' (note: NOT comma thousands; European-style separators). For larger amounts: 'rb' (ribu / thousand) and 'jt' (juta / million) and 'M' (miliar / billion) are common in informal contexts; full numerals 'Rp1.000.000' for formal B2B. The 'IDR' three-letter code is rare in body text; use 'Rp' prefix. Cities: Jakarta (the commercial capital, ~10M city + 30M+ Jabodetabek metro; CBD around Sudirman / Kuningan / Thamrin for finance and enterprise; SCBD for tech), Surabaya (~3M, second-largest, manufacturing / port / East Java), Bandung (~2.5M, tech / textile / education / West Java), Medan (~2.4M, Sumatra commercial hub), Semarang, Makassar (eastern Indonesia gateway), Bali / Denpasar (tourism but growing tech). Peer brands - enterprise / state tier: Bank Mandiri (largest state bank), BCA (Bank Central Asia, the dominant private bank), BNI (Bank Negara Indonesia, state), BRI (Bank Rakyat Indonesia, state, microfinance focus), CIMB Niaga, Bank Danamon, Astra International (the dominant Indonesian conglomerate — automotive, agribusiness, mining, financial services, infrastructure, IT — Toyota / Daihatsu / Isuzu / Honda / BMW / Peugeot dealerships in Indonesia), Pertamina (state oil and gas), PLN (state electricity), Telkom Indonesia (state telco; includes Telkomsel which is the dominant mobile operator), Indosat Ooredoo Hutchison (telco), XL Axiata (telco), Garuda Indonesia (state airline). Tech / digital-native tier: GoTo Group (the largest Indonesian tech holding — Gojek for ride-hailing / food / payments + Tokopedia for e-commerce, post-merger), Grab Indonesia (Singapore HQ but dominant Indonesian player), Bukalapak (e-commerce), Traveloka (online travel agent, regional SEA), OVO (digital wallet, Grab-affiliated), DANA (digital wallet, Ant Group + Emtek), LinkAja (digital wallet, state-backed via Telkomsel / Pertamina / BRI / BNI / Mandiri consortium), Blibli (e-commerce, Djarum group), Tiket.com (travel), Akulaku (BNPL / fintech), Kredivo (BNPL), Ruangguru (edtech), Halodoc (healthtech), Sociolla (beauty e-commerce). Match peer tier to prospect's company: enterprise / state references for traditional banking / energy / telco, tech / digital-native for SaaS / e-commerce / fintech / mobile gaming. Note: 'Indomaret' and 'Alfamart' are the two dominant convenience-store chains and worth referencing for retail / FMCG contexts." },
  "uk-UA": { withName: "Вітаю, {NAME},", withoutName: "Вітаю,", note: "Ukraine. Ukrainian B2B uses formal Ви (capitalized in formal correspondence; lowercase ви acceptable in modern chat) register; never ти for cold outreach. 'Вітаю, {NAME},' is the standard modern professional opener (literally 'I greet'); 'Доброго дня, {NAME},' is a slightly more traditional alternative. 'Шановний/Шановна {LastName}' (gendered: Шановний for male, Шановна for female) is the most formal email-equivalent opener. 'Привіт' is informal-young; never for cold B2B. Currency UAH (₴), with space thousands and comma decimal: '1 234 567,89 ₴' (European-style separators; hryvnia symbol after amount with space). For larger amounts: 'млн' (million) and 'млрд' (billion) are standard. Cities: Київ (Kyiv, the commercial / political center; ~3M; finance, enterprise, government, tech all concentrated; Podil and Pechersk for business, Solomyanka for tech), Львів (Lviv, the IT-export capital — SoftServe, EPAM Ukraine, Sigma, Globallogic; the IT-cluster face of Ukrainian B2B abroad), Дніпро (Dnipro, industrial / metals / fintech), Харків (Kharkiv, traditional industry / IT despite war-affected status), Одеса (Odesa, port / agricultural / IT), Івано-Франківськ / Ужгород (western IT-cluster satellites). Peer brands - enterprise / banking tier: Monobank (the most successful Ukrainian neobank, Universal Bank parent), PrivatBank (largest by retail customers, state-nationalized 2016), Oschadbank (state savings bank), Raiffeisen Bank Aval (Raiffeisen Austria subsidiary), UkrSibbank (BNP Paribas), Universal Bank, PUMB / FUIB. Retail / e-commerce: Rozetka (the dominant Ukrainian e-commerce platform, comparable to Allegro in PL or Wildberries in RU), Prom.ua (marketplace), Nova Poshta (THE Ukrainian parcel-delivery standard — every Ukrainian B2B uses it; private), Ukrposhta (state post). Telco: Kyivstar (largest, owned by VEON), Vodafone Ukraine (formerly MTS Ukraine), lifecell (Turkcell subsidiary). Tech / digital-native: SoftServe (largest Ukrainian software outsourcer, US HQ now), EPAM Ukraine (now NYSE-listed EPAM), Sigma Software, Globallogic (Hitachi-owned), GitLab (Ukrainian-founded, US HQ), Grammarly (Ukrainian-founded, US HQ), MacPaw (CleanMyMac), Reface (face-swap AI), Preply (edtech), Petcube. Note: Ukrainian B2B post-2022 is highly attuned to Russian linguistic influence; use Ukrainian-specific term equivalents (Київ not Киев, Львів not Львов, Харків not Харьков), and avoid mixed Russian-Ukrainian sourzhik vocabulary. Match peer tier to prospect's company: enterprise / banking for traditional finance, e-commerce-tier for retail / logistics, IT-outsourcer-tier for software services, tech-product-tier for SaaS / mobile / consumer." },
  "cs-CZ": { withName: "Dobrý den, {NAME},", withoutName: "Dobrý den,", note: "Czech Republic / Czechia. Czech B2B uses formal Vy (capitalized in correspondence; lowercase vy acceptable on chat) register; never ty for cold outreach. 'Dobrý den, {NAME},' is the standard chat opening and works through the day. 'Vážený pane {LastName},' / 'Vážená paní {LastName},' is the most formal email-equivalent opener (gendered: pane for male, paní for female). 'Ahoj' / 'Čau' are informal-young; never for cold B2B. Currency CZK (Kč), with space thousands and comma decimal: '1 234 567,89 Kč' (European-style separators; Kč symbol after amount with space). 'mil.' (million) and 'mld.' (miliarda / billion) are common abbreviations; full numerals for formal B2B. Cities: Praha (Prague, the commercial / political center; ~1.3M city + ~2.7M metro; finance, enterprise, multinational HQs; Karlín / Smíchov / Pankrác for tech and modern offices; Old Town for traditional business), Brno (~380K, second-largest, the secondary tech hub — Red Hat, IBM Brno, AVG / Avast originally), Ostrava (~280K, industrial / mining / heavy industry, Moravian-Silesian Region), Plzeň (~170K, automotive / Škoda Transportation, Pilsner Urquell brewery), Olomouc (~100K, R&D / pharma), Liberec, České Budějovice. Peer brands - enterprise / banking tier: Česká spořitelna (Erste Group, the largest retail bank), ČSOB (KBC Bank Belgium subsidiary), Komerční banka (KB, Société Générale subsidiary), Moneta Money Bank, UniCredit Bank Czech Republic, Raiffeisenbank ČR, Air Bank (PPF), Fio banka, J&T Banka. Industrial / state: Škoda Auto (VW Group, automotive), Škoda Transportation (separate company, trains / trams), ČEZ Group (state-controlled electricity utility, the dominant Czech utility), Innogy / Net4Gas, O2 Czech Republic (telco, fixed and mobile), T-Mobile Czech Republic, Vodafone Czech Republic. Retail / FMCG: Albert (Ahold Delhaize, the largest supermarket chain), Tesco Stores ČR, Kaufland (Schwarz Group), Lidl ČR, Penny Market, Globus, dm drogerie, Rossmann. E-commerce / tech: Alza.cz (the dominant Czech e-commerce platform, comparable to Allegro / Rozetka regional dominance), Mall.cz (now part of Allegro group), Rohlík (online grocery, the dominant Czech model — also expanded to DACH and beyond), Heureka (price comparison), Slevomat (deals), Avast (security, originally Czech, now Gen Digital after NortonLifeLock merger), AVG (also Avast / Gen Digital), Productboard (US HQ Czech roots), Kiwi.com (travel meta-search), Dáme jídlo (food delivery, Delivery Hero), Wolt Czechia (Finnish but heavy CZ presence). Note: Czech B2B tone is reserved and pragmatic; over-enthusiasm or American-style hype reads as foreign-template. Match peer tier to prospect's company: enterprise / banking for finance, industrial for traditional manufacturing, e-commerce / tech for SaaS / digital." },
  "ro-RO": { withName: "Bună ziua, {NAME},", withoutName: "Bună ziua,", note: "Romania. Romanian B2B uses formal dumneavoastră register (Romanian polite second person, often abbreviated dvs. in writing); never tu for cold outreach. 'Bună ziua, {NAME},' is the standard chat opening; 'Stimate domnule {LastName},' / 'Stimată doamnă {LastName},' is the most formal email-equivalent opener (gendered: domnule for male, doamnă for female). 'Salut' / 'Bună' are informal-young; never for cold B2B. Currency RON (lei, plural lei; symbol L not standard so 'lei' suffix preferred): '1.234.567,89 lei' (European-style period thousands, comma decimal). 'mil.' (milioane / million) and 'mld.' (miliarde / billion) for larger amounts. Diacritics matter: ă (a-breve), â (a-circumflex), î (i-circumflex), ș (s-comma, NOT s-cedilla), ț (t-comma, NOT t-cedilla — Romanian uses the comma-below diacritic specifically, distinct from Turkish). Cities: București (Bucharest, the commercial / political center, ~2M; CBD around Calea Victoriei / Aviatorilor / Floreasca / Pipera tech park), Cluj-Napoca (Cluj, ~325K, the dominant Romanian tech hub — UBB / Universitatea Babeș-Bolyai, large UiPath / Bitdefender / Endava engineering presence), Timișoara (~320K, western Banat manufacturing + tech, Continental, Hella, Flex), Iași (~290K, eastern Moldavia academic + IT, Iași university and Amazon center), Constanța (~280K, Black Sea port and logistics), Brașov (~250K, Transylvania manufacturing + tourism), Sibiu (~150K, Saxon-heritage manufacturing). Peer brands - banking tier: Banca Transilvania (the largest Romanian bank, listed BVB), BCR (Banca Comercială Română, Erste Group), BRD (BRD-Groupe Société Générale), Raiffeisen Bank România, ING Bank România, UniCredit Bank România, CEC Bank (state). Industrial / state: OMV Petrom (the largest Romanian company by revenue, OMV Austria), Hidroelectrica (state hydropower, recently IPO'd), Romgaz (state gas), Nuclearelectrica (state nuclear), Electrica, Engie Romania, Distrigaz. Telco: Orange Romania, Vodafone Romania, Telekom Romania (Hellenic OTE then Orange acquisition), Digi / RCS&RDS (DIGI Communications). E-commerce / tech: eMAG (THE dominant Romanian e-commerce platform, Naspers / Prosus), OLX Romania (classifieds), Glovo Romania (delivery), Bolt Romania (mobility), UiPath (Romanian-founded RPA unicorn, NYSE-listed PATH — the biggest Romanian tech success), Bitdefender (security, Romanian-founded), Endava (Romanian engineering presence, NYSE-listed DAVA). Match peer tier: banking for finance, OMV Petrom/state for traditional, eMAG/UiPath/Bitdefender for tech." },
  "hu-HU": { withName: "Üdvözlöm, {NAME},", withoutName: "Üdvözlöm,", note: "Hungary. Hungarian B2B uses formal Ön register (Hungarian polite third-person, distinct from informal Te); never Te for cold outreach. Verbs conjugate to third-person singular even though addressing the recipient: 'Ön szeretne találkozni' (would you like to meet — Ön + 3rd person verb). 'Üdvözlöm, {NAME},' is the standard chat opening (formal-respectful, literally 'I greet'); 'Tisztelt {LastName} Úr,' / 'Tisztelt {LastName} Asszony,' is the most formal email-equivalent opener (Hungarian convention puts the family name BEFORE the given name in formal contexts — Tisztelt Nagy Úr for 'Mr. Nagy', with Hungarian-order family name first). 'Szia' / 'Helló' are informal-young; never for cold B2B. Currency HUF (Ft, forint): '1 234 567 Ft' (space thousands, comma decimal — though forint has effectively no fractional unit in B2B; no decimals needed). 'M Ft' (millió forint / million Ft) and 'Mrd Ft' (milliárd / billion Ft) are standard abbreviations. Diacritics: á, é, í, ó, ö, ő (with double-acute, a Hungarian-specific letter), ú, ü, ű (with double-acute). Get ő and ű right — they're Hungarian-distinct vs ó/ö and ú/ü. Cities: Budapest (the commercial / political center, ~1.7M city + ~3M metro; District V Belváros for traditional finance and government, District VI Terézváros, District XIII Újlipótváros and the Váci út corridor for modern offices and HQs, District IX Ferencváros for tech / startup, Buda hills for residential / consulting). Debrecen (~200K, eastern Hungary, second-largest, university and pharma — BMW factory under construction), Szeged (~160K, southern Hungary, pharma / chemicals), Miskolc (~150K, northern industrial), Pécs (~140K, southern university town), Győr (~130K, western Hungary, Audi factory). Peer brands - banking tier: OTP Bank (the dominant Hungarian bank, regional CEE presence, BUX-listed), MBH Bank (post-2023 merger of MKB, Budapest Bank, Takarékbank), K&H Bank (KBC Belgium subsidiary), Erste Bank Hungary, Raiffeisen Bank Hungary, UniCredit Hungary, CIB Bank (Intesa Sanpaolo). Industrial / state: MOL Group (oil and gas, BUX-listed, the largest Hungarian industrial company — also operates regionally in Slovakia, Croatia), MVM Group (state energy / nuclear / Paks), Magyar Telekom (telco, Deutsche Telekom — the dominant fixed and mobile operator), Yettel Hungary (formerly Telenor, PPF Group), Vodafone Hungary, Magyar Posta (state post). Manufacturing: Audi Hungaria Győr, Mercedes Kecskemét, BMW Debrecen (under construction), Suzuki Esztergom, Continental, Bosch Hungary. E-commerce / tech: eMAG Hungary (Romanian eMAG's Hungarian operation), Vatera (classifieds), Jófogás (classifieds), Wolt Hungary (Finnish), Bolt Hungary (Estonian), Foodpanda Hungary. Match peer tier to company sector." },
  "bg-BG": { withName: "Здравейте, {NAME},", withoutName: "Здравейте,", note: "Bulgaria. Bulgarian B2B uses formal Вие (Cyrillic capitalized Vie, the polite second-person) register; never ти for cold outreach. 'Здравейте, {NAME},' is the standard chat opening; 'Уважаеми г-н {LastName},' / 'Уважаема г-жо {LastName},' is the most formal email-equivalent opener (gendered: г-н = gospodin Mr., г-жо = gospozho vocative form of Ms.). 'Здрасти' / 'Здрасти' / 'Чао' are informal; never for cold B2B. Currency BGN (лв., lev / leva plural): '1 234 567,89 лв.' (space thousands, comma decimal; 'лв.' suffix with space). Bulgaria is preparing for euro adoption (target 2026); some B2B contexts already dual-quote in EUR. Cities: София (Sofia, capital, ~1.2M city + ~1.7M metro; the commercial / political center; Mladost / Bulgaria Boulevard / Tsarigradsko shose for tech parks and modern offices, Lozenets / Iztok for premium business addresses), Пловдив (Plovdiv, ~340K, second-largest; manufacturing + IT outsourcing — Trakia Economic Zone), Варна (Varna, ~330K, Black Sea port and tourism + IT), Бургас (Burgas, ~200K, Black Sea port and petrochemical — Lukoil Neftohim Burgas), Русе (Ruse, ~150K, Danube port), Стара Загора (Stara Zagora, ~140K, industrial). Peer brands - banking tier: UniCredit Bulbank (UniCredit Italy subsidiary, the largest bank), DSK Bank (OTP Group Hungary, second-largest), Postbank / Eurobank Bulgaria (Eurobank Greece), Raiffeisenbank Bulgaria, KBC Bank Bulgaria (former CIBANK), Allianz Bank, Investbank, First Investment Bank / Fibank (one of few Bulgarian-owned). Industrial / state: Bulgargaz (state gas), Bulgartransgaz (state transmission), NEK (Natsionalna Elektricheska Kompaniya, state electricity), Kozloduy NPP (nuclear, state), Lukoil Neftohim Burgas (refinery, Russian Lukoil), Aurubis Bulgaria (copper, formerly KCM), Solvay Sodi (chemicals). Telco: Yettel Bulgaria (formerly Telenor BG, PPF Group), A1 Bulgaria (formerly Mtel, the dominant operator, A1 Telekom Austria), Vivacom (Bulgaria's national telco, United Group). Tech / digital-native: VMware Bulgaria (largest tech employer, multinational), HP Bulgaria, IBM Bulgaria, SAP Labs Bulgaria, Software Group, Telerik / Progress (Bulgarian-founded, US HQ as Progress Software — major Bulgarian tech success), Telerik Academy (training), Cloudpipes (formerly Loop), Bulpros, ScaleFocus, Modis Bulgaria. E-commerce: eMAG Bulgaria (Romanian eMAG's Bulgarian operation, the dominant e-commerce platform), Olx.bg (classifieds), Bazar.bg, Gloria (FMCG), Lidl Bulgaria, Kaufland Bulgaria. Match peer tier to company sector: banking for finance, state-industrial for energy/utilities, Telerik/VMware/SAP Labs for tech, eMAG for e-commerce." },
  "el-GR": { withName: "Γεια σας, {NAME},", withoutName: "Γεια σας,", note: "Greece. Greek B2B uses formal εσείς (esis, plural-formal second person) register; never εσύ (esy, informal singular) for cold outreach. 'Γεια σας, {NAME},' is the standard chat opening (literally 'health to you' plural-formal); 'Αξιότιμε κύριε {LastName},' / 'Αξιότιμη κυρία {LastName},' is the most formal email-equivalent opener (gendered: κύριε = kyrie Mr. vocative, κυρία = kyria Mrs.). 'Γεια σου' (singular informal) and 'Γεια!' / 'Χαίρετε' are informal; never for cold B2B. Currency EUR (€), with European separators: '€1.234.567,89' (period thousands, comma decimal — same as Italian/German/Spanish convention). 'εκ.' (ekatommyria / millions) or 'εκατομμύρια' spelled out, 'δισ.' (disekatommyria / billions) for larger amounts. Cities: Αθήνα (Athens, the commercial / political center; ~3.1M metro Attica region — the dominant Greek city by every B2B metric; Syntagma / Kolonaki / Vouliagmenis Avenue for traditional business, Marousi for tech / multinational HQs — comparable to a CEE tech-cluster city), Θεσσαλονίκη (Thessaloniki, the second-largest city, ~325K + ~1M metro; northern Greece commercial hub; Aristotle University; growing tech), Πάτρα (Patras, ~210K, western port), Ηράκλειο (Heraklion, ~140K, Crete tourism + university), Λάρισα (Larissa, ~150K, Thessaly agriculture). Peer brands - banking tier: Eurobank Holdings (Greek-listed, the largest by various metrics; subsidiary Postbank operates in Bulgaria), National Bank of Greece / NBG (state-influenced, Greek-listed), Alpha Bank (Greek-listed), Piraeus Bank / Piraeus Financial Holdings (Greek-listed). The four 'systemic' Greek banks are these four post-crisis consolidation. Industrial / state: Public Power Corporation / PPC / ΔΕΗ (state electricity, the dominant utility), DESFA (state gas transmission), Hellenic Petroleum / ELPE (the dominant refiner), Motor Oil Hellas (second refiner), Mytilineos Energy & Metals (BVB-listed conglomerate, energy + metals + concessions). Telco: OTE / Cosmote (Hellenic Telecommunications, Deutsche Telekom-owned — the dominant fixed and mobile), Vodafone Greece (acquired Wind Hellas 2024), Nova Greece (formerly Wind, United Group). Shipping is uniquely important for Greek B2B (Greek shipping is the largest global merchant fleet by tonnage; family-owned shipping houses are major B2B references): Angelicoussis Group, Tsakos Energy Navigation, Star Bulk, Diana Shipping, Costamare. E-commerce / tech: Skroutz (the dominant Greek price-comparison + marketplace, private), e-shop.gr (electronics e-commerce), Public.gr (retail / electronics), Plaisio (electronics), Wolt Greece (Finnish), efood (delivery, OTE-acquired then Delivery Hero context). Hotels / tourism: Astir Palace, Costa Navarino, Sani Resort (Greek tourism is a major sector, ~25% of GDP including indirect). Match peer tier to company sector: banking for finance, PPC/state-industrial for traditional, OTE/Vodafone for telco, Skroutz/Public for retail-tech, shipping families for maritime." },
  "th-TH": { withName: "เรียน {NAME},", withoutName: "เรียน คุณ,", note: "Thailand. Thai B2B uses formal-respectful register throughout cold outreach. The polite particle ครับ (krap, male speaker) / ค่ะ (ka, female speaker) is essential at sentence ends in Thai B2B — drop it and the message reads rude or unfinished. Use คุณ (khun) + first name as the standard polite second-person address; Thai uses first name in formal contexts (not family name). For 'I': ผม (phom, male speaker) / ดิฉัน (dichan, formal female speaker). 'เรียน {NAME},' is the formal letter/email opener (literally 'to inform'); 'สวัสดีครับ/ค่ะ คุณ {NAME},' is the warmer chat opening; 'สวัสดีครับ/ค่ะ' alone for prospect-name-unknown. NEVER use เธอ (informal you), มึง (rude you), or กู (rude I) in B2B. Currency THB (Thai baht, ฿): '฿1,234,567.89' or '1,234,567.89 บาท' (Arabic numerals with comma thousands, period decimal — same as US/UK convention; Thai uses Thai numerals only in formal-traditional contexts). Cities: กรุงเทพมหานคร (Bangkok, the dominant commercial center; ~10M metro; Sathorn/Silom CBD for finance, Sukhumvit for tech and multinationals, Asoke/Phrom Phong/Thong Lo for premium business, Chatuchak/Lat Phrao for industrial), เชียงใหม่ (Chiang Mai, ~130K, northern Thailand, tourism + tech + university), ภูเก็ต (Phuket, ~80K, tourism + property), หาดใหญ่ (Hat Yai, ~160K, southern, trade with Malaysia), ขอนแก่น (Khon Kaen, ~115K, northeastern Isaan region commercial hub). Peer brands - banking tier: Bangkok Bank (the largest Thai bank, Bangkok-listed BBL), Kasikornbank / KBank (Bangkok-listed KBANK, the second-largest, K Plus mobile banking dominant), Siam Commercial Bank / SCB (Bangkok-listed SCB, royal-family-affiliated heritage), Krung Thai Bank / KTB (state-owned), Bank of Ayudhya / Krungsri (MUFG Japan subsidiary), TMBThanachart Bank / ttb (TMB+Thanachart merger), CIMB Thai. Conglomerates (Thai B2B is heavily conglomerate-driven; family-controlled holding groups dominate): Charoen Pokphand Group / CP (the dominant Thai conglomerate, Chearavanont family — agribusiness/CP Foods, retail/7-Eleven Thailand+Lotus's+Makro, telco/True Corporation post-2023 dtac merger; CP All is the operator; one of the largest Thai businesses globally), ThaiBev / Thai Beverage (Sirivadhanabhakdi family, Beer Chang + Mekhong + F&N regional acquisitions), Siam Cement Group / SCG (cement + chemicals + packaging, Bangkok-listed, Royal-Bureau-linked), PTT Group (state-controlled energy major, Bangkok-listed PTT/PTTEP), Central Group (Chirathivat family, Central Department Store + Robinson + Tops + Big C + central retail dominance), The Mall Group (Ampornpisit family, The Mall + Siam Paragon + Emporium). Telco (heavily consolidated post-2023): AIS / Advanced Info Service (the largest Thai mobile operator, Singtel-affiliated, Bangkok-listed ADVANC), True Corporation (CP-controlled, merged with dtac in 2023 — now combined True+dtac, the second-largest), National Telecom / NT (state-owned, formerly CAT+TOT). E-commerce / tech: Shopee Thailand (Sea Group Singapore, the dominant), Lazada Thailand (Alibaba, second), JD Central exited Thailand 2023, Central Online (Central Group), Konvy (beauty). Mobile + gaming: Garena Thailand (Sea Group), TrueID (entertainment), VGI/AIS Play. Match peer tier to company sector: bank-tier for finance, CP/ThaiBev/SCG/Central for FMCG/conglomerate, AIS/True for telco, Shopee/Lazada for e-commerce. TONE: hierarchical-respectful, indirect-polite. Thai business culture values: explicit respect via ครับ/ค่ะ + คุณ + first name throughout, saving face (กรงเเกรงใจ kreng jai — consideration for others), indirect rejection (Thai buyers often say 'we will consider' meaning no), patience (transactional speed is slower than Anglo-Saxon, relationship-building expected). NEVER use direct criticism or hard pressure; NEVER assume Anglo-Saxon directness; ALWAYS include the polite particle ครับ/ค่ะ; ALWAYS use คุณ + first name. Sign-offs: 'ขอแสดงความนับถือ' (most formal, with respect / with high regard), 'ด้วยความเคารพ' (with respect, formal-warm), 'ขอบคุณครับ/ค่ะ' (thank you, casual-warm). Adtech vocabulary stays in English (CPI, ROAS, DSP, retention, install, conversion, etc.) per existing bare th guidance; structural Thai grammar wraps the English terms." },
  "vi-VN": { withName: "Kính gửi anh/chị {NAME},", withoutName: "Kính gửi anh/chị,", note: "Vietnam. Vietnamese B2B uses kinship-based pronoun register (Vietnamese has no neutral 'you' — pronouns reflect relative age/status). For cold outreach the safe-respectful form is anh (older brother, addressing a male prospect) / chị (older sister, addressing a female prospect), with the speaker using em (younger sibling, self-reference). Never use tôi (formal-cold 'I') as the default — it reads distant; em is warmer and standard for B2B outreach where the speaker positions themselves as junior-respectful. 'Kính gửi anh/chị {Name},' is the most formal email opener (Kính gửi = 'respectfully addressed to'); 'Chào anh/chị {Name},' is the standard chat / WhatsApp opener; 'Anh/chị {Name} thân mến,' is warm-formal ('dear'). NEVER use mày (rude you), bạn (peer-friend, too casual for cold B2B), or just first name alone. Currency VND (đồng, ₫): '1.234.567 đồng' or '1.234.567 VND' (period thousands, decimals rare). Because VND amounts are large, B2B contexts commonly quote in triệu (million) or tỷ (billion): '500 triệu đồng' = 500M VND (~$20K USD), '5 tỷ đồng' = 5B VND (~$200K USD). 'tỷ' is the most common scaling word in B2B. Cities: Thành phố Hồ Chí Minh / TP.HCM (Ho Chi Minh City / Saigon, ~9M, the dominant commercial center; Quận 1 / District 1 for traditional finance, Quận 7 / Phú Mỹ Hưng for expat business and tech, Quận 2 / Thủ Đức for the new tech hub and startup scene), Hà Nội (Hanoi, ~8M, political capital + state-owned enterprise HQs + tech), Đà Nẵng (Da Nang, ~1.2M, central Vietnam, the growing tech outsourcing hub), Hải Phòng (Hai Phong, ~2M, northern port), Cần Thơ (Can Tho, ~1.3M, Mekong Delta commercial hub), Biên Hòa (Bien Hoa, ~1.2M, industrial near Ho Chi Minh City). Peer brands - banking tier: Vietcombank (the largest Vietnamese bank by various metrics, state-influenced, listed HOSE VCB), VietinBank (state-influenced, HOSE CTG), BIDV (state, HOSE BID), Agribank (state, agriculture), Techcombank (the largest private bank, HOSE TCB — Masan Group affiliated), VPBank (HOSE VPB), MB Bank (military-affiliated, HOSE MBB), ACB (Asia Commercial Bank, HOSE ACB). State-owned and state-influenced banks dominate Vietnamese finance. Conglomerates: Vingroup (the dominant Vietnamese conglomerate, Pham Nhat Vuong family, HOSE VIC — VinFast EV / Vinhomes real estate / Vinpearl tourism; the most internationally recognizable Vietnamese name), Masan Group (FMCG + retail post-VinCommerce acquisition, HOSE MSN), FPT Corporation (the largest Vietnamese tech / IT outsourcing company, HOSE FPT — competes with Indian outsourcers globally; FPT Software, FPT Telecom, FPT Retail), Hoa Phat Group (steel, HOSE HPG), Hoang Anh Gia Lai / HAGL (agriculture + sport). Telco: Viettel (military-owned, the dominant Vietnamese telco; also operates internationally in Cambodia / Laos / Myanmar / Africa), Vinaphone (state, part of VNPT), Mobifone (state). E-commerce: Shopee Vietnam (Sea Group, the dominant by GMV), Lazada Vietnam (Alibaba), Tiki (Vietnamese-founded, the largest domestic e-commerce — competing with Shopee/Lazada), Sendo (Vietnamese-founded, struggling post-acquisition discussions), TikTok Shop growing rapidly. Tech / digital-native: VNG Corporation (Vietnamese tech major — Zalo messaging dominant ~75M users, gaming, payments; the Vietnamese digital reference), FPT Software (outsourcing global), MoMo (Vietnamese e-wallet dominant, ~30M users), ZaloPay (VNG), VPBank's Cake by VPBank (digital bank), Tima (P2P), Topica/Edupia (edtech). Mobility / delivery: Grab Vietnam (Singapore, the dominant), Be Group (Vietnamese-founded mobility), Gojek Vietnam (Indonesian, exited 2024), ShopeeFood (Sea Group), Baemin Vietnam (Delivery Hero, exited 2023). Gaming: VNG Corporation (gaming + Zalo, the Vietnamese digital reference), Garena Vietnam (Sea Group, Free Fire), Funtap, NCSoft Vietnam, Tencent / Riot Games Vietnam presence. Match peer tier: state-influenced banks for finance, Vingroup/Masan/FPT for conglomerate, Viettel for telco, Shopee/Tiki for e-commerce, VNG/MoMo for tech. TONE: warm-respectful, hierarchical-via-kinship, family-pronoun-based. Vietnamese business culture values: explicit kinship register (anh/chị/em throughout), saving face (never directly criticize), relationship-first (B2B in Vietnam expects relationship-warming before transactional ask — meeting in person at coffee or meal is normal, faster than Thai but slower than Anglo-Saxon), explicit acknowledgment of mutual contacts and prior context. NEVER use direct criticism, NEVER use 'tôi' as default I-pronoun (too cold), NEVER use 'bạn' for cold B2B (too peer-friend). Sign-offs: 'Trân trọng' (most formal, 'with respect / sincerely', the standard B2B email close), 'Kính thư' (very formal, archaic email close), 'Cảm ơn anh/chị' (thank you, warmer). Adtech vocabulary stays in English (CPI, ROAS, DSP, retention, install, conversion, etc.) per existing bare vi guidance; structural Vietnamese grammar wraps the English terms — 'Em đang giúp một số DSP tăng ROAS' (I'm helping several DSPs increase ROAS) is the natural mixed register." },
};

function buildGreetingBlock(language: string, hasName: boolean): string {
  // B-locale-plumbing: full tag first, fall back to primary subtag.
  const tag = (language || "").trim();
  const lang = tag.split(/[-_]/)[0].toLowerCase();
  const entry = GREETING_TABLE[tag] || GREETING_TABLE[lang];
  if (!entry) {
    // Unknown language — provide guidance only, no specific form.
    return `GREETING: Use the standard B2B WhatsApp greeting for language ${language}, with the prospect's first name if available. If no name, use a neutral language-appropriate greeting. Do NOT use email addresses or website handles as names.`;
  }
  const form = hasName ? entry.withName : entry.withoutName;
  const noteSuffix = entry.note ? ` Note: ${entry.note}` : "";
  return `GREETING (use this exact form, replacing {NAME} with the prospect's first name): ${form}${noteSuffix}`;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function languageDisplay(code: string): string {
  const c = (code || "").trim() || "en";
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(c);
    if (name && name.toLowerCase() !== c.toLowerCase()) return name;
  } catch {
    /* fall through */
  }
  return c;
}

function isUsableName(name: string | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed.includes("@")) return false; // looks like an email
  if (/^[a-z]+\d*$/.test(trimmed)) return false; // looks like a website handle
  return true;
}

function flattenConversation(conversation: ConversationRow[] | undefined): string {
  if (!conversation || conversation.length === 0) return "";
  return conversation.map((row) => {
    const who = row.direction === "outbound" ? "WE" : "PROSPECT";
    return `[${who} on ${row.channel} at ${row.timestamp}]\n${row.body}`;
  }).join("\n\n");
}

function buildResearchBriefBlock(brief: ProspectBrief | undefined, language: string): string {
  if (!brief) return "";

  const isNonEnglish = (language || "").toLowerCase() !== "en";
  const peers = brief.finalCompetitors.join(", ");
  const proofs = brief.tangibleReasons.map((r, i) => `  ${i + 1}. ${r}`).join("\n");

  let block = `PROSPECT RESEARCH BRIEF (the writer must ground every claim in this brief; do NOT introduce facts, peer brands, volumes, or events not listed here):

- Determined market: ${brief.determinedCountry}
- Determined scale tier: ${brief.determinedScaleTier} (${brief.scaleRationale})
- Calibrated daily volume MobUpps can deliver: ${brief.calibratedDailyVolume} per day
- Primary conversion event: ${brief.primaryEvent}
- Alternative events that may be referenced: ${brief.alternativeEvents.join(", ")}
- Peer brands in the same market (use ONE if natural — these are the ONLY peers you may name): ${peers}
- Subsidiary check: ${brief.subsidiaryCheckNote}
- Market context: ${brief.marketContext}
- Prospect-specific hook: ${brief.prospectSpecificHook}
- Likely growth challenge for this prospect: ${brief.prospectPrimaryGrowthProblem}

- WHY argument seed: ${brief.whyArgument}
- VALIDATION argument seed: ${brief.validationArgument}
- HOW argument seed: ${brief.howArgument}

- Available proof points (pick 1-2 to weave in naturally; do NOT list more than 2):
${proofs}`;

  if (isNonEnglish && (brief.whyArgumentNative || brief.validationArgumentNative || brief.howArgumentNative)) {
    block += `\n\nNATIVE-LANGUAGE ARGUMENT VARIANTS (use these as the basis for composing the message; they were already drafted in ${language}):`;
    if (brief.whyArgumentNative) block += `\n- WHY (${language}): ${brief.whyArgumentNative}`;
    if (brief.validationArgumentNative) block += `\n- VALIDATION (${language}): ${brief.validationArgumentNative}`;
    if (brief.howArgumentNative) block += `\n- HOW (${language}): ${brief.howArgumentNative}`;
  }

  return block;
}

// ─────────────────────────────────────────────────────────────────
// PROSPECTOR — system prompt
// ─────────────────────────────────────────────────────────────────

export function getProspectorSystemPrompt(ctx: MessageContext): string {
  const nativeVoice = buildNativeVoiceBlock(ctx.language);
  const channelRules = buildWriterRegisterBlock(ctx.channel, "prospector");
  const vocabularyBlock = ctx.sub_vertical && isValidSubVertical(ctx.sub_vertical)
    ? buildVocabularyBlock(ctx.sub_vertical)
    : "";
  const researchBlock = buildResearchBriefBlock(ctx.research_brief, ctx.language);

  return `You are a senior SDR at MobUpps, a mobile and web performance marketing network with a proprietary AI optimization engine called MAFO. You write cold outbound messages following a strict doctrine.
${nativeVoice}
${channelRules}
${vocabularyBlock ? `\n${vocabularyBlock}\n` : ""}${researchBlock ? `\n${researchBlock}\n` : ""}

DOCTRINE PRINCIPLES (apply across every message — these are non-negotiable):

1. PROSPECT-LED, NEVER SELF-REFERENTIAL. The first content sentence (the WHY)
   opens with the prospect's brand, vertical, market, or peer behavior — not
   with "We", "Our", "At MobUpps", or "I'm reaching out". This is the single
   most important rule. The prospect should feel the message is about THEM,
   not about us.

2. SPECIFIC NUMBERS, NEVER RANGES. Always one number, never "8-15%".
   Write "above 12%", "400+ daily", "under 0.7%". Ranges sound like
   marketing copy; specific numbers sound like real data.

3. VERTICAL-NATIVE TERMINOLOGY. Use the exact event names, metrics, and
   mechanics that the prospect's sub-vertical uses. Gaming UA prospects
   speak in IAP / payer / ARPDAU / D7 ROAS / retention. Fintech prospects
   speak in funded account / first deposit / KYC. E-commerce prospects
   speak in confirmed purchase / AOV / ROAS. Telehealth prospects speak in
   consultation booking / appointment. NEVER cross-leak vertical jargon.

4. COUNTRY-MATCHED REFERENCES. All competitor names, peer brands, market
   data, regulatory references, and cultural touchpoints MUST match the
   prospect's country. Indian prospect = Indian peers (cricket/IPL not NFL,
   Indian cities, Indian regulation). Brazilian prospect = Brazilian peers.
   Never default to US references for non-US prospects.

5. CONCRETE OVER ABSTRACT. Every claim must be a literal statement a human
   reader can understand on its own. NEVER write meta-language describing
   what the message is doing ("citing competitor growth", "referencing
   benchmarks", "as social proof") — write the actual fact instead. If you
   would write "citing Lazada's growth", instead write what Lazada actually
   did with a specific number.

6. NO ADMIN-LEAKED ARTIFACTS. No snake_case tokens (write "funded account"
   not "funded_account"). No bracketed editorial notes ([Verify X],
   [Check Y]). No template placeholders ({event}, [volume], NOT AVAILABLE).
   No raw config keys. No markdown formatting.

7. MOBUPPS DIFFERENTIATOR (KEEP IMPLICIT, NOT EXPLICIT). MobUpps' core
   stance is that we optimize for the prospect's revenue event, not vanity
   volume metrics. In long-form email this is a 2-sentence section; in chat
   we let the VALIDATION+HOW sentence carry it implicitly through specific
   revenue-event language. Do NOT write "What is special about MobUpps is..."
   in chat — that's a corporate-deck phrase that breaks the conversational
   register.

OUTPUT FORMAT:
Return ONLY a JSON object with two fields:
{
  "subject": "short topic tag, 3-5 words, internal use only",
  "message": "the full message body including greeting"
}

Do not include any other text, markdown, or explanation.`;
}

// ─────────────────────────────────────────────────────────────────
// PROSPECTOR — user prompt
// ─────────────────────────────────────────────────────────────────

export function getProspectorUserPrompt(ctx: MessageContext): string {
  const langDisplay = languageDisplay(ctx.language);
  const hasName = isUsableName(ctx.prospect_name);
  const hasCompany = !!(ctx.company && ctx.company.trim());

  const prospectLine = hasName && hasCompany
    ? `PROSPECT: ${ctx.prospect_name} at ${ctx.company}`
    : hasName
    ? `PROSPECT: ${ctx.prospect_name}`
    : hasCompany
    ? `PROSPECT: a contact at ${ctx.company} (no first name on file — use the no-name greeting form below)`
    : `PROSPECT: contact details unavailable. Use the no-name greeting form below and do not reference a company.`;

  const greetingBlock = buildGreetingBlock(ctx.language, hasName);
  const nativenessBlock = buildNativenessBlock(ctx.language);

  const verticalLine = ctx.sub_vertical
    ? `VERTICAL: ${ctx.vertical} / ${ctx.sub_vertical}`
    : `VERTICAL: ${ctx.vertical}`;

  const contextBlock = ctx.context_notes && ctx.context_notes.trim()
    ? `\nSDR CONTEXT NOTES (free-text intel the SDR pasted from Apollo or research — use this to ground the WHY and pick a specific peer/metric to reference):\n---BEGIN NOTES---\n${ctx.context_notes.trim()}\n---END NOTES---\n`
    : `\nSDR CONTEXT NOTES: (none provided — work from the vertical, country, and product alone)\n`;

  return `Write a cold ${ctx.channel} message for this prospect.

LANGUAGE: ${langDisplay} (you MUST write the entire message in ${langDisplay})
${prospectLine}
${verticalLine}
COUNTRY/MARKET: ${ctx.country || "not specified"}
PRODUCT WE OFFER: ${ctx.product}
${contextBlock}
${greetingBlock}

SENDER NAME (used internally; do NOT sign off with this — chat shows sender automatically): ${ctx.sender_name}
${nativenessBlock ? `\n${nativenessBlock}\n` : ""}
Write the message now. Begin with the greeting form specified above, then the WHY (prospect-led), then VALIDATION+HOW (one specific number, one vertical-native mechanic, one peer reference if natural), then a soft CTA. 5-7 sentences total.`;
}

// ─────────────────────────────────────────────────────────────────
// FOLLOWUPER — system prompt
// ─────────────────────────────────────────────────────────────────

export function getFollowuperSystemPrompt(ctx: MessageContext): string {
  const nativeVoice = buildNativeVoiceBlock(ctx.language);
  const channelRules = buildWriterRegisterBlock(ctx.channel, "followuper");
  const vocabularyBlock = ctx.sub_vertical && isValidSubVertical(ctx.sub_vertical)
    ? buildVocabularyBlock(ctx.sub_vertical)
    : "";
  const researchBlock = buildResearchBriefBlock(ctx.research_brief, ctx.language);

  return `You are a senior SDR at MobUpps writing a follow-up message in an existing chat thread. The prospect already knows who we are — you do NOT re-introduce yourself or MobUpps.
${nativeVoice}
${channelRules}
${vocabularyBlock ? `\n${vocabularyBlock}\n` : ""}${researchBlock ? `\n${researchBlock}\n` : ""}

ABSOLUTE CONTEXT-GROUNDING RULE:

Your only valid input is the prior conversation (provided below) plus any context notes from the SDR. Every claim, number, competitor name, and value point in this follow-up MUST trace to something visible in that prior conversation. You are NOT a general-purpose generator — you are a context-reading machine.

If the prior conversation appears empty or contains only a generic greeting, the upstream code should have refused this call. If you somehow still received empty context, return a short generic check-in rather than fabricating any claims.

CARRY-OVER PRINCIPLES from the doctrine (these still apply, even compressed):

1. SPECIFIC NUMBERS ONLY. If the prior message had "12%", reference "12%" — never "around 12%" or "approximately 12%". No new ranges.

2. VERTICAL-NATIVE TERMINOLOGY. The vocabulary established in the first message persists through every follow-up. Gaming → IAP/payer/ARPDAU. Fintech → funded account/first deposit. Don't drift into adjacent-vertical jargon.

3. COUNTRY-MATCHED. All references stay in the prospect's market. If the first message was about LATAM, follow-ups stay in LATAM context.

4. CONCRETE OVER ABSTRACT. No meta-language ("circling back, citing the previous data points" is a meta sentence describing what you're doing). Just write the actual content.

5. NO ADMIN-LEAKED ARTIFACTS. No snake_case, no brackets, no markdown.

6. NO SELF-REINTRODUCTION. The first message did the introducing. The follow-up acts like an ongoing colleague text.

OUTPUT FORMAT:
Return ONLY a JSON object with two fields:
{
  "subject": "short topic tag, 3-5 words, internal use only",
  "message": "the full follow-up message body"
}

Do not include any other text, markdown, or explanation.`;
}

// ─────────────────────────────────────────────────────────────────
// FOLLOWUPER — user prompt
// ─────────────────────────────────────────────────────────────────

export function getFollowuperUserPrompt(ctx: MessageContext): string {
  const langDisplay = languageDisplay(ctx.language);
  const hasName = isUsableName(ctx.prospect_name);
  const hasCompany = !!(ctx.company && ctx.company.trim());

  const prospectLine = hasName && hasCompany
    ? `PROSPECT: ${ctx.prospect_name} at ${ctx.company}`
    : hasName
    ? `PROSPECT: ${ctx.prospect_name}`
    : hasCompany
    ? `PROSPECT: a contact at ${ctx.company}`
    : `PROSPECT: contact details unavailable`;

  const verticalLine = ctx.sub_vertical
    ? `VERTICAL: ${ctx.vertical} / ${ctx.sub_vertical}`
    : `VERTICAL: ${ctx.vertical}`;

  // Conversation block — the primary source of truth for follow-ups.
  const flatConversation = flattenConversation(ctx.conversation);
  const conversationBlock = flatConversation
    ? `\nPRIOR CONVERSATION (your primary source of truth — every claim in the follow-up must trace to here):\n---BEGIN CONVERSATION---\n${flatConversation}\n---END CONVERSATION---\n`
    : `\nPRIOR CONVERSATION: (empty — this should not have been called; return a short generic check-in)\n`;

  // Topic summary (from messageSummarizer).
  const summary = (ctx.prior_summary || "").trim();
  const topicBlock = summary && !summary.includes("@")
    ? `TOPIC (a short noun phrase to use in the prior-contact reference, e.g. "following up on ___"): ${summary}\n`
    : `TOPIC: (no clean topic phrase available — reference the prior thread by what was said in it, e.g. "following up on the ${ctx.product} angle we discussed")\n`;

  // Previous follow-ups (so we don't repeat angles).
  let previousBlock = "";
  if (ctx.previous_followups && ctx.previous_followups.length > 0) {
    previousBlock = "\nPREVIOUS FOLLOW-UPS ALREADY SENT (do NOT repeat these angles):\n";
    for (const pf of ctx.previous_followups) {
      previousBlock += `--- Stage ${pf.stage} ---\n${pf.body}\n\n`;
    }
  }

  // SDR notes (optional — extra context the SDR may have added since last send).
  const notesBlock = ctx.context_notes && ctx.context_notes.trim()
    ? `SDR CONTEXT NOTES (additional intel — use these as supplementary, not as replacement for the prior conversation):\n${ctx.context_notes.trim()}\n`
    : "";

  const stageNum = ctx.stage ?? 1;
  const days = ctx.days_since_first ?? 0;

  const nativenessBlock = buildNativenessBlock(ctx.language);

  return `Write a Stage ${stageNum} follow-up ${ctx.channel} message for this prospect.

LANGUAGE: ${langDisplay} (you MUST write the entire message in ${langDisplay})
${prospectLine}
${verticalLine}
COUNTRY/MARKET: ${ctx.country || "not specified"}
PRODUCT WE OFFER: ${ctx.product}
DAYS SINCE FIRST CONTACT: ${days}

${topicBlock}
${conversationBlock}${previousBlock}${notesBlock}

SENDER NAME (used internally; do NOT sign off with this): ${ctx.sender_name}
${nativenessBlock ? `\n${nativenessBlock}\n` : ""}
Write the follow-up now. 2-3 sentences total. Sentence 1 references the prior thread by specific topic. Sentence 2-3 brings ONE new angle (rotation by stage: stage 1 = new insight, stage 2 = competitor/market move, stage 3 = direct + easy out, stage 4+ = fresh angle each time). Final sentence is a soft CTA.`;
}

// ─────────────────────────────────────────────────────────────────
// CRITIC — system prompt (mode-aware)
// ─────────────────────────────────────────────────────────────────

export function getCriticSystemPrompt(mode: GenerationMode, channel: ChannelCode): string {
  const channelCriticBlock = buildCriticRegisterBlock(channel, mode);

  const modeSpecificScores = mode === "followuper"
    ? `"channel_register_match": 1-5, "context_grounding": 1-5, "followup_ack": 1-5, "angle_freshness": 1-5,`
    : `"channel_register_match": 1-5, "no_self_referential_why": 1-5, "country_matched_references": 1-5, "vertical_native_terminology": 1-5,`;

  const additionalRule = mode === "followuper"
    ? `- needs_rewrite MUST be true if context_grounding < 4 (any unsupported claim must be cut). This is the single most important check in followuper mode.
- needs_rewrite MUST be true if angle_freshness < 3 AND stage >= 2 (the message must bring a fresh angle relative to prior followups in the thread; stage 1 is exempt because there are no prior followups to compare against).`
    : `- needs_rewrite MUST be true if no_self_referential_why < 4 (any "We/Our/At MobUpps" opener after the greeting is an automatic fail).`;

  return `You are a senior sales operations reviewer at a mobile advertising company. Your job is to read a chat message and identify anything that would make it look non-human, technically broken, off-register for the channel, or vertically incoherent.

You score the message against multiple criteria (each 1-5) and return a JSON object with the scores, an overall score, a list of issues, a list of suggested rewrites, and a needs_rewrite flag.

CHECK FOR THESE CATEGORIES:

1. NO META-LANGUAGE (MOST IMPORTANT). The message must WRITE actual content the prospect can read, NOT describe what the message is doing. Watch for stacked "-ing" verbs that describe message tactics ("citing competitor growth", "referencing benchmarks", "noting urgency", "claiming the ability to drive..."), or verbs like "Pitched X", "Offered Y", "as social proof", "as a benchmark". If the message contains ANY of these patterns, no_meta_language MUST be 1 and needs_rewrite MUST be true.

2. CHANNEL REGISTER MATCH. Score against the channel-specific register rules below.

3. LANGUAGE MATCH. Is the entire message written in the language identified by the language tag? If not, score 1 and demand rewrite.

4. LANGUAGE NATURALNESS (non-English only). Does it read like a native speaker wrote it, or like an English draft with key terms left untranslated? Apply the per-language code-switching guide provided.

5. MACHINE ARTIFACTS. No underscore tokens (snake_case is leaked system keys). No template placeholders ({event}, [volume], NOT AVAILABLE). No raw config keys.

6. TERM LEAKAGE / VERTICAL INCOHERENCE. Subscription language in non-subscription verticals. Gaming language in non-gaming. Wrong-vertical metrics (D7 ROAS in fintech, ARPDAU in e-commerce, etc.).

7. FORMATTING LEAKS. Markdown markers (** __), bullet lists, headers, em dashes (—), spelled-out percentages ("12 percent" instead of "12%").

8. NO BRACKETED EDITORIAL NOTES. No "[Verify X before sending]" / "[Check Y]" / "[Cần xác minh...]" — these are rewriter artifacts that must never appear in the output.

9. NO META-COMMENTARY. The message is the message. Phrases like "this email cannot be salvaged" or "no patched version should be sent" are signs of a broken rewrite — they mean the LLM gave up and explained why instead of fixing the message.

${mode === "followuper" ? `10. CONTEXT GROUNDING (followuper-only, critical). Every claim must trace to something in the prior conversation. New numbers, new competitor names, new facts that weren't in the prior thread = fabrication. Score context_grounding 1-2 and demand rewrite.

11. FOLLOWUP ACKNOWLEDGMENT. Within sentence 1, does the message explicitly reference the prior thread by a SPECIFIC topic name? Vague "following up" is not enough; specific "following up on the Lazada CPS angle" is what we want.

12. ANGLE FRESHNESS / STAGE ROTATION (followuper-only, evaluated when STAGE is 2 or higher). The current followup must bring a fresh angle relative to prior followups in the same thread. Stage strategy rotation: stage 1 = new insight or data point, stage 2 = competitor or market move (shift angle), stage 3 = direct and easy out, stage 4+ = continue rotating fresh angles. Compare the current draft's main value point, hook, and competitor reference against the PREVIOUS FOLLOWUPS BY STAGE block in the user prompt. If the draft repeats a prior stage's angle, hook, value-point construction, or competitor reference, score angle_freshness 1-2 and demand rewrite. Stage 1 has no prior followups so angle_freshness defaults to 5.` : `10. NO SELF-REFERENTIAL WHY. The first content sentence after the greeting must NOT start with "We ...", "Our ...", "At MobUpps ...", or "I'm reaching out". Any such opener is an automatic fail.

11. COUNTRY-MATCHED REFERENCES. All peers, metrics, and market context match the prospect's country. No US default for non-US prospects.

12. VERTICAL-NATIVE TERMINOLOGY. Vocabulary matches the prospect's exact sub-vertical. No generic "we optimize campaigns" — specific revenue-event language.`}

CLAIM GROUNDING (CRITICAL, applies to both modes, evaluated AFTER all the above).
   Every concrete number, percentage, volume figure, and competitor name in the draft MUST appear in the RESEARCH BRIEF supplied in the user message. Hallucinations to flag:
   - Percentages not in the brief (e.g. "14% first-order completion" when no 14% appears in any brief field).
   - Volume claims that do not match the brief's calibrated daily volume.
   - Competitor names outside the brief's final_competitors list.
   - Specific industry benchmarks the brief does not supply.
   - Bounded ranges ("above 12%", "under 200 daily") whose numbers are not in the brief.
   If the draft is in followuper mode and the brief is partial, claims may also ground in the prior conversation; numbers that appear in NEITHER brief NOR conversation are hallucinations.
   If claim_grounding < 4, needs_rewrite MUST be true. This is a critical-tier check.

${channelCriticBlock}

OUTPUT FORMAT — return ONLY a JSON object:
{
  "scores": { "no_meta_language": 1-5, "claim_grounding": 1-5, "language_match": 1-5, "language_naturalness": 1-5, ${modeSpecificScores} "no_machine_artifacts": 1-5, "no_meta_commentary": 1-5, "no_bracketed_notes": 1-5, "tone": 1-5, "conciseness": 1-5 },
  "overall": 1-5,
  "issues": [
    {
      "excerpt": "exact problematic text from the message (or short description if not literal)",
      "reason": "what is wrong with this text",
      "category": "machine_artifact | term_leakage | event_mismatch | unnatural_phrasing | translation_artifact | vertical_incoherence | formatting_leak | why_structure_violation",
      "severity": "block | warn",
      "suggested_fix": "optional replacement text"
    }
  ],
  "suggestions": ["list of specific concrete rewrites for issues that need them"],
  "needs_rewrite": true/false
}

ISSUE CATEGORY DEFINITIONS:
- machine_artifact: underscore tokens (word_word), placeholders ([volume], [metric], {event}), raw config keys, meta-language verbs (citing, referencing, mentioning, noting, highlighting), bracketed editorial notes, hallucinated stats not traceable to the research brief
- term_leakage: wrong vertical jargon (subscription terms in non-subscription verticals, gaming terms in non-gaming, fintech terms in commerce)
- event_mismatch: wrong primary conversion event for the prospect's business model (e.g. "first deposit" used for an e-commerce app)
- unnatural_phrasing: LLM-isms (delve, leverage, seamless, synergy), robotic compound structure, hollow corporate phrasing
- translation_artifact: script-mixing in non-Latin languages (e.g. Latin word adjacent to CJK characters), English-derived word order in target language, inconsistent code-switching, translated-manifesto tone
- vertical_incoherence: mechanics described do not match the vertical, wrong competitor references for the market
- formatting_leak: markdown markers (** __), em dashes, bullets, spelled-out percentages (12 percent instead of 12%)
- why_structure_violation: prospector mode opens with self-referential We/Our/At MobUpps/I'm reaching out; followuper mode missing acknowledgment of the prior thread topic

ISSUE SEVERITY:
- "block": must be fixed before shipping. A single block-severity issue forces needs_rewrite=true.
- "warn": should be fixed but does not by itself block shipping.

If ANY issue has severity="block", needs_rewrite MUST be true.

RULES FOR needs_rewrite:
- needs_rewrite MUST be true if overall < 4.
- needs_rewrite MUST be true if no_meta_language < 4.
- needs_rewrite MUST be true if claim_grounding < 4.
- needs_rewrite MUST be true if language_match < 4.
- needs_rewrite MUST be true if language_naturalness < 4.
- needs_rewrite MUST be true if channel_register_match < 4.
- needs_rewrite MUST be true if no_machine_artifacts < 4.
- needs_rewrite MUST be true if no_meta_commentary < 4.
- needs_rewrite MUST be true if no_bracketed_notes < 4.
${additionalRule}

Do not include any other text, markdown, or explanation.`;
}

// ─────────────────────────────────────────────────────────────────
// CRITIC — user prompt
// ─────────────────────────────────────────────────────────────────

export function getCriticUserPrompt(
  ctx: MessageContext,
  draft: { subject: string; message: string },
): string {
  const flatConversation = flattenConversation(ctx.conversation);
  const conversationBlock = flatConversation
    ? `\nPRIOR CONVERSATION (the message must be grounded in this):\n---BEGIN CONVERSATION---\n${flatConversation}\n---END CONVERSATION---\n`
    : "";

  const nativenessCriticBlock = buildCriticNativenessBlock(ctx.language);

  // B-followup-stage-rotation: surface prior followups by stage so the
  // critic can score angle_freshness without having to reverse-engineer
  // stage boundaries from the flattened conversation (which mixes
  // outbound + inbound and is not stage-labeled).
  const previousFollowupsBlock = (ctx.mode === "followuper" && ctx.previous_followups && ctx.previous_followups.length > 0)
    ? `\nPREVIOUS FOLLOWUPS BY STAGE (the current draft must bring a fresh angle vs these):\n---BEGIN PREVIOUS FOLLOWUPS---\n${ctx.previous_followups.map((pf) => `--- Stage ${pf.stage} ---\n${pf.body}`).join("\n\n")}\n---END PREVIOUS FOLLOWUPS---\n`
    : "";

  // B-claim-grounding: pass research brief into critic so it can
  // verify numeric claims and competitor names trace to brief contents
  // instead of guessing or trusting the writer.
  const briefBlock = ctx.research_brief
    ? `\nRESEARCH BRIEF (numeric claims and competitor names in the draft MUST trace to this):
- Calibrated daily volume: ${ctx.research_brief.calibratedDailyVolume}
- Primary conversion event: ${ctx.research_brief.primaryEvent}
- Peer brands the writer may name: ${ctx.research_brief.finalCompetitors.join(", ")}
- WHY argument seed: ${ctx.research_brief.whyArgument}
- VALIDATION argument seed: ${ctx.research_brief.validationArgument}
- HOW argument seed: ${ctx.research_brief.howArgument}
- Proof points pool: ${ctx.research_brief.tangibleReasons.join(" | ")}
- Market context: ${ctx.research_brief.marketContext}
- Prospect-specific hook: ${ctx.research_brief.prospectSpecificHook}
`
    : "";

  const verticalLine = ctx.sub_vertical
    ? `${ctx.vertical} / ${ctx.sub_vertical}`
    : ctx.vertical;

  return `Evaluate this ${ctx.channel} ${ctx.mode} message:

LANGUAGE: ${ctx.language} (the message must be entirely in this language)
PROSPECT: ${ctx.prospect_name || "(no name)"} at ${ctx.company || "(no company)"}
COUNTRY: ${ctx.country || "not specified"}
VERTICAL: ${verticalLine}
PRODUCT: ${ctx.product}
${ctx.mode === "followuper" ? `STAGE: ${ctx.stage ?? 1} (${ctx.days_since_first ?? 0} days since first contact)` : ""}
${conversationBlock}
${briefBlock}
${previousFollowupsBlock}
${nativenessCriticBlock ? `\n${nativenessCriticBlock}\n` : ""}
DRAFT TO EVALUATE:
Subject (internal tag): ${draft.subject}
Message:
${draft.message}

Evaluate now.`;
}

// ─────────────────────────────────────────────────────────────────
// REWRITER — system prompt (mode-aware)
// ─────────────────────────────────────────────────────────────────

export function getRewriterSystemPrompt(mode: GenerationMode, channel: ChannelCode): string {
  const channelRules = buildWriterRegisterBlock(channel, mode);

  return `You are an expert chat-message rewriter. You receive a draft message, critic feedback, and full context. Your job is to rewrite the message incorporating the critic's feedback.

RULES:
- Fix EVERY issue identified by the critic.
- LANGUAGE MATCHING: rewrite in the same language as the original target. If the critic flagged a language mismatch, rewrite the ENTIRE message in the correct language.
- Maintain the same intent and value point.
- Keep the message within the channel/mode length limits below.
- NEVER output meta-commentary, reasoning, or editorial notes. No sentences like "this message cannot be salvaged" or "the issues are too severe to patch". Your output IS the message body.
- NEVER insert bracketed notes or verification instructions ("[Verify X before sending]", "[Check Y]"). These leak into the final output.
- Plain text only. No markdown, no bullets, no headers.
- No em dashes. No snake_case. Always "%" symbol for percentages. No "X, not Y" constructions.
${channelRules}

OUTPUT FORMAT:
Return ONLY a JSON object:
{
  "subject": "short topic tag, 3-5 words, internal use only",
  "message": "the rewritten message body"
}

Do not include any other text, markdown, or explanation.`;
}

// ─────────────────────────────────────────────────────────────────
// REWRITER — user prompt
// ─────────────────────────────────────────────────────────────────

export function getRewriterUserPrompt(
  ctx: MessageContext,
  draft: { subject: string; message: string },
  critique: { issues: CriticIssue[]; suggestions: string[] },
): string {
  const flatConversation = flattenConversation(ctx.conversation);
  const conversationBlock = flatConversation
    ? `\nPRIOR CONVERSATION (the rewrite must be grounded in this):\n---BEGIN CONVERSATION---\n${flatConversation}\n---END CONVERSATION---\n`
    : "";

  const nativenessBlock = buildNativenessBlock(ctx.language);
  const hasName = isUsableName(ctx.prospect_name);
  const greetingBlock = ctx.mode === "prospector" ? buildGreetingBlock(ctx.language, hasName) : "";

  // B-claim-grounding: pass research brief into rewriter so the rewrite
  // does not drift into new hallucinations while fixing other issues.
  const briefBlock = ctx.research_brief
    ? `\nRESEARCH BRIEF (the rewrite MUST keep every numeric claim and competitor name grounded in this):
- Calibrated daily volume: ${ctx.research_brief.calibratedDailyVolume}
- Primary conversion event: ${ctx.research_brief.primaryEvent}
- Peer brands you may name: ${ctx.research_brief.finalCompetitors.join(", ")}
- WHY argument seed: ${ctx.research_brief.whyArgument}
- VALIDATION argument seed: ${ctx.research_brief.validationArgument}
- HOW argument seed: ${ctx.research_brief.howArgument}
- Proof points pool: ${ctx.research_brief.tangibleReasons.join(" | ")}
- Market context: ${ctx.research_brief.marketContext}
- Prospect-specific hook: ${ctx.research_brief.prospectSpecificHook}
`
    : "";

  const verticalLine = ctx.sub_vertical
    ? `${ctx.vertical} / ${ctx.sub_vertical}`
    : ctx.vertical;

  return `Rewrite this ${ctx.channel} ${ctx.mode} message based on critic feedback:

LANGUAGE: ${ctx.language} (rewrite the ENTIRE message in this language)
PROSPECT: ${ctx.prospect_name || "(no name)"} at ${ctx.company || "(no company)"}
COUNTRY: ${ctx.country || "not specified"}
VERTICAL: ${verticalLine}
PRODUCT: ${ctx.product}
${ctx.mode === "followuper" ? `STAGE: ${ctx.stage ?? 1} (${ctx.days_since_first ?? 0} days since first contact)` : ""}
${conversationBlock}
${briefBlock}
${greetingBlock ? `\n${greetingBlock}\n` : ""}
${nativenessBlock ? `\n${nativenessBlock}\n` : ""}
CURRENT DRAFT:
Subject: ${draft.subject}
Message:
${draft.message}

CRITIC ISSUES:
${critique.issues.length === 0
    ? "(no critic issues recorded)"
    : critique.issues.map((i, idx) =>
        `${idx + 1}. [${i.severity.toUpperCase()}] ${i.category}\n` +
        `   Problem: "${i.excerpt}"\n` +
        `   Reason: ${i.reason}` +
        (i.suggested_fix ? `\n   Suggested: "${i.suggested_fix}"` : "")
      ).join("\n\n")
}

CRITIC SUGGESTIONS:
${critique.suggestions.map((s) => `- ${s}`).join("\n")}

SENDER NAME (do NOT sign off with this): ${ctx.sender_name}

Rewrite now.`;
}
