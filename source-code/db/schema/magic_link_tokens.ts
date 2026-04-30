import {
  pgTable,
  serial,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const magicLinkTokensTable = pgTable(
  "magic_link_tokens",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    token: text("token").notNull().unique(),
    action: text("action").notNull(),
    payloadJson: jsonb("payload_json"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("magic_link_tokens_token_idx").on(table.token)],
);

export const insertMagicLinkTokenSchema = createInsertSchema(
  magicLinkTokensTable,
).omit({ id: true, createdAt: true, usedAt: true });
export type InsertMagicLinkToken = z.infer<typeof insertMagicLinkTokenSchema>;
export type MagicLinkToken = typeof magicLinkTokensTable.$inferSelect;
