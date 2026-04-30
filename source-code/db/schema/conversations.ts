import {
  pgTable,
  serial,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { prospectsTable } from "./prospects";
import { followupsTable } from "./followups";

export const conversationsTable = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => prospectsTable.id, { onDelete: "cascade" }),

    direction: text("direction").notNull(),
    channel: text("channel").notNull(),
    body: text("body").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),

    sourceFollowupId: integer("source_followup_id").references(
      () => followupsTable.id,
      { onDelete: "set null" },
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("conversations_prospect_ts_idx").on(
      table.prospectId,
      sql`${table.ts} DESC`,
    ),
  ],
);

export const insertConversationSchema = createInsertSchema(
  conversationsTable,
).omit({ id: true, createdAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;
