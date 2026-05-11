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
