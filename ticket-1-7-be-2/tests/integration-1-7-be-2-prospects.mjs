/**
 * Integration test for Ticket 1.7-BE-2: /api/prospects CRUD.
 *
 * Lessons applied from prior test bundles:
 *   1. BASE_URL defaults to http://localhost:80 (proxy convention),
 *      not http://localhost:3000.
 *   2. Uses `pg` via @workspace/db's already-installed driver, not postgres.js.
 *   3. Helper functions take phone parameters explicitly to avoid
 *      (user_id, phone) unique-constraint collisions on multi-call.
 *   4. ISO_LANG_RE / regex-validated fields use values that match the
 *      route's actual validation regex.
 *
 * Run:
 *   node /tmp/integration-1-7-be-2-prospects.mjs
 *
 * Required env: DATABASE_URL, SESSION_SECRET. Optional: BASE_URL.
 */

import crypto from "node:crypto";
import { Client } from "pg";

// ─── Config ────────────────────────────────────────────────────────────────

const BASE_URL = process.env.BASE_URL ?? "http://localhost:80";
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!DATABASE_URL) {
  console.error("[FATAL] DATABASE_URL must be set");
  process.exit(2);
}
if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  console.error("[FATAL] SESSION_SECRET must be set and >= 16 chars");
  process.exit(2);
}

const SESSION_COOKIE_NAME = "session";
const TEST_EMAIL_PATTERN = "__t172_prospects_%@test.local";

// ─── Assertion harness ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ✗ FAIL: ${msg}`);
  }
}

function assertEqual(actual, expected, msg) {
  const ok =
    actual === expected ||
    JSON.stringify(actual) === JSON.stringify(expected);
  assert(ok, `${msg} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// ─── Session cookie minting (matches src/lib/session.ts HMAC scheme) ──────

function base64UrlEncode(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function mintSessionCookie(userId) {
  const payload = JSON.stringify({
    userId,
    issuedAt: Date.now(),
  });
  const payloadB64 = base64UrlEncode(Buffer.from(payload, "utf8"));
  const sig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadB64)
    .digest();
  const sigB64 = base64UrlEncode(sig);
  return `${SESSION_COOKIE_NAME}=${payloadB64}.${sigB64}`;
}

// ─── DB helpers ────────────────────────────────────────────────────────────

let pgClient = null;

async function pg() {
  if (!pgClient) {
    pgClient = new Client({ connectionString: DATABASE_URL });
    await pgClient.connect();
  }
  return pgClient;
}

async function createTestUser(label) {
  const client = await pg();
  const email = `__t172_prospects_${label}_${Date.now()}@test.local`;
  const result = await client.query(
    `INSERT INTO users (email, name)
     VALUES ($1, $2)
     RETURNING id, email`,
    [email, `Test User ${label}`],
  );
  return result.rows[0];
}

async function cleanup() {
  const client = await pg();
  // Cascades to prospects, action_logs, daily_usage, campaigns
  await client.query(`DELETE FROM users WHERE email LIKE $1`, [
    TEST_EMAIL_PATTERN,
  ]);
}

async function countProspects(userId) {
  const client = await pg();
  const r = await client.query(
    `SELECT COUNT(*)::int AS n FROM prospects WHERE user_id = $1`,
    [userId],
  );
  return r.rows[0].n;
}

async function countActionLogs(userId, actionType) {
  const client = await pg();
  const r = await client.query(
    `SELECT COUNT(*)::int AS n FROM action_logs
     WHERE user_id = $1 AND action_type = $2`,
    [userId, actionType],
  );
  return r.rows[0].n;
}

async function createCampaign(userId, name) {
  const client = await pg();
  const r = await client.query(
    `INSERT INTO campaigns (user_id, name)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, name],
  );
  return r.rows[0].id;
}

async function getProspectFromDb(prospectId) {
  const client = await pg();
  const r = await client.query(
    `SELECT * FROM prospects WHERE id = $1`,
    [prospectId],
  );
  return r.rows[0] ?? null;
}

async function insertFollowupForProspect(prospectId) {
  // Used to verify cascading delete. Use minimal valid followup row.
  const client = await pg();
  await client.query(
    `INSERT INTO followups (prospect_id, stage, channel, status, scheduled_at)
     VALUES ($1, 1, 'whatsapp', 'queued', NOW())`,
    [prospectId],
  );
}

async function countFollowupsForProspect(prospectId) {
  const client = await pg();
  const r = await client.query(
    `SELECT COUNT(*)::int AS n FROM followups WHERE prospect_id = $1`,
    [prospectId],
  );
  return r.rows[0].n;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────

async function api(method, path, opts = {}) {
  const headers = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.cookie) headers["Cookie"] = opts.cookie;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let body = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  } else {
    body = await res.text().catch(() => null);
  }
  return { status: res.status, body };
}

// ─── Test runner ───────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Integration test: 1.7-BE-2 prospects CRUD ===`);
  console.log(`Base URL: ${BASE_URL}\n`);

  // Clean any leftovers from prior runs
  await cleanup();

  console.log("--- Setup ---");
  const userA = await createTestUser("A");
  const userB = await createTestUser("B");
  const cookieA = mintSessionCookie(userA.id);
  const cookieB = mintSessionCookie(userB.id);
  const campaignA = await createCampaign(userA.id, "Test Campaign A");
  const campaignB = await createCampaign(userB.id, "Test Campaign B");
  console.log(`  userA=${userA.id}`);
  console.log(`  userB=${userB.id}`);
  console.log(`  campaignA=${campaignA}`);
  console.log(`  campaignB=${campaignB}\n`);

  // ── STEP 1: Auth gating ─────────────────────────────────────────────────
  console.log("--- STEP 1: Auth gating ---");
  let r = await api("POST", "/api/prospects", {
    body: { phone: "+919900000111", sourceMode: "manual" },
  });
  assertEqual(r.status, 401, "POST /api/prospects with no cookie → 401");

  r = await api("GET", `/api/prospects/${crypto.randomUUID()}`);
  assertEqual(r.status, 401, "GET /api/prospects/:id with no cookie → 401");

  r = await api("PATCH", `/api/prospects/${crypto.randomUUID()}`, {
    body: { prospectName: "x" },
  });
  assertEqual(r.status, 401, "PATCH /api/prospects/:id with no cookie → 401");

  r = await api("DELETE", `/api/prospects/${crypto.randomUUID()}`);
  assertEqual(r.status, 401, "DELETE /api/prospects/:id with no cookie → 401");

  // ── STEP 2: POST happy path (minimal) ──────────────────────────────────
  console.log("\n--- STEP 2: POST happy path (minimal) ---");
  r = await api("POST", "/api/prospects", {
    cookie: cookieA,
    body: { phone: "+919900000201", sourceMode: "manual" },
  });
  assertEqual(r.status, 201, "POST minimal → 201");
  assert(typeof r.body?.id === "string", "response has id");
  assertEqual(r.body?.userId, userA.id, "userId is current user");
  assertEqual(r.body?.phone, "+919900000201", "phone persisted");
  assertEqual(r.body?.sourceMode, "manual", "sourceMode persisted");
  assertEqual(r.body?.researchBrief, null, "researchBrief null when not provided");
  assertEqual(r.body?.campaignId, null, "campaignId null when not provided");
  assertEqual(r.body?.replied, 0, "replied=0 default");
  assertEqual(r.body?.followupPaused, false, "followupPaused=false default");
  assertEqual(r.body?.phoneRevealStatus, "none", "phoneRevealStatus=none default");
  const prospectId1 = r.body.id;

  // Verify action_log written
  const actionLogsAfterCreate = await countActionLogs(
    userA.id,
    "prospect.created",
  );
  assert(actionLogsAfterCreate >= 1, "action_logs has prospect.created row");

  // ── STEP 3: POST happy path (all fields + campaign) ─────────────────────
  console.log("\n--- STEP 3: POST with all fields + campaign ---");
  const fullBody = {
    phone: "+919900000202",
    sourceMode: "apollo",
    prospectName: "Test Prospect Full",
    company: "Test Co",
    title: "Head of UA",
    vertical: "fintech",
    subVertical: "fintech_lending",
    product: "loan_app",
    country: "IN",
    language: "en",
    telegramHandle: "@testtg",
    teamsEmail: "test@example.com",
    linkedinUrl: "https://linkedin.com/in/testperson",
    apolloPersonId: "apollo_person_123",
    apolloOrgId: "apollo_org_456",
    contextNotes: "Met at AdWorld, follow up Q2.",
    researchBrief: { primaryEvent: "first_loan", finalCompetitors: ["X", "Y"] },
    campaignId: campaignA,
  };
  r = await api("POST", "/api/prospects", {
    cookie: cookieA,
    body: fullBody,
  });
  assertEqual(r.status, 201, "POST full → 201");
  assertEqual(r.body?.prospectName, "Test Prospect Full", "name persisted");
  assertEqual(r.body?.country, "IN", "country persisted");
  assertEqual(r.body?.language, "en", "language persisted");
  assertEqual(
    r.body?.researchBrief?.primaryEvent,
    "first_loan",
    "researchBrief jsonb persisted",
  );
  assertEqual(r.body?.campaignId, campaignA, "campaignId persisted");
  const prospectId2 = r.body.id;

  // ── STEP 4: POST validation ─────────────────────────────────────────────
  console.log("\n--- STEP 4: POST validation ---");
  // Missing phone
  r = await api("POST", "/api/prospects", {
    cookie: cookieA,
    body: { sourceMode: "manual" },
  });
  assertEqual(r.status, 400, "missing phone → 400");

  // Invalid phone format (no +)
  r = await api("POST", "/api/prospects", {
    cookie: cookieA,
    body: { phone: "919900000301", sourceMode: "manual" },
  });
  assertEqual(r.status, 400, "phone without + → 400");

  // Invalid sourceMode
  r = await api("POST", "/api/prospects", {
    cookie: cookieA,
    body: { phone: "+919900000302", sourceMode: "facebook_lookalike" },
  });
  assertEqual(r.status, 400, "invalid sourceMode → 400");

  // Unknown field (server-controlled — strict() rejects)
  r = await api("POST", "/api/prospects", {
    cookie: cookieA,
    body: {
      phone: "+919900000303",
      sourceMode: "manual",
      firstMessageBody: "I should not be allowed to set this",
    },
  });
  assertEqual(r.status, 400, "unknown system field → 400");

  // slackUserId rejected (Slack dropped per decision log)
  r = await api("POST", "/api/prospects", {
    cookie: cookieA,
    body: {
      phone: "+919900000304",
      sourceMode: "manual",
      slackUserId: "U123",
    },
  });
  assertEqual(r.status, 400, "slackUserId rejected → 400");

  // Invalid country (not ISO)
  r = await api("POST", "/api/prospects", {
    cookie: cookieA,
    body: { phone: "+919900000305", sourceMode: "manual", country: "India" },
  });
  assertEqual(r.status, 400, "non-ISO country → 400");

  // Invalid language (not ISO)
  r = await api("POST", "/api/prospects", {
    cookie: cookieA,
    body: { phone: "+919900000306", sourceMode: "manual", language: "english" },
  });
  assertEqual(r.status, 400, "non-ISO language → 400");

  // ── STEP 5: POST cross-user campaign → 400 ─────────────────────────────
  console.log("\n--- STEP 5: POST with cross-user campaignId ---");
  r = await api("POST", "/api/prospects", {
    cookie: cookieA,
    body: {
      phone: "+919900000401",
      sourceMode: "manual",
      campaignId: campaignB, // belongs to user B
    },
  });
  assertEqual(r.status, 400, "cross-user campaignId → 400");
  assertEqual(r.body?.error, "invalid_campaign_id", "error code is invalid_campaign_id");

  // ── STEP 6: POST duplicate phone → 409 ─────────────────────────────────
  console.log("\n--- STEP 6: POST duplicate phone ---");
  r = await api("POST", "/api/prospects", {
    cookie: cookieA,
    body: { phone: "+919900000201", sourceMode: "manual" }, // same as STEP 2
  });
  assertEqual(r.status, 409, "duplicate phone → 409");
  assertEqual(r.body?.error, "duplicate_phone", "error code is duplicate_phone");

  // ── STEP 7: GET happy path ─────────────────────────────────────────────
  console.log("\n--- STEP 7: GET /:id ---");
  r = await api("GET", `/api/prospects/${prospectId2}`, { cookie: cookieA });
  assertEqual(r.status, 200, "GET own prospect → 200");
  assertEqual(r.body?.id, prospectId2, "returns correct id");
  assertEqual(r.body?.prospectName, "Test Prospect Full", "name matches");

  // GET cross-user → 404
  r = await api("GET", `/api/prospects/${prospectId2}`, { cookie: cookieB });
  assertEqual(r.status, 404, "GET cross-user prospect → 404");

  // GET non-existent UUID → 404
  r = await api("GET", `/api/prospects/${crypto.randomUUID()}`, {
    cookie: cookieA,
  });
  assertEqual(r.status, 404, "GET non-existent → 404");

  // GET malformed UUID → 404
  r = await api("GET", `/api/prospects/not-a-uuid`, { cookie: cookieA });
  assertEqual(r.status, 404, "GET malformed UUID → 404");

  // ── STEP 8: PATCH happy path ────────────────────────────────────────────
  console.log("\n--- STEP 8: PATCH /:id ---");
  r = await api("PATCH", `/api/prospects/${prospectId1}`, {
    cookie: cookieA,
    body: { prospectName: "Updated Name", contextNotes: "Updated notes" },
  });
  assertEqual(r.status, 200, "PATCH name + notes → 200");
  assertEqual(r.body?.prospectName, "Updated Name", "name updated");
  assertEqual(r.body?.contextNotes, "Updated notes", "notes updated");
  assertEqual(r.body?.phone, "+919900000201", "phone unchanged");

  // PATCH researchBrief (the seeder use case)
  r = await api("PATCH", `/api/prospects/${prospectId1}`, {
    cookie: cookieA,
    body: {
      researchBrief: {
        determinedCountry: "IN",
        finalCompetitors: ["A", "B"],
      },
    },
  });
  assertEqual(r.status, 200, "PATCH researchBrief → 200");
  assertEqual(
    r.body?.researchBrief?.determinedCountry,
    "IN",
    "researchBrief.determinedCountry persisted",
  );

  // PATCH researchBrief: null (clear)
  r = await api("PATCH", `/api/prospects/${prospectId1}`, {
    cookie: cookieA,
    body: { researchBrief: null },
  });
  assertEqual(r.status, 200, "PATCH researchBrief: null → 200");
  assertEqual(r.body?.researchBrief, null, "researchBrief cleared");

  // PATCH attempting to change phone → 400 (strict() rejects unknown? phone is
  // declared in createSchema but NOT in updateSchema. .strict() rejects.)
  r = await api("PATCH", `/api/prospects/${prospectId1}`, {
    cookie: cookieA,
    body: { phone: "+919900000999" },
  });
  assertEqual(r.status, 400, "PATCH phone → 400 (immutable)");

  // PATCH cross-user → 404
  r = await api("PATCH", `/api/prospects/${prospectId1}`, {
    cookie: cookieB,
    body: { prospectName: "hijack" },
  });
  assertEqual(r.status, 404, "PATCH cross-user → 404");

  // PATCH no-op (empty body) → 200, returns current state
  r = await api("PATCH", `/api/prospects/${prospectId1}`, {
    cookie: cookieA,
    body: {},
  });
  assertEqual(r.status, 200, "PATCH empty body → 200");
  assertEqual(r.body?.prospectName, "Updated Name", "no-op preserves state");

  // PATCH cross-user campaignId → 400
  r = await api("PATCH", `/api/prospects/${prospectId1}`, {
    cookie: cookieA,
    body: { campaignId: campaignB },
  });
  assertEqual(r.status, 400, "PATCH cross-user campaignId → 400");

  // ── STEP 9: DELETE cascades to followups ────────────────────────────────
  console.log("\n--- STEP 9: DELETE /:id cascades ---");
  // Insert a followup attached to prospectId2 to verify cascade
  await insertFollowupForProspect(prospectId2);
  const followupCountBefore = await countFollowupsForProspect(prospectId2);
  assert(followupCountBefore === 1, "followup row inserted");

  r = await api("DELETE", `/api/prospects/${prospectId2}`, { cookie: cookieA });
  assertEqual(r.status, 200, "DELETE → 200");
  assertEqual(r.body?.ok, true, "response ok=true");

  // Verify prospect gone
  const stillThere = await getProspectFromDb(prospectId2);
  assertEqual(stillThere, null, "prospect row deleted");

  // Verify followup cascade-deleted
  const followupCountAfter = await countFollowupsForProspect(prospectId2);
  assertEqual(followupCountAfter, 0, "followups cascade-deleted");

  // Verify action_log written for delete
  const deleteLogs = await countActionLogs(userA.id, "prospect.deleted");
  assert(deleteLogs >= 1, "action_logs has prospect.deleted row");

  // DELETE cross-user → 404
  r = await api("DELETE", `/api/prospects/${prospectId1}`, { cookie: cookieB });
  assertEqual(r.status, 404, "DELETE cross-user → 404");

  // Verify prospect1 still exists (cross-user attempt didn't delete)
  const stillExists = await getProspectFromDb(prospectId1);
  assert(stillExists !== null, "cross-user DELETE did not affect target");

  // DELETE non-existent → 404
  r = await api("DELETE", `/api/prospects/${crypto.randomUUID()}`, {
    cookie: cookieA,
  });
  assertEqual(r.status, 404, "DELETE non-existent → 404");

  // ── Cleanup ─────────────────────────────────────────────────────────────
  console.log("\n--- Cleanup ---");
  await cleanup();
  const remainingForA = await countProspects(userA.id);
  console.log(`  remaining prospects for userA: ${remainingForA}`);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log(`[PASS] all ${passed} assertions passed`);
}

main()
  .catch(async (err) => {
    console.error("\n[FATAL]", err);
    try {
      await cleanup();
    } catch {}
    process.exit(1);
  })
  .finally(async () => {
    if (pgClient) {
      try {
        await pgClient.end();
      } catch {}
    }
  });
