/**
 * Smoke: hourly follow-up pre-generation + digest gating (Speed pass, 2026-07-16).
 *
 * The pass under test: the scheduler now runs pregenerateDueFollowupMessages
 * BEFORE the digests, so a due row's message is written ahead of the
 * notification and the rep's click hits the cached-message short-circuit.
 * The digests, in turn, list ONLY rows whose message already exists.
 *
 * Spends ZERO LLM money: LLM_DAILY_SPEND_CAP_USD is forced tiny and the smoke
 * user's daily usage is seeded OVER it, so every generation attempt throws
 * DailyLlmCapExceededError at the pre-check — before any model call. What's
 * asserted is the plumbing around generation, which is where the bugs live:
 *   - WHO is selected (the due matrix: generated / future / paused-prospect /
 *     paused-user / replied / zombie-channel / sent are all excluded);
 *   - the per-tick backlog cap counts deferred rows instead of dropping them;
 *   - a capped user's remaining rows are skipped and counted, nothing persists;
 *   - fetchDueRows refuses rows without a generated message (btrim gate) and
 *     picks up a row the moment its message lands (producer → consumer);
 *   - source-level parity: pushoverDigest carries the same gate,
 *     pushoverNudges deliberately does NOT (the 2+-day safety net), and both
 *     the in-process scheduler and the cron script generate BEFORE notifying.
 *
 *   FOLLOWUP_DIGEST_SCHEDULER=false node ../../lib/db/node_modules/tsx/dist/cli.mjs \
 *     src/scripts/smokePregenerate.ts
 */
import { readFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import {
  db,
  pool,
  dailyUsageTable,
  followupsTable,
  prospectsTable,
  usersTable,
} from "@workspace/db";
import { recordDailyLlmSpend } from "../lib/llmSpendCap";
import { fetchDueRows } from "../services/followupDigest";

// Both read before the module under test runs: the cap per-call, the tick
// bound at module load — which is why followupPregenerate is dynamic-imported
// inside main(), AFTER these are set. `=` not `??=`: ambient env must not
// change what this smoke asserts.
process.env.LLM_DAILY_SPEND_CAP_USD = "0.01";
process.env.FOLLOWUP_PREGEN_MAX_PER_TICK = "2";

const userIds: string[] = [];
const prospectIds: string[] = [];

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(
    `[pregen] ${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`,
  );
  if (ok) pass++;
  else fail++;
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

async function seedProspect(
  userId: string,
  n: number,
  overrides: Partial<typeof prospectsTable.$inferInsert> = {},
): Promise<string> {
  const [p] = await db
    .insert(prospectsTable)
    .values({
      userId,
      sourceMode: "manual",
      prospectName: `Pregen Case ${n}`,
      company: "PregenCo",
      phone: `+1555099${String(n).padStart(4, "0")}`,
      ...overrides,
    })
    .returning({ id: prospectsTable.id });
  prospectIds.push(p!.id);
  return p!.id;
}

async function seedFollowup(
  prospectId: string,
  values: Partial<typeof followupsTable.$inferInsert>,
): Promise<number> {
  const [f] = await db
    .insert(followupsTable)
    .values({
      prospectId,
      stage: 1,
      channel: "whatsapp",
      status: "scheduled",
      scheduledAt: hoursAgo(1),
      ...values,
    })
    .returning({ id: followupsTable.id });
  return f!.id;
}

async function main(): Promise<number> {
  // Dynamic import so the env pins above are already in place when the
  // module-level MAX_ROWS_PER_TICK is read.
  const { pregenerateDueFollowupMessages } = await import(
    "../services/followupPregenerate"
  );

  const ts = Date.now();
  const [ua] = await db
    .insert(usersTable)
    .values({ email: `smoke-pregen-a-${ts}@example.test`, name: "Pregen Rep" })
    .returning({ id: usersTable.id });
  const [ub] = await db
    .insert(usersTable)
    .values({
      email: `smoke-pregen-b-${ts}@example.test`,
      name: "Paused Rep",
      followupsPaused: true,
    })
    .returning({ id: usersTable.id });
  const userA = ua!.id;
  const userB = ub!.id;
  userIds.push(userA, userB);

  // Push user A over the (tiny) cap so every generation attempt fails at the
  // pre-check, before any provider call. This is the zero-spend mechanism AND
  // the failure-posture case in one.
  await recordDailyLlmSpend(userA, 1.0);

  // ── The selection matrix ─────────────────────────────────────────────────
  // Eligible (need generation, ordered by scheduledAt):
  const fEligible1 = await seedFollowup(await seedProspect(userA, 1), {
    scheduledAt: hoursAgo(2), // oldest — attempted first
  });
  const fEligible2 = await seedFollowup(await seedProspect(userA, 2), {
    scheduledAt: hoursAgo(1.5),
    generatedMessage: "   ", // whitespace-only = "not generated" (btrim)
  });
  await seedFollowup(await seedProspect(userA, 3), {
    scheduledAt: hoursAgo(1.3),
    channel: "telegram",
  });
  await seedFollowup(await seedProspect(userA, 4), {
    scheduledAt: hoursAgo(1.2),
    channel: "linkedin",
  });
  // Excluded, one per predicate leg:
  const pGenerated = await seedProspect(userA, 5);
  const fGenerated = await seedFollowup(pGenerated, {
    generatedMessage: "Already written before this tick.",
  });
  await seedFollowup(await seedProspect(userA, 6), {
    scheduledAt: new Date(Date.now() + 24 * 3600_000), // future
  });
  await seedFollowup(await seedProspect(userA, 7, { followupPaused: true }), {});
  await seedFollowup(await seedProspect(userA, 8), { channel: "teams" }); // zombie
  await seedFollowup(await seedProspect(userA, 9, { replied: 1 }), {});
  await seedFollowup(await seedProspect(userA, 10), {
    status: "sent",
    sentAt: hoursAgo(0.5),
  });
  await seedFollowup(await seedProspect(userB, 11), {}); // user-level pause

  // ── Run the pass (capped → zero spend) ───────────────────────────────────
  const r = await pregenerateDueFollowupMessages();

  check(
    "selection: exactly the 4 needing-generation rows are due (generated/future/paused-prospect/zombie/replied/sent/paused-user all excluded)",
    r.due === 4,
    `due=${r.due}`,
  );
  check(
    "backlog cap: rows beyond FOLLOWUP_PREGEN_MAX_PER_TICK=2 are counted as deferred, not dropped",
    r.deferred === 2,
    `deferred=${r.deferred}`,
  );
  check(
    "capped user: first attempt throws at the pre-check; remaining rows skipped and counted",
    r.generated === 0 && r.usersCapped === 1 && r.failed === 2,
    `generated=${r.generated} usersCapped=${r.usersCapped} failed=${r.failed}`,
  );

  const untouched = await db
    .select({ msg: followupsTable.generatedMessage })
    .from(followupsTable)
    .where(inArray(followupsTable.id, [fEligible1]));
  check(
    "nothing persisted for a capped attempt (row retries next tick)",
    untouched[0]?.msg == null,
    `generatedMessage=${String(untouched[0]?.msg)}`,
  );

  // ── Digest gating (the consumer side) ────────────────────────────────────
  const due1 = await fetchDueRows(userA);
  check(
    "digest lists ONLY the row whose message exists (whitespace-only excluded)",
    due1.length === 1 && due1[0]?.followupId === fGenerated,
    `rows=${due1.map((d) => d.followupId).join(",")} expected=${fGenerated}`,
  );

  // Producer → consumer: the moment pregen fills a row, the same tick's
  // digest query picks it up.
  await db
    .update(followupsTable)
    .set({ generatedMessage: "Now written by the pregen pass." })
    .where(inArray(followupsTable.id, [fEligible1]));
  const due2 = await fetchDueRows(userA);
  check(
    "a row the pregen pass fills becomes notifiable immediately",
    due2.length === 2 &&
      due2.some((d) => d.followupId === fEligible1) &&
      due2.some((d) => d.followupId === fGenerated),
    `rows=${due2.map((d) => d.followupId).join(",")}`,
  );

  // Whitespace stays invisible even though it was "due" for generation.
  check(
    "whitespace-only message row is due for GENERATION but not for NOTIFICATION",
    !due2.some((d) => d.followupId === fEligible2),
  );

  // ── Source-level parity (killswitch-smoke style: fresh re-reads) ─────────
  const src = (rel: string): string =>
    readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
  const pushover = src("services/pushoverDigest.ts");
  const nudges = src("services/pushoverNudges.ts");
  const scheduler = src("services/digestScheduler.ts");
  const cron = src("scripts/sendFollowupDigests.ts");

  check(
    "pushoverDigest carries the same generated-message gate as the email digest",
    pushover.includes("btrim") && pushover.includes("generatedMessage"),
  );
  check(
    "pushoverNudges is deliberately UNgated (2+-day escalation is the safety net for rows that keep failing)",
    !nudges.includes("btrim"),
  );
  const beforeDigests = (text: string): boolean => {
    const gen = text.indexOf("pregenerateDueFollowupMessages(");
    const digest = text.indexOf("runFollowupDigests(");
    return gen !== -1 && digest !== -1 && gen < digest;
  };
  check(
    "in-process scheduler generates BEFORE it notifies (ordering is the feature)",
    beforeDigests(scheduler),
  );
  check(
    "cron script (deployed path) also generates BEFORE it notifies",
    beforeDigests(cron),
  );

  return fail === 0 ? 0 : 1;
}

async function cleanup(): Promise<void> {
  if (prospectIds.length > 0) {
    // followups cascade with their prospect
    await db
      .delete(prospectsTable)
      .where(inArray(prospectsTable.id, prospectIds));
  }
  if (userIds.length > 0) {
    await db
      .delete(dailyUsageTable)
      .where(inArray(dailyUsageTable.userId, userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
}

main()
  .then(async (code) => {
    await cleanup();
    console.log(`\n[pregen] ${pass}/${pass + fail} PASS`);
    await pool.end();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("[pregen] FATAL", err);
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
    process.exit(1);
  });
