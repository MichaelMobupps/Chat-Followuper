import { sql } from "drizzle-orm";
import { db } from "./index";
import {
  actionLogsTable,
  type ActionStatus,
} from "./schema/action_logs";
import { dailyUsageTable } from "./schema/daily_usage";

export type LogActionInput = {
  userId: string | null;
  prospectId?: string | null;
  followupId?: number | null;
  actionType: string;
  actionStatus: ActionStatus;
  durationMs?: number;
  errorDetail?: string;
  metadata?: Record<string, unknown>;
};

export async function logAction(input: LogActionInput) {
  const [row] = await db
    .insert(actionLogsTable)
    .values({
      userId: input.userId,
      prospectId: input.prospectId ?? null,
      followupId: input.followupId ?? null,
      actionType: input.actionType,
      actionStatus: input.actionStatus,
      durationMs: input.durationMs ?? null,
      errorDetail: input.errorDetail ?? null,
      metadata: input.metadata ?? null,
    })
    .returning();
  return row;
}

export type DailyUsageCounter =
  | "messagesGenerated"
  | "messagesSent"
  | "apolloRevealsUsed";

const COUNTER_TO_COLUMN: Record<DailyUsageCounter, string> = {
  messagesGenerated: "messages_generated",
  messagesSent: "messages_sent",
  apolloRevealsUsed: "apollo_reveals_used",
};

function todayInUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export type IncrementDailyUsageInput = {
  userId: string;
  field: DailyUsageCounter;
  by?: number;
  date?: string;
};

export async function incrementDailyUsage(input: IncrementDailyUsageInput) {
  const by = input.by ?? 1;
  const date = input.date ?? todayInUtc();
  const column = COUNTER_TO_COLUMN[input.field];

  const seedValues: Record<string, number> = {
    messages_generated: 0,
    messages_sent: 0,
    apollo_reveals_used: 0,
  };
  seedValues[column] = by;

  const result = await db.execute<{
    user_id: string;
    date: string;
    messages_generated: number;
    messages_sent: number;
    apollo_reveals_used: number;
    anthropic_spend_usd: string;
    digest_sent: boolean;
  }>(sql`
    INSERT INTO ${dailyUsageTable} (
      user_id, date, messages_generated, messages_sent, apollo_reveals_used
    ) VALUES (
      ${input.userId}::uuid,
      ${date}::date,
      ${seedValues.messages_generated},
      ${seedValues.messages_sent},
      ${seedValues.apollo_reveals_used}
    )
    ON CONFLICT (user_id, date) DO UPDATE SET
      ${sql.raw(column)} = ${dailyUsageTable}.${sql.raw(column)} + ${by}
    RETURNING *
  `);

  return result.rows[0];
}

export async function addAnthropicSpend(
  userId: string,
  usd: number,
  date?: string,
) {
  const day = date ?? todayInUtc();
  const result = await db.execute<{
    user_id: string;
    date: string;
    anthropic_spend_usd: string;
  }>(sql`
    INSERT INTO ${dailyUsageTable} (user_id, date, anthropic_spend_usd)
    VALUES (${userId}::uuid, ${day}::date, ${usd}::numeric)
    ON CONFLICT (user_id, date) DO UPDATE SET
      anthropic_spend_usd =
        ${dailyUsageTable}.anthropic_spend_usd + EXCLUDED.anthropic_spend_usd
    RETURNING *
  `);
  return result.rows[0];
}
