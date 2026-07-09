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
import { appPublicUrl } from "../lib/appPublicUrl";
import {
  isPushoverAppConfigured,
  isValidPushoverUserKey,
  sendPushover,
} from "../services/pushover";

const router: IRouter = Router();

const PUSHOVER_KEY_SCHEMA = z
  .string()
  .trim()
  .refine((v) => v === "" || isValidPushoverUserKey(v), {
    message: "Pushover user key must be 30 alphanumeric characters",
  });

// F-B: surface these alongside the Pushover key so the follow-ups menu can
// configure them in one place. The columns already existed on `users`; only
// the API + UI were missing.
const PREFERRED_CHANNELS = ["whatsapp", "telegram", "linkedin"] as const;

// Reminders & schedule (2026-07-09): weekday arrays are 0=Sun..6=Sat.
// An EMPTY array is a deliberate "never" off-switch and is accepted.
const DAYS_SCHEMA = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

const patchSchema = z
  .object({
    pushoverUserKey: PUSHOVER_KEY_SCHEMA.nullable().optional(),
    pushoverQuietHourStart: z.number().int().min(0).max(23).optional(),
    pushoverQuietHourEnd: z.number().int().min(0).max(23).optional(),
    preferredChannel: z.enum(PREFERRED_CHANNELS).optional(),
    // Reminders & schedule: per-user reminder hour + day-of-week controls.
    pushoverHourLocal: z.number().int().min(0).max(23).optional(),
    pushoverDays: DAYS_SCHEMA.optional(),
    digestDays: DAYS_SCHEMA.optional(),
  })
  .strict();

function maskPushoverKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

router.get(
  "/users/me/notification-settings",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const rows = await db
      .select({
        pushoverUserKey: usersTable.pushoverUserKey,
        pushoverQuietHourStart: usersTable.pushoverQuietHourStart,
        pushoverQuietHourEnd: usersTable.pushoverQuietHourEnd,
        preferredChannel: usersTable.preferredChannel,
        pushoverHourLocal: usersTable.pushoverHourLocal,
        pushoverDays: usersTable.pushoverDays,
        digestDays: usersTable.digestDays,
      })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    // API7: never return the raw key — only the masked form. Round-tripping the
    // secret back to the client leaks it to anyone who can read the response.
    res.status(200).json({
      pushoverUserKeyMasked: maskPushoverKey(row.pushoverUserKey),
      pushoverEnabled: !!row.pushoverUserKey?.trim(),
      pushoverAppConfigured: isPushoverAppConfigured(),
      pushoverQuietHourStart: row.pushoverQuietHourStart,
      pushoverQuietHourEnd: row.pushoverQuietHourEnd,
      preferredChannel: row.preferredChannel,
      pushoverHourLocal: row.pushoverHourLocal,
      pushoverDays: row.pushoverDays,
      digestDays: row.digestDays,
    });
  },
);

router.patch(
  "/users/me/notification-settings",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;

    let body: z.infer<typeof patchSchema>;
    try {
      body = patchSchema.parse(req.body ?? {});
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      throw err;
    }

    const updates: {
      pushoverUserKey?: string | null;
      pushoverQuietHourStart?: number;
      pushoverQuietHourEnd?: number;
      preferredChannel?: string;
      pushoverHourLocal?: number;
      pushoverDays?: number[];
      digestDays?: number[];
    } = {};
    if (body.pushoverUserKey !== undefined) {
      updates.pushoverUserKey =
        body.pushoverUserKey === "" || body.pushoverUserKey === null
          ? null
          : body.pushoverUserKey.trim();
    }
    if (body.pushoverQuietHourStart !== undefined) {
      updates.pushoverQuietHourStart = body.pushoverQuietHourStart;
    }
    if (body.pushoverQuietHourEnd !== undefined) {
      updates.pushoverQuietHourEnd = body.pushoverQuietHourEnd;
    }
    if (body.preferredChannel !== undefined) {
      updates.preferredChannel = body.preferredChannel;
    }
    if (body.pushoverHourLocal !== undefined) {
      updates.pushoverHourLocal = body.pushoverHourLocal;
    }
    if (body.pushoverDays !== undefined) {
      updates.pushoverDays = body.pushoverDays;
    }
    if (body.digestDays !== undefined) {
      updates.digestDays = body.digestDays;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "empty_patch" });
      return;
    }

    const updated = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, user.id))
      .returning({
        pushoverUserKey: usersTable.pushoverUserKey,
        pushoverQuietHourStart: usersTable.pushoverQuietHourStart,
        pushoverQuietHourEnd: usersTable.pushoverQuietHourEnd,
        preferredChannel: usersTable.preferredChannel,
        pushoverHourLocal: usersTable.pushoverHourLocal,
        pushoverDays: usersTable.pushoverDays,
        digestDays: usersTable.digestDays,
      });

    const row = updated[0];
    if (!row) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    await db.insert(actionLogsTable).values({
      userId: user.id,
      actionType: ACTION_TYPES.notificationSettingsUpdated,
      actionStatus: "success",
      metadata: {
        patchedFields: Object.keys(updates),
        pushoverEnabled: !!row.pushoverUserKey,
      },
    });

    // API7: masked-only response (see GET handler).
    res.status(200).json({
      pushoverUserKeyMasked: maskPushoverKey(row.pushoverUserKey),
      pushoverEnabled: !!row.pushoverUserKey?.trim(),
      pushoverAppConfigured: isPushoverAppConfigured(),
      pushoverQuietHourStart: row.pushoverQuietHourStart,
      pushoverQuietHourEnd: row.pushoverQuietHourEnd,
      preferredChannel: row.preferredChannel,
      pushoverHourLocal: row.pushoverHourLocal,
      pushoverDays: row.pushoverDays,
      digestDays: row.digestDays,
    });
  },
);

/**
 * POST /api/users/me/test-pushover
 *
 * Sends a test notification to the rep's configured Pushover key so they
 * can verify mobile delivery and tap-through before real follow-ups arrive.
 */
router.post(
  "/users/me/test-pushover",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;

    if (!isPushoverAppConfigured()) {
      res.status(503).json({ error: "pushover_not_configured" });
      return;
    }

    const rows = await db
      .select({ pushoverUserKey: usersTable.pushoverUserKey })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    const key = rows[0]?.pushoverUserKey?.trim();
    if (!key) {
      res.status(409).json({ error: "pushover_user_key_missing" });
      return;
    }

    let contactsUrl: string;
    try {
      contactsUrl = `${appPublicUrl()}/contacts`;
    } catch {
      contactsUrl = "/contacts";
    }

    try {
      await sendPushover({
        userKey: key,
        title: "Chat Followuper test",
        message:
          "Pushover reminders are working. Real follow-ups will look like this — tap Follow up to open WhatsApp/Telegram with the message prefilled.",
        url: contactsUrl,
        urlTitle: "Open Contacts",
        priority: 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: "pushover_send_failed", detail: msg });
      return;
    }

    await db.insert(actionLogsTable).values({
      userId: user.id,
      actionType: ACTION_TYPES.pushoverTestSent,
      actionStatus: "success",
    });

    res.status(200).json({ ok: true });
  },
);

export default router;