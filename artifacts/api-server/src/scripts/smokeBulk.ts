/**
 * Audit-2 / F-E live smoke (throwaway — removed after the run).
 * Boots the real Express app in-process, mints a real session cookie, and
 * drives POST /api/prospects/manual-ingest/bulk end-to-end against the dev DB.
 * Covers: batch defaults (F-E), duplicate_phone, C1 (digit string ≠ handle),
 * A6 (handle lowercasing), C3 (missing_company_product code).
 */
import { inArray, eq } from "drizzle-orm";
import { db, pool, prospectsTable, actionLogsTable, usersTable } from "@workspace/db";
import app from "../app";
import { SESSION_COOKIE_NAME, signSession } from "../lib/session";

async function main(): Promise<void> {
  const user = (await db.select().from(usersTable).limit(1))[0];
  if (!user) throw new Error("no seed user");
  const cookie = `${SESSION_COOKIE_NAME}=${signSession({ userId: user.id, email: user.email })}`;

  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const results: string[] = [];
  const assert = (name: string, ok: boolean, detail = "") => {
    results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
  };

  const PHONES = ["+15550101001", "+15550101002"];
  try {
    // ── whatsapp batch: 2 phone-only rows + 1 within-batch duplicate ──
    const r1 = await fetch(`${base}/api/prospects/manual-ingest/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        channel: "whatsapp",
        defaultCompany: "SmokeCo",
        defaultTicker: "web",
        contacts: [
          { phone: PHONES[0] },
          { phone: PHONES[1], firstName: "Named Row" },
          { phone: PHONES[0] }, // duplicate of row 0
        ],
      }),
    });
    const b1 = (await r1.json()) as { accepted: unknown[]; rejected: { index: number; error: string }[] };
    assert("bulk returns 200 (partial success)", r1.status === 200, String(r1.status));
    assert("2 phone-only rows accepted w/ batch defaults", b1.accepted.length === 2, JSON.stringify(b1.accepted).slice(0, 80));
    assert(
      "within-batch duplicate rejected as duplicate_phone @ index 2",
      b1.rejected.length === 1 && b1.rejected[0]!.index === 2 && b1.rejected[0]!.error === "duplicate_phone",
      JSON.stringify(b1.rejected),
    );
    const stored = await db
      .select({ phone: prospectsTable.phone, company: prospectsTable.company, name: prospectsTable.prospectName })
      .from(prospectsTable)
      .where(inArray(prospectsTable.phone, PHONES));
    assert("rows persisted with batch company", stored.length === 2 && stored.every((s) => s.company === "SmokeCo"));
    assert("phone-only row has null name", stored.some((s) => s.name === null));

    // ── telegram batch: C1 digit-string, A6 mixed-case handle, C3 no company ──
    const r2 = await fetch(`${base}/api/prospects/manual-ingest/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        channel: "telegram",
        contacts: [
          { phone: "972501234567", company: "SmokeCo", ticker: "web" }, // C1: bare digits, no "+"
          { phone: "@SmokeHandleXY", company: "SmokeCo", ticker: "web" }, // A6: mixed case
          { phone: "@AnotherHandle" }, // C3: no company/ticker, no defaults
        ],
      }),
    });
    const b2 = (await r2.json()) as { accepted: { prospectId: string }[]; rejected: { index: number; error: string }[] };
    const rej = (i: number) => b2.rejected.find((r) => r.index === i);
    assert("C1: bare digit string rejected (not stored as handle)", rej(0)?.error === "invalid_identifier", JSON.stringify(rej(0)));
    assert("A6: handle accepted", b2.accepted.length === 1);
    const handleRow = (
      await db
        .select({ h: prospectsTable.telegramHandle })
        .from(prospectsTable)
        .where(eq(prospectsTable.telegramHandle, "smokehandlexy"))
    )[0];
    assert("A6: handle stored lowercased", handleRow?.h === "smokehandlexy", String(handleRow?.h));
    assert("C3: missing company/product gets its own code", rej(2)?.error === "missing_company_product", JSON.stringify(rej(2)));
  } finally {
    // ── cleanup ──
    const ids = (
      await db
        .select({ id: prospectsTable.id })
        .from(prospectsTable)
        .where(inArray(prospectsTable.phone, PHONES))
    ).map((r) => r.id);
    const hIds = (
      await db
        .select({ id: prospectsTable.id })
        .from(prospectsTable)
        .where(eq(prospectsTable.telegramHandle, "smokehandlexy"))
    ).map((r) => r.id);
    const all = [...ids, ...hIds];
    if (all.length > 0) {
      await db.delete(actionLogsTable).where(inArray(actionLogsTable.prospectId, all));
      await db.delete(prospectsTable).where(inArray(prospectsTable.id, all));
    }
    await db
      .delete(actionLogsTable)
      .where(eq(actionLogsTable.actionType, "prospect.manual_ingest_bulk"));
    server.close();
    console.log(results.join("\n"));
    await pool.end();
  }
}

main().catch((e) => {
  console.error("SMOKE ERROR", e);
  process.exit(1);
});
