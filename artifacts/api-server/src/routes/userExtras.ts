import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z, ZodError } from "zod/v4";
import {
  db,
  usersTable,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  apolloMonthlyRevealCap,
  monthBoundsUtc,
  monthlyApolloRevealsUsed,
} from "../lib/apolloRevealCap";
import { getFeatureFlags } from "../lib/featureFlags";
import { isSmtpConfigured } from "../lib/smtpConfigured";
import { isPushoverAppConfigured } from "../services/pushover";
import { appPublicUrl } from "../lib/appPublicUrl";
import { sendMail } from "../services/mailer";
import { fetchDueRows, renderDigestEmail } from "../services/followupDigest";

const router: IRouter = Router();

const PREFERRED_CHANNELS = ["whatsapp", "telegram", "linkedin"] as const;

const preferencesPatchSchema = z
  .object({
    preferredChannel: z.enum(PREFERRED_CHANNELS).optional(),
    messageTemplate: z.string().max(2000).nullable().optional(),
    pushoverQuietHourStart: z.number().int().min(0).max(23).optional(),
    pushoverQuietHourEnd: z.number().int().min(0).max(23).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field must be provided",
  });

function preferencesResponse(row: {
  preferredChannel: string;
  messageTemplate: string | null;
  pushoverQuietHourStart: number;
  pushoverQuietHourEnd: number;
}) {
  return {
    preferredChannel: row.preferredChannel,
    messageTemplate: row.messageTemplate,
    pushoverQuietHourStart: row.pushoverQuietHourStart,
    pushoverQuietHourEnd: row.pushoverQuietHourEnd,
  };
}

router.get(
  "/users/me/preferences",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const rows = await db
      .select({
        preferredChannel: usersTable.preferredChannel,
        messageTemplate: usersTable.messageTemplate,
        pushoverQuietHourStart: usersTable.pushoverQuietHourStart,
        pushoverQuietHourEnd: usersTable.pushoverQuietHourEnd,
      })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    res.status(200).json(preferencesResponse(row));
  },
);

router.patch(
  "/users/me/preferences",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;

    let body: z.infer<typeof preferencesPatchSchema>;
    try {
      body = preferencesPatchSchema.parse(req.body ?? {});
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      throw err;
    }

    const updates: Partial<{
      preferredChannel: string;
      messageTemplate: string | null;
      pushoverQuietHourStart: number;
      pushoverQuietHourEnd: number;
    }> = {};

    if (body.preferredChannel !== undefined) {
      updates.preferredChannel = body.preferredChannel;
    }
    if (body.messageTemplate !== undefined) {
      updates.messageTemplate =
        body.messageTemplate === null || body.messageTemplate.trim() === ""
          ? null
          : body.messageTemplate.trim();
    }
    if (body.pushoverQuietHourStart !== undefined) {
      updates.pushoverQuietHourStart = body.pushoverQuietHourStart;
    }
    if (body.pushoverQuietHourEnd !== undefined) {
      updates.pushoverQuietHourEnd = body.pushoverQuietHourEnd;
    }

    const updated = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, user.id))
      .returning({
        preferredChannel: usersTable.preferredChannel,
        messageTemplate: usersTable.messageTemplate,
        pushoverQuietHourStart: usersTable.pushoverQuietHourStart,
        pushoverQuietHourEnd: usersTable.pushoverQuietHourEnd,
      });

    const row = updated[0];
    if (!row) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    await db.insert(actionLogsTable).values({
      userId: user.id,
      actionType: ACTION_TYPES.sequenceConfigUpdated,
      actionStatus: "success",
      metadata: { patchedFields: Object.keys(body), via: "user_preferences" },
    });

    res.status(200).json(preferencesResponse(row));
  },
);

router.post(
  "/users/me/test-digest-email",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;

    if (!isSmtpConfigured()) {
      res.status(503).json({ error: "smtp_not_configured" });
      return;
    }

    const rows = await db
      .select({
        email: usersTable.email,
        name: usersTable.name,
      })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    // Render the REAL digest template (previously a static placeholder that
    // never exercised the per-row buttons). Prefer the user's actual due
    // rows — a true dry-run with working Follow-up links. When nothing is
    // due, fall back to clearly-labelled sample rows so the layout and both
    // buttons still preview (the sample Follow-up link is intentionally
    // dead: followupId 0 fails token validation on click).
    let dueRows = await fetchDueRows(user.id);
    let usedSamples = false;
    if (dueRows.length === 0) {
      usedSamples = true;
      dueRows = [
        {
          followupId: 0,
          stage: 1,
          channel: "whatsapp",
          userId: user.id,
          userEmail: row.email,
          userName: row.name,
          prospectName: "Jane Sample (example)",
          company: "Acme Corp",
          digestHourLocal: 9,
          digestTimezone: "UTC",
          digestDays: [0, 1, 2, 3, 4, 5, 6],
        },
        {
          followupId: 0,
          stage: 2,
          channel: "telegram",
          userId: user.id,
          userEmail: row.email,
          userName: row.name,
          prospectName: "Sam Sample (example)",
          company: "Globex",
          digestHourLocal: 9,
          digestTimezone: "UTC",
          digestDays: [0, 1, 2, 3, 4, 5, 6],
        },
      ];
    }

    let html: string;
    try {
      html = renderDigestEmail(row.name, dueRows);
    } catch {
      // appPublicUrl() throws when PUBLIC_BASE_URL is unset — surface that
      // as config error rather than a 500.
      res.status(503).json({ error: "public_base_url_not_configured" });
      return;
    }
    if (usedSamples) {
      html =
        `<p style="font-family:system-ui,-apple-system,sans-serif;background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;max-width:560px;font-size:13px;">TEST PREVIEW — no follow-ups are currently due, so the rows below are samples. Buttons in sample rows are inactive.</p>` +
        html;
    }

    try {
      await sendMail(
        row.email,
        usedSamples
          ? "[Test] Follow-up digest preview (sample rows)"
          : `[Test] Follow-up digest preview — ${dueRows.length} actually due`,
        html,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: "email_send_failed", detail: msg });
      return;
    }

    await db.insert(actionLogsTable).values({
      userId: user.id,
      actionType: ACTION_TYPES.digestSent,
      actionStatus: "success",
      metadata: { via: "test_digest_email" },
    });

    res.status(200).json({ ok: true });
  },
);

router.get(
  "/users/me/health-check",
  requireAuth,
  async (_req: Request, res: Response): Promise<void> => {
    let appUrlConfigured = false;
    let appUrl: string | null = null;
    try {
      appUrl = appPublicUrl();
      appUrlConfigured = true;
    } catch {
      appUrlConfigured = false;
    }

    const apolloConfigured = !!process.env.APOLLO_API_KEY?.trim();

    res.status(200).json({
      smtpConfigured: isSmtpConfigured(),
      pushoverConfigured: isPushoverAppConfigured(),
      apolloConfigured,
      appUrlConfigured,
      appUrl,
      featureFlags: getFeatureFlags(),
    });
  },
);

router.get(
  "/users/me/apollo-usage",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const { start } = monthBoundsUtc();
    const cap = apolloMonthlyRevealCap();
    const used = await monthlyApolloRevealsUsed(user.id);

    res.status(200).json({
      month: start.slice(0, 7),
      revealsUsed: used,
      revealCap: cap,
      remaining: Math.max(0, cap - used),
      capExceeded: used >= cap,
    });
  },
);

export default router;