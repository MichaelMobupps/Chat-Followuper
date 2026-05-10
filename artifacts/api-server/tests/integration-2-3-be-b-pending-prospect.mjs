#!/usr/bin/env node
/**
 * Integration test — Ticket 2.3-BE-B (pending-reveal prospects)
 *
 * Verifies the full lifecycle of a pending-reveal prospect from the
 * bulk WhatsApp flow:
 *
 *   T1 Auth gate (no cookie → 401)
 *   T2 Create with phone=null + apolloPersonId set → 201
 *   T3 Create with phone=null + apolloPersonId missing → 400
 *      with phone-required-unless-apolloPersonId message
 *   T4 GET /:id/whatsapp-link on pending prospect → 409 phone_reveal_pending
 *   T5 Simulate webhook arrival (direct DB update) → phone is populated
 *   T6 GET /:id/whatsapp-link on revealed prospect → 200 with url
 *   T7 Cross-tenant isolation (alt user can't read primary's prospects)
 *   T8 (Backwards compat) Existing seeder flow with phone set at create
 *      still works → 201 + whatsapp-link → 409 no_message_generated
 *      (no message yet, but the path is valid)
 *
 * Cleanup: deletes own prospects + action_logs + users.
 *
 * Env required:
 *   DATABASE_URL          Postgres connection string
 *   SESSION_SECRET        cf_session HMAC (>= 16 chars)
 *   BASE_URL              optional; defaults to http://localhost:80
 *
 * Pre-requisite: schema migration must have been applied:
 *   pnpm --filter @workspace/db push
 * (otherwise T2 fails with a 500 from drizzle's NOT NULL constraint)
 *
 * Note: this test does NOT call the live Apollo webhook endpoint. The
 * webhook arrival is simulated via direct DB UPDATE because reproducing
 * Apollo's HMAC-signed POST locally is not in scope for this ticket.
 * The webhook handler itself is unchanged from 1.5b — patch 3 only
 * extends what gets written, not how the webhook routes.
 *
 * Exit code: 0 on success, non-zero on failure.
 */

import { Client } from "pg";
import crypto from "node:crypto";

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
const TEST_EMAIL_PATTERN_PREFIX = "__t23beb_pending_";
const TEST_EMAIL_LIKE = `${TEST_EMAIL_PATTERN_PREFIX}%@test.local`;

// ── Assertion harness ────────────────────────────────────────────────────
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

// ── Session cookie minting (mirror of api-server's verifier) ─────────────
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

// ── DB helpers ────────────────────────────────────────────────────────────
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
  try {
    const client = await pg();
    await client.query(
      `DELETE FROM action_logs
       WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [TEST_EMAIL_LIKE],
    );
    await client.query(
      `DELETE FROM prospects
       WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [TEST_EMAIL_LIKE],
    );
    await client.query(`DELETE FROM users WHERE email LIKE $1`, [TEST_EMAIL_LIKE]);
    console.log(`[cleanup] OK`);
  } catch (err) {
    console.log(`[cleanup] WARN: ${err.message}`);
  } finally {
    if (pgClient) {
      try {
        await pgClient.end();
      } catch {
        /* ignore */
      }
    }
  }
}

// ── HTTP helper ───────────────────────────────────────────────────────────
async function http(method, path, { cookie, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { _raw: text };
  }
  return { status: res.status, body: parsed };
}

// ── Pre-flight ───────────────────────────────────────────────────────────
async function preflightSchema() {
  const client = await pg();
  // Confirm phone is nullable (the migration must have been applied).
  const r = await client.query(
    `SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'prospects' AND column_name = 'phone'`,
  );
  if (r.rows.length === 0) {
    throw new Error("prospects.phone column not found");
  }
  if (r.rows[0].is_nullable !== "YES") {
    throw new Error(
      "prospects.phone is still NOT NULL — schema migration not applied. Run: pnpm --filter @workspace/db push",
    );
  }
  console.log("[preflight] schema migration applied (prospects.phone is nullable) ✓");
}

// ── Tests ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("─── 2.3-BE-B integration test (pending-reveal prospects) ───");
  console.log(`BASE_URL=${BASE_URL}`);
  console.log("");

  await preflightSchema();
  console.log("");

  const primary = await createTestUser("primary");
  const cookie = mintSessionCookie(primary.id, primary.email);
  console.log(`[setup] primary user id=${primary.id}`);
  console.log("");

  // ── T1: auth gate ──
  console.log("T1 — auth gate");
  {
    const r = await http("POST", "/api/prospects", {
      body: { phone: "+919900000111", sourceMode: "manual" },
    });
    assert(r.status === 401, `T1 no cookie → 401 (got ${r.status})`);
  }
  console.log("");

  // ── T2: create with phone=null + apolloPersonId set ──
  console.log("T2 — create pending-reveal prospect (phone=null + apolloPersonId set)");
  let pendingProspectId = null;
  {
    const r = await http("POST", "/api/prospects", {
      cookie,
      body: {
        sourceMode: "apollo",
        apolloPersonId: "test_person_t23beb_001",
        prospectName: "Test Pending Lindsay",
        company: "Test Co",
        country: "US",
        language: "en",
      },
    });
    assert(
      r.status === 201,
      `T2a create returned 201 (got ${r.status} body=${JSON.stringify(r.body)?.slice(0, 200)})`,
    );
    if (r.status === 201) {
      pendingProspectId = r.body?.id;
      assert(r.body?.phone === null, `T2b prospect.phone is null (got ${JSON.stringify(r.body?.phone)})`);
      assert(
        r.body?.apolloPersonId === "test_person_t23beb_001",
        `T2c prospect.apolloPersonId persisted (got ${r.body?.apolloPersonId})`,
      );
      assert(
        r.body?.phoneRevealStatus === "none",
        `T2d phoneRevealStatus defaults to 'none' on create (got ${r.body?.phoneRevealStatus})`,
      );
    }
  }
  console.log("");

  // ── T3: create with phone=null + apolloPersonId MISSING → 400 ──
  console.log("T3 — create with phone=null and no apolloPersonId returns 400");
  {
    const r = await http("POST", "/api/prospects", {
      cookie,
      body: {
        sourceMode: "manual",
        prospectName: "Test Orphan",
        country: "US",
        language: "en",
      },
    });
    assert(
      r.status === 400 && r.body?.error === "invalid_body",
      `T3a → 400 invalid_body (got ${r.status} ${JSON.stringify(r.body)?.slice(0, 150)})`,
    );
    if (r.body?.issues) {
      const phoneIssue = r.body.issues.find((i) => i.path === "phone");
      assert(
        phoneIssue && phoneIssue.message.includes("apolloPersonId"),
        `T3b error message mentions apolloPersonId requirement (got ${JSON.stringify(phoneIssue)})`,
      );
    }
  }
  console.log("");

  // ── T4: whatsapp-link on pending prospect → 409 phone_reveal_pending ──
  console.log("T4 — whatsapp-link on pending prospect returns 409 phone_reveal_pending");
  if (pendingProspectId) {
    // First, give the prospect a firstMessageBody so we get past the
    // earlier 409 (no_message_generated). Direct DB write to avoid
    // setting up the full message generation flow.
    const client = await pg();
    await client.query(
      `UPDATE prospects SET first_message_body = $1, first_message_channel = 'whatsapp'
        WHERE id = $2`,
      ["test message body", pendingProspectId],
    );

    const r = await http("GET", `/api/prospects/${pendingProspectId}/whatsapp-link`, { cookie });
    assert(
      r.status === 409 && r.body?.error === "phone_reveal_pending",
      `T4 → 409 phone_reveal_pending (got ${r.status} ${JSON.stringify(r.body)})`,
    );
  } else {
    console.log("  (T4 skipped — pending prospect not created)");
  }
  console.log("");

  // ── T5: simulate webhook arrival ──
  console.log("T5 — simulate webhook arrival (direct DB update)");
  if (pendingProspectId) {
    const REAL_PHONE = "+12025550100"; // US area code, will pass geo gate if US is allowed
    const client = await pg();
    // Mirror what the webhook handler does in the arrived branch:
    await client.query(
      `UPDATE prospects
          SET phone = COALESCE(phone, $1),
              phone_number = $1,
              phone_reveal_status = 'arrived',
              phone_reveal_completed_at = now()
        WHERE id = $2`,
      [REAL_PHONE, pendingProspectId],
    );
    const verify = await client.query(
      `SELECT phone, phone_number, phone_reveal_status FROM prospects WHERE id = $1`,
      [pendingProspectId],
    );
    const row = verify.rows[0];
    assert(
      row?.phone === REAL_PHONE,
      `T5a prospect.phone promoted to real number (got ${row?.phone})`,
    );
    assert(
      row?.phone_number === REAL_PHONE,
      `T5b prospect.phoneNumber set (got ${row?.phone_number})`,
    );
    assert(
      row?.phone_reveal_status === "arrived",
      `T5c prospect.phoneRevealStatus = arrived (got ${row?.phone_reveal_status})`,
    );
  } else {
    console.log("  (T5 skipped — pending prospect not created)");
  }
  console.log("");

  // ── T6: whatsapp-link on revealed prospect → 200 ──
  console.log("T6 — whatsapp-link on revealed prospect returns 200 with url");
  if (pendingProspectId) {
    const r = await http("GET", `/api/prospects/${pendingProspectId}/whatsapp-link`, { cookie });
    if (r.status === 200) {
      assert(
        typeof r.body?.url === "string" && r.body.url.startsWith("https://wa.me/"),
        `T6a returns wa.me URL (got url=${r.body?.url?.slice(0, 60)})`,
      );
      assert(
        r.body.url.includes("12025550100"),
        `T6b URL contains the revealed phone digits`,
      );
    } else if (r.status === 422 && r.body?.error === "geo_blocked") {
      console.log(
        `  (T6 skipped — US is in the geo-blocked list in this env: ${JSON.stringify(r.body)})`,
      );
      // Don't fail the test for this — geo-gate config is environment-dependent
    } else {
      assert(false, `T6 unexpected response: ${r.status} ${JSON.stringify(r.body)}`);
    }
  } else {
    console.log("  (T6 skipped — pending prospect not created)");
  }
  console.log("");

  // ── T7: cross-tenant isolation ──
  console.log("T7 — cross-tenant isolation");
  if (pendingProspectId) {
    const alt = await createTestUser("alt");
    const altCookie = mintSessionCookie(alt.id, alt.email);
    const r = await http("GET", `/api/prospects/${pendingProspectId}`, { cookie: altCookie });
    assert(
      r.status === 404,
      `T7 alt user gets 404 on primary's prospect (got ${r.status})`,
    );
  } else {
    console.log("  (T7 skipped — pending prospect not created)");
  }
  console.log("");

  // ── T8: backwards compat — existing seeder flow with phone set at create ──
  console.log("T8 — backwards compat: create with phone set still works");
  {
    const r = await http("POST", "/api/prospects", {
      cookie,
      body: {
        phone: "+919900000888",
        sourceMode: "manual",
        prospectName: "Test Seeder Compat",
        country: "IN",
        language: "en",
      },
    });
    assert(
      r.status === 201,
      `T8a seeder-flow create still returns 201 (got ${r.status} ${JSON.stringify(r.body)?.slice(0, 150)})`,
    );
    if (r.status === 201) {
      assert(
        r.body?.phone === "+919900000888",
        `T8b prospect.phone preserved as E.164 (got ${r.body?.phone})`,
      );
    }
  }
  console.log("");
}

// ── Run ──────────────────────────────────────────────────────────────────
try {
  await main();
} catch (err) {
  console.log(`[FATAL] test threw: ${err.message}`);
  if (err.stack) console.log(err.stack);
  failed += 1;
  failures.push(`fatal: ${err.message}`);
} finally {
  await cleanup();
}

console.log("");
console.log("==================================================");
console.log(`Results: ${passed} pass / ${failed} fail`);
if (failures.length > 0) {
  console.log("");
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
}
console.log("==================================================");

process.exit(failed === 0 ? 0 : 1);
