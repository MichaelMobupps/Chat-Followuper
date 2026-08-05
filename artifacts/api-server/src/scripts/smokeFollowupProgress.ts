/**
 * Smoke: follow-up generation progress + edit-before-send (Phase I).
 *
 * Run: FOLLOWUP_DIGEST_SCHEDULER=false \
 *   node ../../lib/db/node_modules/tsx/dist/cli.mjs src/scripts/smokeFollowupProgress.ts
 *
 * Boots the real Express app in-process, seeds a prospect (research brief +
 * first message already present, as after a real stage-0 send) with one
 * scheduled follow-up, then asserts:
 *   - POST send-next-followup generates on demand while
 *     GET /api/followups/:id/progress advances through real stages
 *     (queued/writing → ready, pct 100) — no "researching" (brief reused)
 *   - the generated message persists on the followup row
 *   - EDIT-BEFORE-SEND: PATCH the generatedMessage, call send-next again →
 *     the response carries the EDITED body (what the SDR sends is the edit,
 *     not a regeneration) and the deep link embeds it
 *   - the cached/edited path does not re-enter generation (no fresh
 *     "writing" run for that call)
 *   - tenant scoping: an unknown followup id → {stage:"idle"}, never a leak
 *
 * Requires ANTHROPIC_API_KEY (one real generation). Cleans up its rows.
 */
import { eq } from "drizzle-orm";
import { db, pool, prospectsTable, followupsTable, usersTable } from "@workspace/db";
import app from "../app";
import { SESSION_COOKIE_NAME, signSession } from "../lib/session";

const results: string[] = [];
function assert(name: string, ok: boolean, detail = ""): void {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ProgressBody { stage: string; pct: number; error?: string }

function fixtureBrief() {
  return {
    determinedCountry: "United States",
    determinedScaleTier: "mid",
    scaleRationale: "smoke fixture",
    calibratedDailyVolume: "1,200 confirmed purchases",
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["add to cart"],
    finalCompetitors: ["Amazon", "Walmart"],
    subsidiaryCheckNote: "",
    marketContext: "US marketplace competition is high",
    prospectSpecificHook: "seasonal demand spike",
    prospectPrimaryGrowthProblem: "post-purchase ROAS",
    whyArgument: "Your US marketplace faces rising CAC.",
    validationArgument: "We optimize to confirmed purchase at 1,200/day.",
    howArgument: "Confirmed-purchase optimization with returns-window screening.",
    tangibleReasons: ["1,200 confirmed purchases/day", "returns-window adjusted"],
    whyArgumentNative: "",
    validationArgumentNative: "",
    howArgumentNative: "",
    generatedAt: new Date().toISOString(),
    generatorModel: "fixture",
    generatorCostUsd: 0,
  };
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("SKIP  smokeFollowupProgress needs ANTHROPIC_API_KEY");
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

  let prospectId: string | null = null;

  try {
    // ── Seed: prospect as it looks AFTER a real stage-0 send ──────────────
    const [prospect] = await db
      .insert(prospectsTable)
      .values({
        userId: user.id,
        sourceMode: "manual",
        prospectName: "FollowProg",
        company: "SmokeCo Marketplace",
        vertical: "web_cps",
        subVertical: "cps_web_classifieds_general",
        product: "CPS / performance marketing",
        country: "United States",
        language: "en",
        phone: "+15550990077",
        firstMessageChannel: "whatsapp",
        firstMessageBody:
          "Hi FollowProg, SmokeCo's US marketplace growth caught my eye — confirmed-purchase optimization at 1,200/day is exactly the fit. Worth a quick look?",
        firstMessageSentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        researchBrief: fixtureBrief(),
      })
      .returning({ id: prospectsTable.id });
    prospectId = prospect.id;

    const [followup] = await db
      .insert(followupsTable)
      .values({
        prospectId: prospect.id,
        stage: 1,
        channel: "whatsapp",
        status: "scheduled",
        scheduledAt: new Date(),
      })
      .returning({ id: followupsTable.id });
    const followupId = followup.id;
    assert("seeded prospect + scheduled followup", true, `followup ${followupId}`);

    // Progress before any run → idle.
    const idle = (await (await fetch(`${base}/api/followups/${followupId}/progress`, { headers: { cookie } })).json()) as ProgressBody;
    assert("progress idle before run", idle.stage === "idle", idle.stage);

    // ── Kick send-next (generates on demand) and poll the lifecycle ──────
    const sendPromise = fetch(`${base}/api/prospects/${prospect.id}/send-next-followup`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ channel: "whatsapp" }),
    });

    const seen = new Set<string>();
    const deadline = Date.now() + 240_000;
    let last = "idle";
    while (Date.now() < deadline) {
      const p = (await (await fetch(`${base}/api/followups/${followupId}/progress`, { headers: { cookie } })).json()) as ProgressBody;
      seen.add(p.stage);
      last = p.stage;
      if (p.stage === "ready" || p.stage === "error") {
        assert("terminal pct is 100", p.pct === 100, `pct=${p.pct}`);
        break;
      }
      await sleep(1200);
    }

    const sendRes = await sendPromise;
    const sendBody = (await sendRes.json()) as {
      followupId?: number; stage?: number; deepLinkUrl?: string; generatedMessage?: string; error?: string;
    };

    assert("send-next 200", sendRes.status === 200, `HTTP ${sendRes.status} ${JSON.stringify(sendBody).slice(0, 160)}`);
    assert("send-next targeted the seeded row", sendBody.followupId === followupId, String(sendBody.followupId));
    assert("reached ready stage", last === "ready", `last=${last}, seen=[${[...seen].join(",")}]`);
    assert("passed through a real work stage", seen.has("queued") || seen.has("writing"), `seen=[${[...seen].join(",")}]`);
    assert("no researching stage (brief reused)", !seen.has("researching"), `seen=[${[...seen].join(",")}]`);
    assert("response carries the generated message",
      typeof sendBody.generatedMessage === "string" && sendBody.generatedMessage.trim().length > 0);

    const [rowAfter] = await db
      .select({ generatedMessage: followupsTable.generatedMessage })
      .from(followupsTable)
      .where(eq(followupsTable.id, followupId));
    assert("message persisted on the followup row",
      !!rowAfter?.generatedMessage && rowAfter.generatedMessage === sendBody.generatedMessage);

    // ── Edit-before-send: PATCH the body, send-next must serve the EDIT ──
    const EDITED = "EDITED-BY-SMOKE: quick nudge — did the confirmed-purchase numbers land with your team?";
    const patchRes = await fetch(`${base}/api/followups/${followupId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ generatedMessage: EDITED }),
    });
    assert("PATCH edit 200", patchRes.status === 200, `HTTP ${patchRes.status}`);

    const send2 = await fetch(`${base}/api/prospects/${prospect.id}/send-next-followup`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ channel: "whatsapp" }),
    });
    const send2Body = (await send2.json()) as { generatedMessage?: string; deepLinkUrl?: string };
    assert("second send-next 200", send2.status === 200, `HTTP ${send2.status}`);
    assert("edited message is what gets sent", send2Body.generatedMessage === EDITED,
      (send2Body.generatedMessage ?? "").slice(0, 60));
    assert("deep link embeds the edited body",
      !!send2Body.deepLinkUrl && send2Body.deepLinkUrl.includes(encodeURIComponent("EDITED-BY-SMOKE")),
      (send2Body.deepLinkUrl ?? "").slice(0, 80));

    // ── Tenant scoping ────────────────────────────────────────────────────
    const foreign = (await (await fetch(`${base}/api/followups/999999999/progress`, { headers: { cookie } })).json()) as ProgressBody;
    assert("unknown followup id → idle (no leak)", foreign.stage === "idle", foreign.stage);
    const junk = (await (await fetch(`${base}/api/followups/not-a-number/progress`, { headers: { cookie } })).json()) as ProgressBody;
    assert("non-numeric id → idle (no 500)", junk.stage === "idle", junk.stage);
  } finally {
    if (prospectId) {
      // followups cascade on prospect delete.
      await db.delete(prospectsTable).where(eq(prospectsTable.id, prospectId));
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
