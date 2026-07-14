/**
 * Model pricing in USD per million tokens (Anthropic + Gemini).
 * Used by the cost telemetry layer to roll up per-message spend.
 *
 * Update these values when providers change pricing. Sources of truth:
 * https://www.anthropic.com/pricing · https://ai.google.dev/gemini-api/docs/pricing
 *
 * Values verified 2026-07:
 *   - Opus 4.7 / 4.8:   $5 / $25   (previously mispriced here at $15 / $75,
 *     which over-counted every draft+critic spend ~3x)
 *   - Sonnet 5 / 4.6:   $3 / $15   sticker. Sonnet 5 ALSO has a time-boxed intro
 *     rate — see INTRO_PRICING below; it is now booked at the rate actually
 *     billed, reversing the earlier "book at sticker" choice (rationale there).
 *   - Haiku 4.5:        $1 / $5    (previously mispriced at $0.8 / $4)
 *   - Gemini 3.5 Flash: $1.50 / $9, cached input $0.15
 *   - Opus 4.1:         $15 / $75  (legacy, retiring 2026-08-05)
 *   - Sonnet 4.0:       $3 / $15   (legacy, retired 2026-06-15)
 *
 * Cache pricing:
 *   - `cachedInput` = per-MTok rate for cache-READ tokens. Anthropic default
 *     is 0.1× input; Gemini Flash has an explicit $0.15 rate.
 *   - `cacheWrite`  = per-MTok rate for cache-WRITE tokens (Anthropic 5-min
 *     ephemeral = 1.25× input). Gemini implicit caching has no write premium.
 *   Defaults applied in computeCost when an entry omits them.
 */
import { logger } from "./logger";

export const ANTHROPIC_PRICING: Record<
  string,
  { input: number; output: number; cachedInput?: number; cacheWrite?: number }
> = {
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-opus-4-7": { input: 5.0, output: 25.0 },
  "claude-sonnet-5": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "gemini-3.5-flash": { input: 1.5, output: 9.0, cachedInput: 0.15, cacheWrite: 1.5 },
  // Documented LLM_GEMINI_MODEL fallbacks for keys whose tier can't serve
  // 3.5-flash (see .env.example). Live-probed 2026-07-09: these two return
  // HTTP 200 on this account; gemini-2.5-flash* and 2.0-flash* were RETIRED
  // by Google ("no longer available"). Rates web-verified 2026-07 (Google
  // raised Gemini prices 2026-07-02 — re-verify before trusting rollups).
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5, cachedInput: 0.025, cacheWrite: 0.25 },
  "gemini-3-flash-preview": { input: 0.5, output: 3.0, cachedInput: 0.05, cacheWrite: 0.5 },
  // Legacy dated snapshots still referenced by some services until migrated.
  "claude-opus-4-1-20250805": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
};

/**
 * Time-boxed introductory rates that OVERRIDE the sticker table above while
 * they're live.
 *
 * WHY THIS EXISTS (and why it reverses an earlier decision). This file used to
 * book Sonnet 5 at sticker on purpose — "so rollups don't dip then jump in
 * September". That's a defensible reporting choice, but it is the wrong one for
 * an accountant-facing spend view: CRITIC_MODEL is claude-sonnet-5, so booking
 * $3/$15 while Anthropic bills $2/$10 over-states every critic call by 50% and
 * the dashboard silently fails to reconcile against the invoice. A spend report
 * that doesn't match the bill isn't smooth, it's wrong. So: book what is
 * actually charged, and accept the step-up.
 *
 * CONSEQUENCE, deliberately accepted: reported spend for Sonnet 5 will rise ~50%
 * on 2026-09-01 with no behaviour change. That is real — the intro period ends —
 * and the ledger should show it rather than hide it.
 *
 * Hardcoding either number is wrong half the time ($2 is wrong from September,
 * $3 is wrong today), which is why this is date-resolved rather than a constant.
 * When the window closes, the entry can simply be deleted — priceFor falls back
 * to the sticker table with no other change.
 */
interface IntroRate {
  input: number;
  output: number;
  /** Inclusive final day of the intro window, UTC (billing day granularity). */
  endsAfterUtc: string;
}

const INTRO_PRICING: Record<string, IntroRate> = {
  // Verified against Anthropic's published pricing 2026-07: $2/$10 per MTok
  // "intro through 2026-08-31", reverting to the $3/$15 sticker above.
  "claude-sonnet-5": { input: 2.0, output: 10.0, endsAfterUtc: "2026-08-31" },
};

/**
 * Resolve the rate actually billed for `model` at `at` (default: now).
 *
 * Boundary: the intro window is inclusive of `endsAfterUtc`, so it expires at
 * the first instant of the next UTC day. Anthropic's billing timezone isn't
 * published to the hour, so a request in the last minutes of 2026-08-31 could
 * in principle be billed either way — a sub-day rounding artifact on one day's
 * spend, called out here rather than pretended away.
 */
export function priceFor(
  model: string,
  at: Date = new Date(),
): { input: number; output: number; cachedInput?: number; cacheWrite?: number } | undefined {
  const sticker = ANTHROPIC_PRICING[model];
  if (!sticker) return undefined;

  const intro = INTRO_PRICING[model];
  if (!intro) return sticker;

  const expiresAt = Date.parse(`${intro.endsAfterUtc}T23:59:59.999Z`);
  if (Number.isNaN(expiresAt) || at.getTime() > expiresAt) return sticker;

  // Cache rates ride on the intro input rate — Anthropic's 0.1x read / 1.25x
  // write multipliers apply to whatever input rate is in force, so an entry that
  // pins explicit cache rates keeps them and everything else re-derives below.
  return {
    input: intro.input,
    output: intro.output,
    ...(sticker.cachedInput !== undefined ? { cachedInput: sticker.cachedInput } : {}),
    ...(sticker.cacheWrite !== undefined ? { cacheWrite: sticker.cacheWrite } : {}),
  };
}

export interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

const warnedUnpricedModels = new Set<string>();

export interface CacheTokenCounts {
  /** Tokens served from the provider prompt cache (cheap reads). */
  cachedInputTokens?: number;
  /** Tokens written to the provider prompt cache (Anthropic write premium). */
  cacheWriteTokens?: number;
}

/**
 * Compute per-call cost. `inputTokens` is the UNCACHED input token count
 * (Anthropic's usage.input_tokens is already the uncached remainder; the
 * Gemini client normalizes promptTokenCount the same way). Cache reads and
 * writes are priced separately via `cache` — omitted fields cost $0, so all
 * existing call sites keep working unchanged.
 *
 * The returned `inputTokens` field reports TOTAL input tokens (uncached +
 * cached + cache-write) so spend rollups keep reflecting real prompt sizes.
 */
export function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cache: CacheTokenCounts = {},
): CostBreakdown {
  const cachedIn = cache.cachedInputTokens ?? 0;
  const cacheWrite = cache.cacheWriteTokens ?? 0;
  const totalInput = inputTokens + cachedIn + cacheWrite;

  // priceFor, not a raw table read: resolves any live introductory rate so the
  // number booked is the number billed (see INTRO_PRICING).
  const pricing = priceFor(model);
  if (!pricing) {
    // Unknown model — return zero-cost rather than throwing, but do NOT do so
    // silently: an unpriced model means spend rollups under-count real cost
    // (e.g. a DRAFT_MODEL bump to an id not listed above would show $0). Surface
    // it so the pricing table gets updated instead of quietly losing dollars.
    // Structured + once per model — this sits on the per-call hot path and
    // would otherwise flood stdout for the whole life of a misconfigured deploy.
    if (!warnedUnpricedModels.has(model)) {
      warnedUnpricedModels.add(model);
      logger.warn(
        { model },
        "[pricing] no price entry for model — cost counted as $0. Add it to ANTHROPIC_PRICING.",
      );
    }
    return { inputTokens: totalInput, outputTokens, usd: 0 };
  }

  // Provider defaults when an entry doesn't pin explicit cache rates:
  // Anthropic ephemeral caching reads at 0.1× input and writes at 1.25× input.
  const cachedInputRate = pricing.cachedInput ?? pricing.input * 0.1;
  const cacheWriteRate = pricing.cacheWrite ?? pricing.input * 1.25;

  const usd =
    (inputTokens / 1_000_000) * pricing.input +
    (cachedIn / 1_000_000) * cachedInputRate +
    (cacheWrite / 1_000_000) * cacheWriteRate +
    (outputTokens / 1_000_000) * pricing.output;
  return { inputTokens: totalInput, outputTokens, usd };
}

export function sumCosts(costs: CostBreakdown[]): CostBreakdown {
  return costs.reduce(
    (acc, c) => ({
      inputTokens: acc.inputTokens + c.inputTokens,
      outputTokens: acc.outputTokens + c.outputTokens,
      usd: acc.usd + c.usd,
    }),
    { inputTokens: 0, outputTokens: 0, usd: 0 },
  );
}

/**
 * Anthropic server-side web_search tool fee — billed PER REQUEST, SEPARATE from
 * token cost (it is NOT reflected in usage.input_tokens/output_tokens). ~$10 per
 * 1,000 searches. Count requests via usage.server_tool_use.web_search_requests.
 * Without this, every web-search-enabled research/classify call under-reports
 * its true spend against the daily cap. (Re-verify the rate at the pricing URL
 * above when Anthropic changes it.)
 */
export const WEB_SEARCH_COST_PER_REQUEST = 0.01;

export function webSearchFeeUsd(requests: number): number {
  return Math.max(0, Number(requests) || 0) * WEB_SEARCH_COST_PER_REQUEST;
}
