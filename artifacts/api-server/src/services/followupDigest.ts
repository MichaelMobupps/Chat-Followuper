import { and, eq, isNull, isNotNull, lte } from "drizzle-orm";
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
    return hour === digestHourLocal;
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
  const today = new Date().toISOString().slice(0, 10);

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
    try {
      const sample = list[0]!;
      if (!isDigestHourNow(sample.digestHourLocal, sample.digestTimezone)) {
        continue;
      }

      const already = await db
        .select({ digestSent: dailyUsageTable.digestSent })
        .from(dailyUsageTable)
        .where(
          and(
            eq(dailyUsageTable.userId, userId),
            eq(dailyUsageTable.date, today),
          ),
        )
        .limit(1);
      if (already[0]?.digestSent) continue;

      const n = list.length;

      await sendMail(
        list[0].userEmail,
        `${n} follow-up${n === 1 ? "" : "s"} ready to send`,
        renderEmail(list[0].userName, list),
      );

      await db
        .insert(dailyUsageTable)
        .values({ userId, date: today, digestSent: true })
        .onConflictDoUpdate({
          target: [dailyUsageTable.userId, dailyUsageTable.date],
          set: { digestSent: true },
        });

      await db.insert(actionLogsTable).values({
        userId,
        actionType: ACTION_TYPES.digestSent,
        actionStatus: "success" as const,
        metadata: { followupCount: n },
      });

      usersEmailed += 1;
      followupsListed += n;
    } catch (err) {
      usersFailed += 1;
      console.error(`[followup-digest] failed for user ${userId}`, err);
    }
  }

  return { usersEmailed, followupsListed, usersFailed };
}
