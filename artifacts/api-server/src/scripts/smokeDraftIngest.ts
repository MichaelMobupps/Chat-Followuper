/**
 * Smoke: draft claim on manual-ingest — runtime, HTTP-level.
 *
 * Covers "Generate message" in the Add dialog: a message written BEFORE the
 * contact exists is parked server-side under a draftId, and the create call
 * claims it. The invariant under test is ALL-OR-NOTHING — followupMessageService
 * throws `research_not_complete` when researchBrief is null, so a contact must
 * never be saved with a message but no brief.
 *
 * Spends ZERO LLM money: the draft store is seeded directly (setDraft), so the
 * create path is exercised without the writer ever running. The preview ROUTE's
 * own guards (schema, rate limit) are asserted separately, and are rejected
 * before any model call.
 *
 *   FOLLOWUP_DIGEST_SCHEDULER=false node ../../lib/db/node_modules/tsx/dist/cli.mjs \
 *     src/scripts/smokeDraftIngest.ts
 */
import express from "express";
import cookieParser from "cookie-parser";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, prospectsTable } from "@workspace/db";
import { signSession, SESSION_COOKIE_NAME } from "../lib/session";
import { loadUser } from "../middlewares/auth";
import prospectsRouter from "../routes/prospects";
import prepareFirstMessageRouter from "../routes/prepareFirstMessage";
import { setDraft, peekDraft } from "../services/firstMessageDrafts";
import type { ProspectBrief } from "../services/prospectResearch";

process.env.PUBLIC_BASE_URL ??= "http://localhost";
process.env.APP_PUBLIC_URL ??= "http://localhost";

const DRAFT_MSG = "Hi Arushi, saw Kuku FM crossed 2M installs — worth a look?";
const BRIEF = {
  companyOverview: "Audio streaming, India.",
  freshHook: "Crossed 2M installs this quarter.",
} as unknown as ProspectBrief;

const userIds: string[] = [];
const prospectIds: string[] = [];

function classified() {
  return {
    vertical: "mobile",
    subVertical: "utility_general_mobile",
    country: "India",
    language: "hi",
    product: "mobile user acquisition",
  };
}

async function main(): Promise<number> {
  const email = `smoke-draft-${Date.now()}@example.test`;
  const [u] = await db
    .insert(usersTable)
    .values({ email, name: "Smoke Rep" })
    .returning({ id: usersTable.id });
  const userId = u!.id;
  userIds.push(userId);
  const cookie = `${SESSION_COOKIE_NAME}=${signSession({ userId, email })}`;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadUser);
  app.use("/api", prospectsRouter);
  app.use("/api", prepareFirstMessageRouter);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail = ""): void => {
    console.log(`[draft] ${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
    if (ok) pass++;
    else fail++;
  };

  let phoneSeq = 0;
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* empty */
    }
    return { status: res.status, json };
  };
  const createBody = (over: Record<string, unknown> = {}) => ({
    channel: "whatsapp",
    firstName: "Arushi",
    phone: `+9195602${String(10000 + phoneSeq++).slice(0, 5)}`,
    company: "Kuku FM",
    ticker: "mobile",
    ...over,
  });
  const row = async (id: string) =>
    (
      await db
        .select({
          body: prospectsTable.firstMessageBody,
          brief: prospectsTable.researchBrief,
          subVertical: prospectsTable.subVertical,
          language: prospectsTable.language,
          vertical: prospectsTable.vertical,
        })
        .from(prospectsTable)
        .where(eq(prospectsTable.id, id))
        .limit(1)
    )[0];

  // 1 — the happy path: a live draft is claimed, message AND brief persisted.
  const id1 = "draft-aaaaaaaa-1111";
  setDraft(userId, id1, {
    message: DRAFT_MSG,
    brief: BRIEF,
    classified: classified(),
    company: "Kuku FM",
  });
  const c1 = await post("/api/prospects/manual-ingest", createBody({ draftId: id1 }));
  prospectIds.push(c1.json?.id);
  const r1 = await row(c1.json?.id);
  check(
    "draft claimed → contact created 201 with the drafted message",
    c1.status === 201 && r1?.body === DRAFT_MSG,
    `${c1.status} ${String(r1?.body).slice(0, 30)}…`,
  );
  check(
    "...and the research brief is persisted WITH it (follow-ups won't throw)",
    !!r1?.brief && typeof r1.brief === "object",
    `brief=${r1?.brief ? "present" : "NULL"}`,
  );
  check(
    "...and the run's classification is persisted (row stays consistent)",
    r1?.subVertical === "utility_general_mobile" && r1?.language === "hi",
    `subVertical=${r1?.subVertical} language=${r1?.language}`,
  );
  check("draft is single-use (spent by the create)", peekDraft(userId, id1) === null);

  // 1b — AUDIT [High]: a duplicate_phone 409 must NOT burn the draft. The SDR
  // fixes the phone and resubmits; their reviewed message must still be there.
  const idDup = "draft-99999999-dup1";
  const dupPhone = "+972500009999";
  setDraft(userId, idDup, {
    message: DRAFT_MSG,
    brief: BRIEF,
    classified: classified(),
    company: "Kuku FM",
  });
  const first = await post(
    "/api/prospects/manual-ingest",
    createBody({ phone: dupPhone, company: "Kuku FM" }),
  );
  prospectIds.push(first.json?.id);
  const clash = await post(
    "/api/prospects/manual-ingest",
    createBody({ phone: dupPhone, draftId: idDup }),
  );
  check(
    "duplicate phone → 409, and the draft SURVIVES for a corrected resubmit",
    clash.status === 409 && peekDraft(userId, idDup) !== null,
    `${clash.status} draft=${peekDraft(userId, idDup) ? "intact" : "BURNED(!!)"}`,
  );
  const retry = await post(
    "/api/prospects/manual-ingest",
    createBody({ draftId: idDup }),
  );
  prospectIds.push(retry.json?.id);
  const rRetry = await row(retry.json?.id);
  check(
    "...and the corrected resubmit still gets the reviewed message + brief",
    retry.status === 201 && rRetry?.body === DRAFT_MSG && !!rRetry?.brief,
    `${retry.status} body=${rRetry?.body ? "set" : "NULL(!!)"}`,
  );

  // 2 — the SDR's edit wins over the generated text, brief still from the server.
  const id2 = "draft-bbbbbbbb-2222";
  setDraft(userId, id2, {
    message: DRAFT_MSG,
    brief: BRIEF,
    classified: classified(),
    company: "Kuku FM",
  });
  const edited = `${DRAFT_MSG} Edited by the rep.`;
  const c2 = await post(
    "/api/prospects/manual-ingest",
    createBody({ draftId: id2, firstMessageBody: edited }),
  );
  prospectIds.push(c2.json?.id);
  const r2 = await row(c2.json?.id);
  check(
    "edited message wins; brief still comes from the SERVER draft",
    c2.status === 201 && r2?.body === edited && !!r2?.brief,
    `${c2.status} body=${String(r2?.body).slice(-18)} brief=${r2?.brief ? "present" : "NULL"}`,
  );

  // 3 — ALL-OR-NOTHING: an unknown/expired draft must NOT persist a bodiless
  // brief or a briefless body. It degrades to a plain draft contact.
  const c3 = await post(
    "/api/prospects/manual-ingest",
    createBody({ draftId: "draft-cccccccc-3333", firstMessageBody: DRAFT_MSG }),
  );
  prospectIds.push(c3.json?.id);
  const r3 = await row(c3.json?.id);
  check(
    "expired/unknown draft → contact still created (201), NOT rejected",
    c3.status === 201,
    `${c3.status}`,
  );
  check(
    "...and NO message is persisted without its brief (the whole point)",
    r3?.body === null && !r3?.brief,
    `body=${r3?.body === null ? "null" : "SET(!!)"} brief=${r3?.brief ? "SET(!!)" : "null"}`,
  );

  // 4 — a draft may not be spent on a different company than it researched.
  const id4 = "draft-dddddddd-4444";
  setDraft(userId, id4, {
    message: DRAFT_MSG,
    brief: BRIEF,
    classified: classified(),
    company: "Kuku FM",
  });
  const c4 = await post(
    "/api/prospects/manual-ingest",
    createBody({ draftId: id4, company: "Some Other Co" }),
  );
  prospectIds.push(c4.json?.id);
  const r4 = await row(c4.json?.id);
  check(
    "company mismatch → drafted message ignored, contact still created",
    c4.status === 201 && r4?.body === null,
    `${c4.status} body=${r4?.body === null ? "null" : "SET(!!)"}`,
  );
  check(
    "...and the mismatched draft is NOT burned (a corrected resubmit can use it)",
    peekDraft(userId, id4) !== null,
  );

  // 5 — cross-tenant: user B cannot claim user A's draft.
  const emailB = `smoke-draft-b-${Date.now()}@example.test`;
  const [ub] = await db
    .insert(usersTable)
    .values({ email: emailB, name: "Other Rep" })
    .returning({ id: usersTable.id });
  userIds.push(ub!.id);
  const idShared = "draft-eeeeeeee-5555";
  setDraft(userId, idShared, {
    message: DRAFT_MSG,
    brief: BRIEF,
    classified: classified(),
    company: "Kuku FM",
  });
  const cookieB = `${SESSION_COOKIE_NAME}=${signSession({ userId: ub!.id, email: emailB })}`;
  const resB = await fetch(`${base}/api/prospects/manual-ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieB },
    body: JSON.stringify(createBody({ draftId: idShared })),
  });
  const jsonB: any = await resB.json().catch(() => null);
  if (jsonB?.id) prospectIds.push(jsonB.id);
  const rB = await row(jsonB?.id);
  check(
    "user B cannot claim user A's draft (keys are userId-scoped)",
    resB.status === 201 && rB?.body === null,
    `${resB.status} body=${rB?.body === null ? "null" : "LEAKED(!!)"}`,
  );
  check(
    "...and A's draft survives B's attempt",
    peekDraft(userId, idShared) !== null,
  );

  // 6 — preview route guards. Rejected before any model call → no spend.
  const bad = await post("/api/prospects/preview-first-message", {
    draftId: "short",
    channel: "whatsapp",
    firstName: "A",
    company: "B",
    vertical: "mobile",
  });
  check(
    "preview: draftId shape enforced → 400 invalid_body",
    bad.status === 400 && bad.json?.error === "invalid_body",
    `${bad.status} ${bad.json?.error}`,
  );
  const unknownField = await post("/api/prospects/preview-first-message", {
    draftId: "draft-ffffffff-6666",
    channel: "whatsapp",
    firstName: "A",
    company: "B",
    vertical: "mobile",
    bogus: 1,
  });
  check(
    "preview: unknown field → 400 invalid_body (.strict())",
    unknownField.status === 400 && unknownField.json?.error === "invalid_body",
    `${unknownField.status} ${unknownField.json?.error}`,
  );
  const badVertical = await post("/api/prospects/preview-first-message", {
    draftId: "draft-ffffffff-7777",
    channel: "whatsapp",
    firstName: "A",
    company: "B",
    vertical: "web",
  });
  check(
    "preview: vertical must be web_cps|mobile → 400",
    badVertical.status === 400,
    `${badVertical.status}`,
  );

  // 7 — unauthenticated callers get nothing.
  const noAuth = await fetch(`${base}/api/prospects/preview-progress/draft-zzzz-0000`);
  check("preview-progress requires auth → 401", noAuth.status === 401, `${noAuth.status}`);

  // 8 — progress for an unknown draft is "idle", not an error.
  const prog = await fetch(`${base}/api/prospects/preview-progress/draft-zzzz-0000`, {
    headers: { cookie },
  });
  const progJson: any = await prog.json().catch(() => null);
  check(
    "preview-progress for an unknown draft → 200 idle",
    prog.status === 200 && progJson?.stage === "idle",
    `${prog.status} ${progJson?.stage}`,
  );

  server.close();
  console.log(`\n[draft] ${pass}/${pass + fail} PASS`);
  return fail === 0 ? 0 : 1;
}

async function cleanup(): Promise<void> {
  const ids = prospectIds.filter(Boolean);
  if (ids.length)
    await db.delete(prospectsTable).where(inArray(prospectsTable.id, ids)).catch(() => {});
  if (userIds.length)
    await db.delete(usersTable).where(inArray(usersTable.id, userIds)).catch(() => {});
}

main()
  .then(async (code) => {
    await cleanup();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("[draft] ERROR", err);
    await cleanup();
    process.exit(1);
  });
