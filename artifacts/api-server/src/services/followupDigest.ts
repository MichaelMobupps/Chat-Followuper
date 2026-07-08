import { and, eq, inArray, isNull, isNotNull, lte, sql } from "drizzle-orm";
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
import { isSmtpConfigured } from "../lib/smtpConfigured";
import { usageBucketDate } from "../lib/usageBucket";
import { CHANNEL_CODES } from "../lib/channelRegister";
import { sendMail } from "./mailer";

export interface DigestResult {
  usersEmailed: number;
  followupsListed: number;
  usersFailed: number;
}

interface DueRow {
  followupId: number;
  stage: number;
  channel: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  prospectName: string | null;
  company: string | null;
  digestHourLocal: number;
  digestTimezone: string;
}

/** True when the user's configured local digest hour has arrived. */
function isDigestHourNow(digestHourLocal: number, digestTimezone: string): boolean {
  if (process.env.DIGEST_SKIP_HOUR_CHECK === "true") return true;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: digestTimezone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? -1);
    // >= (not ===) so a drift-prone hourly scheduler that gives a clock hour
    // zero ticks (deploy/restart/blocked loop) still sends later that day
    // rather than silently skipping the rep entirely. At-most-once per day is
    // guaranteed downstream by the daily_usage.digestSent marker.
    return hour >= digestHourLocal;
  } catch {
    return true;
  }
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

function renderEmail(name: string | null, rows: DueRow[]): string {
  const base = appPublicUrl();
  const items = rows
    .map((r) => {
      const token = mintOpenToken(r.followupId, r.userId);
      const url = `${base}/api/followups/open/${r.followupId}?t=${token}`;
      const who = escapeHtml(r.prospectName ?? "this prospect");
      const co = r.company ? ` at ${escapeHtml(r.company)}` : "";
      return `<tr>
  <td style="padding:8px 0;">${who}${co} &mdash; stage ${r.stage} (${escapeHtml(r.channel)})</td>
  <td style="padding:8px 0;text-align:right;">
    <a href="${url}" style="background:#10b981;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Follow up</a>
  </td>
</tr>`;
    })
    .join("");
  const n = rows.length;
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;color:#111;">
  <p>Hi ${escapeHtml(name ?? "there")},</p>
  <p>You have ${n} follow-up${n === 1 ? "" : "s"} due. Click <strong>Follow up</strong> on each row — Chat Followuper writes the message, you review it in WhatsApp/Telegram, and press send.</p>
  <table style="width:100%;border-collapse:collapse;">${items}</table>
  <p style="color:#6b7280;font-size:12px;margin-top:16px;">Sent by Chat Followuper. You send each message yourself.</p>
</div>`;
}

/**
 * Build and send one email per rep listing their due follow-ups. A follow-up
 * is due when it is scheduled, unsent, past its scheduledAt, has a generated
 * message, and its prospect is neither paused nor replied. Idempotent per
 * rep per day via daily_usage.digestSent. Each rep is sent inside its own
 * error boundary so one failed recipient does not abort the batch.
 */
export async function runFollowupDigests(): Promise<DigestResult> {
  // Short-circuit when SMTP is unconfigured: otherwise the join query runs and
  // sendMail throws once per user every hour, inflating usersFailed and log
  // noise. Mirrors weeklyDigest / pushoverDigest, which guard the same way.
  if (!isSmtpConfigured()) {
    return { usersEmailed: 0, followupsListed: 0, usersFailed: 0 };
  }

  const rows = (await db
    .select({
      followupId: followupsTable.id,
      stage: followupsTable.stage,
      channel: followupsTable.channel,
      userId: prospectsTable.userId,
      userEmail: usersTable.email,
      userName: usersTable.name,
      prospectName: prospectsTable.prospectName,
      company: prospectsTable.company,
      digestHourLocal: usersTable.digestHourLocal,
      digestTimezone: usersTable.digestTimezone,
    })
    .from(followupsTable)
    .innerJoin(prospectsTable, eq(followupsTable.prospectId, prospectsTable.id))
    .innerJoin(usersTable, eq(prospectsTable.userId, usersTable.id))
    .where(
      and(
        eq(followupsTable.status, "scheduled"),
        // F4/D2: exclude removed-channel rows. A followup sequenced on
        // teams/slack before those channels were deleted can never complete
        // (generation throws invalid_channel) and is invisible in the
        // whatsapp|telegram-only management UI, so without this guard it would
        // be re-emailed in every digest with a dead link, forever.
        inArray(followupsTable.channel, [...CHANNEL_CODES]),
        isNull(followupsTable.sentAt),
        lte(followupsTable.scheduledAt, new Date()),
        eq(prospectsTable.followupPaused, false),
        eq(prospectsTable.replied, 0),
      ),
    )) as DueRow[];

  const byUser = new Map<string, DueRow[]>();
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  let usersEmailed = 0;
  let followupsListed = 0;
  let usersFailed = 0;

  for (const [userId, list] of byUser) {
    let claimed = false;
    // F2: the claim/release date MUST be the user's LOCAL calendar day, the
    // same basis the `>=` hour-gate opens on. Keying it to UTC (as before) let
    // the UTC date flip mid-open-window for western tz → a second claim row
    // (userId, D+1) succeeded → a duplicate digest the same local day, and the
    // steady state delivered at UTC-midnight-local instead of digestHourLocal.
    let bucketDate = "";
    try {
      const sample = list[0]!;
      if (!isDigestHourNow(sample.digestHourLocal, sample.digestTimezone)) {
        continue;
      }
      bucketDate = usageBucketDate(sample.digestTimezone);

      // FUP3: atomically CLAIM today's digest slot BEFORE sending. The
      // INSERT … ON CONFLICT DO UPDATE SET digest_sent=true WHERE
      // digest_sent=false RETURNING lets exactly one runner win — the
      // in-process scheduler OR the standalone cron script, even if they
      // co-run. The loser gets an empty result and skips. This replaces the
      // check-then-send-then-mark TOCTOU that let two processes both send.
      const claim = await db
        .insert(dailyUsageTable)
        .values({ userId, date: bucketDate, digestSent: true })
        .onConflictDoUpdate({
          target: [dailyUsageTable.userId, dailyUsageTable.date],
          set: { digestSent: true },
          setWhere: sql`${dailyUsageTable.digestSent} = false`,
        })
        .returning({ userId: dailyUsageTable.userId });
      if (claim.length === 0) continue; // already claimed/sent today
      claimed = true;

      const n = list.length;

      await sendMail(
        list[0].userEmail,
        `${n} follow-up${n === 1 ? "" : "s"} ready to send`,
        renderEmail(list[0].userName, list),
      );

      usersEmailed += 1;
      followupsListed += n;

      // F6: the email is already sent — the audit-log insert must be
      // best-effort. If it threw into the outer catch it would RELEASE the
      // claim and a later tick would re-send the same digest (duplicate).
      await db
        .insert(actionLogsTable)
        .values({
          userId,
          actionType: ACTION_TYPES.digestSent,
          actionStatus: "success" as const,
          metadata: { followupCount: n },
        })
        .catch((e) =>
          console.error(`[followup-digest] audit-log failed ${userId}`, e),
        );
    } catch (err) {
      usersFailed += 1;
      // FUP3: if we claimed the slot but the SEND failed, RELEASE it so a later
      // tick can retry (the hour-gate is `>=`, so a missed send re-fires the
      // same day). Best-effort — a lost release just means one missed digest,
      // never a duplicate. Post-send bookkeeping is now outside this boundary
      // (F6), so only a genuine send failure reaches here.
      if (claimed && bucketDate) {
        await db
          .update(dailyUsageTable)
          .set({ digestSent: false })
          .where(
            and(
              eq(dailyUsageTable.userId, userId),
              eq(dailyUsageTable.date, bucketDate),
            ),
          )
          .catch(() => {});
      }
      console.error(`[followup-digest] failed for user ${userId}`, err);
    }
  }

  return { usersEmailed, followupsListed, usersFailed };
}
