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
import { computeCost, webSearchFeeUsd, type CostBreakdown } from "../lib/pricing";
import {
  modelNeedsExplicitToolNudge,
  thinkingDisabledFor,
} from "../lib/llm/thinking";
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

/**
 * Research model. Env-overridable so it can be A/B'd without a code edit per
 * arm — the writer chain already works this way (LLM_GEMINI_MODEL et al.); this
 * was the one model in the pipeline hardcoded, and it happens to be the most
 * expensive call we make (~$0.39–0.52 per new prospect vs $0.024–0.065 for the
 * entire writer chain).
 *
 * Default stays opus-4-7 ($5/$25 per MTok) pending the bench. If you point this
 * at a Sonnet-tier model, mind the thinking default: opus-4-7 with `thinking`
 * omitted runs WITHOUT thinking (what this call does today), whereas sonnet-5
 * with `thinking` omitted runs adaptive thinking ON — so a bare model swap
 * silently adds thinking tokens and latency. Any model set here must also
 * support `web_search_20260209` (Opus 4.8/4.7/4.6, Sonnet 5, Sonnet 4.6);
 * haiku-4-5 is NOT eligible and would silently need the unfiltered
 * `web_search_20250305`, pulling raw results into context.
 */
const RESEARCH_MODEL = process.env.RESEARCH_MODEL || "claude-opus-4-7";

// Hook-doctrine v2: give the research call Anthropic's server-side web search so
// Opus can find a fresh, dated hook and check ad presence (Google Ads
// Transparency Center / Meta Ad Library / AppGoblin). Mirrors the proven pattern
// in opusRescue.ts. Gated by env so it can be disabled (e.g. for cheap CI runs);
// defaults ON. The SDK typings lack the partner tool variant, hence the `as any`
// cast at the call site.
const RESEARCH_WEB_SEARCH_ENABLED =
  process.env.RESEARCH_ENABLE_WEB_SEARCH !== "false";
const WEB_SEARCH_TOOL = { type: "web_search_20260209", name: "web_search" };

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

  // Fresh dated hook + ad-intelligence (MobUpps SDR Hook Writer doctrine v2).
  // ALL optional and best-effort: hook-hunting and ad-library signals are often
  // unknown. An empty/false value means "no real signal found" — NEVER invented.
  // Consumed by the writer to lead the message with a single fresh, dated hook,
  // and to pick a CTV/video angle + the correct acquisition-model vocabulary.
  freshHook?: string;
  hookType?: string;
  hookSource?: string;
  hookDateOrRecency?: string;
  runsYoutubeAds?: boolean;
  runsMetaAds?: boolean;
  ctvAngle?: string;
  acquisitionModel?: string;

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
 * Lenient string reader for best-effort fields (hook + ad-intel). Returns "" for
 * anything non-string or empty. Unlike `asString`, it NEVER throws — an absent
 * fresh hook or ad-library signal must not fail the whole (required) research call.
 */
function asOptionalString(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim();
}

/**
 * Lenient boolean reader for ad-intel flags. Accepts real booleans and the
 * string forms an LLM sometimes emits ("true"/"yes"/"1"). Defaults to false
 * ("no signal / unknown") — we never assert ad activity we didn't confirm.
 */
function asOptionalBoolean(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return /^(true|yes|1)$/i.test(v.trim());
  return false;
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
    // Hook + ad-intel (optional/best-effort — never hard-fail research on absence)
    freshHook: asOptionalString(parsed.fresh_hook),
    hookType: asOptionalString(parsed.hook_type),
    hookSource: asOptionalString(parsed.hook_source),
    hookDateOrRecency: asOptionalString(parsed.hook_date_or_recency),
    runsYoutubeAds: asOptionalBoolean(parsed.runs_youtube_ads),
    runsMetaAds: asOptionalBoolean(parsed.runs_meta_ads),
    ctvAngle: asOptionalString(parsed.ctv_angle),
    acquisitionModel: asOptionalString(parsed.acquisition_model),
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
    webSearchEnabled: RESEARCH_WEB_SEARCH_ENABLED,
    // Emit the explicit SEARCH PROTOCOL only for models that need it. Keyed off
    // RESEARCH_MODEL, so the opus-4-7 default's prompt stays byte-identical and
    // this cannot move the production baseline. See searchDirective.ts.
    aggressiveSearch: modelNeedsExplicitToolNudge(RESEARCH_MODEL),
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
  // Research call. When web search is enabled we (a) OVERRIDE the SDK client's
  // 60s default timeout (lib/anthropic.ts) — server-side web_search fans out to
  // several round-trips and routinely exceeds 60s — and (b) treat the whole
  // hook-enrichment-via-search as BEST-EFFORT: if it times out or the tool
  // errors, we fall back to a fast knowledge-only research call so the prospect
  // ALWAYS gets a brief (the optional hook fields simply come back empty). A
  // slow hook search must never leave a prospect with no message.
  const runResearchCall = (useWebSearch: boolean): Promise<AnthropicMessage> => {
    const perRequestTimeoutMs = useWebSearch ? 120_000 : 60_000;
    const outerTimeoutMs = useWebSearch ? 135_000 : 90_000;
    return withTimeout(
      withAnthropicRetry(
        () =>
          anthropic.messages.create(
            {
              model: RESEARCH_MODEL,
              // Web search needs headroom for the interleaved tool_use blocks.
              max_tokens: useWebSearch ? 3200 : 2500,
              // Keep this call non-thinking, whatever RESEARCH_MODEL is set to.
              // No-op on the opus-4-7 default (already thinking-off on omission);
              // load-bearing the moment RESEARCH_MODEL points at a Sonnet-tier
              // model, where an omitted param means adaptive thinking ON —
              // thinking tokens then eat the 2.5k/3.2k budget meant for the JSON
              // brief and push the web-search call past its 120s/135s timeout.
              // Measured: without this, sonnet-5 threw on 1 of 2 bench cases
              // ("Request timed out") and took 183s vs opus's 128s on the other.
              ...thinkingDisabledFor(RESEARCH_MODEL),
              // Build the system prompt to match THIS call's web-access mode so
              // the knowledge-only fallback doesn't claim it can search the web
              // (which could nudge it to assert a training-recalled hook as fresh).
              system: getResearchSystemPrompt({
                ...promptInput,
                webSearchEnabled: useWebSearch,
              }),
              messages: [{ role: "user", content: userPrompt }],
              // Server-side web search for fresh-hook + ad-intel grounding.
              // Cast: SDK typings lack the partner web_search tool variant.
              ...(useWebSearch ? ({ tools: [WEB_SEARCH_TOOL] } as any) : {}),
            },
            // APO6: abort signal cancels the in-flight request on client
            // disconnect. Override the 60s client default only when searching.
            {
              signal,
              ...(useWebSearch ? { timeout: perRequestTimeoutMs } : {}),
            },
          ),
        { label: useWebSearch ? "research+web_search" : "research" },
      ),
      outerTimeoutMs,
      `Opus research call exceeded ${outerTimeoutMs}ms`,
    ) as Promise<AnthropicMessage>;
  };

  // Call + extract + parse as ONE best-effort unit. A web-search response can be
  // NON-throwing yet unusable — stop_reason "pause_turn" (server tool loop hit
  // its cap) or "max_tokens" (budget consumed by interleaved tool blocks before
  // the final JSON) — leaving no parseable JSON text block. Treating that the
  // same as a thrown call is what lets us degrade to knowledge-only; otherwise
  // research would fail where the old tool-less single call never did.
  const callAndParse = async (
    useWebSearch: boolean,
  ): Promise<{ response: AnthropicMessage; parsed: Record<string, unknown> }> => {
    const resp = await runResearchCall(useWebSearch);
    // With web_search the response interleaves server_tool_use / tool_result
    // blocks; the JSON answer is the LAST non-empty text block, not the first.
    const blocks = resp.content.filter(
      (b): b is { type: string; text: string } =>
        b.type === "text" && typeof b.text === "string" && b.text.trim().length > 0,
    );
    const last = blocks[blocks.length - 1];
    if (!last || !last.text) {
      throw new ResearchFailedError("Opus response had no usable text block");
    }
    return { response: resp, parsed: parseResearchJson(last.text) };
  };

  let response: AnthropicMessage;
  let parsed: Record<string, unknown>;
  try {
    ({ response, parsed } = await callAndParse(RESEARCH_WEB_SEARCH_ENABLED));
  } catch (err) {
    // Degrade to knowledge-only on ANY web-search failure (thrown OR unparseable),
    // unless the client already disconnected — a shared-signal abort would just
    // re-reject the fallback call immediately.
    if (RESEARCH_WEB_SEARCH_ENABLED && !signal?.aborted) {
      logger.warn(
        { err: String(err) },
        "research web_search call unusable; falling back to knowledge-only research",
      );
      emitInfo(emitter, {
        stage: "research",
        substage: "web_search_fallback",
        message:
          "Web search slow/unavailable — completing research from model knowledge (hook fields may be empty)",
      });
      try {
        ({ response, parsed } = await callAndParse(false));
      } catch (err2) {
        emitter.emit({
          stage: "research",
          substage: "opus_call_failed",
          status: "failed",
          message: `Opus call failed after retries: ${(err2 as Error).message}`,
          model: RESEARCH_MODEL,
          latencyMs: Date.now() - llmStart,
        });
        throw err2 instanceof ResearchFailedError
          ? err2
          : new ResearchFailedError(`Opus call failed: ${(err2 as Error).message}`, err2);
      }
    } else {
      emitter.emit({
        stage: "research",
        substage: "opus_call_failed",
        status: "failed",
        message: `Opus call failed after retries: ${(err as Error).message}`,
        model: RESEARCH_MODEL,
        latencyMs: Date.now() - llmStart,
      });
      throw err instanceof ResearchFailedError
        ? err
        : new ResearchFailedError(`Opus call failed: ${(err as Error).message}`, err);
    }
  }

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  // Web search bills a per-request fee not reflected in token counts. Cast:
  // SDK usage typings may omit the partner-tool server_tool_use field.
  const webSearchReqs = Number(
    (response.usage as any)?.server_tool_use?.web_search_requests ?? 0,
  );
  const baseCost = computeCost(RESEARCH_MODEL, inputTokens, outputTokens);
  const cost = { ...baseCost, usd: baseCost.usd + webSearchFeeUsd(webSearchReqs) };

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

  emitInfo(emitter, {
    stage: "research",
    substage: "json_parsed",
    message: `Research JSON parsed (${Object.keys(parsed).length} fields)`,
  });

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
