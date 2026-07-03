import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z, ZodError } from "zod/v4";
import {
  db,
  usersTable,
  dailyUsageTable,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getFeatureFlags } from "../lib/featureFlags";
import { isSmtpConfigured } from "../lib/smtpConfigured";
import { isPushoverAppConfigured } from "../services/pushover";
import { appPublicUrl } from "../lib/appPublicUrl";
import { sendMail } from "../services/mailer";

const router: IRouter = Router();

const PREFERRED_CHANNELS = ["whatsapp", "telegram", "teams", "slack"] as const;

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

function apolloMonthlyRevealCap(): number {
  const raw = Number(process.env.APOLLO_MONTHLY_REVEAL_CAP ?? 100);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100;
}

function monthBoundsUtc(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  );
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

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

    let baseUrl: string;
    try {
      baseUrl = appPublicUrl();
    } catch {
      baseUrl = "";
    }

    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;color:#111;">
  <p>Hi ${row.name ?? "there"},</p>
  <p>This is a <strong>test</strong> follow-up digest from Chat Followuper. When real follow-ups are due, you'll get a similar email with one <strong>Follow up</strong> button per prospect.</p>
  <p style="color:#6b7280;font-size:12px;">App URL: ${baseUrl || "(not configured)"}</p>
</div>`;

    try {
      await sendMail(
        row.email,
        "[Test] Follow-up digest preview",
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
    const { start, end } = monthBoundsUtc();
    const cap = apolloMonthlyRevealCap();

    const usageRows = await db
      .select({
        total: sql<string>`COALESCE(SUM(${dailyUsageTable.apolloRevealsUsed}), 0)`,
      })
      .from(dailyUsageTable)
      .where(
        and(
          eq(dailyUsageTable.userId, user.id),
          gte(dailyUsageTable.date, start),
          lte(dailyUsageTable.date, end),
        ),
      );

    const used = Number(usageRows[0]?.total ?? 0);

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