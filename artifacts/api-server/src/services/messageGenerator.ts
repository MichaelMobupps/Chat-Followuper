/**
 * Chat message generator — three-stage doctrine pipeline.
 *
 * Pipeline:
 *   1. DRAFT     (Sonnet 4.6)  — initial message from prompts + context
 *   2. CRITIC    (Opus 4.7)    — scores draft against criteria, demands rewrite if low
 *   3. REWRITE   (Sonnet 4.6)  — fixes flagged issues, loop max 3 times
 *
 * Two modes share this pipeline:
 *   - "prospector" — first cold message, full doctrine compressed for chat
 *   - "followuper" — subsequent messages in thread, requires conversation context
 *
 * Hard rule: followuper mode REQUIRES non-empty conversation context.
 * If the caller passes mode="followuper" with no conversation, this function
 * throws MissingContextError. There is NO template fallback. Failure surfaces
 * to the SDR rather than producing a fabricated message.
 *
 * Architecture is adapted from:
 *   - Email Followuper's followupGenerator.ts (3-stage healing loop, JSON
 *     parsing, meta-language detection, humanizer)
 *   - Email Prospector's s5_write.py (deterministic fixes, snake_case
 *     dictionary, percent-symbol regex, meta-commentary sanitizer,
 *     bracketed-note stripper)
 */

import { anthropic } from "../lib/anthropic";
import { withAnthropicRetry } from "./anthropicRetry";
import {
  getProspectorSystemPrompt,
  getProspectorUserPrompt,
  getFollowuperSystemPrompt,
  getFollowuperUserPrompt,
  getCriticSystemPrompt,
  getCriticUserPrompt,
  getRewriterSystemPrompt,
  getRewriterUserPrompt,
  type MessageContext,
  type ConversationRow,
  type PreviousFollowup,
} from "./messagePrompts";
import { summaryLooksMeta, resanitizeStoredSummary } from "./messageSummarizer";
import { logger } from "../lib/logger";
import { computeCost, sumCosts, type CostBreakdown } from "../lib/pricing";
import type { ChannelCode, GenerationMode } from "../lib/channelRegister";
import { applyFirewall } from "../lib/doctrine/firewall";
import { resolveLocale } from "../lib/localeResolver";
import type { ProspectBrief } from "./prospectResearch";

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

export class MissingContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingContextError";
  }
}

export interface GeneratedMessage {
  subject: string; // internal topic tag (3-5 words)
  message: string; // the actual message body to send
  modelMetadata: {
    draftModel: string;
    criticModel: string;
    rewriterModel: string;
    iterations: number; // number of healing iterations consumed
    finalOverallScore: number;
  };
  costEstimate: CostBreakdown; // total cost across all LLM calls
}

export interface GenerateChatMessageOptions {
  /** Required prospect + sender + channel context. */
  prospect: ProspectInput;
  /** Channel: whatsapp / telegram / teams / slack. */
  channel: ChannelCode;
  /** Stage: 0 = first message (prospector), 1+ = follow-up. */
  stage: number;
  /** Sender's first name (used internally; chat shows sender automatically). */
  senderName: string;
  /**
   * Mode override. Normally auto-derived from stage:
   *   - stage === 0 → "prospector"
   *   - stage >= 1  → "followuper"
   * Pass explicit mode only for testing or special cases.
   */
  mode?: GenerationMode;
  /** Prior conversation. REQUIRED for followuper mode (throws if empty). */
  conversation?: ConversationRow[];
  /** Days since first contact (used in followuper user prompt). */
  daysSinceFirst?: number;
  /** Topic summary from messageSummarizer (sanitized; safe to pass through). */
  priorSummary?: string;
  /** Earlier follow-ups in the thread (for stage rotation / no-repeat). */
  previousFollowups?: PreviousFollowup[];
  researchBrief?: ProspectBrief;
}

export interface ProspectInput {
  prospectName: string;     // first or full name; may be empty
  company: string;          // company name; may be empty
  vertical: string;         // top-level vertical
  subVertical: string | null;
  product: string;          // what we're offering
  country: string;
  language: string;         // ISO 639-1
  contextNotes?: string;    // SDR's free-text notes from Apollo / research
}

// ─────────────────────────────────────────────────────────────────
// Models
// ─────────────────────────────────────────────────────────────────

const DRAFT_MODEL = "claude-opus-4-7";
const CRITIC_MODEL = "claude-opus-4-7";
const REWRITER_MODEL = "claude-sonnet-4-6";

// ─────────────────────────────────────────────────────────────────
// Sanitizer 1: humanizer — strips AI tells from text
// ─────────────────────────────────────────────────────────────────
//
// Ported from email Followuper's followupGenerator.ts. Removes em dashes,
// smart quotes, common AI phrases, and AI-favorite verbs.

function humanizeText(text: string): string {
  let result = text;
  result = result.replace(/\s*—\s*/g, " - ");
  result = result.replace(/\s*–\s*/g, " - ");
  result = result.replace(/[""\u201C\u201D]/g, '"');
  result = result.replace(/[''‛\u2018\u2019]/g, "'");
  result = result.replace(/…/g, "...");
  result = result.replace(/\u00A0/g, " ");
  result = result.replace(/\u200B/g, "");
  const aiPhrases = [
    /\bI'd love to\b/gi,
    /\bI wanted to reach out\b/gi,
    /\bI hope this (?:message |email )?finds you well\b/gi,
    /\bI hope you're doing well\b/gi,
    /\bI trust this (?:message |email )?finds you well\b/gi,
    /\bdelve(?:s|d)?\b/gi,
    /\bleverage(?:s|d)?\b/gi,
    /\bin today's (?:rapidly )?(?:evolving|changing) (?:landscape|world)\b/gi,
    /\bIt's worth noting that\b/gi,
    /\bIt bears mentioning that\b/gi,
    /\bNavigate the (?:complexities|landscape)\b/gi,
    /\bseamless(?:ly)?\b/gi,
    /\bsynerg(?:y|ies|ize)\b/gi,
    /\bholistic(?:ally)?\b/gi,
    /\bgame[\s-]?changer\b/gi,
    /\bunlock(?:ing)? (?:the )?(?:full )?potential\b/gi,
  ];
  for (const pattern of aiPhrases) {
    result = result.replace(pattern, (match) => {
      const replacements: Record<string, string> = {
        "delve": "dig",
        "delves": "digs",
        "delved": "dug",
        "leverage": "use",
        "leverages": "uses",
        "leveraged": "used",
        "seamlessly": "smoothly",
        "seamless": "smooth",
        "holistically": "broadly",
        "holistic": "broad",
      };
      const lower = match.toLowerCase();
      if (replacements[lower]) return replacements[lower];
      return "";
    });
  }
  result = result.replace(/ {2,}/g, " ");
  result = result.replace(/^\s+/gm, (m) => m);
  result = result.trim();
  return result;
}

function humanizeMessage(msg: { subject: string; message: string }): { subject: string; message: string } {
  return {
    subject: humanizeText(msg.subject),
    message: humanizeText(msg.message),
  };
}

// ─────────────────────────────────────────────────────────────────
// Sanitizer 2: deterministic fixes (snake_case, percent symbol, em dashes,
// bold markdown, placeholder leaks)
// ─────────────────────────────────────────────────────────────────
//
// Ported from email Prospector's s5_write.py applyDeterministicFixes().

const SNAKE_CASE_FIXES: Record<string, string> = {
  "funded_account": "funded account",
  "paid_subscription": "paid subscription",
  "first_deposit": "first deposit",
  "completed_order": "completed order",
  "completed_booking": "completed booking",
  "payer_conversion": "payer conversion",
  "approved_loan_or_issued_advance": "approved loan",
  "completed_policy_purchase": "completed policy purchase",
  "paid_plan_activation": "paid plan activation",
  "purchase_event": "purchase",
  "primary_event": "primary event",
  "retained_d7_user": "D7 retained user",
  "FTD_or_qualified_deposit": "first deposit",
  "non_gaming_mobile": "non-gaming mobile",
  "semi_exclusive": "semi-exclusive",
  "deep_link": "deep link",
  "user_acquisition": "user acquisition",
  "media_buying": "media buying",
};

const SNAKE_CASE_PATTERN = /\b[a-z]+(?:_[a-z]+){1,}\b/g;
const BOLD_PATTERNS = [/\*\*/g, /__/g];
const PLACEHOLDER_PATTERNS = [
  /\[volume\]/gi,
  /\[metric\]/gi,
  /\[event\]/gi,
  /\{[a-z_]+\}/g,
  /\bNOT AVAILABLE\b/g,
  /\bundefined\b/g,
  /\bnull\b/g,
];

function applyDeterministicFixes(text: string): string {
  let s = text;

  // Fix known snake_case tokens first (preserves intentional capitalization).
  for (const [snake, human] of Object.entries(SNAKE_CASE_FIXES)) {
    s = s.replace(new RegExp(snake, "g"), human);
  }

  // Catch any remaining snake_case tokens generically.
  s = s.replace(SNAKE_CASE_PATTERN, (match) => {
    if (SNAKE_CASE_FIXES[match]) return SNAKE_CASE_FIXES[match];
    return match.replace(/_/g, " ");
  });

  // Spelled-out "percent" → "%" across 10+ languages.
  s = s.replace(
    /(\d+)\s*(?:percento|Percento|percent|Percent|PERCENT|prozent|Prozent|PROZENT|процент(?:ов|а)?|Процент(?:ов|а)?|por\s*ciento|Por\s*ciento|pour\s*cent|Pour\s*cent|procent|Procent|persen|Persen|เปอร์เซ็นต์|パーセント|퍼센트|phần\s*trăm)\b/g,
    "$1%",
  );

  // Em dashes → comma.
  s = s.replace(/\s*—\s*/g, ", ");
  // En dashes → hyphen.
  s = s.replace(/–/g, "-");

  // Remove bold markdown markers.
  for (const pattern of BOLD_PATTERNS) {
    s = s.replace(pattern, "");
  }

  // Remove placeholder tokens.
  for (const pattern of PLACEHOLDER_PATTERNS) {
    s = s.replace(pattern, "");
  }

  // Clean up whitespace.
  s = s.replace(/  +/g, " ");
  s = s.replace(/ +\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}

// ─────────────────────────────────────────────────────────────────
// Sanitizer 3: meta-commentary detection
// ─────────────────────────────────────────────────────────────────
//
// Ported from Prospector s5_write.py. Catches the case where the rewriter
// returns "this email cannot be salvaged" or similar instead of a fixed
// message. If detected, we keep the previous draft instead of using the
// rewriter's refusal.

const META_COMMENTARY_SIGNALS = [
  "cannot be salvaged",
  "should not be sent",
  "no patched version",
  "no coherent message remaining",
  "no coherent email remaining",
  "re-research the prospect",
  "completely re-research",
  "rewrite the message for",
  "rewrite the entire message",
  "rewrite the email for",
  "rewrite the entire email",
  "the entire premise is invalid",
  "the entire email premise is invalid",
  "every substantive paragraph contains",
  "fundamental misidentification",
  "applying the required fixes would mean rewriting",
];

function detectMetaCommentary(text: string): boolean {
  const probe = text.slice(0, 500).toLowerCase();
  return META_COMMENTARY_SIGNALS.some((signal) => probe.includes(signal));
}

// ─────────────────────────────────────────────────────────────────
// Sanitizer 4: bracketed editorial note stripper
// ─────────────────────────────────────────────────────────────────
//
// Ported from Prospector s5_write.py. Catches paragraphs that are entirely
// a bracketed editorial note like "[Verify X before sending]". Only strips
// notes that are >10 chars to avoid removing legitimate brackets like [CPI].

const BRACKETED_NOTE_RE = /^\[([^\[\]]{10,})\]\s*$/gm;

function stripBracketedNotes(text: string): string {
  let s = text.replace(BRACKETED_NOTE_RE, "");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

// ─────────────────────────────────────────────────────────────────
// Sanitizer 5: meta-language detection (returns issue list)
// ─────────────────────────────────────────────────────────────────
//
// Ported from email Followuper's followupGenerator.ts. Different from
// detectMetaCommentary above — that catches "I refuse to fix this"; this
// catches "citing X, referencing Y" style meta verbs inside the message body.

const META_VERBS = [
  "citing", "referencing", "mentioning", "highlighting", "noting",
  "emphasizing", "claiming", "stating", "explaining", "pitched",
  "proposed", "offered", "outlining", "outlined", "describing",
  "described", "presenting", "presented", "indicating", "demonstrating",
  "suggesting", "arguing",
];

function detectMetaLanguage(text: string): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  const lower = text.toLowerCase();

  for (const verb of META_VERBS) {
    const re = new RegExp(`\\b${verb}\\b\\s+(?:the |a |an |our |their |its |competitor|industry|market|case|conversion|growth|benchmarks?|examples?|trends?|metrics?|data|insights?|platforms?|services?|results?|wins?|partnerships?|ability)`, "gi");
    const found = text.match(re);
    if (found) matches.push(...found);
  }

  // "claiming the ability to [verb]" — exact pattern from the Alibaba email.
  const abilityRe = /\b(?:claiming|stating|offering|promising)\s+the\s+ability\s+to\s+\w+/gi;
  const abilityFound = text.match(abilityRe);
  if (abilityFound) matches.push(...abilityFound);

  // "the ability to drive/generate/deliver X" used as a capability claim.
  const bareAbility = /\bthe\s+ability\s+to\s+(?:drive|generate|deliver|provide|produce|achieve|create)\s+[a-z][^,.!?]{0,60}/gi;
  const bareAbilityFound = text.match(bareAbility);
  if (bareAbilityFound) matches.push(...bareAbilityFound);

  const asPatterns = [
    /\bas\s+(?:urgency|social proof|a benchmark|an example|context|reference|justification|proof|validation|a hook|a reason)\b/gi,
    /\b(?:by|via|through)\s+(?:citing|referencing|mentioning|highlighting|noting)\b/gi,
  ];
  for (const re of asPatterns) {
    const found = text.match(re);
    if (found) matches.push(...found);
  }

  const ingClauseChain: string[] = text.match(/,\s*\w+ing\s+[^,.!?]{8,}/g) ?? [];
  const suspicious = ingClauseChain.filter((clause) => {
    const c = clause.toLowerCase();
    return META_VERBS.some((v) => c.includes(v));
  });
  matches.push(...suspicious);

  // Reference-clause containing meta-verbs ("following up on, citing X")
  if (lower.includes("following up on") || lower.includes("follow up on") || lower.includes("circling back")) {
    const refMatch = text.match(/(?:following up on|circling back on)\s+[^.!?\n]{0,300}/i);
    if (refMatch) {
      const reference = refMatch[0].toLowerCase();
      const hasMetaInRef = META_VERBS.some((v) =>
        new RegExp(`\\b${v}\\b`, "i").test(reference)
      );
      const hasAbilityInRef = /\bthe\s+ability\s+to\s+\w+/i.test(reference);
      if (hasMetaInRef || hasAbilityInRef) {
        matches.push(`Reference contains meta-language: "${refMatch[0].slice(0, 100)}..."`);
      }
    }
  }

  return { found: matches.length > 0, matches: Array.from(new Set(matches)).slice(0, 5) };
}

// B-claim-grounding: deterministic post-check for hallucinated stats.
// Extracts percentages, bounded-volume claims, and large-number volume
// tokens from the message and flags any number whose digit string does
// not appear in the research brief (or, for followuper mode, in the
// prior conversation). Mirrors the detectMetaLanguage pattern: the
// healing loop runs this after the LLM critic and prepends any findings
// as critic issues, forcing a rewrite.
function detectUngroundedClaims(
  text: string,
  brief?: ProspectBrief,
  conversationText?: string,
): { found: boolean; matches: string[] } {
  // Build the universe of grounded numeric tokens. If both brief and
  // conversation are absent, ground-truth is empty and we cannot judge,
  // so we return no flags rather than flagging everything.
  const groundParts: string[] = [];
  if (brief) {
    if (brief.calibratedDailyVolume) groundParts.push(brief.calibratedDailyVolume);
    if (brief.primaryEvent) groundParts.push(brief.primaryEvent);
    if (brief.whyArgument) groundParts.push(brief.whyArgument);
    if (brief.validationArgument) groundParts.push(brief.validationArgument);
    if (brief.howArgument) groundParts.push(brief.howArgument);
    if (Array.isArray(brief.tangibleReasons)) groundParts.push(...brief.tangibleReasons);
    if (brief.marketContext) groundParts.push(brief.marketContext);
    if (brief.prospectSpecificHook) groundParts.push(brief.prospectSpecificHook);
  }
  if (conversationText) groundParts.push(conversationText);

  const groundText = groundParts.join(" ");
  if (!groundText.trim()) return { found: false, matches: [] };

  const matches: string[] = [];

  // 1. Percentages: "12%", "12.5%", "0.7%". Most common hallucination
  // surface ("14% first-order completion" with no 14% in brief).
  const percentRe = /\d+(?:\.\d+)?%/g;
  for (const m of text.match(percentRe) ?? []) {
    if (!groundText.includes(m)) matches.push(`Percentage \`${m}\` not in brief or conversation`);
  }

  // 2. Large-number volume tokens: "400+", "5000 daily", "1200 installs".
  // We restrict to >=3 digits to avoid false positives on day numbers
  // ("Day 7"), stage numbers ("Stage 1"), and conventional figures.
  const largeNumRe = /\b\d{3,}(?:\+|k|K|M)?\b/g;
  const seenLargeNum = new Set();
  for (const m of text.match(largeNumRe) ?? []) {
    if (seenLargeNum.has(m)) continue;
    seenLargeNum.add(m);
    // Strip trailing modifiers for substring check (so "400" matches
    // brief saying "400 daily").
    const bareNum = m.replace(/[+kKM]+$/, "");
    if (!groundText.includes(bareNum)) {
      matches.push(`Large number \`${m}\` not in brief or conversation`);
    }
  }

  // 3. Bounded claims: "above 12%", "under 200 daily", "more than 14%".
  // These are claim-shapes that imply specific numeric grounding. Even
  // if the bare number is in the brief, the BOUND ("above") may be a
  // hallucination, but for now we just check the number matches.
  const boundedRe = /(?:above|over|under|below|less than|more than|around|approximately|roughly)\s+\d+(?:\.\d+)?(?:%|\+)?/gi;
  for (const m of text.match(boundedRe) ?? []) {
    const numMatch = m.match(/\d+(?:\.\d+)?/);
    if (numMatch && !groundText.includes(numMatch[0])) {
      matches.push(`Bounded claim \`${m}\` with number not in brief or conversation`);
    }
  }

  // Dedupe and cap.
  const unique = Array.from(new Set(matches));
  return { found: unique.length > 0, matches: unique.slice(0, 5) };
}

// ─────────────────────────────────────────────────────────────────
// Sanitizer 7: subject-line strip
// ─────────────────────────────────────────────────────────────────
//
// Ported from email Prospector's strip_subject_from_body. The writer
// returns JSON with separate subject and message fields, but it
// occasionally re-injects "Subject: ..." or "Re: ..." into the body.
// Same with rewriter output. We strip these so the body is body-only.

function stripSubjectFromBody(body: string): string {
  let text = body.replace(/^\s+/, "");

  // Pattern 1: "Subject: ..." line at the start (case-insensitive).
  const subjectMatch = text.match(/^Subject\s*:\s*[^\n]+\s*\n+/i);
  if (subjectMatch) text = text.slice(subjectMatch[0].length).replace(/^\s+/, "");

  // Pattern 2: "Re: ..." line at the start (followup leakage).
  const reMatch = text.match(/^Re\s*:\s*[^\n]+\s*\n+/i);
  if (reMatch) text = text.slice(reMatch[0].length).replace(/^\s+/, "");

  return text;
}

// ─────────────────────────────────────────────────────────────────
// Sanitizer 8: hard lint (telemetry only, does not gate output)
// ─────────────────────────────────────────────────────────────────
//
// Ported from email Prospector's s7_lint.LintStage.run_lint, adapted
// for chat context (no subject/CTA structure, shorter expected length).
// Runs after all other sanitizers as a safety net; every violation it
// surfaces is by definition something an earlier sanitizer should have
// caught. Logs as warning so we can debug sanitizer regressions in
// production without changing what ships.

interface ChatLintViolation {
  rule: string;
  message: string;
  severity: "error" | "warning";
}

interface ChatLintResult {
  score: number;
  violations: ChatLintViolation[];
}

const SUBJECT_LEAK_RE = /^(?:Subject|Re)\s*:/im;
const SNAKE_TOKEN_RE = /\b[a-z]+(?:_[a-z]+){1,}\b/g;
const PLACEHOLDER_LEAK_RE = /\[(?:volume|metric|event)\]|\{[a-z_]+\}|\bNOT AVAILABLE\b|\bundefined\b/gi;
const PERCENT_WORD_RE = /\d+\s*(?:percento|percent|prozent|процент(?:ов|а)?|por\s*ciento|pour\s*cent|procent|persen|เปอร์เซ็นต์|パーセント|퍼센트|phần\s*trăm)\b/gi;

function runChatLint(message: string): ChatLintResult {
  const violations: ChatLintViolation[] = [];
  let score = 100;

  // Em dash leak (Sanitizer 1+2 should have caught this).
  if (message.includes("\u2014")) {
    violations.push({
      rule: "em_dash_present",
      message: "em dash survived sanitizers",
      severity: "error",
    });
    score -= 10;
  }

  // Bold markdown (Sanitizer 2 should have caught this).
  if (/\*\*|__/.test(message)) {
    violations.push({
      rule: "bold_markdown",
      message: "bold markdown (** or __) survived sanitizers",
      severity: "error",
    });
    score -= 10;
  }

  // Snake_case tokens (Sanitizer 2 should have caught this).
  const snakeMatches = message.match(SNAKE_TOKEN_RE);
  if (snakeMatches && snakeMatches.length > 0) {
    violations.push({
      rule: "snake_case_tokens",
      message: `snake_case tokens survived: ${snakeMatches.slice(0, 5).join(", ")}`,
      severity: "error",
    });
    score -= 15;
  }

  // Unresolved placeholders.
  const placeholderMatches = message.match(PLACEHOLDER_LEAK_RE);
  if (placeholderMatches && placeholderMatches.length > 0) {
    violations.push({
      rule: "unresolved_placeholders",
      message: `unresolved placeholders survived: ${placeholderMatches.slice(0, 5).join(", ")}`,
      severity: "error",
    });
    score -= 20;
  }

  // Spelled-out percent across 14 languages (Sanitizer 2 should have caught this).
  const percentMatches = message.match(PERCENT_WORD_RE);
  if (percentMatches && percentMatches.length > 0) {
    violations.push({
      rule: "spelled_out_percent",
      message: `spelled-out percent survived: ${percentMatches.slice(0, 3).join(", ")}`,
      severity: "error",
    });
    score -= 10;
  }

  // Subject/Re leak (Sanitizer 7 should have caught this).
  if (SUBJECT_LEAK_RE.test(message)) {
    violations.push({
      rule: "subject_leak",
      message: "Subject: or Re: line survived in body",
      severity: "error",
    });
    score -= 15;
  }

  // Length checks. Chat messages should be 30-1000 chars.
  const trimmedLen = message.trim().length;
  if (trimmedLen < 30) {
    violations.push({
      rule: "too_short",
      message: `message body only ${trimmedLen} chars (expected at least 30)`,
      severity: "error",
    });
    score -= 25;
  } else if (trimmedLen > 1000) {
    violations.push({
      rule: "too_long",
      message: `message body ${trimmedLen} chars (chat should be under 1000)`,
      severity: "warning",
    });
    score -= 5;
  }

  // Self-referential opener (deterministic complement to critic rule #10).
  // Strip leading greeting if present, then check the first 150 chars of
  // what follows for "we / our / At MobUpps / I'm reaching out / I wanted to".
  const trimmed = message.trim();
  let bodyAfterGreeting = trimmed;
  const firstSep = trimmed.search(/[,\n]/);
  if (firstSep > 0 && firstSep < 50) {
    const greeting = trimmed.slice(0, firstSep).trim();
    if (/^(?:hi|hello|hey|olá|hola|您好|مرحبا|שלום|merhaba|salut|ciao|привет|namaste|hej|halo|chào|cześć|szia|dear)\b/i.test(greeting)) {
      bodyAfterGreeting = trimmed.slice(firstSep + 1).trim();
    }
  }
  if (/^(?:we\b|our\b|at\s+mobupps|i'?m\s+reaching\s+out|i\s+wanted\s+to)/i.test(bodyAfterGreeting.slice(0, 150))) {
    violations.push({
      rule: "self_referential_opener",
      message: "first content line opens with self-referential we/our/MobUpps/I'm reaching out (rule #10)",
      severity: "warning",
    });
    score -= 10;
  }

  return { score: Math.max(0, score), violations };
}

// ─────────────────────────────────────────────────────────────────
// JSON parser — handles markdown fences, unescaped braces, etc.
// ─────────────────────────────────────────────────────────────────

function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parseJsonResponse(text: string): { subject?: string; message?: string; [k: string]: unknown } {
  let raw = text.replace(/```json\s*|```/g, "").trim();

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    raw = raw.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(raw);
  } catch {
    // Fallback: try to manually extract subject and message via regex.
    const subjectMatch = raw.match(/"subject"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const messageMatch = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"\s*\}$/s);
    if (subjectMatch && messageMatch) {
      return {
        subject: unescapeJsonString(subjectMatch[1]),
        message: unescapeJsonString(messageMatch[1]),
      };
    }
    throw new SyntaxError(`Failed to parse LLM JSON response: ${raw.slice(0, 200)}...`);
  }
}

// ─────────────────────────────────────────────────────────────────
// Cost rollup helper — extracts usage from Anthropic response
// ─────────────────────────────────────────────────────────────────

interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function costFromResponse(model: string, response: AnthropicMessage): CostBreakdown {
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  return computeCost(model, inputTokens, outputTokens);
}

// ─────────────────────────────────────────────────────────────────
// Stage 1: DRAFT
// ─────────────────────────────────────────────────────────────────

async function generateDraft(
  ctx: MessageContext,
  attempt = 1,
): Promise<{ draft: { subject: string; message: string }; cost: CostBreakdown }> {
  const maxAttempts = 2;
  const system = ctx.mode === "prospector"
    ? getProspectorSystemPrompt(ctx)
    : getFollowuperSystemPrompt(ctx);
  const user = ctx.mode === "prospector"
    ? getProspectorUserPrompt(ctx)
    : getFollowuperUserPrompt(ctx);

  const response = await withAnthropicRetry(
    () => anthropic.messages.create({
      model: DRAFT_MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    }),
    { label: "draft" },
  );

  const cost = costFromResponse(DRAFT_MODEL, response as AnthropicMessage);

  const textBlock = (response.content as Array<{ type: string; text?: string }>).find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text" || !textBlock.text) {
    throw new Error("No text block in draft response");
  }

  try {
    const parsed = parseJsonResponse(textBlock.text);
    if (!parsed.subject || !parsed.message) {
      throw new Error("Draft missing subject or message");
    }
    return {
      draft: { subject: String(parsed.subject), message: String(parsed.message) },
      cost,
    };
  } catch (err) {
    logger.warn(
      { attempt, rawPreview: textBlock.text.slice(0, 300) },
      "Draft JSON parse failed",
    );
    if (attempt < maxAttempts) {
      logger.info("Retrying draft generation...");
      const retry = await generateDraft(ctx, attempt + 1);
      return {
        draft: retry.draft,
        cost: sumCosts([cost, retry.cost]),
      };
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────
// Stage 2: CRITIC
// ─────────────────────────────────────────────────────────────────

interface CriticResult {
  scores: Record<string, number>;
  overall: number;
  issues: string[];
  suggestions: string[];
  needs_rewrite: boolean;
}

async function critiqueDraft(
  ctx: MessageContext,
  draft: { subject: string; message: string },
): Promise<{ critique: CriticResult; cost: CostBreakdown }> {
  const response = await withAnthropicRetry(
    () => anthropic.messages.create({
      model: CRITIC_MODEL,
      max_tokens: 2048,
      system: getCriticSystemPrompt(ctx.mode, ctx.channel),
      messages: [{ role: "user", content: getCriticUserPrompt(ctx, draft) }],
    }),
    { label: "critic" },
  );

  const cost = costFromResponse(CRITIC_MODEL, response as AnthropicMessage);

  const textBlock = (response.content as Array<{ type: string; text?: string }>).find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text" || !textBlock.text) {
    throw new Error("No text block in critic response");
  }

  const parsed = parseJsonResponse(textBlock.text) as {
    scores?: Record<string, number>;
    overall?: number;
    issues?: string[];
    suggestions?: string[];
    needs_rewrite?: boolean;
  };
  return {
    critique: {
      scores: parsed.scores || {},
      overall: parsed.overall ?? 5,
      issues: parsed.issues || [],
      suggestions: parsed.suggestions || [],
      needs_rewrite: parsed.needs_rewrite ?? false,
    },
    cost,
  };
}

// ─────────────────────────────────────────────────────────────────
// Stage 3: REWRITER
// ─────────────────────────────────────────────────────────────────

async function rewriteDraft(
  ctx: MessageContext,
  draft: { subject: string; message: string },
  critique: CriticResult,
): Promise<{ rewrite: { subject: string; message: string }; cost: CostBreakdown }> {
  const response = await withAnthropicRetry(
    () => anthropic.messages.create({
      model: REWRITER_MODEL,
      max_tokens: 2048,
      system: getRewriterSystemPrompt(ctx.mode, ctx.channel),
      messages: [{
        role: "user",
        content: getRewriterUserPrompt(ctx, draft, {
          issues: critique.issues,
          suggestions: critique.suggestions,
        }),
      }],
    }),
    { label: "rewriter" },
  );

  const cost = costFromResponse(REWRITER_MODEL, response as AnthropicMessage);

  const textBlock = (response.content as Array<{ type: string; text?: string }>).find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text" || !textBlock.text) {
    throw new Error("No text block in rewriter response");
  }

  // Detect meta-commentary BEFORE parsing JSON. If the rewriter returned
  // "this message cannot be salvaged" instead of fixed JSON, keep the prior
  // draft rather than failing.
  if (detectMetaCommentary(textBlock.text)) {
    logger.warn({ rawPreview: textBlock.text.slice(0, 200) }, "Rewriter returned meta-commentary; keeping prior draft");
    return { rewrite: draft, cost };
  }

  const parsed = parseJsonResponse(textBlock.text);
  if (!parsed.subject || !parsed.message) {
    throw new Error("Rewrite missing subject or message");
  }

  return {
    rewrite: { subject: String(parsed.subject), message: String(parsed.message) },
    cost,
  };
}

// ─────────────────────────────────────────────────────────────────
// Final cleanup pipeline (applied to whatever we ship)
// ─────────────────────────────────────────────────────────────────

function finalizeMessage(
  msg: { subject: string; message: string },
  subVertical: string | null,
): { subject: string; message: string } {
  // Subject-strip runs FIRST so any "Subject:" or "Re:" line that
  // leaked into the body is removed before downstream sanitizers
  // see it (they would otherwise treat it as content).
  let message = stripSubjectFromBody(msg.message);
  message = stripBracketedNotes(message);
  message = applyDeterministicFixes(message);

  if (subVertical) {
    try {
      const { cleaned, replacements } = applyFirewall(message, subVertical);
      if (replacements.length > 0) {
        logger.info(
          { subVertical, replacements: replacements.map((r) => `${r.blocked}→${r.replacement} (×${r.occurrences})`) },
          "Firewall replaced cross-vertical terms",
        );
      }
      message = cleaned;
    } catch (err) {
      logger.warn({ err: String(err), subVertical }, "Firewall pass failed; skipping");
    }
  }

  const humanized = humanizeMessage({ subject: msg.subject, message });

  // Telemetry-only lint pass. Every violation is by definition a
  // sanitizer regression (something a prior step should have caught).
  // We log but ship the message anyway since these are post-healing.
  const lint = runChatLint(humanized.message);
  if (lint.violations.length > 0) {
    logger.warn(
      {
        score: lint.score,
        violations: lint.violations,
        preview: humanized.message.slice(0, 200),
      },
      `[chat-lint] message shipped with ${lint.violations.length} surviving violation(s); score=${lint.score}`,
    );
  }

  return humanized;
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC: generateChatMessage
// ─────────────────────────────────────────────────────────────────

export async function generateChatMessage(
  opts: GenerateChatMessageOptions,
): Promise<GeneratedMessage> {
  // ── Auto-derive mode from stage if not explicitly provided ──
  const mode: GenerationMode = opts.mode
    ?? (opts.stage === 0 ? "prospector" : "followuper");

  // ── Validate followuper mode has conversation context ──
  if (mode === "followuper") {
    const conv = opts.conversation ?? [];
    if (conv.length === 0) {
      throw new MissingContextError(
        `generateChatMessage called with mode="followuper" but no conversation. Followups require non-empty prior conversation. Either set mode="prospector" or provide conversation history.`,
      );
    }
  }

  // ── Build MessageContext from options ──
  let ctx: MessageContext = {
    prospect_name: opts.prospect.prospectName || "",
    company: opts.prospect.company || "",
    vertical: opts.prospect.vertical || "",
    sub_vertical: opts.prospect.subVertical ?? null,
    product: opts.prospect.product || "",
    country: opts.prospect.country || "",
    // B-locale-plumbing: resolve to BCP 47 locale (e.g. "pt-BR") when
    // both country and language are present. Falls back to bare language.
    language: resolveLocale(opts.prospect.country, opts.prospect.language) || opts.prospect.language || "en",
    sender_name: opts.senderName,
    channel: opts.channel,
    mode,
    context_notes: opts.prospect.contextNotes,
    stage: opts.stage,
    days_since_first: opts.daysSinceFirst,
    prior_summary: opts.priorSummary,
    conversation: opts.conversation,
    previous_followups: opts.previousFollowups,
    research_brief: opts.researchBrief,
  };

  // ── Self-heal: sanitize stored summary if it contains meta-language ──
  if (ctx.prior_summary && summaryLooksMeta(ctx.prior_summary)) {
    const cleaned = resanitizeStoredSummary(ctx.prior_summary);
    logger.info(
      {
        before: ctx.prior_summary.slice(0, 100),
        after: cleaned.slice(0, 100),
        stillMeta: summaryLooksMeta(cleaned),
      },
      "Self-healed meta-contaminated prior_summary before generation",
    );
    ctx = {
      ...ctx,
      prior_summary: summaryLooksMeta(cleaned) ? "" : cleaned,
    };
  }

  logger.info(
    {
      prospect: ctx.prospect_name,
      company: ctx.company,
      vertical: ctx.vertical,
      sub_vertical: ctx.sub_vertical,
      country: ctx.country,
      language: ctx.language,
      channel: ctx.channel,
      mode: ctx.mode,
      stage: ctx.stage,
      conversationLen: ctx.conversation?.length ?? 0,
    },
    "Stage 1: Generating initial draft (Sonnet 4.6)",
  );

  // ── Stage 1: Draft ──
  // If draft fails after retries, bubble up. No template fallback.
  const { draft: initialDraft, cost: draftCost } = await generateDraft(ctx);
  const allCosts: CostBreakdown[] = [draftCost];

  let current = initialDraft;
  let best = initialDraft;
  let bestOverall = 0;
  let iterationsConsumed = 0;
  const maxHealingIterations = 3;

  for (let iteration = 1; iteration <= maxHealingIterations; iteration++) {
    iterationsConsumed = iteration;

    const metaCheck = detectMetaLanguage(current.message);

    // B-claim-grounding: deterministic post-check for hallucinated stats.
    const conversationFlat = (ctx.conversation ?? [])
      .map((row) => row.body ?? "")
      .join(" ");
    const claimCheck = detectUngroundedClaims(
      current.message,
      ctx.research_brief,
      conversationFlat,
    );

    logger.info(
      {
        prospect: ctx.prospect_name,
        iteration,
        metaFound: metaCheck.found,
        metaMatches: metaCheck.matches,
        claimFound: claimCheck.found,
        claimMatches: claimCheck.matches,
      },
      `Iteration ${iteration}: Critiquing draft (Opus 4.7)`,
    );

    let critique: CriticResult;
    let criticCost: CostBreakdown;
    try {
      const result = await critiqueDraft(ctx, current);
      critique = result.critique;
      criticCost = result.cost;
      allCosts.push(criticCost);
    } catch (err) {
      logger.warn(
        { err: String(err), prospect: ctx.prospect_name, iteration },
        "Critic unavailable after retries — returning best draft seen",
      );
      const finalized = finalizeMessage(best, ctx.sub_vertical);
      return {
        subject: finalized.subject,
        message: finalized.message,
        modelMetadata: {
          draftModel: DRAFT_MODEL,
          criticModel: CRITIC_MODEL,
          rewriterModel: REWRITER_MODEL,
          iterations: iterationsConsumed,
          finalOverallScore: bestOverall,
        },
        costEstimate: sumCosts(allCosts),
      };
    }

    // Inject meta-language detection issues into the critique.
    if (metaCheck.found) {
      const metaIssue = `META-LANGUAGE DETECTED — the message is describing what it does instead of writing literal content. Offending phrases: ${metaCheck.matches.join(" | ")}. Rewrite to use concrete, literal statements (real numbers, real competitor names, real outcomes), not descriptions of message tactics.`;
      critique.issues = [metaIssue, ...critique.issues];
      critique.suggestions = [
        "Replace every -ing meta-verb (citing, referencing, mentioning, highlighting, claiming, pitched) with the actual concrete fact.",
        "If you would write 'citing competitor growth', instead name the competitor and what they did with a specific number.",
        "If you would write 'referencing benchmarks', instead state the actual benchmark figure.",
        ...critique.suggestions,
      ];
      critique.needs_rewrite = true;
      critique.overall = Math.min(critique.overall, 2);
    }

    // B-claim-grounding: inject deterministic claim-grounding findings
    // into the critique. Mirrors the meta-language injection above.
    if (claimCheck.found) {
      const briefVolume = ctx.research_brief?.calibratedDailyVolume ?? "(no brief volume)";
      const briefProofs = ctx.research_brief?.tangibleReasons?.slice(0, 2).join(" | ") ?? "(no brief proofs)";
      const claimIssue = `UNGROUNDED CLAIMS DETECTED: the message contains numbers or claims that do not trace to the research brief or prior conversation. Findings: ${claimCheck.matches.join(" | ")}. Replace with brief-grounded numbers (calibrated_daily_volume: ${briefVolume}) or remove the unsupported claim entirely.`;
      critique.issues = [claimIssue, ...critique.issues];
      critique.suggestions = [
        `Replace ungrounded numbers with the brief's calibrated_daily_volume (${briefVolume}) or with figures pulled directly from the brief's WHY/VALIDATION/HOW arguments.`,
        `Use brief proof points: ${briefProofs}`,
        "If a number is not in the brief and not in the prior conversation, do NOT include it. Cut the claim or replace with a qualitative one.",
        ...critique.suggestions,
      ];
      critique.needs_rewrite = true;
      critique.overall = Math.min(critique.overall, 2);
    }

    // Track the best draft so we always have something to ship.
    if (critique.overall > bestOverall) {
      best = current;
      bestOverall = critique.overall;
    }

    logger.info(
      {
        prospect: ctx.prospect_name,
        iteration,
        overall: critique.overall,
        needsRewrite: critique.needs_rewrite,
        issues: critique.issues.slice(0, 3),
      },
      "Critic evaluation complete",
    );

    if (!critique.needs_rewrite) {
      logger.info(
        { prospect: ctx.prospect_name, iteration },
        "Draft passed all checks",
      );
      const finalized = finalizeMessage(current, ctx.sub_vertical);
      return {
        subject: finalized.subject,
        message: finalized.message,
        modelMetadata: {
          draftModel: DRAFT_MODEL,
          criticModel: CRITIC_MODEL,
          rewriterModel: REWRITER_MODEL,
          iterations: iterationsConsumed,
          finalOverallScore: critique.overall,
        },
        costEstimate: sumCosts(allCosts),
      };
    }

    logger.info(
      { prospect: ctx.prospect_name, iteration },
      `Iteration ${iteration}: Rewriting draft (Sonnet 4.6)`,
    );

    try {
      const { rewrite, cost: rewriteCost } = await rewriteDraft(ctx, current, critique);
      allCosts.push(rewriteCost);
      current = rewrite;
      logger.info({ prospect: ctx.prospect_name, iteration }, "Rewrite complete");
    } catch (err) {
      logger.warn(
        { err: String(err), prospect: ctx.prospect_name, iteration },
        "Rewriter unavailable after retries — returning best draft seen",
      );
      const finalized = finalizeMessage(best, ctx.sub_vertical);
      return {
        subject: finalized.subject,
        message: finalized.message,
        modelMetadata: {
          draftModel: DRAFT_MODEL,
          criticModel: CRITIC_MODEL,
          rewriterModel: REWRITER_MODEL,
          iterations: iterationsConsumed,
          finalOverallScore: bestOverall,
        },
        costEstimate: sumCosts(allCosts),
      };
    }
  }

  // Healing iterations exhausted. Return the highest-scoring draft we saw.
  logger.info(
    { prospect: ctx.prospect_name, bestOverall, iterations: maxHealingIterations },
    "Healing iterations exhausted — returning best draft seen",
  );
  const finalized = finalizeMessage(best, ctx.sub_vertical);
  return {
    subject: finalized.subject,
    message: finalized.message,
    modelMetadata: {
      draftModel: DRAFT_MODEL,
      criticModel: CRITIC_MODEL,
      rewriterModel: REWRITER_MODEL,
      iterations: iterationsConsumed,
      finalOverallScore: bestOverall,
    },
    costEstimate: sumCosts(allCosts),
  };
}
