/**
 * Gemini API client — raw fetch, zero new dependencies.
 *
 * Talks to generativelanguage.googleapis.com (:generateContent) with
 * GEMINI_API_KEY. Deliberately mirrors lib/anthropic.ts posture: 60s
 * timeout, NO internal retries — retry/fallback policy lives in the router
 * (lib/llm/router.ts) where it has role context.
 *
 * Error taxonomy (the router branches on these):
 *   - GeminiMissingKeyError  — GEMINI_API_KEY unset. Router falls back to
 *     Anthropic without ever hitting the network.
 *   - GeminiCapacityError    — HTTP 503 (model overloaded) or 429 (rate
 *     limit). Per the cost-reframe spec these trigger IMMEDIATE fallback to
 *     claude-sonnet-4-6 rather than burning the retry budget.
 *   - GeminiSafetyBlockError — prompt or response blocked by Gemini safety
 *     filters (relevant for grey-area vertical text reaching the rewriter).
 *     Router falls back — Claude models handle this content fine.
 *   - plain Error            — anything else (4xx config errors, malformed
 *     responses). Router gives one retry then falls back.
 *
 * Caching: Gemini 2.5+/3.x apply IMPLICIT prompt caching automatically —
 * no cache_control equivalent. Our job is (a) keep systemInstruction
 * byte-stable and put stable content first (the prompt builders already do
 * this), and (b) surface usageMetadata.cachedContentTokenCount so the cost
 * telemetry prices cached tokens at the $0.15/M cached rate instead of the
 * full $1.50/M. `usage.inputTokens` returned here is NORMALIZED to the
 * uncached remainder (promptTokenCount minus cached) to match Anthropic's
 * usage.input_tokens semantics — computeCost() expects that shape.
 *
 * Test hook: GEMINI_FORCE_503=1 throws GeminiCapacityError before any
 * network I/O — lets the smoke suite exercise the fallback path
 * deterministically without depending on real capacity weather.
 */
import { logger } from "../logger";

const GEMINI_BASE_URL =
  process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";

// Flash models normally answer in 1–4s (a little more when "thinking"). 60s
// was too generous: when Gemini hangs it burns a full minute per call before
// the router can fall back, and the healing loop multiplies that. 30s bounds
// the worst case while staying well clear of any healthy response. Env-tunable
// for ops. The router's circuit breaker stops calling Gemini at all after
// repeated failures, so this only caps the FIRST failures that trip it.
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 30 * 1000;

export class GeminiMissingKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set");
    this.name = "GeminiMissingKeyError";
  }
}

export class GeminiCapacityError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`Gemini capacity error (HTTP ${status}): ${detail}`);
    this.name = "GeminiCapacityError";
    this.status = status;
  }
}

export class GeminiSafetyBlockError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Gemini safety block: ${reason}`);
    this.name = "GeminiSafetyBlockError";
    this.reason = reason;
  }
}

export interface GeminiGenerateInput {
  model: string;            // e.g. "gemini-3.5-flash"
  system: string;           // maps to systemInstruction
  user: string;             // single user turn
  maxTokens: number;
  /** Ask Gemini to emit application/json (our chain roles all output JSON). */
  json?: boolean;
  /** Log tag. */
  label?: string;
}

export interface GeminiGenerateResult {
  text: string;
  usage: {
    /** UNCACHED prompt tokens (promptTokenCount − cachedContentTokenCount). */
    inputTokens: number;
    /** Prompt tokens served from Gemini's implicit cache. */
    cachedInputTokens: number;
    outputTokens: number;
  };
}

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

interface GeminiResponseShape {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  error?: { code?: number; message?: string; status?: string };
}

/**
 * Single-shot generateContent call. Throws the typed errors above; never
 * retries internally (router's job).
 */
export async function geminiGenerate(input: GeminiGenerateInput): Promise<GeminiGenerateResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiMissingKeyError();

  // Smoke-test hook — deterministic capacity failure with zero network I/O.
  if (process.env.GEMINI_FORCE_503 === "1") {
    throw new GeminiCapacityError(503, "forced by GEMINI_FORCE_503 test hook");
  }

  const url = `${GEMINI_BASE_URL}/models/${encodeURIComponent(input.model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user", parts: [{ text: input.user }] }],
    generationConfig: {
      maxOutputTokens: input.maxTokens,
      // Thinking OFF — mirrors the Anthropic side's `thinking:{disabled}`
      // (router.ts). Flash models think by default and can burn the ENTIRE
      // maxOutputTokens budget on thoughts, returning empty text with
      // finishReason=MAX_TOKENS. Every chain role here is deterministic
      // JSON shaping, not open-ended reasoning; billing thoughts at the
      // $9/M output rate is exactly what this reframe exists to avoid.
      // (NB: -pro models reject budget 0 — the policy only routes flash
      // here; a -pro override would 400 → router falls back to Anthropic.)
      thinkingConfig: { thinkingBudget: 0 },
      ...(input.json ? { responseMimeType: "application/json" } : {}),
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Header auth (not ?key= query param) so the key never lands in
        // URL-bearing logs or error messages.
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // AbortError → present like a timeout so the router treats it as
    // transient; other network errors bubble with their own message.
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Gemini request timeout after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 503 || res.status === 429) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new GeminiCapacityError(res.status, detail || res.statusText);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    throw new Error(`Gemini HTTP ${res.status} (${input.label || "call"}): ${detail || res.statusText}`);
  }

  const data = (await res.json()) as GeminiResponseShape;

  // Prompt-level safety block: no candidates at all.
  if (data.promptFeedback?.blockReason) {
    throw new GeminiSafetyBlockError(`prompt blocked: ${data.promptFeedback.blockReason}`);
  }

  const candidate = data.candidates?.[0];
  if (!candidate) {
    // No candidates and no blockReason (handled above) is an API anomaly,
    // not a content-safety verdict — classify as retriable infra so the
    // router retries once and the circuit breaker counts it.
    throw new Error("Gemini returned no candidates (no blockReason)");
  }
  if (candidate.finishReason === "SAFETY" || candidate.finishReason === "PROHIBITED_CONTENT") {
    throw new GeminiSafetyBlockError(`response blocked: ${candidate.finishReason}`);
  }

  const text = (candidate.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim();
  if (!text) {
    // Empty text without an explicit SAFETY finish is a model/config failure
    // (e.g. the whole budget spent on thinking → finishReason=MAX_TOKENS),
    // NOT a content block. Classifying it as safety would blind the circuit
    // breaker to a systematic failure mode — every call would keep paying a
    // dead Gemini round-trip. Plain Error → retry once, count toward breaker.
    throw new Error(
      `Gemini returned empty response text (finishReason=${candidate.finishReason || "unknown"})`,
    );
  }

  const meta = data.usageMetadata || {};
  const promptTokens = meta.promptTokenCount ?? 0;
  const cached = meta.cachedContentTokenCount ?? 0;
  // Gemini bills "thinking" tokens as output — fold them in so telemetry
  // reflects the real bill.
  const outputTokens = (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0);

  if (cached > 0) {
    logger.debug(
      { label: input.label, cached, promptTokens },
      "[gemini] implicit cache hit",
    );
  }

  return {
    text,
    usage: {
      inputTokens: Math.max(0, promptTokens - cached),
      cachedInputTokens: cached,
      outputTokens,
    },
  };
}
