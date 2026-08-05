/**
 * Smoke: the admin surface — authz + the kill-switch write + the ledger rollup.
 * Live DB, ZERO LLM spend.
 *
 * WHY: before this, the admin routes had NO tests at all, and this change adds
 * the first privileged WRITE in the product — one user changing another user's
 * behaviour. The authorisation on it is the only thing standing between "a
 * manager pauses a rep" and "any signed-in rep pauses their whole team". That
 * deserves a test that actually drives HTTP with real cookies rather than an
 * assertion that the middleware is spelled correctly.
 *
 * Mounts the real routers behind the real middleware chain (cookieParser →
 * express.json → loadUser), and mints real session cookies with signSession, so
 * the 401/403 paths are exercised the way a browser would hit them.
 *
 *   FOLLOWUP_DIGEST_SCHEDULER=false node ../../lib/db/node_modules/tsx/dist/cli.mjs \
 *     src/scripts/smokeAdminRoutes.ts
 */
import express from "express";
import cookieParser from "cookie-parser";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  llmCallsTable,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";
import { signSession, SESSION_COOKIE_NAME } from "../lib/session";
import { loadUser } from "../middlewares/auth";
import adminRouter from "../routes/admin";

const ADMIN_EMAIL = `smoke-admin-${Date.now()}@example.test`;
const REP_EMAIL = `smoke-rep-${Date.now()}@example.test`;
// The route reads ADMIN_EMAILS per call (not cached at module load), so setting
// it here is enough — and is itself worth asserting: this env var IS the whole
// access-control list.
process.env.ADMIN_EMAILS = ADMIN_EMAIL;

let adminId = "";
let repId = "";
/**
 * Ledger rows seeded by this run, tracked BY ID.
 *
 * Not deletable via `where userId in (adminId, repId)`: one seeded row is
 * deliberately unattributed (userId null), so an inArray cleanup silently skips
 * it and leaks a null-user row into llm_calls on every run. That made this smoke
 * pass exactly once and fail forever after — the second run saw two unattributed
 * rows where it asserted one. Found by re-running it, which is the only way that
 * class of bug ever shows up.
 */
const seededCallIds: string[] = [];
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(`[admin] ${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
};

const cookieFor = (userId: string, email: string): string =>
  `${SESSION_COOKIE_NAME}=${signSession({ userId, email })}`;

/**
 * Read the ledger totals straight from the DB, for a before/after baseline.
 * Mirrors the route's own aggregation deliberately — if the route ever stops
 * counting unattributed rows, the delta assertions below break, which is the
 * point.
 */
async function readSpendTotals(): Promise<{
  costUsd: number;
  calls: number;
  unpriced: number;
  unattributedCalls: number;
  unattributedUsd: number;
}> {
  const rows = await db.select().from(llmCallsTable);
  return {
    costUsd: rows.reduce((a, r) => a + Number(r.costUsd), 0),
    calls: rows.length,
    unpriced: rows.filter((r) => r.costUnpriced).length,
    unattributedCalls: rows.filter((r) => r.userId === null).length,
    unattributedUsd: rows
      .filter((r) => r.userId === null)
      .reduce((a, r) => a + Number(r.costUsd), 0),
  };
}

const repPaused = async (): Promise<boolean> => {
  const rows = await db
    .select({ p: usersTable.followupsPaused })
    .from(usersTable)
    .where(eq(usersTable.id, repId))
    .limit(1);
  return rows[0]!.p;
};

async function cleanup(): Promise<void> {
  try {
    // By id, not by userId — the unattributed row has userId null and would
    // survive an inArray(userId) filter. See seededCallIds.
    if (seededCallIds.length) {
      await db.delete(llmCallsTable).where(inArray(llmCallsTable.id, seededCallIds));
    }
    const ids = [adminId, repId].filter(Boolean);
    if (ids.length) {
      await db.delete(actionLogsTable).where(inArray(actionLogsTable.userId, ids));
      await db.delete(usersTable).where(inArray(usersTable.id, ids));
    }
  } catch (e) {
    console.error("[admin] cleanup failed:", e);
  }
}

async function main(): Promise<number> {
  const [a] = await db
    .insert(usersTable)
    .values({ email: ADMIN_EMAIL, name: "Admin" })
    .returning({ id: usersTable.id });
  adminId = a!.id;
  const [r] = await db
    .insert(usersTable)
    .values({ email: REP_EMAIL, name: "Rep" })
    .returning({ id: usersTable.id });
  repId = r!.id;

  // Baseline BEFORE seeding. The rollup aggregates the whole table, so
  // asserting absolute totals only works on an empty DB — true today, false the
  // moment anything else has spent. Deltas are what this smoke actually means.
  const baseline = await readSpendTotals();

  // Seed ledger rows: one attributed, one NOT (userId null) — the unattributed
  // row is the one the rollup must surface rather than quietly drop.
  const seeded = await db
    .insert(llmCallsTable)
    .values([
      {
        userId: repId,
        task: "draft",
        model: "claude-sonnet-5",
        provider: "anthropic",
        inputTokens: 100,
        outputTokens: 50,
        costUsd: "0.010000",
      },
      {
        userId: null,
        task: "research",
        model: "claude-opus-4-7",
        provider: "anthropic",
        inputTokens: 200,
        outputTokens: 80,
        costUsd: "0.400000",
      },
      {
        userId: repId,
        task: "draft",
        model: "some-unpriced-model",
        provider: "anthropic",
        inputTokens: 10,
        outputTokens: 5,
        costUsd: "0",
        costUnpriced: true,
      },
    ])
    .returning({ id: llmCallsTable.id });
  seededCallIds.push(...seeded.map((s) => s.id));

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api", loadUser);
  app.use("/api", adminRouter);
  const server = app.listen(0);
  await new Promise<void>((res) => server.once("listening", () => res()));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;

  const post = (path: string, cookie: string | null, body: unknown) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  const get = (path: string, cookie: string | null) =>
    fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {} });

  const adminCookie = cookieFor(adminId, ADMIN_EMAIL);
  const repCookie = cookieFor(repId, REP_EMAIL);
  const pausePath = `/api/admin/users/${repId}/followups-pause`;

  // ── 1. authz on the kill switch — the part that must not be wrong ─────────
  console.log("\n1. authz — who may pause another human's outreach");
  check(
    "anonymous → 401, and the rep is NOT paused",
    (await post(pausePath, null, { paused: true })).status === 401 && !(await repPaused()),
  );
  const asRep = await post(pausePath, repCookie, { paused: true });
  check(
    "signed-in NON-admin → 403, and the rep is NOT paused",
    asRep.status === 403 && !(await repPaused()),
    `status ${asRep.status}`,
  );

  // ── 2. the write ──────────────────────────────────────────────────────────
  console.log("\n2. the admin write");
  const asAdmin = await post(pausePath, adminCookie, { paused: true });
  check(
    "admin → 200 and the flag actually flips in the DB",
    asAdmin.status === 200 && (await repPaused()),
    `status ${asAdmin.status}`,
  );

  const logs = await db
    .select({ meta: actionLogsTable.metadata, type: actionLogsTable.actionType })
    .from(actionLogsTable)
    .where(eq(actionLogsTable.userId, repId));
  const audit = logs.find((l) => l.type === ACTION_TYPES.adminFollowupsPauseToggled);
  check("the pause is audited on the TARGET's timeline", audit !== undefined);
  check(
    "…and the audit names the ACTOR (the rep can't see who paused them otherwise)",
    (audit?.meta as { actorEmail?: string } | null)?.actorEmail === ADMIN_EMAIL,
    JSON.stringify(audit?.meta ?? null),
  );

  const resumed = await post(pausePath, adminCookie, { paused: false });
  check(
    "admin can resume → flag clears (the switch is reversible)",
    resumed.status === 200 && !(await repPaused()),
  );

  // ── 3. input handling ─────────────────────────────────────────────────────
  console.log("\n3. input handling");
  check(
    "non-boolean paused → 400",
    (await post(pausePath, adminCookie, { paused: "yes" })).status === 400,
  );
  check(
    "unknown user id → 404, not a silent success",
    (
      await post(
        `/api/admin/users/00000000-0000-0000-0000-000000000000/followups-pause`,
        adminCookie,
        { paused: true },
      )
    ).status === 404,
  );

  // ── 4. the ledger rollup ──────────────────────────────────────────────────
  console.log("\n4. ledger rollup — what it must not hide");
  check("llm-spend → 403 for a non-admin", (await get("/api/admin/llm-spend", repCookie)).status === 403);

  const spendRes = await get("/api/admin/llm-spend?days=30", adminCookie);
  const spend = (await spendRes.json()) as {
    totals: { costUsd: number; calls: number; unpricedCalls: number };
    unattributed: { costUsd: number; calls: number };
    byModel: Array<{ model: string; costUsd: number; unpricedCalls: number }>;
    byTask: Array<{ task: string }>;
    coverageStartsAt: string | null;
    days: number;
  };
  check("llm-spend → 200 for an admin", spendRes.status === 200);
  // Deltas vs the pre-seed baseline — see readSpendTotals.
  check(
    "unattributed spend is its OWN line, not dropped (+1 call, +$0.40)",
    spend.unattributed.calls - baseline.unattributedCalls === 1 &&
      Math.abs(spend.unattributed.costUsd - baseline.unattributedUsd - 0.4) < 1e-9,
    JSON.stringify(spend.unattributed),
  );
  check(
    "…and it is still COUNTED in the total (+0.01 +0.40 +0 = +0.41)",
    Math.abs(spend.totals.costUsd - baseline.costUsd - 0.41) < 1e-9,
    `total=${spend.totals.costUsd} baseline=${baseline.costUsd}`,
  );
  check(
    "unpriced calls are surfaced (else a model-id bump under-reports silently)",
    spend.totals.unpricedCalls - baseline.unpriced === 1,
    `unpriced=${spend.totals.unpricedCalls} baseline=${baseline.unpriced}`,
  );
  check(
    "per-MODEL split exists — the thing daily_usage/action_logs cannot give",
    spend.byModel.some((m) => m.model === "claude-opus-4-7") &&
      spend.byModel.some((m) => m.model === "claude-sonnet-5") &&
      spend.byModel.some((m) => m.model === "some-unpriced-model"),
    spend.byModel.map((m) => m.model).join(","),
  );
  check("per-TASK split exists", spend.byTask.some((t) => t.task === "research"));
  check(
    "coverageStartsAt is reported (history is NOT backfillable — UI must not imply zero)",
    spend.coverageStartsAt !== null,
  );

  // ?days is user input against an append-only unbounded table.
  const clamped = (await (await get("/api/admin/llm-spend?days=99999", adminCookie)).json()) as {
    days: number;
  };
  check("days is clamped (?days=99999 → 365, no unbounded scan)", clamped.days === 365, `days=${clamped.days}`);
  const bad = (await (await get("/api/admin/llm-spend?days=abc", adminCookie)).json()) as {
    days: number;
  };
  check("non-numeric days → default 30, not NaN", bad.days === 30, `days=${bad.days}`);

  server.close();
  console.log(`\n[admin] ${fail === 0 ? "ALL PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
  return fail;
}

main()
  .then(async (f) => {
    await cleanup();
    process.exit(f ? 1 : 0);
  })
  .catch(async (e) => {
    console.error("[admin] crashed:", e);
    await cleanup();
    process.exit(1);
  });
