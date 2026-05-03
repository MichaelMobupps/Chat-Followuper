import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, prospectsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  generateLink,
  recordSendIntent,
  GeoGateBlockedError,
} from "../services/channels/whatsapp";

const router: IRouter = Router();

router.get(
  "/prospects/:id/whatsapp-link",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const prospectId = String(req.params.id);

    const rows = await db
      .select({
        phone: prospectsTable.phone,
        firstMessageBody: prospectsTable.firstMessageBody,
      })
      .from(prospectsTable)
      .where(
        and(
          eq(prospectsTable.id, prospectId),
          eq(prospectsTable.userId, user.id),
        ),
      )
      .limit(1);

    const prospect = rows[0];
    if (!prospect) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    if (!prospect.firstMessageBody || prospect.firstMessageBody.length === 0) {
      res.status(409).json({ error: "no_message_generated" });
      return;
    }

    try {
      const url = generateLink(prospect.phone, prospect.firstMessageBody);
      res.status(200).json({ url, body: prospect.firstMessageBody });
    } catch (err) {
      if (err instanceof GeoGateBlockedError) {
        res.status(422).json({ error: "geo_blocked", country: err.country });
        return;
      }
      throw err;
    }
  },
);

interface SendIntentBody {
  followupId: number | null;
}

function isSendIntentBody(value: unknown): value is SendIntentBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    "followupId" in v &&
    (v.followupId === null || typeof v.followupId === "number")
  );
}

router.post(
  "/prospects/:id/send-intent",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const prospectId = String(req.params.id);

    if (!isSendIntentBody(req.body)) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }

    try {
      await recordSendIntent({
        prospectId,
        userId: user.id,
        followupId: req.body.followupId,
      });
      res.status(200).json({ ok: true });
    } catch (err) {
      if (err instanceof GeoGateBlockedError) {
        res.status(422).json({ error: "geo_blocked", country: err.country });
        return;
      }
      throw err;
    }
  },
);

export default router;