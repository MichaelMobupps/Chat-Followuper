#!/usr/bin/env node
/**
 * Integration test — Ticket 1.7 — generate first message.
 *
 * Asserts:
 *   - POST /api/prospects/:id/generate-message returns
 *     { subject, message, costUsd, iterations, finalOverallScore }
 *   - prospect.firstMessageBody is populated after the call
 *   - prospect.campaignId is preserved through the operation
 *   - daily_usage.anthropic_spend_usd increases by costUsd
 *   - action_logs gets a "seeder.message_generated" success row
 *   - 401 without auth
 *   - 404 cross-user
 *   - 409 if researchBrief is missing
 *
 * SPEND WARNING: this test calls Anthropic for real. Each run costs
 * roughly $0.10–0.20. By default the live-Anthropic block is SKIPPED
 * (test exits 0 with a notice). To run the live block, set
 * RUN_LIVE_ANTHROPIC=1 in the environment.
 *
 * The non-live assertions (401, 404, 409 preconditions) always run; they
 * cost nothing because the route exits before invoking the generator.
 *
 * Cleans up after itself. Exit 0 on success, 1 on any failure.
 */

import { createHmac } from "node:crypto";
import postgres from "postgres";

const PORT = process.env.PORT || "3000";
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const DB_URL = process.env.DATABASE_URL;
const SECRET = process.env.SESSION_SECRET;
const RUN_LIVE = process.env.RUN_LIVE_ANTHROPIC === "1";

if (!DB_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!SECRET || SECRET.length < 16) {
  console.error("SESSION_SECRET is required (and must match the running server)");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────
// Cookie minting (matches src/lib/session.ts)
// ─────────────────────────────────────────────────────────────────

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
function signSession({ userId, email }) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  const payload = b64url(JSON.stringify({ userId, email, exp }));
  const sig = b64url(createHmac("sha256", SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

// ─────────────────────────────────────────────────────────────────
// Test harness
// ─────────────────────────────────────────────────────────────────

const failures = [];
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ""}`);
    failures.push(name);
  }
}

async function jsonFetch(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers ?? {}) };
  if (opts.cookie) headers["Cookie"] = `cf_session=${opts.cookie}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

// ─────────────────────────────────────────────────────────────────
// Fixture: a minimally valid ProspectBrief
// ─────────────────────────────────────────────────────────────────
// Mirrors the shape inferred from prospectResearch.ts at the time of
// authoring. Optional fields are omitted; the generator tolerates
// missing optional brief fields.

const RESEARCH_BRIEF_FIXTURE = {
  product: "real-money gaming app",
  vertical: "mobile_gaming",
  sub_vertical: "real_money_gaming",
  monetization_model: "in_app_purchases",
  primary_kpi: "purchasing_users",
  proof_points: [
    "Scaled UA for similar mobile gaming apps in tier-1 markets",
    "Programmatic optimization on revenue events, not installs",
  ],
  hook: "Most gaming UA networks optimize installs; we optimize on first-purchase events.",
  notes: "Indian market; predictions/skill-gaming; competitive UA landscape.",
};

const sql = postgres(DB_URL, { max: 4 });

const TEST_EMAIL_A = `__t17_msg_a_${Date.now()}@test.local`;
const TEST_EMAIL_B = `__t17_msg_b_${Date.now()}@test.local`;

async function makeUser(email) {
  const rows = await sql`
    INSERT INTO users (email, name, is_connected)
    VALUES (${email}, ${"Test Sender"}, ${true})
    RETURNING id, email
  `;
  return rows[0];
}

async function createProspect({ userId, campaignId, includeBrief }) {
  const rows = await sql`
    INSERT INTO prospects (
      user_id, campaign_id, prospect_name, company, vertical, sub_vertical,
      product, country, language, phone, source_mode, research_brief,
      first_message_channel
    )
    VALUES (
      ${userId}, ${campaignId},
      ${"Riya Patel"}, ${"Probo"}, ${"mobile_gaming"}, ${"real_money_gaming"},
      ${"real-money gaming app"}, ${"IN"}, ${"en"}, ${"+919900000111"},
      ${"apollo"},
      ${includeBrief ? JSON.stringify(RESEARCH_BRIEF_FIXTURE) : null},
      ${"whatsapp"}
    )
    RETURNING id
  `;
  return rows[0].id;
}

async function main() {
  console.log(`[T1.7-MESSAGE] target=${BASE}  live=${RUN_LIVE ? "yes" : "no (set RUN_LIVE_ANTHROPIC=1 to enable)"}`);

  // Cleanup leftovers.
  await sql`DELETE FROM users WHERE email LIKE ${"__t17_msg_%@test.local"}`;

  const userA = await makeUser(TEST_EMAIL_A);
  const userB = await makeUser(TEST_EMAIL_B);
  const cookieA = signSession({ userId: userA.id, email: userA.email });
  const cookieB = signSession({ userId: userB.id, email: userB.email });

  // Create a campaign for user A so we can verify campaign association
  // is preserved through the generate-message call.
  const campaignRows = await sql`
    INSERT INTO campaigns (user_id, name, default_channel)
    VALUES (${userA.id}, ${"Test campaign"}, ${"whatsapp"})
    RETURNING id
  `;
  const campaignId = campaignRows[0].id;

  console.log(`\n[STEP 1] unauthenticated → 401`);
  {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const r = await jsonFetch(`/api/prospects/${fakeId}/generate-message`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    check("POST without cookie returns 401", r.status === 401, `got ${r.status}`);
  }

  console.log(`\n[STEP 2] cross-user prospect → 404`);
  {
    const otherProspectId = await createProspect({
      userId: userA.id,
      campaignId: null,
      includeBrief: true,
    });
    const r = await jsonFetch(`/api/prospects/${otherProspectId}/generate-message`, {
      method: "POST",
      cookie: cookieB,
      body: JSON.stringify({}),
    });
    check("user B → 404 on user A's prospect", r.status === 404, `got ${r.status}`);
  }

  console.log(`\n[STEP 3] research not complete → 409 research_not_complete`);
  {
    const noBriefId = await createProspect({
      userId: userA.id,
      campaignId,
      includeBrief: false,
    });
    const r = await jsonFetch(`/api/prospects/${noBriefId}/generate-message`, {
      method: "POST",
      cookie: cookieA,
      body: JSON.stringify({}),
    });
    check("missing brief → 409", r.status === 409, `got ${r.status}`);
    check("error code is research_not_complete", r.body?.error === "research_not_complete");
  }

  if (!RUN_LIVE) {
    console.log(`\n[STEP 4] live Anthropic call SKIPPED (RUN_LIVE_ANTHROPIC unset)`);
    console.log(`         set RUN_LIVE_ANTHROPIC=1 to verify end-to-end (~$0.10-0.20)`);
  } else {
    console.log(`\n[STEP 4] live generation`);
    const prospectId = await createProspect({
      userId: userA.id,
      campaignId,
      includeBrief: true,
    });

    // Capture daily_usage state before.
    const today = new Date().toISOString().slice(0, 10);
    const beforeRows = await sql`
      SELECT anthropic_spend_usd, messages_generated
      FROM daily_usage WHERE user_id = ${userA.id} AND date = ${today}
    `;
    const beforeSpend = beforeRows.length > 0 ? Number(beforeRows[0].anthropic_spend_usd) : 0;
    const beforeCount = beforeRows.length > 0 ? Number(beforeRows[0].messages_generated) : 0;

    const r = await jsonFetch(`/api/prospects/${prospectId}/generate-message`, {
      method: "POST",
      cookie: cookieA,
      body: JSON.stringify({}),
    });

    check("POST returns 200", r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
    check("response.subject is string", typeof r.body?.subject === "string");
    check("response.message is string", typeof r.body?.message === "string");
    check("response.message non-empty", typeof r.body?.message === "string" && r.body.message.length > 0);
    check("response.costUsd is number", typeof r.body?.costUsd === "number");
    check("response.costUsd > 0", typeof r.body?.costUsd === "number" && r.body.costUsd > 0);
    check("response.iterations is number", typeof r.body?.iterations === "number");

    // Verify prospect persisted.
    const prospectRows = await sql`
      SELECT first_message_body, campaign_id, first_message_channel
      FROM prospects WHERE id = ${prospectId}
    `;
    check("first_message_body persisted", typeof prospectRows[0]?.first_message_body === "string" && prospectRows[0].first_message_body.length > 0);
    check("campaign association preserved", prospectRows[0]?.campaign_id === campaignId);
    check("first_message_channel set to whatsapp", prospectRows[0]?.first_message_channel === "whatsapp");

    // Verify daily_usage incremented.
    const afterRows = await sql`
      SELECT anthropic_spend_usd, messages_generated
      FROM daily_usage WHERE user_id = ${userA.id} AND date = ${today}
    `;
    const afterSpend = Number(afterRows[0]?.anthropic_spend_usd ?? 0);
    const afterCount = Number(afterRows[0]?.messages_generated ?? 0);
    check("daily_usage.messages_generated incremented", afterCount === beforeCount + 1);
    check(
      "daily_usage.anthropic_spend_usd increased by ~costUsd",
      Math.abs(afterSpend - beforeSpend - r.body.costUsd) < 0.001,
      `before=${beforeSpend} after=${afterSpend} cost=${r.body.costUsd}`,
    );

    // Verify action_logs row.
    const logRows = await sql`
      SELECT action_type, action_status, prospect_id
      FROM action_logs
      WHERE user_id = ${userA.id} AND action_type = ${"seeder.message_generated"}
      ORDER BY executed_at DESC LIMIT 1
    `;
    check("action_logs row written", logRows.length === 1);
    check("action_logs status = success", logRows[0]?.action_status === "success");
    check("action_logs prospect_id matches", logRows[0]?.prospect_id === prospectId);
  }

  // Cleanup.
  await sql`DELETE FROM users WHERE email = ${TEST_EMAIL_A}`;
  await sql`DELETE FROM users WHERE email = ${TEST_EMAIL_B}`;
  await sql.end();

  console.log(`\n${"─".repeat(60)}`);
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.length} assertion(s)`);
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log(`PASSED: ${RUN_LIVE ? "all assertions (live)" : "non-live assertions only"}`);
  process.exit(0);
}

main().catch(async (err) => {
  console.error("UNCAUGHT:", err);
  try { await sql`DELETE FROM users WHERE email LIKE ${"__t17_msg_%@test.local"}`; } catch {}
  try { await sql.end(); } catch {}
  process.exit(1);
});
