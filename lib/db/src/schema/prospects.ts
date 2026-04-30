import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const prospectsTable = pgTable(
  "prospects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    prospectName: text("prospect_name"),
    company: text("company"),
    title: text("title"),
    vertical: text("vertical"),
    subVertical: text("sub_vertical"),
    product: text("product"),
    country: text("country"),
    language: text("language"),
    phone: text("phone").notNull(),
    telegramHandle: text("telegram_handle"),
    teamsEmail: text("teams_email"),
    slackUserId: text("slack_user_id"),
    linkedinUrl: text("linkedin_url"),
    apolloPersonId: text("apollo_person_id"),
    sourceMode: text("source_mode").notNull(),
    contextNotes: text("context_notes"),
    researchBrief: jsonb("research_brief"),
    firstMessageBody: text("first_message_body"),
    firstMessageChannel: text("first_message_channel"),
    firstMessageSentAt: timestamp("first_message_sent_at", {
      withTimezone: true,
    }),
    replied: integer("replied").notNull().default(0),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    followupPaused: boolean("followup_paused").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("prospects_user_phone_unique").on(table.userId, table.phone),
  ],
);

export const insertProspectSchema = createInsertSchema(prospectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type Prospect = typeof prospectsTable.$inferSelect;
