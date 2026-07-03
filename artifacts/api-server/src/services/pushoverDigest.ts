import { and, eq, isNull, lte } from "drizzle-orm";
import {
  db,
  followupsTable,
  prospectsTable,
  usersTable,
  dailyUsageTable,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";
import { mintOpenToken } from "../lib/followupLinkToken";
import { appPublicUrl } from "../lib/appPublicUrl";
import {
  isPushoverScheduleNow,
  todayInPushoverTimezone,
} from "../lib/pushoverSchedule";
import { isPushoverQuietNow } from "../lib/pushoverQuietHours";
import { isFeatureEnabled } from "../lib/featureFlags";
import { isPushoverAppConfigured, sendPushover } from "./pushover";
import { sendOverdueEscalations } from "./pushoverNudges";

export interface PushoverDigestResult {
  usersNotified: number;
  messagesSent: number;
  usersSkipped: number;
  usersFailed: number;
  escalationsSent: number;
}

interface DueRow {
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

function shortPushoverMessage(row: DueRow): string {
  const who = row.prospectName ?? "Prospect";
  return `${who} · stage ${row.stage} · tap to follow up`;
}

/**
 * Weekday midday (GMT+2) Pushover batch for due follow-ups.
 * Independent of the email digest hour — one notification per due
 * follow-up, at most once per rep per calendar day (GMT+2).
 * Respects per-rep quiet hours; escalations run after the batch.
 */
export async function runPushoverDigests(): Promise<PushoverDigestResult> {
  const empty: PushoverDigestResult = {
    usersNotified: 0,
    messagesSent: 0,
    usersSkipped: 0,
    usersFailed: 0,
    escalationsSent: 0,
  };

  if (!isPushoverAppConfigured() || !isFeatureEnabled("pushover")) {
    return empty;
  }

  if (!isPushoverScheduleNow()) {
    return empty;
  }

  const today = todayInPushoverTimezone();

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
        isNull(followupsTable.sentAt),
        lte(followupsTable.scheduledAt, new Date()),
        eq(prospectsTable.followupPaused, false),
        eq(prospectsTable.replied, 0),
      ),
    )) as DueRow[];

  const byUser = new Map<string, DueRow[]>();
  for (const r of rows) {
    if (!r.pushoverUserKey?.trim()) continue;
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  let usersNotified = 0;
  let messagesSent = 0;
  let usersSkipped = 0;
  let usersFailed = 0;
  const base = appPublicUrl();

  for (const [userId, list] of byUser) {
    try {
      const sample = list[0]!;
      if (
        isPushoverQuietNow({
          pushoverQuietHourStart: sample.pushoverQuietHourStart,
          pushoverQuietHourEnd: sample.pushoverQuietHourEnd,
          digestTimezone: sample.digestTimezone,
        })
      ) {
        usersSkipped += 1;
        continue;
      }

      const already = await db
        .select({ pushoverSent: dailyUsageTable.pushoverSent })
        .from(dailyUsageTable)
        .where(
          and(
            eq(dailyUsageTable.userId, userId),
            eq(dailyUsageTable.date, today),
          ),
        )
        .limit(1);
      if (already[0]?.pushoverSent) {
        usersSkipped += 1;
        continue;
      }

      const key = sample.pushoverUserKey!.trim();
      const n = list.length;
      let pushSent = 0;

      for (let i = 0; i < list.length; i++) {
        const row = list[i]!;
        const token = mintOpenToken(row.followupId, row.userId);
        const url = `${base}/api/followups/open/${row.followupId}?t=${token}`;
        try {
          await sendPushover({
            userKey: key,
            title: n === 1 ? "Follow-up due" : `Due (${i + 1}/${n})`,
            message: shortPushoverMessage(row),
            url,
            urlTitle: "Follow up",
            priority: 1,
          });
          pushSent += 1;
        } catch (pushErr) {
          console.error(
            `[pushover-digest] failed followup ${row.followupId} user ${userId}`,
            pushErr,
          );
        }
      }

      if (pushSent === 0) {
        usersFailed += 1;
        continue;
      }

      await db
        .insert(dailyUsageTable)
        .values({ userId, date: today, pushoverSent: true })
        .onConflictDoUpdate({
          target: [dailyUsageTable.userId, dailyUsageTable.date],
          set: { pushoverSent: true },
        });

      await db.insert(actionLogsTable).values({
        userId,
        actionType: ACTION_TYPES.pushoverDigestSent,
        actionStatus: "success" as const,
        metadata: { followupCount: pushSent, schedule: "weekday_midday_gmt2" },
      });

      usersNotified += 1;
      messagesSent += pushSent;
    } catch (err) {
      usersFailed += 1;
      console.error(`[pushover-digest] failed for user ${userId}`, err);
    }
  }

  let escalationsSent = 0;
  try {
    escalationsSent = await sendOverdueEscalations();
  } catch (err) {
    console.error("[pushover-digest] escalation helper failed", err);
  }

  return {
    usersNotified,
    messagesSent,
    usersSkipped,
    usersFailed,
    escalationsSent,
  };
}