/**
 * SSE route for streaming research progress.
 *
 * GET /api/prospects/research/stream
 *
 * Body via query string OR JSON-encoded `input` query param:
 *   {
 *     brand, country, language, subVertical, product,
 *     sdrContextNotes?, apolloOrgIndustry?, apolloEmployeeCount?
 *   }
 *
 * Response: text/event-stream with progress events.
 *   event: progress    data: <ProgressEvent JSON>
 *   event: result      data: <{ brief: ProspectBrief, cost: CostBreakdown }>
 *   event: error       data: <{ message: string }>
 *   event: done        data: {}
 *
 * Auth: handled by upstream session middleware (cookie-based, mobupps.com only).
 *
 * Wiring (Express 5):
 *   import { researchStreamRoute } from "./routes/researchStream";
 *   app.get("/api/prospects/research/stream", researchStreamRoute);
 *
 * Note: not POST, because EventSource only supports GET. If the seeder UI
 * uses fetch + ReadableStream instead of EventSource, switch to POST and
 * read input from request body.
 */

import type { Request, Response } from "express";
import { researchProspect, type ResearchInput, ResearchFailedError } from "../services/prospectResearch";
import { SseProgressEmitter } from "../services/progressEvents";
import { logger } from "../lib/logger";
import {
  assertUnderDailyLlmCap,
  recordDailyLlmSpend,
  DailyLlmCapExceededError,
} from "../lib/llmSpendCap";

// API4: cap concurrent research streams per user. Each stream drives an
// expensive Opus research run; without a limit a user (or a runaway client
// re-opening EventSource) could fan out many in parallel. Process-local — good
// enough for the single-instance deploy; a distributed deploy would move this
// to a shared store. Generous enough to allow a retry/second tab.
const MAX_CONCURRENT_STREAMS_PER_USER = 3;
const activeStreamsByUser = new Map<string, number>();

function sendJsonAndEnd(res: Response, status: number, body: unknown): void {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

interface QueryWithInput {
  input?: string;
  brand?: string;
  country?: string;
  language?: string;
  subVertical?: string;
  product?: string;
  sdrContextNotes?: string;
  apolloOrgIndustry?: string;
  apolloEmployeeCount?: string;
}

function parseInputFromRequest(req: Request): ResearchInput {
  const q = req.query as QueryWithInput;

  // Preferred: a JSON-encoded `input` query param.
  if (q.input) {
    try {
      const parsed = JSON.parse(q.input) as Partial<ResearchInput>;
      return validateInput(parsed);
    } catch (err) {
      throw new Error(`input query param is not valid JSON: ${(err as Error).message}`);
    }
  }

  // Fallback: individual query params.
  const employeeCount = q.apolloEmployeeCount ? Number(q.apolloEmployeeCount) : undefined;
  return validateInput({
    brand: q.brand,
    country: q.country,
    language: q.language,
    subVertical: q.subVertical,
    product: q.product,
    sdrContextNotes: q.sdrContextNotes,
    apolloOrgIndustry: q.apolloOrgIndustry,
    apolloEmployeeCount: typeof employeeCount === "number" && !Number.isNaN(employeeCount) ? employeeCount : undefined,
  });
}

function validateInput(p: Partial<ResearchInput>): ResearchInput {
  if (!p.brand || !p.brand.trim()) throw new Error("brand is required");
  if (!p.country) throw new Error("country is required (use empty string if unknown)");
  if (!p.language || !p.language.trim()) throw new Error("language is required");
  if (!p.subVertical || !p.subVertical.trim()) throw new Error("subVertical is required");
  if (!p.product || !p.product.trim()) throw new Error("product is required");
  return {
    brand: p.brand.trim(),
    country: p.country,
    language: p.language.trim(),
    subVertical: p.subVertical.trim(),
    product: p.product.trim(),
    sdrContextNotes: p.sdrContextNotes,
    apolloOrgIndustry: p.apolloOrgIndustry,
    apolloEmployeeCount: p.apolloEmployeeCount,
  };
}

export async function researchStreamRoute(req: Request, res: Response): Promise<void> {
  // ── Explicit auth gate — defense in depth ──
  // The session middleware should have attached a session before this
  // handler runs. Verify it actually did, in case middleware ordering is
  // ever changed and this endpoint accidentally becomes public.
  if (!req.session?.userId) {
    sendJsonAndEnd(res, 401, {
      error: "Unauthenticated. Sign in with your @mobupps.com Google account.",
    });
    return;
  }
  const userId = req.session.userId;

  // ── Daily LLM spend cap (API4, reuses LLM3) ──
  // Research bills Opus; refuse BEFORE flushing SSE headers so we can still
  // return a clean 429 JSON (once headers are sent we can only emit SSE events).
  try {
    await assertUnderDailyLlmCap(userId);
  } catch (err) {
    if (err instanceof DailyLlmCapExceededError) {
      sendJsonAndEnd(res, 429, {
        error: "daily_cap_exceeded",
        spentUsd: err.spentUsd,
        capUsd: err.capUsd,
      });
      return;
    }
    throw err;
  }

  // ── Per-user concurrency limiter (API4) ──
  const active = activeStreamsByUser.get(userId) ?? 0;
  if (active >= MAX_CONCURRENT_STREAMS_PER_USER) {
    sendJsonAndEnd(res, 429, {
      error: "too_many_streams",
      limit: MAX_CONCURRENT_STREAMS_PER_USER,
    });
    return;
  }
  activeStreamsByUser.set(userId, active + 1);

  try {
    // ── Set SSE headers BEFORE any work ──
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Disable proxy buffering for nginx; Replit's autoscale uses its own
    // proxy that respects this header to flush events immediately.
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    // ── Parse and validate input ──
    let input: ResearchInput;
    try {
      input = parseInputFromRequest(req);
    } catch (err) {
      // Validation messages are caller-authored ("brand is required") and safe
      // to surface — they help the SDR fix the request.
      res.write(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
      res.write(`event: done\ndata: {}\n\n`);
      res.end();
      return;
    }

    const emitter = new SseProgressEmitter(res);

    // ── Detect client disconnect ──
    // APO6: abort the in-flight Opus research when the client goes away so we
    // stop paying for a result nobody will receive.
    const ctrl = new AbortController();
    let clientGone = false;
    req.on("close", () => {
      clientGone = true;
      ctrl.abort();
      logger.info({ brand: input.brand }, "Research SSE client disconnected");
      emitter.close();
    });

    // ── Run research ──
    try {
      const { brief, cost } = await researchProspect(input, emitter, ctrl.signal);
      // L2: the Opus research ran and billed — record its spend so it counts
      // toward the daily cap and the admin/weekly rollups (previously the cap
      // pre-check above was self-referentially inert on this route because
      // nothing here ever wrote the spend). Best-effort; recorded even on
      // client disconnect since the cost was already incurred.
      await recordDailyLlmSpend(userId, cost.usd).catch((e) =>
        logger.error({ e }, "research spend record failed"),
      );
      if (clientGone) return;
      res.write(`event: result\ndata: ${JSON.stringify({ brief, cost })}\n\n`);
      emitter.close();
    } catch (err) {
      if (clientGone) return;
      const isResearchFailure = err instanceof ResearchFailedError;
      const detail = err instanceof Error ? err.message : String(err);
      logger.error(
        { err: detail, brand: input.brand, isResearchFailure },
        "Research stream failed",
      );
      // API4: never leak raw internal error text to the client. ResearchFailedError
      // messages are curated/user-facing; anything else gets a generic message
      // (full detail stays in the server log above).
      const clientMessage = isResearchFailure
        ? detail
        : "Research failed. Please try again.";
      res.write(`event: error\ndata: ${JSON.stringify({ message: clientMessage })}\n\n`);
      emitter.close();
    }
  } finally {
    // Release the per-user slot whether we ended early or ran research to
    // completion (this runs when the handler returns — i.e. after the research
    // promise settles or a disconnect short-circuits it).
    const remaining = (activeStreamsByUser.get(userId) ?? 1) - 1;
    if (remaining <= 0) activeStreamsByUser.delete(userId);
    else activeStreamsByUser.set(userId, remaining);
  }
}
