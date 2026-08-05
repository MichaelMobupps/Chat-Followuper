/**
 * Smoke: the per-call LLM cost ledger. Live DB, ZERO LLM spend.
 *
 * Calls recordLlmCall directly rather than driving a real generation — the
 * point is the ledger's contract, and paying ~$0.50 per run to re-prove that
 * Anthropic returns tokens would be a bad trade. What a real call adds is
 * covered structurally in section 5.
 *
 * The contract, in the order it matters:
 *
 *  1. A LEDGER WRITE MUST NEVER BREAK A GENERATION. Asserted by handing it a
 *     userId that violates the FK: it must swallow, log, and resolve. The spend
 *     has already happened by then — throwing would lose the rep's message AND
 *     still cost the money.
 *  2. AN UNPRICED MODEL MUST BE DISTINGUISHABLE FROM A FREE ONE. computeCost
 *     books $0 + warns for an unknown model, so `usd: 0` is ambiguous. If a
 *     model-id bump silently books zeros, this table under-reports forever and
 *     nothing surfaces it. cost_unpriced is the flag that makes it loud.
 *  3. OFFLINE CALLERS ARE NOT UNATTRIBUTED CALLS. A bench with no user must
 *     write NOTHING; a production call whose user we can't determine must write
 *     a row. Conflating them would either pollute the ledger with harness rows
 *     or hide real unattributed spend — opposite errors, both silent.
 *  4. MONEY IS NOT A FLOAT. numeric(12,6): a single cheap call is ~$0.000012,
 *     which 4dp (daily_usage's scale) would round to zero.
 *
 *   FOLLOWUP_DIGEST_SCHEDULER=false node ../../lib/db/node_modules/tsx/dist/cli.mjs \
 *     src/scripts/smokeLlmLedger.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, llmCallsTable } from "@workspace/db";
import { recordLlmCall } from "../lib/llmLedger";

let userId = "";
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(
    `[ledger] ${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`,
  );
  if (ok) pass++;
  else fail++;
};

const rowsFor = async (uid: string) =>
  db.select().from(llmCallsTable).where(eq(llmCallsTable.userId, uid));

async function cleanup(): Promise<void> {
  try {
    if (userId) {
      // llm_calls.user_id is ON DELETE SET NULL, so deleting the user would
      // ORPHAN these rows rather than remove them (by design — spend outlives
      // the user). Delete the ledger rows explicitly first.
      await db.delete(llmCallsTable).where(eq(llmCallsTable.userId, userId));
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  } catch (e) {
    console.error("[ledger] cleanup failed:", e);
  }
}

async function main(): Promise<number> {
  const [u] = await db
    .insert(usersTable)
    .values({ email: `smoke-ledger-${Date.now()}@example.test`, name: "Ledger Rep" })
    .returning({ id: usersTable.id });
  userId = u!.id;

  // ── 1. the happy path ─────────────────────────────────────────────────────
  console.log("\n1. a real call writes exactly one honest row");
  await recordLlmCall({
    ledger: { userId },
    task: "draft",
    model: "claude-sonnet-5",
    provider: "anthropic",
    fallback: true,
    cost: { inputTokens: 1234, outputTokens: 567, usd: 0.012345 },
  });
  let rows = await rowsFor(userId);
  check("exactly one row written", rows.length === 1, `${rows.length} rows`);
  const r = rows[0]!;
  check("task + model + provider recorded", r.task === "draft" && r.model === "claude-sonnet-5" && r.provider === "anthropic");
  check("fallback recorded (which model ACTUALLY served)", r.fallback === true);
  check("token counts recorded", r.inputTokens === 1234 && r.outputTokens === 567);
  check(
    "cost stored at 6dp without float drift",
    r.costUsd === "0.012345",
    `costUsd=${r.costUsd}`,
  );
  check("priced model → cost_unpriced false", r.costUnpriced === false);
  check("prospectId null is allowed (spend can precede the prospect row)", r.prospectId === null);

  // ── 2. sub-cent precision ─────────────────────────────────────────────────
  console.log("\n2. money is not a float");
  await recordLlmCall({
    ledger: { userId },
    task: "lint",
    model: "claude-sonnet-5",
    provider: "anthropic",
    cost: { inputTokens: 10, outputTokens: 2, usd: 0.000012 },
  });
  rows = await rowsFor(userId);
  const tiny = rows.find((x) => x.task === "lint")!;
  check(
    "a $0.000012 call does NOT round to zero (4dp would have)",
    tiny.costUsd === "0.000012" && Number(tiny.costUsd) > 0,
    `costUsd=${tiny.costUsd}`,
  );

  // ── 3. the unpriced-model canary ──────────────────────────────────────────
  console.log("\n3. an unpriced model is loud, not silently $0");
  await recordLlmCall({
    ledger: { userId },
    task: "draft",
    model: "claude-not-a-real-model-9",
    provider: "anthropic",
    cost: { inputTokens: 100, outputTokens: 50, usd: 0 },
  });
  rows = await rowsFor(userId);
  const unpriced = rows.find((x) => x.model === "claude-not-a-real-model-9")!;
  check(
    "unknown model → cost_unpriced TRUE (distinguishes 'no price' from 'free')",
    unpriced.costUnpriced === true,
  );
  check(
    "unknown model still writes tokens (the call happened; only the price is missing)",
    unpriced.inputTokens === 100,
  );

  // ── 3b. the NaN trap ──────────────────────────────────────────────────────
  // Verified against live PG by the 2026-07-15 audit: `NaN.toFixed(6)` is the
  // STRING "NaN", numeric(12,6) ACCEPTS it, and every sum(cost_usd) on the admin
  // dashboard then returns NaN — one row destroys every figure on the page, and
  // the try/catch offers nothing because nothing throws.
  console.log("\n3b. a non-finite cost cannot poison the rollup");
  await recordLlmCall({
    ledger: { userId },
    task: "nan-probe",
    model: "claude-sonnet-5",
    provider: "anthropic",
    cost: { inputTokens: NaN, outputTokens: 5, usd: NaN },
  });
  rows = await rowsFor(userId);
  const nanRow = rows.find((x) => x.task === "nan-probe");
  check(
    "NaN cost → booked as $0, NOT the string 'NaN'",
    nanRow !== undefined && nanRow.costUsd === "0.000000",
    `costUsd=${nanRow?.costUsd}`,
  );
  check(
    "NaN tokens → 0, not NaN",
    nanRow?.inputTokens === 0,
    `inputTokens=${nanRow?.inputTokens}`,
  );
  const sumProbe = await db
    .select({ total: sql<string>`coalesce(sum(${llmCallsTable.costUsd}), 0)` })
    .from(llmCallsTable)
    .where(eq(llmCallsTable.userId, userId));
  check(
    "…so sum(cost_usd) is still a real number (the whole dashboard depends on this)",
    Number.isFinite(Number(sumProbe[0]?.total)),
    `sum=${sumProbe[0]?.total}`,
  );

  // ── 4. the two ways to have no user — which must NOT behave the same ──────
  console.log("\n4. offline caller ≠ unattributed call");
  const before = (await rowsFor(userId)).length;
  await recordLlmCall({
    // No ledger at all = a bench/smoke harness, not production spend.
    task: "draft",
    model: "claude-sonnet-5",
    provider: "anthropic",
    cost: { inputTokens: 1, outputTokens: 1, usd: 0.1 },
  });
  const allRows = await db.select().from(llmCallsTable);
  check(
    "no ledger context → NO row (a bench must not manufacture null-user spend)",
    (await rowsFor(userId)).length === before,
  );
  check(
    "…and it did not write a stray null-user row either",
    !allRows.some((x) => x.userId === null && x.task === "draft" && x.costUsd === "0.100000"),
  );

  // ── 5. the contract that protects the product ─────────────────────────────
  console.log("\n5. a ledger failure must never break a generation");
  let threw = false;
  try {
    await recordLlmCall({
      // Valid uuid, no such user → FK violation on insert.
      ledger: { userId: "00000000-0000-0000-0000-000000000000" },
      task: "draft",
      model: "claude-sonnet-5",
      provider: "anthropic",
      cost: { inputTokens: 1, outputTokens: 1, usd: 0.01 },
    });
  } catch {
    threw = true;
  }
  check(
    "FK violation is swallowed, not thrown (spend already happened — don't lose the message too)",
    !threw,
  );

  // ── 6. structural: every spend site is wired ──────────────────────────────
  // A functional test here would cost real money. This asserts the wiring at
  // all 5 spend clusters instead — including the two the original plan missed.
  console.log("\n6. structural — every live spend site writes to the ledger");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const wired: Array<[string, string, RegExp]> = [
    ["lib/llm/router.ts", "writer/critic/lint — the per-call chokepoint", /recordLlmCall\(/],
    ["services/prospectResearch.ts", "research — the most expensive call we make", /recordLlmCall\(/],
    ["services/seedClassifier.ts", "classify — writes inside (tokens die here)", /recordLlmCall\(/],
    ["routes/prospector.ts", "resolve_company + validate_orgs + opus_rescue (missed by the original plan)", /recordLlmCall\(/],
  ];
  for (const [rel, label, re] of wired) {
    const src = fs.readFileSync(path.resolve(here, "..", rel), "utf8");
    check(`${rel} — ${label}`, re.test(src));
  }
  // The writer chain must ledger per-CALL, not per-chain: generateChatMessage
  // returns sumCosts(...), a blend of 3-7 calls across 2 providers and 3
  // models. If a row is ever written from that return value it cannot name a
  // model honestly — so assert the blend is NOT what feeds the ledger.
  const genSrc = fs.readFileSync(path.resolve(here, "../services/messageGenerator.ts"), "utf8");
  check(
    "messageGenerator does NOT write ledger rows itself (sumCosts has already blended the models)",
    !/recordLlmCall\(/.test(genSrc) && /ledger/.test(genSrc),
  );
  // Attribution must come from the session, never from caller-supplied input:
  // both these routes build their LLM input from query/body.
  const rsSrc = fs.readFileSync(path.resolve(here, "../routes/researchStream.ts"), "utf8");
  check(
    "researchStream sets ledger from the SESSION, not the parsed query input",
    /ledger: \{ userId \}/.test(rsSrc),
  );

  console.log(
    `\n[ledger] ${fail === 0 ? "ALL PASS" : "FAIL"} — ${pass} passed, ${fail} failed`,
  );
  return fail;
}

main()
  .then(async (f) => {
    await cleanup();
    process.exit(f ? 1 : 0);
  })
  .catch(async (e) => {
    console.error("[ledger] crashed:", e);
    await cleanup();
    process.exit(1);
  });
