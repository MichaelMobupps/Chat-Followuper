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

const LINKEDIN_FALLBACK_URL = "https://www.linkedin.com/";

/** decodeURIComponent that never throws (malformed %-sequences → raw). */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Canonicalize a LinkedIn identifier to a stable, safe profile URL, or return
 * null if it can't be resolved to a linkedin.com URL.
 *
 * Accepts: a full http(s) LinkedIn URL, a scheme-less "linkedin.com/…", an
 * "/in/<slug>" path, a bare slug, or an "@handle". Produces a canonical string
 * so cosmetically-different inputs for the same profile collapse to ONE value —
 * critical because prospects.linkedin_url is deduped by exact string (the
 * partial-unique index prospects_user_linkedin_unique) and reused verbatim as
 * the outreach deep link. Without this, "…/in/x", "…/in/x/", "…/in/X",
 * "il.linkedin.com/in/x", and "…/in/x?trk=…" all created SEPARATE prospects →
 * duplicate + double outreach (audit C1), and "/in/x/" round-tripped to a
 * broken "…/in/x%2F" (audit C2).
 *
 * SECURITY: enforces the linkedin.com host. generateLink's output is fed to a
 * server-side res.redirect(302) in followupOpen.ts and to window.open() on the
 * dashboard, so returning a non-linkedin URL verbatim would be an open-redirect
 * gadget on the trusted origin (audit S1). Non-linkedin hosts → null → caller
 * falls back to the bare linkedin.com domain.
 */
export function canonicalizeLinkedinUrl(identifier: string): string | null {
  let raw = identifier.trim();
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    if (/^([\w-]+\.)*linkedin\.com\//i.test(raw)) {
      // Scheme-less "linkedin.com/…" / "www.linkedin.com/…" — add the scheme
      // and fall through to the URL branch for host enforcement + canonicalize.
      raw = `https://${raw}`;
    } else {
      // Bare slug or "/in/<slug>" / "@handle" → canonical profile URL.
      const slug = raw
        .replace(/^@/, "")
        .replace(/^\/?in\//i, "")
        .replace(/\/+$/, "");
      if (!slug) return null;
      // decode-then-encode is idempotent and avoids double-encoding a slug that
      // was pasted already percent-encoded. Lowercase: LinkedIn vanity slugs are
      // case-insensitive, so this is safe and makes dedup case-insensitive.
      return `https://www.linkedin.com/in/${encodeURIComponent(
        safeDecode(slug),
      ).toLowerCase()}`;
    }
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) {
    return null; // host enforcement — neutralizes the open-redirect sink
  }
  // Canonical host, drop query/fragment, strip trailing slash, lowercase path.
  const path = url.pathname.replace(/\/+$/, "").toLowerCase() || "/";
  return `https://www.linkedin.com${path}`;
}

/**
 * Build the LinkedIn profile URL to open. Delegates to canonicalizeLinkedinUrl;
 * a value that can't be resolved to a linkedin.com URL (e.g. a poisoned
 * linkedin_url from some other write path) falls back to the bare linkedin.com
 * domain rather than being redirected/opened verbatim. The `body` is ignored —
 * LinkedIn cannot prefill message text.
 */
export function generateLink(identifier: string, _body: string): string {
  return canonicalizeLinkedinUrl(identifier) ?? LINKEDIN_FALLBACK_URL;
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
