/**
 * Smoke: follow-up DELIVERY routing (runtime, HTTP-level).
 *
 * Seeds a user + prospects (whatsapp / telegram / linkedin) + scheduled
 * follow-ups (pre-set message, so NO LLM call), mounts the real followupOpen +
 * followupFallback routers, and asserts that tapping the token link routes
 * correctly per channel:
 *   - whatsapp → 302 to a wa.me prefill deep link (prospect phone)
 *   - telegram → 302 to a t.me prefill deep link
 *   - linkedin → 302 to the /fallback copy-paste page (LinkedIn can't prefill),
 *                whose HTML carries the message + "Copy message" + "Open LinkedIn
 *                profile" (the seamlessness fix)
 * Cleans up every seeded row in a finally. Requires a live DB (DATABASE_URL).
 *
 *   FOLLOWUP_DIGEST_SCHEDULER=false node ../../lib/db/node_modules/tsx/dist/cli.mjs \
 *     src/scripts/smokeDeliveryFlow.ts
 */
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, prospectsTable, followupsTable } from "@workspace/db";
import { mintOpenToken } from "../lib/followupLinkToken";
import followupOpenRouter from "../routes/followupOpen";
import followupFallbackRouter from "../routes/followupFallback";

process.env.PUBLIC_BASE_URL ??= "http://localhost";
process.env.APP_PUBLIC_URL ??= "http://localhost";

const MSG = "Hi Test, saw your team is scaling up right now, worth a quick look?";
let userId = "";
const prospectIds: string[] = [];
const followupIds: number[] = [];

async function seed(): Promise<Array<{ channel: string; followupId: number }>> {
  const [u] = await db
    .insert(usersTable)
    .values({ email: `smoke-delivery-${Date.now()}@example.test`, name: "Smoke Rep" })
    .returning({ id: usersTable.id });
  userId = u!.id;

  const channels = [
    { channel: "whatsapp", phone: "+972500000001", telegramHandle: null, linkedinUrl: null },
    { channel: "telegram", phone: null, telegramHandle: "@smoketester", linkedinUrl: null },
    {
      channel: "linkedin",
      phone: null,
      telegramHandle: null,
      linkedinUrl: "https://www.linkedin.com/in/smoketester",
    },
  ] as const;

  const out: Array<{ channel: string; followupId: number }> = [];
  for (const c of channels) {
    const [p] = await db
      .insert(prospectsTable)
      .values({
        userId,
        sourceMode: "manual",
        prospectName: "Test",
        company: "SmokeCo",
        phone: c.phone,
        telegramHandle: c.telegramHandle,
        linkedinUrl: c.linkedinUrl,
        followupPaused: false,
        replied: 0,
      })
      .returning({ id: prospectsTable.id });
    prospectIds.push(p!.id);

    const [f] = await db
      .insert(followupsTable)
      .values({
        prospectId: p!.id,
        stage: 1,
        channel: c.channel,
        status: "scheduled",
        scheduledAt: new Date(),
        generatedMessage: MSG,
      })
      .returning({ id: followupsTable.id });
    followupIds.push(f!.id);
    out.push({ channel: c.channel, followupId: f!.id });
  }
  return out;
}

async function cleanup(): Promise<void> {
  if (followupIds.length)
    await db.delete(followupsTable).where(inArray(followupsTable.id, followupIds)).catch(() => {});
  if (prospectIds.length)
    await db.delete(prospectsTable).where(inArray(prospectsTable.id, prospectIds)).catch(() => {});
  if (userId) await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
}

async function main(): Promise<number> {
  const seeded = await seed();

  const app = express();
  app.use("/api", followupOpenRouter);
  app.use("/api", followupFallbackRouter);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;

  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail = ""): void => {
    console.log(`[delivery] ${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
    if (ok) pass++;
    else fail++;
  };

  for (const s of seeded) {
    const token = mintOpenToken(s.followupId, userId);
    const openRes = await fetch(
      `${base}/api/followups/open/${s.followupId}?t=${encodeURIComponent(token)}`,
      { redirect: "manual" },
    );
    const loc = openRes.headers.get("location") ?? "";

    if (s.channel === "whatsapp") {
      check(
        "whatsapp /open → wa.me prefill to prospect phone",
        openRes.status === 302 && /wa\.me/.test(loc) && loc.includes("500000001"),
        `${openRes.status} ${loc.slice(0, 70)}`,
      );
    }
    if (s.channel === "telegram") {
      check(
        "telegram /open → t.me prefill",
        openRes.status === 302 && /t\.me/.test(loc),
        `${openRes.status} ${loc.slice(0, 70)}`,
      );
    }
    if (s.channel === "linkedin") {
      check(
        "linkedin /open → /fallback (no bare-profile drop)",
        openRes.status === 302 && loc.includes("/api/followups/fallback/"),
        `${openRes.status} ${loc.slice(0, 90)}`,
      );
      const fbRes = await fetch(
        `${base}/api/followups/fallback/${s.followupId}?t=${encodeURIComponent(token)}`,
      );
      const html = await fbRes.text();
      check(
        "linkedin /fallback shows message + Copy + Open-profile button",
        fbRes.status === 200 &&
          html.includes("Open LinkedIn profile") &&
          html.includes("Copy message") &&
          html.includes("saw your team is scaling"),
        `status ${fbRes.status}`,
      );
      // The fallback must NOT re-trigger a chat-link loop: no "Retry open" for LI.
      check(
        "linkedin /fallback has no Retry-open loop",
        !html.includes(">Retry open<"),
        "",
      );
    }
  }

  server.close();
  console.log(`\n[delivery] ${fail === 0 ? "ALL PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
  return fail;
}

main()
  .then(async (fail) => {
    await cleanup();
    process.exit(fail ? 1 : 0);
  })
  .catch(async (e) => {
    console.error("[delivery] crashed:", e);
    await cleanup();
    process.exit(1);
  });
