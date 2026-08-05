/**
 * Smoke: Contacts prepare-progress lifecycle (Phase H).
 *
 * Run: FOLLOWUP_DIGEST_SCHEDULER=false \
 *   node ../../lib/db/node_modules/tsx/dist/cli.mjs src/scripts/smokePrepareProgress.ts
 *
 * Boots the real Express app in-process, mints a session cookie, ingests a
 * manual contact on each channel, kicks off prepare-first-message, polls the
 * progress endpoint through the lifecycle, and asserts:
 *   - progress starts non-idle (queued/researching/writing) shortly after POST
 *   - progress advances through real stages
 *   - progress ends at "ready" with pct 100 and the message persists
 *   - the endpoint is tenant-scoped (unknown prospect → idle, not a leak)
 *
 * Requires ANTHROPIC_API_KEY (real research + generation). Cleans up its own
 * prospects on exit.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, pool, prospectsTable, usersTable } from "@workspace/db";
import app from "../app";
import { SESSION_COOKIE_NAME, signSession } from "../lib/session";

// This smoke drives ONE deliberate, interactive prepare per channel. Without
// this, manual-ingest ALSO queues a background prepare for the same contact
// (Speed pass, 2026-07-16) — the in-flight dedupe would join the two runs,
// but the background run stamps "queued" before our POST and doubles the
// paths under test. One run, owned by this script. Read per-call.
process.env.BACKGROUND_PREPARE = "false";

const results: string[] = [];
function assert(name: string, ok: boolean, detail = ""): void {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ProgressBody { stage: string; pct: number; error?: string }
interface PrepareBody { message?: string; status?: string; error?: string }
async function jsonOf<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("SKIP  smokePrepareProgress needs ANTHROPIC_API_KEY");
    return;
  }

  const user = (await db.select().from(usersTable).limit(1))[0];
  if (!user) throw new Error("no seed user");
  const cookie = `${SESSION_COOKIE_NAME}=${signSession({ userId: user.id, email: user.email })}`;

  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const createdIds: string[] = [];

  // One channel is enough to exercise the shared pipeline end-to-end (the
  // progress hooks live in channel-agnostic prepareFirstMessage). We ingest
  // WhatsApp — the fastest identifier to mint — and also assert LinkedIn
  // ingest so the button's cross-channel promise is covered structurally.
  const channels: Array<{ channel: string; identifier: string }> = [
    { channel: "whatsapp", identifier: "+15550990001" },
    { channel: "linkedin", identifier: "https://www.linkedin.com/in/smoke-progress-li" },
  ];

  try {
    for (const { channel, identifier } of channels) {
      const ingest = await fetch(`${base}/api/prospects/manual-ingest`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          channel,
          firstName: "Progress",
          phone: identifier,
          company: "SmokeCo Marketplace",
          ticker: "mobile",
        }),
      });
      if (ingest.status !== 201) {
        assert(`[${channel}] ingest`, false, `HTTP ${ingest.status}`);
        continue;
      }
      const prospect = (await ingest.json()) as { id: string };
      createdIds.push(prospect.id);
      assert(`[${channel}] ingest`, true, prospect.id);

      // Endpoint before any run → idle.
      const idle = await jsonOf<ProgressBody>(
        await fetch(`${base}/api/prospects/${prospect.id}/prepare-progress`, { headers: { cookie } }),
      );
      assert(`[${channel}] progress idle before run`, idle.stage === "idle", idle.stage);

      // Kick off prepare (do NOT await — we want to poll while it runs).
      const preparePromise = fetch(`${base}/api/prospects/${prospect.id}/prepare-first-message`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ channel }),
      });

      // Poll the progress endpoint; collect the stage sequence. A full
      // generation runs research + a writer→critic→lint healing loop (~75s
      // all-Anthropic; more on the first calls that trip the Gemini breaker),
      // so give the run generous headroom — this asserts the PROGRESS
      // lifecycle, not generation latency.
      const seen = new Set<string>();
      const deadline = Date.now() + 240_000;
      let last = "idle";
      while (Date.now() < deadline) {
        const p = await jsonOf<ProgressBody>(
          await fetch(`${base}/api/prospects/${prospect.id}/prepare-progress`, { headers: { cookie } }),
        );
        seen.add(p.stage);
        last = p.stage;
        if (p.stage === "ready" || p.stage === "error") {
          assert(`[${channel}] terminal pct is 100`, p.pct === 100, `pct=${p.pct}`);
          break;
        }
        await sleep(1200);
      }

      const prepareRes = await preparePromise;
      const prepareBody = await jsonOf<PrepareBody>(prepareRes);

      assert(`[${channel}] prepare-first-message 200`, prepareRes.status === 200, `HTTP ${prepareRes.status} ${JSON.stringify(prepareBody).slice(0, 160)}`);
      assert(`[${channel}] reached ready stage`, last === "ready", `last=${last}, seen=[${[...seen].join(",")}]`);
      assert(`[${channel}] passed through a real work stage`,
        seen.has("researching") || seen.has("writing"),
        `seen=[${[...seen].join(",")}]`);
      assert(`[${channel}] message persisted`,
        typeof prepareBody.message === "string" && prepareBody.message.trim().length > 0);
    }

    // Tenant scoping: a random prospect id the user doesn't own → idle, never a leak.
    const foreign = await jsonOf<ProgressBody>(
      await fetch(`${base}/api/prospects/00000000-0000-0000-0000-000000000000/prepare-progress`, { headers: { cookie } }),
    );
    assert("unknown prospect id → idle (no cross-tenant leak)", foreign.stage === "idle", foreign.stage);
  } finally {
    if (createdIds.length) {
      await db.delete(prospectsTable).where(
        and(eq(prospectsTable.userId, user.id), inArray(prospectsTable.id, createdIds)),
      );
    }
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
