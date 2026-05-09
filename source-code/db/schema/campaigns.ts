/**
 * Campaigns table — Ticket 1.7.
 *
 * SDRs organize prospects into named follow-up campaigns. Each campaign
 * carries default channel / sub-vertical / language / country values that
 * pre-fill the seeder form when the campaign is selected. Per-prospect
 * overrides remain on the prospect row; campaign defaults are read at form
 * render time, not stored as references on the prospect.
 *
 * Soft-delete via `archivedAt`. Hard-delete via DELETE; cascades set
 * `prospects.campaignId` to NULL (prospects survive). Cross-user access
 * is prevented at the route layer (every endpoint enforces userId match).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const campaignsTable = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Default channel for prospects created under this campaign. Free-text
     * to match the existing prospects.firstMessageChannel pattern; values
     * are validated at the route layer against the ChannelCode enum.
     * Slack is intentionally absent from the master plan but the column
     * width tolerates it for future use.
     */
    defaultChannel: text("default_channel").notNull().default("whatsapp"),
    /** Sub-vertical taxonomy code; nullable. Validated at route layer. */
    defaultSubVertical: text("default_sub_vertical"),
    /** ISO 639-1 language code; nullable. */
    defaultLanguage: text("default_language"),
    /** ISO 3166-1 alpha-2 country code; nullable. */
    defaultCountry: text("default_country"),
    /** Soft-delete marker. NULL = active, set = archived. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // List query hot path: WHERE user_id = $1 AND archived_at IS NULL
    // ORDER BY updated_at DESC. Composite index on (user_id, archived_at)
    // covers the predicate; the executor falls back to index scan + sort
    // for the ORDER BY, which is fine for the expected campaign volume
    // per user (single digits to low hundreds).
    index("campaigns_user_archived_idx").on(table.userId, table.archivedAt),
  ],
);

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
