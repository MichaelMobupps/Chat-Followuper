import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  db,
  followupsTable,
  prospectsTable,
  usersTable,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";
import { mintOpenToken } from "../lib/followupLinkToken";
import { appPublicUrl } from "../lib/appPublicUrl";
import { isPushoverQuietNow } from "../lib/pushoverQuietHours";
import { isFeatureEnabled } from "../lib/featureFlags";
import { CHANNEL_CODES } from "../lib/channelRegister";
import { isPushoverAppConfigured, sendPushover } from "./pushover";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const ESCALATION_ACTION = ACTION_TYPES.pushoverEscalationSent;
const MONDAY_NUDGE_ACTION = ACTION_TYPES.pushoverMondayNudgeSent;

export interface PushoverNudgeResult {
  escalationsSent: number;
  mondayNudgesSent: number;
  skipped: number;
  errors: number;
}

function isMondayInTimezone(timezone: string): boolean {
  try {
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(new Date());
    return wd === "Mon";
  } catch {
    return new Date().getUTCDay() === 1;
  }
}

function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function alreadyLoggedToday(
  userId: string,
  actionType: string,
  dayKey: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: actionLogsTable.id })
    .from(actionLogsTable)
    .where(
      and(
        eq(actionLogsTable.userId, userId),
        eq(actionLogsTable.actionType, actionType),
        sql`${actionLogsTable.metadata}->>'dayKey' = ${dayKey}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

interface OverdueRow {
  followupId: number;
  stage: number;
  channel: string;
  userId: string;
  prospectName: string | null;
  company: string | null;
  pushoverUserKey: string | null;
  pushoverQuietHourStart: number;
  pushoverQuietHourEnd: number;
  digestTimezone: string;
}

/**
 * Escalation Pushover for follow-ups 2+ days overdue. Idempotent per
 * follow-up per calendar day via action_logs metadata.followupId + dayKey.
 */
export async function sendOverdueEscalations(): Promise<number> {
  if (!isPushoverAppConfigured() || !isFeatureEnabled("pushoverNudges")) {
    return 0;
  }

  const cutoff = new Date(Date.now() - TWO_DAYS_MS);
  const base = appPublicUrl();
  let sent = 0;

  const rows = (await db
    .select({
      followupId: followupsTable.id,
      stage: followupsTable.stage,
      channel: followupsTable.channel,
      userId: prospectsTable.userId,
      prospectName: prospectsTable.prospectName,
      company: prospectsTable.company,
      pushoverUserKey: usersTable.pushoverUserKey,
      pushoverQuietHourStart: usersTable.pushoverQuietHourStart,
      pushoverQuietHourEnd: usersTable.pushoverQuietHourEnd,
      digestTimezone: usersTable.digestTimezone,
    })
    .from(followupsTable)
    .innerJoin(prospectsTable, eq(followupsTable.prospectId, prospectsTable.id))
    .innerJoin(usersTable, eq(prospectsTable.userId, usersTable.id))
    .where(
      and(
        eq(followupsTable.status, "scheduled"),
        // F4/D2: exclude removed-channel (teams/slack) zombie rows from the
        // priority-1 overdue escalation.
        inArray(followupsTable.channel, [...CHANNEL_CODES]),
        isNull(followupsTable.sentAt),
        lte(followupsTable.scheduledAt, cutoff),
        eq(prospectsTable.followupPaused, false),
        // Admin kill switch (2026-07-15). This is the priority-1 escalation —
        // it BYPASSES quiet hours, so an ungated paused rep would be woken up
        // for follow-ups the switch is meant to have stopped. Third copy of the
        // due-row predicate; see fetchDueRows.
        eq(usersTable.followupsPaused, false),
        eq(prospectsTable.replied, 0),
      ),
    )) as OverdueRow[];

  for (const row of rows) {
    const key = row.pushoverUserKey?.trim();
    if (!key) continue;

    if (
      isPushoverQuietNow({
        pushoverQuietHourStart: row.pushoverQuietHourStart,
        pushoverQuietHourEnd: row.pushoverQuietHourEnd,
        digestTimezone: row.digestTimezone,
      })
    ) {
      continue;
    }

    const dayKey = todayInTimezone(row.digestTimezone);
    const dup = await db
      .select({ id: actionLogsTable.id })
      .from(actionLogsTable)
      .where(
        and(
          eq(actionLogsTable.userId, row.userId),
          eq(actionLogsTable.actionType, ESCALATION_ACTION),
          sql`${actionLogsTable.metadata}->>'followupId' = ${String(row.followupId)}`,
          sql`${actionLogsTable.metadata}->>'dayKey' = ${dayKey}`,
        ),
      )
      .limit(1);
    if (dup.length > 0) continue;

    const token = mintOpenToken(row.followupId, row.userId);
    const url = `${base}/api/followups/open/${row.followupId}?t=${token}`;
    const who = row.prospectName ?? "prospect";

    try {
      await sendPushover({
        userKey: key,
        title: "Overdue follow-up",
        message: `${who} — stage ${row.stage} is 2+ days overdue. Tap to follow up.`,
        url,
        urlTitle: "Follow up",
        priority: 1,
      });

      await db.insert(actionLogsTable).values({
        userId: row.userId,
        followupId: row.followupId,
        actionType: ESCALATION_ACTION,
        actionStatus: "success",
        metadata: { followupId: row.followupId, dayKey, stage: row.stage },
      });
      sent += 1;
    } catch (err) {
      console.error(
        `[pushover-nudges] escalation failed followup ${row.followupId}`,
        err,
      );
    }
  }

  return sent;
}

/**
 * Monday morning nudge to clear the due queue. One per rep per Monday
 * (idempotent via action_logs dayKey).
 */
export async function sendMondayQueueClearNudges(): Promise<number> {
  if (!isPushoverAppConfigured() || !isFeatureEnabled("pushoverNudges")) {
    return 0;
  }

  const base = appPublicUrl();
  let sent = 0;

  const users = await db
    .select({
      id: usersTable.id,
      pushoverUserKey: usersTable.pushoverUserKey,
      digestTimezone: usersTable.digestTimezone,
      pushoverQuietHourStart: usersTable.pushoverQuietHourStart,
      pushoverQuietHourEnd: usersTable.pushoverQuietHourEnd,
      // Admin kill switch (2026-07-15). Unlike every other send path, this
      // query has NO where-clause — it fans out to every user in the system and
      // filters per-user in JS below — so there is no predicate to attach the
      // gate to. It has to be selected here and enforced in the loop.
      followupsPaused: usersTable.followupsPaused,
    })
    .from(usersTable);

  for (const user of users) {
    const key = user.pushoverUserKey?.trim();
    if (!key) continue;
    // Admin kill switch (2026-07-15) — gate BEFORE the due-count query, so a
    // paused rep costs no work and gets no nudge. The due-count query below
    // filters by user.id and never joins usersTable, so this `continue` is the
    // only place the flag can be enforced on this path.
    if (user.followupsPaused) continue;
    if (!isMondayInTimezone(user.digestTimezone)) continue;

    if (
      isPushoverQuietNow({
        pushoverQuietHourStart: user.pushoverQuietHourStart,
        pushoverQuietHourEnd: user.pushoverQuietHourEnd,
        digestTimezone: user.digestTimezone,
      })
    ) {
      continue;
    }

    const dayKey = todayInTimezone(user.digestTimezone);
    if (await alreadyLoggedToday(user.id, MONDAY_NUDGE_ACTION, dayKey)) {
      continue;
    }

    const dueCountRows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(followupsTable)
      .innerJoin(
        prospectsTable,
        eq(followupsTable.prospectId, prospectsTable.id),
      )
      .where(
        and(
          eq(prospectsTable.userId, user.id),
          eq(followupsTable.status, "scheduled"),
          // F4/D2: exclude removed-channel (teams/slack) zombie rows.
          inArray(followupsTable.channel, [...CHANNEL_CODES]),
          isNull(followupsTable.sentAt),
          lte(followupsTable.scheduledAt, new Date()),
          eq(prospectsTable.followupPaused, false),
          eq(prospectsTable.replied, 0),
        ),
      );

    const dueCount = dueCountRows[0]?.total ?? 0;
    if (dueCount === 0) continue;

    try {
      await sendPushover({
        userKey: key,
        title: "Monday queue",
        message: `You have ${dueCount} follow-up${dueCount === 1 ? "" : "s"} due. Start the week by clearing your queue.`,
        url: `${base}/today`,
        urlTitle: "Open Today",
        priority: 0,
      });

      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: MONDAY_NUDGE_ACTION,
        actionStatus: "success",
        metadata: { dayKey, dueCount },
      });
      sent += 1;
    } catch (err) {
      console.error(`[pushover-nudges] monday nudge failed user ${user.id}`, err);
    }
  }

  return sent;
}

export async function runPushoverNudges(): Promise<PushoverNudgeResult> {
  const result: PushoverNudgeResult = {
    escalationsSent: 0,
    mondayNudgesSent: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    result.escalationsSent = await sendOverdueEscalations();
  } catch (err) {
    result.errors += 1;
    console.error("[pushover-nudges] escalation batch failed", err);
  }

  try {
    result.mondayNudgesSent = await sendMondayQueueClearNudges();
  } catch (err) {
    result.errors += 1;
    console.error("[pushover-nudges] monday batch failed", err);
  }

  return result;
}