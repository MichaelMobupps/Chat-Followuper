import { Router, type IRouter, type Request, type Response } from "express";
import { z, ZodError } from "zod/v4";
import { requireAuth } from "../middlewares/auth";
import { prepareFirstMessage } from "../services/manualContactPrepare";
import { GeoGateBlockedError } from "../services/channels/whatsapp";
import { isChannelCode } from "../lib/channelRegister";

const router: IRouter = Router();

const bodySchema = z
  .object({
    channel: z.enum(["whatsapp", "telegram"]).optional(),
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

export default router;