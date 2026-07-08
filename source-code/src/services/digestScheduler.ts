import { runFollowupDigests } from "./followupDigest";
import { runPushoverDigests } from "./pushoverDigest";
import { runWeeklyDigests } from "./weeklyDigest";
import { runPushoverNudges } from "./pushoverNudges";
import { expireStalePhoneReveals } from "./phoneRevealSweep";
import { logger } from "../lib/logger";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // hourly
const STARTUP_DELAY_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // P3c: also expire stale pending phone reveals here. The standalone
    // scripts/sweepReveals.ts has no in-repo trigger (no script alias, not
    // wired anywhere), so every "the sweep reconciles stuck pending reveals"
    // guarantee (APO4/APO7) silently depended on an out-of-repo cron nobody
    // verified. Folding it into this idempotent hourly tick guarantees it runs.
    const [digestResult, pushoverResult, weeklyResult, nudgeResult, sweepResult] =
      await Promise.all([
        runFollowupDigests(),
        runPushoverDigests(),
        runWeeklyDigests(),
        runPushoverNudges(),
        expireStalePhoneReveals().catch((err) => {
          logger.error({ err }, "[digest-scheduler] reveal sweep failed");
          return null;
        }),
      ]);
    if (
      digestResult.usersEmailed > 0 ||
      digestResult.usersFailed > 0 ||
      pushoverResult.messagesSent > 0 ||
      pushoverResult.usersFailed > 0 ||
      weeklyResult.usersEmailed > 0 ||
      weeklyResult.usersFailed > 0 ||
      nudgeResult.escalationsSent > 0 ||
      nudgeResult.mondayNudgesSent > 0 ||
      nudgeResult.errors > 0 ||
      (sweepResult?.expired ?? 0) > 0
    ) {
      logger.info(
        {
          digest: digestResult,
          pushover: pushoverResult,
          weekly: weeklyResult,
          nudges: nudgeResult,
          sweep: sweepResult,
        },
        "[digest-scheduler] run complete",
      );
    }
  } catch (err) {
    logger.error({ err }, "[digest-scheduler] run failed");
  } finally {
    running = false;
  }
}

/**
 * Starts the in-process follow-up digest scheduler. Runs hourly after an
 * initial delay so the API server is warm before the first batch. Each
 * user's digestHourLocal + digestTimezone gate inside runFollowupDigests
 * ensures at-most-one email per rep per day.
 *
 * Disable with FOLLOWUP_DIGEST_SCHEDULER=false (e.g. in tests).
 */
export function startDigestScheduler(): void {
  if (process.env.FOLLOWUP_DIGEST_SCHEDULER === "false") {
    logger.info("[digest-scheduler] disabled via FOLLOWUP_DIGEST_SCHEDULER=false");
    return;
  }

  if (timer) return;

  const intervalMs = Number(process.env.FOLLOWUP_DIGEST_INTERVAL_MS);
  const ms = Number.isFinite(intervalMs) && intervalMs > 0
    ? intervalMs
    : DEFAULT_INTERVAL_MS;

  setTimeout(() => {
    void tick();
    timer = setInterval(() => {
      void tick();
    }, ms);
    logger.info({ intervalMs: ms }, "[digest-scheduler] started");
  }, STARTUP_DELAY_MS);
}

export function stopDigestScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}