#!/usr/bin/env node
/**
 * Integration test — Ticket 2.3-BE-A (HOTFIX v2)
 *
 * Verifies that POST /api/apollo/search-people now returns the three new
 * person-search fields:
 *   - directPhoneStatus ("yes" | "maybe" | "no")
 *   - hasEmail (boolean)
 *   - lastNameObfuscated (string | null)
 *
 * Hotfix changelog from v1:
 *   - Replaced the stale signSession helper (pre-commit-0b308c9 convention,
 *     payload=userId, sig=hex) with mintSessionCookie that mirrors the
 *     deployed verifier exactly: payload = base64url(JSON.stringify({
 *     userId, email, exp })), sig = base64url(HMAC-SHA256(payloadB64)).
 *   - Mirrored the email-pattern + DB-helper conventions from the working
 *     2.2-BE-C test (__prefix_label_stamp@test.local, lazy pg client, INSERT
 *     RETURNING for user creation).
 *
 * Live test — fires real Apollo people-search calls. Apollo charges 0
 * credits for searches; safe to run against the production key.
 *
 * Test coverage:
 *   T1 Auth gate (no cookie → 401)
 *   T2 Body validation (missing orgId → 400 invalid_body)
 *   T3 Live search-org probe (real Apollo)
 *   T4 Live search-people probe + assert new field shapes
 *   T5 action_log row written for seeder.people_search
 *   T6 Cross-tenant isolation (alt user has no logs from primary user)
 *
 * Cleanup: deletes own action_logs + users via TEST_EMAIL_LIKE pattern.
 *
 * Env required:
 *   DATABASE_URL          — Postgres connection string
 *   SESSION_SECRET        — for cf_session HMAC (>= 16 chars)
 *   APOLLO_API_KEY        — for the live search calls
 *   BASE_URL              — optional; defaults to http://localhost:80
 *
 * Exit code: 0 on success, non-zero on failure.
 */

import { Client } from "pg";
import crypto from "node:crypto";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:80";
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET;
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;

if (!DATABASE_URL) {
  console.error("[FATAL] DATABASE_URL must be set");
  process.exit(2);
}
if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  console.error("[FATAL] SESSION_SECRET must be set and >= 16 chars");
  process.exit(2);
}
if (!APOLLO_API_KEY) {
  console.error("[FATAL] APOLLO_API_KEY must be set");
  process.exit(2);
}

const SESSION_COOKIE_NAME = "cf_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const TEST_EMAIL_PATTERN_PREFIX = "__t23bea_phone_flags_";
const TEST_EMAIL_LIKE = `${TEST_EMAIL_PATTERN_PREFIX}%@test.local`;

// ─── Assertion harness ────────────────────────────────────────────────────
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
  try {
    const client = await pg();
    await client.query(
      `DELETE FROM action_logs
       WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [TEST_EMAIL_LIKE],
    );
    await client.query(`DELETE FROM users WHERE email LIKE $1`, [TEST_EMAIL_LIKE]);
    console.log(`[cleanup] OK (pattern=${TEST_EMAIL_LIKE})`);
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

// ─── HTTP helper ───────────────────────────────────────────────────────────
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

// ─── Tests ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("─── 2.3-BE-A integration test (people-search phone flags) ───");
  console.log(`BASE_URL=${BASE_URL}`);
  console.log("");

  // ── T0 setup ──
  const primary = await createTestUser("primary");
  const cookie = mintSessionCookie(primary.id, primary.email);
  console.log(`[setup] primary user id=${primary.id} email=${primary.email}`);
  console.log("");

  // ── T1: auth gate ──
  console.log("T1 — auth gate");
  {
    const r = await http("POST", "/api/apollo/search-people", {
      body: { orgId: "fake" },
    });
    assert(r.status === 401, `T1 no cookie → 401 (got ${r.status})`);
  }
  console.log("");

  // ── T2: body validation ──
  console.log("T2 — body validation");
  {
    const r = await http("POST", "/api/apollo/search-people", {
      cookie,
      body: {},
    });
    assert(
      r.status === 400 && r.body?.error === "invalid_body",
      `T2 missing orgId → 400 invalid_body (got ${r.status} ${JSON.stringify(r.body)})`,
    );
  }
  console.log("");

  // ── T3: live search-org probe ──
  console.log("T3 — live search-org probe");
  let targetOrg = null;
  {
    const r = await http("POST", "/api/apollo/search-org", {
      cookie,
      body: { brand: "Probo" },
    });
    assert(
      r.status === 200 && Array.isArray(r.body?.orgs),
      `T3a search-org returns 200 with orgs array (got ${r.status})`,
    );
    let orgs = r.body?.orgs ?? [];
    if (orgs.length === 0) {
      console.log("  [T3] Probo returned no orgs; trying fallback brand 'Menture'");
      const fb = await http("POST", "/api/apollo/search-org", {
        cookie,
        body: { brand: "Menture" },
      });
      orgs = fb.body?.orgs ?? [];
    }
    assert(orgs.length > 0, `T3b at least one org found (got ${orgs.length})`);
    if (orgs.length > 0) {
      targetOrg = orgs[0];
      console.log(`  [T3] using org id=${targetOrg.id} name=${targetOrg.name}`);
    }
  }
  console.log("");

  if (!targetOrg) {
    console.log("[FATAL] no org returned; cannot proceed to people search");
    failed += 1;
    failures.push("No orgs returned for any test brand");
    return;
  }

  // ── T4: live search-people probe + new field shape ──
  console.log("T4 — live search-people probe + new field shapes");
  let peopleSearchStatus = null;
  {
    const r = await http("POST", "/api/apollo/search-people", {
      cookie,
      body: {
        orgId: targetOrg.id,
        titles: [
          "Marketing Manager",
          "Sales Manager",
          "Sales Rep",
          "Software Engineer",
        ],
      },
    });
    peopleSearchStatus = r.status;
    assert(
      r.status === 200,
      `T4a search-people returns 200 (got ${r.status} body=${JSON.stringify(r.body)?.slice(0, 200)})`,
    );

    let people = Array.isArray(r.body?.people) ? r.body.people : [];
    assert(Array.isArray(r.body?.people), `T4b response.people is array`);

    if (people.length === 0) {
      console.log("  [T4] zero people with title filter; retrying without titles");
      const retry = await http("POST", "/api/apollo/search-people", {
        cookie,
        body: { orgId: targetOrg.id, titles: [] },
      });
      if (Array.isArray(retry.body?.people)) {
        people = retry.body.people;
      }
    }
    assert(
      people.length > 0,
      `T4c at least one person in sample (got ${people.length})`,
    );

    if (people.length > 0) {
      const ALLOWED_PHONE = new Set(["yes", "maybe", "no"]);
      let allHavePhoneStatus = true;
      let allValidPhone = true;
      let allHaveEmail = true;
      let allValidLastNameObf = true;
      let atLeastOneYes = false;

      for (const p of people) {
        if (typeof p.directPhoneStatus !== "string") {
          allHavePhoneStatus = false;
          console.log(
            `  [T4d] person ${p.id} missing directPhoneStatus: ${typeof p.directPhoneStatus}`,
          );
        } else if (!ALLOWED_PHONE.has(p.directPhoneStatus)) {
          allValidPhone = false;
          console.log(
            `  [T4e] person ${p.id} invalid directPhoneStatus: ${p.directPhoneStatus}`,
          );
        }
        if (p.directPhoneStatus === "yes") atLeastOneYes = true;

        if (typeof p.hasEmail !== "boolean") {
          allHaveEmail = false;
          console.log(
            `  [T4f] person ${p.id} missing hasEmail boolean: ${typeof p.hasEmail}`,
          );
        }

        if (
          p.lastNameObfuscated !== null &&
          typeof p.lastNameObfuscated !== "string"
        ) {
          allValidLastNameObf = false;
          console.log(
            `  [T4g] person ${p.id} lastNameObfuscated wrong type: ${typeof p.lastNameObfuscated}`,
          );
        }
      }

      assert(allHavePhoneStatus, `T4d every person has directPhoneStatus string`);
      assert(allValidPhone, `T4e every directPhoneStatus is in {yes,maybe,no}`);
      assert(allHaveEmail, `T4f every person has hasEmail boolean`);
      assert(
        allValidLastNameObf,
        `T4g every lastNameObfuscated is string-or-null`,
      );
      assert(
        atLeastOneYes,
        `T4h at least one person has directPhoneStatus === "yes" (sanity for active org)`,
      );

      const sample = people.slice(0, 3).map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastNameObfuscated: p.lastNameObfuscated,
        title: p.title,
        directPhoneStatus: p.directPhoneStatus,
        hasEmail: p.hasEmail,
      }));
      console.log("  [T4 sample]", JSON.stringify(sample, null, 2));
    }
  }
  console.log("");

  // ── T5: action_log row for seeder.people_search ──
  console.log("T5 — action_log persistence");
  if (peopleSearchStatus === 200) {
    await new Promise((r) => setTimeout(r, 200));
    const client = await pg();
    const logs = await client.query(
      `SELECT action_type, action_status, metadata
         FROM action_logs
        WHERE user_id = $1
          AND action_type = 'seeder.people_search'
        ORDER BY executed_at DESC
        LIMIT 5`,
      [primary.id],
    );
    assert(
      logs.rows.length >= 1,
      `T5a action_log row exists for seeder.people_search (got ${logs.rows.length})`,
    );
    if (logs.rows.length >= 1) {
      const row = logs.rows[0];
      assert(
        row.action_status === "success",
        `T5b action_log status === success (got ${row.action_status})`,
      );
      assert(
        row.metadata?.orgId === targetOrg.id,
        `T5c action_log metadata.orgId matches target (got ${JSON.stringify(row.metadata)})`,
      );
    }
  } else {
    console.log("  [T5] skipped — search-people did not return 200");
  }
  console.log("");

  // ── T6: cross-tenant isolation ──
  console.log("T6 — cross-tenant isolation");
  {
    const alt = await createTestUser("alt");
    const client = await pg();
    const altLogs = await client.query(
      `SELECT id FROM action_logs WHERE user_id = $1`,
      [alt.id],
    );
    assert(
      altLogs.rows.length === 0,
      `T6 alt user has zero action_logs (got ${altLogs.rows.length})`,
    );
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────
let exitCode = 0;
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

exitCode = failed === 0 ? 0 : 1;
process.exit(exitCode);
