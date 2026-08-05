/**
 * LLM role router — the single decision point for which model serves each
 * stage of the writer → critic → lint chain, with provider fallback and
 * prompt caching baked in.
 *
 * POLICY (user-specified, 2026-07; fallback chain added 2026-07-09):
 *
 *   ROLE     DEFAULT             GREY-AREA VERTICALS    ON FAILURE (per call)
 *   writer   gemini-3.5-flash    claude-sonnet-4-6      → gemini-3-flash-preview → claude-sonnet-4-6
 *   critic   claude-sonnet-5     claude-sonnet-5        (Anthropic-only role)
 *   lint     gemini-3.5-flash    gemini-3.5-flash†      → gemini-3-flash-preview → claude-sonnet-4-6
 *
 * Grey-area verticals = casino/gambling, sports betting, crypto, forex —
 * Sonnet 4.6 writes those natively per policy. †The lint/rewrite stage keeps
 * Gemini by default (it edits an already-compliant draft), but Gemini safety
 * blocks on grey content are treated exactly like capacity errors → fallback
 * to Sonnet 4.6, so grey rewrites degrade automatically.
 *
 * Fallback semantics for the Gemini path:
 *   - Missing GEMINI_API_KEY .... fallback immediately (warned once per boot)
 *   - 503 / 429 (capacity) ...... fallback immediately (user spec)
 *   - safety block .............. fallback immediately
 *   - anything else ............. ONE Gemini retry, then fallback
 * The fallback itself runs through withAnthropicRetry, so "Gemini down +
 * one Anthropic blip" still produces a message.
 *
 * CIRCUIT BREAKER (per Gemini model): after LLM_GEMINI_BREAKER_THRESHOLD
 * (default 3) consecutive INFRA failures (capacity/timeout/network — NOT
 * content safety blocks) that model's breaker opens for
 * LLM_GEMINI_BREAKER_COOLDOWN_MS (default 60s) and the chain skips it without
 * probing. One success closes it. Per-model state matters: a permanently
 * unprovisioned primary (3.5-flash 503ing on this key) must not blind the
 * chain to the healthy 3-flash-preview tier.
 *
 * CACHING:
 *   - Anthropic calls send `system` as a content-block array with
 *     cache_control {type:"ephemeral"} on the last block. System prompts are
 *     stable per (mode, channel, vertical pack) — bulk generation and digest
 *     bursts hit the prefix cache at 0.1× input price. usage.cache_* token
 *     counts flow into computeCost.
 *   - Gemini caching is implicit (nothing to send); cachedContentTokenCount
 *     flows into computeCost at the $0.15/M cached rate.
 *
 * Ops kill switch: LLM_DISABLE_GEMINI=1 forces the all-Anthropic path
 * (identical to the missing-key path) without a deploy.
 */
import { anthropic } from "../anthropic";
import { withAnthropicRetry } from "../../services/anthropicRetry";
import { computeCost, type CostBreakdown } from "../pricing";
import {
  geminiGenerate,
  isGeminiConfigured,
  GeminiCapacityError,
  GeminiSafetyBlockError,
  GeminiMissingKeyError,
} from "./gemini";
import { logger } from "../logger";

// ─────────────────────────────────────────────────────────────────
// Models (env-overridable for ops experiments; defaults are the policy)
// ─────────────────────────────────────────────────────────────────

export const GEMINI_DEFAULT_MODEL = process.env.LLM_GEMINI_MODEL || "gemini-3.5-flash";
// USER DECISION (2026-07-09): keep 3.5-flash as the default, but chain through
// a cheaper same-provider sibling before paying Anthropic prices —
//   gemini-3.5-flash → gemini-3-flash-preview → claude-sonnet-4-6.
// gemini-3-flash-preview was live-probed HTTP 200 on this key ($0.50/$3 per
// MTok) while 3.5-flash 503s (not provisioned on the key's tier), so today the
// chain lands writers on 3-flash-preview; the moment Google serves 3.5-flash,
// the primary takes over automatically.
export const GEMINI_FALLBACK_MODEL =
  process.env.LLM_GEMINI_FALLBACK_MODEL || "gemini-3-flash-preview";
export const ANTHROPIC_FALLBACK_MODEL = process.env.LLM_FALLBACK_MODEL || "claude-sonnet-4-6";
export const CRITIC_MODEL = process.env.LLM_CRITIC_MODEL || "claude-sonnet-5";

export type LlmRole = "writer" | "critic" | "lint";

export interface LlmCallInput {
  system: string;
  user: string;
  maxTokens: number;
  /** Log tag, e.g. "draft" / "critic" / "rewriter". */
  label: string;
  /** Prospect vertical context — drives grey-area routing for the writer. */
  vertical?: string;
  subVertical?: string | null;
}

export interface LlmCallResult {
  text: string;
  /** Model that actually produced the text (post-fallback). */
  model: string;
  provider: "gemini" | "anthropic";
  /** True when the Gemini path fell back to Anthropic. */
  fallback: boolean;
  cost: CostBreakdown;
}

// ─────────────────────────────────────────────────────────────────
// Grey-area vertical detection
// ─────────────────────────────────────────────────────────────────
//
// User-specified set: casino, sports betting, crypto, forex. Matched as
// substrings against vertical + subVertical (taxonomy slugs like
// "sports_betting", "casino_social", "crypto_exchange", "forex_cfd").
// Deliberately NOT matching bare "trading"/"gaming" — those catch benign
// verticals (mobile gaming UA is the bread-and-butter vertical here).

const GREY_AREA_RE = /casino|gambling|betting|sportsbook|igaming|crypto|forex|cfd/i;

export function isGreyAreaVertical(vertical?: string, subVertical?: string | null): boolean {
  return GREY_AREA_RE.test(`${vertical || ""} ${subVertical || ""}`);
}

// ─────────────────────────────────────────────────────────────────
// Anthropic call with prompt caching
// ─────────────────────────────────────────────────────────────────

interface AnthropicUsageShape {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

async function callAnthropic(
  model: string,
  input: LlmCallInput,
): Promise<LlmCallResult> {
  const response = await withAnthropicRetry(
    () =>
      anthropic.messages.create({
        model,
        max_tokens: input.maxTokens,
        // Thinking OFF. Sonnet 5 (and the 4.8/4.7 family) run ADAPTIVE
        // thinking by default; at max_tokens=2048 the model can spend the
        // whole budget thinking and return a response with NO text block
        // (stop_reason=max_tokens) — the old critic on Opus 4.7 ran
        // thinking-off by omission, so this only surfaced after the Sonnet 5
        // swap. Every chain role here is a deterministic JSON-shaping task
        // (draft / critique / rewrite), not open-ended reasoning — disabling
        // thinking is both correct and the cheaper choice this reframe wants.
        thinking: { type: "disabled" as const },
        // System as a block array so we can attach cache_control. The system
        // prompt is the big stable prefix (doctrine + channel register +
        // vocabulary blocks); the volatile prospect context lives in the user
        // message AFTER the breakpoint, so repeat calls read the prefix at
        // 0.1× price instead of reprocessing it.
        system: [
          {
            type: "text" as const,
            text: input.system,
            cache_control: { type: "ephemeral" as const },
          },
        ],
        messages: [{ role: "user", content: input.user }],
      }),
    { label: input.label },
  );

  const usage = (response as { usage?: AnthropicUsageShape }).usage || {};
  const cost = computeCost(model, usage.input_tokens ?? 0, usage.output_tokens ?? 0, {
    cachedInputTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  });

  const textBlock = (response.content as Array<{ type: string; text?: string }>).find(
    (b) => b.type === "text",
  );
  if (!textBlock?.text) {
    throw new Error(`No text block in ${input.label} response (${model})`);
  }

  return { text: textBlock.text, model, provider: "anthropic", fallback: false, cost };
}

// ─────────────────────────────────────────────────────────────────
// Gemini call with fallback
// ─────────────────────────────────────────────────────────────────

// Warn once per boot per reason — a missing key would otherwise log on
// every single generation.
const warnedOnce = new Set<string>();
function warnOnce(key: string, msg: string): void {
  if (warnedOnce.has(key)) return;
  warnedOnce.add(key);
  logger.warn(msg);
}

function geminiDisabled(): string | null {
  if (process.env.LLM_DISABLE_GEMINI === "1") return "LLM_DISABLE_GEMINI=1";
  if (!isGeminiConfigured()) return "GEMINI_API_KEY not set";
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Gemini circuit breaker
// ─────────────────────────────────────────────────────────────────
//
// Without this, an unhealthy Gemini (503/429/timeout — e.g. a model not
// provisioned for the key's tier) costs a full Gemini round-trip on EVERY
// writer/lint call before falling back, and the writer→critic→lint healing
// loop multiplies it into minute-plus generations. After BREAKER_THRESHOLD
// consecutive INFRA failures the breaker "opens": we skip Gemini entirely for
// BREAKER_COOLDOWN_MS and route straight to Anthropic, so an outage costs one
// probe per cooldown window instead of one dead round-trip per call. A single
// success closes it immediately. Content SAFETY blocks are per-request, not an
// outage signal, so they never count toward the breaker.
const BREAKER_THRESHOLD = Number(process.env.LLM_GEMINI_BREAKER_THRESHOLD) || 3;
const BREAKER_COOLDOWN_MS = Number(process.env.LLM_GEMINI_BREAKER_COOLDOWN_MS) || 60_000;

// PER-MODEL breaker state (the writer/lint chain now spans two Gemini
// models): a permanently-503ing primary must not poison the healthy
// fallback tier — its breaker opens independently and the chain skips
// straight to the next tier without a dead round-trip.
interface BreakerState {
  consecutiveFailures: number;
  openUntil: number;
}

const breakers = new Map<string, BreakerState>();

function breakerFor(model: string): BreakerState {
  let state = breakers.get(model);
  if (!state) {
    state = { consecutiveFailures: 0, openUntil: 0 };
    breakers.set(model, state);
  }
  return state;
}

function geminiBreakerOpen(model: string): boolean {
  return Date.now() < breakerFor(model).openUntil;
}

function recordGeminiSuccess(model: string): void {
  const state = breakerFor(model);
  if (state.consecutiveFailures > 0 || state.openUntil > 0) {
    logger.info({ model }, "[llm-router] Gemini model recovered — circuit breaker reset");
  }
  state.consecutiveFailures = 0;
  state.openUntil = 0;
}

function recordGeminiInfraFailure(model: string): void {
  const state = breakerFor(model);
  state.consecutiveFailures += 1;
  if (state.consecutiveFailures >= BREAKER_THRESHOLD && !geminiBreakerOpen(model)) {
    state.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    logger.warn(
      { model, failures: state.consecutiveFailures, cooldownMs: BREAKER_COOLDOWN_MS },
      "[llm-router] Gemini model circuit breaker OPEN — skipping this tier during cooldown",
    );
  }
}

/** Test hook — reset breaker state between smoke scenarios. */
export function __resetGeminiBreakerForTests(): void {
  breakers.clear();
}

async function callGeminiWithFallback(input: LlmCallInput): Promise<LlmCallResult> {
  const disabledReason = geminiDisabled();
  if (disabledReason) {
    warnOnce(
      disabledReason,
      `[llm-router] Gemini unavailable (${disabledReason}) — routing writer/lint to ${ANTHROPIC_FALLBACK_MODEL}. ` +
        "Add GEMINI_API_KEY as a Replit Secret to enable the cheaper default path.",
    );
    const result = await callAnthropic(ANTHROPIC_FALLBACK_MODEL, input);
    return { ...result, fallback: true };
  }

  const attemptGemini = async (model: string): Promise<LlmCallResult> => {
    const res = await geminiGenerate({
      model,
      system: input.system,
      user: input.user,
      maxTokens: input.maxTokens,
      json: true, // every chain role outputs a JSON object
      label: input.label,
    });
    const cost = computeCost(model, res.usage.inputTokens, res.usage.outputTokens, {
      cachedInputTokens: res.usage.cachedInputTokens,
    });
    return {
      text: res.text,
      model,
      provider: "gemini",
      // fallback=true whenever the primary Gemini model didn't serve this call.
      fallback: model !== GEMINI_DEFAULT_MODEL,
      cost,
    };
  };

  // USER DECISION (2026-07-09): tiered chain — try the primary Gemini model,
  // then the cheaper Gemini sibling, then Anthropic. Per-model breakers mean
  // a hard-down primary (e.g. 3.5-flash not provisioned on this key) costs
  // ONE probe per cooldown window while the healthy tier keeps serving.
  const geminiTiers =
    GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_DEFAULT_MODEL
      ? [GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL]
      : [GEMINI_DEFAULT_MODEL];

  let lastReason = "";
  for (const model of geminiTiers) {
    if (geminiBreakerOpen(model)) {
      logger.debug(
        { label: input.label, model },
        "[llm-router] Gemini tier breaker open — skipping without probing",
      );
      lastReason = `breaker open for ${model}`;
      continue;
    }

    try {
      const res = await attemptGemini(model);
      recordGeminiSuccess(model);
      return res;
    } catch (err) {
      // Safety blocks are content-specific (grey-vertical text tripping
      // Gemini's filters), NOT a health signal — and the sibling tier shares
      // the same provider-level filters, so don't pay another Gemini
      // round-trip for the same content: skip straight to Anthropic. Does
      // not count toward any breaker.
      if (err instanceof GeminiSafetyBlockError) {
        lastReason = String(err);
        break;
      }
      // Capacity (503/429) or a vanished key: infra failure → count it
      // against THIS tier, move to the next.
      if (err instanceof GeminiCapacityError || err instanceof GeminiMissingKeyError) {
        recordGeminiInfraFailure(model);
        lastReason = String(err);
        continue;
      }
      // Anything else (transient network, 500, timeout, malformed response):
      // count it ONCE for this invocation per tier (a failed retry must not
      // double-count — with threshold 3 that would open the breaker after ~2
      // unhealthy calls), give this tier one more attempt, then move on.
      recordGeminiInfraFailure(model);
      logger.warn(
        { label: input.label, model, err: String(err) },
        "[llm-router] Gemini tier error — one retry before next tier",
      );
      try {
        const res = await attemptGemini(model);
        recordGeminiSuccess(model);
        return res;
      } catch (retryErr) {
        if (retryErr instanceof GeminiSafetyBlockError) {
          lastReason = String(retryErr);
          break;
        }
        lastReason = String(retryErr);
      }
    }
  }

  logger.warn(
    { label: input.label, reason: lastReason, fallbackModel: ANTHROPIC_FALLBACK_MODEL },
    "[llm-router] All Gemini tiers failed — falling back to Anthropic",
  );
  const result = await callAnthropic(ANTHROPIC_FALLBACK_MODEL, input);
  return { ...result, fallback: true };
}

// ─────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────

/**
 * Route one chain-stage call to the policy model. Throws only when BOTH
 * providers fail (or the Anthropic-only critic path fails) — the caller's
 * existing error handling then applies unchanged.
 */
export async function callLLMRole(role: LlmRole, input: LlmCallInput): Promise<LlmCallResult> {
  switch (role) {
    case "critic":
      // Anthropic-only role per policy. No sampling params are sent anywhere
      // in this router — Sonnet 5 rejects non-default temperature/top_p.
      return callAnthropic(CRITIC_MODEL, input);

    case "writer":
      if (isGreyAreaVertical(input.vertical, input.subVertical)) {
        logger.info(
          { label: input.label, vertical: input.vertical, subVertical: input.subVertical },
          "[llm-router] grey-area vertical — writer routed to " + ANTHROPIC_FALLBACK_MODEL,
        );
        return callAnthropic(ANTHROPIC_FALLBACK_MODEL, input);
      }
      return callGeminiWithFallback(input);

    case "lint":
      return callGeminiWithFallback(input);
  }
}
