import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
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
import { isUserPushoverScheduleNow } from "../lib/pushoverSchedule";
import { usageBucketDate } from "../lib/usageBucket";
import { isPushoverQuietNow } from "../lib/pushoverQuietHours";
import { isFeatureEnabled } from "../lib/featureFlags";
import { CHANNEL_CODES } from "../lib/channelRegister";
import { isPushoverAppConfigured, sendPushover } from "./pushover";

export interface PushoverDigestResult {
  usersNotified: number;
  messagesSent: number;
  usersSkipped: number;
  usersFailed: number;
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
  // Reminders & schedule (2026-07-09): per-user reminder hour + days.
  pushoverHourLocal: number;
  pushoverDays: number[];
}

function shortPushoverMessage(row: DueRow): string {
  const who = row.prospectName ?? "Prospect";
  return `${who} · stage ${row.stage} · tap to follow up`;
}

/**
 * Pushover batch for due follow-ups. Reminders & schedule (2026-07-09): the
 * fire time is PER-USER — the rep's configured local hour + days in their
 * own digestTimezone (previously a global weekday-midday-GMT+2 gate).
 * One notification per due follow-up, at most once per rep per LOCAL
 * calendar day. Respects per-rep quiet hours; escalations run after the batch.
 */
export async function runPushoverDigests(): Promise<PushoverDigestResult> {
  const empty: PushoverDigestResult = {
    usersNotified: 0,
    messagesSent: 0,
    usersSkipped: 0,
    usersFailed: 0,
  };

  if (!isPushoverAppConfigured() || !isFeatureEnabled("pushover")) {
    return empty;
  }

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
      pushoverHourLocal: usersTable.pushoverHourLocal,
      pushoverDays: usersTable.pushoverDays,
    })
    .from(followupsTable)
    .innerJoin(prospectsTable, eq(followupsTable.prospectId, prospectsTable.id))
    .innerJoin(usersTable, eq(prospectsTable.userId, usersTable.id))
    .where(
      and(
        eq(followupsTable.status, "scheduled"),
        // F4/D2: exclude removed-channel (teams/slack) zombie rows.
        inArray(followupsTable.channel, [...CHANNEL_CODES]),
        isNull(followupsTable.sentAt),
        lte(followupsTable.scheduledAt, new Date()),
        eq(prospectsTable.followupPaused, false),
        // Admin kill switch (2026-07-15). Duplicated from fetchDueRows rather
        // than shared because this predicate is ALREADY a copy of it (see the
        // comment on runPushoverDigests) — unifying them is a separate refactor
        // with its own blast radius, and leaving this ungated meanwhile would
        // mean a paused rep still gets buzzed for every due row.
        eq(usersTable.followupsPaused, false),
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
      // Reminders & schedule: per-user fire time (hour + days in the user's
      // own timezone) replaces the old global pre-gate.
      if (
        !isUserPushoverScheduleNow({
          pushoverHourLocal: sample.pushoverHourLocal,
          pushoverDays: sample.pushoverDays,
          digestTimezone: sample.digestTimezone,
        })
      ) {
        usersSkipped += 1;
        continue;
      }
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

      // At-most-once per the user's LOCAL calendar day (mirrors the email
      // digest's F2 fix — the old global-GMT+2 date could flip mid-window
      // for far-west timezones).
      const today = usageBucketDate(sample.digestTimezone);

      // FUP3: atomically CLAIM today's pushover slot BEFORE the send loop, so a
      // co-running scheduler + cron can't both blast the quiet-hours-bypassing
      // priority-1 batch. Exactly one runner's claim returns a row; the loser
      // skips. Replaces the check-then-send-then-mark TOCTOU.
      const claim = await db
        .insert(dailyUsageTable)
        .values({ userId, date: today, pushoverSent: true })
        .onConflictDoUpdate({
          target: [dailyUsageTable.userId, dailyUsageTable.date],
          set: { pushoverSent: true },
          setWhere: sql`${dailyUsageTable.pushoverSent} = false`,
        })
        .returning({ userId: dailyUsageTable.userId });
      if (claim.length === 0) {
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
        // FUP3: nothing delivered — RELEASE the claim so a later tick retries.
        await db
          .update(dailyUsageTable)
          .set({ pushoverSent: false })
          .where(
            and(
              eq(dailyUsageTable.userId, userId),
              eq(dailyUsageTable.date, today),
            ),
          )
          .catch(() => {});
        continue;
      }

      // Claim above already set pushover_sent=true — no post-send marker needed.
      await db.insert(actionLogsTable).values({
        userId,
        actionType: ACTION_TYPES.pushoverDigestSent,
        actionStatus: "success" as const,
        metadata: { followupCount: pushSent, schedule: "per_user_local" },
      });

      usersNotified += 1;
      messagesSent += pushSent;
    } catch (err) {
      usersFailed += 1;
      console.error(`[pushover-digest] failed for user ${userId}`, err);
    }
  }

  // FUP2: overdue escalations are sent ONLY by runPushoverNudges (the two ran
  // concurrently in the scheduler's Promise.all, double-buzzing every overdue
  // followup with a quiet-hours-bypassing priority-1 push). Single owner now.
  return {
    usersNotified,
    messagesSent,
    usersSkipped,
    usersFailed,
  };
}