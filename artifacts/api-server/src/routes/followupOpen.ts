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
import { recordSendIntent as recordLinkedinSendIntent } from "../services/channels/linkedin";
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
          linkedinUrl: prospectsTable.linkedinUrl,
          followupPaused: prospectsTable.followupPaused,
          replied: prospectsTable.replied,
          userName: usersTable.name,
          userEmail: usersTable.email,
          // Admin kill switch (2026-07-15). This route is TOKEN-authed from a
          // digest email link — loadUser never runs and req.user is undefined,
          // so the flag cannot come from the session and must be read here.
          followupsPaused: usersTable.followupsPaused,
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

      // followupsPaused = the admin kill switch (2026-07-15). Gated BEFORE the
      // generate below, so a paused rep's stale digest link costs no LLM spend.
      // Redirects like every other terminal state here rather than erroring —
      // this URL is opened from an email by a human, so the dashboard (which
      // can explain the pause) is a better destination than a JSON error.
      if (
        row.sentAt ||
        row.followupPaused ||
        row.followupsPaused ||
        row.replied === 1
      ) {
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
      if (row.channel === "linkedin") {
        // LinkedIn has no message-prefill deep link, and a bare 302 to the
        // profile would drop the generated message on the floor (a server
        // redirect can't touch the clipboard). Route to the copy-paste fallback
        // page instead: it shows the message + a Copy button + an "Open LinkedIn
        // profile" button, so the rep copies, opens the profile, and pastes.
        if (!row.linkedinUrl) {
          res.redirect(302, dashboardFallback());
          return;
        }
        const t = encodeURIComponent(token);
        res.redirect(
          302,
          `${appPublicUrl()}/api/followups/fallback/${followupId}?t=${t}`,
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
          // Admin kill switch (2026-07-15).
          followupsPaused: usersTable.followupsPaused,
        })
        .from(followupsTable)
        .innerJoin(
          prospectsTable,
          eq(followupsTable.prospectId, prospectsTable.id),
        )
        // usersTable was NOT joined here before the kill switch, unlike its
        // sibling GET /followups/open/:id above — which is exactly why this
        // path is easy to miss: the two endpoints sit in one file and read as
        // symmetric, but only one of them could see the users row. The join is
        // required for the gate below.
        .innerJoin(usersTable, eq(prospectsTable.userId, usersTable.id))
        .where(eq(followupsTable.id, followupId))
        .limit(1);

      const row = rows[0];
      if (!row || !verifyOpenToken(token, followupId, row.userId)) {
        res.status(403).send("<p>Invalid or expired link.</p>");
        return;
      }

      // DELIBERATELY NOT gated on followupsPaused (the admin kill switch), and
      // this reverses the first attempt — audit 2026-07-15.
      //
      // This endpoint SENDS NOTHING. It records that a human already sent: this
      // is a manual-send tool, so the click in WhatsApp IS the send, and by the
      // time confirm is called the message is gone. Blocking the stamp cannot
      // un-send it — it only loses the fact, leaving the row scheduled + unsent
      // forever. See services/channels/whatsapp.ts:104, which documents exactly
      // that state: "every due query keeps re-listing it ... duplicate
      // outreach". So a pause landing between open and confirm would make the
      // prospect receive the same follow-up TWICE on unpause. The gate would
      // prevent no send and cause a real one.
      //
      // The switch is enforced where sends actually originate — the digest, the
      // pushover nudges, and GET /open above, which is what hands out the deep
      // link. A paused rep cannot get a new link; if they still have an old one,
      // recording the truth beats pretending it didn't happen.
      //
      // followupPaused (the rep's own per-prospect flag) is left exactly as it
      // was found: pre-existing behaviour, not this change's to alter.
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
      } else if (row.channel === "linkedin") {
        await recordLinkedinSendIntent(input);
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