/**
 * Retry helper for Anthropic API calls.
 *
 * Design goals:
 * - Treat transient failures (5xx, 429, timeouts, connection resets) as
 *   RETRYABLE. A single flaky network moment should not bubble up to the user.
 * - Treat config failures (401/403 invalid key, 400 bad request, 404 wrong
 *   model) as NON-RETRYABLE. Retrying won't fix a broken API key.
 * - Honor Retry-After headers when present (429 rate limits).
 * - Cap total wait time so a followup never hangs longer than the scheduler's
 *   own loop can tolerate.
 * - Log every attempt so production failures are diagnosable without guessing.
 *
 * The intent is: with this in front of the primary generator, the caller can
 * rely on "either it eventually succeeds or it throws with a clear reason".
 * No more silent degradation to template fallbacks.
 */
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";

export interface RetryOptions {
  /** Max number of attempts (including the first). Default 5. */
  maxAttempts?: number;
  /** Backoff schedule in ms. Index = attempt number - 1. Default 1s,2s,4s,8s,16s. */
  backoffMs?: number[];
  /** Hard cap on total wall-clock time in ms. Default 90s. */
  totalBudgetMs?: number;
  /** Free-form tag for logs so you can tell callers apart. */
  label?: string;
}

const DEFAULTS: Required<Omit<RetryOptions, "label">> = {
  maxAttempts: 5,
  backoffMs: [1000, 2000, 4000, 8000, 16000],
  totalBudgetMs: 90 * 1000,
};

function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    // Rate limit — retryable (honor Retry-After).
    if (status === 429) return true;
    // Server-side transient — retryable.
    if (status >= 500 && status < 600) return true;
    // Request timeout surfaced as 408.
    if (status === 408) return true;
    // Everything else in the 4xx range is a client-side config/usage error.
    // Retrying won't fix a bad key or a missing model.
    return false;
  }
  // Network-layer errors (ECONNRESET, ENOTFOUND, fetch aborted, etc.) have no
  // APIError status — treat as retryable.
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("timeout") || msg.includes("econnreset") || msg.includes("socket hang up")) {
    return true;
  }
  if (msg.includes("fetch failed") || msg.includes("network")) {
    return true;
  }
  // Unknown — err on the side of retry once; the attempt counter caps us anyway.
  return true;
}

function retryAfterMs(err: unknown): number | null {
  if (err instanceof Anthropic.APIError && err.headers) {
    const raw = (err.headers as Record<string, string | undefined>)["retry-after"];
    if (raw) {
      const secs = parseFloat(raw);
      if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, 30 * 1000);
    }
  }
  return null;
}

export async function withAnthropicRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const cfg = { ...DEFAULTS, ...opts };
  const label = opts.label || "anthropic";
  const startedAt = Date.now();
  let lastErr: unknown;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = isRetryable(err);
      const elapsed = Date.now() - startedAt;
      const withinBudget = elapsed < cfg.totalBudgetMs;

      if (!retryable) {
        logger.error(
          { label, attempt, err: String(err) },
          "Non-retryable Anthropic error — failing fast",
        );
        throw err;
      }
      if (attempt >= cfg.maxAttempts) {
        logger.error(
          { label, attempt, maxAttempts: cfg.maxAttempts, err: String(err) },
          "Anthropic retries exhausted",
        );
        throw err;
      }
      if (!withinBudget) {
        logger.error(
          { label, elapsed, budget: cfg.totalBudgetMs, err: String(err) },
          "Anthropic retry budget exhausted",
        );
        throw err;
      }

      const hint = retryAfterMs(err);
      const backoff = hint ?? cfg.backoffMs[Math.min(attempt - 1, cfg.backoffMs.length - 1)];
      logger.warn(
        { label, attempt, willRetryInMs: backoff, err: String(err) },
        "Transient Anthropic error — retrying",
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  // Unreachable, but keeps TS happy.
  throw lastErr ?? new Error("withAnthropicRetry: exhausted without result");
}
