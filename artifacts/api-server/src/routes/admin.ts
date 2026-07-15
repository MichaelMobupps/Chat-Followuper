import { Router, type IRouter, type Request, type Response } from "express";
import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z, ZodError } from "zod/v4";
import {
  db,
  actionLogsTable,
  usersTable,
  dailyUsageTable,
  llmCallsTable,
  ACTION_TYPES,
} from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { isAdminEmail } from "../lib/admin";

const router: IRouter = Router();

/**
 * Read a numeric costUsd off an action_logs metadata blob, if present.
 * Generation actions record { costUsd, ... }; most actions record nothing.
 */
function readCostUsd(metadata: unknown): number | null {
  if (metadata && typeof metadata === "object" && "costUsd" in metadata) {
    const c = (metadata as Record<string, unknown>).costUsd;
    return typeof c === "number" ? c : null;
  }
  return null;
}

/**
 * GET /api/admin/whoami
 *
 * Any signed-in user may ask whether they are an admin. The UI uses this to
 * show or hide the manager features. Not gated by requireAdmin, since a
 * salesperson must be able to learn that the answer is "no".
 */
router.get(
  "/admin/whoami",
  requireAuth,
  (req: Request, res: Response): void => {
    res.json({ isAdmin: isAdminEmail(req.user!.email) });
  },
);

/**
 * GET /api/admin/activity
 *
 * The manager feed: every salesperson's recent activity and spend in one
 * place, grouped by salesperson. This deliberately crosses the per-user
 * isolation that protects ordinary reps, so it sits behind requireAdmin and
 * is the only place that boundary is crossed for reads.
 *
 * Spend totals come from the authoritative daily_usage rollup. Per-event
 * cost, where it exists, comes from the action_logs metadata. Events are
 * capped at the most recent EVENT_CAP across everyone; full pagination is a
 * later enhancement once volumes warrant it.
 */
router.get(
  "/admin/activity",
  requireAuth,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const EVENT_CAP = 1000;

    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        // Kill switch (2026-07-15): the admin page renders the toggle from this
        // feed, so it must know each rep's current state. Also the reason a rep
        // with zero recent activity may be entirely explainable.
        followupsPaused: usersTable.followupsPaused,
      })
      .from(usersTable);

    const spendRows = await db
      .select({
        userId: dailyUsageTable.userId,
        totalSpendUsd: sql<string>`COALESCE(SUM(${dailyUsageTable.anthropicSpendUsd}), 0)`,
      })
      .from(dailyUsageTable)
      .groupBy(dailyUsageTable.userId);
    const spendByUser = new Map(
      spendRows.map((r) => [r.userId, Number(r.totalSpendUsd)]),
    );

    // Accurate all-time event count per rep, independent of the recent
    // window below, so the manager numbers are not understated when the
    // window is crowded by another rep's activity.
    const countRows = await db
      .select({ userId: actionLogsTable.userId, total: count() })
      .from(actionLogsTable)
      .groupBy(actionLogsTable.userId);
    const totalEventsByUser = new Map(
      countRows
        .filter((r) => r.userId != null)
        .map((r) => [r.userId as string, Number(r.total)]),
    );

    const events = await db
      .select({
        id: actionLogsTable.id,
        userId: actionLogsTable.userId,
        actionType: actionLogsTable.actionType,
        actionStatus: actionLogsTable.actionStatus,
        prospectId: actionLogsTable.prospectId,
        followupId: actionLogsTable.followupId,
        metadata: actionLogsTable.metadata,
        executedAt: actionLogsTable.executedAt,
      })
      .from(actionLogsTable)
      .orderBy(desc(actionLogsTable.executedAt))
      .limit(EVENT_CAP);

    type EventOut = {
      id: string;
      actionType: string;
      actionStatus: string;
      prospectId: string | null;
      followupId: number | null;
      costUsd: number | null;
      executedAt: Date;
    };
    const eventsByUser = new Map<string, EventOut[]>();
    for (const e of events) {
      if (!e.userId) continue;
      const arr = eventsByUser.get(e.userId) ?? [];
      arr.push({
        id: e.id,
        actionType: e.actionType,
        actionStatus: e.actionStatus,
        prospectId: e.prospectId,
        followupId: e.followupId,
        costUsd: readCostUsd(e.metadata),
        executedAt: e.executedAt,
      });
      eventsByUser.set(e.userId, arr);
    }

    const reps = users
      .map((u) => {
        const userEvents = eventsByUser.get(u.id) ?? [];
        return {
          user: u,
          totalSpendUsd: spendByUser.get(u.id) ?? 0,
          totalEventCount: totalEventsByUser.get(u.id) ?? 0,
          recentEventCount: userEvents.length,
          events: userEvents,
        };
      })
      .sort((a, b) => b.totalSpendUsd - a.totalSpendUsd);

    res.json({
      reps,
      totals: {
        spendUsd: reps.reduce((s, r) => s + r.totalSpendUsd, 0),
        totalEventCount: reps.reduce((s, r) => s + r.totalEventCount, 0),
        eventsShown: events.length,
      },
      eventCap: EVENT_CAP,
    });
  },
);

/**
 * GET /api/admin/ops-dashboard
 *
 * Today's digest and Pushover notification counts for ops monitoring.
 */
router.get(
  "/admin/ops-dashboard",
  requireAuth,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const today = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(`${today}T00:00:00.000Z`);

    const [digestToday, pushoverToday, digestUsage, pushoverUsage] =
      await Promise.all([
        db
          .select({ total: count() })
          .from(actionLogsTable)
          .where(
            and(
              eq(actionLogsTable.actionType, ACTION_TYPES.digestSent),
              gte(actionLogsTable.executedAt, todayStart),
            ),
          ),
        db
          .select({ total: count() })
          .from(actionLogsTable)
          .where(
            and(
              eq(actionLogsTable.actionType, ACTION_TYPES.pushoverDigestSent),
              gte(actionLogsTable.executedAt, todayStart),
            ),
          ),
        db
          .select({ total: count() })
          .from(dailyUsageTable)
          .where(
            and(
              eq(dailyUsageTable.date, today),
              eq(dailyUsageTable.digestSent, true),
            ),
          ),
        db
          .select({ total: count() })
          .from(dailyUsageTable)
          .where(
            and(
              eq(dailyUsageTable.date, today),
              eq(dailyUsageTable.pushoverSent, true),
            ),
          ),
      ]);

    res.json({
      date: today,
      digest: {
        actionLogCount: Number(digestToday[0]?.total ?? 0),
        dailyUsageCount: Number(digestUsage[0]?.total ?? 0),
      },
      pushover: {
        actionLogCount: Number(pushoverToday[0]?.total ?? 0),
        dailyUsageCount: Number(pushoverUsage[0]?.total ?? 0),
      },
    });
  },
);

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  // Neutralize spreadsheet formula injection: a cell beginning with = + - @
  // (or a tab / CR that Excel treats as a formula lead-in) can execute code
  // when the admin opens the export in Excel/Sheets. Prefix such cells with a
  // single quote so they are rendered as literal text.
  const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * GET /api/admin/audit-export.csv
 *
 * Full action_logs export for compliance / manager review.
 */
router.get(
  "/admin/audit-export.csv",
  requireAuth,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select({
        id: actionLogsTable.id,
        userId: actionLogsTable.userId,
        prospectId: actionLogsTable.prospectId,
        followupId: actionLogsTable.followupId,
        actionType: actionLogsTable.actionType,
        actionStatus: actionLogsTable.actionStatus,
        durationMs: actionLogsTable.durationMs,
        errorDetail: actionLogsTable.errorDetail,
        metadata: actionLogsTable.metadata,
        executedAt: actionLogsTable.executedAt,
      })
      .from(actionLogsTable)
      .orderBy(desc(actionLogsTable.executedAt));

    const header =
      "id,userId,prospectId,followupId,actionType,actionStatus,durationMs,errorDetail,metadata,executedAt";
    const lines = rows.map((r) =>
      [
        r.id,
        r.userId,
        r.prospectId,
        r.followupId,
        r.actionType,
        r.actionStatus,
        r.durationMs,
        r.errorDetail,
        r.metadata,
        r.executedAt,
      ]
        .map(csvEscape)
        .join(","),
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="audit-export.csv"',
    );
    res.status(200).send([header, ...lines].join("\n"));
  },
);

/**
 * POST /api/admin/users/:id/followups-pause
 *
 * The admin kill switch: pause or resume one rep's follow-ups.
 *
 * This is the only write in this file, and the only action in the product where
 * one user silently changes another's behaviour — the rep sees their sends stop,
 * cannot undo it, and has no in-app way to learn who did it. So it is audited
 * with the ACTOR's email, on the TARGET's timeline.
 *
 * Enforcement lives on the 11 send paths, not here. This endpoint only flips a
 * boolean; see users.followups_paused for what the flag does and does NOT stop
 * (not first messages, not the weekly stats digest).
 */
const pauseBodySchema = z
  .object({
    paused: z.boolean(),
  })
  .strict();

router.post(
  "/admin/users/:id/followups-pause",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    let body: z.infer<typeof pauseBodySchema>;
    try {
      body = pauseBodySchema.parse(req.body ?? {});
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      throw err;
    }

    const targetId = String(req.params.id);
    // Explicit existence check rather than trusting the UPDATE's row count: a
    // no-such-user request must 404, not silently report success on a typo'd id.
    const targetRows = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, targetId))
      .limit(1);
    const target = targetRows[0];
    if (!target) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    await db
      .update(usersTable)
      .set({ followupsPaused: body.paused })
      .where(eq(usersTable.id, targetId));

    // Audited on the TARGET's timeline (that's where the effect shows up), but
    // naming the ACTOR. Best-effort, like every other action_logs write here —
    // a lost audit row must not fail the pause, since leaving a rep sending
    // when an admin has decided to stop them is the worse outcome.
    await db
      .insert(actionLogsTable)
      .values({
        userId: targetId,
        actionType: ACTION_TYPES.adminFollowupsPauseToggled,
        actionStatus: "success",
        metadata: {
          paused: body.paused,
          actorEmail: req.user!.email,
          actorId: req.user!.id,
          targetEmail: target.email,
        },
      })
      .catch(() => {});

    res.json({ id: targetId, followupsPaused: body.paused });
  },
);

/**
 * GET /api/admin/llm-spend?days=30
 *
 * The per-call ledger, rolled up. This is the view the ledger exists for:
 * daily_usage can only say "this rep spent $X today"; this can say which model,
 * on what task, for whom.
 *
 * THREE THINGS IT DELIBERATELY SURFACES RATHER THAN HIDES:
 *
 *  - `unattributed`: spend with no user (userId null). It is its own line, never
 *    filtered out. Money we cannot attribute is exactly what an accounting view
 *    must show — dropping it would make the page reconcile to the wrong number
 *    while looking tidy.
 *  - `unpricedCalls`: calls whose model had no price entry, booked at $0 by
 *    computeCost. Without this the totals silently under-report after a model-id
 *    bump, which is the most likely way this data goes wrong.
 *  - `coverageStartsAt`: the oldest ledger row. Per-model history CANNOT be
 *    backfilled (model names are discarded at the action_logs boundary), so the
 *    numbers start at deploy day. A spend view whose window predates its own
 *    data would otherwise read as "we spent nothing in June".
 */
router.get(
  "/admin/llm-spend",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    // Clamped, not just parsed: this scans an append-only unbounded table, and
    // ?days=999999 from a curl would seq-scan it.
    const daysRaw = Number(req.query.days ?? 30);
    const days = Number.isFinite(daysRaw)
      ? Math.min(Math.max(Math.trunc(daysRaw), 1), 365)
      : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const inWindow = gte(llmCallsTable.createdAt, since);

    const [byUser, byModel, byTask, totals, unattributed, coverage] =
      await Promise.all([
        db
          .select({
            userId: llmCallsTable.userId,
            email: usersTable.email,
            name: usersTable.name,
            costUsd: sql<string>`coalesce(sum(${llmCallsTable.costUsd}), 0)`,
            calls: count(),
          })
          .from(llmCallsTable)
          // LEFT join: an inner join would drop rows whose user was deleted
          // (user_id goes null, by design — the spend outlives the user), which
          // is precisely the spend we must not lose.
          .leftJoin(usersTable, eq(llmCallsTable.userId, usersTable.id))
          .where(inWindow)
          .groupBy(llmCallsTable.userId, usersTable.email, usersTable.name)
          .orderBy(desc(sql`sum(${llmCallsTable.costUsd})`)),
        db
          .select({
            model: llmCallsTable.model,
            costUsd: sql<string>`coalesce(sum(${llmCallsTable.costUsd}), 0)`,
            calls: count(),
            inputTokens: sql<string>`coalesce(sum(${llmCallsTable.inputTokens}), 0)`,
            outputTokens: sql<string>`coalesce(sum(${llmCallsTable.outputTokens}), 0)`,
            unpricedCalls: sql<string>`coalesce(sum(case when ${llmCallsTable.costUnpriced} then 1 else 0 end), 0)`,
          })
          .from(llmCallsTable)
          .where(inWindow)
          .groupBy(llmCallsTable.model)
          .orderBy(desc(sql`sum(${llmCallsTable.costUsd})`)),
        db
          .select({
            task: llmCallsTable.task,
            costUsd: sql<string>`coalesce(sum(${llmCallsTable.costUsd}), 0)`,
            calls: count(),
          })
          .from(llmCallsTable)
          .where(inWindow)
          .groupBy(llmCallsTable.task)
          .orderBy(desc(sql`sum(${llmCallsTable.costUsd})`)),
        db
          .select({
            costUsd: sql<string>`coalesce(sum(${llmCallsTable.costUsd}), 0)`,
            calls: count(),
            unpricedCalls: sql<string>`coalesce(sum(case when ${llmCallsTable.costUnpriced} then 1 else 0 end), 0)`,
          })
          .from(llmCallsTable)
          .where(inWindow),
        db
          .select({
            costUsd: sql<string>`coalesce(sum(${llmCallsTable.costUsd}), 0)`,
            calls: count(),
          })
          .from(llmCallsTable)
          .where(and(inWindow, isNull(llmCallsTable.userId))),
        db
          .select({ oldest: sql<string | null>`min(${llmCallsTable.createdAt})` })
          .from(llmCallsTable),
      ]);

    res.json({
      days,
      since: since.toISOString(),
      // The ledger cannot see further back than its own first row, and per-model
      // history is not backfillable. Surfaced so the UI can say "since <date>"
      // instead of implying a silent zero.
      coverageStartsAt: coverage[0]?.oldest ?? null,
      totals: {
        costUsd: Number(totals[0]?.costUsd ?? 0),
        calls: totals[0]?.calls ?? 0,
        unpricedCalls: Number(totals[0]?.unpricedCalls ?? 0),
      },
      unattributed: {
        costUsd: Number(unattributed[0]?.costUsd ?? 0),
        calls: unattributed[0]?.calls ?? 0,
      },
      byUser: byUser.map((r) => ({
        userId: r.userId,
        email: r.email,
        name: r.name,
        costUsd: Number(r.costUsd),
        calls: r.calls,
      })),
      byModel: byModel.map((r) => ({
        model: r.model,
        costUsd: Number(r.costUsd),
        calls: r.calls,
        inputTokens: Number(r.inputTokens),
        outputTokens: Number(r.outputTokens),
        unpricedCalls: Number(r.unpricedCalls),
      })),
      byTask: byTask.map((r) => ({
        task: r.task,
        costUsd: Number(r.costUsd),
        calls: r.calls,
      })),
    });
  },
);

export default router;
