/**
 * Integration test for Ticket 2.2-BE-A: POST /api/prospector/resolve-company.
 *
 * Tests against a deployed api-server (no in-process server). Hits the real
 * route, real DB, real auth — and on the happy path, the real Anthropic API.
 *
 * COST: ~$0.005-0.01 in Sonnet credits per full run.
 * Set SKIP_LLM_TESTS=1 to skip the LLM-cost tests (3 + 4) and only run
 * auth/validation/cross-tenant.
 *
 * Coverage:
 *   - Auth gating (401 without cookie, 401 with malformed cookie)
 *   - Body validation (zod min/max/strict, refine on missing brand+appName+domain)
 *   - Real Sonnet disambiguation (Probo → fintech opinion-trading IN)
 *   - Action log row written with correct metadata shape
 *   - Cross-tenant: User A's request does not log under User B
 *
 * Out of scope (covered in docs/manual-test-2-2-be-a.md):
 *   - Astrum→Astrum Entertainment+VK parent disambiguation
 *   - Cash App → Block Inc.
 *   - Emma fintech vs Emma mattress
 *   - Non-Latin name → Latin alternatives
 *
 * Lessons applied from prior bundles:
 *   - BASE_URL localhost:80 default (defect #1)
 *   - pg from @workspace/db (defect #2)
 *   - Free-hand HMAC matches lib/session.ts shape (defect #8 deferred)
 *   - executed_at column (not created_at) on action_logs
 *
 * Run:
 *   cp ticket-2-2-be-a/new-files/tests/integration-2-2-be-a-resolve-company.mjs /tmp/
 *   node /tmp/integration-2-2-be-a-resolve-company.mjs
 *
 * Required env: DATABASE_URL, SESSION_SECRET. Optional: BASE_URL, SKIP_LLM_TESTS.
 * Required for LLM tests: ANTHROPIC_API_KEY must be set on the api-server itself.
 */

import crypto from "node:crypto";
import { Client } from "pg";

// ─── Config ────────────────────────────────────────────────────────────────

const BASE_URL = process.env.BASE_URL ?? "http://localhost:80";
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET;
const SKIP_LLM_TESTS = process.env.SKIP_LLM_TESTS === "1";

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
const TEST_EMAIL_PATTERN_PREFIX = "__t22a_resolver_";
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

// ─── Session cookie minting ───────────────────────────────────────────────

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
     FROM action_logs
     WHERE user_id = $1 AND action_type = $2
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
  } catch {
    // non-JSON body
  }
  return { status: res.status, body: parsed, raw: text };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

async function testAuth() {
  console.log("\n[1] Auth gating");

  const noCookie = await postJson("/api/prospector/resolve-company", {
    brand: "Probo",
  });
  assertEqual(noCookie.status, 401, "401 without session cookie");

  const badCookie = await postJson(
    "/api/prospector/resolve-company",
    { brand: "Probo" },
    `${SESSION_COOKIE_NAME}=garbage.bad`,
  );
  assertEqual(badCookie.status, 401, "401 with malformed cookie");
}

async function testValidation(user) {
  console.log("\n[2] Body validation");
  const cookie = mintSessionCookie(user.id, user.email);

  const empty = await postJson(
    "/api/prospector/resolve-company",
    {},
    cookie,
  );
  assertEqual(
    empty.status,
    400,
    "400 for empty body (zod refine — needs brand/appName/domain)",
  );
  assertEqual(empty.body?.error, "invalid_body", "error code = invalid_body");

  const allNull = await postJson(
    "/api/prospector/resolve-company",
    { brand: null, appName: null, domain: null },
    cookie,
  );
  assertEqual(
    allNull.status,
    400,
    "400 when brand+appName+domain all null (refine)",
  );

  const allEmpty = await postJson(
    "/api/prospector/resolve-company",
    { brand: "", appName: "", domain: "" },
    cookie,
  );
  assertEqual(
    allEmpty.status,
    400,
    "400 when brand+appName+domain all empty (refine)",
  );

  const unknownField = await postJson(
    "/api/prospector/resolve-company",
    { brand: "Probo", extraNope: "rejected" },
    cookie,
  );
  assertEqual(
    unknownField.status,
    400,
    "400 for unknown top-level field (zod .strict)",
  );

  const oversized = await postJson(
    "/api/prospector/resolve-company",
    { description: "x".repeat(4001), brand: "Probo" },
    cookie,
  );
  assertEqual(
    oversized.status,
    400,
    "400 for description > 4000 chars",
  );

  const wrongType = await postJson(
    "/api/prospector/resolve-company",
    { brand: 123 },
    cookie,
  );
  assertEqual(
    wrongType.status,
    400,
    "400 for brand as number (zod string)",
  );
}

async function testHappyPathLLM(user) {
  if (SKIP_LLM_TESTS) {
    console.log("\n[3] Happy-path LLM call — SKIPPED (SKIP_LLM_TESTS=1)");
    return;
  }

  console.log("\n[3] Happy-path Sonnet disambiguation (real LLM call)");
  const cookie = mintSessionCookie(user.id, user.email);

  const before = Date.now();
  const r = await postJson(
    "/api/prospector/resolve-company",
    {
      brand: "Probo",
      appName: "Probo: Trade Anything With Opinions",
      domain: "probo.in",
      country: "IN",
      sourceType: "play_store",
    },
    cookie,
  );
  const elapsed = Date.now() - before;

  assertEqual(r.status, 200, `200 OK (got ${r.status}, body: ${r.raw?.slice(0, 200)})`);
  if (r.status !== 200) return;

  const resolved = r.body?.resolved;
  assert(resolved && typeof resolved === "object", "response.resolved is object");

  // Field shape (don't assert exact LLM content — just structural validity)
  assert(typeof resolved?.companyName === "string", "companyName is string");
  assert(resolved?.companyName?.length > 0, "companyName non-empty");
  assert(typeof resolved?.parentCompany === "string", "parentCompany is string");
  assert(typeof resolved?.corporateDomain === "string", "corporateDomain is string");
  assert(Array.isArray(resolved?.alternativeDomains), "alternativeDomains is array");
  assert(Array.isArray(resolved?.searchQueries), "searchQueries is array");
  assert(resolved?.searchQueries?.length >= 1, "searchQueries has ≥1 entry");
  assert(typeof resolved?.isMultinational === "boolean", "isMultinational is boolean");
  assert(typeof resolved?.focusMarket === "string", "focusMarket is string");
  assert(typeof resolved?.primaryMarket === "string", "primaryMarket is string");
  assert(typeof resolved?.reasoning === "string", "reasoning is string");

  // Soft content checks (Probo is a real Indian opinion-trading platform)
  const nameLower = (resolved?.companyName || "").toLowerCase();
  assert(
    nameLower.includes("probo"),
    `companyName mentions probo (got "${resolved?.companyName}")`,
  );

  const queries = (resolved?.searchQueries || []).map((q) => q.toLowerCase());
  assert(
    queries.some((q) => q.includes("probo")),
    `searchQueries mentions probo (got ${JSON.stringify(resolved?.searchQueries)})`,
  );

  assert(
    typeof r.body?.latencyMs === "number" && r.body.latencyMs > 0,
    `latencyMs is positive number (got ${r.body?.latencyMs})`,
  );

  console.log(`    LLM call latency: ${r.body?.latencyMs}ms; total request: ${elapsed}ms`);
}

async function testActionLogShape(user) {
  if (SKIP_LLM_TESTS) {
    console.log("\n[4] Action log shape — SKIPPED (depends on test 3)");
    return;
  }

  console.log("\n[4] Action log shape after happy path");

  // Brief wait so the action_log insert has flushed.
  await new Promise((r) => setTimeout(r, 300));

  const row = await actionLogLatest(user.id, "prospector.company_resolved");
  assert(row !== null, "action_log row exists for prospector.company_resolved");
  if (!row) return;

  assertEqual(row.action_status, "success", "action_status = success");
  assert(
    typeof row.duration_ms === "number" && row.duration_ms > 0,
    `duration_ms positive (got ${row.duration_ms})`,
  );
  assert(row.error_detail === null, "error_detail is null on success");

  const md = row.metadata;
  assert(md && typeof md === "object", "metadata is object");
  assertEqual(md?.brand, "Probo", "metadata.brand = Probo");
  assert(typeof md?.resolved_company === "string", "metadata.resolved_company is string");
  assert(typeof md?.llm_latency_ms === "number", "metadata.llm_latency_ms is number");
  assert(
    typeof md?.search_query_count === "number" && md.search_query_count >= 1,
    "metadata.search_query_count >= 1",
  );
  assertEqual(md?.has_description, false, "metadata.has_description = false (none provided)");
}

async function testCrossTenant(userA, userB) {
  console.log("\n[5] Cross-tenant: User A request doesn't log under User B");

  const beforeB = await actionLogCount(userB.id, "prospector.company_resolved");
  // Don't actually call LLM here — use a guaranteed-400 to keep cost down.
  // The 400 path also exercises the fact that no log is written for User B
  // even when User A's request fails validation.
  const cookieA = mintSessionCookie(userA.id, userA.email);
  const r = await postJson(
    "/api/prospector/resolve-company",
    { brand: "" }, // refine fails
    cookieA,
  );
  assertEqual(r.status, 400, "400 (refine validation failure on User A request)");

  await new Promise((res) => setTimeout(res, 200));
  const afterB = await actionLogCount(userB.id, "prospector.company_resolved");
  assertEqual(
    afterB,
    beforeB,
    "User B's action_logs count unchanged after User A request",
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== Ticket 2.2-BE-A — /api/prospector/resolve-company ===`);
  console.log(`BASE_URL: ${BASE_URL}`);
  if (SKIP_LLM_TESTS) {
    console.log(`SKIP_LLM_TESTS=1 — tests 3 and 4 will be skipped`);
  }

  await cleanup();
  let userA, userB;
  try {
    userA = await createTestUser("a");
    userB = await createTestUser("b");
    console.log(`Test users: ${userA.email}, ${userB.email}`);

    await testAuth();
    await testValidation(userA);
    await testHappyPathLLM(userA);
    await testActionLogShape(userA);
    await testCrossTenant(userA, userB);
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
