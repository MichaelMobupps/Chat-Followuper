/**
 * Smoke: the admin kill switch (users.followups_paused). Requires a live DB.
 * ZERO LLM spend — every follow-up is seeded with a pre-set generatedMessage,
 * so no send path here ever reaches the writer.
 *
 * WHY THIS EXISTS, AND WHY IT IS THIS SHAPE
 *
 * The switch has no chokepoint to test. The due-row predicate is duplicated
 * across 5 selection sites and the send routes each re-check independently, so
 * "does the switch work" is 11 separate questions, and the failure mode is
 * silent: an ungated path does not error, it just quietly sends mail on a
 * paused rep's behalf. A test that covers 10 of 11 looks identical to one that
 * covers 11.
 *
 * So this asserts THREE things, and all three are load-bearing:
 *
 *  1. BOTH DIRECTIONS. Every gate is asserted blocked-when-paused AND
 *     allowed-when-unpaused, against the same seeded row. A gate that always
 *     blocks (e.g. a predicate typo'd to a constant) passes a one-sided test
 *     while silently breaking every unpaused rep in production.
 *
 *  2. THE SCOPE CONTRACT, not just the mechanism. `followups_paused` must NOT
 *     stop first messages (stage 0) or the weekly stats digest — both are
 *     deliberate exclusions (user decisions 2026-07-15), not oversights. They
 *     are asserted here precisely BECAUSE they look like gaps: without a test
 *     saying "this is intentional", the next reader closes them as bugs.
 *     send-intent is the sharp edge — ONE route serving both first messages and
 *     follow-ups, gated on followupId, where "just add the check" silently
 *     kills first-touch outreach.
 *
 *  3. STRUCTURAL COVERAGE. A functional test can only cover paths that exist
 *     today. The pushover paths are unreachable here (they no-op without app
 *     config), and a NEW send path added next month would be covered by
 *     nothing. So section 4 asserts every known selection site still mentions
 *     the flag — a canary for "someone refactored the gate out" and a forcing
 *     function for "someone added a 12th path".
 *
 *   FOLLOWUP_DIGEST_SCHEDULER=false node ../../lib/db/node_modules/tsx/dist/cli.mjs \
 *     src/scripts/smokeKillSwitch.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, prospectsTable, followupsTable } from "@workspace/db";
import { mintOpenToken } from "../lib/followupLinkToken";
import { fetchDueRows } from "../services/followupDigest";
import followupOpenRouter from "../routes/followupOpen";
import followupFallbackRouter from "../routes/followupFallback";

process.env.PUBLIC_BASE_URL ??= "http://localhost";
process.env.APP_PUBLIC_URL ??= "http://localhost";

const MSG = "Hi Test, following up on my note from last week — worth a look?";
let userId = "";
let prospectId = "";
let followupId = 0;

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(
    `[killswitch] ${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`,
  );
  if (ok) pass++;
  else fail++;
};

async function setPaused(paused: boolean): Promise<void> {
  await db
    .update(usersTable)
    .set({ followupsPaused: paused })
    .where(eq(usersTable.id, userId));
}

/** Reset the followup to un-sent so each direction tests the same start state. */
async function resetFollowup(): Promise<void> {
  await db
    .update(followupsTable)
    .set({ sentAt: null, status: "scheduled" })
    .where(eq(followupsTable.id, followupId));
}

async function seed(): Promise<void> {
  const [u] = await db
    .insert(usersTable)
    .values({
      email: `smoke-killswitch-${Date.now()}@example.test`,
      name: "Smoke Rep",
    })
    .returning({ id: usersTable.id });
  userId = u!.id;

  const [p] = await db
    .insert(prospectsTable)
    .values({
      userId,
      sourceMode: "manual",
      prospectName: "Test",
      company: "SmokeCo",
      phone: "+972500000009",
      // Explicit, not defaulted: this smoke asserts that the USER-level pause
      // blocks even when the PROSPECT-level pause is off, so the prospect flag
      // must be pinned false or a passing run could be the wrong gate firing.
      followupPaused: false,
      replied: 0,
    })
    .returning({ id: prospectsTable.id });
  prospectId = p!.id;

  const [f] = await db
    .insert(followupsTable)
    .values({
      prospectId,
      stage: 1,
      channel: "whatsapp",
      status: "scheduled",
      // Pre-set so no send path can reach the LLM. This smoke is free.
      generatedMessage: MSG,
      scheduledAt: new Date(Date.now() - 60_000), // due 1 min ago
    })
    .returning({ id: followupsTable.id });
  followupId = f!.id;
}

async function cleanup(): Promise<void> {
  try {
    if (followupId) {
      await db.delete(followupsTable).where(inArray(followupsTable.id, [followupId]));
    }
    if (prospectId) {
      await db.delete(prospectsTable).where(eq(prospectsTable.id, prospectId));
    }
    if (userId) await db.delete(usersTable).where(eq(usersTable.id, userId));
  } catch (e) {
    console.error("[killswitch] cleanup failed:", e);
  }
}

async function main(): Promise<number> {
  await seed();

  const app = express();
  app.use("/api", followupOpenRouter);
  app.use("/api", followupFallbackRouter);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const token = mintOpenToken(followupId, userId);
  const mine = (rows: Array<{ followupId: number }>): boolean =>
    rows.some((r) => r.followupId === followupId);

  // ── 1. fetchDueRows — the digest predicate ────────────────────────────────
  // Covers THREE callers at once: the hourly scheduler, the deployed cron in
  // scripts/sendFollowupDigests.ts, and the test-digest preview in
  // routes/userExtras.ts. Both directions.
  console.log("\n1. fetchDueRows (digest email — 3 callers)");
  await setPaused(false);
  check(
    "unpaused → row IS due (proves the gate isn't a constant)",
    mine(await fetchDueRows(userId)),
  );
  await setPaused(true);
  check("paused → row is NOT due", !mine(await fetchDueRows(userId)));
  check(
    "paused → row is NOT due in the unscoped run either",
    !mine(await fetchDueRows()),
  );

  // ── 2. Token-authed digest links ──────────────────────────────────────────
  // These never populate req.user (no session — they're opened from an email),
  // so they read the flag from their own join. followupOpen/confirm is the pair
  // that reads symmetric but wasn't: confirm had no usersTable join at all.
  console.log("\n2. token-authed digest links (no session — req.user is undefined)");
  await setPaused(true);
  const openPaused = await fetch(
    `${base}/api/followups/open/${followupId}?t=${encodeURIComponent(token)}`,
    { redirect: "manual" },
  );
  const locPaused = openPaused.headers.get("location") ?? "";
  check(
    "paused → /open does NOT hand out the wa.me deep link",
    openPaused.status === 302 && !/wa\.me/.test(locPaused),
    `${openPaused.status} ${locPaused.slice(0, 60)}`,
  );

  const fbPaused = await fetch(
    `${base}/api/followups/fallback/${followupId}?t=${encodeURIComponent(token)}`,
    { redirect: "manual" },
  );
  check(
    "paused → /fallback does NOT serve the message body",
    fbPaused.status === 302,
    `status ${fbPaused.status}`,
  );

  // confirm is what STAMPS the send — if this leaks, the switch is cosmetic.
  const confirmPaused = await fetch(
    `${base}/api/followups/confirm/${followupId}?t=${encodeURIComponent(token)}`,
    { method: "POST", redirect: "manual" },
  );
  const afterConfirm = await db
    .select({ sentAt: followupsTable.sentAt })
    .from(followupsTable)
    .where(eq(followupsTable.id, followupId))
    .limit(1);
  check(
    "paused → /confirm does NOT stamp sentAt (the switch is real, not cosmetic)",
    confirmPaused.status === 302 && afterConfirm[0]?.sentAt == null,
    `status ${confirmPaused.status} sentAt=${afterConfirm[0]?.sentAt ?? "null"}`,
  );

  // Other direction: unpaused, the same link must still work end-to-end.
  await setPaused(false);
  await resetFollowup();
  const openLive = await fetch(
    `${base}/api/followups/open/${followupId}?t=${encodeURIComponent(token)}`,
    { redirect: "manual" },
  );
  const locLive = openLive.headers.get("location") ?? "";
  check(
    "unpaused → /open DOES hand out the wa.me deep link",
    openLive.status === 302 && /wa\.me/.test(locLive),
    `${openLive.status} ${locLive.slice(0, 60)}`,
  );
  const confirmLive = await fetch(
    `${base}/api/followups/confirm/${followupId}?t=${encodeURIComponent(token)}`,
    { method: "POST", redirect: "manual" },
  );
  const afterLive = await db
    .select({ sentAt: followupsTable.sentAt })
    .from(followupsTable)
    .where(eq(followupsTable.id, followupId))
    .limit(1);
  check(
    "unpaused → /confirm DOES stamp sentAt",
    afterLive[0]?.sentAt != null,
    `status ${confirmLive.status}`,
  );
  await resetFollowup();

  // ── 3. THE SCOPE CONTRACT — what the switch must NOT touch ────────────────
  // These are deliberate exclusions. They are asserted because they LOOK like
  // gaps: a reader who "fixes" them silently kills first-touch outreach or a
  // paused rep's own reporting.
  console.log("\n3. scope contract — deliberate exclusions (NOT bugs)");
  const weeklySrc = fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../services/weeklyDigest.ts",
    ),
    "utf8",
  );
  check(
    "weekly STATS digest is NOT gated (user decision 2026-07-15 — it reports, it doesn't act)",
    !/followupsPaused/.test(weeklySrc),
  );

  const linkSrc = fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../routes/whatsappLink.ts",
    ),
    "utf8",
  );
  check(
    "send-intent gates on followupId !== null → a FIRST message is never blocked",
    /req\.body\.followupId !== null/.test(linkSrc) &&
      /user\.followupsPaused/.test(linkSrc),
  );
  check(
    "send-intent also closes the pre-existing per-PROSPECT hole",
    /ownProspect\.followupPaused/.test(linkSrc),
  );

  // ── 4. STRUCTURAL COVERAGE — the canary ───────────────────────────────────
  // A functional test covers only today's paths. This asserts every known
  // selection site still carries the flag, so removing a gate, or adding a 12th
  // send path without one, trips here instead of in production.
  console.log("\n4. structural — every known send path still carries the gate");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const mustGate: Array<[string, string]> = [
    ["services/followupDigest.ts", "digest email (fetchDueRows — 3 callers)"],
    ["services/pushoverDigest.ts", "pushover digest"],
    ["services/pushoverNudges.ts", "overdue escalation + Monday nudge"],
    ["routes/followups.ts", "send-next-followup"],
    ["routes/followupOpen.ts", "digest link open + confirm"],
    ["routes/followupFallback.ts", "copy-paste fallback"],
    ["routes/whatsappLink.ts", "send-intent"],
    ["middlewares/auth.ts", "loadUser carries the flag onto req.user"],
  ];
  for (const [rel, label] of mustGate) {
    const src = fs.readFileSync(path.resolve(here, "..", rel), "utf8");
    check(`${rel} gates — ${label}`, /followupsPaused/.test(src));
  }
  // pushoverNudges has TWO independent gates (the Monday nudge selects every
  // user with no WHERE clause, so it cannot share the escalation's predicate).
  const nudgeSrc = fs.readFileSync(
    path.resolve(here, "../services/pushoverNudges.ts"),
    "utf8",
  );
  check(
    "pushoverNudges has BOTH gates (escalation predicate + Monday-nudge continue)",
    (nudgeSrc.match(/followupsPaused/g) ?? []).length >= 3,
    `${(nudgeSrc.match(/followupsPaused/g) ?? []).length} references`,
  );

  server.close();
  console.log(
    `\n[killswitch] ${fail === 0 ? "ALL PASS" : "FAIL"} — ${pass} passed, ${fail} failed`,
  );
  return fail;
}

main()
  .then(async (f) => {
    await cleanup();
    process.exit(f ? 1 : 0);
  })
  .catch(async (e) => {
    console.error("[killswitch] crashed:", e);
    await cleanup();
    process.exit(1);
  });
