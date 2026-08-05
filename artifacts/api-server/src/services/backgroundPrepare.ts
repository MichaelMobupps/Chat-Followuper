/**
 * Background contact preparation (Speed pass, 2026-07-16).
 *
 * "Add contact" used to hand the SDR a spinner: the Contacts page fired
 * prepare-first-message and the SDR watched classify → research → writer run
 * for up to a couple of minutes. Now manual-ingest queues the SAME pipeline
 * here, fire-and-forget, right after the 201 — the dialog closes instantly
 * and the row flips from "draft" to "ready" when the run lands.
 *
 * Two shapes:
 *   - no message yet → full prepareFirstMessage (classify + research +
 *     writer; persists brief AND body; stamps its own progress).
 *   - message already present (pasted by the SDR, or claimed from a preview
 *     draft that somehow lacked a brief) → ensureProspectBrief only. The
 *     SDR's text is never overwritten; the brief is what keeps this
 *     contact's FOLLOW-UPS from dying on research_not_complete later.
 *
 * Concurrency: prepareFirstMessage carries its own in-flight dedupe, so an
 * impatient click on the row's Generate button while this run is live joins
 * it instead of double-spending.
 *
 * Failure posture: nobody is waiting on an HTTP response, so errors stamp the
 * progress store (the row's bar shows the failure if the SDR is watching) and
 * log. The contact stays a "draft" row whose Generate button retries the
 * pipeline interactively; a missing brief also self-heals at follow-up
 * pre-generation time via the lazy-research fallback.
 */
import { and, eq } from "drizzle-orm";
import { db, prospectsTable } from "@workspace/db";
import { assertUnderDailyLlmCap } from "../lib/llmSpendCap";
import { logger } from "../lib/logger";
import { ensureProspectBrief, prepareFirstMessage } from "./manualContactPrepare";
import { setPrepareProgress } from "./prepareProgress";

/**
 * BACKGROUND_PREPARE=false|0|off disables the queue (default: enabled, no env
 * needed in prod). Exists for the zero-LLM-spend smokes: they mount the real
 * manual-ingest route in-process, so without this every message-less contact
 * they create would fire a REAL classify/research/writer pipeline in the
 * background — silent spend from suites that promise "zero by construction".
 * Read per-call (same pattern as lib/admin.ts) so tests can toggle it.
 */
function backgroundPrepareEnabled(): boolean {
  const raw = (process.env.BACKGROUND_PREPARE ?? "").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

export function queueContactPrepare(params: {
  prospectId: string;
  userId: string;
  senderName: string;
  /**
   * true → the contact already has its first message; run classify +
   * research only and leave the SDR's text alone.
   */
  researchOnly: boolean;
}): void {
  const { prospectId, userId, senderName, researchOnly } = params;
  if (!backgroundPrepareEnabled()) {
    // No "queued" stamp either — nothing will ever complete it, and a parked
    // queued entry would hold the row's progress bar at 0% for the TTL.
    logger.debug(
      { prospectId, userId, researchOnly },
      "[background-prepare] disabled via BACKGROUND_PREPARE; skipping",
    );
    return;
  }

  // Stamp "queued" SYNCHRONOUSLY, before manual-ingest's 201 returns: the
  // Contacts page starts polling prepare-progress the moment the dialog
  // closes, and this stamp is what tells its poller a background run is live
  // (a missing entry reads as "idle", which stops the poll after a short
  // grace window).
  setPrepareProgress(userId, prospectId, "queued");

  void (async () => {
    try {
      if (researchOnly) {
        // ensureProspectBrief leaves the cap pre-check to its caller (the
        // interactive path asserts before it); assert here so a capped user's
        // background research fails fast instead of billing over the cap.
        await assertUnderDailyLlmCap(userId);
        const rows = await db
          .select()
          .from(prospectsTable)
          .where(
            and(
              eq(prospectsTable.id, prospectId),
              eq(prospectsTable.userId, userId),
            ),
          )
          .limit(1);
        const prospect = rows[0];
        if (!prospect) return;
        await ensureProspectBrief({ prospect, userId });
        setPrepareProgress(userId, prospectId, "ready");
      } else {
        // Stamps its own transitions (researching → writing → finalizing →
        // ready), so the row's progress bar tracks the real pipeline.
        await prepareFirstMessage({ prospectId, userId, senderName });
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err);
      setPrepareProgress(userId, prospectId, "error", code);
      logger.warn(
        { err: String(err), prospectId, userId, researchOnly },
        "[background-prepare] failed; contact stays draft",
      );
    }
  })();
}
