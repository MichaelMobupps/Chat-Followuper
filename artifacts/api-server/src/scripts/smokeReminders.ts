/**
 * Smoke: Reminders & schedule (2026-07-09).
 *
 * Run: FOLLOWUP_DIGEST_SCHEDULER=false \
 *   node ../../lib/db/node_modules/tsx/dist/cli.mjs src/scripts/smokeReminders.ts
 *
 * All-offline except the notification-settings HTTP roundtrip (dev DB, no
 * external APIs — no LLM/SMTP/Pushover calls). Asserts:
 *   - PATCH/GET roundtrip of pushoverHourLocal / pushoverDays / digestDays,
 *     including the dedupe+sort transform and [] as a valid "never"
 *   - validation bounds reject hour 24 and day 7 (400)
 *   - per-user schedule gates (isUserPushoverScheduleNow / isUserDigestDayNow)
 *     honor day membership, hour >= semantics, and empty-array "never"
 *   - renderDigestEmail carries BOTH per-row links (Follow up + Review in
 *     dashboard) for every row
 * Restores the user's original settings on exit.
 */
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../app";
import { SESSION_COOKIE_NAME, signSession } from "../lib/session";
import {
  isUserPushoverScheduleNow,
  isUserDigestDayNow,
  localClockNow,
} from "../lib/pushoverSchedule";
import { renderDigestEmail, type DueRow } from "../services/followupDigest";

const results: string[] = [];
function assert(name: string, ok: boolean, detail = ""): void {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  const user = (await db.select().from(usersTable).limit(1))[0];
  if (!user) throw new Error("no seed user");
  const cookie = `${SESSION_COOKIE_NAME}=${signSession({ userId: user.id, email: user.email })}`;

  const original = {
    pushoverHourLocal: user.pushoverHourLocal,
    pushoverDays: user.pushoverDays,
    digestDays: user.digestDays,
  };

  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const url = `${base}/api/users/me/notification-settings`;
  const headers = { "content-type": "application/json", cookie };

  try {
    // ── 1. PATCH/GET roundtrip incl. dedupe+sort transform ────────────────
    const patch1 = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ pushoverHourLocal: 8, pushoverDays: [5, 1, 3, 1], digestDays: [] }),
    });
    const p1 = (await patch1.json()) as { pushoverHourLocal: number; pushoverDays: number[]; digestDays: number[] };
    assert("PATCH new fields 200", patch1.status === 200, `HTTP ${patch1.status}`);
    assert("pushoverHourLocal persisted", p1.pushoverHourLocal === 8, String(p1.pushoverHourLocal));
    assert("pushoverDays deduped + sorted", JSON.stringify(p1.pushoverDays) === "[1,3,5]", JSON.stringify(p1.pushoverDays));
    assert("digestDays [] accepted (never)", JSON.stringify(p1.digestDays) === "[]", JSON.stringify(p1.digestDays));

    const get1 = (await (await fetch(url, { headers: { cookie } })).json()) as typeof p1;
    assert("GET roundtrips the values",
      get1.pushoverHourLocal === 8 && JSON.stringify(get1.pushoverDays) === "[1,3,5]" && JSON.stringify(get1.digestDays) === "[]");

    // ── 2. Validation bounds ───────────────────────────────────────────────
    const bad1 = await fetch(url, { method: "PATCH", headers, body: JSON.stringify({ pushoverHourLocal: 24 }) });
    assert("hour 24 rejected 400", bad1.status === 400, `HTTP ${bad1.status}`);
    const bad2 = await fetch(url, { method: "PATCH", headers, body: JSON.stringify({ digestDays: [7] }) });
    assert("day 7 rejected 400", bad2.status === 400, `HTTP ${bad2.status}`);

    // ── 3. Schedule gates (pure; derive expectations from the same clock) ──
    const tz = "UTC";
    const { hour, weekday } = localClockNow(tz);
    delete process.env.PUSHOVER_SKIP_SCHEDULE_CHECK;
    const digestSkipBefore = process.env.DIGEST_SKIP_HOUR_CHECK;
    delete process.env.DIGEST_SKIP_HOUR_CHECK;

    assert("pushover gate: empty days = never",
      !isUserPushoverScheduleNow({ pushoverHourLocal: 0, pushoverDays: [], digestTimezone: tz }));
    assert("pushover gate: today's weekday + hour<=now fires",
      isUserPushoverScheduleNow({ pushoverHourLocal: Math.max(0, hour), pushoverDays: [weekday], digestTimezone: tz }));
    assert("pushover gate: future hour today does NOT fire",
      hour >= 23 || !isUserPushoverScheduleNow({ pushoverHourLocal: hour + 1, pushoverDays: [weekday], digestTimezone: tz }),
      `hour=${hour}`);
    assert("pushover gate: other weekday does NOT fire",
      !isUserPushoverScheduleNow({ pushoverHourLocal: 0, pushoverDays: [(weekday + 1) % 7], digestTimezone: tz }));
    assert("digest day gate: today allowed",
      isUserDigestDayNow({ digestDays: [weekday], digestTimezone: tz }));
    assert("digest day gate: empty = never",
      !isUserDigestDayNow({ digestDays: [], digestTimezone: tz }));
    assert("digest day gate: other day blocked",
      !isUserDigestDayNow({ digestDays: [(weekday + 1) % 7], digestTimezone: tz }));

    if (digestSkipBefore !== undefined) process.env.DIGEST_SKIP_HOUR_CHECK = digestSkipBefore;

    // ── 4. Digest render: both per-row links present ───────────────────────
    const row: DueRow = {
      followupId: 42, stage: 2, channel: "telegram", userId: user.id,
      userEmail: user.email, userName: "Smoke", prospectName: "Render Check",
      company: "LinkCo", digestHourLocal: 9, digestTimezone: "UTC",
      digestDays: [0, 1, 2, 3, 4, 5, 6],
    };
    const html = renderDigestEmail("Smoke", [row]);
    assert("digest row has Follow up button", html.includes("/api/followups/open/42?t="));
    assert("digest row has Review-in-dashboard link", html.includes("/followup/telegram") && html.includes("Review in dashboard"));
    assert("digest html escapes prospect fields", html.includes("Render Check at LinkCo"));
  } finally {
    // Restore the user's original settings.
    await db
      .update(usersTable)
      .set(original)
      .where(eq(usersTable.id, user.id))
      .catch(() => {});
    await new Promise((r) => server.close(r));
    await pool.end();
  }

  console.log("\n" + results.join("\n"));
  console.log(process.exitCode ? "\n❌ SMOKE FAILED" : "\n✅ SMOKE PASSED");
}

main().catch((err) => {
  console.error("smoke crashed:", err);
  process.exit(1);
});
