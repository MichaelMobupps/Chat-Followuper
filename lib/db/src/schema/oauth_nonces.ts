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

export const oauthNoncesTable = pgTable(
  "oauth_nonces",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),

    nonce: text("nonce").notNull().unique(),
    provider: text("provider").notNull(),
    redirectUri: text("redirect_uri"),
    metadata: jsonb("metadata"),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("oauth_nonces_nonce_idx").on(table.nonce)],
);

export const insertOauthNonceSchema = createInsertSchema(oauthNoncesTable).omit(
  { id: true, createdAt: true, consumedAt: true },
);
export type InsertOauthNonce = z.infer<typeof insertOauthNonceSchema>;
export type OauthNonce = typeof oauthNoncesTable.$inferSelect;
