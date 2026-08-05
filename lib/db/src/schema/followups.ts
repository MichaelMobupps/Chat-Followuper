import {
  pgTable,
  serial,
  uuid,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { prospectsTable } from "./prospects";

export const followupsTable = pgTable(
  "followups",
  {
    id: serial("id").primaryKey(),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => prospectsTable.id, { onDelete: "cascade" }),

    stage: integer("stage").notNull(),
    channel: text("channel").notNull(),
    status: text("status").notNull(),

    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    generatedMessage: text("generated_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deepLinkUrl: text("deep_link_url"),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // FUP5: unique per (prospect, channel, stage) — NOT (prospect, stage). The
    // scheduler keys its existence check on (prospect, channel), so a
    // (prospect, stage)-only unique index silently blocked a second channel's
    // sequence via onConflictDoNothing while the count still incremented.
    uniqueIndex("followups_prospect_channel_stage_unique").on(
      table.prospectId,
      table.channel,
      table.stage,
    ),
  ],
);

export const insertFollowupSchema = createInsertSchema(followupsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFollowup = z.infer<typeof insertFollowupSchema>;
export type Followup = typeof followupsTable.$inferSelect;
