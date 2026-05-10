#!/usr/bin/env node
/**
 * Integration test for Ticket 2.2-BE-C — /api/prospector/discover endpoint. v2.
 *
 * Uses cf_session cookie auth (matching 2.2-BE-B test pattern). Required env:
 *   DATABASE_URL, SESSION_SECRET (>= 16 chars).
 * Optional env:
 *   BASE_URL (default http://localhost:80), SKIP_LIVE_DISCOVER=1.
 *
 * Run:
 *   DATABASE_URL=$DATABASE_URL SESSION_SECRET=$SESSION_SECRET \
 *     node tests/integration-2-2-be-c-discover.mjs
 *
 * What this verifies:
 *   1. Auth gating (401 without cookie / with malformed cookie).
 *   2. Body validation (Zod schema enforces field types and limits).
 *   3. Live cascade end-to-end (Probo): response shape, audit fields, contacts,
 *      action_log row. Skip with SKIP_LIVE_DISCOVER=1 if Apollo creds absent.
 *   4. Skip-Opus / skip-subsidiary toggles work.
 *   5. Cross-tenant isolation: User A's invalid request never logs under User B.
 *   6. Action_log persistence: success path writes prospector.discover row
 *      with metadata.{resolution, opus_rescue_ran, contacts_returned, ...}.
 *
 * Cleans up its own action_logs and users at the end (success or failure path).
 *
 * Note: rate-limit test is omitted by design — the 12/min/user limit is
 * shared with /discover-simple and verified in 2.2-BE-B. Re-testing here
 * would burn 65s of wall-clock for the window to clear.
 */

import { Client } from "pg";
import crypto from "node:crypto";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:80";
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET;
const SKIP_LIVE_DISCOVER = process.env.SKIP_LIVE_DISCOVER === "1";

if (!DATABASE_URL) {
  console.error("[FATAL] DATABASE_URL must be set");
  process.exit(2);
}
if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  console.error("[FATAL] SESSION_SECRET must be set and >= 16 chars");
  process.exit(2);
}

const SESSION_COOKIE_NAME = "cf_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const TEST_EMAIL_PATTERN_PREFIX = "__t22c_discover_";
const TEST_EMAIL_LIKE = `${TEST_EMAIL_PATTERN_PREFIX}%@test.local`;

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
    actual === expected || JSON.stringify(actual) === JSON.stringify(expected);
  assert(
    ok,
    `${msg} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
  );
}

// ─── Session cookie minting (mirror of api-server's verifier) ─────────────

function base64UrlEncode(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function mintSessionCookie(userId, email) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = JSON.stringify({ userId, email, exp });
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
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const email = `${TEST_EMAIL_PATTERN_PREFIX}${label}_${stamp}@test.local`;
  const r = await client.query(
    `INSERT INTO users (email, name, created_at, updated_at)
     VALUES ($1, $2, now(), now())
     RETURNING id, email`,
    [email, `Test ${label}`],
  );
  return r.rows[0];
}

async function cleanup() {
  const client = await pg();
  await client.query(
    `DELETE FROM action_logs
     WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [TEST_EMAIL_LIKE],
  );
  await client.query(`DELETE FROM users WHERE email LIKE $1`, [TEST_EMAIL_LIKE]);
}

async function disconnect() {
  if (pgClient) {
    await pgClient.end();
    pgClient = null;
  }
}

async function actionLogCount(userId, actionType) {
  const client = await pg();
  const r = await client.query(
    `SELECT COUNT(*)::int AS n FROM action_logs
     WHERE user_id = $1 AND action_type = $2`,
    [userId, actionType],
  );
  return r.rows[0].n;
}

async function actionLogLatest(userId, actionType) {
  const client = await pg();
  const r = await client.query(
    `SELECT action_status, duration_ms, error_detail, metadata
     FROM action_logs WHERE user_id = $1 AND action_type = $2
     ORDER BY executed_at DESC LIMIT 1`,
    [userId, actionType],
  );
  return r.rows[0] ?? null;
}

// ─── HTTP helper ───────────────────────────────────────────────────────────

async function postJson(path, body, cookie) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(BASE_URL + path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, body: parsed, raw: text };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

async function testAuthGating() {
  console.log("\n[1] Auth gating on /discover");
  const path = "/api/prospector/discover";

  const r1 = await postJson(path, {}, null);
  assertEqual(r1.status, 401, `${path}: 401 without cookie`);

  const r2 = await postJson(path, {}, "cf_session=garbage.signature");
  assertEqual(r2.status, 401, `${path}: 401 with malformed cookie`);
}

async function testBodyValidation(user) {
  console.log("\n[2] Body validation (Zod strict)");
  const cookie = mintSessionCookie(user.id, user.email);

  const r1 = await postJson(
    "/api/prospector/discover",
    { brand: "x".repeat(600) },
    cookie,
  );
  assertEqual(r1.status, 400, "brand >500 chars → 400");

  const r2 = await postJson(
    "/api/prospector/discover",
    { targetContacts: 100 },
    cookie,
  );
  assertEqual(r2.status, 400, "targetContacts > 50 → 400");

  const r3 = await postJson(
    "/api/prospector/discover",
    { sourceType: "wrong_value" },
    cookie,
  );
  assertEqual(r3.status, 400, "invalid sourceType → 400");

  const r4 = await postJson(
    "/api/prospector/discover",
    { brand: "Probo", extra_field: "rejected" },
    cookie,
  );
  assertEqual(r4.status, 400, "extra field (Zod strict) → 400");

  const r5 = await postJson(
    "/api/prospector/discover",
    { apolloCallBudget: 5 },
    cookie,
  );
  assertEqual(r5.status, 400, "apolloCallBudget < 10 → 400");

  const r6 = await postJson(
    "/api/prospector/discover",
    { apolloCallBudget: 250 },
    cookie,
  );
  assertEqual(r6.status, 400, "apolloCallBudget > 200 → 400");
}

async function testLiveDiscover(user) {
  console.log("\n[3] Live /discover with real Apollo (Probo)");
  if (SKIP_LIVE_DISCOVER) {
    console.log("  [SKIP] SKIP_LIVE_DISCOVER=1 — skipping live test");
    return;
  }

  const cookie = mintSessionCookie(user.id, user.email);
  const startCount = await actionLogCount(user.id, "prospector.discover");

  const r = await postJson(
    "/api/prospector/discover",
    {
      brand: "Probo",
      appName: "Probo: Opinion Trading App",
      domain: "probo.in",
      country: "IN",
      description: "Trade on opinions in real-time markets",
      sourceType: "play_store",
      targetContacts: 3,
      skipOpusRescue: false,
      apolloCallBudget: 60,
    },
    cookie,
  );

  console.log(
    `  status=${r.status} body.status=${r.body?.status} resolution=${r.body?.audit?.resolution} contacts=${r.body?.contacts?.length ?? "n/a"} apollo_calls=${r.body?.audit?.apolloCallsConsumed ?? "n/a"}`,
  );
  assertEqual(r.status, 200, "live discover → 200");

  if (r.status !== 200) {
    console.log("  Body for diagnosis:", JSON.stringify(r.body, null, 2).slice(0, 800));
    return;
  }

  assert(
    r.body.status === "success" ||
      r.body.status === "no_contacts_found" ||
      r.body.status === "no_org_found" ||
      r.body.status === "budget_exhausted",
    `body.status is a valid terminal state (got: ${r.body.status})`,
  );
  assert(r.body.resolved !== null, "resolved company present");
  assert(r.body.audit, "audit present");
  assert(
    typeof r.body.audit.apolloCallsConsumed === "number",
    "audit.apolloCallsConsumed is number",
  );
  assert(r.body.audit.apolloCallsConsumed > 0, "Apollo calls were consumed");
  assert(
    typeof r.body.audit.budgetExhausted === "boolean",
    "audit.budgetExhausted is boolean",
  );
  assert(typeof r.body.audit.aborted === "boolean", "audit.aborted is boolean");
  assert(typeof r.body.audit.upgradedToParent === "boolean", "audit.upgradedToParent is boolean");
  assert(typeof r.body.audit.resolution === "string", "audit.resolution is string");
  assert(typeof r.body.audit.strictStrategy === "string", "audit.strictStrategy is string");

  // If success, verify contacts shape
  if (r.body.status === "success") {
    assert(r.body.org !== null, "success → org returned");
    assert(typeof r.body.org.id === "string" && r.body.org.id.length > 0, "org has id");
    assert(typeof r.body.org.name === "string" && r.body.org.name.length > 0, "org has name");
    assert(Array.isArray(r.body.contacts), "success → contacts array");
    assert(r.body.contacts.length >= 1, "success → at least 1 contact");
    if (r.body.contacts.length >= 1) {
      const c = r.body.contacts[0];
      assert(typeof c.email === "string" && c.email.includes("@"), "contact has email");
      assert(typeof c.firstName === "string", "contact has firstName");
      assert(typeof c.title === "string", "contact has title");
    }
  }

  // Verify action_log row was written
  const endCount = await actionLogCount(user.id, "prospector.discover");
  assertEqual(
    endCount - startCount,
    1,
    "exactly 1 prospector.discover action_log row written",
  );

  const latest = await actionLogLatest(user.id, "prospector.discover");
  assert(latest !== null, "action_log row retrievable");
  if (latest) {
    assert(
      latest.action_status === "success" ||
        latest.action_status === "skipped" ||
        latest.action_status === "failure",
      `action_status valid (got: ${latest.action_status})`,
    );
    assert(latest.metadata && typeof latest.metadata === "object", "metadata is object");
    assert(typeof latest.metadata.resolution === "string", "metadata.resolution present");
    assert(
      typeof latest.metadata.apollo_calls_consumed === "number",
      "metadata.apollo_calls_consumed present",
    );
    assert(
      typeof latest.metadata.contacts_returned === "number",
      "metadata.contacts_returned present",
    );
    assert("opus_rescue_ran" in latest.metadata, "metadata.opus_rescue_ran present");
    assert(
      "subsidiaries_found" in latest.metadata,
      "metadata.subsidiaries_found present",
    );
    assert(
      typeof latest.metadata.llm_input_tokens === "number" &&
        latest.metadata.llm_input_tokens > 0,
      "metadata.llm_input_tokens > 0",
    );
    assert(
      typeof latest.metadata.llm_output_tokens === "number",
      "metadata.llm_output_tokens >= 0",
    );
  }
}

async function testSkipOpusToggle(user) {
  console.log("\n[4] skipOpusRescue toggle");
  if (SKIP_LIVE_DISCOVER) {
    console.log("  [SKIP] SKIP_LIVE_DISCOVER=1 — skipping toggle test");
    return;
  }
  const cookie = mintSessionCookie(user.id, user.email);

  // Use a brand the standard cascade should resolve (Probo) to keep cost minimal,
  // then verify the audit shows opusRescue did NOT run when skipOpusRescue=true.
  const r = await postJson(
    "/api/prospector/discover",
    {
      brand: "Probo",
      appName: "Probo: Opinion Trading App",
      domain: "probo.in",
      country: "IN",
      sourceType: "play_store",
      targetContacts: 2,
      skipOpusRescue: true,
      skipSubsidiaryExpansion: true,
      apolloCallBudget: 30,
    },
    cookie,
  );

  assertEqual(r.status, 200, "skip-Opus discover → 200");
  if (r.status === 200) {
    assert(
      r.body.audit.opusRescue === undefined ||
        r.body.audit.opusRescue.ran === false,
      "skipOpusRescue=true → audit.opusRescue not ran",
    );
    assert(
      r.body.audit.subsidiaryExpansion === undefined ||
        r.body.audit.subsidiaryExpansion.ran === false,
      "skipSubsidiaryExpansion=true → expansion not ran",
    );
  }
}

async function testCrossTenantIsolation(userA, userB) {
  console.log("\n[5] Cross-tenant isolation");
  const cookieA = mintSessionCookie(userA.id, userA.email);

  const beforeB = await actionLogCount(userB.id, "prospector.discover");

  // User A makes an invalid request (rejected at body validation)
  const r = await postJson(
    "/api/prospector/discover",
    { targetContacts: -1 },
    cookieA,
  );
  assertEqual(r.status, 400, "User A invalid request → 400");

  // Verify no action_log row was written under User B
  const afterB = await actionLogCount(userB.id, "prospector.discover");
  assertEqual(afterB, beforeB, "User B count unchanged after User A request");
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Ticket 2.2-BE-C Integration Test ===");
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log(`SKIP_LIVE_DISCOVER: ${SKIP_LIVE_DISCOVER}`);

  let userA = null;
  let userB = null;

  try {
    userA = await createTestUser("a");
    userB = await createTestUser("b");
    console.log(`Test users: A=${userA.id} B=${userB.id}`);

    await testAuthGating();
    await testBodyValidation(userA);
    await testLiveDiscover(userA);
    await testSkipOpusToggle(userA);
    await testCrossTenantIsolation(userA, userB);

    console.log("\n=== Summary ===");
    console.log(`PASS: ${passed}`);
    console.log(`FAIL: ${failed}`);
    if (failed > 0) {
      console.log("\nFailed assertions:");
      for (const f of failures) console.log(`  - ${f}`);
    }
  } catch (err) {
    console.error("\n[FATAL]", err);
    failed++;
  } finally {
    try {
      await cleanup();
      console.log("Cleanup complete.");
    } catch (e) {
      console.warn("Cleanup error:", e.message);
    }
    await disconnect();
  }

  process.exit(failed === 0 ? 0 : 1);
}

main();
