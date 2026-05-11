/**
 * /api/sequence-config routes — Ticket 2.5-BE.
 *
 * User-level follow-up sequence configuration: stage timing (min/max
 * days between followups), doctrine variant per stage, send-day mask,
 * send-hour window, max followup count, manual-approval gating, and
 * daily digest delivery hour.
 *
 * All settings live on the users table (no separate table). One row
 * per user; this router reads and writes the authenticated user's row.
 *
 * Routes:
 *   GET   /api/users/me/sequence-config  — read current settings
 *   PATCH /api/users/me/sequence-config  — partial update
 *
 * Convention: matches 1.7-backend pattern — Zod validation, requireAuth,
 * scoped writes (user can only update their own row), action_logs entry
 * on update.
 *
 * Behavior note: this ticket stores the doctrineVariant per stage. The
 * message generator (services/messagePrompts.ts) does NOT yet consume
 * the variant — it still uses its hard-coded per-stage rotation logic.
 * A follow-up ticket will branch the critic prompt on the variant
 * choice so the SDR's selection actually changes what the LLM produces.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z, ZodError } from "zod/v4";
import {
  db,
  usersTable,
  actionLogsTable,
  ACTION_TYPES,
  DOCTRINE_VARIANTS,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────

const stageTimingSchema = z.object({
  minDays: z.number().int().min(0).max(365),
  maxDays: z.number().int().min(0).max(365),
  doctrineVariant: z.enum(DOCTRINE_VARIANTS).optional(),
}).refine(
  (val) => val.maxDays >= val.minDays,
  { message: "maxDays must be >= minDays", path: ["maxDays"] },
);

const sequenceConfigPatchSchema = z.object({
  stageTiming: z.array(stageTimingSchema).min(1).max(10).optional(),
  sendDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  sendHourStart: z.number().int().min(0).max(23).optional(),
  sendHourEnd: z.number().int().min(0).max(23).optional(),
  maxFollowups: z.number().int().min(0).max(20).optional(),
  requireApproval: z.boolean().optional(),
  digestHourLocal: z.number().int().min(0).max(23).optional(),
  digestTimezone: z.string().min(1).max(50).optional(),
}).refine(
  (val) => {
    // Cross-field: if both hour bounds are present, end must be > start.
    // Each can be patched alone; only check when both supplied in this
    // request body (we do NOT compare against the stored row, since the
    // expected admin UX is editing both together).
    if (val.sendHourStart !== undefined && val.sendHourEnd !== undefined) {
      return val.sendHourEnd > val.sendHourStart;
    }
    return true;
  },
  { message: "sendHourEnd must be > sendHourStart when both are provided", path: ["sendHourEnd"] },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/users/me/sequence-config
// ─────────────────────────────────────────────────────────────────

router.get(
  "/users/me/sequence-config",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;

    const rows = await db
      .select({
        stageTiming: usersTable.stageTiming,
        sendDays: usersTable.sendDays,
        sendHourStart: usersTable.sendHourStart,
        sendHourEnd: usersTable.sendHourEnd,
        maxFollowups: usersTable.maxFollowups,
        requireApproval: usersTable.requireApproval,
        digestHourLocal: usersTable.digestHourLocal,
        digestTimezone: usersTable.digestTimezone,
      })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      // Should be impossible given requireAuth, but defend against the
      // race where a session is still valid but the user row was deleted.
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    res.status(200).json(row);
  },
);

// ─────────────────────────────────────────────────────────────────
// PATCH /api/users/me/sequence-config
// ─────────────────────────────────────────────────────────────────

router.patch(
  "/users/me/sequence-config",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;

    let body;
    try {
      body = sequenceConfigPatchSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      throw err;
    }

    // Empty patch is a no-op success — matches the rest of the codebase.
    const keys = Object.keys(body) as (keyof typeof body)[];
    if (keys.length === 0) {
      const current = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);
      const row = current[0];
      if (!row) {
        res.status(404).json({ error: "user_not_found" });
        return;
      }
      res.status(200).json(extractSequenceConfig(row));
      return;
    }

    const updated = await db
      .update(usersTable)
      .set(body)
      .where(eq(usersTable.id, user.id))
      .returning();

    const row = updated[0];
    if (!row) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    // Audit log: record which fields were patched (not values, to keep
    // the log compact and avoid leaking config drift over time).
    await db.insert(actionLogsTable).values({
      userId: user.id,
      actionType: ACTION_TYPES.sequenceConfigUpdated,
      actionStatus: "success",
      metadata: { patchedFields: keys },
    });

    res.status(200).json(extractSequenceConfig(row));
  },
);

function extractSequenceConfig(row: typeof usersTable.$inferSelect) {
  return {
    stageTiming: row.stageTiming,
    sendDays: row.sendDays,
    sendHourStart: row.sendHourStart,
    sendHourEnd: row.sendHourEnd,
    maxFollowups: row.maxFollowups,
    requireApproval: row.requireApproval,
    digestHourLocal: row.digestHourLocal,
    digestTimezone: row.digestTimezone,
  };
}

export default router;
