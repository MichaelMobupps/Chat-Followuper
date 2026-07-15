import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, prospectsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  generateLink,
  recordSendIntent as recordWhatsappSendIntent,
  GeoGateBlockedError,
  InvalidPhoneError,
} from "../services/channels/whatsapp";
import {
  generateLink as generateTelegramLink,
  recordSendIntent as recordTelegramSendIntent,
} from "../services/channels/telegram";
import {
  generateLink as generateLinkedinLink,
  recordSendIntent as recordLinkedinSendIntent,
} from "../services/channels/linkedin";
import { isChannelCode, type ChannelCode } from "../lib/channelRegister";

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

    if (!prospect.phone) {
      res.status(409).json({ error: "phone_reveal_pending" });
      return;
    }

    try {
      const url = generateLink(prospect.phone, prospect.firstMessageBody);
      res.status(200).json({ url, body: prospect.firstMessageBody });
    } catch (err) {
      if (err instanceof InvalidPhoneError) {
        res.status(422).json({ error: "invalid_phone" });
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

interface SendIntentBody {
  followupId: number | null;
  channel?: string;
}

function isSendIntentBody(value: unknown): value is SendIntentBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!("followupId" in v)) return false;
  if (v.followupId !== null && typeof v.followupId !== "number") return false;
  if (
    "channel" in v &&
    v.channel !== undefined &&
    typeof v.channel !== "string"
  ) {
    return false;
  }
  return true;
}

async function resolveSendChannel(
  prospectId: string,
  userId: string,
  requested?: string,
): Promise<ChannelCode> {
  if (requested && isChannelCode(requested)) return requested;
  const rows = await db
    .select({ firstMessageChannel: prospectsTable.firstMessageChannel })
    .from(prospectsTable)
    .where(
      and(
        eq(prospectsTable.id, prospectId),
        eq(prospectsTable.userId, userId),
      ),
    )
    .limit(1);
  const stored = rows[0]?.firstMessageChannel;
  if (stored && isChannelCode(stored)) return stored;
  return "whatsapp";
}

router.get(
  "/prospects/:id/telegram-link",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const prospectId = String(req.params.id);

    const rows = await db
      .select({
        phone: prospectsTable.phone,
        telegramHandle: prospectsTable.telegramHandle,
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

    const identifier = prospect.telegramHandle ?? prospect.phone;
    if (!identifier) {
      res.status(409).json({ error: "no_telegram_identifier" });
      return;
    }

    const url = generateTelegramLink(identifier, prospect.firstMessageBody);
    res.status(200).json({ url, body: prospect.firstMessageBody });
  },
);

router.get(
  "/prospects/:id/linkedin-link",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const prospectId = String(req.params.id);

    const rows = await db
      .select({
        linkedinUrl: prospectsTable.linkedinUrl,
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

    // Mirrors telegram-link's no-identifier guard. LinkedIn is clipboard-only:
    // the "url" is the profile URL (no message prefill) and the FE copies the
    // body to the clipboard, same as the telegram fallback + the Contacts page.
    if (!prospect.linkedinUrl) {
      res.status(409).json({ error: "no_linkedin_identifier" });
      return;
    }

    // generateLinkedinLink canonicalizes + enforces the linkedin.com host, so
    // a poisoned linkedin_url can't become an off-site link here.
    const url = generateLinkedinLink(
      prospect.linkedinUrl,
      prospect.firstMessageBody,
    );
    res.status(200).json({ url, body: prospect.firstMessageBody });
  },
);

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

    // A2: verify the prospect exists AND belongs to the caller BEFORE recording
    // anything. The followupId branch is owner-scoped (API1), but the
    // subsequent action_logs insert uses this URL prospectId — without this
    // guard a caller could stamp an audit row referencing another tenant's
    // prospect (cross-tenant timeline pollution), and a nonexistent UUID hits
    // the action_logs FK and 500s the whole transaction instead of a clean 404.
    const ownRows = await db
      .select({
        id: prospectsTable.id,
        // Kill switch (2026-07-15): needed for the pause gate below. This
        // select previously fetched `id` alone — the route checked ownership
        // and NOTHING else.
        followupPaused: prospectsTable.followupPaused,
      })
      .from(prospectsTable)
      .where(
        and(
          eq(prospectsTable.id, prospectId),
          eq(prospectsTable.userId, user.id),
        ),
      )
      .limit(1);
    const ownProspect = ownRows[0];
    if (!ownProspect) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // NO PAUSE GATE HERE — deliberately, and this REVERSES the first attempt
    // (audit 2026-07-15). The absence looked like a hole; it is load-bearing.
    //
    // This endpoint sends nothing. It records that a human already sent — the
    // click in WhatsApp/Telegram/LinkedIn IS the send (manual-send tool), so by
    // the time we are called the message is gone. A pause cannot un-send it.
    // Blocking the stamp would only lose the fact, leaving the row scheduled +
    // unsent — the state services/channels/whatsapp.ts:104 documents as causing
    // "duplicate outreach" when every due query re-lists it. So the gate would
    // prevent zero sends and CAUSE a real one, to a prospect who already got the
    // message. Recording the truth beats a tidy-looking flag.
    //
    // The switch is enforced where sends originate: the digest + pushover
    // (surfacing), and send-next-followup / followups open+fallback (which hand
    // out the deep link). A paused rep cannot obtain a new link; if they still
    // hold an old one, we want the send recorded, not hidden.
    //
    // NB this is also why the route serves both first messages and follow-ups
    // safely: it is a recorder, not a sender, so the flags — both named for
    // FOLLOW-UPS — have nothing to say about it either way.

    const channel = await resolveSendChannel(
      prospectId,
      user.id,
      req.body.channel,
    );

    try {
      const input = {
        prospectId,
        userId: user.id,
        followupId: req.body.followupId,
      };
      if (channel === "telegram") {
        await recordTelegramSendIntent(input);
      } else if (channel === "whatsapp") {
        await recordWhatsappSendIntent(input);
      } else if (channel === "linkedin") {
        await recordLinkedinSendIntent(input);
      } else {
        // Defensive: ChannelCode is exhaustively handled above.
        res.status(501).json({ error: "channel_not_implemented", channel });
        return;
      }
      res.status(200).json({ ok: true, channel });
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