import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface StageTiming {
  minDays: number;
  maxDays: number;
}

export const DEFAULT_STAGE_TIMING: StageTiming[] = [
  { minDays: 3, maxDays: 7 },
  { minDays: 10, maxDays: 14 },
  { minDays: 21, maxDays: 28 },
];

export const DEFAULT_SEND_DAYS: number[] = [1, 2, 3, 4, 5];

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  isConnected: boolean("is_connected").notNull().default(false),
  stageTiming: jsonb("stage_timing")
    .$type<StageTiming[]>()
    .notNull()
    .default(DEFAULT_STAGE_TIMING),
  sendDays: jsonb("send_days")
    .$type<number[]>()
    .notNull()
    .default(DEFAULT_SEND_DAYS),
  sendHourStart: integer("send_hour_start").notNull().default(8),
  sendHourEnd: integer("send_hour_end").notNull().default(18),
  maxFollowups: integer("max_followups").notNull().default(3),
  requireApproval: boolean("require_approval").notNull().default(false),
  digestHourLocal: integer("digest_hour_local").notNull().default(9),
  digestTimezone: text("digest_timezone").notNull().default("Asia/Jerusalem"),
  microsoftRefreshToken: text("microsoft_refresh_token"),
  slackBotToken: text("slack_bot_token"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
