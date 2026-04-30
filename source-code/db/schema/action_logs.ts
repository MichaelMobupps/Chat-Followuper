import {
  pgTable,
  uuid,
  integer,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { prospectsTable } from "./prospects";
import { followupsTable } from "./followups";

export const actionLogsTable = pgTable(
  "action_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    prospectId: uuid("prospect_id").references(() => prospectsTable.id, {
      onDelete: "set null",
    }),
    followupId: integer("followup_id").references(() => followupsTable.id, {
      onDelete: "set null",
    }),
    actionType: varchar("action_type", { length: 50 }).notNull(),
    actionStatus: varchar("action_status", { length: 20 }).notNull(),
    durationMs: integer("duration_ms"),
    errorDetail: text("error_detail"),
    metadata: jsonb("metadata"),
    executedAt: timestamp("executed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("action_logs_user_executed_idx").on(table.userId, table.executedAt),
    index("action_logs_type_idx").on(table.actionType),
  ],
);

export const ACTION_TYPES = {
  authLogin: "auth.login",
  authLogout: "auth.logout",
  channelWhatsappConnected: "channel.whatsapp.connected",
  seederOrgSearch: "seeder.org_search",
  seederPeopleSearch: "seeder.people_search",
  seederReveal: "seeder.reveal",
  seederMessageGenerated: "seeder.message_generated",
  prospectCreated: "prospect.created",
  prospectReplied: "prospect.replied",
  prospectPaused: "prospect.paused",
  prospectSkipped: "prospect.skipped",
  followupQueued: "followup.queued",
  followupGenerated: "followup.generated",
  followupSent: "followup.sent",
  followupFailed: "followup.failed",
  followupSnoozed: "followup.snoozed",
  digestSent: "digest.sent",
  digestReplyHandled: "digest.reply_handled",
  capExceededSpend: "cap.exceeded.spend",
  capExceededReveals: "cap.exceeded.reveals",
} as const;

export type ActionType = (typeof ACTION_TYPES)[keyof typeof ACTION_TYPES];
export type ActionStatus = "success" | "failure" | "skipped";

export const insertActionLogSchema = createInsertSchema(actionLogsTable).omit({
  id: true,
  executedAt: true,
});
export type InsertActionLog = z.infer<typeof insertActionLogSchema>;
export type ActionLog = typeof actionLogsTable.$inferSelect;
