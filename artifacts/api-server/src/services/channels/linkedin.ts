import { and, eq, exists, isNull, sql } from "drizzle-orm";
import {
  db,
  prospectsTable,
  followupsTable,
  dailyUsageTable,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";
import { scheduleFollowupsAfterFirstSend } from "../followupScheduler";
import { isChannelCode, type ChannelCode } from "../../lib/channelRegister";

/**
 * LinkedIn channel adapter (F-A). Mirrors the telegram adapter's surface
 * (generateLink + recordSendIntent + RecordSendIntentInput) so the route layer
 * treats every channel uniformly.
 *
 * KEY DIFFERENCE — LinkedIn is CLIPBOARD-ONLY. Unlike wa.me / t.me, LinkedIn has
 * no message-prefill deep link: you can open a profile but you cannot pre-fill a
 * connection note or InMail via URL. So `generateLink` returns only the bare
 * profile URL (the `body` is NOT embeddable), and the frontend copies the
 * generated message to the clipboard for the SDR to paste. The identifier is the
 * prospect's `linkedin_url`.
 */

/**
 * Build the LinkedIn profile URL to open. Accepts either a full LinkedIn URL
 * (returned normalized) or a bare profile slug (wrapped into a /in/ URL). The
 * `body` is intentionally ignored — LinkedIn cannot prefill message text.
 */
export function generateLink(identifier: string, _body: string): string {
  const trimmed = identifier.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    // Already a URL. Return as-is (the value came from prospects.linkedin_url,
    // which the create/patch route validates with z.string().url()).
    return trimmed;
  }
  // Bare slug/handle → canonical profile URL. Strip a leading "@" or "/in/".
  const slug = trimmed.replace(/^@/, "").replace(/^\/?in\//i, "");
  return `https://www.linkedin.com/in/${encodeURIComponent(slug)}`;
}

export interface RecordSendIntentInput {
  prospectId: string;
  userId: string;
  followupId: number | null;
}

/**
 * Records that the user opened the LinkedIn profile (and copied the message).
 * Treated as the "send" event for the manual-send model — identical shape to the
 * telegram/whatsapp adapters, only the action_type differs. For a followup this
 * stamps clickedAt + sentAt + status='sent' (F1) so the row leaves the due
 * queues; the first-send branch stamps prospects.first_message_sent_at.
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
      // Ownership scoping via the owning prospect (IDOR guard) — see whatsapp.ts.
      // F1: stamp sentAt + status='sent' too (the click is the send).
      const now = new Date();
      const updated = await tx
        .update(followupsTable)
        .set({ clickedAt: now, sentAt: now, status: "sent" })
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
      .values({ userId, date: today, messagesSent: 1 })
      .onConflictDoUpdate({
        target: [dailyUsageTable.userId, dailyUsageTable.date],
        set: { messagesSent: sql`${dailyUsageTable.messagesSent} + 1` },
      });

    await tx.insert(actionLogsTable).values({
      userId,
      prospectId,
      followupId,
      actionType: ACTION_TYPES.linkedinSendIntent,
      actionStatus: "success",
    });
  });

  if (followupId === null && firstSendRecorded) {
    const prospectRows = await db
      .select({ firstMessageChannel: prospectsTable.firstMessageChannel })
      .from(prospectsTable)
      .where(
        and(
          eq(prospectsTable.id, prospectId),
          eq(prospectsTable.userId, userId),
        ),
      )
      .limit(1);
    const rawChannel = prospectRows[0]?.firstMessageChannel ?? "linkedin";
    const channel: ChannelCode = isChannelCode(rawChannel)
      ? rawChannel
      : "linkedin";
    await scheduleFollowupsAfterFirstSend({ prospectId, userId, channel });
  }
}
