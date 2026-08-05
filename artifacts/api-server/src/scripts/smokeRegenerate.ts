/**
 * Smoke: prepare-first-message `force` (Regenerate) semantics — runtime, HTTP-level.
 *
 * Covers the audit fixes for the Contacts generate→preview→confirm feature.
 * Deliberately spends ZERO LLM money: every assertion here exercises a path
 * that short-circuits (cached message) or is rejected by a guard (already_sent,
 * rate limit, schema) BEFORE any model call. That's also the point — if a guard
 * regresses, this smoke starts burning real money and the run time explodes,
 * which is itself a loud signal.
 *
 * Asserts:
 *   1. force omitted + cached body      → 200 already_ready, body byte-identical, deep link built
 *   2. cached path works per channel    → whatsapp wa.me / telegram t.me / linkedin profile URL
 *   3. force=true on a SENT prospect    → 409 already_sent  [AUDIT High]
 *   4. ...and the stored body is UNCHANGED — the corruption the guard prevents
 *   5. force=false on a SENT prospect   → still 200 (guard gates ONLY force; no regression)
 *   6. unknown field                    → 400 invalid_body (.strict() holds)
 *   7. force:"yes"                      → 400 invalid_body (boolean enforced)
 *   8. 11th force call in a minute      → 429 + Retry-After  [AUDIT High: cost-DoS]
 *   9. a rate-limited call must NOT clobber the progress entry of a live run
 *
 * Requires a live DB (DATABASE_URL). Cleans up every seeded row in a finally.
 *
 *   FOLLOWUP_DIGEST_SCHEDULER=false node ../../lib/db/node_modules/tsx/dist/cli.mjs \
 *     src/scripts/smokeRegenerate.ts
 */
import express from "express";
import cookieParser from "cookie-parser";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, prospectsTable } from "@workspace/db";
import { signSession, SESSION_COOKIE_NAME } from "../lib/session";
import { loadUser } from "../middlewares/auth";
import prepareFirstMessageRouter from "../routes/prepareFirstMessage";
import { getPrepareProgress } from "../services/prepareProgress";

process.env.PUBLIC_BASE_URL ??= "http://localhost";
process.env.APP_PUBLIC_URL ??= "http://localhost";

const CACHED = "Hi Test, saw SmokeCo shipped three releases this quarter, worth a look?";

const userIds: string[] = [];
const prospectIds: string[] = [];

interface Seeded {
  cookie: string;
  userId: string;
  whatsapp: string;
  telegram: string;
  linkedin: string;
  sent: string;
}

async function seedUser(tag: string): Promise<{ id: string; cookie: string }> {
  const email = `smoke-regen-${tag}-${Date.now()}@example.test`;
  const [u] = await db
    .insert(usersTable)
    .values({ email, name: "Smoke Rep" })
    .returning({ id: usersTable.id });
  userIds.push(u!.id);
  const token = signSession({ userId: u!.id, email });
  return { id: u!.id, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

async function seedProspect(
  userId: string,
  opts: {
    phone?: string | null;
    telegramHandle?: string | null;
    linkedinUrl?: string | null;
    sentAt?: Date | null;
  },
): Promise<string> {
  const [p] = await db
    .insert(prospectsTable)
    .values({
      userId,
      sourceMode: "manual",
      prospectName: "Test",
      company: "SmokeCo",
      phone: opts.phone ?? null,
      telegramHandle: opts.telegramHandle ?? null,
      linkedinUrl: opts.linkedinUrl ?? null,
      // A cached body is what makes every call below LLM-free.
      firstMessageBody: CACHED,
      firstMessageSentAt: opts.sentAt ?? null,
      followupPaused: false,
      replied: 0,
    })
    .returning({ id: prospectsTable.id });
  prospectIds.push(p!.id);
  return p!.id;
}

async function seed(): Promise<Seeded> {
  const u = await seedUser("a");
  return {
    cookie: u.cookie,
    userId: u.id,
    whatsapp: await seedProspect(u.id, { phone: "+972500000001" }),
    telegram: await seedProspect(u.id, { telegramHandle: "@smoketester" }),
    linkedin: await seedProspect(u.id, {
      linkedinUrl: "https://www.linkedin.com/in/smoketester",
    }),
    sent: await seedProspect(u.id, {
      phone: "+972500000002",
      sentAt: new Date(),
    }),
  };
}

async function cleanup(): Promise<void> {
  if (prospectIds.length)
    await db
      .delete(prospectsTable)
      .where(inArray(prospectsTable.id, prospectIds))
      .catch(() => {});
  if (userIds.length)
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, userIds))
      .catch(() => {});
}

async function main(): Promise<number> {
  const s = await seed();

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadUser);
  app.use("/api", prepareFirstMessageRouter);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;

  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail = ""): void => {
    console.log(`[regen] ${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
    if (ok) pass++;
    else fail++;
  };

  const post = async (
    id: string,
    body: unknown,
    cookie = s.cookie,
  ): Promise<{ status: number; json: any; retryAfter: string | null }> => {
    const res = await fetch(`${base}/api/prospects/${id}/prepare-first-message`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, json, retryAfter: res.headers.get("retry-after") };
  };

  // 1 + 2 — cached path per channel, no force. Must not spend, must deep-link.
  const wa = await post(s.whatsapp, { channel: "whatsapp" });
  check(
    "whatsapp: no force + cached body → 200 already_ready, body verbatim",
    wa.status === 200 &&
      wa.json?.status === "already_ready" &&
      wa.json?.message === CACHED,
    `${wa.status} ${wa.json?.status}`,
  );
  check(
    "whatsapp: cached path builds wa.me deep link",
    typeof wa.json?.deepLinkUrl === "string" &&
      /wa\.me/.test(wa.json.deepLinkUrl) &&
      wa.json.deepLinkUrl.includes("500000001"),
    String(wa.json?.deepLinkUrl).slice(0, 70),
  );

  const tg = await post(s.telegram, { channel: "telegram" });
  check(
    "telegram: cached path → 200 + t.me deep link",
    tg.status === 200 &&
      tg.json?.status === "already_ready" &&
      /t\.me/.test(String(tg.json?.deepLinkUrl)),
    `${tg.status} ${String(tg.json?.deepLinkUrl).slice(0, 60)}`,
  );

  const li = await post(s.linkedin, { channel: "linkedin" });
  check(
    "linkedin: cached path → 200 + profile URL (clipboard-only, no prefill)",
    li.status === 200 &&
      li.json?.status === "already_ready" &&
      /linkedin\.com\//.test(String(li.json?.deepLinkUrl)),
    `${li.status} ${String(li.json?.deepLinkUrl).slice(0, 60)}`,
  );

  // 3 + 4 — AUDIT High: force must not rewrite an already-sent message.
  const forcedSent = await post(s.sent, { channel: "whatsapp", force: true });
  check(
    "force=true on an already-SENT prospect → 409 already_sent",
    forcedSent.status === 409 && forcedSent.json?.error === "already_sent",
    `${forcedSent.status} ${forcedSent.json?.error}`,
  );
  const [afterRow] = await db
    .select({ body: prospectsTable.firstMessageBody })
    .from(prospectsTable)
    .where(eq(prospectsTable.id, s.sent))
    .limit(1);
  check(
    "...and the stored body is UNCHANGED (follow-up chain stays truthful)",
    afterRow?.body === CACHED,
    `${String(afterRow?.body).slice(0, 40)}…`,
  );

  // 5 — the guard must gate ONLY force; normal send-path prepare still works.
  const sentNoForce = await post(s.sent, { channel: "whatsapp" });
  check(
    "force omitted on a SENT prospect → still 200 already_ready (no regression)",
    sentNoForce.status === 200 && sentNoForce.json?.status === "already_ready",
    `${sentNoForce.status} ${sentNoForce.json?.status}`,
  );

  // 6 + 7 — schema contract.
  const unknown = await post(s.whatsapp, { channel: "whatsapp", bogus: 1 });
  check(
    "unknown field → 400 invalid_body (.strict() intact)",
    unknown.status === 400 && unknown.json?.error === "invalid_body",
    `${unknown.status} ${unknown.json?.error}`,
  );
  const badForce = await post(s.whatsapp, { force: "yes" });
  check(
    'force:"yes" → 400 invalid_body (boolean enforced)',
    badForce.status === 400 && badForce.json?.error === "invalid_body",
    `${badForce.status} ${badForce.json?.error}`,
  );

  // 8 — AUDIT High: the regenerate rate limit bounds a concurrent burst.
  // Fresh user so user A's earlier force call doesn't skew the count. The
  // prospect is SENT, so every allowed call costs 409 instead of an LLM run.
  const b = await seedUser("b");
  const bSent = await seedProspect(b.id, {
    phone: "+972500000003",
    sentAt: new Date(),
  });
  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) {
    const r = await post(bSent, { channel: "whatsapp", force: true }, b.cookie);
    statuses.push(r.status);
  }
  const allowed = statuses.filter((x) => x === 409).length;
  const limited = statuses.filter((x) => x === 429).length;
  check(
    "force rate limit: first 10/min allowed, the rest 429",
    allowed === 10 && limited === 2,
    `allowed(409)=${allowed} limited(429)=${limited} :: ${statuses.join(",")}`,
  );
  const lastLimited = await post(
    bSent,
    { channel: "whatsapp", force: true },
    b.cookie,
  );
  check(
    "429 carries Retry-After",
    lastLimited.status === 429 && Number(lastLimited.retryAfter) > 0,
    `${lastLimited.status} Retry-After=${lastLimited.retryAfter}`,
  );

  // 9 — a rate-limited call starts no run, so it must not overwrite the
  // progress entry a live run is reporting into.
  const progressAfterLimit = getPrepareProgress(b.id, bSent);
  check(
    "rate-limited call did NOT stamp progress (no clobbering a live run)",
    progressAfterLimit?.stage !== "queued",
    `stage=${progressAfterLimit?.stage ?? "(none)"}`,
  );

  // A non-forced call must never be rate-limited — the cached path is free.
  const freeAfterLimit = await post(bSent, { channel: "whatsapp" }, b.cookie);
  check(
    "cached (non-force) call is NOT rate-limited even after 429s",
    freeAfterLimit.status === 200,
    `${freeAfterLimit.status}`,
  );

  server.close();
  console.log(`\n[regen] ${pass}/${pass + fail} PASS`);
  return fail === 0 ? 0 : 1;
}

main()
  .then(async (code) => {
    await cleanup();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("[regen] ERROR", err);
    await cleanup();
    process.exit(1);
  });
