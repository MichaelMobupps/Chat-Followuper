import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, followupsTable, prospectsTable, usersTable } from "@workspace/db";
import { verifyOpenToken } from "../lib/followupLinkToken";
import { appPublicUrl } from "../lib/appPublicUrl";
import { generateAndPersistFollowupMessage } from "../services/followupMessageService";

const router: IRouter = Router();

function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

function senderNameFromUser(name: string | null, email: string): string {
  if (name?.trim()) return name.trim().split(/\s+/)[0]!;
  return email.split("@")[0] ?? "there";
}

function dashboardFallback(): string {
  try {
    return `${appPublicUrl()}/contacts`;
  } catch {
    return "/contacts";
  }
}

/**
 * GET /api/followups/fallback/:id?t=<token>
 *
 * HTML fallback when the chat deep link fails (e.g. mobile browser blocks
 * wa.me redirect). Shows the message for copy-paste plus a retry link.
 */
router.get(
  "/followups/fallback/:id",
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
          prospectName: prospectsTable.prospectName,
          company: prospectsTable.company,
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
        res.status(403).send("<p>Invalid or expired link.</p>");
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

      const base = appPublicUrl();
      const retryUrl = `${base}/api/followups/open/${followupId}?t=${encodeURIComponent(token)}`;
      const confirmUrl = `${base}/api/followups/confirm/${followupId}?t=${encodeURIComponent(token)}`;
      const who = escapeHtml(row.prospectName ?? "Prospect");
      const co = row.company ? ` at ${escapeHtml(row.company)}` : "";

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Follow up — ${who}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 2rem auto; padding: 0 1rem; color: #111; }
    textarea { width: 100%; min-height: 140px; font-size: 16px; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; }
    .btn { display: inline-block; background: #10b981; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 12px; border: none; font-size: 16px; cursor: pointer; }
    .btn-outline { background: #fff; color: #374151; border: 1px solid #d1d5db; }
    .muted { color: #6b7280; font-size: 14px; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; align-items: center; }
  </style>
</head>
<body>
  <h1>Follow up with ${who}${co}</h1>
  <p class="muted">Channel: ${escapeHtml(row.channel)}. Copy the message below, or tap <strong>Retry open</strong> to try the chat link again.</p>
  <textarea readonly id="msg">${escapeHtml(messageBody)}</textarea>
  <p><button type="button" onclick="navigator.clipboard.writeText(document.getElementById('msg').value)">Copy message</button></p>
  <div class="actions">
    <a class="btn" href="${retryUrl}">Retry open</a>
    <form method="POST" action="${confirmUrl}" style="margin:0">
      <button class="btn" type="submit">Yes, I sent it</button>
    </form>
  </div>
  <p class="muted">Only tap <strong>Yes, I sent it</strong> after you press Send in the chat app.</p>
</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.status(200).send(html);
    } catch (err) {
      console.error("[followup-fallback] failed", err);
      res.status(500).send("<p>Something went wrong. Please try again from your digest email.</p>");
    }
  },
);

export default router;