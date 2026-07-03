import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  dailyUsageTable,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";
import { sendMail } from "./mailer";
import { isSmtpConfigured } from "../lib/smtpConfigured";
import { isFeatureEnabled } from "../lib/featureFlags";

export interface WeeklyDigestResult {
  usersEmailed: number;
  usersSkipped: number;
  usersFailed: number;
}

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

function isFridayInTimezone(timezone: string): boolean {
  if (process.env.WEEKLY_DIGEST_SKIP_DAY_CHECK === "true") return true;
  try {
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(new Date());
    return wd === "Fri";
  } catch {
    return new Date().getUTCDay() === 5;
  }
}

/**
 * Timezone-stable dedup key for the weekly digest (FUP4).
 *
 * The digest fires on the local Friday, so the local Friday's calendar date
 * (YYYY-MM-DD in the user's timezone) uniquely identifies the week and stays
 * constant across the whole local Friday. A UTC-derived key
 * (`${startUtc}_${endUtc}`) flips at UTC midnight — mid-Friday for any timezone
 * east of UTC (e.g. 03:00 in Asia/Jerusalem) — so a user emailed early on their
 * local Friday got a DIFFERENT key later that same local Friday and was emailed
 * a second time. Keying on the local date eliminates that.
 */
function weekKeyForTimezone(timezone: string): string {
  try {
    // en-CA formats as "YYYY-MM-DD".
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function weekBoundsUtc(): { start: string; end: string; label: string } {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 6);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  return { start: startStr, end: endStr, label: `${startStr} – ${endStr}` };
}

function renderWeeklyEmail(
  name: string | null,
  stats: {
    messagesGenerated: number;
    messagesSent: number;
    apolloRevealsUsed: number;
    anthropicSpendUsd: number;
  },
  weekLabel: string,
): string {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;color:#111;">
  <p>Hi ${escapeHtml(name ?? "there")},</p>
  <p>Your <strong>weekly summary</strong> for ${escapeHtml(weekLabel)}:</p>
  <ul>
    <li>Messages generated: <strong>${stats.messagesGenerated}</strong></li>
    <li>Messages sent: <strong>${stats.messagesSent}</strong></li>
    <li>Apollo reveals: <strong>${stats.apolloRevealsUsed}</strong></li>
    <li>AI spend (USD): <strong>$${stats.anthropicSpendUsd.toFixed(2)}</strong></li>
  </ul>
  <p style="color:#6b7280;font-size:12px;">Sent every Friday by Chat Followuper.</p>
</div>`;
}

async function alreadySentThisWeek(
  userId: string,
  weekKey: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: actionLogsTable.id })
    .from(actionLogsTable)
    .where(
      and(
        eq(actionLogsTable.userId, userId),
        eq(actionLogsTable.actionType, ACTION_TYPES.weeklyDigestSent),
        sql`${actionLogsTable.metadata}->>'weekKey' = ${weekKey}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Friday-only weekly stats email per rep. Idempotent per user per week
 * via action_logs metadata.weekKey.
 */
export async function runWeeklyDigests(): Promise<WeeklyDigestResult> {
  const result: WeeklyDigestResult = {
    usersEmailed: 0,
    usersSkipped: 0,
    usersFailed: 0,
  };

  if (!isSmtpConfigured() || !isFeatureEnabled("weeklyDigest")) {
    return result;
  }

  // start/end/label bound the stats window (last 7 days, UTC — approximate is
  // fine for the summary). The dedup key is computed PER-USER in their timezone
  // below (FUP4) so it can't flip mid-local-Friday.
  const { start, end, label } = weekBoundsUtc();

  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      digestTimezone: usersTable.digestTimezone,
    })
    .from(usersTable);

  for (const user of users) {
    try {
      if (!isFridayInTimezone(user.digestTimezone)) {
        result.usersSkipped += 1;
        continue;
      }

      // Per-user, timezone-stable dedup key (FUP4).
      const weekKey = weekKeyForTimezone(user.digestTimezone);

      if (await alreadySentThisWeek(user.id, weekKey)) {
        result.usersSkipped += 1;
        continue;
      }

      const statsRows = await db
        .select({
          messagesGenerated: sql<string>`COALESCE(SUM(${dailyUsageTable.messagesGenerated}), 0)`,
          messagesSent: sql<string>`COALESCE(SUM(${dailyUsageTable.messagesSent}), 0)`,
          apolloRevealsUsed: sql<string>`COALESCE(SUM(${dailyUsageTable.apolloRevealsUsed}), 0)`,
          anthropicSpendUsd: sql<string>`COALESCE(SUM(${dailyUsageTable.anthropicSpendUsd}), 0)`,
        })
        .from(dailyUsageTable)
        .where(
          and(
            eq(dailyUsageTable.userId, user.id),
            gte(dailyUsageTable.date, start),
            lte(dailyUsageTable.date, end),
          ),
        );

      const row = statsRows[0];
      const stats = {
        messagesGenerated: Number(row?.messagesGenerated ?? 0),
        messagesSent: Number(row?.messagesSent ?? 0),
        apolloRevealsUsed: Number(row?.apolloRevealsUsed ?? 0),
        anthropicSpendUsd: Number(row?.anthropicSpendUsd ?? 0),
      };

      await sendMail(
        user.email,
        "Your weekly follow-up summary",
        renderWeeklyEmail(user.name, stats, label),
      );

      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.weeklyDigestSent,
        actionStatus: "success",
        metadata: { weekKey, ...stats },
      });

      result.usersEmailed += 1;
    } catch (err) {
      result.usersFailed += 1;
      console.error(`[weekly-digest] failed for user ${user.id}`, err);
    }
  }

  return result;
}