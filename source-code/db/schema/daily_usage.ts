import {
  pgTable,
  uuid,
  date,
  integer,
  numeric,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const dailyUsageTable = pgTable(
  "daily_usage",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    messagesGenerated: integer("messages_generated").notNull().default(0),
    messagesSent: integer("messages_sent").notNull().default(0),
    apolloRevealsUsed: integer("apollo_reveals_used").notNull().default(0),
    anthropicSpendUsd: numeric("anthropic_spend_usd", {
      precision: 10,
      scale: 4,
    })
      .notNull()
      .default("0"),
    digestSent: boolean("digest_sent").notNull().default(false),
  },
  (table) => [
    primaryKey({
      name: "daily_usage_pk",
      columns: [table.userId, table.date],
    }),
  ],
);

export const insertDailyUsageSchema = createInsertSchema(dailyUsageTable);
export type InsertDailyUsage = z.infer<typeof insertDailyUsageSchema>;
export type DailyUsage = typeof dailyUsageTable.$inferSelect;
