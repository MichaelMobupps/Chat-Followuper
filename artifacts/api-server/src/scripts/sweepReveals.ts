/**
 * Standalone entry for the pending-reveal expiry sweep.
 *
 * Point a Replit Scheduled Deployment at this file on a daily or hourly
 * cadence, for example:
 *
 *   tsx src/scripts/sweepReveals.ts
 *
 * It calls expireStalePhoneReveals once and exits. This is the self-contained
 * call site, so no scheduler-file edit and no HTTP auth are required.
 */
import { expireStalePhoneReveals } from "../services/phoneRevealSweep";

async function main(): Promise<void> {
  const result = await expireStalePhoneReveals();
  console.log(
    `[reveal-sweep] expired=${result.expired} cutoff=${result.cutoffIso} maxAgeHours=${result.maxAgeHours}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[reveal-sweep] failed", err);
    process.exit(1);
  });
