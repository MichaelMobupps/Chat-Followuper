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
  })
  .strict();

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

    // Progress (Phase H): mark the run as accepted before any pipeline work
    // so the FE's first poll already sees a live entry.
    setPrepareProgress(user.id, prospectId, "queued");

    try {
      const result = await prepareFirstMessage({
        prospectId,
        userId: user.id,
        senderName: senderNameFor(req),
        channel,
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