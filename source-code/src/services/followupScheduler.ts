import { and, eq } from "drizzle-orm";
import {
  db,
  followupsTable,
  prospectsTable,
  usersTable,
  actionLogsTable,
  ACTION_TYPES,
  type User,
} from "@workspace/db";
import {
  generateScheduledTime,
  getScheduleWindow,
  type UserTimingSettings,
} from "./timingEngine";
import type { ChannelCode } from "../lib/channelRegister";

function userTimingFromRow(user: User): UserTimingSettings {
  return {
    stageTiming: user.stageTiming,
    sendDays: user.sendDays,
    sendHourStart: user.sendHourStart,
    sendHourEnd: user.sendHourEnd,
  };
}

/**
 * After the SDR sends the first message (stage 0), seed scheduled follow-up
 * rows for stages 1..maxFollowups. Idempotent: skips if any follow-up row
 * already exists for this prospect+channel.
 */
export async function scheduleFollowupsAfterFirstSend(params: {
  prospectId: string;
  userId: string;
  channel: ChannelCode;
}): Promise<{ scheduled: number }> {
  const { prospectId, userId, channel } = params;

  const existing = await db
    .select({ id: followupsTable.id })
    .from(followupsTable)
    .where(
      and(
        eq(followupsTable.prospectId, prospectId),
        eq(followupsTable.channel, channel),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return { scheduled: 0 };
  }

  const userRows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const user = userRows[0];
  if (!user) return { scheduled: 0 };

  const timing = userTimingFromRow(user);
  const maxStages = Math.min(Math.max(user.maxFollowups, 1), 10);
  const now = new Date();
  let scheduled = 0;

  for (let stage = 1; stage <= maxStages; stage++) {
    const window = getScheduleWindow(stage, timing);
    const scheduledAt = new Date(generateScheduledTime(window, now));

    await db
      .insert(followupsTable)
      .values({
        prospectId,
        stage,
        channel,
        status: "scheduled",
        scheduledAt,
      })
      .onConflictDoNothing({
        target: [followupsTable.prospectId, followupsTable.stage],
      });

    scheduled += 1;
  }

  try {
    await db.insert(actionLogsTable).values({
      userId,
      prospectId,
      actionType: ACTION_TYPES.followupQueued,
      actionStatus: "success",
      metadata: { channel, count: scheduled, via: "first_send" },
    });
  } catch {
    // best-effort audit
  }

  return { scheduled };
}