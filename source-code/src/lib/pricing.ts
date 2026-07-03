/**
 * Anthropic model pricing in USD per million tokens.
 * Used by the cost telemetry layer to roll up per-message spend.
 *
 * Update these values when Anthropic changes pricing. Source of truth:
 * https://www.anthropic.com/pricing
 *
 * Values verified 2026-07 against the Claude model catalog:
 *   - Opus 4.7 / 4.8: $5 / $25   (previously mispriced here at $15 / $75,
 *     which over-counted every draft+critic spend ~3x)
 *   - Sonnet 5 / 4.6: $3 / $15
 *   - Haiku 4.5:      $1 / $5     (previously mispriced at $0.8 / $4)
 *   - Opus 4.1:       $15 / $75   (legacy, retiring 2026-08-05)
 *   - Sonnet 4.0:     $3 / $15    (legacy, retired 2026-06-15)
 */
export const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-opus-4-7": { input: 5.0, output: 25.0 },
  "claude-sonnet-5": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  // Legacy dated snapshots still referenced by some services until migrated.
  "claude-opus-4-1-20250805": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
};

export interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): CostBreakdown {
  const pricing = ANTHROPIC_PRICING[model];
  if (!pricing) {
    // Unknown model — return zero-cost rather than throwing, but do NOT do so
    // silently: an unpriced model means spend rollups under-count real cost
    // (e.g. a DRAFT_MODEL bump to an id not listed above would show $0). Surface
    // it so the pricing table gets updated instead of quietly losing dollars.
    console.warn(
      `[pricing] no price entry for model "${model}"; cost counted as $0. Add it to ANTHROPIC_PRICING.`,
    );
    return { inputTokens, outputTokens, usd: 0 };
  }
  const usd =
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output;
  return { inputTokens, outputTokens, usd };
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
