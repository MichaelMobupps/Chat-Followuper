import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, followupsTable, prospectsTable, usersTable } from "@workspace/db";
import { verifyOpenToken } from "../lib/followupLinkToken";
import {
  generateLink,
  recordSendIntent as recordWhatsappSendIntent,
} from "../services/channels/whatsapp";
import {
  generateLink as generateTelegramLink,
  recordSendIntent as recordTelegramSendIntent,
} from "../services/channels/telegram";
import { generateAndPersistFollowupMessage } from "../services/followupMessageService";
import { appPublicUrl } from "../lib/appPublicUrl";

const router: IRouter = Router();

function dashboardFallback(): string {
  try {
    return `${appPublicUrl()}/contacts`;
  } catch {
    return "/contacts";
  }
}

function senderNameFromUser(name: string | null, email: string): string {
  if (name?.trim()) return name.trim().split(/\s+/)[0]!;
  return email.split("@")[0] ?? "there";
}

/**
 * GET /api/followups/open/:id?t=<token>
 *
 * Public and token-authenticated (clicked from digest email). Generates the
 * follow-up message on demand if needed (doctrine + critic + lint), then
 * 302-redirects the rep into the chat with the message prefilled.
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
          prospectId: prospectsTable.id,
          generatedMessage: followupsTable.generatedMessage,
          sentAt: followupsTable.sentAt,
          clickedAt: followupsTable.clickedAt,
          userId: prospectsTable.userId,
          phone: prospectsTable.phone,
          telegramHandle: prospectsTable.telegramHandle,
          followupPaused: prospectsTable.followupPaused,
          replied: prospectsTable.replied,
          userName: usersTable.name,
          userEmail: usersTable.email,
        })
        .from(followupsTable)
        .innerJoin(
          prospectsTable,
          eq(followupsTable.prospectId, prospectsTable.id),
        )
        .innerJoin(usersTable, eq(prospectsTable.userId, usersTable.id))
        .where(eq(followupsTable.id, followupId))
        .limit(1);

      const row = rows[0];
      if (!row || !verifyOpenToken(token, followupId, row.userId)) {
        res.redirect(302, dashboardFallback());
        return;
      }

      if (row.sentAt || row.followupPaused || row.replied === 1) {
        res.redirect(302, dashboardFallback());
        return;
      }

      let messageBody = row.generatedMessage?.trim() ?? "";
      if (!messageBody) {
        const generated = await generateAndPersistFollowupMessage({
          followupId,
          userId: row.userId,
          senderName: senderNameFromUser(row.userName, row.userEmail),
        });
        messageBody = generated.message;
      }

      res.setHeader("Referrer-Policy", "no-referrer");

      if (row.channel === "whatsapp") {
        if (!row.phone) {
          res.redirect(302, dashboardFallback());
          return;
        }
        res.redirect(302, generateLink(row.phone, messageBody));
        return;
      }
      if (row.channel === "telegram") {
        const identifier = row.telegramHandle ?? row.phone;
        if (!identifier) {
          res.redirect(302, dashboardFallback());
          return;
        }
        res.redirect(302, generateTelegramLink(identifier, messageBody));
        return;
      }
      res.redirect(302, dashboardFallback());
    } catch (err) {
      console.error("[followup-open] failed", err);
      res.redirect(302, dashboardFallback());
    }
  },
);

/**
 * POST /api/followups/confirm/:id?t=<token>
 *
 * Token-authenticated send confirmation for digest email users (no session).
 * Records clickedAt / daily usage only after the rep confirms they pressed Send.
 */
router.post(
  "/followups/confirm/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const followupId = Number(req.params.id);
      const token = String(req.query.t ?? "");
      if (!Number.isInteger(followupId) || token.length === 0) {
        res.status(400).send("<p>Invalid request.</p>");
        return;
      }

      const rows = await db
        .select({
          channel: followupsTable.channel,
          prospectId: prospectsTable.id,
          sentAt: followupsTable.sentAt,
          userId: prospectsTable.userId,
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
        res.status(403).send("<p>Invalid or expired link.</p>");
        return;
      }

      if (row.sentAt || row.followupPaused || row.replied === 1) {
        res.redirect(302, dashboardFallback());
        return;
      }

      const input = {
        prospectId: row.prospectId,
        userId: row.userId,
        followupId,
      };
      if (row.channel === "telegram") {
        await recordTelegramSendIntent(input);
      } else {
        await recordWhatsappSendIntent(input);
      }

      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(
        "<!DOCTYPE html><html><body><p>Thanks — your send was recorded. You can close this tab.</p></body></html>",
      );
    } catch (err) {
      console.error("[followup-confirm] failed", err);
      res.status(500).send("<p>Something went wrong. Please try again from your digest email.</p>");
    }
  },
);

export default router;