import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, followupsTable, prospectsTable } from "@workspace/db";
import { verifyOpenToken } from "../lib/followupLinkToken";
import { generateLink } from "../services/channels/whatsapp";
import { generateLink as generateTelegramLink } from "../services/channels/telegram";

const router: IRouter = Router();

function dashboardFallback(): string {
  const base = (process.env.APP_PUBLIC_URL ?? "").replace(/\/+$/, "");
  return `${base}/followup/whatsapp`;
}

/**
 * GET /api/followups/open/:id?t=<token>
 *
 * Public and token-authenticated, since it is clicked from an email with no
 * session cookie. It resolves the current deep link for a due follow-up and
 * 302-redirects the rep into the chat with the message prefilled. The rep
 * presses send.
 *
 * Hardening: the entire handler is wrapped, so any unexpected condition
 * (missing secret, link-builder throw, database error) falls back to the
 * dashboard rather than surfacing a 500 on a public route. Referrer-Policy
 * is set to no-referrer so the signed token is not leaked to WhatsApp or
 * Telegram through the Referer header on the outbound redirect.
 */
router.get(
  "/followups/open/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const followupId = Number(req.params.id);
      const token = String(req.query.t ?? "");
      if (!Number.isInteger(followupId) || token.length === 0) {
        res.redirect(302, dashboardFallback());
        return;
      }

      const rows = await db
        .select({
          channel: followupsTable.channel,
          generatedMessage: followupsTable.generatedMessage,
          sentAt: followupsTable.sentAt,
          userId: prospectsTable.userId,
          phone: prospectsTable.phone,
          telegramHandle: prospectsTable.telegramHandle,
          followupPaused: prospectsTable.followupPaused,
          replied: prospectsTable.replied,
        })
        .from(followupsTable)
        .innerJoin(
          prospectsTable,
          eq(followupsTable.prospectId, prospectsTable.id),
        )
        .where(eq(followupsTable.id, followupId))
        .limit(1);

      const row = rows[0];
      if (!row || !verifyOpenToken(token, followupId, row.userId)) {
        res.redirect(302, dashboardFallback());
        return;
      }

      if (
        row.sentAt ||
        row.followupPaused ||
        row.replied === 1 ||
        !row.generatedMessage
      ) {
        res.redirect(302, dashboardFallback());
        return;
      }

      res.setHeader("Referrer-Policy", "no-referrer");

      if (row.channel === "whatsapp") {
        if (!row.phone) {
          res.redirect(302, dashboardFallback());
          return;
        }
        res.redirect(302, generateLink(row.phone, row.generatedMessage));
        return;
      }
      if (row.channel === "telegram") {
        const identifier = row.telegramHandle ?? row.phone;
        if (!identifier) {
          res.redirect(302, dashboardFallback());
          return;
        }
        res.redirect(
          302,
          generateTelegramLink(identifier, row.generatedMessage),
        );
        return;
      }
      res.redirect(302, dashboardFallback());
    } catch (err) {
      console.error("[followup-open] failed", err);
      res.redirect(302, dashboardFallback());
    }
  },
);

export default router;
