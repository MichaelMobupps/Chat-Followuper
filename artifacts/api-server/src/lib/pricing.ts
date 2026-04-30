/**
 * Anthropic model pricing in USD per million tokens.
 * Used by the cost telemetry layer to roll up per-message spend.
 *
 * Update these values when Anthropic changes pricing. Source of truth:
 * https://www.anthropic.com/pricing
 */
export const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 0.8, output: 4.0 },
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
    // Unknown model — return zero-cost rather than throwing. The caller logs
    // the model string elsewhere; cost just becomes 0 until pricing is added.
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
