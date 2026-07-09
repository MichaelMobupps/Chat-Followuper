/**
 * LLM role router — the single decision point for which model serves each
 * stage of the writer → critic → lint chain, with provider fallback and
 * prompt caching baked in.
 *
 * POLICY (user-specified, 2026-07):
 *
 *   ROLE     DEFAULT             GREY-AREA VERTICALS    GEMINI 503 / NO KEY
 *   writer   gemini-3.5-flash    claude-sonnet-4-6      claude-sonnet-4-6
 *   critic   claude-sonnet-5     claude-sonnet-5        (Anthropic-only role)
 *   lint     gemini-3.5-flash    gemini-3.5-flash†      claude-sonnet-4-6
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
 * CIRCUIT BREAKER: after LLM_GEMINI_BREAKER_THRESHOLD (default 3) consecutive
 * INFRA failures (capacity/timeout/network — NOT content safety blocks) the
 * breaker opens for LLM_GEMINI_BREAKER_COOLDOWN_MS (default 60s): Gemini is
 * skipped entirely and writer/lint route straight to Anthropic. One success
 * closes it. This keeps generation fast during a Gemini outage instead of
 * paying a dead round-trip per call across the healing loop.
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

let geminiConsecutiveFailures = 0;
let geminiBreakerOpenUntil = 0;

function geminiBreakerOpen(): boolean {
  return Date.now() < geminiBreakerOpenUntil;
}

function recordGeminiSuccess(): void {
  if (geminiConsecutiveFailures > 0 || geminiBreakerOpenUntil > 0) {
    logger.info("[llm-router] Gemini recovered — circuit breaker reset");
  }
  geminiConsecutiveFailures = 0;
  geminiBreakerOpenUntil = 0;
}

function recordGeminiInfraFailure(): void {
  geminiConsecutiveFailures += 1;
  if (geminiConsecutiveFailures >= BREAKER_THRESHOLD && !geminiBreakerOpen()) {
    geminiBreakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
    logger.warn(
      { failures: geminiConsecutiveFailures, cooldownMs: BREAKER_COOLDOWN_MS, fallbackModel: ANTHROPIC_FALLBACK_MODEL },
      "[llm-router] Gemini circuit breaker OPEN — routing writer/lint straight to Anthropic during cooldown",
    );
  }
}

/** Test hook — reset breaker state between smoke scenarios. */
export function __resetGeminiBreakerForTests(): void {
  geminiConsecutiveFailures = 0;
  geminiBreakerOpenUntil = 0;
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

  // Circuit breaker open — Gemini is in a known-bad window; don't pay the
  // round-trip, go straight to Anthropic.
  if (geminiBreakerOpen()) {
    logger.debug(
      { label: input.label },
      "[llm-router] Gemini circuit breaker open — using Anthropic fallback without probing Gemini",
    );
    const result = await callAnthropic(ANTHROPIC_FALLBACK_MODEL, input);
    return { ...result, fallback: true };
  }

  const attemptGemini = async (): Promise<LlmCallResult> => {
    const res = await geminiGenerate({
      model: GEMINI_DEFAULT_MODEL,
      system: input.system,
      user: input.user,
      maxTokens: input.maxTokens,
      json: true, // every chain role outputs a JSON object
      label: input.label,
    });
    const cost = computeCost(GEMINI_DEFAULT_MODEL, res.usage.inputTokens, res.usage.outputTokens, {
      cachedInputTokens: res.usage.cachedInputTokens,
    });
    return {
      text: res.text,
      model: GEMINI_DEFAULT_MODEL,
      provider: "gemini",
      fallback: false,
      cost,
    };
  };

  const fallbackToAnthropic = async (reason: string): Promise<LlmCallResult> => {
    logger.warn(
      { label: input.label, reason, fallbackModel: ANTHROPIC_FALLBACK_MODEL },
      "[llm-router] Gemini path failed — falling back to Anthropic",
    );
    const result = await callAnthropic(ANTHROPIC_FALLBACK_MODEL, input);
    return { ...result, fallback: true };
  };

  try {
    const res = await attemptGemini();
    recordGeminiSuccess();
    return res;
  } catch (err) {
    // Safety blocks are content-specific (grey-vertical text tripping Gemini's
    // filters), NOT a health signal — fall back immediately WITHOUT counting
    // toward the breaker.
    if (err instanceof GeminiSafetyBlockError) {
      return fallbackToAnthropic(String(err));
    }
    // Capacity (503/429) or a vanished key: infra failure → count it, fall back.
    if (err instanceof GeminiCapacityError || err instanceof GeminiMissingKeyError) {
      recordGeminiInfraFailure();
      return fallbackToAnthropic(String(err));
    }
    // Anything else (transient network, 500, timeout, malformed response): count
    // it ONCE for this invocation (a failed retry below must not double-count —
    // with threshold 3 that would open the breaker after ~2 unhealthy calls),
    // give one more Gemini attempt, then fall back.
    recordGeminiInfraFailure();
    logger.warn(
      { label: input.label, err: String(err) },
      "[llm-router] Gemini error — one retry before fallback",
    );
    try {
      const res = await attemptGemini();
      recordGeminiSuccess();
      return res;
    } catch (retryErr) {
      return fallbackToAnthropic(String(retryErr));
    }
  }
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
