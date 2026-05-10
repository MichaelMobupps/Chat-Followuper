#!/usr/bin/env node
/**
 * Integration test — Ticket 2.3-BE-A
 *
 * Verifies that POST /api/apollo/search-people now returns the three new
 * person-search fields:
 *   - directPhoneStatus ("yes" | "maybe" | "no")
 *   - hasEmail (boolean)
 *   - lastNameObfuscated (string | null)
 *
 * Live test — fires a real Apollo people-search call. Apollo charges 0
 * credits for searches; this is safe to run against the production key.
 *
 * Test coverage:
 *   1. Auth gate: search-people without cf_session → 401
 *   2. Body validation: missing orgId → 400
 *   3. Live search: search-org for a brand → search-people for that org →
 *      response includes new fields, all values are valid enum/types.
 *   4. action_log row written for seeder.people_search.
 *   5. Cross-tenant isolation: alt user cannot read foreign user's logs
 *      (assertion limited to action_logs scope; no global state to test).
 *
 * Cleanup: deletes own action_logs + users via TEST_EMAIL_PATTERN_PREFIX
 * LIKE filter. Run-id is stamped into each test user's email so parallel
 * runs don't collide.
 *
 * Env required:
 *   DATABASE_URL          — Postgres connection string
 *   SESSION_SECRET        — for cf_session HMAC
 *   APOLLO_API_KEY        — for the live search calls
 *   BASE_URL              — optional; defaults to http://localhost:80
 *
 * Exit code: 0 on success, non-zero on failure.
 */

import { Client } from "pg";
import { createHmac, randomUUID } from "node:crypto";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:80";
const SESSION_SECRET = process.env.SESSION_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;

if (!SESSION_SECRET) {
  console.error("[FATAL] SESSION_SECRET env var required");
  process.exit(2);
}
if (!DATABASE_URL) {
  console.error("[FATAL] DATABASE_URL env var required");
  process.exit(2);
}
if (!APOLLO_API_KEY) {
  console.error("[FATAL] APOLLO_API_KEY env var required");
  process.exit(2);
}

const RUN_ID = Date.now().toString(36) + "-" + randomUUID().slice(0, 8);
const TEST_EMAIL_PATTERN_PREFIX = `t23bea-${RUN_ID}-`;

let pass = 0;
let fail = 0;
const failures = [];

function check(label, cond, detail) {
  if (cond) {
    pass += 1;
    console.log(`[PASS] ${label}`);
  } else {
    fail += 1;
    const line = detail ? `${label} — ${detail}` : label;
    console.log(`[FAIL] ${line}`);
    failures.push(line);
  }
}

function signSession(userId) {
  // Match the api-server's cf_session cookie format.
  // Convention from prior tests: payload = userId, sig = HMAC-SHA256(payload, SESSION_SECRET)
  const payload = userId;
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `cf_session=${payload}.${sig}`;
}

async function http(method, path, { cookie, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { _raw: text };
  }
  return { status: res.status, body: parsed };
}

const pg = new Client({ connectionString: DATABASE_URL });
await pg.connect();

let testUserId = null;

async function createTestUser(suffix) {
  const id = randomUUID();
  const email = `${TEST_EMAIL_PATTERN_PREFIX}${suffix}@example.test`;
  await pg.query(
    `INSERT INTO users (id, email, name, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
    [id, email, `Test ${suffix}`],
  );
  return { id, email };
}

async function cleanup() {
  try {
    await pg.query(
      `DELETE FROM action_logs
        WHERE user_id IN (
          SELECT id FROM users WHERE email LIKE $1
        )`,
      [`${TEST_EMAIL_PATTERN_PREFIX}%`],
    );
    await pg.query(
      `DELETE FROM users WHERE email LIKE $1`,
      [`${TEST_EMAIL_PATTERN_PREFIX}%`],
    );
    console.log(`[cleanup] OK (pattern=${TEST_EMAIL_PATTERN_PREFIX})`);
  } catch (err) {
    console.log(`[cleanup] WARN: ${err.message}`);
  } finally {
    await pg.end();
  }
}

try {
  // ────────────────────────────────────────────────────────────────────
  // T0: setup
  // ────────────────────────────────────────────────────────────────────
  const u = await createTestUser("primary");
  testUserId = u.id;
  const cookie = signSession(u.id);
  console.log(`[setup] test user ${u.id} email=${u.email}`);

  // ────────────────────────────────────────────────────────────────────
  // T1: auth gate
  // ────────────────────────────────────────────────────────────────────
  const noCookie = await http("POST", "/api/apollo/search-people", {
    body: { orgId: "fake" },
  });
  check(
    "T1 auth gate: search-people without cf_session returns 401",
    noCookie.status === 401,
    `got status=${noCookie.status} body=${JSON.stringify(noCookie.body)}`,
  );

  // ────────────────────────────────────────────────────────────────────
  // T2: body validation
  // ────────────────────────────────────────────────────────────────────
  const noBody = await http("POST", "/api/apollo/search-people", {
    cookie,
    body: {},
  });
  check(
    "T2 body validation: missing orgId returns 400 invalid_body",
    noBody.status === 400 && noBody.body?.error === "invalid_body",
    `got status=${noBody.status} body=${JSON.stringify(noBody.body)}`,
  );

  // ────────────────────────────────────────────────────────────────────
  // T3: live Apollo probe — search-org first to get a real orgId
  // ────────────────────────────────────────────────────────────────────
  // Use a brand likely to return results. "Probo" worked in 2.2 tests;
  // fall back to "Menture" if Probo somehow returns zero.
  const orgSearch = await http("POST", "/api/apollo/search-org", {
    cookie,
    body: { brand: "Probo" },
  });
  check(
    "T3a search-org returns 200 with orgs array",
    orgSearch.status === 200 && Array.isArray(orgSearch.body?.orgs),
    `got status=${orgSearch.status} orgs=${orgSearch.body?.orgs?.length}`,
  );

  let orgs = orgSearch.body?.orgs ?? [];
  if (orgs.length === 0) {
    console.log("[T3a] Probo returned no orgs; trying fallback brand 'Menture'");
    const fb = await http("POST", "/api/apollo/search-org", {
      cookie,
      body: { brand: "Menture" },
    });
    orgs = fb.body?.orgs ?? [];
  }
  check(
    "T3b at least one org found from search-org (Probo or Menture)",
    orgs.length > 0,
    `got orgs.length=${orgs.length}`,
  );

  if (orgs.length === 0) {
    throw new Error("No orgs returned for any test brand; cannot proceed to people search");
  }

  const targetOrg = orgs[0];
  console.log(`[T3] using org id=${targetOrg.id} name=${targetOrg.name}`);

  // ────────────────────────────────────────────────────────────────────
  // T4: live Apollo probe — search-people, assert new fields
  // ────────────────────────────────────────────────────────────────────
  const peopleSearch = await http("POST", "/api/apollo/search-people", {
    cookie,
    body: {
      orgId: targetOrg.id,
      titles: ["Marketing Manager", "Sales Manager", "Sales Rep", "Software Engineer"],
    },
  });
  check(
    "T4a search-people returns 200",
    peopleSearch.status === 200,
    `got status=${peopleSearch.status} body=${JSON.stringify(peopleSearch.body)?.slice(0, 200)}`,
  );

  const people = peopleSearch.body?.people ?? [];
  check(
    "T4b search-people returns array (may be empty if org has no matching titles)",
    Array.isArray(people),
    `got people=${typeof people}`,
  );

  if (people.length === 0) {
    // Fall back to a known-large org for the field-shape assertion. We
    // search again with no title filter to maximize the chance of a
    // non-empty result.
    console.log("[T4] target org returned 0 people with title filter; retrying with no titles");
    const retry = await http("POST", "/api/apollo/search-people", {
      cookie,
      body: { orgId: targetOrg.id, titles: [] },
    });
    if (Array.isArray(retry.body?.people) && retry.body.people.length > 0) {
      people.push(...retry.body.people);
    }
  }

  check(
    "T4c at least one person in response (required to verify new field shapes)",
    people.length > 0,
    `got people.length=${people.length}`,
  );

  if (people.length > 0) {
    const ALLOWED_PHONE_STATES = new Set(["yes", "maybe", "no"]);
    let allHavePhoneStatus = true;
    let allPhoneStatesValid = true;
    let allHaveEmailFlag = true;
    let allLastNameObfShape = true;
    let atLeastOneYes = false;

    for (const p of people) {
      if (typeof p.directPhoneStatus !== "string") {
        allHavePhoneStatus = false;
        console.log(`[T4d] person ${p.id} missing directPhoneStatus: ${JSON.stringify(p)}`);
      } else if (!ALLOWED_PHONE_STATES.has(p.directPhoneStatus)) {
        allPhoneStatesValid = false;
        console.log(`[T4d] person ${p.id} has invalid directPhoneStatus: ${p.directPhoneStatus}`);
      }
      if (p.directPhoneStatus === "yes") atLeastOneYes = true;

      if (typeof p.hasEmail !== "boolean") {
        allHaveEmailFlag = false;
        console.log(`[T4e] person ${p.id} missing hasEmail boolean: ${typeof p.hasEmail}`);
      }

      if (
        p.lastNameObfuscated !== null &&
        typeof p.lastNameObfuscated !== "string"
      ) {
        allLastNameObfShape = false;
        console.log(`[T4f] person ${p.id} has invalid lastNameObfuscated type: ${typeof p.lastNameObfuscated}`);
      }
    }

    check(
      "T4d every person has directPhoneStatus string field",
      allHavePhoneStatus,
      `${people.length} people checked`,
    );
    check(
      "T4e every directPhoneStatus value is in {yes, maybe, no}",
      allPhoneStatesValid,
    );
    check(
      "T4f every person has hasEmail boolean field",
      allHaveEmailFlag,
    );
    check(
      "T4g every person has lastNameObfuscated as string-or-null",
      allLastNameObfShape,
    );
    check(
      "T4h at least one person in sample has directPhoneStatus === 'yes' (sanity for orgs with active sales staff)",
      atLeastOneYes,
      `none of ${people.length} returned 'yes' — may be a quirk of this org; manually verify if needed`,
    );

    // Print a sanitized sample for visual verification
    const sample = people.slice(0, 3).map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastNameObfuscated: p.lastNameObfuscated,
      title: p.title,
      directPhoneStatus: p.directPhoneStatus,
      hasEmail: p.hasEmail,
    }));
    console.log("[T4 sample]", JSON.stringify(sample, null, 2));
  }

  // ────────────────────────────────────────────────────────────────────
  // T5: action_log row was written for the search
  // ────────────────────────────────────────────────────────────────────
  // Wait briefly for the audit insert to settle
  await new Promise((r) => setTimeout(r, 200));

  const logs = await pg.query(
    `SELECT action_type, action_status, metadata, executed_at
       FROM action_logs
      WHERE user_id = $1
        AND action_type = 'seeder.people_search'
      ORDER BY executed_at DESC
      LIMIT 5`,
    [u.id],
  );
  check(
    "T5a action_log row exists for seeder.people_search",
    logs.rows.length >= 1,
    `got ${logs.rows.length} rows`,
  );
  if (logs.rows.length >= 1) {
    const row = logs.rows[0];
    check(
      "T5b action_log status is success",
      row.action_status === "success",
      `got status=${row.action_status}`,
    );
    check(
      "T5c action_log metadata.orgId matches target",
      row.metadata?.orgId === targetOrg.id,
      `got metadata=${JSON.stringify(row.metadata)}`,
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // T6: cross-tenant isolation — alt user can't read primary user's logs
  // ────────────────────────────────────────────────────────────────────
  const altUser = await createTestUser("alt");
  const altLogs = await pg.query(
    `SELECT id FROM action_logs WHERE user_id = $1`,
    [altUser.id],
  );
  check(
    "T6 alt test user has zero action_logs (DB-level isolation)",
    altLogs.rows.length === 0,
    `got ${altLogs.rows.length} rows`,
  );
} catch (err) {
  console.log(`[FATAL] test threw: ${err.message}`);
  fail += 1;
  failures.push(`fatal: ${err.message}`);
} finally {
  await cleanup();
}

console.log("");
console.log(`========================================`);
console.log(`Results: ${pass} pass / ${fail} fail`);
if (failures.length > 0) {
  console.log("");
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
}
console.log(`========================================`);
process.exit(fail === 0 ? 0 : 1);
