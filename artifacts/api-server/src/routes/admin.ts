import { Router, type IRouter, type Request, type Response } from "express";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import {
  db,
  actionLogsTable,
  usersTable,
  dailyUsageTable,
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
  const s =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
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

export default router;
