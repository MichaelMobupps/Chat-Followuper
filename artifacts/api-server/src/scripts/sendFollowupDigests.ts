/**
 * Standalone entry for the daily follow-up reminder digest.
 *
 * Point a Replit Scheduled Deployment at:
 *   node dist/scripts/sendFollowupDigests.mjs
 * on a once-daily cadence. It sends one email per rep listing their due
 * follow-ups and exits.
 */
import { runFollowupDigests } from "../services/followupDigest";
import { pregenerateDueFollowupMessages } from "../services/followupPregenerate";

async function main(): Promise<void> {
  // Speed pass (2026-07-16): generate BEFORE notifying — same ordering as the
  // in-process scheduler. The digest only lists rows with a generated message,
  // so skipping this step here would mean a cron-only deployment never emails
  // anyone about a row the in-process scheduler hadn't already covered.
  const p = await pregenerateDueFollowupMessages().catch((err) => {
    console.error("[followup-pregen] failed", err);
    return null;
  });
  if (p) {
    console.log(
      `[followup-pregen] due=${p.due} generated=${p.generated} failed=${p.failed} usersCapped=${p.usersCapped} deferred=${p.deferred}`,
    );
  }
  const r = await runFollowupDigests();
  console.log(
    `[followup-digest] usersEmailed=${r.usersEmailed} followupsListed=${r.followupsListed} usersFailed=${r.usersFailed}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[followup-digest] failed", err);
    process.exit(1);
  });
