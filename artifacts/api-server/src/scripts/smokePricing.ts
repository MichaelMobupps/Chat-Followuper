/**
 * Smoke: pricing resolution, incl. the time-boxed Sonnet 5 intro rate.
 *
 * Zero LLM spend — pure functions only, no model is invoked.
 *
 * Why this exists: `priceFor` is date-dependent, so it is the one part of the
 * cost layer that changes behaviour with nobody touching the code. On
 * 2026-09-01 the Sonnet 5 intro window closes and every sonnet-5 rollup rises
 * ~50%. That is correct and intended — but it must be a thing the code does on
 * purpose, asserted at both sides of the boundary, not a surprise someone
 * discovers in a September invoice reconciliation.
 *
 *   FOLLOWUP_DIGEST_SCHEDULER=false node ../../lib/db/node_modules/tsx/dist/cli.mjs \
 *     src/scripts/smokePricing.ts
 */
import { priceFor, computeCost, ANTHROPIC_PRICING } from "../lib/pricing";
import { CRITIC_MODEL } from "../lib/llm/router";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(`[pricing] ${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
};

const MTOK = 1_000_000;
const duringIntro = new Date("2026-07-14T12:00:00Z");
const lastDayOfIntro = new Date("2026-08-31T23:59:59Z");
const firstDayAfter = new Date("2026-09-01T00:00:00Z");

function main(): number {
  // ── The intro window, at both edges ──────────────────────────────────
  check(
    "sonnet-5 during the intro window bills at $2/$10",
    priceFor("claude-sonnet-5", duringIntro)?.input === 2.0 &&
      priceFor("claude-sonnet-5", duringIntro)?.output === 10.0,
    JSON.stringify(priceFor("claude-sonnet-5", duringIntro)),
  );
  check(
    "...still $2/$10 on the LAST day (window is inclusive)",
    priceFor("claude-sonnet-5", lastDayOfIntro)?.input === 2.0,
    JSON.stringify(priceFor("claude-sonnet-5", lastDayOfIntro)),
  );
  check(
    "...and reverts to the $3/$15 sticker the next day",
    priceFor("claude-sonnet-5", firstDayAfter)?.input === 3.0 &&
      priceFor("claude-sonnet-5", firstDayAfter)?.output === 15.0,
    JSON.stringify(priceFor("claude-sonnet-5", firstDayAfter)),
  );

  // ── The reason this matters: the critic runs on sonnet-5 ─────────────
  check(
    "CRITIC_MODEL is claude-sonnet-5 (so the intro rate is load-bearing, not trivia)",
    CRITIC_MODEL === "claude-sonnet-5",
    CRITIC_MODEL,
  );
  const criticIn = 100_000;
  const criticOut = 2_000;
  const now = computeCost(CRITIC_MODEL, criticIn, criticOut).usd;
  const sticker =
    (criticIn / MTOK) * ANTHROPIC_PRICING["claude-sonnet-5"]!.input +
    (criticOut / MTOK) * ANTHROPIC_PRICING["claude-sonnet-5"]!.output;
  // Today (inside the window) computeCost must NOT equal the sticker maths —
  // that equality was the 50% over-report this fix removes.
  check(
    "computeCost books the billed rate today, not sticker (the 50% over-report)",
    now < sticker,
    `billed=$${now.toFixed(4)} sticker=$${sticker.toFixed(4)} (${(((sticker - now) / now) * 100).toFixed(0)}% over-report avoided)`,
  );

  // ── Models with no intro rate are untouched ──────────────────────────
  for (const m of ["claude-opus-4-7", "claude-opus-4-8", "claude-haiku-4-5", "claude-sonnet-4-6"]) {
    check(
      `${m}: no intro rate — resolves to sticker at every date`,
      priceFor(m, duringIntro)?.input === ANTHROPIC_PRICING[m]!.input &&
        priceFor(m, firstDayAfter)?.input === ANTHROPIC_PRICING[m]!.input,
    );
  }

  // ── Research model, for the record (the A/B's premise) ───────────────
  const opus = priceFor("claude-opus-4-7", duringIntro)!;
  const sonnet = priceFor("claude-sonnet-5", duringIntro)!;
  const cheaperPct = ((opus.input - sonnet.input) / opus.input) * 100;
  check(
    "sonnet-5 is materially cheaper than the research model (opus-4-7) today",
    sonnet.input < opus.input && cheaperPct >= 50,
    `input $${sonnet.input} vs $${opus.input} — ${cheaperPct.toFixed(0)}% cheaper`,
  );

  // ── Unknown model still degrades to $0 + a warn, not a throw ─────────
  const unknown = computeCost("not-a-real-model", 1000, 100);
  check(
    "unknown model → $0 and a logged warning, never a throw",
    unknown.usd === 0 && unknown.inputTokens === 1000,
  );

  // ── Cache rates ride on the in-force input rate ──────────────────────
  const cached = computeCost("claude-sonnet-5", 0, 0, { cachedInputTokens: MTOK });
  check(
    "cache-read derives from the INTRO input rate (0.1x of $2 = $0.20/MTok)",
    Math.abs(cached.usd - 0.2) < 1e-9,
    `$${cached.usd.toFixed(4)}/MTok`,
  );

  console.log(`\n[pricing] ${pass}/${pass + fail} PASS`);
  return fail === 0 ? 0 : 1;
}

process.exit(main());
