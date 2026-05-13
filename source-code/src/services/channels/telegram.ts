import { and, eq, sql } from "drizzle-orm";
import {
  db,
  prospectsTable,
  followupsTable,
  dailyUsageTable,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";

/**
 * Telegram channel adapter (Ticket 2.6-BE).
 *
 * Pattern mirrors services/channels/whatsapp.ts so the route layer
 * imports a uniform surface per channel: generateLink + recordSendIntent
 * + a typed RecordSendIntentInput.
 *
 * Differences from WhatsApp:
 *   - No geo gate. Telegram is universally available; the WhatsApp
 *     geoGate library exists because of country-level rate-of-return
 *     and compliance signals that do not apply to Telegram. Therefore
 *     no GeoGateBlockedError export; the route layer simply does not
 *     need to catch one for this channel.
 *   - Identifier is the user's public handle, not a phone number. The
 *     handle is normalized by stripping a leading "@" if present
 *     (Telegram's web deep link requires the raw username; t.me/@x
 *     redirects through an extra hop on most clients).
 *   - generateLink does not validate handle format. The route layer
 *     guards on `!prospect.telegramHandle` before calling, and the BE
 *     trusts whatever string the prospect record holds — same trust
 *     model as the phone-based WhatsApp flow.
 *
 * recordSendIntent is structurally identical to WhatsApp's: the daily
 * usage upsert, followup.clickedAt vs prospect.firstMessageSentAt
 * branch, and action_logs row all behave the same way. Only the
 * action_type differs (telegramSendIntent vs whatsappSendIntent). It
 * is duplicated rather than extracted because each channel file is
 * self-contained in this codebase; a cross-channel refactor is its own
 * ticket once Teams/Slack land and the shared shape is established.
 */

/**
 * Build a Telegram deep link for the given identifier and message body.
 *
 * Two identifier shapes are supported:
 *   - @handle (or bare handle without "@"): builds the standard
 *     https://t.me/<normalized>?text=... form.
 *   - E.164 phone starting with "+": builds the phone-based deep link
 *     https://t.me/+<digits>?text=... — the leading "+" is required by
 *     Telegram's client deep-link routing. (Contrast with wa.me which
 *     strips the "+" and accepts only digits.) The "+" is a valid
 *     RFC 3986 sub-delim in a path segment and does not need encoding.
 *
 * The handler at the route layer decides which shape is being passed
 * (typically phone if prospects.phone is set, otherwise telegram_handle).
 */
export function generateLink(identifier: string, body: string): string {
  const encoded = encodeURIComponent(body);
  if (identifier.startsWith("+")) {
    // Phone-based deep link. Keep the "+" verbatim.
    return `https://t.me/${identifier}?text=${encoded}`;
  }
  const normalized = identifier.startsWith("@")
    ? identifier.slice(1)
    : identifier;
  return `https://t.me/${normalized}?text=${encoded}`;
}

export interface RecordSendIntentInput {
  prospectId: string;
  userId: string;
  followupId: number | null;
}

/**
 * Records that the user clicked through to the Telegram deep link.
 * Treated as the "send" event for the manual-send model. Three effects
 * in one transaction:
 *
 *   1. Either prospects.first_message_sent_at = now() (followupId null)
 *      or followups.clicked_at = now() (followupId numeric).
 *   2. Upsert daily_usage for (userId, today) with messages_sent + 1.
 *   3. Insert action_logs row with action_type telegram.send_intent.
 *
 * Does NOT touch followups.sent_at; sentAt is reserved for the worker
 * dispatch path. The click event lives in clickedAt.
 */
export async function recordSendIntent(
  input: RecordSendIntentInput,
): Promise<void> {
  const { prospectId, userId, followupId } = input;
  const today = new Date().toISOString().slice(0, 10);

  await db.transaction(async (tx) => {
    if (followupId === null) {
      await tx
        .update(prospectsTable)
        .set({ firstMessageSentAt: new Date() })
        .where(
          and(
            eq(prospectsTable.id, prospectId),
            eq(prospectsTable.userId, userId),
          ),
        );
    } else {
      await tx
        .update(followupsTable)
        .set({ clickedAt: new Date() })
        .where(eq(followupsTable.id, followupId));
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
      actionType: ACTION_TYPES.telegramSendIntent,
      actionStatus: "success",
    });
  });
}
