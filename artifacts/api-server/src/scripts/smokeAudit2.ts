/**
 * Audit-2 live smoke (throwaway — removed after the run).
 *
 * F1: recordSendIntent on a followup must stamp sentAt + status='sent' and the
 *     row must leave the digest due-query. Second call must no-op.
 * Uses the REAL service (services/channels/whatsapp) against the dev DB.
 */
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import {
  db,
  pool,
  prospectsTable,
  followupsTable,
  dailyUsageTable,
  actionLogsTable,
  usersTable,
} from "@workspace/db";
import { recordSendIntent } from "../services/channels/whatsapp";

async function main(): Promise<void> {
  const user = (await db.select().from(usersTable).limit(1))[0];
  if (!user) throw new Error("no seed user");

  // ── setup: prospect + past-due followup ──
  const [p] = await db
    .insert(prospectsTable)
    .values({
      userId: user.id,
      prospectName: "Smoke F1",
      company: "SmokeCo",
      vertical: "web",
      sourceMode: "manual",
      phone: "+15550009999",
      firstMessageChannel: "whatsapp",
      firstMessageSentAt: new Date(Date.now() - 86400_000),
      firstMessageBody: "hi",
    })
    .returning();
  const [f] = await db
    .insert(followupsTable)
    .values({
      prospectId: p!.id,
      channel: "whatsapp",
      stage: 1,
      status: "scheduled",
      scheduledAt: new Date(Date.now() - 3600_000),
      generatedMessage: "smoke followup body",
    })
    .returning();

  const dueQuery = () =>
    db
      .select({ id: followupsTable.id })
      .from(followupsTable)
      .innerJoin(prospectsTable, eq(followupsTable.prospectId, prospectsTable.id))
      .where(
        and(
          eq(followupsTable.id, f!.id),
          eq(followupsTable.status, "scheduled"),
          inArray(followupsTable.channel, ["whatsapp", "telegram"]),
          isNull(followupsTable.sentAt),
          lte(followupsTable.scheduledAt, new Date()),
        ),
      );

  const results: string[] = [];
  const assert = (name: string, ok: boolean, detail = "") => {
    results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
  };

  try {
    assert("followup is due before send", (await dueQuery()).length === 1);

    const usageBefore = await db
      .select({ n: dailyUsageTable.messagesSent })
      .from(dailyUsageTable)
      .where(eq(dailyUsageTable.userId, user.id));
    const sentBefore = usageBefore.reduce((s, r) => s + (r.n ?? 0), 0);

    // ── act: the send-intent (the click IS the send) ──
    await recordSendIntent({ prospectId: p!.id, userId: user.id, followupId: f!.id });

    const row = (await db.select().from(followupsTable).where(eq(followupsTable.id, f!.id)))[0]!;
    assert("sentAt stamped", row.sentAt !== null, String(row.sentAt));
    assert("status = sent", row.status === "sent", row.status);
    assert("clickedAt stamped", row.clickedAt !== null);
    assert("followup left the due query", (await dueQuery()).length === 0);

    // ── idempotency: second call no-ops ──
    await recordSendIntent({ prospectId: p!.id, userId: user.id, followupId: f!.id });
    const usageAfter = await db
      .select({ n: dailyUsageTable.messagesSent })
      .from(dailyUsageTable)
      .where(eq(dailyUsageTable.userId, user.id));
    const sentAfter = usageAfter.reduce((s, r) => s + (r.n ?? 0), 0);
    assert("messagesSent bumped exactly once", sentAfter === sentBefore + 1, `${sentBefore} -> ${sentAfter}`);
  } finally {
    // ── cleanup (order matters for FKs) ──
    await db.delete(actionLogsTable).where(eq(actionLogsTable.prospectId, p!.id));
    await db.delete(followupsTable).where(eq(followupsTable.id, f!.id));
    await db.delete(prospectsTable).where(eq(prospectsTable.id, p!.id));
    console.log(results.join("\n"));
    await pool.end();
  }
}

main().catch((e) => {
  console.error("SMOKE ERROR", e);
  process.exit(1);
});
