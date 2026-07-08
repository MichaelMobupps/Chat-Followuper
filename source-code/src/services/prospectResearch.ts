/**
 * Research stage orchestrator.
 *
 * Runs once per prospect at seeding time. Calls Opus 4.7 to produce a
 * structured ProspectBrief that the message generator reads on every
 * subsequent message in the prospect's follow-up sequence.
 *
 * Architecture matches Email Prospector's s4_research.py:
 *   - Single Opus call (no critic loop on research, per Prospector pattern)
 *   - Structured JSON output with ~16 fields
 *   - Geo rule, subsidiary filter, volume calibration enforced via prompt
 *   - Native-language argument variants for non-English prospects
 *
 * Failure mode: research is REQUIRED. If the LLM call fails after retries,
 * if JSON parsing fails, or if validation fails, the function throws and
 * the seed flow surfaces the error to the SDR. No template fallback.
 *
 * Cost expectation: typical run ~$0.03-0.08 per prospect (Opus, 2-3K input
 * tokens for the prompt, 800-1500 output tokens for the JSON brief).
 */

import { anthropic } from "../lib/anthropic";
import { withAnthropicRetry } from "./anthropicRetry";
import { computeCost, type CostBreakdown } from "../lib/pricing";
import { logger } from "../lib/logger";
import {
  getResearchSystemPrompt,
  getResearchUserPrompt,
  type ResearchPromptInput,
} from "../lib/doctrine/researchPrompts";
import { resolveLocale, primarySubtag } from "../lib/localeResolver";
import { isValidSubVertical, type SubVertical } from "../lib/doctrine/taxonomy";
import {
  emitLlmSubstage,
  emitInfo,
  type ProgressEmitter,
} from "./progressEvents";

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

const RESEARCH_MODEL = "claude-opus-4-7";

export class ResearchFailedError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ResearchFailedError";
  }
}

/**
 * The structured research output. Stored as JSONB on `prospects.researchBrief`
 * and consumed by the message generator on every send.
 */
export interface ProspectBrief {
  // Determined / inferred prospect facts
  determinedCountry: string;
  determinedScaleTier: "small" | "mid" | "large" | "mega";
  scaleRationale: string;
  calibratedDailyVolume: string;

  // Vocabulary anchors
  primaryEvent: string;
  alternativeEvents: string[];

  // Competitor truth
  finalCompetitors: string[];
  subsidiaryCheckNote: string;

  // Market intelligence
  marketContext: string;
  prospectSpecificHook: string;
  prospectPrimaryGrowthProblem: string;

  // Doctrine arguments (English)
  whyArgument: string;
  validationArgument: string;
  howArgument: string;

  // Tangible reasons (proof points)
  tangibleReasons: string[];

  // Native-language variants (empty strings if target language is English)
  whyArgumentNative: string;
  validationArgumentNative: string;
  howArgumentNative: string;

  // Provenance
  generatedAt: string;
  generatorModel: string;
  generatorCostUsd: number;
}

export interface ResearchInput {
  brand: string;
  country: string;
  language: string;
  subVertical: string;
  product: string;
  sdrContextNotes?: string;
  apolloOrgIndustry?: string;
  apolloEmployeeCount?: number;
}

export interface ResearchResult {
  brief: ProspectBrief;
  cost: CostBreakdown;
}

// ─────────────────────────────────────────────────────────────────
// JSON parser (handles markdown fences, partial parsing)
// ─────────────────────────────────────────────────────────────────

function parseResearchJson(raw: string): Record<string, unknown> {
  let trimmed = raw.replace(/```json\s*|```/g, "").trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    trimmed = trimmed.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch (err) {
    throw new ResearchFailedError(
      `Failed to parse research JSON: ${(err as Error).message}. Raw: ${trimmed.slice(0, 300)}...`,
      err,
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────

function asString(v: unknown, field: string, brief: Record<string, unknown>): string {
  if (typeof v !== "string") {
    throw new ResearchFailedError(`Research brief field "${field}" missing or not a string. Got: ${JSON.stringify(v)}`);
  }
  if (v.trim().length === 0) {
    throw new ResearchFailedError(`Research brief field "${field}" is empty. Brief: ${JSON.stringify(brief).slice(0, 300)}`);
  }
  return v.trim();
}

function asStringArray(v: unknown, field: string, minLength: number, brief: Record<string, unknown>): string[] {
  if (!Array.isArray(v)) {
    throw new ResearchFailedError(`Research brief field "${field}" must be an array. Got: ${JSON.stringify(v)}`);
  }
  const arr = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
  if (arr.length < minLength) {
    throw new ResearchFailedError(`Research brief field "${field}" must have at least ${minLength} non-empty strings. Got: ${JSON.stringify(arr)}. Full brief: ${JSON.stringify(brief).slice(0, 300)}`);
  }
  return arr;
}

function asScaleTier(v: unknown): "small" | "mid" | "large" | "mega" {
  if (v !== "small" && v !== "mid" && v !== "large" && v !== "mega") {
    throw new ResearchFailedError(`Research brief field "determined_scale_tier" must be one of small | mid | large | mega. Got: ${JSON.stringify(v)}`);
  }
  return v;
}

function asOptionalNativeString(v: unknown, field: string, isNonEnglish: boolean): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (isNonEnglish && s.length === 0) {
    // Soft warning logged by caller; not a hard failure since the rewriter
    // pipeline can recover from missing native variants by falling back
    // to translated English at message time.
    logger.warn({ field }, "Research brief missing native-language variant; will fall back to translation");
  }
  return s;
}

/**
 * Validate the parsed JSON conforms to the ProspectBrief contract.
 * Throws ResearchFailedError on any missing or malformed required field.
 */
function validateBrief(parsed: Record<string, unknown>, isNonEnglish: boolean): Omit<ProspectBrief, "generatedAt" | "generatorModel" | "generatorCostUsd"> {
  return {
    determinedCountry: asString(parsed.determined_country, "determined_country", parsed),
    determinedScaleTier: asScaleTier(parsed.determined_scale_tier),
    scaleRationale: asString(parsed.scale_rationale, "scale_rationale", parsed),
    calibratedDailyVolume: asString(parsed.calibrated_daily_volume, "calibrated_daily_volume", parsed),
    primaryEvent: asString(parsed.primary_event, "primary_event", parsed),
    alternativeEvents: asStringArray(parsed.alternative_events, "alternative_events", 1, parsed),
    finalCompetitors: asStringArray(parsed.final_competitors, "final_competitors", 2, parsed),
    subsidiaryCheckNote: asString(parsed.subsidiary_check_note, "subsidiary_check_note", parsed),
    marketContext: asString(parsed.market_context, "market_context", parsed),
    prospectSpecificHook: asString(parsed.prospect_specific_hook, "prospect_specific_hook", parsed),
    prospectPrimaryGrowthProblem: asString(parsed.prospect_primary_growth_problem, "prospect_primary_growth_problem", parsed),
    whyArgument: asString(parsed.why_argument, "why_argument", parsed),
    validationArgument: asString(parsed.validation_argument, "validation_argument", parsed),
    howArgument: asString(parsed.how_argument, "how_argument", parsed),
    tangibleReasons: asStringArray(parsed.tangible_reasons, "tangible_reasons", 2, parsed),
    whyArgumentNative: asOptionalNativeString(parsed.why_argument_native, "why_argument_native", isNonEnglish),
    validationArgumentNative: asOptionalNativeString(parsed.validation_argument_native, "validation_argument_native", isNonEnglish),
    howArgumentNative: asOptionalNativeString(parsed.how_argument_native, "how_argument_native", isNonEnglish),
  };
}

/**
 * Sanity-check the calibrated_daily_volume field is a single number (not a
 * range, not text). The prompt instructs the LLM to produce a single number,
 * but defensive validation here surfaces format errors early.
 */
function validateVolumeFormat(volume: string): void {
  // Accept "450", "1,200", "1500" — reject "150-400", "approximately 200", "high".
  const cleaned = volume.replace(/[\s,]/g, "");
  if (!/^\d+$/.test(cleaned)) {
    throw new ResearchFailedError(
      `calibrated_daily_volume must be a single number, not a range or descriptor. Got: "${volume}"`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// Anthropic response shape
// ─────────────────────────────────────────────────────────────────

interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

// ─────────────────────────────────────────────────────────────────
// Timeout wrapper
// ─────────────────────────────────────────────────────────────────

/**
 * Wraps a promise with a hard timeout. Rejects with ResearchFailedError if
 * the wrapped promise has not settled within `timeoutMs`. The underlying
 * promise continues executing in the background — Node has no general way
 * to cancel a fetch in flight from outside — but the caller stops waiting,
 * and any late settlement is swallowed silently to avoid Node's
 * "unhandled promise rejection" warning.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new ResearchFailedError(message));
    }, timeoutMs);
    promise.then(
      (val) => {
        if (settled) return; // late resolve after timeout — drop silently
        settled = true;
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        if (settled) {
          // Late rejection after timeout — swallow to prevent Node's
          // unhandled-rejection warning. Log at debug level so the late
          // failure is still visible if an operator wants to dig.
          logger.debug({ err: String(err), timeoutMs }, "Late LLM rejection after timeout fired; swallowed");
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ─────────────────────────────────────────────────────────────────
// Brand-name sanitizer (prompt-injection hardening)
// ─────────────────────────────────────────────────────────────────

/**
 * Sanitizes a brand name before it lands in the LLM system prompt.
 *
 * The LLM is reasonably resilient to prompt injection, but defense in depth
 * matters when the input is operator-controlled and the output is then
 * stored on the prospect row. Strategy:
 *   - Cap length at 200 chars (real brand names are short)
 *   - Strip newlines (prevents instruction injection across line breaks)
 *   - Strip backticks and triple-quote-style delimiters that can confuse
 *     the LLM about prompt boundaries
 *   - Strip common system-prompt-style markers ("system:", "assistant:",
 *     "###") that adversarial input might use
 *
 * Returns the sanitized brand name. Logs a warning if anything was stripped.
 */
function sanitizeBrandName(brand: string): string {
  const original = brand;
  let sanitized = brand
    .replace(/[\r\n]+/g, " ")
    .replace(/`+/g, "")
    .replace(/"""/g, "")
    .replace(/'''/g, "")
    .replace(/\b(system|assistant|user)\s*:/gi, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (sanitized.length > 200) {
    sanitized = sanitized.slice(0, 200).trim();
  }
  if (sanitized !== original) {
    logger.warn(
      { original: original.slice(0, 100), sanitized: sanitized.slice(0, 100) },
      "Brand name sanitized before research prompt assembly",
    );
  }
  return sanitized;
}

/**
 * Sanitizes the SDR-supplied context notes the same way as the brand name,
 * with a higher length cap (notes are intentionally longer than brand names).
 */
function sanitizeContextNotes(notes: string | undefined): string | undefined {
  if (!notes) return undefined;
  const original = notes;
  let sanitized = notes
    .replace(/`+/g, "")
    .replace(/"""/g, "")
    .replace(/'''/g, "")
    .replace(/\b(system|assistant|user)\s*:/gi, "")
    .replace(/^#{1,6}\s+/gm, "")
    // L3: fence-proof like messagePrompts.neutralizeUntrusted. These notes are
    // frequently PASTED PROSPECT-AUTHORED TEXT (F-E prePlatformContext flows
    // here), and the research output becomes TRUSTED grounding for every
    // writer/critic prompt AND the anti-hallucination gate — an injection-
    // laundering channel. Collapse 3+ dashes (the research prompts fence the
    // notes with ---), defang BEGIN/END fence keywords, strip C0 controls.
    .replace(/-{3,}/g, "––")
    .replace(/\b(BEGIN|END)([ \t_-]+)(SDR[ \t_-]*NOTES|NOTES|CONVERSATION)\b/gi, "$1_$3")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .trim();
  // Cap at 4000 chars — longer than that is almost certainly junk paste.
  if (sanitized.length > 4000) {
    sanitized = sanitized.slice(0, 4000).trim();
  }
  if (sanitized !== original) {
    logger.warn(
      { originalLen: original.length, sanitizedLen: sanitized.length },
      "SDR context notes sanitized before research prompt assembly",
    );
  }
  return sanitized;
}

// ─────────────────────────────────────────────────────────────────
// Public: research a prospect
// ─────────────────────────────────────────────────────────────────

/**
 * Research a prospect and return a structured ProspectBrief.
 *
 * Emits SSE progress events at every substage via the provided emitter.
 * Throws ResearchFailedError on any unrecoverable failure.
 */
export async function researchProspect(
  input: ResearchInput,
  emitter: ProgressEmitter,
  // APO6: optional abort signal. When the SSE client disconnects the route
  // aborts it so the in-flight Opus call is cancelled instead of running to
  // completion and discarding a paid-for result. Omitted → zero behavior change.
  signal?: AbortSignal,
): Promise<ResearchResult> {
  // ── Validate input ──
  if (!input.brand || !input.brand.trim()) {
    throw new ResearchFailedError("brand is required");
  }
  if (!input.subVertical || !isValidSubVertical(input.subVertical)) {
    throw new ResearchFailedError(`subVertical "${input.subVertical}" is not a valid sub-vertical code`);
  }
  if (!input.language || !input.language.trim()) {
    throw new ResearchFailedError("language is required (use ISO 639-1 code, e.g. 'en')");
  }
  if (!input.product || !input.product.trim()) {
    throw new ResearchFailedError("product is required (e.g. 'Mobile UA')");
  }

  // B-locale-plumbing: resolve to BCP 47 locale (e.g. "pt-BR") when
  // both country and language are present. Falls back to bare language.
  const resolvedLocale = resolveLocale(input.country, input.language) || input.language;
  const isNonEnglish = primarySubtag(resolvedLocale) !== "en";

  // ── Substage 1: Build prompt (deterministic) ──
  emitInfo(emitter, {
    stage: "research",
    substage: "vocabulary_loaded",
    message: `Loading vertical vocabulary for ${input.subVertical}`,
  });
  emitInfo(emitter, {
    stage: "research",
    substage: "volume_calibration_loaded",
    message: `Loading volume calibration table for this scale tier`,
  });
  emitInfo(emitter, {
    stage: "research",
    substage: "proof_points_loaded",
    message: `Loading proof points pool for ${input.subVertical}`,
  });
  emitInfo(emitter, {
    stage: "research",
    substage: isNonEnglish ? "native_language_required" : "english_language",
    message: isNonEnglish
      ? `Native-language variants will be generated for ${input.language}`
      : `English-only research; no native-language variants needed`,
  });

  const promptInput: ResearchPromptInput = {
    brand: sanitizeBrandName(input.brand),
    country: input.country,
    // B-locale-plumbing: pass resolved BCP 47 locale tag, not bare language.
    language: resolvedLocale,
    subVertical: input.subVertical as SubVertical,
    product: input.product,
    sdrContextNotes: sanitizeContextNotes(input.sdrContextNotes),
    apolloOrgIndustry: input.apolloOrgIndustry,
    apolloEmployeeCount: input.apolloEmployeeCount,
  };

  // Re-validate after sanitization. The sanitizer can strip a brand name
  // down to empty if the input was nothing but newlines, backticks, or
  // injection markers. We refuse to issue a research call on an empty
  // brand because the LLM would have nothing to research.
  if (!promptInput.brand || promptInput.brand.trim().length === 0) {
    throw new ResearchFailedError(
      "brand is empty after sanitization — input contained only stripped characters (newlines, backticks, or instruction markers)",
    );
  }
  if (promptInput.brand.length < 2) {
    throw new ResearchFailedError(
      `brand "${promptInput.brand}" is too short after sanitization (minimum 2 characters)`,
    );
  }

  const systemPrompt = getResearchSystemPrompt(promptInput);
  const userPrompt = getResearchUserPrompt(promptInput);

  emitInfo(emitter, {
    stage: "research",
    substage: "prompt_built",
    message: `Research prompt assembled (${systemPrompt.length} chars system + ${userPrompt.length} chars user)`,
  });

  // ── Substage 2: Call Opus 4.7 ──
  emitter.emit({
    stage: "research",
    substage: "opus_call_started",
    status: "started",
    message: `Calling Opus 4.7 to research ${promptInput.brand} (${input.country || "country TBD"}, ${input.subVertical})`,
    model: RESEARCH_MODEL,
  });

  const llmStart = Date.now();
  // Hard cap on the total time the research call may consume, including
  // the retry budget. Anthropic Opus typically returns in 8-25 seconds for
  // this prompt size; 90 seconds covers worst-case latency plus retries.
  // Without this, an Anthropic-side hang stalls the SSE stream forever
  // and the SDR has no signal that anything is wrong.
  const RESEARCH_TIMEOUT_MS = 90_000;
  let response: AnthropicMessage;
  try {
    response = (await withTimeout(
      withAnthropicRetry(
        () =>
          anthropic.messages.create(
            {
              model: RESEARCH_MODEL,
              max_tokens: 2500,
              system: systemPrompt,
              messages: [{ role: "user", content: userPrompt }],
            },
            // APO6: pass the abort signal as a request option so a client
            // disconnect cancels the HTTP request mid-flight.
            { signal },
          ),
        { label: "research" },
      ),
      RESEARCH_TIMEOUT_MS,
      `Opus research call exceeded ${RESEARCH_TIMEOUT_MS}ms`,
    )) as AnthropicMessage;
  } catch (err) {
    emitter.emit({
      stage: "research",
      substage: "opus_call_failed",
      status: "failed",
      message: `Opus call failed after retries: ${(err as Error).message}`,
      model: RESEARCH_MODEL,
      latencyMs: Date.now() - llmStart,
    });
    throw new ResearchFailedError(`Opus call failed: ${(err as Error).message}`, err);
  }

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const cost = computeCost(RESEARCH_MODEL, inputTokens, outputTokens);

  emitLlmSubstage(emitter, {
    stage: "research",
    substage: "opus_call_succeeded",
    status: "succeeded",
    message: `Opus returned research draft (${outputTokens} output tokens)`,
    startedAt: llmStart,
    inputTokens,
    outputTokens,
    costUsd: cost.usd,
    model: RESEARCH_MODEL,
  });

  // ── Substage 3: Extract text block ──
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || !textBlock.text) {
    emitter.emit({
      stage: "research",
      substage: "no_text_block",
      status: "failed",
      message: `Opus response had no text block`,
    });
    throw new ResearchFailedError("Opus response had no text block");
  }

  // ── Substage 4: Parse JSON ──
  let parsed: Record<string, unknown>;
  try {
    parsed = parseResearchJson(textBlock.text);
    emitInfo(emitter, {
      stage: "research",
      substage: "json_parsed",
      message: `Research JSON parsed (${Object.keys(parsed).length} fields)`,
    });
  } catch (err) {
    emitter.emit({
      stage: "research",
      substage: "json_parse_failed",
      status: "failed",
      message: `Failed to parse research JSON: ${(err as Error).message}`,
    });
    throw err;
  }

  // ── Substage 5: Validate brief ──
  let validated: Omit<ProspectBrief, "generatedAt" | "generatorModel" | "generatorCostUsd">;
  try {
    validated = validateBrief(parsed, isNonEnglish);
    validateVolumeFormat(validated.calibratedDailyVolume);
    emitInfo(emitter, {
      stage: "research",
      substage: "brief_validated",
      message: `Brief validated: ${validated.finalCompetitors.length} peers, volume ${validated.calibratedDailyVolume}/day, ${validated.tangibleReasons.length} proof points`,
    });
  } catch (err) {
    emitter.emit({
      stage: "research",
      substage: "validation_failed",
      status: "failed",
      message: `Brief validation failed: ${(err as Error).message}`,
    });
    throw err;
  }

  // ── Substage 6: Final brief assembled ──
  const brief: ProspectBrief = {
    ...validated,
    generatedAt: new Date().toISOString(),
    generatorModel: RESEARCH_MODEL,
    generatorCostUsd: cost.usd,
  };

  emitter.emit({
    stage: "research",
    substage: "complete",
    status: "succeeded",
    message: `Research complete: ${brief.finalCompetitors.join(", ")} as peers; ${brief.calibratedDailyVolume}/day calibrated; ${brief.tangibleReasons.length} proof points selected`,
    outputSummary: `${brief.finalCompetitors.length} peers, ${brief.calibratedDailyVolume}/day, scale=${brief.determinedScaleTier}`,
  });

  return { brief, cost };
}
