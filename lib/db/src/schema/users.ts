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

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  isConnected: boolean("is_connected").notNull().default(false),

  stageTiming: jsonb("stage_timing"),
  sendDays: jsonb("send_days"),
  sendHourStart: integer("send_hour_start"),
  sendHourEnd: integer("send_hour_end"),

  maxFollowups: integer("max_followups"),
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
