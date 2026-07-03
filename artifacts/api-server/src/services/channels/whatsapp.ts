import { and, eq, exists, isNull, sql } from "drizzle-orm";
import {
  db,
  prospectsTable,
  followupsTable,
  dailyUsageTable,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";
import { isAllowedPhone, detectCountry } from "../../lib/geoGate";
import { scheduleFollowupsAfterFirstSend } from "../followupScheduler";
import { isChannelCode, type ChannelCode } from "../../lib/channelRegister";

/**
 * Thrown by generateLink when the prospect's phone is in a country we
 * do not address with WhatsApp outreach. Routes map this to HTTP 422
 * with the resolved country code in the response body so the UI can
 * surface a useful error to the SDR.
 */
export class GeoGateBlockedError extends Error {
  public readonly country: string | null;

  constructor(country: string | null) {
    super(`Phone is in a geo-blocked country: ${country ?? "unknown"}`);
    this.name = "GeoGateBlockedError";
    this.country = country;
  }
}

/**
 * Build a https://wa.me/<digits>?text=<urlencoded-body> deep link for the
 * given phone and message body. Strips non-digits from the phone before
 * embedding. Throws GeoGateBlockedError only for invalid E.164 format.
 */
export function generateLink(phone: string, body: string): string {
  if (!isAllowedPhone(phone)) {
    throw new GeoGateBlockedError(detectCountry(phone));
  }
  const digits = phone.replace(/[^0-9]/g, "");
  const encoded = encodeURIComponent(body);
  return `https://wa.me/${digits}?text=${encoded}`;
}

export interface RecordSendIntentInput {
  prospectId: string;
  userId: string;
  followupId: number | null;
}

/**
 * Records that the user clicked through to the WhatsApp deep link, which
 * we treat as the "send" event for Mode A (manual send). Three effects in
 * one transaction:
 *
 *   1. Either prospects.first_message_sent_at = now() (followupId null)
 *      or followups.clicked_at = now() (followupId numeric).
 *   2. Upsert daily_usage for (userId, today) with messages_sent + 1.
 *   3. Insert action_logs row with action_type whatsapp.send_intent.
 *
 * Touching followups.sent_at is intentionally avoided: that column tracks
 * when a queued follow-up was dispatched; the click event lives in clickedAt.
 */
export async function recordSendIntent(
  input: RecordSendIntentInput,
): Promise<void> {
  const { prospectId, userId, followupId } = input;
  const today = new Date().toISOString().slice(0, 10);

  let firstSendRecorded = false;

  await db.transaction(async (tx) => {
    if (followupId === null) {
      const updated = await tx
        .update(prospectsTable)
        .set({ firstMessageSentAt: new Date() })
        .where(
          and(
            eq(prospectsTable.id, prospectId),
            eq(prospectsTable.userId, userId),
            isNull(prospectsTable.firstMessageSentAt),
          ),
        )
        .returning({ id: prospectsTable.id });
      if (updated.length === 0) return;
      firstSendRecorded = true;
    } else {
      // Scope the update to a follow-up the caller actually owns. followups has
      // no userId column, so ownership is enforced via the owning prospect. The
      // followupId arrives from the request body (routes/whatsappLink.ts:175);
      // without this EXISTS clause any authenticated user could stamp clickedAt
      // (and write usage/action_logs) on another tenant's follow-up (IDOR).
      const updated = await tx
        .update(followupsTable)
        .set({ clickedAt: new Date() })
        .where(
          and(
            eq(followupsTable.id, followupId),
            isNull(followupsTable.clickedAt),
            exists(
              tx
                .select({ ok: sql`1` })
                .from(prospectsTable)
                .where(
                  and(
                    eq(prospectsTable.id, followupsTable.prospectId),
                    eq(prospectsTable.userId, userId),
                  ),
                ),
            ),
          ),
        )
        .returning({ id: followupsTable.id });
      if (updated.length === 0) return;
    }

    await tx
      .insert(dailyUsageTable)
      .values({
        userId,
        date: today,
        messagesSent: 1,
      })
      .onConflictDoUpdate({
        target: [dailyUsageTable.userId, dailyUsageTable.date],
        set: {
          messagesSent: sql`${dailyUsageTable.messagesSent} + 1`,
        },
      });

    await tx.insert(actionLogsTable).values({
      userId,
      prospectId,
      followupId,
      actionType: ACTION_TYPES.whatsappSendIntent,
      actionStatus: "success",
    });
  });

  if (followupId === null && firstSendRecorded) {
    const prospectRows = await db
      .select({
        firstMessageChannel: prospectsTable.firstMessageChannel,
      })
      .from(prospectsTable)
      .where(
        and(
          eq(prospectsTable.id, prospectId),
          eq(prospectsTable.userId, userId),
        ),
      )
      .limit(1);
    const rawChannel = prospectRows[0]?.firstMessageChannel ?? "whatsapp";
    const channel: ChannelCode = isChannelCode(rawChannel)
      ? rawChannel
      : "whatsapp";
    await scheduleFollowupsAfterFirstSend({ prospectId, userId, channel });
  }
}