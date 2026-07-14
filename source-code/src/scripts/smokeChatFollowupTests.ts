/**
 * Smoke: Murat's Chat-Followuper test findings — the two fixes.
 *
 * Run: FOLLOWUP_DIGEST_SCHEDULER=false \
 *   node ../../lib/db/node_modules/tsx/dist/cli.mjs src/scripts/smokeChatFollowupTests.ts
 *
 * No ANTHROPIC_API_KEY needed — neither path generates a message.
 *
 * Covers:
 *  A) LinkedIn "Open test chat" FE↔BE parity. The FE panel gate
 *     (IDENTIFIER_SHAPE.linkedin) was stricter than the BE route and silently
 *     blocked valid identifiers → the button "did nothing". Assert the FE
 *     regex and the BE route agree on a table of inputs (accept the same,
 *     reject the same), and that the BE actually 200s for the accepted forms
 *     and 400s a "+"-phone.
 *  B) Edit-before-send. A not-yet-sent prospect has NO follow-up row, so the
 *     pencil now edits the prospect's first message via PATCH /prospects/:id.
 *     Assert: the prospect shows up on GET /api/followups with an empty
 *     followups[] (not_yet_sent), PATCH firstMessageBody 200s, the list row
 *     preview reflects the edit, and a foreign user is 404'd (IDOR guard).
 */
import { eq, inArray } from "drizzle-orm";
import { db, pool, prospectsTable, followupsTable, usersTable } from "@workspace/db";
import app from "../app";
import { SESSION_COOKIE_NAME, signSession } from "../lib/session";

const results: string[] = [];
function assert(name: string, ok: boolean, detail = ""): void {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

// ── FE gate (mirror of TestChannelMessage.tsx IDENTIFIER_SHAPE.linkedin) ──
const FE_LINKEDIN =
  /^(https?:\/\/([\w-]+\.)*linkedin\.com\/.*|\/?in\/[\w%-]+\/?|@?[a-zA-Z0-9][\w-]{2,99})$/i;
function feAccepts(id: string): boolean {
  return FE_LINKEDIN.test(id.trim());
}
// ── BE gate (mirror of routes/testChannelLink.ts linkedin looksValid) ──
function beAccepts(id: string): boolean {
  return (
    /^https?:\/\/([\w-]+\.)*linkedin\.com\//i.test(id) ||
    /^\/?in\/[\w%-]+\/?$/i.test(id) ||
    /^@?[a-zA-Z0-9][\w-]{2,99}$/.test(id)
  );
}

async function main(): Promise<void> {
  const user = (await db.select().from(usersTable).limit(1))[0];
  if (!user) throw new Error("no seed user");
  const cookie = `${SESSION_COOKIE_NAME}=${signSession({ userId: user.id, email: user.email })}`;

  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  let prospectId: string | null = null;
  let repliedProspectId: string | null = null;

  try {
    // ─────────────────────────────────────────────────────────────
    // A) LinkedIn test-channel FE↔BE parity
    // ─────────────────────────────────────────────────────────────
    const cases: Array<{ id: string; wantAccept: boolean }> = [
      { id: "https://www.linkedin.com/in/muratsolendil", wantAccept: true },
      { id: "https://linkedin.com/company/acme", wantAccept: true },
      { id: "in/you", wantAccept: true },
      { id: "/in/you", wantAccept: true },
      { id: "in/you/", wantAccept: true },
      { id: "@murat", wantAccept: true },
      { id: "murat-solendil", wantAccept: true },
      { id: "+905324731907", wantAccept: false }, // the screenshot's phone
      { id: "www.linkedin.com/in/x", wantAccept: false }, // scheme-less: route rejects
      { id: "@a", wantAccept: false }, // too short
    ];

    let parityOk = true;
    let feBeAgree = true;
    for (const c of cases) {
      const fe = feAccepts(c.id);
      const be = beAccepts(c.id);
      if (fe !== be) {
        feBeAgree = false;
        results.push(`FAIL  FE/BE disagree on "${c.id}" — fe=${fe} be=${be}`);
        process.exitCode = 1;
      }
      if (fe !== c.wantAccept) {
        parityOk = false;
        results.push(`FAIL  FE gate wrong for "${c.id}" — got ${fe}, want ${c.wantAccept}`);
        process.exitCode = 1;
      }
    }
    assert("FE gate matches BE gate on all inputs", feBeAgree);
    assert("FE gate accepts/rejects the expected inputs", parityOk);
    // The regression that made the button "do nothing": FE now accepts a bare
    // slug/handle the old /linkedin\.com\// blocked.
    assert('FE now accepts bare "in/you" (old gate blocked it)', feAccepts("in/you"));
    assert('FE still rejects the "+phone" (helpful hint fires)', !feAccepts("+905324731907"));

    // BE route really 200s an accepted form and 400s the phone.
    const okRes = await fetch(`${base}/api/users/me/test-channel-link`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        channel: "linkedin",
        identifier: "in/you",
        message: "Test message from Chat Followuper.",
      }),
    });
    const okBody = (await okRes.json()) as { deepLinkUrl?: string };
    assert("BE test-channel-link 200 for accepted slug", okRes.status === 200, `HTTP ${okRes.status}`);
    assert(
      "BE returns a linkedin.com deep link",
      typeof okBody.deepLinkUrl === "string" &&
        /^https:\/\/www\.linkedin\.com\//i.test(okBody.deepLinkUrl ?? ""),
      okBody.deepLinkUrl,
    );

    const badRes = await fetch(`${base}/api/users/me/test-channel-link`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ channel: "linkedin", identifier: "+905324731907", message: "x" }),
    });
    assert("BE 400s a phone in the linkedin field", badRes.status === 400, `HTTP ${badRes.status}`);

    // ─────────────────────────────────────────────────────────────
    // B) Edit-before-send on a not-yet-sent prospect
    // ─────────────────────────────────────────────────────────────
    const ORIGINAL = "Hi Murat, original generated first message about your UA spend.";
    const [prospect] = await db
      .insert(prospectsTable)
      .values({
        userId: user.id,
        sourceMode: "manual",
        prospectName: "EditBeforeSend",
        company: "SmokeCo",
        vertical: "web_cps",
        subVertical: "cps_web_classifieds_general",
        product: "CPS / performance marketing",
        country: "Turkey",
        language: "en",
        phone: "+905550990077",
        firstMessageChannel: "whatsapp",
        firstMessageBody: ORIGINAL,
        firstMessageSentAt: null, // NOT yet sent → no follow-ups seeded
      })
      .returning({ id: prospectsTable.id });
    prospectId = prospect.id;

    // Appears on the follow-up list with an empty followups[] (not_yet_sent).
    const listRes = await fetch(`${base}/api/followups?channel=whatsapp&perPage=100`, {
      headers: { cookie },
    });
    const listBody = (await listRes.json()) as {
      items: Array<{
        prospect: { id: string; firstMessageBody: string | null };
        followups: unknown[];
        derived: { uiStatus: string; nextScheduled: unknown; lastSent: unknown };
      }>;
    };
    const row = listBody.items.find((i) => i.prospect.id === prospectId);
    assert("not-yet-sent prospect appears on follow-up list", !!row);
    assert("row has NO follow-up rows (edit targets first message)", row?.followups.length === 0, `len=${row?.followups.length}`);
    assert("row is not_yet_sent with null next/last", row?.derived.uiStatus === "not_yet_sent" && row?.derived.nextScheduled === null && row?.derived.lastSent === null);
    assert("row preview carries the original first message", row?.prospect.firstMessageBody === ORIGINAL);

    // PATCH the first message (what the pencil now does).
    const EDITED = "Hi Murat, EDITED first message — worth a quick 15 min next week?";
    const patchRes = await fetch(`${base}/api/prospects/${prospectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ firstMessageBody: EDITED }),
    });
    assert("PATCH firstMessageBody 200", patchRes.status === 200, `HTTP ${patchRes.status}`);

    // The follow-up list row preview now reflects the edit.
    const list2 = await fetch(`${base}/api/followups?channel=whatsapp&perPage=100`, { headers: { cookie } });
    const list2Body = (await list2.json()) as {
      items: Array<{ prospect: { id: string; firstMessageBody: string | null } }>;
    };
    const row2 = list2Body.items.find((i) => i.prospect.id === prospectId);
    assert("follow-up list reflects the edited first message", row2?.prospect.firstMessageBody === EDITED, row2?.prospect.firstMessageBody ?? "(missing)");

    // Reject empty / whitespace body (BE schema min(1) after trim).
    const emptyRes = await fetch(`${base}/api/prospects/${prospectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ firstMessageBody: "   " }),
    });
    assert("PATCH rejects whitespace-only body", emptyRes.status === 400, `HTTP ${emptyRes.status}`);

    // IDOR: a second user cannot edit this prospect.
    const others = await db.select().from(usersTable).limit(5);
    const other = others.find((u) => u.id !== user.id);
    if (other) {
      const otherCookie = `${SESSION_COOKIE_NAME}=${signSession({ userId: other.id, email: other.email })}`;
      const idorRes = await fetch(`${base}/api/prospects/${prospectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: otherCookie },
        body: JSON.stringify({ firstMessageBody: "hacked" }),
      });
      assert("foreign user cannot edit prospect (404)", idorRes.status === 404, `HTTP ${idorRes.status}`);
    } else {
      results.push("SKIP  IDOR check — only one seed user");
    }

    // ─────────────────────────────────────────────────────────────
    // C) M1 regression guard — a replied prospect whose stages were
    //    cancelled has a NON-EMPTY followups[] but null next/last. The FE
    //    pencil gate keys off `followups.length === 0`, so this prospect's
    //    Edit stays DISABLED (can't reopen a cancelled row / re-arm). Here we
    //    assert the DATA shape the gate depends on.
    // ─────────────────────────────────────────────────────────────
    const [repliedProspect] = await db
      .insert(prospectsTable)
      .values({
        userId: user.id,
        sourceMode: "manual",
        prospectName: "RepliedCancelled",
        company: "SmokeCo",
        vertical: "web_cps",
        subVertical: "cps_web_classifieds_general",
        product: "CPS / performance marketing",
        country: "Turkey",
        language: "en",
        phone: "+905550990088",
        firstMessageChannel: "whatsapp",
        firstMessageBody: "Hi, first message that WAS sent, then they replied.",
        firstMessageSentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        replied: 1,
        repliedAt: new Date(),
      })
      .returning({ id: prospectsTable.id });
    repliedProspectId = repliedProspect.id;
    // A cancelled stage row (as mark-replied produces): non-empty followups[],
    // but not "scheduled" (→ nextScheduled null) and not sent (→ lastSent null).
    await db.insert(followupsTable).values({
      prospectId: repliedProspect.id,
      stage: 1,
      channel: "whatsapp",
      status: "cancelled",
      scheduledAt: new Date(),
    });

    const list3 = await fetch(`${base}/api/followups?channel=whatsapp&status=all&perPage=100`, {
      headers: { cookie },
    });
    const list3Body = (await list3.json()) as {
      items: Array<{
        prospect: { id: string; firstMessageBody: string | null };
        followups: unknown[];
        derived: { uiStatus: string; nextScheduled: unknown; lastSent: unknown };
      }>;
    };
    const rRow = list3Body.items.find((i) => i.prospect.id === repliedProspectId);
    assert("replied/cancelled prospect appears on the list", !!rRow);
    assert(
      "M1: followups[] non-empty but next/last null (pencil stays disabled)",
      (rRow?.followups.length ?? 0) > 0 &&
        rRow?.derived.nextScheduled === null &&
        rRow?.derived.lastSent === null,
      `len=${rRow?.followups.length} next=${rRow?.derived.nextScheduled} last=${rRow?.derived.lastSent}`,
    );
    assert("M1: prospect is derived 'replied'", rRow?.derived.uiStatus === "replied", rRow?.derived.uiStatus);
  } finally {
    const cleanup = [prospectId, repliedProspectId].filter(
      (id): id is string => !!id,
    );
    if (cleanup.length) {
      await db.delete(followupsTable).where(inArray(followupsTable.prospectId, cleanup));
      await db.delete(prospectsTable).where(inArray(prospectsTable.id, cleanup));
    }
    server.close();
  }

  console.log("\n" + results.join("\n") + "\n");
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  const passed = results.filter((r) => r.startsWith("PASS")).length;
  console.log(`${passed} passed, ${failed} failed`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
