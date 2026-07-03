/**
 * Standalone entry for the daily follow-up reminder digest.
 *
 * Point a Replit Scheduled Deployment at:
 *   node dist/scripts/sendFollowupDigests.mjs
 * on a once-daily cadence. It sends one email per rep listing their due
 * follow-ups and exits.
 */
import { runFollowupDigests } from "../services/followupDigest";

async function main(): Promise<void> {
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
