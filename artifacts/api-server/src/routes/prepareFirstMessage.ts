import { Router, type IRouter, type Request, type Response } from "express";
import { z, ZodError } from "zod/v4";
import { requireAuth } from "../middlewares/auth";
import { prepareFirstMessage } from "../services/manualContactPrepare";
import {
  setPrepareProgress,
  getPrepareProgress,
} from "../services/prepareProgress";
import { GeoGateBlockedError } from "../services/channels/whatsapp";
import { isChannelCode } from "../lib/channelRegister";

const router: IRouter = Router();

const bodySchema = z
  .object({
    channel: z.enum(["whatsapp", "telegram", "linkedin"]).optional(),
    // Regenerate: re-run the writer even if a message is already cached.
    // Default false keeps every existing caller on the free cached path.
    force: z.boolean().optional(),
  })
  .strict();

// ── Regenerate rate limit (AUDIT [High]) ──────────────────────────────────
//
// Before `force`, this route was cheap to repeat: a prospect with a cached
// firstMessageBody short-circuited to a single DB read, so hammering it burned
// nothing and no limit was needed. `force:true` re-runs the writer→critic→lint
// chain on EVERY call (and full research when the brief is missing), which
// turns the endpoint into a cost-DoS surface.
//
// assertUnderDailyLlmCap is not sufficient on its own: it's off unless
// LLM_DAILY_SPEND_CAP_USD is set (.env.example ships it empty), and it's a
// read-then-check pre-check, so N concurrent calls all read the same
// pre-increment total and all pass. This bounds the concurrent burst; the cap
// bounds the daily total. Same sliding-window shape as prospector.ts's
// checkResolveCompanyRateLimit (kept local — that one is module-private).
//
// Only `force` calls are limited: the cached path stays free, so a normal
// add → generate → send flow can never trip this.
const REGEN_WINDOW_MS = 60_000;
const REGEN_MAX_CALLS = 10;
const REGEN_MAP_MAX_USERS = 5000;
const _regenRateMap = new Map<string, number[]>();

function checkRegenRateLimit(userId: string): {
  ok: boolean;
  resetMs: number;
} {
  const now = Date.now();
  const cutoff = now - REGEN_WINDOW_MS;
  // Bounded memory: drop fully-expired entries once the map gets large.
  if (_regenRateMap.size > REGEN_MAP_MAX_USERS) {
    for (const [uid, calls] of _regenRateMap) {
      if (calls.length === 0 || calls[calls.length - 1]! <= cutoff) {
        _regenRateMap.delete(uid);
      }
    }
  }
  const fresh = (_regenRateMap.get(userId) ?? []).filter((t) => t > cutoff);
  if (fresh.length >= REGEN_MAX_CALLS) {
    return { ok: false, resetMs: fresh[0]! + REGEN_WINDOW_MS - now };
  }
  fresh.push(now);
  _regenRateMap.set(userId, fresh);
  return { ok: true, resetMs: REGEN_WINDOW_MS };
}

function senderNameFor(req: Request): string {
  const user = req.user!;
  if (user.name?.trim()) {
    return user.name.trim().split(/\s+/)[0]!;
  }
  return user.email.split("@")[0] ?? "there";
}

/**
 * POST /api/prospects/:id/prepare-first-message
 *
 * For manually ingested contacts: run research (if needed), generate the
 * stage-0 message via the doctrine pipeline, and return a send-ready deep
 * link.
 */
router.post(
  "/prospects/:id/prepare-first-message",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const prospectId = String(req.params.id);

    let body: z.infer<typeof bodySchema> = {};
    try {
      body = bodySchema.parse(req.body ?? {});
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      throw err;
    }

    const channel =
      body.channel && isChannelCode(body.channel) ? body.channel : undefined;

    const force = body.force === true;

    // Rate-limit BEFORE stamping progress: a rejected call starts no run, so
    // it must not overwrite the progress entry of one that's actually live.
    if (force) {
      const rl = checkRegenRateLimit(user.id);
      if (!rl.ok) {
        res
          .status(429)
          .setHeader("Retry-After", String(Math.ceil(rl.resetMs / 1000)))
          .json({ error: "rate_limited" });
        return;
      }
    }

    // Progress (Phase H): mark the run as accepted before any pipeline work
    // so the FE's first poll already sees a live entry.
    setPrepareProgress(user.id, prospectId, "queued");

    try {
      const result = await prepareFirstMessage({
        prospectId,
        userId: user.id,
        senderName: senderNameFor(req),
        channel,
        force,
      });
      res.status(200).json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Progress (Phase H): surface the failure to the polling FE with a
      // short reason code, then keep the existing error contract unchanged.
      setPrepareProgress(user.id, prospectId, "error", msg.slice(0, 120));
      if (msg === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (msg === "missing_company") {
        res.status(409).json({ error: "missing_company" });
        return;
      }
      if (msg === "no_phone" || msg === "no_telegram_identifier") {
        res.status(409).json({ error: msg });
        return;
      }
      // Regenerate refused: the first message already went out, and rewriting
      // it would leave the follow-up chain citing text the prospect never saw.
      if (msg === "already_sent") {
        res.status(409).json({ error: "already_sent" });
        return;
      }
      if (err instanceof GeoGateBlockedError) {
        res.status(422).json({ error: "geo_blocked", country: err.country });
        return;
      }
      throw err;
    }
  },
);

/**
 * GET /api/prospects/:id/prepare-progress
 *
 * Poll endpoint for the Contacts progress bar (Phase H). Returns the
 * current stage of an in-flight (or recently finished) prepare run.
 * Progress entries are keyed by (userId, prospectId), so a caller can only
 * ever see their own runs; an unknown/expired run returns stage "idle".
 */
router.get(
  "/prospects/:id/prepare-progress",
  requireAuth,
  (req: Request, res: Response): void => {
    const user = req.user!;
    const prospectId = String(req.params.id);
    const entry = getPrepareProgress(user.id, prospectId);
    if (!entry) {
      res.status(200).json({ stage: "idle", pct: 0 });
      return;
    }
    res.status(200).json({
      stage: entry.stage,
      pct: entry.pct,
      startedAt: entry.startedAt,
      updatedAt: entry.updatedAt,
      ...(entry.error ? { error: entry.error } : {}),
    });
  },
);

export default router;