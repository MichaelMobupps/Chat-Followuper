#!/usr/bin/env node
/**
 * Integration test — Ticket 1.7 — campaigns CRUD.
 *
 * Asserts:
 *   - POST /api/campaigns creates a campaign owned by the test user
 *   - GET /api/campaigns lists it (excludes archived by default)
 *   - GET /api/campaigns/:id returns detail with prospectCount
 *   - PATCH /api/campaigns/:id updates fields
 *   - POST /api/campaigns/:id/archive sets archivedAt
 *   - POST /api/campaigns/:id/unarchive clears archivedAt
 *   - DELETE /api/campaigns/:id hard-deletes; cascades prospects.campaignId → NULL
 *   - Cross-user access returns 404 (not 403; do not leak existence)
 *   - Unauthenticated request returns 401
 *
 * Requires:
 *   - Running api-server on localhost (PORT env or 3000)
 *   - DATABASE_URL pointing to the same DB
 *   - SESSION_SECRET matches the api-server's SESSION_SECRET (used to mint
 *     the test session cookie)
 *
 * Cleans up after itself: deletes both test users (cascade clears their
 * campaigns and prospects).
 *
 * Exit code 0 on full success; 1 on any failure.
 */

import { createHmac } from "node:crypto";
import postgres from "postgres";

const PORT = process.env.PORT || "3000";
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const DB_URL = process.env.DATABASE_URL;
const SECRET = process.env.SESSION_SECRET;

if (!DB_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!SECRET || SECRET.length < 16) {
  console.error("SESSION_SECRET is required (and must match the running server)");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────
// Session cookie minting (matches src/lib/session.ts)
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
// DB setup
// ─────────────────────────────────────────────────────────────────

const sql = postgres(DB_URL, { max: 4 });

async function makeUser(email) {
  const rows = await sql`
    INSERT INTO users (email, name, is_connected)
    VALUES (${email}, ${"Test User"}, ${true})
    RETURNING id, email
  `;
  return rows[0];
}

async function deleteUser(email) {
  await sql`DELETE FROM users WHERE email = ${email}`;
}

// ─────────────────────────────────────────────────────────────────
// Test
// ─────────────────────────────────────────────────────────────────

const TEST_EMAIL_A = `__t17_camp_a_${Date.now()}@test.local`;
const TEST_EMAIL_B = `__t17_camp_b_${Date.now()}@test.local`;

async function main() {
  console.log(`[T1.7-CAMPAIGNS] target=${BASE}`);

  // Cleanup any leftover test users from previous runs.
  await sql`DELETE FROM users WHERE email LIKE ${"__t17_camp_%@test.local"}`;

  let userA, userB;
  try {
    userA = await makeUser(TEST_EMAIL_A);
    userB = await makeUser(TEST_EMAIL_B);
  } catch (err) {
    console.error("setup: failed to create test users", err);
    await sql.end();
    process.exit(1);
  }

  const cookieA = signSession({ userId: userA.id, email: userA.email });
  const cookieB = signSession({ userId: userB.id, email: userB.email });

  console.log(`\n[STEP 1] unauthenticated → 401`);
  {
    const r = await jsonFetch("/api/campaigns");
    check("GET /api/campaigns without cookie returns 401", r.status === 401, `got ${r.status}`);
  }

  console.log(`\n[STEP 2] create campaign`);
  let campaignId;
  {
    const r = await jsonFetch("/api/campaigns", {
      method: "POST",
      cookie: cookieA,
      body: JSON.stringify({
        name: "EMEA Fintech",
        description: "Q3 outreach to European fintechs",
        defaultChannel: "whatsapp",
        defaultLanguage: "en",
        defaultCountry: "GB",
      }),
    });
    check("POST /api/campaigns returns 201", r.status === 201, `got ${r.status}`);
    check("response has campaign.id", typeof r.body?.campaign?.id === "string");
    check("response has correct name", r.body?.campaign?.name === "EMEA Fintech");
    check("defaultChannel persisted", r.body?.campaign?.defaultChannel === "whatsapp");
    campaignId = r.body?.campaign?.id;
  }

  console.log(`\n[STEP 3] list campaigns (active only)`);
  {
    const r = await jsonFetch("/api/campaigns", { cookie: cookieA });
    check("GET /api/campaigns returns 200", r.status === 200);
    check("list contains created campaign", Array.isArray(r.body?.campaigns) && r.body.campaigns.some((c) => c.id === campaignId));
  }

  console.log(`\n[STEP 4] cross-user isolation (user B cannot see A's campaign)`);
  {
    const r = await jsonFetch("/api/campaigns", { cookie: cookieB });
    check("user B sees empty list (or not A's campaign)", r.status === 200 && (!r.body.campaigns || !r.body.campaigns.some((c) => c.id === campaignId)));
  }

  console.log(`\n[STEP 5] cross-user detail (user B → 404 on A's campaign)`);
  {
    const r = await jsonFetch(`/api/campaigns/${campaignId}`, { cookie: cookieB });
    check("user B GET /api/campaigns/:id returns 404", r.status === 404, `got ${r.status}`);
  }

  console.log(`\n[STEP 6] detail includes prospectCount`);
  {
    const r = await jsonFetch(`/api/campaigns/${campaignId}`, { cookie: cookieA });
    check("GET /api/campaigns/:id returns 200", r.status === 200);
    check("response has campaign", r.body?.campaign?.id === campaignId);
    check("response has prospectCount", typeof r.body?.prospectCount === "number");
    check("prospectCount is 0 (no prospects yet)", r.body?.prospectCount === 0);
  }

  console.log(`\n[STEP 7] insert a prospect under this campaign, recheck count`);
  let prospectId;
  {
    const rows = await sql`
      INSERT INTO prospects (user_id, phone, source_mode, campaign_id)
      VALUES (${userA.id}, ${"+447700900111"}, ${"apollo"}, ${campaignId})
      RETURNING id
    `;
    prospectId = rows[0].id;

    const r = await jsonFetch(`/api/campaigns/${campaignId}`, { cookie: cookieA });
    check("prospectCount is now 1", r.body?.prospectCount === 1);
  }

  console.log(`\n[STEP 8] PATCH campaign`);
  {
    const r = await jsonFetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      cookie: cookieA,
      body: JSON.stringify({ name: "EMEA Fintech (renamed)", defaultLanguage: "fr" }),
    });
    check("PATCH returns 200", r.status === 200);
    check("name updated", r.body?.campaign?.name === "EMEA Fintech (renamed)");
    check("language updated", r.body?.campaign?.defaultLanguage === "fr");
    check("country preserved", r.body?.campaign?.defaultCountry === "GB");
  }

  console.log(`\n[STEP 9] cross-user PATCH → 404`);
  {
    const r = await jsonFetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      cookie: cookieB,
      body: JSON.stringify({ name: "hijack attempt" }),
    });
    check("user B PATCH returns 404", r.status === 404);
  }

  console.log(`\n[STEP 10] archive`);
  {
    const r = await jsonFetch(`/api/campaigns/${campaignId}/archive`, {
      method: "POST",
      cookie: cookieA,
    });
    check("archive returns 200", r.status === 200);
    check("archivedAt populated", r.body?.campaign?.archivedAt !== null && r.body?.campaign?.archivedAt !== undefined);
  }

  console.log(`\n[STEP 11] list excludes archived by default`);
  {
    const r = await jsonFetch("/api/campaigns", { cookie: cookieA });
    check("archived campaign not in default list", !r.body?.campaigns?.some((c) => c.id === campaignId));
  }

  console.log(`\n[STEP 12] list includes archived when ?includeArchived=true`);
  {
    const r = await jsonFetch("/api/campaigns?includeArchived=true", { cookie: cookieA });
    check("archived campaign visible with includeArchived", r.body?.campaigns?.some((c) => c.id === campaignId));
  }

  console.log(`\n[STEP 13] unarchive`);
  {
    const r = await jsonFetch(`/api/campaigns/${campaignId}/unarchive`, {
      method: "POST",
      cookie: cookieA,
    });
    check("unarchive returns 200", r.status === 200);
    check("archivedAt cleared", r.body?.campaign?.archivedAt === null);
  }

  console.log(`\n[STEP 14] DELETE cascades campaignId on prospects to NULL`);
  {
    const r = await jsonFetch(`/api/campaigns/${campaignId}`, {
      method: "DELETE",
      cookie: cookieA,
    });
    check("DELETE returns 200", r.status === 200);

    const prospectRows = await sql`
      SELECT campaign_id FROM prospects WHERE id = ${prospectId}
    `;
    check("prospect survived", prospectRows.length === 1);
    check("prospect.campaignId is NULL", prospectRows[0]?.campaign_id === null);
  }

  console.log(`\n[STEP 15] invalid body → 400`);
  {
    const r = await jsonFetch("/api/campaigns", {
      method: "POST",
      cookie: cookieA,
      body: JSON.stringify({ name: "", defaultLanguage: "english" }),
    });
    check("POST with bad body returns 400", r.status === 400);
  }

  console.log(`\n[STEP 16] reject Slack channel (master plan dropped Slack)`);
  {
    const r = await jsonFetch("/api/campaigns", {
      method: "POST",
      cookie: cookieA,
      body: JSON.stringify({ name: "test slack", defaultChannel: "slack" }),
    });
    check("POST with channel=slack returns 400", r.status === 400);
  }

  // Cleanup
  await deleteUser(TEST_EMAIL_A);
  await deleteUser(TEST_EMAIL_B);
  await sql.end();

  console.log(`\n${"─".repeat(60)}`);
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.length} assertion(s)`);
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log(`PASSED: all assertions`);
  process.exit(0);
}

main().catch(async (err) => {
  console.error("UNCAUGHT:", err);
  try { await deleteUser(TEST_EMAIL_A); } catch {}
  try { await deleteUser(TEST_EMAIL_B); } catch {}
  try { await sql.end(); } catch {}
  process.exit(1);
});
