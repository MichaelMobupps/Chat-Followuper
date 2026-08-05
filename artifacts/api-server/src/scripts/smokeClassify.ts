/**
 * Smoke: seed classification. Temporary — validates classifySeed end-to-end.
 *   FOLLOWUP_DIGEST_SCHEDULER=false node ../../lib/db/node_modules/tsx/dist/cli.mjs src/scripts/smokeClassify.ts
 */
import { classifySeed } from "../services/seedClassifier";

const SEEDS = [
  { seed: "Nubank" }, // company name → fintech, Brazil, pt
  { seed: "https://play.google.com/store/apps/details?id=com.supercell.clashofclans" }, // play store → mobile game
];

async function main() {
  for (const s of SEEDS) {
    const t = Date.now();
    try {
      const r = await classifySeed(s);
      console.log(`\n=== SEED: ${s.seed} (${Date.now() - t}ms) ===`);
      console.log(JSON.stringify(r, null, 2));
    } catch (err) {
      console.log(`\n=== SEED: ${s.seed} THREW ===`, String(err));
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
