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

/**
 * Minimal session shape this route needs. The session middleware running
 * upstream (cookie-parser + signed session cookie) is expected to attach a
 * `session` property with at least `userId` set when the request is from
 * an authenticated @mobupps.com user. If the property is missing, this
 * route refuses to proceed — defense in depth against routing accidents
 * where the middleware is wired in the wrong order.
 */
interface RequestWithSession extends Request {
  session?: { userId?: string; email?: string };
}

export async function researchStreamRoute(req: Request, res: Response): Promise<void> {
  // ── Explicit auth gate — defense in depth ──
  // The session middleware should have attached a session before this
  // handler runs. Verify it actually did, in case middleware ordering is
  // ever changed and this endpoint accidentally becomes public.
  const session = (req as RequestWithSession).session;
  if (!session || !session.userId) {
    res.status(401).setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Unauthenticated. Sign in with your @mobupps.com Google account." }));
    return;
  }

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
    res.write(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
    res.write(`event: done\ndata: {}\n\n`);
    res.end();
    return;
  }

  const emitter = new SseProgressEmitter(res);

  // ── Detect client disconnect ──
  let clientGone = false;
  req.on("close", () => {
    clientGone = true;
    logger.info({ brand: input.brand }, "Research SSE client disconnected");
    emitter.close();
  });

  // ── Run research ──
  try {
    const { brief, cost } = await researchProspect(input, emitter);
    if (clientGone) return;
    res.write(`event: result\ndata: ${JSON.stringify({ brief, cost })}\n\n`);
    emitter.close();
  } catch (err) {
    if (clientGone) return;
    const isResearchFailure = err instanceof ResearchFailedError;
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: message, brand: input.brand, isResearchFailure },
      "Research stream failed",
    );
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    emitter.close();
  }
}
