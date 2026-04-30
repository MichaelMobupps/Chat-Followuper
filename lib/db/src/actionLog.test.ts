import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, eq } from "drizzle-orm";
import { db, pool } from "./index";
import { usersTable } from "./schema/users";
import { actionLogsTable } from "./schema/action_logs";
import { dailyUsageTable } from "./schema/daily_usage";
import {
  addAnthropicSpend,
  incrementDailyUsage,
  logAction,
} from "./actionLog";

const TEST_DATE = "2030-01-01";
let testUserId: string;

beforeAll(async () => {
  const [user] = await db
    .insert(usersTable)
    .values({
      email: `actionlog-test+${Date.now()}@example.test`,
      name: "ActionLog Test",
    })
    .returning();
  testUserId = user.id;
});

afterAll(async () => {
  await db.delete(actionLogsTable).where(eq(actionLogsTable.userId, testUserId));
  await db
    .delete(dailyUsageTable)
    .where(eq(dailyUsageTable.userId, testUserId));
  await db.delete(usersTable).where(eq(usersTable.id, testUserId));
  await pool.end();
});

describe("logAction", () => {
  it("inserts a row with the provided fields", async () => {
    const row = await logAction({
      userId: testUserId,
      actionType: "auth.login",
      actionStatus: "success",
      durationMs: 42,
      metadata: { ip: "127.0.0.1" },
    });

    expect(row).toBeDefined();
    expect(row.userId).toBe(testUserId);
    expect(row.actionType).toBe("auth.login");
    expect(row.actionStatus).toBe("success");
    expect(row.durationMs).toBe(42);
    expect(row.metadata).toEqual({ ip: "127.0.0.1" });
    expect(row.executedAt).toBeInstanceOf(Date);
  });
});

describe("incrementDailyUsage", () => {
  it("inserts then increments the chosen counter", async () => {
    await db
      .delete(dailyUsageTable)
      .where(
        sql`${dailyUsageTable.userId} = ${testUserId}::uuid AND ${dailyUsageTable.date} = ${TEST_DATE}::date`,
      );

    const first = await incrementDailyUsage({
      userId: testUserId,
      field: "messagesGenerated",
      by: 3,
      date: TEST_DATE,
    });
    expect(Number(first.messages_generated)).toBe(3);

    const second = await incrementDailyUsage({
      userId: testUserId,
      field: "messagesGenerated",
      by: 2,
      date: TEST_DATE,
    });
    expect(Number(second.messages_generated)).toBe(5);

    const third = await incrementDailyUsage({
      userId: testUserId,
      field: "apolloRevealsUsed",
      date: TEST_DATE,
    });
    expect(Number(third.apollo_reveals_used)).toBe(1);
    expect(Number(third.messages_generated)).toBe(5);
  });
});

describe("addAnthropicSpend", () => {
  it("upserts and accumulates spend in USD", async () => {
    await db
      .delete(dailyUsageTable)
      .where(
        sql`${dailyUsageTable.userId} = ${testUserId}::uuid AND ${dailyUsageTable.date} = ${TEST_DATE}::date`,
      );

    const first = await addAnthropicSpend(testUserId, 0.0125, TEST_DATE);
    expect(Number(first.anthropic_spend_usd)).toBeCloseTo(0.0125, 4);

    const second = await addAnthropicSpend(testUserId, 0.0875, TEST_DATE);
    expect(Number(second.anthropic_spend_usd)).toBeCloseTo(0.1, 4);
  });
});
