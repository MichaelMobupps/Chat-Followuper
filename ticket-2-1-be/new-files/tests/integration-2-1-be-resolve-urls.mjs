/**
 * Integration test for Ticket 2.1-BE: /api/prospector/resolve-urls.
 *
 * Tests auth, validation, website resolver (URL parsing only — no HTML
 * fetching), invalid-URL handling, order preservation, and action_log
 * writing. App Store and Play Store resolvers fetch live HTTP and are
 * validated in docs/manual-test-2-1-be.md against real URLs.
 *
 * Lessons applied from prior bundles:
 *   1. BASE_URL defaults to http://localhost:80 (proxy convention).
 *   2. Uses `pg` from @workspace/db (already added -D -w in BE-2).
 *   3. Helper test users are unique per-call to avoid (user_id, email)
 *      collisions.
 *   4. SESSION_COOKIE_NAME is "cf_session", payload {userId, email, exp}.
 *      exp is in UNIX SECONDS (per lib/session.ts line 51:
 *      Math.floor(Date.now()/1000) + SESSION_TTL_SECONDS).
 *      Free-hand HMAC matches lib/session.ts; defect log #8 deferred
 *      until a tests workspace package exists.
 *
 * Run:
 *   cp ticket-2-1-be/new-files/tests/integration-2-1-be-resolve-urls.mjs /tmp/
 *   node /tmp/integration-2-1-be-resolve-urls.mjs
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

const SESSION_COOKIE_NAME = "cf_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const TEST_EMAIL_PATTERN_PREFIX = "__t21_resolver_";
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
    actual === expected ||
    JSON.stringify(actual) === JSON.stringify(expected);
  assert(
    ok,
    `${msg} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
  );
}

// ─── Session cookie minting (matches src/lib/session.ts HMAC scheme) ──────

function base64UrlEncode(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function mintSessionCookie(userId, email) {
  // exp is UNIX SECONDS, matching lib/session.ts line 51
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
  const result = await client.query(
    `INSERT INTO users (email, name, created_at, updated_at)
     VALUES ($1, $2, now(), now())
     RETURNING id, email`,
    [email, `Test ${label}`],
  );
  return result.rows[0];
}

async function cleanup() {
  const client = await pg();
  await client.query(
    `DELETE FROM action_logs
     WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [TEST_EMAIL_LIKE],
  );
  await client.query(
    `DELETE FROM users WHERE email LIKE $1`,
    [TEST_EMAIL_LIKE],
  );
}

async function disconnect() {
  if (pgClient) {
    await pgClient.end();
    pgClient = null;
  }
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
  } catch {
    // non-JSON body
  }
  return { status: res.status, body: parsed, raw: text };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

async function testAuth() {
  console.log("\n[1] Auth gating");

  const noCookie = await postJson("/api/prospector/resolve-urls", {
    urls: ["https://probo.in"],
  });
  assertEqual(noCookie.status, 401, "401 without session cookie");

  const badCookie = await postJson(
    "/api/prospector/resolve-urls",
    { urls: ["https://probo.in"] },
    `${SESSION_COOKIE_NAME}=garbage.bad`,
  );
  assertEqual(badCookie.status, 401, "401 with malformed cookie");
}

async function testValidation(user) {
  console.log("\n[2] Body validation");
  const cookie = mintSessionCookie(user.id, user.email);

  const empty = await postJson(
    "/api/prospector/resolve-urls",
    { urls: [] },
    cookie,
  );
  assertEqual(empty.status, 400, "400 for empty urls array");
  assertEqual(empty.body?.error, "invalid_body", "error code = invalid_body");

  const tooMany = await postJson(
    "/api/prospector/resolve-urls",
    {
      urls: Array.from({ length: 51 }, (_, i) => `https://example${i}.com`),
    },
    cookie,
  );
  assertEqual(tooMany.status, 400, "400 for >50 urls");

  const extraField = await postJson(
    "/api/prospector/resolve-urls",
    { urls: ["https://probo.in"], extra: "rejected" },
    cookie,
  );
  assertEqual(
    extraField.status,
    400,
    "400 for unknown top-level field (zod .strict)",
  );

  const wrongShape = await postJson(
    "/api/prospector/resolve-urls",
    { urls: "not-an-array" },
    cookie,
  );
  assertEqual(wrongShape.status, 400, "400 for non-array urls");

  const tooLong = await postJson(
    "/api/prospector/resolve-urls",
    { urls: ["x".repeat(2001)] },
    cookie,
  );
  assertEqual(tooLong.status, 400, "400 for URL > 2000 chars");

  const missingField = await postJson(
    "/api/prospector/resolve-urls",
    {},
    cookie,
  );
  assertEqual(missingField.status, 400, "400 when urls field missing");
}

async function testWebsite(user) {
  console.log("\n[3] Website resolution (URL parsing only, no network)");
  const cookie = mintSessionCookie(user.id, user.email);

  const single = await postJson(
    "/api/prospector/resolve-urls",
    { urls: ["https://probo.in"] },
    cookie,
  );
  assertEqual(single.status, 200, "200 for single website URL");
  assert(Array.isArray(single.body?.resolved), "response has resolved array");
  assertEqual(single.body.resolved.length, 1, "resolved length = 1");
  const r = single.body.resolved[0];
  assertEqual(r.url, "https://probo.in", "url echoes input");
  assertEqual(r.type, "website", "type = website");
  assertEqual(r.domain, "probo.in", "domain = probo.in");
  assertEqual(r.brand, "Probo", "brand = capitalized first segment");
  assertEqual(r.appName, null, "appName null for websites");
  assertEqual(r.country, null, "country null for plain website");
  assertEqual(r.error, null, "no error");

  const www = await postJson(
    "/api/prospector/resolve-urls",
    { urls: ["https://www.probo.in/"] },
    cookie,
  );
  assertEqual(
    www.body.resolved[0].domain,
    "probo.in",
    "www stripped from domain",
  );

  const noScheme = await postJson(
    "/api/prospector/resolve-urls",
    { urls: ["probo.in/some/path"] },
    cookie,
  );
  assertEqual(
    noScheme.body.resolved[0].domain,
    "probo.in",
    "missing scheme auto-prepended with https://",
  );
}

async function testInvalid(user) {
  console.log("\n[4] Invalid URL handling — never breaks the batch");
  const cookie = mintSessionCookie(user.id, user.email);

  const badUrl = await postJson(
    "/api/prospector/resolve-urls",
    { urls: ["http://"] },
    cookie,
  );
  assertEqual(badUrl.status, 200, "200 even for unparseable URL");
  const r = badUrl.body.resolved[0];
  assertEqual(r.type, "unknown", "type = unknown for unparseable");
  assert(typeof r.error === "string" && r.error.length > 0, "error string set");

  const ipUrl = await postJson(
    "/api/prospector/resolve-urls",
    { urls: ["http://192.168.1.1/path"] },
    cookie,
  );
  assertEqual(ipUrl.status, 200, "200 for IP-address URL");
  const ipRes = ipUrl.body.resolved[0];
  assert(
    ipRes.error !== null || ipRes.domain === null,
    "IP-as-host rejected (error set or domain null)",
  );
}

async function testOrderPreservation(user) {
  console.log("\n[5] Order preservation");
  const cookie = mintSessionCookie(user.id, user.email);

  const urls = [
    "https://example1.com",
    "https://example2.com",
    "https://example3.com",
  ];
  const res = await postJson(
    "/api/prospector/resolve-urls",
    { urls },
    cookie,
  );
  assertEqual(res.status, 200, "200 for ordered batch");
  assertEqual(res.body.resolved.length, 3, "all 3 returned");
  for (let i = 0; i < urls.length; i++) {
    assertEqual(
      res.body.resolved[i].url,
      urls[i],
      `position ${i} preserves input URL`,
    );
  }
}

async function testActionLog(user) {
  console.log("\n[6] Action log written");
  const cookie = mintSessionCookie(user.id, user.email);

  const before = Date.now();
  const res = await postJson(
    "/api/prospector/resolve-urls",
    { urls: ["https://probo.in", "https://example.com"] },
    cookie,
  );
  assertEqual(res.status, 200, "batch succeeds");

  // Action log is inserted in fire-and-forget try/catch; brief wait.
  await new Promise((r) => setTimeout(r, 250));

  const client = await pg();
  const logs = await client.query(
    `SELECT action_type, action_status, metadata
     FROM action_logs
     WHERE user_id = $1
       AND action_type = 'prospector.urls_resolved'
       AND executed_at >= to_timestamp($2 / 1000.0)
     ORDER BY executed_at DESC LIMIT 1`,
    [user.id, before],
  );
  assertEqual(logs.rows.length, 1, "one action_log row written");
  if (logs.rows.length === 1) {
    const md = logs.rows[0].metadata;
    assertEqual(md.batch_size, 2, "metadata.batch_size = 2");
    assertEqual(md.success_count, 2, "metadata.success_count = 2");
    assertEqual(md.failure_count, 0, "metadata.failure_count = 0");
    assert(
      md.type_counts && md.type_counts.website === 2,
      "metadata.type_counts.website = 2",
    );
    assertEqual(
      logs.rows[0].action_status,
      "success",
      "action_status = 'success' (no failures)",
    );
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== Ticket 2.1-BE — /api/prospector/resolve-urls ===`);
  console.log(`BASE_URL: ${BASE_URL}`);

  await cleanup();
  let user;
  try {
    user = await createTestUser("main");
    console.log(`Test user: ${user.email} (id=${user.id})`);

    await testAuth();
    await testValidation(user);
    await testWebsite(user);
    await testInvalid(user);
    await testOrderPreservation(user);
    await testActionLog(user);
  } finally {
    await cleanup();
    await disconnect();
  }

  console.log(`\n[SUMMARY] ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\n[FAILURES]");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log(`[PASS] all ${passed} assertions passed`);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(2);
});
