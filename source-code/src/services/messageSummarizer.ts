/**
 * Summarizes prior chat conversation context (or SDR context notes for
 * first-message generation) into a short topic blurb suitable for
 * follow-up generation.
 *
 * The goal is to capture WHAT was discussed in 5-12 words, so the
 * follow-up writer can reference it cleanly ("following up on the ___")
 * without reproducing the whole conversation.
 *
 * Adapted from the email tool's emailSummarizer.ts. The meta-language
 * sanitizer and language detection logic are unchanged — they apply
 * equally to chat threads. The only adaptation is the prompt wording
 * (chat thread instead of cold outreach email).
 */

import { anthropic } from "../lib/anthropic";
import { withAnthropicRetry } from "./anthropicRetry";
import { logger } from "../lib/logger";
import { computeCost, type CostBreakdown } from "../lib/pricing";

const SUMMARIZE_SYSTEM = `You are a topic extractor. Given a chat thread (or initial intent for a brand new outbound), extract the SHORT TOPIC the conversation was about, suitable for a follow-up reference like "following up on what we discussed about [TOPIC]".

RULES:
- Output ONLY valid JSON, no preamble, no markdown fences.
- Return: {"summary": "...", "language": "..."}
- "summary": A SHORT NOUN PHRASE (5-12 words) naming WHAT the conversation was about. It must read naturally when inserted into the sentence "following up on what we discussed about ___" or "circling back on the ___".
  - GOOD: "the MAFO numbers I sent for Lazada Malaysia"
  - GOOD: "user acquisition for your gaming portfolio in Brazil"
  - GOOD: "CPS partnerships for confirmed purchases"
  - BAD (meta-language describing the message): "Pitched a performance-based affiliate service, citing competitor growth"
  - BAD (verbose): "An offer to provide performance-based services targeting confirmed purchases in Malaysia with optimization"
  - NEVER use words like "Pitched", "Offered", "Highlighting", "Citing", "Referencing", "Claiming", "Mentioning", "Proposed". These describe the message instead of naming the topic.
  - The summary is a TOPIC NAME, not a description of what the message did.
- "language": The ISO 639-1 language code of the conversation (e.g., "en", "ja", "ko", "zh", "de", "fr", "es", "pt", "ru", "he", "ar"). Detect based on the actual text, not the names or domains mentioned. If the body is primarily in Japanese, return "ja". If primarily English, return "en". Etc.`;

export interface SummarizeResult {
  summary: string;
  language: string;
  cost: CostBreakdown;
}

function detectLanguageFallback(text: string): string {
  const sample = text.slice(0, 500);
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) return "ja";
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(sample)) return "ko";
  if (/[\u4E00-\u9FFF]/.test(sample) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) return "zh";
  if (/[\u0590-\u05FF]/.test(sample)) return "he";
  if (/[\u0600-\u06FF]/.test(sample)) return "ar";
  if (/[\u0400-\u04FF]/.test(sample)) return "ru";
  return "en";
}

const META_PARTICIPLES = [
  "pitched", "offered", "proposed", "outlined", "outlining",
  "highlighted", "highlighting", "cited", "citing",
  "referenced", "referencing", "mentioned", "mentioning",
  "claimed", "claiming", "described", "describing",
  "presented", "presenting", "noted", "noting",
  "emphasized", "emphasizing", "indicating", "demonstrating",
  "stating", "explaining", "suggesting", "arguing",
];

const META_PARTICIPLE_RE = new RegExp(`\\b(?:${META_PARTICIPLES.join("|")})\\b`, "i");

function stripMetaClauses(input: string): string {
  let s = input;

  // Strip leading meta-participle (e.g., "Pitched a service to ..." → "a service to ...")
  s = s.replace(
    new RegExp(`^(?:${META_PARTICIPLES.join("|")})\\s+`, "i"),
    "",
  );

  // Strip ", -ing ..." participial clauses anywhere (", citing X", ", claiming Y")
  s = s.replace(
    new RegExp(
      `,?\\s*(?:${META_PARTICIPLES.join("|")})\\s+[^,.!?;]*`,
      "gi",
    ),
    "",
  );

  // Strip "and -ing X" continuations ("and referencing benchmarks")
  s = s.replace(
    new RegExp(
      `\\s+and\\s+(?:${META_PARTICIPLES.join("|")})\\s+[^,.!?;]*`,
      "gi",
    ),
    "",
  );

  // Strip "claiming the ability to ..." / "the ability to drive ..." meta-constructions
  s = s.replace(/\bthe ability to\s+[a-z]+\s+[^,.!?;]{0,80}/gi, "");

  // Strip "as urgency / as social proof / as a benchmark / as an example / as context"
  s = s.replace(
    /\bas\s+(?:urgency|social proof|a benchmark|an example|context|reference|justification|proof|validation|a hook|a reason)\b[^,.!?;]*/gi,
    "",
  );

  // Strip "via/through/by citing|referencing|..." constructions
  s = s.replace(
    new RegExp(
      `\\s+(?:via|through|by)\\s+(?:${META_PARTICIPLES.join("|")})\\s+[^,.!?;]*`,
      "gi",
    ),
    "",
  );

  return s;
}

/**
 * Returns true if a candidate summary reads like prose / a real sentence
 * instead of a short noun phrase suitable for "...about ___".
 *
 * This catches the pathological case where the summarizer LLM echoes the
 * original conversation back as a summary — which then gets pasted verbatim
 * into the follow-up template and produces garbage like
 *   "Following up on what we discussed about hi Jesaja, Prematch is..."
 */
function looksLikeProse(s: string): boolean {
  if (!s) return false;
  const trimmed = s.trim();
  // Starts with a greeting word (any common language)
  if (/^(hi|hello|hey|dear|greetings|good\s+(morning|afternoon|evening)|shalom|bonjour|hola|ciao|guten\s+tag|konnichiwa|salaam|privet|namaste)\b/i.test(trimmed)) {
    return true;
  }
  // Starts with a pronoun subject (a sentence, not a noun phrase)
  if (/^(i|we|you|they|he|she|it|my|our|your|their)\s+\w+/i.test(trimmed)) {
    return true;
  }
  // Contains clear sentence connectors mid-string
  if (/,\s*(but|and|so|however|because|while|although|though)\s+/i.test(trimmed)) {
    return true;
  }
  // Has a finite verb pattern typical of a sentence ("X is/are/was/were/has/have")
  if (/^\w+\s+(is|are|was|were|has|have|had|will|would|can|could|should)\s+/i.test(trimmed)) {
    return true;
  }
  return false;
}

function sanitizeSummary(raw: string): string {
  let s = (raw || "").trim();

  // Iteratively strip meta clauses until the string stops changing.
  // Guards against chained meta phrases like "Pitched X, citing Y, referencing Z".
  for (let i = 0; i < 5; i++) {
    const before = s;
    s = stripMetaClauses(s);
    if (s === before) break;
  }

  // Collapse whitespace, trim leading junk punctuation.
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[,.;:\s]+/, "");

  // If what remains looks like prose, throw it out — a bad summary is worse
  // than no summary because it gets concatenated into "about ___" verbatim.
  if (looksLikeProse(s)) return "";

  // Lowercase first letter so it reads naturally inside "following up on ___"
  s = s.replace(/^[A-Z]/, (c) => c.toLowerCase());

  // Hard length cap — follow-up references should be short.
  if (s.length > 120) s = s.slice(0, 120).replace(/\s+\S*$/, "");

  // Trim trailing punctuation.
  s = s.replace(/[.,;:]+$/, "").trim();

  return s;
}

/**
 * Returns true if a summary still contains meta-language after sanitization
 * (a participle verb describing what the conversation did, rather than a
 * topic name). Used by the follow-up generator as a runtime self-heal check
 * on existing rows whose summaries may have been stored before sanitization
 * was hardened.
 */
export function summaryLooksMeta(summary: string): boolean {
  if (!summary) return false;
  if (META_PARTICIPLE_RE.test(summary)) return true;
  if (/\bthe ability to\s+\w+/i.test(summary)) return true;
  if (/\bas\s+(?:urgency|social proof|a benchmark|an example)\b/i.test(summary)) return true;
  if (looksLikeProse(summary)) return true;
  return false;
}

/**
 * Run sanitization on an already-stored summary. Exported so the message
 * generator can self-heal contaminated rows at send time without a migration.
 */
export function resanitizeStoredSummary(summary: string): string {
  return sanitizeSummary(summary);
}

const MODEL = "claude-haiku-4-5";

/**
 * Summarize a chat thread (or context-notes blob) into {summary, language}.
 *
 * Inputs are lightweight: the entire prior conversation flattened into one
 * string, or the SDR's context notes when no conversation exists yet
 * (prospector mode first-message generation).
 *
 * Returns sanitized summary + detected language + cost rollup.
 */
export async function summarizeChatContext(text: string): Promise<SummarizeResult> {
  const trimmed = (text || "").trim();
  if (!trimmed || trimmed.length < 20) {
    return {
      summary: "",
      language: detectLanguageFallback(trimmed),
      cost: { inputTokens: 0, outputTokens: 0, usd: 0 },
    };
  }

  try {
    const response = await withAnthropicRetry(
      () => anthropic.messages.create({
        model: MODEL,
        max_tokens: 300,
        system: SUMMARIZE_SYSTEM,
        messages: [{ role: "user", content: trimmed.slice(0, 2000) }],
      }),
      { label: "summarizer" },
    );

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const cost = computeCost(MODEL, inputTokens, outputTokens);

    const textBlock = response.content.find((b) => b.type === "text");
    if (textBlock && textBlock.type === "text" && textBlock.text.trim().length > 10) {
      try {
        const raw = textBlock.text.replace(/```json\s*|```/g, "").trim();
        const parsed = JSON.parse(raw);
        if (parsed.summary && parsed.language) {
          return {
            summary: sanitizeSummary(parsed.summary),
            language: String(parsed.language).trim().toLowerCase(),
            cost,
          };
        }
        if (typeof parsed === "string" || parsed.summary) {
          return {
            summary: sanitizeSummary(parsed.summary || textBlock.text),
            language: detectLanguageFallback(trimmed),
            cost,
          };
        }
      } catch {
        return {
          summary: sanitizeSummary(textBlock.text),
          language: detectLanguageFallback(trimmed),
          cost,
        };
      }
    }
  } catch (err) {
    logger.warn({ err: String(err) }, "Chat context summarization failed, using truncated text");
  }

  // Fallback: truncate the first 200 chars and run sanitization on it.
  const fallback = trimmed.slice(0, 200);
  return {
    summary: sanitizeSummary(fallback),
    language: detectLanguageFallback(trimmed),
    cost: { inputTokens: 0, outputTokens: 0, usd: 0 },
  };
}
